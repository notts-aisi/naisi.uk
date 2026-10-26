import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import { readPlaceToRestore, restorePlaces, type PlaceToRestore } from "@/lib/applications/status/record";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { joinedWeekFor } from "@/lib/courses/groupResolve";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
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
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
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
 * `src/lib/applications/status/record.ts`), for a row the form wrote on the
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

type Placement = { uid: string; groupId: string | null };

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
 */
type Rejection = { uid: string; reason: string };

function parsePlacements(body: unknown): Placement[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { placements?: unknown }).placements;
  if (!Array.isArray(raw)) return null;
  const out: Placement[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const { uid, groupId } = entry as { uid?: unknown; groupId?: unknown };
    if (typeof uid !== "string" || !uid) return null;
    if (groupId !== null && (typeof groupId !== "string" || !groupId)) return null;
    out.push({ uid, groupId: groupId ?? null });
  }
  return out;
}

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
  const placements = dedupeByUid(parsed);
  if (placements.length === 0) {
    return NextResponse.json({ ok: true, placed: 0, rejected: [] });
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

  let placed = 0;
  const rejected: Rejection[] = [];

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

  for (let i = 0; i < placements.length; i += CHUNK_SIZE) {
    const chunk = placements.slice(i, i + CHUNK_SIZE);
    let outcome: { placed: number; rejected: Rejection[] };
    try {
      // Accumulators live INSIDE the callback (returned, not captured):
      // Firestore retries a contended transaction, and outer accumulators
      // would double-count the retried attempt.
      outcome = await db.runTransaction(async (tx) => {
        const chunkRejected: Rejection[] = [];
        let chunkPlaced = 0;

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
        for (const doc of runGroupsSnap.docs) {
          const group = normalizeCourseGroup(doc.id, doc.data() ?? {});
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
          if (enrolment.groupId !== groupId) {
            // The stamp certifies "emailed about their CURRENT group"; a
            // changed placement invalidates it, so the next publish emails
            // them about the new group.
            patch.allocatedEmailAt = FieldValue.delete();
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

        return { placed: chunkPlaced, rejected: chunkRejected };
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
          rejected,
        },
        { status: 500 },
      );
    }
    placed += outcome.placed;
    rejected.push(...outcome.rejected);
  }

  return NextResponse.json({ ok: true, placed, rejected });
}
