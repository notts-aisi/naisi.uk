import { campusLabel } from "../campus";
import { couldBeFollowed } from "../followable";
import { onlineForRooms } from "../sessionChange/room";
import type { ResolvedSession } from "../sessions";
import { allBlocks, type WeekBlock } from "../weekBlocks/model";
import { isCounted, type TaskNeeds } from "../weekBlocks/progress";
import { packNameOf, weekCheck, type CheckState, type NotDone } from "../weekWork/model";
import { waitingOf, withoutWaiting, type WaitingPart } from "../weekWork/waiting";
import { addDaysToKey, isValidDateKey, londonWallClockToInstant } from "../weekPlan";
import type { ReminderPlace } from "./words";
import { campusForWeek, type CourseGroupDoc } from "@/lib/firestore/courseGroups";

/**
 * THE WEEK'S THREE EMAILS, AS ARITHMETIC: when each goes, what a week asks
 * for, and what is left of one person's week.
 *
 *  - "WEEK N IS OPEN" goes 6 days before each of a group's sessions, to
 *    everybody holding a place in the group (`src/lib/courses/nextWeekEmail.ts`,
 *    sent by the `courses-next-week-email` job, or by finishing the register
 *    before it while that job is off).
 *  - THE REMINDERS go 3 days and 1 day before, to everybody due at the
 *    session, with its day, time and place, and what is left of their week
 *    if anything is (`courses-week-reminders`).
 *
 * All three at 9am in London, on the civil date that many days before the
 * session's own date: counted on the calendar and read off the wall, so a
 * clock change moves nothing.
 *
 * WHAT A WEEK ASKS FOR, and WHAT IS LEFT, are read in the scope the check
 * before Submit reads (`weekCheck`, `src/lib/courses/weekWork/model.ts`): the
 * readings, steps, packs and talks This week's tasks count, and every
 * reflection, set of fill-in boxes and written answer on the page. So the
 * email that says a week is open and the reminder that says what is left
 * name the same things the page names.
 *
 * Pure: no reads, no clock. The words are `./words.ts`.
 */

/** The wall clock every one of the week's emails goes at, in London. */
export const WEEK_EMAIL_CLOCK = "09:00";

/** "Week N is open": this many days before the session. */
export const WEEK_OPEN_DAYS_BEFORE = 6;

/** The reminders: these many days before the session, in the order they go. */
export const WEEK_REMINDER_DAYS = [3, 1] as const;

export type ReminderDays = (typeof WEEK_REMINDER_DAYS)[number];

/**
 * 9am in London on the civil date `daysBefore` days before `dateKey`, or null
 * when the date is not one ("cannot say", never "now").
 */
export function weekEmailSendAt(dateKey: string, daysBefore: number): Date | null {
  if (!isValidDateKey(dateKey)) return null;
  if (!Number.isInteger(daysBefore) || daysBefore < 0) return null;
  try {
    return londonWallClockToInstant(addDaysToKey(dateKey, -daysBefore), WEEK_EMAIL_CLOCK);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// What a week asks for
// ---------------------------------------------------------------------------

/** One line of what a week asks for, as "Week N is open" lists it. */
export type WeekAsk =
  | { kind: "readings"; count: number }
  | { kind: "steps"; count: number }
  /** A Choose one: the reading of the pack the person has. `name` is "pathway", or "pack". */
  | { kind: "pack"; name: string }
  | { kind: "reflections"; count: number }
  /** A set of fill-in boxes, by its title ("My action plan"). */
  | { kind: "boxes"; title: string }
  | { kind: "answers"; count: number }
  | { kind: "talks"; count: number }
  /** A week written before blocks: its readings and videos that are not optional. */
  | { kind: "materials"; count: number }
  /** A week written before blocks: its exercises to write up. */
  | { kind: "exercises"; count: number };

/** The ids This week's counted tasks need, each once. */
function countedIds(tasks: readonly TaskNeeds[], of: (needs: TaskNeeds) => readonly string[]): Set<string> {
  return new Set(tasks.filter(isCounted).flatMap(of));
}

/**
 * What a week written as blocks asks for, in page order of kind: the readings
 * and steps to tick, each pack's reading, the reflections, the fill-in boxes,
 * the written answers and the talks. Empty for a week that asks for nothing.
 */
export function blockWeekAsks(blocks: readonly WeekBlock[], tasks: readonly TaskNeeds[]): WeekAsk[] {
  const everything = allBlocks(blocks);
  const ticks = countedIds(tasks, (needs) => needs.tickIds);
  const chooseOnes = countedIds(tasks, (needs) => needs.chooseOneIds);
  const talks = countedIds(tasks, (needs) => needs.talkIds);
  let readings = 0;
  let steps = 0;
  let reflections = 0;
  let answers = 0;
  let talkCount = 0;
  const packs: WeekAsk[] = [];
  const boxes: WeekAsk[] = [];
  for (const block of everything) {
    if (block.type === "source" && ticks.has(block.id)) readings += 1;
    else if (block.type === "checklist") steps += block.items.filter((item) => ticks.has(item.id)).length;
    else if (block.type === "chooseOne" && chooseOnes.has(block.id)) packs.push({ kind: "pack", name: packNameOf(block) });
    else if (block.type === "reflection") reflections += 1;
    else if (block.type === "fillIn") boxes.push({ kind: "boxes", title: block.title.trim() });
    else if (block.type === "writtenAnswer") answers += 1;
    else if (block.type === "cases" && talks.has(block.id)) talkCount += 1;
  }
  const out: WeekAsk[] = [];
  if (readings > 0) out.push({ kind: "readings", count: readings });
  if (steps > 0) out.push({ kind: "steps", count: steps });
  out.push(...packs);
  if (reflections > 0) out.push({ kind: "reflections", count: reflections });
  out.push(...boxes);
  if (answers > 0) out.push({ kind: "answers", count: answers });
  if (talkCount > 0) out.push({ kind: "talks", count: talkCount });
  return out;
}

/** What a week written before blocks asks for: its materials that are not optional, and its required exercises. */
export function legacyWeekAsks(week: {
  materials?: readonly { optional?: boolean }[] | null;
  exercises?: readonly { required?: boolean }[] | null;
}): WeekAsk[] {
  const materials = (week.materials ?? []).filter((material) => !material.optional).length;
  const exercises = (week.exercises ?? []).filter((exercise) => exercise.required).length;
  const out: WeekAsk[] = [];
  if (materials > 0) out.push({ kind: "materials", count: materials });
  if (exercises > 0) out.push({ kind: "exercises", count: exercises });
  return out;
}

// ---------------------------------------------------------------------------
// What is left of one person's week
// ---------------------------------------------------------------------------

/**
 * WHAT IS LEFT OF ONE PERSON'S WEEK, as a reminder lists it: everything the
 * check names (`weekCheck`: readings and steps not ticked, the pack, empty
 * reflections and boxes, an empty written answer, one over its limit), and
 * whether a written answer with words in it has not been sent yet (`notSent`),
 * which the check does not name. Asked only of a week that is not done, so
 * it is never empty unless a part waits on the facilitator
 * (`nothingLeftButSlips`): such a week has something its tasks count still
 * to tick, or to write, or to send. Nothing closes at the
 * session: a week the old Submit was pressed for has every answer sent
 * already.
 *
 * NEVER A PART THAT WAITS ON THE FACILITATOR'S SLIP (`weekWork/waiting.ts`):
 * a pack given out that has not been given, and a talk whose case has not
 * been, are taken out of the tasks before the check reads them
 * (`withoutWaiting`), so no reminder asks for something the person cannot
 * do. A state that leaves out `caseOf` never takes a talk out.
 */
export type WeekLeft = { items: NotDone[]; notSent: boolean };

export function weekLeft(input: { blocks: readonly WeekBlock[]; tasks: readonly TaskNeeds[]; state: CheckState }): WeekLeft {
  const answers = allBlocks(input.blocks).filter((block) => block.type === "writtenAnswer");
  return {
    items: weekCheck(input.blocks, withoutWaiting(input.tasks, waitingOf(input.blocks, input.state)), input.state),
    notSent: answers.some((block) => input.state.answerOf(block.id).words > 0 && !input.state.isSent(block.id)),
  };
}

/**
 * NOTHING LEFT BUT THE FACILITATOR'S SLIP: a part of the week waits on it,
 * and the list of what is left (`weekLeft`, the very list the email would
 * print) names nothing else. Decided from the list itself, so somebody with
 * anything at all of their own still to do (a talk to say they are ready
 * for, a box no task covers, an answer to send) is reminded as before. Such
 * a week is chased by nobody: the reminders before a session list nothing
 * for it, Remind by hand does not reach the person about it, and "Week N is
 * open" does not name it among the earlier weeks not done.
 */
export function nothingLeftButSlips(left: WeekLeft, parts: readonly WaitingPart[]): boolean {
  return parts.length > 0 && left.items.length === 0 && !left.notSent;
}

// ---------------------------------------------------------------------------
// Where a session is, as the reminder says it
// ---------------------------------------------------------------------------

/**
 * WHERE ONE SESSION IS, FOR THE REMINDER BEFORE IT: that week's, from the
 * session the resolver hands every reader (`resolveSessions`, which lays the
 * week's own room, a moved week's room, and a room cleared for the week over
 * the group's), never the group's usual room for a week that has its own.
 *
 *  - ONLINE only when the week is held online: its own mode is online, or its
 *    campus is Online, the rule the rooms pages use (`onlineForRooms`), with
 *    whether a link is set for that week (`hasLink`: what the programme page's
 *    session card would show, `cardChangeFacts`). A
 *    group's standing link with no room does not make a week online. A
 *    week's second session (a group meeting twice) carries the group's own
 *    campus and no mode, as the week's changes are its first session's.
 *  - A ROOM, with the week's campus beside it when that is a place.
 *  - TO BE CONFIRMED with no room: none was ever set, it was cleared for that
 *    week ("to be confirmed" on a group with a usual room), or what was typed
 *    as the room holds a link, which an email never prints (`couldBeFollowed`).
 */
export function reminderPlaceOf(
  group: CourseGroupDoc,
  session: Pick<ResolvedSession, "weekId" | "occurrence" | "session">,
  hasLink: boolean,
): ReminderPlace {
  const first = session.occurrence <= 1;
  const campus = first ? campusForWeek(group, session.weekId) : (group.campus ?? null);
  const online = first ? onlineForRooms(group, session.weekId) : campus === "online";
  if (online) return { kind: "online", link: hasLink };
  const { location: typed } = session.session;
  const room = couldBeFollowed(typed) ? "" : typed.replace(/\s+/g, " ").trim();
  if (!room) return { kind: "to-be-confirmed" };
  return { kind: "room", room, campus: campus === "online" ? "" : campusLabel(campus) };
}
