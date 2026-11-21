"use client";

import { useState, type FormEvent } from "react";
import { Textarea } from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import { ABOUT_KEYS, WORDS_MAX_CHARS, isAboutKey, type AboutKey } from "@/lib/societyFeedback/model";
import { ABOUT_WORDS, FORM_WORDS, SENT_WORDS, weekWords } from "@/lib/societyFeedback/words";
import styles from "./societyFeedback.module.css";

/** One programme the form offers: its ids, its name, and how many weeks it has (null when none are written). */
export type FormProgramme = { roundId: string; programmeId: string; name: string; weeks: number | null };

const keyOf = (programme: Pick<FormProgramme, "roundId" | "programmeId">) => `${programme.roundId}/${programme.programmeId}`;

/**
 * Anonymous feedback: the four questions and "Send anonymously", then the
 * thanks.
 *
 * THE REQUEST CARRIES WHAT WAS WRITTEN AND CHOSEN, AND NOTHING ELSE. The
 * browser sends its sign-in with it, because only members may send, and the
 * route reads from that one yes or no; `referrerPolicy: "no-referrer"` keeps
 * it from saying which page it came from. Nothing is kept in the browser,
 * before or after. Once sent, the words are gone from the page.
 *
 * It takes only the programmes it offers, never a document.
 */
export default function SocietyFeedbackForm({ programmes }: { programmes: FormProgramme[] }) {
  const hydrated = useHydrated();
  const [programmeKey, setProgrammeKey] = useState("");
  const [week, setWeek] = useState("");
  const [about, setAbout] = useState<AboutKey | "">("");
  const [words, setWords] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  const programme = programmes.find((each) => keyOf(each) === programmeKey) ?? null;
  const weeks = programme?.weeks ? Array.from({ length: programme.weeks }, (_, index) => index + 1) : [];

  function reset() {
    setProgrammeKey("");
    setWeek("");
    setAbout("");
    setWords("");
    setError("");
    setState("idle");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state !== "idle") return;
    setState("sending");
    setError("");
    try {
      const response = await fetch("/api/anonymous-feedback", {
        method: "POST",
        credentials: "same-origin",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          words,
          roundId: programme?.roundId ?? "",
          programmeId: programme?.programmeId ?? "",
          week: programme && week ? Number(week) : null,
          about,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setState("idle");
        setError(result.error ?? FORM_WORDS.tryAgain);
        return;
      }
      setWords("");
      setState("sent");
    } catch {
      setState("idle");
      setError(FORM_WORDS.tryAgain);
    }
  }

  if (state === "sent") {
    return (
      <div className={styles.sent} role="status">
        <h2 className={styles.sentTitle}>{SENT_WORDS.title}</h2>
        <p className={styles.sentBody}>{SENT_WORDS.body}</p>
        <button type="button" className={styles.secondary} onClick={reset}>
          {SENT_WORDS.more}
        </button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.field}>
        <label htmlFor="feedback-programme" className={styles.label}>
          {FORM_WORDS.programmeLabel}
        </label>
        <Select
          id="feedback-programme"
          className={styles.control}
          value={programmeKey}
          onChange={(event) => {
            setProgrammeKey(event.target.value);
            setWeek("");
          }}
        >
          <option value="">{FORM_WORDS.programmeNone}</option>
          {programmes.map((each) => (
            <option key={keyOf(each)} value={keyOf(each)}>
              {each.name}
            </option>
          ))}
        </Select>
      </div>

      {weeks.length > 0 && (
        <div className={styles.field}>
          <label htmlFor="feedback-session" className={styles.label}>
            {FORM_WORDS.sessionLabel}
          </label>
          <Select
            id="feedback-session"
            className={styles.control}
            value={week}
            onChange={(event) => setWeek(event.target.value)}
            aria-describedby="feedback-session-hint"
          >
            <option value="">{FORM_WORDS.sessionNone}</option>
            {weeks.map((n) => (
              <option key={n} value={String(n)}>
                {weekWords(n)}
              </option>
            ))}
          </Select>
          <p id="feedback-session-hint" className={styles.hint}>
            {FORM_WORDS.sessionWarning}
          </p>
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="feedback-about" className={styles.label}>
          {FORM_WORDS.aboutLabel}
        </label>
        <Select
          id="feedback-about"
          className={styles.control}
          value={about}
          onChange={(event) => setAbout(isAboutKey(event.target.value) ? event.target.value : "")}
          aria-describedby="feedback-about-hint"
        >
          <option value="">{FORM_WORDS.aboutNone}</option>
          {ABOUT_KEYS.map((key) => (
            <option key={key} value={key}>
              {ABOUT_WORDS[key]}
            </option>
          ))}
        </Select>
        <p id="feedback-about-hint" className={styles.hint}>
          {FORM_WORDS.aboutHint}
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="feedback-words" className={styles.label}>
          {FORM_WORDS.wordsLabel}
        </label>
        <Textarea
          id="feedback-words"
          rows={5}
          maxLength={WORDS_MAX_CHARS}
          value={words}
          onChange={(event) => setWords(event.target.value)}
        />
      </div>

      <p className={styles.box}>{FORM_WORDS.box}</p>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={styles.send} disabled={!hydrated || state !== "idle"}>
        {state === "sending" ? FORM_WORDS.sending : FORM_WORDS.send}
      </button>
    </form>
  );
}
