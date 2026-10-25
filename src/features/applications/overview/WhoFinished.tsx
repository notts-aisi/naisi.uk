"use client";

import { useState } from "react";
import Link from "next/link";
import InitialsChip from "@/components/ui/InitialsChip";
import { useHydrated } from "@/hooks/useHydrated";
import type { WhoFinishedModel } from "@/lib/courses/finishing/whoFinished";
import { NO_RULE_AFTER, NO_RULE_BEFORE, NO_RULE_LINK, NO_RULE_SENTENCE } from "@/lib/courses/finishing/words";
// The Overview's own stylesheet: this card is a part of that page.
import styles from "./ProgrammeOverview.module.css";

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
 *
 * ON A PHONE (en-finish draws no phone board) the same table is drawn a card
 * a row: the person and their Finished switch side by side, and their group,
 * "came to" and exercises under the name, each with its column's word, so no
 * switch is ever behind a sideways scroll. The stylesheet does that from the
 * cells' own classes; the words and the controls are the laptop table's.
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
      className={open ? styles.wfChevronOpen : styles.wfChevron}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/**
 * The line beside the counts: "Saved", "Saving…", or why a change did not
 * save. A status region, so a change is announced without taking focus.
 */
function SaveLine({ saving, problem }: { saving: boolean; problem: string | null }) {
  if (problem) {
    return (
      <span role="status" className={`${styles.wfStatus} ${styles.wfStatusProblem}`}>
        {problem}
      </span>
    );
  }
  return (
    <span role="status" className={styles.wfStatus}>
      {!saving && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.wfStatusTick}>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
      {saving ? "Saving…" : "Saved"}
    </span>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.wfNoteIcon}>
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

  const hidden = model.rows.length - model.shown;
  const rows = expanded ? model.rows : model.rows.slice(0, model.shown);

  return (
    <section className={styles.wfCard} aria-labelledby="who-finished">
      <div className={styles.wfHead}>
        <div className={styles.wfHeadText}>
          <h2 id="who-finished" className={styles.wfTitle}>
            Who finished
          </h2>
          <p className={styles.wfSentence}>
            {model.sentence === NO_RULE_SENTENCE ? (
              // With no rule, "Settings" leads to the rule's card, as the
              // People card's "Set who counts as finished" does before the end.
              <>
                {NO_RULE_BEFORE}
                <Link
                  href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/setup#who-finished`}
                  className={styles.wfSentenceLink}
                >
                  {NO_RULE_LINK}
                </Link>
                {NO_RULE_AFTER}
              </>
            ) : (
              model.sentence
            )}
          </p>
        </div>
        <div className={styles.wfHeadSide}>
          <span className={styles.wfCounts}>{model.counts}</span>
          <SaveLine saving={pressed !== null} problem={problem} />
        </div>
      </div>

      <div className={styles.wfScroll}>
        <table className={styles.wfTable}>
          <caption className={styles.wfCaption}>Fewest sessions first</caption>
          <thead className={styles.wfThead}>
            <tr>
              <th scope="col" className={styles.wfTh}>
                Name
              </th>
              <th scope="col" className={`${styles.wfTh} ${styles.wfColGroup}`}>
                Group
              </th>
              <th scope="col" className={`${styles.wfTh} ${styles.wfColCount}`}>
                Came to
              </th>
              <th scope="col" className={`${styles.wfTh} ${styles.wfColCount}`}>
                Exercises
              </th>
              <th scope="col" className={`${styles.wfTh} ${styles.wfColFinished}`}>
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
                  <td className={`${styles.wfTd} ${styles.wfCellPerson}`}>
                    <div className={styles.wfPerson}>
                      <InitialsChip name={row.name} uid={row.uid} size="sm" />
                      <div className={styles.wfPersonText}>
                        <div className={styles.wfName}>{row.name}</div>
                        {row.line && <div className={styles.wfLine}>{row.line}</div>}
                      </div>
                    </div>
                  </td>
                  <td className={`${styles.wfTd} ${styles.wfCellGroup}`}>{row.groupName}</td>
                  <td className={`${styles.wfTd} ${styles.wfCellCame}`}>{row.came}</td>
                  <td className={`${styles.wfTd} ${styles.wfCellExercises}`}>{row.exercises ?? "None set"}</td>
                  <td className={`${styles.wfTd} ${styles.wfCellFinished}`}>
                    <div className={styles.wfFinishedCell}>
                      <label className={styles.wfSwitch}>
                        <input
                          type="checkbox"
                          role="switch"
                          className={styles.wfSwitchInput}
                          aria-label={`Finished: ${row.name}`}
                          checked={checked}
                          disabled={!live || pressed !== null}
                          onChange={(event) => void save(row.uid, event.target.checked)}
                        />
                        <span className={styles.wfSwitchTrack} aria-hidden="true">
                          <span className={styles.wfSwitchKnob} />
                        </span>
                      </label>
                      {row.changed && <span className={styles.wfChanged}>{row.changed}</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {hidden > 0 && (
              <tr>
                <td colSpan={5} className={styles.wfMoreCell}>
                  <button
                    type="button"
                    className={styles.wfMore}
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
                <td colSpan={5} className={styles.wfTd}>
                  <span className={styles.wfMuted}>Nobody took part.</span>
                </td>
              </tr>
            )}
            {model.left.length > 0 && (
              <>
                <tr>
                  <td colSpan={5} className={styles.wfLeftHeadCell}>
                    <div className={styles.wfLeftHead}>Left the programme</div>
                  </td>
                </tr>
                {model.left.map((person) => (
                  <tr key={person.uid}>
                    <td className={`${styles.wfTd} ${styles.wfCellPerson}`}>
                      <div className={styles.wfPerson}>
                        <InitialsChip name={person.name} uid={person.uid} size="sm" />
                        <span className={styles.wfLeftName}>{person.name}</span>
                      </div>
                    </td>
                    <td className={`${styles.wfTd} ${styles.wfCellGroup}`}>
                      <span className={styles.wfMuted}>{person.groupName}</span>
                    </td>
                    <td className={`${styles.wfTd} ${styles.wfCellEmpty}`} />
                    <td className={`${styles.wfTd} ${styles.wfCellEmpty}`} />
                    <td className={`${styles.wfTd} ${styles.wfCellFinished}`}>
                      <span className={styles.wfMuted}>{person.left}</span>
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {model.notes.map((note) => (
        <p key={note} className={styles.wfNote}>
          <InfoIcon />
          <span>{note}</span>
        </p>
      ))}
    </section>
  );
}
