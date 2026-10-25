"use client";

import { useState } from "react";
import InitialsChip from "@/components/ui/InitialsChip";
import { SavedStatus, type SaveState } from "@/features/applications/editor/controls";
import { useHydrated } from "@/hooks/useHydrated";
import type { WhoFinishedModel } from "@/lib/courses/finishing/whoFinished";
import styles from "./WhoFinished.module.css";

/**
 * WHO FINISHED (board en-finish), on the programme's Overview once the run's
 * last session is over, for its lead and admins. The server worded all of it
 * (`buildWhoFinished`); this draws it and sends a switch's change the moment
 * it is made.
 *
 * SAVED AT ONCE. A switch shows its new position while the change is on its
 * way, the line at the top says "Saving…", and the answer is the section as
 * the server now has it: the counts, the switch and "Changed by you". A
 * refusal puts the switch back and says why. One change goes at a time.
 *
 * Before the page is live the switches are drawn and not pressable, since
 * nothing would be listening.
 */

type OpenModel = Extract<WhoFinishedModel, { state: "open" }>;

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={open ? styles.chevronOpen : styles.chevron}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.noteIcon}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.5" />
    </svg>
  );
}

export default function WhoFinished({
  model: initial,
  roundId,
  programmeId,
}: {
  model: OpenModel;
  roundId: string;
  programmeId: string;
}) {
  const live = useHydrated();
  const [model, setModel] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  /** The switch being saved, and the way it was pressed, until the server answers. */
  const [pressed, setPressed] = useState<{ uid: string; finished: boolean } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async (uid: string, finished: boolean) => {
    setPressed({ uid, finished });
    setProblem(null);
    try {
      const response = await fetch(
        `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/finishing`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ uid, finished }),
        },
      );
      const answer = (await response.json().catch(() => null)) as { model?: WhoFinishedModel; error?: string } | null;
      if (!response.ok || answer?.model?.state !== "open") {
        setProblem(answer?.error ?? "That didn’t save. Try again in a minute.");
      } else {
        setModel(answer.model);
      }
    } catch {
      setProblem("Couldn’t reach the site to save that. Check your connection and try again.");
    } finally {
      setPressed(null);
    }
  };

  const state: SaveState = problem ? "problem" : pressed ? "saving" : "saved";
  const hidden = model.rows.length - model.shown;
  const rows = expanded ? model.rows : model.rows.slice(0, model.shown);

  return (
    <section className={styles.card} aria-labelledby="who-finished">
      <div className={styles.head}>
        <div className={styles.headText}>
          <h2 id="who-finished" className={styles.title}>
            Who finished
          </h2>
          <p className={styles.sentence}>{model.sentence}</p>
        </div>
        <div className={styles.headSide}>
          <span className={styles.counts}>{model.counts}</span>
          <SavedStatus state={state} problem={problem} />
        </div>
      </div>

      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption className={styles.caption}>Fewest sessions first</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.th}>
                Name
              </th>
              <th scope="col" className={`${styles.th} ${styles.colGroup}`}>
                Group
              </th>
              <th scope="col" className={`${styles.th} ${styles.colCount}`}>
                Came to
              </th>
              <th scope="col" className={`${styles.th} ${styles.colCount}`}>
                Exercises
              </th>
              <th scope="col" className={`${styles.th} ${styles.colFinished}`}>
                Finished
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const busy = pressed?.uid === row.uid;
              const checked = busy && pressed ? pressed.finished : row.finished;
              return (
                <tr key={row.uid}>
                  <td className={styles.td}>
                    <div className={styles.person}>
                      <InitialsChip name={row.name} uid={row.uid} size="sm" />
                      <div className={styles.personText}>
                        <div className={styles.name}>{row.name}</div>
                        {row.line && <div className={styles.line}>{row.line}</div>}
                      </div>
                    </div>
                  </td>
                  <td className={styles.td}>{row.groupName}</td>
                  <td className={styles.td}>{row.came}</td>
                  <td className={styles.td}>{row.exercises ?? "None set"}</td>
                  <td className={styles.td}>
                    <div className={styles.finishedCell}>
                      <label className={styles.switch}>
                        <input
                          type="checkbox"
                          role="switch"
                          className={styles.switchInput}
                          aria-label={`Finished: ${row.name}`}
                          checked={checked}
                          disabled={!live || pressed !== null}
                          onChange={(event) => void save(row.uid, event.target.checked)}
                        />
                        <span className={styles.switchTrack} aria-hidden="true">
                          <span className={styles.switchKnob} />
                        </span>
                      </label>
                      {row.changed && <span className={styles.changed}>{row.changed}</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {hidden > 0 && (
              <tr>
                <td colSpan={5} className={styles.moreCell}>
                  <button
                    type="button"
                    className={styles.more}
                    aria-expanded={expanded}
                    onClick={() => setExpanded((open) => !open)}
                  >
                    <span>{expanded ? "Show fewer" : `+${hidden} more`}</span>
                    <ChevronIcon open={expanded} />
                  </button>
                </td>
              </tr>
            )}
            {model.rows.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.td}>
                  <span className={styles.muted}>Nobody took part.</span>
                </td>
              </tr>
            )}
            {model.left.length > 0 && (
              <>
                <tr>
                  <td colSpan={5} className={styles.leftHeadCell}>
                    <div className={styles.leftHead}>Left the programme</div>
                  </td>
                </tr>
                {model.left.map((person) => (
                  <tr key={person.uid}>
                    <td className={styles.td}>
                      <div className={styles.person}>
                        <InitialsChip name={person.name} uid={person.uid} size="sm" />
                        <span className={styles.leftName}>{person.name}</span>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.muted}>{person.groupName}</span>
                    </td>
                    <td className={styles.td} />
                    <td className={styles.td} />
                    <td className={styles.td}>
                      <span className={styles.muted}>{person.left}</span>
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {model.notes.map((note) => (
        <p key={note} className={styles.note}>
          <InfoIcon />
          <span>{note}</span>
        </p>
      ))}
    </section>
  );
}
