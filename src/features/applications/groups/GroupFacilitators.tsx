"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  RunFacilitatorGroup,
  RunFacilitatorsPayload,
} from "@/app/api/courses/runs/[runId]/facilitators/route";
import Button from "@/components/ui/Button";
import InitialsChip from "@/components/ui/InitialsChip";
import PersonSelector from "@/components/ui/PersonSelector";
import { setGroupFacilitators } from "@/features/courses/courseMutations";
import { GROUP_FIELD_LIMITS } from "@/lib/firestore/courseGroups";
import { normalizeUser, type UserDoc } from "@/lib/firestore/users";
import styles from "./GroupFacilitators.module.css";

/**
 * THE FACILITATORS VIEW of a programme's Groups tab (board st-facilitators):
 * who facilitates each group of the run the programme names, and a way to
 * change them by hand.
 *
 * Read from `GET /api/courses/runs/[runId]/facilitators` (names, ids and
 * roles: never an address) and changed through the group's own facilitators
 * route, the one the run editor's group card uses, which decides again who
 * may and which accounts it accepts. Changing who facilitates emails nobody.
 *
 * What the board draws and this leaves out, because the feature does not
 * exist yet: asking somebody by email, their yes or no, the training, and
 * the list of people who said on the form they would like to facilitate.
 */

type Props = { runId: string };

/** "5 facilitators for 4 groups", counting a person who facilitates two groups once. */
function headline(groups: readonly RunFacilitatorGroup[]): string {
  const people = new Set(groups.flatMap((group) => group.facilitators.map((facilitator) => facilitator.uid)));
  const facilitators = `${people.size} ${people.size === 1 ? "facilitator" : "facilitators"}`;
  return `${facilitators} for ${groups.length} ${groups.length === 1 ? "group" : "groups"}`;
}

export default function GroupFacilitators({ runId }: Props) {
  const [data, setData] = useState<RunFacilitatorsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** The group whose facilitators are being changed, and the people ticked for it. */
  const [editing, setEditing] = useState<{ groupId: string; uids: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  /** Bumped to read the groups again, after a save. */
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // State is set only when the read lands, never in the effect's own body
  // (`useAllocation`'s idiom).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/courses/runs/${encodeURIComponent(runId)}/facilitators`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (RunFacilitatorsPayload & { error?: string }) | null;
        if (!response.ok || !body || !Array.isArray(body.groups)) {
          throw new Error(body?.error ?? "The groups could not be read. Reload the page to try again.");
        }
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "The groups could not be read. Reload the page to try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [runId, nonce]);

  // The picker's own shape, built from names, ids and roles alone.
  const users: UserDoc[] = useMemo(
    () => (data?.people ?? []).map((person) => normalizeUser(person.uid, { displayName: person.name, role: person.role })),
    [data],
  );

  async function save() {
    if (!editing) return;
    setSaving(true);
    setProblem(null);
    try {
      await setGroupFacilitators(editing.groupId, editing.uids);
      const name = data?.groups.find((group) => group.id === editing.groupId)?.name ?? "The group";
      setEditing(null);
      setSaved(`${name}’s facilitators are saved. Nobody was emailed.`);
      reload();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <p className={styles.problem} role="alert">
        {loadError}
      </p>
    );
  }
  if (!data) {
    return (
      <p className={styles.muted} role="status">
        Reading the groups…
      </p>
    );
  }
  if (data.groups.length === 0) {
    return (
      <section className={styles.card}>
        <h2 className={styles.title}>No groups on this run yet</h2>
        <p className={styles.muted}>An admin adds the run’s groups in the run editor, and they appear here to staff.</p>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="facilitators-title">
      <h2 id="facilitators-title" className={styles.title}>
        {headline(data.groups)}
      </h2>
      <ul className={styles.groups}>
        {data.groups.map((group) => {
          const open = editing?.groupId === group.id;
          return (
            <li key={group.id} className={styles.group}>
              <div className={styles.groupHead}>
                <strong className={styles.groupName}>{group.name}</strong>
                <span className={styles.muted}>{group.when ?? "No day and time yet"}</span>
              </div>
              <div className={styles.groupBody}>
                {open ? (
                  <>
                    <PersonSelector
                      users={users}
                      selected={editing.uids}
                      onChange={(uids) => setEditing({ groupId: group.id, uids })}
                      label={`Facilitators of ${group.name}`}
                      role="facilitator"
                      max={GROUP_FIELD_LIMITS.maxFacilitators}
                    />
                    {problem && (
                      <p className={styles.problem} role="alert">
                        {problem}
                      </p>
                    )}
                    <div className={styles.actions}>
                      <Button onClick={() => void save()} disabled={saving}>
                        {saving ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditing(null);
                          setProblem(null);
                        }}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {group.facilitators.length === 0 ? (
                      <p className={styles.muted}>Nobody facilitates it yet.</p>
                    ) : (
                      <ul className={styles.people}>
                        {group.facilitators.map((facilitator) => (
                          <li key={facilitator.uid} className={styles.person}>
                            <InitialsChip name={facilitator.name} uid={facilitator.uid} size="sm" />
                            <span>{facilitator.name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <Button
                      variant="secondary"
                      className={styles.change}
                      aria-label={`Change ${group.name}’s facilitators`}
                      onClick={() => {
                        setSaved(null);
                        setProblem(null);
                        setEditing({ groupId: group.id, uids: group.facilitators.map((facilitator) => facilitator.uid) });
                      }}
                      disabled={editing !== null}
                    >
                      Change
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className={styles.foot} role="status">
        {saved ??
          "Changing who facilitates a group emails nobody. Somebody added after groups have gone out is told by the next press of Publish, on People in groups."}
      </p>
    </section>
  );
}
