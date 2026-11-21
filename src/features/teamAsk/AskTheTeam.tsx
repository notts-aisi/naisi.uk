"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Chip from "@/components/ui/Chip";
import { Textarea } from "@/components/ui/Input";
import OptionRow from "@/components/ui/OptionRow";
import { useHydrated } from "@/hooks/useHydrated";
import { PAGE_WORDS, TOPIC_WORDS } from "@/lib/courses/teamAsk/words";
import { TEAM_MESSAGE_LIMITS, TEAM_TOPICS, type TeamTopic } from "@/lib/firestore/courseTeamAsks";
import { sendTeamMessage } from "./api";
import styles from "./AskTheTeam.module.css";

/** A place the member holds this term: the run, and the programme's name. */
export type AskPlace = { runId: string; name: string };

/** One of their own messages, in finished words. */
export type AskRow = { id: string; title: string; line: string; chip: string; replied: boolean };

const anotherSessionHref = (runId: string) => `/learn/${encodeURIComponent(runId)}/another-session`;
const programmeHref = (runId: string) => `/learn/${encodeURIComponent(runId)}`;

/**
 * ASK THE TEAM: "What’s it about?", the message and "Send to the team", then
 * "Your requests".
 *
 * ONLY THE TOPICS WHOSE FLOWS EXIST. "One week at another session" is a way
 * to that programme's own form, shown to somebody holding a place this term,
 * with "Which programme?" first for somebody holding two; it decides nothing
 * itself (the form says when nothing can be asked). "Something’s wrong on
 * the site" and "Something else" are written here.
 *
 * It takes only finished words and the runs it links to, never a document.
 * Once sent, the words are gone from the page and the list is read again.
 */
export default function AskTheTeam({ places, own }: { places: AskPlace[]; /** Null when their messages could not be read: no list is drawn. */ own: AskRow[] | null }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [topic, setTopic] = useState<TeamTopic | "visit" | "">("");
  const [words, setWords] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || topic === "visit") return;
    setSent(false);
    setError("");
    setSending(true);
    const answer = await sendTeamMessage(topic, words);
    setSending(false);
    if (!answer.ok) {
      setError(answer.status === 0 ? PAGE_WORDS.didntSend : (answer.error ?? PAGE_WORDS.didntSend));
      return;
    }
    setWords("");
    setTopic("");
    setSent(true);
    router.refresh();
  }

  return (
    <div className={styles.screen}>
      <header className={styles.head}>
        <h1 className={styles.title}>{PAGE_WORDS.title}</h1>
        <p className={styles.intro}>{PAGE_WORDS.intro}</p>
      </header>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{PAGE_WORDS.aboutLabel}</legend>
          {places.length === 1 && (
            <Link className={styles.flow} href={anotherSessionHref(places[0].runId)}>
              <span className={styles.flowTitle}>{PAGE_WORDS.visitTopic}</span>
              <span className={styles.flowLine}>{PAGE_WORDS.visitTopicLine}</span>
            </Link>
          )}
          {places.length > 1 && (
            <OptionRow
              type="radio"
              name="ask-topic"
              value="visit"
              checked={topic === "visit"}
              onChange={() => setTopic("visit")}
              description={PAGE_WORDS.visitTopicLine}
            >
              {PAGE_WORDS.visitTopic}
            </OptionRow>
          )}
          {TEAM_TOPICS.map((each) => (
            <OptionRow key={each} type="radio" name="ask-topic" value={each} checked={topic === each} onChange={() => setTopic(each)}>
              {TOPIC_WORDS[each]}
            </OptionRow>
          ))}
        </fieldset>

        {topic === "visit" ? (
          <div className={styles.field}>
            <p className={styles.label}>{PAGE_WORDS.whichProgramme}</p>
            <div className={styles.choices}>
              {places.map((place) => (
                <Link key={place.runId} className={styles.secondary} href={anotherSessionHref(place.runId)}>
                  {place.name}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className={styles.field}>
              <label htmlFor="ask-words" className={styles.label}>
                {PAGE_WORDS.messageLabel}
              </label>
              <Textarea
                id="ask-words"
                rows={5}
                maxLength={TEAM_MESSAGE_LIMITS.words}
                value={words}
                onChange={(event) => setWords(event.target.value)}
                aria-describedby="ask-words-hint"
              />
              <p id="ask-words-hint" className={styles.hint}>
                {PAGE_WORDS.messageHint}
              </p>
            </div>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            {sent && (
              <p className={styles.sent} role="status">
                {PAGE_WORDS.sent}
              </p>
            )}
            <button type="submit" className={styles.send} disabled={!hydrated || sending}>
              {sending ? PAGE_WORDS.sending : PAGE_WORDS.send}
            </button>
          </>
        )}
      </form>

      {own !== null && (
        <section className={styles.card} aria-labelledby="ask-own">
          <h2 id="ask-own" className={styles.cardTitle}>
            {PAGE_WORDS.yourRequests}
          </h2>
          {own.length === 0 ? (
            <p className={styles.line}>{PAGE_WORDS.nothingSent}</p>
          ) : (
            <ul className={styles.rows} role="list">
              {own.map((row) => (
                <li key={row.id} className={styles.row}>
                  <div className={styles.rowBody}>
                    <p className={styles.rowTitle}>{row.title}</p>
                    <p className={styles.line}>{row.line}</p>
                  </div>
                  <Chip tone={row.replied ? "success" : "warning"}>{row.chip}</Chip>
                </li>
              ))}
            </ul>
          )}
          {places.length > 0 && (
            <div className={styles.pointer}>
              <p className={styles.line}>{PAGE_WORDS.programmePageLine}</p>
              <div className={styles.choices}>
                {places.length === 1 ? (
                  <Link className={styles.link} href={programmeHref(places[0].runId)}>
                    {PAGE_WORDS.openProgrammePage}
                  </Link>
                ) : (
                  places.map((place) => (
                    <Link key={place.runId} className={styles.link} href={programmeHref(place.runId)}>
                      {place.name}
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
