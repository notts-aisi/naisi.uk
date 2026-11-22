import { isRegisterUnmarked, type RegisterState } from "@/lib/courses/unmarkedRegisters";
import { runEndOf } from "@/lib/courses/finishing/runEnd";
import { coverIsLive } from "@/lib/courses/registerCover/model";
import { londonDayLabel } from "@/lib/courses/londonLabels";
import { sameName } from "@/lib/courses/groupTimes/rules";
import { cancelDeadline, ownSessionThatWeek } from "@/lib/courses/visit/deadline";
import { registerOwed } from "./restored";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import type { RegisterCover } from "@/lib/firestore/courseAttendance";
import {
  enrolmentHasLeft,
  ownGroupForWeek,
  visitInWeek,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import {
  ARCHIVE_REFUSAL,
  freedOffersWords,
  givenCoverWords,
  lastGroupWords,
  movingLaterWords,
  nameTakenWords,
  runOverWords,
  stillHasPeopleWords,
  unfinishedRegistersWords,
  visitToComeWords,
  type RunOverHow,
} from "./words";

/**
 * WHETHER A GROUP MAY BE ARCHIVED OR RESTORED, as arithmetic.
 *
 * Archiving a group keeps it on the run for the record and takes it out of
 * everything to come: no session, no reminder, no calendar entry, no
 * register its facilitators can take, nothing to be excused from, and no
 * block or row of its own on the Attendance tab. So it is refused, with one
 * sentence, the way to put it right (`ArchiveFix`) and nothing written,
 * while it would silently lose something. In this order, the first that
 * holds answering:
 *
 *  0. THE RUN IS BEING DESTROYED: its groups belong to the destroy.
 *  1. THE RUN IS OVER (`runIsClosed`: completed, cancelled or archived by its
 *     status, or its last session has ended by the clock): its groups stay
 *     as they are for the record, emptied or not.
 *  2. IT IS THE RUN'S LAST GROUP THAT STILL MEETS, on a run under way (its
 *     status says running, or the group's first session has started): the
 *     programme would go on with nowhere to meet. Ending a programme early
 *     is cancelling the cohort, an admin's.
 *  3. ANYBODY STILL HOLDS A PLACE IN IT: a learner's place whose group it is
 *     and who has not left, as the Groups tab counts them.
 *  4. A FREED PLACE OFFERED IN ITS NAME AND NOT ANSWERED: the email named
 *     this group's weekly time.
 *  5. SOMEBODY MOVED TO ANOTHER GROUP FROM A WEEK STILL TO COME is in this
 *     group until then.
 *  6. A ONE-WEEK VISIT to one of its sessions still to come, named with the
 *     visitor and the day; once the call-off's own deadline has passed
 *     (`cancelDeadline`: the visitor's own session that week has started)
 *     it can no longer be called off, and the sentence says so.
 *  7. ONE OF ITS SESSIONS NOT CALLED OFF IS GIVEN TO SOMEBODY TO COVER and
 *     the cover still holds (`coverIsLive`): they were emailed that it is
 *     theirs. Nothing takes a given session back; moving it or calling it
 *     off under Change this week ends it, and nothing tells them.
 *  8. A REGISTER OF A SESSION THAT HAS STARTED, IN A WEEK SOMEBODY'S PLACE
 *     NAMES FOR THIS GROUP, is neither finished nor marked as not having
 *     happened (`isRegisterUnmarked`, the register chase's own test).
 *
 * Restoring is refused while the run is being destroyed or is over, and
 * while another group of the run that still meets has its name. A
 * facilitator who now holds a place in another group of the run, or in no
 * group (a facilitator who holds a place sits in the group they facilitate
 * and no other) is no reason to refuse: the group comes back without them, taken
 * off through the one writer of a group's facilitators, and the question
 * says so before the press (`restorePlan`).
 *
 * Pure: no reads, and no clock but the one passed.
 */

/** A person a sentence names, as the reader may see them, and their first name for "Agnes’s page". */
export type NamedPerson = { name: string; firstName: string };

/** Everything the two decisions read, as `read.ts` reads it (in the press's transaction, the second time). */
export type GroupArchiveFacts = {
  group: CourseGroupDoc;
  /** The group's run, or null when the group names none that is there. */
  run: CourseRunDoc | null;
  /** The run is being destroyed. */
  destroying: boolean;
  /** The programme naming the run by its short name, else the run's course title. */
  programmeName: string;
  /** Every group of the run, archived ones and this one included. */
  runGroups: readonly CourseGroupDoc[];
  /** Every place on the run, of every role and status. */
  places: readonly CourseEnrolmentDoc[];
  /** This group's registers of the sessions that have started, by session key. Absent is a register nobody opened. */
  registers: ReadonlyMap<string, RegisterState>;
  /** The cover each of this group's registers holds, by session key, for the sessions not called off. */
  covers: ReadonlyMap<string, RegisterCover>;
  /** Freed places offered in this group's name and not answered yet (`freedPlace.groupId`, an invitation standing). */
  freedOffers: number;
  /** The people a sentence may name (visitors, whoever covers, the group's facilitators), by uid. */
  names: ReadonlyMap<string, NamedPerson>;
};

/** The way the page offers to put a refusal right, beside its sentence. */
export type ArchiveFix =
  /** Move them: People in groups. */
  | { kind: "people" }
  /** Finish the register: that session's register. */
  | { kind: "register"; weekNumber: number; sessionKey: string }
  /** Call the visit off: the visitor's page under the programme. */
  | { kind: "person"; uid: string; firstName: string }
  /** Change this week: that week on the group's own page. */
  | { kind: "week"; weekNumber: number };

/** A refused press: its one sentence, and the way to put it right where there is one. */
export type ArchiveRefusal = { error: string; fix: ArchiveFix | null };

const refused = (error: string, fix: ArchiveFix | null = null): ArchiveRefusal => ({ error, fix });

/**
 * A run that takes no move any more: over, cancelled or archived. The same
 * three as the staff move's own refusal (`runMoveRefusal` in
 * `src/lib/courses/staffMove/plan.ts`).
 */
export function runTakesNoMove(run: Pick<CourseRunDoc, "status" | "archived">): boolean {
  return run.status === "completed" || run.status === "cancelled" || run.archived;
}

/** A learner's place on this group's run who has not left. */
function stillOnRun(place: CourseEnrolmentDoc, runId: string): boolean {
  return place.runId === runId && place.role === "learner" && !enrolmentHasLeft(place.status);
}

/** The places whose group is this one: the Groups tab's count. */
export function placesInGroup(facts: Pick<GroupArchiveFacts, "group" | "places">): CourseEnrolmentDoc[] {
  const { group } = facts;
  return facts.places.filter((place) => stillOnRun(place, group.runId) && place.groupId === group.id);
}

/** The group's sessions that have started and were not called off: the ones whose registers are asked about. */
export function startedSessions(run: CourseRunDoc, group: CourseGroupDoc, now: Date): ResolvedSession[] {
  return resolveSessions(run, group).filter((session) => {
    if (session.cancelled) return false;
    const { startsAt } = sessionInstants(session);
    return startsAt !== null && startsAt.getTime() <= now.getTime();
  });
}

/**
 * The group's sessions still to come, called-off ones left out. A session
 * that cannot be dated is counted as still to come: nobody can say it has met.
 */
function sessionsToCome(run: CourseRunDoc, group: CourseGroupDoc, now: Date): ResolvedSession[] {
  return resolveSessions(run, group).filter((session) => {
    if (session.cancelled) return false;
    const { startsAt } = sessionInstants(session);
    return startsAt === null || startsAt.getTime() > now.getTime();
  });
}

const sortedWeeks = (weeks: Iterable<number>) => [...new Set(weeks)].sort((a, b) => a - b);

/**
 * A run that is over for archiving's purpose: one that takes no move by its
 * status (`runTakesNoMove`), or whose last session has ended by the clock
 * (`runEndOf`), which is how a term ends whatever its status says, since
 * nothing moves a run to completed by itself.
 */
export function runIsClosed(run: CourseRunDoc, runGroups: readonly CourseGroupDoc[], now: Date): boolean {
  return runTakesNoMove(run) || runEndOf(run, runGroups, now).over;
}

/** Why the run is over, for its sentence: its status when that says so, else the clock. */
export function runOverHow(run: CourseRunDoc): RunOverHow {
  if (run.archived) return "archived";
  if (run.status === "completed") return "completed";
  if (run.status === "cancelled") return "cancelled";
  return "last-session";
}

/** The run's other groups that still meet. */
function otherLiveGroups(facts: Pick<GroupArchiveFacts, "group" | "runGroups">): CourseGroupDoc[] {
  const { group } = facts;
  return facts.runGroups.filter((each) => each.id !== group.id && !each.archived && each.runId === group.runId);
}

/** A run under way: its status says running, or the group's first session has started. */
function underWay(run: CourseRunDoc, group: CourseGroupDoc, now: Date): boolean {
  return run.status === "running" || startedSessions(run, group, now).length > 0;
}

/** "Fri 20 Nov", the London day a session starts on, or "" for one with no date. */
function dayOf(session: ResolvedSession | null | undefined): string {
  const startsAt = session ? sessionInstants(session).startsAt : null;
  return startsAt ? londonDayLabel(startsAt) : "";
}

/** Why archiving the group would lose something, with the way to put it right, or null when it may be archived. */
export function archiveRefusal(facts: GroupArchiveFacts, now: Date): ArchiveRefusal | null {
  const { group, run } = facts;
  if (facts.destroying) return refused(ARCHIVE_REFUSAL.destroying);
  if (run && runIsClosed(run, facts.runGroups, now)) return refused(runOverWords(facts.programmeName, runOverHow(run)));
  if (run && otherLiveGroups(facts).length === 0 && underWay(run, group, now)) {
    return refused(lastGroupWords(group.name, facts.programmeName));
  }

  const inGroup = placesInGroup(facts).length;
  if (inGroup > 0) {
    const facilitating = placesInGroup(facts).filter((place) => group.facilitatorUids.includes(place.uid)).length;
    return refused(stillHasPeopleWords(group.name, inGroup, facilitating), { kind: "people" });
  }

  // A freed place offered in this group's name and not answered: the email
  // named this group's weekly time, and the board could not seat them in it.
  if (facts.freedOffers > 0) return refused(freedOffersWords(group.name, facts.freedOffers));

  // A group that names no run that is there has no sessions to lose.
  if (!run) return null;

  const toCome = sessionsToCome(run, group, now);
  const weeksToCome = sortedWeeks(toCome.map((session) => session.weekNumber));
  const elsewhere = facts.places.filter((place) => stillOnRun(place, group.runId) && place.groupId !== group.id);

  const movingLater = new Set<string>();
  const movingWeeks: number[] = [];
  for (const place of elsewhere) {
    for (const week of weeksToCome) {
      if (ownGroupForWeek(place, week) !== group.id) continue;
      movingLater.add(place.uid);
      movingWeeks.push(week);
    }
  }
  if (movingLater.size > 0) return refused(movingLaterWords(group.name, movingLater.size, sortedWeeks(movingWeeks)));

  // The first visit still to come, by week and then by name: one is named,
  // and the next press names the next.
  const visits = elsewhere
    .flatMap((place) =>
      weeksToCome.filter((week) => visitInWeek(place, week)?.groupId === group.id).map((week) => ({ place, week })),
    )
    .sort(
      (a, b) =>
        a.week - b.week || (facts.names.get(a.place.uid)?.name ?? "").localeCompare(facts.names.get(b.place.uid)?.name ?? "") || a.place.uid.localeCompare(b.place.uid),
    );
  const visit = visits[0];
  if (visit) {
    const hosted = toCome.find((session) => session.weekNumber === visit.week && session.occurrence === 1) ?? toCome.find((session) => session.weekNumber === visit.week);
    // Whether staff can still call it off: the call-off's own deadline
    // (`cancelDeadline`, with `ownSessionThatWeek`: a visitor's own session
    // called off, or a home group archived, is no session, and the host's
    // session is then the deadline). This group's session is still to come.
    const home = facts.runGroups.find((each) => each.id === ownGroupForWeek(visit.place, visit.week)) ?? null;
    const deadline = cancelDeadline({ host: group, hostSession: hosted ?? null, home, ownSession: ownSessionThatWeek(run, home, visit.week) });
    const callable = deadline.until === null || now.getTime() < deadline.until.getTime();
    const person = facts.names.get(visit.place.uid) ?? { name: "", firstName: "" };
    return refused(
      visitToComeWords({
        visitorName: person.name,
        visitorFirstName: person.firstName,
        name: group.name,
        weekNumber: visit.week,
        dayLabel: dayOf(hosted),
        callable,
      }),
      callable ? { kind: "person", uid: visit.place.uid, firstName: person.firstName || person.name } : null,
    );
  }

  // A session not called off, given to somebody to cover, while it is theirs.
  for (const session of resolveSessions(run, group)) {
    if (session.cancelled) continue;
    const cover = facts.covers.get(session.sessionKey) ?? null;
    if (!cover || cover.kind !== "given" || !coverIsLive(cover, now)) continue;
    const { startsAt } = sessionInstants(session);
    const started = startsAt !== null && startsAt.getTime() <= now.getTime();
    const holder = facts.names.get(cover.byUid) ?? { name: "", firstName: "" };
    return refused(
      givenCoverWords({ name: group.name, weekNumber: session.weekNumber, holderName: holder.name, holderFirstName: holder.firstName, started }),
      started ? null : { kind: "week", weekNumber: session.weekNumber },
    );
  }

  // Only the weeks somebody's place still names for this group, as the week
  // they belonged to it or a visit to it: once nobody holds a place in it,
  // an archived group's register is read for nobody else, so a session that
  // met with nobody due at it loses nothing.
  const started = startedSessions(run, group, now);
  const named = new Set<number>();
  for (const session of started) {
    if (elsewhere.some((place) => ownGroupForWeek(place, session.weekNumber) === group.id || visitInWeek(place, session.weekNumber)?.groupId === group.id)) {
      named.add(session.weekNumber);
    }
  }
  const unfinished = started
    .filter((session) => named.has(session.weekNumber))
    // A session that passed while the group was archived before owes no register (`registerOwed`).
    .filter((session) => registerOwed(group, sessionInstants(session).startsAt))
    .filter((session) => isRegisterUnmarked(facts.registers.get(session.sessionKey) ?? { exists: false, held: true, pushedAt: null }));
  if (unfinished.length > 0) {
    const first = unfinished[0];
    return refused(unfinishedRegistersWords(group.name, sortedWeeks(unfinished.map((session) => session.weekNumber))), {
      kind: "register",
      weekNumber: first.weekNumber,
      sessionKey: first.sessionKey,
    });
  }

  return null;
}

/** What restoring the group would do: refused with a sentence, or allowed, saying who comes off its facilitators. */
export type RestorePlan =
  | { ok: false; refusal: ArchiveRefusal }
  | {
      ok: true;
      /** Facilitators who now hold a place in another group of the run: taken off as it comes back. */
      dropping: { uid: string; groupId: string }[];
      /** The facilitators it keeps. */
      staying: string[];
    };

/** Whether the group may be restored, and what that takes off it. */
export function restorePlan(facts: GroupArchiveFacts, now: Date): RestorePlan {
  const { group, run } = facts;
  if (facts.destroying) return { ok: false, refusal: refused(ARCHIVE_REFUSAL.destroying) };
  if (run && runIsClosed(run, facts.runGroups, now)) return { ok: false, refusal: refused(runOverWords(facts.programmeName, runOverHow(run))) };
  // Add a group lets a new group take an archived group's name.
  if (otherLiveGroups(facts).some((each) => sameName(each.name, group.name))) {
    return { ok: false, refusal: refused(nameTakenWords(group.name)) };
  }

  // A facilitator who holds a place sits in the group they facilitate and no
  // other: one who now holds a place in another group, or in no group, comes
  // off (`groupId` "" for no group).
  const dropping: { uid: string; groupId: string }[] = [];
  for (const uid of group.facilitatorUids) {
    const place = facts.places.find((each) => each.uid === uid && stillOnRun(each, group.runId) && each.groupId !== group.id);
    if (place) dropping.push({ uid, groupId: typeof place.groupId === "string" ? place.groupId : "" });
  }
  const gone = new Set(dropping.map((each) => each.uid));
  return { ok: true, dropping, staying: group.facilitatorUids.filter((uid) => !gone.has(uid)) };
}
