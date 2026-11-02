"use client";

import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import type { RubricReadAnswer } from "@/app/api/courses/[courseId]/rubric/route";
import type { CourseRubric } from "@/lib/courses/rubric";
import { rubricToMarkdown } from "@/lib/courses/rubricMarkdown";
import styles from "./adminCourses.module.css";
import own from "./courseRubric.module.css";

/**
 * THE COURSE'S RUBRIC, IN ITS DETAILS (`CourseDoc.rubric`): the rows a
 * strong written answer is held to, by levels with a descriptor in each
 * cell, never a mark, as guidance for writing. Feedback on an answer is a
 * signed comment, and no level of it goes back to the person. An admin
 * pastes the guide's own table, or types one in the same shape, reads it
 * back, and saves it; or takes it off.
 *
 * No board draws this card: its words are listed for the boards' designers.
 * Everybody else who can open the course sees the rubric as it stands and
 * that an admin sets it. Writes go through `PUT /api/courses/[courseId]/rubric`.
 * Whether the caller is an admin is the course editor's answer (`isAdmin`),
 * read once for every card in it.
 */
export default function CourseRubricCard({
  courseId,
  stored,
  isAdmin,
}: {
  courseId: string;
  stored: CourseRubric | null;
  isAdmin: boolean;
}) {
  const fieldId = useId();
  const [saved, setSaved] = useState<CourseRubric | null>(stored);
  const [text, setText] = useState(stored ? rubricToMarkdown(stored) : "");
  const [read, setRead] = useState<RubricReadAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (method: "POST" | "PUT", body: Record<string, unknown>) => {
    const res = await fetch(`/api/courses/${encodeURIComponent(courseId)}/rubric`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = (await res.json().catch(() => null)) as (RubricReadAnswer & { error?: string; ok?: boolean; rubric?: CourseRubric | null }) | null;
    if (!res.ok) throw new Error(out?.error ?? "That didn’t go through. Try again.");
    return out;
  };

  const readIt = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setRead((await call("POST", { markdown: text })) as RubricReadAnswer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn’t go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (remove: boolean) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const out = await call("PUT", remove ? { remove: true } : { markdown: text });
      const next = out?.rubric ?? null;
      setSaved(next);
      setText(next ? rubricToMarkdown(next) : "");
      setRead(null);
      setMessage(next ? "Saved." : "Rubric taken off.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn’t go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const shown = read?.rubric ?? saved;
  return (
    <Card padding="lg">
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Rubric for written answers</h2>
          <p className={styles.sectionHint}>
            What a strong written answer does, row by row, as guidance for writing. Feedback is a signed comment: no level of it goes back to the person, and never a mark.
          </p>
        </div>

        {shown ? (
          <div className={own.tableWrap}>
            <table className={own.table}>
              <thead>
                <tr>
                  <th scope="col">
                    <span className={own.srOnly}>Row</span>
                  </th>
                  {shown.levels.map((level) => (
                    <th key={level} scope="col">
                      {level}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.rows.map((row) => (
                  <tr key={row.name}>
                    <th scope="row">{row.name}</th>
                    {shown.levels.map((level, index) => (
                      <td key={level}>{row.descriptors[index] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={own.line}>No rubric yet.</p>
        )}

        {isAdmin ? (
          <div className={own.form}>
            <label htmlFor={fieldId} className={own.label}>
              The rubric, as a table
            </label>
            <p className={own.hint}>
              Paste the table from the guide’s Start here, or type one: the levels across the top, a row for each
              thing, its name in the first cell.
            </p>
            <textarea
              id={fieldId}
              className={own.box}
              rows={8}
              value={text}
              onChange={(event) => {
                setText(event.currentTarget.value);
                setRead(null);
              }}
              disabled={busy}
            />
            {read && read.rubric && (
              <p className={own.line}>
                What we found: {read.rubric.rows.length} {read.rubric.rows.length === 1 ? "row" : "rows"} by{" "}
                {read.rubric.levels.length} levels.
              </p>
            )}
            {read && read.problems.length > 0 && (
              <div className={own.problems}>
                <p className={own.label}>Before it can be saved</p>
                <ul>
                  {read.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className={styles.formActions}>
              <Button variant="ghost" onClick={() => void readIt()} disabled={busy || !text.trim()}>
                Read it
              </Button>
              <Button onClick={() => void save(false)} disabled={busy || !read?.rubric || read.problems.length > 0}>
                Save the rubric
              </Button>
              {saved && (
                <Button variant="ghost" onClick={() => void save(true)} disabled={busy}>
                  Take the rubric off
                </Button>
              )}
            </div>
            {message && (
              <p className={own.line} role="status">
                {message}
              </p>
            )}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
          </div>
        ) : (
          <p className={own.line}>Only an admin can change the rubric.</p>
        )}
      </section>
    </Card>
  );
}
