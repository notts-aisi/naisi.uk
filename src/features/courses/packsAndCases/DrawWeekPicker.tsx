"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import { WEEK, openWeekWords } from "@/lib/courses/packsAndCases/words";
import facilitator from "../facilitator/facilitator.module.css";
import styles from "./packsAndCases.module.css";

/**
 * THE DRAW'S WEEK PICKER: every week of the course that gives something out,
 * past ones too, each named by its number and what it gives out ("Week 3 ·
 * Pathways and cases"), so nobody mistakes which week they are changing, and
 * the line under it saying which weeks give something out. Choosing a week
 * opens the draw page at `?week=`, the address that names any week.
 *
 * Leaving the page with changes not saved is the editor's to stop: the
 * picker asks first with a cancellable `DRAW_LEAVE_EVENT` on the window, and
 * opens the week only when nothing cancels it. Held until the page has
 * hydrated, as Save is: before then nothing is listening.
 *
 * A WEEK OPENS ON A DELIBERATE CHOICE. Chosen with a pointer or a finger, it
 * opens at once. Moved through with the keyboard (an arrow key on a closed
 * select changes it at once on some systems), it waits: Enter opens it, and
 * so does the button that shows beside it ("Open week 4").
 */

/** Sent before the picker opens another week; the editor cancels it while changes are not saved. */
export const DRAW_LEAVE_EVENT = "naisi:draw-leave";

type Option = { weekNumber: number; label: string };

export default function DrawWeekPicker({
  groupId,
  options,
  current,
  hint,
}: {
  groupId: string;
  options: Option[];
  current: number;
  hint: string;
}) {
  const id = useId();
  const hydrated = useHydrated();
  const router = useRouter();
  const [pending, setPending] = useState(current);
  // Whether the last thing that touched the select was the keyboard.
  const keyboard = useRef(false);

  function open(weekNumber: number) {
    if (weekNumber === current) return;
    const href = `/learn/draw/${encodeURIComponent(groupId)}?week=${weekNumber}`;
    const go = window.dispatchEvent(new CustomEvent(DRAW_LEAVE_EVENT, { cancelable: true, detail: { href } }));
    if (go) router.push(href);
    else setPending(current);
  }

  return (
    <div className={styles.drawWeek}>
      <label className={styles.drawWeekLabel} htmlFor={id}>
        {WEEK}
      </label>
      <div className={styles.drawWeekRow}>
        <Select
          id={id}
          value={String(pending)}
          disabled={!hydrated}
          onPointerDown={() => {
            keyboard.current = false;
          }}
          onKeyDown={(event) => {
            keyboard.current = true;
            if (event.key === "Enter") {
              event.preventDefault();
              open(pending);
            }
          }}
          onChange={(event) => {
            const chosen = Number(event.target.value);
            setPending(chosen);
            if (!keyboard.current) open(chosen);
          }}
        >
          {options.map((option) => (
            <option key={option.weekNumber} value={String(option.weekNumber)}>
              {option.label}
            </option>
          ))}
        </Select>
        {pending !== current && (
          <button type="button" className={facilitator.buttonGhost} onClick={() => open(pending)}>
            {openWeekWords(pending)}
          </button>
        )}
      </div>
      {hint && <p className={styles.drawWeekHint}>{hint}</p>}
    </div>
  );
}
