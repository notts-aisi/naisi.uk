import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import {
  nextWeekEmailMarkerId,
  readNextWeekEmail,
} from "@/lib/courses/nextWeekEmail";
import {
  londonDayAndClock,
  nextWeekEmailTiming,
  sessionLine,
} from "@/lib/courses/registerChase";
import { firstNameOfUser, readRunLead, standingUserOf } from "@/lib/courses/programmeLead";
import { sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import {
  courseNudgeSessionWhere,
  missingNudgeValueWords,
  resolveCourseNudgeTemplate,
} from "@/lib/email/courseNudgeEmail";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { readCoursesConfig } from "@/lib/firestore/config";
import { sessionModeForWeek, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { readSchedulerConfig } from "@/lib/firestore/schedulerConfig";
import { registerSwitchesIn } from "@/lib/scheduler/registerSwitches";

/**
 * WHAT A REGISTER'S PAGE SAYS ABOUT HOW IT ENDS (wk-register): the values
 * behind the words under its button, every one read from a record.
 *
 * The page words them (`src/features/courses/registerEndingWords.ts`); this
 * reads what they need, through the same functions the push route and the
 * jobs act on, so the page cannot promise what they will not do:
 *
 *  - which button it is, from the next-week email's switch;
 *  - the session the button finishes, and its day, time and room;
 *  - when next week's email goes, from the same timing the job keeps, and
 *    whether it has gone, from the same claim the job and the push take;
 *  - who is reminded and who gets a task, from those jobs' switches, the
 *    group's facilitators and the run's lead, each held to the bar their
 *    role is appointed behind.
 *
 * Names are first names only, and only of people this page's reader already
 * works with: the group's own facilitators and the programme's lead.
 */

/** Where next week's email stands, for the session after the one on the page. */
export type NextEmailLine =
  /** Still ahead: the board's own sentence. */
  | { state: "goes"; at: string }
  /** It has gone, at this time. */
  | { state: "went"; at: string }
  /** Due, and waiting for its week to be published. */
  | { state: "waiting-for-week"; weekNumber: number }
  /** Due, and held because a value it uses is empty. */
  | { state: "held"; missing: string[] }
  /** Due and whole: the next tick sends it. */
  | { state: "shortly" }
  /** The session it was about has started without it. */
  | { state: "missed"; weekNumber: number };

export type RegisterEnding = {
  /** True when next week's email is on its schedule: "Finish the register", nobody emailed. */
  scheduled: boolean;
  groupName: string;
  /**
   * The session the foot of the register is about: the latest that has
   * started and is not finished, or else the latest finished one. Null before
   * any session has started.
   */
  focus: {
    sessionKey: string;
    weekNumber: number;
    occurrence: number;
    /** "Tue 17 Nov · 6pm · Room C20". */
    line: string;
    finished: boolean;
  } | null;
  /** True when the focus session has a session after it. */
  hasNext: boolean;
  /** Next week's email for the session after the focus. Only while it is on its schedule. */
  nextEmail: NextEmailLine | null;
  /** The facilitators' reminder, when its job is on and the group has facilitators. */
  reminder: { hours: number; names: string[] } | null;
  /** The lead's and admins' task, when its job is on. "" when the run has no lead. */
  task: { hours: number; leadName: string } | null;
};

/** One column of the register, as the GET route already holds it. */
export type EndingColumn = { session: ResolvedSession; finished: boolean };

/** The latest session by its start that passes `keep`, or null. */
function latest(
  columns: readonly EndingColumn[],
  keep: (column: EndingColumn, startsAt: Date) => boolean,
): { column: EndingColumn; startsAt: Date } | null {
  let best: { column: EndingColumn; startsAt: Date } | null = null;
  for (const column of columns) {
    const { startsAt } = sessionInstants(column.session);
    if (!startsAt || !keep(column, startsAt)) continue;
    if (!best || startsAt.getTime() > best.startsAt.getTime()) best = { column, startsAt };
  }
  return best;
}

/** The first names of a group's facilitators who still stand behind the role. */
async function facilitatorNames(db: Firestore, group: CourseGroupDoc): Promise<string[]> {
  const uids = [...new Set(group.facilitatorUids)];
  if (uids.length === 0) return [];
  const snaps = await db.getAll(...uids.map((uid) => db.collection("users").doc(uid)));
  const names: string[] = [];
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const person = standingUserOf(snap.id, data);
    if (!isNamedWithStanding(person, "courseGroups.facilitatorUids", group.facilitatorUids)) continue;
    const name = firstNameOfUser(data);
    if (name) names.push(name);
  }
  return names;
}

/** A stored instant, from a Timestamp or a Date, or null. */
function instantOf(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date } | null | undefined;
  return stamp && typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

export async function readRegisterEnding(
  db: Firestore,
  args: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    /** Every session the group holds, in order. */
    sessions: readonly ResolvedSession[];
    /** The register's columns, with whether each is finished. */
    columns: readonly EndingColumn[];
    now: Date;
  },
): Promise<RegisterEnding> {
  const { run, group, sessions, columns, now } = args;
  const [config, scheduler] = await Promise.all([readCoursesConfig(db), readSchedulerConfig(db)]);
  const switches = registerSwitchesIn(scheduler);

  const target = latest(columns, (column, startsAt) => !column.finished && startsAt <= now);
  const done = target ? null : latest(columns, (column) => column.finished);
  const pick = target ?? done;

  let focus: RegisterEnding["focus"] = null;
  let nextSession: ResolvedSession | null = null;
  if (pick) {
    const { session } = pick.column;
    const where = courseNudgeSessionWhere(session.session, sessionModeForWeek(group, session.weekId));
    focus = {
      sessionKey: session.sessionKey,
      weekNumber: session.weekNumber,
      occurrence: session.occurrence,
      line: sessionLine(pick.startsAt, where),
      finished: pick.column.finished,
    };
    const index = sessions.findIndex((s) => s.sessionKey === session.sessionKey);
    nextSession = index >= 0 ? (sessions[index + 1] ?? null) : null;
  }

  let nextEmail: NextEmailLine | null = null;
  const next = nextSession;
  if (switches.scheduled && next) {
    const index = sessions.findIndex((s) => s.sessionKey === next.sessionKey);
    const timing = nextWeekEmailTiming(sessions, index, config.nextWeekEmailDaysBefore, now);
    const markerId = nextWeekEmailMarkerId(run.id, group.id, next);
    const marker = markerId ? await db.collection("courseNudges").doc(markerId).get() : null;
    const sentAt = marker?.exists ? instantOf(marker.data()?.sentAt) : null;
    if (marker?.exists) {
      nextEmail = sentAt ? { state: "went", at: londonDayAndClock(sentAt) } : null;
    } else if (timing.state === "waiting") {
      nextEmail = { state: "goes", at: londonDayAndClock(timing.sendAt) };
    } else if (timing.state === "past") {
      nextEmail = { state: "missed", weekNumber: next.weekNumber };
    } else if (timing.state === "due") {
      const reading = await readNextWeekEmail(db, {
        run,
        group,
        session: next,
        template: await resolveCourseNudgeTemplate(db),
        feedbackUrl: config.weeklyFeedbackUrl,
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
      });
      if (!reading.published) {
        nextEmail = { state: "waiting-for-week", weekNumber: next.weekNumber };
      } else if (reading.missing.length > 0) {
        nextEmail = {
          state: "held",
          missing: missingNudgeValueWords(reading.missing, next.weekNumber),
        };
      } else {
        nextEmail = { state: "shortly" };
      }
    }
  }

  const [names, lead] = await Promise.all([
    switches.remindersOn ? facilitatorNames(db, group) : Promise.resolve([] as string[]),
    switches.tasksOn ? readRunLead(db, run.id) : Promise.resolve(null),
  ]);

  return {
    scheduled: switches.scheduled,
    groupName: group.name,
    focus,
    hasNext: nextSession !== null,
    nextEmail,
    // The job skips a group with nobody facilitating it, so the page does too.
    reminder:
      switches.remindersOn && group.facilitatorUids.length > 0
        ? { hours: config.unmarkedRegisterGraceHours, names }
        : null,
    task: switches.tasksOn ? { hours: config.registerTaskHours, leadName: lead?.firstName ?? "" } : null,
  };
}
