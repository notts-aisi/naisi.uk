"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import PageHead from "@/components/ui/PageHead";
import Skeleton from "@/components/ui/Skeleton";
import type { MyRunEntry } from "@/app/api/courses/me/route";
import { PeopleIcon } from "@/features/courses/facilitator/icons";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import { useFacilitatorSummary } from "@/features/courses/facilitator/useFacilitatorSummary";
import { useFacilitatorGuide } from "@/features/courses/facilitatorGuide/useFacilitatorGuide";
import { ticketFacts } from "@/features/courses/sessionChange/cardFacts";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { NAMES_WHEN_GROUPS_GO_OUT } from "@/features/courses/groupNamesWords";
import {
  NOBODY_IN_GROUP,
  NO_MORE_SESSIONS,
  OPEN_YOUR_GROUP,
  OPEN_YOUR_PROGRAMME,
  REVIEW,
  SAY_HELLO,
  TAKING_PART_TOO,
  TAKE_THE_REGISTER,
  THIS_WEEK,
  WHOS_COMING,
  comingChipWords,
  expectedWords,
  firstSessionEyebrow,
  homeNextEmailWords,
  homeRoomLine,
  homeTicketHeading,
  leftLine,
  openGroupWords,
  sayHelloLine,
  takeRegisterLine,
  toReviewWords,
  whosComingSentence,
} from "@/lib/courses/facilitatorPageWords";
import { firstQuestionHref, readingAnswerHref } from "@/lib/courses/coursework/forwards";
import { homeSlipsLineWords, homeSlipsTitleWords } from "@/lib/courses/drawCard/words";
import { NO_GUIDE_LINKS, guideLinksView, type GuideLinksView, type GuideRead } from "@/lib/courses/facilitatorGuide/links";
import {
  MY_PROGRAMMES_PATH,
  NOT_ALL_LOADED,
  SEE_THEM_ALL,
  oneGuideLink,
  takingPartInWords,
  facilitateGroupsWords,
  groupAndCourseWords,
  nextMeetingWords,
  otherGroupsTitle,
  type GroupOnRun,
} from "@/lib/courses/homeGroups";
import { STARTS_WITH_AN_EXPLAINER, facilitatorLineWords, scheduledByWords } from "@/lib/courses/explainers/words";
import { WRITE_FEEDBACK, toWriteWords } from "@/lib/courses/feedback/words";
import { sessionEyebrow, weekTitleWords } from "@/lib/courses/memberPageWords";
import { writeToGroupLine, writeToGroupWords } from "@/lib/courses/updates/words";
import { addDaysToKey, londonDateKey } from "@/lib/courses/weekPlan";
import { facilitatorArchivedLine, facilitatorArchivedTitle } from "@/lib/courses/groupArchive/words";
import { londonDayLabel } from "@/lib/courses/londonLabels";
import { ArrowRight } from "./icons";
import { tilePartsOfDay } from "./homeWords";
import { useFacilitatedRuns, type ReadRun } from "./useFacilitatedRuns";
import styles from "./home.module.css";

/**
 * HOME FOR A FACILITATOR: their group's next
 * session as a ticket, with how many are expected; "Take the register" and
 * where it leads; this week's theme, the exercises waiting for a review and,
 * while next week's email is on its schedule, when it goes; somebody who left
 * the group recently; and the events coming up.
 *
 * Read through two answers: the run's overview for the group and its next
 * session, and the group's summary route for what only its facilitators are
 * told (how many are expected, what waits for a review, next week's email,
 * who left). The register is on its own page beside the group's, and "Take
 * the register" goes there.
 *
 * NOT DRAWN: who can't make it tonight. The register says it, which "Take
 * the register" opens.
 *
 * THE FACILITATOR GUIDE, under this week's title, by the session card's one
 * rule (`src/lib/courses/facilitatorGuide/links.ts`): "Facilitator guide for
 * week 3" when the guide's own route says the week has something loaded, or
 * else a sentence saying the week's plan is not in the guide yet and who
 * loads it (the programme's lead by first name, from the overview, or an
 * admin); "Facilitator guide", the guide's course page, whenever anything is
 * loaded or the read failed; and one sentence in place of both when nothing
 * is loaded for the course. All from one answer (`useFacilitatorGuide`),
 * which the route gives only the guide's readers. After the last session
 * the card that says so keeps "Facilitator guide", with "Open Group B" to
 * the group's page.
 *
 * "OPEN GROUP B", under "Take the register", to the group's page in every
 * week; before the first session the ticket's own "Open your group" is it.
 *
 * BEFORE THE GROUP'S FIRST SESSION, on every day
 * before the day of the first session: the first session as a ticket with
 * "Open your group" in it; This week with the guide, from the day somebody is
 * made a facilitator; who's coming, each person by first name with
 * "coming" or "hasn't said", once Publish has told them their group (as decided,
 * the summary hands it to the group's facilitators and to nobody else, and
 * nothing else from an application); and Say hello, the way to write to the
 * group, while anybody in it has been told. From the day of the first
 * session it is the weekly Home above, with "Take the register".
 *
 * A FACILITATOR WHOSE ONLY GROUP ON THE RUN WAS ARCHIVED is told what the
 * group's own page tells them, "Group F was archived on Mon 2 Nov." and
 * "Its registers are kept. Maya, the programme’s lead, can tell you more.",
 * in place of "You don’t have a group yet.", which stays for somebody with
 * no group at all (`archivedFacilitates` on their row of the hub).
 *
 * SOMEBODY WITH TWO GROUPS sees the one that meets next, and a line saying
 * there are more with the way to all of them, My programmes, which lists
 * each group.
 *
 * ON TWO COURSES (two live runs or more, `others`), the group shown is the
 * one that meets next of ALL of them and the count is all of them: each other
 * run's overview is read too (`useRunOverviews`), and nothing is drawn until
 * every run has answered, so the ticket never jumps from one group to
 * another. The sentence then leads, and the groups not shown follow This
 * week on one card ("Your other group"), each with when it meets next, the
 * way to its page and its own course's guide by the same rule, under the
 * course's title (`useFacilitatorGuide`, once for each other course). With
 * one run nothing more is asked or drawn.
 *
 * AT THE SESSION THAT HANDS SLIPS OUT, from its start to the end of its
 * evening while somebody has not got theirs, a card pointing to the
 * pathways and cases page on the week the slips are for: "After Wednesday’s
 * session", "Copy in the pathways and cases you hand out for week 3." From
 * the summary route, which works it out for the group's facilitators alone.
 *
 * AN EXPLAINER at the start of the next session, when an admin scheduled one:
 * the ticket says so as the group page's does, from the summary route, and
 * only on the session the summary names it for.
 */

const NO_OTHERS: readonly MyRunEntry[] = [];

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

function TickIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={facilitator.comingTick}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

/**
 * The guide under This week's title, and under "No more sessions": this
 * week's part or the sentence in its place, then the guide's course page, by
 * the session card's rule (`guideLinksView`). Nothing when the rule draws
 * nothing.
 */
function HomeGuideLinks({ view, courseTitle }: { view: GuideLinksView; courseTitle?: string }) {
  if (!view.week && !view.standing && !view.sentence) return null;
  // Somebody facilitating on two courses has two guides: each link says
  // whose, under its words (and in them, for a screen reader).
  const guideLink = (link: { href: string; label: string }) =>
    courseTitle ? (
      <div className={styles.guideLink}>
        <Link href={link.href} className={styles.textLink}>
          {link.label}
          <span className={styles.srOnly}>, {courseTitle}</span>
          <ArrowRight />
        </Link>
        <span className={styles.guideCourse} aria-hidden="true">
          {courseTitle}
        </span>
      </div>
    ) : (
      <Link href={link.href} className={styles.textLink}>
        {link.label}
        <ArrowRight />
      </Link>
    );
  return (
    <div className={facilitator.weekGuide}>
      {view.week && guideLink(view.week)}
      {view.sentence && <p className={facilitator.guideSentence}>{view.sentence}</p>}
      {view.standing && guideLink(view.standing)}
    </div>
  );
}

/**
 * The groups Home does not show, for somebody facilitating on two courses:
 * each with when it meets next, the way to its page, and its course's guide
 * by the session card's rule, then the way to every group.
 */
function OtherGroups({
  items,
  shownCourseId,
  shownGuide,
  someMissing,
}: {
  items: readonly GroupOnRun<ReadRun>[];
  shownCourseId: string;
  shownGuide: GuideRead | null;
  /** A run did not answer: say so, and keep the way to every group. */
  someMissing: boolean;
}) {
  // One guide read per course, the course Home shows reusing its own answer.
  const courses: { courseId: string; items: GroupOnRun<ReadRun>[] }[] = [];
  for (const item of items) {
    const courseId = item.run.data.run?.courseId ?? "";
    const known = courses.find((course) => course.courseId === courseId);
    if (known) known.items.push(item);
    else courses.push({ courseId, items: [item] });
  }
  return (
    <section className={styles.card} aria-labelledby={items.length > 0 ? "home-other-groups" : undefined}>
      {items.length > 0 && (
        <h2 id="home-other-groups" className={facilitator.beforeTitle}>
          {otherGroupsTitle(items.length)}
        </h2>
      )}
      {courses.map((course) => (
        <OtherCourseGroups
          key={course.courseId || course.items[0].run.entry.runId}
          courseId={course.courseId}
          items={course.items}
          guideRead={course.courseId === shownCourseId ? shownGuide : undefined}
        />
      ))}
      {someMissing && <p className={styles.quiet}>{NOT_ALL_LOADED}</p>}
      <div>
        <Link href={MY_PROGRAMMES_PATH} className={styles.textLink}>
          {SEE_THEM_ALL}
          <ArrowRight />
        </Link>
      </div>
    </section>
  );
}

/** The other groups on one course. `guideRead` is handed in for the course Home shows, and read here for any other. */
function OtherCourseGroups({
  courseId,
  items,
  guideRead,
}: {
  courseId: string;
  items: readonly GroupOnRun<ReadRun>[];
  guideRead: GuideRead | null | undefined;
}) {
  const ownRead = useFacilitatorGuide(guideRead === undefined ? courseId : "");
  const read = guideRead === undefined ? ownRead : guideRead;
  return (
    <>
      {items.map(({ run, group }) => {
        const facts = ticketFacts(group);
        const href = `/learn/${encodeURIComponent(run.entry.runId)}/group/${encodeURIComponent(group.id)}`;
        const courseTitle = run.entry.courseTitle;
        // One link per group: its week's part when loaded, else the guide's own page.
        const link = read ? oneGuideLink(read, courseId, facts && facts.weekNumber >= 1 ? facts.weekNumber : null) : null;
        return (
          <div key={`${run.entry.runId} ${group.id}`} className={styles.otherGroup}>
            <h3 className={styles.otherGroupName}>{groupAndCourseWords(group.name, courseTitle)}</h3>
            {facts && <p className={styles.small}>{nextMeetingWords(facts.dateKey, facts.startTimeLocal, facts.room)}</p>}
            <div className={facilitator.groupLinkWraps}>
              <Link href={href} className={styles.textLink}>
                {openGroupWords(group.name)}
                <ArrowRight />
              </Link>
            </div>
            {link && <HomeGuideLinks view={{ week: link, standing: null, sentence: null }} courseTitle={courseTitle} />}
          </div>
        );
      })}
    </>
  );
}

type Slots = {
  given: string;
  /** The invitation to install the site as an app, drawn under the greeting. */
  invite: ReactNode;
  entry: MyRunEntry;
  /** Server-rendered: the next events, as two small cards. */
  comingUp: ReactNode;
  /** The cards every form of Home ends with. */
  more: ReactNode;
  /**
   * The other live runs this person facilitates on, after `entry`, in the
   * order of their programmes. None: Home about one run, as it always was.
   */
  others?: readonly MyRunEntry[];
};

export default function HomeFacilitator({ given, invite, entry: first, comingUp, more, others = NO_OTHERS }: Slots) {
  const { entry, data, error, ordered, settled, missing } = useFacilitatedRuns(first, others);
  const acrossRuns = others.length > 0;
  // Across runs, how many groups there are comes from the list that names
  // them (the hub's `facilitates`), so a run that did not answer still
  // counts; a run whose row does not name its groups counts what it answered.
  const groupCount = acrossRuns
    ? [first, ...others].reduce((sum, run) => {
        const named = run.facilitates?.length ?? 0;
        return sum + (named > 0 ? named : ordered.filter((item) => item.run.entry.runId === run.runId).length);
      }, 0)
    : ordered.length;
  const groups = ordered.map((item) => item.group);
  const group = groups[0] ?? null;
  const elsewhere = acrossRuns ? ordered.slice(1) : [];
  const summary = useFacilitatorSummary(group?.id ?? "");
  const facts = group ? ticketFacts(group) : null;

  const runHref = `/learn/${encodeURIComponent(entry.runId)}`;
  const groupHref = group ? `${runHref}/group/${encodeURIComponent(group.id)}` : runHref;
  const headLine = [group?.name ?? entry.groupName, entry.courseTitle].filter(Boolean).join(" · ");
  const todayKey = londonDateKey(new Date());
  const isToday = facts !== null && facts.dateKey === todayKey;
  const tile = facts ? tilePartsOfDay(facts.dateKey) : null;
  const known = summary.data;
  const roomLine = facts ? homeRoomLine(facts.room ?? "", known?.coFacilitators ?? []) : "";
  const weekDoc = facts ? (data?.weeks.find((week) => week.weekNumber === facts.weekNumber) ?? null) : null;
  // Before the day of the group's first session, Home is the facilitator's before-the-first-session Home.
  const firstDay = group?.calendar.firstSessionDate ?? "";
  const beforeFirst = Boolean(group && facts && firstDay && todayKey < firstDay);
  const whosComing = known?.whosComing ?? null;
  // The explainer the next session starts with, on that session's ticket alone.
  const explainer =
    known?.explainer && known.explainer.sessionKey === group?.calendar.nextSession?.sessionKey ? known.explainer : null;
  // The course's facilitator guide, by the session card's one rule
  // (`guideLinksView`): this week's part when it has one, or the sentence
  // saying it is not loaded yet and who loads it, and the guide's course page.
  // Home is drawn for somebody who facilitates the group it shows, so a read
  // that fails still draws the course page's link. Nothing while the answer
  // is on its way; an overview that names no course asks for nothing.
  const courseId = data?.run?.courseId ?? "";
  const guideRead = useFacilitatorGuide(courseId);
  const guideFor = (weekNumber: number | null): GuideLinksView =>
    guideRead
      ? guideLinksView({
          read: guideRead,
          courseId,
          weekNumber,
          knownReader: true,
          leadFirstName: data?.programme?.leadFirstName ?? null,
        })
      : NO_GUIDE_LINKS;
  const guide = guideFor(facts && facts.weekNumber >= 1 ? facts.weekNumber : null);
  const openGroup = group ? openGroupWords(group.name) : "";
  // Somebody whose only group on the run was archived: Home says so, as the group's page does.
  const archivedGroup = entry.archivedFacilitates?.[0] ?? null;

  // This week: its title and the guide, and, from the day of the first
  // session, the work waiting for a review and when next week's email goes.
  // Before the first session it shows from the day somebody is made a
  // facilitator, which is when a facilitator prepares.
  const thisWeekCard = (full: boolean) =>
    data && group && facts && facts.weekNumber >= 1 ? (
      <section className={facilitator.weekCard} aria-label={THIS_WEEK}>
        <p className={facilitator.weekEyebrow}>{THIS_WEEK}</p>
        <p className={facilitator.weekTitle}>{weekTitleWords(facts.weekNumber, weekDoc?.title ?? "")}</p>
        <HomeGuideLinks view={guide} courseTitle={acrossRuns ? entry.courseTitle : undefined} />
        {full && known && known.writtenToGive !== undefined && (
          // A run written as blocks: the written answers waiting for feedback (Feedback to write).
          <div className={facilitator.weekRow}>
            <p className={facilitator.weekRowText}>
              {toWriteWords(known.writtenWeeks ?? [])}
            </p>
            <Link
              href={
                // The oldest answer waiting, sent or changed since its feedback, on the reading view of the person's week at the answer.
                known.writtenNext
                  ? readingAnswerHref(`${groupHref}/coursework`, known.writtenNext.uid, known.writtenNext.weekNumber)
                  : firstQuestionHref(`${groupHref}/question`, null, "answer")
              }
              className={styles.textLink}
            >
              {WRITE_FEEDBACK}
              <ArrowRight />
            </Link>
          </div>
        )}
        {full && known && (known.writtenToGive === undefined || known.toReview > 0) && (
          <div className={facilitator.weekRow}>
            <p className={facilitator.weekRowText}>{toReviewWords(known.toReview)}</p>
            <Link href={`${groupHref}/review`} className={styles.textLink}>
              {REVIEW}
              <ArrowRight />
            </Link>
          </div>
        )}
        {full && known?.nextEmail && (
          <p className={facilitator.weekEmail}>
            <MailIcon />
            <span>{homeNextEmailWords(group.name, known.nextEmail)}</span>
          </p>
        )}
      </section>
    ) : null;

  return (
    <>
      <PageHead
        title={given ? `Hi ${given}.` : "Hi."}
        description={
          // Across runs, nothing is said under the greeting until the group to show is known.
          acrossRuns && !settled ? undefined : <span className={styles.headLine}>{headLine}</span>
        }
      />
      {invite}

      {/* Across runs, how many there are leads; the others follow This week. */}
      {/* Only once a run has answered, so it never stands over the sentence
          saying none could be read; with a run that did not answer, only the
          count, since that run's group might meet sooner. */}
      {acrossRuns && settled && data && groupCount > 1 && (
        <p className={styles.quiet}>{facilitateGroupsWords(groupCount, missing.length === 0)}</p>
      )}

      {!data && !error && <Skeleton height="14rem" />}

      {error && (
        <section className={styles.card}>
          <p className={styles.quiet}>We couldn’t load your group just now.</p>
          <div>
            <Link href={runHref} className={styles.textLink}>
              Open {entry.courseTitle}
              <ArrowRight />
            </Link>
          </div>
          {/* Across runs, the way to every group stays when none could be read. */}
          {acrossRuns && (
            <div>
              <Link href={MY_PROGRAMMES_PATH} className={styles.textLink}>
                {SEE_THEM_ALL}
                <ArrowRight />
              </Link>
            </div>
          )}
        </section>
      )}

      {/* No session ahead. With a group, its last session is over: the way
          to its page says so by name, and the guide stays linked. With none,
          the programme's page. */}
      {data && !(group && facts) && (
        <section className={styles.card}>
          {!group && archivedGroup ? (
            // Their only group on the run was archived: what its own page says.
            <>
              <p className={styles.quiet}>
                {facilitatorArchivedTitle(archivedGroup.name, archivedGroup.archivedAt ? londonDayLabel(new Date(archivedGroup.archivedAt)) : "")}
              </p>
              <p className={styles.quiet}>{facilitatorArchivedLine(data.programme?.leadFirstName ?? null)}</p>
            </>
          ) : (
            <p className={styles.quiet}>
              {group ? NO_MORE_SESSIONS : "You don’t have a group yet."}
            </p>
          )}
          <div className={facilitator.groupLinkWraps}>
            <Link href={groupHref} className={styles.textLink}>
              {group ? openGroup : `Open ${entry.courseTitle}`}
              <ArrowRight />
            </Link>
          </div>
          {group && <HomeGuideLinks view={guideFor(null)} courseTitle={acrossRuns ? entry.courseTitle : undefined} />}
        </section>
      )}

      <div className={styles.columns}>
        <div className={styles.stack}>
          {data && group && facts && beforeFirst && (
            <div className={facilitator.homeStack}>
              <section className={`${weekly.ticket} ${weekly.ticketHome}`} aria-label="Your first session">
                <div className={weekly.ticketRow}>
                  {tile && (
                    <time className={weekly.stub} dateTime={facts.dateKey}>
                      <span className={weekly.stubWeekday}>{tile.weekday}</span>
                      <span className={weekly.stubDay}>{tile.day}</span>
                      <span className={weekly.stubMonth}>{tile.month}</span>
                    </time>
                  )}
                  <div className={weekly.ticketMain}>
                    <div className={weekly.ticketBody}>
                      <p className={weekly.ticketEyebrow}>
                        {firstSessionEyebrow(facts.dateKey === addDaysToKey(todayKey, 1), facts.weekNumbers)}
                      </p>
                      <h2 className={`${weekly.ticketWhen} ${facilitator.homeTicketWhen}`}>
                        {homeTicketHeading(group.name, facts.startTimeLocal)}
                      </h2>
                      {roomLine && <p className={facilitator.ticketRoomMuted}>{roomLine}</p>}
                      {facts.mode === "virtual" && <span className={weekly.liveChip}>Online this week</span>}
                      {explainer && (
                        <div className={facilitator.explainerBox}>
                          <span className={facilitator.explainerChip}>{STARTS_WITH_AN_EXPLAINER}</span>
                          <p className={facilitator.explainerText}>
                            {facilitatorLineWords(explainer.minutes, explainer.topic, explainer.by)}
                          </p>
                        </div>
                      )}
                      <Link href={groupHref} className={`${styles.primary} ${facilitator.beforeOpen}`}>
                        {OPEN_YOUR_GROUP}
                      </Link>
                    </div>
                  </div>
                </div>
              </section>
              {explainer && (
                <p className={facilitator.explainerLine}>{scheduledByWords(explainer.scheduledBy, explainer.fromWeekNumber)}</p>
              )}

              {/* This week, with the guide, from the day somebody is made a facilitator. */}
              {thisWeekCard(false)}

              {/* Who's coming: once Publish has told them, each person by
                  first name, "coming" or "hasn't said", and nothing else. */}
              {known && (
                <section className={facilitator.beforeCard} aria-labelledby="whos-coming">
                  <h2 id="whos-coming" className={facilitator.beforeTitle}>
                    {WHOS_COMING}
                  </h2>
                  {whosComing && whosComing.length > 0 ? (
                    <>
                      <p className={facilitator.beforeLine}>{whosComingSentence(whosComing)}</p>
                      <ul aria-label={WHOS_COMING} className={facilitator.comingList}>
                        {whosComing.map((person, at) => (
                          <li key={at} className={person.coming ? facilitator.comingChip : facilitator.notSaidChip}>
                            <span className={facilitator.comingMark}>
                              {person.coming ? <TickIcon /> : <span className={facilitator.notSaidDot} aria-hidden="true" />}
                            </span>
                            {person.firstName}
                            <span className={styles.srOnly}>{comingChipWords(person.coming)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className={facilitator.beforeLine}>
                      {known.notYetTold ? NAMES_WHEN_GROUPS_GO_OUT : NOBODY_IN_GROUP}
                    </p>
                  )}
                </section>
              )}

              {/* Say hello: an update to the group, while anybody in it has
                  been told their group, with how many it emails. */}
              {known?.write && known.write.people > 0 && (
                <section className={facilitator.beforeCard} aria-labelledby="say-hello">
                  <h2 id="say-hello" className={facilitator.beforeTitle}>
                    {SAY_HELLO}
                  </h2>
                  <p className={facilitator.beforeLine}>
                    {sayHelloLine(firstDay, firstDay <= addDaysToKey(todayKey, 6))}
                  </p>
                  <Link href={`${groupHref}/update`} className={`${styles.secondary} ${facilitator.sayHelloButton}`}>
                    {writeToGroupWords(group.name, known.write.people)}
                  </Link>
                  <p className={facilitator.sayHelloLine}>
                    {writeToGroupLine(known.write.emails, known.write.notYetTold)}
                  </p>
                </section>
              )}
            </div>
          )}

          {data && group && facts && !beforeFirst && (
            <div className={facilitator.homeStack}>
              {/* The stub and the body side by side, in the ticket's row: the
                  ticket itself is a column since Add to calendar (#116). */}
              <section className={`${weekly.ticket} ${weekly.ticketHome}`} aria-label="Your next session">
                <div className={weekly.ticketRow}>
                  {tile && (
                    <time className={weekly.stub} dateTime={facts.dateKey}>
                      <span className={weekly.stubWeekday}>{tile.weekday}</span>
                      <span className={weekly.stubDay}>{tile.day}</span>
                      <span className={weekly.stubMonth}>{tile.month}</span>
                    </time>
                  )}
                  <div className={weekly.ticketMain}>
                    <div className={weekly.ticketBody}>
                      <p className={weekly.ticketEyebrow}>
                        {sessionEyebrow({
                          isToday,
                          isFirst: facts.dateKey === group.calendar.firstSessionDate,
                          startTimeLocal: facts.startTimeLocal,
                          weekNumbers: facts.weekNumbers,
                          home: true,
                        })}
                      </p>
                      <h2 className={`${weekly.ticketWhen} ${facilitator.homeTicketWhen}`}>
                        {homeTicketHeading(group.name, facts.startTimeLocal)}
                      </h2>
                      {roomLine && <p className={facilitator.ticketRoomMuted}>{roomLine}</p>}
                      {facts.mode === "virtual" && <span className={weekly.liveChip}>Online this week</span>}
                      {explainer && (
                        <div className={facilitator.explainerBox}>
                          <span className={facilitator.explainerChip}>{STARTS_WITH_AN_EXPLAINER}</span>
                          <p className={facilitator.explainerText}>
                            {facilitatorLineWords(explainer.minutes, explainer.topic, explainer.by)}
                          </p>
                        </div>
                      )}
                      {known && (
                        <div className={facilitator.homeTicketFoot}>
                          <p className={facilitator.homeTicketRow}>
                            <PeopleIcon />
                            {/* Before Publish has told anybody their group, when
                                their names come; a group nobody is in, says so. */}
                            <span>
                              {known.expected > 0
                                ? expectedWords(known.expected)
                                : known.notYetTold
                                  ? NAMES_WHEN_GROUPS_GO_OUT
                                  : NOBODY_IN_GROUP}
                            </span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {explainer && (
                <p className={facilitator.explainerLine}>{scheduledByWords(explainer.scheduledBy, explainer.fromWeekNumber)}</p>
              )}
              <div className={facilitator.registerCta}>
                <Link
                  href={`${groupHref}/register`}
                  className={`${styles.primaryLarge} ${facilitator.registerCtaButton}`}
                >
                  {TAKE_THE_REGISTER}
                </Link>
                <p className={facilitator.registerCtaLine}>{takeRegisterLine(isToday, facts.startTimeLocal)}</p>
              </div>
              {/* The group's own page, by its name, in every week. */}
              <div className={facilitator.homeOpenGroup}>
                <Link href={groupHref} className={styles.textLink}>
                  {openGroup}
                  <ArrowRight />
                </Link>
              </div>
            </div>
          )}

          {!beforeFirst && thisWeekCard(true)}

          {/* The slips being handed out tonight: the way to copy them in. */}
          {!beforeFirst && known?.slips && group && (
            <section className={`${styles.card} ${facilitator.drawCard}`} aria-labelledby="home-slips">
              <h2 id="home-slips" className={facilitator.beforeTitle}>
                {homeSlipsTitleWords(known.slips.handOutDateKey)}
              </h2>
              <p className={facilitator.drawCardLine}>{homeSlipsLineWords(known.slips.weekNumber, known.slips.title)}</p>
              <Link
                href={`/learn/draw/${encodeURIComponent(group.id)}?week=${known.slips.weekNumber}`}
                className={`${facilitator.buttonGhost} ${facilitator.drawCardButton}`}
              >
                {known.slips.title}
              </Link>
            </section>
          )}

          {known?.leftRecently.map((person) => (
            <div key={person.uid} className={facilitator.leftNotice} role="status">
              <InfoIcon />
              <p className={facilitator.leftNoticeText}>
                {leftLine({ name: person.name, firstName: person.firstName, leftDateKey: person.leftDateKey, from: person.from })}
              </p>
            </div>
          ))}

          {/* Across runs the groups not shown have their own card, with the way to all of them. */}
          {/* A run that did not answer is never dropped without a word: the way to every group stays. */}
          {(elsewhere.length > 0 || missing.length > 0) && data && (
            <OtherGroups items={elsewhere} shownCourseId={courseId} shownGuide={guideRead} someMissing={missing.length > 0} />
          )}

          {!acrossRuns && groups.length > 1 && (
            <p className={styles.quiet}>
              {facilitateGroupsWords(groups.length)}{" "}
              <Link href={MY_PROGRAMMES_PATH} className={styles.inlineLink}>
                {SEE_THEM_ALL}
              </Link>
            </p>
          )}

          {/* A facilitator who holds a place does the course too: Home leads
              with the group they run, and their own week is a tap away. On
              two courses, every course they take part in, whichever group is
              shown, by name. */}
          {!acrossRuns && entry.roles.includes("learner") && (
            <p className={styles.quiet}>
              {TAKING_PART_TOO}{" "}
              <Link href={runHref} className={styles.inlineLink}>
                {OPEN_YOUR_PROGRAMME}
              </Link>
            </p>
          )}
          {acrossRuns &&
            settled &&
            [first, ...others]
              .filter((run) => run.roles.includes("learner"))
              .map((run) => (
                <p key={run.runId} className={styles.quiet}>
                  {takingPartInWords(run.courseTitle)}{" "}
                  <Link href={`/learn/${encodeURIComponent(run.runId)}`} className={styles.inlineLink}>
                    {OPEN_YOUR_PROGRAMME}
                  </Link>
                </p>
              ))}

          {comingUp}
        </div>
        <div className={styles.stack}>{more}</div>
      </div>
    </>
  );
}
