"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import OptionRow from "@/components/ui/OptionRow";
import Select from "@/components/ui/Select";
import LastTermBlock from "@/features/publicNumbers/LastTermBlock";
import { useHydrated } from "@/hooks/useHydrated";
import type { LastTermBlockData, PublishedFigure } from "@/lib/publicNumbers/model";
import { PUBLIC_NUMBERS_WORDS as WORDS } from "@/lib/surveys/publicNumbersWords";
import styles from "./publicNumbers.module.css";

/** A programme in the picker: its form's id and its own joined, and its name. */
export type EditorProgramme = { value: string; label: string };
/** A number on offer: the line beside its box, its base, and what the block draws. */
export type EditorNumber = { id: string; label: string; base: string; figure: PublishedFigure; words: string };
/** A comment its writer ticked: its words, and the id Publish names it by. */
export type EditorQuote = { id: string; text: string };

type Props = {
  programmes: EditorProgramme[];
  current: string;
  programme: { roundId: string; programmeId: string; name: string };
  offer: { numbers: EditorNumber[]; quotes: EditorQuote[]; heading: string; attribution: string; footer: string };
  /** What is published now, as ids of today's offer, so its boxes start ticked. */
  picked: { numbers: string[]; quotes: string[] };
  /** "On the public page since Tue 15 Dec, published by Zach.", or null when nothing is published. */
  publishedLine: string | null;
};

const NUMBER = "number";
const QUOTE = "quote";

/** The ids ticked in the form, read from its boxes. */
function picksIn(form: HTMLFormElement): { numbers: string[]; quotes: string[] } {
  const data = new FormData(form);
  const ids = (name: string) => data.getAll(name).filter((value): value is string => typeof value === "string");
  return { numbers: ids(NUMBER), quotes: ids(QUOTE) };
}

function LockIcon() {
  return (
    <svg className={styles.lock} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/**
 * The Public numbers page's working part (sv-public): the programme picker,
 * the numbers and quotes on offer, Publish and Take it down, and the preview
 * on a phone and on a computer, drawn by the public page's own block.
 *
 * Every box is a real checkbox left to the browser, so the boxes work before
 * the page's script arrives; Publish and Take it down need the script and
 * wait for it. The picker is a form of its own that loads the page for the
 * programme picked, with Show for a page whose script has not arrived.
 */
export default function PublicNumbersEditor({ programmes, current, programme, offer, picked, publishedLine }: Props) {
  const hydrated = useHydrated();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [numbers, setNumbers] = useState<string[]>(picked.numbers);
  const [quotes, setQuotes] = useState<string[]>(picked.quotes);
  const [busy, setBusy] = useState<"publish" | "takeDown" | null>(null);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  const block: LastTermBlockData = {
    heading: offer.heading,
    numbers: offer.numbers.filter((number) => numbers.includes(number.id)).map((number) => ({ figure: number.figure, words: number.words })),
    quotes: offer.quotes.filter((quote) => quotes.includes(quote.id)).map((quote) => quote.text),
    attribution: offer.attribution,
    footer: offer.footer,
  };
  const showPreview = offer.footer !== "" && (block.numbers.length > 0 || block.quotes.length > 0);

  function onPicksChange() {
    if (!form.current) return;
    const now = picksIn(form.current);
    setNumbers(now.numbers);
    setQuotes(now.quotes);
    setDone("");
  }

  async function press(kind: "publish" | "takeDown") {
    if (!form.current || busy) return;
    setBusy(kind);
    setError("");
    setDone("");
    const ids = { roundId: programme.roundId, programmeId: programme.programmeId };
    const request =
      kind === "publish"
        ? { url: "/api/surveys/public-numbers", body: { ...ids, ...picksIn(form.current) } }
        : { url: "/api/surveys/public-numbers/take-down", body: ids };
    try {
      const response = await fetch(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request.body) });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? WORDS.failed);
        return;
      }
      setDone(kind === "publish" ? WORDS.published : WORDS.takenDown);
      router.refresh();
    } catch {
      setError(WORDS.failed);
    } finally {
      setBusy(null);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void press("publish");
  }

  function onProgramme(event: ChangeEvent<HTMLSelectElement>) {
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <>
      <div className={styles.layout}>
        <div className={styles.main}>
          <form method="get" action="/admin/surveys/public-numbers" className={styles.picker}>
            <label htmlFor="public-numbers-programme" className={styles.label}>
              {WORDS.programme}
            </label>
            <div className={styles.pickerRow}>
              <Select id="public-numbers-programme" name="programme" defaultValue={current} onChange={onProgramme} className={styles.select}>
                {programmes.map((each) => (
                  <option key={each.value} value={each.value}>
                    {each.label}
                  </option>
                ))}
              </Select>
              {!hydrated && (
                <Button type="submit" variant="secondary">
                  {WORDS.show}
                </Button>
              )}
            </div>
          </form>

          <form ref={form} className={styles.picks} onChange={onPicksChange} onSubmit={onSubmit}>
            <section className={styles.card} aria-labelledby="public-numbers-numbers">
              <div className={styles.cardHead}>
                <h2 id="public-numbers-numbers" className={styles.cardTitle}>
                  {WORDS.numbers}
                </h2>
                <span className={styles.count}>{WORDS.picked(numbers.length)}</span>
              </div>
              {offer.numbers.length === 0 ? (
                <p className={styles.empty}>{WORDS.noNumbers}</p>
              ) : (
                <div className={styles.rows}>
                  {offer.numbers.map((number) => (
                    <OptionRow key={number.id} name={NUMBER} value={number.id} defaultChecked={picked.numbers.includes(number.id)} description={number.base}>
                      {number.label}
                    </OptionRow>
                  ))}
                </div>
              )}
              <p className={styles.beliefs}>
                <LockIcon />
                <span>{WORDS.beliefs}</span>
              </p>
            </section>

            <section className={styles.card} aria-labelledby="public-numbers-quotes">
              <div className={styles.cardHead}>
                <h2 id="public-numbers-quotes" className={styles.cardTitle}>
                  {WORDS.quotes}
                </h2>
                <span className={styles.count}>{WORDS.picked(quotes.length)}</span>
              </div>
              {offer.quotes.length === 0 ? (
                <p className={styles.empty}>{WORDS.noQuotes}</p>
              ) : (
                <div className={styles.rows}>
                  {offer.quotes.map((quote) => (
                    <OptionRow key={quote.id} name={QUOTE} value={quote.id} defaultChecked={picked.quotes.includes(quote.id)} description={WORDS.ticked}>
                      {`“${quote.text}”`}
                    </OptionRow>
                  ))}
                </div>
              )}
            </section>

            <div className={styles.actions}>
              <Button type="submit" disabled={!hydrated || busy !== null}>
                {busy === "publish" ? WORDS.publishing : WORDS.publish}
              </Button>
              <p className={styles.actionLine}>{WORDS.publishLine}</p>
            </div>
            {publishedLine && (
              <div className={styles.actions}>
                <Button type="button" variant="secondary" disabled={!hydrated || busy !== null} onClick={() => void press("takeDown")}>
                  {busy === "takeDown" ? WORDS.takingDown : WORDS.takeDown}
                </Button>
                <p className={styles.actionLine}>{publishedLine}</p>
              </div>
            )}
            {done && (
              <p className={styles.done} role="status">
                {done}
              </p>
            )}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
          </form>
        </div>

        <section className={styles.preview} aria-labelledby="public-numbers-preview">
          <h2 id="public-numbers-preview" className={styles.previewTitle}>
            {WORDS.preview}
          </h2>
          <p className={styles.previewLine}>{WORDS.previewLine(programme.name)}</p>
          <p className={styles.frameLabel}>
            <span className={styles.mono}>{WORDS.phone}</span>
          </p>
          {showPreview ? (
            <div className={styles.phone}>
              <div className={styles.phoneSection}>
                <LastTermBlock {...block} headingId="public-numbers-preview-phone" />
              </div>
            </div>
          ) : (
            <p className={styles.empty}>{WORDS.previewEmpty}</p>
          )}
        </section>
      </div>

      {showPreview && (
        <section className={styles.computerPart} aria-label={WORDS.computer}>
          <p className={styles.frameLabel}>
            <span className={styles.mono}>{WORDS.computer}</span>
            <span className={styles.size}>{WORDS.computerSize}</span>
          </p>
          <div className={styles.computer}>
            <div className={styles.canvas}>
              <div className={styles.canvasSection}>
                <div className={styles.canvasInner}>
                  <LastTermBlock {...block} headingId="public-numbers-preview-computer" />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
