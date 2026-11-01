import Link from "next/link";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { redirect } from "next/navigation";
import { firstName as firstNameOf } from "@/app/(app)/dashboard/homeWords";
import GroupNotesCard from "@/features/courses/facilitator/GroupNotesCard";
import {
  FacilitatorTicket,
  GroupPeopleCard,
  GroupRegistersCard,
  NoMoreSessionsCard,
  PaceCard,
  ToReviewCard,
} from "@/features/courses/facilitator/GroupCards";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import PathwaySpread from "@/features/courses/packsAndCases/PathwaySpread";
import PairsCard from "@/features/courses/pairs/PairsCard";
import { NAMES_WHEN_GROUPS_GO_OUT } from "@/features/courses/groupNamesWords";
import ThisWeeksWork, { ReflectionsQueueCard, workColumnsOf } from "@/features/courses/facilitatorWeek/ThisWeeksWork";
import { ticketFacts } from "@/features/courses/sessionChange/cardFacts";
import SessionNotice from "@/features/courses/sessionChange/SessionNotice";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import ReviewQueueCard from "@/features/courses/written/ReviewQueueCard";
import { loadWrittenQueue } from "@/lib/courses/writtenAnswers/queue";
import { StaffUpdatesSection } from "@/features/courses/updates/UpdatesList";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { facilitatorGuideReader } from "@/lib/courses/facilitatorGuide/access";
import { facilitatorGuidePath } from "@/lib/courses/facilitatorGuide/model";
import { readGuideIndex } from "@/lib/courses/facilitatorGuide/store";
import { guideForWeekWords } from "@/lib/courses/facilitatorGuide/words";
import { loadFacilitatorGroup } from "@/lib/courses/facilitatorGroup";
import { hasDraw } from "@/lib/courses/packsAndCases/model";
import { drawPeople, readDrawState, readGroupWeek, spreadOf } from "@/lib/courses/packsAndCases/readers";
import { changeDrawWords, spreadTitleWords } from "@/lib/courses/packsAndCases/words";
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
 * A FACILITATOR'S GROUP PAGE (boards wk-fac-group at 1440 and
 * wk-fac-group-phone at 390): the group, its week and how it meets; "Write to
 * Group B (7)" and "Change a session"; the next session as a ticket with how
 * many are expected and "Take the register"; the group's people with each
 * finished register's marks, and who left; the registers; the work to
 * review; the updates; the pace; and the notes the group's facilitators share
 * (C30). Drawn on the server, from the records the programme's own tabs read
 * (`src/lib/courses/facilitatorGroup.ts`), so a facilitator and the lead never
 * read two stories about one group.
 *
 * THE REGISTER is a page of its own beside this one (`./register`), as board
 * wk-register draws it: "Take the register" and each register's "See it" lead
 * there.
 *
 * THE WEEK (a week written as blocks): the review queue beside the ticket,
 * its written answers half (the written answers piece) and its reflections
 * half, with "Read them" to the page where lines are picked to
 * read out (`./reflections`), and This week's work across the page under
 * them, with who ticked each source and the private notes left on it
 * (`src/lib/courses/facilitatorWeek/`). A facilitator is never shown a
 * facilitator's own work there, their own included; an admin is, marked as
 * theirs. The rows of cards follow the board: the ticket and the review
 * queue, then This week's work, then the group and the rest.
 *
 * THE SPREAD (Q32 A, "Pathways in Group B"): the draw of the week of the
 * group's next session, each pathway with who has it, and the way to the draw
 * page (`/learn/draw/[groupId]`), where the slips are copied in.
 *
 * THE PAIRS ("Pairs in Group B"): when the week of the group's next session
 * asks for pairs (its In the session block says people are paired), each
 * pair, who is bringing a laptop and the check that every pair has one, and
 * the way to the pairs page (`/learn/pairs/[groupId]`), where they are typed.
 *
 * NOT DRAWN, though the board draws it: who can't make it tonight (that
 * feature does not exist yet).
 *
 * THE FACILITATOR GUIDE FOR THE WEEK ("Facilitator guide for week 3" on the
 * ticket) is drawn when that week of the course's facilitator guide has its
 * session plan or its notes loaded, and is asked of the guide's own gate
 * (`src/lib/courses/facilitatorGuide/access.ts`), which admits this page's
 * readers: the group's live facilitators and admins.
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
 * ONE RULE, stated identically here, in the review page beside it, in the
 * routes behind both, and in `runAccess.ts`: a non-admin reads a group they
 * facilitate only while it is LIVE. Admins bypass it: an archived cohort is
 * exactly the thing an admin is asked to go back and look at.
 *
 * Redirects, never 403s: someone guessing group ids learns nothing about which
 * ones exist. And this is a UI gate: the register, the notes and the email
 * ROUTES re-derive the same access from the same documents and are the real
 * boundary.
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
}: {
  params: Promise<{ runId: string; groupId: string }>;
}) {
  const { runId, groupId } = await params;

  const access = await getRunAccess(runId);
  if (!access) {
    // Null is "no session" OR "no such run", deliberately fused in
    // `getRunAccess`. `getSessionUser` is memoised by now, so telling the two
    // apart costs nothing and leaks nothing.
    const user = await getSessionUser();
    redirect(user ? "/learn" : "/login");
  }

  const runHome = `/learn/${encodeURIComponent(runId)}`;

  // Dynamic segments arrive URL-DECODED, so a `%2F` reaches us as a real path
  // separator and `doc()` would throw: a 500 out of a gate whose whole job is
  // to redirect. Same guard `getRunAccess` applies to the run id.
  if (!groupId || groupId.includes("/") || groupId === "." || groupId === "..") {
    redirect(runHome);
  }

  const db = getAdminDb();
  if (!db) redirect(runHome);

  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  if (!groupSnap.exists) redirect(runHome);
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
    redirect(runHome);
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
  // session's own weeks, room and link, and any evening that is off (Q25).
  // Resolved off the same calendar, by the same pure resolver.
  const changes = cardChangeFacts(
    resolveSessions(access.run, group, groupCalendar.calendar),
    group,
    range.next,
    londonDateKey(now),
  );

  // A break week and the before/after phases have no week doc of their own, so
  // the session override falls back to the anchor (the last taught week that
  // started), the slot the group will return to. Empty means "no override",
  // which `sessionForWeek` resolves to the recurring slot.
  const weekNumber = currentWeek
    ? (currentWeek.weekNumber ?? currentWeek.anchorWeekNumber)
    : 0;
  const weekId = weekNumber >= 1 ? weekDocId(weekNumber) : "";
  const session = sessionForWeek(group, weekId);

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
            // The gate above is the overview route's `canSeeMeetingUrl`.
            meetingUrl: changes.next?.meetingUrl ?? null,
          }
        : null,
    },
    sessionLabel: sessionLabel(session),
    weekday: session.weekday,
    startTimeLocal: session.startTimeLocal,
    durationMinutes: session.durationMinutes,
    location: session.location,
    // The gate above is the check the overview route calls `canSeeMeetingUrl`:
    // a facilitator of this group, or an admin. Nobody else reaches this line.
    meetingUrl: session.meetingUrl,
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

  // Updates (Q18): the way to write one to this group, counted as its press
  // counts, and the updates this group's page shows, through the one reader.
  // An archived group has no count, so no way to write to it.
  const runGroups = await loadRunGroups(db, runId);
  const [[groupCount], reading, model, programme, notes, writtenQueue] = await Promise.all([
    updateAudienceCounts(db, access.run, runGroups, { groupIds: [groupId] }, access.user.uid),
    updateReadingOf(db, access.user, access.run, runGroups),
    loadFacilitatorGroup(db, access.run, group, { isAdmin: access.isAdmin, actor: access.user }, now),
    runProgrammeOf(db, runId),
    readGroupNotes(db, group, access.user),
    // The review queue's written answers half: null on a run of the summer's weeks.
    loadWrittenQueue(db, access.user, access.run, group),
  ]);
  const writtenHref = (row: { uid: string; weekNumber: number }) =>
    `${groupPath}/written?week=${row.weekNumber}&person=${encodeURIComponent(row.uid)}`;
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

  // The draw of the week the group meets next (Q32 A): the slips handed out
  // at the end of the last session are that week's. Everybody in the group
  // is in it, its facilitators too, who take part.
  const drawWeek = !group.archived && range.next ? await readGroupWeek(db, runId, groupId, range.next.weekNumber) : null;
  const drawList = drawPeople(model.people, model.facilitators);
  const spread =
    drawWeek && hasDraw(drawWeek.draw) ? spreadOf(drawWeek, drawList, await readDrawState(db, runId, drawWeek, drawList)) : null;
  // The pairs of the same week, when it asks for them: everybody in the
  // group's pairs, its facilitators too, who take part.
  const pairsWeek = drawWeek ? await readGroupPairs(db, runId, groupId, drawWeek, drawList) : null;

  // This week's work's Pathway, Written answer and Case columns (wk-fac-group),
  // for the week it shows, through the packs' and the written answers' own
  // readers: each reader is shown what the review page and the draw page show
  // them of the same people.
  const workColumns = groupWeek
    ? await loadWorkColumns(db, {
        run: access.run,
        group,
        actor: access.user,
        viewer: { isAdmin: access.isAdmin, leadOf: null },
        weekNumber: groupWeek.weekNumber,
        people: drawList,
        reviewHref: (uid, week) => `${groupPath}/written?week=${week}&person=${encodeURIComponent(uid)}`,
        now,
      })
    : [];
  // Each person's fill-in boxes on that week (week 6's action plan), for exactly the people the boxes' own
  // gate lets this reader read: a fellow's, to the group's facilitators and admins; a facilitator's own, to
  // admins alone.
  const boxes = groupWeek ? await loadGroupWeekBoxes(db, { run: access.run, actor: access.user, week: groupWeek }) : [];

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

  // "Facilitator guide for week 3" on the ticket, when the course's guide has
  // that week, through the guide's own gate and its list of titles.
  const guideReader = facts && facts.weekNumber >= 1 ? await facilitatorGuideReader(db, access.user, access.run.courseId) : null;
  const guideWeeks = guideReader ? (await readGuideIndex(db, guideReader)).weeks.map((week) => week.weekNumber) : [];
  const guide =
    facts && guideWeeks.includes(facts.weekNumber)
      ? {
          href: facilitatorGuidePath(access.run.courseId, { kind: "week", weekNumber: facts.weekNumber }),
          label: guideForWeekWords(facts.weekNumber),
        }
      : null;

  // The page's cards, drawn once, and placed below by the shape of the week.
  const ticketCards = (
    <>
      {/* An evening is off (Q25): the notice the group reads, over the
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
          expected={model.expected > 0 ? model.expected : null}
          registerHref={registerHref}
          guide={guide}
        />
      )}
      {/* Every session the group holds is over: Home's sentence where the
          ticket was. A group with no dates yet draws nothing here. */}
      {!facts && range.lastDateKey && <NoMoreSessionsCard />}
      {drawWeek && spread && (
        <PathwaySpread
          title={spreadTitleWords(drawWeek.draw, groupName)}
          spread={spread}
          changeHref={`/learn/draw/${encodeURIComponent(groupId)}?week=${drawWeek.weekNumber}`}
          changeLabel={changeDrawWords(drawWeek.draw)}
        />
      )}
      {pairsWeek && (
        <PairsCard
          groupName={groupName}
          view={pairsWeek.view}
          laptops={pairsWeek.ask.laptops}
          changeHref={`/learn/pairs/${encodeURIComponent(groupId)}?week=${pairsWeek.weekNumber}`}
        />
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
  const sideCards = (
    <>
      <StaffUpdatesSection updates={staffUpdateRows(updates)} headingId="group-updates" />
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
  // The review queue (wk-fac-group), beside the ticket: its written answers
  // half, on a run whose weeks are written as blocks (null on a run of the
  // summer's weeks), and its reflections half, on a week written as blocks
  // with something to reflect on.
  const writtenCard = writtenQueue ? <ReviewQueueCard rows={writtenQueue} hrefFor={writtenHref} /> : null;
  // Once the run's last session is over, the way to rate the group: its
  // facilitators and admins, about two minutes a person. First in the side
  // column, whichever shape the page takes.
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
        namesHref={`${groupPath}/reflections/names?week=${groupWeek.weekNumber}`}
      />
    ) : null;
  const summerWaiting = model.toReview.length > 0;

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

        {/* "Write to Group B (7)" and "Change a session" (wk-fac-group), the
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

      {groupWeek ? (
        /* A week written as blocks, in the board's rows: the ticket and the
           review queue, This week's work across the page, then the group and
           the rest. On a phone the rows stack in that order. */
        <div className={facilitator.wkRows}>
          <div className={facilitator.columns}>
            <div className={facilitator.colMain}>{ticketCards}</div>
            {(rateCard || writtenCard || queueCard || summerWaiting) && (
              <div className={facilitator.colSide}>
                {rateCard}
                {writtenCard}
                {queueCard}
                {/* The summer's exercises keep their own card while any of them waits. */}
                {summerWaiting && toReviewCard}
              </div>
            )}
          </div>
          <ThisWeeksWork
            week={groupWeek}
            groupName={groupName}
            columns={workColumnsOf(workColumns)}
            boxes={boxes}
            ownLine={
              groupWeek.ownLeftOut
                ? facilitatorsWorkLine(programme?.leadFirstName ?? null)
                : groupWeek.ownApart
                  ? ownCountedApartLine(groupWeek.of)
                  : null
            }
            emptyLine={model.notYetTold ? NAMES_WHEN_GROUPS_GO_OUT : undefined}
          />
          <div className={facilitator.columns}>
            <div className={facilitator.colMain}>{groupCards}</div>
            <div className={facilitator.colSide}>{sideCards}</div>
          </div>
        </div>
      ) : (
        <div className={facilitator.columns}>
          <div className={facilitator.colMain}>
            {ticketCards}
            {groupCards}
          </div>

          <div className={facilitator.colSide}>
            {rateCard}
            {writtenCard}
            {/* The summer's exercises keep their own card, on a run of the
                summer's weeks or while any of them still waits. */}
            {(writtenQueue === null || summerWaiting) && toReviewCard}
            {sideCards}
          </div>
        </div>
      )}
    </div>
  );
}
