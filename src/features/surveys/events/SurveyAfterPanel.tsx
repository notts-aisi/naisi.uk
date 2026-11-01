"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import { useHydrated } from "@/hooks/useHydrated";
import { SURVEY_REMINDER_DAYS, type StoredSurveyAfter } from "@/lib/events/surveyAfter";
import type { SurveyItem } from "@/lib/surveys/items";
import { questionProblems, settingsOf } from "@/lib/surveys/events/after";
import SurveyAfterSettings from "./SurveyAfterSettings";
import styles from "./surveyAfter.module.css";

type Setting = StoredSurveyAfter & { items: SurveyItem[] };

type Props = {
  eventId: string;
  /** The event as the form needs it; its times as ISO strings. */
  event: { title: string; startAt: string | null; endAt: string | null; noSignup: boolean };
  /** What the server handed the organisers (`surveyAfterPanel`). */
  panel: {
    setting: Setting;
    setUp: boolean;
    locks: { questions: string | null; send: string | null; reminder: string | null; off: string | null };
    send: { emails: number } | null;
    sendNote: string | null;
    test: boolean;
  };
  jobOn: boolean;
};

const OFFLINE = "That didn’t reach the site. Check your connection and try again.";

/** "Send it now (21)". */
function sendLabel(n: number): string {
  return `Send it now (${n})`;
}

/**
 * Said before Send it now emails anybody. The reminder is named only where
 * it will go by itself: its setting is on (the button waits while a change
 * is unsaved, so the form then holds the saved setting) and sending by
 * itself is switched on here.
 */
function confirmWords(emails: number, reminderGoes: boolean): string {
  const people = emails === 1 ? "1 person" : `${emails} people`;
  const reminder = reminderGoes
    ? ` Its one reminder goes by itself ${SURVEY_REMINDER_DAYS} days later, to anybody who hasn’t answered.`
    : "";
  return `Send the survey now? It emails ${people}, each with their own link.${reminder}`;
}

/**
 * THE EVENT'S ORGANISERS' PART OF ITS SURVEY AFTER TAB: "Send it now" with
 * the number it emails and "Send a test to me", then the setting, saved by
 * its own button. For the event's author and collaborators and admins
 * (`runsSurveyAfter`), drawn only for them; the routes ask the same rule.
 * Nothing here is a result or a count of answers.
 */
export default function SurveyAfterPanel({ eventId, event, panel, jobOn }: Props) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [value, setValue] = useState<StoredSurveyAfter>(panel.setting);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "send" | "test" | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  // The number on the button: the page's own count, taken again whenever a
  // refresh brings a new one (a saved change to who gets it moves it), and a
  // refused press's new number in between.
  const counted = panel.send?.emails ?? 0;
  const [emails, setEmails] = useState(counted);
  const [lastCounted, setLastCounted] = useState(counted);
  if (lastCounted !== counted) {
    setLastCounted(counted);
    setEmails(counted);
  }
  const facts = {
    title: event.title,
    startAt: event.startAt ? new Date(event.startAt) : null,
    endAt: event.endAt ? new Date(event.endAt) : null,
    noSignup: event.noSignup,
  };

  async function post(path: string, method: "POST" | "PATCH", body: unknown): Promise<{ ok: boolean; result: Record<string, unknown> }> {
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, result };
  }

  async function save() {
    // The questions whole: the standard set, when the form was put back to it.
    const items = settingsOf(value).items;
    const problem = value.on ? questionProblems(items)[0] : undefined;
    if (problem) {
      setError(problem);
      return;
    }
    setBusy("save");
    setError("");
    setDone("");
    try {
      const { ok, result } = await post(`/api/events/${encodeURIComponent(eventId)}/survey-after`, "PATCH", { ...value, items });
      if (!ok) {
        setError(typeof result.error === "string" ? result.error : "That couldn’t be saved. Try again in a minute.");
      } else {
        setDirty(false);
        setDone("Saved.");
        router.refresh();
      }
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(null);
    }
  }

  async function sendNow() {
    if (!window.confirm(confirmWords(emails, value.reminder && jobOn))) return;
    setBusy("send");
    setError("");
    setDone("");
    try {
      const { ok, result } = await post(`/api/events/${encodeURIComponent(eventId)}/survey-after/send`, "POST", { emails });
      if (!ok) {
        if (typeof result.emails === "number") setEmails(result.emails);
        setError(typeof result.error === "string" ? result.error : "It couldn’t be sent. Try again in a minute.");
      } else {
        const sent = typeof result.sent === "number" ? result.sent : 0;
        setDone(`Sent to ${sent === 1 ? "1 person" : `${sent} people`}.`);
        router.refresh();
      }
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setError("");
    setDone("");
    try {
      const { ok, result } = await post(`/api/events/${encodeURIComponent(eventId)}/survey-after/test`, "POST", {});
      if (!ok) setError(typeof result.error === "string" ? result.error : "That test could not be sent. Try again in a minute.");
      else
        setDone(
          result.delivery === "sent"
            ? "A test is on its way to your own address."
            : "The test wasn’t delivered: this copy of the site holds mail to that address, or it’s on the do-not-email list.",
        );
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(null);
    }
  }

  const locked = !hydrated || busy !== null;
  return (
    <div className={styles.panel}>
      {(panel.send || panel.sendNote || panel.test) && (
        <section className={styles.card} aria-labelledby="send-now-heading">
          <h2 id="send-now-heading" className={styles.cardTitle}>
            Send it sooner
          </h2>
          {panel.sendNote && <p className={styles.note}>{panel.sendNote}</p>}
          <div className={styles.sendRow}>
            {panel.send && (
              <Button onClick={sendNow} disabled={locked || dirty}>
                {busy === "send" ? "Sending…" : sendLabel(emails)}
              </Button>
            )}
            {panel.test && (
              <Button variant="secondary" onClick={test} disabled={locked}>
                {busy === "test" ? "Sending…" : "Send a test to me"}
              </Button>
            )}
          </div>
          {panel.send && dirty && <p className={styles.note}>Save your changes first: it sends what is saved.</p>}
        </section>
      )}

      {!panel.setUp && value.on && (
        <Notice tone="neutral" role="note">
          It isn’t set up yet. Saving sets it up.
        </Notice>
      )}

      <SurveyAfterSettings
        value={value}
        onChange={(next) => {
          setValue(next);
          setDirty(true);
          setDone("");
        }}
        disabled={locked}
        event={facts}
        jobOn={jobOn}
        where="tab"
        locks={panel.locks}
      />

      {error && (
        <p className={styles.problem} role="alert">
          {error}
        </p>
      )}
      {done && !error && (
        <p className={styles.done} role="status">
          {done}
        </p>
      )}
      <div className={styles.saveRow}>
        <Button onClick={save} disabled={locked || !dirty}>
          {busy === "save" ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
