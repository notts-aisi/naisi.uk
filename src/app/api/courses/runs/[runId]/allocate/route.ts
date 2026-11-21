import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import { readPlaceToRestore, restorePlaces, type PlaceToRestore } from "@/lib/applications/status/restore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { joinedWeekFor } from "@/lib/courses/groupResolve";
import { doesTrackLeadWork, readsTimeAnswers, runStaffingOf } from "@/lib/courses/runStaffing";
import {
  courseApplicationId,
  normalizeCourseApplication,
  rowIsServedTo,
  type CourseApplicationDoc,
} from "@/lib/firestore/courseApplications";
import {
  courseEnrolmentId,
  enrolmentHasLeft,
  normalizeCourseEnrolment,
  placementIsTold,
} from "@/lib/firestore/courseEnrolments";
import { visitsAfterGroupChange } from "@/lib/courses/groupsByWeek";
import {
  mayBeMidTerm,
  midTermToPoolRefusal,
  readIsMidTerm,
  planBoardMove,
  saveBoardMove,
  type BoardRefusal,
} from "@/lib/courses/staffMove/board";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";

/**
 * Place accepted applicants into groups — the write half of the allocation
 * board, and the writer of learner placements. The one other place a learner
 * is placed is an appointment of a facilitator who holds a place and sits in
 * no group yet: `src/lib/courses/groupFacilitators.ts` places them in the
 * group they facilitate, with the row this route's first placement writes,
 * counted the same way, and never moves anybody from one group to another.
 *
 * WHO MAY ALLOCATE: admins ∪ the run's `trackLeadUids` ∪ the lead of the
 * programme that names the run (`runStaffingOf`): the people who staff the
 * run. Admissions reviewers decided WHO gets in; this route decides WHERE
 * they sit, and the two powers are deliberately separate.
 *
 * SOMEBODY THE APPLICATION FORM PLACED ON THIS RUN IS PLACED BY AN ADMIN OR
 * BY THE LEAD OF THE PROGRAMME THAT NAMES IT. A row an admin's hand-over
 * wrote (`fromForm`) is served to those two on every staff route
 * (`rowIsServedTo`), so a track lead who sends that person's uid is answered
 * exactly as for somebody with no accepted application at all, and learns
 * nothing from the answer.
 *
 * PUTTING SOMEBODY BACK GIVES THEM THEIR PLACE ON THE FORM AGAIN. Leaving the
 * run and Remove each give the place on the application form back, so
 * placing a seat that has left (`withdrawn` or `removed`) back on the run
 * gives that place to its person again, in the same transaction
 * (`readPlaceToRestore` and `restorePlaces` in
 * `src/lib/applications/status/restore.ts`), for a row the form wrote on the
 * run's list: their own page, the programme's lists of its people and every
 * count of places then say they hold a place, each through the reading it
 * already makes. Where the form has no such place to give (it was not given
 * back on that programme, or the round is not a form any more), the seat
 * records when it was put back instead (`putBackAt`), as it always has.
 *
 * ── WHY THERE IS NO UNIQUENESS SEARCH ───────────────────────────────────────
 * Double-placement is structurally impossible, so nothing here queries for
 * "is this person already in a group". The enrolment doc id is the invariant:
 * `courseEnrolments/{courseEnrolmentId(runId, uid)}` means AT MOST one
 * enrolment can exist per (run, uid) — `tx.create` throws ALREADY_EXISTS on a
 * race rather than duplicating — and the placement itself is `groupId`, a
 * SINGLE SCALAR on that one doc. There is nowhere to store a second
 * placement. Group membership is ALWAYS a query over enrolments
 * (`where("groupId","==",g)`), NEVER a `memberUids` array on the group doc —
 * an array would be a second copy of the truth that could disagree with the
 * scalar. Moving someone is one scalar update plus two counter deltas, atomic
 * in the same transaction, so "everyone placed, no one twice" is true by
 * construction, not by audit.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Placements are processed in chunks of ≤100, each chunk one transaction, so
 * a board-wide "auto-place all" stays inside Firestore's transaction limits
 * while a single drag is still one tiny atomic commit.
 *
 * ── A MOVE MADE MID-TERM KEEPS THE WEEKS ALREADY MET ────────────────────────
 * A seat told its group, moved to another group once it has met (a session
 * of the group it belongs to has started, and was neither called off nor
 * marked as not held), or one that already has a record of groups by week,
 * is not written by the chunk: a move here would be for every week,
 * and the weeks met with the old group would turn into blanks and absences.
 * Each such move is made on its own, after its chunk, through the one writer
 * of the record (`saveBoardMove` in `src/lib/courses/staffMove/board.ts`,
 * which calls `moveFromWeek`), from the week the move page's rule gives:
 * earlier weeks stay with the old group, a History row goes on each group,
 * and nobody is emailed (the next Publish tells them, as it tells any move
 * here). One person's refusal never loses another's move. A placement may
 * carry the week the board showed (`fromWeek`): a move whose week is now
 * another is refused, and the board says so.
 *
 * `preview: true` writes nothing and answers, for each placement the caller
 * may place, the week such a move would be from and the board's question,
 * or the rule's refusal in its sentence; anybody else, and every move made
 * before the term, is answered with no week, exactly as a move with nothing
 * to say. A move before the term is written exactly as it always was.
 *
 * A SEAT SUCH A MOVE FREES IS FREE BEFORE IT IS TAKEN, as the boards send
 * their placements (`placementOrder` in
 * `src/lib/applications/arrange/changes.ts`). Every capacity check reads the
 * count its own transaction read, so no group is ever over its capacity at
 * any commit, and a move made mid-term frees its seat only when it is
 * written. So the press goes in rounds: the placements in their chunks, then
 * the moves made mid-term one by one; then every placement of the press
 * still refused because its group was full (in that round or an earlier
 * one), into a group a move made mid-term has just left, is tried again, in
 * the same way, until a round makes no such move: at most one round more
 * than there are moves made mid-term, since nobody's move is written twice. A move made
 * mid-term that is refused frees nothing, so nobody is ever placed into a
 * seat it did not free. A press with no move made mid-term is one round,
 * exactly as it always was. Two people swapped between two full groups are
 * still refused, as they always were: neither can go first.
 *
 * NEVER INTO NO GROUP MID-TERM. A told seat that has met (a session of its
 * own started, neither called off nor marked as not held), or one with a
 * record, taken out of every group would keep no record of the weeks it
 * met, so it is refused (`mid-term-to-pool`), in the board's sentence: move
 * the person straight to the new group, or take them off the run. Before the
 * term, and a seat nobody has told, as always. A told seat already in no
 * group is placed by the plain move, as always.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── A TOLD SEAT STAYS TOLD, WHEREVER IT IS MOVED ────────────────────────────
 * A move of a seat whose owner Publish has told about a group (a learner's
 * seat still on the run, `placementIsTold`) never clears Publish's stamp: to
 * another group, to no group, or back. Its owner is never hidden by a move:
 * they, their new group's facilitators, its register and its next check-in
 * see them in the group they are in now at once. The seat remembers which
 * group they were told about (`toldGroupId`): a seat told before that was
 * kept gets the group it leaves written there by its first move, in the same
 * write. Whether they are owed an email is worked out, never stored
 * (`movedSinceTold`): in a group other than the one they were told about,
 * the next Publish emails them "You’ve moved"; moved back, nothing is owed.
 * Their answer to "can you make this time?" stays too, and is shown only
 * while they are in the group it is about. Nothing here emails anybody.
 *
 * A move of a seat nobody has told is the board's working copy, as always:
 * nothing to clear, and Publish tells them their group.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── A FACILITATOR WHO HOLDS A PLACE SITS IN THE GROUP THEY FACILITATE ───────
 * A facilitator can be one of the run's fellows too. So a placement asks
 * which of the run's live groups the person facilitates (the run's groups,
 * one equality, read in the transaction):
 *  · somebody who facilitates a group is placed in THAT group and no other,
 *    and is never moved out of it to another (`facilitates-another-group`):
 *    who facilitates a group changes on its Facilitators view, and only then
 *    does the board move them;
 *  · somebody whose row on the run is a FACILITATOR'S (they were made a
 *    facilitator before anybody placed them) is placed by turning that row
 *    into a learner's: their place, on the group's own clock, counted like
 *    any first placement. The row keeps its id, so it is still the one row
 *    the person has on the run. Their facilitating is unchanged, because it
 *    lives on the group (`facilitatorUids`), not on the row.
 * ────────────────────────────────────────────────────────────────────────────
 */

type Ctx = { params: Promise<{ runId: string }> };

type Placement = { uid: string; groupId: string | null; fromWeek?: number };

/** Placements per transaction. Reads ~3n docs and writes ≤2n — well inside
 * Firestore's 500-writes-per-transaction limit with room for counter docs. */
const CHUNK_SIZE = 100;

/** Sanity ceiling on one request — matches the board's 500-applicant read cap. */
const MAX_PLACEMENTS = 500;

/**
 * Machine-readable rejection reasons (the board maps them to copy):
 *  - "not-accepted":   no application, or its status isn't "accepted"
 *  - "group-not-found": target group missing or belongs to another run
 *  - "group-archived": target group is archived
 *  - "group-full":     placing would exceed the group's capacity
 *  - "facilitates-another-group": they facilitate one of the run's other
 *    live groups, and somebody who holds a place sits in the group they
 *    facilitate
 *  - a move made mid-term (see the note at the top) refused by its own
 *    save: "no-week" (the move page's rule offers no week), "week-changed"
 *    (not the week the board showed), "old-no-longer-meets" (the group they
 *    are in is archived) and "changed" (the board is out of date), each with
 *    the sentence the board shows (`words`); and the codes above
 *  - "mid-term-to-pool": a told seat whose group has met, taken out of every
 *    group (see the note at the top), with its sentence (`words`)
 */
type Rejection = { uid: string; reason: string; words?: string };

function parsePlacements(body: unknown): Placement[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { placements?: unknown }).placements;
  if (!Array.isArray(raw)) return null;
  const out: Placement[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const { uid, groupId, fromWeek } = entry as { uid?: unknown; groupId?: unknown; fromWeek?: unknown };
    if (typeof uid !== "string" || !uid) return null;
    if (groupId !== null && (typeof groupId !== "string" || !groupId)) return null;
    // The week the board showed for a move made mid-term, when it showed one.
    if (fromWeek !== undefined && fromWeek !== null && !(typeof fromWeek === "number" && Number.isInteger(fromWeek) && fromWeek >= 1 && fromWeek <= 60)) return null;
    out.push({ uid, groupId: groupId ?? null, ...(typeof fromWeek === "number" ? { fromWeek } : {}) });
  }
  return out;
}

/** What the board is told before a press, for one placement. */
type PreviewEntry = { uid: string; groupId: string | null; fromWeek: number | null; words: string | null; refusal: BoardRefusal | null };

/** Last write wins for a uid listed twice — the board sends latest intent. */
function dedupeByUid(placements: Placement[]): Placement[] {
  const byUid = new Map<string, Placement>();
  for (const p of placements) byUid.set(p.uid, p);
  return [...byUid.values()];
}

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId } = await ctx.params;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parsePlacements(body);
  if (!parsed) {
    return NextResponse.json({ error: "Malformed placements" }, { status: 400 });
  }
  if (parsed.length > MAX_PLACEMENTS) {
    return NextResponse.json(
      { error: `At most ${MAX_PLACEMENTS} placements per request.` },
      { status: 400 },
    );
  }
  const preview = (body as { preview?: unknown }).preview === true;
  const placements = dedupeByUid(parsed);
  if (placements.length === 0) {
    return NextResponse.json(preview ? { ok: true, preview: [] } : { ok: true, placed: 0, rejected: [] });
  }

  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});

  const staffing = await runStaffingOf(db, actor, run);
  if (!doesTrackLeadWork(staffing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();

  /**
   * The refusal of taking this person out of every group, when that would be
   * mid-term (see the note at the top), read outside any transaction for the
   * preview; null when the pool takes them as it always has.
   */
  const poolRefusalOf = async (uid: string): Promise<BoardRefusal | null> => {
    const seatSnap = await db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid)).get();
    if (!seatSnap.exists) return null;
    const seat = normalizeCourseEnrolment(seatSnap.id, seatSnap.data() ?? {});
    if (seat.runId !== runId || seat.uid !== uid || !seat.groupId) return null;
    const groupsSnap = await db.collection("courseGroups").where("runId", "==", runId).get();
    const groups = groupsSnap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => group.runId === runId);
    if (!(await readIsMidTerm((refs) => db.getAll(...refs), db, run, seat, groups, now))) return null;
    return midTermToPoolRefusal(db, uid, groups.find((group) => group.id === seat.groupId)?.name ?? "");
  };

  if (preview) {
    // Writes nothing. Only a person this caller may place, to one of the run's
    // groups that still meets, is answered with a week; anybody else as a move
    // with nothing to say, so the answer tells a caller nothing it may not see.
    const out: PreviewEntry[] = [];
    for (const { uid, groupId } of placements) {
      const blank: PreviewEntry = { uid, groupId, fromWeek: null, words: null, refusal: null };
      const appSnap = await db.collection("courseApplications").doc(courseApplicationId(runId, uid)).get();
      const application = appSnap.exists ? normalizeCourseApplication(appSnap.id, appSnap.data() ?? {}) : null;
      if (!application || application.status !== "accepted" || !rowIsServedTo(application, staffing)) {
        out.push(blank);
        continue;
      }
      if (!groupId) {
        // Out of every group: refused mid-term (see the note at the top), else nothing to say.
        out.push({ ...blank, refusal: await poolRefusalOf(uid) });
        continue;
      }
      // The question names a "most weeks" tick only to a reader of time answers.
      const planned = await planBoardMove(db, run, uid, groupId, now, true, readsTimeAnswers(staffing));
      if (planned.kind === "mid-term") out.push({ ...blank, fromWeek: planned.weekNumber, words: planned.words });
      else if (planned.kind === "refused") out.push({ ...blank, refusal: planned.refusal });
      else out.push(blank);
    }
    return NextResponse.json({ ok: true, preview: out });
  }

  let placed = 0;
  // Each person's refusal, by uid: one tried again in a later round loses its earlier refusal.
  const rejectedByUid = new Map<string, Rejection>();
  const rejectedNow = () => [...rejectedByUid.values()];

  // Each form a seat that has left may get its place back on, read once for
  // the request and outside its transactions, as leaving and Remove read it.
  const forms = new Map<string, Promise<ApplicationForm | null>>();
  const formOf = (roundId: string): Promise<ApplicationForm | null> => {
    const known = forms.get(roundId);
    if (known) return known;
    const loading = loadForm(db, roundId);
    forms.set(roundId, loading);
    return loading;
  };

  // The rounds (see the note at the top): the first takes every placement,
  // and the groups a move made mid-term left in a round have a seat free.
  let pending: Placement[] = placements;
  let freed = new Set<string>();
  for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
    const chunk = pending.slice(i, i + CHUNK_SIZE);
    let outcome: { placed: number; rejected: Rejection[]; midTerm: Placement[]; toPool: { uid: string; fromName: string }[] };
    try {
      // Accumulators live INSIDE the callback (returned, not captured):
      // Firestore retries a contended transaction, and outer accumulators
      // would double-count the retried attempt.
      outcome = await db.runTransaction(async (tx) => {
        const chunkRejected: Rejection[] = [];
        let chunkPlaced = 0;
        // Moves made mid-term, made one by one after this chunk commits.
        const chunkMidTerm: Placement[] = [];
        // Told seats whose group has met, refused the pool: worded after the commit.
        const chunkToPool: { uid: string; fromName: string }[] = [];

        // ── Reads first, ALL of them ──────────────────────────────────────
        // Firestore transactions forbid reads after the first write, so the
        // whole chunk's inputs are gathered up front: enrolments and
        // applications for every uid, plus every distinct TARGET group. The
        // SOURCE groups (where movers currently sit) are only discoverable
        // from the enrolments just read, so they are a second read phase —
        // still strictly before any write.
        const enrolmentRefs = chunk.map((p) =>
          db.collection("courseEnrolments").doc(courseEnrolmentId(runId, p.uid)),
        );
        const applicationRefs = chunk.map((p) =>
          db.collection("courseApplications").doc(courseApplicationId(runId, p.uid)),
        );
        const targetGroupIds = [
          ...new Set(chunk.flatMap((p) => (p.groupId ? [p.groupId] : []))),
        ];
        const targetGroupRefs = targetGroupIds.map((id) =>
          db.collection("courseGroups").doc(id),
        );

        const [enrolmentSnaps, applicationSnaps, targetGroupSnaps, runGroupsSnap] =
          await Promise.all([
            tx.getAll(...enrolmentRefs),
            tx.getAll(...applicationRefs),
            targetGroupRefs.length
              ? tx.getAll(...targetGroupRefs)
              : Promise.resolve([]),
            // Who facilitates which of the run's live groups: one equality on
            // one field, read in the transaction so an appointment made while
            // this runs makes it run again.
            tx.get(db.collection("courseGroups").where("runId", "==", runId)),
          ]);
        const facilitatedBy = new Map<string, string[]>();
        // The run's groups, archived ones included: whether a move is made mid-term.
        const runGroups: CourseGroupDoc[] = [];
        for (const doc of runGroupsSnap.docs) {
          const group = normalizeCourseGroup(doc.id, doc.data() ?? {});
          if (group.runId === runId) runGroups.push(group);
          if (group.runId !== runId || group.archived) continue;
          for (const uid of group.facilitatorUids) {
            facilitatedBy.set(uid, [...(facilitatedBy.get(uid) ?? []), group.id]);
          }
        }

        const enrolmentByUid = new Map(
          chunk.map((p, idx) => [p.uid, enrolmentSnaps[idx]] as const),
        );
        const applicationByUid = new Map(
          chunk.map((p, idx) => [p.uid, applicationSnaps[idx]] as const),
        );
        const groupById = new Map(
          targetGroupIds.map((id, idx) => [id, targetGroupSnaps[idx]] as const),
        );

        // Second read phase: source groups not already fetched as targets.
        const sourceGroupIds = new Set<string>();
        for (const snap of enrolmentSnaps) {
          if (!snap.exists) continue;
          const gid = (snap.data() ?? {}).groupId;
          if (typeof gid === "string" && gid && !groupById.has(gid)) {
            sourceGroupIds.add(gid);
          }
        }
        if (sourceGroupIds.size > 0) {
          const refs = [...sourceGroupIds].map((id) =>
            db.collection("courseGroups").doc(id),
          );
          const snaps = await tx.getAll(...refs);
          [...sourceGroupIds].forEach((id, idx) => groupById.set(id, snaps[idx]));
        }

        // Each person's row on the run's list, when it is one this caller may
        // place: accepted, and served to them. Only ACCEPTED applicants may be
        // placed, so allocation follows admissions and never sidesteps it. (Direct
        // enrolment without an application is a different, future path.) A row
        // the application form put here is placed by an admin or by the lead of
        // the programme whose hand-over wrote it, and anybody else is told what
        // they would be told about a uid with no accepted row.
        const servedRowByUid = new Map<string, CourseApplicationDoc>();
        for (const { uid } of chunk) {
          const appSnap = applicationByUid.get(uid);
          const application = appSnap?.exists
            ? normalizeCourseApplication(appSnap.id, appSnap.data() ?? {})
            : null;
          if (application && application.status === "accepted" && rowIsServedTo(application, staffing)) {
            servedRowByUid.set(uid, application);
          }
        }

        // Third read phase, still before any write: the place on the form each
        // seat that has left gets back when it is put back (see the note at the
        // top), for a served row the form wrote. Null where there is none to give.
        const placeToRestoreByUid = new Map<string, PlaceToRestore>();
        for (const { uid } of chunk) {
          const row = servedRowByUid.get(uid);
          const seatSnap = enrolmentByUid.get(uid);
          if (!row?.fromForm || !seatSnap?.exists) continue;
          if (!enrolmentHasLeft(normalizeCourseEnrolment(seatSnap.id, seatSnap.data() ?? {}).status)) continue;
          const form = await formOf(row.fromForm.roundId);
          const place = form ? await readPlaceToRestore(tx, db, form, uid, row.fromForm.programmeId) : null;
          if (place) placeToRestoreByUid.set(uid, place);
        }
        const restoring: PlaceToRestore[] = [];

        // Fourth read phase, still before any write: whether each told place
        // moved out of its group has MET (`readIsMidTerm`: a session of its
        // own started, neither called off nor marked as not held on its
        // register), read in this transaction for every place that may be.
        const midTermByUid = new Map<string, boolean>();
        for (const { uid, groupId } of chunk) {
          const seatSnap = enrolmentByUid.get(uid);
          if (!servedRowByUid.has(uid) || !seatSnap?.exists) continue;
          const seat = normalizeCourseEnrolment(seatSnap.id, seatSnap.data() ?? {});
          if (!mayBeMidTerm(seat) || seat.groupId === groupId) continue;
          midTermByUid.set(uid, await readIsMidTerm((refs) => tx.getAll(...refs), db, run, seat, runGroups, now));
        }

        // ── Decide, then write ────────────────────────────────────────────
        // Counter deltas accumulate per group and are written ONCE per group
        // at the end. `memberCount` counts enrolments that are BOTH active
        // AND grouped — the same definition the remove route decrements by —
        // so a move inside this chunk frees its old seat for a later
        // placement in the same array (capacity checks read the running
        // effective count, not the stored one).
        const deltaByGroup = new Map<string, number>();
        const effectiveCount = (groupId: string): number => {
          const snap = groupById.get(groupId);
          const stored = snap?.exists
            ? normalizeCourseGroup(snap.id, snap.data() ?? {}).memberCount
            : 0;
          return stored + (deltaByGroup.get(groupId) ?? 0);
        };
        const bumpDelta = (groupId: string, by: number) => {
          deltaByGroup.set(groupId, (deltaByGroup.get(groupId) ?? 0) + by);
        };

        for (const placement of chunk) {
          const { uid, groupId } = placement;

          // A row this caller may place, accepted and served to them (read
          // above), or the answer for a uid with no accepted row.
          if (!servedRowByUid.has(uid)) {
            chunkRejected.push({ uid, reason: "not-accepted" });
            continue;
          }

          // Normalised ONCE per placement and reused by every decision below
          // that needs the group — existence, archived, capacity, and the
          // member's own joining week. It used to be normalised twice and the
          // joining week not at all, which is how the run's clock ended up
          // stamped on a member of a group that runs on its own.
          const targetGroupSnap = groupId ? groupById.get(groupId) : undefined;
          const targetGroup =
            targetGroupSnap && targetGroupSnap.exists
              ? normalizeCourseGroup(targetGroupSnap.id, targetGroupSnap.data() ?? {})
              : null;

          if (groupId) {
            if (!targetGroup || targetGroup.runId !== runId) {
              chunkRejected.push({ uid, reason: "group-not-found" });
              continue;
            }
            if (targetGroup.archived) {
              chunkRejected.push({ uid, reason: "group-archived" });
              continue;
            }
          }

          const enrolmentSnap = enrolmentByUid.get(uid);
          const enrolment = enrolmentSnap?.exists
            ? normalizeCourseEnrolment(enrolmentSnap.id, enrolmentSnap.data() ?? {})
            : null;
          const enrolmentRef = db
            .collection("courseEnrolments")
            .doc(courseEnrolmentId(runId, uid));

          // A facilitator who holds a place sits in the group they
          // facilitate: placed there, or nowhere yet, and never in another.
          const facilitates = facilitatedBy.get(uid) ?? [];
          if (groupId && facilitates.length > 0 && !facilitates.includes(groupId)) {
            chunkRejected.push({ uid, reason: "facilitates-another-group" });
            continue;
          }
          // A facilitator's row is the row of somebody nobody has placed yet:
          // taking them out of a group is nothing to do, and putting them in
          // one turns the row into their place (below).
          const facilitatorRow = enrolment !== null && enrolment.role === "facilitator";
          if (facilitatorRow && !groupId) continue;

          // Whether this enrolment currently holds a counted seat.
          const wasCounted =
            enrolment !== null &&
            enrolment.status === "active" &&
            enrolment.groupId !== null;

          // Already exactly where they're being placed — nothing to do. (An
          // inactive enrolment "in" the same group still falls through to be
          // reactivated below, and so does a facilitator's row, which is
          // nobody's place yet.)
          if (
            enrolment &&
            !facilitatorRow &&
            enrolment.groupId === groupId &&
            enrolment.status === "active"
          ) {
            continue;
          }

          // A MOVE MADE MID-TERM keeps the weeks already met (see the note at
          // the top): not written here, but on its own once this chunk has
          // committed, from the week the rule gives. Taking a place out of
          // every group, and every move before the term, are as always.
          if (
            enrolment &&
            !facilitatorRow &&
            groupId !== null &&
            groupId !== enrolment.groupId &&
            midTermByUid.get(uid) === true
          ) {
            chunkMidTerm.push(placement);
            continue;
          }
          // NEVER INTO NO GROUP MID-TERM (see the note at the top): refused,
          // and the seat, its record and its group's count stay as they are.
          if (
            enrolment &&
            !facilitatorRow &&
            groupId === null &&
            enrolment.groupId !== null &&
            midTermByUid.get(uid) === true
          ) {
            chunkToPool.push({ uid, fromName: runGroups.find((group) => group.id === enrolment.groupId)?.name ?? "" });
            continue;
          }

          // CAPACITY IS HARD here: the in-transaction effective count (stored
          // memberCount adjusted by this chunk's earlier placements) must stay
          // within capacity. The board surfaces a "group-full" rejection;
          // admins raise the cap in the group editor if the group really
          // should take more.
          if (groupId && targetGroup) {
            // A same-group reactivation adds a seat too, so it is checked the
            // same as any other placement.
            if (
              targetGroup.capacity !== null &&
              effectiveCount(groupId) >= targetGroup.capacity
            ) {
              chunkRejected.push({ uid, reason: "group-full" });
              continue;
            }
          }

          if (!enrolment) {
            // Un-placing someone who was never enrolled: nothing to create.
            // (A null placement is only meaningful once an enrolment exists.)
            if (!groupId) continue;

            // First placement = the enrolment's birth. `tx.create` (not set)
            // so a concurrent allocator racing on the same person loses with
            // ALREADY_EXISTS instead of silently overwriting — the doc id is
            // the invariant (see module comment).
            tx.create(enrolmentRef, {
              runId,
              courseId: run.courseId,
              uid,
              groupId,
              status: "active",
              role: "learner",
              applicationId: courseApplicationId(runId, uid),
              // THEIR group's clock, not the run's — see `joinedWeekFor`.
              joinedWeekNumber: joinedWeekFor(run, targetGroup),
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            bumpDelta(groupId, 1);
            chunkPlaced += 1;
            continue;
          }

          // Existing enrolment → MOVE (or un-place, or reactivate): ONE
          // scalar update plus the counter deltas. A "removed" or "withdrawn"
          // enrolment being re-placed flips back to "active" here — the row
          // is the person's whole history on this run (the deterministic id
          // means there can never be a second row), so re-admission is a
          // status flip, not a new doc. Its old seat was already released
          // when it left "active", so only the +1 side applies.
          const patch: Record<string, unknown> = {
            groupId,
            status: "active",
            updatedAt: FieldValue.serverTimestamp(),
          };
          if (facilitatorRow && targetGroup) {
            // THEIR FIRST PLACE, on the row they already have: a learner's,
            // from their row on the run's list, on THEIR group's clock, as a
            // first placement writes it. A retired facilitator's row
            // ("removed") is no leaver, so nothing of leaving is touched.
            patch.role = "learner";
            patch.applicationId = courseApplicationId(runId, uid);
            patch.joinedWeekNumber = joinedWeekFor(run, targetGroup);
          }
          // Told about a group by Publish, and still on the run: a learner's
          // seat (a facilitator's row is nobody's place yet), not one that
          // left, which the branch below puts back afresh.
          const told =
            enrolment.role === "learner" && !enrolmentHasLeft(enrolment.status) && placementIsTold(enrolment);
          if (enrolment.groupId !== groupId) {
            // A move here is for every week: the record of which group they
            // were in from which week (`groupsByWeek`, written only by a move
            // from a week) goes, so it can never disagree with the group, and
            // they read the group they are in now for every week, as every
            // move here always has.
            patch.groupsByWeek = FieldValue.delete();
            // A one-week visit stands across a move here, but one to the
            // group they now belong to would be no visit at all, and goes.
            if (enrolment.visits) {
              const kept = groupId ? visitsAfterGroupChange(enrolment, { groupId }) : null;
              patch.visits = kept ?? FieldValue.delete();
            }
            if (told) {
              // THEY STAY TOLD (see the note at the top). A seat told before
              // the group it was told about was kept was told about the group
              // it leaves: written now, in the move's own write, so the next
              // Publish knows what changed and a move back owes nothing.
              if (enrolment.toldGroupId === null && enrolment.groupId !== null) {
                patch.toldGroupId = enrolment.groupId;
              }
            } else {
              // Nobody has told them, so there is no stamp to keep, and the
              // next Publish tells them their group. An answer about a group
              // they were never told goes with it.
              patch.allocatedEmailAt = FieldValue.delete();
              patch.toldGroupId = FieldValue.delete();
              patch.timeAnswer = FieldValue.delete();
            }
          }
          if (!facilitatorRow && enrolmentHasLeft(enrolment.status)) {
            // SOMEBODY WHO LEFT, PUT BACK. Leaving keeps the group and
            // Publish's stamp (they were told about it, and it shows them
            // the page that says they left), so a re-placement in that same
            // group would otherwise read as told at once. Coming back earns
            // a fresh placement email from the next Publish, as it always
            // has, and the day they left and why go with the leaving: on an
            // active row they would read as current to every later reader.
            patch.allocatedEmailAt = FieldValue.delete();
            patch.toldGroupId = FieldValue.delete();
            // A fresh placement is asked afresh whether its time works.
            patch.timeAnswer = FieldValue.delete();
            patch.droppedOutAt = null;
            patch.dropOutReason = null;
            // THEIR PLACE ON THE FORM IS THEIRS AGAIN (`restorePlaces`, after
            // this loop), so the form says they hold it and the seat keeps no
            // record that it was put back: a later "I can’t make it" then
            // reads as it does for anybody placed. Where the form has no place
            // to give them, the seat records when they were put back instead,
            // a deliberate act on a card that says they left, so their card
            // stops saying they gave their place back and the next Publish
            // tells them (`putBackAt` on the enrolment's type says who reads it).
            const place = placeToRestoreByUid.get(uid);
            if (place) {
              restoring.push(place);
              patch.putBackAt = FieldValue.delete();
            } else {
              patch.putBackAt = FieldValue.serverTimestamp();
            }
          }
          tx.update(enrolmentRef, patch);
          if (wasCounted && enrolment.groupId) bumpDelta(enrolment.groupId, -1);
          if (groupId) bumpDelta(groupId, 1);
          chunkPlaced += 1;
        }

        // All deltas land once per group per transaction.
        for (const [groupId, delta] of deltaByGroup) {
          if (delta === 0) continue;
          tx.update(db.collection("courseGroups").doc(groupId), {
            memberCount: FieldValue.increment(delta),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        // And each place on the form a seat put back gets again, with its
        // form's counters, in the same transaction as the seat.
        if (restoring.length > 0) restorePlaces(tx, restoring);

        return { placed: chunkPlaced, rejected: chunkRejected, midTerm: chunkMidTerm, toPool: chunkToPool };
      });
    } catch (err) {
      // Chunks are independent transactions, so earlier chunks are already
      // committed — say so honestly rather than pretending nothing happened.
      console.error("[courses allocate] transaction failed", runId, err);
      return NextResponse.json(
        {
          error:
            placed > 0
              ? `Some placements failed to save — ${placed} were applied before the error. Reload the board to see the current state.`
              : "Couldn't save those placements.",
          placed,
          rejected: rejectedNow(),
        },
        { status: 500 },
      );
    }
    placed += outcome.placed;
    for (const refusal of outcome.rejected) rejectedByUid.set(refusal.uid, refusal);
    for (const { uid, fromName } of outcome.toPool) rejectedByUid.set(uid, { uid, ...(await midTermToPoolRefusal(db, uid, fromName)) });
    // Each move made mid-term on its own: one person's refusal never loses another's move.
    for (const move of outcome.midTerm) {
      if (!move.groupId) continue;
      try {
        const saved = await saveBoardMove(db, { run, uid: move.uid, toGroupId: move.groupId, fromWeek: move.fromWeek ?? null, actor, now });
        if (saved.ok) {
          placed += 1;
          freed.add(saved.leftGroupId);
        } else {
          rejectedByUid.set(move.uid, { uid: move.uid, ...saved.refusal });
        }
      } catch (err) {
        console.error("[courses allocate] move made mid-term failed", runId, err);
        rejectedByUid.set(move.uid, { uid: move.uid, reason: "failed" });
      }
    }
    // The round's last chunk: the next round tries again EVERY placement of
    // the press still refused because its group was full, from this round or
    // an earlier one, into a group a move made mid-term left in this round.
    // None when no such move was made in this round, and the press is over.
    // So it always ends: a round follows only one in which a move made
    // mid-term was written, and nobody's move is written twice (once written
    // they sit where they were sent, and are refused no more), so there are
    // at most as many rounds as such moves, plus one.
    if (i + CHUNK_SIZE >= pending.length) {
      const again = placements.filter((each) => each.groupId !== null && freed.has(each.groupId) && rejectedByUid.get(each.uid)?.reason === "group-full");
      for (const each of again) rejectedByUid.delete(each.uid);
      pending = again;
      freed = new Set<string>();
      i = -CHUNK_SIZE; // the loop's step makes it 0: the next round's first chunk
    }
  }

  return NextResponse.json({ ok: true, placed, rejected: rejectedNow() });
}
