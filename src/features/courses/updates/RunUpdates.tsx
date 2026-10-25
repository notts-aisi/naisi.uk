"use client";

import { useEffect, useState } from "react";
import { SHOW_OLDER, UPDATES_HEADING, UPDATES_SHOWN_FIRST, NO_UPDATES_YET } from "@/lib/courses/updates/words";
import { ReaderUpdateItem, type ReaderUpdate } from "./UpdatesList";
import styles from "./Updates.module.css";

/**
 * "Updates" on a programme's page (wk-programme): what the people running it
 * wrote to the reader, newest first. Its own component, read by its own
 * route (`GET /api/courses/runs/[runId]/updates`), so the run home's one
 * overview fetch is unchanged and another card can sit beside it without
 * either touching the other.
 *
 * The route decides which updates the reader is shown and answers with the
 * fields drawn here and nothing else. A reader who is shown nothing at all
 * (the route's 403) is drawn nothing.
 *
 * The newest `UPDATES_SHOWN_FIRST` are shown, then "Show older updates",
 * which shows the rest.
 */

type State =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "failed" }
  | { kind: "ready"; updates: ReaderUpdate[] };

function isReaderUpdate(value: unknown): value is ReaderUpdate {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return ["id", "title", "message", "authorUid", "authorName", "authorFirst", "toWords", "postedOn"].every(
    (key) => typeof v[key] === "string",
  );
}

export default function RunUpdates({ runId }: { runId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [showAll, setShowAll] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Same-origin: the session cookie goes with it.
    fetch(`/api/courses/runs/${encodeURIComponent(runId)}/updates`)
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) return { kind: "none" } as const;
        const body = (await res.json().catch(() => null)) as { updates?: unknown } | null;
        if (!res.ok || !body || !Array.isArray(body.updates)) return { kind: "failed" } as const;
        return { kind: "ready", updates: body.updates.filter(isReaderUpdate) } as const;
      })
      .catch(() => ({ kind: "failed" }) as const)
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [runId, attempt]);

  if (state.kind === "loading" || state.kind === "none") return null;

  if (state.kind === "failed") {
    return (
      <section className={styles.card} aria-labelledby="run-updates-heading">
        <h2 className={styles.heading} id="run-updates-heading">
          {UPDATES_HEADING}
        </h2>
        <p className={styles.problem}>
          The updates didn’t load.
          <button type="button" className={styles.olderButton} onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      </section>
    );
  }

  const { updates } = state;
  const shown = showAll ? updates : updates.slice(0, UPDATES_SHOWN_FIRST);
  return (
    <section className={styles.card} aria-labelledby="run-updates-heading">
      <h2 className={styles.heading} id="run-updates-heading">
        {UPDATES_HEADING}
      </h2>
      {updates.length === 0 ? (
        <p className={styles.empty}>{NO_UPDATES_YET}</p>
      ) : (
        shown.map((update) => <ReaderUpdateItem key={update.id} update={update} />)
      )}
      {!showAll && updates.length > UPDATES_SHOWN_FIRST && (
        <div className={styles.older}>
          <button type="button" className={styles.olderButton} onClick={() => setShowAll(true)}>
            {SHOW_OLDER}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}
