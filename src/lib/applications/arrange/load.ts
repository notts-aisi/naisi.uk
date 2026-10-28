import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { wouldFacilitate } from "@/lib/courses/facilitatorAsks/rules";
import { nextGroupName, sharedPlaces } from "@/lib/courses/groupTimes/rules";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import { canRunTerm } from "../access";
import { isInTerm } from "../decisions";
import { placeHoldersOn } from "../handover/holders";
import { paintedWeekOf } from "../handover/paintedWeek";
import { RUNS_COLLECTION, readRun } from "../handover/run";
import { defaultLength, hasSessionTime, lengthFromGroups, lengthOptions, pickLength, timesPicture, WEEK_FROM_MONDAY } from "../handover/times";
import { groupsOf, type LiveGroup } from "../handover/timesLoad";
import { own } from "../keys";
import { loadForm, loadQuestionSets } from "../repo";
import { NOT_FOUND, refuse } from "../review/refusals";
import type { Refusal } from "../review/types";
import { listDecisions, listSentApplications } from "../staffRepo";
import { planGroups, type ArrangePerson, type CandidateTime, type Plan } from "./plan";

/**
 * EVERYTHING AN ARRANGEMENT IS WORKED OUT FROM, for an admin.
 *
 * The same reads the Times view makes (`../handover/timesLoad.ts`), in the
 * same order, by the same helpers: the form, the programme's run and its
 * groups, then, once decisions have gone out, the people holding a place
 * and the week each painted, read only through `paintedWeekOf`. Then the
 * run's seats, for who is in which group now and who has been told. Then
 * `planGroups`.
 *
 * Only an admin: what follows asks Claude about named people, and Claude's
 * reads are an admin's (`../assessment/run.ts`).
 */

export const DEFAULT_GROUP_SIZE = 8;

export type Arranging = {
  runId: string;
  programmeName: string;
  minutes: number;
  size: number;
  /** Everybody holding a place, by account id. */
  people: Map<string, ArrangePerson>;
  /** The run's live groups, by id. */
  groups: Map<string, LiveGroup>;
  plan: Plan;
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
  const minutes = pickLength(wanted.minutes, options, defaultLength(lengthFromGroups(live)));
  const askedSize = Number(wanted.size);
  const size = Number.isInteger(askedSize) && askedSize >= 2 && askedSize <= 30 ? askedSize : groupSizeOf(programme.groupSize, live);

  const [applications, decisions, sets, seats] = await Promise.all([
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
    loadQuestionSets(db, form.round.id),
    // One equality on one field, so no declared index: every seat on the run.
    db.collection("courseEnrolments").where("runId", "==", runId).get(),
  ]);
  const inTerm = applications.filter(isInTerm);
  const byUid = new Map(inTerm.map((application) => [application.uid, application] as const));
  const seatOf = new Map<string, { groupId: string | null; told: boolean }>();
  for (const doc of seats.docs) {
    const seat = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
    if (seat.status !== "active") continue;
    seatOf.set(seat.uid, { groupId: seat.groupId ?? null, told: Boolean(seat.allocatedEmailAt) });
  }

  const people = new Map<string, ArrangePerson>();
  for (const holder of placeHoldersOn(form, programme.id, inTerm, decisions)) {
    const application = byUid.get(holder.uid) ?? null;
    const seat = seatOf.get(holder.uid);
    people.set(holder.uid, {
      uid: holder.uid,
      name: holder.name,
      week: paintedWeekOf(form.round.availabilityGrid, application),
      facilitates: application?.sent ? wouldFacilitate(form, sets, application.sent, programme) : false,
      groupId: seat?.groupId ?? null,
      told: seat?.told ?? false,
    });
  }

  // Every start time anybody can make, most people first: the picture's own count.
  const picture = timesPicture({
    grid: form.round.availabilityGrid,
    minutes,
    people: [...people.values()].map((person) => ({ uid: person.uid, name: person.name, week: person.week })),
    groups: live,
  });
  const best: (CandidateTime & { count: number })[] = [];
  picture.rows.forEach((start, row) => {
    WEEK_FROM_MONDAY.forEach((weekday, column) => {
      const count = picture.counts[row]?.[column] ?? 0;
      if (count > 0) best.push({ weekday, start, count });
    });
  });
  best.sort((a, b) => b.count - a.count || WEEK_FROM_MONDAY.indexOf(a.weekday) - WEEK_FROM_MONDAY.indexOf(b.weekday) || a.start - b.start);

  const plan = planGroups({
    people: [...people.values()],
    groups: live.map((group) => ({
      id: group.id,
      name: group.name,
      session: hasSessionTime(group.session) ? group.session : null,
      capacity: group.capacity,
    })),
    best,
    minutes,
    size,
    names: (taken) => nextGroupName([...taken]),
  });

  return {
    ok: true,
    arranging: {
      runId,
      programmeName: programme.name,
      minutes,
      size,
      people,
      groups: new Map(live.map((group) => [group.id, group])),
      plan,
    },
  };
}
