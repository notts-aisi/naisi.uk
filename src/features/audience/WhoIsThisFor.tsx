"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import Select from "@/components/ui/Select";
import { isGridRow, type GridRow } from "@/lib/audience/kind";
import type { Catalogue, CountView, WhoLine } from "@/lib/audience/resolve";
import type { Selection } from "@/lib/audience/tags";
import {
  INCLUDE_SIGN,
  LEAVE_OUT_SIGN,
  MODE_LABELS,
  PICKER_WORDS,
  emailedWords,
  headlineWords,
  leftOutWords,
  modeWords,
} from "@/lib/audience/words";
import styles from "./WhoIsThisFor.module.css";

/**
 * "WHO IS THIS FOR?": add tags to include people, leave them out with the
 * minus sign, and read how many it reaches, how many would be emailed, who
 * is left out and why, and how it would be sent.
 *
 * Everything it shows comes from the server (`/api/audience` and
 * `/api/audience/who`), which works the people out from the records each
 * time and offers only the tags the person may use. This component keeps
 * only what has been chosen. It sends nothing; a page that sends hands the
 * selection it reports to its own route, which resolves it again with the
 * same code, so the number here is the number sent.
 */

type Sign = "include" | "exclude";
type Chosen = { id: string; sign: Sign };

export type AudienceChoice = Selection & { row: GridRow | null };

type Props = {
  /** A selection to start from, such as one a page has kept. */
  initial?: Partial<AudienceChoice>;
  /** Told the selection and its count whenever either changes; the count is null while it is being worked out. */
  onChange?: (choice: AudienceChoice, count: CountView | null) => void;
};

/** How long a change waits for the next before the count is asked for. */
const SETTLE_MS = 250;
/** How many matches the box offers for what is typed. */
const MATCHES_SHOWN = 8;

const post = (url: string, body: string, signal: AbortSignal) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, signal }).then(async (res) => {
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok || !json || typeof json !== "object") throw new Error(`status ${res.status}`);
    return json as Record<string, unknown>;
  });

export default function WhoIsThisFor({ initial, onChange }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [chosen, setChosen] = useState<Chosen[]>(() => [
    ...(initial?.include ?? []).map((tag): Chosen => ({ id: tag, sign: "include" })),
    ...(initial?.exclude ?? []).map((tag): Chosen => ({ id: tag, sign: "exclude" })),
  ]);
  const [row, setRow] = useState<GridRow | null>(initial?.row ?? null);
  const [query, setQuery] = useState("");
  const [browsing, setBrowsing] = useState(false);

  const [count, setCount] = useState<{ key: string; view: CountView } | null>(null);
  const [countFailedFor, setCountFailedFor] = useState<string | null>(null);
  const [countAttempt, setCountAttempt] = useState(0);

  const [whoOpen, setWhoOpen] = useState(false);
  const [who, setWho] = useState<{ key: string; lines: WhoLine[] } | null>(null);
  const [whoFailedFor, setWhoFailedFor] = useState<string | null>(null);
  const [whoAttempt, setWhoAttempt] = useState(0);

  // The tags this person may use, once.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/audience", { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as Catalogue | null;
        if (!res.ok || !json || !Array.isArray(json.groups)) throw new Error(`status ${res.status}`);
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setCatalogue(json);
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const choice = useMemo<AudienceChoice>(
    () => ({
      include: chosen.filter((each) => each.sign === "include").map((each) => each.id),
      exclude: chosen.filter((each) => each.sign === "exclude").map((each) => each.id),
      row,
    }),
    [chosen, row],
  );
  const key = JSON.stringify(choice);
  const anything = chosen.length > 0;

  // The count, a moment after the last change.
  useEffect(() => {
    if (!anything) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      post("/api/audience", key, controller.signal)
        .then((json) => {
          const view = json.count as CountView | undefined;
          if (!view || typeof view.people !== "number") throw new Error("no count");
          setCount({ key, view });
          setCountFailedFor(null);
        })
        .catch(() => {
          if (!controller.signal.aborted) setCountFailedFor(key);
        });
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, anything, countAttempt]);

  // The names, while See who is open.
  useEffect(() => {
    if (!whoOpen || !anything) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      post("/api/audience/who", key, controller.signal)
        .then((json) => {
          if (!Array.isArray(json.people)) throw new Error("no names");
          setWho({ key, lines: json.people as WhoLine[] });
          setWhoFailedFor(null);
        })
        .catch(() => {
          if (!controller.signal.aborted) setWhoFailedFor(key);
        });
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [whoOpen, key, anything, whoAttempt]);

  const current = anything && count?.key === key ? count.view : null;

  // Whoever holds this picker hears about every change.
  const told = useRef(onChange);
  useEffect(() => {
    told.current = onChange;
  }, [onChange]);
  useEffect(() => {
    told.current?.(choice, current);
  }, [choice, current]);

  const labels = useMemo(() => {
    const out = new Map<string, { label: string; hint: string | null; count: number | null }>();
    for (const group of catalogue?.groups ?? []) {
      for (const tag of group.tags) out.set(tag.id, { label: tag.label, hint: tag.hint, count: tag.count });
    }
    for (const person of catalogue?.names ?? []) out.set(person.id, { label: person.name, hint: null, count: null });
    return out;
  }, [catalogue]);

  const matches = useMemo(() => {
    const typed = query.trim().toLowerCase();
    if (!typed) return [];
    const out: { id: string; label: string; hint: string | null; count: number | null }[] = [];
    for (const [tagId, tag] of labels) {
      if (tag.label.toLowerCase().includes(typed)) out.push({ id: tagId, ...tag });
      if (out.length >= MATCHES_SHOWN) break;
    }
    return out;
  }, [labels, query]);

  const signOf = (tagId: string): Sign | null => chosen.find((each) => each.id === tagId)?.sign ?? null;

  /** Choose a tag with a sign; choosing the sign it already has takes it off. */
  const choose = (tagId: string, sign: Sign) => {
    setChosen((was) => {
      const at = was.find((each) => each.id === tagId);
      if (at?.sign === sign) return was.filter((each) => each.id !== tagId);
      if (at) return was.map((each) => (each.id === tagId ? { id: tagId, sign } : each));
      return [...was, { id: tagId, sign }];
    });
  };
  const flip = (tagId: string) =>
    setChosen((was) => was.map((each) => (each.id === tagId ? { id: tagId, sign: each.sign === "include" ? "exclude" : "include" } : each)));
  const remove = (tagId: string) => setChosen((was) => was.filter((each) => each.id !== tagId));
  const pick = (tagId: string, sign: Sign) => {
    if (signOf(tagId) !== sign) choose(tagId, sign);
    setQuery("");
    inputRef.current?.focus();
  };

  if (loadFailed) {
    return (
      <div className={styles.picker}>
        <p className={styles.problem} role="alert">
          {PICKER_WORDS.loadFailed}
        </p>
        <div>
          <Button variant="secondary" onClick={() => setLoadAttempt((n) => n + 1)}>
            {PICKER_WORDS.retry}
          </Button>
        </div>
      </div>
    );
  }
  if (!catalogue) {
    return (
      <div className={styles.picker}>
        <p className={styles.quiet} role="status">
          {PICKER_WORDS.loading}
        </p>
      </div>
    );
  }
  if (catalogue.groups.length === 0 && catalogue.names.length === 0) {
    return (
      <div className={styles.picker}>
        <p className={styles.quiet}>{PICKER_WORDS.noTags}</p>
      </div>
    );
  }

  const shown = current ?? (anything ? count?.view ?? null : null);
  const counting = anything && !current && countFailedFor !== key;
  const rowShown: GridRow = row ?? shown?.suggestedRow ?? "courses";
  const whoLines = who?.key === key ? who.lines : null;

  return (
    <div className={styles.picker}>
      <div className={styles.head}>
        <h3 className={styles.title} id={`${id}-title`}>
          {PICKER_WORDS.title}
        </h3>
        <p className={styles.hint} id={`${id}-hint`}>
          {PICKER_WORDS.hint}
        </p>
      </div>

      <div className={styles.box}>
        {chosen.map((each) => {
          const label = labels.get(each.id)?.label ?? PICKER_WORDS.goneTag;
          const leaving = each.sign === "exclude";
          return (
            <span key={each.id} className={`${styles.chip} ${leaving ? styles.chipOut : styles.chipIn}`}>
              <button
                type="button"
                className={styles.sign}
                onClick={() => flip(each.id)}
                aria-label={leaving ? `${label}: left out. Include them instead` : `${label}: included. Leave them out instead`}
              >
                <span aria-hidden="true">{leaving ? LEAVE_OUT_SIGN : INCLUDE_SIGN}</span>
              </button>
              <span className={styles.chipLabel}>{label}</span>
              <button
                type="button"
                className={styles.remove}
                onClick={() => remove(each.id)}
                aria-label={`${PICKER_WORDS.remove} ${label}`}
              >
                <span aria-hidden="true">×</span>
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          id={`${id}-input`}
          className={styles.input}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={PICKER_WORDS.inputPlaceholder}
          aria-label={PICKER_WORDS.inputLabel}
          aria-describedby={`${id}-hint`}
          autoComplete="off"
        />
      </div>

      {query.trim() !== "" && (
        <div className={styles.matches} role="region" aria-label={PICKER_WORDS.inputLabel}>
          {matches.length === 0 ? (
            <p className={styles.quiet}>{PICKER_WORDS.noMatch}</p>
          ) : (
            <ul className={styles.list}>
              {matches.map((match) => (
                <TagRow key={match.id} label={match.label} hint={match.hint} count={match.count} sign={signOf(match.id)} onPick={(sign) => pick(match.id, sign)} />
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={styles.count} aria-live="polite">
        {!anything ? (
          <p className={styles.quiet}>{PICKER_WORDS.nothingChosen}</p>
        ) : countFailedFor === key ? (
          <div className={styles.countLine}>
            <p className={styles.problem}>{PICKER_WORDS.countFailed}</p>
            <Button variant="secondary" onClick={() => setCountAttempt((n) => n + 1)}>
              {PICKER_WORDS.retry}
            </Button>
          </div>
        ) : shown ? (
          <div className={`${styles.countLine} ${counting ? styles.stale : ""}`}>
            <strong className={styles.headline}>{headlineWords(shown.people, shown.you)}</strong>
            <span className={styles.emailed}>{emailedWords(shown.emailed, shown.leftOut)}</span>
            {shown.people > 0 && (
              <Button variant="ghost" aria-expanded={whoOpen} onClick={() => setWhoOpen((open) => !open)}>
                {whoOpen ? PICKER_WORDS.hideWho : PICKER_WORDS.seeWho}
              </Button>
            )}
            {counting && <span className={styles.quiet}>{PICKER_WORDS.counting}</span>}
          </div>
        ) : (
          <p className={styles.quiet}>{PICKER_WORDS.counting}</p>
        )}
      </div>

      {anything && shown && shown.people === 0 && !counting && <p className={styles.quiet}>{PICKER_WORDS.nobody}</p>}

      {anything && shown && shown.people > 0 && (
        <div className={styles.panel}>
          <div className={styles.mode}>
            <Chip tone={shown.mode === "notice" ? "accent" : "neutral"}>{MODE_LABELS[shown.mode]}</Chip>
            <p className={styles.modeWords}>{modeWords(shown.mode, rowShown, shown.tagsAllow)}</p>
          </div>
          {shown.mode === "grid" && (
            <div className={styles.rowChoice}>
              <label className={styles.rowLabel} htmlFor={`${id}-row`}>
                {PICKER_WORDS.rowLabel}
              </label>
              <Select
                id={`${id}-row`}
                value={rowShown}
                onChange={(event) => {
                  const value = event.target.value;
                  if (isGridRow(value)) setRow(value);
                }}
              >
                {catalogue.rows.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      )}

      {anything && shown && shown.leftOut > 0 && (
        <div className={styles.panel}>
          <h4 className={styles.panelTitle}>{PICKER_WORDS.leftOutTitle}</h4>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{PICKER_WORDS.why}</th>
                <th scope="col" className={styles.number}>
                  {PICKER_WORDS.people}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.reasons.map((each) => (
                <tr key={each.reason}>
                  <td>{leftOutWords(each.reason, shown.row)}</td>
                  <td className={styles.number}>{each.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {whoOpen && anything && (
        <div className={styles.panel}>
          {whoFailedFor === key ? (
            <div className={styles.countLine}>
              <p className={styles.problem}>{PICKER_WORDS.whoFailed}</p>
              <Button variant="secondary" onClick={() => setWhoAttempt((n) => n + 1)}>
                {PICKER_WORDS.retry}
              </Button>
            </div>
          ) : !whoLines ? (
            <p className={styles.quiet}>{PICKER_WORDS.counting}</p>
          ) : (
            <WhoList lines={whoLines} row={shown?.row ?? rowShown} />
          )}
        </div>
      )}

      <div className={styles.browse}>
        <Button variant="secondary" aria-expanded={browsing} onClick={() => setBrowsing((open) => !open)}>
          {browsing ? PICKER_WORDS.browseHide : PICKER_WORDS.browse}
        </Button>
        {browsing && (
          <div className={styles.groups}>
            {catalogue.groups.map((group) => (
              <section key={group.heading} className={styles.group} aria-label={group.heading}>
                <h4 className={styles.groupHeading}>{group.heading}</h4>
                <ul className={styles.list}>
                  {group.tags.map((tag) => (
                    <TagRow key={tag.id} label={tag.listLabel} hint={tag.hint} count={tag.count} sign={signOf(tag.id)} onPick={(sign) => choose(tag.id, sign)} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One tag in a list, with a button to include its people and one to leave them out; a pressed one takes it off again. */
function TagRow({
  label,
  hint,
  count,
  sign,
  onPick,
}: {
  label: string;
  hint: string | null;
  count: number | null;
  sign: Sign | null;
  onPick: (sign: Sign) => void;
}) {
  return (
    <li className={styles.row}>
      <span className={styles.rowText}>
        <span className={styles.rowName}>{label}</span>
        {hint && <span className={styles.rowHint}>{hint}</span>}
      </span>
      {count !== null && <span className={styles.rowCount}>{count}</span>}
      <span className={styles.rowButtons}>
        <button
          type="button"
          className={`${styles.pickButton} ${sign === "include" ? styles.pickedIn : ""}`}
          aria-pressed={sign === "include"}
          aria-label={`${PICKER_WORDS.add} ${label}`}
          onClick={() => onPick("include")}
        >
          <span aria-hidden="true">{INCLUDE_SIGN}</span>
        </button>
        <button
          type="button"
          className={`${styles.pickButton} ${sign === "exclude" ? styles.pickedOut : ""}`}
          aria-pressed={sign === "exclude"}
          aria-label={`${PICKER_WORDS.leaveOut} ${label}`}
          onClick={() => onPick("exclude")}
        >
          <span aria-hidden="true">{LEAVE_OUT_SIGN}</span>
        </button>
      </span>
    </li>
  );
}

/** See who: the names, those to be emailed first, then those left out. */
function WhoList({ lines, row }: { lines: WhoLine[]; row: GridRow }) {
  const emailed = lines.filter((line) => line.emailed);
  const left = lines.filter((line) => !line.emailed);
  const name = (line: WhoLine) => (line.you ? `${line.name} (${PICKER_WORDS.you})` : line.name);
  return (
    <div className={styles.who}>
      {emailed.length > 0 && (
        <section aria-label={PICKER_WORDS.willBeEmailed}>
          <h4 className={styles.panelTitle}>
            {PICKER_WORDS.willBeEmailed} ({emailed.length})
          </h4>
          <ul className={styles.names}>
            {emailed.map((line, index) => (
              <li key={`${line.name}-${index}`}>{name(line)}</li>
            ))}
          </ul>
        </section>
      )}
      {left.length > 0 && (
        <section aria-label={PICKER_WORDS.leftOutHeading}>
          <h4 className={styles.panelTitle}>
            {PICKER_WORDS.leftOutHeading} ({left.length})
          </h4>
          <ul className={styles.names}>
            {left.map((line, index) => (
              <li key={`${line.name}-${index}`}>
                {name(line)}
                {line.reason && <span className={styles.reason}>{leftOutWords(line.reason, row)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
