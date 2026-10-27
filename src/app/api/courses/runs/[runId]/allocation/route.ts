import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import {
  formPlaceFactsFor,
  type FormPlaceFacts,
} from "@/lib/applications/handover/board";
import {
  loadPublishPlan,
  pressBatch,
  testWhen,
  type TestState,
} from "@/lib/courses/allocationPublish";
import { shortSlotWords } from "@/lib/courses/facilitatorAsks/words";
import { groupTagOf } from "@/lib/courses/programmeAttendance";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import type { WeekPlanEntry } from "@/lib/courses/weekPlan";
import {
  membershipKnownFromRow,
  normalizeCourseApplication,
  rowIsServedTo,
} from "@/lib/firestore/courseApplications";
import {
  courseEnrolmentId,
  enrolmentIsPutBack,
  normalizeCourseEnrolment,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import {
  compareGroupsByMeeting,
  normalizeCourseGroup,
  type GroupSession,
} from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { hasPaidMembership, normalizeUser } from "@/lib/firestore/users";

/**
 * The allocation board's read — one payload with everything the board needs:
 * the run, its groups (with live member counts), and every ACCEPTED applicant
 * joined with their enrolment (if any).
 *
 * WHO MAY READ: admins ∪ the run's `trackLeadUids` ∪ the lead of the
 * programme that names the run (`runStaffingOf`). Allocation is a staffing
 * act — placing accepted people into groups — so it belongs to the people who
 * staff and steer the run, NOT to admissions reviewers (whose job ended at the
 * decision) and not to facilitators (who see only their own group's roster,
 * later, via the facilitator routes).
 *
 * PII: name-only, same boundary as the P5 admissions queue — the board is
 * shown to non-admin track leads, and nothing in this payload may carry an
 * email address. `reviewerPreferredFacilitatorUid` is resolved to a display
 * NAME server-side for the same reason.
 *
 * THE INVARIANT, visible here: `groupId` on each row is the single scalar off
 * the deterministic `courseEnrolments/{runId}__{uid}` doc, so a person appears
 * on the board exactly once and can be in at most one group by construction.
 * "Everyone placed" is a count of rows with a null or inactive placement,
 * leaving out anybody who has left the run (`enrolmentHasLeft`): the publish
 * route refuses while that count is non-zero.
 *
 * SOMEBODY THE APPLICATION FORM PLACED HERE IS SEEN BY AN ADMIN AND BY THE
 * LEAD OF THE PROGRAMME THAT NAMES THE RUN. A row an admin's hand-over wrote
 * (`fromForm`) is for a person who applied on the term's form, where who may
 * read an application is decided programme by programme, and being this
 * run's track lead gives nobody that right. So such a row is listed for an
 * admin, and for the lead of the programme whose hand-over wrote it, and for
 * nobody else (`rowIsServedTo`). A track lead still opens the board and still
 * sees everybody who applied to the run itself. For the rows from the form
 * the payload also carries which groups the person can make, worked out from
 * the week they painted on the form when the board is read: see
 * `AllocRow.fromForm`.
 */

// ---------------------------------------------------------------------------
// Wire types (the contract the allocation board renders from)
// ---------------------------------------------------------------------------

export type AllocGroup = {
  id: string;
  name: string;
  /** Allocation cap; null = uncapped. Capacity is HARD at allocate time. */
  capacity: number | null;
  /** e.g. "Tuesdays 18:00–19:30"; empty when the slot isn't set up yet. */
  sessionLabel: string;
  /** Names only — this board is shown to non-admin track leads too. */
  facilitatorNames: string[];
  /**
   * The same facilitators by uid, in the same order, so the Groups tab's
   * Facilitators view can say who is ticked. A uid is an id, not an address.
   */
  facilitatorUids: string[];
  /**
   * What the programme's People in groups (board st-groups) heads a column
   * with: the first names its facilitators go by ("Rahul", "Sofia"), in the
   * same order; the group's letter as the People tab and the times picture
   * write it ("C" for "Group C"); its weekly slot in the board's short form
   * ("Thu 6pm", or "" with no day or time); and its room ("" for none yet).
   * Staffing facts of the same tier as `sessionLabel` and `facilitatorNames`:
   * a room is where the group meets, never a link.
   */
  facilitatorFirstNames: string[];
  tag: string;
  when: string;
  room: string;
  /** The server-owned counter maintained by the allocation transaction. */
  memberCount: number;
  /**
   * ── THE AUTONOMY FIELDS (V2-3) ────────────────────────────────────────────
   * Exactly `GroupDivergenceInput` in `src/lib/courses/groupResolve.ts`, so the
   * board hands a column straight to `groupsDiverge` with no defaulting and no
   * cast. A move between two columns can now change which WEEK a member is on
   * and which VERSION of it they read; none of that shows on a card, and the
   * allocator is the last person who can catch it.
   *
   * Not member data: a group's pacing and the ids of the weeks its facilitator
   * has forked are staffing facts about the group, the same tier as
   * `sessionLabel` and `facilitatorNames` this payload already carries to
   * non-admin track leads. No week CONTENT travels — ids only.
   *
   * `null` on either pace field means "tracks the run", which is also what an
   * unplaced member reads, so the unallocated pool compares equal to a group
   * that has overridden nothing and the note stays silent on the common move.
   */
  paceStartDate: string | null;
  paceWeekPlan: WeekPlanEntry[] | null;
  /** Doc ids ("w03") under `courseGroups/{id}/weeks`. Order irrelevant. */
  forkedWeekIds: string[];
};

export type AllocRow = {
  uid: string;
  displayName: string;
  /**
   * The membership badge, read from the person's account. `null` is "not
   * known": the account could not be read and the row carries no snapshot
   * (`membershipKnownFromRow`). A card then draws no badge.
   */
  paidMembership: boolean | null;
  /** The session labels the applicant ticked, split back out of storage. */
  availability: string[];
  reviewerPreferredGroupId: string | null;
  /** Resolved to a NAME server-side — the uid's address never travels. */
  reviewerPreferredFacilitatorName: string | null;
  reviewerNotes: string | null;
  /** The single placement scalar; null = accepted but not yet placed. */
  groupId: string | null;
  enrolmentStatus: "none" | "active" | "withdrawn" | "removed";
  /** ISO 8601 — when the placement email for the current group was sent. */
  allocatedEmailAt: string | null;
  /**
   * What became of that email: handed over, held by this copy of the site,
   * or stopped by the do-not-email list. Null for a stamp written before
   * Publish kept this, which was a send.
   */
  allocatedEmailDelivery: "sent" | "held" | "suppressed" | null;
  /**
   * Set for somebody the application form placed on this run, null for
   * somebody who applied to the run itself (whose `availability` above is
   * the session labels they ticked).
   *
   * The form asks for a painted week, not for ticks against this run's
   * sessions, so `availability` is empty for these people and this says
   * instead, group by group, whether their week covers the group's whole
   * session. `none-given` means they painted nothing, which is not the same
   * as being able to make none; `not-on-file` means their application is no
   * longer there to read. `holdsPlace` is false once they have given the
   * place back on the form: nothing takes them off this board, so the card
   * says so.
   */
  fromForm: FormPlaceFacts | null;
  /**
   * Staff put them back on the run after they left it, and they are on it
   * still (`enrolmentIsPutBack`): their card no longer says they gave their
   * place back, and Publish tells them. Present, and true, only then, so
   * every other row is exactly as it was.
   */
  putBack?: true;
};

/**
 * What a press of Publish would do now, for the board's Publish area: the
 * number on its button, who it reaches, what it would refuse, and the last
 * test. Worked out by `loadPublishPlan`, the plan Publish itself reads, so the
 * button cannot promise a number the press does not send. Counts and names
 * only: no address is in it.
 */
export type PublishSummary = {
  /**
   * The run takes its people from the application form and the viewer is
   * neither an admin nor the lead of the programme that names it.
   */
  adminOnly: boolean;
  /** Emails a press sends now. */
  emails: number;
  /** Of those, to people told their group. */
  people: number;
  /** Of those, to facilitators. */
  facilitators: number;
  /** Emails still owed past one press's cap. */
  more: number;
  /** Names owed an email with no address on file. */
  noAddress: string[];
  /** Groups with a facilitator waiting because nobody is placed there yet. */
  emptyGroups: string[];
  /** Why a press would be refused because an email cannot be written. */
  refusals: string[];
  /**
   * How many people placed in a group and not told yet gave their place back
   * on the form: their cards say "Gave their place back", and a press leaves
   * them out. Present only when there is somebody, so a summary with nobody
   * is exactly as it was before this was counted.
   */
  gaveBack?: number;
  test: {
    state: TestState;
    /** "5:38pm", or "Mon 26 Oct at 5:38pm" on another day. Null with no test. */
    when: string | null;
    /** Null for the viewer's own test; the first name of whoever sent it otherwise. */
    who: string | null;
  };
};

export type AllocationPayload = {
  run: {
    id: string;
    label: string;
    courseTitle: string;
    academicYear: string;
    /** ISO 8601, or null while allocation has never been published. */
    allocationPublishedAt: string | null;
  };
  groups: AllocGroup[];
  people: AllocRow[];
  publish: PublishSummary;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Ceiling on the keys-only fork read per group. A plan holds at most
 * `COURSE_FIELD_LIMITS.maxWeekPlanEntries` (60) slots, so a group cannot have
 * more forks than that — the limit is a cost guard on a corrupt subcollection,
 * not a real bound anyone reaches.
 */
const MAX_FORKED_WEEKS = 60;

/** Index = `GroupSession.weekday` (`Date.getDay()`, 0 = Sunday). */
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function endTimeLabel(start: string, minutes: number): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(start);
  if (!m || minutes <= 0) return null;
  const total = (Number(m[1]) * 60 + Number(m[2]) + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * "Tuesdays 18:00–19:30" — byte-for-byte the label the apply page renders as
 * availability chips and the P5 queue shows per group, so a row's
 * `availability` strings and this payload's group labels compare EQUAL on the
 * board (that equality is what powers the availability-conflict chips).
 * Deliberately duplicated from the P5 applications route — route handlers
 * don't import from one another. The format is the contract; change together.
 */
function sessionLabel(session: GroupSession): string {
  const day = WEEKDAY_NAMES[session.weekday];
  if (!day || !session.startTimeLocal) return "";
  const end = endTimeLabel(session.startTimeLocal, session.durationMinutes);
  return `${day}s ${session.startTimeLocal}${end ? `–${end}` : ""}`;
}

/**
 * Display-name fallback chain: preferred name, then account name, then a
 * neutral placeholder — NEVER an email address, which is what makes this safe
 * for the track-lead-facing board. (Same local helper as P1/P5 carry; the
 * plan's integration checklist owns the eventual shared extraction.)
 */
function displayNameOf(data: Record<string, unknown>): string {
  const profile = (data.profile as Record<string, unknown> | undefined) ?? {};
  const preferred = profile.preferredName;
  const display = data.displayName;
  return (
    (typeof preferred === "string" && preferred.trim()) ||
    (typeof display === "string" && display.trim()) ||
    "NAISI member"
  );
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const obj = v as { toDate?: () => Date };
  return typeof obj?.toDate === "function" ? obj.toDate() : null;
}

/**
 * Split the stored availability line back into chips — P4 stores the ticked
 * session labels as one comma-joined string (see the apply route's WIRE vs
 * STORED note); the labels themselves never contain a comma.
 */
function splitAvailability(stored: string): string[] {
  return stored
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Collapse an enrolment onto the board's four-state contract. `completed`
 * maps to "active": for placement purposes a completed enrolment is a placed
 * one (it holds a seat and must not be re-placed elsewhere), and the board
 * only ever runs pre/mid-run where the state shouldn't occur anyway.
 */
function boardStatus(e: CourseEnrolmentDoc | null): AllocRow["enrolmentStatus"] {
  if (!e) return "none";
  if (e.status === "completed") return "active";
  return e.status;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  const { runId } = await ctx.params;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const runData = runSnap.data() ?? {};
  const run = normalizeCourseRun(runSnap.id, runData);

  // An admin, one of the run's track leads, or the lead of the programme that
  // names the run, worked out from the form now (`runStaffingOf`).
  const staffing = await runStaffingOf(db, actor, run);
  if (!doesTrackLeadWork(staffing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // `runId` alone is single-field auto-indexed. Same cost ceilings and same
  // rationale as the P5 queue: the board is a whole-cohort surface, loaded in
  // one shot; a run approaching 500 applicants needs a paged board, not a
  // bigger number here. Status is filtered in memory so no composite index is
  // needed.
  const [appSnap, groupSnap] = await Promise.all([
    db.collection("courseApplications").where("runId", "==", runId).limit(500).get(),
    db.collection("courseGroups").where("runId", "==", runId).limit(50).get(),
  ]);

  // A row the application form put here is listed for an admin and for the
  // lead of the programme whose hand-over wrote it: see the note at the top.
  const rows = appSnap.docs.map((d) => normalizeCourseApplication(d.id, d.data() ?? {}));
  const served = rows.filter((a) => rowIsServedTo(a, staffing));
  const accepted = served.filter((a) => a.status === "accepted");

  // Archived groups are dropped: the board must not offer a column that no
  // longer runs (the allocate route refuses them independently). Monday
  // first: the order every tab of a programme's page lists groups in.
  const groups = groupSnap.docs
    .map((d) => normalizeCourseGroup(d.id, d.data() ?? {}))
    .filter((g) => !g.archived)
    .sort(compareGroupsByMeeting);

  // The join is by CONSTRUCTION, not by query: the enrolment doc id is
  // `courseEnrolmentId(runId, uid)`, so each accepted applicant's enrolment —
  // if it exists — lives at exactly one known path. One `getAll` fetches the
  // lot; a missing doc is an honest "not placed yet".
  const enrolmentRefs = accepted.map((a) =>
    db.collection("courseEnrolments").doc(courseEnrolmentId(runId, a.uid)),
  );
  const enrolmentSnaps = enrolmentRefs.length ? await db.getAll(...enrolmentRefs) : [];
  const enrolmentByUid = new Map<string, CourseEnrolmentDoc>();
  for (const snap of enrolmentSnaps) {
    if (!snap.exists) continue;
    const e = normalizeCourseEnrolment(snap.id, snap.data() ?? {});
    enrolmentByUid.set(e.uid, e);
  }

  // THE FORKED WEEK IDS, one keys-only read per group (V2-3). `select()` with
  // no field mask returns the doc IDS and nothing else — no week content
  // crosses this boundary, and the fan-out is bounded by the same 50-group
  // ceiling the query above already imposes, times the 60-slot plan ceiling.
  //
  // It cannot be derived any more cheaply: "has this group forked anything" is
  // the existence of documents in a subcollection, and there is no denormalised
  // counter on the group doc to read instead (adding one would be a second
  // source of truth for the fork state that the fork route would have to keep
  // in step). Groups are read in parallel with each other, in one round trip.
  const forkedIdsByGroup = new Map<string, string[]>();
  const forkSnaps = await Promise.all(
    groups.map((g) =>
      db
        .collection("courseGroups")
        .doc(g.id)
        .collection("weeks")
        .select()
        .limit(MAX_FORKED_WEEKS)
        .get(),
    ),
  );
  groups.forEach((g, i) => {
    forkedIdsByGroup.set(g.id, forkSnaps[i].docs.map((d) => d.id));
  });

  // One `getAll` for every name this payload needs: applicants, the groups'
  // facilitators, and each row's reviewer-preferred facilitator. Names only —
  // see the PII note in the module comment.
  const uids = new Set<string>();
  for (const app of accepted) {
    if (app.uid) uids.add(app.uid);
    if (app.reviewerPreferredFacilitatorUid) uids.add(app.reviewerPreferredFacilitatorUid);
  }
  for (const group of groups) {
    for (const uid of group.facilitatorUids) uids.add(uid);
  }
  const uidList = [...uids];
  const userDocs = uidList.length
    ? await db.getAll(...uidList.map((uid) => db.collection("users").doc(uid)))
    : [];

  const nameByUid = new Map<string, string>();
  const firstNameByUid = new Map<string, string>();
  const paidByUid = new Map<string, boolean>();
  for (const doc of userDocs) {
    if (!doc.exists) continue;
    const data = doc.data() ?? {};
    nameByUid.set(doc.id, displayNameOf(data));
    firstNameByUid.set(doc.id, firstNameOfUser(data));
    // Against the RUN's academic year, not today's — same reasoning as the P5
    // queue: the badge must not blank when `currentAcademicYear()` rolls over
    // mid-cycle on 1 August.
    paidByUid.set(
      doc.id,
      hasPaidMembership(normalizeUser(doc.id, data), run.academicYear),
    );
  }

  // Which groups each person from the form can make, and whether they still
  // hold their place there. Asked of the application system, which reads the
  // week they painted and hands back only the answer.
  const formFacts = await formPlaceFactsFor(
    db,
    staffing,
    accepted.filter((a) => a.fromForm !== null),
    groups.map((g) => ({ id: g.id, session: g.session })),
  );

  const people: AllocRow[] = accepted.map((app) => {
    const enrolment = enrolmentByUid.get(app.uid) ?? null;
    const fromForm = app.fromForm !== null ? (formFacts.get(app.uid) ?? null) : null;
    return {
      uid: app.uid,
      displayName: nameByUid.get(app.uid) ?? app.displayName ?? "NAISI member",
      paidMembership: paidByUid.get(app.uid) ?? membershipKnownFromRow(app),
      availability: splitAvailability(app.availability),
      reviewerPreferredGroupId: app.reviewerPreferredGroupId ?? null,
      reviewerPreferredFacilitatorName: app.reviewerPreferredFacilitatorUid
        ? (nameByUid.get(app.reviewerPreferredFacilitatorUid) ?? "NAISI member")
        : null,
      reviewerNotes: app.reviewerNotes ?? null,
      groupId: enrolment?.groupId ?? null,
      enrolmentStatus: boardStatus(enrolment),
      allocatedEmailAt: iso(enrolment?.allocatedEmailAt),
      allocatedEmailDelivery: enrolment?.allocatedEmailDelivery ?? null,
      // Field by field, so nothing the application system adds later rides
      // along to a browser.
      fromForm: fromForm
        ? {
            availability: fromForm.availability,
            canMakeGroupIds: fromForm.canMakeGroupIds,
            holdsPlace: fromForm.holdsPlace,
          }
        : null,
      ...(enrolment && enrolmentIsPutBack(enrolment) ? { putBack: true as const } : {}),
    };
  });
  // Unplaced first (the work), then alphabetical — the board reads as a queue.
  people.sort((a, b) => {
    const rank = (r: AllocRow) => (r.groupId && r.enrolmentStatus === "active" ? 1 : 0);
    return rank(a) - rank(b) || a.displayName.localeCompare(b.displayName);
  });

  // What a press of Publish would do now, read through the plan Publish reads.
  // A row this caller is not served holds the press for somebody who is. The
  // plan is handed the facts the cards above were drawn from, so a card that
  // says "Gave their place back" is somebody the press leaves out.
  const plan = await loadPublishPlan(db, run, {
    accepted,
    adminOnly: served.length < rows.length,
    formPlaces: formFacts,
  });
  const batch = pressBatch(plan);
  let testedBy: string | null = null;
  if (plan.test.byUid && plan.test.byUid !== actor.uid) {
    const tester = await db.collection("users").doc(plan.test.byUid).get();
    testedBy = tester.exists ? displayNameOf(tester.data() ?? {}).split(" ")[0] || "an admin" : "an admin";
  }
  const publish: PublishSummary = {
    adminOnly: plan.adminOnly,
    emails: batch.emails,
    people: batch.people.length,
    facilitators: batch.facilitators.length,
    more: batch.more,
    noAddress: batch.noAddress,
    emptyGroups: plan.emptyGroups,
    refusals: plan.refusals,
    ...(plan.gaveBack.length > 0 ? { gaveBack: plan.gaveBack.length } : {}),
    test: {
      state: plan.test.state,
      when: plan.test.at ? testWhen(plan.test.at) : null,
      who: plan.test.state === "none" ? null : testedBy,
    },
  };

  const payload: AllocationPayload = {
    run: {
      id: run.id,
      label: run.label,
      courseTitle: run.courseTitle,
      academicYear: run.academicYear,
      // Not part of `normalizeCourseRun` (the field is owned by this feature's
      // publish route), so it is read off the raw doc here.
      allocationPublishedAt: iso(tsToDate(runData.allocationPublishedAt)),
    },
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      capacity: g.capacity,
      sessionLabel: sessionLabel(g.session),
      facilitatorNames: g.facilitatorUids.map(
        (uid) => nameByUid.get(uid) ?? "NAISI member",
      ),
      facilitatorUids: [...g.facilitatorUids],
      facilitatorFirstNames: g.facilitatorUids.map((uid) => firstNameByUid.get(uid) || "NAISI member"),
      tag: groupTagOf(g.name),
      when: shortSlotWords(g.session) ?? "",
      room: g.session.location.trim(),
      memberCount: g.memberCount,
      // The autonomy triple, straight off the normalised doc plus the keys-only
      // subcollection read above. `normalizeCourseGroup` already coerces a
      // garbled pace date and a malformed plan to `null` (= tracks the run), so
      // the board never has to interpret these — see AllocGroup.
      paceStartDate: g.paceStartDate,
      paceWeekPlan: g.paceWeekPlan,
      forkedWeekIds: forkedIdsByGroup.get(g.id) ?? [],
    })),
    people,
    publish,
  };

  return NextResponse.json(payload);
}
