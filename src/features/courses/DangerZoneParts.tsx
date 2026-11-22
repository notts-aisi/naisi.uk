"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import ProgressBar from "@/components/ui/ProgressBar";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { countRows, sumCounts, type InterruptedDestroy, type UseDestroy } from "./useDestroy";
import styles from "./RunDangerZone.module.css";

/**
 * THE DANGER-ZONE PIECES BOTH DANGER ZONES RENDER, and Course run on a
 * programme's Settings with them: the cancel dialog, the destroy dialog with
 * its manifest, progress and receipt, the collapsed panel, the blockers and
 * the interrupted and unfinished notices.
 *
 * One module so the confirmations cannot drift apart however many surfaces
 * ask them. It links nowhere of its own: where a receipt leads is the
 * caller's (`doneHref`). The older run page's own controls stay in
 * `RunDangerZone.tsx`, which re-exports these for the older course page.
 */

/** A run with no label can't be confirmed by typing it. */
export const NO_LABEL_TO_TYPE =
  "This run has no label, so there is nothing to type as confirmation — give it one under Run details first.";

// ---------------------------------------------------------------------------
// The cancel dialog
// ---------------------------------------------------------------------------

/**
 * "Cancel this cohort", the typed confirmation: the older run page's danger
 * zone and Course run on a programme's Settings both ask it, in these words.
 * The caller makes the status move; this only asks.
 */
export function CancelCohortDialog({
  open,
  run,
  cancelling,
  cancelText,
  onCancelTextChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  run: Pick<CourseRunDoc, "id" | "label" | "courseTitle">;
  cancelling: boolean;
  cancelText: string;
  onCancelTextChange: (next: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const cancelConfirmId = useId();
  const cancelMatches = cancelText === run.label && run.label.length > 0;
  const cancelWhitespaceOnly =
    !cancelMatches && cancelText.length > 0 && cancelText.trim() === run.label.trim();
  return (
    <Modal
      open={open}
      onClose={cancelling ? () => {} : onClose}
      ariaLabel="Cancel this cohort"
      width="sm"
    >
      <div className={styles.dialog}>
        <header className={styles.dialogHead}>
          <h2 className={styles.dialogTitle}>Cancel this cohort</h2>
          <p className={styles.dialogSubtitle}>
            {run.courseTitle
              ? `${run.courseTitle} · ${run.label || run.id}`
              : run.label || run.id}
          </p>
        </header>

        <p className={styles.dangerBody}>
          The run moves to <strong>Cancelled</strong> and stays there. It
          leaves the public catalogue and the cohort&apos;s live sections,
          applications stop being accepted, and no weekly mail goes out.
          Everything already recorded is kept.
        </p>

        {run.label ? (
          <section className={styles.confirmBlock}>
            <Field
              id={cancelConfirmId}
              label="Type the run label to confirm"
              hint={
                cancelWhitespaceOnly
                  ? "That matches apart from leading or trailing spaces. The check is exact."
                  : `Exactly “${run.label}”. Nothing is trimmed or corrected.`
              }
            >
              <Input
                id={cancelConfirmId}
                value={cancelText}
                onChange={(e) => onCancelTextChange(e.target.value)}
                className={styles.confirmInput}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={run.label}
              />
            </Field>
          </section>
        ) : (
          <BlockerList blockers={[NO_LABEL_TO_TYPE]} />
        )}

        <div className={styles.dialogActions}>
          <Button
            type="button"
            variant="ghost"
            disabled={cancelling}
            onClick={onClose}
          >
            Keep this cohort
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={!cancelMatches || cancelling}
            onClick={onConfirm}
          >
            Cancel this cohort
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Shared danger-zone pieces
// ---------------------------------------------------------------------------


/**
 * The collapsed red panel. Closed by default, always.
 *
 * `onFirstOpen` fires the first time it is opened and never again — it is how
 * both zones defer their manifest read (ten-ish aggregation queries) until
 * somebody has actually asked what a destroy would remove. Once, not on every
 * toggle: re-reading on each open would turn a fidget into a bill, and the
 * dialog takes its own fresh read at the moment of the decision anyway.
 */
export function DangerDisclosure({
  title,
  children,
  onFirstOpen,
}: {
  title: string;
  children: ReactNode;
  onFirstOpen?: () => void;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const opened = useRef(false);
  return (
    <div className={styles.disclosure}>
      <button
        type="button"
        className={styles.disclosureButton}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
          if (!opened.current) {
            opened.current = true;
            onFirstOpen?.();
          }
        }}
      >
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} aria-hidden>
          ›
        </span>
        {title}
      </button>
      <div id={panelId} className={`${styles.panel} ${open ? styles.panelOpen : ""}`}>
        {/* `inert` while closed so the collapsed content is out of the tab
            order and out of the accessibility tree — the grid track hides it
            visually but would otherwise leave a focusable Destroy button in a
            panel nobody can see. Same guard Modal uses. */}
        <div className={styles.panelInner} inert={!open}>
          <div className={styles.panelBody}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * The way in — or the reason there isn't one. Blockers replace the button
 * rather than disabling it (see the header note).
 */
export function DestroyEntry({
  state,
  extraBlockers,
  buttonLabel,
  onOpen,
}: {
  state: UseDestroy;
  extraBlockers: string[];
  buttonLabel: string;
  onOpen: () => void;
}) {
  const blockers = [...extraBlockers, ...(state.manifest?.blockers ?? [])];
  const loading = state.manifestState === "loading" && !state.manifest;

  if (state.manifestState === "error") {
    return (
      <div className={styles.entry}>
        <p className={styles.error}>
          Couldn&apos;t read what this would destroy: {state.manifestError}
        </p>
        <p className={styles.hint}>
          Nothing is offered until the manifest can be read — a destroy whose
          scope is unknown is not a destroy anybody should be pressing.
        </p>
        <Button type="button" variant="secondary" onClick={() => void state.loadManifest()}>
          Try again
        </Button>
      </div>
    );
  }

  if (blockers.length > 0) {
    return (
      <div className={styles.entry}>
        <BlockerList blockers={blockers} />
      </div>
    );
  }

  return (
    <div className={styles.entry}>
      <Button type="button" variant="danger" onClick={onOpen} disabled={loading}>
        {loading ? "Reading the manifest…" : buttonLabel}
      </Button>
    </div>
  );
}

/**
 * Why the blockers REPLACE the destroy button instead of disabling it: a
 * disabled control is a puzzle ("what enables this?"), and the answer to that
 * puzzle is usually "keep clicking things until it lights up". A sentence
 * where the button would have been is the answer.
 */
export function BlockerList({ blockers }: { blockers: string[] }) {
  return (
    <div className={styles.blockers}>
      <h5 className={styles.blockersTitle}>This can&apos;t be destroyed yet</h5>
      <ul className={styles.blockerItems}>
        {blockers.map((b, i) => (
          <li key={`${i}-${b}`}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

/** Surfaced above the disclosure — see the header note on the interrupted case. */
export function InterruptedBanner({
  noun,
  interrupted,
  onResume,
}: {
  noun: "run" | "course";
  interrupted: InterruptedDestroy;
  onResume: () => void;
}) {
  const already = sumCounts(interrupted.deleted);
  return (
    <div className={styles.interrupted}>
      <h4 className={styles.interruptedTitle}>
        A destroy of this {noun} was interrupted
      </h4>
      <p className={styles.interruptedBody}>
        {interrupted.startedByName
          ? `${interrupted.startedByName} started it`
          : "It was started"}
        {interrupted.startedAt ? ` on ${formatStamp(interrupted.startedAt)}` : ""} and it
        never finished
        {already > 0
          ? `. ${already.toLocaleString()} row${already === 1 ? "" : "s"} had already been removed when it stopped.`
          : "."}{" "}
        The {noun} is in a half-destroyed state until it is resumed — what has
        gone is gone, and what is left is no longer consistent with it.
      </p>
      <p className={styles.auditLine}>
        Audit record: <code>courseDeletions/{interrupted.auditId}</code>
      </p>
      <Button type="button" variant="danger" onClick={onResume}>
        Resume the destroy…
      </Button>
    </div>
  );
}

/**
 * A pass failed or the loop stopped, and the operator closed the dialog on it.
 *
 * The two cases are NOT described the same way, for the reason
 * `StaffEmailComposer` separates refused from unknown: a refusal is decided
 * before the cascade touches anything, so nothing moved and there is no
 * half-destroyed anything. Only a pass that may have run leaves the target in a
 * state worth warning about — and this component must not claim rows are gone
 * when none are.
 */
export function UnfinishedNotice({
  state,
  noun,
  onResume,
}: {
  state: UseDestroy;
  noun: "run" | "course";
  onResume: () => void;
}) {
  const started = state.deletedTotal > 0;
  const refused = state.failure?.kind === "refused";
  return (
    <div className={styles.interrupted}>
      <h4 className={styles.interruptedTitle}>
        {refused && !started ? "The destroy was refused" : "This destroy did not finish"}
      </h4>
      <p className={styles.interruptedBody}>{state.failure?.message}</p>
      <p className={styles.interruptedBody}>
        {started
          ? `${state.deletedTotal.toLocaleString()} row${state.deletedTotal === 1 ? " was" : "s were"} removed before it stopped, so this ${noun} is half-destroyed. Resuming is the only way to finish it.`
          : refused
            ? `Nothing was removed — this ${noun} is exactly as it was.`
            : `No rows were reported removed, but the attempt may not have been clean. Resuming re-reads the audit record and carries on from wherever it actually got to.`}
      </p>
      {state.auditId && (
        <p className={styles.auditLine}>
          Audit record: <code>courseDeletions/{state.auditId}</code>
        </p>
      )}
      <Button type="button" variant="danger" onClick={onResume}>
        {refused && !started ? "Try again…" : "Resume the destroy…"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The dialog
// ---------------------------------------------------------------------------

export type DestroyDialogProps = {
  open: boolean;
  onClose: () => void;
  state: UseDestroy;
  noun: "run" | "course";
  /** What the confirmation field asks for: "run label" / "course title". */
  nameLabel: string;
  /** The exact string that must be typed. Compared byte for byte. */
  expectedName: string;
  /** One line identifying the target, above the counts. */
  subtitle: string;
  extraBlockers: string[];
  confirmText: string;
  onConfirmTextChange: (next: string) => void;
  manifestBusy: boolean;
  doneHref: string;
  doneLabel: string;
};

export function DestroyDialog({
  open,
  onClose,
  state,
  noun,
  nameLabel,
  expectedName,
  subtitle,
  extraBlockers,
  confirmText,
  onConfirmTextChange,
  manifestBusy,
  doneHref,
  doneLabel,
}: DestroyDialogProps) {
  const confirmId = useId();
  const { phase, manifest } = state;
  const busy = phase === "destroying";
  const resuming = manifest?.interrupted != null && phase === "idle";

  // Byte equality, no trimming: the point of the ritual is that the operator
  // typed this exact string. The hint below tells a near-miss why it failed
  // rather than leaving a dead button to explain itself.
  const matches = confirmText === expectedName && expectedName.length > 0;
  const whitespaceOnly =
    !matches && confirmText.length > 0 && confirmText.trim() === expectedName.trim();

  const blockers = [...extraBlockers, ...(manifest?.blockers ?? [])];
  const rows = manifest ? countRows(manifest.counts) : [];
  const dying = rows.filter((r) => r.fate === "destroyed");
  const surviving = rows.filter((r) => r.fate !== "destroyed");
  const dyingTotal = dying.reduce((sum, r) => sum + r.value, 0);

  return (
    <Modal
      open={open}
      // Mid-cascade the dialog is not dismissible: Esc and the scrim both land
      // here, and both are ignored while a pass is in flight. Losing the
      // progress view wouldn't stop the cascade, it would just hide it.
      onClose={busy ? () => {} : onClose}
      ariaLabel={`Destroy this ${noun}`}
      width="md"
    >
      <div className={styles.dialog}>
        <header className={styles.dialogHead}>
          <h2 className={styles.dialogTitle}>
            {phase === "done"
              ? `This ${noun} has been destroyed`
              : resuming
                ? `Resume destroying this ${noun}`
                : `Destroy this ${noun}`}
          </h2>
          <p className={styles.dialogSubtitle}>{subtitle}</p>
        </header>

        {phase === "destroying" && <DestroyProgress state={state} />}

        {phase === "done" && (
          <>
            <DestroyReceipt
              state={state}
              noun={noun}
              name={expectedName}
              doneHref={doneHref}
              doneLabel={doneLabel}
            />
            <div className={styles.dialogActions}>
              <Button type="button" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}

        {(phase === "failed" || phase === "stalled") && (
          <>
            <div className={styles.failure}>
              <h3 className={styles.failureTitle}>
                {state.failure?.kind === "refused"
                  ? "The destroy was refused"
                  : "The destroy stopped part-way"}
              </h3>
              <p className={styles.failureBody}>{state.failure?.message}</p>
              <p className={styles.failureBody}>
                {state.failure?.kind === "refused"
                  ? "Refusals are decided before the cascade touches anything, so nothing moved on this attempt."
                  : `${state.deletedTotal.toLocaleString()} row${state.deletedTotal === 1 ? "" : "s"} have been removed so far. Resuming continues from there — the audit record is the cursor, so nothing is repeated and nothing is skipped.`}
              </p>
              {state.auditId && (
                <p className={styles.auditLine}>
                  Audit record: <code>courseDeletions/{state.auditId}</code>
                </p>
              )}
            </div>
            <div className={styles.dialogActions}>
              <Button type="button" variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={!matches}
                onClick={() => void state.destroy(confirmText)}
              >
                {state.failure?.kind === "refused" ? "Try again" : "Resume the destroy"}
              </Button>
            </div>
            {!matches && (
              <p className={styles.hint}>
                Retype the {nameLabel} above to re-enable the button.
              </p>
            )}
          </>
        )}

        {phase === "idle" && (
          <>
            {manifestBusy && !manifest && (
              <p className={styles.loading} role="status">
                Reading what this would destroy…
              </p>
            )}

            {state.manifestState === "error" && (
              <div className={styles.failure}>
                <h3 className={styles.failureTitle}>The manifest couldn&apos;t be read</h3>
                <p className={styles.failureBody}>{state.manifestError}</p>
                <p className={styles.failureBody}>
                  Nothing is offered from here until it can be: the counts are
                  the argument for pressing the button, and a destroy with no
                  stated scope is one nobody should be authorising.
                </p>
              </div>
            )}

            {manifest && (
              <>
                {manifest.interrupted && (
                  <p className={styles.resumeNote}>
                    This resumes an earlier destroy that never finished
                    {sumCounts(manifest.interrupted.deleted) > 0
                      ? ` — ${sumCounts(manifest.interrupted.deleted).toLocaleString()} rows are already gone`
                      : ""}
                    . The counts below are what is still there.
                  </p>
                )}

                <section className={styles.countsBlock}>
                  <h3 className={styles.blockTitle}>
                    What this removes{manifestBusy ? " (refreshing…)" : ""}
                  </h3>
                  <p className={styles.blockHint}>
                    Counted live, just now. Nothing here can be recovered
                    afterwards.
                  </p>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <tbody>
                        {dying.map((row) => (
                          <tr key={row.key}>
                            <th scope="row" className={styles.rowLabel}>
                              {row.label}
                              {row.note && <span className={styles.rowNote}>{row.note}</span>}
                            </th>
                            <td className={styles.rowValue}>{row.value.toLocaleString()}</td>
                          </tr>
                        ))}
                        <tr className={styles.totalRow}>
                          <th scope="row" className={styles.rowLabel}>
                            Rows in total
                          </th>
                          <td className={styles.rowValue}>{dyingTotal.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>

                {surviving.length > 0 && (
                  <section className={styles.keptBlock}>
                    <h3 className={styles.blockTitle}>What survives</h3>
                    <ul className={styles.keptItems}>
                      {surviving.map((row) => (
                        <li key={row.key}>
                          <strong>
                            {row.value.toLocaleString()} {row.label.toLowerCase()}
                          </strong>
                          {row.note ? ` — ${row.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {blockers.length > 0 ? (
                  <BlockerList blockers={blockers} />
                ) : (
                  <section className={styles.confirmBlock}>
                    <Field
                      id={confirmId}
                      label={`Type the ${nameLabel} to confirm`}
                      hint={
                        whitespaceOnly
                          ? "That matches apart from leading or trailing spaces. The check is exact."
                          : `Exactly “${expectedName}”. Nothing is trimmed or corrected.`
                      }
                    >
                      <Input
                        id={confirmId}
                        value={confirmText}
                        onChange={(e) => onConfirmTextChange(e.target.value)}
                        className={styles.confirmInput}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        placeholder={expectedName}
                      />
                    </Field>
                  </section>
                )}
              </>
            )}

            <div className={styles.dialogActions}>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              {manifest && blockers.length === 0 && (
                <Button
                  type="button"
                  variant="danger"
                  disabled={!matches || manifestBusy}
                  onClick={() => void state.destroy(confirmText)}
                >
                  Destroy this {noun} permanently
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Mid-cascade. Driven entirely by the resume loop's reports. */
function DestroyProgress({ state }: { state: UseDestroy }) {
  return (
    <section className={styles.progressBlock} role="status" aria-live="polite">
      <p className={styles.progressLine}>
        Deleting… {state.deletedTotal.toLocaleString()} of ~
        {state.estimatedTotal.toLocaleString()} rows
      </p>
      <ProgressBar
        value={state.deletedTotal}
        max={Math.max(1, state.estimatedTotal)}
        tone="danger"
        ariaLabel="Rows removed"
      />
      <p className={styles.progressHint}>
        Pass {state.passes + 1}. The cascade runs in pages, so this may take
        several round trips. Leaving this page stops it between passes —
        nothing already removed comes back, and the run keeps its record of
        where it got to, so this page will offer to resume from there.
      </p>
    </section>
  );
}

/**
 * The receipt. Deliberately flat: no tick, no colour, no "successfully". What
 * happened here is that records were destroyed, and the only useful things to
 * say are what went and where it is written down.
 */
export function DestroyReceipt({
  state,
  noun,
  name,
  doneHref,
  doneLabel,
}: {
  state: UseDestroy;
  noun: "run" | "course";
  name: string;
  doneHref: string;
  doneLabel: string;
}) {
  const rows = countRows(state.deleted);
  const total = state.deletedTotal;
  // The manifest's estimate can exceed what the passes reported — a row deleted
  // by something else in between, or a counter this client doesn't know how to
  // read. Say so rather than quietly presenting the smaller number as the
  // whole story.
  const shortfall = state.estimatedTotal > total;

  return (
    <section className={styles.receipt}>
      <h3 className={styles.receiptTitle}>Destroyed</h3>
      <p className={styles.receiptBody}>
        {name ? `“${name}”` : `This ${noun}`} and the records listed below no
        longer exist. This page is showing a {noun} that is gone.
      </p>

      {rows.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className={styles.rowLabel}>
                    {row.label}
                  </th>
                  <td className={styles.rowValue}>{row.value.toLocaleString()}</td>
                </tr>
              ))}
              <tr className={styles.totalRow}>
                <th scope="row" className={styles.rowLabel}>
                  Rows removed
                </th>
                <td className={styles.rowValue}>{total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.auditLine}>
        Recorded in{" "}
        <code>courseDeletions/{state.auditId ?? "(no audit id was returned)"}</code>
        {state.passes > 1 ? ` · ${state.passes} passes` : ""}
      </p>
      {shortfall && (
        <p className={styles.receiptCaveat}>
          The manifest counted about {state.estimatedTotal.toLocaleString()} rows
          before the cascade began, which is more than the passes reported
          removing. Where the two differ the audit record is the authority.
        </p>
      )}

      <div className={styles.receiptActions}>
        <Link href={doneHref} className={styles.receiptLink}>
          {doneLabel}
        </Link>
      </div>
    </section>
  );
}

/** ISO → something readable, without pulling a date library into this file. */
function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
