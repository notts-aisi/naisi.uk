"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { AdminPanel, AdminProblem } from "./adminPanels";
import styles from "./CoursesConfigPanel.module.css";

/**
 * The `config/courses` knobs a human changes: the anonymous feedback form
 * offered when somebody leaves a course, the weekly feedback form next week's
 * email links to, how many days before each session that email goes, and how
 * long an unfinished register waits before its facilitators are reminded and
 * before the programme's lead and the admins get a task.
 *
 * It lives on the SITE STATUS page rather than under /admin/courses on
 * purpose. None of these is course content: they are site-wide operational
 * settings that happen to be read by the courses feature, three of them by
 * the scheduled jobs on the panel above, and the audience for them is whoever
 * is asking "is the site behaving", not whoever is writing week 3.
 *
 * Every field has a default that keeps the platform working when the document
 * does not exist at all (`DEFAULT_COURSES_CONFIG`), so an empty form is a
 * complete state and the panel says which value is standing in.
 */

type Settings = {
  dropOutFeedbackUrl: string;
  weeklyFeedbackUrl: string;
  unmarkedRegisterGraceHours: number;
  registerTaskHours: number;
  nextWeekEmailDaysBefore: number;
};

type ServerState = Settings & { defaults: Settings };

/** A number typed into a box, or null when it is not one. */
function numberIn(text: string): number | null {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) ? value : null;
}

export default function CoursesConfigPanel() {
  const [defaults, setDefaults] = useState<Settings | null>(null);
  const [feedbackUrl, setFeedbackUrl] = useState("");
  const [weeklyUrl, setWeeklyUrl] = useState("");
  const [graceHours, setGraceHours] = useState("");
  const [taskHours, setTaskHours] = useState("");
  const [emailDays, setEmailDays] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  /** The boxes, filled from what the server says it stored. */
  function show(settings: Partial<Settings>) {
    setFeedbackUrl(settings.dropOutFeedbackUrl ?? "");
    setWeeklyUrl(settings.weeklyFeedbackUrl ?? "");
    if (typeof settings.unmarkedRegisterGraceHours === "number") {
      setGraceHours(String(settings.unmarkedRegisterGraceHours));
    }
    if (typeof settings.registerTaskHours === "number") {
      setTaskHours(String(settings.registerTaskHours));
    }
    if (typeof settings.nextWeekEmailDaysBefore === "number") {
      setEmailDays(String(settings.nextWeekEmailDaysBefore));
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/courses-config");
        const body = (await res.json().catch(() => null)) as
          | (ServerState & { error?: string })
          | null;
        if (cancelled) return;
        if (!res.ok || !body?.defaults) {
          setLoadError(body?.error ?? "Couldn't load the course settings.");
        } else {
          setDefaults(body.defaults);
          show(body);
        }
      } catch {
        if (!cancelled) setLoadError("Couldn't load the course settings.");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSavedFlash(false);
    const grace = numberIn(graceHours);
    const task = numberIn(taskHours);
    const days = numberIn(emailDays);
    if (grace === null || grace <= 0 || task === null || task <= 0) {
      setSaveError("The reminder and the task each need a number of hours above zero.");
      setSaving(false);
      return;
    }
    if (days === null || !Number.isInteger(days) || days < 1) {
      setSaveError("Next week's email needs a whole number of days, 1 or more.");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch("/api/admin/courses-config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dropOutFeedbackUrl: feedbackUrl.trim(),
          weeklyFeedbackUrl: weeklyUrl.trim(),
          unmarkedRegisterGraceHours: grace,
          registerTaskHours: task,
          nextWeekEmailDaysBefore: days,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | (Partial<Settings> & { ok?: boolean; error?: string })
        | null;
      if (!res.ok || !body?.ok) {
        setSaveError(body?.error ?? "Couldn't save the course settings.");
        return;
      }
      // Seeded from the SERVER's answer, not the draft: the reader normalises
      // what it stored, so what comes back is what the site will actually use.
      show(body);
      setSavedFlash(true);
    } catch {
      setSaveError("Couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPanel
      id="course-settings"
      title="Course settings"
      description="Settings the courses read from the whole site: two feedback forms, when next week's email goes, and when an unfinished register is chased."
    >
      {!loaded ? (
        <p className={styles.meta}>Loading…</p>
      ) : loadError ? (
        <AdminProblem>{loadError}</AdminProblem>
      ) : (
        <div className={styles.form}>
          <Field
            id="courses-dropout-feedback-url"
            label="Drop-out feedback form"
            hint="Shown to someone who has just left a course, and linked from their confirmation email. Leave it empty to ask for nothing, which is a complete state. Must start with http:// or https://."
          >
            <Input
              id="courses-dropout-feedback-url"
              value={feedbackUrl}
              onChange={(e) => setFeedbackUrl(e.target.value)}
              placeholder="https://forms.gle/..."
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>

          <Field
            id="courses-weekly-feedback-url"
            label="Weekly feedback form"
            hint="Linked from next week's email to each group. Leave it empty and the email simply does not mention one. Must start with http:// or https://."
          >
            <Input
              id="courses-weekly-feedback-url"
              value={weeklyUrl}
              onChange={(e) => setWeeklyUrl(e.target.value)}
              placeholder="https://forms.gle/..."
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>

          <Field
            id="courses-next-week-email-days"
            label="Next week's email: days before each session"
            hint={`Each group is sent next week's time, room and reading this many days before its session, at the session's own time of day. Only while the "Next week's email" job above is on; while it is off, pushing the register sends it.${
              defaults ? ` Default ${defaults.nextWeekEmailDaysBefore}.` : ""
            }`}
          >
            <Input
              id="courses-next-week-email-days"
              value={emailDays}
              onChange={(e) => setEmailDays(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
            />
          </Field>

          <Field
            id="courses-unmarked-grace-hours"
            label="Unfinished register: reminder to facilitators after (hours)"
            hint={`Counted from the end of the session. The group's facilitators get one email, only while the "Register reminders" job above is on.${
              defaults ? ` Default ${defaults.unmarkedRegisterGraceHours}.` : ""
            }`}
          >
            <Input
              id="courses-unmarked-grace-hours"
              value={graceHours}
              onChange={(e) => setGraceHours(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
            />
          </Field>

          <Field
            id="courses-register-task-hours"
            label="Unfinished register: task for the lead and admins after (hours)"
            hint={`Counted from the end of the session, and later than the reminder. A task lands on the board of the programme's lead and every admin, and emails nobody.${
              defaults ? ` Default ${defaults.registerTaskHours}.` : ""
            }`}
          >
            <Input
              id="courses-register-task-hours"
              value={taskHours}
              onChange={(e) => setTaskHours(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
            />
          </Field>

          {saveError ? <AdminProblem>{saveError}</AdminProblem> : null}

          <div className={styles.actionsRow}>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save course settings"}
            </Button>
            {savedFlash ? (
              <span className={styles.saved} role="status">
                Saved.
              </span>
            ) : null}
          </div>
        </div>
      )}
    </AdminPanel>
  );
}
