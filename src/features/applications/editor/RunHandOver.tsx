"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import Select from "@/components/ui/Select";
import kit from "@/features/applications/kit/kit.module.css";
import TakeOffSheet from "@/features/courses/takeOff/TakeOffSheet";
import { useHydrated } from "@/hooks/useHydrated";
import type { HandOverPersonView, RunPanelView } from "@/lib/applications/handover/views";
import { COURSE_RUN_CLOSES_THE_ROW } from "@/lib/courses/runCareful/options";
import * as CW from "@/lib/courses/runCareful/words";
import { fetchRunPanel, postHandOver, putProgrammeRun } from "./editorClient";
import shared from "./editor.module.css";
import RunCareful from "./RunCareful";
import RunDetails from "./RunDetails";
import RunMake from "./RunMake";
import RunRoles from "./RunRoles";
import RunStands from "./RunStands";
import styles from "./RunHandOver.module.css";
import {
  LEFT_NOTE,
  LEFT_TITLE,
  TAKEN_OFF_NOTE,
  TAKEN_OFF_TITLE,
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
 * WHERE THE RUN STANDS AND ITS DETAILS sit between the two, once a run is
 * named (`RunStands`, `RunDetails`): its stage with the two early moves,
 * each asking first, and the form for its label, year, cohort and start
 * date. Neither emails anybody.
 *
 * TWO THINGS HAPPEN HERE, and neither tells an applicant anything.
 *
 *  1. NAMING THE RUN this term's accepted people go onto. Picking one saves
 *     at once, like the Course page box above it. From then on that run's
 *     own apply page takes no applications.
 *  2. THE HAND-OVER, once decisions have been sent: everybody who holds a
 *     place on the programme is put on People in groups. Nobody is
 *     emailed, nobody is put in a group, and nothing in their member area
 *     changes because of it: the first thing the course system shows
 *     somebody is their group. It can be pressed again whenever somebody new
 *     has a place, and nothing is written twice.
 *
 * WHAT THE SERVER SAID IS WHAT IS DRAWN. Every answer brings the whole panel
 * back, read from what is stored at that moment, and the panel is redrawn
 * from it. Nothing here works out who holds a place, which run can be
 * picked or what stops a press: those are the server's, and its sentence is
 * shown as it was written.
 *
 * THE LAST PARTS, each asking first: "Make a new run of AGI Strategy" where
 * the programme names no run (`RunMake`); taking off somebody who gave their
 * place back, in the take-off sheet every board uses, which says who it
 * emails and closes their row on the run's list with it; the run's older
 * roles with Remove (`RunRoles`); and Careful (`RunCareful`).
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
  // What an early move of the run's status did, once the section is read again.
  const [moved, setMoved] = useState<string | null>(null);
  // Somebody who gave their place back, being taken off in the take-off sheet.
  const [takingOff, setTakingOff] = useState<string | null>(null);
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
    setMoved(null);
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
  // After an early move: the section read again, and what the move did said.
  async function afterMove(said: string) {
    const answer = await send("check", () => fetchRunPanel(roundId, programmeId));
    if (answer) setMoved(said);
  }

  // After a part that wrote through its own route and brought the section back.
  function redrawn(next: RunPanelView, said: string) {
    setReceipt(null);
    setProblem(null);
    setPanel(next);
    setMoved(said);
  }

  const idle = live && busy === null;
  const runId = panel.runId;
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
            {panel.canMakeRun ? CW.noRunYetWords(panel.programmeName, panel.termName) : runHint(panel)}
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

        {panel.canMakeRun && (
          <RunMake
            roundId={roundId}
            programmeId={programmeId}
            programmeName={panel.programmeName}
            live={idle}
            onMade={redrawn}
          />
        )}

        {problem && (
          <p className={`${shared.notice} ${shared.noticeProblem}`} role="alert">
            {problem}
          </p>
        )}

        {panel.runId === null && moved && (
          <p className={styles.receipt} role="status">
            {moved}
          </p>
        )}

        {panel.runId !== null && panel.stands && (
          <>
            <RunStands
              runId={panel.runId}
              stands={panel.stands}
              live={idle}
              onMoved={(said) => afterMove(said)}
            />
            {moved && (
              <p className={styles.receipt} role="status">
                {moved}
              </p>
            )}
          </>
        )}

        {panel.runId !== null && panel.details && (
          <RunDetails
            key={panel.runId}
            roundId={roundId}
            programmeId={programmeId}
            details={panel.details}
            live={idle}
            onSaved={(next) => {
              setMoved(null);
              setPanel(next);
            }}
            onRefused={() => void check()}
          />
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
                  Open People in groups
                </Link>
              )}
            </div>

            {receipt && (
              <p className={styles.receipt} role="status">
                {receipt}
              </p>
            )}

            <p className={styles.small}>
              Handing over puts them on People in groups. Nobody is emailed, nobody is put in a
              group, and nothing changes in their member area until Publish has told them their group. Press it
              again whenever somebody new has a place: nothing is written twice.
            </p>

            {panel.gaveBack.length > 0 && (
              <div className={styles.group}>
                <p className={styles.groupTitle}>
                  {CW.GAVE_BACK_TITLE} ({panel.gaveBack.length})
                </p>
                <p className={styles.small}>{CW.gaveBackNote(COURSE_RUN_CLOSES_THE_ROW)}</p>
                <ul className={styles.rows}>
                  {panel.gaveBack.map((person) => (
                    <li key={person.uid} className={styles.row}>
                      <div className={styles.rowText}>
                        <Link href={person.applicationPath} className={styles.person}>
                          {person.name}
                        </Link>
                        <span className={styles.small}>{person.line}</span>
                        {person.noSeat && panel.listPath && (
                          <Link href={panel.listPath} className={styles.inText}>
                            {CW.CHANGE_THEIR_ROW}
                          </Link>
                        )}
                      </div>
                      {person.canTakeOff && panel.runId !== null && (
                        <button
                          type="button"
                          className={styles.quiet}
                          disabled={!idle}
                          onClick={() => setTakingOff(person.uid)}
                        >
                          {CW.takeOffWords(person.firstName)}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* People who no longer hold a place and whose seat is free
                already: they left by themselves, or staff took them off. */}
            {panel.left.length > 0 && (
              <div className={styles.group}>
                <People title={LEFT_TITLE} people={panel.left} />
                <p className={styles.small}>{LEFT_NOTE}</p>
              </div>
            )}

            {panel.takenOff.length > 0 && (
              <div className={styles.group}>
                <People title={TAKEN_OFF_TITLE} people={panel.takenOff} />
                <p className={styles.small}>{TAKEN_OFF_NOTE}</p>
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

            {panel.closedRow.length > 0 && (
              <div className={styles.group}>
                <People title={CW.CLOSED_ROW_TITLE} people={panel.closedRow} />
                <p className={styles.small}>{CW.CLOSED_ROW_NOTE}</p>
              </div>
            )}

            {panel.otherRows > 0 && <p className={styles.small}>{otherRowsLine(panel.otherRows)}</p>}
          </div>
        )}

        {panel.runId !== null && panel.roles && (
          <RunRoles roundId={roundId} programmeId={programmeId} roles={panel.roles} live={idle} onRemoved={redrawn} />
        )}

        {panel.runId !== null && panel.careful && (
          <RunCareful runId={panel.runId} careful={panel.careful} live={idle} onDone={(said) => afterMove(said)} />
        )}

        {takingOff && runId !== null && (
          <TakeOffSheet runId={runId} uid={takingOff}
            closeRow={COURSE_RUN_CLOSES_THE_ROW}
            onClose={() => setTakingOff(null)}
            onDone={(said) => {
              setTakingOff(null);
              void afterMove(said);
            }}
          />
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
            {person.note ? <span className={styles.small}> · {person.note}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
