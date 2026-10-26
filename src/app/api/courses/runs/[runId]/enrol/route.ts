import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser, type SessionUser } from "@/lib/firebase/session";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { enrolWindow, isEnrolOpen } from "@/lib/courses/enrolWindow";
import { joinedWeekFor } from "@/lib/courses/groupResolve";
import { formatWindowDate, formatWindowDeadline } from "@/lib/courses/window";
import {
  fetchGroupPicker,
  type GroupPickerOption,
} from "@/features/courses/fetchGroupPicker";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
  ENROLMENT_LIMITS,
  type CourseEnrolmentStatus,
} from "@/lib/firestore/courseEnrolments";
import {
  groupFullError,
  normalizeCourseGroup,
} from "@/lib/firestore/courseGroups";
import { leavePathFor } from "@/lib/courses/leaving";
import { leaveRun, type LeaveResult } from "@/lib/courses/leaveRun";
import { leaveClosedLine } from "@/lib/courses/leavingWords";
import {
  courseRunChannel,
  normalizeCourseRun,
  type CourseRunDoc,
} from "@/lib/firestore/courses";
import { subscribe } from "@/lib/firestore/subscriptions";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import {
  DEFAULT_PAUSED_MESSAGE,
  DEFAULT_SITE_NOTICE,
  SITE_NOTICE_PATH,
  isSurfacePaused,
  normaliseSiteNotice,
} from "@/lib/siteNotice";

/**
 * OPEN ENROLMENT: clicking into a pre-course session slot, and leaving again.
 *
 *   GET:    the session slots on offer plus the caller's own row (if any)
 *   POST:   take a seat in one of them
 *   PATCH:  move to a different session, or change stream
 *   DELETE: leave. IRREVERSIBLE. Written by `leaveRun`
 *           (`src/lib/courses/leaveRun.ts`), which the reply route's
 *           "I can’t make it" also takes for somebody in a group.
 *
 * ── WHY A ROUTE AND NOT A CLIENT-DIRECT WRITE ───────────────────────────────
 * `courseEnrolments` is `allow write: if false` and it stays that way. Three
 * of this route's invariants cannot be expressed in a rule at all: the group's
 * `memberCount` and the run's `enrolledCount` must move in the SAME
 * transaction as the row (a counter that drifts is a seat count that lies), the
 * capacity check has to read that counter transactionally so two people
 * clicking at once cannot both take the last place, and `joinedWeekNumber` is
 * resolved against the TARGET GROUP's calendar, which means reading a second
 * document.
 *
 * ── THE DETERMINISTIC ID IS THE WHOLE UNIQUENESS STORY ───────────────────────
 * One enrolment per (run, uid) exists structurally: `tx.create` at
 * `courseEnrolmentId(runId, uid)` throws ALREADY_EXISTS rather than minting a
 * second row, so nothing here queries "are they already on this run".
 *
 * A consequence worth stating out loud: because the row survives a drop-out,
 * SELF RE-ENROLMENT AFTER DROPPING OUT IS IMPOSSIBLE, and that is the decision
 * ("irreversible: it frees the seat and stops the nudges, and coming back is a
 * new enrolment rather than an undo"). Staff can put somebody back through
 * POST .../enrolments/[uid]/reinstate, which flips this same row to active
 * and gives the two counters back. NOT through the allocation board: that
 * route refuses any uid whose application is not `accepted`, and a
 * self-enrolled member never had an application at all.
 *
 * ── WHO MAY ENROL ───────────────────────────────────────────────────────────
 * Any signed-in account EXCEPT a `rejected` one, `pending` included. That is
 * the same gate the apply route uses and it is deliberate: the pre-course
 * opens during Welcome Week, when every fresher who has just registered is
 * still `pending`. (Their access to /learn afterwards is a separate change,
 * which is why the confirmation copy here does not promise it.)
 *
 * ── RATE LIMITS BEFORE THE READS ────────────────────────────────────────────
 * The per-IP limit is taken before the session lookup, since it needs no
 * identity; the per-uid limit as soon as there is a uid, and both before this
 * route reads anything of its own. Throttling exists to cap COST, so it has to
 * come before the work it is protecting.
 */

type Ctx = { params: Promise<{ runId: string }> };

/** Abuse throttle (see lib/rateLimit): generous per shared campus NAT IP,
    tighter per account. Matched to the apply route's shape. */
const RL_WINDOW_MS = 10 * 60 * 1000;
const RL_IP_MAX = 60;
const RL_UID_MAX = 10;
/**
 * The GET's own per-account budget, in its own bucket.
 *
 * Deliberately NOT the write bucket. The picker re-reads on mount and again
 * after every write, so sharing the writers' ten-per-ten-minutes would let a
 * handful of page loads and one changed session spend a member's ability to
 * take a seat at all, and the sentence they would get back ("too many
 * attempts") would be a lie about what they had done. A read still gets a
 * ceiling, because it costs a group query and a document read.
 */
const RL_READ_UID_MAX = 60;

type Db = NonNullable<ReturnType<typeof getAdminDb>>;

class EnrolError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Shared preamble
// ---------------------------------------------------------------------------

type Caller = { user: SessionUser; db: Db };

/**
 * Signed in, not rejected, database available. `pending` passes: see the
 * module comment.
 */
async function requireEnroller(): Promise<Caller | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (user.role === "rejected") {
    return NextResponse.json(
      { error: "This account can't sign up for courses." },
      { status: 403 },
    );
  }
  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  }
  return { user, db };
}

function tooManyAttempts(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "Too many attempts. Please wait a few minutes and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Server-side read of the maintenance notice, through the same shared
 * normaliser the banner and every client surface use, so a paused surface
 * reads identically wherever it is checked.
 *
 * An unreadable or malformed doc degrades to "notice off", the same default
 * `siteNotice.ts` normalises to. Refusing enrolments because the notice doc
 * could not be read would be an outage caused by the outage banner.
 */
async function readSiteNotice(db: Db) {
  try {
    const snap = await db
      .collection(SITE_NOTICE_PATH.collection)
      .doc(SITE_NOTICE_PATH.doc)
      .get();
    return normaliseSiteNotice(snap.exists ? snap.data() : null, new Date());
  } catch {
    return DEFAULT_SITE_NOTICE;
  }
}

async function loadRun(db: Db, runId: string): Promise<CourseRunDoc | null> {
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists) return null;
  return normalizeCourseRun(snap.id, snap.data() ?? {});
}

/**
 * The sentence a member reads when a run is not taking sign-ups, or null when
 * it is. Derived from `enrolWindow()` so the copy and the refusal are the same
 * three lines of arithmetic that decide what the course page offers, which is
 * the disagreement `lib/courses/window.ts` was written to end.
 *
 * `inactive` deliberately gets the same sentence as `closed`: whether a run is
 * a draft, archived, or simply an admissions run is not a visitor's business.
 */
function windowError(run: CourseRunDoc, now: Date): string | null {
  const w = enrolWindow(run, now);
  if (w.state === "open") return null;
  if (w.state === "not-yet") {
    return w.opensAt
      ? `Sign-ups open on ${formatWindowDate(w.opensAt)}.`
      : "Sign-ups for this course haven't opened yet.";
  }
  return w.closesAt && w.state === "closed"
    ? `Sign-ups closed on ${formatWindowDeadline(w.closesAt)}.`
    : "This course isn't taking sign-ups.";
}

/**
 * Validate the requested stream against the run's declared list AND the target
 * group's own tag, and return the id to store.
 *
 * Both halves matter. The run's `streams` is what `courseEnrolments.streamId`
 * has to name for `streamScope.ts` to resolve a week's materials, and the
 * group's `streamId` is what says which stream that session actually teaches.
 * A member who picks "governance" and the technical session would otherwise
 * sit in a room working through material their row says they cannot see.
 */
function resolveStreamId(
  run: CourseRunDoc,
  groupStreamId: string | null,
  requested: unknown,
): { streamId: string | null } | { error: string } {
  const asked =
    typeof requested === "string" && requested ? requested : null;

  if (run.streams.length === 0) {
    // A run with no streams stores null, whatever was posted: there is
    // nothing for an id to name.
    return { streamId: null };
  }

  if (!asked) {
    return { error: "Pick which strand you'd like to join." };
  }
  if (!run.streams.some((s) => s.id === asked)) {
    return { error: "That strand isn't one of this course's options." };
  }
  if (groupStreamId !== null && groupStreamId !== asked) {
    const label = run.streams.find((s) => s.id === groupStreamId)?.label ?? "";
    return {
      error: label
        ? `That session is for the ${label} strand. Pick a session that runs your strand.`
        : "That session doesn't run the strand you picked.",
    };
  }
  return { streamId: asked };
}

// ---------------------------------------------------------------------------
// GET: what the picker renders
// ---------------------------------------------------------------------------

/**
 * The caller's own enrolment row, flattened. Deliberately four fields: this is
 * a public-page payload, and the row also carries an attendance rollup and a
 * drop-out reason that belong on the learning surfaces, not here.
 */
export type MyEnrolmentSummary = {
  groupId: string | null;
  streamId: string | null;
  status: CourseEnrolmentStatus;
  /** "facilitator" rows exist on the same doc id; the picker must not offer
      a facilitator a learner seat they already structurally cannot take. */
  role: "learner" | "facilitator";
};

export type EnrolStatePayload = {
  groups: GroupPickerOption[];
  enrolment: MyEnrolmentSummary | null;
};

/**
 * Refresh the picker: the slots (with current seat counts) plus the caller's
 * own row. A READ ONLY: nothing here writes, so it needs no view-as guard.
 *
 * It exists because `courseGroups` is not client-readable and the seat counts
 * move: after an enrol, a change or a drop, the client re-reads through here
 * rather than guessing at what its own action did to everyone else's numbers.
 *
 * ── THE SLOTS ARE NOT FOR EVERY RUN ─────────────────────────────────────────
 * `fetchGroupPicker` runs on the Admin SDK, so `courseGroups`'s read rule
 * defends nothing here: whatever this returns is what any signed-in account
 * gets for any run id it can name. The projection keeps the meeting link and
 * the facilitators out of it, but a timetable with seat counts is still the
 * open-enrolment offer, and an admissions run's groups are staff working
 * material until allocation publishes them. So the slots come back only for
 * an `open` run whose window is live, and every other run answers with an
 * empty list.
 *
 * THE CALLER'S OWN ROW COMES BACK EITHER WAY, which is the reason this is a
 * gate rather than a 404: this call is also how a member learns where they
 * stand, and a run whose sign-ups have closed (or that was flipped back to
 * admissions under them) must not take that answer away.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { runId } = await ctx.params;

  const caller = await requireEnroller();
  if (caller instanceof NextResponse) return caller;
  const { user, db } = caller;

  const readLimit = rateLimit(
    `courses:enrol:read:uid:${user.uid}`,
    RL_READ_UID_MAX,
    RL_WINDOW_MS,
  );
  if (!readLimit.ok) return tooManyAttempts(readLimit.retryAfterSeconds);

  // The run is read FIRST, and it decides whether there is a timetable to
  // hand out at all.
  const run = await loadRun(db, runId);
  if (!run) {
    return NextResponse.json({ error: "Course run not found." }, { status: 404 });
  }
  const offering =
    run.enrolMode === "open" && enrolWindow(run, new Date()).state !== "inactive";

  const [groups, snap] = await Promise.all([
    offering ? fetchGroupPicker(runId) : Promise.resolve<GroupPickerOption[]>([]),
    db.collection("courseEnrolments").doc(courseEnrolmentId(runId, user.uid)).get(),
  ]);

  let enrolment: MyEnrolmentSummary | null = null;
  if (snap.exists) {
    const row = normalizeCourseEnrolment(snap.id, snap.data() ?? {});
    // Belt to the doc id's brace: a hand-made document at a guessable path
    // must not be reported as this caller's enrolment. Nor is a seat an admin
    // allocated and Publish has not told them about yet: it is reported as
    // no row, as it was before they were placed. A seat somebody took here
    // for themselves is theirs at once.
    if (
      row.uid === user.uid &&
      row.runId === runId &&
      placementIsShownTo(row, { isAdmin: user.role === "admin" })
    ) {
      enrolment = {
        groupId: row.groupId,
        streamId: row.streamId,
        status: row.status,
        role: row.role,
      };
    }
  }

  const payload: EnrolStatePayload = { groups, enrolment };
  return NextResponse.json(payload);
}

// ---------------------------------------------------------------------------
// POST: take a seat
// ---------------------------------------------------------------------------

/**
 * What a person is told when the deterministic id already holds a row.
 *
 * FOUR STATUSES, FOUR SENTENCES. The row is the whole history of this person
 * on this run, and "you've already left this course" is only true of one of
 * them: somebody a facilitator removed did not leave, and somebody who
 * finished the course last term did not either. Telling either of them they
 * left is both wrong and the kind of wrong that gets forwarded to staff.
 *
 * All four say what to do next, because none of them can be fixed from here:
 * the row exists, so `tx.create` will never succeed again for this pair.
 */
function alreadyHereError(status: CourseEnrolmentStatus): string {
  switch (status) {
    case "active":
      return "You're already signed up for this course.";
    case "withdrawn":
      return "You've already left this course, so you can't sign up again here. Email the team if you'd like to come back.";
    case "removed":
      return "You're not on this course any more. Email the team if you think that's a mistake.";
    case "completed":
      return "You've already finished this course, so there's no place here to take. Watch the courses page for the next run.";
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId } = await ctx.params;

  // Per-IP first: it needs no identity, so it can sit in front of the session
  // lookup's Auth RPC and user-doc read.
  const ipLimit = rateLimit(
    `courses:enrol:ip:${clientIp(req)}`,
    RL_IP_MAX,
    RL_WINDOW_MS,
  );
  if (!ipLimit.ok) return tooManyAttempts(ipLimit.retryAfterSeconds);

  const caller = await requireEnroller();
  if (caller instanceof NextResponse) return caller;
  const { user, db } = caller;

  const uidLimit = rateLimit(
    `courses:enrol:uid:${user.uid}`,
    RL_UID_MAX,
    RL_WINDOW_MS,
  );
  if (!uidLimit.ok) return tooManyAttempts(uidLimit.retryAfterSeconds);

  const body = await readJson(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const groupId = typeof body.groupId === "string" ? body.groupId : "";
  if (!groupId) {
    return NextResponse.json({ error: "Pick a session first." }, { status: 400 });
  }

  const run = await loadRun(db, runId);
  if (!run) {
    return NextResponse.json({ error: "Course run not found." }, { status: 404 });
  }
  const openError = windowError(run, new Date());
  if (openError) return NextResponse.json({ error: openError }, { status: 400 });

  // The pause gate applies to NEW sign-ups only. Someone already enrolled
  // keeps their place, their access, and their ability to change session or
  // leave, which is what the admin panel's copy for this flag promises.
  const notice = await readSiteNotice(db);
  if (isSurfacePaused(notice, "courseEnrolments")) {
    return NextResponse.json(
      { error: notice.bannerMessage || DEFAULT_PAUSED_MESSAGE },
      { status: 503 },
    );
  }

  const enrolmentRef = db
    .collection("courseEnrolments")
    .doc(courseEnrolmentId(runId, user.uid));
  const runRef = db.collection("courseRuns").doc(runId);
  const groupRef = db.collection("courseGroups").doc(groupId);

  let streamId: string | null = null;

  try {
    await db.runTransaction(async (tx) => {
      // Reads first, all of them: Firestore forbids a read after the first
      // write in a transaction.
      const [runSnap, groupSnap, existingSnap] = await tx.getAll(
        runRef,
        groupRef,
        enrolmentRef,
      );

      // The run is re-read INSIDE the transaction, not trusted from the check
      // above: an admin could flip the run out of open mode, or an automated
      // status move could close it, between the two. The outside read is what
      // produces the good copy; this one is what makes the decision.
      if (!runSnap.exists) throw new EnrolError("Course run not found.", 404);
      const freshRun = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
      if (!isEnrolOpen(freshRun, new Date())) {
        throw new EnrolError(
          windowError(freshRun, new Date()) ?? "This course isn't taking sign-ups.",
          409,
        );
      }

      if (!groupSnap.exists) {
        throw new EnrolError("That session is no longer on offer.", 409);
      }
      const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
      if (group.runId !== runId || group.archived) {
        throw new EnrolError("That session is no longer on offer.", 409);
      }

      const stream = resolveStreamId(freshRun, group.streamId, body.streamId);
      if ("error" in stream) throw new EnrolError(stream.error, 400);
      streamId = stream.streamId;

      if (existingSnap.exists) {
        const row = normalizeCourseEnrolment(existingSnap.id, existingSnap.data() ?? {});
        throw new EnrolError(alreadyHereError(row.status), 409);
      }

      // CAPACITY, against the count read inside this transaction. Two people
      // taking the last seat at once: one transaction sees memberCount one
      // below capacity and commits, the other retries, re-reads the committed
      // count, and is refused here. Same predicate the picker greys the card
      // out with, so the two agree.
      const full = groupFullError({
        name: group.name,
        capacity: group.capacity,
        memberCount: group.memberCount,
      });
      if (full) throw new EnrolError(full, 409);

      tx.create(enrolmentRef, {
        runId,
        courseId: freshRun.courseId,
        uid: user.uid,
        groupId,
        status: "active" satisfies CourseEnrolmentStatus,
        role: "learner",
        streamId,
        // Not an application, and not an admin placing them either: see
        // `selfEnrolled` on `CourseEnrolmentDoc`.
        selfEnrolled: true,
        applicationId: null,
        // THEIR group's clock, not the run's. Shared with the allocation
        // route so the two writers of a fresh enrolment cannot disagree.
        joinedWeekNumber: joinedWeekFor(freshRun, group),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(groupRef, {
        memberCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(runRef, {
        enrolledCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    if (err instanceof EnrolError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // Lost the create race with a second tab.
    if ((err as { code?: number }).code === 6) {
      return NextResponse.json(
        { error: "You're already signed up for this course." },
        { status: 409 },
      );
    }
    console.error("[courses enrol] transaction failed", runId, user.uid, err);
    return NextResponse.json(
      { error: "Couldn't sign you up just now. Please try again." },
      { status: 500 },
    );
  }

  // Post-commit and best-effort, exactly as allocation publish does it: the
  // seat is taken either way, and a bookkeeping failure must not turn a
  // successful sign-up into an error the member sees. `inboxProven` because
  // this is the account's own sign-in address.
  await subscribeToCohort(db, runId, user);

  // NO AUDIT ROW ON THE WAY IN, deliberately: `CourseAuditKind` has no "enrol"
  // member, and inventing one would put a string in the log that
  // `courseAuditKindLabel` renders as "Unrecognised action". The enrolment
  // document IS the record of joining (it carries `selfEnrolled`, `createdAt`
  // and the group). Leaving is different: it destroys state, so it gets a row.

  return NextResponse.json({ ok: true, groupId, streamId });
}

/**
 * Join the run's cohort channel so the weekly emails reach them. Failure is
 * logged and swallowed: `subscribe()` writes a (email, channel) row that the
 * member can fix from their own profile, and no part of the enrolment depends
 * on it.
 */
async function subscribeToCohort(db: Db, runId: string, user: SessionUser) {
  if (!user.email) return;
  try {
    await subscribe(db, {
      email: user.email,
      channel: courseRunChannel(runId),
      audience: "user",
      audienceId: user.uid,
      source: "course-open-enrol",
      actor: {
        kind: "member",
        uid: user.uid,
        label: user.displayName?.trim() || "NAISI member",
      },
      inboxProven: true,
      name: user.displayName?.trim() || undefined,
    });
  } catch (err) {
    console.warn("[courses enrol] cohort subscribe failed", runId, user.uid, err);
  }
}

// ---------------------------------------------------------------------------
// PATCH: change session or stream
// ---------------------------------------------------------------------------

/**
 * Move to a different session, change stream, or both.
 *
 * TWO COUNTER DELTAS, ONE TRANSACTION: the old group loses a seat and the new
 * one gains it atomically with the row's `groupId`, or nothing happens. The
 * run's `enrolledCount` does NOT move: the member is still on the run.
 *
 * Not gated on the maintenance pause: pausing enrolment means "no new
 * sign-ups", and someone already holding a seat swapping Tuesday for Thursday
 * is not a new sign-up.
 */
/**
 * NOT DRAWN. A session change from a facilitator who holds a place on an open
 * run: they run their group's sessions, so staff change which group that is.
 */
function facilitatingSessionError(groupName: string): string {
  return `You facilitate ${groupName}, so your session is the one you run. Ask an admin to change which group you facilitate.`;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId } = await ctx.params;

  const ipLimit = rateLimit(
    `courses:enrol:ip:${clientIp(req)}`,
    RL_IP_MAX,
    RL_WINDOW_MS,
  );
  if (!ipLimit.ok) return tooManyAttempts(ipLimit.retryAfterSeconds);

  const caller = await requireEnroller();
  if (caller instanceof NextResponse) return caller;
  const { user, db } = caller;

  const uidLimit = rateLimit(
    `courses:enrol:uid:${user.uid}`,
    RL_UID_MAX,
    RL_WINDOW_MS,
  );
  if (!uidLimit.ok) return tooManyAttempts(uidLimit.retryAfterSeconds);

  const body = await readJson(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const groupId = typeof body.groupId === "string" ? body.groupId : "";
  if (!groupId) {
    return NextResponse.json({ error: "Pick a session first." }, { status: 400 });
  }

  const run = await loadRun(db, runId);
  if (!run) {
    return NextResponse.json({ error: "Course run not found." }, { status: 404 });
  }
  const openError = windowError(run, new Date());
  if (openError) return NextResponse.json({ error: openError }, { status: 400 });

  const enrolmentRef = db
    .collection("courseEnrolments")
    .doc(courseEnrolmentId(runId, user.uid));
  const targetRef = db.collection("courseGroups").doc(groupId);

  let streamId: string | null = null;

  try {
    await db.runTransaction(async (tx) => {
      const [[runSnap, targetSnap, existingSnap], runGroupsSnap] = await Promise.all([
        tx.getAll(db.collection("courseRuns").doc(runId), targetRef, enrolmentRef),
        // Who facilitates the run's groups: one equality on one field.
        tx.get(db.collection("courseGroups").where("runId", "==", runId)),
      ]);

      if (!runSnap.exists) throw new EnrolError("Course run not found.", 404);
      const freshRun = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
      if (!isEnrolOpen(freshRun, new Date())) {
        throw new EnrolError(
          "This course isn't taking session changes any more.",
          409,
        );
      }

      if (!existingSnap.exists) {
        throw new EnrolError("You're not signed up for this course.", 404);
      }
      const row = normalizeCourseEnrolment(existingSnap.id, existingSnap.data() ?? {});
      if (row.uid !== user.uid || row.runId !== runId) {
        throw new EnrolError("You're not signed up for this course.", 404);
      }
      if (row.role !== "learner") {
        throw new EnrolError(
          "You're on this course as a facilitator. Ask an admin to change which group you run.",
          409,
        );
      }
      if (row.status !== "active") {
        throw new EnrolError(
          "You're not on this course any more, so there's no session to change.",
          409,
        );
      }

      if (!targetSnap.exists) {
        throw new EnrolError("That session is no longer on offer.", 409);
      }
      const target = normalizeCourseGroup(targetSnap.id, targetSnap.data() ?? {});
      if (target.runId !== runId || target.archived) {
        throw new EnrolError("That session is no longer on offer.", 409);
      }

      const stream = resolveStreamId(freshRun, target.streamId, body.streamId);
      if ("error" in stream) throw new EnrolError(stream.error, 400);
      streamId = stream.streamId;

      const movingGroup = row.groupId !== groupId;

      // A FACILITATOR WHO HOLDS A PLACE SITS IN THE GROUP THEY FACILITATE:
      // their session is the one they run, and only staff change which group
      // that is. Changing stream within it is still theirs to do.
      const facilitated = runGroupsSnap.docs
        .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
        .find(
          (each) =>
            each.runId === runId &&
            !each.archived &&
            isNamedWithStanding(user, "courseGroups.facilitatorUids", each.facilitatorUids),
        );
      if (movingGroup && facilitated) {
        throw new EnrolError(facilitatingSessionError(facilitated.name.trim() || "a group"), 409);
      }

      // Capacity is only asked when the seat is actually new. Re-saving the
      // same session to change stream must not be refused by the group the
      // member is already counted in.
      if (movingGroup) {
        const full = groupFullError({
          name: target.name,
          capacity: target.capacity,
          memberCount: target.memberCount,
        });
        if (full) throw new EnrolError(full, 409);
      }

      const patch: Record<string, unknown> = {
        groupId,
        streamId,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (movingGroup) {
        // The stamp certifies "emailed about their CURRENT group"; a changed
        // session invalidates it, exactly as it does on the allocate route.
        patch.allocatedEmailAt = FieldValue.delete();
      }
      tx.update(enrolmentRef, patch);

      if (movingGroup) {
        if (row.groupId) {
          tx.update(db.collection("courseGroups").doc(row.groupId), {
            memberCount: FieldValue.increment(-1),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        tx.update(targetRef, {
          memberCount: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (err) {
    if (err instanceof EnrolError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[courses enrol] change failed", runId, user.uid, err);
    return NextResponse.json(
      { error: "Couldn't change your session just now. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, groupId, streamId });
}

// ---------------------------------------------------------------------------
// DELETE: leave
// ---------------------------------------------------------------------------

/**
 * Leave the course. IRREVERSIBLE, by decision: the seat is freed, the nudges
 * stop, and coming back is something somebody else has to do.
 *
 * Behind a TYPED CONFIRMATION of the course title, the same ritual the destroy
 * routes use and for the same reason: this is the one member-facing action on
 * the courses surface that cannot be undone by the person taking it, and a
 * mis-tapped button on a phone must not be able to do it.
 *
 * ONE LEAVE, TWO DOORS. This is the door on the programme page. The other is
 * "I can’t make it" on the application page of somebody in a group Publish
 * has told them about (the reply route). Both ask the same function whether
 * the person may leave (`leavePathFor`, `src/lib/courses/leaving.ts`) and the
 * same function writes what leaving writes (`leaveRun`,
 * `src/lib/courses/leaveRun.ts`), so the two cannot come to differ:
 *  - an OPEN run, the seat the person took;
 *  - a run THE TERM'S APPLICATION FORM PLACES PEOPLE ON, for somebody whose
 *    place came from the form. Their place on the form is given back in the
 *    same transaction, exactly as "I can’t make it" gives it back, with no
 *    reason on the application. Their row on the run's own list stays as it
 *    is: Publish no longer waits for somebody who has left
 *    (`enrolmentHasLeft`), and the board names them as having left.
 * Anybody else on a run that takes people by placement (they applied to the
 * run itself) is told to ask the team, who use the remove route.
 *
 * NOBODY LEAVES ONCE THE RUN'S LAST SESSION IS OVER, the moment who finished
 * opens: the same function draws that line, the press is refused in a
 * sentence that says so, and nothing is written. Somebody who finished keeps
 * their finished record, and no place on the form goes back after the end.
 *
 * A PLACEMENT PUBLISH HAS NOT TOLD ITS OWNER ABOUT cannot be left: it is
 * answered as no seat at all, as the GET above answers it, because the run is
 * shut to them and saying anything else would tell them they are placed.
 *
 * WHAT LEAVING KEEPS, AND WHO IS TOLD: see `leaveRun`. The row keeps its group
 * and Publish's stamp; nobody is emailed but the person who left.
 *
 * The way back for an open run is the reinstate route (admins and the run's
 * track leads), which flips this row to active in the group it names and
 * re-increments both counters; for a run the form placed them on, an admin
 * places them again on the board. Either way it is the same row: it is still
 * sitting at the deterministic id, so nothing here can create a second one.
 */
export async function DELETE(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId } = await ctx.params;

  const ipLimit = rateLimit(
    `courses:enrol:ip:${clientIp(req)}`,
    RL_IP_MAX,
    RL_WINDOW_MS,
  );
  if (!ipLimit.ok) return tooManyAttempts(ipLimit.retryAfterSeconds);

  const caller = await requireEnroller();
  if (caller instanceof NextResponse) return caller;
  const { user, db } = caller;

  const uidLimit = rateLimit(
    `courses:enrol:uid:${user.uid}`,
    RL_UID_MAX,
    RL_WINDOW_MS,
  );
  if (!uidLimit.ok) return tooManyAttempts(uidLimit.retryAfterSeconds);

  const body = await readJson(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const run = await loadRun(db, runId);
  if (!run) {
    return NextResponse.json({ error: "Course run not found." }, { status: 404 });
  }
  const now = new Date();
  // Open, or a place the form gave them, until the run's last session is
  // over; anybody else asks the team.
  const answer = await leavePathFor(db, run, user.uid, now);
  if ("closed" in answer) {
    return NextResponse.json({ error: leaveClosedLine(answer, run.courseTitle) }, { status: 409 });
  }

  // An unnamed course cannot be confirmed by name: with an empty title the
  // comparison is "" === "" and the ritual passes on an empty body. The
  // destroy routes refuse for the same reason, and so does this one.
  if (run.courseTitle.length === 0) {
    return NextResponse.json(
      {
        error:
          "This course has no title yet, so there's nothing to type as confirmation. Email the team and we'll take you off it.",
      },
      { status: 409 },
    );
  }
  // Byte equality against the course TITLE, nothing normalised away.
  if (body.confirmName !== run.courseTitle) {
    return NextResponse.json(
      { error: "That doesn't match the course title. Type it exactly to confirm." },
      { status: 400 },
    );
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, ENROLMENT_LIMITS.dropOutReason)
      : null;

  let left: LeaveResult;
  try {
    left = await leaveRun(db, { run, path: answer.path, user, reason, now });
  } catch (err) {
    console.error("[courses enrol] drop-out failed", runId, user.uid, err);
    return NextResponse.json(
      { error: "Couldn't take you off the course just now. Please try again." },
      { status: 500 },
    );
  }
  if (left.kind === "refused") {
    return NextResponse.json({ error: left.error }, { status: left.status });
  }
  // A repeat of an already-committed leave answers the same, with the
  // feedback link, and has written and sent nothing (`left.dropped`).
  return NextResponse.json({ ok: true, feedbackUrl: left.feedbackUrl });
}
