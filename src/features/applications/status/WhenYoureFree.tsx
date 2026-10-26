"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/hooks/useHydrated";
import { slotCountFor, type AvailabilityGrid, type AvailabilityMask } from "@/lib/admissions/availability";
import { columnsToMask, maskToColumns, type DayColumns } from "@/features/admissions/availabilityModel";
import AvailabilityStep from "../apply/AvailabilityStep";
import { DAY_LONG, DAY_SHORT, DISPLAY_DAYS, clockLabel, runLabel, runsOf } from "../apply/availabilityText";
import styles from "./WhenYoureFree.module.css";

/**
 * "WHEN YOU’RE FREE" ON THE APPLICATION PAGE (Q7: boards st-application-phone,
 * st-late-phone), for somebody holding a place on a fellowship until Publish
 * has told them their group. The server decides whether it is drawn at all
 * (`loadWhenFree`) and hands in the form's grid, the week as painted and the
 * line under the title; nothing here decides who may.
 *
 * The week is drawn as it reads on the board: each day, a bar across the
 * grid's hours, and its times or "Not free". "Change when you’re free" opens
 * the form's own editor (`AvailabilityStep`: painting, or typing times, the
 * route for a keyboard or a screen reader), and Save sends the week to its
 * route, which holds it to the same codec and limits as the form. The page is
 * then read again from the server, so what it shows is what is stored.
 *
 * Readable in full from the first HTML; the button works once the page is
 * live.
 */

/** The hour marks along the top, as the board draws them: every three hours on the grid. */
function hourMarks(grid: AvailabilityGrid): { minute: number; label: string }[] {
  const marks: { minute: number; label: string }[] = [];
  const first = Math.ceil(grid.startMinute / 180) * 180;
  for (let minute = first; minute <= grid.endMinute; minute += 180) marks.push({ minute, label: clockLabel(minute) });
  return marks;
}

function percent(minute: number, grid: AvailabilityGrid): number {
  return ((minute - grid.startMinute) / (grid.endMinute - grid.startMinute)) * 100;
}

export default function WhenYoureFree({
  roundId,
  grid,
  availability,
  line,
}: {
  roundId: string;
  grid: AvailabilityGrid;
  availability: AvailabilityMask;
  line: string;
}) {
  const ids = useId();
  const router = useRouter();
  const live = useHydrated();
  const stored = useMemo(() => maskToColumns(availability, grid), [availability, grid]);
  const [editing, setEditing] = useState(false);
  const [columns, setColumns] = useState<DayColumns>(stored);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const slots = slotCountFor(grid);

  async function save() {
    if (saving) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/admissions/forms/${encodeURIComponent(roundId)}/application/availability`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: columnsToMask(columns, grid).days }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "That didn’t save. Try again.");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That didn’t save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const shown = editing ? columns : stored;
  return (
    // The address Home's "Check when you’re free" lands on.
    <section id="when-youre-free" className={styles.card} aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`} className={styles.title}>
        When you’re free
      </h2>
      <p className={styles.line}>{line}</p>

      {editing ? (
        <div className={styles.editor}>
          <AvailabilityStep grid={grid} columns={columns} onChange={setColumns} />
          {problem && (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setEditing(false);
                setColumns(stored);
                setProblem(null);
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.week}>
            <div className={styles.marks} aria-hidden="true">
              {hourMarks(grid).map((mark) => (
                <span key={mark.minute} className={styles.mark} style={{ left: `${percent(mark.minute, grid)}%` }}>
                  {mark.label}
                </span>
              ))}
            </div>
            <ul className={styles.days}>
              {DISPLAY_DAYS.map((day) => {
                const runs = runsOf(shown[day]);
                const said = runs.length > 0 ? runs.map((run) => runLabel(run, grid)).join(", ") : "Not free";
                return (
                  <li key={day} className={styles.day} data-free={runs.length > 0 ? "yes" : "no"}>
                    <span className={styles.dayName} aria-hidden="true">
                      {DAY_SHORT[day]}
                    </span>
                    <span className={styles.track} aria-hidden="true">
                      {runs.map((run) => (
                        <span
                          key={run.from}
                          className={styles.run}
                          style={{ left: `${(run.from / slots) * 100}%`, width: `${((run.to - run.from) / slots) * 100}%` }}
                        />
                      ))}
                    </span>
                    <span className={styles.times}>
                      <span className={styles.visuallyHidden}>{DAY_LONG[day]}: </span>
                      {said}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <button
            type="button"
            className={styles.secondary}
            disabled={!live}
            onClick={() => {
              setColumns(stored);
              setEditing(true);
            }}
          >
            Change when you’re free
          </button>
        </>
      )}
    </section>
  );
}
