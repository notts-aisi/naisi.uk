"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import * as P from "@/lib/courses/registerCorrection/pageWords";
import { correctColumn, postGroupNotice, type Answer } from "./api";
import styles from "./CorrectionSheets.module.css";

/**
 * A WHOLE COLUMN OF A REGISTER, corrected: for admins and the people leading
 * the programme, from the column's menu.
 *
 * A column that says the session happened offers the four ways it can be
 * wrong (held online; the lines belong to another week's session; taken for
 * the wrong session, so cleared; it didn't happen, keeping pace or pushing the
 * rest back, with its optional notice). A column that says it didn't happen
 * offers "Week N did happen": why, who was there, and what it does.
 *
 * Every way asks why, and shows "Before you save" from the route's own
 * preview (`preview: true`, which writes nothing) before the one button,
 * which names what it does. Nobody is emailed, except by It didn't happen's
 * notice when it is ticked, which says its count first: the count is the
 * preview's, and the route checks it again when the button is pressed.
 */

export type ColumnTarget = {
  session: { weekNumber: number; occurrence: number; sessionKey: string; dateKey: string; held: boolean };
  finished: { name: string; at: string } | null;
};

type Store = { key: string; answer: Answer | null };

export default function ColumnSheet({
  open,
  onClose,
  groupId,
  runId,
  groupName,
  target,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  /** The run, for It didn't happen's notice; null where the page cannot post one. */
  runId: string | null;
  groupName: string;
  target: ColumnTarget | null;
  onDone: (said: string) => void;
}) {
  const happened = target?.session.held ?? true;
  const [way, setWay] = useState<P.ColumnWay | null>(null);
  const [reason, setReason] = useState("");
  const [toKey, setToKey] = useState<string | null>(null);
  const [pace, setPace] = useState<"keep" | "push" | null>(null);
  const [tell, setTell] = useState(false);
  const [lines, setLines] = useState<Record<string, string>>({});
  const [emailsSaid, setEmailsSaid] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [store, setStore] = useState<Store>({ key: "", answer: null });

  const session = target?.session ?? null;
  const kind: P.ColumnWay | "did-happen" | null = happened ? way : "did-happen";

  // What the preview is asked: one key per question, so an answer that lands
  // after the question changed is never shown.
  const previewBody: Record<string, unknown> | null =
    !session || !kind
      ? null
      : kind === "did-not-happen"
        ? pace
          ? { kind, weekNumber: session.weekNumber, occurrence: session.occurrence, preview: true, pace, dateKey: session.dateKey }
          : null
        : kind === "move"
          ? {
              kind,
              weekNumber: session.weekNumber,
              occurrence: session.occurrence,
              preview: true,
              ...(toKey ? { to: weekOfKey(toKey) } : {}),
            }
          : { kind, weekNumber: session.weekNumber, occurrence: session.occurrence, preview: true };
  const previewKey = previewBody ? JSON.stringify(previewBody) : "";

  useEffect(() => {
    if (!previewKey) return;
    let cancelled = false;
    void correctColumn(groupId, JSON.parse(previewKey) as Record<string, unknown>).then((answer) => {
      if (!cancelled) setStore({ key: previewKey, answer });
    });
    return () => {
      cancelled = true;
    };
  }, [groupId, previewKey]);

  if (!target || !session) return null;

  const answer = store.key === previewKey ? store.answer : null;
  const preview = answer?.ok ? ((answer.body?.preview as Record<string, unknown> | undefined) ?? null) : null;
  const previewProblem = answer && !answer.ok ? answer.error : null;

  // The count of lines the button names.
  const count =
    kind === "online"
      ? Number(preview?.changes ?? 0)
      : kind === "move"
        ? Number(preview?.moves ?? 0)
        : kind === "clear"
          ? Number(preview?.clears ?? 0)
          : 0;
  const told = (preview?.told as { emails: number; refused: boolean } | undefined) ?? null;
  const emails = emailsSaid ?? told?.emails ?? 0;
  const canTell = Boolean(told && !told.refused && emails > 0 && runId);
  const targets = ((preview?.targets as { weekNumber: number; occurrence: number; sessionKey: string; dateKey: string; ok: boolean; why: string | null }[] | undefined) ?? []).filter((each) => each.ok);
  const toWeek = toKey ? weekOfKey(toKey).weekNumber : null;
  const people = (preview?.people as { uid: string; name: string; line: string }[] | undefined) ?? [];
  const everyoneSaid = people.length > 0 && people.every((each) => Boolean(lines[each.uid]));

  const ready =
    !busy &&
    preview !== null &&
    reason.trim().length > 0 &&
    (kind === "online" ? count > 0 : true) &&
    (kind === "move" ? Boolean(toKey) && count > 0 : true) &&
    (kind === "clear" ? count > 0 : true) &&
    (kind === "did-not-happen" ? pace !== null : true) &&
    (kind === "did-happen" ? everyoneSaid : true);

  const counts = { room: 0, online: 0, absent: 0, excused: 0 };
  for (const each of people) {
    const chosen = lines[each.uid];
    if (chosen === "present") counts.room += 1;
    else if (chosen === "present-online") counts.online += 1;
    else if (chosen === "absent") counts.absent += 1;
  }

  const before: P.BeforeYouSave = !preview
    ? []
    : kind === "did-not-happen"
      ? P.didNotHappenPreviewLines(preview)
      : kind === "did-happen"
        ? P.didHappenPreviewLines(preview, counts)
        : P.columnPreviewLines(preview, groupName);

  const button = kind
    ? P.columnButtonWords({ way: kind, weekNumber: session.weekNumber, lines: count, toWeek, tell: tell && canTell, emails })
    : P.SAVE_THE_CORRECTION;

  async function press() {
    if (!session || !kind || !ready) return;
    setBusy(true);
    setProblem(null);
    const base = { kind, weekNumber: session.weekNumber, occurrence: session.occurrence, reason: reason.trim() };
    const body: Record<string, unknown> =
      kind === "move"
        ? { ...base, to: weekOfKey(toKey ?? "") }
        : kind === "did-not-happen"
          ? { ...base, pace, dateKey: session.dateKey, tell: tell && canTell, ...(tell && canTell ? { emailCount: emails } : {}) }
          : kind === "did-happen"
            ? {
                ...base,
                lines: people.map((each) => {
                  const chosen = P.choiceOf(lines[each.uid] ?? null);
                  return { uid: each.uid, ...(chosen ? P.lineBody(chosen) : { status: "absent" }) };
                }),
              }
            : base;
    const pressed = await correctColumn(groupId, body);
    if (!pressed.ok) {
      setBusy(false);
      if (pressed.status === 409 && typeof pressed.body?.emails === "number") setEmailsSaid(pressed.body.emails);
      setProblem(pressed.error);
      return;
    }
    const done = P.columnDoneWords(kind, session.weekNumber, count, toWeek);
    const update = pressed.body?.update as { groupId: string; title: string; message: string; emailCount: number } | null | undefined;
    if (kind === "did-not-happen" && update && runId) {
      const posted = await postGroupNotice(runId, update);
      setBusy(false);
      onDone(posted.ok ? `${done} The notice went to ${groupName.trim() || "the group"}.` : `${done} The notice didn’t go: ${posted.error ?? "try again from the group’s page."}`);
      return;
    }
    setBusy(false);
    onDone(kind === "did-not-happen" ? `${done} Nobody was emailed.` : done);
  }

  const title = happened ? P.correctColumnWords(session.weekNumber) : P.didHappenWords(session.weekNumber);

  return (
    <Modal open={open} onClose={onClose} ariaLabel={title} sheet>
      {(dismiss) => (
        <div className={styles.sheet} data-testid="column-sheet">
          <div className={styles.head}>
            <h2 className={styles.title}>{title}</h2>
            <button type="button" className={styles.button} onClick={dismiss}>
              {P.CLOSE}
            </button>
          </div>
          <p className={styles.footLine}>{P.columnHead(groupName, session.dateKey, target.finished)}</p>

          {!happened && preview && (
            <p className={styles.note}>{P.calledOffWords((preview.calledOff as { byName: string; at: string; reason: string } | null) ?? null, session.weekNumber)}</p>
          )}

          {happened && (
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>{P.WHAT_WAS_WRONG}</legend>
              {P.COLUMN_WAYS.filter((each) => each.way !== "did-not-happen" || session.occurrence === 1).map((each) => (
                <label key={each.way} className={`${styles.choice} ${styles.choiceWide} ${way === each.way ? styles.choiceOn : ""}`}>
                  <input
                    type="radio"
                    name="column-way"
                    className={styles.radio}
                    checked={way === each.way}
                    onChange={() => {
                      setWay(each.way);
                      setProblem(null);
                    }}
                    disabled={busy}
                  />
                  <span className={styles.choiceText}>
                    <span>{each.title}</span>
                    <span className={styles.choiceLine}>{each.line}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {kind === "move" && preview && (
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>{P.WHICH_WEEK}</legend>
              {targets.length === 0 ? (
                <p className={styles.footLine}>No other week’s register is free to take these lines: each has been taken, or its session hasn’t happened.</p>
              ) : (
                <div className={styles.choices}>
                  {targets.map((each) => (
                    <label key={each.sessionKey} className={`${styles.choice} ${toKey === each.sessionKey ? styles.choiceOn : ""}`}>
                      <input
                        type="radio"
                        name="column-to"
                        className={styles.radio}
                        checked={toKey === each.sessionKey}
                        onChange={() => setToKey(each.sessionKey)}
                        disabled={busy}
                      />
                      <span>{P.columnLabel(each.weekNumber, each.dateKey)}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )}

          {kind === "did-not-happen" && (
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>What happens to the weeks after it</legend>
              <div className={styles.choices}>
                {(
                  [
                    ["keep", P.KEEP_PACE],
                    ["push", P.PUSH_THE_REST_BACK],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className={`${styles.choice} ${pace === value ? styles.choiceOn : ""}`}>
                    <input
                      type="radio"
                      name="column-pace"
                      className={styles.radio}
                      checked={pace === value}
                      onChange={() => setPace(value)}
                      disabled={busy}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {kind === "did-happen" && people.length > 0 && (
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>{P.WHO_WAS_THERE}</legend>
              <ul className={styles.people}>
                {people.map((each) => (
                  <li key={each.uid} className={styles.person}>
                    <span className={styles.personName} id={`did-happen-${each.uid}`}>
                      {each.name}
                    </span>
                    <div className={styles.personChoices} role="radiogroup" aria-labelledby={`did-happen-${each.uid}`}>
                      {P.DID_HAPPEN_CHOICES.map((choice) => (
                        <label key={choice.key} className={`${styles.choice} ${lines[each.uid] === choice.key ? styles.choiceOn : ""}`}>
                          <input
                            type="radio"
                            name={`did-happen-${each.uid}`}
                            className={styles.radio}
                            checked={lines[each.uid] === choice.key}
                            onChange={() => setLines((now) => ({ ...now, [each.uid]: choice.key }))}
                            disabled={busy}
                          />
                          <span>{choice.words}</span>
                        </label>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {kind && (
            <label className={styles.fieldset}>
              <span className={styles.label}>{P.WHY_NEEDED}</span>
              <textarea
                className={styles.textarea}
                value={reason}
                maxLength={P.REASON_MAX}
                rows={3}
                onChange={(event) => setReason(P.oneLine(event.target.value))}
                disabled={busy}
              />
              <span className={styles.count} aria-hidden="true">
                {P.REASON_MAX - reason.length} left
              </span>
            </label>
          )}

          {kind && (
            <section className={styles.before} aria-label={P.BEFORE_YOU_SAVE} data-testid="column-before">
              <h3 className={styles.beforeTitle}>{P.BEFORE_YOU_SAVE}</h3>
              {previewProblem ? (
                <p className={styles.error}>{previewProblem}</p>
              ) : before.length === 0 ? (
                <p className={styles.footLine}>{kind === "did-not-happen" && !pace ? "Choose keep pace or push the rest back to see what changes." : "Working it out…"}</p>
              ) : (
                <dl className={styles.fieldset}>
                  {before.map((row) => (
                    <div key={row.label} className={styles.beforeRow}>
                      <dt>{row.label}</dt>
                      <dd>{row.text}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          )}

          {kind === "did-not-happen" && preview && (
            <label className={styles.tick}>
              <input
                type="checkbox"
                className={styles.box}
                checked={tell && canTell}
                disabled={busy || !canTell}
                onChange={(event) => setTell(event.target.checked)}
              />
              <span>{canTell ? P.emailGroupWords(groupName, emails) : "Nobody can be emailed about it from here."}</span>
            </label>
          )}

          {!kind && <p className={styles.footLine}>{P.PREVIEW_WAITING}</p>}

          {problem && (
            <p className={styles.error} role="status">
              {problem}
            </p>
          )}

          <div className={styles.actions}>
            <Button onClick={() => void press()} disabled={!ready}>
              {busy ? P.SAVING : button}
            </Button>
            <Button variant="secondary" onClick={dismiss} disabled={busy}>
              {P.CANCEL}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** "w03" or "w03-2" as the week and occurrence a route takes. */
function weekOfKey(key: string): { weekNumber: number; occurrence: number } {
  const match = /^w(\d{2})(?:-(\d))?$/.exec(key);
  return { weekNumber: match ? Number(match[1]) : 0, occurrence: match?.[2] ? Number(match[2]) : 1 };
}
