import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowRightIcon } from "@/features/applications/editor/Icons";
import shared from "@/features/applications/editor/editor.module.css";
import { WEEK_FROM_MONDAY, type TimesPicture as Picture } from "@/lib/applications/handover/times";
import type { TimesView } from "@/lib/applications/handover/timesLoad";
import { clockLabel } from "@/lib/applications/review/availabilityView";
import { minutesFromTimeLocal } from "@/lib/admissions/availability";
import {
  AddGroupButton,
  ChangeTimeButton,
  TimesActionsProvider,
  TimesActionsStatus,
  UseForAGroupButton,
  type TimesActionsSetup,
} from "./TimesActions";
import styles from "./TimesPicture.module.css";
import {
  cantLine,
  cellLabel,
  dayShort,
  fitSentence,
  freeCount,
  gridCaption,
  gridHeading,
  groupLine,
  groupTag,
  lengthSentence,
  lengthWords,
  littleMarkedSentence,
  saidSentence,
  seePerson,
  whenShort,
  yourGroups,
} from "./timesWords";

/**
 * THE TIMES PICTURE, under a programme's Groups tab (board st-times).
 *
 * Drawn on the server, and it holds no state. Picking a session length is
 * a link that asks the page again. The three controls the board draws are
 * the only parts that run in the browser (`./TimesActions.tsx`): "Use for a
 * group" beside a best time no group meets at, "Change" beside each group,
 * and "Add a group". Each opens a dialog, writes through its route, and has
 * the page read again. The row of views is the page's (`GroupsViews`),
 * handed in.
 *
 * It is drawn for an admin and for the programme's lead. A lead is not
 * offered what only an admin can do from here: naming the run on the
 * Settings tab, and the run editor.
 *
 * Every address here is a page of this site built from stored ids.
 */

/** How strongly a cell is filled, for a share of everybody who said: 8% for nobody, 85% for all. */
function fillFor(share: number): CSSProperties {
  return { "--fill": `${(8 + 77 * share).toFixed(1)}%` } as CSSProperties;
}

const fill = (count: number, said: number): CSSProperties => fillFor(said > 0 ? count / said : 0);

/** The legend's five steps, from nobody to everybody. */
const LEGEND_STEPS = [0, 0.26, 0.52, 0.74, 1];

/** A link's words, with its arrow kept on the line of the last word. */
function ArrowedWords({ words }: { words: string }) {
  const at = words.lastIndexOf(" ");
  return (
    <>
      {words.slice(0, at + 1)}
      <span className={styles.lastWord}>
        {words.slice(at + 1)}
        <span className={styles.arrow}>
          <ArrowRightIcon size={16} />
        </span>
      </span>
    </>
  );
}

function LengthPicker({ view }: { view: TimesView }) {
  return (
    <div className={styles.lengths} role="group" aria-labelledby="times-length-label">
      <span id="times-length-label" className={styles.lengthsLabel}>
        Session length
      </span>
      <span className={styles.segmented}>
        {view.length.options.map((minutes) => {
          const current = minutes === view.length.counted;
          return (
            <Link
              key={minutes}
              href={`/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/groups/times?length=${minutes}`}
              scroll={false}
              className={`${styles.segment} ${current ? styles.segmentCurrent : ""}`}
              aria-current={current ? "true" : undefined}
            >
              {lengthWords(minutes)}
            </Link>
          );
        })}
      </span>
    </div>
  );
}

/**
 * A calm sentence in place of the picture, with the one place to go next.
 * Naming the run is an admin's (the Settings tab's Course run panel), so an
 * admin is sent there and a lead is told who does it.
 */
function Blank({ view }: { view: TimesView }) {
  const name = view.programmeName;
  const admin = view.viewer === "admin";
  const settings = admin ? (
    <div className={styles.blankActions}>
      <Link
        href={`/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/setup`}
        className={shared.btn}
      >
        Go to Settings
      </Link>
    </div>
  ) : null;
  if (view.blank === "no-run") {
    return (
      <section className={`${styles.card} ${styles.blank}`}>
        <p className={styles.blankText}>
          {admin
            ? `${name} doesn’t name a course run yet. Name it on the Settings tab, under Course run, and this shows when the people holding a place are free.`
            : `${name} doesn’t name a course run yet. An admin names it on the Settings tab, under Course run, and this then shows when the people holding a place are free.`}
        </p>
        {settings}
      </section>
    );
  }
  if (view.blank === "run-gone") {
    return (
      <section className={`${styles.card} ${styles.blank}`}>
        <p className={styles.blankText}>
          {admin
            ? `The course run ${name} names is no longer on the site. Name another on the Settings tab, under Course run.`
            : `The course run ${name} names is no longer on the site. An admin names another on the Settings tab, under Course run.`}
        </p>
        {settings}
      </section>
    );
  }
  return (
    <section className={`${styles.card} ${styles.blank}`}>
      <p className={styles.blankText}>
        Nobody holds a place until decisions have gone out. Once they have, this shows when the
        people holding a place are free.
      </p>
    </section>
  );
}

function Grid({ picture, names }: { picture: Picture; names: Map<string, string> }) {
  const { minutes, rows, counts, meets } = picture;
  // The cells count only the people who choose when groups meet: everybody
  // who said, less those who marked under four hours (the sentence above says
  // so), so "2 of 2 free" never reads as somebody not being free.
  const said = picture.said - picture.littleMarked;
  const marked = meets.some((row) => row.some((ids) => ids.length > 0));
  return (
    <section className={styles.card}>
      <h2 id="times-grid-heading" className={styles.gridTitle}>
        {gridHeading(minutes)}
      </h2>
      <div className={styles.scroll} role="region" aria-labelledby="times-grid-heading" tabIndex={0}>
        <table className={styles.table}>
          <caption className={shared.visuallyHidden}>{gridCaption(minutes)}</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.corner}>
                <span className={shared.visuallyHidden}>Start time</span>
              </th>
              {WEEK_FROM_MONDAY.map((weekday) => (
                <th scope="col" key={weekday} className={styles.day}>
                  {dayShort(weekday)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((start, row) => (
              <tr key={start}>
                <th scope="row" className={styles.time}>
                  {clockLabel(start)}
                </th>
                {WEEK_FROM_MONDAY.map((weekday, column) => {
                  const count = counts[row][column];
                  const here = meets[row][column].map((id) => names.get(id) ?? "");
                  return (
                    <td key={weekday} className={styles.cellBox}>
                      <span
                        className={`${styles.cell} ${here.length > 0 ? styles.cellMeets : ""}`}
                        style={fill(count, said)}
                      >
                        {here.length > 0 && (
                          <span className={styles.tags} aria-hidden="true">
                            {here.map((name, at) => (
                              <span key={at} className={styles.tag}>
                                {groupTag(name)}
                              </span>
                            ))}
                          </span>
                        )}
                        <span aria-hidden="true">{count}</span>
                        <span className={shared.visuallyHidden}>
                          {cellLabel(weekday, start, count, said, here)}
                        </span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.legend}>
        <span className={styles.legendScale}>
          <span className={styles.legendEnd}>0</span>
          {LEGEND_STEPS.map((share) => (
            <span
              key={share}
              aria-hidden="true"
              className={styles.swatch}
              style={fillFor(share)}
            />
          ))}
          <span className={styles.legendEnd}>{said}</span>
          <span className={styles.legendWords}>people free</span>
        </span>
        {marked && (
          <span className={styles.legendKey}>
            <span aria-hidden="true" className={`${styles.swatch} ${styles.swatchMeets}`} />A group’s
            time
          </span>
        )}
      </div>
    </section>
  );
}

function BestTimes({ picture, names, acts }: { picture: Picture; names: Map<string, string>; acts: boolean }) {
  return (
    <section className={`${styles.card} ${styles.sideCard}`}>
      <h2 className={styles.sideTitle}>Best times</h2>
      {picture.best.length === 0 ? (
        <p className={styles.sideNote}>
          Nobody is free for a whole session at any of these times.
        </p>
      ) : (
        <ul className={styles.list}>
          {picture.best.map((best) => (
            <li key={`${best.weekday}-${best.start}`} className={styles.item}>
              <span className={styles.itemText}>
                <strong>{whenShort(best.weekday, best.start)}</strong>{" "}
                <span className={styles.muted}>· {freeCount(best.count)}</span>
              </span>
              {best.groupIds.map((id) => (
                <span key={id} className={styles.groupChip}>
                  {names.get(id)}
                </span>
              ))}
              {acts && best.groupIds.length === 0 && <UseForAGroupButton weekday={best.weekday} start={best.start} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function YourGroups({ view, picture, acts }: { view: TimesView; picture: Picture; acts: boolean }) {
  const run = view.run;
  if (!run) return null;
  const withLength = view.length.source.kind === "mixed";
  const fit = picture.fit;
  // "Add a group" starts on the best time no group meets at, if there is one.
  const free = picture.best.find((best) => best.groupIds.length === 0) ?? null;
  return (
    <section className={`${styles.card} ${styles.sideCard} ${styles.groupsCard}`}>
      <h2 className={styles.sideTitle}>
        {picture.groups.length === 0 ? "Your groups" : yourGroups(picture.groups.length)}
      </h2>
      {picture.groups.length === 0 ? (
        <p className={styles.sideNote}>This run has no groups yet.</p>
      ) : (
        <ul className={styles.list}>
          {picture.groups.map((group) => (
            <li key={group.id} className={`${styles.item} ${styles.groupItem}`}>
              <span className={styles.itemText}>
                <strong>{group.name}</strong>
                <br />
                <span className={styles.muted}>
                  {groupLine(
                    {
                      weekday: group.session.weekday,
                      startMinute: minutesFromTimeLocal(group.session.startTimeLocal),
                      durationMinutes: group.session.durationMinutes,
                    },
                    picture.said > 0 ? group.canMake : null,
                    withLength,
                    picture.said > 0,
                  )}
                </span>
              </span>
              {acts && <ChangeTimeButton groupId={group.id} />}
            </li>
          ))}
        </ul>
      )}
      {acts && <TimesActionsStatus />}
      {fit && (
        <div className={styles.fit}>
          {fit.none.length === 1 ? (
            <p className={styles.fitText}>
              {fitSentence(fit.canMakeOne, picture.said)}{" "}
              {cantLine(fit.none[0].name, fit.none[0].freeDays, picture.minutes)}
            </p>
          ) : (
            <p className={styles.fitText}>{fitSentence(fit.canMakeOne, picture.said)}</p>
          )}
          {fit.none.length > 1 && (
            <ul className={styles.fitList}>
              {fit.none.map((person) => (
                <li key={person.uid} className={styles.fitText}>
                  {cantLine(person.name, person.freeDays, picture.minutes)}
                  <br />
                  <Link
                    href={`/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/applications/${encodeURIComponent(person.uid)}`}
                    className={styles.see}
                  >
                    <ArrowedWords words={seePerson(person.name)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {fit.none.length === 1 && (
            <Link
              href={`/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/applications/${encodeURIComponent(fit.none[0].uid)}`}
              className={styles.see}
            >
              <ArrowedWords words={seePerson(fit.none[0].name)} />
            </Link>
          )}
        </div>
      )}
      {acts && <AddGroupButton suggested={free ? { weekday: free.weekday, start: free.start } : null} />}
      {view.viewer === "admin" ? (
        <Link
          href={`/admin/courses/${encodeURIComponent(run.courseId)}/runs/${encodeURIComponent(run.id)}`}
          className={`${styles.see} ${styles.editorLink}`}
        >
          <ArrowedWords
            words={picture.groups.length === 0 ? "Add groups in the run editor" : "Add or change groups in the run editor"}
          />
        </Link>
      ) : null}
    </section>
  );
}

/**
 * What the controls are handed, field by field: the run's groups with their
 * slots and whether Publish has told anybody their time, the picture's
 * counts (numbers only), the lengths a new group may last, and what it is
 * offered. Null while there is no run to act on.
 */
function actionsSetup(view: TimesView, picture: Picture): TimesActionsSetup | null {
  if (!view.run || !view.actions) return null;
  const told = new Set(view.actions.told);
  return {
    roundId: view.roundId,
    programmeId: view.programmeId,
    groups: picture.groups.map((group) => ({
      id: group.id,
      name: group.name,
      weekday: group.session.weekday,
      // The stored start whenever it is a time, so the route reads the slot the
      // dialog was opened on exactly as it is stored.
      start: minutesFromTimeLocal(group.session.startTimeLocal) !== null ? group.session.startTimeLocal : "",
      minutes: group.session.durationMinutes,
      told: told.has(group.id),
    })),
    counts:
      picture.said > 0
        ? {
            said: picture.said - picture.littleMarked,
            minutes: picture.minutes,
            rows: [...picture.rows],
            cells: picture.counts.map((row) => [...row]),
          }
        : null,
    lengths: [...view.length.options],
    counted: view.length.counted,
    nextName: view.actions.nextName,
    places: view.actions.places,
  };
}

export default function TimesPicture({
  view,
  views,
  arrange = null,
}: {
  view: TimesView;
  views: ReactNode;
  /** Arrange with Claude, which the page draws for an admin once there is a picture. */
  arrange?: ReactNode;
}) {
  const picture = view.picture;
  const drawn = picture !== null && picture.said > 0;
  const names = new Map((picture?.groups ?? []).map((group) => [group.id, group.name] as const));
  const setup = picture ? actionsSetup(view, picture) : null;
  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        {views}
        {drawn && <LengthPicker view={view} />}
      </div>
      {picture === null ? (
        <Blank view={view} />
      ) : (
        <>
          <p className={styles.lede}>
            {saidSentence(picture.said, picture.holders, view.programmeName)}
            {drawn ? ` ${lengthSentence(view.length.source, view.length.counted)}` : ""}
            {picture.littleMarked > 0 ? ` ${littleMarkedSentence(picture.littleMarked)}` : ""}
          </p>
          {/* Nobody has said when they are free yet: no picture to draw, but
              the groups can still be given a time, or added, here. Their lines
              say when each meets and count nobody. */}
          {!drawn && setup && (
            <div className={styles.side}>
              <TimesActionsProvider setup={setup}>
                <YourGroups view={view} picture={picture} acts />
              </TimesActionsProvider>
            </div>
          )}
          {drawn && (
            <div className={styles.layout}>
              <div className={styles.main}>
                <Grid picture={picture} names={names} />
              </div>
              {setup ? (
                <TimesActionsProvider setup={setup}>
                  <div className={styles.side}>
                    <BestTimes picture={picture} names={names} acts />
                    <YourGroups view={view} picture={picture} acts />
                  </div>
                </TimesActionsProvider>
              ) : (
                <div className={styles.side}>
                  <BestTimes picture={picture} names={names} acts={false} />
                  <YourGroups view={view} picture={picture} acts={false} />
                </div>
              )}
            </div>
          )}
        </>
      )}
      {picture !== null ? arrange : null}
    </div>
  );
}
