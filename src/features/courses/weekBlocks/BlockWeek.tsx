"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import PageEnter from "@/components/motion/PageEnter";
import type { OverviewPayload, OverviewThisWeekRow } from "@/app/api/courses/runs/[runId]/overview/route";
import type { ExerciseResponseWire } from "@/app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route";
import { firstName } from "@/app/(app)/dashboard/homeWords";
import {
  BOXES_SAVE_LINE,
  GO_FURTHER_SHORT,
  HANDS_ON_SHORT,
  PRIVATE_NOTE_HINT,
  PRIVATE_NOTE_HINT_FACILITATOR,
  NOT_COUNTED,
  ON_THIS_PAGE,
  SHARED_NOTES_SHORT,
  TASK_DONE,
  TASK_MARK_WORDS,
  THIS_WEEK,
  blockWeekEyebrow,
  doneWords,
  facilitatorReflectionsReadByWords,
  facilitatorTicksSeenByWords,
  inAllWords,
  itemsWords,
  ofWords,
  partWords,
  readOutWords,
  reflectionsReadByWords,
  taskWhenWords,
  ticksSeenByWords,
  weekOpensAfterWords,
} from "@/lib/courses/memberPageWords";
import { CANCELLED_CARD, ONLINE_NOTICE_LINK_LINE, dayRangeWords } from "@/lib/courses/sessionChange/words";
import type { WeekSharedNotes } from "@/lib/courses/sharedNotes/views";
import { addDaysToKey, isValidDateKey, londonDateKey } from "@/lib/courses/weekPlan";
import {
  SOURCE_KIND_LABEL,
  allBlocks,
  partsOf,
  type ChecklistBlock,
  type ContentNoteBlock,
  type GoFurtherBlock,
  type HandsOnBlock,
  type InTheSessionBlock,
  type OutcomesBlock,
  type PartBlock,
  type PartChild,
  type SourceBlock,
  type TextBlock,
  type ThisWeekBlock,
  type ThisWeekRow,
  type WeekBlock,
} from "@/lib/courses/weekBlocks/model";
import { safeSourceUrl } from "@/lib/courses/weekBlocks/prose";
import {
  isCounted,
  partNeeds,
  taskDone,
  taskNeeds,
  tasksDone,
  type DoneState,
} from "@/lib/courses/weekBlocks/progress";
import type { CourseWeekDoc } from "@/lib/firestore/courses";
import type { ProgressItemKind } from "@/lib/firestore/courseProgress";
import { weekHref } from "../links";
import PacingBanner from "../PacingBanner";
import { setWeekNavDirection } from "../weekNavDirection";
import GroupSharedNotes from "../weekly/GroupSharedNotes";
import TickRows from "../weekly/TickRows";
import type { MaterialTicks } from "../weekly/useMaterialTicks";
import weekly from "../weekly/weekly.module.css";
import Prose, { Runs } from "./Prose";
import ReflectStop from "./ReflectStop";
import SourceCard, { SourceTitle } from "./SourceCard";
import styles from "./blockWeek.module.css";

/**
 * A WEEK WRITTEN AS BLOCKS, AS THE PERSON TAKING PART READS IT (boards
 * st-week1-phone, wk-week-phone, and wk-week at 1440 with "On this page").
 * A week written before blocks never reaches this file: `WeekView` draws it
 * exactly as it always has.
 *
 * In page order: This week (its tasks, each with its time and when it is due
 * for the reader's group, a row with nothing to do, a row that is only
 * offered, "In all" and its note, and "N of M done" for somebody taking
 * part), then the week's blocks as the week holds them: Why this week, After
 * this week you can, a content note, Before the session, each part with its
 * time, its framing, its Done chip, its sources to tick, its reflection stops
 * and its checklist, a section of the guide's own, In the session with what
 * to do before you come, Go further and the hands-on route (both optional,
 * never counted); then the notes the group shares, and the way to the weeks
 * either side. Tables and code in a week's text are drawn inside the
 * column, each scrolling sideways on its own when it is wider than the page.
 *
 * DRAWN BY A LATER PAGE, AND NOTHING HERE YET: a Choose one's packs, a
 * table, the written answer, the cases and fill-in boxes. A task that covers
 * one of them is counted and is never done until that page can see it done
 * (`progress.ts`). No link to Start here or the Glossary until those pages
 * exist.
 *
 * "DONE" IS WORKED OUT IN ONE PLACE, `src/lib/courses/weekBlocks/progress.ts`,
 * from the reader's own live ticks and their own reflection boxes as they
 * save. When each task is due comes from the overview payload, worked out on
 * the server from the reader's group's own calendar (`due.ts`).
 *
 * WHO TAKES PART on the page: somebody placed in a group, and (Zach, Mon 26
 * Oct) a facilitator of a group of the run, as themselves: each ticks the
 * sources, writes in the boxes and has their own count. A facilitator's own
 * reflections, ticks and private notes are read by the programme's lead and
 * admins, never by their co-facilitators or the group, and the lines under
 * their boxes say so. Admins and the run's other staff read the week with no
 * ticks, boxes or count.
 *
 * A PLACE KEPT for two later pieces: `leadCards` draws above This week, where
 * week 1's line for somebody holding a place before groups go out (Q35) and
 * the before survey's card (Q50) go.
 */

type Props = {
  runId: string;
  weekNumber: number;
  uid: string;
  week: CourseWeekDoc & { blocks: WeekBlock[] };
  /** The reader's group's own copy of the week. */
  forked: boolean;
  payload: OverviewPayload;
  ticks: MaterialTicks;
  /** Ticks or unticks one item; the caller puts a refused tick back and says so. */
  onTick: (kind: ProgressItemKind, itemId: string, next: boolean) => void;
  /** The reader's own stored rows for this week (their reflections among them), by item id. */
  ownRows: {
    byId: ReadonlyMap<string, ExerciseResponseWire>;
    loaded: boolean;
    loading: boolean;
    reload: () => void;
    apply: (row: ExerciseResponseWire) => void;
  };
  sharedNotes: WeekSharedNotes;
  /** The programme's lead's first name, for who reads a reflection; null when no programme names the run. */
  leadFirstName: string | null;
  /** Cards drawn above This week by later pieces (Q35's line, Q50's survey). */
  leadCards?: ReactNode;
};

const FORKED_HINT =
  "Your facilitator has made this week their own: you’re reading your group’s version, which may differ from the other groups on this run.";

export default function BlockWeek({
  runId,
  weekNumber,
  uid,
  week,
  forked,
  payload,
  ticks,
  onTick,
  ownRows,
  sharedNotes,
  leadFirstName,
  leadCards = null,
}: Props) {
  const runHomeHref = `/learn/${encodeURIComponent(runId)}`;
  const todayKey = londonDateKey(new Date());
  const blocks = week.blocks;

  // Who is reading. Somebody placed in a group takes part: an active
  // enrolment writes, a finished one reads what it wrote. A facilitator of a
  // group of the run takes part as themselves. Anybody else reads.
  const learner = payload.enrolment?.role === "learner" ? payload.enrolment : null;
  const placementGroupId = learner?.groupId ?? null;
  const asFacilitator =
    learner === null && payload.access.isFacilitator && payload.groups.some((group) => group.id !== placementGroupId);
  const participant = learner !== null || asFacilitator;
  const canWrite = learner ? learner.status === "active" : asFacilitator;

  const state: DoneState = {
    isTicked: ticks.isDone,
    isWritten: (promptId) => Boolean(ownRows.byId.get(promptId)?.text?.trim()),
  };

  // The week's seven days and its session, in the reader's own calendar.
  const schedule = payload.weekSchedule.find((entry) => entry.weekNumber === weekNumber) ?? null;
  const slotStartKey = schedule?.slotStartKey ?? "";
  const range = slotStartKey && isValidDateKey(slotStartKey) ? dayRangeWords(slotStartKey, addDaysToKey(slotStartKey, 6)) : "";
  const first = payload.weekSchedule[0]?.weekNumber === weekNumber;
  const cancelled = schedule?.cancelled === true ? (payload.group?.cancelledSessions.find((entry) => entry.weekNumber === weekNumber) ?? null) : null;
  const online = payload.group?.sessionModes[week.id] === "virtual";

  // The way to the weeks either side, on the reader's own calendar.
  const taught = payload.weekSchedule;
  const at = taught.findIndex((entry) => entry.weekNumber === weekNumber);
  const prev = at > 0 ? taught[at - 1] : null;
  const next = at >= 0 && at < taught.length - 1 ? taught[at + 1] : null;

  // Names from records, for who reads what (Q30, Q31, Q37).
  const facilitatorNames = (payload.group?.facilitatorNames ?? []).map((name) => firstName(name) || name);

  // This week, and its count.
  const thisWeekBlock = blocks.find((block): block is ThisWeekBlock => block.type === "thisWeek") ?? null;
  const overviewWeek = payload.weeks.find((entry) => entry.weekNumber === weekNumber) ?? null;
  const taskNeedsList = (thisWeekBlock?.rows ?? [])
    .filter((row): row is Extract<ThisWeekRow, { type: "task" }> => row.type === "task")
    .map((row) => taskNeeds(blocks, row));
  const counts = tasksDone(taskNeedsList, state);

  // The page's first stop and first sources carry who reads and who sees.
  const everything = allBlocks(blocks);
  const firstStopId = everything.find((block) => block.type === "reflection")?.id ?? null;
  const firstSourceId = everything.find((block) => block.type === "source")?.id ?? null;
  const hasBoxes = firstStopId !== null;
  const partNumber = new Map(partsOf(blocks).map((part, index) => [part.id, index + 1]));

  const header = (
    <header className={styles.head}>
      <p className={styles.eyebrow}>
        {blockWeekEyebrow({
          kind: payload.programme?.kind ?? null,
          name: payload.programme?.name || payload.run.courseTitle,
          weekNumber,
          totalWeeks: payload.run.totalWeeks,
          range,
        })}
      </p>
      <h1 className={styles.title}>{week.title || `Week ${weekNumber}`}</h1>
      {(forked || !week.published) && (
        <p className={styles.chips}>
          {forked && (
            <Chip tone="neutral" size="sm" title={FORKED_HINT}>
              Customised by your facilitator
            </Chip>
          )}
          {!week.published && (
            // Only staff ever reach an unpublished week (useWeek withholds it).
            <Chip tone="warning" size="sm">
              Unpublished
            </Chip>
          )}
        </p>
      )}
      <WeekWays runId={runId} prev={prev?.weekNumber ?? null} next={next} landmark={false} />
    </header>
  );

  const rail: RailEntry[] = [];

  const body: ReactNode[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "thisWeek":
        rail.push({ id: anchor(block.id), label: THIS_WEEK, count: participant && counts.of > 0 ? ofWords(counts.done, counts.of) : null, mark: null, indent: false });
        body.push(
          <ThisWeekBox
            key={block.id}
            block={block}
            rows={overviewWeek?.thisWeek?.rows ?? []}
            dayBeforeTime={overviewWeek?.thisWeek?.dayBeforeTime ?? null}
            blocks={blocks}
            learner={participant}
            state={state}
            counts={counts}
            first={first}
            todayKey={todayKey}
          />,
        );
        break;
      case "text":
        if (block.heading && block.role !== "plain") rail.push({ id: anchor(block.id), label: block.heading, count: null, mark: null, indent: false });
        body.push(
          <TextSection
            key={block.id}
            block={block}
            extra={
              block.role === "before" ? (
                <>
                  {cancelled && (
                    <p className={styles.sessionNote}>
                      <span className={weekly.plainChip}>{CANCELLED_CARD}</span>
                      {cancelled.reason && <span>{cancelled.reason}</span>}
                    </p>
                  )}
                  {!cancelled && online && <p className={styles.sessionNote}>{ONLINE_NOTICE_LINK_LINE}</p>}
                  {hasBoxes && participant && canWrite && <p className={styles.quietLine}>{BOXES_SAVE_LINE}</p>}
                </>
              ) : null
            }
          />,
        );
        break;
      case "outcomes":
        body.push(<Outcomes key={block.id} block={block} />);
        break;
      case "contentNote":
        body.push(<ContentNote key={block.id} block={block} />);
        break;
      case "part": {
        const needs = partNeeds(block);
        const done = participant && isCounted(needs) && taskDone(needs, state);
        rail.push({
          id: anchor(block.id),
          label: block.title,
          count: null,
          mark: participant && isCounted(needs) ? (done ? "done" : "open") : null,
          indent: true,
        });
        body.push(
          <PartView
            key={block.id}
            part={block}
            number={partNumber.get(block.id) ?? 1}
            done={done}
            renderChild={(child, rest) =>
              renderPartChild(child, rest, {
                runId,
                uid,
                weekNumber,
                weekId: week.id,
                learner: participant,
                canWrite,
                ticks,
                onTick,
                ownRows,
                firstStopId,
                firstSourceId,
                readers: asFacilitator
                  ? { access: facilitatorReflectionsReadByWords(leadFirstName), readOut: null }
                  : {
                      access: reflectionsReadByWords(facilitatorNames, leadFirstName),
                      readOut: readOutWords(facilitatorNames),
                    },
                ticksLine: asFacilitator
                  ? facilitatorTicksSeenByWords(leadFirstName)
                  : ticksSeenByWords(facilitatorNames, leadFirstName),
                privateNoteHint: asFacilitator ? PRIVATE_NOTE_HINT_FACILITATOR : PRIVATE_NOTE_HINT,
              })
            }
          />,
        );
        break;
      }
      case "inTheSession":
        rail.push({ id: anchor(block.id), label: "In the session", count: null, mark: null, indent: false });
        body.push(<InTheSession key={block.id} block={block} />);
        break;
      case "goFurther":
        rail.push({ id: anchor(block.id), label: GO_FURTHER_SHORT, count: null, mark: null, indent: false });
        body.push(<GoFurther key={block.id} block={block} />);
        break;
      case "handsOn":
        rail.push({ id: anchor(block.id), label: HANDS_ON_SHORT, count: null, mark: null, indent: false });
        body.push(<HandsOn key={block.id} block={block} />);
        break;
      // The case study is a later page's: nothing yet, not even its heading.
      case "cases":
        break;
    }
  }

  const sections = sharedNotes?.sections ?? [];
  if (sections.length > 0) rail.push({ id: "shared-notes", label: SHARED_NOTES_SHORT, count: null, mark: null, indent: false });

  return (
    <div className={styles.page}>
      <div className={`${weekly.bar} ${styles.phoneBar}`}>
        <div className={weekly.barStart}>
          <Link href={runHomeHref} className={weekly.back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span>{payload.programme?.name || payload.run.courseTitle || "Your programme"}</span>
          </Link>
        </div>
        <div className={weekly.barTitle}>Week {weekNumber}</div>
        <div className={weekly.barEnd} />
      </div>

      <div className={styles.layout}>
        <PageEnter direction="up" className={styles.main}>
          {header}
          <PacingBanner
            runId={runId}
            viewedWeek={weekNumber}
            currentWeek={payload.currentWeek}
            pacedByGroup={payload.calendarSource === "group"}
          />
          {leadCards}
          {body}
          {sections.length > 0 && (
            <div id="shared-notes" className={styles.sharedNotes}>
              {sections.map((section) => (
                <GroupSharedNotes key={section.groupId} section={section} weekNumber={weekNumber} />
              ))}
            </div>
          )}
          <WeekWays runId={runId} prev={prev?.weekNumber ?? null} next={next} landmark />
          {learner && (
            // The progress page is the learner's own, as on every week page.
            <div>
              <Link href={`${runHomeHref}/progress`} className={weekly.footLink}>
                See your progress week by week
              </Link>
            </div>
          )}
        </PageEnter>

        {rail.length > 0 && <OnThisPage entries={rail} />}
      </div>
    </div>
  );
}

function anchor(id: string): string {
  return `block-${id}`;
}

// ---------------------------------------------------------------------------
// The way to the weeks either side
// ---------------------------------------------------------------------------

function WeekWays({
  runId,
  prev,
  next,
  landmark,
}: {
  runId: string;
  prev: number | null;
  next: OverviewPayload["weekSchedule"][number] | null;
  /** The foot's is the page's "Weeks" landmark; the head's is the same two ways again. */
  landmark: boolean;
}) {
  const shutLine = next && !next.open && next.opensAfter ? weekOpensAfterWords(next.weekNumber) : null;
  if (prev === null && !next?.open && !shutLine) return null;
  const inner = (
    <>
      {prev !== null ? (
        <Link href={weekHref(runId, prev)} className={weekly.weekNavLink} onClick={() => setWeekNavDirection("right")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          <span>Week {prev}</span>
        </Link>
      ) : (
        <span />
      )}
      {next?.open ? (
        <Link href={weekHref(runId, next.weekNumber)} className={weekly.weekNavLink} onClick={() => setWeekNavDirection("left")}>
          <span>Week {next.weekNumber}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      ) : shutLine ? (
        <p className={weekly.weekNavNote}>{shutLine}</p>
      ) : (
        <span />
      )}
    </>
  );
  return landmark ? (
    <nav className={styles.waysFoot} aria-label="Weeks">
      {inner}
    </nav>
  ) : (
    <div className={styles.waysHead}>{inner}</div>
  );
}

// ---------------------------------------------------------------------------
// This week
// ---------------------------------------------------------------------------

function DoneMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true" className={styles.markDone}>
      <circle cx="13" cy="13" r="12" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 13.5l3.2 3.2L18 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OpenMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true" className={styles.markOpen}>
      <circle cx="13" cy="13" r="12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function NoneMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true" className={styles.markNone}>
      <path d="M9 13h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ThisWeekBox({
  block,
  rows,
  dayBeforeTime,
  blocks,
  learner,
  state,
  counts,
  first,
  todayKey,
}: {
  block: ThisWeekBlock;
  /** The overview's rows for this week, for when each task is due. */
  rows: OverviewThisWeekRow[];
  /** The course's time for work due the day before a session, or null for by the end of that day. */
  dayBeforeTime: string | null;
  blocks: WeekBlock[];
  learner: boolean;
  state: DoneState;
  counts: { done: number; of: number };
  first: boolean;
  todayKey: string;
}) {
  const id = anchor(block.id);
  return (
    <section id={id} className={styles.thisWeek} aria-labelledby={`${id}-title`}>
      <div className={styles.twHead}>
        <h2 id={`${id}-title`} className={styles.h2}>
          {THIS_WEEK}
        </h2>
        {learner && counts.of > 0 && <p className={styles.twCount}>{doneWords(counts.done, counts.of)}</p>}
      </div>
      <ul className={styles.tasks} role="list">
        {block.rows.map((row, index) => {
          // A row with nothing to do this week, and a row that is only offered
          // (the hands-on route): neither is counted, and both carry the drawn
          // line rather than a mark that says done or not done.
          if (row.type === "none" || row.type === "optional") {
            return (
              <li key={index} className={styles.task}>
                <NoneMark />
                <div className={styles.taskBody}>
                  <p className={styles.taskWhat}>
                    <span className={styles.srOnly}>{row.type === "none" ? TASK_MARK_WORDS.none : TASK_MARK_WORDS.optional}: </span>
                    {row.what}
                  </p>
                  <p className={styles.taskMeta}>
                    {row.time && <span className={styles.mono}>{row.time}</span>}
                  </p>
                  {row.note && <p className={styles.taskWhen}>{row.note}</p>}
                </div>
              </li>
            );
          }
          const needs = taskNeeds(blocks, row);
          // A task with nothing anybody could finish is left out of the count,
          // so it carries no mark that says done or not done.
          const counted = isCounted(needs);
          const done = learner && counted && taskDone(needs, state);
          const fromOverview = rows[index];
          const due = fromOverview && fromOverview.type === "task" && fromOverview.what === row.what ? fromOverview.due : null;
          return (
            <li key={index} className={styles.task}>
              {!counted ? <NoneMark /> : learner && done ? <DoneMark /> : <OpenMark />}
              <div className={styles.taskBody}>
                <p className={styles.taskWhat}>
                  {learner && counted && <span className={styles.srOnly}>{done ? TASK_MARK_WORDS.done : TASK_MARK_WORDS.notDone}: </span>}
                  {row.what}
                </p>
                <p className={styles.taskMeta}>
                  {row.time && <span className={styles.mono}>{row.time}</span>}
                  <span className={styles.taskWhen}>
                    {taskWhenWords(row.when, due, { first, todayKey, dayBeforeTime, whenText: row.whenText })}
                  </span>
                </p>
                {done && <p className={styles.taskDone}>{TASK_DONE}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      {block.total && (
        <p className={styles.inAll}>{inAllWords(block.total)}</p>
      )}
      <Prose prose={block.note} className={styles.twNote} linkClassName={styles.inlineLink} tableClassName={styles.table} codeClassName={styles.code} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Text, outcomes, the content note
// ---------------------------------------------------------------------------

function TextSection({ block, extra }: { block: TextBlock; extra: ReactNode }) {
  const id = anchor(block.id);
  if (block.role === "plain") {
    return (
      <div id={id} className={styles.section}>
        <Prose prose={block.body} className={styles.body} listClassName={styles.list} linkClassName={styles.inlineLink} tableClassName={styles.table} codeClassName={styles.code} />
      </div>
    );
  }
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <div className={styles.sectionHead}>
        <h2 id={`${id}-title`} className={styles.h2}>
          {block.heading}
        </h2>
        {block.time && <span className={styles.mono}>{block.time}</span>}
      </div>
      <Prose
        prose={block.body}
        className={block.role === "why" ? styles.lede : styles.body}
        listClassName={styles.list}
        linkClassName={styles.inlineLink}
        tableClassName={styles.table}
        codeClassName={styles.code}
      />
      {extra}
    </section>
  );
}

function Outcomes({ block }: { block: OutcomesBlock }) {
  return (
    <div id={anchor(block.id)} className={styles.outcomes}>
      <h3 className={styles.h3}>{block.heading || "After this week you can"}</h3>
      <ul className={styles.dots} role="list">
        {block.items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ContentNote({ block }: { block: ContentNoteBlock }) {
  const id = anchor(block.id);
  return (
    <section id={id} className={styles.contentNote} aria-labelledby={`${id}-title`}>
      <div className={styles.contentNoteHead}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.infoIcon}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        <h3 id={`${id}-title`} className={styles.h3}>
          Content note
        </h3>
      </div>
      <Prose prose={block.body} className={styles.body} linkClassName={styles.inlineLink} tableClassName={styles.table} codeClassName={styles.code} />
      {block.links.length > 0 && (
        <ul className={styles.supportLinks} role="list">
          {block.links.map((link, index) => (
            <li key={index} className={styles.supportLink}>
              <a href={link.url} className={styles.supportLabel} {...(link.url.startsWith("mailto:") ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
                {link.label}
              </a>
              {link.detail && <span className={styles.supportDetail}>{link.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// A part
// ---------------------------------------------------------------------------

function PartView({
  part,
  number,
  done,
  renderChild,
}: {
  part: PartBlock;
  number: number;
  done: boolean;
  renderChild: (child: PartChild, rest: PartChild[]) => { node: ReactNode; used: number };
}) {
  const id = anchor(part.id);
  const children: ReactNode[] = [];
  for (let index = 0; index < part.blocks.length; ) {
    const { node, used } = renderChild(part.blocks[index], part.blocks.slice(index));
    if (node) children.push(<Fragment key={part.blocks[index].id}>{node}</Fragment>);
    index += Math.max(1, used);
  }
  return (
    <section id={id} className={styles.part} aria-labelledby={`${id}-title`}>
      <div className={styles.partHead}>
        <p className={styles.partEyebrow}>
          <span className={styles.partNumber}>{partWords(number)}</span>
          {part.time && (
            <>
              <span className={styles.partSep} aria-hidden="true">
                ·
              </span>
              <span className={styles.mono}>{part.time}</span>
            </>
          )}
        </p>
        {done && (
          <span className={styles.doneChip}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            {TASK_DONE}
          </span>
        )}
      </div>
      <h3 id={`${id}-title`} className={styles.partTitle}>
        {part.title}
      </h3>
      <Prose prose={part.framing} className={styles.body} listClassName={styles.list} linkClassName={styles.inlineLink} tableClassName={styles.table} codeClassName={styles.code} />
      {children}
    </section>
  );
}

type ChildContext = {
  runId: string;
  uid: string;
  weekNumber: number;
  weekId: string;
  learner: boolean;
  canWrite: boolean;
  ticks: MaterialTicks;
  onTick: (kind: ProgressItemKind, itemId: string, next: boolean) => void;
  ownRows: Props["ownRows"];
  firstStopId: string | null;
  firstSourceId: string | null;
  readers: { access: string; readOut: string | null };
  ticksLine: string;
  privateNoteHint: string;
};

/**
 * One block of a part, drawn; sources that follow one another share one card,
 * so `used` says how many blocks the drawing took.
 */
function renderPartChild(child: PartChild, rest: PartChild[], ctx: ChildContext): { node: ReactNode; used: number } {
  switch (child.type) {
    case "source": {
      const run: SourceBlock[] = [];
      for (const next of rest) {
        if (next.type !== "source") break;
        run.push(next);
      }
      return {
        used: run.length,
        node: (
          <SourceCard
            sources={run}
            runId={ctx.runId}
            uid={ctx.uid}
            weekNumber={ctx.weekNumber}
            showTicks={ctx.learner}
            canWrite={ctx.canWrite && ctx.ticks.canTick}
            isDone={ctx.ticks.isDone}
            rows={ctx.ticks.byItemId}
            onTick={ctx.onTick}
            ticksLine={ctx.learner && run.some((source) => source.id === ctx.firstSourceId) ? ctx.ticksLine : null}
            privateNoteHint={ctx.privateNoteHint}
          />
        ),
      };
    }
    case "reflection":
      return {
        used: 1,
        node: (
          <ReflectStop
            block={child}
            runId={ctx.runId}
            weekId={ctx.weekId}
            rows={ctx.ownRows.byId}
            loaded={ctx.ownRows.loaded}
            loading={ctx.ownRows.loading}
            onRetry={ctx.ownRows.reload}
            ownBoxes={ctx.learner}
            canWrite={ctx.canWrite}
            readers={child.id === ctx.firstStopId ? ctx.readers : null}
            onSaved={ctx.ownRows.apply}
          />
        ),
      };
    case "text":
      return {
        used: 1,
        node: (
          <div className={styles.partText}>
            {child.heading && <h4 className={styles.h4}>{child.heading}</h4>}
            <Prose prose={child.body} className={styles.body} listClassName={styles.list} linkClassName={styles.inlineLink} tableClassName={styles.table} codeClassName={styles.code} />
          </div>
        ),
      };
    case "checklist":
      return { used: 1, node: <Checklist block={child} ctx={ctx} /> };
    // Drawn by a later page: a Choose one's packs, a table, the written
    // answer, a talk or the cases, fill-in boxes.
    default:
      return { used: 1, node: null };
  }
}

function Checklist({ block, ctx }: { block: ChecklistBlock; ctx: ChildContext }) {
  return (
    <div className={styles.sources}>
      <TickRows
        items={block.items.map((item) => ({
          id: item.id,
          kind: "checklist",
          title: item.title,
          chip: null,
          minutes: null,
          source: null,
          href: null,
          body: item.detail?.trim() || null,
          optional: false,
        }))}
        isDone={ctx.ticks.isDone}
        canTick={ctx.canWrite && ctx.ticks.canTick}
        showTicks={ctx.learner}
        onTick={ctx.onTick}
        open="icon"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Go further: optional, never counted
// ---------------------------------------------------------------------------

function GoFurther({ block }: { block: GoFurtherBlock }) {
  const id = anchor(block.id);
  return (
    <section id={id} className={styles.goFurther} aria-labelledby={`${id}-title`}>
      <details className={styles.goDetails}>
        <summary className={styles.goSummary}>
          <h2 id={`${id}-title`} className={styles.goTitle}>
            {block.heading || "Go further (optional)"}
          </h2>
          <span className={styles.goCount}>{itemsWords(block.items.length)}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.goChevron}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </summary>
        <div className={styles.goBody}>
          <Prose prose={block.intro} className={styles.body} linkClassName={styles.inlineLink} tableClassName={styles.table} codeClassName={styles.code} />
          <p className={styles.quietLine}>{NOT_COUNTED}</p>
          <ul className={styles.goList} role="list">
            {block.items.map((item, index) => {
              const href = item.title ? safeSourceUrl(item.url) : null;
              const byLine = [item.by, item.date].map((part) => part.trim()).filter(Boolean).join(" · ");
              return (
                <li key={index} className={styles.goItem}>
                  {/* An item with no single link of its own has no title: its line carries the links. */}
                  {item.title && <SourceTitle lead={item.lead} title={item.title} href={href} />}
                  <p className={styles.sourceMeta}>
                    <span className={styles.kindPill}>{SOURCE_KIND_LABEL[item.kind]}</span>
                    {item.time && <span className={styles.mono}>{item.time}</span>}
                    {byLine && <span className={styles.sourceByInline}>{byLine}</span>}
                  </p>
                  {item.why.length > 0 && (
                    <p className={styles.goWhy}>
                      <Runs runs={item.why} linkClassName={styles.inlineLink} />
                    </p>
                  )}
                  {item.compute.trim() && <p className={styles.goWhy}>{item.compute.trim()}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------------------
// In the session, and the hands-on route
// ---------------------------------------------------------------------------

/**
 * What happens in the session, then what to do before you come, as the guide
 * writes it ("Before you come (about 5 minutes). ..."). A This week task that
 * says "Get ready" covers this block; nothing on it is ticked or written, so
 * `progress.ts` counts such a task for nothing.
 */
function InTheSession({ block }: { block: InTheSessionBlock }) {
  const id = anchor(block.id);
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <div className={styles.sectionHead}>
        <h2 id={`${id}-title`} className={styles.h2}>
          In the session
        </h2>
      </div>
      <Prose prose={block.body} className={styles.body} listClassName={styles.list} linkClassName={styles.inlineLink} tableClassName={styles.table} codeClassName={styles.code} />
      {block.beforeYouCome.length > 0 && (
        <Prose
          prose={block.beforeYouCome}
          className={`${styles.body} ${styles.beforeYouCome}`}
          listClassName={styles.list}
          linkClassName={styles.inlineLink}
          tableClassName={styles.table}
          codeClassName={styles.code}
        />
      )}
    </section>
  );
}

/**
 * The hands-on route (optional, for people who code): outside This week's
 * total and never counted, closed until opened, as Go further is. Its
 * notebooks, exercises and code are the guide's own words, code shown exactly
 * as written.
 */
function HandsOn({ block }: { block: HandsOnBlock }) {
  const id = anchor(block.id);
  return (
    <section id={id} className={styles.goFurther} aria-labelledby={`${id}-title`}>
      <details className={styles.goDetails}>
        <summary className={styles.goSummary}>
          <h2 id={`${id}-title`} className={styles.goTitle}>
            {block.heading || HANDS_ON_SHORT}
          </h2>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.goChevron}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </summary>
        <div className={styles.goBody}>
          <p className={styles.quietLine}>{NOT_COUNTED}</p>
          <Prose
            prose={block.body}
            className={`${styles.body} ${styles.handsOnBody}`}
            listClassName={styles.list}
            linkClassName={styles.inlineLink}
            tableClassName={styles.table}
            codeClassName={styles.code}
          />
        </div>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------------------
// On this page (board wk-week, at 1440)
// ---------------------------------------------------------------------------

type RailEntry = {
  id: string;
  label: string;
  /** "1 of 3", beside This week. */
  count: string | null;
  /** A part's mark, for somebody taking part. */
  mark: "done" | "open" | null;
  indent: boolean;
};

function OnThisPage({ entries }: { entries: RailEntry[] }) {
  return (
    <nav className={styles.rail} aria-label={ON_THIS_PAGE}>
      <p className={styles.railTitle}>{ON_THIS_PAGE}</p>
      <ul className={styles.railList} role="list">
        {entries.map((entry) => (
          <li key={entry.id} className={entry.indent ? styles.railItemIndent : styles.railItem}>
            <a href={`#${entry.id}`} className={styles.railLink}>
              {entry.mark && (
                <span className={entry.mark === "done" ? styles.railMarkDone : styles.railMarkOpen} aria-hidden="true">
                  {entry.mark === "done" && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </span>
              )}
              <span className={styles.railLabel}>
                {entry.label}
                {entry.mark && <span className={styles.srOnly}>, {entry.mark === "done" ? TASK_MARK_WORDS.done : TASK_MARK_WORDS.notDone}</span>}
              </span>
              {entry.count && <span className={styles.railCount}>{entry.count}</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
