"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import Dropdown, { type DropdownOption } from "@/components/ui/Dropdown";
import { ChevronDownIcon } from "@/features/applications/editor/Icons";
import { DIDNT_OFFER, FACILITATING, OFFERED, STOP_FACILITATING, facilitatesLine, whereLine } from "@/features/applications/circles/circlesWords";
import chartStyles from "@/features/applications/times/WeekChart.module.css";
import { facilitatesWords } from "@/features/courses/allocationFit";
import type { AllocGroup, AllocRow } from "@/features/courses/useAllocation";
import type { PanelPerson, PanelWeek } from "@/lib/applications/handover/boardPanelView";
import { own } from "@/lib/applications/keys";
import type { FreeGroupLine, WeekChartView } from "@/lib/courses/personPage/model";
import {
  CHART_LABEL,
  CLAUDE_AND_PANGRAM,
  IN_THIS_GROUP,
  LITTLE_MARKED,
  NOTHING_MARKED,
  NO_LONGER_ON_FILE,
  ONLY_ADMINS_SEE_THIS,
  OPEN_THEIR_APPLICATION,
  WHEN_FREE,
  onlyAdminsSeeWords,
} from "@/lib/courses/personPage/words";
import type { BoardPanelRead } from "./useBoardPanel";
import styles from "./BoardPersonPanel.module.css";
import SomeWeeks from "@/features/courses/timeAnswer/SomeWeeks";
import { WHY, WOULD_WORK } from "@/lib/courses/timeAnswer/words";
import { POOL, answerLinesOf } from "./peopleInGroupsBoard";
import * as words from "./peopleInGroupsWords";

/**
 * THE PERSON'S PANEL ON PEOPLE IN GROUPS, opened from any name on the board:
 * who they are and where they stand, the way to their page and their
 * application, their week with each group's session drawn on it and how
 * much of each falls in their time, whether they offered to facilitate,
 * Claude's and Pangram's reads for an admin, and moving them.
 *
 * WHAT IS SHOWN OF THE WEEK is the server's answer for this reader
 * (`useBoardPanel`): a person the reader may not read the application of is
 * one sentence ("Only admins see when Sofia is free.") and nothing else.
 * Nothing here works anything out from a week; the chart arrives as shares
 * of a column and words.
 *
 * EVERY CONTROL IS THE BOARD'S OWN. A bar, a "Move here" and "Move to…" are
 * the card's move (`onMove`: the allocate route, every refusal it has, the
 * mid-term question once the groups have gone out); "Take off the run…"
 * opens the take-off sheet; "Stop facilitating" is the facilitators route,
 * asked first. The panel emails nobody of its own.
 *
 * ON RINGS (`rings`) the panel is the same, and its Placing line is Circles'
 * own: where they are, and that a group on the chart or a ring moves them.
 */

export type PanelSubject =
  /** On the run's list: placed, to place, or facilitating a group they sit in (`facilitates`). */
  | { kind: "row"; row: AllocRow; columnId: string; facilitates: AllocGroup[] }
  /** Facilitating one of the run's groups, with no place on the run. */
  | { kind: "facilitator"; uid: string; facilitates: AllocGroup[] }
  /** Invited and not answered yet: their card's line. */
  | { kind: "invited"; uid: string; line: string }
  /** Gave their place back or left: the line under the board. */
  | { kind: "gave-back"; uid: string; line: string | null };

type Props = {
  subject: PanelSubject;
  name: string;
  /** The name a sentence calls them by, where the server has none. */
  firstName: string;
  /** The degree line, for somebody on the run's list. */
  detail: string;
  coming: boolean;
  /** The column a group id names, by name. */
  columnName: (columnId: string) => string;
  read: BoardPanelRead;
  /** "Move to…": the card's own menu, without "Take off the run…". */
  options: DropdownOption[];
  busy: boolean;
  onMove: (columnId: string) => void;
  onTakeOff: () => void;
  onStopFacilitating: (group: AllocGroup) => void;
  onClose: () => void;
  /** People in groups is shown as Rings, so a ring, not a column, is where a person is moved. */
  rings?: boolean;
  /** The run, for "They meant some weeks" under a can't, as on the card. */
  runId?: string;
  /** "They meant some weeks" saved: the board is read again. */
  onAnswerChanged?: (message: string) => void;
};

const pct = (value: number) => `${value}%`;

/**
 * Whether a key pressed inside the panel closes it: Escape, unless something
 * inside has already taken it (the "Move to…" menu closes itself on Escape and
 * marks the key handled, and the panel stays open).
 */
export function escapeClosesPanel(event: { key: string; defaultPrevented: boolean }): boolean {
  return event.key === "Escape" && !event.defaultPrevented;
}

/** What the panel draws of when somebody is free: the server's answer, or the card's own "no longer on file". */
type DrawnWeek = PanelWeek | { kind: "not-on-file" };

/** The chart the server worked out, with each bar a move where somebody can be moved. */
function Chart({ chart, current, name, onPick, disabled }: { chart: WeekChartView; current: string | null; name: string; onPick: ((key: string) => void) | null; disabled: boolean }) {
  return (
    <div className={chartStyles.chart} role={onPick ? "group" : "img"} aria-label={CHART_LABEL}>
      <div className={chartStyles.axis} aria-hidden="true">
        {chart.hours.map((hour) => (
          <span key={hour.label} className={chartStyles.hour} style={{ top: pct(hour.top) }}>
            {hour.label}
          </span>
        ))}
      </div>
      {chart.days.map((day) => (
        <div key={day.name} className={chartStyles.day}>
          <span className={chartStyles.dayName}>{day.name}</span>
          <div className={chartStyles.column}>
            {day.readAs ? <span className={chartStyles.readAs} style={{ top: pct(day.readAs.top), height: pct(day.readAs.height) }} /> : null}
            {day.free.map((block) => (
              <span key={`${block.top}`} className={chartStyles.free} style={{ top: pct(block.top), height: pct(block.height) }} />
            ))}
            {day.bars.map((bar) => {
              const here = bar.key === current;
              const className = [chartStyles.bar, bar.fits ? chartStyles.barFits : chartStyles.barNot, here ? chartStyles.barCurrent : ""].filter(Boolean).join(" ");
              const style = { top: pct(bar.top), height: pct(bar.height), left: pct(bar.left), width: pct(bar.width) };
              if (!onPick) {
                return (
                  <span key={bar.key} className={className} style={style} title={bar.title}>
                    {bar.letter}
                  </span>
                );
              }
              return (
                <button
                  key={bar.key}
                  type="button"
                  className={className}
                  style={style}
                  title={bar.title}
                  aria-label={words.barLabel(name, bar.title)}
                  disabled={disabled || here}
                  onClick={() => onPick(bar.key)}
                >
                  {bar.letter}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The groups under the chart: the one they are in first, then as the server ordered them. */
function GroupLines({ lines, current, onPick, disabled }: { lines: readonly FreeGroupLine[]; current: string | null; onPick: ((key: string) => void) | null; disabled: boolean }) {
  const ordered = [...lines.filter((line) => line.key === current), ...lines.filter((line) => line.key !== current)];
  if (ordered.length === 0) return null;
  return (
    <ul className={styles.lines}>
      {ordered.map((line) => (
        <li key={line.key} className={styles.lineItem}>
          <span className={styles.stack}>
            <span className={styles.lineName}>
              <span className={`${styles.dot} ${line.fits ? styles.dotFits : styles.dotNot}`} aria-hidden="true" />
              {line.name}
            </span>
            <span className={styles.muted}>{line.said}</span>
          </span>
          {line.key === current ? (
            <span className={styles.chip}>{IN_THIS_GROUP}</span>
          ) : onPick ? (
            <button type="button" className={styles.button} disabled={disabled} onClick={() => onPick(line.key)}>
              {line.fits ? words.MOVE_HERE : words.MOVE_HERE_CANT}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function BoardPersonPanel({
  subject,
  name,
  firstName,
  detail,
  coming,
  columnName,
  read,
  options,
  busy,
  onMove,
  onTakeOff,
  onStopFacilitating,
  onClose,
  rings = false,
  runId,
  onAnswerChanged,
}: Props) {
  const uid = subject.kind === "row" ? subject.row.uid : subject.uid;
  const person: PanelPerson | null = (read.panel ? own(read.panel.people, uid) : undefined) ?? null;
  const first = person?.firstName || firstName;
  const heading = useRef<HTMLHeadingElement>(null);
  // A new person's panel takes the focus, so a keyboard is where it reads.
  useEffect(() => {
    heading.current?.focus();
  }, [uid]);

  const row = subject.kind === "row" ? subject.row : null;
  const pinned = subject.kind === "row" && subject.facilitates.length > 0;
  // Somebody on the run's list who sits in no group they facilitate can be moved from here.
  const movable = row !== null && !pinned;
  const current = subject.kind === "row" && subject.columnId !== POOL ? subject.columnId : null;
  const pick = movable ? (key: string) => onMove(key) : null;
  // Their answer about the group they sit in, as the card has it.
  const answer = row && current ? answerLinesOf(row, columnName(current)) : null;
  // From the application form, and its application gone: the card says so too.
  const goneFromForm = row?.fromForm?.availability === "not-on-file";
  const week: DrawnWeek | null =
    read.panel && person && person.week !== undefined ? person.week : read.panel && goneFromForm ? { kind: "not-on-file" } : null;
  // Who sees the week, truly: an admin is told when the programme's lead may not read this person's.
  const foot = person?.leadSees === false ? words.ADMINS_ONLY_FOOT : (read.panel?.foot ?? "");

  const chips: { words: string; tone: "plain" | "warn" | "ok" | "group" }[] = [];
  if (subject.kind === "row") {
    if (pinned) chips.push({ words: facilitatesWords(subject.facilitates.map((group) => group.name).join(" and ")), tone: "group" });
    else if (subject.columnId === POOL) chips.push({ words: words.TO_PLACE, tone: "warn" });
    else chips.push({ words: columnName(subject.columnId), tone: "group" });
    if (coming && !pinned) chips.push({ words: words.COMING, tone: "ok" });
  } else if (subject.kind === "facilitator") {
    chips.push({ words: facilitatesWords(subject.facilitates.map((group) => group.name).join(" and ")), tone: "group" });
  } else if (subject.kind === "invited") {
    chips.push({ words: words.INVITED, tone: "plain" });
  } else {
    chips.push({ words: words.GAVE_PLACE_BACK, tone: "plain" });
  }

  const subtitle =
    subject.kind === "row"
      ? detail
      : subject.kind === "facilitator"
        ? words.FACILITATING_NO_PLACE
        : subject.kind === "invited"
          ? subject.line
          : (person?.gaveBack?.line ?? subject.line ?? "");

  /** When they're free, as the server answered this reader. */
  const whenFree = () => {
    if (read.failed) {
      return (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{WHEN_FREE}</h3>
          <p className={styles.text}>{words.panelFailedWords(read.failedStatus)}</p>
          <button type="button" className={styles.button} onClick={read.retry}>
            {words.RETRY}
          </button>
        </section>
      );
    }
    if (!read.panel) {
      return (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{WHEN_FREE}</h3>
          <p className={styles.muted}>{words.PANEL_LOADING}</p>
        </section>
      );
    }
    if (!week) return null;
    if (week.kind === "may-not") {
      return (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{WHEN_FREE}</h3>
          <p className={styles.text}>{onlyAdminsSeeWords(first)}</p>
        </section>
      );
    }
    if (week.kind === "not-on-file") {
      return (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{WHEN_FREE}</h3>
          <p className={styles.text}>{NO_LONGER_ON_FILE}</p>
        </section>
      );
    }
    if (week.kind === "none-given") {
      return (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{WHEN_FREE}</h3>
          <Chart chart={week.chart} current={current} name={name} onPick={null} disabled={busy} />
          <p className={styles.text}>{NOTHING_MARKED}</p>
        </section>
      );
    }
    return (
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{WHEN_FREE}</h3>
        <Chart chart={week.chart} current={current} name={name} onPick={pick} disabled={busy} />
        {week.littleMarked ? <p className={styles.warn}>{LITTLE_MARKED}</p> : movable ? <p className={styles.muted}>{words.CHART_KEY}</p> : null}
        <GroupLines lines={week.groups} current={current} onPick={pick} disabled={busy} />
        {foot ? <p className={styles.muted}>{foot}</p> : null}
      </section>
    );
  };

  return (
    <aside
      className={styles.panel}
      aria-labelledby={`panel-${uid}`}
      onKeyDown={(event) => {
        if (escapeClosesPanel(event)) onClose();
      }}
    >
      <div className={styles.head}>
        <div className={styles.headText}>
          <h2 id={`panel-${uid}`} ref={heading} tabIndex={-1} className={styles.name}>
            {name}
          </h2>
          {subtitle ? <p className={styles.muted}>{subtitle}</p> : null}
          <span className={styles.chips}>
            {chips.map((chip) => (
              <span
                key={chip.words}
                className={`${styles.chip} ${chip.tone === "warn" ? styles.chipWarn : chip.tone === "ok" ? styles.chipOk : chip.tone === "group" ? styles.chipGroup : ""}`}
              >
                {chip.words}
              </span>
            ))}
          </span>
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label={words.CLOSE_PANEL} title={words.CLOSE_PANEL}>
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div className={styles.body}>
        {person?.personHref || person?.applicationHref ? (
          <div className={styles.links}>
            {person.personHref ? (
              <Link href={person.personHref} className={styles.button}>
                {words.openPageWords(first)}
              </Link>
            ) : null}
            {person.applicationHref ? (
              <Link href={person.applicationHref} className={styles.button}>
                {OPEN_THEIR_APPLICATION}
              </Link>
            ) : null}
          </div>
        ) : null}

        {subject.kind === "invited" ? <p className={styles.text}>{words.notAcceptedWords(first)}</p> : null}
        {subject.kind === "gave-back" && person?.gaveBack?.reason ? (
          <p className={styles.text}>{words.theirReasonWords(person.gaveBack.reason)}</p>
        ) : null}

        {pinned && subject.kind === "row" ? (
          <section className={styles.section}>
            <p className={styles.text}>{facilitatesLine(subject.facilitates.map((group) => group.name).join(" and "))}</p>
            <div className={styles.links}>
              {subject.facilitates.map((group) => (
                <button key={group.id} type="button" className={styles.button} disabled={busy} onClick={() => onStopFacilitating(group)}>
                  {STOP_FACILITATING(group.name)}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {(movable || subject.kind === "facilitator") && whenFree()}

        {/* Their answer about the group they sit in, from the row the board was sent: the card's own, for the same readers. */}
        {answer ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{answer.title}</h3>
            <p className={styles.text}>{answer.said}</p>
            {answer.why ? (
              <p className={styles.text}>
                <strong>{WHY}</strong> {answer.why}
              </p>
            ) : null}
            {answer.wouldWork ? (
              <p className={styles.text}>
                <strong>{WOULD_WORK}</strong> {answer.wouldWork}
              </p>
            ) : null}
            {answer.cant && runId && row && onAnswerChanged ? (
              <SomeWeeks runId={runId} uid={row.uid} disabled={busy} onSaved={onAnswerChanged} />
            ) : null}
          </section>
        ) : null}

        {/* Only under a chart they can be moved from: nothing marked, a week this reader may not see, or none read yet, has no group to pick on it. */}
        {movable && subject.kind === "row" && rings && week?.kind === "given" ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{words.PLACING}</h3>
            <p className={styles.text}>{whereLine(current ? columnName(current) : null)}</p>
          </section>
        ) : movable && subject.kind === "row" && subject.columnId === POOL && week?.kind === "given" ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{words.PLACING}</h3>
            <p className={styles.text}>{words.NOT_IN_A_GROUP_PICK}</p>
          </section>
        ) : null}

        {movable && person?.offered !== undefined ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{FACILITATING}</h3>
            <p className={styles.text}>{person.offered ? OFFERED : DIDNT_OFFER}</p>
          </section>
        ) : null}

        {movable && person?.claude ? (
          <section className={styles.admins}>
            <div className={styles.adminsHead}>
              <h3 className={styles.sectionTitle}>{CLAUDE_AND_PANGRAM}</h3>
              <span className={styles.chip}>{ONLY_ADMINS_SEE_THIS}</span>
            </div>
            {person.claude.lines.map((line) => (
              <p key={line} className={styles.text}>
                {line}
              </p>
            ))}
            <p className={person.claude.flagged ? styles.warn : styles.text}>{person.claude.pangram}</p>
          </section>
        ) : null}
      </div>

      {movable && row ? (
        <div className={styles.foot}>
          <Dropdown
            value={subject.kind === "row" ? subject.columnId : POOL}
            onChange={(value) => onMove(value)}
            options={options}
            disabled={busy}
            sheetBreakpoint="md"
            ariaLabel={words.moveLabel(name)}
            title={words.MOVE_TITLE}
            className={styles.moveTrigger}
            triggerIcon={
              <span className={styles.moveTriggerText}>
                {words.MOVE_TITLE} <ChevronDownIcon size={16} />
              </span>
            }
          />
          {row.enrolmentStatus === "active" ? (
            <button type="button" className={styles.danger} disabled={busy} onClick={onTakeOff}>
              {words.TAKE_OFF}
            </button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
