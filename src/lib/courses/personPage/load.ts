import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { loadProgrammePeople } from "@/lib/applications/people/load";
import { statusWords } from "@/lib/applications/people/words";
import { personWeekFor, type WeekGroup } from "@/lib/applications/people/week";
import { notesFor } from "@/lib/applications/arrange/notes";
import { own } from "@/lib/applications/keys";
import type { ApplicationDoc, QuestionSetDoc } from "@/lib/applications/model";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { loadForm, loadQuestionSets } from "@/lib/applications/repo";
import { rankedProgrammes } from "@/lib/applications/sections";
import { loadApplication } from "@/lib/applications/staffRepo";
import { wouldFacilitate } from "@/lib/courses/facilitatorAsks/rules";
import { readsTimeAnswers, runStaffingOf } from "@/lib/courses/runStaffing";
import { currentTimeAnswer, timeQuestionSinceOf } from "@/lib/courses/timeAnswer/model";
import { NO_WORK, chooseOneIdsOf, workKey, type CourseworkPerson, type CourseworkWeek, type PersonWork } from "@/lib/courses/coursework/model";
import { courseworkRows } from "@/lib/courses/coursework/overview";
import { columnsOf, namesOf, weeksRead } from "@/lib/courses/coursework/reads";
import { peopleOf, placedIn, readRunSeats } from "@/lib/courses/coursework/load";
import { readRunCoursework } from "@/lib/courses/facilitatorWeek/readers";
import { readOwnFeedback, cardNamesOf } from "@/lib/courses/feedback/readers";
import { weeklySlotWords } from "@/lib/courses/facilitatingEmail";
import { resolveGroupCalendar, type GroupCalendar } from "@/lib/courses/groupResolve";
import { differsByWeek } from "@/lib/courses/groupsByWeek";
import { readPackCaseRecords } from "@/lib/courses/packsAndCases/readers";
import { buildRunAttendance, groupSessions, readRunRecords, type GroupSessionFacts, type RunRecords } from "@/lib/courses/programmeAttendance";
import { dayWords } from "@/lib/courses/sessionChange/words";
import { MOVE_LINK } from "@/lib/courses/staffMove/words";
import { VISIT_LINK } from "@/lib/courses/visit/words";
import { runEndOf } from "@/lib/courses/finishing/runEnd";
import { copiesOf, readsGroupIdFor } from "@/lib/courses/weekCopy";
import { addDaysToKey, isValidDateKey, londonDateKey, londonWallClockToInstant, weekOpensOn } from "@/lib/courses/weekPlan";
import { mayRateWorkOf } from "@/lib/courses/workRatings/access";
import { readPersonRatings } from "@/lib/courses/workRatings/readers";
import { liveGroupsOf, ownerFactsFromSeat, reviewerFactsOf, writtenReviewRole } from "@/lib/courses/writtenAnswers/access";
import { eventsOfPersonInTerm, type TermWindow } from "@/lib/events/missedEvents";
import { COURSE_AUDIT_COLLECTION, normalizeCourseAudit } from "@/lib/firestore/courseAudit";
import { normalizeUser } from "@/lib/firestore/users";
import { goByNameOf } from "@/lib/names/staffName";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import {
  courseEnrolmentId,
  groupForWeek,
  normalizeCourseEnrolment,
  ownGroupForWeek,
  placementIsShownTo,
  visitInWeek,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { feedbackIsClaimed } from "@/lib/firestore/courseFeedback";
import { legacyCardId } from "@/lib/courses/feedback/model";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { isAddressableId } from "@/lib/addressableId";
import {
  activityOf,
  attendanceViewOf,
  claudeLinesOf,
  elsewhereLineOf,
  feedbackLinesOf,
  personFreeViewOf,
  placeLinesOf,
  ratingColumnOf,
  timeAnswerLinesOf,
  weekRowOf,
  weeklyWords,
  type AttendanceWeekFact,
  type FacilitatorPersonView,
  type FeedbackFact,
  type PersonAbout,
  type PersonFreeView,
  type PersonWeekRow,
  type TeamPersonView,
  type VisitHistoryFact,
} from "./model";
import {
  BACK_TO_GROUP,
  BACK_TO_PEOPLE,
  NOT_IN_A_GROUP,
  OPEN_THEIR_APPLICATION,
  appliedWords,
  groupLineWords,
  joinedMonthWords,
  openAccountWords,
  signedUpWords,
  whoSeesWeekWords,
} from "./words";

/**
 * A PERSON'S PAGE, READ (Wed 18 Nov 2026): one person on a programme, for the
 * team, and a facilitator's cut of it. Every section asks the gate the site
 * already has for its data, and a section a reader may not see is never
 * read for them, so it cannot leave the server.
 *
 * THE TEAM'S PAGE (`loadTeamPersonPage`), `.../programmes/[programmeId]/people/[uid]`:
 *  - WHO: the programme's existing gate (`loadProgrammeRun`, decided from the
 *    form before anything else is read): an admin or the programme's lead.
 *    A reviewer is answered `not-yours`; anybody with no role on the
 *    programme, a lead of another programme among them, as for a programme
 *    that is not there. Then the person must be a row of the People tab for
 *    this reader (`loadProgrammePeople`, the tab's own loader and gate, whose
 *    rows are the people whose application the reader may open); anybody
 *    else, whether or not the account exists, gets one calm answer.
 *  - HEADER, APPLICATION AND MOVE: the person's People tab row, as the tab
 *    works it out: where the place stands, the link to their application
 *    (`canReadApplication`, the review screens' rule) and the link to Move
 *    (the tab's own conditions).
 *  - COURSEWORK: the Coursework tab's own reads and rules for one row
 *    (`readRunCoursework` with nobody's words, `courseworkRows`), each week on
 *    the copy the person worked in (`readsGroupIdFor`).
 *  - RATINGS FOR THE TEAM: read only when `mayRateWorkOf` admits the reader
 *    (`readsWorkRatings`: an admin, or the programme's lead while they stand;
 *    and never the reader's own work). Absent for everybody else.
 *  - ATTENDANCE: the one record of a person's attendance
 *    (`buildRunAttendance`, each week off the register of the group they were
 *    in that week), drawn for this reader as the Attendance tab draws it.
 *  - FEEDBACK: who wrote each piece about them on the run, when, and its
 *    email; never its words.
 *  - NOTES: drawn by the notes' own component through their own routes,
 *    which ask again who reads which note. Never on the reader's own page.
 *  - EVENTS AND ACTIVITY: an admin's alone (the owner's decision). Events are
 *    the events tree's own reader (`eventsOfPersonInTerm`), with a count of
 *    the events they signed up to in the run's dates (`termOf`) and, over
 *    the events the rule on missed events counts (`countedEvents`), how many
 *    they came to; activity is made from records this page has
 *    already read, and the History rows one-week visits wrote about them
 *    (`visitHistoryOf`). Neither is read for anybody else.
 *  - THE HEAD'S DETAILS: the name they go by and the month they joined (their
 *    account's approval, or its making where none is on record), for an admin
 *    and the lead; their account's address for an admin ALONE, never put in
 *    the view for anybody else. Visit and Move are the People tab's one
 *    decision (`movingLinks`).
 *  - VISITS: a one-week visit that stands, to a session still happening, is
 *    named on its week's attendance line and coursework row and counted;
 *    one called off, or whose session was called off, is no visit here.
 *  - PLACE AND GROUP: where the place stands (the People tab's row), and for
 *    somebody holding one the day decision day or their yes to an invitation
 *    put them on it (read only where the People tab hands the application's
 *    link); their group as the Coursework tab shows it to this reader, with
 *    the day Publish's email about it went; whether they said they're coming.
 *  - WHEN THEY'RE FREE: the one gated read of the week they marked
 *    (`personWeekFor`, `src/lib/applications/people/week.ts`), which answers
 *    the week only where `canReadApplication` admits this reader (an admin,
 *    and the programme's lead for every row of their People tab), and for
 *    anybody else one sentence and nothing derived from the week. Never on
 *    the reader's own page, never sent to Claude, never in an email. Under
 *    it, their answer about their group's time, for a reader the board reads
 *    it to (`readsTimeAnswers`).
 *  - THE APPLICATION'S LINE: read only where the People tab hands the link
 *    (`applicationFactsOf`): the day they applied, the programmes they
 *    ranked, and whether they offered to facilitate this programme.
 *  - CLAUDE AND PANGRAM, AND THE ACCOUNT: an ADMIN's alone. Claude's and
 *    Pangram's earlier reads (`notesFor`, Circles' reader) are read only once
 *    the reader is known to be an admin, never about themselves; the link to
 *    their page under Accounts is put in the view for an admin alone.
 *
 * THE FACILITATOR'S CUT (`loadFacilitatorPersonPage`), behind their group's
 * door: a facilitator with standing of a live group, about somebody in that
 * group now whose work the one gate lets them read (`writtenReviewRole`).
 * The weeks the person spent in that group, their attendance for those weeks
 * (a week they visited another group's session among them, named as such),
 * and the feedback that facilitator wrote. Nothing else.
 *
 * Nothing here writes.
 */

/** Why there is nobody to show: one answer, whatever the reason. */
export type TeamPersonOutcome =
  | { status: "none" }
  | { status: "not-yours" }
  | { status: "not-here"; back: string }
  | { status: "ok"; view: TeamPersonView };

function programmePath(roundId: string, programmeId: string): string {
  return `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}`;
}

/** Each week a person reads, on the copy they worked in: one `weeksRead` per group their weeks name. */
async function weeksForPerson(
  db: Firestore,
  runId: string,
  person: Pick<CourseworkPerson, "readsGroupId" | "readsCopies">,
): Promise<{ runWeeks: Map<number, CourseworkWeek | null>; weekOf: (weekNumber: number) => CourseworkWeek | null }> {
  const groupIds = [...new Set([person.readsGroupId, ...(person.readsCopies ?? []).map((entry) => entry.groupId)].filter((id): id is string => !!id))];
  const [runWeeks, ...lists] = await Promise.all([weeksRead(db, runId, null), ...groupIds.map((id) => weeksRead(db, runId, id))]);
  const byGroup = new Map(groupIds.map((id, at) => [id, lists[at]] as const));
  const weekOf = (weekNumber: number) => {
    const copy = readsGroupIdFor(person, weekNumber);
    return copy ? (byGroup.get(copy)?.get(weekNumber) ?? null) : (runWeeks.get(weekNumber) ?? null);
  };
  return { runWeeks, weekOf };
}

/**
 * One person's weeks as the Coursework tab works out its cells, for the weeks
 * `keep` keeps: the cell, the copy of the week they read, and the facts.
 */
async function courseworkFor(
  db: Firestore,
  input: {
    run: CourseRunDoc;
    liveGroups: CourseGroupDoc[];
    enrolments: readonly CourseEnrolmentDoc[];
    person: CourseworkPerson;
    now: Date;
  },
) {
  const { run, liveGroups, person, now } = input;
  const [{ runWeeks, weekOf }, coursework] = await Promise.all([
    weeksForPerson(db, run.id, person),
    // Counts, states and times for everybody on the run; the words of nobody.
    readRunCoursework(db, { run, liveGroups, now, enrolments: input.enrolments }, null),
  ]);
  const columns = columnsOf(run, runWeeks);
  // Their pack in each Choose one their weeks count, by id: a week with a pathway is done only once its reading is ticked.
  const packRecords = await readPackCaseRecords(
    db,
    run.id,
    columns.flatMap((column) => chooseOneIdsOf(weekOf(column.weekNumber)).map((blockId) => ({ uid: person.uid, blockId }))),
  );
  const packs = new Map<string, string>();
  for (const record of packRecords.values()) if (record.packId && record.uid === person.uid) packs.set(record.blockId, record.packId);
  const work = { ...(coursework.work.get(person.uid) ?? NO_WORK), packs };
  const calendars = new Map<string | null, GroupCalendar>();
  const calendarOf = (groupId: string | null) => {
    let found = calendars.get(groupId);
    if (!found) {
      found = resolveGroupCalendar(run, groupId ? (liveGroups.find((group) => group.id === groupId) ?? null) : null, now);
      calendars.set(groupId, found);
    }
    return found;
  };
  const [row] = courseworkRows({
    columns,
    people: [person],
    workOf: () => work,
    weekOf: (_groupId, weekNumber) => weekOf(weekNumber),
    personHref: () => "",
    standingOf: (uid, weekNumber) => ({ submittedAt: coursework.states.submittedOf(uid, weekNumber), due: coursework.states.dueOf(uid, weekNumber) }),
    reachedOf: (each) => calendarOf(each.readsGroupId).currentWeek?.anchorWeekNumber ?? 0,
    opensOf: (each, weekNumber) => weekOpensOn(calendarOf(each.readsGroupId).calendar, weekNumber),
  });
  return { columns, cells: row?.cells ?? [], work, weekOf };
}

type FeedbackPiece = Awaited<ReturnType<typeof readOwnFeedback>>[number];

/**
 * THE FEEDBACK ABOUT A PERSON, as facts, never words, as the reading view
 * lists it: every piece (`courseFeedback`), and feedback given before pieces
 * existed, kept on the written answer's own row, as `readRunCoursework` hands
 * its facts (who gave it and when it was emailed, on an answer its readers
 * may read). `keep` narrows both to the pieces a reader may see. Each writer
 * by the first word of the name they go by, and the person's first name, as
 * the reading view names them beside what became of each email.
 */
async function feedbackFactsOf(
  db: Firestore,
  input: {
    uid: string;
    pieces: readonly FeedbackPiece[];
    work: PersonWork;
    weeks: ReadonlyArray<{ weekNumber: number; week: CourseworkWeek | null }>;
    keep: (byUid: string) => boolean;
    /** Name who pressed Send on each emailed piece's batch (`emailedByUid`): the team's page alone. */
    senders?: boolean;
    now: Date;
  },
): Promise<{ facts: FeedbackFact[]; firstName: string }> {
  const legacy = input.weeks.flatMap(({ weekNumber, week }) => {
    const given = week?.answer ? (input.work.answerFacts?.get(workKey(weekNumber, week.answer.id))?.legacy ?? null) : null;
    return given && week?.answer ? [{ weekNumber, answerId: week.answer.id, ...given }] : [];
  });
  const pieces = input.pieces.filter((piece) => input.keep(piece.byUid));
  const older = legacy.filter((given) => input.keep(given.byUid));
  const senders = input.senders ? pieces.map((piece) => piece.emailedByUid).filter(Boolean) : [];
  const names = await cardNamesOf(db, [input.uid, ...pieces.map((piece) => piece.byUid), ...older.map((given) => given.byUid), ...senders]);
  return {
    firstName: names.firstName(input.uid),
    facts: [
      ...older.map((given) => ({
        id: legacyCardId(given.answerId),
        weekNumber: given.weekNumber,
        on: "writtenAnswer" as const,
        byName: names.firstName(given.byUid),
        createdAt: given.sentAt,
        emailedAt: given.sentAt,
        delivery: "sent" as const,
        sending: false,
        legacy: true,
      })),
      ...pieces.map((piece) => ({
        id: piece.id,
        weekNumber: piece.weekNumber,
        on: piece.on.kind,
        byName: names.firstName(piece.byUid),
        createdAt: piece.createdAt,
        emailedAt: piece.emailedAt,
        delivery: piece.emailedAt ? (piece.emailDelivery ?? "sent") : null,
        sending: feedbackIsClaimed(piece, input.now),
        legacy: false,
        // Who pressed Send, only where the send recorded it and a name is on record.
        ...(input.senders && piece.emailedAt && piece.emailedByUid && names.firstName(piece.emailedByUid)
          ? { sentBy: names.firstName(piece.emailedByUid) }
          : {}),
      })),
    ],
  };
}

/** Whether a session counts towards what they came to: the record's own rule. */
function happened(facts: GroupSessionFacts | undefined): boolean {
  return !!facts && (facts.startsAt ? facts.started : facts.register !== null);
}

/**
 * THE ONE RECORD OF A PERSON'S ATTENDANCE, for this reader: their row of the
 * Attendance tab's grid (`buildRunAttendance`), each week with the session of
 * the group they were in that week. Null when the grid lists no row for them
 * for this reader. `onlyGroup` keeps the weeks spent in that group alone.
 */
function attendanceFacts(
  records: RunRecords,
  uid: string,
  viewer: { isAdmin: boolean; role?: string | null },
  now: Date,
  onlyGroup: string | null,
): { facts: AttendanceWeekFact[]; came: number; online: number; visits: Map<number, string> } | null {
  const grid = buildRunAttendance(records, viewer, now);
  const listed = grid.groups.find((group) => group.people.some((person) => person.uid === uid));
  const row = listed?.people.find((person) => person.uid === uid);
  const enrolment = records.enrolments.find((each) => each.uid === uid);
  if (!listed || !row || !enrolment) return null;
  // Each week's session from the group they were in that week, a group archived since among them: the record reads
  // the marks of its finished registers of sessions held (`countsFromArchivedGroup`), so its lines carry their days.
  const sessions = new Map(
    [...records.groups, ...(records.archivedGroups ?? []).filter((group) => !records.groups.some((live) => live.id === group.id))].map(
      (group) => [group.id, groupSessions(records, group, now)] as const,
    ),
  );
  // The session they were due at that week: a one-week visit's host for its week.
  const weekGroupOf = (weekNumber: number) => (differsByWeek(enrolment) ? groupForWeek(enrolment, weekNumber) : listed.id);
  const names = new Map(
    [...records.groups, ...(records.archivedGroups ?? [])].map((group) => [group.id, group.name.trim() || "Untitled group"] as const),
  );
  const todayKey = londonDateKey(now);
  const tomorrowKey = addDaysToKey(todayKey, 1);
  const facts: AttendanceWeekFact[] = [];
  // The weeks of a one-week visit that stands, to a session that is happening, by week: the host's name.
  const visits = new Map<number, string>();
  for (const cell of row.cells) {
    const weekGroup = weekGroupOf(cell.weekNumber);
    const session = weekGroup ? sessions.get(weekGroup)?.get(cell.weekNumber) : undefined;
    // A visit called off is gone from the place; one whose session was called off stands, uncounted: neither is a visit here.
    const visit = visitInWeek(enrolment, cell.weekNumber);
    const visiting = visit !== null && weekGroup === visit.groupId && session !== undefined && session.held;
    if (visiting && weekGroup) visits.set(cell.weekNumber, names.get(weekGroup) ?? "another group");
    // The cut keeps the weeks whose session was its group's, and a week its people spent visiting another group's session.
    if (onlyGroup !== null && weekGroup !== onlyGroup && !(visiting && ownGroupForWeek(enrolment, cell.weekNumber) === onlyGroup)) continue;
    const dateKey = session?.session.dateKey ?? "";
    facts.push({
      weekNumber: cell.weekNumber,
      state: cell.state,
      mark: cell.mark,
      online: cell.online === true,
      dateLabel: session ? dayWords(session.session.dateKey) || null : null,
      happened: happened(session),
      dayWord: dateKey === todayKey ? "Today" : dateKey === tomorrowKey ? "Tomorrow" : null,
      groupName: weekGroup ? (names.get(weekGroup) ?? null) : null,
      visit: visiting,
    });
  }
  return { facts, came: row.came, online: row.online, visits };
}

/** "Goes by" and "Joined", off their account: approved as a member, or made where no approval is on record. */
function aboutOf(account: Record<string, unknown> | null, uid: string): { about: PersonAbout; email: string | null } {
  if (!account) return { about: { goesBy: null, joined: null }, email: null };
  const user = normalizeUser(uid, account);
  const joinedAt = user.approvedAt ?? user.createdAt ?? null;
  return {
    about: { goesBy: goByNameOf(account), joined: joinedAt ? joinedMonthWords(joinedAt) : null },
    email: typeof user.email === "string" && user.email.trim() ? user.email.trim() : null,
  };
}

/**
 * THE APPLICATION'S LINE AND THE DAY THE PLACE BECAME THEIRS, from what the
 * records hold, for a reader the People tab hands the application's link:
 * the day they first sent it and the programmes they ranked, in their order
 * (`rankedProgrammes` on what they sent), then, on a form that asks, whether
 * they offered to facilitate this programme (`wouldFacilitate`, the
 * facilitating screens' own rule). The day is decision day's, where it
 * accepted them onto this programme (`result`, on the day it was sent), or
 * their yes to an invitation to it (`invitation`, on the day they answered).
 * Nothing else of the application leaves here: no answer, no address, no
 * access requirement and no answer about SU membership.
 */
function applicationFactsOf(
  form: ApplicationForm,
  sets: readonly QuestionSetDoc[],
  programmeId: string,
  application: ApplicationDoc | null,
): { line: string | null; since: Date | null } {
  if (!application?.sent) return { line: null, since: null };
  const ranked = rankedProgrammes(form, application.sent).map((programme) => programme.shortName.trim() || programme.name.trim());
  const programme = own(form.programmes, programmeId);
  const offered = form.asksFacilitating && programme ? wouldFacilitate(form, sets, application.sent, programme) : null;
  const result = application.result;
  const invitation = application.invitation;
  const since =
    result?.kind === "accepted" && result.programmeId === programmeId
      ? result.publishedAt
      : invitation?.programmeId === programmeId && invitation.response === "accepted"
        ? invitation.respondedAt
        : null;
  return { line: ranked.length > 0 ? appliedWords(application.submittedAt, ranked, offered) : null, since: since ?? null };
}

/** How many History rows about one person's visits on a run are read: a run holds at most 60 weeks, four rows a visit at most. */
export const VISIT_HISTORY_READ = 240;

/**
 * THE HISTORY ROWS ONE-WEEK VISITS WROTE ABOUT A PERSON on a run, in the words
 * they were written with: one equality on each of two fields and one `in`
 * (no declared index). A visit writes a row on each of the two groups:
 * arranging one is kept as their own group's row (the one naming the host),
 * and a visit called off, whose two rows say the same, once.
 */
async function visitHistoryOf(db: Firestore, runId: string, uid: string): Promise<VisitHistoryFact[]> {
  const snap = await db
    .collection(COURSE_AUDIT_COLLECTION)
    .where("subjectUid", "==", uid)
    .where("runId", "==", runId)
    .where("kind", "in", ["member-visits", "member-visit-off"])
    .limit(VISIT_HISTORY_READ)
    .get();
  const seen = new Set<string>();
  const out: VisitHistoryFact[] = [];
  for (const doc of snap.docs) {
    const row = normalizeCourseAudit(doc.id, doc.data() ?? {});
    if (row.subjectUid !== uid || row.runId !== runId || !row.at || !row.detail) continue;
    if (row.kind === "member-visits" && !row.after) continue;
    if (row.kind !== "member-visits" && row.kind !== "member-visit-off") continue;
    const key = `${row.kind} ${row.at.getTime()} ${row.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ at: row.at, who: row.actorName, said: row.detail });
  }
  return out;
}

/** "This term", for the events line: from the run's first day, midnight in London, to the end of its last session (no end while none is dated). */
function termOf(run: CourseRunDoc, liveGroups: readonly CourseGroupDoc[], now: Date): TermWindow | null {
  if (!isValidDateKey(run.startDate)) return null;
  return { from: londonWallClockToInstant(run.startDate, "00:00"), to: runEndOf(run, liveGroups, now).endsAt };
}

/** "Group C · Wednesdays at 3pm" for a group, or "Not in a group yet". */
function groupLineOf(group: CourseGroupDoc | null): string {
  if (!group) return NOT_IN_A_GROUP;
  return groupLineWords(group.name.trim() || "Untitled group", group.session ? weeklySlotWords(group.session) : null);
}

// ---------------------------------------------------------------------------
// The team's page
// ---------------------------------------------------------------------------

export async function loadTeamPersonPage(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  uid: string,
  now: Date = new Date(),
): Promise<TeamPersonOutcome> {
  // The programme's own gate, from the form, before anything about anybody is read.
  const gate = await loadProgrammeRun(db, actor, roundId, programmeId);
  if (gate.status !== "ok") return gate;
  const path = programmePath(gate.view.roundId, gate.view.programmeId);
  const notHere: TeamPersonOutcome = { status: "not-here", back: `${path}/people` };
  if (!isAddressableId(uid)) return notHere;

  // The People tab's own read: the person must be one of its rows for this reader.
  const people = await loadProgrammePeople(db, actor, roundId, programmeId);
  if (people.status !== "ok") return people;
  const row = people.view.rows.find((each) => each.uid === uid);
  if (!row) return notHere;

  const isAdmin = gate.view.viewer === "admin";
  const self = actor.uid === uid;
  const form = await loadForm(db, gate.view.roundId);
  const [accountSnap, application, sets, assessment] = await Promise.all([
    // Their account, by address: the name they go by, when they joined, and for an admin alone their address.
    db.collection("users").doc(uid).get(),
    // Their application on this form, never about the reader themselves: what may be shown of it is asked below, of
    // the People tab's link for the line and of the one gated read for the week.
    form && !self ? loadApplication(db, form, uid) : Promise.resolve(null),
    // The form's questions, for whether they offered to facilitate: read only where the line is.
    form && row.applicationHref && form.asksFacilitating ? loadQuestionSets(db, form.round.id) : Promise.resolve([] as QuestionSetDoc[]),
    // Claude's and Pangram's reads, an ADMIN's alone: never read for anybody else, never about the reader.
    isAdmin && !self ? notesFor(db, gate.view.roundId, gate.view.programmeId, [uid]) : Promise.resolve(null),
  ]);
  const { about, email } = aboutOf(accountSnap.exists ? ((accountSnap.data() ?? {}) as Record<string, unknown>) : null, uid);
  // The application's line and the day the place became theirs: only where the People tab hands its link.
  const appFacts = form && row.applicationHref ? applicationFactsOf(form, sets, gate.view.programmeId, application) : { line: null, since: null };
  const foot = whoSeesWeekWords(gate.view.programmeName);
  /** When they're free, through the one gated read: never about the reader, and only the sentence where they may not read it. */
  const freeOf = (groups: readonly WeekGroup[], inGroupId: string | null): PersonFreeView | null =>
    form && !self
      ? personFreeViewOf(personWeekFor(actor, form, { uid, application }, groups, inGroupId), row.firstName, groups, form.round.availabilityGrid)
      : null;
  const placeOf = (group: Parameters<typeof placeLinesOf>[0]["group"]) =>
    placeLinesOf({
      status: row.status,
      programmeName: gate.view.programmeName,
      since: appFacts.since,
      group,
      coming: row.category === "holding" ? row.coming : null,
    });
  const noRunFree = freeOf([], null);
  const view: TeamPersonView = {
    reader: gate.view.viewer,
    uid,
    header: { name: row.name, programmeName: gate.view.programmeName, group: NOT_IN_A_GROUP, status: statusWords(row.status), notTold: false },
    place: placeOf("none"),
    ...(noRunFree ? { free: noRunFree, ...(noRunFree.kind !== "may-not" ? { freeFoot: foot } : {}) } : {}),
    about,
    // The address is an admin's alone: never handed to a lead.
    ...(isAdmin && email ? { email } : {}),
    back: { label: BACK_TO_PEOPLE, href: `${path}/people` },
    weeks: [],
    attendance: attendanceViewOf([], undefined, { coming: true }),
    feedback: [],
    ...(row.applicationHref ? { application: { href: row.applicationHref, label: OPEN_THEIR_APPLICATION, line: appFacts.line } } : {}),
    // Claude, Pangram and their account: an admin's alone.
    ...(assessment ? { claude: claudeLinesOf(assessment.get(uid) ?? null) } : {}),
    ...(isAdmin ? { account: { href: `/admin/members/${encodeURIComponent(uid)}`, label: openAccountWords(row.firstName) } } : {}),
    // Visit and Move: the People tab's one decision (`movingLinks`), drawn as it draws them.
    ...(row.visitHref ? { visit: { href: row.visitHref, label: VISIT_LINK } } : {}),
    ...(row.moveHref ? { move: { href: row.moveHref, label: MOVE_LINK } } : {}),
  };

  const runSnap = gate.view.run ? await db.collection("courseRuns").doc(gate.view.run.id).get() : null;
  if (!runSnap?.exists || (runSnap.data() ?? {}).destroying === true) {
    return { status: "ok", view: isAdmin ? { ...view, activity: [] } : view };
  }
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});

  const [liveGroups, { enrolments, seats }, facts, names, records, staffing] = await Promise.all([
    liveGroupsOf(db, run.id),
    // One equality on one field: the run's seats.
    readRunSeats(db, run.id),
    reviewerFactsOf(db, actor, run.id),
    namesOf(db, [uid], actor),
    readRunRecords(db, run.id),
    // Who reads what people said about their group's time, as the board asks it.
    runStaffingOf(db, actor, run),
  ]);
  const name = names.get(uid) ?? row.name;
  const attended = records ? attendanceFacts(records, uid, { isAdmin, role: actor.role }, now, null) : null;
  const attendance = attended
    ? attendanceViewOf(attended.facts, { came: attended.came, online: attended.online }, { coming: true })
    : attendanceViewOf([], undefined, { coming: true });
  // The run's live groups that meet at a weekly time, for the chart, in the board's order.
  const timed: WeekGroup[] = liveGroups.flatMap((group) =>
    group.session && group.session.startTimeLocal && group.session.durationMinutes > 0
      ? [{ id: group.id, name: group.name.trim() || "Untitled group", session: { weekday: group.session.weekday, startTimeLocal: group.session.startTimeLocal, durationMinutes: group.session.durationMinutes } }]
      : [],
  );
  /** The week's section and the answer under it, against the group this reader is shown them in. */
  const freeSection = (inGroupId: string | null): Pick<TeamPersonView, "free" | "timeAnswer" | "freeFoot"> => {
    const free = freeOf(timed, inGroupId);
    const seat = seats.get(uid) ?? null;
    const inGroup = seat?.groupId ? (liveGroups.find((group) => group.id === seat.groupId) ?? null) : null;
    // Their answer about the group their seat is in now, where this reader reads answers today (`readsTimeAnswers`).
    const answer =
      readsTimeAnswers(staffing) && seat && inGroup && !self
        ? timeAnswerLinesOf(currentTimeAnswer(seat, timeQuestionSinceOf(inGroup)), inGroup.name.trim() || "Untitled group")
        : null;
    const shown = (free !== null && free.kind !== "may-not") || answer !== null;
    return { ...(free ? { free } : {}), ...(answer ? { timeAnswer: answer } : {}), ...(shown ? { freeFoot: foot } : {}) };
  };
  const { free: _free, timeAnswer: _timeAnswer, freeFoot: _freeFoot, ...beforeRun } = view;

  // A ROW OF THE COURSEWORK TAB, by the tab's own test: holding a place, facilitating one of the run's live groups, or
  // placed in one. Anybody else (somebody who left the run, gave their place back or is invited) is no row of it, and the
  // reading view refuses them, so their page is what the People tab and the Attendance tab show of them: the head, where
  // their place stands, when they're free, their application and their attendance, and none of the Coursework tab's.
  const onTheTab =
    row.category === "holding" || liveGroups.some((group) => group.facilitatorUids.includes(uid)) || placedIn(seats.get(uid), liveGroups);
  if (!onTheTab) {
    const { weeks: _weeks, feedback: _feedback, move: _move, visit: _visit, ...head } = beforeRun;
    return {
      status: "ok",
      view: { ...head, header: { ...view.header, name, group: null }, place: placeOf(null), ...freeSection(null), attendance },
    };
  }

  const viewer = isAdmin ? "admin" : "lead";
  // The person as the Coursework tab makes its rows: an admin sees every placement, the lead only a told one.
  const person: CourseworkPerson = peopleOf({ viewer, groups: liveGroups, holders: [], seats, names }).find((each) => each.uid === uid) ?? {
    uid,
    name,
    facilitating: false,
    groupId: null,
    readsGroupId: null,
    notToldYet: false,
  };
  const shownGroup = person.groupId ? (liveGroups.find((group) => group.id === person.groupId) ?? null) : null;
  const [{ columns, cells, work, weekOf }, pieces] = await Promise.all([
    courseworkFor(db, { run, liveGroups, enrolments, person, now }),
    // Every piece of feedback about them on the run: one equality on each of two fields.
    readOwnFeedback(db, run.id, uid),
  ]);
  const weekList = columns.map((column) => ({ weekNumber: column.weekNumber, week: weekOf(column.weekNumber) }));
  const { facts: feedback, firstName } = await feedbackFactsOf(db, { uid, pieces, work, weeks: weekList, keep: () => true, senders: true, now });
  const weeks: PersonWeekRow[] = columns.map((column, at) =>
    weekRowOf({
      column,
      cell: cells[at],
      week: weekOf(column.weekNumber),
      work,
      feedback,
      firstName,
      readHref: cells[at]?.reached ? `${path}/coursework/${encodeURIComponent(uid)}?week=${column.weekNumber}` : null,
      visitHost: attended?.visits.get(column.weekNumber) ?? null,
      now,
    }),
  );

  // Ratings for the team: only for a reader `readsWorkRatings` admits, on work the one gate lets them read.
  const owner = ownerFactsFromSeat(uid, seats.get(uid) ?? null, liveGroups, { isAdmin: facts.isAdmin });
  let ratings: TeamPersonView["ratings"];
  if (owner && mayRateWorkOf(actor, facts, owner, liveGroups)) {
    // One query for the person on the run, split by week: each week's ratings on the written answer it asks for.
    const all = await readPersonRatings(db, { runId: run.id, uid });
    const stored = all.filter((rating) => rating.rating !== null && weekOf(rating.weekNumber)?.answer?.id === rating.itemId);
    const raters = await cardNamesOf(db, stored.map((rating) => rating.raterUid));
    ratings = ratingColumnOf(
      columns.map((column) => column.weekNumber),
      stored.map((rating) => ({ weekNumber: rating.weekNumber, rating: rating.rating as number, byName: raters.firstName(rating.raterUid) })),
    );
  }

  const seat = seats.get(uid) ?? null;
  // Told only once Publish's email was handed over: one held, or stopped by the do-not-email list, told nobody.
  const told = seat !== null && seat.groupId !== null && placementIsShownTo(seat, { isAdmin: false });
  const delivered = seat?.allocatedEmailDelivery !== "held" && seat?.allocatedEmailDelivery !== "suppressed";
  const toldAt = told && delivered ? (seat?.allocatedEmailAt ?? null) : null;
  const out: TeamPersonView = {
    ...beforeRun,
    header: { ...view.header, name, group: groupLineOf(shownGroup), notTold: person.notToldYet },
    // Their group as this reader is shown it (a lead only a told one), and the day Publish told them.
    place: placeOf(
      shownGroup
        ? {
            name: shownGroup.name.trim() || "Untitled group",
            when: shownGroup.session ? weeklyWords(shownGroup.session) : null,
            toldAt: person.notToldYet ? null : toldAt,
            notTold: person.notToldYet,
          }
        : "none",
    ),
    ...freeSection(shownGroup?.id ?? null),
    weeks,
    ...(ratings ? { ratings } : {}),
    attendance,
    feedback: feedbackLinesOf(feedback, firstName),
    // Notes are never shown about the person looking, an admin included.
    ...(self ? {} : { notes: { runId: run.id, firstName: row.firstName, lead: isAdmin ? null : { roundId: gate.view.roundId, programmeId: gate.view.programmeId } } }),
  };
  if (!isAdmin) return { status: "ok", view: out };

  // An admin's alone: read for nobody else.
  const [events, history] = await Promise.all([eventsOfPersonInTerm(db, uid, now, termOf(run, liveGroups, now)), visitHistoryOf(db, run.id, uid)]);
  return {
    status: "ok",
    view: {
      ...out,
      ...(events ? { events: events.view } : {}),
      ...(events && events.signedUp !== null ? { signedUp: signedUpWords(events.signedUp.signedUp, events.signedUp.counted, events.signedUp.came) } : {}),
      activity: activityOf({
        toldAt,
        work,
        weeks: weekList,
        feedback,
        history,
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// The facilitator's cut
// ---------------------------------------------------------------------------

export type FacilitatorPersonOutcome = { status: "refused" } | { status: "ok"; view: FacilitatorPersonView };

export async function loadFacilitatorPersonPage(
  db: Firestore,
  actor: SessionUser,
  run: CourseRunDoc,
  groupId: string,
  uid: string,
  now: Date = new Date(),
): Promise<FacilitatorPersonOutcome> {
  const refused: FacilitatorPersonOutcome = { status: "refused" };
  if (!isAddressableId(groupId) || !isAddressableId(uid)) return refused;
  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  if (!groupSnap.exists) return refused;
  const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
  // A live facilitator of this group, with standing: nobody else, the lead and admins included (theirs is the team's page).
  if (group.runId !== run.id || group.archived || !isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids)) return refused;
  if (actor.uid === uid) return refused;

  const [liveGroups, facts, seatSnap] = await Promise.all([
    liveGroupsOf(db, run.id),
    reviewerFactsOf(db, actor, run.id),
    db.collection("courseEnrolments").doc(courseEnrolmentId(run.id, uid)).get(),
  ]);
  const seat = seatSnap.exists ? normalizeCourseEnrolment(seatSnap.id, seatSnap.data() ?? {}) : null;
  const owner = ownerFactsFromSeat(uid, seat, liveGroups, { isAdmin: facts.isAdmin });
  // Somebody in this group now, whose work the one gate lets this reader read: never a co-facilitator's own.
  if (!seat || !owner || owner.placedGroupId !== groupId || !writtenReviewRole(actor, facts, owner, liveGroups).mayReview) return refused;
  if (writtenReviewRole(actor, facts, owner, liveGroups).ownerFacilitates) return refused;

  const [names, pieces, records, { enrolments }] = await Promise.all([
    // The name they go by, whoever is looking.
    namesOf(db, [uid], { role: "member" }),
    readOwnFeedback(db, run.id, uid),
    readRunRecords(db, run.id),
    readRunSeats(db, run.id),
  ]);
  const name = names.get(uid) ?? "NAISI member";
  const person: CourseworkPerson = {
    uid,
    name,
    facilitating: false,
    groupId,
    readsGroupId: groupId,
    readsCopies: copiesOf(seat, liveGroups),
    notToldYet: false,
  };
  const { columns, cells, work, weekOf } = await courseworkFor(db, { run, liveGroups, enrolments, person, now });
  const attended = records ? attendanceFacts(records, uid, { isAdmin: false, role: "member" }, now, groupId) : null;
  // The weeks they belonged to this group: a one-week visit's week stays theirs here (their work, its feedback).
  const inGroup = (weekNumber: number) => ownGroupForWeek(seat, weekNumber) === groupId;
  // Only the feedback this facilitator wrote, pieces and feedback given before pieces existed alike.
  const { facts: feedback, firstName } = await feedbackFactsOf(db, {
    uid,
    pieces,
    work,
    weeks: columns.map((column) => ({ weekNumber: column.weekNumber, week: weekOf(column.weekNumber) })),
    keep: (byUid) => byUid === actor.uid,
    now,
  });
  const groupPath = `/learn/${encodeURIComponent(run.id)}/group/${encodeURIComponent(groupId)}`;
  const weeks = columns.flatMap((column, at) =>
    inGroup(column.weekNumber)
      ? [
          weekRowOf({
            column,
            cell: cells[at],
            week: weekOf(column.weekNumber),
            work,
            feedback,
            firstName,
            readHref: cells[at]?.reached ? `${groupPath}/coursework/${encodeURIComponent(uid)}?week=${column.weekNumber}` : null,
            // A week they spent visiting another group's session: where its work was due.
            visitHost: attended?.visits.get(column.weekNumber) ?? null,
            now,
          }),
        ]
      : [],
  );
  return {
    status: "ok",
    view: {
      uid,
      header: { name, programmeName: run.courseTitle, group: groupLineOf(group) },
      back: { label: BACK_TO_GROUP, href: groupPath },
      weeks,
      elsewhere: elsewhereLineOf(columns.map((column) => column.weekNumber).filter((weekNumber) => !inGroup(weekNumber))),
      attendance: attendanceViewOf(attended?.facts ?? []),
      feedback: feedbackLinesOf(feedback, firstName),
    },
  };
}
