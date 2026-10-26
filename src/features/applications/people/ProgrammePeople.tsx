"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import InitialsChip from "@/components/ui/InitialsChip";
import { useHydrated } from "@/hooks/useHydrated";
import { rowMatches, rowMatchesSearch } from "@/lib/applications/people/filters";
import { PEOPLE_FILTERS, type PeopleFilter, type PeopleView, type PersonRow } from "@/lib/applications/people/views";
import {
  COLUMNS,
  FILTERS_LABEL,
  FILTER_LABEL,
  NOBODY_HERE,
  NOT_IN_A_GROUP,
  OPEN_PEOPLE_IN_GROUPS,
  PAGE_SIZE,
  SEARCH_LABEL,
  SHOW_MORE,
  TABLE_CAPTION,
  WHO_SEES,
  comingWords,
  freeWords,
  invitedUntilWords,
  moreForWords,
  seeApplicationWords,
  showingWords,
  statusWords,
} from "@/lib/applications/people/words";
import styles from "./ProgrammePeople.module.css";

/**
 * A PROGRAMME'S PEOPLE TAB (board st-people), drawn from what the server
 * worked out (`loadProgrammePeople`): the filters with their counts, the
 * sentence, the search, the table and "Show more".
 *
 * Everything here is the server's: each row's words, each filter's count. The
 * browser only chooses which rows to draw, with the one function the server
 * counted with (`rowMatches`), so a filter's number is always the number of
 * rows it shows. The search narrows by name and degree line.
 *
 * BEFORE IT IS LIVE the filters, the search and the buttons are drawn and not
 * pressable, since nothing would be listening; the first twelve people are
 * on the page from the start. A word typed into the search before then is
 * kept: the box is uncontrolled, and is read when the page comes alive.
 *
 * ON A PHONE the table is drawn a card a row (the board is a laptop board):
 * the person and the More button side by side, then group, reply, when they
 * are free and status, each with its column's word, so nothing is behind a
 * sideways scroll.
 *
 * "More" offers what the viewer may already open about the person: their
 * application on this programme's review screen, and, for somebody holding a
 * place, People in groups, where they are put in a group or moved.
 */

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.searchIcon}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.whoIcon}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.5" />
    </svg>
  );
}

function TickIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.tick}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="19" cy="12" r="1.3" />
    </svg>
  );
}

/** What the More menu offers for one row: links to what the viewer may already open. */
function moreItems(row: PersonRow): { href: string; label: string }[] {
  const items: { href: string; label: string }[] = [];
  if (row.applicationHref) items.push({ href: row.applicationHref, label: seeApplicationWords(row.firstName) });
  if (row.groupsHref) items.push({ href: row.groupsHref, label: OPEN_PEOPLE_IN_GROUPS });
  return items;
}

/** The Status cell: the chip, then the reason or the line under it, then the day. */
function StatusCell({ row }: { row: PersonRow }) {
  const { status } = row;
  const tone =
    status.kind === "gave-back" || status.kind === "left"
      ? styles.chipWarn
      : status.kind === "invited"
        ? styles.chipAccent
        : styles.chipPlain;
  const line =
    status.kind === "gave-back"
      ? status.reason
      : status.kind === "invited" && status.until
        ? invitedUntilWords(status.until)
        : null;
  const day = status.kind === "holding" ? null : status.on;
  return (
    <>
      <span className={`${styles.chip} ${tone}`}>{statusWords(status)}</span>
      {line && <span className={styles.statusLine}>{line}</span>}
      {day && <span className={styles.statusDay}>{day}</span>}
    </>
  );
}

export default function ProgrammePeople({ view }: { view: PeopleView }) {
  const live = useHydrated();
  const [filter, setFilter] = useState<PeopleFilter>("everyone");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  /** The row whose More menu is open, and the button that opened it. */
  const [openUid, setOpenUid] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const menuRow = useRef<HTMLTableRowElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const menuIdBase = useId();

  // A word typed before the page came alive is kept, and read now.
  useEffect(() => {
    const typed = searchBox.current?.value ?? "";
    if (typed) setSearch(typed);
  }, []);

  // An open menu closes on Escape, giving focus back to its button, and on a
  // press anywhere outside it and its button.
  useEffect(() => {
    if (openUid === null) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRow.current?.contains(target) || opener.current?.contains(target)) return;
      setOpenUid(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenUid(null);
      opener.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [openUid]);

  const matching = view.rows.filter((row) => rowMatches(row, filter) && rowMatchesSearch(row, search));
  const drawn = matching.slice(0, shown);

  const choose = (next: PeopleFilter) => {
    setFilter(next);
    setShown(PAGE_SIZE);
    setOpenUid(null);
  };

  return (
    <div className={styles.page}>
      <div role="group" aria-label={FILTERS_LABEL} className={styles.filters}>
        {PEOPLE_FILTERS.map((each) => {
          const pressed = filter === each;
          return (
            <button
              key={each}
              type="button"
              aria-pressed={pressed}
              disabled={!live}
              className={`${styles.filter} ${pressed ? styles.filterOn : ""}`}
              onClick={() => choose(each)}
            >
              {FILTER_LABEL[each]}
              <span className={styles.filterCount}>{view.counts[each]}</span>
            </button>
          );
        })}
      </div>
      <p className={styles.sentence}>{view.sentence}</p>

      <div className={styles.tools}>
        <label className={styles.search}>
          <span className={styles.srOnly}>{SEARCH_LABEL}</span>
          <SearchIcon />
          <input
            ref={searchBox}
            type="search"
            className={styles.searchInput}
            placeholder={SEARCH_LABEL}
            defaultValue=""
            onInput={(event) => {
              setSearch(event.currentTarget.value);
              setShown(PAGE_SIZE);
              setOpenUid(null);
            }}
          />
        </label>
        <p className={styles.who}>
          <InfoIcon />
          <span>{WHO_SEES}</span>
        </p>
      </div>

      <section className={styles.card} aria-label={TABLE_CAPTION}>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>{TABLE_CAPTION}</caption>
            <thead className={styles.thead}>
              <tr>
                <th scope="col" className={`${styles.th} ${styles.colName}`}>
                  {COLUMNS.name}
                </th>
                <th scope="col" className={`${styles.th} ${styles.colGroup}`}>
                  {COLUMNS.group}
                </th>
                <th scope="col" className={`${styles.th} ${styles.colComing}`}>
                  {COLUMNS.coming}
                </th>
                <th scope="col" className={`${styles.th} ${styles.colFree}`}>
                  {COLUMNS.free}
                </th>
                <th scope="col" className={`${styles.th} ${styles.colStatus}`}>
                  {COLUMNS.status}
                </th>
                <th scope="col" className={`${styles.th} ${styles.colMore}`}>
                  <span className={styles.srOnly}>{COLUMNS.more}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {drawn.map((row) => {
                const items = moreItems(row);
                const open = openUid === row.uid;
                const menuId = `${menuIdBase}-${row.uid}`;
                return (
                  <Fragment key={row.uid}>
                    <tr className={`${styles.row} ${open ? styles.rowOpen : ""}`}>
                      <td className={`${styles.td} ${styles.cellPerson}`}>
                        <div className={styles.person}>
                          <span className={styles.avatar}>
                            <InitialsChip name={row.name} uid={row.uid} size="lg" />
                          </span>
                          <div className={styles.personText}>
                            <div className={styles.name}>{row.name}</div>
                            {row.detail && <div className={styles.detail}>{row.detail}</div>}
                          </div>
                        </div>
                      </td>
                      <td className={`${styles.td} ${styles.cellGroup}`}>
                        <span className={styles.cellWord} aria-hidden="true">
                          {COLUMNS.group}
                        </span>
                        {row.group ? (
                          <span className={styles.group}>{row.group}</span>
                        ) : (
                          <span className={styles.muted}>{NOT_IN_A_GROUP}</span>
                        )}
                      </td>
                      <td className={`${styles.td} ${styles.cellComing}`}>
                        <span className={styles.cellWord} aria-hidden="true">
                          {COLUMNS.coming}
                        </span>
                        {row.coming.kind === "yes" ? (
                          <span className={styles.yes}>
                            <TickIcon />
                            {comingWords(row.coming)}
                          </span>
                        ) : (
                          <span className={styles.muted}>{comingWords(row.coming)}</span>
                        )}
                      </td>
                      <td className={`${styles.td} ${styles.cellFree}`}>
                        <span className={styles.cellWord} aria-hidden="true">
                          {COLUMNS.free}
                        </span>
                        {row.free.kind === "not-said" ? (
                          <span className={`${styles.chip} ${styles.chipWarn}`}>{freeWords(row.free)}</span>
                        ) : (
                          <span className={row.free.kind === "fits" ? styles.free : styles.muted}>{freeWords(row.free)}</span>
                        )}
                      </td>
                      <td className={`${styles.td} ${styles.cellStatus}`}>
                        <span className={styles.cellWord} aria-hidden="true">
                          {COLUMNS.status}
                        </span>
                        <span className={styles.statusStack}>
                          <StatusCell row={row} />
                        </span>
                      </td>
                      <td className={`${styles.td} ${styles.cellMore}`}>
                        {items.length > 0 && (
                          <button
                            type="button"
                            className={`${styles.moreButton} ${open ? styles.moreButtonOpen : ""}`}
                            aria-label={moreForWords(row.name)}
                            aria-haspopup="menu"
                            aria-expanded={open}
                            aria-controls={open ? menuId : undefined}
                            disabled={!live}
                            onClick={(event) => {
                              opener.current = event.currentTarget;
                              setOpenUid(open ? null : row.uid);
                            }}
                          >
                            <DotsIcon />
                          </button>
                        )}
                      </td>
                    </tr>
                    {open && (
                      // The menu opens in a row of its own under the person's,
                      // as the board draws it, so the card never clips it.
                      <tr ref={menuRow} className={styles.menuRow}>
                        <td colSpan={6} className={styles.menuCell}>
                          <ul id={menuId} role="menu" aria-label={moreForWords(row.name)} className={styles.menu}>
                            {items.map((item) => (
                              <li key={item.href} role="none">
                                <Link href={item.href} role="menuitem" className={styles.menuItem}>
                                  {item.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {drawn.length === 0 && (
                <tr>
                  <td colSpan={6} className={`${styles.td} ${styles.empty}`}>
                    {NOBODY_HERE}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className={styles.foot}>
          <p className={styles.showing} role="status">
            {showingWords(drawn.length, matching.length)}
          </p>
          {drawn.length < matching.length && (
            <button type="button" className={styles.showMore} disabled={!live} onClick={() => setShown((was) => was + PAGE_SIZE)}>
              {SHOW_MORE}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
