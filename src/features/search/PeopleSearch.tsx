"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Modal from "@/components/ui/Modal";
import { queryWords, type SearchAnswer, type SearchHit } from "@/lib/search/model";
import {
  SEARCH_HEADINGS,
  SEARCH_HELP,
  SEARCH_KEY,
  SEARCH_LABEL,
  SEARCH_MORE,
  SEARCH_REFUSAL,
  SEARCH_TYPE_MORE,
  SEARCH_WAITING,
  noGroupsWords,
  noPeopleWords,
} from "@/lib/search/words";
import styles from "./PeopleSearch.module.css";

/**
 * SEARCH FOR A PERSON OR A GROUP, from the sidebar: the button that opens it,
 * the "/" key, and the dialog. Drawn only for somebody `POST /api/search`
 * answers (`useSearches`): an admin, a programme's lead or a group's
 * facilitator. Everything it shows is the route's answer, worked out on the
 * server from lists the reader may already open; nothing is kept here
 * between one opening and the next, and nothing is remembered about what was
 * typed.
 *
 * It asks after a pause in typing, or at once on Enter, never on every key,
 * and never twice for the same words: Enter while they are on their way, or
 * after they were answered with nothing, does not ask again.
 */

/** How long typing has to pause before the box asks. */
const PAUSE_MS = 350;

/** The button in the sidebar and in the phone's menu. */
export function SearchButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className={styles.trigger} onClick={onOpen} aria-haspopup="dialog" aria-keyshortcuts={SEARCH_KEY}>
      <span>{SEARCH_LABEL}</span>
      <kbd className={styles.key} aria-hidden>
        {SEARCH_KEY}
      </kbd>
    </button>
  );
}

/** Whether a key press belongs to something being typed in or edited. */
function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.closest('[contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"]') !== null;
}

/**
 * "/" anywhere opens search: never while somebody is typing in a field or an
 * editor, never with a modifier held, and never when something else has
 * already taken the key.
 */
export function useSlashToSearch(enabled: boolean, open: () => void): void {
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== SEARCH_KEY || event.defaultPrevented || event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (typingIn(event.target) || typingIn(document.activeElement)) return;
      // Another dialog is open: the key is its, not ours.
      const dialogOpen = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(
        (dialog) => dialog.closest('[aria-hidden="true"]') === null,
      );
      if (dialogOpen) return;
      event.preventDefault();
      openRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled]);
}

type State =
  | { kind: "idle" }
  | { kind: "waiting"; query: string }
  | { kind: "answered"; query: string; answer: SearchAnswer }
  | { kind: "failed"; message: string };

/** The dialog. Its contents are drawn only while it is open, so each opening starts empty. */
export default function PeopleSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} ariaLabel={SEARCH_LABEL} width="md" sheet>
      {open ? <SearchPanel onClose={onClose} /> : null}
    </Modal>
  );
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const ids = useId();
  const peopleListId = `${ids}-people-list`;
  const groupsListId = `${ids}-groups-list`;
  const optionId = (at: number) => `${ids}-option-${at}`;
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [active, setActive] = useState(-1);
  const asked = useRef(0);
  const pause = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      if (pause.current) clearTimeout(pause.current);
      inFlight.current?.abort();
    },
    [],
  );

  async function ask(query: string) {
    if (pause.current) clearTimeout(pause.current);
    inFlight.current?.abort();
    if (!queryWords(query)) {
      setState({ kind: "idle" });
      setActive(-1);
      return;
    }
    const mine = ++asked.current;
    const controller = new AbortController();
    inFlight.current = controller;
    setState({ kind: "waiting", query });
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        cache: "no-store",
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => null)) as (SearchAnswer & { error?: string }) | null;
      if (mine !== asked.current) return;
      if (!res.ok || !json || !Array.isArray(json.people) || !Array.isArray(json.groups)) {
        setState({ kind: "failed", message: res.status === 429 ? SEARCH_REFUSAL.tooMany : SEARCH_REFUSAL.failed });
        setActive(-1);
        return;
      }
      setState({ kind: "answered", query, answer: json });
      setActive(json.people.length + json.groups.length > 0 ? 0 : -1);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError" || mine !== asked.current) return;
      setState({ kind: "failed", message: SEARCH_REFUSAL.failed });
      setActive(-1);
    }
  }

  function onType(value: string) {
    setTyped(value);
    if (pause.current) clearTimeout(pause.current);
    if (!queryWords(value)) {
      inFlight.current?.abort();
      asked.current += 1;
      setState({ kind: "idle" });
      setActive(-1);
      return;
    }
    pause.current = setTimeout(() => void ask(value), PAUSE_MS);
  }

  const hits: SearchHit[] = state.kind === "answered" ? [...state.answer.people, ...state.answer.groups] : [];

  function go(hit: SearchHit) {
    // Closed directly, not through history: the page is changing, and an unwind would undo it.
    onClose();
    router.push(hit.href);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && hits.length > 0) {
      event.preventDefault();
      setActive((at) => (at + 1) % hits.length);
    } else if (event.key === "ArrowUp" && hits.length > 0) {
      event.preventDefault();
      setActive((at) => (at <= 0 ? hits.length - 1 : at - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      // These very words are on their way, or already answered: Enter opens the active result, and never asks again.
      if (state.kind === "waiting" && state.query === typed) return;
      if (state.kind === "answered" && state.query === typed) {
        if (active >= 0 && hits[active]) go(hits[active]);
        return;
      }
      void ask(typed);
    }
  }

  const answered = state.kind === "answered" ? state : null;
  const shown = answered !== null && hits.length > 0;

  const renderList = (list: SearchHit[], offset: number) =>
    list.map((hit, index) => {
      const at = offset + index;
      const isActive = at === active;
      return (
        <Link
          key={`${hit.href} ${hit.name} ${at}`}
          id={optionId(at)}
          href={hit.href}
          role="option"
          aria-selected={isActive}
          tabIndex={-1}
          className={`${styles.option} ${isActive ? styles.optionActive : ""}`}
          onMouseEnter={() => setActive(at)}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            go(hit);
          }}
        >
          <span className={styles.name}>{hit.name}</span>
          {hit.line ? <span className={styles.line}>{hit.line}</span> : null}
        </Link>
      );
    });

  return (
    <div className={styles.panel}>
      <label className={styles.field}>
        <span className={styles.label}>{SEARCH_LABEL}</span>
        <input
          type="search"
          className={styles.input}
          value={typed}
          onChange={(event) => onType(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={shown}
          aria-controls={`${peopleListId} ${groupsListId}`}
          aria-autocomplete="list"
          aria-activedescendant={shown && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={80}
        />
      </label>

      <p className={styles.status} role="status" aria-live="polite">
        {state.kind === "idle" ? SEARCH_TYPE_MORE : state.kind === "waiting" ? SEARCH_WAITING : state.kind === "failed" ? state.message : ""}
      </p>

      {answered ? (
        <div className={styles.results}>
          <section className={styles.section} aria-labelledby={`${ids}-people`}>
            <h2 id={`${ids}-people`} className={styles.heading}>
              {SEARCH_HEADINGS.people}
            </h2>
            <div id={peopleListId} role="listbox" aria-labelledby={`${ids}-people`} className={styles.list}>
              {renderList(answered.answer.people, 0)}
            </div>
            {answered.answer.people.length === 0 ? <p className={styles.empty}>{noPeopleWords(answered.query)}</p> : null}
            {answered.answer.morePeople ? <p className={styles.more}>{SEARCH_MORE.people}</p> : null}
          </section>
          <section className={styles.section} aria-labelledby={`${ids}-groups`}>
            <h2 id={`${ids}-groups`} className={styles.heading}>
              {SEARCH_HEADINGS.groups}
            </h2>
            <div id={groupsListId} role="listbox" aria-labelledby={`${ids}-groups`} className={styles.list}>
              {renderList(answered.answer.groups, answered.answer.people.length)}
            </div>
            {answered.answer.groups.length === 0 ? <p className={styles.empty}>{noGroupsWords(answered.query)}</p> : null}
            {answered.answer.moreGroups ? <p className={styles.more}>{SEARCH_MORE.groups}</p> : null}
          </section>
        </div>
      ) : null}

      <p className={styles.help}>{SEARCH_HELP}</p>
    </div>
  );
}
