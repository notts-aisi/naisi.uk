/**
 * THE WORDS OF THE OLDER COURSE EDITOR WHILE IT IS RETIRED (`/admin/courses`).
 *
 * Its jobs are moving to each programme's own pages. Until the last one has
 * moved, the older pages stay, and these are the words that point the way
 * and that stand where a risky control used to: the line at the top of every
 * older page, a group card's room, campus and link once a programme names
 * the run, the question before a run's status moves, a week that stays
 * published once it is in use, and a copy that cannot replace weeks people
 * have started.
 *
 * Pure: a client component and a server route share this file.
 */

import type { CourseEnrolMode, CourseRunStatus } from "@/lib/firestore/courses";
import { COURSE_RUN_STATUS_LABEL } from "@/lib/firestore/courses";

// ---------------------------------------------------------------------------
// The line at the top of every older page
// ---------------------------------------------------------------------------

export const RETIRING_LINE =
  "This editor is being retired. Groups, weeks and the run’s settings are on each programme’s own pages now.";

/** "Open AGI Strategy", to the programme's Overview; "Open the programme" when it has no short name. */
export function openProgrammeWords(name: string | null): string {
  const said = (name ?? "").trim();
  return said ? `Open ${said}` : "Open the programme";
}

// ---------------------------------------------------------------------------
// A group card on a run a programme names
// ---------------------------------------------------------------------------

export const CAMPUS_AND_LOCATION = "Campus and location";
export const MEETING_LINK = "Meeting link";

/** Under the room, the campus and the link on a run no programme names, to everybody but an admin. */
export const ONLY_AN_ADMIN_HERE = "Only an admin can change these here.";

/** In place of the card's Archived switch. */
export function archiveOnGroupPageWords(groupName: string): string {
  return `Archive and restore are on ${groupName}’s page.`;
}

/** The link after it. */
export function openGroupPageWords(groupName: string): string {
  return `Open ${groupName}’s page`;
}

/** In place of the older New group form. */
export const ADD_GROUPS_ON_TIMES =
  "Add groups on the programme’s Times view, which checks the name and the length.";
export const OPEN_TIMES = "Open Times";

// ---------------------------------------------------------------------------
// The week plan on a run a programme names
// ---------------------------------------------------------------------------

/** In place of the older week plan builder. */
export const WEEK_PLAN_ON_WEEKS =
  "The week plan changes on the programme’s Weeks tab, which keeps every week at its own number’s address.";
export const OPEN_WEEKS = "Open Weeks";

// ---------------------------------------------------------------------------
// The run's status: a question before it acts
// ---------------------------------------------------------------------------

/** "Move AGI Strategy, Autumn 2026 to Completed?" */
export function statusQuestionTitle(name: string, runLabel: string, next: CourseRunStatus): string {
  const who = [name.trim(), runLabel.trim()].filter(Boolean).join(", ") || "this run";
  return `Move ${who} to ${COURSE_RUN_STATUS_LABEL[next]}?`;
}

/**
 * What a move changes, as one paragraph, for every move the run editor's
 * select offers (`ALLOWED_TRANSITIONS` less Cancelled, which lives in the
 * danger zone). Every move is forward only, so every one ends "It can’t be
 * moved back." Null for a move the select never offers.
 *
 * What each is true because of:
 *  - Draft to Applications open: a draft run's document is unreadable to
 *    members (firestore.rules, courseRuns), its groups are not in a
 *    facilitator's My programmes (facilitatingMenu.ts), the weekly jobs scan
 *    Applications open, Applications closed and Running only (nextWeekEmail,
 *    weekReminders, registerReminders, unmarkedRegisters,
 *    surveyCheckInReminders). An admin's hand-over to a draft starts it
 *    running (handover/handOver.ts), so on a run a programme names, people
 *    can be handed over to it from either.
 *  - Draft to Running: the same as leaving draft for Applications open, and
 *    the run moves up each member's list (below); a run's own application
 *    form takes applications only in Applications open, so nothing opens
 *    for it, while sign-ups to an open-enrolment run go on in all three
 *    live statuses.
 *  - The run's own application form: a run a programme names takes no
 *    application through it at any status (`apply/route.ts`, before the
 *    window is read), so on such a run no sentence speaks of it. On any
 *    other admissions run it takes applications only in Applications open
 *    (window.ts). Sign-ups to an open-enrolment run, which no programme can
 *    name, go on in all three live statuses (enrolWindow.ts).
 *  - Into Running: a member's list of programmes ranks a running run above
 *    one whose applications are open or closed, and orders running runs by
 *    their label (`/api/courses/me`, STATUS_RANK), so the run moves up it.
 *  - Running to Completed: the weekly jobs and the My work mirror stop
 *    (sync-tasks), the groups leave My programmes (facilitatingMenu.ts), the
 *    hand-over refuses (handover/run.ts) and so does moving staff
 *    (staffMove/plan.ts).
 */
export function statusQuestionBody(
  from: CourseRunStatus,
  next: CourseRunStatus,
  enrolMode: CourseEnrolMode,
  namedByProgramme: boolean,
): string | null {
  const open = enrolMode === "open" && !namedByProgramme;
  const ownForm = enrolMode !== "open" && !namedByProgramme;
  const back = "It can’t be moved back.";
  const movesUp = "the run moves up each member’s list of programmes, with any other running ones";
  if (from === "draft" && next === "applications-open") {
    const opens = open
      ? ", and sign-ups open on the dates set below"
      : ownForm
        ? ", and its own application form opens on the dates set below"
        : ", and people can be handed over to it";
    return `Members can see it, its groups join each facilitator’s My programmes, the weekly emails and reminders start${opens}. ${back}`;
  }
  if (from === "draft" && next === "running") {
    const opens = open
      ? ", sign-ups open on the dates set below"
      : ownForm
        ? ", its own application form never opens"
        : "";
    return `Members can see it, its groups join each facilitator’s My programmes, the weekly emails and reminders start${opens}, and ${movesUp}. ${back}`;
  }
  if (from === "applications-open" && next === "applications-closed") {
    if (open) return `Sign-ups stay open on the dates set below, and the weekly emails and reminders go on. ${back}`;
    if (ownForm) return `Its own application form stops taking applications. The weekly emails and reminders go on. ${back}`;
    return `The weekly emails and reminders go on. ${back}`;
  }
  if (from === "applications-open" && next === "running") {
    if (open) return `Sign-ups stay open on the dates set below, the weekly emails and reminders go on, and ${movesUp}. ${back}`;
    if (ownForm) return `Its own application form stops taking applications. The weekly emails and reminders go on, and ${movesUp}. ${back}`;
    return `The weekly emails and reminders go on, and ${movesUp}. ${back}`;
  }
  if (from === "applications-closed" && next === "running") {
    return `The weekly emails and reminders go on as they are, and ${movesUp}. ${back}`;
  }
  if (from === "running" && next === "completed") {
    return `The weekly emails and reminders stop, its groups leave each facilitator’s My programmes, and nobody more can be handed over or moved. ${back}`;
  }
  return null;
}

export const NOBODY_IS_EMAILED = "Nobody is emailed.";

/** "Keep it Running": the status it stays at. */
export function keepStatusWords(current: CourseRunStatus): string {
  return `Keep it ${COURSE_RUN_STATUS_LABEL[current]}`;
}

/** "Move it to Completed". */
export function moveStatusWords(next: CourseRunStatus): string {
  return `Move it to ${COURSE_RUN_STATUS_LABEL[next]}`;
}

// ---------------------------------------------------------------------------
// A week stays published once it is in use
// ---------------------------------------------------------------------------

/**
 * A week stays published once anybody has ticked or written in it, or a
 * group's session for it has passed. "Started" covers both: a group that
 * has met for the week has started it. No count of people and no names.
 */
export function weekStaysPublishedWords(weekNumber: number): string {
  return `People have started week ${weekNumber}, so it stays published. Change its blocks instead: each save is kept in its history.`;
}

// ---------------------------------------------------------------------------
// Copying weeks in with Replace, once anybody has started
// ---------------------------------------------------------------------------

export const COPY_CANT_REPLACE =
  "People have started this run, so copying in can’t replace its weeks. Copy into empty weeks only.";
