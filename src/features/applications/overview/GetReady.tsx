import Link from "next/link";
import type { ReactNode } from "react";
import InitialsChip from "@/components/ui/InitialsChip";
import type { GetReadyModel, ReadyStep, StepTarget } from "@/lib/courses/getReady/model";
import {
  FACILITATORS_TITLE,
  NOT_SAID_FREE_TITLE,
  PLACES_ROWS,
  PLACES_TITLE,
  SEE_FREED_PLACES,
  STEP_STATE_LABEL,
} from "@/lib/courses/getReady/words";
import OverviewMarkReady from "./OverviewMarkReady";
import RemindFree from "./RemindFree";
import styles from "./ProgrammeOverview.module.css";

/**
 * A PROGRAMME'S OVERVIEW BEFORE ANY OF ITS GROUPS HAS MET (boards st-overview
 * and st-overview-phone): "Get ready for week 1", each step done, in progress
 * or to do with its line and its way on, then who has not said when they are
 * free, the places, and the facilitators.
 *
 * IT DRAWS WHAT THE SERVER WORKED OUT (`buildGetReady`) and decides nothing.
 * Two things run in the browser: week 1's "Mark ready", the Overview's own
 * control, and "Remind 3 people" on the card of who has not said when they
 * are free, which says how many it emails (C20).
 *
 * Every link is a page of the programme's own tabs, built from the two ids
 * the page was reached by; "Set rooms" is the run editor's, offered to an
 * admin only, because the programme's tabs set no room.
 *
 * Not drawn, because it is not built: "Suggest to another programme’s lead"
 * under somebody who gave their place back (its email is not drawn, C22).
 */

/** A view of the programme's tabs, by where a step leads. */
const SEGMENT: Record<Exclude<StepTarget, "run-editor">, string> = {
  settings: "/setup",
  times: "/groups/times",
  facilitators: "/groups/facilitators",
  groups: "/groups",
  weeks: "/weeks",
  "week-one": "/weeks/w01",
  publish: "/groups/publish",
};

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.readyArrow}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function StateMark({ state }: { state: ReadyStep["state"] }) {
  return (
    <span role="img" aria-label={STEP_STATE_LABEL[state]} className={`${styles.readyMark} ${styles[`readyMark_${state}`]}`}>
      {state === "done" ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      ) : state === "doing" ? (
        <span className={styles.readyMarkDot} aria-hidden="true" />
      ) : null}
    </span>
  );
}

type Where = { roundId: string; programmeId: string; courseId: string; runId: string };

function StepLink({ link, where }: { link: NonNullable<ReadyStep["link"]>; where: Where }) {
  const className = link.look === "text" ? styles.readyTextLink : styles.readyButtonLink;
  const body: ReactNode =
    link.look === "text" ? (
      <>
        <span>{link.label}</span>
        <Arrow />
      </>
    ) : (
      <span>{link.label}</span>
    );
  if (link.to === "run-editor") {
    return (
      <Link href={`/admin/courses/${encodeURIComponent(where.courseId)}/runs/${encodeURIComponent(where.runId)}`} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <Link
      href={`/admin/admissions/forms/${encodeURIComponent(where.roundId)}/programmes/${encodeURIComponent(where.programmeId)}${SEGMENT[link.to]}`}
      className={className}
    >
      {body}
    </Link>
  );
}

function Step({ step, where }: { step: ReadyStep; where: Where }) {
  const action = step.link || step.markReady || step.note;
  return (
    <li className={styles.readyStep}>
      <StateMark state={step.state} />
      <div className={styles.readyStepBody}>
        <div className={styles.readyStepText}>
          <h3 className={styles.readyStepTitle}>{step.title}</h3>
          <p className={styles.readyStepLine}>{step.line}</p>
        </div>
        {action ? (
          <div className={step.note ? styles.readyStepActionNoted : styles.readyStepAction}>
            {step.markReady ? (
              <OverviewMarkReady runId={step.markReady.runId} weekId={step.markReady.weekId} ready={false} />
            ) : null}
            {step.link ? <StepLink link={step.link} where={where} /> : null}
            {step.note ? <span className={styles.readyStepNote}>{step.note}</span> : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export default function GetReady({
  model,
  roundId,
  programmeId,
  courseId,
  runId,
}: {
  model: GetReadyModel;
  roundId: string;
  programmeId: string;
  courseId: string;
  runId: string;
}) {
  const where: Where = { roundId, programmeId, courseId, runId };
  const { places, facilitators, notSaid } = model;
  return (
    <div className={styles.readyPage}>
      <div className={styles.readyMain}>
        <section className={styles.readyChecklist} aria-labelledby="get-ready-title">
          <h2 id="get-ready-title" className={styles.readyCardTitle}>
            {model.title}
          </h2>
          {model.lede ? <p className={styles.readyLede}>{model.lede}</p> : null}
          <ol className={styles.readySteps}>
            {model.steps.map((step) => (
              <Step key={step.key} step={step} where={where} />
            ))}
          </ol>
        </section>

        {notSaid ? (
          <section className={styles.readyCard} aria-labelledby="not-said-title">
            <h2 id="not-said-title" className={styles.readyCardTitle}>
              {NOT_SAID_FREE_TITLE}
            </h2>
            <p className={styles.readyCardText}>{notSaid.text}</p>
            {notSaid.remind ? (
              <RemindFree
                roundId={roundId}
                programmeId={programmeId}
                label={notSaid.remind.label}
                count={notSaid.remind.count}
                countLine={notSaid.remind.countLine}
                confirm={notSaid.remind.confirm}
              />
            ) : null}
            {notSaid.reminded ? <p className={styles.readyRemindedLine}>{notSaid.reminded}</p> : null}
          </section>
        ) : null}
      </div>

      <div className={styles.readySide}>
        <section className={styles.readyCard} aria-labelledby="places-title">
          <h2 id="places-title" className={styles.readyCardTitle}>
            {PLACES_TITLE}
          </h2>
          <p className={styles.readyHeld}>
            <span className={styles.readyBigNumber}>{places.held}</span>
            <span className={styles.readyHeldWords}>{places.heldWords}</span>
          </p>
          {places.percent !== null ? (
            <div
              className={styles.readyBar}
              role="progressbar"
              aria-label={`${places.held} ${places.heldWords}`}
              aria-valuenow={places.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span className={styles.readyBarFill} style={{ width: `${places.percent}%` }} />
            </div>
          ) : null}
          <ul className={styles.readyTallies}>
            <li className={styles.readyTally}>
              <span className={`${styles.readyTallyDot} ${styles.readyTallyDotOk}`} aria-hidden="true" />
              <span className={styles.readyTallyLabel}>{PLACES_ROWS.coming}</span>
              <span className={styles.readyTallyNumber}>{places.coming}</span>
            </li>
            <li className={styles.readyTally}>
              <span className={`${styles.readyTallyDot} ${styles.readyTallyDotRing}`} aria-hidden="true" />
              <span className={styles.readyTallyLabel}>{PLACES_ROWS.havenNotSaid}</span>
              <span className={styles.readyTallyNumber}>{places.haventSaid}</span>
            </li>
            <li className={styles.readyTally}>
              <span className={`${styles.readyTallyDot} ${styles.readyTallyDotWarn}`} aria-hidden="true" />
              <span className={styles.readyTallyLabel}>{PLACES_ROWS.gaveBack}</span>
              <span className={styles.readyTallyNumber}>{places.gaveBack}</span>
            </li>
          </ul>
          {places.gaveBackRows.length > 0 ? (
            <ul className={styles.readyGaveBack}>
              {places.gaveBackRows.map((row) => (
                <li key={row.uid} className={styles.readyPerson}>
                  <InitialsChip name={row.name} uid={row.uid} size="sm" />
                  <span className={styles.readyPersonText}>
                    <strong className={styles.readyPersonName}>{row.name}</strong>
                    {row.line ? <span className={styles.readyPersonLine}>{row.line}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {places.freed ? (
            <div className={styles.readyFreed}>
              <h3 className={styles.readyFreedTitle}>{places.freed.title}</h3>
              <p className={styles.readyFreedText}>{places.freed.text}</p>
              <Link
                href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/applications/freed-places`}
                className={styles.readyTextLink}
              >
                <span>{SEE_FREED_PLACES}</span>
                <Arrow />
              </Link>
            </div>
          ) : null}
          {places.window ? <p className={styles.readyWindowLine}>{places.window}</p> : null}
        </section>

        <section className={styles.readyCard} aria-labelledby="facilitators-card-title">
          <h2 id="facilitators-card-title" className={styles.readyCardTitle}>
            {FACILITATORS_TITLE}
          </h2>
          {facilitators.rows.length > 0 ? (
            <ul className={styles.readyFacilitators}>
              {facilitators.rows.map((row) => (
                <li key={`${row.groupName}-${row.uid}`} className={styles.readyFacilitator}>
                  <InitialsChip name={row.name} uid={row.uid} size="md" />
                  <span className={styles.readyFacilitatorText}>
                    <span className={styles.readyFacilitatorName}>{row.name}</span>
                    <span className={styles.readyFacilitatorGroup}>{row.groupName}</span>
                  </span>
                  {row.chip ? (
                    <span className={`${styles.readyChip} ${row.chip.tone === "yes" ? styles.readyChipYes : styles.readyChipWaiting}`}>
                      <span className={styles.readyChipDot} aria-hidden="true" />
                      {row.chip.words}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.readyCardText}>{facilitators.empty}</p>
          )}
          {facilitators.training ? <p className={styles.readyTraining}>{facilitators.training}</p> : null}
        </section>
      </div>
    </div>
  );
}
