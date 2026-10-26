import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { holdsStanding, isNamedWithStanding } from "@/lib/firebase/eligibility";
import { getCurrentUser } from "@/lib/firebase/session";
import { runCrests } from "@/lib/crests/runs";
import type { ShownCrest } from "@/lib/crests/resolve";
import { isValidDateKey } from "@/lib/courses/weekPlan";
import { finishedForMember } from "@/lib/courses/finishing/record";
import { memberCurrentWeek, resolveCalendar } from "@/lib/courses/groupResolve";
import {
  normalizeCourseApplication,
  type CourseApplicationStatus,
} from "@/lib/firestore/courseApplications";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import {
  normalizeCourseGroup,
  type CourseGroupDoc,
} from "@/lib/firestore/courseGroups";
import {
  normalizeCourseRun,
  type CourseRunDoc,
  type CourseRunStatus,
} from "@/lib/firestore/courses";

/**
 * "Every run you touch" — the payload behind the `/learn` hub.
 *
 * WHO MAY READ: any signed-in caller, about THEMSELVES only. There is no uid
 * parameter and no way to ask about someone else: the five queries below are
 * each scoped to `actor.uid`, so the route is enumeration-safe by construction.
 *
 * Five ways a run reaches this list, merged into one row per run because one
 * person can hold several of them at once (a track lead who also facilitates a
 * group, a reviewer who is learning on the run they help admit for):
 *
 *   learner / facilitator  — a `courseEnrolments` row (facilitators get one
 *                            when they are staffed onto a group, which is why
 *                            "every run you touch" is ONE enrolment query).
 *                            A facilitator who HOLDS A PLACE has a learner's
 *                            row instead and facilitates through the group,
 *                            so `facilitator` is also read off the groups
 *                            that name them (`facilitatorUids`, one
 *                            array-contains, the automatic index), and Home
 *                            gives them the facilitator's Home as it gives
 *                            anybody who facilitates
 *   reviewer               — named in `courseRuns.admissionsReviewerUids`
 *   lead                   — named in `courseRuns.trackLeadUids`
 *   offered / waitlisted   — a decided `courseApplications` row with no seat
 *                            behind it yet (see THE OFFER GAP below)
 *
 * Holding a role here grants NOTHING beyond this hub row: admissions is a
 * separate lane from the cohort (see the applications route), so a reviewer's
 * card links to the queue, never to the learning space. The overview route
 * enforces that boundary independently — this payload is a list of doors, not
 * a set of keys.
 *
 * ── THE OFFER GAP (why the fourth query exists) ─────────────────────────────
 * Accepting an application deliberately does NOT enrol anyone: "an accepted
 * application is an offer, not a seat" (the decide route's header), and the
 * `courseEnrolments` row a placement makes is shown to its owner only once
 * allocation is PUBLISHED (see the last note below). Between
 * those two moments — which is hours at best and a fortnight in practice — a
 * member who has just been emailed "you're in" held no row in any collection
 * this route read, so `/learn` told them "You're not on a course yet", the
 * dashboard card vanished, and the public course page told them applications
 * were shut. Every surface in the authed area agreed they were on nothing.
 *
 * So the offer is now first-class, and it is a DISTINCT KIND of row rather
 * than a faked enrolment: `membership` says which, `roles` stays exactly what
 * it always was (roles come from enrolments and the run's role arrays, never
 * from an application), and the hub renders an offer as a card that does not
 * link — there is no enrolment, so `/learn/[runId]` would bounce them straight
 * back (runAccess.ts: `canLearn` needs a live enrolment). See MyRunEntry.
 *
 * PII: names never travel at all (nobody but the caller is named), and the one
 * cross-collection lookup is a group NAME. No emails, no cohort rosters. The
 * application rows are read for exactly three fields, `runId`, `status` and
 * `fromForm`; nothing else on them (the applicant's email, their answers)
 * goes near the payload, and the query cannot see another applicant's row at
 * all.
 *
 * ── A ROW THE APPLICATION FORM'S HAND-OVER WROTE IS ANNOUNCED AS NOTHING ────
 * The term's application form decides who holds a place, and an admin's
 * hand-over then writes a row on a run for each of them (`fromForm` says so),
 * for the allocation board to place people from. That row is the course
 * side's working list. It is NOT news for its owner, whatever its status:
 *
 *  - what became of their application is said on their own application page
 *    and on the list of their applications, and nowhere else
 *    (docs/applications.md, "One set of words for an outcome"), and what
 *    comes next for their kind of programme is said there too;
 *  - an offer card speaks in the words of a run's own application form
 *    ("Place offered", "Waitlisted"), which somebody from the term's form
 *    never used.
 *
 * So such a row is passed over before its status is looked at, and nothing
 * about the form or the caller's application is read here at all. The first
 * thing this hub shows somebody the form placed is their GROUP: the enrolment
 * an admin's placement on the board makes, drawn as it is for anybody, once
 * Publish has told them (below).
 *
 * ── A PLACEMENT IS SHOWN ONCE PUBLISH HAS TOLD ITS OWNER ────────────────────
 * An admin's placement on the board makes the enrolment at once, but it is
 * the board's working copy until Publish emails its owner their group
 * (`placementIsTold`). Until then this hub passes the enrolment over as if
 * it were not there, so the member reads what they read before they were
 * placed: nothing at all for somebody the application form placed, and the
 * offer card for somebody who applied to the run itself (the probe below
 * does not count such a seat as spending the offer). A seat somebody chose
 * for themselves on an open run shows at once, and an admin is shown their
 * own seats as they are.
 */

// ---------------------------------------------------------------------------
// Wire types (the contract the /learn hub renders from)
// ---------------------------------------------------------------------------

export type MyRunRole = "learner" | "facilitator" | "reviewer" | "lead";

/**
 * What the caller IS on this run, as distinct from what they DO on it
 * (`roles`). The two are orthogonal and both travel: a track lead can hold an
 * offer on the run they lead, and a reviewer holds neither.
 *
 *   enrolled    — a LIVE `courseEnrolments` row (active or completed). Exactly
 *                 the population this route served before offers existed.
 *   offered     — accepted, not yet allocated. They have been told they are in
 *                 and there is no seat document anywhere yet.
 *   waitlisted  — waitlisted, same absence of a seat.
 *   none        — reached the hub some other way (reviewer, track lead), or
 *                 their seat was withdrawn/removed after the offer.
 */
export type MyRunMembership = "enrolled" | "offered" | "waitlisted" | "none";

export type MyRunEntry = {
  runId: string;
  courseId: string;
  courseTitle: string;
  label: string;
  academicYear: string;
  status: CourseRunStatus;
  /**
   * Every role the caller holds on this run, in `ROLE_ORDER`.
   *
   * Also the LINKABILITY test, and deliberately so: a non-empty `roles` is the
   * same predicate as the run layout's `hasRunRole`
   * (`canLearn || isReviewer || isTrackLead`), because `learner`/`facilitator`
   * come from a live enrolment and the other two come from the run's own
   * arrays. An offer contributes no role, so an offer-only row has none — and
   * a card the member cannot open must not pretend to be a door.
   */
  roles: MyRunRole[];
  /** Enrolled, offered a place, waitlisted, or here by role alone. */
  membership: MyRunMembership;
  /**
   * The run's soft-archive flag (V2-1 deletion protocol). Rows are NOT
   * filtered out here, deliberately: this route is "every run you touch,
   * ever", and archiving is explicitly the path that keeps member history
   * readable — dropping the row would take a member's own record of a
   * finished cohort away from them, which is the one thing archive promises
   * not to do.
   *
   * What archiving costs a run is its place in the LIVE surfaces, and those
   * are the callers' to enforce: the dashboard summary drops archived rows
   * entirely, and the hub renders them in a separate archived section rather
   * than among the courses someone is currently on. Sending the flag rather
   * than pre-filtering is what lets both of them do that from one payload.
   *
   * A run mid-DESTROY also reads `archived: true` (the cascade's opening
   * write), so it leaves the live sections here for the same reason it leaves
   * the catalogue — but its card, like every other, links into a learning
   * space that refuses a destroying run outright (runAccess.ts).
   */
  archived: boolean;
  /**
   * Recomputed server-side on every request (there is no cron; the current
   * week is a pure function of the caller's civil dates — see weekPlan.ts).
   * Null for a draft run or one whose resolved `startDate` is not yet a valid
   * civil date.
   *
   * V2-3: resolved GROUP-FIRST. A member whose group has set its own pacing is
   * told where THEIR group is, not where the run is — the hub is a member's
   * own record, and a card that says "Week 5" while their group is on week 3
   * is simply wrong for them. Unallocated members keep the run's cadence,
   * because `resolveCalendar(run, null)` IS the run's calendar.
   */
  currentWeek: {
    phase: "before" | "running" | "after";
    /** Null during a break and outside the run. */
    weekNumber: number | null;
    /** Last taught week that has STARTED; 0 before the run begins. */
    anchorWeekNumber: number;
    breakLabel: string | null;
  } | null;
  /** Taught weeks in the caller's EFFECTIVE plan (breaks excluded). */
  totalWeeks: number;
  /**
   * True when the two fields above came from the caller's group's own pacing
   * rather than the run's. The hub can then say "your group" where it would
   * otherwise say "your cohort".
   */
  pacedByGroup: boolean;
  /** Only ever the caller's OWN group, and only when they are enrolled in one. */
  groupName: string | null;
  /**
   * WHETHER THE CALLER FINISHED THIS RUN: true only once its last session is
   * over and their own finished record says so (`finishedForMember`, the one
   * answer every page asks). False for everything else, so a card told false
   * says the run has ended and claims nothing.
   */
  finished: boolean;
  /**
   * The crest the card shows beside the run's name: `crestForRun`'s answer
   * (the programme that names the run, else its course's), or null for the
   * NAISI emblem. Only the key travels, never the form or the course.
   */
  shownCrest: ShownCrest;
};

export type MePayload = { runs: MyRunEntry[] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render order for the role chips, so a row never reshuffles between loads. */
const ROLE_ORDER: MyRunRole[] = ["learner", "facilitator", "reviewer", "lead"];

/**
 * The one place the offer/enrolment precedence is decided. Pure, exported, and
 * unit-tested (tests/course-offer.test.mjs) because two of its three rules are
 * only true because of something written somewhere else entirely.
 *
 *   1. A LIVE ENROLMENT WINS OUTRIGHT. Once a seat exists the application is
 *      history — it is left reading `accepted` forever (nothing rewinds it),
 *      so it must never be consulted while a seat is present.
 *
 *   2. AN ENROLMENT DOC THAT IS NOT LIVE KILLS THE OFFER. This is the rule
 *      that needs the test. The remove route flips the enrolment to `removed`
 *      and deliberately does NOT touch the application, so a member who was
 *      accepted, placed, and then removed still owns an `accepted` row. Trust
 *      the application alone and the hub would tell someone who has just been
 *      taken off the course that they are in and their group is coming. The
 *      enrolment document is the record of what happened LAST; the application
 *      is the record of what happened FIRST.
 *
 *   3. ONLY `accepted` AND `waitlisted` ARE OFFERS. `pending` belongs to the
 *      apply page's own status card (it is not news, and the run is by
 *      definition still open, so that card is still reachable); `rejected` and
 *      `withdrawn` are answers the member already has and must not be
 *      re-announced on the hub every time they open it.
 */
export function membershipFor(signals: {
  /** An `active` or `completed` enrolment on this run. */
  hasLiveEnrolment: boolean;
  /** ANY enrolment doc at (run, uid) — including withdrawn / removed. */
  hasEnrolmentDoc: boolean;
  /** The caller's own application status, or null if they never applied. */
  applicationStatus: CourseApplicationStatus | null;
}): MyRunMembership {
  if (signals.hasLiveEnrolment) return "enrolled";
  if (signals.hasEnrolmentDoc) return "none";
  if (signals.applicationStatus === "accepted") return "offered";
  if (signals.applicationStatus === "waitlisted") return "waitlisted";
  return "none";
}

/**
 * Hub ordering: what you are doing now, then what you are waiting on, then
 * history. Ranks rather than a chain of comparators so the intent survives a
 * new status being added to the lifecycle.
 */
const STATUS_RANK: Record<CourseRunStatus, number> = {
  running: 0,
  "applications-open": 1,
  "applications-closed": 1,
  completed: 2,
  draft: 3,
  cancelled: 3,
};

/**
 * The hub's slice of the caller's current week — phase, week, anchor, break
 * label — resolved GROUP-FIRST through the one shared helper.
 *
 * `startDate` is validated at write time by the run normaliser, but a run (or
 * a group's pacing override) can legitimately be half-authored, and the week
 * maths THROWS on a malformed key by design. Guarding with `isValidDateKey` on
 * the RESOLVED date is what the week-maths module header asks of render paths.
 */
function currentWeekSummary(
  run: CourseRunDoc,
  group: CourseGroupDoc | null,
): MyRunEntry["currentWeek"] {
  if (run.status === "draft" || !isValidDateKey(resolveCalendar(run, group).startDate)) {
    return null;
  }
  const cw = memberCurrentWeek(run, group);
  return {
    phase: cw.phase,
    weekNumber: cw.weekNumber,
    anchorWeekNumber: cw.anchorWeekNumber,
    breakLabel: cw.breakLabel,
  };
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET() {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // Five scoped queries, one per way a run can reach the hub. `withdrawn` and
  // `removed` enrolments are excluded at the query: leaving a run removes it
  // from your hub, and the composite (uid, status) index makes that free.
  // `completed` stays — a finished cohort is history you can still open.
  //
  // The applications query filters on uid ONLY, and sorts the statuses out in
  // memory below. Two reasons, in this order: a second equality clause would
  // want a (uid, status) composite index this collection does not have, and
  // the rows are the CALLER'S OWN — a member holds one per run they ever
  // applied to, so the whole set is a handful of documents whatever the term.
  const [enrolSnap, reviewerSnap, leadSnap, applicationSnap, facilitatedSnap] = await Promise.all([
    db
      .collection("courseEnrolments")
      .where("uid", "==", actor.uid)
      .where("status", "in", ["active", "completed"])
      .limit(50)
      .get(),
    db
      .collection("courseRuns")
      .where("admissionsReviewerUids", "array-contains", actor.uid)
      .limit(50)
      .get(),
    db
      .collection("courseRuns")
      .where("trackLeadUids", "array-contains", actor.uid)
      .limit(50)
      .get(),
    db
      .collection("courseApplications")
      .where("uid", "==", actor.uid)
      .limit(50)
      .get(),
    db
      .collection("courseGroups")
      .where("facilitatorUids", "array-contains", actor.uid)
      .limit(50)
      .get(),
  ]);


  // THE SAME FLOOR THE RUN ROUTES APPLY. An enrolment row is an authority the
  // allocation and facilitators routes wrote for an approved account, and
  // nothing rewrites it when that stops being true, so the hub draws a cohort
  // card only while the account is still on the roster. The two role loops
  // below ask the same question of their own arrays.
  const standing: CourseEnrolmentDoc[] = enrolSnap.docs
    .map((d) => normalizeCourseEnrolment(d.id, d.data() ?? {}))
    .filter((e) => isNamedWithStanding(actor, "courseEnrolments.uid", e.uid));

  // The runs whose live groups name the caller as a facilitator, while the
  // account still stands behind the role (the same question every page
  // under /learn asks, `runAccess.ts`), on a run they have a row on, told or
  // not: an appointment always writes one, so this adds the role to a
  // facilitator who holds a place (a learner's row) and to nobody else.
  const rowRunIds = new Set(standing.map((e) => e.runId));
  const facilitatedRunIds = new Set<string>();
  for (const doc of facilitatedSnap.docs) {
    const group = normalizeCourseGroup(doc.id, doc.data() ?? {});
    if (group.archived || !group.runId || !rowRunIds.has(group.runId)) continue;
    if (!isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids)) continue;
    facilitatedRunIds.add(group.runId);
  }
  // A placement Publish has not told its owner about is passed over here,
  // whatever else is true of it: see the note at the top. Its run is
  // remembered only so that the offer probe below does not read the seat as
  // spending an offer the member was still reading before they were placed.
  const isAdmin = actor.role === "admin";
  const enrolments = standing.filter((e) => placementIsShownTo(e, { isAdmin }));
  const untoldRunIds = new Set(
    standing.filter((e) => !enrolments.includes(e)).map((e) => e.runId),
  );

  /**
   * runId → the caller's own decided application status, for the two statuses
   * that are an offer. The normaliser is what pins `status` to the collection's
   * own vocabulary (anything unrecognised reads as `pending` and falls out
   * here); everything else it returns — the email, the answers, the reviewer's
   * notes — is read and discarded, and none of it reaches the wire.
   */
  const applicationStatusByRun = new Map<string, CourseApplicationStatus>();
  for (const doc of applicationSnap.docs) {
    const app = normalizeCourseApplication(doc.id, doc.data() ?? {});
    // Belt to the query's braces: the row is only ever the caller's, and a
    // row whose stored uid disagrees is not theirs to be told about.
    if (app.uid !== actor.uid || !app.runId) continue;
    // A row the application form's hand-over wrote is never an offer, and
    // never anything else here either: see the note at the top. Asked before
    // the status, so no status such a row can be given is ever announced.
    if (app.fromForm !== null) continue;
    if (app.status !== "accepted" && app.status !== "waitlisted") continue;
    applicationStatusByRun.set(app.runId, app.status);
  }

  // Offers worth CHASING: a decided application with no live enrolment behind
  // it. When allocation has already published, the enrolment is present and
  // there is nothing extra to read at all — the common case costs nothing.
  const liveEnrolmentRunIds = new Set(enrolments.map((e) => e.runId));
  const offerRunIds = [...applicationStatusByRun.keys()].filter(
    (id) => !liveEnrolmentRunIds.has(id),
  );

  // The role queries already carry their run docs; only the enrolments and the
  // offers need a lookup, and only for runs the other two didn't already
  // return.
  const runById = new Map<string, CourseRunDoc>();
  for (const doc of [...reviewerSnap.docs, ...leadSnap.docs]) {
    if (!runById.has(doc.id)) {
      runById.set(doc.id, normalizeCourseRun(doc.id, doc.data() ?? {}));
    }
  }
  const missingRunIds = [
    ...new Set(
      [...enrolments.map((e) => e.runId), ...offerRunIds, ...facilitatedRunIds].filter(
        (id) => id && !runById.has(id),
      ),
    ),
  ];

  // The offer probe. `courseEnrolmentId` binds (run, uid), so these are
  // ADDRESSED, never queried — there is no way to spell another member's row,
  // and the cost is one read per outstanding offer rather than a scan. What it
  // answers is "is there a seat document here that the status-filtered query
  // above could not see?", i.e. withdrawn or removed: those keep an `accepted`
  // application forever (the remove route rewinds nothing), and announcing
  // that as an offer is the one way this feature could lie outright.
  //
  // A run whose seat is a placement nobody has told the member about is not
  // probed: the query above has already read that seat, it is active, and it
  // does not spend the offer. The member goes on reading the offer they read
  // before an admin placed them, until Publish tells them their group.
  const offerEnrolmentRunIdById = new Map(
    offerRunIds
      .filter((id) => !untoldRunIds.has(id))
      .map((id) => [courseEnrolmentId(id, actor.uid), id] as const),
  );
  const [missingRunSnaps, offerEnrolSnaps] = await Promise.all([
    missingRunIds.length
      ? db.getAll(...missingRunIds.map((id) => db.collection("courseRuns").doc(id)))
      : [],
    offerEnrolmentRunIdById.size
      ? db.getAll(
          ...[...offerEnrolmentRunIdById.keys()].map((id) =>
            db.collection("courseEnrolments").doc(id),
          ),
        )
      : [],
  ]);
  for (const snap of missingRunSnaps) {
    if (snap.exists) runById.set(snap.id, normalizeCourseRun(snap.id, snap.data() ?? {}));
  }
  /** Runs where a seat document exists but is not live — the offer is spent. */
  const supersededOfferRunIds = new Set<string>();
  for (const snap of offerEnrolSnaps) {
    if (!snap.exists) continue;
    const runId = offerEnrolmentRunIdById.get(snap.id);
    if (runId) supersededOfferRunIds.add(runId);
  }

  type Merged = {
    run: CourseRunDoc;
    roles: Set<MyRunRole>;
    enrolment: CourseEnrolmentDoc | null;
  };
  const merged = new Map<string, Merged>();
  const ensure = (run: CourseRunDoc): Merged => {
    const existing = merged.get(run.id);
    if (existing) return existing;
    const fresh: Merged = { run, roles: new Set<MyRunRole>(), enrolment: null };
    merged.set(run.id, fresh);
    return fresh;
  };

  for (const enrolment of enrolments) {
    // A run deleted out from under an enrolment has nothing to render.
    const run = runById.get(enrolment.runId);
    if (!run) continue;
    const entry = ensure(run);
    entry.enrolment = enrolment;
    entry.roles.add(enrolment.role === "facilitator" ? "facilitator" : "learner");
  }
  // A facilitator who holds a place: their row says learner, their groups
  // say facilitator, and they are both. Before Publish tells them their own
  // place, the run reaches them as any facilitator's does, with no seat on
  // the row.
  for (const runId of facilitatedRunIds) {
    const run = runById.get(runId);
    if (run) ensure(run).roles.add("facilitator");
  }
  // BEING NAMED IS NOT THE SAME AS STILL HOLDING THE ROLE. Nothing rewrites
  // either array when an account is demoted or rejected, so the hub asks the
  // live bar before it draws a door every route beneath it would then refuse.
  // The query has already proved membership, which is why this is
  // `holdsStanding` rather than `isNamedWithStanding`.
  if (holdsStanding(actor, "courseRuns.admissionsReviewerUids")) {
    for (const doc of reviewerSnap.docs) {
      ensure(
        runById.get(doc.id) ?? normalizeCourseRun(doc.id, doc.data() ?? {}),
      ).roles.add("reviewer");
    }
  }
  if (holdsStanding(actor, "courseRuns.trackLeadUids")) {
    for (const doc of leadSnap.docs) {
      ensure(
        runById.get(doc.id) ?? normalizeCourseRun(doc.id, doc.data() ?? {}),
      ).roles.add("lead");
    }
  }
  // Offers get a row of their own — and NO role, because they hold none. The
  // run status is not filtered here: a cancelled or finished run is exactly
  // the case where an unplaced member most needs to be told something, and the
  // card says which. What IS filtered is a spent offer and a run that no
  // longer exists.
  for (const runId of offerRunIds) {
    if (supersededOfferRunIds.has(runId)) continue;
    const run = runById.get(runId);
    if (run) ensure(run);
  }

  // One `getAll` for every group name the hub needs — the caller's own
  // placements and nothing else.
  const groupIds = [
    ...new Set(
      [...merged.values()]
        .map((m) => m.enrolment?.groupId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const groupSnaps = groupIds.length
    ? await db.getAll(...groupIds.map((id) => db.collection("courseGroups").doc(id)))
    : [];
  // The whole doc, not just the name: V2-3 resolves each row's pacing through
  // the caller's own group, and `resolveCalendar` needs the group's override
  // fields. Still only ever the caller's OWN placements — no other member's
  // group is read, and nothing but the name reaches the wire.
  const groupById = new Map<string, CourseGroupDoc>();
  for (const snap of groupSnaps) {
    if (!snap.exists) continue;
    groupById.set(snap.id, normalizeCourseGroup(snap.id, snap.data() ?? {}));
  }

  // Who finished, asked only of a learner's runs that are past their last
  // week (by the caller's own calendar) or marked completed. Not a rule (the
  // answer is false for a run still going whatever is asked) but a saving:
  // asking reads the run's groups, and this list holds every run a member was
  // ever on.
  const now = new Date();
  const finishedRunIds = new Set<string>();
  await Promise.all(
    [...merged.values()].map(async ({ run, enrolment }) => {
      if (!enrolment || enrolment.role !== "learner") return;
      const group = enrolment.groupId ? (groupById.get(enrolment.groupId) ?? null) : null;
      const over = run.status === "completed" || currentWeekSummary(run, group)?.phase === "after";
      if (over && (await finishedForMember(db, run, enrolment, now))) finishedRunIds.add(run.id);
    }),
  );

  // Each run's crest: one read of the forms and one of the courses for the
  // whole list, and none when the caller is on nothing. A read that fails
  // costs the cards their crests (the emblem shows), never the hub.
  const shownCrests = await runCrests(
    db,
    [...merged.values()].map(({ run }) => ({ id: run.id, courseId: run.courseId })),
  ).catch(() => new Map<string, ShownCrest>());

  const runs: MyRunEntry[] = [...merged.values()]
    .map(({ run, roles, enrolment }): MyRunEntry => {
      // Resolved ONCE per row: the pacing, the taught-week total and the
      // "whose calendar is this?" flag all have to describe the SAME calendar,
      // so they come from one `resolveCalendar` rather than three.
      const group = enrolment?.groupId
        ? (groupById.get(enrolment.groupId) ?? null)
        : null;
      const calendar = resolveCalendar(run, group);
      return {
        runId: run.id,
        courseId: run.courseId,
        courseTitle: run.courseTitle,
        label: run.label,
        academicYear: run.academicYear,
        status: run.status,
        roles: ROLE_ORDER.filter((role) => roles.has(role)),
        membership: membershipFor({
          hasLiveEnrolment: Boolean(enrolment),
          hasEnrolmentDoc: Boolean(enrolment) || supersededOfferRunIds.has(run.id),
          applicationStatus: applicationStatusByRun.get(run.id) ?? null,
        }),
        archived: run.archived,
        currentWeek: currentWeekSummary(run, group),
        totalWeeks: calendar.weekPlan.filter((entry) => entry.kind === "week").length,
        pacedByGroup: calendar.source === "group",
        groupName: group?.name ?? null,
        finished: finishedRunIds.has(run.id),
        shownCrest: shownCrests.get(run.id) ?? null,
      };
    })
    // A row has to be SOMETHING to be worth a card: a role to open, or a
    // membership to report. Nothing reaching this filter before offers existed
    // could fail it (every row came from an enrolment or a role array), so it
    // is a no-op on the old population and the guard against a new ghost row —
    // an application whose seat was later removed, on a run the caller holds
    // no role on.
    .filter((entry) => entry.roles.length > 0 || entry.membership !== "none");

  runs.sort(
    (a, b) =>
      // Archived last, whatever their status: an archived run is history the
      // member keeps, not something they are on, and the hub renders the tail
      // of this list as its archived section.
      Number(a.archived) - Number(b.archived) ||
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      a.label.localeCompare(b.label) ||
      // Total order, so two runs sharing a label never swap between loads.
      a.runId.localeCompare(b.runId),
  );

  const payload: MePayload = { runs };
  return NextResponse.json(payload);
}
