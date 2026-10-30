"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import type { CourseworkKind } from "@/lib/courses/coursework/input";
import { BEST_WORDS, KIND_LABEL } from "@/lib/courses/coursework/claudeWords";
import styles from "./CourseworkClaude.module.css";

/**
 * CLAUDE'S BEST ANSWERS TO ONE WEEK (privacy v13), for the programme's
 * Coursework tab: an admin and the programme's lead, as the tab is. Reads
 * what Claude last found (`GET .../coursework/best-answers?week=`), which
 * sends nothing, and asks again only on the press. Says how many answers can
 * be sent and how many are not included yet, before the press. Never shows
 * anything of Pangram's: the lead reads this panel.
 */

type View = {
  claude: boolean;
  week: { weekId: string; weekNumber: number; title: string };
  result: {
    at: string;
    hard: string;
    questions: Array<{ kind: CourseworkKind; text: string; picks: Array<{ uid: string; name: string; reason: string }> }>;
  } | null;
  outOfDate: boolean;
  sendable: number;
  notIncluded: number;
};

type Props = {
  roundId: string;
  programmeId: string;
  weekId: string;
  /** Where a person's name links: their page on the programme. */
  personHref?: (uid: string) => string;
};

function readView(body: unknown): View | null {
  const raw = body as Partial<View> | null;
  if (!raw || typeof raw !== "object" || !raw.week || typeof raw.sendable !== "number") return null;
  return raw as View;
}

export default function BestAnswersPanel({ roundId, programmeId, weekId, personHref }: Props) {
  const url = `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/coursework/best-answers`;
  const [view, setView] = useState<View | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const load = useCallback(
    async (isCancelled: () => boolean) => {
      try {
        const res = await fetch(`${url}?week=${encodeURIComponent(weekId)}`, { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (isCancelled()) return;
        const read = res.ok ? readView(body) : null;
        if (!read) {
          setProblem((body as { error?: string } | null)?.error ?? BEST_WORDS.loadFailed);
          return;
        }
        setView(read);
        setProblem(null);
      } catch {
        if (!isCancelled()) setProblem(BEST_WORDS.loadFailed);
      }
    },
    [url, weekId],
  );

  useEffect(() => {
    // The page can be left while the request is in flight, so the result is
    // dropped rather than written into an unmounted component.
    let cancelled = false;
    void (async () => {
      await load(() => cancelled);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function onAsk() {
    setAsking(true);
    setProblem(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekId }),
      });
      const body = await res.json().catch(() => null);
      const read = res.ok ? readView(body) : null;
      if (!read) {
        setProblem((body as { error?: string } | null)?.error ?? BEST_WORDS.failed);
        return;
      }
      setView(read);
    } catch {
      setProblem(BEST_WORDS.failed);
    } finally {
      setAsking(false);
    }
  }

  return (
    <section className={styles.panel} aria-label={BEST_WORDS.title}>
      <div className={styles.head}>
        <h3 className={styles.title}>{BEST_WORDS.title}</h3>
        <span className={`meta ${styles.tag}`}>{BEST_WORDS.whoSees}</span>
      </div>
      <p className={styles.line}>{BEST_WORDS.intro}</p>

      {view && !view.claude && <p className={styles.line}>{BEST_WORDS.notSetUp}</p>}

      {view && view.claude && (
        <>
          <p className={styles.line}>
            {BEST_WORDS.sendable(view.sendable)}
            {view.notIncluded > 0 ? ` ${BEST_WORDS.notIncluded(view.notIncluded)}` : ""}
          </p>
          {view.sendable === 0 ? (
            <p className={styles.line}>{BEST_WORDS.nothingToSend}</p>
          ) : (
            <div className={styles.row}>
              <Button type="button" variant="secondary" disabled={asking} onClick={() => void onAsk()}>
                {asking ? BEST_WORDS.asking : view.result ? BEST_WORDS.again : BEST_WORDS.button}
              </Button>
            </div>
          )}
        </>
      )}

      {view?.result && (
        <div className={styles.result}>
          {view.outOfDate && <p className={styles.warning}>{BEST_WORDS.outOfDate}</p>}
          {view.result.at && (
            <p className={styles.line}>
              {BEST_WORDS.asked(formatSiteDate(new Date(view.result.at), { weekday: "short", day: "numeric", month: "short" }))}
            </p>
          )}
          <ol className={styles.questions}>
            {view.result.questions.map((question, index) => (
              <li key={index} className={styles.question}>
                <p className={`meta ${styles.kind}`}>{KIND_LABEL[question.kind]}</p>
                <p className={styles.questionText}>{question.text}</p>
                {question.picks.length === 0 ? (
                  <p className={styles.line}>{BEST_WORDS.none}</p>
                ) : (
                  <ul className={styles.picks}>
                    {question.picks.map((pick) => (
                      <li key={pick.uid} className={styles.pick}>
                        {personHref ? (
                          <Link href={personHref(pick.uid)} className={styles.name}>
                            {pick.name}
                          </Link>
                        ) : (
                          <span className={styles.name}>{pick.name}</span>
                        )}
                        <span className={styles.reason}>{pick.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          {view.result.hard && (
            <div className={styles.hard}>
              <p className={`meta ${styles.kind}`}>{BEST_WORDS.hard}</p>
              <p className={styles.reason}>{view.result.hard}</p>
            </div>
          )}
        </div>
      )}

      {problem && (
        <div className={styles.row}>
          <p className={styles.problem} role="alert">
            {problem}
          </p>
          {!view && (
            <Button type="button" variant="ghost" size="sm" onClick={() => void load(() => false)}>
              {BEST_WORDS.retry}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
