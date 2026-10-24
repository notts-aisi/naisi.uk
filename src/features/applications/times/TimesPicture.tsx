import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRightIcon } from "@/features/applications/editor/Icons";
import shared from "@/features/applications/editor/editor.module.css";
import { WEEK_FROM_MONDAY, type TimesPicture as Picture } from "@/lib/applications/handover/times";
import type { TimesView } from "@/lib/applications/handover/timesLoad";
import { clockLabel } from "@/lib/applications/review/availabilityView";
import { minutesFromTimeLocal } from "@/lib/admissions/availability";
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
  saidSentence,
  seePerson,
  whenShort,
  yourGroups,
} from "./timesWords";

/**
 * THE TIMES PICTURE, under a programme's Groups tab (board st-times).
 *
 * Read only, and drawn on the server: it holds no state and sends no
 * script. Picking a session length is a link that asks the page again.
 *
 * What the board draws and this leaves out, because the feature does not
 * exist: "Use for a group", "Change" and "Add a group" (groups are made and
 * changed in the run editor, which the card links to), and the Sessions and
 * Facilitators views. "People in groups" is the run's allocation board.
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

function GroupsViews({ view }: { view: TimesView }) {
  if (!view.run) return null;
  const { run } = view;
  return (
    <nav className={styles.views} aria-label="Groups views">
      <Link
        href={`/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/groups`}
        className={`${styles.view} ${styles.viewCurrent}`}
        aria-current="page"
      >
        Times
      </Link>
      <Link
        href={`/admin/courses/${encodeURIComponent(run.courseId)}/runs/${encodeURIComponent(run.id)}/allocation`}
        className={styles.view}
      >
        People in groups
      </Link>
    </nav>
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
              href={`/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/groups?length=${minutes}`}
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

/** A calm sentence in place of the picture, with the one place to go next. */
function Blank({ view }: { view: TimesView }) {
  const name = view.programmeName;
  const settings = (
    <Link
      href={`/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/setup`}
      className={shared.btn}
    >
      Go to Settings
    </Link>
  );
  if (view.blank === "no-run") {
    return (
      <section className={`${styles.card} ${styles.blank}`}>
        <p className={styles.blankText}>
          {name} doesn’t name a course run yet. Name it on the Settings tab, under Course run, and
          this shows when the people holding a place are free.
        </p>
        <div className={styles.blankActions}>{settings}</div>
      </section>
    );
  }
  if (view.blank === "run-gone") {
    return (
      <section className={`${styles.card} ${styles.blank}`}>
        <p className={styles.blankText}>
          The course run {name} names is no longer on the site. Name another on the Settings tab,
          under Course run.
        </p>
        <div className={styles.blankActions}>{settings}</div>
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
  const { said, minutes, rows, counts, meets } = picture;
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

function BestTimes({ picture, names }: { picture: Picture; names: Map<string, string> }) {
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function YourGroups({ view, picture }: { view: TimesView; picture: Picture }) {
  const run = view.run;
  if (!run) return null;
  const withLength = view.length.source.kind === "mixed";
  const fit = picture.fit;
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
                    group.canMake,
                    withLength,
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
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
                    <span>{seePerson(person.name)}</span>
                    <ArrowRightIcon size={16} />
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
              <span>{seePerson(fit.none[0].name)}</span>
              <ArrowRightIcon size={16} />
            </Link>
          )}
        </div>
      )}
      <Link
        href={`/admin/courses/${encodeURIComponent(run.courseId)}/runs/${encodeURIComponent(run.id)}`}
        className={`${shared.btn} ${styles.editorLink}`}
      >
        {picture.groups.length === 0 ? "Add groups in the run editor" : "Add or change groups in the run editor"}
      </Link>
    </section>
  );
}

export default function TimesPicture({ view }: { view: TimesView }) {
  const picture = view.picture;
  const drawn = picture !== null && picture.said > 0;
  const names = new Map((picture?.groups ?? []).map((group) => [group.id, group.name] as const));
  return (
    <div className={styles.page}>
      {(view.run || drawn) && (
        <div className={styles.toolbar}>
          <GroupsViews view={view} />
          {drawn && <LengthPicker view={view} />}
        </div>
      )}
      {picture === null ? (
        <Blank view={view} />
      ) : (
        <>
          <p className={styles.lede}>
            {saidSentence(picture.said, picture.holders, view.programmeName)}
            {drawn ? ` ${lengthSentence(view.length.source, view.length.counted)}` : ""}
          </p>
          {drawn && (
            <div className={styles.layout}>
              <div className={styles.main}>
                <Grid picture={picture} names={names} />
              </div>
              <div className={styles.side}>
                <BestTimes picture={picture} names={names} />
                <YourGroups view={view} picture={picture} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
