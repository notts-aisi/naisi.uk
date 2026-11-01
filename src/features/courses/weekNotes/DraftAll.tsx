"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { WEEK_NOTES_WORDS, listWords } from "@/lib/courses/weekNotes/words";
import styles from "./weekNotes.module.css";

/**
 * "Draft this week's notes", for an admin on a week's Notes page, once every
 * group has met. The page hands it who to draft for (everybody who submitted
 * something that may be sent, with neither a draft nor a note from this
 * week), and it sends one request per person to the draft route, three at a
 * time, so each is one request to Anthropic inside the site's own limit and
 * each draft is kept as it returns. The page says how far it has got, and is
 * drawn again on the server at the end. A second press drafts only who is
 * still without one.
 *
 * Data only from the page: the programme's ids, the week's id, and each
 * person's id and name. Nobody is emailed.
 */

type Props = {
  roundId: string;
  programmeId: string;
  weekId: string;
  plan: ReadonlyArray<{ uid: string; name: string }>;
};

/** Requests in flight at once. */
const AT_ONCE = 3;

type Outcome = { ok: true } | { ok: false; error: string; stopAll: boolean };

export default function DraftAll({ roundId, programmeId, weekId, plan }: Props) {
  const router = useRouter();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const route = `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/weeks/${encodeURIComponent(weekId)}/notes/draft`;

  async function draftOne(uid: string): Promise<Outcome> {
    try {
      const res = await fetch(route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid }) });
      if (res.ok) return { ok: true };
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      const error = body?.error ?? WEEK_NOTES_WORDS.failed;
      // Another press got there first: they have a draft or a note now.
      if (res.status === 409 && (error === WEEK_NOTES_WORDS.draftedAlready || error === WEEK_NOTES_WORDS.keptAlready)) return { ok: true };
      // Refusals every other request would meet too: the caller, the key, or the week not ready.
      const stopAll = res.status === 401 || res.status === 403 || (res.status === 409 && (error === WEEK_NOTES_WORDS.notSetUp || error.startsWith(WEEK_NOTES_WORDS.notYetLead)));
      return { ok: false, error, stopAll };
    } catch {
      return { ok: false, error: WEEK_NOTES_WORDS.loadFailed, stopAll: false };
    }
  }

  async function onPress() {
    setProblem(null);
    const total = plan.length;
    let done = 0;
    let next = 0;
    let stop = false;
    const failed: Array<{ name: string; error: string }> = [];
    setProgress({ done, total });
    const worker = async () => {
      while (!stop && next < plan.length) {
        const person = plan[next];
        next += 1;
        const outcome = await draftOne(person.uid);
        if (outcome.ok) done += 1;
        else {
          failed.push({ name: person.name, error: outcome.error });
          if (outcome.stopAll) stop = true;
        }
        setProgress({ done, total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, plan.length) }, () => worker()));
    setProgress(null);
    if (failed.length > 0) setProblem(WEEK_NOTES_WORDS.stopped(listWords(failed.map((each) => each.name)), failed[0].error));
    router.refresh();
  }

  return (
    <div className={styles.press}>
      <Button type="button" variant="primary" disabled={progress !== null} onClick={() => void onPress()}>
        {progress ? WEEK_NOTES_WORDS.drafting(progress.done, progress.total) : WEEK_NOTES_WORDS.press}
      </Button>
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
