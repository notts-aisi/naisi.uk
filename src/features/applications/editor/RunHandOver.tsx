"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import Select from "@/components/ui/Select";
import kit from "@/features/applications/kit/kit.module.css";
import { useHydrated } from "@/hooks/useHydrated";
import type { HandOverPersonView, RunPanelView } from "@/lib/applications/handover/views";
import { fetchRunPanel, postHandOver, putProgrammeRun } from "./editorClient";
import shared from "./editor.module.css";
import styles from "./RunHandOver.module.css";
import {
  handOverButton,
  handOverReceipt,
  holdersLine,
  otherRowsLine,
  runHint,
  unpickable,
} from "./runHandOverWords";

/**
 * The "Course run" panel on a programme's Settings tab. For admins: the page
 * draws it for nobody else, and both routes behind it refuse anybody else
 * before anything is read.
 *
 * TWO THINGS HAPPEN HERE, and neither tells an applicant anything.
 *
 *  1. NAMING THE RUN this term's accepted people go onto. Picking one saves
 *     at once, like the Course page box above it. From then on that run's
 *     own apply page takes no applications.
 *  2. THE HAND-OVER, once decisions have been sent: everybody who holds a
 *     place on the programme is put on the run's allocation board. Nobody is
 *     emailed and nobody is put in a group. It can be pressed again whenever
 *     somebody new has a place, and nothing is written twice.
 *
 * WHAT THE SERVER SAID IS WHAT IS DRAWN. Every answer brings the whole panel
 * back, read from what is stored at that moment, and the panel is redrawn
 * from it. Nothing here works out who holds a place, which run can be
 * picked or what stops a press: those are the server's, and its sentence is
 * shown as it was written.
 *
 * "Check again" reads the panel afresh. The course tie is changed in the
 * section above, on the same page, and people reply over several days, so
 * what this drew when the page loaded can be out of date.
 */
export default function RunHandOver({
  roundId,
  programmeId,
  initial,
}: {
  roundId: string;
  programmeId: string;
  initial: RunPanelView;
}) {
  const ids = useId();
  // The controls wait for the page to be live, so nothing pressed before its
  // JavaScript arrives is lost.
  const live = useHydrated();
  const [panel, setPanel] = useState(initial);
  const [busy, setBusy] = useState<"run" | "press" | "check" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  // One request at a time: an answer always describes what the last press did.
  const sending = useRef(false);

  async function send<T extends { panel: RunPanelView }>(
    kind: "run" | "press" | "check",
    request: () => Promise<T>,
  ): Promise<T | null> {
    if (sending.current) return null;
    sending.current = true;
    setBusy(kind);
    setProblem(null);
    setReceipt(null);
    try {
      const answer = await request();
      setPanel(answer.panel);
      return answer;
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That did not go through. Try again.");
      return null;
    } finally {
      sending.current = false;
      setBusy(null);
    }
  }

  const pickRun = (runId: string | null) => send("run", () => putProgrammeRun(roundId, programmeId, runId));
  const check = () => send("check", () => fetchRunPanel(roundId, programmeId));
  async function press() {
    const answer = await send("press", () => postHandOver(roundId, programmeId));
    if (answer) setReceipt(handOverReceipt(answer.receipt));
  }

  const idle = live && busy === null;
  const reasons = unpickable(panel);

  return (
    <section className={shared.card} aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`} className={shared.cardTitle}>
        Course run
      </h2>
      <p className={shared.cardNote}>
        The run this term’s accepted people go onto. Only admins see this section.
      </p>

      <div className={styles.body}>
        <div className={`${shared.field} ${styles.field}`}>
          <label htmlFor={`${ids}-run`} className={shared.label}>
            Run
          </label>
          <Select
            id={`${ids}-run`}
            className={shared.select}
            value={panel.runId ?? ""}
            disabled={!idle || !panel.courseTied || panel.runLocked !== null}
            aria-describedby={`${ids}-run-hint`}
            onChange={(event) => void pickRun(event.target.value || null)}
          >
            <option value="">No run yet</option>
            {panel.choices.map((choice) => (
              <option key={choice.id} value={choice.id} disabled={!choice.selectable}>
                {choice.label}
              </option>
            ))}
          </Select>
          <p id={`${ids}-run-hint`} className={shared.hint}>
            {runHint(panel)}
          </p>
          {reasons.length > 0 && (
            <ul className={styles.reasons}>
              {reasons.map((choice) => (
                <li key={choice.id}>
                  <strong>{choice.label}:</strong> {choice.note}
                </li>
              ))}
            </ul>
          )}
        </div>

        {problem && (
          <p className={`${shared.notice} ${shared.noticeProblem}`} role="alert">
            {problem}
          </p>
        )}

        {panel.runId !== null && (
          <div className={styles.part}>
            <h3 className={styles.partTitle}>Hand people over</h3>

            {panel.blocked !== null ? (
              <p className={shared.notice}>{panel.blocked}</p>
            ) : (
              <>
                <p className={styles.line}>{holdersLine(panel)}</p>
                <People title="To hand over" people={panel.toHandOver} />
              </>
            )}

            <div className={styles.actions}>
              <button
                type="button"
                className={kit.primary}
                disabled={!idle || panel.blocked !== null}
                onClick={() => void press()}
              >
                {busy === "press" ? "Handing over…" : handOverButton(panel)}
              </button>
              <button type="button" className={styles.quiet} disabled={!idle} onClick={() => void check()}>
                {busy === "check" ? "Checking…" : "Check again"}
              </button>
              {panel.boardPath && (
                <Link href={panel.boardPath} className={styles.link}>
                  Open the allocation board
                </Link>
              )}
            </div>

            {receipt && (
              <p className={styles.receipt} role="status">
                {receipt}
              </p>
            )}

            <p className={styles.small}>
              Handing over puts them on the run’s allocation board. Nobody is emailed and nobody is put in a
              group. Press it again whenever somebody new has a place: nothing is written twice.
            </p>

            {panel.gaveBack.length > 0 && (
              <div className={styles.group}>
                <People title="No longer hold a place" people={panel.gaveBack} />
                <p className={styles.small}>
                  They gave their place back after they were handed over, and nothing takes them off the run.
                  Remove them from their group on the board, then change their row on{" "}
                  {panel.listPath ? (
                    <Link href={panel.listPath} className={styles.inText}>
                      the run’s own applications list
                    </Link>
                  ) : (
                    "the run’s own applications list"
                  )}
                  . Nobody is emailed by either.
                </p>
              </div>
            )}

            {panel.notAccepted.length > 0 && (
              <div className={styles.group}>
                <People title="Hold a place, and are not accepted on the run’s list" people={panel.notAccepted} />
                <p className={styles.small}>
                  Their row on the run’s own applications list says something other than accepted, and handing
                  over never changes a row. Accept them there to put them on the board.
                </p>
              </div>
            )}

            {panel.otherRows > 0 && <p className={styles.small}>{otherRowsLine(panel.otherRows)}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

/** A list of people by name, each a link to their application on the review screen. */
function People({ title, people }: { title: string; people: HandOverPersonView[] }) {
  if (people.length === 0) return null;
  return (
    <div className={styles.group}>
      <p className={styles.groupTitle}>
        {title} ({people.length})
      </p>
      <ul className={styles.people}>
        {people.map((person) => (
          <li key={person.uid}>
            <Link href={person.applicationPath} className={styles.person}>
              {person.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
