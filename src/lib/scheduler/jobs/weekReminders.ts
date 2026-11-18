import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import WeekEmail from "@/emails/WeekEmail";
import { rawCountsFromArchivedGroup } from "@/lib/courses/archivedWeeks";
import { cantMakeItState } from "@/lib/courses/cantMakeIt/model";
import { lineOf } from "@/lib/courses/cantMakeIt/seat";
import { excuseFactsFrom, groupExcusedRequests } from "@/lib/courses/excused/facts";
import { excusalStandsFor } from "@/lib/courses/excused/marking";
import type { FinishRule } from "@/lib/courses/finishing/model";
import { certificateNeedsFor } from "@/lib/courses/finishing/needs";
import { readFinishRule } from "@/lib/courses/finishing/record";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { groupsOfWeeks, hasGroupsByWeek, sessionsWithGroup } from "@/lib/courses/groupsByWeek";
import { sessionsFromJoinWeek } from "@/lib/courses/ownAttendance";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { firstNameOfUser, readNamingProgramme, standingUserOf } from "@/lib/courses/programmeLead";
import { cardChangeFacts, coveredWeeks } from "@/lib/courses/sessionChange/model";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { isBlockWeek, type WeekBlock } from "@/lib/courses/weekBlocks/model";
import { weekTaskNeeds, type TaskNeeds } from "@/lib/courses/weekBlocks/progress";
import {
  WEEK_REMINDER_DAYS,
  reminderPlaceOf,
  weekEmailSendAt,
  weekLeft,
  type ReminderDays,
} from "@/lib/courses/weekEmails/model";
import {
  sessionReminderEmailWords,
  weekReminderEmailWords,
  type ReminderWeek,
} from "@/lib/courses/weekEmails/words";
import { weekAsksForWriting, weekDone, weekWritingNeeds } from "@/lib/courses/weekWork/model";
import {
  loadPeopleWeekFacts,
  loadRunWeekStates,
  type PersonWeekFacts,
  type RunWeekStates,
} from "@/lib/courses/weekWork/readers";
import {
  resolveNoticeAudience,
  type CohortAudience,
} from "@/lib/email/courseFacilitatorEmails";
import { courseNudgeSessionWhere, courseProgrammeUrl, courseWeekUrl } from "@/lib/email/courseNudgeEmail";
import { sendNotice } from "@/lib/email/notice";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { firstWord } from "@/lib/firestore/applicationEmails";
import { attendanceDocId, normalizeCourseAttendance } from "@/lib/firestore/courseAttendance";
import { normalizeCourseEnrolment, placementIsTold, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import {
  GROUP_FIELD_LIMITS,
  campusForWeek,
  normalizeCourseGroup,
  sessionModeForWeek,
  type CourseGroupDoc,
} from "@/lib/firestore/courseGroups";
import {
  normalizeCourseRun,
  validateSubmissionUrl,
  weekDocId,
  type CourseRunDoc,
  type CourseRunStatus,
} from "@/lib/firestore/courses";
import {
  SCHEDULER_MARKERS_COLLECTION,
  claim,
  isStaleWork,
  stampError,
  stampSentOrSettle,
  stampSkipped,
  weekReminderMarker,
} from "../markers";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/**
 * `courses-week-reminders`: THE REMINDERS BEFORE A SESSION. 3 days and 1 day
 * before each of a group's sessions, at 9am in London, one email to each
 * person due at it: that week's day, time and place, how to say they can't
 * make it, what a certificate needs where the run has a rule, and what is
 * left of their week if anything is. "Week N is open", 6 days before, says
 * what the week is; these say when and where it meets, to everybody who
 * should be there.
 *
 * ── A NOTICE ────────────────────────────────────────────────────────────────
 * Reminders before a session are part of running the programme (privacy
 * policy v21, "Reminders"), so they reach everybody holding a place in the
 * group whatever they unsubscribed from (`resolveNoticeAudience`), say why
 * above their words, carry no unsubscribe link, and go by email alone,
 * through the notice lane's door (`sendNotice`, surface
 * `course-week-reminder`).
 *
 * ── WHO IS DUE AT THE SESSION ───────────────────────────────────────────────
 * Every active learner whose group FOR THE SESSION'S WEEK is this group (the
 * notice audience asked for the week) and who has been told their group.
 * Never a facilitator. Who of them is sent what is decided in ONE place,
 * `sessionReminderVerdict`, for each person at the moment the email would go:
 *
 *  - due at the session: the reminder of the session
 *    (`sessionReminderEmailWords`), with what is left of each week the
 *    session covers for them that is not done, and with no list once
 *    everything is done;
 *  - NOT COMING (an excusal for this session stands, approved or on their own
 *    word: they said they can't make it, or ticked it under "Most weeks, not
 *    all"; read as the register reads it, `excusalStandsFor`, and as the
 *    programme page's ticket does, `cantMakeItState`): never told to come.
 *    With something of the week left, the reminder about what is left in its
 *    own words (`weekReminderEmailWords`); with nothing left, nothing, and the
 *    marker says `excused`.
 *
 * ── WHAT IS LEFT, AND DONE ──────────────────────────────────────────────────
 * The one meaning of done (`weekDone`, `src/lib/courses/weekWork/model.ts`):
 * submitted, when the week asks for anything written, and every reading and
 * step its tasks count ticked. Done no longer stops the reminder: it stops
 * the list. Only weeks written as blocks and published have a list: a week
 * written before blocks has no Submit and no lock. A session whose weeks have
 * none of them written as blocks and published is reminded about by nobody,
 * as before. A session that covers two weeks (the one after a cancelled
 * session, keeping pace) lists each week not done, each with its own list,
 * for the people whose week it was this group's: somebody moved here
 * mid-term is never told here about a covered week they spent in another
 * group.
 *
 * ── THE DAY, TIME AND PLACE ARE THAT WEEK'S ─────────────────────────────────
 * From the one resolver every reader of a session uses (`resolveSessions`): a
 * moved week's new day and room, a week with its own room, a week whose room
 * was cleared ("to be confirmed", never the group's usual room then), a week
 * held online (`reminderPlaceOf`), which says the link is on their programme
 * page only when one is set for that week. Never a meeting link. Its button
 * opens their programme page.
 *
 * ── ONE EACH ────────────────────────────────────────────────────────────────
 * One marker per person per reminder
 * (`schedulerMarkers/weekremind__{groupId}__{sessionKey}__{uid}__{3|1}`),
 * claimed before the send and stamped after it, so two ticks at once send
 * once and a crash re-sends nothing twice. Somebody claimed and not sent is
 * stamped with why: `excused` (not coming, and nothing of the week left),
 * `locked` (the programme has closed, so it takes no more work; `submitted`
 * on a marker written while weeks locked at the old Submit), `joined-late`
 * (the week's session started before they were told their group, or they
 * have none), `stale` (the tick was down too long), and the notice
 * audience's own reasons for leaving somebody out: `no-account`,
 * `no-address`, `same-inbox`, `suppressed`. `done` is no longer a reason:
 * it is on markers written before everybody due was reminded. Somebody who
 * left the programme no longer holds a place and is not in the audience at
 * all, so no marker is written for them.
 *
 * ── WHEN ────────────────────────────────────────────────────────────────────
 * A reminder is due from 9am on its day until `maxLateHours` later, and never
 * once the session has started. A reminder later than that is stamped
 * `stale` for the people it never reached, once, for a day after it went
 * stale, and then left alone: the arithmetic is redone every tick, and the
 * markers are the record.
 *
 * ── IT SHIPS SWITCHED OFF ───────────────────────────────────────────────────
 * `enabledByDefault: false`: it emails people. Prove it on dev with Run now,
 * on a run the test harness made: Run now reaches every live run with a
 * session 1 or 3 days away.
 */

const JOB_ID = "courses-week-reminders";

/** The same allowlist every course job uses. An allowlist, so a status added later fails closed. */
const LIVE_STATUSES: CourseRunStatus[] = ["applications-open", "applications-closed", "running"];

/** Live runs one pass will consider. Far above anything planned; logged when hit. */
const MAX_CANDIDATE_RUNS = 200;

/** Groups read per run. Runs have single-figure group counts; logged when hit. */
const GROUP_PAGE_SIZE = 50;

/** This job's own share of the tick, floored by what the tick has left. */
const SCAN_BUDGET_MS = 10_000;

/**
 * How long after a reminder went stale it is still looked at, to stamp
 * `stale` on the markers of the people it never reached. After that it is
 * left alone, so a quiet tick does no work for a reminder long gone.
 */
const STALE_REPORT_HOURS = 24;

/** This lane's voice in the shared audience derivation, counted on one group. */
const LANE = {
  logTag: "courses week reminders",
  overCapAdvice: "split the group",
} as const;

type Pass = { sent: number; skipped: number; failed: number };

/** One run's lazily read state, shared by every group in it. */
type RunState = {
  run: CourseRunDoc;
  liveGroups: CourseGroupDoc[];
  /** Every group of the run read, archived ones too: a moved person's weeks in a group archived since. */
  allGroups: CourseGroupDoc[];
  weekStates: RunWeekStates | null;
  /** What the reminders of the session read about the run's people, once a pass, when the first one goes. */
  people: RunPeople | null;
  /** Registers read this pass, by document id (undefined: none yet), so each is read once. */
  registers: Map<string, Record<string, unknown> | undefined>;
  /** Each group's facilitators who still stand behind the role, read once a pass. */
  facilitators: Map<string, Array<{ uid: string; firstName: string }>>;
};

/** The run's seats, its rule for who finished, whether it is an incubator's, and its programme's name. */
type RunPeople = {
  seats: Map<string, CourseEnrolmentDoc>;
  rule: FinishRule | null;
  incubator: boolean;
  /** The short name of the programme that names the run, else the course's title: the notice line names it. */
  programmeName: string;
};

type TickState = {
  db: Firestore;
  ctx: JobContext;
  appUrl: string;
  deadlineMs: number;
};

/** A reminder that is due, or freshly stale, for one session of one group. */
type DueReminder = {
  session: ResolvedSession;
  daysBefore: ReminderDays;
  sendAt: Date;
  startsAt: Date;
  stale: boolean;
};

/** One week a reminder may be about, as this group sees it. */
type ReminderWeekInfo = {
  weekNumber: number;
  blocks: readonly WeekBlock[];
  tasks: TaskNeeds[];
  writes: boolean;
  /** Everything the week asks to be written, for a week whose tasks count nothing (`weekWritingNeeds`). */
  asks: TaskNeeds;
  facts: Map<string, PersonWeekFacts>;
};

async function readCandidateRunIds(db: Firestore): Promise<string[]> {
  const snap = await db
    .collection("courseRuns")
    .where("status", "in", LIVE_STATUSES)
    .select()
    .limit(MAX_CANDIDATE_RUNS)
    .get();
  if (snap.size >= MAX_CANDIDATE_RUNS) {
    console.warn(`[scheduler:${JOB_ID}] candidate run cap reached; some live runs were not scanned`, snap.size);
  }
  return snap.docs.map((doc) => doc.id).sort();
}

/**
 * The reminders due now for one group, and those freshly stale: every
 * session that meets and can be dated, each of its two reminders from 9am on
 * its day until the session starts, no further back than `maxLateHours` and
 * the stale report's day.
 */
export function dueReminders(
  sessions: readonly ResolvedSession[],
  now: Date,
  maxLateHours: number,
): DueReminder[] {
  const out: DueReminder[] = [];
  for (const session of sessions) {
    if (session.cancelled) continue;
    const { startsAt } = sessionInstants(session);
    if (!startsAt || now.getTime() >= startsAt.getTime()) continue;
    for (const daysBefore of WEEK_REMINDER_DAYS) {
      const sendAt = weekEmailSendAt(session.dateKey, daysBefore);
      if (!sendAt || now.getTime() < sendAt.getTime()) continue;
      if (isStaleWork(sendAt, now, maxLateHours + STALE_REPORT_HOURS)) continue;
      out.push({ session, daysBefore, sendAt, startsAt, stale: isStaleWork(sendAt, now, maxLateHours) });
    }
  }
  return out;
}

/**
 * What one person is owed by one reminder, or why nothing:
 *  - `session`: the reminder of the session, about `weeks` (their weeks of
 *    it), with `left` for each of them not done (empty when all are);
 *  - `left`: they will not be at the session, and something of the week is
 *    left: the reminder about what is left, in its own words;
 *  - nothing, and why.
 */
export type SessionVerdict =
  | { send: "session"; weeks: number[]; left: ReminderWeek[] }
  | { send: "left"; weeks: ReminderWeek[] }
  | { send: false; why: "excused" | "locked" | "joined-late" };

/**
 * WHO OF THE PEOPLE DUE AT A SESSION IS SENT WHAT: the one place the
 * reminders decide it, for one person, at the moment the email would go.
 *
 * Their weeks of the session: each week it covers that was this group's for
 * them (`belongs`) and still takes their work. A week the programme has
 * closed is nobody's to be reminded of (`locked`), and a covered week whose
 * session started before they were told their group is not theirs
 * (`joined-late`). With no week left theirs, nothing, and the first of those
 * reasons. Of their weeks, each written as blocks and published (`weeks`)
 * that is not done is listed, with what is left of it.
 *
 * Somebody who will not be at the session (`notComing`) is never told to
 * come: what is left, in the reminder's own words, or nothing (`excused`).
 * Everybody else due at it is reminded of the session, done or not.
 */
export function sessionReminderVerdict(input: {
  uid: string;
  /** The weeks the session covers, oldest first (`coveredWeeks`). */
  covered: readonly number[];
  /** Whether a covered week was this group's for them (`RunWeekStates.belongsTo`). */
  belongs: (weekNumber: number) => boolean;
  /** The covered weeks written as blocks and published, with their facts. */
  weeks: readonly ReminderWeekInfo[];
  weekStates: RunWeekStates;
  notComing: boolean;
}): SessionVerdict {
  const { uid, weekStates } = input;
  const theirs: number[] = [];
  const remind: ReminderWeek[] = [];
  let why: "locked" | "joined-late" | null = null;
  for (const weekNumber of input.covered) {
    if (!input.belongs(weekNumber)) continue;
    const state = weekStates.stateOf(uid, weekNumber);
    // No more work can be done in it: the programme has closed.
    if (state.kind === "closed") {
      why ??= "locked";
      continue;
    }
    if (state.due.by === "joined-late" || state.due.by === "no-group") {
      why ??= "joined-late";
      continue;
    }
    theirs.push(weekNumber);
    // The entry for the week that holds this person: one per week today, and
    // more than one once a week can be read on more than one copy.
    const week = input.weeks.find((each) => each.weekNumber === weekNumber && each.facts.has(uid));
    const own = week?.facts.get(uid);
    if (!week || !own) continue;
    // The one meaning of done: a week done has nothing to list.
    if (weekDone({ tasks: week.tasks, state: own.state, submitted: state.submittedAt !== null, asks: week.asks })) continue;
    remind.push({
      weekNumber: week.weekNumber,
      left: weekLeft({ blocks: week.blocks, tasks: week.tasks, state: own.state }),
      writes: week.writes,
    });
  }
  // The session's own week is always theirs (the audience is asked for it),
  // so nothing is theirs only when the programme has closed or they joined late.
  if (theirs.length === 0) return { send: false, why: why ?? "joined-late" };
  if (input.notComing) return remind.length > 0 ? { send: "left", weeks: remind } : { send: false, why: "excused" };
  return { send: "session", weeks: theirs, left: remind };
}

/**
 * WHETHER THE PERSON'S PROGRAMME PAGE SHOWS THIS GROUP'S SESSION, its card
 * with "Can't make it" and its link: the reminder says those two only when it
 * does. The page draws its card from the group their place is in now
 * (`groupId`): the overview builds the card on that group, offers "Can't make
 * it" only on its own next session (`ticketEntryOf`), and shows a link only
 * to somebody whose place is in the group (`seesSessionLink`). So somebody
 * moved to another group from a later week, still reminded by the group they
 * are leaving for the weeks before, has no card for its session.
 *
 * The rule is about what their page shows, not about another group as such:
 * somebody on a one-week visit has a card for the host's session, so this is
 * where a visit, once recorded, makes it true for the host.
 */
export function programmePageShowsSession(place: Pick<CourseEnrolmentDoc, "groupId"> | null, groupId: string): boolean {
  return place?.groupId === groupId;
}

/**
 * The weeks one session's reminder is about: each it covers, written as
 * blocks and published, on the copy each person reads it on. A covered week
 * is this session's work only for the people whose work for it is due at
 * this group's session (`RunWeekStates.dueWith`): somebody moved here
 * mid-term is not reminded here about a week they spent in another group,
 * whose work was due at that group's session ("Week N is open" names it, on
 * their own copy, if it is not done); somebody visiting for one week is
 * reminded here about that week alone, never about another week the session
 * covers. Each person's week is judged on the copy they work in
 * (`RunWeekStates.copyGroupOf`): a visitor's on their own group's, so a
 * week finished on it is never named as not done because the host's copy
 * asks something more. One entry per week and copy, each with the facts of
 * its own people only. With no record and no visit, everybody for every
 * week, on the group's copy, as always.
 */
async function reminderWeeks(
  db: Firestore,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  sessions: readonly ResolvedSession[],
  session: ResolvedSession,
  uids: readonly string[],
  weekStates: RunWeekStates,
): Promise<ReminderWeekInfo[]> {
  const out: ReminderWeekInfo[] = [];
  for (const weekNumber of coveredWeeks(sessions, session)) {
    const theirs = uids.filter((uid) => weekStates.dueWith(uid, group.id, weekNumber));
    if (theirs.length === 0) continue;
    // The people due here, by the copy of the week each works in: the group's own for everybody whose weeks do not differ.
    const byCopy = new Map<string, string[]>();
    for (const uid of theirs) {
      const copy = weekStates.copyGroupOf(uid, weekNumber, group.id);
      byCopy.set(copy, [...(byCopy.get(copy) ?? []), uid]);
    }
    for (const [copy, people] of byCopy) {
      const { week } = await resolveWeekDoc(db, run.id, copy, weekDocId(weekNumber));
      if (!week || !week.published || !isBlockWeek(week)) continue;
      const facts = await loadPeopleWeekFacts(db, { runId: run.id, weekNumber, blocks: week.blocks, uids: people });
      out.push({
        weekNumber,
        blocks: week.blocks,
        tasks: weekTaskNeeds(week.blocks),
        writes: weekAsksForWriting(week.blocks),
        asks: weekWritingNeeds(week.blocks),
        facts,
      });
    }
  }
  return out;
}

/**
 * Read cap on one person's own registers, as their programme page caps it:
 * the sessions from the week they joined, each from the group they were in
 * that week. Far past any real term.
 */
const MAX_OWN_REGISTERS = 90;

/** These registers, each read once a pass: by document id, the ones not read yet in one `getAll`. */
async function readRegisters(db: Firestore, runState: RunState, ids: readonly string[]): Promise<void> {
  const unread = [...new Set(ids)].filter((id) => !runState.registers.has(id));
  if (unread.length === 0) return;
  const snaps = await db.getAll(...unread.map((id) => db.collection("courseAttendance").doc(id)));
  snaps.forEach((snap, index) => runState.registers.set(unread[index], snap.exists ? (snap.data() ?? {}) : undefined));
}

/** The run's seats, its rule for who finished and whether an incubator names it: read once a pass. */
async function runPeople(db: Firestore, runState: RunState): Promise<RunPeople> {
  if (runState.people) return runState.people;
  const { run } = runState;
  const [seatsSnap, rule, naming] = await Promise.all([
    db.collection("courseEnrolments").where("runId", "==", run.id).get(),
    // A read that fails says nothing about a certificate, as the programme page.
    readFinishRule(db, run.id).catch(() => null),
    readNamingProgramme(db, run.id).catch(() => null),
  ]);
  // Only a place Publish has told its owner: the certificate sentence is
  // about the group they were told, and the audience holds nobody else.
  const seats = new Map<string, CourseEnrolmentDoc>();
  for (const doc of seatsSnap.docs) {
    const seat = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
    if (seat.runId === run.id && seat.uid && placementIsTold(seat)) seats.set(seat.uid, seat);
  }
  runState.people = {
    seats,
    rule,
    incubator: naming?.kind === "incubator",
    programmeName: naming?.shortName?.trim() || run.courseTitle.trim(),
  };
  return runState.people;
}

/**
 * The group's facilitators who still stand behind the role, with the first
 * name each goes by: who the reminder says the session is with. Read once a
 * pass.
 */
async function standingFacilitatorsOf(
  db: Firestore,
  runState: RunState,
  group: CourseGroupDoc,
): Promise<Array<{ uid: string; firstName: string }>> {
  const known = runState.facilitators.get(group.id);
  if (known) return known;
  const uids = [...new Set(group.facilitatorUids)].filter((uid) => uid && !uid.includes("/"));
  const snaps = uids.length > 0 ? await db.getAll(...uids.map((uid) => db.collection("users").doc(uid))) : [];
  const out: Array<{ uid: string; firstName: string }> = [];
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    if (!isNamedWithStanding(standingUserOf(snap.id, data), "courseGroups.facilitatorUids", group.facilitatorUids)) continue;
    const firstName = firstNameOfUser(data);
    if (firstName) out.push({ uid: snap.id, firstName });
  }
  runState.facilitators.set(group.id, out);
  return out;
}

/**
 * WHO WILL NOT BE AT THIS SESSION: everybody whose excusal for it stands, as
 * the register reads it (`excusalStandsFor`: a request to be excused that was
 * approved, or their line marked excused), and everybody who told us they
 * can't make it, as the programme page's ticket reads it (`cantMakeItState`).
 * One read of the session's register, one of the group's requests.
 */
async function notComingTo(
  db: Firestore,
  runState: RunState,
  group: CourseGroupDoc,
  session: ResolvedSession,
  uids: readonly string[],
  now: Date,
): Promise<Set<string>> {
  const { run } = runState;
  const id = attendanceDocId(run.id, group.id, session.weekNumber, session.occurrence);
  const [requests] = await Promise.all([groupExcusedRequests(db, run.id, group.id), readRegisters(db, runState, [id])]);
  const data = runState.registers.get(id);
  const register = data ? normalizeCourseAttendance(id, data) : null;
  const approved = excuseFactsFrom(requests, { uids: new Set(uids), sessionKeys: [session.sessionKey] })[session.sessionKey] ?? {};
  const out = new Set<string>();
  for (const uid of uids) {
    const stands = excusalStandsFor({
      approved: approved[uid] === "excused",
      mark: register?.records[uid],
      kept: register ? Object.hasOwn(register.excusalKept, uid) : false,
    });
    const told = cantMakeItState({ startsAt: sessionInstants(session).startsAt, cancelled: session.cancelled, line: lineOf(data, id, uid), now }).kind === "told";
    if (stands || told) out.add(uid);
  }
  return out;
}

/**
 * WHAT A CERTIFICATE NEEDS, FOR ONE PERSON: the sentence their programme page
 * says (`certificateNeedsFor`, as the overview route asks it), from the same
 * facts: the run's rule, their place, their group now, each week's group for
 * a place that records a move (and a group archived since, only where its
 * register was finished for a session held), whether they facilitate a group
 * of the run, whether an incubator names the run, and the registers of their
 * own sessions from the week they joined, each from the group they were in
 * that week, read as the page caps them. Never a count of what they missed.
 */
async function certificateFor(db: Firestore, runState: RunState, people: RunPeople, uid: string): Promise<string | null> {
  const seat = people.seats.get(uid) ?? null;
  if (!people.rule || !seat || seat.role !== "learner") return null;
  const { run, liveGroups, allGroups } = runState;
  const facilitating = liveGroups.filter((each) => each.facilitatorUids.includes(uid));
  if (facilitating.length > 0) {
    const snap = await db.collection("users").doc(uid).get();
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    // As the page asks it: a learner who facilitates a group of the run, with standing, is told nothing.
    if (snap.exists && facilitating.some((each) => isNamedWithStanding(standingUserOf(uid, data), "courseGroups.facilitatorUids", each.facilitatorUids))) return null;
  }
  const group = seat.groupId ? (liveGroups.find((each) => each.id === seat.groupId) ?? null) : null;
  const archivedOfRecord = (groupId: string): CourseGroupDoc | null => {
    const each = allGroups.find((candidate) => candidate.id === groupId);
    return each && each.archived && each.runId === run.id ? each : null;
  };
  const sessionsOf = (groupId: string): readonly ResolvedSession[] | null => {
    const live = liveGroups.find((each) => each.id === groupId);
    if (live) return resolveSessions(run, live);
    const archived = archivedOfRecord(groupId);
    return archived ? resolveSessions(run, archived) : null;
  };
  const own: Array<{ groupId: string; session: ResolvedSession }> = !group
    ? []
    : hasGroupsByWeek(seat)
      ? (() => {
          const paired = sessionsWithGroup(seat, sessionsOf);
          const kept = new Set(sessionsFromJoinWeek(paired.map((each) => each.session), seat.joinedWeekNumber).slice(0, MAX_OWN_REGISTERS));
          return paired.filter((each) => kept.has(each.session));
        })()
      : sessionsFromJoinWeek(resolveSessions(run, group), seat.joinedWeekNumber ?? 1)
          .slice(0, MAX_OWN_REGISTERS)
          .map((session) => ({ groupId: group.id, session }));
  const ids = own.map(({ groupId, session }) => attendanceDocId(run.id, groupId, session.weekNumber, session.occurrence));
  await readRegisters(db, runState, ids);
  const registers = new Map<string, Record<string, unknown>>();
  own.forEach(({ groupId, session }, index) => {
    const data = runState.registers.get(ids[index]);
    if (!data) return;
    // A week in a group archived since: its register only once finished, of a session held.
    if (!liveGroups.some((each) => each.id === groupId) && !rawCountsFromArchivedGroup(session, data)) return;
    registers.set(session.sessionKey, data);
  });
  return certificateNeedsFor({
    rule: people.rule,
    run,
    group,
    enrolment: seat,
    facilitates: false,
    incubator: people.incubator,
    registers,
    liveGroups,
    archivedGroups: hasGroupsByWeek(seat) ? groupsOfWeeks(seat).map(archivedOfRecord).filter((each) => each !== null) : [],
  });
}

/** One reminder of one session: each person in the group claimed once, then sent or stamped with why not. */
async function remindForSession(
  state: TickState,
  runState: RunState,
  group: CourseGroupDoc,
  sessions: readonly ResolvedSession[],
  due: DueReminder,
  audience: CohortAudience,
  pass: Pass,
): Promise<"done" | "out-of-time"> {
  const { db, ctx } = state;
  const { run } = runState;
  const everybody = [
    ...audience.members.map((member) => ({ uid: member.uid, member, dropped: null })),
    ...(audience.dropped ?? []).map((drop) => ({ uid: drop.uid, member: null, dropped: drop.why })),
  ].map((person) => ({
    ...person,
    marker: weekReminderMarker(group.id, due.session.sessionKey, person.uid, due.daysBefore),
  }));
  if (everybody.length === 0) return "done";

  // One round trip for this reminder's markers. A settled one (sent, skipped,
  // or given up on) is a person this reminder is finished with, and costs
  // nothing more; every tick of the reminder's day would otherwise claim each
  // of them again only to be told so.
  const markers = await db.getAll(
    ...everybody.map((person) => db.collection(SCHEDULER_MARKERS_COLLECTION).doc(person.marker.id)),
  );
  const people = everybody.filter((_, index) => {
    const data = markers[index].exists ? (markers[index].data() ?? {}) : null;
    return !data || !(data.sentAt || data.skippedReason || data.failedAt);
  });
  if (people.length === 0) return "done";

  // Everybody's weeks on the run, once a pass, before the weeks: whose week each covered week was this group's.
  if (!due.stale && !runState.weekStates) {
    runState.weekStates = await loadRunWeekStates(db, { run, liveGroups: runState.liveGroups, now: ctx.now });
  }
  const weeks = due.stale
    ? []
    : await reminderWeeks(db, run, group, sessions, due.session, people.map((person) => person.uid), runState.weekStates as RunWeekStates);
  if (!due.stale && weeks.length === 0) return "done";
  // The reminder about what is left keeps its own words, the place among them.
  const where = courseNudgeSessionWhere(due.session.session, sessionModeForWeek(group, due.session.weekId), campusForWeek(group, due.session.weekId));
  const covered = coveredWeeks(sessions, due.session);
  // Who will not be at the session, the run's people and the session's
  // facilitators: read once for the reminder, and only when one can go.
  const notComing = due.stale ? new Set<string>() : await notComingTo(db, runState, group, due.session, people.map((person) => person.uid), ctx.now);
  const runFacts = due.stale ? null : await runPeople(db, runState);
  const facilitators = due.stale ? [] : await standingFacilitatorsOf(db, runState, group);
  const { endsAt } = sessionInstants(due.session);
  // A link set for that week, as the programme page's session card reads it.
  const link = cardChangeFacts(sessions, group, due.session, londonDateKey(ctx.now)).next?.meetingUrl ?? null;
  // Shown on the card only when it passes the card's own check.
  const place = reminderPlaceOf(group, due.session, typeof link === "string" && validateSubmissionUrl(link, GROUP_FIELD_LIMITS.meetingUrl) === null);

  for (const person of people) {
    if (Date.now() >= state.deadlineMs || pass.sent >= ctx.maxPerTick) return "out-of-time";
    const { marker } = person;
    const claimed = await claim(db, marker, { job: JOB_ID, policy: ctx.policy });
    if (!claimed.claimed) continue;
    try {
      if (due.stale) {
        await stampSkipped(db, marker.id, "stale", ctx.now);
        pass.skipped += 1;
        continue;
      }
      if (!person.member) {
        await stampSkipped(db, marker.id, person.dropped ?? "no-address", ctx.now);
        pass.skipped += 1;
        continue;
      }
      const weekStates = runState.weekStates as RunWeekStates;
      const verdict = sessionReminderVerdict({
        uid: person.uid,
        covered,
        belongs: (weekNumber) => weekStates.belongsTo(person.uid, group.id, weekNumber),
        weeks,
        weekStates,
        notComing: notComing.has(person.uid),
      });
      if (!verdict.send) {
        await stampSkipped(db, marker.id, verdict.why, ctx.now);
        pass.skipped += 1;
        continue;
      }
      const firstName = firstWord(person.member.ownName);
      const words =
        verdict.send === "left"
          ? weekReminderEmailWords(
              {
                courseTitle: run.courseTitle,
                daysBefore: due.daysBefore,
                sessionAt: due.startsAt,
                where,
                weeks: verdict.weeks,
                weekUrl: courseWeekUrl(state.appUrl, run.id, verdict.weeks[0].weekNumber),
              },
              firstName,
            )
          : sessionReminderEmailWords(
              {
                daysBefore: due.daysBefore,
                sessionAt: due.startsAt,
                endsAt,
                incubator: runFacts?.incubator ?? false,
                groupName: group.name,
                weekNumber: due.session.weekNumber,
                place,
                facilitatorFirstNames: facilitators.filter((each) => each.uid !== person.uid).map((each) => each.firstName),
                certificate: runFacts ? await certificateFor(db, runState, runFacts, person.uid) : null,
                weeks: verdict.weeks,
                left: verdict.left,
                programmeUrl: courseProgrammeUrl(state.appUrl, run.id),
                sessionOnTheirPage: programmePageShowsSession(runFacts?.seats.get(person.uid) ?? null, group.id),
              },
              firstName,
            );
      // ONE address. One message. Never an array, never a Cc.
      const result = await sendNotice({
        to: person.member.address,
        subject: words.subject,
        surface: "course-week-reminder",
        // The reminder of the session says its own reason above the words;
        // the reminder about what is left keeps the reminders' own.
        ...(verdict.send === "session" ? { sessionProgramme: runFacts?.programmeName ?? run.courseTitle } : {}),
        actorUid: JOB_ID,
        referenceId: run.id,
        render: (notice) => WeekEmail({ words, notice }),
      });
      if (result.suppressed.length > 0) {
        await stampSkipped(db, marker.id, "suppressed", ctx.now);
        pass.skipped += 1;
        continue;
      }
      await stampSentOrSettle(db, marker.id, ctx.now);
      pass.sent += 1;
    } catch (err) {
      // Uid only: an address must not reach the logs.
      console.error(`[scheduler:${JOB_ID}] reminder failed`, {
        runId: run.id,
        groupId: group.id,
        sessionKey: due.session.sessionKey,
        uid: person.uid,
        err,
      });
      // Left unsent, so the re-claim rule tries again and, after three
      // tries, it is listed under Stuck sends.
      await stampError(db, marker.id, err).catch(() => {});
      pass.failed += 1;
    }
  }
  return "done";
}

/** One group: its reminders due now, each person once. */
async function remindForGroup(
  state: TickState,
  runState: RunState,
  group: CourseGroupDoc,
  pass: Pass,
): Promise<"done" | "out-of-time"> {
  const { db, ctx } = state;
  const sessions = resolveSessions(runState.run, group);
  const due = dueReminders(sessions, ctx.now, ctx.maxLateHours);
  if (due.length === 0) return "done";
  // Everybody whose group FOR THE SESSION'S WEEK is this one, read once a
  // week for its reminders (`groupForWeek`): somebody moved from a later week
  // is reminded by their old group's session before it, and by their new
  // group's from it. With no record of groups by week anywhere, the people in
  // the group now.
  const audiences = new Map<number, CohortAudience>();
  for (const reminder of due) {
    const weekNumber = reminder.session.weekNumber;
    let audience = audiences.get(weekNumber);
    if (!audience) {
      audience = await resolveNoticeAudience(db, runState.run.id, LANE, { groupId: group.id, weekNumber });
      audiences.set(weekNumber, audience);
      if (audience.refusal) {
        ctx.log("reminders not sent", { runId: runState.run.id, groupId: group.id, refusal: audience.refusal });
      }
    }
    if (audience.refusal) continue;
    if ((await remindForSession(state, runState, group, sessions, reminder, audience, pass)) === "out-of-time") {
      return "out-of-time";
    }
  }
  return "done";
}

async function handler(ctx: JobContext): Promise<JobResult> {
  const db = getAdminDb();
  if (!db) return { processed: 0, hasMore: false, note: "no database" };

  // The button in each reminder links to their programme page (or, in the
  // reminder about what is left, to the week's page), built from this.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (!appUrl) {
    ctx.log("NEXT_PUBLIC_APP_URL is not set, so no reminder can link to the site");
    return { processed: 0, hasMore: false, note: "no site address" };
  }

  const state: TickState = {
    db,
    ctx,
    appUrl,
    deadlineMs: Date.now() + Math.max(0, Math.min(SCAN_BUDGET_MS, ctx.budget.remainingMs())),
  };
  const pass: Pass = { sent: 0, skipped: 0, failed: 0 };
  let hasMore = false;

  runs: for (const runId of await readCandidateRunIds(db)) {
    if (Date.now() >= state.deadlineMs || pass.sent >= ctx.maxPerTick) {
      hasMore = true;
      break;
    }
    // One bad run never stops the pass: it is logged, counted and stepped past.
    try {
      const runSnap = await db.collection("courseRuns").doc(runId).get();
      if (!runSnap.exists) continue;
      const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
      if (!LIVE_STATUSES.includes(run.status)) continue;
      const groupsSnap = await db
        .collection("courseGroups")
        .where("runId", "==", runId)
        .limit(GROUP_PAGE_SIZE)
        .get();
      if (groupsSnap.size >= GROUP_PAGE_SIZE) {
        console.warn(`[scheduler:${JOB_ID}] group cap reached, some groups were not scanned`, {
          runId,
          cap: GROUP_PAGE_SIZE,
        });
      }
      // An archived group is closed: nobody is meeting in it.
      const liveGroups = groupsSnap.docs
        .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
        .filter((group) => !group.archived);
      const allGroups = groupsSnap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}));
      const runState: RunState = { run, liveGroups, allGroups, weekStates: null, people: null, registers: new Map(), facilitators: new Map() };
      for (const group of liveGroups) {
        if ((await remindForGroup(state, runState, group, pass)) === "out-of-time") {
          hasMore = true;
          break runs;
        }
      }
    } catch (err) {
      console.error(`[scheduler:${JOB_ID}] run scan failed`, { runId, err });
      pass.failed += 1;
    }
  }

  ctx.log("pass finished", { ...pass, hasMore });
  const note = [
    `${pass.sent} ${pass.sent === 1 ? "reminder" : "reminders"} sent`,
    pass.skipped > 0 ? `${pass.skipped} skipped` : null,
    pass.failed > 0 ? `${pass.failed} failed` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return { processed: pass.sent, hasMore, note };
}

export const weekRemindersJob: JobRegistration = {
  id: "courses-week-reminders",
  label: "Reminders before a session",
  description:
    "3 days and 1 day before each session, at 9am, emails everybody due at it its day, time and place, with what’s left of their week if anything is. Somebody excused from it is sent only what’s left, if anything is.",
  // Reminders sent per tick, one per person. The budget is the real bound.
  maxPerTick: 100,
  // Half a day: a 9am reminder may go until 9pm, and never once the session
  // has started.
  maxLateHours: 12,
  reclaimAfterMinutes: 20,
  // It emails people.
  enabledByDefault: false,
  handler,
};
