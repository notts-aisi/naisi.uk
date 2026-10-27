"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useId, useMemo, useState, type ReactNode } from "react";
import Select from "@/components/ui/Select";
import { DialogFrame } from "@/features/applications/editor/controls";
import { PlusIcon } from "@/features/applications/editor/Icons";
import shared from "@/features/applications/editor/editor.module.css";
import kit from "@/features/applications/kit/kit.module.css";
import { WEEK_FROM_MONDAY } from "@/lib/applications/handover/times";
import { clockLabel } from "@/lib/applications/review/availabilityView";
import { minutesFromTimeLocal } from "@/lib/admissions/availability";
import { startOf } from "@/lib/courses/groupTimes/rules";
import {
  ADDS_EMAILS_NOBODY,
  ADD_A_GROUP,
  ADD_CONFIRM,
  ADD_TITLE,
  A_NEW_GROUP,
  CANCEL,
  CHANGE,
  CHANGE_A_SESSION,
  CHANGE_CONFIRM,
  CLOSE,
  DAY,
  EMAILS_NOBODY,
  LENGTH,
  NAME,
  PLACES,
  PLACES_HINT,
  REFUSAL,
  SAVING,
  STARTS,
  STARTS_HINT,
  TOLD_LEFT_OUT,
  USE_FOR_A_GROUP,
  WHICH_GROUP,
  canMakeHint,
  changeLabel,
  changeTitle,
  groupChoiceWords,
  toldWords,
  useConfirm,
  useForAGroupLabel,
  useTitle,
} from "@/lib/courses/groupTimes/words";
import { clockWords } from "@/lib/courses/sessionChange/words";
import styles from "./TimesPicture.module.css";
import { dayLong, lengthWords, whenShort } from "./timesWords";

/**
 * THE TIMES VIEW'S CONTROLS (board st-times): "Use for a group" beside a
 * best time, "Change" beside each group, and "Add a group", each with the
 * dialog it opens. The picture around them is drawn on the server; these are
 * the only parts that run in the browser.
 *
 * Every value here was worked out on the server and handed in field by
 * field (`TimesActionsSetup`): the run's groups with their slots and whether
 * Publish has told anybody their time, the picture's counts (numbers only:
 * no painted week reaches the browser), the lengths a new group may last,
 * and what a new group is offered. The routes decide everything again.
 *
 * A group Publish has told the time of is not changed here: its Change
 * opens a dialog that says so and links to Change a session, and "Use for a
 * group" leaves it off its list. Nobody is emailed by any of it.
 *
 * After a press the page is read again from the server, so the picture,
 * the best times and every group's line show the new times, and a line in
 * the groups card says what was done.
 */

export type TimesActionGroup = {
  id: string;
  name: string;
  weekday: number;
  /** "18:00", or "" while the group has no start time. */
  start: string;
  minutes: number;
  /** Publish has told somebody when it meets. */
  told: boolean;
};

export type TimesActionsSetup = {
  roundId: string;
  programmeId: string;
  /** Every live group of the run, in the picture's order. */
  groups: TimesActionGroup[];
  /**
   * The picture's counts, to say how many can make a day and start at the
   * length it counts: by start time (minutes past midnight) and day, Monday
   * first. Null while nobody has said when they are free.
   */
  counts: { said: number; minutes: number; rows: number[]; cells: number[][] } | null;
  /** The lengths a new group may last, shortest first, and the one the picture counts. */
  lengths: number[];
  counted: number;
  /** What "Add a group" suggests. */
  nextName: string;
  places: number | null;
};

type Ctx = { setup: TimesActionsSetup; say: (message: string) => void; message: string | null };

const TimesActionsContext = createContext<Ctx | null>(null);

function useTimesActions(): Ctx {
  const ctx = useContext(TimesActionsContext);
  if (!ctx) throw new Error("The Times view's controls are drawn inside TimesActionsProvider.");
  return ctx;
}

/** Holds what the last press came to, for the line in the groups card. */
export function TimesActionsProvider({ setup, children }: { setup: TimesActionsSetup; children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const value = useMemo(() => ({ setup, say: setMessage, message }), [setup, message]);
  return <TimesActionsContext.Provider value={value}>{children}</TimesActionsContext.Provider>;
}

/** What the last press came to, read out politely. */
export function TimesActionsStatus() {
  const { message } = useTimesActions();
  return (
    <p className={message ? styles.actionStatus : shared.visuallyHidden} role="status" aria-live="polite">
      {message ?? ""}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Pieces the dialogs share
// ---------------------------------------------------------------------------

/** "Tue 6pm" for a stored "18:00", or null for no time. */
function shortWhen(weekday: number, start: string): string | null {
  const minute = minutesFromTimeLocal(start);
  return minute === null ? null : whenShort(weekday, minute);
}

/** How many of those who said can make a day and start, when the picture counts it at this length. */
function countAt(setup: TimesActionsSetup, weekday: number, start: string | null, minutes: number): string | null {
  const counts = setup.counts;
  if (!counts || start === null || minutes !== counts.minutes) return null;
  const row = counts.rows.indexOf(minutesFromTimeLocal(start) ?? -1);
  const column = WEEK_FROM_MONDAY.indexOf(weekday);
  if (row === -1 || column === -1) return null;
  return canMakeHint(counts.cells[row][column], counts.said);
}

/** Send one request, and hand back the route's sentence on a refusal. */
async function send(url: string, method: "PUT" | "POST", body: unknown): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const answer = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
    if (!response.ok || !answer || typeof answer.message !== "string") {
      return { ok: false, error: answer?.error ?? "That didn’t save. Try again in a minute." };
    }
    return { ok: true, message: answer.message };
  } catch {
    return { ok: false, error: "That didn’t save. Check your connection and try again." };
  }
}

function groupsUrl(setup: TimesActionsSetup): string {
  return `/api/admissions/forms/${encodeURIComponent(setup.roundId)}/programmes/${encodeURIComponent(setup.programmeId)}/groups`;
}

function DayField({ id, value, onChange }: { id: string; value: number; onChange: (weekday: number) => void }) {
  return (
    <div className={shared.field}>
      <label className={shared.label} htmlFor={id}>
        {DAY}
      </label>
      <Select id={id} className={shared.select} value={String(value)} onChange={(event) => onChange(Number(event.target.value))}>
        {WEEK_FROM_MONDAY.map((weekday) => (
          <option key={weekday} value={weekday}>
            {dayLong(weekday)}
          </option>
        ))}
      </Select>
    </div>
  );
}

function StartField({ id, value, onChange }: { id: string; value: string; onChange: (text: string) => void }) {
  return (
    <div className={shared.field}>
      <label className={shared.label} htmlFor={id}>
        {STARTS}
      </label>
      <input
        id={id}
        className={shared.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="text"
        autoComplete="off"
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className={shared.hint}>
        {STARTS_HINT}
      </p>
    </div>
  );
}

/** The fields only a new group has: its name, its length and its places. */
function NewGroupFields({
  idBase,
  name,
  setName,
  minutes,
  setMinutes,
  places,
  setPlaces,
}: {
  idBase: string;
  name: string;
  setName: (text: string) => void;
  minutes: number;
  setMinutes: (minutes: number) => void;
  places: string;
  setPlaces: (text: string) => void;
}) {
  const { setup } = useTimesActions();
  return (
    <>
      <div className={shared.field}>
        <label className={shared.label} htmlFor={`${idBase}-name`}>
          {NAME}
        </label>
        <input
          id={`${idBase}-name`}
          className={shared.input}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          autoComplete="off"
        />
      </div>
      <div className={shared.dialogPair}>
        <div className={shared.field}>
          <label className={shared.label} htmlFor={`${idBase}-length`}>
            {LENGTH}
          </label>
          <Select
            id={`${idBase}-length`}
            className={shared.select}
            value={String(minutes)}
            onChange={(event) => setMinutes(Number(event.target.value))}
          >
            {setup.lengths.map((each) => (
              <option key={each} value={each}>
                {lengthWords(each)}
              </option>
            ))}
          </Select>
        </div>
        <div className={shared.field}>
          <label className={shared.label} htmlFor={`${idBase}-places`}>
            {PLACES}
          </label>
          <input
            id={`${idBase}-places`}
            className={shared.input}
            value={places}
            onChange={(event) => setPlaces(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            aria-describedby={`${idBase}-places-hint`}
          />
          <p id={`${idBase}-places-hint`} className={shared.hint}>
            {PLACES_HINT}
          </p>
        </div>
      </div>
    </>
  );
}

/** The places typed, as the route takes them: a whole number, null for none, or undefined when it is neither. */
function placesOf(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  return /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : undefined;
}

/** Buttons at the foot of a dialog: Cancel, and the one that does it. */
function DialogButtons({
  confirm,
  busy,
  disabled,
  onCancel,
  onConfirm,
}: {
  confirm: string;
  busy: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <button type="button" className={shared.btn} onClick={onCancel} disabled={busy}>
        {CANCEL}
      </button>
      <button type="button" className={kit.primary} onClick={onConfirm} disabled={busy || disabled}>
        {busy ? SAVING : confirm}
      </button>
    </>
  );
}

/** What the route or the form said was wrong, read out at once. */
function Problem({ text }: { text: string | null }) {
  return text ? (
    <p className={styles.dialogProblem} role="alert">
      {text}
    </p>
  ) : null;
}

/** After a press that worked: close, say what was done, and read the page again. */
function useDone(close: () => void) {
  const router = useRouter();
  const { say } = useTimesActions();
  return useCallback(
    (message: string) => {
      close();
      say(message);
      router.refresh();
    },
    [close, router, say],
  );
}

// ---------------------------------------------------------------------------
// Change
// ---------------------------------------------------------------------------

/** "Change" beside one of "Your N groups": the group's day and start. */
export function ChangeTimeButton({ groupId }: { groupId: string }) {
  const { setup } = useTimesActions();
  const group = setup.groups.find((each) => each.id === groupId);
  const [open, setOpen] = useState(false);
  if (!group) return null;
  return (
    <>
      <button type="button" className={styles.action} aria-label={changeLabel(group.name)} onClick={() => setOpen(true)}>
        {CHANGE}
      </button>
      {open && <ChangeDialog group={group} close={() => setOpen(false)} />}
    </>
  );
}

/** Exported so a suite can draw it open; the page opens it from its button. */
export function ChangeDialog({ group, close }: { group: TimesActionGroup; close: () => void }) {
  const { setup } = useTimesActions();
  const idBase = useId();
  const [weekday, setWeekday] = useState(group.weekday);
  const [start, setStart] = useState(group.start ? clockWords(group.start) : "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const done = useDone(close);

  if (group.told) {
    return (
      <DialogFrame
        open
        width="sm"
        title={changeTitle(group.name)}
        onClose={close}
        actions={
          <button type="button" className={shared.btn} onClick={close}>
            {CLOSE}
          </button>
        }
      >
        <p className={shared.dialogText}>{toldWords(group.name)}</p>
        <p>
          <Link
            href={`/admin/admissions/forms/${encodeURIComponent(setup.roundId)}/programmes/${encodeURIComponent(setup.programmeId)}/groups/sessions`}
            className={styles.see}
          >
            {CHANGE_A_SESSION}
          </Link>
        </p>
      </DialogFrame>
    );
  }

  const parsed = startOf(start);
  const hint = countAt(setup, weekday, parsed, group.minutes);
  const unchanged = parsed !== null && weekday === group.weekday && parsed === group.start;

  async function confirm() {
    if (parsed === null) {
      setProblem(REFUSAL.start);
      return;
    }
    setBusy(true);
    setProblem(null);
    const answer = await send(`${groupsUrl(setup)}/${encodeURIComponent(group.id)}/time`, "PUT", {
      weekday,
      start: parsed,
      from: { weekday: group.weekday, start: group.start },
    });
    setBusy(false);
    if (!answer.ok) {
      setProblem(answer.error);
      return;
    }
    done(answer.message);
  }

  return (
    <DialogFrame
      open
      width="sm"
      title={changeTitle(group.name)}
      onClose={close}
      actions={
        <DialogButtons confirm={CHANGE_CONFIRM} busy={busy} disabled={unchanged} onCancel={close} onConfirm={() => void confirm()} />
      }
    >
      <div className={shared.dialogFields}>
        <div className={shared.dialogPair}>
          <DayField id={`${idBase}-day`} value={weekday} onChange={setWeekday} />
          <StartField id={`${idBase}-start`} value={start} onChange={setStart} />
        </div>
        {hint && <p className={shared.hint}>{hint}</p>}
        <p className={shared.dialogText}>{EMAILS_NOBODY}</p>
        <Problem text={problem} />
      </div>
    </DialogFrame>
  );
}

// ---------------------------------------------------------------------------
// Use for a group
// ---------------------------------------------------------------------------

const NEW = "__new__";

/** "Use for a group" beside a best time no group meets at. */
export function UseForAGroupButton({ weekday, start }: { weekday: number; start: number }) {
  const [open, setOpen] = useState(false);
  const when = whenShort(weekday, start);
  return (
    <>
      <button type="button" className={styles.action} aria-label={useForAGroupLabel(when)} onClick={() => setOpen(true)}>
        {USE_FOR_A_GROUP}
      </button>
      {open && <UseDialog weekday={weekday} start={clockLabelToStored(start)} when={when} close={() => setOpen(false)} />}
    </>
  );
}

/** Minutes past midnight as the stored "HH:MM". */
function clockLabelToStored(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** Exported so a suite can draw it open; the page opens it from its button. */
export function UseDialog({ weekday, start, when, close }: { weekday: number; start: string; when: string; close: () => void }) {
  const { setup } = useTimesActions();
  const idBase = useId();
  const open = setup.groups.filter((group) => !group.told);
  const leftOut = setup.groups.length - open.length;
  // A group with no time yet is the first offered: the picture is how one is given a time.
  const [choice, setChoice] = useState<string>(open.find((group) => !group.start)?.id ?? NEW);
  const [name, setName] = useState(setup.nextName);
  const [minutes, setMinutes] = useState(setup.counted);
  const [places, setPlaces] = useState(setup.places === null ? "" : String(setup.places));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const done = useDone(close);

  const chosen = open.find((group) => group.id === choice) ?? null;
  const hint = countAt(setup, weekday, start, chosen ? chosen.minutes : minutes);

  async function confirm() {
    setProblem(null);
    if (chosen) {
      setBusy(true);
      const answer = await send(`${groupsUrl(setup)}/${encodeURIComponent(chosen.id)}/time`, "PUT", {
        weekday,
        start,
        from: { weekday: chosen.weekday, start: chosen.start },
      });
      setBusy(false);
      if (answer.ok) done(answer.message);
      else setProblem(answer.error);
      return;
    }
    const wanted = placesOf(places);
    if (wanted === undefined) {
      setProblem(REFUSAL.places);
      return;
    }
    setBusy(true);
    const answer = await send(groupsUrl(setup), "POST", { name, weekday, start, minutes, places: wanted });
    setBusy(false);
    if (answer.ok) done(answer.message);
    else setProblem(answer.error);
  }

  return (
    <DialogFrame
      open
      title={useTitle(when)}
      onClose={close}
      actions={<DialogButtons confirm={useConfirm(when)} busy={busy} onCancel={close} onConfirm={() => void confirm()} />}
    >
      <div className={shared.dialogFields}>
        <fieldset className={shared.fieldset}>
          <legend className={shared.label}>{WHICH_GROUP}</legend>
          <div className={styles.choices}>
            {open.map((group) => (
              <label key={group.id} className={styles.choice}>
                <input
                  type="radio"
                  name={`${idBase}-group`}
                  value={group.id}
                  checked={choice === group.id}
                  onChange={() => setChoice(group.id)}
                />
                <span>{groupChoiceWords(group.name, shortWhen(group.weekday, group.start))}</span>
              </label>
            ))}
            <label className={styles.choice}>
              <input type="radio" name={`${idBase}-group`} value={NEW} checked={choice === NEW} onChange={() => setChoice(NEW)} />
              <span>{A_NEW_GROUP}</span>
            </label>
          </div>
        </fieldset>
        {leftOut > 0 && <p className={shared.hint}>{TOLD_LEFT_OUT}</p>}
        {!chosen && (
          <NewGroupFields
            idBase={idBase}
            name={name}
            setName={setName}
            minutes={minutes}
            setMinutes={setMinutes}
            places={places}
            setPlaces={setPlaces}
          />
        )}
        {hint && <p className={shared.hint}>{hint}</p>}
        <p className={shared.dialogText}>{chosen ? EMAILS_NOBODY : ADDS_EMAILS_NOBODY}</p>
        <Problem text={problem} />
      </div>
    </DialogFrame>
  );
}

// ---------------------------------------------------------------------------
// Add a group
// ---------------------------------------------------------------------------

/**
 * "Add a group", under the groups. `suggested` is the best time no group
 * meets at yet, if there is one, to start the dialog on.
 */
export function AddGroupButton({ suggested }: { suggested: { weekday: number; start: number } | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`${shared.btn} ${styles.addGroup}`} onClick={() => setOpen(true)}>
        <PlusIcon size={18} />
        {ADD_A_GROUP}
      </button>
      {open && <AddDialog suggested={suggested} close={() => setOpen(false)} />}
    </>
  );
}

/** Exported so a suite can draw it open; the page opens it from its button. */
export function AddDialog({ suggested, close }: { suggested: { weekday: number; start: number } | null; close: () => void }) {
  const { setup } = useTimesActions();
  const idBase = useId();
  const [weekday, setWeekday] = useState(suggested?.weekday ?? 1);
  const [start, setStart] = useState(suggested ? clockLabel(suggested.start) : "");
  const [name, setName] = useState(setup.nextName);
  const [minutes, setMinutes] = useState(setup.counted);
  const [places, setPlaces] = useState(setup.places === null ? "" : String(setup.places));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const done = useDone(close);

  const parsed = startOf(start);
  const hint = countAt(setup, weekday, parsed, minutes);

  async function confirm() {
    setProblem(null);
    if (parsed === null) {
      setProblem(REFUSAL.start);
      return;
    }
    const wanted = placesOf(places);
    if (wanted === undefined) {
      setProblem(REFUSAL.places);
      return;
    }
    setBusy(true);
    const answer = await send(groupsUrl(setup), "POST", { name, weekday, start: parsed, minutes, places: wanted });
    setBusy(false);
    if (answer.ok) done(answer.message);
    else setProblem(answer.error);
  }

  return (
    <DialogFrame
      open
      title={ADD_TITLE}
      onClose={close}
      actions={<DialogButtons confirm={ADD_CONFIRM} busy={busy} onCancel={close} onConfirm={() => void confirm()} />}
    >
      <div className={shared.dialogFields}>
        <div className={shared.dialogPair}>
          <DayField id={`${idBase}-day`} value={weekday} onChange={setWeekday} />
          <StartField id={`${idBase}-start`} value={start} onChange={setStart} />
        </div>
        {hint && <p className={shared.hint}>{hint}</p>}
        <NewGroupFields
          idBase={idBase}
          name={name}
          setName={setName}
          minutes={minutes}
          setMinutes={setMinutes}
          places={places}
          setPlaces={setPlaces}
        />
        <p className={shared.dialogText}>{ADDS_EMAILS_NOBODY}</p>
        <Problem text={problem} />
      </div>
    </DialogFrame>
  );
}
