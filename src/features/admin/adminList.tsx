"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import styles from "./adminList.module.css";

/**
 * One-shot collection fetch with manual refresh, the replacement for the admin
 * lists' always-open onSnapshot. `load` runs once on mount and again whenever
 * `queryKey` changes (a filter that alters the underlying query); `reload()`
 * re-runs it on demand (the Refresh button). `loading` is the first-load state;
 * `refreshing` is a manual refresh in flight. State only updates from the async
 * callbacks, never synchronously in the effect, matching the existing hooks.
 */
export function useOneShotList<T>(load: () => Promise<T[]>, queryKey: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((rows) => {
        if (!cancelled) {
          setItems(rows);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `load` is rebuilt each render; gate on the stable queryKey instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  // Returns the re-read, so a caller that acted on a row can wait for the list
  // to catch up with its write instead of guessing when it has.
  const reload = useCallback(() => {
    setRefreshing(true);
    return load()
      .then((rows) => {
        setItems(rows);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setRefreshing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  return { items, loading, refreshing, error, reload };
}

/**
 * The wrapper every admin page puts its content in.
 *
 * By default it keeps the content to a reading width. `wide` lets the page
 * fill the frame instead, for the pages that are a table or a row of cards:
 * the frame already caps how wide a signed-in page gets, so a second, tighter
 * cap here only leaves the content short of the heading above it.
 */
export function AdminPage({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={wide ? `${styles.page} ${styles.pageWide}` : styles.page}>{children}</div>;
}

/**
 * The head of one admin page, under the admin area's own heading: the page's
 * name, a muted line saying what it is, and its actions on the right.
 *
 * The name is an <h2> on purpose. The admin layout renders the <h1> for every
 * page beneath it, and a page has one <h1>.
 */
export function AdminPageHead({
  title,
  description,
  meta,
  badges,
  actions,
  crumb,
  lead,
}: {
  title: ReactNode;
  /** One muted line under the name: what this page is. */
  description?: ReactNode;
  /** A smaller line under that: a count, a note about who can edit. */
  meta?: ReactNode;
  /** Chips beside the name. */
  badges?: ReactNode;
  /** Buttons. They sit at the right and wrap under the name on a phone. */
  actions?: ReactNode;
  /** The way back, above the name. */
  crumb?: ReactNode;
  /** Something drawn before the name, such as a person's initials. */
  lead?: ReactNode;
}) {
  return (
    <header className={styles.head}>
      {crumb && <div className={styles.headCrumb}>{crumb}</div>}
      <div className={styles.headRow}>
        {lead && <div className={styles.headLead}>{lead}</div>}
        <div className={styles.headMain}>
          <div className={styles.headTitleRow}>
            <h2 className={styles.headTitle}>{title}</h2>
            {badges && <div className={styles.headBadges}>{badges}</div>}
          </div>
          {description && <p className={styles.headDescription}>{description}</p>}
          {meta && <div className={styles.headMeta}>{meta}</div>}
        </div>
        {actions && <div className={styles.headActions}>{actions}</div>}
      </div>
    </header>
  );
}

/**
 * A table in a card. A wide table scrolls sideways inside the card and never
 * widens the page: the signed-in frame must not scroll sideways.
 *
 * The caller writes ordinary <thead>, <tbody>, <tr>, <th> and <td>; this sets
 * how they look. `stackOnPhone` turns each row into a small card on a phone,
 * for a table whose rows are people. Without it the table keeps its columns
 * and scrolls in its own box at every width.
 */
export function AdminTable({
  children,
  minWidth,
  stackOnPhone = false,
  caption,
}: {
  children: ReactNode;
  /** The narrowest the table is drawn before it scrolls, as a CSS length. */
  minWidth?: string;
  stackOnPhone?: boolean;
  /** Names the table for a screen reader. Not drawn. */
  caption: string;
}) {
  return (
    <div className={stackOnPhone ? `${styles.tableCard} ${styles.tableCardStack}` : styles.tableCard}>
      <div className={styles.tableScroll}>
        <table
          className={stackOnPhone ? `${styles.table} ${styles.tableStack}` : styles.table}
          style={minWidth ? ({ "--admin-table-min": minWidth } as CSSProperties) : undefined}
        >
          <caption className={styles.srOnly}>{caption}</caption>
          {children}
        </table>
      </div>
    </div>
  );
}

/** A search box with the magnifying glass inside it. Every other prop goes to the <input>. */
export function AdminSearch({
  label,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** The accessible name, and the placeholder when none is given. */
  label: string;
}) {
  return (
    <label className={className ? `${styles.search} ${className}` : styles.search}>
      <span className={styles.searchIcon} aria-hidden="true">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" />
        </svg>
      </span>
      <input
        type="search"
        aria-label={label}
        placeholder={rest.placeholder ?? label}
        className={styles.searchInput}
        {...rest}
      />
    </label>
  );
}

/** A filter that is either on or off, drawn as a pill. */
export function AdminFilterPill({
  pressed,
  onToggle,
  children,
}: {
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={pressed ? `${styles.pill} ${styles.pillOn}` : styles.pill}
      aria-pressed={pressed}
      onClick={onToggle}
    >
      {pressed && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
      {children}
    </button>
  );
}

export type AdminMoreItem = {
  key: string;
  label: ReactNode;
  /** A second, muted line: what the item does. */
  note?: ReactNode;
  /** A careful action: drawn in the careful colour. */
  careful?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

/**
 * The "more" button on a card: three dots that open a short list of the
 * things done rarely. A careful action lives here, never beside Approve.
 *
 * A disclosure, not an ARIA menu: a button that shows and hides a list of
 * buttons, which is what it is and what a keyboard already handles. Escape
 * and a press anywhere else close it.
 */
export function AdminMoreMenu({ label, items }: { label: string; items: AdminMoreItem[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={styles.more}>
      <button
        type="button"
        className={styles.moreButton}
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="6" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="18" cy="12" r="1.6" fill="currentColor" />
        </svg>
      </button>
      <div id={listId} className={styles.moreList} hidden={!open}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={item.careful ? `${styles.moreItem} ${styles.moreItemCareful}` : styles.moreItem}
            disabled={item.disabled}
            onClick={() => {
              setOpen(false);
              item.onSelect();
            }}
          >
            <span className={styles.moreItemLabel}>{item.label}</span>
            {item.note && <span className={styles.moreItemNote}>{item.note}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Indeterminate loading bar, shared with the registrations tab. */
export function AdminLoadingBar({ label = "Loading…" }: { label?: string }) {
  return (
    <div className={styles.loadingRow}>
      <span className={styles.loadingBar} aria-hidden="true" />
      <span className={styles.loadingText}>{label}</span>
    </div>
  );
}

/**
 * Client-side display pagination over an already-fetched array. The admin list
 * hooks fetch once (one-shot, not a live listener) and this bounds how many rows
 * render at a time so a long list doesn't dump hundreds of nodes on open.
 */
export function useClientPagination<T>(items: T[], pageSize = 20) {
  const [visible, setVisible] = useState(pageSize);
  const shown = useMemo(() => items.slice(0, visible), [items, visible]);
  const hasMore = items.length > shown.length;
  const loadMore = useCallback(() => setVisible((v) => v + pageSize), [pageSize]);
  const showAll = useCallback(() => setVisible(Number.MAX_SAFE_INTEGER), []);
  return {
    shown,
    hasMore,
    loadMore,
    showAll,
    total: items.length,
    shownCount: shown.length,
  };
}

/**
 * Footer for an admin list: "Showing X of Y", a Load more button when there are
 * more rows, and a Refresh button (the lists are one-shot, not realtime, so this
 * is how an admin pulls the latest).
 */
export function AdminListFooter({
  shownCount,
  total,
  hasMore,
  onLoadMore,
  onRefresh,
  refreshing = false,
  noun = "items",
}: {
  shownCount: number;
  total: number;
  hasMore: boolean;
  onLoadMore: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
  noun?: string;
}) {
  return (
    <div className={styles.footer}>
      <span className={styles.summary}>
        Showing {shownCount} of {total} {noun}
      </span>
      {hasMore && (
        <button type="button" className={styles.button} onClick={onLoadMore}>
          Load more
        </button>
      )}
      <button
        type="button"
        className={styles.button}
        onClick={onRefresh}
        disabled={refreshing}
      >
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
