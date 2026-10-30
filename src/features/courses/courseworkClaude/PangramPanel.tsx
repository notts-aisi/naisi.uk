"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import type { CourseworkKind } from "@/lib/courses/coursework/input";
import { KIND_LABEL, PANGRAM_WORDS } from "@/lib/courses/coursework/claudeWords";
import styles from "./CourseworkClaude.module.css";

/**
 * PANGRAM ON ONE PERSON'S COURSEWORK (privacy v13), for the person page on a
 * programme's Coursework tab. ADMINS ONLY: the page draws this for an admin
 * and never for the lead, and the route refuses the lead too. Reads what was
 * found (`GET .../coursework/[uid]/pangram`), which sends nothing; "Check
 * with Pangram" sends their counted answers of 50 words or more in one
 * request. A flag reads "worth a look", never a verdict.
 */

type Part = {
  rowId: string;
  weekId: string;
  weekNumber: number;
  kind: CourseworkKind;
  question: string;
  words: number;
  reading: { label: string; headline: string; worthALook: boolean; at: string } | null;
  outOfDate: boolean;
};

type View = { pangram: boolean; parts: Part[]; tooShort: number; notCounted: number };

type Props = { roundId: string; programmeId: string; uid: string };

const day = (iso: string) => formatSiteDate(new Date(iso), { weekday: "short", day: "numeric", month: "short" });

function readView(body: unknown): View | null {
  const raw = body as Partial<View> | null;
  return raw && Array.isArray(raw.parts) ? (raw as View) : null;
}

export default function PangramPanel({ roundId, programmeId, uid }: Props) {
  const url = `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/coursework/${encodeURIComponent(uid)}/pangram`;
  const [view, setView] = useState<View | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(
    async (isCancelled: () => boolean) => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (isCancelled()) return;
        const read = res.ok ? readView(body) : null;
        if (!read) {
          setProblem((body as { error?: string } | null)?.error ?? PANGRAM_WORDS.loadFailed);
          return;
        }
        setView(read);
        setProblem(null);
      } catch {
        if (!isCancelled()) setProblem(PANGRAM_WORDS.loadFailed);
      }
    },
    [url],
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

  async function onCheck() {
    setChecking(true);
    setProblem(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const body = await res.json().catch(() => null);
      const read = res.ok ? readView(body) : null;
      if (!read) {
        setProblem((body as { error?: string } | null)?.error ?? PANGRAM_WORDS.failed);
        return;
      }
      setView(read);
    } catch {
      setProblem(PANGRAM_WORDS.failed);
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className={styles.panel} aria-label={PANGRAM_WORDS.title}>
      <div className={styles.head}>
        <h3 className={styles.title}>{PANGRAM_WORDS.title}</h3>
        <span className={`meta ${styles.tag}`}>{PANGRAM_WORDS.whoSees}</span>
      </div>
      <p className={styles.line}>{PANGRAM_WORDS.intro}</p>

      {view && !view.pangram && <p className={styles.line}>{PANGRAM_WORDS.notSetUp}</p>}

      {view && (
        <>
          {view.parts.length > 0 && (
            <ul className={styles.parts}>
              {view.parts.map((part) => (
                <li key={part.rowId} className={styles.part}>
                  <p className={`meta ${styles.kind}`}>
                    {PANGRAM_WORDS.week(part.weekNumber)}, {KIND_LABEL[part.kind]}, {PANGRAM_WORDS.words(part.words)}
                  </p>
                  {part.question && <p className={styles.questionText}>{part.question}</p>}
                  <div className={styles.row}>
                    {part.reading ? (
                      <Chip tone={part.reading.worthALook ? "warning" : "neutral"} size="sm">
                        {part.reading.worthALook ? PANGRAM_WORDS.worthALook : PANGRAM_WORDS.noFlag}
                      </Chip>
                    ) : (
                      <span className={styles.line}>{PANGRAM_WORDS.notChecked}</span>
                    )}
                    {part.reading?.at && <span className={styles.line}>{PANGRAM_WORDS.checked(day(part.reading.at))}</span>}
                    {part.outOfDate && <span className={styles.line}>{PANGRAM_WORDS.outOfDate}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {view.tooShort > 0 && <p className={styles.line}>{PANGRAM_WORDS.tooShort(view.tooShort)}</p>}
          {view.notCounted > 0 && <p className={styles.line}>{PANGRAM_WORDS.notCounted(view.notCounted)}</p>}
          {view.pangram &&
            (view.parts.length === 0 ? (
              <p className={styles.line}>{PANGRAM_WORDS.nothingToSend}</p>
            ) : (
              <div className={styles.row}>
                <Button type="button" variant="secondary" disabled={checking} onClick={() => void onCheck()}>
                  {checking ? PANGRAM_WORDS.checking : PANGRAM_WORDS.personButton}
                </Button>
              </div>
            ))}
        </>
      )}

      {problem && (
        <div className={styles.row}>
          <p className={styles.problem} role="alert">
            {problem}
          </p>
          {!view && (
            <Button type="button" variant="ghost" size="sm" onClick={() => void load(() => false)}>
              {PANGRAM_WORDS.retry}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
