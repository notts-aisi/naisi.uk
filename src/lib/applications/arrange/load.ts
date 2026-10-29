import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { wouldFacilitate } from "@/lib/courses/facilitatorAsks/rules";
import { nextGroupName, sharedPlaces } from "@/lib/courses/groupTimes/rules";
import type { SessionUser } from "@/lib/firebase/session";
import { readsOf, toldGroupIds } from "@/lib/courses/groupTimes/told";
import { enrolmentHasLeft, normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import { canRunTerm } from "../access";
import { isInTerm, placementFor } from "../decisions";
import { compareWithRun, nameOnRecord, placeHoldersOn, type PlaceHolder } from "../handover/holders";
import { markedRanges } from "@/lib/admissions/availability";
import { paintedWeekOf } from "../handover/paintedWeek";
import { RUNS_COLLECTION, listRunRows, readRun } from "../handover/run";
import { defaultLength, hasSessionTime, lengthFromGroups, lengthOptions, pickLength, timesPicture, WEEK_FROM_MONDAY } from "../handover/times";
import { groupsOf, type LiveGroup } from "../handover/timesLoad";
import { own } from "../keys";
import { loadForm, loadQuestionSets } from "../repo";
import { NOT_FOUND, refuse } from "../review/refusals";
import { termPictureFor } from "../review/term";
import type { Refusal } from "../review/types";
import { listDecisions, listReviews, listSentApplications } from "../staffRepo";
import type { ApplicationForm } from "../normalise";
import type { ProgrammeSettings } from "../model";
import type { ArrangeGroup, ArrangePerson, CandidateTime } from "./plan";

/**
 * EVERYTHING AN ARRANGEMENT IS WORKED OUT FROM, for an admin.
 *
 * The same reads the Times view makes (`../handover/timesLoad.ts`), in the
 * same order, by the same helpers: the form, the programme's run and its
 * groups, then, once decisions have gone out, the week each person painted,
 * read only through `paintedWeekOf`. THE PEOPLE ARE THE RUN'S OWN LIST, as
 * the allocate route reads it: everybody on it, accepted, who holds a place
 * on the programme (or sits in one of the run's groups), and whose seat has
 * not left the run. Somebody who holds a place and is not on that list
 * cannot be placed, so they are named apart (`notOnList`) for the hand-over.
 * Then the run's seats, for who is in which group now and whether Publish
 * has told them it, and the run's groups' facilitators, who sit in the
 * group they facilitate and nowhere else (`appointed`).
 *
 * Only an admin: what follows asks Claude about named people, and Claude's
 * reads are an admin's (`../assessment/run.ts`).
 *
 * BEFORE DECISION DAY, A PREVIEW (`loadPreviewArranging`): the people the
 * decisions as they stand place on the programme, read from the term as the
 * review screens read it (`../review/term.ts`), so the viewer's own
 * application is left out exactly as on every screen before decision day.
 * Nobody is on the run yet, so nobody has a group or has been told one, and
 * an arrangement made then can only be looked at: Apply waits for the run.
 */

export const DEFAULT_GROUP_SIZE = 8;

/**
 * The name for a group an arrangement adds: the run's next "Group X" where its
 * groups are named that way (`nextGroupName`), else the first "Group A",
 * "Group B" not taken, so a group Apply makes always has a name.
 */
export function newGroupName(taken: readonly string[]): string {
  const next = nextGroupName([...taken]);
  if (next) return next;
  const used = new Set(taken.map((name) => name.trim().toLowerCase()));
  for (let code = "A".charCodeAt(0); code <= "Z".charCodeAt(0); code += 1) {
    const name = `Group ${String.fromCharCode(code)}`;
    if (!used.has(name.toLowerCase())) return name;
  }
  return `Group ${taken.length + 1}`;
}

export type Arranging = {
  /** Null for a preview of a programme that names no run yet. */
  runId: string | null;
  /** True before decision day: worked out from the decisions as they stand, to look at only. */
  preview: boolean;
  programmeId: string;
  programmeName: string;
  programmeShortName: string;
  minutes: number;
  size: number;
  /** Everybody holding a place, by account id. */
  people: Map<string, ArrangePerson>;
  /** The run's live groups, by id. */
  groups: Map<string, LiveGroup>;
  /** The same groups as the planner reads them. */
  arrangeGroups: ArrangeGroup[];
  /** The hours the form's grid asked about, for a chart of somebody's week. */
  grid: { startMinute: number; endMinute: number };
  /** The times picture's start times, most people first: what other arrangements are drawn from. */
  best: (CandidateTime & { count: number })[];
  /** The session lengths a group of the run may last, for the length picker. */
  lengths: number[];
  /**
   * People holding a place who are not on the run's list, accepted, so
   * nobody can place them until they are handed over. Empty for a preview.
   */
  notOnList: PlaceHolder[];
  /** Publish has been pressed on the run at least once. */
  published: boolean;
  /** The run's groups Publish has told anybody the time of, by id. */
  toldGroups: Set<string>;
};

export type ArrangingResult = { ok: true; arranging: Arranging } | Refusal;

/** "Up to 8" on the programme's card, or the places the run's groups share. */
function groupSizeOf(programmeSize: string, groups: readonly LiveGroup[]): number {
  const shared = sharedPlaces(groups.map((group) => group.capacity));
  if (shared !== null && shared > 0) return shared;
  const said = /(\d+)/.exec(programmeSize);
  const n = said ? Number(said[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GROUP_SIZE;
}

export async function loadArranging(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  wanted: { minutes?: unknown; size?: unknown },
): Promise<ArrangingResult> {
  if (!canRunTerm(user)) return refuse(403, "Only an admin can ask for an arrangement.");
  const form = await loadForm(db, roundId);
  if (!form) return NOT_FOUND;
  const programme = own(form.programmes, programmeId);
  if (!programme) return NOT_FOUND;
  if (programme.runId === null) return refuse(409, "This programme names no course run yet.");
  const runSnap = await db.collection(RUNS_COLLECTION).doc(programme.runId).get();
  const read = runSnap.exists ? readRun(runSnap.id, runSnap.data()) : null;
  if (!read) return refuse(409, "The course run this programme names is not there any more.");
  // Nobody is arranged, or named, until everybody has been told.
  if (form.decisionsSentAt === null) return refuse(409, "Decisions haven’t gone out yet.");

  const runId = read.run.id;
  const live = await groupsOf(db, runId);
  const options = lengthOptions(live);
  const minutes = pickLength(wanted.minutes, options, defaultLength(lengthFromGroups(live), programme.kind));
  const askedSize = Number(wanted.size);
  const size = Number.isInteger(askedSize) && askedSize >= 2 && askedSize <= 30 ? askedSize : groupSizeOf(programme.groupSize, live);

  const [applications, decisions, sets, seats, rows, toldGroups] = await Promise.all([
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
    loadQuestionSets(db, form.round.id),
    // One equality on one field, so no declared index: every seat on the run.
    db.collection("courseEnrolments").where("runId", "==", runId).get(),
    // The run's own list: who the allocate route places.
    listRunRows(db, runId),
    toldGroupIds(db, readsOf(db), runId, live),
  ]);
  const inTerm = applications.filter(isInTerm);
  const byUid = new Map(inTerm.map((application) => [application.uid, application] as const));
  const liveIds = new Set(live.map((group) => group.id));
  // Each seat: where a fellow sits now, whether Publish has told them it, and whether it has left the run.
  const seatOf = new Map<string, { groupId: string | null; told: boolean; left: boolean }>();
  for (const doc of seats.docs) {
    const seat = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
    const left = enrolmentHasLeft(seat.status);
    const sits = seat.role === "learner" && seat.status === "active" && seat.groupId !== null && liveIds.has(seat.groupId);
    // A fellow's seat is told once Publish has emailed them its group (a move clears the stamp).
    seatOf.set(seat.uid, { groupId: sits ? seat.groupId : null, told: sits && seat.allocatedEmailAt instanceof Date, left });
  }
  // Who facilitates which of the run's groups.
  const appointed = new Map<string, string[]>();
  for (const group of live) {
    for (const uid of group.facilitatorUids) appointed.set(uid, [...(appointed.get(uid) ?? []), group.id]);
  }

  const holders = placeHoldersOn(form, programme.id, inTerm, decisions);
  const holding = new Set(holders.map((holder) => holder.uid));
  const names = new Map(holders.map((holder) => [holder.uid, holder.name] as const));
  const compared = compareWithRun({ holders, rows, roundId: form.round.id, programmeId: programme.id, names });
  const notOnList = [...compared.toHandOver, ...compared.notAccepted];

  const people = new Map<string, ArrangePerson>();
  for (const row of rows) {
    if (row.status !== "accepted" || people.has(row.uid)) continue;
    const seat = seatOf.get(row.uid);
    if (seat?.left) continue;
    // Somebody who gave their place back is not arranged, unless they still sit in a group.
    if (!holding.has(row.uid) && !seat?.groupId) continue;
    const application = byUid.get(row.uid) ?? null;
    people.set(row.uid, {
      uid: row.uid,
      name: names.get(row.uid) ?? (application ? nameOnRecord(application) : row.displayName.trim() || "NAISI member"),
      week: paintedWeekOf(form.round.availabilityGrid, application),
      facilitates: application?.sent ? wouldFacilitate(form, sets, application.sent, programme) : false,
      marked: application?.sent ? markedRanges(application.sent.availability, form.round.availabilityGrid) : [],
      groupId: seat?.groupId ?? null,
      told: seat?.told ?? false,
      appointed: appointed.get(row.uid) ?? [],
    });
  }

  return {
    ok: true,
    arranging: {
      ...arrangingFrom(form, programme, runId, live, people, minutes, size, false, toldGroups),
      lengths: options,
      notOnList,
      published: Boolean(runSnap.data()?.allocationPublishedAt),
    },
  };
}

/** The picture's best times and the groups as the planner reads them, from the people and the run's groups. */
function arrangingFrom(
  form: ApplicationForm,
  programme: ProgrammeSettings,
  runId: string | null,
  live: readonly LiveGroup[],
  people: Map<string, ArrangePerson>,
  minutes: number,
  size: number,
  preview: boolean,
  toldGroups: Set<string>,
): Arranging {
  // Every start time anybody can make, most people first: the picture's own count.
  const picture = timesPicture({
    grid: form.round.availabilityGrid,
    minutes,
    people: [...people.values()].map((person) => ({ uid: person.uid, name: person.name, week: person.week })),
    groups: [...live],
  });
  const best: (CandidateTime & { count: number })[] = [];
  picture.rows.forEach((start, row) => {
    WEEK_FROM_MONDAY.forEach((weekday, column) => {
      const count = picture.counts[row]?.[column] ?? 0;
      if (count > 0) best.push({ weekday, start, count });
    });
  });
  best.sort((a, b) => b.count - a.count || WEEK_FROM_MONDAY.indexOf(a.weekday) - WEEK_FROM_MONDAY.indexOf(b.weekday) || a.start - b.start);

  const arrangeGroups: ArrangeGroup[] = live.map((group) => ({
    id: group.id,
    name: group.name,
    session: hasSessionTime(group.session) ? group.session : null,
    capacity: group.capacity,
    staffed: group.facilitatorUids.length > 0,
    keepsTime: toldGroups.has(group.id) || group.facilitatorUids.length > 0,
  }));

  return {
    runId,
    preview,
    programmeId: programme.id,
    programmeName: programme.name,
    programmeShortName: programme.shortName,
    minutes,
    size,
    people,
    groups: new Map(live.map((group) => [group.id, group])),
    arrangeGroups,
    grid: { startMinute: form.round.availabilityGrid.startMinute, endMinute: form.round.availabilityGrid.endMinute },
    best,
    lengths: lengthOptions(live),
    notOnList: [],
    published: false,
    toldGroups,
  };
}

/**
 * A PREVIEW BEFORE DECISION DAY: everybody the decisions as they stand place
 * on this programme, the viewer's own application left out. The run's groups
 * are used where the programme names a run; nobody is in one yet.
 */
export async function loadPreviewArranging(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  wanted: { minutes?: unknown; size?: unknown },
): Promise<ArrangingResult> {
  if (!canRunTerm(user)) return refuse(403, "Only an admin can ask for an arrangement.");
  const form = await loadForm(db, roundId);
  if (!form) return NOT_FOUND;
  const programme = own(form.programmes, programmeId);
  if (!programme) return NOT_FOUND;
  if (form.decisionsSentAt !== null) return refuse(409, "Decisions have gone out, so arrange the people holding places instead.");

  let runId: string | null = null;
  let live: LiveGroup[] = [];
  if (programme.runId !== null) {
    const runSnap = await db.collection(RUNS_COLLECTION).doc(programme.runId).get();
    const read = runSnap.exists ? readRun(runSnap.id, runSnap.data()) : null;
    if (read) {
      runId = read.run.id;
      live = await groupsOf(db, runId);
    }
  }
  const options = lengthOptions(live);
  const minutes = pickLength(wanted.minutes, options, defaultLength(lengthFromGroups(live), programme.kind));
  const askedSize = Number(wanted.size);
  const size = Number.isInteger(askedSize) && askedSize >= 2 && askedSize <= 30 ? askedSize : groupSizeOf(programme.groupSize, live);

  const [applications, decisions, sets, reviews] = await Promise.all([
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
    loadQuestionSets(db, form.round.id),
    listReviews(db, form.round.id),
  ]);
  // The term as the review screens read it: the viewer's own application is not in it.
  const term = termPictureFor({ form, applications, decisions, reviews, viewerUid: user.uid });
  const people = new Map<string, ArrangePerson>();
  for (const application of term.applications) {
    if (!isInTerm(application) || !application.sent) continue;
    const ranked = term.ranked.get(application.uid) ?? [];
    if (placementFor(ranked, term.decisions.get(application.uid) ?? null) !== programme.id) continue;
    people.set(application.uid, {
      uid: application.uid,
      name: nameOnRecord(application),
      week: paintedWeekOf(form.round.availabilityGrid, application),
      facilitates: wouldFacilitate(form, sets, application.sent, programme),
      marked: markedRanges(application.sent.availability, form.round.availabilityGrid),
      groupId: null,
      told: false,
    });
  }
  return { ok: true, arranging: arrangingFrom(form, programme, runId, live, people, minutes, size, true, new Set()) };
}
