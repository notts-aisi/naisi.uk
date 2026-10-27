"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import {
  PITCH_LIMITS,
  pickedWords,
  type MyPitch,
  type PitchRow,
  type PitchingView,
} from "@/lib/courses/pitching/model";
import styles from "./PitchingWeek.module.css";

/**
 * PITCHING WEEK, for somebody taking part (board in-pitch-phone, drawn at
 * 390 and laid out the same way, wider, at 1440).
 *
 * Everything here comes from the server's `PitchingView`, sentences included:
 * the page renders it and sends the two presses (save my pitch, "I’d join
 * this") to their routes, which answer with the view as it now stands. No
 * count of anybody else's picks is ever in the view, so none can be shown.
 *
 * BEFORE THE SCRIPT ARRIVES the page is complete and nothing on it pretends
 * to work: "Edit until 6pm" is an address (`?edit=1`), the form's boxes are
 * uncontrolled so nothing typed is lost, and the buttons that need the script
 * are disabled until it is there (`useHydrated`).
 *
 * After the group's session starts (`view.open` false) everything is read
 * only: no form, no edit link, and the toggles keep their state, disabled.
 */

const ANOTHER_PAPER = "typed";

type Props = { initial: PitchingView; editing: boolean };

async function post(path: string, body: unknown): Promise<{ view?: PitchingView; error?: string }> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { view?: PitchingView; error?: string };
    if (!response.ok) return { error: data.error ?? "That didn’t save. Try again." };
    return data;
  } catch {
    return { error: "That didn’t save: check your connection and try again." };
  }
}

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.icon}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.icon}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.tick}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** The person's pitch once it is sent. */
function PitchCard({ mine, editUntil }: { mine: MyPitch; editUntil: string | null }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{mine.title}</h3>
        <span className={styles.sent}>
          <span className={styles.sentDot} aria-hidden="true" />
          Sent
        </span>
      </div>
      <p className={styles.cardLine}>
        <span className={styles.cardLabel}>Paper:</span> {mine.paperTitle}
      </p>
      <p className={styles.cardLine}>
        <span className={styles.cardLabel}>Twist:</span> {mine.twist}
      </p>
      {mine.partner && (
        <p className={styles.cardLine}>
          <span className={styles.cardLabel}>Partner:</span> {mine.partner.name}
        </p>
      )}
      {editUntil ? (
        <div className={styles.cardFoot}>
          <Link href="?edit=1" scroll={false} className={styles.editLink}>
            <span>{editUntil}</span>
            <ArrowRight />
          </Link>
        </div>
      ) : (
        <div className={styles.cardFootQuiet} />
      )}
    </div>
  );
}

/** Making or changing the person's pitch. Uncontrolled, so it works the moment it is on screen. */
function PitchForm({
  view,
  onSaved,
}: {
  view: PitchingView;
  onSaved: (next: PitchingView) => void;
}) {
  const hydrated = useHydrated();
  const id = useId();
  const mine = view.mine;
  const pathname = usePathname();
  const formBox = useRef<HTMLFormElement>(null);
  const twistBox = useRef<HTMLTextAreaElement>(null);
  // A pitch whose reading has since left the week opens on "Another paper",
  // with the title it was pitched under, rather than on somebody else's paper.
  const readingStill = mine?.readingId ? view.readings.some((reading) => reading.id === mine.readingId) : false;
  const firstPaper = mine
    ? readingStill && mine.readingId
      ? mine.readingId
      : ANOTHER_PAPER
    : (view.readings[0]?.id ?? ANOTHER_PAPER);
  const [paperChoice, setPaperChoice] = useState(firstPaper);
  const [twistLeft, setTwistLeft] = useState(PITCH_LIMITS.twist - (mine?.twist.length ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What was chosen or typed before the script arrived is what the form holds.
  useEffect(() => {
    const paper = formBox.current?.elements.namedItem("paper");
    if (paper instanceof HTMLSelectElement) setPaperChoice(paper.value);
    if (twistBox.current) setTwistLeft(PITCH_LIMITS.twist - twistBox.current.value.length);
  }, []);

  const sentByMe = !mine || mine.sentByMe;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const choice = String(form.get("paper") ?? ANOTHER_PAPER);
    const body = {
      title: String(form.get("title") ?? ""),
      paper:
        choice === ANOTHER_PAPER
          ? { kind: "typed", title: String(form.get("paperTitle") ?? "") }
          : { kind: "reading", materialId: choice },
      twist: String(form.get("twist") ?? ""),
      // Who is on a pitch is its sender's to choose, so a partner's save names
      // nobody and the server keeps the pitch's people as they are.
      partnerUid: sentByMe ? String(form.get("partner") ?? "") || null : null,
    };
    setBusy(true);
    setError(null);
    const answer = await post(`/api/courses/runs/${encodeURIComponent(view.runId)}/pitching/pitch`, body);
    setBusy(false);
    if (answer.view) onSaved(answer.view);
    else setError(answer.error ?? "That didn’t save. Try again.");
  }

  return (
    <form ref={formBox} className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor={`${id}-title`} className={styles.label}>
          Title
        </label>
        <input
          id={`${id}-title`}
          name="title"
          className={styles.input}
          defaultValue={mine?.title ?? ""}
          maxLength={PITCH_LIMITS.title}
          autoComplete="off"
          required
        />
      </div>

      <div className={styles.field}>
        <label htmlFor={`${id}-paper`} className={styles.label}>
          Paper
        </label>
        <Select
          id={`${id}-paper`}
          name="paper"
          defaultValue={firstPaper}
          onChange={(event) => setPaperChoice(event.currentTarget.value)}
        >
          {view.readings.map((reading) => (
            <option key={reading.id} value={reading.id}>
              {reading.title}
            </option>
          ))}
          <option value={ANOTHER_PAPER}>Another paper</option>
        </Select>
      </div>

      {paperChoice === ANOTHER_PAPER && (
        <div className={styles.field}>
          <label htmlFor={`${id}-paper-title`} className={styles.label}>
            Which paper
          </label>
          <input
            id={`${id}-paper-title`}
            name="paperTitle"
            className={styles.input}
            defaultValue={mine && !readingStill ? mine.paperTitle : ""}
            maxLength={PITCH_LIMITS.paper}
            autoComplete="off"
          />
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor={`${id}-twist`} className={styles.label}>
          Twist
        </label>
        <textarea
          ref={twistBox}
          id={`${id}-twist`}
          name="twist"
          className={`${styles.input} ${styles.textarea}`}
          rows={3}
          defaultValue={mine?.twist ?? ""}
          maxLength={PITCH_LIMITS.twist}
          aria-describedby={`${id}-twist-left`}
          onChange={(event) => setTwistLeft(PITCH_LIMITS.twist - event.currentTarget.value.length)}
        />
        <p id={`${id}-twist-left`} className={styles.help}>
          {twistLeft} {twistLeft === 1 ? "character" : "characters"} left
        </p>
      </div>

      {sentByMe ? (
        <div className={styles.field}>
          <label htmlFor={`${id}-partner`} className={styles.label}>
            Partner
          </label>
          <Select id={`${id}-partner`} name="partner" defaultValue={mine?.partner?.uid ?? ""}>
            <option value="">No partner, I’m pitching alone</option>
            {view.partners.map((person) => (
              <option key={person.uid} value={person.uid}>
                {person.name}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        mine?.partner && (
          <p className={styles.cardLine}>
            <span className={styles.cardLabel}>Partner:</span> {mine.partner.name}
          </p>
        )
      )}

      {/*
        Who sees a pitch, said before it is sent. Sending is choosing to share
        it, and the privacy policy's "Pitching week" says the form says so:
        the two move together.
      */}
      <p className={styles.whoSees}>Your group sees your pitch and who pitched it.</p>

      {error && (
        <p className={styles.problem} role="alert">
          {error}
        </p>
      )}

      <div className={styles.formActions}>
        <button type="submit" className={styles.primary} disabled={!hydrated || busy}>
          {busy ? "Sending…" : mine ? "Save changes" : "Send pitch"}
        </button>
        {mine && (
          <Link href={pathname} scroll={false} className={styles.quiet}>
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}

/** One of the group's pitches, with "I’d join this" or the person's own mark. */
function PitchItem({
  row,
  pickable,
  open,
  atLimit,
  busy,
  onToggle,
}: {
  row: PitchRow;
  /** Picking is set up on this run: the toggles are drawn. */
  pickable: boolean;
  /** Before the close: the toggles can be pressed. */
  open: boolean;
  atLimit: boolean;
  busy: boolean;
  onToggle: (row: PitchRow) => void;
}) {
  const hydrated = useHydrated();
  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        <div className={styles.itemText}>
          <p className={styles.itemTitle}>{row.title}</p>
          <p className={styles.itemBy}>{row.pitchedBy}</p>
        </div>
        {row.yours ? (
          <span className={styles.yours}>Your pitch</span>
        ) : pickable ? (
          <button
            type="button"
            className={`${styles.join} ${row.picked ? styles.joinOn : ""}`}
            aria-pressed={row.picked}
            aria-label={`I’d join this: ${row.title}`}
            disabled={!hydrated || !open || busy || (!row.picked && atLimit)}
            onClick={() => onToggle(row)}
          >
            {row.picked && <Tick />}
            <span>I’d join this</span>
          </button>
        ) : null}
      </div>
      <p className={styles.itemTwist}>{row.twist}</p>
    </li>
  );
}

export default function PitchingWeek({ initial, editing: initialEditing }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState(initial);
  const [editing, setEditing] = useState(initialEditing);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // A fresh read from the server (a navigation, `?edit=1` coming or going)
  // replaces what this page holds.
  const [synced, setSynced] = useState({ initial, initialEditing });
  if (synced.initial !== initial || synced.initialEditing !== initialEditing) {
    setSynced({ initial, initialEditing });
    setView(initial);
    setEditing(initialEditing);
  }

  const pickable = view.pickLimit !== null;
  const atLimit = view.pickLimit !== null && view.picked >= view.pickLimit;
  const showForm = view.open && (view.mine === null || editing);

  async function toggle(row: PitchRow) {
    setBusyId(row.id);
    setProblem(null);
    const answer = await post(`/api/courses/runs/${encodeURIComponent(view.runId)}/pitching/picks`, {
      pitchId: row.id,
      join: !row.picked,
    });
    setBusyId(null);
    if (answer.view) setView(answer.view);
    else setProblem(answer.error ?? "That didn’t save. Try again.");
  }

  function saved(next: PitchingView) {
    setView(next);
    setEditing(false);
    if (initialEditing) router.replace(pathname, { scroll: false });
  }

  return (
    <div className={styles.page}>
      <div className={styles.bar}>
        <span className={styles.barStart}>
          <Link href={`/learn/${encodeURIComponent(view.runId)}`} className={styles.back}>
            <ChevronLeft />
            <span>{view.backLabel}</span>
          </Link>
        </span>
        <span className={styles.barTitle} aria-hidden="true">
          Pitching week
        </span>
        <span className={styles.barEnd} />
      </div>

      <div className={styles.body}>
        <header>
          <p className={styles.eyebrow}>{view.eyebrow}</p>
          <h1 className={styles.title}>Pitching week</h1>
          <p className={styles.lede}>{view.lede}</p>
        </header>

        {(view.mine || view.open) && (
          <section aria-labelledby="your-pitch">
            <h2 id="your-pitch" className={styles.heading}>
              Your pitch
            </h2>
            {showForm ? (
              <div className={styles.card}>
                <PitchForm view={view} onSaved={saved} />
              </div>
            ) : (
              view.mine && <PitchCard mine={view.mine} editUntil={view.editUntil} />
            )}
          </section>
        )}

        <section aria-labelledby="pitches">
          <div className={styles.listHead}>
            <h2 id="pitches" className={styles.heading}>
              Pitches <span className={styles.count}>({view.pitches.length})</span>
            </h2>
            {view.pickLimit !== null && (
              <p className={styles.picked}>{pickedWords(view.picked, view.pickLimit)}</p>
            )}
          </div>
          <p className={styles.problem} role="status" aria-live="polite">
            {problem ?? ""}
          </p>
          <ul className={styles.list}>
            {view.pitches.map((row) => (
              <PitchItem
                key={row.id}
                row={row}
                pickable={pickable}
                open={view.open}
                atLimit={atLimit}
                busy={busyId !== null}
                onToggle={toggle}
              />
            ))}
          </ul>
        </section>

        {view.teams && <p className={styles.teams}>{view.teams}</p>}
      </div>
    </div>
  );
}
