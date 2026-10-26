"use client";

import { useId } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { casesIn, findCase } from "@/lib/courses/packsAndCases/model";
import {
  NOT_GIVEN_YET,
  START_HERE,
  YOUR_CASE,
  allCasesWords,
  casesWords,
  givenCaseLineWords,
  readyWords,
  yourPackWords,
} from "@/lib/courses/packsAndCases/words";
import type { CaseGroup, CasesBlock } from "@/lib/courses/weekBlocks/model";
import type { Prose as ProseValue } from "@/lib/courses/weekBlocks/prose";
import Prose, { Runs } from "../weekBlocks/Prose";
import blockWeek from "../weekBlocks/blockWeek.module.css";
import weekly from "../weekly/weekly.module.css";
import type { Picks } from "./usePicks";
import styles from "./packsAndCases.module.css";

/**
 * A TALK ON THE WEEK PAGE (plan item 8; Q32 A; boards wk-week,
 * wk-week-phone and wk-week6-phone).
 *
 *  - THE CASE STUDY (a talk with cases, given out at the end of the session
 *    before): "Your case study" with the guide's words, then "Your case": its
 *    pathway, its name, what happened, its start-here links, "Given out at
 *    the end of session 2. To swap, ask Rahul or Sofia.", "Ready for my
 *    talk" and how to prepare. Before it is given, "Not given yet" where the
 *    case would be. Then every case of the week, the person's pathway's
 *    group open and their own case marked, and a case's content note beside
 *    it.
 *  - A TALK WITH NO CASES (a pitch, inside its part): how to prepare, and
 *    "Ready for my pitch".
 *
 * "Ready for my talk" is the person's own mark: it saves at once, can be
 * taken back, and is what counts the talk done (`progress.ts`). Nobody else
 * sees it. Coursework gets no mark from anybody.
 */

type Props = {
  block: CasesBlock;
  weekNumber: number;
  /** Somebody taking part: their case and their mark are drawn. */
  participant: boolean;
  canWrite: boolean;
  picks: Picks;
  askToSwap: readonly string[];
  /** The pack the person has in the Choose one whose packs this talk's case groups name, or null. */
  packId: string | null;
  /** `<section>` with its heading at the top of the week, or a block inside a part. */
  variant: "section" | "part";
  anchorId: string;
};

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.chevron}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * "Ready for my talk": the person's own mark, in a 44px row: under a rule in
 * the case card, or in a box of its own under a pitch (wk-week6-phone).
 */
function ReadyBox({ props, given, boxed = false }: { props: Props; given: boolean; boxed?: boolean }) {
  const hydrated = useHydrated();
  const id = useId();
  const { block, picks, canWrite } = props;
  const ready = picks.isReady(block.id);
  const hasCases = casesIn(block).length > 0;
  const error = picks.errorOf(block.id);
  return (
    <div className={boxed ? styles.readyBoxed : styles.ready}>
      <label className={styles.readyRow} htmlFor={id}>
        <span className={weekly.tickBox}>
          <input
            id={id}
            type="checkbox"
            className={weekly.tickInput}
            checked={ready}
            disabled={!canWrite || !hydrated || picks.isSaving(block.id) || (hasCases && !given)}
            onChange={(event) => picks.setReady(block.id, event.currentTarget.checked)}
          />
          <span className={weekly.tickMark} aria-hidden="true">
            {ready && <Check />}
          </span>
        </span>
        <span className={styles.readyWords}>{readyWords(block.talk)}</span>
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** How to prepare: its first line as a disclosure's summary when it opens with one, the rest inside. */
function Prepare({ prepare }: { prepare: ProseValue }) {
  if (prepare.length === 0) return null;
  const [first, ...rest] = prepare;
  if (first.type !== "p" || rest.length === 0) {
    return <Prose prose={prepare} className={blockWeek.body} listClassName={blockWeek.list} linkClassName={blockWeek.inlineLink} />;
  }
  return (
    <details className={styles.prepare}>
      <summary className={styles.prepareSummary}>
        <span className={styles.prepareTitle}>
          {first.runs.map((run) => run.text).join("")}
        </span>
        <Chevron />
      </summary>
      <Prose prose={rest} className={`${blockWeek.body} ${styles.prepareBody}`} listClassName={blockWeek.list} linkClassName={blockWeek.inlineLink} />
    </details>
  );
}

/** "Your case": the case the person was given, or "Not given yet". */
function YourCase({ props }: { props: Props }) {
  const { block, weekNumber, picks, askToSwap } = props;
  const found = findCase(block, picks.caseOf(block.id));
  return (
    <div className={styles.caseCard}>
      <p className={styles.caseEyebrow}>
        <span>{YOUR_CASE}</span>
        {found && found.group.name && <span className={styles.chip}>{found.group.name}</span>}
      </p>
      {found ? (
        <>
          <h3 className={styles.caseTitle}>{found.item.title}</h3>
          {found.item.what.length > 0 && (
            <p className={styles.caseWhat}>
              <Runs runs={found.item.what} linkClassName={blockWeek.inlineLink} />
            </p>
          )}
          {found.item.contentNote && <p className={styles.caseNote}>{found.item.contentNote}</p>}
          {found.item.start.length > 0 && (
            <p className={styles.caseStart}>
              <span className={blockWeek.mono}>{block.startLabel || START_HERE}</span>{" "}
              <Runs runs={found.item.start} linkClassName={styles.startLink} />
            </p>
          )}
          {block.givenBy === "facilitator" && <p className={styles.line}>{givenCaseLineWords(weekNumber, askToSwap)}</p>}
        </>
      ) : (
        <>
          <h3 className={styles.caseTitle}>{NOT_GIVEN_YET}</h3>
          {block.givenBy === "facilitator" && <p className={styles.line}>{givenCaseLineWords(weekNumber, [])}</p>}
        </>
      )}
      <ReadyBox props={props} given={found !== null} />
      <Prepare prepare={block.prepare} />
    </div>
  );
}

/** One group of the week's cases, a disclosure, open for the person's own. */
function CaseGroupView({ block, group, mine, ownCaseId }: { block: CasesBlock; group: CaseGroup; mine: boolean; ownCaseId: string | null }) {
  const list = (
    <ul className={styles.caseList} role="list">
      {group.cases.map((item) => (
        <li key={item.id} className={styles.caseItem}>
          <p className={styles.caseItemTitle}>{item.title}</p>
          {item.id === ownCaseId && <span className={styles.chip}>{YOUR_CASE}</span>}
          {item.what.length > 0 && (
            <p className={styles.caseItemWhat}>
              <Runs runs={item.what} linkClassName={blockWeek.inlineLink} />
            </p>
          )}
          {item.contentNote && <p className={styles.caseNote}>{item.contentNote}</p>}
          {item.start.length > 0 && (
            <p className={styles.caseItemStart}>
              <Runs runs={item.start} linkClassName={styles.startLink} />
            </p>
          )}
        </li>
      ))}
    </ul>
  );
  if (!group.name) return <div className={styles.caseGroup}>{list}</div>;
  return (
    <details className={mine ? `${styles.caseGroup} ${styles.caseGroupMine}` : styles.caseGroup} open={mine}>
      <summary className={styles.caseGroupSummary}>
        <span className={styles.packHead}>
          <span className={styles.packName}>{group.name}</span>
          <span className={styles.caseCount}>{casesWords(group.cases.length)}</span>
          {mine && <span className={styles.chip}>{yourPackWords(block.groupLabel || "Pack")}</span>}
        </span>
        <Chevron />
      </summary>
      <div className={styles.caseGroupBody}>{list}</div>
    </details>
  );
}

export default function TalkView(props: Props) {
  const { block, participant, picks, packId, variant, anchorId } = props;
  const all = casesIn(block);
  const ownCaseId = participant ? picks.caseOf(block.id) : null;
  const ownGroup = findCase(block, ownCaseId)?.group ?? null;
  const isMine = (group: CaseGroup) =>
    participant && (group === ownGroup || (ownGroup === null && packId !== null && group.packId === packId));

  const body = (
    <>
      <Prose prose={block.intro} className={blockWeek.body} listClassName={blockWeek.list} linkClassName={blockWeek.inlineLink} />
      {all.length > 0 ? (
        <>
          {participant ? <YourCase props={props} /> : <Prepare prepare={block.prepare} />}
          <h3 className={`${blockWeek.h3} ${styles.allCases}`}>{allCasesWords(all.length)}</h3>
          <Prose prose={block.note} className={styles.line} linkClassName={blockWeek.inlineLink} />
          <div className={styles.caseGroups}>
            {block.groups.map((group, index) => (
              <CaseGroupView key={`${group.name}-${index}`} block={block} group={group} mine={isMine(group)} ownCaseId={ownCaseId} />
            ))}
          </div>
        </>
      ) : (
        <>
          <Prepare prepare={block.prepare} />
          {participant && <ReadyBox props={props} given boxed />}
          <Prose prose={block.note} className={styles.line} linkClassName={blockWeek.inlineLink} />
        </>
      )}
    </>
  );

  if (variant === "part") return <div className={styles.talk}>{body}</div>;
  return (
    <section id={anchorId} className={blockWeek.section} aria-labelledby={`${anchorId}-title`}>
      <div className={blockWeek.sectionHead}>
        <h2 id={`${anchorId}-title`} className={blockWeek.h2}>
          {block.heading || "Your case study"}
        </h2>
      </div>
      <div className={styles.talk}>{body}</div>
    </section>
  );
}
