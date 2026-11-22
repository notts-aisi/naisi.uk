"use client";

import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import { GROUP_FIELD_LIMITS } from "@/lib/firestore/courseGroups";
import * as P from "@/lib/courses/placesAndName/words";
import { UNKNOWN_OUTCOME } from "@/lib/courses/sessionChange/words";
import styles from "./GroupPage.module.css";

/**
 * RENAMING THE GROUP, from its page, through the programme's name route
 * (`PUT .../groups/[groupId]/name`, the programme's lead or an admin; the
 * route asks again). The next email, register and calendar entry use the
 * new name; nobody is told. A refusal's sentence (a blank name, or one
 * another group of the run has) stands under the hint.
 */
export default function NamePanel({
  groupName,
  namePath,
  onClose,
  onDone,
}: {
  groupName: string;
  /** The programme's name route for this group. */
  namePath: string;
  onClose: () => void;
  onDone: (said: string) => void;
}) {
  const ids = useId();
  const hydrated = useHydrated();
  const [name, setName] = useState(groupName);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const off = !hydrated || busy;

  async function save() {
    setBusy(true);
    setProblem(null);
    let status = 0;
    let body: Record<string, unknown> | null = null;
    try {
      const response = await fetch(namePath, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
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
          {P.renamePanelTitle(groupName)}
        </h2>
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={`${ids}-name`}>
          {P.NAME_FIELD}
        </label>
        <p id={hintId} className={styles.fieldHint}>
          {P.NAME_HINT}
        </p>
        {problem && (
          <p className={styles.problem} role="status">
            {problem}
          </p>
        )}
        <Input
          id={`${ids}-name`}
          type="text"
          autoComplete="off"
          maxLength={GROUP_FIELD_LIMITS.name}
          aria-describedby={hintId}
          value={name}
          disabled={off}
          onChange={(e) => {
            setName(e.target.value);
            setProblem(null);
          }}
        />
      </div>
      <div className={`${styles.panelActions} ${styles.panelActionsSheet}`}>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {P.CANCEL}
        </Button>
        <Button type="button" onClick={() => void save()} disabled={off}>
          {busy ? P.SAVING : P.SAVE_THE_NAME}
        </Button>
      </div>
    </section>
  );
}
