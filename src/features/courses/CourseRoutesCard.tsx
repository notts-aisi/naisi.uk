"use client";

import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useAuth } from "@/auth/AuthProvider";
import type { RoutesReadAnswer } from "@/app/api/courses/[courseId]/routes/route";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { allRoutes, routeStanding, type CourseRoutes, type RouteRecord } from "@/lib/courses/routes/model";
import {
  NO_DEADLINE,
  ROLLING,
  ROUTES_CARD_HINT,
  ROUTES_CARD_TITLE,
  ROUTES_FIELD_HINT,
  ROUTES_FIELD_LABEL,
  ROUTES_NONE,
  ROUTES_ONLY_ADMIN,
  ROUTES_SAVED,
  ROUTES_TAKEN_OFF,
  applyByWords,
  checkedOnWords,
  closedOnWords,
  routesFoundWords,
} from "@/lib/courses/routes/words";
import { routesToMarkdown } from "@/lib/courses/routes/write";
import styles from "./adminCourses.module.css";
import own from "./courseRoutes.module.css";

/**
 * THE COURSE'S ROUTES AND DEADLINES, IN ITS DETAILS (`CourseDoc.routes`):
 * the routes a week that lists them shows in place of the guide's tables,
 * each with where it stands today. An admin pastes the guide's own "Where to
 * go next", or edits the copy shown here, reads it back and saves it; or
 * takes the list off, so the week shows the guide's tables again.
 *
 * No board draws this card: its words are listed for the boards' designers.
 * Everybody else who can open the course sees the list as it stands and that
 * an admin changes it. Writes go through `/api/courses/[courseId]/routes`.
 */
export default function CourseRoutesCard({ courseId, stored }: { courseId: string; stored: CourseRoutes | null }) {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const fieldId = useId();
  const hintId = useId();
  const [saved, setSaved] = useState<CourseRoutes | null>(stored);
  const [text, setText] = useState(stored ? routesToMarkdown(stored) : "");
  const [read, setRead] = useState<RoutesReadAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const todayKey = londonDateKey(new Date());

  const call = async (method: "POST" | "PUT", body: Record<string, unknown>) => {
    const res = await fetch(`/api/courses/${encodeURIComponent(courseId)}/routes`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = (await res.json().catch(() => null)) as (RoutesReadAnswer & { error?: string; ok?: boolean }) | null;
    if (!res.ok) throw new Error(out?.error ?? "That didn’t go through. Try again.");
    return out;
  };

  const readIt = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setRead((await call("POST", { markdown: text })) as RoutesReadAnswer);
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
      const next = out?.routes ?? null;
      setSaved(next);
      setText(next ? routesToMarkdown(next) : "");
      setRead(null);
      setMessage(next ? ROUTES_SAVED : ROUTES_TAKEN_OFF);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn’t go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const standingWords = (route: RouteRecord): string => {
    const standing = routeStanding(route, todayKey);
    if (standing.kind === "rolling") return ROLLING;
    if (standing.kind === "open") return applyByWords(standing.deadline, todayKey);
    if (standing.kind === "closed") return closedOnWords(standing.deadline, todayKey);
    return NO_DEADLINE;
  };

  const shown = read?.routes ?? saved;
  return (
    <Card padding="lg">
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{ROUTES_CARD_TITLE}</h2>
          <p className={styles.sectionHint}>{ROUTES_CARD_HINT}</p>
        </div>

        {shown ? (
          <div className={own.list}>
            <p className={own.line}>{checkedOnWords(shown.checkedOn)}</p>
            {shown.groups.map((group, index) => (
              <div key={index} className={own.group}>
                {group.heading && <p className={own.heading}>{group.heading}</p>}
                <ul className={own.routes} role="list">
                  {group.routes.map((route, r) => (
                    <li key={r} className={own.route}>
                      <span className={own.name}>{route.name}</span>
                      <span className={own.standing}>{standingWords(route)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className={own.line}>{ROUTES_NONE}</p>
        )}

        {isAdmin ? (
          <div className={own.form}>
            <label htmlFor={fieldId} className={own.label}>
              {ROUTES_FIELD_LABEL}
            </label>
            <p id={hintId} className={own.hint}>
              {ROUTES_FIELD_HINT}
            </p>
            <textarea
              id={fieldId}
              className={own.box}
              rows={10}
              value={text}
              aria-describedby={hintId}
              onChange={(event) => {
                setText(event.currentTarget.value);
                setRead(null);
              }}
              disabled={busy}
            />
            {read && read.routes && (
              <p className={own.line}>
                What we found: {routesFoundWords(allRoutes(read.routes).length, read.routes.groups.length, read.routes.checkedOn)}
              </p>
            )}
            {read && read.problems.length > 0 && (
              <div className={own.problems}>
                <p className={own.label}>Before they can be saved</p>
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
              <Button onClick={() => void save(false)} disabled={busy || !read?.routes || read.problems.length > 0}>
                Save the routes
              </Button>
              {saved && (
                <Button variant="ghost" onClick={() => void save(true)} disabled={busy}>
                  Take them off
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
          <p className={own.line}>{ROUTES_ONLY_ADMIN}</p>
        )}
      </section>
    </Card>
  );
}
