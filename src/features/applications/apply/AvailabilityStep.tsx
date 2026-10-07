"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import Select from "@/components/ui/Select";
import { slotCountFor, type AvailabilityGrid } from "@/lib/admissions/availability";
import { clearDay, setRange, type DayColumns } from "@/features/admissions/availabilityModel";
import {
  DAY_LONG,
  DAY_SHORT,
  DISPLAY_DAYS,
  clearRun,
  clockLabel,
  copyToWeekdays,
  dayChipLabel,
  paintRun,
  paintedSlots,
  runLabel,
  runsOf,
  slotMinute,
  totalFree,
  typedRun,
  type Run,
} from "./availabilityText";
import form from "./form.module.css";
import styles from "./availability.module.css";

/**
 * Availability: the times somebody is free, painted on a week of quarter
 * hours.
 *
 * ONE MARKUP, TWO LAYOUTS. A laptop shows the whole week side by side. A
 * phone shows one day at a time, chosen from a strip of day buttons, as one
 * tall column. The stylesheet decides which; the seven columns are always in
 * the page.
 *
 * ## Painting
 *
 * Press on a column and drag: the run under the drag is outlined while the
 * pointer is down and painted when it lifts. A drag that STARTS on painted
 * time clears instead, so dragging back over a block removes it. Each painted
 * run is drawn as one block carrying its own times.
 *
 * A column refuses the browser's own touch scrolling, because a finger moving
 * down it has to paint rather than scroll. The page still scrolls from
 * anywhere else, the hour labels beside the column included, and a drag that
 * nears the top or bottom of the screen scrolls the page under it so a long
 * run can be painted in one go.
 *
 * ## Without dragging
 *
 * "Add times by typing instead" opens a small form: a day, a start, an end.
 * It reads the times people actually type ("6pm", "18:30"), lists every run
 * with a Remove button, and is the whole route for a keyboard, a switch or a
 * screen reader. Each block is also a button: Enter on it opens that list at
 * its entry, and Delete clears it.
 *
 * ## Nothing moves the week
 *
 * The link and its panel sit UNDER the week, because the list in the panel
 * grows by a row with every time added and whatever sits above the week
 * pushes it down the page. The rule a change here has to keep: nothing above
 * the week comes, goes or changes height. The line that says what was just
 * done (with Undo) is drawn in a box that is always on the page, above the
 * week or in the panel, whichever the change was made from.
 *
 * ## Shape
 *
 * State is seven columns of booleans (`DayColumns`, the older form's model).
 * The parent converts to and from the stored mask; nothing here touches it.
 */

type Pending = {
  day: number;
  /** First slot of the run under the drag, and the slot after its last. */
  from: number;
  to: number;
  /** True paints, false clears. */
  paints: boolean;
};

/** The times as they were before the last change, and whether it was made in the typed panel. */
type Undo = { columns: DayColumns; typed: boolean };

/**
 * Where the keyboard goes once the typed panel is on the page: to one time's
 * Remove button (`run` is that time's key), or with no run to the first field.
 * A new object for every ask, so asking for the same time twice is two asks.
 */
type PanelFocus = { run: string | null };

type Drag = {
  pointerId: number;
  day: number;
  anchor: number;
  startY: number;
  lastY: number;
  moved: boolean;
  paints: boolean;
  column: HTMLElement;
};

/** How close to the edge of the screen a drag starts scrolling the page. */
const SCROLL_EDGE_TOP = 110;
const SCROLL_EDGE_BOTTOM = 130;
const SCROLL_MAX_STEP = 14;
/** A press that travels less than this is a tap, not a drag. */
const TAP_SLOP = 6;

function hourMarks(grid: AvailabilityGrid): { slot: number; label: string }[] {
  const marks: { slot: number; label: string }[] = [];
  for (let minute = Math.ceil(grid.startMinute / 60) * 60; minute <= grid.endMinute; minute += 60) {
    marks.push({ slot: (minute - grid.startMinute) / grid.slotMinutes, label: clockLabel(minute) });
  }
  return marks;
}

function firstDayWithTime(columns: DayColumns): number {
  return DISPLAY_DAYS.find((day) => paintedSlots(columns[day]) > 0) ?? DISPLAY_DAYS[0];
}

export default function AvailabilityStep({
  grid,
  columns,
  onChange,
}: {
  grid: AvailabilityGrid;
  columns: DayColumns;
  onChange: (next: DayColumns) => void;
}) {
  const slots = slotCountFor(grid);
  const marks = hourMarks(grid);
  const total = totalFree(columns, grid);
  const span = `${clockLabel(grid.startMinute)} to ${clockLabel(grid.endMinute)}`;

  const [activeDay, setActiveDay] = useState(() => firstDayWithTime(columns));
  const [pending, setPending] = useState<Pending | null>(null);
  const [typing, setTyping] = useState(false);
  const [typedDay, setTypedDay] = useState(activeDay);
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [typedError, setTypedError] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [undo, setUndo] = useState<Undo | null>(null);
  const [panelFocus, setPanelFocus] = useState<PanelFocus | null>(null);

  const panelId = useId();
  const dayId = useId();
  const fromId = useId();
  const toId = useId();

  const drag = useRef<Drag | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  function slotAt(column: HTMLElement, clientY: number): number {
    const rect = column.getBoundingClientRect();
    const raw = Math.floor(((clientY - rect.top) / rect.height) * slots);
    return Math.max(0, Math.min(slots - 1, raw));
  }

  function track(clientY: number) {
    const current = drag.current;
    if (!current) return;
    current.lastY = clientY;
    const slot = slotAt(current.column, clientY);
    if (slot !== current.anchor || Math.abs(clientY - current.startY) > TAP_SLOP) current.moved = true;
    // A press that starts on a block shows nothing until it turns into a
    // drag, because lifting without moving opens the block instead.
    if (!current.paints && !current.moved) return;
    setPending({
      day: current.day,
      from: Math.min(current.anchor, slot),
      to: Math.max(current.anchor, slot) + 1,
      paints: current.paints,
    });
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>, day: number) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (drag.current) return;
    const column = event.currentTarget;
    const slot = slotAt(column, event.clientY);
    const painted = columns[day]?.[slot] === true;
    event.preventDefault();
    try {
      column.setPointerCapture(event.pointerId);
    } catch {
      // Capture is a refinement: the move and up handlers still fire on the column.
    }
    drag.current = {
      pointerId: event.pointerId,
      day,
      anchor: slot,
      startY: event.clientY,
      lastY: event.clientY,
      moved: false,
      paints: !painted,
      column,
    };
    setUndo(null);
    if (!painted) setPending({ day, from: slot, to: slot + 1, paints: true });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    track(event.clientY);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>, commit: boolean) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setPending(null);
    try {
      current.column.releasePointerCapture(event.pointerId);
    } catch {
      // Already released.
    }
    if (!commit) return;
    const slot = slotAt(current.column, current.lastY);
    if (!current.paints && !current.moved) {
      // A tap on a painted block: show it in the list, where it can be removed.
      const run = runsOf(columns[current.day]).find((each) => slot >= each.from && slot < each.to);
      if (run) openRun(current.day, run);
      return;
    }
    const from = Math.min(current.anchor, slot);
    const to = Math.max(current.anchor, slot);
    const next = setRange(columns, current.day, from, to, current.paints);
    if (next !== columns) onChange(next);
  }

  // A drag near the top or bottom edge scrolls the page under the pointer.
  const dragging = pending !== null;
  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    const step = () => {
      const current = drag.current;
      if (current) {
        const y = current.lastY;
        const fromBottom = window.innerHeight - y;
        let delta = 0;
        if (y < SCROLL_EDGE_TOP) delta = -Math.ceil(((SCROLL_EDGE_TOP - y) / SCROLL_EDGE_TOP) * SCROLL_MAX_STEP);
        else if (fromBottom < SCROLL_EDGE_BOTTOM) {
          delta = Math.ceil(((SCROLL_EDGE_BOTTOM - fromBottom) / SCROLL_EDGE_BOTTOM) * SCROLL_MAX_STEP);
        }
        if (delta !== 0) {
          const before = window.scrollY;
          window.scrollBy(0, delta);
          // The column moved under a pointer that did not: read its slot again.
          if (window.scrollY !== before) track(y);
        }
      }
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
    // `track` reads only refs and the slot count, which a drag cannot change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  function runKey(day: number, run: Run): string {
    return `${day}:${run.from}-${run.to}`;
  }

  function openRun(day: number, run: Run) {
    setTyping(true);
    setTypedDay(day);
    setPanelFocus({ run: runKey(day, run) });
  }

  // Once the panel is on the page, move the keyboard into it and bring it into
  // view: to the entry that was asked for, or to the first field. The panel
  // sits under the week, so it is often off the screen when it opens.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panelFocus || !panel) return;
    const entry = panelFocus.run ? panel.querySelector<HTMLElement>(`[data-run="${panelFocus.run}"]`) : null;
    const target = entry ?? panel.querySelector<HTMLElement>("select, input, button");
    // The scroll is made here and not by the focus, so that it can glide, and
    // so that it does not for somebody who has asked for less motion.
    target?.focus({ preventScroll: true });
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    (entry ?? panel).scrollIntoView({ block: "nearest", behavior: still ? "instant" : "smooth" });
  }, [panelFocus]);

  function apply(next: DayColumns, message: string, typed = false) {
    if (next === columns) return;
    setUndo({ columns, typed });
    onChange(next);
    setSaid(message);
  }

  function addTyped() {
    const result = typedRun(fromText, toText, grid);
    if (!result.ok) {
      setTypedError(result.error);
      return;
    }
    const run = { from: result.from, to: result.to };
    setTypedError(null);
    setFromText("");
    setToText("");
    setActiveDay(typedDay);
    const next = paintRun(columns, typedDay, run);
    if (next === columns) {
      setSaid(`${DAY_LONG[typedDay]}, ${runLabel(run, grid)} was already painted.`);
      // Said beside the fields it was typed in, when a line is showing at all.
      setUndo((kept) => (kept ? { ...kept, typed: true } : kept));
      return;
    }
    apply(next, `Added ${DAY_LONG[typedDay]}, ${runLabel(run, grid)}.`, true);
  }

  const listed = DISPLAY_DAYS.flatMap((day) => runsOf(columns[day]).map((run) => ({ day, run })));

  // What was just done, and the way back. One line, drawn in one of two boxes
  // that are both always on the page: the panel's while the panel is open and
  // the change was made in it, otherwise the one above the week.
  const undoInPanel = undo !== null && undo.typed && typing;
  const saidLine = undo ? (
    <>
      <span aria-hidden="true" className={styles.saidText}>
        {said}
      </span>
      <button
        type="button"
        className={`${form.textLink} ${styles.undo}`}
        onClick={() => {
          onChange(undo.columns);
          setUndo(null);
          setSaid("Put back.");
        }}
      >
        Undo
      </button>
    </>
  ) : null;

  return (
    <div className={`${form.body} ${form.bodyWide} ${styles.when}`}>
      <div className={styles.top}>
        <p role="status" className={styles.total}>
          {total ? (
            <>
              Free <strong>{total.hours}</strong> across <strong>{total.days}</strong>
            </>
          ) : (
            "No time painted yet"
          )}
        </p>

        <div role="group" aria-label="Day" className={styles.days}>
          {DISPLAY_DAYS.map((day) => (
            <button
              key={day}
              type="button"
              className={styles.day}
              aria-pressed={day === activeDay}
              aria-label={dayChipLabel(columns, day, grid)}
              onClick={() => {
                setActiveDay(day);
                setTypedDay(day);
              }}
            >
              <span>{DAY_SHORT[day]}</span>
              <span aria-hidden="true" className={styles.dot} data-on={paintedSlots(columns[day]) > 0 ? "true" : "false"} />
            </button>
          ))}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={form.secondary}
            onClick={() =>
              apply(copyToWeekdays(columns, activeDay), `Copied ${DAY_LONG[activeDay]} to every weekday.`)
            }
          >
            Copy to every weekday
          </button>
          <button
            type="button"
            className={form.ghost}
            onClick={() => apply(clearDay(columns, activeDay), `Cleared ${DAY_LONG[activeDay]}.`)}
          >
            Clear this day
          </button>
        </div>

        <div className={styles.said}>{undoInPanel ? null : saidLine}</div>
      </div>

      <p role="status" aria-live="polite" className="visually-hidden">
        {said}
      </p>

      <div className={styles.board} style={{ "--slots": slots } as CSSProperties}>
        <div className={styles.corner} aria-hidden="true" />
        {DISPLAY_DAYS.map((day) => (
          <div key={`head-${day}`} className={styles.head} aria-hidden="true">
            {DAY_SHORT[day]}
          </div>
        ))}
        <div className={styles.gutter} aria-hidden="true">
          {marks.map((mark) => (
            <span key={mark.slot} className={styles.hour} style={{ "--at": mark.slot } as CSSProperties}>
              {mark.label}
            </span>
          ))}
        </div>
        {DISPLAY_DAYS.map((day) => {
          const live = pending && pending.day === day ? pending : null;
          return (
            <div
              key={day}
              role="group"
              aria-label={`${DAY_LONG[day]}, ${span}`}
              className={styles.column}
              data-active={day === activeDay ? "true" : "false"}
              onPointerDown={(event) => onPointerDown(event, day)}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => endDrag(event, true)}
              onPointerCancel={(event) => endDrag(event, false)}
            >
              {runsOf(columns[day]).map((run) => (
                <button
                  key={`${run.from}-${run.to}`}
                  type="button"
                  className={styles.block}
                  style={{ "--from": run.from, "--len": run.to - run.from } as CSSProperties}
                  aria-label={`${DAY_LONG[day]}, free ${runLabel(run, grid)}`}
                  onClick={(event) => {
                    // Only a keyboard or a screen reader gets here with no
                    // pointer behind it: a pointer press is the column's.
                    if (event.detail === 0) openRun(day, run);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Delete" || event.key === "Backspace") {
                      event.preventDefault();
                      apply(clearRun(columns, day, run), `Removed ${DAY_LONG[day]}, ${runLabel(run, grid)}.`);
                    }
                  }}
                >
                  {runLabel(run, grid)}
                </button>
              ))}
              {live ? (
                <div
                  role="status"
                  aria-label={`${live.paints ? "Painting" : "Clearing"} ${DAY_LONG[day]}, ${runLabel(live, grid)}`}
                  className={styles.pending}
                  data-paints={live.paints ? "true" : "false"}
                  style={{ "--from": live.from, "--len": live.to - live.from } as CSSProperties}
                >
                  <span aria-hidden="true" className={styles.pendingText}>
                    {live.paints ? "" : "Clear "}
                    {runLabel(live, grid)}
                  </span>
                  <span aria-hidden="true" className={styles.pendingTag}>
                    {live.paints ? "" : "Clear "}
                    {DAY_SHORT[day]} {runLabel(live, grid)}
                  </span>
                  <span aria-hidden="true" className={styles.grip}>
                    <svg width="16" height="8" viewBox="0 0 16 8" focusable="false">
                      <path d="M2 2h12M2 6h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="visually-hidden">
        Times run from {clockLabel(slotMinute(0, grid))} to {clockLabel(grid.endMinute)}, in quarter hours.
      </p>

      <div className={styles.typing}>
        <button
          type="button"
          className={`${form.textLink} ${styles.typeLink}`}
          aria-expanded={typing}
          aria-controls={panelId}
          onClick={() => {
            const opening = !typing;
            setTyping(opening);
            setTypedDay(activeDay);
            setPanelFocus(opening ? { run: null } : null);
          }}
        >
          Add times by typing instead
        </button>
        {typing ? (
          <div id={panelId} ref={panelRef} className={styles.typed} role="group" aria-label="Add times by typing">
            <div className={styles.typedRow}>
              <div className={styles.typedField}>
                <label htmlFor={dayId} className={form.label}>
                  Day
                </label>
                <Select
                  id={dayId}
                  className={form.select}
                  value={String(typedDay)}
                  onChange={(event) => setTypedDay(Number(event.currentTarget.value))}
                >
                  {DISPLAY_DAYS.map((day) => (
                    <option key={day} value={day}>
                      {DAY_LONG[day]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className={styles.typedField}>
                <label htmlFor={fromId} className={form.label}>
                  From
                </label>
                <input
                  id={fromId}
                  type="text"
                  className={form.input}
                  value={fromText}
                  onChange={(event) => setFromText(event.currentTarget.value)}
                  placeholder="6pm"
                  maxLength={12}
                  autoComplete="off"
                  aria-invalid={typedError ? true : undefined}
                  aria-describedby={typedError ? `${panelId}-e` : undefined}
                />
              </div>
              <div className={styles.typedField}>
                <label htmlFor={toId} className={form.label}>
                  To
                </label>
                <input
                  id={toId}
                  type="text"
                  className={form.input}
                  value={toText}
                  onChange={(event) => setToText(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTyped();
                    }
                  }}
                  placeholder="9pm"
                  maxLength={12}
                  autoComplete="off"
                  aria-invalid={typedError ? true : undefined}
                  aria-describedby={typedError ? `${panelId}-e` : undefined}
                />
              </div>
              <button type="button" className={`${form.secondary} ${styles.typedAdd}`} onClick={addTyped}>
                Add time
              </button>
            </div>
            {typedError ? (
              <p id={`${panelId}-e`} className={form.error} role="alert">
                {typedError}
              </p>
            ) : null}
            <div className={styles.said}>{undoInPanel ? saidLine : null}</div>
            {listed.length > 0 ? (
              <ul className={styles.typedList} aria-label="Your times">
                {listed.map(({ day, run }) => (
                  <li key={runKey(day, run)} className={styles.typedItem}>
                    <span>
                      {DAY_SHORT[day]} {runLabel(run, grid)}
                    </span>
                    <button
                      type="button"
                      className={`${form.ghost} ${styles.remove}`}
                      data-run={runKey(day, run)}
                      aria-label={`Remove ${DAY_LONG[day]} ${runLabel(run, grid)}`}
                      onClick={() =>
                        apply(clearRun(columns, day, run), `Removed ${DAY_LONG[day]}, ${runLabel(run, grid)}.`, true)
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
