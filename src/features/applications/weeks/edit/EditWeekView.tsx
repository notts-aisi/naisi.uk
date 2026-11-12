"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useHydrated } from "@/hooks/useHydrated";
import type { EditorItem } from "@/lib/courses/weekEdit/editor";
import { countLine } from "@/lib/courses/weekEdit/pageModel";
import { LOCK_NOTICE, PANEL_WORDS, TELL_PAGE, WEEK_LINE } from "@/lib/courses/weekEdit/pageWords";
import { KIND_LABEL } from "@/lib/courses/weekEdit/words";
import { allBlocks, type WeekBlock } from "@/lib/courses/weekBlocks/model";
import BlockPanel, { type SavedBlock } from "./BlockPanel";
import TellDialog from "./TellDialog";
import WeekBlockView from "./WeekBlockView";
import { useWeekEdit } from "./WeekEditProvider";
import styles from "./editWeek.module.css";

/**
 * A WEEK, AS IT READS, WITH WHAT PEOPLE HAVE DONE BESIDE EACH BLOCK: the top
 * of one week's page on a programme's Weeks tab, for the lead and admins.
 *
 * Above the blocks: whether the week is live, for how many groups, and how
 * many people have started it; "Paste the week" (the paste further down the
 * page) and "History". Then each block of the week in page order, drawn read
 * only by the member's own renderers (`WeekBlockView`), with the count the
 * editor's loader gives beside each block people tick or answer: numbers
 * only, never a name.
 *
 * A BLOCK THIS SLICE CHANGES (a source, a text, a reflection, a written
 * answer) carries a Change button, the keyboard's way in, and the card
 * itself opens it on a click outside its links. Any other block carries
 * nothing that looks pressable.
 *
 * ONE EDITOR AT A TIME. Change takes the week's lock first; while this page
 * holds it, "Only you are editing week 3." While somebody else does, the
 * notice names them and since when, the week stays readable, and every
 * Change is off until they save or leave. A save to a live week opens "Saved.
 * Tell people about it?".
 */
export default function EditWeekView({ historyHref }: { historyHref: string }) {
  const edit = useWeekEdit();
  const hydrated = useHydrated();
  /** The block as its panel opened it: what a save echoes, whatever the page reads meanwhile. */
  const [opened, setOpened] = useState<EditorItem | null>(null);
  const [opening, setOpening] = useState(false);
  const [panelKey, setPanelKey] = useState(0);
  /** A live save's notice offer, opened once the panel has closed (one dialog's history entry at a time). */
  const tellNext = useRef<string | null>(null);
  const [said, setSaid] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [tellSave, setTellSave] = useState<string | null>(null);
  if (!edit) return null;
  const { view, lock, weekNumber } = edit;
  if (!view.hasPage || !view.blockWeek) return null;

  const blocks = new Map<string, WeekBlock>(allBlocks(view.blocks).map((block) => [block.id, block] as const));
  const latest = opened ? (view.items.find((candidate) => candidate.blockId === opened.blockId) ?? null) : null;
  const editingOff = !hydrated || opening || lock.heldBy !== null;

  async function open(target: EditorItem) {
    if (!edit || !target.editable || editingOff) return;
    setProblem(null);
    setSaid([]);
    setOpening(true);
    const taken = await edit.lock.take();
    setOpening(false);
    if (!taken.ok) {
      setProblem(taken.error);
      return;
    }
    setPanelKey((n) => n + 1);
    setOpened(target);
  }

  /** The panel closed: by Close, Cancel, Escape, Back, or a save. The week goes back. */
  function close() {
    setOpened(null);
    edit?.lock.give();
    const next = tellNext.current;
    tellNext.current = null;
    if (next) setTellSave(next);
  }

  /** A save went through: say what it did, read the week again, and offer to tell people once the panel has closed. */
  function saved(result: SavedBlock, dismiss: () => void) {
    void edit?.reload();
    setSaid([PANEL_WORDS.saved(result.summary), ...(result.followed.length > 0 ? [PANEL_WORDS.followed(result.followed)] : [])]);
    tellNext.current = result.live && result.saveId ? result.saveId : null;
    dismiss();
  }

  const holder = lock.heldBy;
  return (
    <section className={styles.editWeek} aria-labelledby="edit-week-title">
      {lock.holding && !lock.lost && (
        <p className={styles.editingLine} role="status">
          <span className={styles.editingChip}>{WEEK_LINE.editing}</span>
          <span>{lock.lock.state === "yours" ? lock.lock.line : ""}</span>
        </p>
      )}
      {holder && (
        <div className={styles.lockNotice} role="status">
          <span className={styles.lockAvatar} aria-hidden="true">
            {holder.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className={styles.lockTitle}>{LOCK_NOTICE.title(holder.name, weekNumber)}</p>
            <p className={styles.lockLine}>{LOCK_NOTICE.line(holder.name, holder.since)}</p>
          </div>
        </div>
      )}

      <div className={styles.statusCard}>
        <p className={styles.statusLine}>
          <span className={view.live ? styles.liveChip : styles.quietChip}>{view.live ? WEEK_LINE.live : WEEK_LINE.notLive}</span>
          <span>
            {view.live
              ? WEEK_LINE.reach(view.reach.reading, view.reach.groups.length, view.reach.people, view.reach.started)
              : WEEK_LINE.notOpen(view.reach.groups.length)}
          </span>
        </p>
        <div className={styles.statusActions}>
          <a href="#paste-the-week" className={styles.linkButton}>
            {WEEK_LINE.paste}
          </a>
          <Link href={historyHref} className={styles.linkButton}>
            {WEEK_LINE.history}
          </Link>
        </div>
      </div>

      {said.length > 0 && (
        <div className={styles.note} role="status">
          {said.map((line) => (
            <p key={line} className={styles.noteLine}>
              {line}
            </p>
          ))}
        </div>
      )}
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}

      <h3 id="edit-week-title" className={styles.blocksTitle}>
        {WEEK_LINE.blocksTitle(weekNumber)}
      </h3>
      <p className={styles.quiet}>{WEEK_LINE.howTo}</p>
      <ol className={styles.blocks} role="list">
        {view.items.map((entry) => {
          const block = blocks.get(entry.blockId);
          if (!block) return null;
          const count = countLine(entry.type, entry.counts);
          const eyebrow = entry.type === "part" ? `Part ${entry.partNumber ?? ""}`.trim() : PANEL_WORDS.title(KIND_LABEL[entry.type], entry.partNumber);
          const changeable = entry.editable && entry.fields !== null;
          return (
            <li
              key={entry.blockId}
              id={`edit-${entry.blockId}`}
              className={[styles.block, entry.partNumber !== null && entry.type !== "part" ? styles.blockInPart : "", changeable ? styles.blockChangeable : "", opened?.blockId === entry.blockId ? styles.blockOpen : ""]
                .filter(Boolean)
                .join(" ")}
              data-block-type={entry.type}
              onClick={
                changeable
                  ? (event) => {
                      // A link or a button inside the card does its own thing.
                      if ((event.target as HTMLElement).closest("a, button, input, textarea, select, summary")) return;
                      void open(entry);
                    }
                  : undefined
              }
            >
              <div className={styles.blockHead}>
                <p className={styles.blockEyebrow}>{eyebrow}</p>
                <div className={styles.blockHeadEnd}>
                  {count && <span className={styles.blockCount}>{count}</span>}
                  {changeable && (
                    <Button
                      type="button"
                      variant="secondary"
                      className={styles.changeButton}
                      onClick={() => void open(entry)}
                      disabled={editingOff}
                      aria-label={PANEL_WORDS.changeLabel(entry.place)}
                    >
                      {PANEL_WORDS.change}
                    </Button>
                  )}
                </div>
              </div>
              <div className={styles.blockBody}>
                <WeekBlockView block={block} runId={view.runId} weekId={view.weekId} weekNumber={weekNumber} />
              </div>
            </li>
          );
        })}
      </ol>

      <Modal open={opened !== null} onClose={close} ariaLabel={opened ? PANEL_WORDS.title(KIND_LABEL[opened.type], opened.partNumber) : PANEL_WORDS.change} side>
        {(dismiss) =>
          opened ? (
            <BlockPanel
              key={panelKey}
              item={opened}
              latest={latest}
              runId={view.runId}
              weekId={view.weekId}
              weekNumber={weekNumber}
              programme={edit.programme}
              reach={view.reach}
              live={view.live}
              lost={lock.lost}
              lockedBy={lock.heldBy}
              onClose={dismiss}
              onSaved={(result) => saved(result, dismiss)}
              onRefusedBy={(who, line) => lock.refusedBy(who, line)}
              onStale={() => void edit.reload()}
            />
          ) : null
        }
      </Modal>

      <Modal open={tellSave !== null} onClose={() => setTellSave(null)} ariaLabel={TELL_PAGE.titleAfterSave} width="md">
        {(dismiss) =>
          tellSave ? (
            <TellDialog key={tellSave} runId={view.runId} weekId={view.weekId} saveId={tellSave} afterSave onClose={dismiss} onTold={() => {}} />
          ) : null
        }
      </Modal>
    </section>
  );
}
