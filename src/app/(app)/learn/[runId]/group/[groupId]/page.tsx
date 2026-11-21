import Link from "next/link";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { redirect } from "next/navigation";
import { firstName as firstNameOf } from "@/app/(app)/dashboard/homeWords";
import GroupNotesCard from "@/features/courses/facilitator/GroupNotesCard";
import JoiningOnlineBox from "@/features/courses/facilitator/JoiningOnlineBox";
import NotForYou from "@/features/courses/facilitator/NotForYou";
import { isAddressableId } from "@/lib/addressableId";
import {
  FacilitatorTicket,
  GroupPeopleCard,
  GuideOnlyCard,
  GroupRegistersCard,
  NoMoreSessionsCard,
  PaceCard,
  ToReviewCard,
} from "@/features/courses/facilitator/GroupCards";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import DrawCard from "@/features/courses/groupPage/DrawCard";
import PairsCard from "@/features/courses/pairs/PairsCard";
import { NAMES_WHEN_GROUPS_GO_OUT } from "@/features/courses/groupNamesWords";
import ThisWeeksWork, { ReflectionsQueueCard, workColumnsOf } from "@/features/courses/facilitatorWeek/ThisWeeksWork";
import FacilitatorMeets from "@/features/courses/groupPage/FacilitatorMeets";
import FacilitatorWeekWork from "@/features/courses/groupPage/FacilitatorWeekWork";
import BeforeTheSession from "@/features/courses/groupPage/BeforeTheSession";
import MeetingLinks from "@/features/courses/groupPage/MeetingLinks";
import { ticketFacts } from "@/features/courses/sessionChange/cardFacts";
import SessionNotice from "@/features/courses/sessionChange/SessionNotice";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import ReviewQueueCard from "@/features/courses/written/ReviewQueueCard";
import { loadWrittenQueueAndReadable, type WrittenQueueRow } from "@/lib/courses/writtenAnswers/queue";
import { READING_ANSWER_ANCHOR } from "@/lib/courses/coursework/overview";
import { firstQuestionHref, readingAnswerHref } from "@/lib/courses/coursework/forwards";
import { groupBoxesFirstRead } from "@/lib/courses/coursework/question";
import { readingHref } from "@/lib/courses/coursework/reading";
import { StaffUpdatesSection } from "@/features/courses/updates/UpdatesList";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { facilitatorGuideReader } from "@/lib/courses/facilitatorGuide/access";
import { GUIDE_READ_FAILED, guideLinksView, guideReadOfIndex, type GuideRead } from "@/lib/courses/facilitatorGuide/links";
import { readGuideIndex } from "@/lib/courses/facilitatorGuide/store";
import { loadFacilitatorGroup } from "@/lib/courses/facilitatorGroup";
import { loadGroupPage } from "@/lib/courses/groupPage/load";
import { seesSessionLink } from "@/lib/courses/meetingLink/audience";
import { joiningOnlineBox } from "@/lib/courses/meetingLink/box";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";
import { facilitatorExplainerOn } from "@/lib/courses/explainers/readers";
import { drawPeople, readDrawWeeks } from "@/lib/courses/packsAndCases/readers";
import { drawCardModel } from "@/lib/courses/drawCard/model";
import { pairsCardWeek } from "@/lib/courses/pairs/cardWeek";
import { readGroupPairs } from "@/lib/courses/pairs/readers";
import { loadGroupWeek, loadGroupWeekBoxes } from "@/lib/courses/facilitatorWeek/readers";
import { loadWorkColumns } from "@/lib/courses/facilitatorWeek/workColumns";
import { facilitatorsWorkLine, ownCountedApartLine } from "@/lib/courses/facilitatorWeek/words";
import {
  MY_PROGRAMMES,
  coFacilitatorsWords,
  groupHeadParts,
  notesTitle,
  notesWhoLine,
  programmeWords,
  ticketHeading,
} from "@/lib/courses/facilitatorPageWords";
import { readGroupNotes } from "@/lib/courses/groupNotes/readers";
import { sessionEyebrow, weekOfWords } from "@/lib/courses/memberPageWords";
import { CHANGE_A_SESSION, slotRangeWords, slotWords } from "@/lib/courses/sessionChange/words";
import { updateAudienceCounts } from "@/lib/courses/updates/audience";
import { loadRunGroups, loadUpdatesFor, narrowToGroup, updateReadingOf } from "@/lib/courses/updates/readers";
import { staffUpdateRows } from "@/lib/courses/updates/views";
import { writeToGroupLine, writeToGroupWords } from "@/lib/courses/updates/words";
import { resolveGroupCalendar } from "@/lib/courses/groupResolve";
import { resolveSessions, sessionRange } from "@/lib/courses/sessions";
import { cardChangeFacts } from "@/lib/courses/sessionChange/model";
import { londonDateKey, type CurrentWeek } from "@/lib/courses/weekPlan";
import { runEndOf } from "@/lib/courses/finishing/runEnd";
import { RATINGS_WORDS } from "@/lib/ratings/words";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  normalizeCourseGroup,
  sessionForWeek,
  sessionModesOf,
  type GroupSession,
} from "@/lib/firestore/courseGroups";
import { weekDocId } from "@/lib/firestore/courses";
import type { OverviewGroup } from "@/app/api/courses/runs/[runId]/overview/route";

/**
 * A FACILITATOR'S GROUP PAGE, at 1440 and at 390: the group, its week and how it meets; "Write to
 * Group B (7)" and "Change a session"; the next session as a ticket with how
 * many are expected and "Take the register"; the group's people with each
 * finished register's marks, and who left; the registers; the work to
 * review; the updates; the pace; and the notes the group's facilitators share.
 * Drawn on the server, from the records the programme's own tabs read
 * (`src/lib/courses/facilitatorGroup.ts`), so a facilitator and the lead never
 * read two stories about one group.
 *
 * THE REGISTER is a page of its own beside this one (`./register`):
 * "Take the register" and each register's "See it" lead
 * there.
 *
 * THE WEEK (a week written as blocks): the review queue,
 * its written answers half (the written answers piece) and its reflections
 * half, with "Read them" to the page where lines are picked to
 * read out (`./reflections`), and This week's work across the page under
 * them, with who ticked each source and the private notes left on it
 * (`src/lib/courses/facilitatorWeek/`). A facilitator is never shown a
 * facilitator's own work there, their own included; an admin is, marked as
 * theirs. Once a person's
 * fill-in boxes are opened there ("Read it"), the page names them to the
 * first-read route, so the day each was first read is kept, never who.
 *
 * THE PATHWAYS AND CASES CARD (`DrawCard`, from `drawCardModel`): on any
 * course with a Choose one or a Cases block, always, saying what is next or
 * why there is nothing to do, about the week the slips being handed out are
 * for (`drawWeekRule`, through `readDrawWeeks`, the one rule the draw page
 * and its route ask too): so from the start of the session that hands them
 * out it is about next week, never that session's own. From that start until
 * everybody has theirs it is PINNED straight under the session card. Every
 * way on leads to the pathways and cases page (`/learn/draw/[groupId]`).
 * A facilitator of the group is named on it only to themself and admins.
 *
 * THE PAIRS ("Pairs in Group B", "Week 4"): on a course with a week in
 * pairs (its In the session block says people are paired), the week the
 * pairs are for: the week the group meets next when it is in pairs, else
 * the next week still to come that is, with each pair, who is bringing a
 * laptop and the check that every pair has one, and the way to the pairs
 * page (`/learn/pairs/[groupId]`), where they are typed. Never pinned: pairs
 * are made for their own session, not handed out the session before.
 *
 * WHO CAN'T MAKE IT: "Before the session" says it for the next session, and
 * the register says it for every session, from the moment somebody tells
 * us; the ticket's Take the register leads there.
 *
 * WHO HAS DONE THE WEEK: "4 of 6 have done week
 * 1", its bar and Remind as a sheet, for the week the row of weeks chose
 * (`?week=1`) or the week the page opens on (`FacilitatorWeekWork`, from the
 * group's page's own reader). The group's fellows only, never a
 * facilitator's own work, nor that of anybody who facilitates another of the
 * run's groups. Each person's week is This week's work's, which reads it
 * through the same function. Not for an incubator's group, whose weeks are
 * rows: the programme's page draws none for it either.
 *
 * JOINING ONLINE, under the session: for each session still to end where somebody
 * has said they are joining online, who, and while the session has no
 * meeting link, the field to add one for that week or for every week
 * (`joiningOnlineBox`, the register page's box too). Nobody is emailed.
 *
 * IN THE ORDER A FACILITATOR USES THE PAGE, from one order in the markup
 * (the phone reads it top to bottom; a laptop reads each `.columns` block as
 * two columns, the left first): the head, with Write and Change a session;
 * the next session (the notice of an evening off and the ticket, or the
 * card in its place), and the pathways and cases card while it is pinned;
 * on the left that box, "Before the session" (who has
 * asked to be excused and is waiting, who is excused, joining online,
 * visiting from another group that week, away at another group's session,
 * and coming: `beforeTheSessionOf`, from the group's page's own reader), the
 * spread and the pairs; on the right who has done the week, with Remind, the
 * updates, and how the group meets with each week's meeting link inside it
 * as words, with the way to change one for that week only or from it on;
 * then the rate card and the review queue; This week's work; and last the
 * group and the registers beside the pace and the notes. Neither the box,
 * Before the session, who has done the week nor the list of meeting links
 * carries a link or an address.
 *
 * THE FACILITATOR GUIDE, on the ticket, by the session card's one rule
 * (`src/lib/courses/facilitatorGuide/links.ts`): "Facilitator guide for week
 * 3" when that week of the course's facilitator guide has its session plan
 * or its notes loaded, or else the sentence saying it is not in the guide yet
 * and who loads it; and "Facilitator guide", to the guide's course page with
 * every week, so last week's is still a tap away once the ticket has moved
 * on. After the last session, and for a group with no dates yet, the course
 * page's link stays. Asked of the guide's own gate
 * (`src/lib/courses/facilitatorGuide/access.ts`), which admits this page's
 * readers: the group's live facilitators and admins. A read that fails
 * draws the course page's link and never takes the page down.
 *
 * ── THE GATE IS TWO CHECKS, NOT ONE ─────────────────────────────────────────
 * `[runId]/layout.tsx` has already established that the caller holds SOME role
 * on this run. That is nowhere near enough here: a learner, an admissions
 * reviewer and a facilitator of a DIFFERENT group all pass that bar, and none
 * of them may mark this group's register. So this page re-reads the group
 * document and requires the caller's uid to be on `facilitatorUids`: group
 * membership cannot be inferred from the run, and the whole point of small
 * groups is that they are small.
 *
 * The group must also belong to THIS run. Group ids are top-level, so without
 * that check a facilitator could splice their own group id into another run's
 * URL; the check costs nothing and closes the shape.
 *
 * ── ARCHIVING A GROUP UNSTAFFS IT ───────────────────────────────────────────
 * ONE RULE, stated identically here, in the reading pages beside it, in the
 * routes behind them, and in `runAccess.ts`: a non-admin reads a group they
 * facilitate only while it is LIVE. Admins bypass it: an archived cohort is
 * exactly the thing an admin is asked to go back and look at.
 *
 * ONE CALM PAGE, never a 403, a redirect or `notFound()`: everybody the run
 * layout admits and this gate does not is given `NotForYou`, the same bytes
 * for a real group that is not theirs, an archived one, a group of another
 * run and an id that names nothing, so someone guessing group ids learns
 * nothing about which ones exist. It says the page is for a group's
 * facilitators and admins: this page does not admit the programme's lead.
 * An admin, whom this page admits to every group, is never told it is not
 * theirs: at an id that names nothing or another run's group they are given
 * the fixed "can't be opened" answer instead. An archived group's
 * facilitator is not admitted here, so keeps the first answer.
 * Somebody with no role on the run, and every made-up run id, is still sent
 * to My programmes by the layout before this page runs. And this is a UI
 * gate: the register, the notes and the email ROUTES re-derive the same
 * access from the same documents and are the real boundary.
 *
 * ── THE NOTES ───────────────────────────────────────────────────────────────
 * Read here, on the server, after this gate: the group's facilitators and
 * admins read them on this page, and only the group's facilitators are given
 * the box to add one (the notes route takes a note from nobody else). The
 * programme's lead reads them on the programme's Attendance tab.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── WHY THE SESSION IS RESOLVED HERE AND NOT FETCHED ────────────────────────
 * The roster route deliberately does NOT carry the meeting link (group docs
 * are read-locked to the authoring tier precisely because they hold it), and
 * the run overview only ever describes ONE group: the caller's own, which for
 * someone facilitating two groups is neither of the ones they are looking at.
 * So the ticket is fed from the group document this gate has already read,
 * with the Admin SDK, after establishing that the reader is a facilitator of
 * this group or an admin: the two people the overview route also lets see a
 * meeting link.
 */

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Session label
// ---------------------------------------------------------------------------

/**
 * "Tuesdays 6pm to 7:30pm", the label the overview route sends for the same
 * group, so a facilitator's own card reads as their members' cards do. Both
 * ask `slotRangeWords`, the house's clock.
 */
function sessionLabel(session: GroupSession): string {
  return slotRangeWords(session.weekday, session.startTimeLocal, session.durationMinutes);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function GroupHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string; groupId: string }>;
  searchParams?: Promise<{ week?: string | string[] }>;
}) {
  const { runId, groupId } = await params;
  // The week whose work the card counts, chosen on the row of weeks.
  const weekParam = (await (searchParams ?? Promise.resolve({} as { week?: string | string[] }))).week;
  const chosenWeek = typeof weekParam === "string" && /^\d{1,2}$/.test(weekParam) ? Number(weekParam) : null;

  const access = await getRunAccess(runId);
  if (!access) {
    // Null is "no session" OR "no such run", deliberately fused in
    // `getRunAccess`. `getSessionUser` is memoised by now, so telling the two
    // apart costs nothing and leaks nothing.
    const user = await getSessionUser();
    redirect(user ? "/learn" : "/login");
  }

  const runHome = `/learn/${encodeURIComponent(runId)}`;

  // An admin is admitted to every group, so is never told the page is not
  // theirs: the fixed "can't be opened" answer instead, at every refusal
  // below. Asked of the access already read, so it costs no read.
  const admin = access.isAdmin;

  // Dynamic segments arrive URL-DECODED, so a `%2F` reaches us as a real path
  // separator, and an id Firestore reserves or cannot hold makes `doc()`
  // throw: a 500 out of a gate whose whole job is to refuse calmly. The
  // shared check every course route asks.
  if (!isAddressableId(groupId)) return <NotForYou page="group" admitted={admin} />;

  const db = getAdminDb();
  if (!db) return <NotForYou page="group" admitted={admin} />;

  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  if (!groupSnap.exists) return <NotForYou page="group" admitted={admin} />;
  const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});

  // Live group only for a non-admin: the same predicate every route behind
  // this page gates on (see the archiving note above).
  const facilitatesThisGroup =
    !group.archived &&
    isNamedWithStanding(
      access.user,
      "courseGroups.facilitatorUids",
      group.facilitatorUids,
    );
  if (group.runId !== runId || !(access.isAdmin || facilitatesThisGroup)) {
    return <NotForYou page="group" admitted={admin} />;
  }

  /**
   * THIS GROUP's whole calendar, for the ticket and the week chip, not the
   * run's.
   *
   * `resolveGroupCalendar` is the group-first replacement for `currentWeekFor`
   * (V2-3): a group that has re-paced itself is on its own week, and a
   * facilitator's own page is the last place that should disagree with what
   * their members are looking at. It resolves to the run's calendar for the
   * overwhelmingly common group that has overridden nothing, and it answers
   * with a null week on a calendar with no usable start date rather than
   * throwing: a legitimate half-authored state, on which the card falls back
   * to the recurring label and stays stateless.
   *
   * It is the SAME helper the overview route builds every group card from, so
   * this page and the run home cannot drift apart about this group's dates.
   */
  // ONE CLOCK for both resolutions on this render. Two default clocks a
  // millisecond apart across a midnight would put the week counter and the
  // "next session" line in different cohort weeks, on one page.
  const now = new Date();
  const groupCalendar = resolveGroupCalendar(access.run, group, now);
  const currentWeek: CurrentWeek | null = groupCalendar.currentWeek;
  const range = sessionRange(
    resolveSessions(access.run, group, groupCalendar.calendar),
    now,
  );
  // The same facts the overview route puts on a member's card: the next
  // session's own weeks, room and link, and any evening that is off.
  // Resolved off the same calendar, by the same pure resolver.
  const changes = cardChangeFacts(
    resolveSessions(access.run, group, groupCalendar.calendar),
    group,
    range.next,
    londonDateKey(now),
  );

  // The explainer an admin scheduled at the start of the next session, if
  // any: on the ticket, named as this reader sees people (the ticket's own
  // words), and on the session's facts as each member reads it.
  const explainer = await facilitatorExplainerOn(db, access.user, runId, group.id, range.next?.sessionKey);

  // A break week and the before/after phases have no week doc of their own, so
  // the session override falls back to the anchor (the last taught week that
  // started), the slot the group will return to. Empty means "no override",
  // which `sessionForWeek` resolves to the recurring slot.
  const weekNumber = currentWeek
    ? (currentWeek.weekNumber ?? currentWeek.anchorWeekNumber)
    : 0;
  const weekId = weekNumber >= 1 ? weekDocId(weekNumber) : "";
  const session = sessionForWeek(group, weekId);
  // Who sees a session's link is one answer (`seesSessionLink`), the run
  // overview's too. Everybody this page admits is in it (a facilitator of the
  // group, or an admin); asking it here keeps the two from drifting apart.
  const seesLink = seesSessionLink({
    viewer: access.user,
    isAdmin: access.isAdmin,
    seat: access.enrolment,
    group,
    sessionKey: range.next?.sessionKey ?? null,
  });

  const sessionGroup: OverviewGroup = {
    id: group.id,
    name: group.name,
    // THIS group's calendar, resolved through the same helper the overview
    // route uses, so a facilitator's own page and their run home agree about
    // which week this room is on and when its term runs.
    calendar: {
      source: groupCalendar.calendar.source,
      startDate: groupCalendar.calendar.startDate,
      totalWeeks: groupCalendar.totalWeeks,
      currentWeek,
      firstSessionDate: range.firstDateKey,
      lastSessionDate: range.lastDateKey,
      nextSession: range.next
        ? {
            weekNumber: range.next.weekNumber,
            occurrence: range.next.occurrence,
            sessionKey: range.next.sessionKey,
            dateKey: range.next.dateKey,
            startTimeLocal: range.next.session.startTimeLocal,
            durationMinutes: range.next.session.durationMinutes,
            weekNumbers: changes.next?.weekNumbers ?? [range.next.weekNumber],
            location: changes.next?.location ?? "",
            // The page's gate, and the one answer about who sees a link.
            meetingUrl: seesLink ? (changes.next?.meetingUrl ?? null) : null,
            explainer: explainer ? { minutes: explainer.minutes, topic: explainer.topic } : null,
          }
        : null,
    },
    sessionLabel: sessionLabel(session),
    weekday: session.weekday,
    startTimeLocal: session.startTimeLocal,
    durationMinutes: session.durationMinutes,
    location: session.location,
    // The gate above admits a facilitator of this group, or an admin, and
    // nobody else reaches this line; `seesSessionLink` says the same.
    meetingUrl: seesLink ? session.meetingUrl : null,
    // The whole map, exactly as the overview route sends it: this shape IS
    // `OverviewGroup`, and a divergence here would mean the facilitator's own
    // ticket is fed differently from their members'. The ticket reads the
    // entry of the next session's own week out of it (`ticketFacts`), as the
    // run home's ticket does, so the facilitator sees what their members will.
    sessionModes: sessionModesOf(group),
    // Left empty on purpose rather than paid for with a second read: the head
    // names the group's other facilitators, and the ticket draws no faces.
    facilitatorNames: [],
    usualSlot: {
      weekday: group.session.weekday,
      startTimeLocal: group.session.startTimeLocal,
      durationMinutes: group.session.durationMinutes,
      location: group.session.location,
    },
    campus: group.campus,
    sessionNotice: changes.notice,
    cancelledSessions: changes.cancelled,
  };

  const groupPath = `${runHome}/group/${encodeURIComponent(groupId)}`;
  const registerHref = `${groupPath}/register`;
  const reviewHref = (week: number | null) => `${groupPath}/review${week === null ? "" : `?week=${week}`}`;

  // Updates: the way to write one to this group, counted as its press
  // counts, and the updates this group's page shows, through the one reader.
  // An archived group has no count, so no way to write to it.
  const runGroups = await loadRunGroups(db, runId);
  const [[groupCount], reading, model, programme, notes, queueRead] = await Promise.all([
    updateAudienceCounts(db, access.run, runGroups, { groupIds: [groupId] }, access.user.uid),
    updateReadingOf(db, access.user, access.run, runGroups),
    loadFacilitatorGroup(db, access.run, group, { isAdmin: access.isAdmin, actor: access.user }, now),
    runProgrammeOf(db, runId),
    readGroupNotes(db, group, access.user),
    // The review queue's written answers half: null on a run of the summer's weeks. With it, whose weeks this
    // reader may open in the reading view.
    loadWrittenQueueAndReadable(db, access.user, access.run, group),
  ]);
  const writtenQueue = queueRead?.rows ?? null;
  // The box under the session: who is joining a session online, named as this
  // reader is shown the group's people, and where a link is still wanted.
  // Nothing is offered to press in a view-as session, where nothing is written.
  const [joiningOnline, viewAs, meets] = await Promise.all([
    joiningOnlineBox(db, {
      run: access.run,
      group,
      people: model.people.filter((person) => person.left === null).map((person) => ({ uid: person.uid, name: person.name })),
      now,
    }).catch(() => []),
    getImpersonator().then((marker) => markerIsLive(marker, access.user.uid)),
    // How the group meets and its weeks, the facilitator's cut of the group's
    // page: no people, no history, no address and no link. A live group only.
    // A read that fails draws nothing: it never takes down the page a
    // facilitator opens at every session.
    group.archived
      ? Promise.resolve(null)
      : loadGroupPage(db, { run: access.run, group, viewer: "facilitator", viewerUid: access.user.uid, now, week: chosenWeek }).catch(
          (err: unknown) => {
            console.error("[facilitator group page] how the group meets failed", groupId, err);
            return null;
          },
        ),
  ]);
  // One person's written answer, where feedback on it is written: the reading view of their week, at the answer.
  const answerHref = (row: { uid: string; weekNumber: number }) => readingAnswerHref(`${groupPath}/coursework`, row.uid, row.weekNumber);
  const { updates } = await loadUpdatesFor(db, access.run, narrowToGroup(reading, groupId), runGroups);
  // The week the group is getting ready for, as this viewer is shown it: an
  // admin sees the facilitators' own work marked as theirs, a facilitator
  // never sees it. Null on a week written before blocks.
  const groupWeek = await loadGroupWeek(db, {
    run: access.run,
    group,
    model,
    viewer: access.isAdmin ? "admin" : "facilitator",
    now,
  });

  // Every week of the course as the group reads it, and the draw of the week
  // the slips being handed out are for (`drawWeekRule`, through
  // `readDrawWeeks`). Everybody in the group is in it, its facilitators too,
  // who take part. The card says what is next on any course with a Choose
  // one or a Cases block; a facilitator of the group is named on it only to
  // themself, an admin and the lead.
  const drawList = drawPeople(model.people, model.facilitators);
  const course = group.archived ? null : await readDrawWeeks(db, { run: access.run, group, people: drawList, now });
  const drawCard = course
    ? drawCardModel({ course, people: drawList, viewer: { uid: access.user.uid, isAdmin: access.isAdmin, lead: false }, now })
    : null;
  // The pairs of the week they are for, on a course with pairs: the week the
  // group meets next when it is in pairs, else the next week still to come
  // that is; with none to come, the card says so. Everybody in the group's
  // pairs, its facilitators too, who take part.
  const pairsFor = course ? pairsCardWeek(course, range.next?.weekNumber ?? null, now) : null;
  const pairsWeek = pairsFor?.week ? await readGroupPairs(db, runId, groupId, pairsFor.week, drawList) : null;

  // This week's work's Pathway, Written answer and Case columns,
  // for the week it shows, through the packs' and the written answers' own
  // readers: each reader is shown what the reading view and the draw page show
  // them of the same people.
  const workColumns = groupWeek
    ? await loadWorkColumns(db, {
        run: access.run,
        group,
        actor: access.user,
        viewer: { isAdmin: access.isAdmin, leadOf: null },
        weekNumber: groupWeek.weekNumber,
        people: drawList,
        reviewHref: (uid, week) => answerHref({ uid, weekNumber: week }),
        now,
      })
    : [];
  // Each person's fill-in boxes on that week (week 6's action plan), for exactly the people the boxes' own
  // gate lets this reader read: a fellow's, to the group's facilitators and admins; a facilitator's own, to
  // admins alone.
  const boxes = groupWeek ? await loadGroupWeekBoxes(db, { run: access.run, actor: access.user, week: groupWeek }) : [];
  // Those boxes are drawn in full under each person's name once their Read it is opened: the ones with words, named
  // then as first read, never the reader's own; the route asks its own gates again. Never on an archived group, whose
  // page an admin alone opens: nobody is named from it.
  const boxesRead =
    !group.archived && groupWeek && groupWeek.fillIn
      ? groupBoxesFirstRead({ weekId: weekDocId(groupWeek.weekNumber), readerUid: access.user.uid, boxIds: groupWeek.fillIn.boxes.map((box) => box.id), people: boxes })
      : null;
  // Whose week this reader may open in the reading view, by the one gate the reading view's own door asks
  // (read with the queue, from its own reads): each name in This week's work and in Feedback to write leads
  // there only for them.
  const readable = queueRead?.readable ?? new Set<string>();
  const readHref = (uid: string, week: number) => (readable.has(uid) ? readingHref(`${groupPath}/coursework`, uid, week) : null);

  // The head: the group, its week, its programme, its usual day, time and
  // room, and the group's other facilitators by the names rule for this
  // reader (`loadFacilitatorGroup`: the committee and admins see the full
  // name, a facilitator who is not on it the name people go by).
  const groupName = group.name || "Group";
  const others = model.facilitators.filter((person) => person.uid !== access.user.uid);
  const headParts = groupHeadParts({
    programme: programmeWords(programme?.kind ?? null, programme?.shortName ?? access.run.courseTitle),
    slot: slotWords(group.session.weekday, group.session.startTimeLocal),
    room: group.session.location,
    with: coFacilitatorsWords(others.map((person) => person.name)),
  });
  const chip =
    currentWeek?.phase === "running"
      ? currentWeek.breakLabel || weekOfWords(currentWeek.weekNumber ?? currentWeek.anchorWeekNumber, groupCalendar.totalWeeks)
      : null;

  // The next session's ticket: its own day, time, room and link.
  const facts = ticketFacts(sessionGroup);
  const todayKey = londonDateKey(now);

  // The course's facilitator guide, through the guide's own gate and its list
  // of titles, drawn by the session card's one rule (`guideLinksView`): on
  // the ticket, "Facilitator guide for week 3" or the sentence saying week 3
  // is not loaded yet and who loads it, and "Facilitator guide", its course
  // page with every week; after the last session, and for a group with no
  // dates yet, the course page's link alone. Asked in every state. A read
  // that throws never takes the page down: it reads as failed, and the
  // course page's link is still drawn, for this page admits only the
  // group's facilitators and admins, whom the guide admits too.
  let guideRead: GuideRead = GUIDE_READ_FAILED;
  try {
    const guideReader = await facilitatorGuideReader(db, access.user, access.run.courseId);
    guideRead = guideReadOfIndex(guideReader ? await readGuideIndex(db, guideReader) : null);
  } catch (err) {
    console.error("[facilitator group page] the facilitator guide's read failed", groupId, err);
  }
  const guideView = guideLinksView({
    read: guideRead,
    courseId: access.run.courseId,
    weekNumber: facts && facts.weekNumber >= 1 ? facts.weekNumber : null,
    knownReader: access.isAdmin || facilitatesThisGroup,
    leadFirstName: programme?.leadFirstName ?? null,
  });

  // The page's cards, each drawn once, then placed below in the order a
  // facilitator uses the page: the session, who is coming, the week's work,
  // then the group.

  // The next session: the notice of an evening off, then the ticket; once
  // every session is over, Home's sentence where the ticket was, and the
  // guide's course page still a tap away; a group with no dates yet has a
  // small card with the guide alone.
  const sessionCards = (
    <>
      {/* An evening is off: the notice the group reads, over the
          session it meets at next, as on their programme page. */}
      {sessionGroup.sessionNotice && <SessionNotice notice={sessionGroup.sessionNotice} now={now} />}
      {facts && (
        <FacilitatorTicket
          facts={facts}
          eyebrow={sessionEyebrow({
            isToday: facts.dateKey === todayKey,
            isFirst: facts.dateKey === range.firstDateKey,
            startTimeLocal: facts.startTimeLocal,
            weekNumbers: facts.weekNumbers,
          })}
          heading={ticketHeading(facts.dateKey, facts.startTimeLocal)}
          roomChanged={Boolean(facts.room) && facts.room !== group.session.location.trim()}
          expected={(() => {
            // Who is expected at THIS session: somebody moved in from a later week is not.
            const expected = model.expectedIn[facts.weekNumber] ?? model.expected;
            return expected > 0 ? expected : null;
          })()}
          registerHref={registerHref}
          guide={guideView.week}
          guideContents={guideView.standing}
          guideSentence={guideView.sentence}
          explainer={explainer}
        />
      )}
      {!facts && range.lastDateKey && <NoMoreSessionsCard guide={guideView} />}
      {!facts && !range.lastDateKey && <GuideOnlyCard guide={guideView} />}
    </>
  );
  // Who is coming and what they bring: who is joining a session online (with
  // the field for its link), who has said what about the next session, the
  // pathways and cases card, and the pairs. The left of the laptop's two
  // columns; on a phone, straight under the session. From the start of the
  // session that hands the slips out until everybody has theirs, the
  // pathways and cases card is pinned instead: straight under the session
  // card, across the page, so a phone and a keyboard meet it there.
  const spreadCard = drawCard ? (
    <DrawCard
      model={drawCard}
      groupId={groupId}
      groupName={groupName}
      leadFirstName={programme?.leadFirstName ?? null}
      todayKey={londonDateKey(now)}
    />
  ) : null;
  const pinnedCard = drawCard?.kind === "week" && drawCard.pinned ? spreadCard : null;
  const placedCard = pinnedCard ? null : spreadCard;
  const pairsCard = pairsFor ? (
    <PairsCard
      groupName={groupName}
      weekNumber={pairsWeek?.weekNumber ?? null}
      view={pairsWeek?.view ?? null}
      laptops={pairsWeek?.ask.laptops ?? false}
      changeHref={pairsWeek ? `/learn/pairs/${encodeURIComponent(groupId)}?week=${pairsWeek.weekNumber}` : null}
    />
  ) : null;
  // The box draws nothing with nobody joining online, so the column is left
  // out when none of its cards draws: the right one then takes the width.
  const comingDraws = joiningOnline.length > 0 || Boolean(meets?.before) || placedCard !== null || pairsCard !== null;
  const comingCards = (
    <>
      {/* Who is joining a session online, and the field for its link. */}
      <JoiningOnlineBox groupId={groupId} sessions={joiningOnline} canAdd={!viewAs} />
      {/* Before the session: who has said what about the next one. */}
      {meets?.before && <BeforeTheSession before={meets.before} />}
      {placedCard}
      {pairsCard}
    </>
  );
  // The week and the group's news: who has done the week the row of weeks
  // chose, with Remind (an incubator's group has no week card, as on the
  // programme's page); the updates; then how the group meets, its row of
  // weeks and, inside it, each week's meeting link with the way to change
  // one. The right of the laptop's two columns.
  const weekCards = (
    <>
      {meets?.work && !meets.incubator && <FacilitatorWeekWork groupId={groupId} work={meets.work} />}
      <StaffUpdatesSection updates={staffUpdateRows(updates)} headingId="group-updates" />
      {meets && (
        <FacilitatorMeets
          view={meets}
          eyebrow={[programme?.shortName ?? access.run.courseTitle, groupName].filter(Boolean).join(" · ")}
          path={groupPath}
        >
          <MeetingLinks view={meets} canChange={!viewAs} headingLevel={3} />
        </FacilitatorMeets>
      )}
    </>
  );
  const groupCards = (
    <>
      <GroupPeopleCard
        people={model.people}
        leavers={model.leavers}
        finishedWeeks={model.finishedWeeks}
        notYetTold={model.notYetTold}
        groupName={groupName}
        personBase={facilitatesThisGroup ? `${groupPath}/people` : null}
        unlinked={[access.user.uid, ...group.facilitatorUids]}
        visitors={model.visitors}
        readBase={`${groupPath}/coursework`}
      />
      <GroupRegistersCard
        registers={model.registers}
        scheduled={model.scheduled}
        registerHref={registerHref}
        firstSessionDateKey={model.firstSessionDateKey}
      />
    </>
  );
  const toReviewCard = <ToReviewCard rows={model.toReview} reviewHref={reviewHref} />;
  const restCards = (
    <>
      {model.weeksBehind !== null && (
        <PaceCard weeksBehind={model.weeksBehind} editHref={group.archived ? null : `${groupPath}/edit`} />
      )}
      <GroupNotesCard
        title={notesTitle(
          others.map((person) => person.firstName || firstNameOf(person.name)),
          model.facilitators.some((person) => person.uid === access.user.uid),
        )}
        whoLine={notesWhoLine(groupName, programme?.leadFirstName ? { firstName: programme.leadFirstName, isReader: false } : null)}
        notes={notes}
        writeFor={facilitatesThisGroup ? groupId : null}
        headingId="group-notes"
      />
    </>
  );
  // The review queue: its written answers half, on a run whose weeks are
  // written as blocks (null on a run of the summer's weeks), and its
  // reflections half, on a week written as blocks with something to reflect
  // on.
  // An answer changed since its feedback opens the reading view at that answer, where both versions are drawn.
  const changedHref = (row: WrittenQueueRow) => {
    const read = row.changed ? readHref(row.uid, row.weekNumber) : null;
    return read ? `${read}#${READING_ANSWER_ANCHOR}` : null;
  };
  const writtenCard = writtenQueue ? (
    <ReviewQueueCard
      rows={writtenQueue}
      hrefFor={(row) => changedHref(row) ?? answerHref(row)}
      readHrefFor={(row) => changedHref(row) ?? readHref(row.uid, row.weekNumber) ?? answerHref(row)}
    />
  ) : null;
  // Once the run's last session is over, the way to rate the group: its
  // facilitators and admins, about two minutes a person. Over the review
  // queue, whichever shape the page takes.
  const rateCard = runEndOf(access.run, access.groups, now).over ? (
    <section className={weekly.card} aria-label={RATINGS_WORDS.link}>
      <Link href={`${groupPath}/ratings`} className={facilitator.button}>
        {RATINGS_WORDS.link}
      </Link>
      <p className={weekly.cardLine}>{RATINGS_WORDS.linkLine}</p>
    </section>
  ) : null;
  const queueCard =
    groupWeek && groupWeek.counts.length > 0 && groupWeek.counts[0].of > 0 ? (
      <ReflectionsQueueCard
        counts={groupWeek.counts}
        href={`${groupPath}/reflections?week=${groupWeek.weekNumber}`}
        namesHref={firstQuestionHref(`${groupPath}/question`, groupWeek.weekNumber, "reflection")}
      />
    ) : null;
  const summerWaiting = model.toReview.length > 0;
  // The summer's exercises keep their own card while any of them waits, and
  // on a run of the summer's weeks always (no written answers half there).
  const toReviewDraws = groupWeek ? summerWaiting : writtenQueue === null || summerWaiting;

  /*
   * ONE ORDER, read top to bottom on a phone and as two columns on a laptop
   * (the `.columns` blocks fold into one column, the left first, on a page
   * narrower than 820px):
   *
   *   the head, with Write and Change a session;
   *   the session (the notice and the ticket, or the cards in its place);
   *   the pathways and cases card, while it is pinned;
   *   left: who is joining online, Before the session, the pathways and the
   *   pairs; right: who has done the week, the updates, how the group meets
   *   with its meeting links;
   *   the rate card and the review queue;
   *   This week's work;
   *   left: your group and the registers; right: the pace and the notes.
   */
  return (
    <div className={facilitator.page}>
      <div className={`${weekly.bar} ${facilitator.phoneBar}`}>
        <div className={weekly.barStart}>
          <Link href="/learn" className={weekly.back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span>{MY_PROGRAMMES}</span>
          </Link>
        </div>
        <div className={weekly.barEnd} />
      </div>

      <header className={facilitator.head}>
        <div className={facilitator.headMain}>
          <Link href="/learn" className={`${facilitator.crumb} ${facilitator.crumbDesk}`}>
            {MY_PROGRAMMES}
          </Link>
          <div className={weekly.titleRow}>
            <h1 className={weekly.title}>{groupName}</h1>
            {chip && <span className={weekly.weekChip}>{chip}</span>}
          </div>
          {headParts.length > 0 && (
            /* Each part brings the dot before it, and the line starts a dot's
               width off its own left edge, so a part that wraps to a new line
               never starts with one (the board's own way). */
            <div className={facilitator.headLineWrap}>
              <p className={facilitator.headLine}>
                {headParts.map((part, index) => (
                  <span key={part} className={facilitator.headPart}>
                    <span className={facilitator.headSep} aria-hidden="true">
                      ·
                    </span>
                    {index > 0 && <span className={weekly.srOnly}>, </span>}
                    {part}
                  </span>
                ))}
              </p>
            </div>
          )}
        </div>

        {/* "Write to Group B (7)" and "Change a session", the
            write link's line under both: it says how many the update emails.
            An archived group has neither: nobody writes to it or changes it. */}
        {!group.archived && (
          <div className={facilitator.headActions}>
            <div className={facilitator.buttons}>
              {groupCount && (
                <Link href={`${groupPath}/update`} className={facilitator.button}>
                  {writeToGroupWords(groupCount.groupName ?? group.name, groupCount.people)}
                </Link>
              )}
              <Link href={`${groupPath}/sessions`} className={facilitator.buttonGhost}>
                {CHANGE_A_SESSION}
              </Link>
            </div>
            {groupCount && (
              <p className={facilitator.actionsLine}>{writeToGroupLine(groupCount.emails, groupCount.notYetTold)}</p>
            )}
          </div>
        )}
      </header>

      <div className={facilitator.groupRows}>
        {sessionCards}
        {pinnedCard}

        <div className={facilitator.columns}>
          {comingDraws && <div className={facilitator.colMain}>{comingCards}</div>}
          <div className={facilitator.colSide}>{weekCards}</div>
        </div>

        {rateCard}
        {writtenCard}
        {queueCard}
        {toReviewDraws && toReviewCard}

        {groupWeek && (
          <ThisWeeksWork
            week={groupWeek}
            groupName={groupName}
            personHref={(uid) => readHref(uid, groupWeek.weekNumber)}
            visitorHref={(uid) => readingHref(`${groupPath}/coursework`, uid, groupWeek.weekNumber)}
            columns={workColumnsOf(workColumns)}
            boxes={boxes}
            boxesFirstRead={boxesRead ? { runId, ...boxesRead } : null}
            ownLine={
              groupWeek.ownLeftOut
                ? facilitatorsWorkLine(programme?.leadFirstName ?? null)
                : groupWeek.ownApart
                  ? ownCountedApartLine(groupWeek.of)
                  : null
            }
            emptyLine={model.notYetTold ? NAMES_WHEN_GROUPS_GO_OUT : undefined}
          />
        )}

        <div className={facilitator.columns}>
          <div className={facilitator.colMain}>{groupCards}</div>
          <div className={facilitator.colSide}>{restCards}</div>
        </div>
      </div>
    </div>
  );
}
