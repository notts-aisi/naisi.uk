import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readRatingsAbout } from "@/lib/courses/workRatings/readers";
import type { SessionUser } from "@/lib/firebase/session";
import { courseEnrolmentId, enrolmentHasLeft, normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import { isOwnBoxResponse } from "@/lib/firestore/courseExercises";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { courseworkCountsFrom } from "@/lib/legal/courseworkUse";
import { listNotesFromRuns } from "@/lib/memberNotes/store";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { canRunTerm } from "../access";
import { own } from "../keys";
import { normaliseApplication, type ApplicationForm } from "../normalise";
import { applicationRef } from "../repo";
import {
  buildNextTerm,
  countedNotes,
  ratedRowId,
  type NextTermInput,
  type NextTermPerson,
  type NextTermSeat,
  type NextTermView,
  type RatedRow,
} from "./rows";
import { NEXT_TERM_WORDS } from "./words";

/**
 * A TERM'S NEXT TERM PAGE, READ: who a saved note suggests for next term, for
 * an admin alone. `./rows.ts` says what counts; this file reads it.
 *
 * RUNNING THE TERM IS AN ADMIN'S (`canRunTerm`), asked before anything is
 * read beyond the form its caller already holds, so a lead or a reviewer on
 * the form reads nothing of anybody.
 *
 * WHAT IS READ, and only for the people a note suggests:
 *
 *  - the notes written from the term's runs (`listNotesFromRuns`, one `in` on
 *    `runId`), of which only those with a suggestion, about somebody other
 *    than the viewer, are kept;
 *  - those people's accounts, for each one's coursework-use moment and their
 *    name for the viewer (`nameForViewer`). Nobody whose notes all came before
 *    their moment is read any further;
 *  - the ratings about the people left (`readRatingsAbout`, one `in` on
 *    `uid`), kept to the term's runs; the rows those ratings rate, by id, for
 *    when each was first written; and the accounts of whoever gave them, for
 *    their names;
 *  - each one's seat on each of the term's runs, by id, and each run's
 *    groups, for their programme and the group they sit in or facilitate.
 *    Every seat, told or not: the viewer is an admin, who is shown every
 *    placement;
 *  - their application to this term, by id, for its answer about
 *    facilitating and nothing else.
 *
 * Every read is by id, or one equality or one `in` on one field, so nothing
 * needs a declared index. Nothing is written, and nobody is emailed.
 */

export type NextTermOutcome = { status: "ok"; view: NextTermView } | { status: "admins-only" };

type Raw = Record<string, unknown>;

/** The ids once each, none empty. */
const unique = (ids: readonly string[]) => [...new Set(ids.filter(Boolean))];

/** These accounts, by uid, that exist. */
async function readAccounts(db: Firestore, uids: readonly string[]): Promise<Map<string, Raw>> {
  const wanted = unique(uids);
  const out = new Map<string, Raw>();
  if (wanted.length === 0) return out;
  const snaps = await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid)));
  for (const snap of snaps) if (snap.exists) out.set(snap.id, (snap.data() ?? {}) as Raw);
  return out;
}

/**
 * Each person's place on each of the term's runs: the group they sit in, or
 * the one they facilitate (facilitating lives on the group, never on a seat,
 * so somebody who facilitates and holds no place sits in no group), and
 * whether they left. Their seats by id, and each run's live groups by one
 * equality on `runId`.
 */
async function readSeats(db: Firestore, runIds: readonly string[], uids: readonly string[]): Promise<NextTermSeat[]> {
  const ids = unique(runIds.flatMap((runId) => uids.map((uid) => courseEnrolmentId(runId, uid))));
  const [snaps, groupSnaps] = await Promise.all([
    ids.length > 0 ? db.getAll(...ids.map((id) => db.collection("courseEnrolments").doc(id))) : Promise.resolve([]),
    Promise.all(runIds.map((runId) => db.collection("courseGroups").where("runId", "==", runId).get())),
  ]);
  const groups = groupSnaps
    .flatMap((snap) => snap.docs.map((doc) => normalizeCourseGroup(doc.id, (doc.data() ?? {}) as Raw)))
    .filter((group) => !group.archived && runIds.includes(group.runId))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB", { numeric: true }) || a.id.localeCompare(b.id));
  const seats = new Map<string, NextTermSeat>();
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const seat = normalizeCourseEnrolment(snap.id, (snap.data() ?? {}) as Raw);
    if (!runIds.includes(seat.runId) || !uids.includes(seat.uid)) continue;
    const sits = seat.groupId ? groups.find((group) => group.id === seat.groupId && group.runId === seat.runId) : undefined;
    seats.set(`${seat.runId} ${seat.uid}`, {
      runId: seat.runId,
      uid: seat.uid,
      group: sits ? sits.name.trim() || null : null,
      facilitates: sits ? sits.facilitatorUids.includes(seat.uid) : false,
      left: enrolmentHasLeft(seat.status),
    });
  }
  // Somebody who facilitates a group and sits in none is shown the group they facilitate.
  for (const group of groups) {
    for (const uid of group.facilitatorUids) {
      if (!uids.includes(uid)) continue;
      const seat = seats.get(`${group.runId} ${uid}`);
      if (seat?.group || seat?.left) continue;
      seats.set(`${group.runId} ${uid}`, { runId: group.runId, uid, group: group.name.trim() || null, facilitates: true, left: false });
    }
  }
  return [...seats.values()];
}

/**
 * When each written answer these ratings rate was first written, by id, for
 * the ones still there, and nothing else of it: never a word. A row that is a
 * box its writer fills in (a reflection, a fill-in box) is no written answer,
 * and is left out as a row that is gone.
 */
async function readRatedRows(db: Firestore, ids: readonly string[]): Promise<Map<string, RatedRow>> {
  const wanted = unique(ids);
  const out = new Map<string, RatedRow>();
  if (wanted.length === 0) return out;
  const snaps = await db.getAll(...wanted.map((id) => db.collection("courseExerciseResponses").doc(id)));
  for (const snap of snaps) {
    const data = (snap.data() ?? {}) as Raw;
    if (snap.exists && !isOwnBoxResponse(data)) out.set(snap.id, { firstWrittenAt: data.firstWrittenAt });
  }
  return out;
}

/** What each person said about facilitating on the application they sent to this term. */
async function readFacilitating(db: Firestore, form: ApplicationForm, uids: readonly string[]): Promise<Map<string, boolean | null>> {
  const out = new Map<string, boolean | null>();
  if (uids.length === 0) return out;
  const snaps = await db.getAll(...uids.map((uid) => applicationRef(db, form.round.id, uid)));
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const application = normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid);
    if (application?.sent && uids.includes(application.uid)) out.set(application.uid, application.sent.wantsToFacilitate);
  }
  return out;
}

export async function loadNextTerm(db: Firestore, viewer: SessionUser, form: ApplicationForm): Promise<NextTermOutcome> {
  // Running the term is an admin's, decided before anybody is read.
  if (!canRunTerm(viewer)) return { status: "admins-only" };

  const programmes = form.programmeIds.flatMap((id) => {
    const programme = own(form.programmes, id);
    return programme?.runId ? [{ runId: programme.runId, name: programme.shortName.trim() || programme.name.trim() }] : [];
  });
  const runIds = programmes.map((programme) => programme.runId);
  const input: NextTermInput = {
    roundId: form.round.id,
    term: form.round.label.trim(),
    viewerUid: viewer.uid,
    programmes,
    notes: [],
    people: new Map(),
    ratings: [],
    ratedRows: new Map(),
    raterNames: new Map(),
    seats: [],
    facilitating: new Map(),
  };
  if (runIds.length === 0) return { status: "ok", view: buildNextTerm(input) };

  // The notes from the term's runs that suggest somebody, never the viewer.
  const notes = (await listNotesFromRuns(db, runIds)).filter((note) => note.suggest.length > 0 && note.uid !== viewer.uid);
  const people = new Map<string, NextTermPerson>();
  for (const [uid, data] of await readAccounts(db, notes.map((note) => note.uid))) {
    people.set(uid, { from: courseworkCountsFrom(data), name: nameForViewer(viewer, accountNamesOf(data), NEXT_TERM_WORDS.noName) });
  }
  // Only somebody with a note that counts is read any further.
  const listed = [...countedNotes({ viewerUid: viewer.uid, programmes, notes, people }).keys()];
  if (listed.length === 0) return { status: "ok", view: buildNextTerm({ ...input, notes, people }) };

  const [ratings, seats, facilitating] = await Promise.all([
    readRatingsAbout(db, listed).then((all) => all.filter((rating) => runIds.includes(rating.runId))),
    readSeats(db, runIds, listed),
    readFacilitating(db, form, listed),
  ]);
  const [ratedRows, raters] = await Promise.all([
    readRatedRows(
      db,
      ratings.map((rating) => ratedRowId(rating)),
    ),
    readAccounts(
      db,
      ratings.map((rating) => rating.raterUid),
    ),
  ]);
  const raterNames = new Map<string, string>();
  for (const [uid, data] of raters) raterNames.set(uid, nameForViewer(viewer, accountNamesOf(data), NEXT_TERM_WORDS.someone));

  return {
    status: "ok",
    view: buildNextTerm({ ...input, notes, people, ratings, ratedRows, raterNames, seats, facilitating }),
  };
}
