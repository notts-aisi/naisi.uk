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
import { readPushEmails, sessionAfter, type PushEmailLine } from "@/lib/courses/pushEmail";
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
 *  - what pressing the button of each register on the page emails, from the
 *    push's own decision (`src/lib/courses/pushEmail.ts`), which the foot and
 *    the confirm in front of the button both put into words;
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
   * started and is not finished, or else the latest finished one. Never a
   * session cancelled through "Change a session": it met nobody, so its
   * register is nobody's to finish, as the jobs that chase registers read it.
   * Null before any session has started.
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
  /**
   * What pressing the button of each register that is not finished yet emails,
   * by session key: the focus's, and every other column's, since each column
   * has its own button. One answer, from the push's own decision
   * (`readPushEmails`), so the foot, the confirm and the push agree.
   */
  pushEmails: Record<string, PushEmailLine>;
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

/**
 * WHERE NEXT WEEK'S EMAIL STANDS FOR ONE SESSION, while the email is on its
 * schedule: gone (the claim the job and the push take is there), still ahead,
 * due and waiting for its week, held for an empty value, about to go, or
 * missed because its session started first. One answer for the register's
 * foot and for the facilitator's Home, from the same timing the job keeps
 * and the same claim it takes. Null for a claim that holds no time.
 */
export async function nextEmailLineFor(
  db: Firestore,
  args: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    /** Every session the group holds, in order. */
    sessions: readonly ResolvedSession[];
    /** The session the email is about. */
    session: ResolvedSession;
    config: { nextWeekEmailDaysBefore: number; weeklyFeedbackUrl: string };
    now: Date;
  },
): Promise<NextEmailLine | null> {
  const { run, group, sessions, session, config, now } = args;
  const index = sessions.findIndex((s) => s.sessionKey === session.sessionKey);
  const timing = nextWeekEmailTiming(sessions, index, config.nextWeekEmailDaysBefore, now);
  const markerId = nextWeekEmailMarkerId(run.id, group.id, session);
  const marker = markerId ? await db.collection("courseNudges").doc(markerId).get() : null;
  const sentAt = marker?.exists ? instantOf(marker.data()?.sentAt) : null;
  if (marker?.exists) return sentAt ? { state: "went", at: londonDayAndClock(sentAt) } : null;
  if (timing.state === "waiting") return { state: "goes", at: londonDayAndClock(timing.sendAt) };
  if (timing.state === "past") return { state: "missed", weekNumber: session.weekNumber };
  if (timing.state !== "due") return null;
  const reading = await readNextWeekEmail(db, {
    run,
    group,
    session,
    template: await resolveCourseNudgeTemplate(db),
    feedbackUrl: config.weeklyFeedbackUrl,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
  });
  if (!reading.published) return { state: "waiting-for-week", weekNumber: session.weekNumber };
  if (reading.missing.length > 0) {
    return { state: "held", missing: missingNudgeValueWords(reading.missing, session.weekNumber) };
  }
  return { state: "shortly" };
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

  const target = latest(
    columns,
    (column, startsAt) => !column.finished && !column.session.cancelled && startsAt <= now,
  );
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
    nextSession = sessionAfter(sessions, session.sessionKey);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const pushEmails = await readPushEmails(db, {
    run,
    group,
    sessions,
    sessionKeys: columns.filter((column) => !column.finished).map((column) => column.session.sessionKey),
    scheduled: switches.scheduled,
    config,
    appUrl,
  });

  const nextEmail: NextEmailLine | null =
    switches.scheduled && nextSession
      ? await nextEmailLineFor(db, { run, group, sessions, session: nextSession, config, now })
      : null;

  const [names, lead] = await Promise.all([
    switches.remindersOn ? facilitatorNames(db, group) : Promise.resolve([] as string[]),
    switches.tasksOn ? readRunLead(db, run.id) : Promise.resolve(null),
  ]);

  return {
    scheduled: switches.scheduled,
    groupName: group.name,
    focus,
    hasNext: nextSession !== null,
    pushEmails,
    nextEmail,
    // The job skips a group with nobody facilitating it, so the page does too.
    reminder:
      switches.remindersOn && group.facilitatorUids.length > 0
        ? { hours: config.unmarkedRegisterGraceHours, names }
        : null,
    task: switches.tasksOn ? { hours: config.registerTaskHours, leadName: lead?.firstName ?? "" } : null,
  };
}
