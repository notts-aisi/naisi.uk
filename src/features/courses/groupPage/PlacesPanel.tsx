"use client";

import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import * as P from "@/lib/courses/placesAndName/words";
import { UNKNOWN_OUTCOME } from "@/lib/courses/sessionChange/words";
import styles from "./GroupPage.module.css";

/**
 * THE GROUP'S PLACES, from its page: how many people it takes, or no limit
 * with the field left empty, saved through the programme's places route
 * (`PUT .../groups/[groupId]/places`, the programme's lead or an admin; the
 * route asks again and counts again). The hint names what the places can't
 * go below, the people in the group and any freed place offered in it and
 * not answered, as the page read them; the route's own count, in one
 * transaction, is what decides. A refusal's sentence stands where the hint
 * was. Nobody is emailed.
 */
export default function PlacesPanel({
  groupName,
  places,
  placesPath,
  onClose,
  onDone,
}: {
  groupName: string;
  places: { capacity: number | null; inGroup: number; freedOffers: number };
  /** The programme's places route for this group. */
  placesPath: string;
  onClose: () => void;
  onDone: (said: string) => void;
}) {
  const ids = useId();
  const hydrated = useHydrated();
  const [value, setValue] = useState(places.capacity === null ? "" : String(places.capacity));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const off = !hydrated || busy;

  async function save() {
    const typed = value.trim();
    // Empty is no limit. Anything typed that is not a number goes as typed,
    // so the route answers it with its own sentence rather than reading it as
    // no limit (a NaN would be sent as null).
    const number = Number(typed);
    const sent = typed === "" ? null : Number.isFinite(number) ? number : typed;
    setBusy(true);
    setProblem(null);
    let status = 0;
    let body: Record<string, unknown> | null = null;
    try {
      const response = await fetch(placesPath, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ places: sent }),
      });
      status = response.status;
      body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    } catch {
      setBusy(false);
      setProblem(UNKNOWN_OUTCOME);
      return;
    }
    setBusy(false);
    if (status !== 200 || body?.ok !== true) {
      setProblem(typeof body?.error === "string" ? body.error : UNKNOWN_OUTCOME);
      return;
    }
    onDone(typeof body.message === "string" ? body.message : "");
  }

  const titleId = `${ids}-title`;
  const hintId = `${ids}-hint`;
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.panelHead}>
        <h2 id={titleId} className={styles.panelTitle}>
          {P.placesPanelTitle(groupName)}
        </h2>
      </div>
      <p className={styles.panelLede}>{P.placesLede(groupName)}</p>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={`${ids}-places`}>
          {P.PLACES_FIELD}
        </label>
        {problem ? (
          <p id={hintId} className={styles.problem} role="status">
            {problem}
          </p>
        ) : (
          <p id={hintId} className={styles.fieldHint}>
            {P.placesHint(groupName, places)}
          </p>
        )}
        <Input
          id={`${ids}-places`}
          type="number"
          inputMode="numeric"
          min={1}
          max={40}
          step={1}
          autoComplete="off"
          aria-describedby={hintId}
          value={value}
          disabled={off}
          onChange={(e) => {
            setValue(e.target.value);
            setProblem(null);
          }}
        />
      </div>
      <p className={styles.panelNote}>{P.placesOwnLimitNote(groupName)}</p>
      <p className={styles.panelNote}>{P.EMAILS_NOBODY}</p>
      <div className={`${styles.panelActions} ${styles.panelActionsSheet}`}>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {P.CANCEL}
        </Button>
        <Button type="button" onClick={() => void save()} disabled={off}>
          {busy ? P.SAVING : P.SAVE_PLACES}
        </Button>
      </div>
    </section>
  );
}
