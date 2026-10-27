"use client";

import Link from "next/link";
import { useState } from "react";
import MemberText from "@/components/ui/MemberText";
import { useHydrated } from "@/hooks/useHydrated";
import type { OverviewEntryView, ProgrammeOverviewView } from "@/lib/applications/assessment/types";
import board from "./ApplicationsBoard.module.css";
import parts from "./parts.module.css";

/**
 * Claude across a whole programme, for an admin, under "Assess the rest".
 *
 * Compare asks for a comparison of every application Claude has read on this
 * list; the box asks one question about them. Both answers live on this page
 * and nowhere else: nothing is stored, so a reload starts clean. Each person
 * the comparison names links to their application.
 */

type Answered = { question: string; answer: string };

const QUESTION_LIMIT = 1_000;

function People({
  title,
  entries,
  listPath,
}: {
  title: string;
  entries: OverviewEntryView[];
  listPath: string;
}) {
  if (entries.length === 0) return null;
  return (
    <div className={board.claudePart}>
      <div className={board.claudePartTitle}>
        {title} ({entries.length})
      </div>
      <ul className={board.claudeList}>
        {entries.map((entry, i) => (
          <li key={`${entry.uid ?? entry.name}:${i}`}>
            {entry.uid ? (
              <Link href={`${listPath}/${entry.uid}`} className={board.claudeName}>
                {entry.name}
              </Link>
            ) : (
              <span className={board.claudeName}>{entry.name}</span>
            )}
            {entry.programme ? <span className={board.claudeAside}> · {entry.programme}</span> : null}
            <span className={board.claudeWhy}> {entry.why}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ProgrammeClaude({
  askPath,
  listPath,
  read,
  total,
}: {
  /** The programme's assessments route, which takes the POST. */
  askPath: string;
  /** The list's own address, which each application's page hangs off. */
  listPath: string;
  /** How many applications on the list Claude has read, and how many there are. */
  read: number;
  total: number;
}) {
  const hydrated = useHydrated();
  const [overview, setOverview] = useState<ProgrammeOverviewView | null>(null);
  const [comparing, setComparing] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answers, setAnswers] = useState<Answered[]>([]);
  const [error, setError] = useState<string | null>(null);

  const post = async (body: unknown) => {
    const response = await fetch(askPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as {
      overview?: ProgrammeOverviewView;
      answer?: string;
      question?: string;
      error?: unknown;
    };
    if (!response.ok) {
      throw new Error(typeof data.error === "string" && data.error ? data.error : "That didn’t work. Try again.");
    }
    return data;
  };

  const compare = async () => {
    setComparing(true);
    setError(null);
    try {
      const data = await post({ kind: "overview" });
      if (data.overview) setOverview(data.overview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setComparing(false);
    }
  };

  const ask = async () => {
    const text = question.trim();
    if (!text) return;
    setAsking(true);
    setError(null);
    try {
      const data = await post({ kind: "question", question: text });
      if (typeof data.answer === "string") {
        setAnswers((now) => [{ question: text, answer: data.answer as string }, ...now]);
        setQuestion("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setAsking(false);
    }
  };

  const nothingRead = read === 0;

  return (
    <section className={board.claudePanel} aria-label="Ask Claude about this programme">
      <div className={board.assessBar}>
        <button
          type="button"
          className={parts.quiet}
          disabled={!hydrated || comparing || nothingRead}
          onClick={() => void compare()}
        >
          {comparing ? "Comparing…" : overview ? "Compare again" : "Compare them"}
        </button>
        <span className={board.assessLine}>
          {nothingRead
            ? "Assess them first: Claude compares the applications it has read."
            : comparing
              ? "Claude is reading every application together. This can take a minute or two."
              : read < total
                ? `Compares the ${read} Claude has read. Assess the other ${total - read} first to include them.`
                : `Compares all ${total}. Only you see it, and it isn’t kept.`}
        </span>
      </div>

      {overview ? (
        <div className={board.claudeOverview} aria-live="polite">
          <MemberText text={overview.overall} className={board.claudeText} />
          <People title="Shortlist" entries={overview.shortlist} listPath={listPath} />
          <People title="Borderline" entries={overview.borderline} listPath={listPath} />
          <People title="Worth a second look" entries={overview.secondLook} listPath={listPath} />
          <People title="Not this time" entries={overview.notThisTime} listPath={listPath} />
          <People title="Might suit another programme" entries={overview.elsewhere} listPath={listPath} />
          <p className={board.assessLine}>
            Claude’s comparison of {overview.read} of {overview.total}. A reading aid: you decide.
          </p>
        </div>
      ) : null}

      <div className={board.claudeAsk}>
        <label className={board.claudePartTitle} htmlFor="claude-programme-question">
          Ask about this programme
        </label>
        <textarea
          id="claude-programme-question"
          className={board.claudeQuestion}
          rows={2}
          maxLength={QUESTION_LIMIT}
          value={question}
          disabled={nothingRead}
          placeholder="Who would make good facilitators? How do the two strongest compare?"
          onChange={(event) => setQuestion(event.target.value)}
        />
        <div className={board.assessBar}>
          <button
            type="button"
            className={parts.quiet}
            disabled={!hydrated || asking || nothingRead || !question.trim()}
            onClick={() => void ask()}
          >
            {asking ? "Asking…" : "Ask Claude"}
          </button>
          <span className={board.assessLine}>Names you type are swapped for labels before they’re sent.</span>
        </div>
      </div>

      {error ? (
        <p className={board.noticeError} role="alert">
          {error}
        </p>
      ) : null}

      {answers.map((entry, i) => (
        <div key={`${answers.length - i}`} className={board.claudeAnswer}>
          <div className={board.claudePartTitle}>{entry.question}</div>
          <MemberText text={entry.answer} className={board.claudeText} />
        </div>
      ))}
    </section>
  );
}
