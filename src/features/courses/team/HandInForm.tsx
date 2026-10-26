"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { tilePartsOfDay } from "@/app/(app)/dashboard/homeWords";
import { useHydrated } from "@/hooks/useHydrated";
import { TEAM_PAGE_LIMITS, countWords, httpsAddressProblem } from "@/lib/courses/teamPage/model";
import type { HandInPageView } from "@/lib/courses/teamPage/views";
import {
  HANDED_IN_NOW,
  HAND_IN_FOR_THE_TEAM,
  LINK_HINT,
  LINK_PLACEHOLDER,
  LINK_TO_YOUR_WORK,
  NOT_SAVED,
  OFFLINE,
  OPTIONAL,
  SAVING,
  SUMMARY,
  WHO_DID_WHAT,
  summaryCountWords,
} from "@/lib/courses/teamPage/words";
import styles from "./team.module.css";

/**
 * THE HAND-IN'S FORM (board en-handin-phone): the link, the summary with
 * its word count, who did what, the showcase's date card, and at the foot,
 * resting on the screen's bottom bar, "I’ve shared this with George and
 * Lily", "Hand in for the team" and until when it can change.
 *
 * Uncontrolled boxes, so what is typed before the script arrives is kept;
 * the button waits for the script (`useHydrated`). The count is the words in
 * the box as typed; the route counts again and refuses past the limit. Once
 * the deadline has passed, or the programme has ended, the boxes are read
 * only and the foot says why.
 */

function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export default function HandInForm({ view }: { view: HandInPageView }) {
  const id = useId();
  const hydrated = useHydrated();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [words, setWords] = useState(() => countWords(view.summary));
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const over = words > view.summaryWords;
  const tile = view.showcase ? tilePartsOfDay(view.showcase.dateKey) : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.current || busy || !view.open) return;
    const data = new FormData(form.current);
    const url = String(data.get("url") ?? "");
    const shared = data.get("shared") === "yes";
    setSaid(null);
    setProblem(null);
    // Said here first, in the route's own words, so a press with nothing to send asks for it.
    const addressProblem = httpsAddressProblem(url);
    if (addressProblem) return setProblem(addressProblem);
    if (view.shareLabel && !shared) return setProblem(view.tickFirst);
    setBusy(true);
    try {
      const response = await fetch(`/api/courses/runs/${encodeURIComponent(view.runId)}/team/hand-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          summary: String(data.get("summary") ?? ""),
          whoDidWhat: String(data.get("whoDidWhat") ?? ""),
          shared,
        }),
      });
      const answer = (await response.json().catch(() => ({}))) as { error?: unknown };
      if (response.ok) {
        setSaid(HANDED_IN_NOW);
        router.refresh();
      } else {
        setProblem(typeof answer.error === "string" ? answer.error : NOT_SAVED);
      }
    } catch {
      setProblem(OFFLINE);
    }
    setBusy(false);
  }

  return (
    <form ref={form} onSubmit={submit} noValidate>
      <div className={styles.handInBody}>
        <div>
          <label htmlFor={`${id}-url`} className={styles.label}>
            {LINK_TO_YOUR_WORK}
          </label>
          <input
            id={`${id}-url`}
            name="url"
            type="url"
            inputMode="url"
            className={styles.input}
            placeholder={LINK_PLACEHOLDER}
            defaultValue={view.url}
            maxLength={TEAM_PAGE_LIMITS.url}
            autoComplete="off"
            disabled={!view.open}
            aria-describedby={`${id}-url-hint`}
          />
          <p id={`${id}-url-hint`} className={styles.hint}>
            {LINK_HINT}
          </p>
        </div>

        <div>
          <label htmlFor={`${id}-summary`} className={styles.label}>
            {SUMMARY}
          </label>
          <textarea
            id={`${id}-summary`}
            name="summary"
            rows={6}
            className={styles.textarea}
            defaultValue={view.summary}
            maxLength={TEAM_PAGE_LIMITS.summary}
            disabled={!view.open}
            aria-describedby={`${id}-count`}
            onInput={(event) => setWords(countWords(event.currentTarget.value))}
          />
          <div className={styles.counter}>
            <span id={`${id}-count`} className={over ? styles.counterOver : undefined}>
              {summaryCountWords(words, view.summaryWords)}
            </span>
          </div>
        </div>

        <div>
          <label htmlFor={`${id}-who`} className={styles.label}>
            {WHO_DID_WHAT} <span className={styles.optional}>{OPTIONAL}</span>
          </label>
          <textarea
            id={`${id}-who`}
            name="whoDidWhat"
            rows={3}
            className={styles.textarea}
            defaultValue={view.whoDidWhat}
            maxLength={TEAM_PAGE_LIMITS.whoDidWhat}
            disabled={!view.open}
          />
        </div>

        {view.showcase && tile ? (
          <div className={styles.showcase}>
            <time className={styles.showcaseStub} dateTime={view.showcase.dateKey}>
              <span className={styles.stubWeekday}>{tile.weekday}</span>
              <span className={styles.stubDay}>{tile.day}</span>
              <span className={styles.stubMonth}>{tile.month}</span>
            </time>
            <div className={styles.showcaseBody}>
              <p className={styles.showcaseLine}>{view.showcase.line}</p>
              <p className={styles.showcaseWhere}>{view.showcase.where}</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.handInFoot}>
        {view.open ? (
          <>
            {view.shareLabel ? (
              <label className={styles.tickRow}>
                <input type="checkbox" name="shared" value="yes" className={styles.tickInput} />
                <span className={styles.tickBox} aria-hidden="true">
                  <Tick />
                </span>
                <span className={styles.tickText}>{view.shareLabel}</span>
              </label>
            ) : null}
            <button type="submit" className={styles.primary} disabled={!hydrated || busy}>
              {busy ? SAVING : HAND_IN_FOR_THE_TEAM}
            </button>
            {view.untilLine ? <p className={styles.footLine}>{view.untilLine}</p> : null}
          </>
        ) : view.closedLine ? (
          <p className={styles.footLine}>{view.closedLine}</p>
        ) : null}
        {said ? (
          <p className={styles.said} role="status">
            {said}
          </p>
        ) : null}
        {problem ? (
          <p className={styles.problem} role="alert">
            {problem}
          </p>
        ) : null}
      </div>
    </form>
  );
}
