"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { useHydrated } from "@/hooks/useHydrated";
import { CAMPUS_LABEL } from "@/lib/courses/campusWords";
import {
  filterHistory,
  historyWhenWords,
  oneWeekChoicesOf,
  weekRegisterFacts,
  type GroupPageView,
  type GroupPageWeek,
} from "@/lib/courses/groupPage/model";
import * as W from "@/lib/courses/groupPage/words";
import * as S from "@/lib/courses/excused/staffWords";
import { coverChoicesOf, noticeWeekOf } from "@/lib/courses/registerCover/pageModel";
import * as C from "@/lib/courses/registerCover/pageWords";
import { UNKNOWN_OUTCOME } from "@/lib/courses/sessionChange/words";
import { ATTENDANCE_TAB } from "@/lib/courses/registerCorrection/pageWords";
import type { GroupAttendanceView } from "@/lib/courses/groupAttendance/load";
import AttendanceTab from "./AttendanceTab";
import ChangePanel, { type ChangeStart } from "./ChangePanel";
import GivePanel from "./GivePanel";
import LinkPanel from "./LinkPanel";
import RemindPanel from "./RemindPanel";
import RoomPanel from "./RoomPanel";
import WeekWorkCard from "./WeekWorkCard";
import styles from "./GroupPage.module.css";

/**
 * ONE GROUP'S PAGE, for admins and the programme's lead: the head (the way
 * back, the group's name, where the term is, Take the register, Write to the
 * group, its facilitators and how many people), how the group meets with a
 * Change beside each part, and its tabs: Week by week, Attendance, all
 * weeks (for admins and the programme's lead, when the page hands it the
 * group's attendance) and History.
 *
 * WEEK BY WEEK: every week of the group's plan, past ones too, each with its
 * date and state; the chosen week's card with what each person has said
 * about that session; Change this week, Set the link, Put it back as usual
 * once the week has a change of its own, and, for a week whose time passed
 * with no register, the line that offers to put it right. An incubator's
 * weeks are rows, each with its own Change.
 *
 * THE CHOSEN WEEK'S WORK (`WeekWorkCard`): who has done it, each piece, who
 * was late, when each person was last reminded and Remind, read on the
 * server for the week the address names (`?week=2`). Choosing a week puts it
 * in the address, so the server reads that week's work; until it arrives the
 * card says it is on its way.
 *
 * Everything drawn is the server's (`loadGroupPage`); the state here is the
 * tab, the week shown, the history's filter and which panel is open. A
 * change that went through reads the page again, so every part shows what is
 * now true, and a line says what it did.
 */

export type GroupPageLinks = {
  programme: string;
  groups: string;
  /**
   * The group's register under this page, for an admin and the programme's
   * lead, who take it in a facilitator's place or help one; a session's
   * register is this with `?session=w02`.
   */
  register: string | null;
  /** Today's way of writing to the group, where there is one for this viewer. */
  write: string | null;
  facilitators: string;
  times: string;
  people: string;
  /** The programme's room route for this group. */
  roomPath: string;
  /** The Requests page, where a line's waiting ask is decided; null where the reader has no way there. */
  requests?: string | null;
  /** The programme's reading view of one person's week, before the person (".../coursework"); left out, names are plain text. */
  coursework?: string | null;
};

type Panel =
  | { kind: "change"; start: ChangeStart; didNotHappen?: boolean }
  | { kind: "link"; week: { weekNumber: number; sessionKey: string } | null }
  | { kind: "room" }
  | { kind: "give"; weekNumber: number }
  | { kind: "remind"; weekNumber: number; only: { uid: string; firstName: string } | null };

function chipsOf(week: GroupPageWeek): string[] {
  return [week.hasLink ? W.LINK_FOR_WEEK : W.NO_LINK_YET, W.joiningOnlineChip(week.joiningOnline), W.cantMakeItChip(week.cantMakeIt)];
}

export default function GroupPage({
  view,
  links,
  take = null,
  attendance = null,
}: {
  view: GroupPageView;
  links: GroupPageLinks;
  /**
   * The group's attendance across every week (`loadGroupAttendance`), for
   * admins and the programme's lead: its tab is drawn only with it. Never
   * handed to a facilitator of the group, who has their own register pages.
   */
  attendance?: GroupAttendanceView | null;
  /** A week to open on with its ways to take the register shown ("Take the register" on Overview's Needs attention). */
  take?: number | null;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [choosing, startChoosing] = useTransition();
  const takeWeek = take !== null && view.weeks.some((each) => each.weekNumber === take) ? take : null;
  const [tab, setTab] = useState<"weeks" | "attendance" | "history">("weeks");
  const [shown, setShown] = useState<number | null>(takeWeek ?? view.workWeek ?? view.openWeek);
  const [filter, setFilter] = useState<W.HistoryFilter>("everything");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [opened, setOpened] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  // The ways to take one week's register, as a sheet: open on arrival from Overview.
  const [sheet, setSheet] = useState<number | null>(takeWeek);
  const [covering, setCovering] = useState(false);
  const [coverProblem, setCoverProblem] = useState<string | null>(null);

  const registerOf = (each: GroupPageWeek) =>
    links.register ? `${links.register}?session=${encodeURIComponent(each.sessionKey)}` : null;

  /**
   * "I'm covering it": the cover is taken first (`POST .../attendance/cover`,
   * no person), so the register says who took it before a line is set, and
   * the reminders to the facilitators stop; then the register opens.
   */
  async function coverIt(each: GroupPageWeek) {
    const href = registerOf(each);
    if (!href) return;
    setCovering(true);
    setCoverProblem(null);
    try {
      const response = await fetch(`/api/courses/groups/${encodeURIComponent(view.groupId)}/attendance/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekNumber: each.weekNumber }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || body?.ok !== true) {
        setCoverProblem(body?.error ?? UNKNOWN_OUTCOME);
        setCovering(false);
        return;
      }
      router.push(href);
    } catch {
      setCoverProblem(UNKNOWN_OUTCOME);
      setCovering(false);
    }
  }

  const open = (next: Panel) => {
    setSaid(null);
    setOpened((n) => n + 1);
    setPanel(next);
  };
  const week = view.weeks.find((each) => each.weekNumber === shown) ?? null;
  const noticeNumber = noticeWeekOf(view.weeks.map(weekRegisterFacts));
  const noticeWeek = view.weeks.find((each) => each.weekNumber === noticeNumber) ?? null;
  const sheetWeek = view.weeks.find((each) => each.weekNumber === sheet) ?? null;
  const firstNames = view.facilitatorFirstNames;
  const campus = view.meets.campus ? CAMPUS_LABEL[view.meets.campus] : "";
  const timeSet = Boolean(view.meets.hhmm);
  const history = view.history;
  const rows = history ? filterHistory(history.rows, filter) : [];

  const weekCard = (each: GroupPageWeek) => {
    const choices = oneWeekChoicesOf(each, view.weeks);
    const linkable = !each.ended && !each.cancelled;
    return (
      <section className={styles.card} aria-label={W.weekWords(each.weekNumber)}>
        <div className={styles.weekHead}>
          <div>
            <p className={styles.eyebrow}>{W.weekEyebrow(each.weekNumber, each.title, each.change)}</p>
            <h3 className={styles.weekWhen}>{W.weekWhenWords(each.dateKey, each.hhmm, each.minutes)}</h3>
            <p className={styles.weekWhere}>
              {W.weekWhereWords({ room: each.room, campusLabel: each.campus ? CAMPUS_LABEL[each.campus] : "", online: each.online }, view.facilitatorFirstNames)}
            </p>
            {each.change === "moved" && (
              <p className={styles.weekWhere}>{W.usuallyWords(view.meets.weekday, view.meets.hhmm, view.meets.room)}</p>
            )}
          </div>
          <div className={styles.weekActions}>
            {takeButton(each)}
            {!choices.met && !choices.putRight && (
              <button
                type="button"
                className={styles.button}
                disabled={!hydrated}
                onClick={() => open({ kind: "change", start: { choice: "one", weekNumber: each.weekNumber } })}
              >
                {W.CHANGE_THIS_WEEK}
              </button>
            )}
            {linkable && (
              <button
                type="button"
                className={styles.button}
                disabled={!hydrated}
                onClick={() => open({ kind: "link", week: { weekNumber: each.weekNumber, sessionKey: each.sessionKey } })}
              >
                {W.SET_THE_LINK}
              </button>
            )}
            {choices.restore && (
              <button
                type="button"
                className={styles.button}
                disabled={!hydrated}
                onClick={() => open({ kind: "change", start: { choice: "one", weekNumber: each.weekNumber } })}
              >
                {W.PUT_IT_BACK}
              </button>
            )}
          </div>
        </div>
        <ul className={styles.chips} aria-label="This session">
          {chipsOf(each).map((chip) => (
            <li key={chip} className={styles.chip}>
              {chip}
            </li>
          ))}
        </ul>
        {choices.met && <p className={styles.weekNote}>{W.MET_LINE}</p>}
        {each.cancelled && !choices.met && <p className={styles.weekNote}>{W.CANCELLED_LINE}</p>}
      </section>
    );
  };

  /**
   * "Take the register" for one week: the ways to take it in a facilitator's
   * place, as a sheet, for any week whose register is not finished, past
   * weeks included; once a facilitator has started it, the register itself,
   * to help.
   */
  function takeButton(each: GroupPageWeek) {
    const ways = coverChoicesOf(weekRegisterFacts(each));
    const href = registerOf(each);
    if (ways.helpOnly && href) {
      return (
        <Link href={href} className={styles.button}>
          {C.TAKE_THE_REGISTER}
        </Link>
      );
    }
    if (!ways.offered || !href) return null;
    return (
      <button
        type="button"
        className={styles.button}
        disabled={!hydrated}
        aria-label={`${C.TAKE_THE_REGISTER}: ${W.weekWords(each.weekNumber)}`}
        onClick={() => {
          setCoverProblem(null);
          setSheet(each.weekNumber);
        }}
      >
        {C.TAKE_THE_REGISTER}
      </button>
    );
  }

  /** The notice for the latest session that has started with nobody taking its register. */
  const notice = (each: GroupPageWeek) => {
    const ways = coverChoicesOf(weekRegisterFacts(each));
    return (
      <section className={styles.coverNotice} aria-labelledby="group-cover-notice" data-testid="cover-notice">
        <p className={styles.coverChips}>
          <span className={styles.coverChip}>{each.startedAgo}</span>
          <span className={styles.coverQuiet}>{C.NO_REGISTER_YET}</span>
        </p>
        <h2 id="group-cover-notice" className={styles.cardTitle}>
          {C.notStartedTitle(firstNames, each.weekNumber)}
        </h2>
        <p className={styles.cardLine}>
          {C.notStartedLine({
            groupName: view.groupName,
            dateKey: each.dateKey,
            hhmm: each.hhmm,
            room: each.online ? "" : each.room,
            ended: each.ended,
            firstNames,
          })}
        </p>
        {/* At a computer the three ways sit here; on a phone, one button opens them as a sheet. */}
        <div className={`${styles.coverActions} ${styles.coverWide}`}>
          {ways.covering && (
            <button type="button" className={styles.buttonPrimary} disabled={!hydrated || covering} onClick={() => void coverIt(each)}>
              {C.takeInPlaceWords(firstNames)}
            </button>
          )}
          {ways.someoneElse && (
            <button type="button" className={styles.button} disabled={!hydrated} onClick={() => open({ kind: "give", weekNumber: each.weekNumber })}>
              {C.SOMEONE_ELSE_IS_COVERING}
            </button>
          )}
          {ways.didNotHappen && (
            <button
              type="button"
              className={styles.button}
              disabled={!hydrated}
              onClick={() => open({ kind: "change", start: { choice: "one", weekNumber: each.weekNumber }, didNotHappen: true })}
            >
              {C.IT_DIDNT_HAPPEN}
            </button>
          )}
        </div>
        <div className={`${styles.coverActions} ${styles.coverNarrow}`}>
          <button type="button" className={styles.buttonPrimary} disabled={!hydrated} onClick={() => setSheet(each.weekNumber)}>
            {C.TAKE_THE_REGISTER}
          </button>
        </div>
        {coverProblem && sheet === null && (
          <p className={styles.problem} role="status">
            {coverProblem}
          </p>
        )}
        <p className={styles.coverFoot}>{C.whicheverWords(firstNames)}</p>
      </section>
    );
  };

  const putRightLine = (each: GroupPageWeek) =>
    oneWeekChoicesOf(each, view.weeks).putRight ? (
      <div className={styles.putRight}>
        <p>{W.noRegisterLine(each.weekNumber, each.dateKey, each.hhmm)}</p>
        <button
          type="button"
          className={styles.button}
          disabled={!hydrated}
          onClick={() => open({ kind: "change", start: { choice: "one", weekNumber: each.weekNumber } })}
        >
          {W.PUT_IT_RIGHT}
        </button>
      </div>
    ) : null;

  return (
    <div className={styles.page}>
      <nav className={styles.crumb} aria-label="Breadcrumb">
        <Link href={links.programme}>{view.programmeName}</Link>
        <span aria-hidden="true"> / </span>
        <Link href={links.groups}>{W.GROUPS}</Link>
      </nav>

      <header className={styles.head}>
        <div className={styles.headMain}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{view.groupName}</h1>
            {view.chip && <span className={styles.termChip}>{view.chip}</span>}
          </div>
          <p className={styles.facts}>
            {view.facilitatorNames.length > 0 ? (
              <span>
                {W.facilitatorsLabel(view.facilitatorNames.length)} <strong>{view.facilitatorNames.join(", ")}</strong>
              </span>
            ) : (
              <span>{`${W.FACILITATORS}: ${W.NOBODY_YET}`}</span>
            )}
            <span>{W.groupPeopleWords(view.peopleCount)}</span>
          </p>
        </div>
        <div className={styles.headActions}>
          {links.register && (
            <Link href={links.register} className={styles.button}>
              {W.TAKE_THE_REGISTER}
            </Link>
          )}
          {links.write && (
            <Link href={links.write} className={styles.button}>
              {W.writeToWords(view.groupName)}
            </Link>
          )}
        </div>
      </header>

      {said && (
        <p className={styles.said} role="status">
          {said}
        </p>
      )}

      {noticeWeek && links.register && notice(noticeWeek)}

      <section className={styles.card} aria-labelledby="group-meets">
        <div className={styles.meetsHead}>
          <h2 id="group-meets" className={styles.cardTitle}>
            {W.howMeetsTitle(view.groupName)}
          </h2>
          <p className={styles.meetsWho}>{W.WHO_CHANGES_WHAT}</p>
        </div>
        <dl className={styles.meets}>
          <div className={styles.meetsItem}>
            <dt className={styles.meetsLabel}>{W.DAY_AND_TIME}</dt>
            <dd className={styles.meetsValue}>
              {timeSet ? W.dayAndTimeWords(view.meets.weekday, view.meets.hhmm, view.meets.minutes) : W.NOT_SET_YET}
            </dd>
            <dd className={styles.meetsAction}>
              {timeSet && view.weeks.length > 0 ? (
                <button
                  type="button"
                  className={styles.button}
                  disabled={!hydrated}
                  aria-label={`${W.CHANGE}: ${W.DAY_AND_TIME}`}
                  onClick={() => open({ kind: "change", start: { choice: "regular", weekNumber: null } })}
                >
                  {W.CHANGE}
                </button>
              ) : (
                <Link href={links.times} className={styles.button}>
                  {W.SET_THE_TIME}
                </Link>
              )}
            </dd>
          </div>
          {timeSet && (
            <div className={styles.meetsItem}>
              <dt className={styles.meetsLabel}>{W.LENGTH}</dt>
              <dd className={styles.meetsValue}>{W.lengthLine(view.meets.minutes) || W.NOT_SET_YET}</dd>
              {view.weeks.length > 0 && (
                <dd className={styles.meetsAction}>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={!hydrated}
                    aria-label={`${W.CHANGE}: ${W.LENGTH}`}
                    onClick={() => open({ kind: "change", start: { choice: "regular", weekNumber: null } })}
                  >
                    {W.CHANGE}
                  </button>
                </dd>
              )}
            </div>
          )}
          <div className={styles.meetsItem}>
            <dt className={styles.meetsLabel}>{W.ROOM}</dt>
            <dd className={styles.meetsValue}>{view.meets.room ? W.roomLine(view.meets.room, campus) : W.NOT_SET_YET}</dd>
            <dd className={styles.meetsAction}>
              <button
                type="button"
                className={styles.button}
                disabled={!hydrated}
                aria-label={view.meets.room ? `${W.CHANGE}: ${W.ROOM}` : undefined}
                onClick={() => open({ kind: "room" })}
              >
                {view.meets.room ? W.CHANGE : W.SET_THE_ROOM}
              </button>
            </dd>
          </div>
          <div className={styles.meetsItem}>
            <dt className={styles.meetsLabel}>{W.MEETING_LINK}</dt>
            <dd className={styles.meetsValue}>{view.meets.hasLink ? W.LINK_SET : W.NONE_SET}</dd>
            {view.linkSessionKey && (
              <dd className={styles.meetsAction}>
                <button
                  type="button"
                  className={styles.button}
                  disabled={!hydrated}
                  onClick={() => open({ kind: "link", week: null })}
                >
                  {W.SET_THE_LINK}
                </button>
              </dd>
            )}
          </div>
          <div className={styles.meetsItem}>
            <dt className={styles.meetsLabel}>{W.FACILITATORS}</dt>
            <dd className={styles.meetsValue}>{view.facilitatorNames.length > 0 ? view.facilitatorNames.join(", ") : W.NOBODY_YET}</dd>
            <dd className={styles.meetsAction}>
              <Link
                href={links.facilitators}
                className={styles.button}
                aria-label={view.facilitatorNames.length > 0 ? `${W.CHANGE}: ${W.FACILITATORS}` : undefined}
              >
                {view.facilitatorNames.length > 0 ? W.CHANGE : W.ADD_A_FACILITATOR}
              </Link>
            </dd>
          </div>
        </dl>
      </section>

      <div className={styles.tabs} role="tablist" aria-label={view.groupName}>
        <button
          type="button"
          role="tab"
          id="group-tab-weeks"
          aria-selected={tab === "weeks"}
          aria-controls="group-panel-weeks"
          className={tab === "weeks" ? `${styles.tab} ${styles.tabOn}` : styles.tab}
          onClick={() => setTab("weeks")}
        >
          {W.WEEK_BY_WEEK}
        </button>
        {attendance && (
          <button
            type="button"
            role="tab"
            id="group-tab-attendance"
            aria-selected={tab === "attendance"}
            aria-controls="group-panel-attendance"
            className={tab === "attendance" ? `${styles.tab} ${styles.tabOn}` : styles.tab}
            onClick={() => setTab("attendance")}
          >
            {ATTENDANCE_TAB}
          </button>
        )}
        <button
          type="button"
          role="tab"
          id="group-tab-history"
          aria-selected={tab === "history"}
          aria-controls="group-panel-history"
          className={tab === "history" ? `${styles.tab} ${styles.tabOn}` : styles.tab}
          onClick={() => setTab("history")}
        >
          {W.HISTORY}
        </button>
      </div>

      {tab === "attendance" && attendance ? (
        <div id="group-panel-attendance" role="tabpanel" aria-labelledby="group-tab-attendance" className={styles.tabPanel}>
          <AttendanceTab view={attendance} runId={view.runId} requestsBase={links.requests ?? null} />
        </div>
      ) : tab === "weeks" ? (
        <div id="group-panel-weeks" role="tabpanel" aria-labelledby="group-tab-weeks" className={styles.tabPanel}>
          {view.weeks.length === 0 ? (
            <p className={styles.card}>{W.NO_WEEKS_YET}</p>
          ) : view.incubator ? (
            <section className={styles.card} aria-label={W.WEEK_BY_WEEK}>
              <ul className={styles.rows}>
                {view.weeks.map((each) => {
                  const choices = oneWeekChoicesOf(each, view.weeks);
                  return (
                    <li key={each.weekNumber} className={styles.row}>
                      <span className={styles.rowWeek}>{each.weekNumber}</span>
                      <span className={styles.rowWhen}>
                        {W.weekWhenWords(each.dateKey, each.hhmm, each.minutes)}
                        <span className={styles.rowState}>{W.WEEK_STATE_WORDS[each.state]}</span>
                      </span>
                      <span className={styles.rowRoom}>
                        {each.online ? "Online" : W.roomLine(each.room, each.campus ? CAMPUS_LABEL[each.campus] : "")}
                      </span>
                      <span className={styles.rowAction}>
                        {!choices.met && (
                          <button
                            type="button"
                            className={styles.button}
                            disabled={!hydrated}
                            onClick={() => open({ kind: "change", start: { choice: "one", weekNumber: each.weekNumber } })}
                          >
                            {choices.putRight ? W.putRightTitle(each.weekNumber) : W.changeWeekTitle(each.weekNumber)}
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
            <>
              <div className={styles.pills} role="group" aria-label="Weeks">
                {view.weeks.map((each) => (
                  <button
                    key={each.weekNumber}
                    type="button"
                    className={each.weekNumber === shown ? `${styles.pill} ${styles.pillOn}` : styles.pill}
                    aria-pressed={each.weekNumber === shown}
                    aria-label={`${W.weekWords(each.weekNumber)}, ${W.weekPillLine(each.dateKey, each.state)}`}
                    onClick={() => {
                      setShown(each.weekNumber);
                      // The week's work is read on the server: put the week in the address.
                      if (view.work?.weekNumber !== each.weekNumber) {
                        startChoosing(() => router.replace(`${window.location.pathname}?week=${each.weekNumber}`, { scroll: false }));
                      }
                    }}
                  >
                    <span className={styles.pillWeek}>{W.weekWords(each.weekNumber)}</span>
                    <span className={styles.pillLine}>{W.weekPillLine(each.dateKey, each.state)}</span>
                  </button>
                ))}
              </div>
              {week && putRightLine(week)}
              {week && weekCard(week)}
            </>
          )}

          {view.peopleCount === 0 ? (
            <section className={styles.card} aria-labelledby="group-nobody">
              <h2 id="group-nobody" className={styles.cardTitle}>
                {W.NOBODY_IN_GROUP_TITLE}
              </h2>
              <p className={styles.cardLine}>{W.NOBODY_IN_GROUP_LINE}</p>
              <Link href={links.people} className={styles.buttonPrimary}>
                {W.OPEN_PEOPLE_IN_GROUPS}
              </Link>
            </section>
          ) : week && !view.incubator && view.work && view.work.weekNumber === week.weekNumber ? (
            <WeekWorkCard
              groupName={view.groupName}
              work={view.work}
              said={new Map(week.people.map((person) => [person.uid, person.said]))}
              facilitatorsApart={view.facilitatorsWithPlaces}
              onRemind={(only) => open({ kind: "remind", weekNumber: week.weekNumber, only })}
              readBase={links.coursework ?? null}
            />
          ) : (
            week &&
            !view.incubator && (
              <section className={styles.card} aria-labelledby="group-people">
                {choosing && <p className={styles.cardLine}>{W.weekOnItsWayWords(week.weekNumber)}</p>}
                <h2 id="group-people" className={styles.cardTitle}>
                  {W.weekPeopleTitle(view.groupName, week.weekNumber)}
                </h2>
                <table className={styles.people}>
                  <thead>
                    <tr>
                      <th scope="col">{W.PERSON}</th>
                      <th scope="col">{W.THIS_SESSION}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {week.people.map((person) => (
                      <tr key={person.uid}>
                        <td>{person.name}</td>
                        <td>
                          {/* A request to be excused is one of two facts, and
                              says it in place of what they said in advance. */}
                          {person.excuse ? (
                            <span
                              className={`${styles.excuseChip} ${person.excuse === "waiting" ? styles.excuseWaiting : styles.excuseExcused}`}
                            >
                              {S.factWords(person.excuse)}
                            </span>
                          ) : (
                            W.WEEK_SAID_WORDS[person.said]
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {view.facilitatorsWithPlaces.length > 0 && (
                  <p className={styles.cardLine}>{W.facilitatorsApartLine(view.facilitatorsWithPlaces)}</p>
                )}
                {week.people.some((person) => person.excuse) && <p className={styles.cardLine}>{S.WHAT_YOU_SEE}</p>}
              </section>
            )
          )}
        </div>
      ) : (
        <div id="group-panel-history" role="tabpanel" aria-labelledby="group-tab-history" className={styles.tabPanel}>
          {week && week.change && !week.started && weekCard(week)}
          <section className={styles.card} aria-labelledby="group-history">
            <div className={styles.historyHead}>
              <h2 id="group-history" className={styles.cardTitle}>
                {W.WHO_CHANGED_WHAT}
              </h2>
              <div className={styles.filters} role="group" aria-label={W.WHO_CHANGED_WHAT}>
                {W.HISTORY_FILTERS.map((each) => (
                  <button
                    key={each.value}
                    type="button"
                    className={filter === each.value ? `${styles.filter} ${styles.filterOn}` : styles.filter}
                    aria-pressed={filter === each.value}
                    onClick={() => setFilter(each.value)}
                  >
                    {each.label}
                  </button>
                ))}
              </div>
            </div>
            {!history || history.rows.length === 0 ? (
              <p className={styles.cardLine}>{W.NO_HISTORY_LINE}</p>
            ) : rows.length === 0 ? (
              <p className={styles.cardLine}>
                {W.nothingUnderWords(W.HISTORY_FILTERS.find((each) => each.value === filter)?.label ?? "")}
              </p>
            ) : (
              <ol className={styles.history}>
                {rows.map((row) => (
                  <li key={row.id} className={styles.historyRow}>
                    <span className={styles.historyWhen}>{historyWhenWords(row.at, row.day)}</span>
                    <span className={styles.historyWho}>{row.actorName}</span>
                    <span className={styles.historyWhat}>
                      <span>{row.headline}</span>
                      {row.rest && <span className={styles.historyRest}>{row.rest}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {history?.more && <p className={styles.cardLine}>{W.HISTORY_MORE}</p>}
          </section>
        </div>
      )}

      <Modal
        open={panel !== null}
        onClose={() => setPanel(null)}
        ariaLabel={
          panel?.kind === "remind"
            ? W.REMIND
            : panel?.kind === "link"
            ? W.SET_THE_LINK
            : panel?.kind === "room"
              ? W.roomPanelTitle(view.groupName)
              : panel?.kind === "give"
                ? C.SOMEONE_ELSE_IS_COVERING
                : panel?.kind === "change" && panel.didNotHappen
                  ? C.IT_DIDNT_HAPPEN
                  : W.changePanelTitle(view.groupName)
        }
        side
      >
        {(dismiss) =>
          panel === null ? null : panel.kind === "remind" ? (
            <RemindPanel
              key={opened}
              groupId={view.groupId}
              weekNumber={panel.weekNumber}
              only={panel.only}
              onClose={dismiss}
              onDone={(words) => {
                dismiss();
                setSaid(words);
                router.refresh();
              }}
            />
          ) : panel.kind === "give" ? (
            (() => {
              const given = view.weeks.find((each) => each.weekNumber === panel.weekNumber);
              return given ? (
                <GivePanel
                  key={opened}
                  view={view}
                  week={given}
                  onClose={dismiss}
                  onDone={(words) => {
                    dismiss();
                    setSaid(words);
                    router.refresh();
                  }}
                />
              ) : null;
            })()
          ) : panel.kind === "change" ? (
            <ChangePanel
              key={opened}
              view={view}
              start={panel.start}
              oneWeekOnly={Boolean(panel.didNotHappen)}
              didNotHappen={Boolean(panel.didNotHappen)}
              onClose={dismiss}
              onDone={(words) => {
                dismiss();
                setSaid(words);
                router.refresh();
              }}
            />
          ) : panel.kind === "link" ? (
            <LinkPanel
              key={opened}
              view={view}
              week={panel.week}
              onClose={dismiss}
              onDone={(words) => {
                dismiss();
                setSaid(words);
                router.refresh();
              }}
            />
          ) : (
            <RoomPanel
              key={opened}
              view={view}
              roomPath={links.roomPath}
              onClose={dismiss}
              onDone={(words) => {
                dismiss();
                setSaid(words);
                router.refresh();
              }}
            />
          )
        }
      </Modal>

      {/* THE WAYS TO TAKE ONE WEEK'S REGISTER, as a sheet with a line under each. */}
      <Modal open={sheetWeek !== null} onClose={() => setSheet(null)} ariaLabel={C.TAKE_THE_REGISTER} sheet width="sm">
        {(dismiss) =>
          sheetWeek ? (
            <section className={styles.panel} aria-labelledby="group-cover-sheet" data-testid="cover-sheet">
              <div className={styles.panelHead}>
                <h2 id="group-cover-sheet" className={styles.panelTitle}>
                  {C.sheetTitle(view.groupName, sheetWeek.dateKey, sheetWeek.hhmm, view.todayKey)}
                </h2>
                <button type="button" className={styles.button} onClick={dismiss}>
                  {W.CLOSE}
                </button>
              </div>
              {(() => {
                const ways = coverChoicesOf(weekRegisterFacts(sheetWeek));
                const href = registerOf(sheetWeek);
                // Nobody to cover for, or nothing left to take: say so, and open the register where it can be.
                if (!ways.offered) {
                  return (
                    <>
                      <p className={styles.panelLede}>{ways.helpOnly ? C.HELPING_LINE : C.FINISHED_LINE}</p>
                      {href && (
                        <Link href={href} className={styles.buttonPrimary}>
                          {C.OPEN_THE_REGISTER}
                        </Link>
                      )}
                    </>
                  );
                }
                return (
                  <>
                  <p className={styles.panelLede}>{C.sheetQuestion(view.facilitatorNames, sheetWeek.started, sheetWeek.taken)}</p>
                  {sheetWeek.cover && <p className={styles.panelNote}>{C.coveredLine(sheetWeek.cover)}</p>}
                  <ul className={styles.ways}>
                    {ways.covering && (
                      <li>
                        <button type="button" className={styles.way} disabled={!hydrated || covering} onClick={() => void coverIt(sheetWeek)}>
                          <span className={styles.wayName}>{C.IM_COVERING_IT}</span>
                          <span className={styles.wayLine}>{C.IM_COVERING_IT_LINE}</span>
                        </button>
                      </li>
                    )}
                    {ways.someoneElse && (
                      <li>
                        <button
                          type="button"
                          className={styles.way}
                          disabled={!hydrated}
                          onClick={() => {
                            // Closed straight away rather than through history, so the
                            // panel opened next is not closed by the sheet's own back step.
                            setSheet(null);
                            open({ kind: "give", weekNumber: sheetWeek.weekNumber });
                          }}
                        >
                          <span className={styles.wayName}>{C.SOMEONE_ELSE_IS_COVERING}</span>
                          <span className={styles.wayLine}>{C.SOMEONE_ELSE_LINE}</span>
                        </button>
                      </li>
                    )}
                    {ways.didNotHappen && (
                      <li>
                        <button
                          type="button"
                          className={styles.way}
                          disabled={!hydrated}
                          onClick={() => {
                            // Closed straight away rather than through history, so the
                            // panel opened next is not closed by the sheet's own back step.
                            setSheet(null);
                            open({ kind: "change", start: { choice: "one", weekNumber: sheetWeek.weekNumber }, didNotHappen: true });
                          }}
                        >
                          <span className={styles.wayName}>{C.IT_DIDNT_HAPPEN}</span>
                          <span className={styles.wayLine}>{C.didntHappenLine(sheetWeek.weekNumber)}</span>
                        </button>
                      </li>
                    )}
                  </ul>
                  </>
                );
              })()}
              {coverProblem && (
                <p className={styles.problem} role="status">
                  {coverProblem}
                </p>
              )}
              <p className={styles.coverFoot}>{C.whicheverWords(firstNames)}</p>
            </section>
          ) : null
        }
      </Modal>
    </div>
  );
}
