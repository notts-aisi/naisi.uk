"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { EXPLAINER_TOPIC_MAX, type ExplainerMinutes } from "@/lib/firestore/courseExplainers";
import { EXPLAINER_WORDS, oneLineTopic } from "@/lib/courses/explainers/words";
import styles from "./explainers.module.css";

/**
 * "SCHEDULE AN EXPLAINER", the form on its page under a week's review, for
 * an admin: the topic (a theme's title to start from, or typed), who
 * explains, which groups' next sessions it opens (the theme's groups ticked),
 * and how long. The press says how many groups it is for, and the line under
 * it who gets a task and an email.
 *
 * Handed plain data by the page: ids, names and the words of each session.
 * The route decides everything again (who may explain, each group's next
 * session, one explainer to a session), so nothing here is believed.
 */

export type FormChoice = {
  groupId: string;
  sessionKey: string;
  /** "Group C, week 4: Wed 25 Nov, 3pm". */
  label: string;
  /** The topic of an explainer already opening it, or null. */
  taken: string | null;
  ticked: boolean;
};

export type FormPerson = { uid: string; name: string; role: "committee" | "admin" };

type Props = {
  roundId: string;
  programmeId: string;
  weekId: string;
  /** The review, where Cancel and a scheduled explainer lead back to. */
  reviewHref: string;
  topic: string;
  /** "From the review: ..." for a form opened from a theme, or null. */
  from: string | null;
  choices: FormChoice[];
  undated: string[];
  people: FormPerson[];
  minutes: readonly ExplainerMinutes[];
};

const DEFAULT_MINUTES = 10;

export default function ExplainerForm({ roundId, programmeId, weekId, reviewHref, topic: start, from, choices, undated, people, minutes }: Props) {
  const router = useRouter();
  const [topic, setTopic] = useState(start);
  const [who, setWho] = useState("");
  const [length, setLength] = useState<number>(minutes.includes(DEFAULT_MINUTES as ExplainerMinutes) ? DEFAULT_MINUTES : minutes[0]);
  const [ticked, setTicked] = useState(() => new Set(choices.filter((choice) => choice.ticked && !choice.taken).map((choice) => choice.groupId)));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const line = oneLineTopic(topic);
  const chosen = people.find((person) => person.uid === who) ?? null;
  const committee = people.filter((person) => person.role === "committee");
  const admins = people.filter((person) => person.role === "admin");
  const ready = line.length > 0 && line.length <= EXPLAINER_TOPIC_MAX && chosen !== null && ticked.size > 0 && !busy;

  function toggle(groupId: string, on: boolean) {
    setTicked((was) => {
      const next = new Set(was);
      if (on) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  }

  async function onSchedule(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setProblem(null);
    try {
      const sessions = choices
        .filter((choice) => ticked.has(choice.groupId) && !choice.taken)
        .map((choice) => ({ groupId: choice.groupId, sessionKey: choice.sessionKey }));
      const res = await fetch(
        `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/weeks/${encodeURIComponent(weekId)}/explainers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: line, explainerUid: who, minutes: length, sessions }),
        },
      );
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setProblem(body?.error ?? EXPLAINER_WORDS.failed);
        if (res.status === 409) router.refresh();
        return;
      }
      router.push(`${reviewHref}#review-explainers`);
      router.refresh();
    } catch {
      setProblem(EXPLAINER_WORDS.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void onSchedule(event)} aria-labelledby="explainer-title">
      <div className={styles.field}>
        <label htmlFor="explainer-topic" className={styles.label}>
          {EXPLAINER_WORDS.topic}
        </label>
        <Input
          id="explainer-topic"
          value={topic}
          maxLength={EXPLAINER_TOPIC_MAX}
          onChange={(event) => setTopic(event.target.value)}
          aria-describedby="explainer-topic-hint"
          autoComplete="off"
          required
        />
        <p id="explainer-topic-hint" className={styles.hint}>
          {from ? EXPLAINER_WORDS.fromReview(from) : EXPLAINER_WORDS.typeTopic}{" "}
          {EXPLAINER_WORDS.topicLeft(EXPLAINER_TOPIC_MAX - topic.length)}
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="explainer-who" className={styles.label}>
          {EXPLAINER_WORDS.who}
        </label>
        {people.length === 0 ? (
          <p className={styles.hint}>{EXPLAINER_WORDS.nobodyToAsk}</p>
        ) : (
          <Select id="explainer-who" value={who} onChange={(event) => setWho(event.target.value)} aria-describedby="explainer-who-hint" required>
            <option value="">{EXPLAINER_WORDS.choose}</option>
            {committee.length > 0 && (
              <optgroup label={EXPLAINER_WORDS.committee}>
                {committee.map((person) => (
                  <option key={person.uid} value={person.uid}>
                    {person.name}
                  </option>
                ))}
              </optgroup>
            )}
            {admins.length > 0 && (
              <optgroup label={EXPLAINER_WORDS.admins}>
                {admins.map((person) => (
                  <option key={person.uid} value={person.uid}>
                    {person.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        )}
        <p id="explainer-who-hint" className={styles.hint}>
          {EXPLAINER_WORDS.whoHint}
        </p>
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>{EXPLAINER_WORDS.atStartOf}</legend>
        {choices.length === 0 ? (
          <p className={styles.hint}>{EXPLAINER_WORDS.noSessionsToCome}</p>
        ) : (
          <ul className={styles.choices}>
            {choices.map((choice) => (
              <li key={choice.groupId}>
                <label className={styles.choice}>
                  <input
                    type="checkbox"
                    checked={ticked.has(choice.groupId) && !choice.taken}
                    disabled={choice.taken !== null}
                    onChange={(event) => toggle(choice.groupId, event.target.checked)}
                  />
                  <span className={styles.choiceText}>
                    <span>{choice.label}</span>
                    {choice.taken && <span className={styles.choiceNote}>{EXPLAINER_WORDS.alreadyStarts(choice.taken)}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {undated.length > 0 && <p className={styles.hint}>{EXPLAINER_WORDS.noTime(undated)}</p>}
      </fieldset>

      <div className={styles.field}>
        <label htmlFor="explainer-minutes" className={styles.label}>
          {EXPLAINER_WORDS.howLong}
        </label>
        <Select id="explainer-minutes" value={String(length)} onChange={(event) => setLength(Number(event.target.value))}>
          {minutes.map((each) => (
            <option key={each} value={String(each)}>
              {EXPLAINER_WORDS.minutesOption(each)}
            </option>
          ))}
        </Select>
      </div>

      <p className={styles.hint}>{EXPLAINER_WORDS.whoSees(length, line)}</p>

      <div className={styles.actions}>
        <Link href={reviewHref} className={styles.linkButton}>
          {EXPLAINER_WORDS.cancel}
        </Link>
        <Button type="submit" disabled={!ready}>
          {busy ? EXPLAINER_WORDS.scheduling : EXPLAINER_WORDS.schedule(ticked.size)}
        </Button>
      </div>
      <p className={styles.hint}>{chosen ? EXPLAINER_WORDS.gets(chosen.name) : EXPLAINER_WORDS.getsNobodyYet}</p>
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
    </form>
  );
}
