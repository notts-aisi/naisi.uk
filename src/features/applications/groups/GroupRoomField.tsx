"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import { GROUP_FIELD_LIMITS } from "@/lib/firestore/courseGroups";
import { ROOM, ROOM_HINT, ROOM_PLACEHOLDER, ROOM_SAVE, ROOM_SAVING, roomControlLabel } from "@/lib/courses/roomWords";
import styles from "./GroupRoomField.module.css";

/**
 * ONE GROUP'S ROOM ON THE GROUPS TAB, beside its campus: the room it meets in
 * every week, saved by its button through the programme's room route
 * (`PUT .../groups/[groupId]/room`, the programme's lead or an admin; the
 * route asks again). Then the page is read again from the server, so every
 * place that shows the room shows the new one, and `onSaved` is handed the
 * route's sentence to say. Nobody is emailed. One week's room is "Change a
 * session"'s.
 */
export default function GroupRoomField({
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
  /** The room stored now, "" for none. */
  value: string;
  onSaved?: (message: string) => void;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const id = useId();
  const [typed, setTyped] = useState(value);
  const [synced, setSynced] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh read from the server wins over what was last typed here.
  if (value !== synced) {
    setSynced(value);
    setTyped(value);
  }

  const changed = typed.replace(/\s+/g, " ").trim() !== value.trim();

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!changed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/groups/${encodeURIComponent(groupId)}/room`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: typed }) },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setError(body.error ?? "That didn’t save. Try again.");
        return;
      }
      onSaved?.(body.message ?? "");
      router.refresh();
    } catch {
      setError("That didn’t save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.field} onSubmit={(event) => void save(event)}>
      <label className={styles.label} htmlFor={id}>
        {ROOM}
      </label>
      <Input
        id={id}
        className={styles.input}
        aria-label={roomControlLabel(groupName)}
        aria-describedby={`${id}-hint`}
        value={typed}
        maxLength={GROUP_FIELD_LIMITS.location}
        placeholder={ROOM_PLACEHOLDER}
        onChange={(e) => setTyped(e.target.value)}
        disabled={!hydrated || saving}
      />
      <Button type="submit" variant="secondary" size="sm" disabled={!hydrated || saving || !changed}>
        {saving ? ROOM_SAVING : ROOM_SAVE}
      </Button>
      <p id={`${id}-hint`} className={styles.hint}>
        {ROOM_HINT}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
