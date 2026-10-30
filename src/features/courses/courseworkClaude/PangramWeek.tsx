"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { PANGRAM_WORDS } from "@/lib/courses/coursework/claudeWords";
import styles from "./CourseworkClaude.module.css";

/**
 * "Check N people with Pangram" for one week of the Coursework tab (privacy
 * v13). ADMINS ONLY: the tab draws it for an admin and never for the lead.
 * Says before the press who it will send and how many answers
 * (`GET .../coursework/pangram?week=`, which sends nothing), then sends one
 * person at a time to their own route, so each is one request and the page
 * says how far it has got. Afterwards it lists who has an answer worth a
 * look, never a verdict.
 */

type Plan = { pangram: boolean; people: Array<{ uid: string; answers: number }>; answers: number };

type Props = {
  roundId: string;
  programmeId: string;
  weekId: string;
  /** Each person's name by account, as the tab shows it. Data, not a function: the tab is drawn on the server. */
  names: Readonly<Record<string, string>>;
  /** Where a person's name links: each person's page at `<personBase>/<uid>`. */
  personBase?: string;
};

export default function PangramWeek({ roundId, programmeId, weekId, names, personBase }: Props) {
  const nameOf = (uid: string) => (Object.prototype.hasOwnProperty.call(names, uid) ? names[uid] : PANGRAM_WORDS.somebody);
  const base = `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/coursework`;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [flagged, setFlagged] = useState<Array<{ uid: string; count: number }> | null>(null);

  const load = useCallback(
    async (isCancelled: () => boolean) => {
      try {
        const res = await fetch(`${base}/pangram?week=${encodeURIComponent(weekId)}`, { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as (Plan & { error?: string }) | null;
        if (isCancelled()) return;
        if (!res.ok || !body || !Array.isArray(body.people)) {
          setProblem(body?.error ?? PANGRAM_WORDS.loadFailed);
          return;
        }
        setPlan({ pangram: body.pangram === true, people: body.people, answers: body.answers });
        setProblem(null);
      } catch {
        if (!isCancelled()) setProblem(PANGRAM_WORDS.loadFailed);
      }
    },
    [base, weekId],
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
    if (!plan) return;
    setProblem(null);
    setFlagged(null);
    const found: Array<{ uid: string; count: number }> = [];
    setProgress({ done: 0, total: plan.people.length });
    for (const [index, person] of plan.people.entries()) {
      try {
        const res = await fetch(`${base}/${encodeURIComponent(person.uid)}/pangram`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekId }),
        });
        const body = (await res.json().catch(() => null)) as {
          parts?: Array<{ weekId: string; reading: { worthALook: boolean } | null }>;
          error?: string;
        } | null;
        if (!res.ok || !body || !Array.isArray(body.parts)) {
          setProblem(PANGRAM_WORDS.stoppedAt(nameOf(person.uid), body?.error ?? PANGRAM_WORDS.failed));
          break;
        }
        const count = body.parts.filter((part) => part.weekId === weekId && part.reading?.worthALook).length;
        if (count > 0) found.push({ uid: person.uid, count });
      } catch {
        setProblem(PANGRAM_WORDS.stoppedAt(nameOf(person.uid), PANGRAM_WORDS.failed));
        break;
      }
      setProgress({ done: index + 1, total: plan.people.length });
    }
    setFlagged(found);
    setProgress(null);
  }

  return (
    <section className={styles.panel} aria-label={PANGRAM_WORDS.title}>
      <div className={styles.head}>
        <h3 className={styles.title}>{PANGRAM_WORDS.title}</h3>
        <span className={`meta ${styles.tag}`}>{PANGRAM_WORDS.whoSees}</span>
      </div>
      <p className={styles.line}>{PANGRAM_WORDS.intro}</p>
      {plan &&
        (!plan.pangram ? (
          <p className={styles.line}>{PANGRAM_WORDS.notSetUp}</p>
        ) : plan.people.length === 0 ? (
          <p className={styles.line}>{PANGRAM_WORDS.nobodyThisWeek}</p>
        ) : (
          <>
            <p className={styles.line}>{PANGRAM_WORDS.weekCount(plan.people.length, plan.answers)}</p>
            <div className={styles.row}>
              <Button type="button" variant="secondary" disabled={progress !== null} onClick={() => void onCheck()}>
                {progress ? PANGRAM_WORDS.checkingOf(progress.done, progress.total) : PANGRAM_WORDS.weekButton(plan.people.length)}
              </Button>
            </div>
          </>
        ))}
      {flagged &&
        (flagged.length === 0 ? (
          <p className={styles.line}>{PANGRAM_WORDS.noneFlagged}</p>
        ) : (
          <>
            <p className={styles.line}>{PANGRAM_WORDS.flagged(flagged.reduce((sum, person) => sum + person.count, 0))}</p>
            <ul className={styles.picks}>
              {flagged.map((person) => (
                <li key={person.uid} className={styles.pick}>
                  {personBase ? (
                    <Link href={`${personBase}/${encodeURIComponent(person.uid)}`} className={styles.name}>
                      {nameOf(person.uid)}
                    </Link>
                  ) : (
                    <span className={styles.name}>{nameOf(person.uid)}</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        ))}
      {problem && (
        <div className={styles.row}>
          <p className={styles.problem} role="alert">
            {problem}
          </p>
          {!plan && (
            <Button type="button" variant="ghost" size="sm" onClick={() => void load(() => false)}>
              {PANGRAM_WORDS.retry}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
