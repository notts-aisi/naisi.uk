"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import { WEEK } from "@/lib/courses/packsAndCases/words";
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

  function open(weekNumber: number) {
    if (weekNumber === current) return;
    const href = `/learn/draw/${encodeURIComponent(groupId)}?week=${weekNumber}`;
    const go = window.dispatchEvent(new CustomEvent(DRAW_LEAVE_EVENT, { cancelable: true, detail: { href } }));
    if (go) router.push(href);
  }

  return (
    <div className={styles.drawWeek}>
      <label className={styles.drawWeekLabel} htmlFor={id}>
        {WEEK}
      </label>
      <Select id={id} value={String(current)} disabled={!hydrated} onChange={(event) => open(Number(event.target.value))}>
        {options.map((option) => (
          <option key={option.weekNumber} value={String(option.weekNumber)}>
            {option.label}
          </option>
        ))}
      </Select>
      {hint && <p className={styles.drawWeekHint}>{hint}</p>}
    </div>
  );
}
