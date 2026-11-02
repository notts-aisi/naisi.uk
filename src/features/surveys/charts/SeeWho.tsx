"use client";

import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { CHART_WORDS, namesOffCountWords } from "@/lib/surveys/words";
import bars from "../lead/analysis.module.css";
import styles from "./charts.module.css";

/** The filters on the screen, which every press carries so it opens the people the bar was counted from. */
export type WhoChoice = { who: string; as: string; beforeFirstSession: boolean };

type State =
  /** `opened` is the line that stays once names have been hidden: "Opened by Zach, Sat 21 Nov". */
  | { kind: "closed"; opened: string }
  | { kind: "opening" }
  | { kind: "open"; names: string[]; namesOff: number; opened: string }
  | { kind: "refused"; error: string };

/**
 * "SEE WHO (7)" BEHIND A BAR, OR "WHOSE IS THIS?" BESIDE A COMMENT, for an
 * admin. Nothing is asked until the admin presses it: then the
 * route records the opening before it reads a name, and refuses whole when it
 * cannot. The names show here, to the admin who opened them, until they are
 * hidden or the page is left; what stays is the line saying who opened them
 * and when. Nothing about the opening is kept on the page for anybody else.
 *
 * `layout`: under a bar the button sits in the bar's last column and the
 * names open the whole width of the row beneath it; beside a comment both sit
 * at the comment's end.
 */
export default function SeeWho({
  surveyId,
  question,
  target,
  choice,
  label,
  ariaLabel,
  layout,
}: {
  surveyId: string;
  question: string;
  /** A bar's key with the count on its button, or the key of the answer a comment came from. */
  target: { bar: string; count: number } | { comment: string };
  choice: WhoChoice;
  label: string;
  ariaLabel: string;
  layout: "bar" | "comment";
}) {
  const hydrated = useHydrated();
  const [state, setState] = useState<State>({ kind: "closed", opened: "" });

  async function open() {
    setState({ kind: "opening" });
    try {
      const response = await fetch(`/api/surveys/${encodeURIComponent(surveyId)}/who`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ question, ...target, who: choice.who, as: choice.as, beforeFirstSession: choice.beforeFirstSession }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        who?: { names: string[]; namesOff: number; opened: string };
        error?: string;
      };
      if (response.ok && body.who) {
        setState({ kind: "open", names: body.who.names, namesOff: body.who.namesOff, opened: body.who.opened });
        return;
      }
      setState({ kind: "refused", error: body.error ?? CHART_WORDS.notRecorded });
    } catch {
      setState({ kind: "refused", error: CHART_WORDS.failed });
    }
  }

  const button =
    state.kind === "open" ? (
      <button type="button" className={styles.action} onClick={() => setState({ kind: "closed", opened: state.opened })}>
        {CHART_WORDS.hide}
      </button>
    ) : (
      <button type="button" className={styles.action} onClick={() => void open()} disabled={!hydrated || state.kind === "opening"} aria-label={ariaLabel}>
        {state.kind === "opening" ? CHART_WORDS.opening : label}
      </button>
    );

  let shown = null;
  if (state.kind === "open") {
    shown = (
      <div className={styles.names} role="status">
        <ul className={styles.nameList}>
          {state.names.map((name, at) => (
            <li key={at}>{name}</li>
          ))}
        </ul>
        {state.namesOff > 0 && <p className={styles.namesOff}>{namesOffCountWords(state.namesOff)}</p>}
        <p className={styles.opened}>{state.opened}</p>
      </div>
    );
  } else if (state.kind === "closed" && state.opened) {
    shown = <p className={styles.opened}>{state.opened}</p>;
  } else if (state.kind === "refused") {
    shown = (
      <p className={styles.refused} role="alert">
        {state.error}
      </p>
    );
  }

  if (layout === "comment") {
    return (
      <div className={styles.whose}>
        {button}
        {shown}
      </div>
    );
  }
  return (
    <>
      <span className={bars.barReports}>{button}</span>
      {shown && <div className={styles.under}>{shown}</div>}
    </>
  );
}
