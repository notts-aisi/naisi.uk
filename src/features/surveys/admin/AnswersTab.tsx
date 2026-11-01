"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import type { AnswersRow, AnswersView } from "@/lib/surveys/answersTable";
import { ANSWERS_WORDS, BLANKS_WORDS, notAnsweredHeadingWords } from "@/lib/surveys/words";
import BlanksButton from "./BlanksButton";
import ExportButton from "./ExportButton";
import styles from "./answers.module.css";
import adminStyles from "./surveyAdmin.module.css";

/** The page that opens one person's answers, every opening recorded first. */
export function personHref(surveyId: string, who: string): string {
  return `/admin/surveys/${encodeURIComponent(surveyId)}/answered/${encodeURIComponent(who)}`;
}

/** The survey's log of openings and downloads with names. */
export function logHref(surveyId: string): string {
  return `/admin/surveys/${encodeURIComponent(surveyId)}/log`;
}

type State = { kind: "opening" } | { kind: "refused"; error: string; retry: boolean } | { kind: "open"; view: AnswersView };

/**
 * A SURVEY'S ANSWERS TAB, for admins: every answer in one table,
 * one person to a row (their name, how they came or their group, each
 * question, and what they left blank, with the button that sends them those
 * questions), one person's answers beside it, who has not answered yet, and
 * the download with names.
 *
 * Nothing of anybody is on the page until it is open in the admin's browser:
 * then it asks the route, once, which records the opening of the tab before
 * it reads a name, and draws what comes back, starting with the line that
 * says it was recorded. When the opening cannot be recorded, nothing is drawn
 * but that, and a way to try again.
 */
export default function AnswersTab({ surveyId }: { surveyId: string }) {
  const [state, setState] = useState<State>({ kind: "opening" });
  const [chosen, setChosen] = useState(0);
  const asked = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/surveys/${encodeURIComponent(surveyId)}/answers`, { method: "POST", cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { answers?: AnswersView; error?: string };
      if (response.ok && body.answers) {
        setState({ kind: "open", view: body.answers });
        return;
      }
      setState({ kind: "refused", error: body.error ?? ANSWERS_WORDS.notRecorded, retry: response.status >= 500 });
    } catch {
      setState({ kind: "refused", error: ANSWERS_WORDS.unreachable, retry: true });
    }
  }, [surveyId]);

  // One opening per visit: a second run of the effect (a development double
  // render) does not record a second one.
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void load();
  }, [load]);

  if (state.kind === "opening") return <p className={adminStyles.muted}>{ANSWERS_WORDS.opening}</p>;
  if (state.kind === "refused") {
    return (
      <div className={adminStyles.section} role="alert">
        <p className={adminStyles.error}>{state.error}</p>
        {state.retry && (
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                setState({ kind: "opening" });
                void load();
              }}
            >
              {ANSWERS_WORDS.tryAgain}
            </Button>
          </div>
        )}
      </div>
    );
  }

  const { view } = state;
  const row = view.rows[chosen] ?? view.rows[0] ?? null;
  return (
    <div className={adminStyles.main}>
      <div className={styles.recorded} role="status">
        <p className={styles.recordedText}>{view.recorded}</p>
        <Link href={logHref(surveyId)} prefetch={false} className={styles.link}>
          {ANSWERS_WORDS.seeLog}
        </Link>
      </div>
      {view.rows.length === 0 ? (
        <p className={adminStyles.muted}>{ANSWERS_WORDS.nobodyYet}</p>
      ) : (
        <>
          <ExportButton surveyId={surveyId} />
          <div className={styles.layout}>
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <caption className={adminStyles.srOnlyCaption}>{ANSWERS_WORDS.caption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{ANSWERS_WORDS.person}</th>
                    {view.asHeading && <th scope="col">{view.asHeading}</th>}
                    {view.columns.map((column, at) => (
                      <th key={at} scope="col">
                        {column}
                      </th>
                    ))}
                    <th scope="col">{BLANKS_WORDS.column}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((each, at) => (
                    <tr key={at} className={each === row ? styles.current : undefined}>
                      <th scope="row" className={styles.personCell}>
                        <button
                          type="button"
                          className={styles.personButton}
                          aria-pressed={each === row}
                          aria-label={`${each.name}: ${ANSWERS_WORDS.choose}`}
                          onClick={() => setChosen(at)}
                        >
                          {each.name}
                        </button>
                        {each.note && <span className={styles.small}>{each.note}</span>}
                      </th>
                      {view.asHeading && <td>{each.as}</td>}
                      {each.cells.map((cell, column) => (
                        <td key={column}>{cell || <span className={styles.noAnswer}>{ANSWERS_WORDS.noAnswer}</span>}</td>
                      ))}
                      <td>{each.blanks && each.who && <BlanksButton surveyId={surveyId} who={each.who} name={each.name} row={each.blanks} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {row && <OnePerson surveyId={surveyId} row={row} columns={view.columns} />}
          </div>
        </>
      )}
      {view.notAnswered.length > 0 && (
        <section className={`${adminStyles.card} ${adminStyles.section}`} aria-labelledby="not-answered">
          <h2 id="not-answered" className={adminStyles.sectionTitle}>
            {notAnsweredHeadingWords(view.notAnswered.length)}
          </h2>
          <ul className={styles.waiting}>
            {view.notAnswered.map((person) => (
              <li key={person.who}>
                <Link href={personHref(surveyId, person.who)} prefetch={false} className={styles.link}>
                  {person.name}
                </Link>
                <span className={styles.small}>{person.line}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** One person's answers, beside the table: each question and what they said, and when and how they sent it. */
function OnePerson({ surveyId, row, columns }: { surveyId: string; row: AnswersRow; columns: string[] }) {
  return (
    <aside className={styles.person} aria-labelledby="one-person">
      <div className={styles.personHead}>
        <h2 id="one-person" className={styles.personName}>
          {row.name}
        </h2>
        {row.who && (
          <Link href={personHref(surveyId, row.who)} prefetch={false} className={styles.link}>
            {ANSWERS_WORDS.openPage}
          </Link>
        )}
      </div>
      <dl className={styles.answers}>
        {columns.map((column, at) => (
          <div key={at}>
            <dt>{column}</dt>
            <dd>{row.cells[at] || <span className={styles.noAnswer}>{ANSWERS_WORDS.noAnswer}</span>}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.sent}>{row.sent}</p>
    </aside>
  );
}
