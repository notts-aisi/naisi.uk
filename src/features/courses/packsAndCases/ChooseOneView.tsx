"use client";

import { useHydrated } from "@/hooks/useHydrated";
import { TASK_DONE, doneItemWords } from "@/lib/courses/memberPageWords";
import { packSourceCount } from "@/lib/courses/packsAndCases/model";
import {
  CHOOSE_ONE,
  ONLY_THE_ONE_YOU_CHOOSE,
  PICK_CLOSED,
  READ,
  chooseOneHeadingWords,
  givenPacksLineWords,
  packMetaWords,
  packsEyebrowWords,
  yourPackWords,
} from "@/lib/courses/packsAndCases/words";
import { SOURCE_KIND_LABEL, type ChooseOneBlock, type Pack } from "@/lib/courses/weekBlocks/model";
import type { CourseProgressDoc, ProgressItemKind } from "@/lib/firestore/courseProgress";
import weekly from "../weekly/weekly.module.css";
import Prose, { Runs } from "../weekBlocks/Prose";
import { ReadingBox } from "../weekBlocks/SourceCard";
import blockWeek from "../weekBlocks/blockWeek.module.css";
import type { Picks } from "./usePicks";
import styles from "./packsAndCases.module.css";

/**
 * A CHOOSE ONE ON THE WEEK PAGE (plan item 8; Q32 A; boards wk-week,
 * wk-week-phone and wk-week6-phone): the packs, each with its name, time,
 * how many sources and its note, and its reading as the guide writes it.
 *
 *  - GIVEN OUT by a facilitator (week 3's pathways): "Pathway packs", the
 *    line "Given out at the end of session 2. Only your pathway counts. To
 *    switch, ask Rahul or Sofia.", and the person's own pack open, marked
 *    "Your pathway", with its tick. The others stay closed. Nothing here
 *    changes it: a facilitator types the draw into the group page.
 *  - PICKED by the person (week 6's career review): "Choose one", the line
 *    "Only the one you choose counts.", and a real radio button per pack,
 *    which saves at once and can change until their session starts.
 *
 * Only the pack the person has counts towards their week, and it is ticked
 * as one on its id (`progress.ts`; a pack is one line of the guide's, its
 * links and one time). Once ticked, "Rate it or leave a note" opens its
 * rating and private note, as a source's does. Staff read the packs with no
 * tick and no radio.
 */

type Props = {
  block: ChooseOneBlock;
  weekNumber: number;
  /** Somebody taking part: their pack, its tick and their pick are drawn. */
  participant: boolean;
  canWrite: boolean;
  picks: Picks;
  askToSwap: readonly string[];
  isDone: (itemId: string) => boolean;
  canTick: boolean;
  rows: ReadonlyMap<string, CourseProgressDoc>;
  onTick: (kind: ProgressItemKind, itemId: string, next: boolean) => void;
  runId: string;
  uid: string;
  privateNoteHint: string;
};

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.chevron}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ArrowUpRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={blockWeek.arrow}>
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  );
}

export default function ChooseOneView(props: Props) {
  return props.block.givenBy === "facilitator" ? <GivenPacks {...props} /> : <PickedPacks {...props} />;
}

/**
 * The pack's tick, its reading (or, for a list's option, whose link is drawn
 * beside its name, the word "Done") and, once ticked, its rating and note.
 */
function PackTick({ pack, props, showRead }: { pack: Pack; props: Props; showRead: boolean }) {
  const done = props.isDone(pack.id);
  return (
    <div className={styles.packTick}>
      <label className={weekly.tickBox}>
        <input
          type="checkbox"
          className={weekly.tickInput}
          checked={done}
          disabled={!props.canWrite || !props.canTick}
          aria-label={doneItemWords(pack.name)}
          onChange={(event) => props.onTick("material", pack.id, event.currentTarget.checked)}
        />
        <span className={weekly.tickMark} aria-hidden="true">
          {done && <Check />}
        </span>
      </label>
      <div className={blockWeek.sourceBody}>
        {showRead ? (
          <p className={styles.packRead}>
            <Runs runs={pack.read} linkClassName={blockWeek.inlineLink} />
          </p>
        ) : (
          <p className={styles.tickWord}>{TASK_DONE}</p>
        )}
        {props.canWrite && done && (
          <ReadingBox
            runId={props.runId}
            uid={props.uid}
            weekNumber={props.weekNumber}
            itemId={pack.id}
            row={props.rows.get(pack.id) ?? null}
            hint={props.privateNoteHint}
          />
        )}
      </div>
    </div>
  );
}

/** A pack's reading with no tick: anybody's pack but the person's own, or a pack staff read. */
function PackReading({ pack }: { pack: Pack }) {
  return (
    <p className={styles.packRead}>
      <Runs runs={pack.read} linkClassName={blockWeek.inlineLink} />
    </p>
  );
}

function GivenPacks(props: Props) {
  const { block, weekNumber, participant, picks, askToSwap } = props;
  const own = participant ? picks.packOf(block.id) : null;
  return (
    <div className={styles.packs}>
      <p className={styles.eyebrow}>{packsEyebrowWords(block.title)}</p>
      <p className={styles.line}>{givenPacksLineWords(weekNumber, block.title, askToSwap)}</p>
      {block.questions.length > 0 && (
        <Prose prose={block.questions} className={blockWeek.body} listClassName={blockWeek.list} linkClassName={blockWeek.inlineLink} />
      )}
      <ul className={styles.packList} role="list">
        {block.packs.map((pack) => {
          const mine = pack.id === own;
          const meta = packMetaWords(pack.time || block.time, packSourceCount(pack));
          return (
            <li key={pack.id}>
              <details className={mine ? `${styles.pack} ${styles.packMine}` : styles.pack} open={mine}>
                <summary className={styles.packSummary}>
                  <span className={styles.packHead}>
                    <span className={styles.packName}>{pack.name}</span>
                    {mine && <span className={styles.chip}>{yourPackWords(block.title)}</span>}
                  </span>
                  {meta && <span className={`${blockWeek.mono} ${styles.packMeta}`}>{meta}</span>}
                  <Chevron />
                </summary>
                <div className={styles.packBody}>
                  {pack.note.length > 0 && (
                    <p className={blockWeek.sourceNote}>
                      <Runs runs={pack.note} linkClassName={blockWeek.inlineLink} />
                    </p>
                  )}
                  {mine && participant ? <PackTick pack={pack} props={props} showRead /> : <PackReading pack={pack} />}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PickedPacks(props: Props) {
  const { block, participant, canWrite, picks } = props;
  const hydrated = useHydrated();
  const own = participant ? picks.packOf(block.id) : null;
  const heading = chooseOneHeadingWords(block);
  const saving = picks.isSaving(block.id);
  const error = picks.errorOf(block.id);
  const name = `pick-${block.id}`;
  return (
    <div className={styles.packs}>
      <p className={styles.eyebrow}>{CHOOSE_ONE}</p>
      {heading && <h4 className={styles.pickHeading}>{heading}</h4>}
      {block.form === "list" && (
        <p className={blockWeek.sourceMeta}>
          <span className={blockWeek.kindPill}>{SOURCE_KIND_LABEL[block.kind]}</span>
          {block.time && <span className={blockWeek.mono}>{block.time}</span>}
        </p>
      )}
      <p className={styles.line}>{ONLY_THE_ONE_YOU_CHOOSE}</p>
      {block.questions.length > 0 && (
        <Prose prose={block.questions} className={blockWeek.body} listClassName={blockWeek.list} linkClassName={blockWeek.inlineLink} />
      )}
      <ul className={styles.packList} role="list">
        {block.packs.map((pack) => {
          const mine = pack.id === own;
          const href = pack.read.find((run) => run.href)?.href ?? null;
          const time = pack.time || (block.form === "table" ? block.time : "");
          return (
            <li key={pack.id} className={mine ? `${styles.option} ${styles.packMine}` : styles.option}>
              <div className={styles.optionHead}>
                {participant ? (
                  <label className={styles.radioRow}>
                    <input
                      type="radio"
                      name={name}
                      className={styles.radio}
                      checked={mine}
                      disabled={!canWrite || !picks.open || !hydrated || saving}
                      onChange={() => picks.pick(block.id, pack.id)}
                    />
                    <span className={styles.optionText}>
                      <span className={styles.packName}>{pack.name}</span>
                      {pack.note.length > 0 && (
                        <span className={styles.optionNote}>
                          <Runs runs={pack.note} linkClassName={blockWeek.inlineLink} />
                        </span>
                      )}
                    </span>
                  </label>
                ) : (
                  <span className={styles.optionText}>
                    <span className={styles.packName}>{pack.name}</span>
                    {pack.note.length > 0 && (
                      <span className={styles.optionNote}>
                        <Runs runs={pack.note} linkClassName={blockWeek.inlineLink} />
                      </span>
                    )}
                  </span>
                )}
                {block.form === "list" && href && (
                  <a className={styles.readLink} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${READ} ${pack.name}`}>
                    {READ}
                    <ArrowUpRight />
                  </a>
                )}
              </div>
              {block.form === "table" && (
                <div className={styles.optionBody}>
                  {time && <p className={blockWeek.mono}>{time}</p>}
                  {!(mine && participant) && <PackReading pack={pack} />}
                </div>
              )}
              {mine && participant && <PackTick pack={pack} props={props} showRead={block.form === "table"} />}
            </li>
          );
        })}
      </ul>
      {participant && !picks.open && <p className={styles.line}>{PICK_CLOSED}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
