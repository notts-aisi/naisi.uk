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
  /** A person's name, as the tab shows it. */
  nameOf: (uid: string) => string;
  /** Where a person's name links: their page on the programme. */
  personHref?: (uid: string) => string;
};

export default function PangramWeek({ roundId, programmeId, weekId, nameOf, personHref }: Props) {
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

  if (!plan) {
    return problem ? (
      <p className={styles.problem} role="alert">
        {problem}
      </p>
    ) : null;
  }

  return (
    <div className={styles.week}>
      {!plan.pangram ? (
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
      )}
      {flagged &&
        (flagged.length === 0 ? (
          <p className={styles.line}>{PANGRAM_WORDS.noneFlagged}</p>
        ) : (
          <>
            <p className={styles.line}>{PANGRAM_WORDS.flagged(flagged.reduce((sum, person) => sum + person.count, 0))}</p>
            <ul className={styles.picks}>
              {flagged.map((person) => (
                <li key={person.uid} className={styles.pick}>
                  {personHref ? (
                    <Link href={personHref(person.uid)} className={styles.name}>
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
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
