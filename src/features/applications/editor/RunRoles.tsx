"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import kit from "@/features/applications/kit/kit.module.css";
import type { RunPanelView, RunRolePersonView, RunRolesView } from "@/lib/applications/handover/views";
import * as W from "@/lib/courses/runCareful/words";
import { postRunRoleRemoved } from "./editorClient";
import styles from "./RunHandOver.module.css";

/**
 * THE RUN'S OLDER ROLES, in the Course run section (admins only): the
 * people named on the older run page as its track leads or run
 * facilitators, each with Remove, which asks first and says what the person
 * can no longer do after. Drawn only when somebody is named. Nobody is added
 * here, and nobody is emailed.
 */
export default function RunRoles({
  roundId,
  programmeId,
  roles,
  live,
  onRemoved,
}: {
  roundId: string;
  programmeId: string;
  roles: RunRolesView;
  live: boolean;
  /** The section read again by the route, with the sentence saying what happened. */
  onRemoved: (panel: RunPanelView, said: string) => void;
}) {
  const [asking, setAsking] = useState<{ list: W.RoleList; person: RunRolePersonView } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (roles.trackLeads.length === 0 && roles.runFacilitators.length === 0) return null;

  function close() {
    if (busy) return;
    setAsking(null);
    setProblem(null);
  }

  async function confirm() {
    if (!asking || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const answer = await postRunRoleRemoved(roundId, programmeId, asking.list, asking.person.uid);
      const said = W.removedWords(asking.person.name, asking.list);
      setAsking(null);
      onRemoved(answer.panel, said);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Each list by name, in the order the section draws them.
  const lists: [W.RoleList, RunRolePersonView[]][] = [
    ["trackLeads", roles.trackLeads],
    ["runFacilitators", roles.runFacilitators],
  ];
  const title = asking ? W.removeTitle(asking.person.name, asking.list) : "";

  return (
    <div className={styles.part}>
      <h3 className={styles.partTitle}>{W.ROLES_TITLE}</h3>
      <p className={styles.small}>{W.ROLES_NOTE}</p>
      {lists.map(([list, people]) =>
        people.length === 0 ? null : (
          <div key={list} className={styles.group}>
            <p className={styles.groupTitle}>
              {W.ROLE_HEADINGS[list]} ({people.length})
            </p>
            <ul className={styles.rows}>
              {people.map((person) => (
                <li key={person.uid} className={styles.row}>
                  <span className={styles.rowName}>{person.name}</span>
                  <button
                    type="button"
                    className={styles.quiet}
                    disabled={!live || busy}
                    onClick={() => {
                      setProblem(null);
                      setAsking({ list, person });
                    }}
                  >
                    {W.REMOVE_BUTTON}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}

      <Modal open={asking !== null} onClose={close} ariaLabel={title || W.ROLES_TITLE} width="sm" sheet>
        {asking && (
          <div className={styles.dialog}>
            <h2 className={styles.dialogTitle}>{title}</h2>
            <p className={styles.dialogBody}>{W.ROLE_AFTER[asking.list]}</p>
            <p className={styles.small}>{W.NOBODY_IS_EMAILED}</p>
            {problem && (
              <p className={styles.dialogProblem} role="alert">
                {problem}
              </p>
            )}
            <div className={styles.dialogActions}>
              <button type="button" className={styles.quiet} disabled={busy} onClick={close}>
                {W.KEEP_THEM}
              </button>
              <button type="button" className={kit.primary} disabled={busy} onClick={() => void confirm()}>
                {W.REMOVE_CONFIRM}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
