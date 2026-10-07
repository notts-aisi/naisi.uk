"use client";

import { useEffect, useMemo, useState } from "react";
import InitialsChip from "@/components/ui/InitialsChip";
import { Input } from "@/components/ui/Input";
import MemberName from "@/components/ui/MemberName";
import OptionRow from "@/components/ui/OptionRow";
import styles from "./CollaboratorPicker.module.css";

type Candidate = { uid: string; displayName: string; role: string };

type Props = {
  /** The event whose collaborator list this picker manages. */
  eventId: string;
};

/**
 * "Who can edit this" control, shown to the event's author and to admins.
 * Lists committee members and lets them be granted edit access to this one
 * event. Reads and writes through /api/events/[id]/collaborators, so it works
 * even for an author who cannot read the `users` collection directly. Each
 * change saves immediately.
 */
export default function CollaboratorPicker({ eventId }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/collaborators`);
        if (!res.ok) throw new Error(`Couldn't load collaborators (${res.status})`);
        const body = (await res.json()) as {
          candidates?: Candidate[];
          collaboratorUids?: string[];
        };
        if (cancelled) return;
        setCandidates(body.candidates ?? []);
        setSelected(body.collaboratorUids ?? []);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Couldn't load collaborators",
        );
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  async function save(next: string[]) {
    const previous = selected;
    setSelected(next); // optimistic
    setBusy(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/collaborators`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collaboratorUids: next }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; collaboratorUids?: string[]; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setSelected(previous); // rollback
        setSaveError(body?.error ?? `Save failed (${res.status})`);
        return;
      }
      setSelected(body.collaboratorUids ?? next);
    } catch (err) {
      setSelected(previous);
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function toggle(uid: string) {
    if (busy) return;
    save(
      selected.includes(uid)
        ? selected.filter((u) => u !== uid)
        : [...selected, uid],
    );
  }

  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selected.includes(c.uid)),
    [candidates, selected],
  );

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return candidates
      .filter((c) => !term || c.displayName.toLowerCase().includes(term))
      .slice()
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [candidates, search]);

  if (loading) {
    return <p className={styles.quiet}>Loading committee members…</p>;
  }
  if (loadError) {
    return (
      <p className={styles.problem} role="alert">
        {loadError}
      </p>
    );
  }

  return (
    <div className={styles.picker}>
      {selectedCandidates.length > 0 ? (
        <div className={styles.chosen}>
          {selectedCandidates.map((c) => (
            <button
              key={c.uid}
              type="button"
              className={styles.person}
              onClick={() => toggle(c.uid)}
              disabled={busy}
              aria-label={`Take ${c.displayName} off this event`}
            >
              <InitialsChip name={c.displayName} uid={c.uid} />
              <span>
                <MemberName name={c.displayName} />
              </span>
              <CloseIcon />
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.quiet}>
          Nobody has been added yet. Only the person running this event and approvers can change it.
        </p>
      )}

      {candidates.length === 0 ? (
        <p className={styles.quiet}>There are no other committee members to add yet.</p>
      ) : (
        <>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search committee members…"
            aria-label="Search committee members"
          />
          <div className={styles.list}>
            {matches.length === 0 && <p className={styles.quiet}>Nobody matches that.</p>}
            {matches.map((c) => (
              <div key={c.uid} className={styles.row}>
                <OptionRow
                  plain
                  checked={selected.includes(c.uid)}
                  onChange={() => toggle(c.uid)}
                  disabled={busy}
                  description={<span className={styles.role}>{c.role}</span>}
                >
                  <MemberName name={c.displayName} />
                </OptionRow>
              </div>
            ))}
          </div>
        </>
      )}

      {saveError && (
        <p className={styles.problem} role="alert">
          {saveError}
        </p>
      )}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
