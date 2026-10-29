"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import { GROUP_CAMPUSES, campusOf, type GroupCampus } from "@/lib/courses/campus";
import { CAMPUS, CAMPUS_LABEL, CAMPUS_NOT_CHOSEN, CAMPUS_SAVING, campusControlLabel } from "@/lib/courses/campusWords";
import styles from "./GroupCampusPicker.module.css";

/**
 * ONE GROUP'S CAMPUS ON THE GROUPS TAB: a choice of University Park, Jubilee
 * and Online, or none, that saves the moment it is changed, through the
 * programme's campus route (`PUT .../groups/[groupId]/campus`, the
 * programme's lead or an admin; the route asks again). Then the page is read
 * again from the server, so everything that shows the campus shows the new
 * one, and `onSaved` is handed the route's sentence to say.
 *
 * Drawn by the Sessions view on each group's card, and made to sit on any
 * view of the tab that lists groups. Nobody is emailed.
 */

export default function GroupCampusPicker({
  roundId,
  programmeId,
  groupId,
  groupName,
  value,
  onSaved,
}: {
  roundId: string;
  programmeId: string;
  groupId: string;
  groupName: string;
  value: GroupCampus | null;
  onSaved?: (message: string) => void;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const id = useId();
  const [shown, setShown] = useState<GroupCampus | null>(value);
  const [synced, setSynced] = useState<GroupCampus | null>(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh read from the server wins over what was last chosen here.
  if (value !== synced) {
    setSynced(value);
    setShown(value);
  }

  async function choose(next: GroupCampus | null) {
    const before = shown;
    setShown(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/groups/${encodeURIComponent(groupId)}/campus`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campus: next }) },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setShown(before);
        setError(body.error ?? "That didn’t save. Try again.");
        return;
      }
      onSaved?.(body.message ?? "");
      router.refresh();
    } catch {
      setShown(before);
      setError("That didn’t save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.picker}>
      <label className={styles.label} htmlFor={id}>
        {CAMPUS}
      </label>
      <Select
        id={id}
        className={styles.select}
        aria-label={campusControlLabel(groupName)}
        value={shown ?? ""}
        onChange={(e) => void choose(campusOf(e.target.value))}
        disabled={!hydrated || saving}
      >
        <option value="">{CAMPUS_NOT_CHOSEN}</option>
        {GROUP_CAMPUSES.map((each) => (
          <option key={each} value={each}>
            {CAMPUS_LABEL[each]}
          </option>
        ))}
      </Select>
      {saving && (
        <span className={styles.saving} role="status">
          {CAMPUS_SAVING}
        </span>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
