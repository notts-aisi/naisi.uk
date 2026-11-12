"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { useHydrated } from "@/hooks/useHydrated";
import { CAMPUS_LABEL } from "@/lib/courses/campusWords";
import {
  filterHistory,
  historyWhenWords,
  oneWeekChoicesOf,
  type GroupPageView,
  type GroupPageWeek,
} from "@/lib/courses/groupPage/model";
import * as W from "@/lib/courses/groupPage/words";
import ChangePanel, { type ChangeStart } from "./ChangePanel";
import LinkPanel from "./LinkPanel";
import RoomPanel from "./RoomPanel";
import styles from "./GroupPage.module.css";

/**
 * ONE GROUP'S PAGE, for admins and the programme's lead: the head (the way
 * back, the group's name, where the term is, Take the register, Write to the
 * group, its facilitators and how many people), how the group meets with a
 * Change beside each part, and two tabs, Week by week and History.
 *
 * WEEK BY WEEK: every week of the group's plan, past ones too, each with its
 * date and state; the chosen week's card with what each person has said
 * about that session; Change this week, Set the link, Put it back as usual
 * once the week has a change of its own, and, for a week whose time passed
 * with no register, the line that offers to put it right. An incubator's
 * weeks are rows, each with its own Change.
 *
 * Everything drawn is the server's (`loadGroupPage`); the state here is the
 * tab, the week shown, the history's filter and which panel is open. A
 * change that went through reads the page again, so every part shows what is
 * now true, and a line says what it did.
 */

export type GroupPageLinks = {
  programme: string;
  groups: string;
  /** Today's register page, for whoever may take it; null for a lead, who cannot yet. */
  register: string | null;
  /** Today's way of writing to the group, where there is one for this viewer. */
  write: string | null;
  facilitators: string;
  times: string;
  people: string;
  /** The programme's room route for this group. */
  roomPath: string;
};

type Panel =
  | { kind: "change"; start: ChangeStart }
  | { kind: "link"; week: { weekNumber: number; sessionKey: string } | null }
  | { kind: "room" };

function chipsOf(week: GroupPageWeek): string[] {
  return [week.hasLink ? W.LINK_FOR_WEEK : W.NO_LINK_YET, W.joiningOnlineChip(week.joiningOnline), W.cantMakeItChip(week.cantMakeIt)];
}

export default function GroupPage({ view, links }: { view: GroupPageView; links: GroupPageLinks }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [tab, setTab] = useState<"weeks" | "history">("weeks");
  const [shown, setShown] = useState<number | null>(view.openWeek);
  const [filter, setFilter] = useState<W.HistoryFilter>("everything");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [opened, setOpened] = useState(0);
  const [said, setSaid] = useState<string | null>(null);

  const open = (next: Panel) => {
    setSaid(null);
    setOpened((n) => n + 1);
    setPanel(next);
  };
  const week = view.weeks.find((each) => each.weekNumber === shown) ?? null;
  const campus = view.meets.campus ? CAMPUS_LABEL[view.meets.campus] : "";
  const timeSet = Boolean(view.meets.hhmm);
  const history = view.history;
  const rows = history ? filterHistory(history.rows, filter) : [];

  const weekCard = (each: GroupPageWeek) => {
    const choices = oneWeekChoicesOf(each);
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

  const putRightLine = (each: GroupPageWeek) =>
    oneWeekChoicesOf(each).putRight ? (
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

      {tab === "weeks" ? (
        <div id="group-panel-weeks" role="tabpanel" aria-labelledby="group-tab-weeks" className={styles.tabPanel}>
          {view.weeks.length === 0 ? (
            <p className={styles.card}>{W.NO_WEEKS_YET}</p>
          ) : view.incubator ? (
            <section className={styles.card} aria-label={W.WEEK_BY_WEEK}>
              <ul className={styles.rows}>
                {view.weeks.map((each) => {
                  const choices = oneWeekChoicesOf(each);
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
                    onClick={() => setShown(each.weekNumber)}
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
          ) : (
            week &&
            !view.incubator && (
              <section className={styles.card} aria-labelledby="group-people">
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
                        <td>{W.WEEK_SAID_WORDS[person.said]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {view.facilitatorsWithPlaces.length > 0 && (
                  <p className={styles.cardLine}>{W.facilitatorsApartLine(view.facilitatorsWithPlaces)}</p>
                )}
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
                    <span className={styles.historyWhen}>{historyWhenWords(row.at)}</span>
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
          panel?.kind === "link" ? W.SET_THE_LINK : panel?.kind === "room" ? W.roomPanelTitle(view.groupName) : W.changePanelTitle(view.groupName)
        }
        side
      >
        {(dismiss) =>
          panel === null ? null : panel.kind === "change" ? (
            <ChangePanel
              key={opened}
              view={view}
              start={panel.start}
              oneWeekOnly={false}
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
    </div>
  );
}
