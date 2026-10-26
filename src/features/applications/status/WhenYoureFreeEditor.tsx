"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AvailabilityGrid, AvailabilityMask } from "@/lib/admissions/availability";
import { columnsToMask, maskToColumns, type DayColumns } from "@/features/admissions/availabilityModel";
import AvailabilityStep from "../apply/AvailabilityStep";
import styles from "./WhenYoureFreeEditor.module.css";

/**
 * "CHANGE WHEN YOU’RE FREE" (Q7): the form's own editor (`AvailabilityStep`:
 * painting, or typing times, the route for a keyboard or a screen reader),
 * on a page of its own, with Save and Cancel. Save sends the week to its
 * route, which holds it to the same codec and limits as the form and refuses
 * once Publish has told them their group; then it goes back to the
 * application page, which shows what is stored.
 */
export default function WhenYoureFreeEditor({
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
  const router = useRouter();
  const stored = useMemo(() => maskToColumns(availability, grid), [availability, grid]);
  const [columns, setColumns] = useState<DayColumns>(stored);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const back = `/applications/${encodeURIComponent(roundId)}#when-youre-free`;

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
      router.push(back);
      router.refresh();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That didn’t save. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <p className={styles.line}>{line}</p>
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
        <Link href={`/applications/${encodeURIComponent(roundId)}#when-youre-free`} className={styles.secondary}>
          Cancel
        </Link>
      </div>
    </div>
  );
}
