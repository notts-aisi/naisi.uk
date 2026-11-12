"use client";

import { Fragment } from "react";
import type { ExerciseResponseWire } from "@/app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route";
import Prose, { Runs } from "@/features/courses/weekBlocks/Prose";
import ReflectStop from "@/features/courses/weekBlocks/ReflectStop";
import SourceCard, { SourceTitle } from "@/features/courses/weekBlocks/SourceCard";
import WrittenAnswerCard from "@/features/courses/weekBlocks/WrittenAnswerCard";
import blockStyles from "@/features/courses/weekBlocks/blockWeek.module.css";
import { GO_FURTHER_SHORT, HANDS_ON_SHORT, NOT_COUNTED, THIS_WEEK, inAllWords } from "@/lib/courses/memberPageWords";
import { SOURCE_KIND_LABEL, type WeekBlock } from "@/lib/courses/weekBlocks/model";
import { safeSourceUrl } from "@/lib/courses/weekBlocks/prose";
import { rangeWords } from "@/lib/courses/weekEdit/pageModel";
import { DUE_CHOICE } from "@/lib/courses/weekEdit/pageWords";
import type { WeekDue } from "@/lib/courses/weekWork/model";
import type { CourseProgressDoc } from "@/lib/firestore/courseProgress";
import styles from "./editWeek.module.css";

/**
 * ONE BLOCK OF A WEEK, AS IT READS, on the programme's Weeks page: drawn read
 * only, for the lead and admins, with nobody's ticks or words.
 *
 * The kinds a person ticks or answers are drawn by the member's own week
 * renderers (`SourceCard`, `ReflectStop`, `WrittenAnswerCard`, `Prose`),
 * each handed nothing ticked and no box: a reader with no place on the week
 * is shown the prompts and the question with no box to write in, exactly as
 * an admin reading the member's page is. The rest are drawn with the member
 * page's own styles and words, without the reader's progress, due days or
 * picks: those are worked out per group and per person.
 *
 * A part draws its own heading and framing; each block inside it is a block
 * of its own on the page, so each can be changed where it stands.
 */

const NO_TICK_ROWS: ReadonlyMap<string, CourseProgressDoc> = new Map();
const NO_ROWS: ReadonlyMap<string, ExerciseResponseWire> = new Map();
const nothing = () => {};
const notDone = () => false;
// The reader has no place on the week, so no session to be due at. The
// renderers read these only beside a box of the person's own, which is never
// drawn here.
const NO_DUE: WeekDue = { at: null, by: "no-group" };
const NO_MOMENT = new Date(0);

const proseClasses = {
  className: blockStyles.body,
  listClassName: blockStyles.list,
  linkClassName: blockStyles.inlineLink,
  tableClassName: blockStyles.table,
  codeClassName: blockStyles.code,
};

export default function WeekBlockView({
  block,
  runId,
  weekId,
  weekNumber,
}: {
  block: WeekBlock;
  runId: string;
  weekId: string;
  weekNumber: number;
}) {
  switch (block.type) {
    case "source":
      return (
        <SourceCard
          sources={[block]}
          runId={runId}
          uid=""
          weekNumber={weekNumber}
          showTicks={false}
          canWrite={false}
          canNote={false}
          isDone={notDone}
          rows={NO_TICK_ROWS}
          onTick={nothing}
          ticksLine={null}
          privateNoteHint=""
          canRate={false}
        />
      );
    case "reflection":
      return (
        <ReflectStop
          block={block}
          runId={runId}
          weekId={weekId}
          rows={NO_ROWS}
          loaded
          loading={false}
          onRetry={nothing}
          ownBoxes={false}
          canWrite={false}
          readers={null}
          due={NO_DUE}
          now={NO_MOMENT}
          onSaved={nothing}
        />
      );
    case "writtenAnswer":
      return (
        <>
          <WrittenAnswerCard
            block={block}
            runId={runId}
            weekId={weekId}
            weekNumber={weekNumber}
            row={null}
            loaded
            loading={false}
            onRetry={nothing}
            ownBox={false}
            canWrite={false}
            readers={{ kind: "facilitators", names: [] }}
            leadName={null}
            feedback={null}
            dueDay={null}
            dayBeforeTime={null}
            first={false}
            todayKey=""
            due={NO_DUE}
            rest={null}
            onSaved={nothing}
          />
          <p className={styles.blockMeta}>
            {[block.boxes.length > 0 ? block.boxes.map((box) => box.label).join(" · ") : rangeWords(block.words), DUE_CHOICE[block.due]]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </>
      );
    case "text":
      return (
        <div className={blockStyles.partText}>
          {block.heading && (
            <p className={styles.blockHeading}>
              {block.heading}
              {block.time && <span className={blockStyles.mono}> {block.time}</span>}
            </p>
          )}
          <Prose prose={block.body} {...proseClasses} className={block.role === "why" ? blockStyles.lede : blockStyles.body} />
        </div>
      );
    case "part":
      return (
        <div>
          <p className={styles.blockHeading}>{block.title}</p>
          {block.time && <p className={blockStyles.mono}>{block.time}</p>}
          <Prose prose={block.framing} {...proseClasses} />
        </div>
      );
    case "thisWeek":
      return (
        <div>
          <p className={styles.blockHeading}>{THIS_WEEK}</p>
          <ul className={styles.tasks} role="list">
            {block.rows.map((row, index) => (
              <li key={index} className={styles.task}>
                <span className={styles.taskWhat}>{row.what}</span>
                <span className={styles.taskTime}>{row.time}</span>
                <span className={styles.taskWhen}>{row.type === "task" ? DUE_CHOICE[row.when] : row.note}</span>
              </li>
            ))}
          </ul>
          {block.total && <p className={blockStyles.inAll}>{inAllWords(block.total)}</p>}
          <Prose prose={block.note} {...proseClasses} />
        </div>
      );
    case "outcomes":
      return (
        <div>
          <p className={styles.blockHeading}>{block.heading || "After this week you can"}</p>
          <ul className={blockStyles.dots} role="list">
            {block.items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      );
    case "contentNote":
      return (
        <div>
          <Prose prose={block.body} {...proseClasses} />
          {block.links.length > 0 && (
            <ul className={blockStyles.supportLinks} role="list">
              {block.links.map((link, index) => (
                <li key={index} className={blockStyles.supportLink}>
                  <span className={blockStyles.supportLabel}>{link.label}</span>
                  {link.detail && <span className={blockStyles.supportDetail}>{link.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    case "inTheSession":
      return (
        <div>
          <Prose prose={block.body} {...proseClasses} />
          {block.beforeYouCome.length > 0 && <Prose prose={block.beforeYouCome} {...proseClasses} />}
        </div>
      );
    case "goFurther":
      return (
        <div>
          <p className={styles.blockHeading}>{block.heading || GO_FURTHER_SHORT}</p>
          <Prose prose={block.intro} {...proseClasses} />
          <p className={blockStyles.quietLine}>{NOT_COUNTED}</p>
          <ul className={blockStyles.goList} role="list">
            {block.items.map((item, index) => (
              <li key={index} className={blockStyles.goItem}>
                {item.title && <SourceTitle lead={item.lead} title={item.title} href={safeSourceUrl(item.url)} />}
                <p className={blockStyles.sourceMeta}>
                  <span className={blockStyles.kindPill}>{SOURCE_KIND_LABEL[item.kind]}</span>
                  {item.time && <span className={blockStyles.mono}>{item.time}</span>}
                </p>
                {item.why.length > 0 && (
                  <p className={blockStyles.goWhy}>
                    <Runs runs={item.why} linkClassName={blockStyles.inlineLink} />
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      );
    case "handsOn":
      return (
        <div>
          <p className={styles.blockHeading}>{block.heading || HANDS_ON_SHORT}</p>
          <p className={blockStyles.quietLine}>{NOT_COUNTED}</p>
          <Prose prose={block.body} {...proseClasses} className={`${blockStyles.body} ${blockStyles.handsOnBody}`} />
        </div>
      );
    case "chooseOne":
      return (
        <div>
          <p className={styles.blockHeading}>{block.title}</p>
          <ul className={styles.tasks} role="list">
            {block.packs.map((pack) => (
              <li key={pack.id} className={styles.task}>
                <span className={styles.taskWhat}>{pack.name}</span>
                <span className={styles.taskWhen}>
                  <Runs runs={pack.read} linkClassName={blockStyles.inlineLink} />
                </span>
                <span className={styles.taskTime}>{pack.time}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "cases":
      return (
        <div>
          {block.heading && <p className={styles.blockHeading}>{block.heading}</p>}
          <Prose prose={block.intro} {...proseClasses} />
          <p className={blockStyles.quietLine}>
            {block.groups.map((group) => `${group.name}: ${group.cases.length}`).join(" · ")}
          </p>
        </div>
      );
    case "fillIn":
      return (
        <div>
          <p className={styles.blockHeading}>{block.title}</p>
          {block.groups.map((group, index) => (
            <Fragment key={index}>
              {group.heading && <p className={styles.blockSubheading}>{group.heading}</p>}
              <ul className={blockStyles.dots} role="list">
                {group.boxes.map((box) => (
                  <li key={box.id}>{box.label}</li>
                ))}
              </ul>
            </Fragment>
          ))}
        </div>
      );
    case "checklist":
      return (
        <ul className={blockStyles.dots} role="list">
          {block.items.map((item) => (
            <li key={item.id}>{item.title}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className={styles.tableScroll}>
          <table className={blockStyles.table}>
            <thead>
              <tr>
                {block.header.map((cell, index) => (
                  <th key={index}>
                    <Runs runs={cell.runs} linkClassName={blockStyles.inlineLink} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, index) => (
                <tr key={index}>
                  {row.cells.map((cell, at) => (
                    <td key={at}>
                      <Runs runs={cell.runs} linkClassName={blockStyles.inlineLink} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}
