"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useHydrated } from "@/hooks/useHydrated";
import type { HistoryRow } from "@/lib/courses/weekEdit/editor";
import type { WeekLockState } from "@/lib/courses/weekEdit/lock";
import { compareRequest, tickRow, versionLabel } from "@/lib/courses/weekEdit/pageModel";
import { HISTORY_PAGE, LOCK_NOTICE, TELL_PAGE } from "@/lib/courses/weekEdit/pageWords";
import { RESTORE_WORDS } from "@/lib/courses/weekEdit/words";
import TellDialog from "./TellDialog";
import { useWeekLock } from "./useWeekLock";
import styles from "./editWeek.module.css";

/**
 * A WEEK'S HISTORY, AS A PAGE of its own under the week on the programme's
 * Weeks tab: a page rather than the side panel, because a comparison sets
 * two versions of a week side by side and needs the width, and because a
 * page has an address the week's line links to and a lead can come back to.
 *
 * Every save, newest first (`GET .../history`): when, who, its one line,
 * who it reached, what it kept, and whether people were told and how many.
 * Tick one to compare it with now, or two to compare them
 * (`GET .../history/[saveId]?against=`): what changed, block by block, in
 * the comparison's own words. Against now, "Restore the Mon 9 Nov version"
 * brings it back as a new save (`POST .../history/[saveId]/restore`), asking
 * first, with the count, when it would take out items people have answered.
 * The newest save of a live week that has told nobody offers "Tell people
 * about it".
 */

type Side = { id: string; when: string; summary: string };

type CompareRow = {
  state: "changed" | "added" | "removed";
  blockId: string;
  place: string;
  before: string[];
  after: string[];
  fields: string;
};

type Compared = {
  before: Side;
  after: Side;
  comparison: { rows: CompareRow[]; moved: number; title: { before: string; after: string } | null; same: boolean };
  line: string;
  restore: { base: string; takesOut: Array<{ id: string; label: string; answers: number }>; answers: number } | null;
};

export default function HistoryView({
  runId,
  weekId,
  weekNumber,
  live,
  initial,
  lock: initialLock,
}: {
  runId: string;
  weekId: string;
  weekNumber: number;
  live: boolean;
  initial: HistoryRow[];
  lock: WeekLockState;
}) {
  const hydrated = useHydrated();
  const base = `/api/courses/runs/${encodeURIComponent(runId)}/weeks/${encodeURIComponent(weekId)}`;
  const lock = useWeekLock(runId, weekId, initialLock);
  const [rows, setRows] = useState<HistoryRow[]>(initial);
  const [ticked, setTicked] = useState<string[]>([]);
  const [compared, setCompared] = useState<Compared | null>(null);
  const [comparing, setComparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ answers: number; line: string } | null>(null);
  const [tellSave, setTellSave] = useState<string | null>(null);

  async function readRows() {
    try {
      const res = await fetch(`${base}/history`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { saves?: HistoryRow[] };
      if (res.ok && Array.isArray(body.saves)) setRows(body.saves);
    } catch {
      // The list stays as it was; the next action reads it again.
    }
  }

  async function compare(next: string[]) {
    setProblem(null);
    setSaid(null);
    const asked = compareRequest(next);
    if (!asked) {
      setCompared(null);
      return;
    }
    setComparing(true);
    try {
      const res = await fetch(`${base}/history/${encodeURIComponent(asked.saveId)}?against=${encodeURIComponent(asked.against)}`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as Compared & { error?: string };
      if (!res.ok) {
        setCompared(null);
        setProblem(body.error ?? "Couldn’t compare those two.");
      } else setCompared(body);
    } catch {
      setProblem("Couldn’t reach the site. Check your connection and try again.");
    } finally {
      setComparing(false);
    }
  }

  function tick(id: string, on: boolean) {
    const next = tickRow(ticked, id, on);
    setTicked(next);
    void compare(next);
  }

  async function restore(confirmAnswers?: number) {
    if (!compared?.restore) return;
    setBusy(true);
    setProblem(null);
    setSaid(null);
    let status = 0;
    let body: Record<string, unknown> = {};
    try {
      const res = await fetch(`${base}/history/${encodeURIComponent(compared.before.id)}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base: compared.restore.base, ...(confirmAnswers !== undefined ? { confirmAnswers } : {}) }),
      });
      status = res.status;
      body = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    } catch {
      setBusy(false);
      setProblem("Couldn’t reach the site. Check your connection: the week may not have been restored.");
      return;
    }
    setBusy(false);
    const error = typeof body.error === "string" ? body.error : "That didn’t restore. Try again.";
    if (status === 200) {
      setConfirm(null);
      setSaid(body.saved === true ? HISTORY_PAGE.restored(String(body.summary ?? "")) : String(body.summary ?? RESTORE_WORDS.same));
      setTicked([]);
      setCompared(null);
      await readRows();
      return;
    }
    // Restoring would take out answered items: ask first, with the count the route gave.
    if (status === 409 && typeof body.answers === "number") {
      setConfirm({ answers: body.answers, line: error });
      return;
    }
    setConfirm(null);
    setProblem(error);
    const holder = body.holder as { name?: string; since?: string } | undefined;
    if (status === 409 && holder?.name) lock.refusedBy({ name: holder.name, since: holder.since ?? "" }, error);
    if (status === 409 && error === RESTORE_WORDS.weekChanged) {
      setTicked([]);
      setCompared(null);
      await readRows();
    }
  }

  function startRestore() {
    if (!compared?.restore) return;
    if (compared.restore.answers > 0) {
      const items = compared.restore.takesOut.filter((item) => item.answers > 0).length;
      setConfirm({ answers: compared.restore.answers, line: RESTORE_WORDS.takesOut(compared.restore.answers, items) });
      return;
    }
    void restore();
  }

  const holder = lock.heldBy;
  const newest = rows[0] ?? null;
  const canTellNewest = live && newest !== null && newest.current && newest.kind !== "found" && newest.told === null;
  const restorable = compared?.restore && compared.after.id === "now" && !rows.find((row) => row.id === compared.before.id)?.current;

  return (
    <section className={styles.editWeek} aria-labelledby="week-history-title">
      <div className={styles.historyHead}>
        <span className={styles.weekChip}>{HISTORY_PAGE.back(weekNumber)}</span>
        <h2 id="week-history-title" className={styles.historyTitle}>
          {HISTORY_PAGE.title}
        </h2>
      </div>

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

      {said && (
        <p className={styles.note} role="status">
          {said}
        </p>
      )}
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>{HISTORY_PAGE.everySave}</h3>
          {rows.length > 1 && <p className={styles.quiet}>{HISTORY_PAGE.tickTwo}</p>}
        </div>
        {rows.length === 0 ? (
          <p className={styles.quiet}>{HISTORY_PAGE.none(weekNumber)}</p>
        ) : (
          <ol className={styles.saves} role="list">
            {rows.map((row, index) => {
              const meta = [row.reach, row.kept, row.told, row.current ? HISTORY_PAGE.current : ""].filter(Boolean).join(" · ");
              return (
                <li key={row.id} className={styles.save} data-save-id={row.id}>
                  <label className={styles.saveTick}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={ticked.includes(row.id)}
                      disabled={!hydrated || comparing}
                      onChange={(e) => tick(row.id, e.target.checked)}
                      aria-label={HISTORY_PAGE.tickLabel(row.when, row.summary)}
                    />
                  </label>
                  <span className={styles.saveWhen}>{row.when}</span>
                  <span className={styles.saveWho}>{row.by ?? ""}</span>
                  <span className={styles.saveWhat}>
                    <span className={styles.saveSummary}>{row.summary}</span>
                    {meta && <span className={styles.saveMeta}>{meta}</span>}
                    {index === 0 && canTellNewest && (
                      <span className={styles.saveActions}>
                        <Button type="button" variant="secondary" onClick={() => setTellSave(row.id)} disabled={!hydrated}>
                          {TELL_PAGE.tellFromHistory}
                        </Button>
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {comparing && <p className={styles.quiet}>{HISTORY_PAGE.loading}</p>}

      {compared && !comparing && (
        <div className={styles.card} aria-live="polite">
          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>
              {HISTORY_PAGE.comparing(compared.before.when || HISTORY_PAGE.now, compared.after.id === "now" ? HISTORY_PAGE.now : compared.after.when)}
            </h3>
            {restorable && (
              <Button type="button" variant="secondary" onClick={startRestore} disabled={!hydrated || busy || holder !== null}>
                {busy ? HISTORY_PAGE.restoring : HISTORY_PAGE.restore(versionLabel(compared.before.when))}
              </Button>
            )}
          </div>
          <p className={styles.quiet}>{compared.line}</p>
          {compared.comparison.title && (
            <div className={styles.compareRow}>
              <p className={styles.compareRowHead}>
                <span className={styles.compareState}>{HISTORY_PAGE.state.changed}</span>
                <span>{HISTORY_PAGE.titleRow}</span>
              </p>
              <div className={styles.compareSides}>
                <div className={`${styles.compareSide} ${styles.compareSideBefore}`}>
                  <p className={styles.compareLabel}>{compared.before.when || HISTORY_PAGE.nowLabel}</p>
                  <p className={styles.compareLine}>{compared.comparison.title.before}</p>
                </div>
                <div className={`${styles.compareSide} ${styles.compareSideAfter}`}>
                  <p className={styles.compareLabel}>{compared.after.id === "now" ? HISTORY_PAGE.nowLabel : compared.after.when}</p>
                  <p className={styles.compareLine}>{compared.comparison.title.after}</p>
                </div>
              </div>
            </div>
          )}
          <ol className={styles.compareRows} role="list">
            {compared.comparison.rows.map((row, i) => (
              <li key={`${row.blockId}-${i}`} className={styles.compareRow}>
                <p className={styles.compareRowHead}>
                  <span className={styles.compareState}>{HISTORY_PAGE.state[row.state]}</span>
                  <span>{row.place}</span>
                  {row.fields && <span className={styles.saveMeta}>{HISTORY_PAGE.fields(row.fields)}</span>}
                </p>
                <div className={styles.compareSides}>
                  <div className={`${styles.compareSide} ${styles.compareSideBefore}`}>
                    <p className={styles.compareLabel}>{compared.before.when || HISTORY_PAGE.nowLabel}</p>
                    {row.before.map((line, at) => (
                      <p key={at} className={styles.compareLine}>
                        {line}
                      </p>
                    ))}
                  </div>
                  <div className={`${styles.compareSide} ${styles.compareSideAfter}`}>
                    <p className={styles.compareLabel}>{compared.after.id === "now" ? HISTORY_PAGE.nowLabel : compared.after.when}</p>
                    {row.after.map((line, at) => (
                      <p key={at} className={styles.compareLine}>
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {compared.comparison.moved > 0 && <p className={styles.quiet}>{HISTORY_PAGE.movedLine(compared.comparison.moved)}</p>}
          {restorable && <p className={styles.callout}>{HISTORY_PAGE.restoreLine}</p>}
        </div>
      )}

      <Modal open={confirm !== null} onClose={() => setConfirm(null)} ariaLabel={HISTORY_PAGE.confirmTitle} width="sm">
        {(dismiss) =>
          confirm ? (
            <section className={styles.panel} aria-labelledby="restore-confirm-title">
              <h2 id="restore-confirm-title" className={styles.panelTitle}>
                {HISTORY_PAGE.confirmTitle}
              </h2>
              <p className={styles.tellLine}>{confirm.line}</p>
              {problem && (
                <p className={styles.problem} role="alert">
                  {problem}
                </p>
              )}
              <div className={styles.panelActions}>
                <Button type="button" onClick={() => void restore(confirm.answers)} disabled={!hydrated || busy || holder !== null}>
                  {busy ? HISTORY_PAGE.restoring : HISTORY_PAGE.confirm(confirm.answers)}
                </Button>
                <Button type="button" variant="secondary" onClick={dismiss} disabled={busy}>
                  {TELL_PAGE.close}
                </Button>
              </div>
            </section>
          ) : null
        }
      </Modal>

      <Modal open={tellSave !== null} onClose={() => setTellSave(null)} ariaLabel={TELL_PAGE.title} width="md">
        {(dismiss) =>
          tellSave ? (
            <TellDialog key={tellSave} runId={runId} weekId={weekId} saveId={tellSave} afterSave={false} onClose={dismiss} onTold={() => void readRows()} />
          ) : null
        }
      </Modal>
    </section>
  );
}
