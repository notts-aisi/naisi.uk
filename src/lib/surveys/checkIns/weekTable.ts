import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { runThisWeek, weeksOf, type RunRecords } from "@/lib/courses/programmeAttendance";
import { loadToldRegisterMembers } from "@/lib/courses/registerAccess";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { attendanceDocId, type AttendanceStatus } from "@/lib/firestore/courseAttendance";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunStatus } from "@/lib/firestore/courses";
import { SURVEYS_COLLECTION, isCheckIn, normalizeSurvey, type CheckInSurveyDoc } from "@/lib/firestore/surveys";
import { answersOf, isOpen, sentCountOf } from "../repo";
import { checkInSurveyId } from "./ids";
import { checkInWindow, hereOf, openingAt, type CheckInWindow } from "./model";
import { nudgeNeedOf, nudgeRecipients, remindedTodayAt, type NudgeFacts } from "./nudge";
import {
  THIS_WEEK_WORDS as WORDS,
  answeredOfReachedWords,
  closeConfirmWords,
  lateClosesWords,
  openConfirmWords,
  openForWords,
  openUntilWords,
  registerDoneWords,
  remindConfirmWords,
  remindFacilitatorsWords,
  remindedTodayWords,
  sessionWhenWords,
  weekCheckInsTitle,
} from "./words";

/**
 * THIS WEEK'S CHECK-INS, FOR AN ADMIN: the table above the weeks on a
 * programme's Check-ins view, a row for each session of each of the run's
 * groups that still meet in one week, read on the server.
 *
 *  - FOR ADMINS ALONE. The page asks for it only when its gate said the
 *    reader is an admin (`loadProgrammeRun`'s `viewer`), and the programme's
 *    lead never has it: the lead reads check-ins a whole week at a time, and
 *    never a group's alone (docs/surveys.md, "The rules, in one place").
 *  - WHAT A ROW SAYS: the group, when its session was, its register (not
 *    taken, being taken, finished, or that it did not happen), its check-in
 *    (not opened, open until when, closed) and how many answered of how many
 *    it reached, counted as its Results count them. No name, no answer.
 *  - WHAT AN ADMIN CAN DO, each through the route that already does it:
 *    open it for the people the register marks there (the count the open
 *    route asks for, from the same rows: `loadToldRegisterMembers` and
 *    `hereOf`), within its window or LATE until 48 hours after the session
 *    ended (`openingAt`); close it now; and remind the group's facilitators
 *    once a day (`./nudge.ts`). With nobody marked there the row says to take
 *    the register first, with the way to it.
 *
 * Reads: the run's records the page already has, each session's check-in by
 * the id its session gives (no query), each existing check-in's answers to
 * count them, a group's told rows where a check-in can still be opened, and
 * the day's reminder marker. It writes nothing.
 */

/** The run statuses a facilitator is still reminded on: the register jobs' own allowlist. */
const LIVE_STATUSES: readonly CourseRunStatus[] = ["applications-open", "applications-closed", "running"];

/** One session of one group, as the table and the reminder's route both read it. */
export type SessionFacts = {
  group: CourseGroupDoc;
  session: ResolvedSession;
  startsAt: Date | null;
  endsAt: Date | null;
  window: CheckInWindow | null;
  /** Not called off through "Change a session", and not marked on its register as not held. */
  held: boolean;
  finished: boolean;
  /** At least one mark saved on its register. */
  marked: boolean;
  marks: Record<string, AttendanceStatus>;
  ended: boolean;
};

/** Every session of a group in one week (a group may meet twice), with what the clock and its register say. */
export function sessionsInWeek(records: RunRecords, group: CourseGroupDoc, weekNumber: number, now: Date): SessionFacts[] {
  return resolveSessions(records.run, group)
    .filter((session) => session.weekNumber === weekNumber)
    .map((session) => {
      const { startsAt, endsAt } = sessionInstants(session);
      const register = records.registers.get(attendanceDocId(records.run.id, group.id, session.weekNumber, session.occurrence)) ?? null;
      const marks = register?.records ?? {};
      return {
        group,
        session,
        startsAt,
        endsAt,
        window: checkInWindow({ dateKey: session.dateKey, startsAt, endsAt }),
        held: !session.cancelled && (register ? register.held : true),
        finished: register?.pushedAt instanceof Date,
        marked: Object.keys(marks).length > 0,
        marks,
        ended: endsAt !== null && endsAt.getTime() <= now.getTime(),
      };
    });
}

/** Whether facilitators are reminded about this run at all: only while it is live. */
export function remindsOn(records: RunRecords): boolean {
  return LIVE_STATUSES.includes(records.run.status);
}

/** What one row offers an admin. */
export type RowOpen = { late: boolean; people: number; label: string; confirm: string; closes: string | null };
export type RowRemind = { emails: number; label: string; confirm: string };

export type WeekTableRow = {
  /** For a React key: the group and the session. */
  key: string;
  groupId: string;
  sessionKey: string;
  groupName: string;
  /** "Tue 27 Oct, 6pm", or "No date yet". */
  when: string;
  register: string;
  checkIn: string;
  /** "4 of 6", or "" with no check-in. */
  answered: string;
  /** The way to open it, when it can be opened and somebody is marked there. */
  open: RowOpen | null;
  /** The way to the register, when it could be opened and nobody is marked there. */
  takeRegisterFirst: string | null;
  /** Why it cannot be opened, when it is not open and has none: before its start, or too late. */
  note: string | null;
  /** Close it now, while it is open. */
  close: { label: string; confirm: string } | null;
  /** Remind its facilitators, when something they can do is not done and nobody reminded them today. */
  remind: RowRemind | null;
  /** "Facilitators reminded today at 10:15am.", once a press today has gone. */
  reminded: string | null;
};

export type WeekTable = {
  weekNumber: number;
  /** The heading: "This week’s check-ins" for the week the run is in, else "Week 2’s check-ins". */
  title: string;
  /** Every taught week of the run, to choose from. */
  weeks: number[];
  rows: WeekTableRow[];
};

/** The register page of one group, for an admin's link. */
export function registerPath(runId: string, groupId: string): string {
  return `/learn/${encodeURIComponent(runId)}/group/${encodeURIComponent(groupId)}/register`;
}

/**
 * The week a table shows: the one asked for when the run has it, else the week
 * the run is in now, else the latest week a session of which has started,
 * else the first.
 */
export function chosenWeek(records: RunRecords, asked: number | null, now: Date): number {
  const weeks = weeksOf(records);
  if (asked !== null && weeks.includes(asked)) return asked;
  const current = runThisWeek(records.run, now);
  if (current !== null && weeks.includes(current)) return current;
  const begun = weeks.filter((week) =>
    records.groups.some((group) =>
      sessionsInWeek(records, group, week, now).some((facts) => facts.startsAt !== null && facts.startsAt.getTime() <= now.getTime()),
    ),
  );
  return begun.at(-1) ?? weeks[0] ?? 1;
}

/** The check-ins of these sessions, by the ids their sessions give: one read, no query. */
async function checkInsOf(db: Firestore, runId: string, facts: readonly SessionFacts[]): Promise<Map<string, CheckInSurveyDoc>> {
  const out = new Map<string, CheckInSurveyDoc>();
  if (facts.length === 0) return out;
  const snaps = await db.getAll(...facts.map((each) => db.collection(SURVEYS_COLLECTION).doc(checkInSurveyId(runId, each.group.id, each.session.sessionKey))));
  snaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const survey = normalizeSurvey(snap.id, snap.data() ?? {});
    const each = facts[index];
    if (isCheckIn(survey) && survey.audience.groupId === each.group.id) out.set(`${each.group.id}:${each.session.sessionKey}`, survey);
  });
  return out;
}

/** The register's state for one session, in the table's words. */
function registerWords(facts: SessionFacts, scheduled: boolean): string {
  if (!facts.held) return WORDS.notHeld;
  if (facts.finished) return registerDoneWords(scheduled);
  return facts.marked ? WORDS.beingTaken : WORDS.notTaken;
}

export async function readWeekTable(
  db: Firestore,
  input: { records: RunRecords; weekNumber: number | null; now: Date },
): Promise<WeekTable> {
  const { records, now } = input;
  const runId = records.run.id;
  const weekNumber = chosenWeek(records, input.weekNumber, now);
  const current = runThisWeek(records.run, now);
  const facts = records.groups.flatMap((group) => sessionsInWeek(records, group, weekNumber, now));
  const checkIns = await checkInsOf(db, runId, facts);
  const scheduled = records.switches.scheduled;
  const reminds = remindsOn(records);
  // The register's told rows, the people an opening reaches: read once a group, and only where one can be opened.
  const told = new Map<string, Promise<{ uid: string }[]>>();
  const toldOf = (group: CourseGroupDoc) => {
    if (!told.has(group.id)) told.set(group.id, loadToldRegisterMembers(db, runId, group.id).then((roster) => roster.members));
    return told.get(group.id) as Promise<{ uid: string }[]>;
  };

  const rows: WeekTableRow[] = [];
  for (const each of facts) {
    const { group, session } = each;
    const survey = checkIns.get(`${group.id}:${session.sessionKey}`) ?? null;
    const open = survey !== null && isOpen(survey, now);
    const row: WeekTableRow = {
      key: `${group.id}:${session.sessionKey}`,
      groupId: group.id,
      sessionKey: session.sessionKey,
      groupName: group.name,
      when: each.startsAt ? sessionWhenWords(each.startsAt) : WORDS.noDate,
      register: registerWords(each, scheduled),
      checkIn: survey === null ? WORDS.notOpened : open && survey.closesAt ? openUntilWords(survey.closesAt) : WORDS.closed,
      answered: "",
      open: null,
      takeRegisterFirst: null,
      note: null,
      close: null,
      remind: null,
      reminded: null,
    };
    if (survey !== null) {
      const answered = (await answersOf(db, survey)).length;
      const of = sentCountOf(survey);
      row.answered = answeredOfReachedWords(answered, of);
      if (open) row.close = { label: WORDS.closeNow, confirm: closeConfirmWords(answered, of) };
    } else if (each.held && each.window) {
      const opening = openingAt(each.window, now, true);
      if (opening.state === "early") row.note = WORDS.notYet;
      else if (opening.state === "past") row.note = WORDS.tooLate;
      else {
        const here = hereOf(each.marks, await toldOf(group), group.facilitatorUids).length;
        const late = opening.state === "late";
        if (here === 0) row.takeRegisterFirst = WORDS.takeRegisterFirst;
        else {
          row.open = {
            late,
            people: here,
            label: openForWords(here, late),
            confirm: openConfirmWords(here, opening.closesAt, late),
            closes: late ? lateClosesWords(opening.closesAt) : null,
          };
        }
      }
    }
    if (reminds) {
      const need = nudgeNeedOf({ held: each.held, ended: each.ended, finished: each.finished, hasCheckIn: survey !== null, window: each.window }, now);
      if (need) {
        const at = await remindedTodayAt(db, runId, group.id, session.sessionKey, now);
        if (at) row.reminded = remindedTodayWords(at);
        else {
          const recipients = await nudgeRecipients(db, records, group);
          if (recipients.length > 0) {
            row.remind = {
              emails: recipients.length,
              label: remindFacilitatorsWords(recipients.length),
              confirm: remindConfirmWords(group.name, recipients.length, need),
            };
          }
        }
      }
    }
    rows.push(row);
  }
  return {
    weekNumber,
    title: weekNumber === current ? WORDS.title : weekCheckInsTitle(weekNumber),
    weeks: weeksOf(records),
    rows,
  };
}

/** What the reminder's route needs of one session: its facts, what is not done, and who it emails now. */
export type NudgePlan =
  | { state: "none" }
  | { state: "nothing"; facts: SessionFacts }
  | { state: "reminded"; facts: SessionFacts; at: Date }
  | { state: "ready"; facts: SessionFacts; need: NudgeFacts; recipients: Awaited<ReturnType<typeof nudgeRecipients>> };

/**
 * One session's reminder as the route works it out, by the same reads the
 * table draws its button from, so the count the button showed is the count
 * the press emails.
 */
export async function nudgePlanFor(
  db: Firestore,
  input: { records: RunRecords; group: CourseGroupDoc; sessionKey: string; now: Date },
): Promise<NudgePlan> {
  const { records, group, now } = input;
  const session = resolveSessions(records.run, group).find((each) => each.sessionKey === input.sessionKey);
  const facts = session ? sessionsInWeek(records, group, session.weekNumber, now).find((each) => each.session.sessionKey === input.sessionKey) : undefined;
  if (!facts) return { state: "none" };
  if (!remindsOn(records)) return { state: "nothing", facts };
  const survey = (await checkInsOf(db, records.run.id, [facts])).get(`${group.id}:${facts.session.sessionKey}`) ?? null;
  const need = nudgeNeedOf({ held: facts.held, ended: facts.ended, finished: facts.finished, hasCheckIn: survey !== null, window: facts.window }, now);
  if (!need) return { state: "nothing", facts };
  const at = await remindedTodayAt(db, records.run.id, group.id, facts.session.sessionKey, now);
  if (at) return { state: "reminded", facts, at };
  return { state: "ready", facts, need, recipients: await nudgeRecipients(db, records, group) };
}
