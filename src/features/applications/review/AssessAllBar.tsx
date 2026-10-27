"use client";

import { useRef, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { own } from "@/lib/applications/keys";
import type { AssessmentMark, AssessmentPart } from "@/lib/applications/assessment/types";
import parts from "./parts.module.css";
import board from "./ApplicationsBoard.module.css";

/**
 * Asking Claude and Pangram about every application on a programme's list
 * that has not been read yet, for an admin.
 *
 * The browser walks the list two at a time, asking each application's own
 * route for each part, because one request has to finish inside a minute and
 * a programme's worth of reads takes several. Stop finishes the ones already
 * asked and asks no more. Nothing is decided by any of it: the marks it
 * leaves are on the list, and the reads on each application's own page.
 */

const AT_ONCE = 2;

export default function AssessAllBar({
  formApiBase,
  programmeId,
  uids,
  marks,
  configured,
  onDone,
}: {
  /** `/api/admissions/forms/<round>`. */
  formApiBase: string;
  programmeId: string;
  /** Everybody on the list who could be read: not withdrawn, not invited. */
  uids: readonly string[];
  marks: Readonly<Record<string, AssessmentMark>> | null;
  /** Which of the two this site has a key for. A part with no key is never asked. */
  configured: Readonly<Record<AssessmentPart, boolean>>;
  /** Read the marks again. */
  onDone: () => void;
}) {
  const hydrated = useHydrated();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);
  const [total, setTotal] = useState(0);
  const stop = useRef(false);

  const markOf = (uid: string) => own(marks, uid);
  const needsClaude = (uid: string) => configured.claude && !markOf(uid)?.lean;
  const needsPangram = (uid: string) => configured.pangram && (markOf(uid)?.worthALook ?? null) === null;
  const read = uids.filter((uid) => markOf(uid)?.lean).length;
  const flagged = uids.filter((uid) => (markOf(uid)?.worthALook ?? 0) > 0).length;
  const toRead = uids.filter((uid) => needsClaude(uid) || needsPangram(uid));

  const askOne = async (uid: string, part: AssessmentPart): Promise<boolean> => {
    try {
      const response = await fetch(`${formApiBase}/applications/${encodeURIComponent(uid)}/assessment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ part, programmeId }),
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const run = async () => {
    stop.current = false;
    setRunning(true);
    setDone(0);
    setFailed(0);
    setTotal(toRead.length);
    const queue = [...toRead];
    const worker = async () => {
      while (queue.length > 0 && !stop.current) {
        const uid = queue.shift()!;
        const asks: Promise<boolean>[] = [];
        if (needsClaude(uid)) asks.push(askOne(uid, "claude"));
        if (needsPangram(uid)) asks.push(askOne(uid, "pangram"));
        const results = await Promise.all(asks);
        if (results.every(Boolean)) setDone((n) => n + 1);
        else setFailed((n) => n + 1);
      }
    };
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, queue.length) }, worker));
    setRunning(false);
    onDone();
  };

  if (uids.length === 0) return null;
  if (!configured.claude && !configured.pangram) {
    return (
      <div className={board.assessBar} role="region" aria-label="Claude and Pangram">
        <p className={board.assessLine}>Claude and Pangram aren’t set up on this site yet.</p>
      </div>
    );
  }

  return (
    <div className={board.assessBar} role="region" aria-label="Claude and Pangram">
      <p className={board.assessLine}>
        {marks === null
          ? "Loading what Claude and Pangram have read…"
          : `Claude has read ${read} of ${uids.length}. Pangram thought ${flagged} worth a look.`}
      </p>
      {running ? (
        <>
          <span className={board.assessLine} role="status">
            {done + failed} of {total} done{failed > 0 ? `, ${failed} didn’t work` : ""}
          </span>
          <button type="button" className={parts.textAction} onClick={() => (stop.current = true)}>
            Stop
          </button>
        </>
      ) : toRead.length > 0 && marks !== null ? (
        <button type="button" className={parts.quiet} disabled={!hydrated} onClick={() => void run()}>
          Assess the {toRead.length === uids.length ? `${toRead.length}` : `other ${toRead.length}`}
        </button>
      ) : null}
      {!running && failed > 0 ? (
        <span className={board.assessLine}>Some didn’t work. Press again to retry them.</span>
      ) : null}
    </div>
  );
}
