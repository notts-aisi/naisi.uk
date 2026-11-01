"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import PageHead from "@/components/ui/PageHead";
import ProgressBar from "@/components/ui/ProgressBar";
import Skeleton from "@/components/ui/Skeleton";
import { useAuth } from "@/auth/AuthProvider";
import type { MyRunEntry } from "@/app/api/courses/me/route";
import { weekHref } from "@/features/courses/links";
import { ticketFacts } from "@/features/courses/sessionChange/cardFacts";
import SessionNotice from "@/features/courses/sessionChange/SessionNotice";
import { AfterLastSession, WhatsNextCard } from "@/features/courses/weekly/ProgrammeEnd";
import EndSurveyCard, { type LastSession } from "@/features/surveys/cards/EndSurveyCard";
import { inLastWeek } from "@/lib/courses/programmeEnd";
import type { SurveyCard } from "@/lib/surveys/waiting";
import { useRunOverview } from "@/features/courses/useRunOverview";
import { useWeek } from "@/features/courses/useWeek";
import SessionTicket from "@/features/courses/weekly/SessionTicket";
import TickRows, { tickItemsOf } from "@/features/courses/weekly/TickRows";
import YourGroup from "@/features/courses/weekly/YourGroup";
import { whoStepsOut } from "@/features/courses/weekly/whoStepsOut";
import { useGroupRoster } from "@/features/courses/useGroupRoster";
import { useMaterialTicks } from "@/features/courses/weekly/useMaterialTicks";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { endedPart } from "@/lib/courses/finishing/words";
import {
  BEFORE_FIRST_SESSION,
  BEFORE_TODAY,
  BEFORE_TONIGHT,
  BEFORE_YOUR_SESSION,
  afterLastSessionHeading,
  doneWords,
  groupHoursWords,
  homeEyebrow,
  hoursWords,
  notUpYetWords,
  openWeekWords,
  sessionEyebrow,
  tonightWord,
  weekTitleWords,
} from "@/lib/courses/memberPageWords";
import { dayWords } from "@/lib/courses/sessionChange/words";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { weekDocId } from "@/lib/firestore/courses";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { handedTasksDone } from "@/lib/courses/weekBlocks/progress";
import { blockTickItemsOf } from "@/features/courses/weekBlocks/tickItems";
import { ArrowRight } from "./icons";
import { firstName } from "./homeWords";
import styles from "./home.module.css";

/**
 * HOME FOR A MEMBER ON A PROGRAMME (board wk-home-phone): their next session,
 * the reading before it to tick, their group, and the events coming up.
 *
 * Everything here is read through what the programme's own pages read:
 * `/api/courses/runs/[runId]/overview` for the run, the group and the next
 * session; the week's document for its reading; the member's own ticks; and
 * the group's roster route for its names.
 *
 * A READING TICKED ON HOME IS TICKED ON ITS WEEK (C33, as drawn): the boxes
 * here write through `useMaterialTicks`, the week page's own path, so a tick
 * here and a tick on the week's page are the same record of the same item.
 * Only somebody taking part, on an active enrolment, ticks.
 *
 * "Add to calendar" fills the row under the ticket (st-calendar-phone: the
 * member's own calendar link).
 *
 * A CHANGED WEEK (wk-changes) reads here as on the programme page: a
 * cancelled evening's notice over the ticket, and the ticket's eyebrow naming
 * the weeks a session covers or that it is online (`sessionEyebrow`).
 *
 * THE LAST WEEK (wk-lastweek-phone), by the member's own calendar
 * (`inLastWeek`): the ticket says "Tonight · your last session" on its day;
 * under it, in the board's order, "The survey at the end" while it is theirs
 * to answer (`endSurvey`, the card Home's top would have drawn, handed here
 * so it is drawn once), "After tonight" with the certificate line, and
 * "What’s next" from the term's form (`whatsNext` on the overview). The
 * reading before the session, the group and the events follow, as on any
 * week. Home's own events stay where they are, after them.
 *
 * A WEEK WRITTEN AS BLOCKS counts by This week's tasks ("0 of 1 done" for
 * week 1, `src/lib/courses/weekBlocks/progress.ts`) and lists the sources on
 * its path to tick, with no bar: the boards draw no percentages for it.
 *
 * WHAT IS NOT HERE: "Can’t make it" beside it on the ticket, which is the
 * programme page's alone (`CantMakeIt`). The member's marks are on their
 * programme's own page, with no count (C26), and not on Home, which the board
 * draws without them.
 */

/** "AGI Strategy Fellowship · Group B · week 3 of 6", and the shorter "AGI Strategy · week 3 of 6". */
function headLine(entry: MyRunEntry, programmeName: string): { long: string; short: string } {
  const week = entry.currentWeek;
  const number = week ? (week.weekNumber ?? week.anchorWeekNumber) : 0;
  // After the last week: "finished" only where the member's own finished
  // record says so (`entry.finished`), "ended" for everybody else.
  const over = endedPart(entry.finished === true);
  const weekPart =
    !week || week.phase === "before"
      ? "starts soon"
      : week.phase === "after"
        ? over
        : week.breakLabel
          ? week.breakLabel
          : number >= 1
            ? entry.totalWeeks > 0
              ? `week ${number} of ${entry.totalWeeks}`
              : `week ${number}`
            : "starting this week";
  return {
    long: [entry.courseTitle, entry.groupName, weekPart].filter(Boolean).join(" · "),
    short: homeEyebrow(programmeName, weekPart),
  };
}

type Slots = {
  given: string;
  /** The invitation to install the site as an app, drawn under the greeting. */
  invite: ReactNode;
  entry: MyRunEntry;
  /** Server-rendered: the next events, as two small cards. */
  comingUp: ReactNode;
  /** Server-rendered: the member's applications, when they have any. */
  applications: ReactNode;
  /** The cards every form of Home ends with. */
  more: ReactNode;
  /**
   * In the programme's last week, its survey at the end while it waits for
   * the member (`surveysWaitingFor`'s card, moved here from Home's top by
   * `HomeMember`). Null on every other week, and when it does not wait.
   */
  endSurvey?: SurveyCard | null;
};

export default function HomeProgramme({ given, invite, entry, comingUp, applications, more, endSurvey = null }: Slots) {
  const { user } = useAuth();
  const { data, error } = useRunOverview(entry.runId);
  const [tickFailed, setTickFailed] = useState(false);
  const head = headLine(entry, data?.programme?.name || entry.courseTitle);

  const group = data?.group ?? null;
  const facts = group ? ticketFacts(group) : null;
  const learner = data?.enrolment?.role === "learner" ? data.enrolment : null;

  // The reading before the next session: that session's own week, open to
  // read once it is published, as every published week is.
  const weekNumber = facts?.weekNumber ?? 0;
  const schedule = data?.weekSchedule.find((week) => week.weekNumber === weekNumber) ?? null;
  const doc = data?.weeks.find((week) => week.weekNumber === weekNumber) ?? null;
  const readable = schedule?.open === true;
  const weekSource = data
    ? { groupId: data.enrolment?.groupId ?? data.group?.id ?? null, forkedWeekIds: data.forkedWeekIds }
    : null;
  // An unopened or unpublished week is not asked for: a learner may not read one.
  const week = useWeek(entry.runId, readable ? weekDocId(weekNumber) : "", false, weekSource);
  // A week submitted or locked takes no tick until somebody running the group reopens it.
  const weekTakesTicks = doc?.work ? doc.work.state === "open" || doc.work.state === "reopened" : true;
  const ticks = useMaterialTicks(entry.runId, user?.uid ?? null, weekNumber, learner?.status === "active" && weekTakesTicks);

  const runHref = `/learn/${encodeURIComponent(entry.runId)}`;
  const todayKey = londonDateKey(new Date());
  const isToday = facts !== null && facts.dateKey === todayKey;
  const isFirst = facts !== null && facts.dateKey === (group?.calendar.firstSessionDate ?? "");
  const facilitators = (group?.facilitatorNames ?? []).map((name, index) => ({
    uid: `${group?.id ?? "group"}-${index}`,
    name,
    firstName: firstName(name) || name,
  }));

  // The last week (wk-lastweek-phone), by the member's own calendar. The
  // group's last session is the last one its calendar holds, a cancelled one
  // left out; once it is over there is no ticket, and the cards say so.
  const lastWeek = inLastWeek(entry.currentWeek, entry.totalWeeks);
  const lastDateKey = group?.calendar.lastSessionDate ?? "";
  const isLast = facts !== null && lastDateKey !== "" && facts.dateKey === lastDateKey;
  const onTheDay = isLast && isToday && facts ? (tonightWord(facts.startTimeLocal) === "Tonight" ? "tonight" : "today") : null;
  // The group's names, read once for the group's card and for who steps out
  // while the survey at the end is answered: the group's facilitators who
  // hold no place in it (`whoStepsOut`), so a facilitator who answers it too
  // is never said to step out.
  const ownGroupId = learner && group && learner.groupId === group.id ? group.id : "";
  const roster = useGroupRoster(ownGroupId);
  const inTheRoom = ownGroupId ? whoStepsOut(roster, user?.uid ?? null) : null;
  const firstNames = (people: readonly { displayName: string }[]) => people.map((person) => firstName(person.displayName) || person.displayName);
  const lastSession: LastSession | null =
    isLast && facts
      ? {
          when: onTheDay ?? { day: dayWords(facts.dateKey) },
          facilitators: inTheRoom ? { stepOut: firstNames(inTheRoom.stepOut), takePart: firstNames(inTheRoom.takePart) } : null,
          online: facts.mode === "virtual",
        }
      : null;

  // A week written as blocks counts This week's tasks; any other week, its
  // readings and checklist, as it always has.
  const tasks = (doc?.thisWeek?.rows ?? []).flatMap((row) => (row.type === "task" ? [row] : []));
  const byTasks = doc?.thisWeek ? handedTasksDone(tasks, ticks.isDone) : null;
  const countable = doc?.countableIds ?? [];
  const total = byTasks ? byTasks.of : countable.length;
  const done = byTasks ? byTasks.done : countable.filter((id) => ticks.isDone(id)).length;
  const ticksKnown = !ticks.loading && !ticks.error;
  const beforeTitle = !facts
    ? BEFORE_YOUR_SESSION
    : isToday
      ? tonightWord(facts.startTimeLocal) === "Tonight"
        ? BEFORE_TONIGHT
        : BEFORE_TODAY
      : isFirst
        ? BEFORE_FIRST_SESSION
        : BEFORE_YOUR_SESSION;

  return (
    <>
      {head.short && <p className={`meta ${styles.phoneEyebrow}`}>{head.short}</p>}
      <PageHead
        title={given ? `Hi ${given}.` : "Hi."}
        description={<span className={styles.headLine}>{head.long}</span>}
      />
      {invite}

      {!data && !error && <Skeleton height="14rem" />}

      {error && (
        <section className={styles.card}>
          <p className={styles.quiet}>We couldn’t load your programme just now.</p>
          <div>
            <Link href={runHref} className={styles.textLink}>
              Open {entry.courseTitle}
              <ArrowRight />
            </Link>
          </div>
        </section>
      )}

      {/* An evening is off (Q25, wk-changes): the notice the programme page
          shows, over the session the group meets at next. */}
      {data && group?.sessionNotice && <SessionNotice notice={group.sessionNotice} />}

      {data && group && facts && (
        <SessionTicket
          home
          facts={facts}
          eyebrow={sessionEyebrow({
            isToday,
            isFirst,
            isLast,
            startTimeLocal: facts.startTimeLocal,
            weekNumbers: facts.weekNumbers,
            dateKey: facts.dateKey,
            online: facts.mode === "virtual",
            home: true,
          })}
          heading={groupHoursWords(group.name, hoursWords(facts.startTimeLocal, facts.durationMinutes))}
          roomChanged={schedule?.roomChanged === true}
          facilitators={facilitators}
          calendar={learner !== null && learner.groupId === group.id}
        />
      )}

      {data && !(group && facts) && (
        <section className={styles.card}>
          <p className={styles.quiet}>
            {!group
              ? "You’ll be placed in a group soon. Your sessions appear here after that."
              : "No more sessions are planned for your group."}
          </p>
          <div>
            <Link href={runHref} className={styles.textLink}>
              Open {entry.courseTitle}
              <ArrowRight />
            </Link>
          </div>
        </section>
      )}

      <div className={styles.columns}>
        <div className={styles.stack}>
          {/* The last week's cards, in wk-lastweek-phone's order, straight under the ticket. */}
          {data && lastWeek && endSurvey && (
            <EndSurveyCard survey={{ state: "open", card: endSurvey }} look="card" lastSession={lastSession} />
          )}
          {data && lastWeek && <AfterLastSession heading={afterLastSessionHeading(onTheDay ?? "around")} />}
          {data && lastWeek && <WhatsNextCard whatsNext={data.whatsNext} look="card" />}
          {data && facts && weekNumber >= 1 && (
            <section className={`${weekly.card} ${weekly.cardTight}`} aria-labelledby="home-before">
              <div className={weekly.cardHead}>
                <h2 id="home-before" className={weekly.cardTitle}>
                  {beforeTitle}
                </h2>
                {readable && ticksKnown && total > 0 ? (
                  <p className={weekly.cardCount}>{doneWords(done, total)}</p>
                ) : (
                  !isToday && <span className={weekly.cardMeta}>{dayWords(facts.dateKey)}</span>
                )}
              </div>
              <p className={`${weekly.cardLine} ${weekly.cardLineSpaced}`}>{weekTitleWords(weekNumber, doc?.title ?? "")}</p>
              {readable && ticksKnown && total > 0 && !byTasks && (
                <ProgressBar value={done} max={total} size="md" ariaLabel={doneWords(done, total)} />
              )}
              {readable && week.status === "loading" && <Skeleton lines={3} height="2.5rem" ariaLabel="Loading the reading…" />}
              {readable && week.status === "ready" && week.week && (
                <TickRows
                  items={
                    isBlockWeek(week.week)
                      ? blockTickItemsOf(week.week.blocks, Object.assign({}, ...tasks.map((task) => task.packs ?? {})))
                      : tickItemsOf(week.week, false)
                  }
                  isDone={ticks.isDone}
                  canTick={ticks.canTick}
                  showTicks={learner !== null}
                  onTick={(kind, id, next) => {
                    void ticks.toggle(kind, id, next).then((ok) => setTickFailed(!ok));
                  }}
                  open="icon"
                />
              )}
              {tickFailed && (
                <p className={weekly.tickError} role="alert">
                  That tick didn’t save, so it has been undone. Check your connection and try again.
                </p>
              )}
              {readable ? (
                <div className={weekly.cardFootRule}>
                  <Link href={weekHref(entry.runId, weekNumber)} className={weekly.cardLink}>
                    {openWeekWords(weekNumber)}
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              ) : (
                <p className={weekly.cardLine}>{notUpYetWords(weekNumber)}</p>
              )}
            </section>
          )}
          {/* The board's order on a phone: the reading, the group, then the events. */}
          {data && learner && group && learner.groupId === group.id && (
            <YourGroup groupId={group.id} groupName={group.name} selfUid={user?.uid ?? null} namesOnly={false} roster={roster} />
          )}
          {comingUp}
        </div>

        <div className={styles.stack}>
          {applications}
          {more}
        </div>
      </div>
    </>
  );
}
