"use client";

import { useCallback, useEffect, useState } from "react";
import CountedTextarea from "@/components/ui/CountedTextarea";
import InitialsChip from "@/components/ui/InitialsChip";
import shared from "@/features/applications/decisionDay/decisionDay.module.css";
import WeekChart, { type ChartGroup, type WeekChartWords } from "@/features/applications/times/WeekChart";
import { PLACEMENT_NOTE_LIMIT } from "@/lib/courses/placementNotes/model";
import type { OutsideRow, OutsideSection } from "@/lib/courses/placementNotes/view";
import * as words from "@/lib/courses/placementNotes/words";
import styles from "./OutsideNotes.module.css";

/**
 * "OUTSIDE THE TIMES THEY GAVE (N)", on Publish's own page, above what the
 * press sends.
 *
 * Everybody a press would tell their group who is placed in a group that
 * meets at a time they said they cannot make, with their group and its day
 * and time, and three choices: Write (a text box), Draft with Claude (an
 * admin's), and Send without a note. Publish waits until each has one, and
 * the server holds that whatever this draws. A saved note goes above the
 * site's own details in their "Your group" email; moving them to another
 * group voids it.
 *
 * AN ADMIN SEES THEIR WEEK: the stretches they marked against their group's
 * session (`WeekChart`, as Arrange groups draws it, with nothing to pick),
 * and how much of the session falls in what they gave, so a note is written
 * knowing the overlap. A lead sees no painted week, as on every screen of
 * theirs, and never Claude's draft. Both come from the notes route
 * (`/api/courses/runs/[runId]/allocation/publish/notes`), which decides
 * again who may see and save what.
 */

type Props = {
  runId: string;
  /** Bumped by the page after a test or a press, to read the section again. */
  version: number;
  /** After a save: the page reads its readiness check, its emails and its count again. */
  onChanged: () => void;
};

type Answer = { section?: OutsideSection; error?: string } | null;

/**
 * The week chart as this page draws it: one group, theirs, nothing to pick.
 * `words` is the chart's own optional wording (the Circles work adds it, with
 * `pick: null` drawing no Move buttons); until it lands the chart draws them
 * disabled.
 */
const CHART_WORDS: WeekChartWords = { pick: null, pickAria: (group, when) => `${group}, ${when}`, current: "the group they’re in" };

function Person({
  runId,
  row,
  admin,
  onSection,
}: {
  runId: string;
  row: OutsideRow;
  admin: boolean;
  onSection: (section: OutsideSection) => void;
}) {
  const saved = row.note.state === "noted" ? row.note.text : "";
  const [text, setText] = useState(saved || row.draft?.text || "");
  const [seen, setSeen] = useState(`${saved}\u0000${row.draft?.text ?? ""}`);
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState<"saving" | "drafting" | "without" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // New words from the server (a save, a draft) replace the box's, unless
  // somebody has typed in it since.
  const base = `${saved}\u0000${row.draft?.text ?? ""}`;
  if (base !== seen) {
    setSeen(base);
    if (!writing) setText(saved || row.draft?.text || "");
  }

  const send = useCallback(
    async (method: "PUT" | "POST", body: Record<string, unknown>) => {
      setProblem(null);
      try {
        const response = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/allocation/publish/notes`, {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const answer = (await response.json().catch(() => null)) as Answer;
        if (!response.ok || !answer?.section) {
          setProblem(answer?.error ?? "That didn’t go through. Try again.");
          return null;
        }
        return answer.section;
      } catch {
        setProblem("Could not reach the site. Check your connection and try again.");
        return null;
      }
    },
    [runId],
  );

  const choose = async (choice: "note" | "none") => {
    setBusy(choice === "note" ? "saving" : "without");
    const section = await send("PUT", { uid: row.uid, groupId: row.groupId, choice, text: choice === "note" ? text : "" });
    setBusy(null);
    if (!section) return;
    setWriting(false);
    onSection(section);
  };

  const draft = async () => {
    setBusy("drafting");
    const section = await send("POST", { uid: row.uid });
    setBusy(null);
    if (!section) return;
    const next = section.rows.find((each) => each.uid === row.uid);
    if (next?.draft) setText(next.draft.text);
    setWriting(true);
    onSection(section);
  };

  const working = busy !== null;
  const showingDraft = row.draft !== null && text === row.draft.text && text !== saved;
  const editing = writing || (row.note.state === "missing" && text !== "");
  const groups: ChartGroup[] = row.week
    ? [{ key: row.groupId, name: row.groupName, session: row.week.session, fits: false, current: true }]
    : [];

  return (
    <li className={styles.person}>
      <div className={styles.who}>
        <InitialsChip name={row.name} uid={row.uid} size="md" />
        <div className={styles.whoText}>
          <span className={styles.name}>{row.name}</span>
          <span className={styles.group}>{words.groupLine(row.groupName, row.meets)}</span>
        </div>
        <span
          className={`${styles.state} ${
            row.note.state === "missing" ? styles.stateMissing : row.note.state === "noted" ? styles.stateNoted : styles.stateWithout
          }`}
        >
          {row.note.state === "noted"
            ? words.notedWords(row.note.by)
            : row.note.state === "without"
              ? words.withoutWords(row.note.by)
              : words.MISSING}
        </span>
      </div>

      {admin ? (
        row.week ? (
          <div className={styles.week}>
            <p className={styles.overlap}>{words.overlapWords(row.week.overlapMinutes, row.week.session.durationMinutes)}</p>
            <WeekChart
              grid={row.week.grid}
              marked={row.week.marked}
              fromFirstMark={row.week.fromFirstMark}
              groups={groups}
              disabled
              onPick={() => {}}
              words={CHART_WORDS}
            />
          </div>
        ) : (
          <p className={styles.hint}>{words.NO_WEEK_TO_SHOW}</p>
        )
      ) : null}

      {row.note.state === "noted" && !editing ? <p className={styles.text}>{row.note.text}</p> : null}

      {editing ? (
        <div className={styles.editor}>
          {showingDraft ? (
            <p className={styles.hint}>
              {words.DRAFT_HINT}
              {row.draft?.basis ? <span className={styles.basis}> {words.drawnFromWords(row.draft.basis)}</span> : null}
            </p>
          ) : null}
          <CountedTextarea
            aria-label={`A note for ${row.name}`}
            value={text}
            max={PLACEMENT_NOTE_LIMIT}
            rows={4}
            disabled={working}
            placeholder={words.PLACEHOLDER}
            onChange={(event) => {
              setWriting(true);
              setText(event.target.value);
            }}
          />
        </div>
      ) : null}

      <div className={styles.actions}>
        {editing ? (
          <button
            type="button"
            className={shared.secondary}
            disabled={working || !text.trim() || text.trim() === saved.trim()}
            onClick={() => void choose("note")}
          >
            {busy === "saving" ? words.SAVING : words.SAVE}
          </button>
        ) : !row.own ? (
          <button
            type="button"
            className={shared.secondary}
            disabled={working}
            onClick={() => {
              setText(saved || row.draft?.text || "");
              setWriting(true);
            }}
          >
            {row.note.state === "noted" ? words.EDIT : words.WRITE}
          </button>
        ) : null}
        {row.canDraft ? (
          <button type="button" className={shared.quiet} disabled={working} onClick={() => void draft()}>
            {busy === "drafting" ? words.DRAFTING : row.draft ? words.DRAFT_AGAIN : words.DRAFT}
          </button>
        ) : null}
        {row.note.state !== "without" ? (
          <button type="button" className={shared.quiet} disabled={working} onClick={() => void choose("none")}>
            {busy === "without" ? words.SAVING : words.WITHOUT}
          </button>
        ) : null}
        {editing ? (
          <button
            type="button"
            className={shared.quiet}
            disabled={working}
            onClick={() => {
              setWriting(false);
              setText(saved || row.draft?.text || "");
            }}
          >
            {words.CANCEL}
          </button>
        ) : null}
      </div>
      {row.canDraft && editing ? <p className={styles.fence}>{words.CLAUDE_FENCE}</p> : null}
      {problem ? (
        <p className={shared.problem} role="alert">
          {problem}
        </p>
      ) : null}
    </li>
  );
}

export default function OutsideNotes({ runId, version, onChanged }: Props) {
  const [section, setSection] = useState<OutsideSection | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/courses/runs/${encodeURIComponent(runId)}/allocation/publish/notes`, { cache: "no-store" })
      .then(async (response) => {
        const answer = (await response.json().catch(() => null)) as Answer;
        if (!live) return;
        if (!response.ok || !answer?.section) {
          setProblem(answer?.error ?? "Who is outside the times they gave couldn’t be read. Reload the page to try again.");
          return;
        }
        setProblem(null);
        setSection(answer.section);
      })
      .catch(() => {
        if (live) setProblem("Who is outside the times they gave couldn’t be read. Reload the page to try again.");
      });
    return () => {
      live = false;
    };
  }, [runId, version]);

  const onSection = useCallback(
    (next: OutsideSection) => {
      setSection(next);
      onChanged();
    },
    [onChanged],
  );

  if (problem) {
    return (
      <p className={shared.problem} role="alert">
        {problem}
      </p>
    );
  }
  if (!section || section.rows.length === 0) return null;

  return (
    <section className={styles.card} aria-labelledby="publish-outside-title">
      <h2 id="publish-outside-title" className={styles.title}>
        {words.outsideTitle(section.rows.length)}
      </h2>
      <p className={styles.line}>{words.OUTSIDE_LINE}</p>
      <ul className={styles.people}>
        {section.rows.map((row) => (
          <Person key={`${row.uid}:${row.groupId}`} runId={runId} row={row} admin={section.admin} onSection={onSection} />
        ))}
      </ul>
    </section>
  );
}
