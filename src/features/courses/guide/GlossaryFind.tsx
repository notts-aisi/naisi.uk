"use client";

import { useEffect, useRef, useState } from "react";
import { Runs } from "@/features/courses/weekBlocks/Prose";
import type { GlossaryTerm } from "@/lib/courses/guide/model";
import { FIND_A_TERM, noTermMatchesWords, termsCountWords } from "@/lib/courses/guide/words";
import { findTerms, foldForFind } from "@/lib/courses/guide/find";
import styles from "./guide.module.css";

/**
 * The Glossary's find box and its terms (wk-glossary): every term is in the
 * page's first HTML, in the guide's order; once the page is live, typing in
 * the box keeps the terms whose words or definition hold what was typed
 * (letters' case and accents aside), and the count says how many of them
 * there are. The box is a filter, never a form: nothing is sent anywhere.
 *
 * The box is uncontrolled, so words typed before the page was live are kept
 * and read once it is.
 */

export default function GlossaryFind({ terms }: { terms: GlossaryTerm[] }) {
  const box = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const typed = box.current?.value ?? "";
    // Words typed into the box before the page was live: read them once, now that it is.
    if (typed) setQuery(typed);
  }, []);

  // Each term keeps its place in the guide's table, which is also its key (a term may be written twice).
  const shown = findTerms(terms, query);
  const filtering = foldForFind(query) !== "";

  return (
    <>
      <div className={styles.find}>
        <div className={styles.findHead}>
          <label htmlFor="glossary-find" className={styles.findLabel}>
            {FIND_A_TERM}
          </label>
          <span className={styles.count} aria-live="polite">
            {termsCountWords(terms.length, filtering ? shown.length : null)}
          </span>
        </div>
        <div className={styles.findField}>
          <svg className={styles.findIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4.2-4.2" />
          </svg>
          <input
            ref={box}
            id="glossary-find"
            type="search"
            className={styles.findInput}
            onChange={(event) => setQuery(event.currentTarget.value)}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
        </div>
      </div>
      {shown.length > 0 ? (
        <dl className={styles.terms}>
          {shown.map(({ entry, place }) => (
            <div key={place} className={styles.term}>
              <dt className={styles.termName}>
                <Runs runs={entry.term} linkClassName={styles.inlineLink} />
              </dt>
              <dd className={styles.termText}>
                <Runs runs={entry.definition} linkClassName={styles.inlineLink} />
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className={styles.noMatch} role="status">
          {noTermMatchesWords(query)}
        </p>
      )}
    </>
  );
}
