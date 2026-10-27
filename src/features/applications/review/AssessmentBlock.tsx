"use client";

import { useEffect, useState } from "react";
import MemberText from "@/components/ui/MemberText";
import kit from "@/features/applications/kit/kit.module.css";
import { useHydrated } from "@/hooks/useHydrated";
import type { AssessmentPart, AssessmentView, Lean } from "@/lib/applications/assessment/types";
import { Chip, type ChipTone } from "./parts";
import parts from "./parts.module.css";
import screen from "./ReviewScreen.module.css";
import styles from "./AssessmentBlock.module.css";

/**
 * Claude's read and Pangram's check of one application, for an admin.
 *
 * A reading aid beside the decision, never a decision: it fills in nothing,
 * and its first line says so. What has already been made of the application
 * is fetched when the block opens; asking again is a button, because asking
 * sends the answers and the reviews, with no names, to Anthropic and Pangram
 * (`src/lib/applications/assessment/run.ts`).
 *
 * The two parts are asked for side by side and land on their own, because
 * Claude's takes most of a minute and Pangram's a few seconds.
 *
 * Keyed by applicant and programme on the screen, so the next application
 * never shows the last one's.
 */

const LEAN_WORDS: Record<Lean, { text: string; tone: ChipTone }> = {
  strong: { text: "Strong", tone: "ok" },
  borderline: { text: "Borderline", tone: "accent" },
  weak: { text: "Weak", tone: "bad" },
};

type Answer = { assessment?: AssessmentView; error?: unknown };

function dayOf(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.part}>
      <div className={styles.partTitle}>{title}</div>
      <ul className={styles.list}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Paragraph({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <div className={styles.part}>
      <div className={styles.partTitle}>{title}</div>
      <MemberText text={text} className={styles.text} />
    </div>
  );
}

export default function AssessmentBlock({
  apiBase,
  applicantUid,
  programmeId,
}: {
  /** `/api/admissions/forms/<round>`, as the review screen is handed it. */
  apiBase: string;
  applicantUid: string;
  programmeId: string;
}) {
  const hydrated = useHydrated();
  const [view, setView] = useState<AssessmentView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [asking, setAsking] = useState<Record<AssessmentPart, boolean>>({ claude: false, pangram: false });
  const [errors, setErrors] = useState<Record<AssessmentPart, string | null>>({ claude: null, pangram: null });

  const address = `${apiBase}/applications/${encodeURIComponent(applicantUid)}/assessment`;

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await fetch(`${address}?programme=${encodeURIComponent(programmeId)}`);
        const data = (await response.json().catch(() => ({}))) as Answer;
        if (!live) return;
        if (!response.ok || !data.assessment) {
          setLoadError(typeof data.error === "string" && data.error ? data.error : "This couldn’t be loaded.");
          return;
        }
        setView(data.assessment);
      } catch {
        if (live) setLoadError("This couldn’t be loaded. Check your connection.");
      }
    })();
    return () => {
      live = false;
    };
  }, [address, programmeId]);

  const ask = async (part: AssessmentPart) => {
    setAsking((now) => ({ ...now, [part]: true }));
    setErrors((now) => ({ ...now, [part]: null }));
    try {
      const response = await fetch(address, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ part, programmeId }),
      });
      const data = (await response.json().catch(() => ({}))) as Answer;
      if (!response.ok || !data.assessment) {
        const message =
          typeof data.error === "string" && data.error
            ? data.error
            : response.status === 504
              ? "That took too long. Try again."
              : "That didn’t work. Try again.";
        setErrors((now) => ({ ...now, [part]: message }));
        return;
      }
      // Each part answers the whole view, but only its own half is fresh:
      // keep the other half as this screen last had it, in case it landed
      // in between.
      const fresh = data.assessment;
      setView((now) =>
        now === null
          ? fresh
          : part === "claude"
            ? { ...now, claude: fresh.claude, claudeOutOfDate: fresh.claudeOutOfDate }
            : { ...now, pangram: fresh.pangram },
      );
    } catch {
      setErrors((now) => ({ ...now, [part]: "That couldn’t be sent. Check your connection and try again." }));
    } finally {
      setAsking((now) => ({ ...now, [part]: false }));
    }
  };

  const askBoth = () => {
    if (view?.claudeConfigured) void ask("claude");
    if (view?.pangramConfigured) void ask("pangram");
  };

  const claude = view?.claude ?? null;
  const pangram = view?.pangram ?? null;
  const busy = asking.claude || asking.pangram;
  const nothingSetUp = view !== null && !view.claudeConfigured && !view.pangramConfigured;

  return (
    <section className={screen.admin} aria-label="Claude and Pangram">
      <div className={screen.adminHead}>
        <div className={kit.mono}>Claude and Pangram</div>
        <span className={screen.adminLine} aria-hidden="true" />
      </div>
      <div className={`${screen.adminBox} ${styles.box}`}>
        <p className={styles.rule}>
          Only admins see this. It’s a second reader to help you decide, never the decision.
          Asking sends the answers and the reviews, with no names, to Anthropic and Pangram.
        </p>

        {loadError ? (
          <p className={screen.error} role="alert">
            {loadError}
          </p>
        ) : view === null ? (
          <p className={styles.quietLine}>Loading…</p>
        ) : nothingSetUp ? (
          <p className={styles.quietLine}>Claude and Pangram aren’t set up on this site yet.</p>
        ) : (
          <div className={styles.actions}>
            <button
              type="button"
              className={`${parts.quiet} ${styles.button}`}
              disabled={!hydrated || busy}
              onClick={askBoth}
            >
              {busy ? "Reading…" : claude || pangram ? "Ask again" : "Ask Claude and Pangram"}
            </button>
            {busy ? <span className={styles.quietLine}>Claude takes up to a minute.</span> : null}
          </div>
        )}

        {errors.claude ? (
          <p className={screen.error} role="alert">
            Claude: {errors.claude}
          </p>
        ) : null}
        {errors.pangram ? (
          <p className={screen.error} role="alert">
            Pangram: {errors.pangram}
          </p>
        ) : null}

        {claude ? (
          <div className={styles.read} aria-live="polite">
            <div className={styles.leanRow}>
              <span className={styles.leanLabel}>Claude leans</span>
              <Chip tone={LEAN_WORDS[claude.lean].tone}>{LEAN_WORDS[claude.lean].text}</Chip>
            </div>
            {claude.leanReason ? <p className={styles.leanReason}>{claude.leanReason}</p> : null}
            {view?.claudeOutOfDate ? (
              <p className={styles.stale} role="note">
                The answers or the reviews have changed since this was made. Ask again for an up-to-date read.
              </p>
            ) : null}
            <Paragraph title="In short" text={claude.summary} />
            <List title="Strengths" items={claude.strengths} />
            <List title="Concerns" items={claude.concerns} />
            <Paragraph title="The reviewers" text={claude.reviewers} />
            <Paragraph title="Fit for this programme" text={claude.fit} />
            <List title="Worth weighing" items={claude.toWeigh} />
            <List title="Thin or generic answers" items={claude.thinAnswers} />
            <p className={styles.quietLine}>Claude’s read, {dayOf(claude.at)}.</p>
          </div>
        ) : null}

        {pangram ? (
          <div className={styles.part}>
            <div className={styles.partTitle}>Pangram, on the longer answers</div>
            {pangram.answers.length === 0 && pangram.failed.length === 0 ? (
              <p className={styles.quietLine}>No answer was long enough to check.</p>
            ) : (
              <ul className={styles.pangramList}>
                {pangram.answers.map((answer) => (
                  <li key={answer.key} className={answer.worthALook ? styles.lookAt : undefined}>
                    <span className={styles.question}>{answer.question}</span>
                    <span className={styles.reading}>
                      {answer.label}
                      {answer.label === "Human"
                        ? ""
                        : ` · ${percent(answer.fractionAi)} AI, ${percent(answer.fractionAiAssisted)} AI-assisted`}
                      {answer.worthALook ? " · worth a look" : ""}
                    </span>
                  </li>
                ))}
                {pangram.failed.map((answer) => (
                  <li key={answer.key}>
                    <span className={styles.question}>{answer.question}</span>
                    <span className={styles.reading}>Not checked: {answer.reason}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.quietLine}>
              {pangram.tooShort > 0
                ? `${pangram.tooShort} shorter ${pangram.tooShort === 1 ? "answer wasn’t" : "answers weren’t"} checked: too short to tell. `
                : ""}
              A flag is a reason to look, not proof. Checked {dayOf(pangram.at)}.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
