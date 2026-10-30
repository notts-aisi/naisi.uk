"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import InitialsChip from "@/components/ui/InitialsChip";
import PageHead from "@/components/ui/PageHead";
import type { PersonCell, PersonColumn, PersonRow, PersonTable, PersonView } from "@/lib/surveys/onePersonLayout";
import { BLANKS_WORDS, CONFIDENTIAL_HEADING, LIST_WORDS, PERSON_WORDS, TAB_WORDS } from "@/lib/surveys/words";
import BlanksButton from "./BlanksButton";
import { surveyTabHref } from "./SurveyHead";
import blankStyles from "./blanks.module.css";
import styles from "./onePerson.module.css";

/**
 * ONE PERSON'S ANSWERS (sv-person), for admins. Once this page is open in the
 * admin's browser it asks the opening route, once, which records the opening
 * before it reads anything of the person, and draws what comes back: the
 * change questions start and end side by side, each survey's own questions,
 * when their name comes off and who has opened them. Nothing of the person
 * is on the page until then, and nothing at all when the opening could not
 * be recorded. An answer that came later, through the link of the questions
 * they left blank, says so and when; and on each survey where required
 * questions are still blank, the button that sends them those alone.
 *
 * The board's Export and Careful cards (a download of the person's answers,
 * and deleting them) are not drawn: neither is built yet, and a control for
 * something that does not exist is not drawn.
 */

type State =
  | { kind: "opening" }
  | { kind: "refused"; error: string; retry: boolean }
  | { kind: "open"; view: PersonView };

const UNREACHABLE = "We couldn’t reach the site, so nothing was opened. Check your connection and try again.";

export default function PersonAnswers({ surveyId, surveyName, who }: { surveyId: string; surveyName: string; who: string }) {
  const [state, setState] = useState<State>({ kind: "opening" });
  const asked = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/surveys/${encodeURIComponent(surveyId)}/people/${encodeURIComponent(who)}`, {
        method: "POST",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as { person?: PersonView; error?: string };
      if (response.ok && body.person) {
        setState({ kind: "open", view: body.person });
        return;
      }
      setState({ kind: "refused", error: body.error ?? PERSON_WORDS.notRecorded, retry: response.status >= 500 });
    } catch {
      setState({ kind: "refused", error: UNREACHABLE, retry: true });
    }
  }, [surveyId, who]);

  // One opening per visit: a second run of the effect (a development double
  // render) does not record a second one.
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void load();
  }, [load]);

  const again = () => {
    setState({ kind: "opening" });
    void load();
  };

  const view = state.kind === "open" ? state.view : null;
  return (
    <>
      <PageHead
        crumb={
          <nav aria-label="Breadcrumb" className={styles.crumb}>
            <Link href="/admin/surveys">{LIST_WORDS.title}</Link>
            <span aria-hidden="true">›</span>
            <Link href={`/admin/surveys/${encodeURIComponent(surveyId)}`}>{surveyName}</Link>
            <span aria-hidden="true">›</span>
            <Link href={surveyTabHref(surveyId, "answered")}>{TAB_WORDS.answered}</Link>
            {view && (
              <>
                <span aria-hidden="true">›</span>
                <span aria-current="page">{view.name}</span>
              </>
            )}
          </nav>
        }
        title={
          view ? (
            <span className={styles.who}>
              <InitialsChip name={view.name} uid={view.key} size="lg" />
              <span>{view.name}</span>
            </span>
          ) : state.kind === "refused" ? (
            PERSON_WORDS.heading
          ) : (
            PERSON_WORDS.opening
          )
        }
        meta={
          view && view.meta.length > 0 ? (
            <>
              {view.meta.map((fact, at) => (
                <Fragment key={at}>
                  {at > 0 && (
                    <span aria-hidden="true" className={styles.dot}>
                      ·
                    </span>
                  )}
                  <span>{fact}</span>
                </Fragment>
              ))}
            </>
          ) : undefined
        }
      />
      {state.kind === "refused" && (
        <div className={styles.refused} role="alert">
          <p className={styles.refusedText}>{state.error}</p>
          {state.retry && (
            <Button variant="secondary" onClick={again}>
              {PERSON_WORDS.tryAgain}
            </Button>
          )}
        </div>
      )}
      {view && <OpenedAnswers view={view} who={who} />}
    </>
  );
}

/**
 * The opened answers, drawn from what the route handed back. `who` is the
 * person's address segment, for the button that sends them the questions they
 * left blank; without it no button is drawn.
 */
export function OpenedAnswers({ view, who }: { view: PersonView; who?: string }) {
  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <div>
          <div className={styles.notice} role="status">
            <svg className={styles.lock} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <div className={styles.noticeBody}>
              <p className={styles.noticeTitle}>{CONFIDENTIAL_HEADING}</p>
              <p className={styles.noticeText}>{view.notice}</p>
            </div>
          </div>
          <p className={styles.usually}>{PERSON_WORDS.usually}</p>
        </div>
        {view.nothing && <p className={styles.nothing}>{view.nothing}</p>}
        {who && view.blanks.length > 0 && (
          <section className={blankStyles.section} aria-labelledby="left-blank">
            <h2 id="left-blank" className={blankStyles.sectionTitle}>
              {BLANKS_WORDS.personTitle}
            </h2>
            {view.blanks.map((entry) => (
              <div key={entry.surveyId} className={blankStyles.survey}>
                <p className={blankStyles.surveyName}>{entry.name}</p>
                <BlanksButton surveyId={entry.surveyId} who={who} name={view.name} row={entry.row} />
              </div>
            ))}
          </section>
        )}
        {view.change && <AnswersTable table={view.change} id="change-questions" />}
        {view.rest.map((table, at) => (
          <AnswersTable key={at} table={table} id={`survey-${at + 1}`} />
        ))}
      </div>
      <aside className={styles.aside} aria-label="About these answers">
        {view.namesOff.length > 0 && (
          <section className={styles.card} aria-labelledby="names-off">
            <h2 id="names-off" className={styles.cardTitle}>
              {PERSON_WORDS.namesOffTitle}
            </h2>
            {view.namesOff.map((line, at) => (
              <p key={at} className={styles.cardText}>
                {line}
              </p>
            ))}
          </section>
        )}
        <section className={styles.card} aria-labelledby="who-opened">
          <h2 id="who-opened" className={styles.cardTitle}>
            {PERSON_WORDS.whoOpenedTitle}
          </h2>
          <ul className={styles.openings}>
            {view.openings.map((opening, at) => (
              <li key={at} className={styles.opening}>
                <InitialsChip name={opening.name} uid={opening.key} size="md" />
                <span>{opening.line}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

function Cell({ cell, column }: { cell: PersonCell; column: PersonColumn }) {
  return (
    <td className={styles.value}>
      <span className={styles.cellLabel} aria-hidden="true">
        {column.label}
      </span>
      {cell.lines.length > 0
        ? cell.lines.map((line, at) => (
            <span key={at} className={styles.line}>
              {line}
            </span>
          ))
        : cell.note && <span className={styles.note}>{cell.note}</span>}
      {cell.later && <span className={blankStyles.later}>{cell.later}</span>}
    </td>
  );
}

function Row({ row, columns }: { row: PersonRow; columns: PersonColumn[] }) {
  if (row.kind === "section") {
    return (
      <tr className={styles.sectionRow}>
        <th scope="rowgroup" colSpan={columns.length + 1}>
          <span className={styles.sectionHeading}>{row.heading}</span>
          {row.measure && <span className={styles.measure}>{row.measure}</span>}
        </th>
      </tr>
    );
  }
  if (row.kind === "line") {
    return (
      <tr className={styles.lineRow}>
        <th scope="row" className={styles.lineLabel}>
          {row.label}
        </th>
        {columns.map((column, at) => (
          <Cell key={at} cell={row.cells[at] ?? { lines: [], note: "", later: "" }} column={column} />
        ))}
      </tr>
    );
  }
  return (
    <tr className={row.cells.length === 0 ? styles.questionHead : styles.questionRow}>
      <th scope="row" className={styles.question}>
        <span className={styles.questionLine}>
          {row.number !== null && <span className={styles.number}>{row.number}</span>}
          <span className={styles.questionWords}>
            <span className={styles.title}>{row.title}</span>
            {row.also && <span className={styles.small}>{row.also}</span>}
            {row.scale && <span className={styles.small}>{row.scale}</span>}
            {row.hint && <span className={styles.small}>{row.hint}</span>}
          </span>
        </span>
      </th>
      {row.cells.length === 0
        ? columns.map((_, at) => <td key={at} className={styles.blank} />)
        : columns.map((column, at) => <Cell key={at} cell={row.cells[at] ?? { lines: [], note: "", later: "" }} column={column} />)}
    </tr>
  );
}

function AnswersTable({ table, id }: { table: PersonTable; id: string }) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <div className={styles.sectionHead}>
        <h2 id={id} className={styles.sectionTitle}>
          {table.title}
        </h2>
        {table.line && <p className={styles.muted}>{table.line}</p>}
      </div>
      {table.empty ? (
        <p className={styles.emptyLine}>{table.empty}</p>
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={table.columns.length > 1 ? styles.questionCol : styles.questionColWide}>
                  {PERSON_WORDS.question}
                </th>
                {table.columns.map((column, at) => (
                  <th key={at} scope="col">
                    {column.label}
                    <span className={styles.when}>{column.when}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, at) => (
                <Row key={at} row={row} columns={table.columns} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
