import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { firstWord } from "@/lib/firestore/applicationEmails";
import type { CourseApplicationDoc } from "@/lib/firestore/courseApplications";
import {
  courseEnrolmentId,
  enrolmentHasLeft,
  enrolmentIsPutBack,
  normalizeCourseEnrolment,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import {
  normalizeCourseGroup,
  sessionForWeek,
  sessionModeForWeek,
  type CourseGroupDoc,
} from "@/lib/firestore/courseGroups";
import type { ProgrammeKind } from "@/lib/applications/model";
import { weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import type { Block } from "@/lib/firestore/newsletterBlocks";
import { loadCourseEmailTemplate, type CourseEmailTemplate } from "@/lib/email/courseApplicationEmails";
// The three composers by their `@/` paths, as every caller of a token filler
// imports one, so the tree walk in tests/email-unfilled-tokens.test.mjs
// finds these calls and holds them to "whole".
import {
  clockWords,
  composeFacilitatingEmail,
  facilitatingRefusal,
  namesInWords,
  weeklySlotWords,
  type FacilitatingFacts,
  type RefusedFacilitatorGroup,
} from "@/lib/courses/facilitatingEmail";
import {
  composeIncubatorStartEmail,
  incubatorStartRefusal,
  type IncubatorStartFacts,
  type RefusedIncubatorGroup,
} from "@/lib/courses/incubatorStartEmail";
import {
  composePlacementEmail,
  placementRefusal,
  placementWhere,
  type NoFirstSession,
  type PlacementFacts,
  type PlacementWhere,
  type RefusedGroup,
} from "@/lib/courses/placementEmail";
import { composeJoinedEmail, type JoinedFacts } from "@/lib/courses/joinedEmail";
import { facilitatorGuideReaderForGroup } from "./facilitatorGuide/access";
import { readGuideIndex } from "./facilitatorGuide/store";
import { resolveCalendar, resolveWeekDoc } from "./groupResolve";
import { placedOutsideTheirTimes, sessionLabelOf } from "./outsideTheirTimes";
import { gaveTheirPlaceBack, type PlaceOnTheForm } from "./placeGivenBack";
import { noteStandingFor, withPlacementNote, type NoteStanding } from "./placementNotes/model";
import { readPlacementNotes } from "./placementNotes/store";
import { readNamingProgramme, readRunLead, type RunLead } from "./programmeLead";
import { resolveSessions, sessionRange, type ResolvedSession } from "./sessions";
import { COURSE_TZ, daysBetween, isValidDateKey, londonDateKey } from "./weekPlan";
import { weekReadingTime } from "./weekTime";
import { formatRunStart, formatRunStartShort } from "./window";

/**
 * WHAT A PRESS OF PUBLISH WOULD DO, worked out before anything is sent.
 *
 * Publish tells each person placed in a group which group they are in (or,
 * on an incubator, when its weekly session is), and each facilitator of a
 * group with somebody in it that they are facilitating it. Three requests
 * ask the same question of a run and have to get the same answer: the
 * allocation board (the count on its button and the line about the last
 * test), "Send a test to me" (the first email of each kind), and Publish
 * itself. So the reading and the deciding are done here once, by
 * `loadPublishPlan`, and each route takes what it needs from the plan.
 *
 * ## Who is owed an email
 *
 *  - A PERSON whose application is accepted and whose enrolment is active and
 *    in a group, with no `allocatedEmailAt` stamp. The stamp is written after
 *    their email went, and a move to another group clears it, so a moved
 *    person is owed one again and is told their new group.
 *  - NEVER SOMEBODY WHO GAVE THEIR PLACE BACK. A person the application form
 *    put on the run who has since given their place back on the form keeps
 *    their seat until somebody Removes it, and their card on the board says
 *    "Gave their place back". They are owed nothing: no press writes to them,
 *    the count leaves them out, "Send a test to me" never borrows their
 *    email, and nothing stamps them as told. The board says how many
 *    (`gaveBack`). It is asked of the facts the board's cards are drawn from
 *    (`PlanInput.formPlaces`, and their seat) through the function the card
 *    asks (`gaveTheirPlaceBack` in `./placeGivenBack.ts`), so a card and the
 *    press cannot disagree about anybody. Somebody staff put back on the run
 *    after they left (`enrolmentIsPutBack`) is back: their place on the form
 *    stays given back, but their card no longer says so, and they are told.
 *    Somebody with no group whose card says it is not waited for either: a
 *    press never refuses for them (`unplaced`), as it never does for
 *    somebody who has left.
 *  - A FACILITATOR of a live group with somebody in it whom Publish has told
 *    or this press writes to, who has no marker for that group yet
 *    (`facilitatingMarkerId`). Once per facilitator per group: a facilitator
 *    of two groups is told about each, and nobody is told twice about one. A
 *    group with nobody in it is not one its facilitators are told about yet,
 *    nor is one whose people this press cannot write to; they are told by the
 *    press that tells somebody there. An archived group's facilitators are
 *    never told: its page refuses them.
 *  - NEVER THE LEAD of the programme that names the run, whatever group they
 *    facilitate. "You’re facilitating" is signed by that lead, so it would be
 *    a letter to themselves from themselves (an incubator's lead facilitates
 *    its one group). They are left out before anything is counted, so the
 *    button, the test, the press and what it reports all leave them out
 *    alike, and no group waits on them.
 *
 *  - A FACILITATOR ALREADY TOLD about a group in which this press tells
 *    somebody new: ONE email for the press naming who has joined, by first
 *    name, as their group page names them ("Ana and Raj have joined Group
 *    B", `composeJoinedEmail` in `./joinedEmail.ts`). Transactional, like
 *    "You're facilitating", and never to the programme's lead. Each person is
 *    announced to each facilitator once (`joinedMarkerId`), so a press that
 *    finds everybody announced already sends nothing. A facilitator told for
 *    the first time by this press gets "You're facilitating" alone, which
 *    already counts the group. Sent after the people's emails, naming only
 *    those whose email went, so a send that fails is never announced.
 *
 * ## Somebody placed outside the times they gave waits for a choice
 *
 * A person owed their group's email whose group meets at a time they said
 * they cannot make (`placedOutsideTheirTimes`, the one answer the board's
 * "Not free" card and the readiness check ask too) is told nothing until
 * somebody who may publish has chosen, for them in that group, a note of our
 * own words or "Send without a note" (`./placementNotes/`). Until then the
 * plan names them in `notesNeeded` and Publish refuses. A saved note goes
 * into their "Your group" email as a section above the site's own details
 * (`withPlacementNote`), and nowhere else.
 *
 * ## What the people are sent depends on the programme
 *
 * The people of a run a fellowship names, or that no programme names, are
 * sent "Placed in a group" (`composePlacementEmail`): their group, its
 * facilitators, and when and where it first meets. An incubator has one
 * weekly session for everybody and its people are never told the word
 * "group", so the people of a run an incubator names are sent "Placed on an
 * incubator" (`composeIncubatorStartEmail`) in its place: the weekly
 * session, the day it starts, who runs it and their programme's page. The
 * kind is read off the programme that names the run, through the one answer
 * that finds it (`readNamingProgramme` in `./programmeLead.ts`), and the
 * wording in force is that template's, so a test is of the email the press
 * will send.
 *
 * ## A facilitator is told how many have been told
 *
 * The facilitators' email says how many are in the group, and the number is
 * the people in it who will have been told once the press is done: those
 * told before it and those it writes to. Never somebody it cannot write to,
 * never somebody untold: it is the number of names the facilitator's roster
 * shows them, which shows nobody untold. A send can fail, and a press finds
 * out only as it sends, so each facilitator's email is written for every
 * number the group can come to (`emailBySize`) and the press sends the one
 * that is true (`facilitatorEmailFor`). When every send to a group's people
 * fails, its facilitators wait for the next press. "Send a test to me" shows
 * the email for every send going.
 *
 * Each PERSON's email says the same number ("There are 8 of you."), worked
 * out before anything is sent for every send going: those told before the
 * press and those it writes to, the person among them. Somebody whose send
 * fails is still in the group and is told by the next press, so the number
 * stays the group's.
 *
 * ## The people's email says what the board says
 *
 * "Your AGI Strategy group: Tuesdays at 6pm" (board st-emails): the group,
 * its weekly time and room, the day it meets from, how long its sessions
 * last, its facilitators by first name, how many are in it, how long week 1
 * takes while the group has not met yet (`weekReadingTime`, from week 1 as
 * the group's people read it), and the programme's lead, or NAISI where none
 * stands. Every value is a record's (`groupEmailFacts` in `loadPublishPlan`),
 * and the composer leaves out what a record does not hold.
 *
 * ## The count is what a press sends
 *
 * `pressBatch` is the one place a press's emails are counted: the people owed
 * an email who have an address, then the facilitators owed one who have an
 * address, at most `MAX_EMAILS_PER_PRESS` of them. The board shows that
 * number on its button and sends it back with the press, and Publish refuses
 * when it is no longer true, so what goes is what the admin read.
 *
 * ## Every email is written before anything is sent
 *
 * Each person's email and each facilitator's email is composed here, by the
 * composers that refuse rather than send something with a hole in it. A
 * refusal is a sentence an admin can act on, and Publish sends nothing while
 * there is one.
 *
 * ## A run the application form fills is published by an admin or its lead
 *
 * A row the form put on a run is served to an admin and to the lead of the
 * programme that names the run (`rowIsServedTo`). Each route reads the run's
 * rows itself and asks that of each, as every staff reader of the list does
 * (`tests/applications-handover-row-readers.test.mjs`), and hands this
 * module the rows it may act on. When the run holds a row from the form the
 * caller is not served, which is to say the caller is a track lead and no
 * more, the route says so (`adminOnly`) and the plan is only that.
 *
 * ## What lives where
 *
 * Three families of document in `courseNudges`, the server-only collection
 * the course emails keep their markers in (`firestore.rules` shuts it to
 * every browser), each carrying `runId` so destroying the run sweeps them:
 *
 *  - `publishtest__{runId}`: the last test that reached whoever sent it, and
 *    the wording it was made from (`wordingFingerprint`).
 *  - `facilitating__{runId}__{groupId}__{uid}`: a facilitator told about a
 *    group. Created before the send, so two presses cannot both send it.
 *  - `publishing__{runId}`: a press in progress (`takePressLock`).
 *  - `joined__{runId}__{groupId}__{facilitatorUid}__{uid}`: a person
 *    announced to a facilitator who had already been told about the group.
 *    Created before the send, so two presses cannot both send it.
 */

/**
 * Hard cap on emails per press: App Hosting's 60s request budget is the real
 * constraint (each send is SMTP plus a pacing pause). Whoever is past the cap
 * is not failed: they are still owed, and the next press carries on.
 */
export const MAX_EMAILS_PER_PRESS = 200;

/** How long a press in progress holds the run before another may take it. */
export const PRESS_STALE_MS = 5 * 60_000;

const NUDGES = "courseNudges";

/** What the route read and decided before asking for a plan. */
export type PlanInput = {
  /**
   * The run's ACCEPTED rows the caller may act on: each asked
   * `rowIsServedTo` with the caller's own standing on the run, by the route.
   */
  accepted: CourseApplicationDoc[];
  /**
   * The run holds a row from the application form this caller is not served:
   * only an admin or the lead of the programme that names the run may
   * publish it.
   */
  adminOnly: boolean;
  /**
   * Whether each person the application form put on the run still holds the
   * place that put them there, by uid: what the board's cards are drawn from,
   * read the same way (`formPlaceFactsFor` in
   * `src/lib/applications/handover/board.ts`). A person this has no entry
   * for (they applied to the run itself) has no place on the form to give
   * back. Every route that reads a plan hands it over:
   * `tests/course-publish-place-given-back.test.mjs` holds that.
   *
   * Read against the run's groups, each entry also says which groups their
   * painted week covers, which is how the plan knows who is placed outside
   * the times they gave. An entry without that says nothing about it.
   */
  formPlaces: ReadonlyMap<string, PlanFormPlace>;
};

/** What the plan reads of somebody's place on the form: whether they hold it, and when they are free. */
export type PlanFormPlace = PlaceOnTheForm & {
  availability?: "given" | "none-given" | "not-on-file";
  canMakeGroupIds?: readonly string[];
};

/** One finished email: what a composer returned, ready for the mail door. */
type WrittenEmail = { subject: string; blocks: Block[] };

/** Where a person or a facilitator owed an email stands. */
type Recipient = {
  uid: string;
  /** What the board and the result words call them. Names only. */
  name: string;
  /** Their own address, or null when there is none on file. Never sent to a browser. */
  to: string | null;
  groupId: string;
  groupName: string;
  /**
   * The finished email, or null when it could not be written (`refusals`
   * says why). A facilitator's counts the people in the group who will have
   * been told once every email this press writes to them has gone.
   */
  email: WrittenEmail | null;
};

export type PlannedPerson = Recipient;
export type PlannedFacilitator = Recipient & {
  markerId: string;
  /** How many people in the group Publish had told before this press. */
  toldBefore: number;
  /**
   * The email again for each number of people the group can have been told
   * once this press's people's emails are done: from `toldBefore` (every
   * send to somebody in it failed) up to the number `email` counts (every
   * one went). Never for nobody. See `facilitatorEmailFor`.
   */
  emailBySize: ReadonlyMap<number, WrittenEmail>;
};

/**
 * A facilitator already told about a group, owed one email naming who has
 * joined it since. `email` names every person this press may announce, and
 * is what "Send a test to me" and the preview show; the press writes it again
 * for those whose own email went (`joinedEmailFor`).
 */
export type PlannedJoined = Recipient & {
  /** How many people in the group Publish had told before this press. */
  toldBefore: number;
  /** Who this press may announce to them, in the order a press tells people, each with its marker. */
  people: { uid: string; firstName: string; markerId: string }[];
  /** Everything the email says but who has joined and how many are in the group. */
  facts: Omit<JoinedFacts, "joined" | "groupSize">;
};

/**
 * Somebody this press would tell their group who is placed outside the times
 * they gave, and what was chosen for them. Names and ids only.
 */
export type PlannedOutside = {
  uid: string;
  name: string;
  groupId: string;
  groupName: string;
  /** "Tuesdays at 6pm", or null. */
  meets: string | null;
  note: NoteStanding;
  /** The form they applied on, for Claude's draft, or null for somebody who applied to the run itself. */
  fromForm: { roundId: string; programmeId: string } | null;
};

export type TestState = "none" | "stale" | "fresh";

/** The last test that reached its sender, and whether it was of the wording in force now. */
export type PublishTestStanding = {
  state: TestState;
  byUid: string | null;
  at: Date | null;
};

export type PublishPlan = {
  /** Rows from the application form are on this run and the viewer is neither an admin nor its programme's lead. */
  adminOnly: boolean;
  /**
   * The programme that names the run is an incubator, so its people are sent
   * "Placed on an incubator", which names no group, and nothing else Publish
   * says to them may name one either.
   */
  incubator: boolean;
  /**
   * Accepted people with no active place in a group, by name: who a press
   * waits for. Never somebody who has left the run, and never somebody with
   * no group whose card says they gave their place back.
   */
  unplaced: string[];
  /**
   * People placed in a group and not told yet who gave their place back on
   * the form, by name: their cards say "Gave their place back", and no press
   * writes to them. Each still holds a seat until somebody Removes it.
   */
  gaveBack: string[];
  /** Why an email cannot be written, a sentence each. Empty when every email can be. */
  refusals: string[];
  /** Everybody owed their group's email, in the order a press sends them. */
  people: PlannedPerson[];
  /** Every facilitator owed theirs, in the order a press sends them. */
  facilitators: PlannedFacilitator[];
  /** Every facilitator owed an email naming who has joined their group, in the order a press sends them. */
  joined: PlannedJoined[];
  /** Everybody `people` holds who is placed outside the times they gave, with what was chosen for them. */
  outside: PlannedOutside[];
  /** Of `outside`, who has nothing chosen yet, by name: a press waits for them. */
  notesNeeded: string[];
  /** Groups with a facilitator who is not told yet because nobody is placed there. */
  emptyGroups: string[];
  /**
   * The wording in force: `allocated` is the people's email this run is sent,
   * "Placed in a group" or, for a run an incubator names, "Placed on an
   * incubator".
   */
  templates: { allocated: CourseEmailTemplate; facilitating: CourseEmailTemplate };
  /** `wordingFingerprint` of the two templates, as this plan read them. */
  wording: string;
  test: PublishTestStanding;
  /** The uid of everybody this plan read a name for, by uid. Names only. */
  names: Map<string, string>;
};

// ---------------------------------------------------------------------------
// Names and addresses
// ---------------------------------------------------------------------------

/** Display-name fallback chain: names only, never an email. */
function displayNameOf(data: Record<string, unknown>): string {
  const profile = (data.profile as Record<string, unknown> | undefined) ?? {};
  const preferred = profile.preferredName;
  const display = data.displayName;
  return (
    (typeof preferred === "string" && preferred.trim()) ||
    (typeof display === "string" && display.trim()) ||
    "NAISI member"
  );
}

/** The first name somebody goes by: the first word of their preferred name, else of their display name. */
function firstNameOf(data: Record<string, unknown>): string {
  const profile = (data.profile as Record<string, unknown> | undefined) ?? {};
  const preferred = typeof profile.preferredName === "string" ? profile.preferredName : "";
  const display = typeof data.displayName === "string" ? data.displayName : "";
  return firstWord(preferred.trim() || display.trim());
}

function emailOf(data: Record<string, unknown> | undefined): string {
  return typeof data?.email === "string" ? data.email.trim() : "";
}

/** This site's own address, with no trailing slash. Empty when it is not set. */
function appUrl(): string {
  let base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  while (base.endsWith("/")) base = base.slice(0, -1);
  return base;
}

/** A facilitator's group page, as a whole address, or null when the site does not know its own. */
export function groupPageUrl(runId: string, groupId: string): string | null {
  const base = appUrl();
  if (!base) return null;
  return `${base}/learn/${encodeURIComponent(runId)}/group/${encodeURIComponent(groupId)}`;
}

/** The run's own page in the member area, where its weeks are, or null when the site does not know its own address. */
export function programmePageUrl(runId: string): string | null {
  const base = appUrl();
  if (!base) return null;
  return `${base}/learn/${encodeURIComponent(runId)}`;
}

// ---------------------------------------------------------------------------
// When and where a group first meets, on its own calendar
// ---------------------------------------------------------------------------

/**
 * A group's first session, on the GROUP's own calendar: a group that paces
 * itself apart from its run is dated by its own start and plan, as its
 * members see it (`resolveSessions`, which every schedule surface uses).
 * The standing slot of its first taught week, with that week's override
 * applied. Null when the calendar cannot date it.
 */
function firstSessionOf(run: CourseRunDoc, group: CourseGroupDoc): ResolvedSession | null {
  const first = resolveSessions(run, group).find((session) => session.occurrence === 1) ?? null;
  return first && first.dateKey && first.session.startTimeLocal ? first : null;
}

/**
 * "Tue 3 Nov, 6pm" for a group's first taught session: the placement email's
 * {firstSessionWhen} token, in the words the facilitators' email and the
 * member's Home write a session in ("Tue 3 Nov", "6pm"). A HUMAN label,
 * deliberately not an instant: the session is a London wall-clock slot and
 * the email should read the way a facilitator would say it. Undefined when
 * the group's calendar has no valid start date, no taught week, or its slot
 * has no time yet, and publishing is then refused for that group
 * (`whyNoFirstSession` says which it was).
 *
 * THE SHAPE STAYS A DATE, A COMMA AND A TIME, as it was when it read
 * "Tuesday 3 November, 18:00", so wording an admin saved around the token in
 * Email designs ("Your first session is {firstSessionWhen}.") reads as it
 * did.
 */
export function firstSessionWhen(run: CourseRunDoc, group: CourseGroupDoc): string | undefined {
  const first = firstSessionOf(run, group);
  if (!first) return undefined;
  const day = formatRunStartShort(first.dateKey);
  const at = clockWords(first.session.startTimeLocal);
  return day && at ? `${day}, ${at}` : undefined;
}

/** Why a group has no first session, so the refusal can say what to set. */
export function whyNoFirstSession(run: CourseRunDoc, group: CourseGroupDoc): NoFirstSession {
  const calendar = resolveCalendar(run, group);
  if (!isValidDateKey(calendar.startDate)) return "no-start-date";
  if (!calendar.weekPlan.some((entry) => entry.kind === "week")) return "no-taught-week";
  return "no-session-time";
}

/**
 * Where that first session is: the group's room, or that it is online. The
 * same session `firstSessionWhen` dates, so the email's when and where are
 * one session's. The link itself never leaves `placementWhere`.
 */
function firstSessionWhere(run: CourseRunDoc, group: CourseGroupDoc): PlacementWhere | null {
  const first = resolveSessions(run, group).find((session) => session.occurrence === 1);
  if (!first) return null;
  return placementWhere(sessionForWeek(group, first.weekId), sessionModeForWeek(group, first.weekId));
}

/**
 * What one group lends the email every person placed in it is sent: the
 * same for each of them, worked out once (see `loadPublishPlan`).
 */
type GroupEmailFacts = Pick<
  PlacementFacts,
  | "programmeName"
  | "weeklySlot"
  | "firstSession"
  | "firstSessionDay"
  | "where"
  | "sessionMinutes"
  | "groupSize"
  | "weekOneTime"
  | "programmeUrl"
  | "leadName"
>;

/** The group's facilitators as one person placed in it is told them: never that person. */
type FacilitatorsFor = { names: string[]; firstNames: string[] };

/** What the placement email is told about one person in one group. */
function placementFacts(
  run: CourseRunDoc,
  group: CourseGroupDoc,
  name: string,
  facilitators: FacilitatorsFor,
  shared: GroupEmailFacts,
): PlacementFacts {
  return {
    name,
    courseTitle: run.courseTitle,
    runLabel: run.label,
    startDate: formatRunStart(run.startDate) ?? null,
    groupName: group.name.trim() || null,
    facilitatorNames: facilitators.names.length > 0 ? namesInWords(facilitators.names) : null,
    firstSessionWhen: firstSessionWhen(run, group) ?? null,
    firstSessionWhere: firstSessionWhere(run, group),
    facilitatorFirstNames: facilitators.firstNames,
    ...shared,
  };
}

/**
 * THE SESSION THE GROUP'S TWO EMAILS NAME as the one it meets from: its
 * first, or once that has finished, the next one, so somebody told after the
 * group first met is told when they next meet it and never a day already
 * past. The next session is the soonest still to finish on the group's own
 * calendar (`sessionRange`); with none left, it is the first, as it always
 * was. `first` says whether it is the group's first, which is when the
 * person's email says how long week 1 takes. Null when the calendar cannot
 * date a session.
 */
function meetingFrom(run: CourseRunDoc, group: CourseGroupDoc, now: Date): { dateKey: string; first: boolean } | null {
  const range = sessionRange(resolveSessions(run, group), now);
  const next = range.next?.dateKey ?? "";
  if (next && range.firstDateKey && next > range.firstDateKey) return { dateKey: next, first: false };
  return range.firstDateKey ? { dateKey: range.firstDateKey, first: true } : null;
}

/**
 * The day "Have a look before ..." names: the session's day of the week while
 * it is within the next six days, as people say it ("Tuesday"), and its date
 * on the day itself and further off, where a day's name alone could be read as
 * another ("Tue 3 Nov"), as a freed place's email says the day somebody was
 * told. Null for a date that is not one.
 */
export function sessionDayWords(dateKey: string, now: Date): string | null {
  if (!isValidDateKey(dateKey)) return null;
  const days = daysBetween(londonDateKey(now), dateKey);
  if (days >= 1 && days <= 6) {
    return new Intl.DateTimeFormat("en-GB", { timeZone: COURSE_TZ, weekday: "long" }).format(new Date(`${dateKey}T12:00:00Z`));
  }
  return formatRunStartShort(dateKey) ?? null;
}

/** The group's first and last session, as "Tue 3 Nov", on its own calendar. */
function groupTerm(run: CourseRunDoc, group: CourseGroupDoc): { first: string | null; last: string | null } {
  const range = sessionRange(resolveSessions(run, group));
  return {
    first: range.firstDateKey ? (formatRunStartShort(range.firstDateKey) ?? null) : null,
    last: range.lastDateKey ? (formatRunStartShort(range.lastDateKey) ?? null) : null,
  };
}

/**
 * WHEN THE GROUP IS SAID TO MEET FROM, as "Tue 3 Nov", in both of its emails:
 * the session `meetingFrom` names, so somebody added after the group first
 * met is told when they next meet it ("from Thu 5 Nov to Thu 3 Dec"). Still a
 * date, so wording saved around `{firstSession}` in Email designs reads as it
 * did.
 */
function facilitatingFrom(run: CourseRunDoc, group: CourseGroupDoc, now: Date): string | null {
  const from = meetingFrom(run, group, now);
  return from ? (formatRunStartShort(from.dateKey) ?? null) : null;
}

/**
 * What an incubator's email is told about one person on its run: the weekly
 * session of the group they are placed in, as the facilitators' email says
 * it (its standing slot and place, and its first session on its own
 * calendar), who runs it, and their programme's page. Nothing of the group's
 * name or who facilitates it: the email has no token for either.
 */
function incubatorStartFacts(
  run: CourseRunDoc,
  group: CourseGroupDoc,
  name: string,
  naming: Naming,
  leadName: string | null,
): IncubatorStartFacts {
  return {
    name,
    courseTitle: run.courseTitle,
    runLabel: run.label,
    // A programme with no short name is called what the run's course is.
    programmeName: naming.programmeName ?? run.courseTitle,
    weeklySlot: weeklySlotWords(group.session),
    firstSession: groupTerm(run, group).first,
    // The weekly slot's own place, not one week's change of room.
    where: placementWhere(group.session, null),
    leadName,
    programmeUrl: programmePageUrl(run.id),
  };
}

// ---------------------------------------------------------------------------
// The wording, and the test of it
// ---------------------------------------------------------------------------

/** What a block prints, without the id a seed copy is given afresh by each server. */
function blockWords(block: Block): unknown[] {
  switch (block.type) {
    case "heading":
      return [block.type, block.level, block.text];
    case "richText":
      return [block.type, block.html];
    case "image":
      return [block.type, block.url, block.alt, block.caption ?? ""];
    case "divider":
      return [block.type];
    case "video":
      return [block.type, block.url, block.caption ?? ""];
  }
}

/**
 * One string for the wording of both emails Publish sends: 64 hex characters,
 * equal exactly when each template's subject, blocks and sender name are. A
 * block's id is left out: the seed copy is given new ids every time a server
 * starts, and an id is not wording.
 */
export function wordingFingerprint(templates: PublishPlan["templates"]): string {
  const lines = (["allocated", "facilitating"] as const).map((kind) => {
    const template = templates[kind];
    return JSON.stringify([kind, template.subject, template.fromName ?? "", template.blocks.map(blockWords)]);
  });
  return createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
}

export function publishTestId(runId: string): string {
  return `publishtest__${runId}`;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date } | null;
  return typeof stamp?.toDate === "function" ? stamp.toDate() : null;
}

/**
 * Where a run stands on its test: none sent, one sent before the wording last
 * changed, or one that still counts. ANYTHING BUT `fresh` HOLDS A PRESS.
 */
export function testStandingOf(record: Record<string, unknown> | undefined, wording: string): PublishTestStanding {
  if (!record || typeof record.wording !== "string") return { state: "none", byUid: null, at: null };
  return {
    state: record.wording === wording ? "fresh" : "stale",
    byUid: typeof record.byUid === "string" ? record.byUid : null,
    at: toDate(record.at),
  };
}

/** Record a test that reached whoever sent it, and the wording it was made from. */
export async function recordPublishTest(db: Firestore, runId: string, byUid: string, wording: string): Promise<void> {
  await db.collection(NUDGES).doc(publishTestId(runId)).set({
    kind: "allocation-test",
    runId,
    byUid,
    at: FieldValue.serverTimestamp(),
    wording,
  });
}

/** "5:38pm" for a moment today in London, and "Mon 26 Oct at 5:38pm" for one on another day. */
export function testWhen(at: Date, now: Date = new Date()): string {
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: COURSE_TZ, ...options }).format(at);
  const [hour, minute] = part({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":").map(Number);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const clock = `${twelve}${minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`}${hour < 12 ? "am" : "pm"}`;
  const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: COURSE_TZ, dateStyle: "short" }).format(d);
  if (day(at) === day(now)) return clock;
  return `${part({ weekday: "short", day: "numeric", month: "short" })} at ${clock}`;
}

/**
 * The sentence that holds a press for want of a test, or null when a test
 * still counts. A caller that hands over nothing is refused: a press is never
 * let through by an answer nobody gave.
 */
export function publishTestBlocker(test: TestState | undefined): string | null {
  if (test === "fresh") return null;
  if (test === "stale") {
    return "The wording of these emails changed in Email designs after the last test. Send yourself a test again before you publish.";
  }
  return "Nobody has sent themselves a test of these emails yet. Send yourself one before you publish.";
}

// ---------------------------------------------------------------------------
// The facilitators' marker, and the press in progress
// ---------------------------------------------------------------------------

export function facilitatingMarkerId(runId: string, groupId: string, uid: string): string {
  return `facilitating__${runId}__${groupId}__${uid}`;
}

function isAlreadyExists(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}

/**
 * Claim one facilitator's email for one group, before it is sent. The marker
 * is created at a fixed id, so of two presses only one can claim it. False
 * when it was claimed already.
 */
export async function claimFacilitatorEmail(
  db: Firestore,
  runId: string,
  facilitator: PlannedFacilitator,
  byUid: string,
): Promise<boolean> {
  try {
    await db.collection(NUDGES).doc(facilitator.markerId).create({
      kind: "group-facilitating",
      runId,
      groupId: facilitator.groupId,
      uid: facilitator.uid,
      state: "sending",
      claimedAt: FieldValue.serverTimestamp(),
      byUid,
    });
    return true;
  } catch (err) {
    if (isAlreadyExists(err)) return false;
    throw err;
  }
}

/** What became of a claimed email. A send that threw gives the claim back, so the next press tries again. */
export async function settleFacilitatorEmail(
  db: Firestore,
  facilitator: PlannedFacilitator,
  delivery: "sent" | "held" | "suppressed" | "failed",
): Promise<void> {
  const ref = db.collection(NUDGES).doc(facilitator.markerId);
  if (delivery === "failed") {
    await ref.delete();
    return;
  }
  await ref.update({ state: delivery, settledAt: FieldValue.serverTimestamp() });
}

export function joinedMarkerId(runId: string, groupId: string, facilitatorUid: string, uid: string): string {
  return `joined__${runId}__${groupId}__${facilitatorUid}__${uid}`;
}

/**
 * Claim the announcement of each of these people to one facilitator, before
 * the email goes. Each marker is created at a fixed id, so of two presses only
 * one can announce a person. Answers the people this press claimed: an empty
 * list when another press had claimed them all.
 */
export async function claimJoined(
  db: Firestore,
  runId: string,
  letter: PlannedJoined,
  people: readonly PlannedJoined["people"][number][],
  byUid: string,
): Promise<PlannedJoined["people"]> {
  const claimed: PlannedJoined["people"] = [];
  for (const person of people) {
    try {
      await db.collection(NUDGES).doc(person.markerId).create({
        kind: "group-joined",
        runId,
        groupId: letter.groupId,
        uid: letter.uid,
        joinedUid: person.uid,
        state: "sending",
        claimedAt: FieldValue.serverTimestamp(),
        byUid,
      });
      claimed.push(person);
    } catch (err) {
      if (!isAlreadyExists(err)) throw err;
    }
  }
  return claimed;
}

/** What became of a claimed announcement. A send that threw gives the claims back, so the next press tries again. */
export async function settleJoined(
  db: Firestore,
  people: readonly PlannedJoined["people"][number][],
  delivery: "sent" | "held" | "suppressed" | "failed",
): Promise<void> {
  for (const person of people) {
    const ref = db.collection(NUDGES).doc(person.markerId);
    if (delivery === "failed") await ref.delete();
    else await ref.update({ state: delivery, settledAt: FieldValue.serverTimestamp() });
  }
}

export function pressLockId(runId: string): string {
  return `publishing__${runId}`;
}

export type PressLock = { ok: true; token: string } | { ok: false; since: Date | null };

/**
 * Take the run for one press. Refused while another press holds it, unless
 * that one started more than `PRESS_STALE_MS` ago: a request is long gone by
 * then, so its hold is left over from one that stopped.
 */
export async function takePressLock(db: Firestore, runId: string, byUid: string): Promise<PressLock> {
  const ref = db.collection(NUDGES).doc(pressLockId(runId));
  const token = randomUUID();
  return db.runTransaction<PressLock>(async (tx) => {
    const snap = await tx.get(ref);
    const held = snap.exists ? (snap.data() ?? {}) : null;
    const since = typeof held?.claimedAtMs === "number" ? held.claimedAtMs : null;
    if (held && since !== null && Date.now() - since < PRESS_STALE_MS) {
      return { ok: false, since: new Date(since) };
    }
    tx.set(ref, { kind: "allocation-press", runId, byUid, token, claimedAtMs: Date.now() });
    return { ok: true, token };
  });
}

/** Give the run back, if this press still holds it. */
export async function releasePressLock(db: Firestore, runId: string, token: string): Promise<void> {
  const ref = db.collection(NUDGES).doc(pressLockId(runId));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && (snap.data() ?? {}).token === token) tx.delete(ref);
  });
}

// ---------------------------------------------------------------------------
// The programme that names the run
// ---------------------------------------------------------------------------

/** The programme that names a run, as far as Publish needs it. */
type Naming = {
  /**
   * Its lead, while they still meet the bar a lead is appointed behind: who
   * signs the facilitators' email and runs an incubator's sessions, and who
   * is never sent "You're facilitating".
   */
  lead: RunLead | null;
  /** Its short name ("AGI Strategy"), or null when it has none. */
  programmeName: string | null;
  /** Its kind: an incubator's people are sent their own email. */
  kind: ProgrammeKind | null;
};

const NAMED_BY_NOBODY: Naming = { lead: null, programmeName: null, kind: null };

/**
 * The programme that names this run: its kind, its short name and its lead.
 * Both come from the one answer (`./programmeLead.ts`): one programme naming
 * the run or nobody, and its lead only while they still meet the bar, so a
 * lead who has been replaced, or no longer stands, signs nothing: the
 * facilitators' sign-off is an optional unit, and goes without them.
 */
async function namingOf(db: Firestore, runId: string): Promise<Naming> {
  const naming = await readNamingProgramme(db, runId);
  if (!naming) return NAMED_BY_NOBODY;
  const lead = await readRunLead(db, runId, naming);
  return { lead, programmeName: naming.shortName, kind: naming.kind };
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/**
 * The run's groups as the form's facts are read against them: each one's id
 * and weekly session, archived ones included, because a group archived after
 * placements landed still holds its people and Publish still writes to them.
 * Every route that reads a plan reads this, and hands it to
 * `formPlaceFactsFor`, so the plan knows who is placed outside the times they
 * gave by the board's own reading.
 */
export async function readGroupSessions(
  db: Firestore,
  runId: string,
): Promise<{ id: string; session: CourseGroupDoc["session"] }[]> {
  const snap = await db.collection("courseGroups").where("runId", "==", runId).limit(50).get();
  return snap.docs.map((doc) => {
    const group = normalizeCourseGroup(doc.id, doc.data() ?? {});
    return { id: group.id, session: group.session };
  });
}

async function readUsers(db: Firestore, uids: Iterable<string>): Promise<Map<string, Record<string, unknown>>> {
  const list = [...new Set([...uids].filter(Boolean))];
  const out = new Map<string, Record<string, unknown>>();
  if (list.length === 0) return out;
  const docs = await db.getAll(...list.map((uid) => db.collection("users").doc(uid)));
  for (const doc of docs) if (doc.exists) out.set(doc.id, doc.data() ?? {});
  return out;
}

/**
 * Everything a press of Publish would do for this caller, read and decided
 * now. Writes nothing and sends nothing. The route has already decided that
 * the caller is an admin, one of the run's track leads or the lead of the
 * programme that names it (`doesTrackLeadWork`), and has read the run's rows
 * (see `PlanInput`).
 */
export async function loadPublishPlan(db: Firestore, run: CourseRunDoc, input: PlanInput): Promise<PublishPlan> {
  const runId = run.id;
  const now = new Date();
  const templatesRead = Promise.all([
    loadCourseEmailTemplate("course-allocated"),
    loadCourseEmailTemplate("course-allocated-incubator"),
    loadCourseEmailTemplate("course-facilitating"),
  ]);
  // Same cost ceiling as the board's read. Groups are NOT filtered on
  // archived here: a group archived after placements landed still owns those
  // placements, and its members' emails still need its name and slot.
  const [groupSnap, testSnap, naming] = await Promise.all([
    db.collection("courseGroups").where("runId", "==", runId).limit(50).get(),
    db.collection(NUDGES).doc(publishTestId(runId)).get(),
    namingOf(db, runId),
  ]);
  const [inAGroup, onAnIncubator, facilitating] = await templatesRead;
  // The people's email is the one for the kind of programme that names the
  // run (see the note at the top), and the wording in force is that one's.
  const incubator = naming.kind === "incubator";
  const templates = { allocated: incubator ? onAnIncubator : inAGroup, facilitating };
  const wording = wordingFingerprint(templates);
  const test = testStandingOf(testSnap.exists ? testSnap.data() : undefined, wording);

  const empty: PublishPlan = {
    adminOnly: false,
    incubator,
    unplaced: [],
    gaveBack: [],
    refusals: [],
    people: [],
    facilitators: [],
    joined: [],
    outside: [],
    notesNeeded: [],
    emptyGroups: [],
    templates,
    wording,
    test,
    names: new Map(),
  };
  // A RUN THE APPLICATION FORM FILLS IS PUBLISHED BY AN ADMIN OR THE LEAD OF
  // ITS PROGRAMME, and the plan for anybody else says only that, and nothing
  // about who is on it.
  if (input.adminOnly) return { ...empty, adminOnly: true };

  const accepted = input.accepted;
  const groupById = new Map<string, CourseGroupDoc>();
  for (const doc of groupSnap.docs) {
    const group = normalizeCourseGroup(doc.id, doc.data() ?? {});
    groupById.set(group.id, group);
  }

  // Join by construction: each accepted applicant's enrolment lives at
  // exactly one deterministic path.
  const enrolmentSnaps = accepted.length
    ? await db.getAll(...accepted.map((row) => db.collection("courseEnrolments").doc(courseEnrolmentId(runId, row.uid))))
    : [];
  const enrolmentByUid = new Map<string, CourseEnrolmentDoc>();
  for (const snap of enrolmentSnaps) {
    if (!snap.exists) continue;
    const enrolment = normalizeCourseEnrolment(snap.id, snap.data() ?? {});
    enrolmentByUid.set(enrolment.uid, enrolment);
  }

  // NOBODY WHO GAVE THEIR PLACE BACK IS OWED ANYTHING (see the note at the
  // top). This asks the question their card asks, of the facts the card is
  // drawn from. A person with no facts, or a plan read with none, gave
  // nothing back, as a card with no facts says nothing. Names come from the
  // application's own copy, as the unplaced ones' do.
  const gaveBack = (uid: string): boolean => {
    const seat = enrolmentByUid.get(uid);
    return gaveTheirPlaceBack(input.formPlaces?.get(uid), { putBack: seat !== undefined && enrolmentIsPutBack(seat) });
  };

  // Unplaced = accepted but without an active enrolment in a group that is
  // still there (the board shows somebody whose group has gone back in its
  // pool). Names come from the application's own copy: the refusal path
  // reads no account.
  //
  // NOBODY WHO HAS LEFT THE RUN IS WAITED FOR. An enrolment withdrawn by its
  // owner or removed by staff (`enrolmentHasLeft`) may sit beside a row that
  // still says Accepted, because changing that row is an admin's step, and
  // the lead who removed them cannot take it. They are not somebody to
  // place: the board names them as having left, and Publish neither waits
  // for them nor writes to them. Somebody accepted with no enrolment at all
  // is still waited for.
  //
  // NOR IS ANYBODY WITH NO GROUP WHO GAVE THEIR PLACE BACK. Somebody handed
  // over and never placed whose card says "Gave their place back" is nobody
  // to place either: their row can still say Accepted, and only an admin can
  // change it. The board's rail leaves them out of who is still to place by
  // the same answer (`boardTally`), so the board and the press agree.
  const groupOf = (uid: string): CourseGroupDoc | null => {
    const e = enrolmentByUid.get(uid);
    if (!e || e.groupId === null || e.status !== "active" || !groupById.has(e.groupId)) return null;
    return groupById.get(e.groupId) ?? null;
  };
  const hasLeftTheRun = (uid: string): boolean => {
    const e = enrolmentByUid.get(uid);
    return e !== undefined && enrolmentHasLeft(e.status);
  };
  const unplaced = accepted
    .filter((row) => !hasLeftTheRun(row.uid) && groupOf(row.uid) === null && !gaveBack(row.uid))
    .map((row) => row.displayName || "NAISI member");

  // How many are placed in each group, told or not: whether a group has
  // anybody in it for its facilitators to be told about at all. And how many
  // of them Publish has told already: where each facilitator's count starts.
  // Somebody who gave their place back still sits in their group until they
  // are Removed, so it is not empty; a group with nobody else in it keeps its
  // facilitators waiting, as one nobody in which can be told yet does.
  const placedIn = new Map<string, number>();
  const toldIn = new Map<string, number>();
  for (const row of accepted) {
    const group = groupOf(row.uid);
    if (!group) continue;
    placedIn.set(group.id, (placedIn.get(group.id) ?? 0) + 1);
    if (enrolmentByUid.get(row.uid)?.allocatedEmailAt) toldIn.set(group.id, (toldIn.get(group.id) ?? 0) + 1);
  }

  // Everyone placed but not yet told. The stamp is the once-only guard: it is
  // written after their email went, and a move clears it. Of them, nobody who
  // gave their place back is owed an email (`gaveBack`, above).
  const placedUntold = accepted.flatMap((row) => {
    const group = groupOf(row.uid);
    return group && !enrolmentByUid.get(row.uid)?.allocatedEmailAt ? [{ row, group }] : [];
  });
  const owed = placedUntold.filter(({ row }) => !gaveBack(row.uid));
  const givenBack = placedUntold
    .filter(({ row }) => gaveBack(row.uid))
    .map(({ row }) => row.displayName || "NAISI member");

  // The facilitators of every live group, and whether each has been told
  // about that group yet. Only a group with somebody in it is one they are
  // told about; a group still empty is named so the board can say why its
  // facilitators are waiting. Which of the others are owed their email now
  // is settled once the people's addresses are read, below.
  const facilitatorSlots: { group: CourseGroupDoc; uid: string; markerId: string }[] = [];
  for (const group of groupById.values()) {
    if (group.archived) continue;
    for (const uid of group.facilitatorUids) {
      // NEVER THE LEAD of the programme that names the run, while they stand:
      // the email is theirs to sign. Left out here, before anything is
      // counted, so no count, test, press or report includes them (see the
      // note at the top).
      if (uid === naming.lead?.uid) continue;
      facilitatorSlots.push({ group, uid, markerId: facilitatingMarkerId(runId, group.id, uid) });
    }
  }
  const markers = facilitatorSlots.length
    ? await db.getAll(...facilitatorSlots.map((slot) => db.collection(NUDGES).doc(slot.markerId)))
    : [];
  const toldMarkers = new Set(markers.filter((snap) => snap.exists).map((snap) => snap.id));
  const untold = facilitatorSlots.filter((slot) => !toldMarkers.has(slot.markerId));
  const mayTell = untold.filter((slot) => (placedIn.get(slot.group.id) ?? 0) > 0);
  const emptyGroups = [
    ...new Set(
      untold
        .filter((slot) => (placedIn.get(slot.group.id) ?? 0) === 0)
        .map((slot) => slot.group.name.trim() || "A group with no name"),
    ),
  ];

  // One read for every account this needs: the people owed an email
  // (address and greeting), and every facilitator of their groups and of the
  // groups that may be owed a facilitators' email (names, and for those owed
  // one, the address). The programme's lead is read by \`namingOf\`.
  const uids = new Set<string>();
  for (const { row, group } of owed) {
    uids.add(row.uid);
    for (const uid of group.facilitatorUids) uids.add(uid);
  }
  for (const slot of mayTell) for (const uid of slot.group.facilitatorUids) uids.add(uid);
  const users = await readUsers(db, uids);
  const names = new Map<string, string>();
  for (const [uid, data] of users) names.set(uid, displayNameOf(data));
  // The first name the lead goes by, while they still stand.
  const leadName = naming.lead?.firstName || null;

  // The group's facilitators as a person placed in it is told them: never
  // the person themselves. A facilitator who holds a place sits in the group
  // they facilitate, so they are placed in it and told it like anybody else,
  // and their own email names the others who facilitate it, or nobody (the
  // email then leaves that sentence out). Their "You’re facilitating" email,
  // below, is the one that tells them they facilitate it. Whole names for
  // wording saved before the board's, first names for the board's.
  const facilitatorNamesOf = (group: CourseGroupDoc, recipientUid: string): FacilitatorsFor => {
    const others = group.facilitatorUids.filter((uid) => uid !== recipientUid).map((uid) => users.get(uid));
    return {
      names: others.map((data) => (data ? displayNameOf(data) : "")).filter(Boolean),
      firstNames: others.map((data) => (data ? firstNameOf(data) : "")).filter(Boolean),
    };
  };

  // ── Who is written to, and where ────────────────────────────────────────
  // Each person owed an email, with the name it greets them by and the
  // address it goes to.
  const addressed = owed.map(({ row, group }) => {
    const data = users.get(row.uid);
    return {
      row,
      group,
      name: data ? displayNameOf(data) : row.displayName || "NAISI member",
      // The proven address: `users.email` is the Google sign-in address. The
      // application's own copy is the fallback for a since-deleted account.
      to: emailOf(data) || row.email?.trim() || null,
    };
  });

  // ── How many each group's emails count ──────────────────────────────────
  // The people in each group this press writes to: everybody owed an email
  // there who has an address. A press takes the people first, so a press
  // that carries a facilitator's email carries every one of these.
  const writesIn = new Map<string, number>();
  for (const person of addressed) {
    if (person.to) writesIn.set(person.group.id, (writesIn.get(person.group.id) ?? 0) + 1);
  }

  // ── Who is placed outside the times they gave ────────────────────────────
  // Of the people owed their group's email, those whose group meets at a time
  // they said they cannot make: the one answer the board's card and the
  // readiness check ask (`placedOutsideTheirTimes`), of the same facts. Each
  // waits for a choice, made for them in that group (`noteStandingFor`).
  const timesGiven = (row: CourseApplicationDoc) => {
    const place = row.fromForm !== null ? input.formPlaces?.get(row.uid) : undefined;
    return {
      availability: row.availability
        .split(",")
        .map((label) => label.trim())
        .filter(Boolean),
      fromForm:
        place && place.availability !== undefined && place.canMakeGroupIds !== undefined
          ? { availability: place.availability, canMakeGroupIds: place.canMakeGroupIds }
          : null,
    };
  };
  // Everybody owed, with an address or not, so this is the same list the
  // readiness check names from the seats alone.
  const outsideOwed = addressed.filter(({ row, group }) =>
    placedOutsideTheirTimes(timesGiven(row), { id: group.id, sessionLabel: sessionLabelOf(group.session) }),
  );
  const notes = outsideOwed.length > 0 ? await readPlacementNotes(db, runId, outsideOwed.map(({ row }) => row.uid)) : new Map();
  const outside: PlannedOutside[] = outsideOwed.map(({ row, group, name }) => {
    const stored = notes.get(row.uid) ?? null;
    return {
      uid: row.uid,
      name,
      groupId: group.id,
      groupName: group.name.trim() || "A group with no name",
      meets: weeklySlotWords(group.session),
      note: noteStandingFor(stored, group.id),
      fromForm: row.fromForm ? { roundId: row.fromForm.roundId, programmeId: row.fromForm.programmeId } : null,
    };
  });
  const noteFor = new Map(outside.map((entry) => [entry.uid, entry.note] as const));
  const notesNeeded = outside.filter((entry) => entry.note.state === "missing").map((entry) => entry.name);

  // ── Week 1's time ────────────────────────────────────────────────────────
  // Read for each group of a fellowship's run whose people are owed their
  // email, as its people read week 1 (the group's own copy, else the run's,
  // `resolveWeekDoc`), and timed by the one function (`weekReadingTime`):
  // its This week's "In all", or its materials' own minutes. Nothing for a
  // week that is not published. An incubator's email says nothing of it.
  const weekOneTimes = new Map<string, string | null>();
  if (!incubator) {
    const groups = [...new Map(owed.map(({ group }) => [group.id, group])).values()];
    const weeks = await Promise.all(groups.map((group) => resolveWeekDoc(db, runId, group.id, weekDocId(1))));
    groups.forEach((group, at) => weekOneTimes.set(group.id, weekReadingTime(weeks[at].week)));
  }

  /**
   * What a group lends each of its people's emails. THE GROUP'S SIZE is the
   * people in it who will have been told once this press is done, those told
   * before it and those it writes to, the number the facilitators' email and
   * the roster say: never somebody untold, and never somebody who gave their
   * place back. WEEK 1'S TIME only while the session the email names is the
   * group's first: somebody told after the group has met is told when they
   * next meet it, and week 1 is behind them.
   */
  const groupEmailFacts = (group: CourseGroupDoc): GroupEmailFacts => {
    const from = meetingFrom(run, group, now);
    return {
      // A run no programme names is called what its course is.
      programmeName: naming.programmeName ?? run.courseTitle,
      weeklySlot: weeklySlotWords(group.session),
      firstSession: from ? (formatRunStartShort(from.dateKey) ?? null) : null,
      firstSessionDay: from ? sessionDayWords(from.dateKey, now) : null,
      // The weekly slot's own place, not one week's change of room.
      where: placementWhere(group.session, null),
      sessionMinutes: group.session.durationMinutes > 0 ? group.session.durationMinutes : null,
      groupSize: (toldIn.get(group.id) ?? 0) + (writesIn.get(group.id) ?? 0),
      weekOneTime: from?.first ? (weekOneTimes.get(group.id) ?? null) : null,
      programmeUrl: programmePageUrl(runId),
      leadName: naming.programmeName ? leadName : null,
    };
  };

  // ── The people's emails ─────────────────────────────────────────────────
  // "Placed in a group", or on a run an incubator names "Placed on an
  // incubator", which names no group (see the note at the top).
  const people: PlannedPerson[] = [];
  const refusedPeople = new Map<string, RefusedGroup>();
  const refusedIncubator = new Map<string, RefusedIncubatorGroup>();
  const writeIncubatorStart = (group: CourseGroupDoc, name: string): WrittenEmail | null => {
    const written = composeIncubatorStartEmail(templates.allocated, incubatorStartFacts(run, group, name, naming, leadName));
    if (!written.ok && !refusedIncubator.has(group.id)) {
      refusedIncubator.set(group.id, {
        name: group.name.trim(),
        problems: written.problems,
        ...(written.problems.some((problem) => problem.kind === "missing" && problem.token === "firstSession")
          ? { noFirstSession: whyNoFirstSession(run, group) }
          : {}),
      });
    }
    return written.ok ? { subject: written.subject, blocks: written.blocks } : null;
  };
  const writePlacement = (group: CourseGroupDoc, name: string, uid: string): WrittenEmail | null => {
    const facts = placementFacts(run, group, name, facilitatorNamesOf(group, uid), groupEmailFacts(group));
    const written = composePlacementEmail(templates.allocated, facts);
    if (!written.ok && !refusedPeople.has(group.id)) {
      refusedPeople.set(group.id, {
        name: group.name.trim(),
        problems: written.problems,
        ...(written.problems.some((problem) => problem.kind === "no-first-session")
          ? { noFirstSession: whyNoFirstSession(run, group) }
          : {}),
      });
    }
    return written.ok ? { subject: written.subject, blocks: written.blocks } : null;
  };
  for (const { row, group, name, to } of addressed) {
    const written = incubator ? writeIncubatorStart(group, name) : writePlacement(group, name, row.uid);
    // A saved note goes above the site's own details, in this email only.
    const note = noteFor.get(row.uid);
    people.push({
      uid: row.uid,
      name,
      to,
      groupId: group.id,
      groupName: group.name,
      email: written && note?.state === "noted" ? withPlacementNote(written, note.text) : written,
    });
  }

  // ── Who each facilitators' email counts ─────────────────────────────────
  // The people in each group this press writes to (`writesIn`, above).
  // A facilitator is told about a group once somebody in it is told: a group
  // whose people this press cannot write to waits, as an empty one does, for
  // the press that tells somebody there.
  const owedFacilitators = mayTell.filter(
    (slot) => (toldIn.get(slot.group.id) ?? 0) + (writesIn.get(slot.group.id) ?? 0) > 0,
  );

  // ── Week 1's guide on the group page ─────────────────────────────────────
  // "Their names and week 1’s guide are on your group page." is said only
  // when that page shows it. A facilitator's group page links "Facilitator
  // guide for week N" on its ticket, for the group's next session, when week
  // N of the course's facilitator guide has its session plan or its notes.
  // So it is said while the group's next session is its week 1 and the
  // guide has week 1, asked through the guide's own gate for the group's
  // facilitators (`facilitatorGuideReaderForGroup`), once per course: the
  // guide's list of titles, of which only the week numbers are used, and
  // never what a document says.
  const weekOneGuide = new Map<string, boolean>();
  const guideWeeks = new Map<string, ReadonlySet<number>>();
  for (const group of new Map(owedFacilitators.map(({ group }) => [group.id, group])).values()) {
    const next = sessionRange(resolveSessions(run, group), now).next;
    const reader = next?.weekNumber === 1 ? await facilitatorGuideReaderForGroup(db, group) : null;
    if (reader && !guideWeeks.has(reader.courseId)) {
      guideWeeks.set(reader.courseId, new Set((await readGuideIndex(db, reader)).weeks.map((week) => week.weekNumber)));
    }
    weekOneGuide.set(group.id, reader ? (guideWeeks.get(reader.courseId)?.has(1) ?? false) : false);
  }

  // ── The facilitators' emails ────────────────────────────────────────────
  // THE GROUP'S SIZE IN A FACILITATOR'S EMAIL is the people in it who will
  // have been told once this press is done: those told already and those it
  // writes to, never somebody it cannot write to and never somebody untold,
  // so it is the number of names their roster shows them. Whether a send
  // fails is known only as the press sends, so each email is written here,
  // before anything goes, for every number the group can come to, and
  // Publish sends the one that is true once the people's emails are done
  // (`facilitatorEmailFor`). `email` is the one for every send going, which
  // is what "Send a test to me" shows.
  const facilitators: PlannedFacilitator[] = [];
  const refusedFacilitators = new Map<string, RefusedFacilitatorGroup>();
  const writeFacilitating = (facts: FacilitatingFacts) => composeFacilitatingEmail(templates.facilitating, facts);
  for (const slot of owedFacilitators) {
    const { group, uid } = slot;
    const data = users.get(uid);
    const name = data ? displayNameOf(data) : "NAISI member";
    const others = group.facilitatorUids
      .filter((other) => other !== uid)
      .map((other) => {
        const otherData = users.get(other);
        return otherData ? firstNameOf(otherData) : "";
      })
      .filter(Boolean);
    const term = groupTerm(run, group);
    const toldBefore = toldIn.get(group.id) ?? 0;
    const size = toldBefore + (writesIn.get(group.id) ?? 0);
    const facts: FacilitatingFacts = {
      name,
      courseTitle: run.courseTitle,
      runLabel: run.label,
      groupName: group.name.trim() || null,
      weeklySlot: weeklySlotWords(group.session),
      // From the next session once the group has met (`facilitatingFrom`).
      firstSession: facilitatingFrom(run, group, now),
      lastSession: term.last,
      // The weekly slot's own place, not one week's change of room.
      where: placementWhere(group.session, null),
      coFacilitators: others.length > 0 ? namesInWords(others) : null,
      groupSize: size,
      groupUrl: groupPageUrl(runId, group.id),
      leadName: naming.programmeName ? leadName : null,
      programmeName: naming.programmeName,
      weekOneGuide: weekOneGuide.get(group.id) ?? false,
    };
    const written = writeFacilitating(facts);
    if (!written.ok && !refusedFacilitators.has(group.id)) {
      refusedFacilitators.set(group.id, {
        name: group.name.trim(),
        problems: written.problems,
        ...(written.problems.some(
          (problem) => problem.kind === "missing" && (problem.token === "firstSession" || problem.token === "lastSession"),
        )
          ? { noFirstSession: whyNoFirstSession(run, group) }
          : {}),
      });
    }
    const emailBySize = new Map<number, WrittenEmail>();
    if (written.ok) {
      emailBySize.set(size, { subject: written.subject, blocks: written.blocks });
      // And for fewer, should sends to people in the group fail. Never for
      // nobody: a group nobody in which is told has no facilitator to tell.
      for (let fewer = Math.max(1, toldBefore); fewer < size; fewer += 1) {
        const again = writeFacilitating({ ...facts, groupSize: fewer });
        if (again.ok) emailBySize.set(fewer, { subject: again.subject, blocks: again.blocks });
      }
    }
    facilitators.push({
      uid,
      name,
      to: emailOf(data) || null,
      groupId: group.id,
      groupName: group.name,
      markerId: slot.markerId,
      email: written.ok ? { subject: written.subject, blocks: written.blocks } : null,
      toldBefore,
      emailBySize,
    });
  }

  // ── "Ana and Raj have joined Group B" ───────────────────────────────────
  // Each facilitator already told about a group (they hold its marker) in
  // which this press writes to somebody, once per press, naming each person
  // not announced to them before. Never the lead (left out of the slots
  // above), and never a facilitator about themselves.
  const writtenTo = new Map<string, { uid: string }[]>();
  for (const person of addressed) {
    if (!person.to) continue;
    const list = writtenTo.get(person.group.id) ?? [];
    list.push({ uid: person.row.uid });
    writtenTo.set(person.group.id, list);
  }
  const toldSlots = facilitatorSlots.filter((slot) => toldMarkers.has(slot.markerId) && writtenTo.has(slot.group.id));
  const pairs = toldSlots.flatMap((slot) =>
    (writtenTo.get(slot.group.id) ?? [])
      .filter((person) => person.uid !== slot.uid)
      .map((person) => ({ slot, uid: person.uid, markerId: joinedMarkerId(runId, slot.group.id, slot.uid, person.uid) })),
  );
  const announced = pairs.length
    ? new Set(
        (await db.getAll(...pairs.map((pair) => db.collection(NUDGES).doc(pair.markerId))))
          .filter((snap) => snap.exists)
          .map((snap) => snap.id),
      )
    : new Set<string>();
  const facilitatorData = toldSlots.length ? await readUsers(db, toldSlots.map((slot) => slot.uid).filter((uid) => !users.has(uid))) : new Map();
  const joined: PlannedJoined[] = [];
  for (const slot of toldSlots) {
    const due = pairs.filter((pair) => pair.slot === slot && !announced.has(pair.markerId));
    if (due.length === 0) continue;
    const data = users.get(slot.uid) ?? facilitatorData.get(slot.uid);
    const toldBefore = toldIn.get(slot.group.id) ?? 0;
    const people = due.map((pair) => {
      const account = users.get(pair.uid);
      return { uid: pair.uid, firstName: (account ? firstNameOf(account) : "") || "Somebody new", markerId: pair.markerId };
    });
    const facts: PlannedJoined["facts"] = {
      firstName: data ? firstNameOf(data) : "",
      groupName: slot.group.name.trim(),
      weeklySlot: weeklySlotWords(slot.group.session),
      groupUrl: groupPageUrl(runId, slot.group.id),
      leadName: naming.programmeName ? leadName : null,
      programmeName: naming.programmeName,
    };
    joined.push({
      uid: slot.uid,
      name: data ? displayNameOf(data) : "NAISI member",
      to: emailOf(data) || null,
      groupId: slot.group.id,
      groupName: slot.group.name,
      toldBefore,
      people,
      facts,
      email: composeJoinedEmail({
        ...facts,
        joined: people.map((person) => person.firstName),
        groupSize: toldBefore + (writesIn.get(slot.group.id) ?? 0),
      }),
    });
  }

  // A group whose people's email cannot be written is refused for that, in
  // the people's words, and its facilitators' email adds nothing new to say:
  // its sentences are for groups the first list does not name.
  const facilitatorOnly = [...refusedFacilitators.entries()]
    .filter(([groupId]) => !refusedPeople.has(groupId) && !refusedIncubator.has(groupId))
    .map(([, refused]) => refused);
  const refusals = [
    ...placementRefusal([...refusedPeople.values()]),
    ...incubatorStartRefusal([...refusedIncubator.values()]),
    ...facilitatingRefusal(facilitatorOnly),
  ];

  return {
    adminOnly: false,
    incubator,
    unplaced,
    gaveBack: givenBack,
    refusals: [...new Set(refusals)],
    people,
    facilitators,
    joined,
    outside,
    notesNeeded,
    emptyGroups,
    templates,
    wording,
    test,
    names,
  };
}

// ---------------------------------------------------------------------------
// One press
// ---------------------------------------------------------------------------

export type PressBatch = {
  /** How many emails this press sends: the number on the button. */
  emails: number;
  people: PlannedPerson[];
  facilitators: PlannedFacilitator[];
  /** The facilitators this press tells who has joined their group. */
  joined: PlannedJoined[];
  /** Emails still owed after this press, past the cap. */
  more: number;
  /** People and facilitators owed an email with no address to send it to, by name. */
  noAddress: string[];
};

/**
 * What one press sends, counted the one way: the people owed an email who
 * have an address, then the facilitators, then the facilitators told who has
 * joined their group, at most `MAX_EMAILS_PER_PRESS`.
 */
export function pressBatch(
  plan: Pick<PublishPlan, "people" | "facilitators"> & Partial<Pick<PublishPlan, "joined">>,
): PressBatch {
  const people = plan.people.filter((person) => person.to);
  const facilitators = plan.facilitators.filter((facilitator) => facilitator.to);
  const joinedAll = plan.joined ?? [];
  const joined = joinedAll.filter((letter) => letter.to);
  const takenPeople = people.slice(0, MAX_EMAILS_PER_PRESS);
  const takenFacilitators = facilitators.slice(0, Math.max(0, MAX_EMAILS_PER_PRESS - takenPeople.length));
  const takenJoined = joined.slice(0, Math.max(0, MAX_EMAILS_PER_PRESS - takenPeople.length - takenFacilitators.length));
  const emails = takenPeople.length + takenFacilitators.length + takenJoined.length;
  const noAddress = [
    ...plan.people.filter((person) => !person.to).map((person) => person.name),
    ...plan.facilitators.filter((facilitator) => !facilitator.to).map((facilitator) => facilitator.name),
    ...joinedAll.filter((letter) => !letter.to).map((letter) => letter.name),
  ];
  return {
    emails,
    people: takenPeople,
    facilitators: takenFacilitators,
    joined: takenJoined,
    more: people.length + facilitators.length + joined.length - emails,
    noAddress: [...new Set(noAddress)],
  };
}

/**
 * The "joined your group" email a press sends once its people's emails are
 * done: naming those of `letter.people` whose own email went (`told`), and
 * counting everybody in the group told by then. Null when none of them was
 * told: there is nobody new to announce yet, and the next press will.
 */
export function joinedEmailFor(
  letter: PlannedJoined,
  told: ReadonlySet<string>,
  toldByPress: number,
): { email: WrittenEmail; people: PlannedJoined["people"] } | null {
  const people = letter.people.filter((person) => told.has(person.uid));
  if (people.length === 0) return null;
  return {
    people,
    email: composeJoinedEmail({
      ...letter.facts,
      joined: people.map((person) => person.firstName),
      groupSize: letter.toldBefore + toldByPress,
    }),
  };
}

/**
 * The facilitators' email a press sends once its people's emails are done:
 * the one the plan wrote for the number of people in the group told by then,
 * which is those told before the press and `toldByPress` more. Null when that
 * is nobody: the facilitator waits, as for a group with nobody in it, for the
 * press that tells somebody there.
 */
export function facilitatorEmailFor(facilitator: PlannedFacilitator, toldByPress: number): WrittenEmail | null {
  return facilitator.emailBySize.get(facilitator.toldBefore + toldByPress) ?? null;
}
