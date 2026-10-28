"use client";

import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { decisionsFor, type HeldBy } from "@/lib/applications/intake/advice";
import type { PlacementChoice, PlacementView } from "@/lib/applications/intake/placement";
import styles from "./PlacementBox.module.css";

/**
 * ONE PERSON'S PLACEMENT, for an admin: the same box beside their application
 * whichever programme it is opened from, and on the Placements list
 * (`src/lib/applications/intake/placement.ts` is its one source of truth).
 *
 * Their choices in their order, each with its decision so far and who made
 * it, Claude's lean and the committee's score; "No place"; where the
 * decisions place them now (highlighted); and the plan's suggestion (marked).
 * Picking another and pressing Place writes the decisions that make it so,
 * as the admin. A pick that changes somebody else's decision says whose
 * first. Nobody is emailed.
 */

const NONE = "__none__";

type Props = {
  /** The form's API address, `/api/admissions/forms/{roundId}`. */
  apiBase: string;
  view: PlacementView;
  /** On the Placements list: the name, linking to the application, heads the box. */
  compact?: boolean;
  onPlaced?: (view: PlacementView) => void;
};

function standingWords(choice: PlacementChoice): string {
  const by = choice.by ? ` by ${choice.by}` : "";
  switch (choice.standing) {
    case "accepted":
      return `Accepted${by}`;
    case "pooled":
      return `Pooled${by}`;
    case "declined":
      return `Declined${by}`;
    default:
      return "Not decided";
  }
}

function overrideWords(held: HeldBy, choices: readonly PlacementChoice[]): string {
  const choice = choices.find((each) => each.programmeId === held.programmeId);
  const name = choice?.shortName ?? "another programme";
  const who = choice?.by ?? "somebody";
  return held.standing === "accepted"
    ? `This pools them on ${name}, which ${who} accepted.`
    : `This accepts them on ${name}, which ${who} ${held.standing}.`;
}

export default function PlacementBox({ apiBase, view: initial, compact = false, onPlaced }: Props) {
  const hydrated = useHydrated();
  const [view, setView] = useState(initial);
  const current = view.now.kind === "placed" ? view.now.programmeId : view.now.kind === "no-place" ? NONE : null;
  const [picked, setPicked] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // A new view from the list (a fill, a fresh plan) replaces what this box holds.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setView(initial);
    setPicked(initial.now.kind === "placed" ? initial.now.programmeId : initial.now.kind === "no-place" ? NONE : null);
  }

  const suggested = view.suggestion ? (view.suggestion.programmeId ?? NONE) : null;
  const nameOf = (id: string) => (id === NONE ? "No place" : (view.choices.find((c) => c.programmeId === id)?.shortName ?? ""));
  const target = picked === NONE ? null : picked;
  const changing = picked !== null && picked !== current;
  const steps = changing
    ? decisionsFor(
        {
          ranked: view.choices.map((c) => c.programmeId),
          on: Object.fromEntries(view.choices.map((c) => [c.programmeId, { standing: c.standing }])),
        },
        target,
        true,
      )
    : null;

  const place = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const response = await fetch(
        `${apiBase}/applications/${encodeURIComponent(view.uid)}/placement`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ programmeId: target }) },
      );
      const data = (await response.json().catch(() => ({}))) as { placement?: PlacementView; error?: string };
      if (!response.ok || !data.placement) {
        setError(data.error ?? `It answered ${response.status}.`);
        return;
      }
      setView(data.placement);
      setSeen(initial);
      setPicked(data.placement.now.kind === "placed" ? data.placement.now.programmeId : data.placement.now.kind === "no-place" ? NONE : null);
      setDone(`Placed: ${nameOf(picked ?? NONE)}. Nobody has been emailed.`);
      onPlaced?.(data.placement);
    } catch {
      setError("That couldn’t be sent. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const option = (id: string, title: string, lines: string[]) => {
    const isNow = id === current;
    const isSuggested = id === suggested;
    const isPicked = id === picked;
    return (
      <button
        key={id}
        type="button"
        role="radio"
        aria-checked={isPicked}
        className={[styles.option, isNow ? styles.now : "", isPicked ? styles.picked : ""].filter(Boolean).join(" ")}
        disabled={!hydrated || busy}
        onClick={() => {
          setPicked(id);
          setError(null);
          setDone(null);
        }}
      >
        <span className={styles.optionHead}>
          <span className={styles.optionName}>{title}</span>
          {isNow ? <span className={styles.badgeNow}>Now</span> : null}
          {isSuggested ? (
            <span className={styles.badgeSuggested}>{view.suggestion?.source === "claude" ? "Claude" : "Draft"}</span>
          ) : null}
        </span>
        {lines.filter(Boolean).map((line, i) => (
          <span key={i} className={styles.optionLine}>
            {line}
          </span>
        ))}
      </button>
    );
  };

  const flags =
    view.flags === null
      ? view.read.pangram
        ? null
        : "Pangram: not checked"
      : view.flags === 0
        ? "Pangram: nothing flagged"
        : `Pangram: ${view.flags} worth a look`;

  return (
    <section className={styles.box} aria-label={`Placement for ${view.name}`}>
      <div className={styles.head}>
        {compact ? (
          <a className={styles.name} href={view.href} target="_blank" rel="noreferrer">
            {view.name}
          </a>
        ) : (
          <span className={styles.title}>Placement</span>
        )}
        {flags ? <span className={view.flags ? styles.flagged : styles.quiet}>{flags}</span> : null}
      </div>

      <div className={styles.options} role="radiogroup" aria-label={`Where ${view.name} goes`}>
        {view.choices.map((choice, i) =>
          option(choice.programmeId, `${i + 1}. ${choice.shortName}`, [
            standingWords(choice),
            [
              choice.lean ? `Claude: ${choice.lean}` : "",
              choice.score !== null ? `score ${choice.score.toFixed(1)}` : "",
              choice.facilitates ? "would facilitate" : "",
            ]
              .filter(Boolean)
              .join(" · "),
          ]),
        )}
        {option(NONE, "No place", [view.now.kind === "no-place" ? "Every programme pooled or declined them" : ""])}
      </div>

      {view.now.kind === "open" ? <p className={styles.line}>A decision is still owed, so they aren’t placed yet.</p> : null}
      {view.suggestion ? (
        <p className={styles.line}>
          {view.suggestion.source === "claude" ? "Claude suggests" : "The draft suggests"} {nameOf(view.suggestion.programmeId ?? NONE)}
          {view.suggestion.why ? `: ${view.suggestion.why}` : "."}
        </p>
      ) : null}

      {changing && steps ? (
        <div className={styles.confirm}>
          {steps.overrides.map((held) => (
            <p key={held.programmeId} className={styles.warn}>
              {overrideWords(held, view.choices)}
            </p>
          ))}
          <button type="button" className={styles.place} disabled={!hydrated || busy} onClick={() => void place()}>
            {busy ? "Placing…" : picked === NONE ? "Give no place" : `Place on ${nameOf(picked!)}`}
          </button>
        </div>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className={styles.line} role="status">
          {done}
        </p>
      ) : null}
    </section>
  );
}
