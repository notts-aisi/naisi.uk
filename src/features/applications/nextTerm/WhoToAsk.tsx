"use client";

import Link from "next/link";
import { useState } from "react";
import kit from "@/features/applications/kit/kit.module.css";
import { useHydrated } from "@/hooks/useHydrated";
import type { NextTermRow, NextTermTab, NextTermView } from "@/lib/applications/nextTerm/rows";
import { NEXT_TERM_WORDS, ratingsWords } from "@/lib/applications/nextTerm/words";
import type { NoteSuggestion } from "@/lib/memberNotes/model";
import shared from "../decisionDay/decisionDay.module.css";
import Icon from "../decisionDay/Icon";
import { Pill } from "../decisionDay/parts";
import styles from "./WhoToAsk.module.css";

/**
 * Next term: who to ask. Three tabs, one for each thing a note can suggest
 * somebody for, each with how many people it lists; on Facilitating, a box
 * that keeps the list to the people who offered on their application.
 *
 * Everything here was worked out on the server (`buildNextTerm`): this
 * chooses a tab and a filter, and counts nothing it was not handed. Nothing
 * is saved and nothing is sent, so there is no button that does either.
 *
 * Below 48rem each row stands as a card of its own, each value under the
 * heading of its column, so the page never scrolls sideways.
 */

const COLUMNS = NEXT_TERM_WORDS.columns;

const APPLICATION_TONE = { offered: "ok", no: "neutral", "no-answer": "neutral" } as const;

function Row({ row }: { row: NextTermRow }) {
  return (
    <tr className={styles.row}>
      <th scope="row" className={styles.person}>
        <Link className={styles.personLink} href={`/admin/members/${encodeURIComponent(row.uid)}`}>
          {row.name}
        </Link>
      </th>
      <td data-label={COLUMNS.place}>
        {row.places.length > 0 ? (
          <ul className={styles.places}>
            {row.places.map((place) => (
              <li key={place}>{place}</li>
            ))}
          </ul>
        ) : null}
      </td>
      <td data-label={COLUMNS.suggestedIn} className={styles.nowrap}>
        {row.suggestedIn}
      </td>
      <td data-label={COLUMNS.ratings} className={row.ratings.length === 0 ? styles.muted : styles.ratings}>
        {ratingsWords(row.ratings)}
      </td>
      <td data-label={COLUMNS.application}>
        <Pill tone={APPLICATION_TONE[row.application]}>{NEXT_TERM_WORDS.application[row.application]}</Pill>
      </td>
      <td data-label={COLUMNS.words} className={styles.wordsCell}>
        {row.words ? (
          <p className={styles.words}>
            <span className={styles.quote}>{NEXT_TERM_WORDS.quoted(row.words.text)}</span>{" "}
            <span className={styles.by}>{NEXT_TERM_WORDS.by(row.words.by)}</span>
          </p>
        ) : (
          <span className={styles.muted}>{NEXT_TERM_WORDS.noWords}</span>
        )}
      </td>
    </tr>
  );
}

function Empty({ tab, filtered }: { tab: NextTermTab; filtered: boolean }) {
  if (filtered) return <p className={styles.empty}>{NEXT_TERM_WORDS.noneOffered}</p>;
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{NEXT_TERM_WORDS.empty[tab.key]}</p>
      <p>{NEXT_TERM_WORDS.emptyHow}</p>
    </div>
  );
}

export default function WhoToAsk({ view }: { view: NextTermView }) {
  // A tab or the box is live only once the page's script is running: before
  // that a press would do nothing and say nothing.
  const hydrated = useHydrated();
  const [key, setKey] = useState<NoteSuggestion>(view.tabs[0]?.key ?? "facilitating");
  const [offeredOnly, setOfferedOnly] = useState(false);

  const tab = view.tabs.find((each) => each.key === key) ?? view.tabs[0];
  if (!tab) return null;
  const filtering = tab.key === "facilitating" && offeredOnly;
  const rows = filtering ? tab.rows.filter((row) => row.application === "offered") : tab.rows;

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="group" aria-label={NEXT_TERM_WORDS.tabsLabel}>
          {view.tabs.map((each) => (
            <button
              key={each.key}
              type="button"
              className={each.key === tab.key ? `${styles.tab} ${styles.tabOn}` : styles.tab}
              aria-pressed={each.key === tab.key}
              disabled={!hydrated}
              onClick={() => setKey(each.key)}
            >
              {each.label}
              <span className={styles.tabCount}>{each.rows.length}</span>
            </button>
          ))}
        </div>
        {tab.key === "facilitating" ? (
          <label className={styles.offered}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={offeredOnly}
              disabled={!hydrated}
              onChange={(event) => setOfferedOnly(event.target.checked)}
            />
            <span>{NEXT_TERM_WORDS.offeredOnly}</span>
          </label>
        ) : null}
      </div>

      <p className={`${shared.note} ${styles.rule}`}>
        <Icon name="info" size={16} className={shared.noteIcon} />
        <span>{NEXT_TERM_WORDS.rule}</span>
      </p>

      <section className={`${shared.card} ${styles.people}`} aria-label={NEXT_TERM_WORDS.tableCaption(tab.label)}>
        {rows.length === 0 ? (
          <Empty tab={tab} filtered={filtering && tab.rows.length > 0} />
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>{NEXT_TERM_WORDS.tableCaption(tab.label)}</caption>
              <thead>
                <tr>
                  <th scope="col" className={kit.mono}>
                    {COLUMNS.person}
                  </th>
                  <th scope="col" className={kit.mono}>
                    {COLUMNS.place}
                  </th>
                  <th scope="col" className={kit.mono}>
                    {COLUMNS.suggestedIn}
                  </th>
                  <th scope="col" className={kit.mono}>
                    {COLUMNS.ratings}
                  </th>
                  <th scope="col" className={kit.mono}>
                    {COLUMNS.application}
                  </th>
                  <th scope="col" className={kit.mono}>
                    {COLUMNS.words}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Row key={row.uid} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtering && rows.length > 0 && rows.length < tab.rows.length ? (
          <p className={styles.showing}>{NEXT_TERM_WORDS.showing(rows.length, tab.rows.length)}</p>
        ) : null}
      </section>

      <section className={`${shared.card} ${styles.noList}`} aria-labelledby="no-list">
        <h2 id="no-list" className={styles.noListTitle}>
          {NEXT_TERM_WORDS.noList.title}
        </h2>
        <p className={styles.noListText}>{NEXT_TERM_WORDS.noList.text}</p>
      </section>
    </>
  );
}
