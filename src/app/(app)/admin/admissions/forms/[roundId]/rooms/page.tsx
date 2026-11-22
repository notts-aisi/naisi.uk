import Link from "next/link";
import TermCrumb from "@/features/applications/editor/TermCrumb";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import shared from "@/features/applications/editor/editor.module.css";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import WeekRoomsBoard from "@/features/courses/weekRooms/WeekRoomsBoard";
import styles from "@/features/courses/weekRooms/WeekRooms.module.css";
import { loadWeekRooms } from "@/lib/courses/weekRooms/load";
import { termRoomsPath, weekRoomsPath } from "@/lib/courses/weekRooms/paths";
import * as W from "@/lib/courses/weekRooms/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * THE WEEK'S ROOMS, at `/admin/admissions/forms/[roundId]/rooms`: one
 * calendar week of the term, every programme on it the reader may see, one
 * row per group's session that week with its room set or changed in the row.
 * `?week=` is any day of the week shown (its Monday is drawn), `?programme=`
 * narrows it to one programme, which is how each programme's All groups
 * view opens it. The term's rooms, every week as a grid, is beside it.
 *
 * FOR AN ADMIN AND A PROGRAMME'S LEAD: the admissions tree's gate, repeated
 * here, then `loadWeekRooms`, which asks of each programme on the form the
 * question every Groups view asks (an admin, or its lead) before anything of
 * a run is read. Anybody else, a form that is not there and a programme the
 * reader may not see are all drawn the same "there is no programme here".
 *
 * Every room changed here is saved by the one-week change route the group's
 * page uses, from the browser, which asks again who is pressing.
 */
export default async function WeekRoomsPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string }>;
  searchParams: Promise<{ week?: string | string[]; programme?: string | string[] }>;
}) {
  const [{ roundId }, query, user] = await Promise.all([params, searchParams, requireAdmissionsPage()]);
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;
  const db = getAdminDb();
  const loaded = db
    ? await loadWeekRooms(db, user, { roundId, week: one(query.week), only: one(query.programme), now: new Date() })
    : null;
  if (!loaded || loaded.status !== "ok") return <NoProgrammeHere roundId={roundId} />;

  const { reader, only, view } = loaded;
  const here = (week: string | null, programme: string | null = only) => weekRoomsPath(reader.roundId, { week, programme });

  return (
    <ApplicationsRoot className={shared.page}>
      <nav className={shared.crumb} aria-label="Breadcrumb">
        <TermCrumb roundId={reader.roundId} termLabel={reader.termLabel} />
      </nav>
      <header className={shared.head}>
        <div className={shared.headMain}>
          <h1 className={shared.title}>{W.WEEK_ROOMS_TITLE}</h1>
          <p className={shared.lede}>{W.groupsCountWords(view.rows.length)}</p>
        </div>
        <div className={shared.headActions}>
          <Link href={termRoomsPath(reader.roundId, only)} className={styles.textLink}>
            {W.TO_TERM_ROOMS}
          </Link>
        </div>
      </header>

      <div className={styles.board}>
        <div className={styles.head}>
          <p className={styles.eyebrow}>{W.WEEK_ROOMS_EYEBROW}</p>
          <nav aria-label={W.WEEKS_NAV}>
            <ul className={styles.weeks}>
              {view.weeks.map((week) => (
                <li key={week.monday}>
                  <Link
                    href={here(week.monday)}
                    className={styles.weekLink}
                    aria-current={week.monday === view.monday ? "page" : undefined}
                  >
                    <span>{week.label}</span>
                    {week.tag ? <span className={styles.weekTag}>{week.tag}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className={styles.weekNav}>
            {view.previous ? (
              <Link href={here(view.previous)} className={styles.textLink}>
                {W.PREVIOUS_WEEK}
              </Link>
            ) : null}
            {view.next ? (
              <Link href={here(view.next)} className={styles.textLink}>
                {W.NEXT_WEEK_LINK}
              </Link>
            ) : null}
          </div>
        </div>

        {view.programmes.length > 1 || only ? (
          <nav aria-label={W.VIEWS_NAV}>
            <ul className={styles.chips}>
              <li>
                <Link href={here(view.monday, null)} className={styles.chip} aria-current={only === null ? "page" : undefined}>
                  {W.ALL_PROGRAMMES} <span className={styles.chipCount}>{view.allRows}</span>
                </Link>
              </li>
              {view.programmes.map((programme) => (
                <li key={programme.programmeId}>
                  <Link
                    href={here(view.monday, programme.programmeId)}
                    className={styles.chip}
                    aria-current={only === programme.programmeId ? "page" : undefined}
                  >
                    {programme.programmeName} <span className={styles.chipCount}>{programme.rows}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <p className={styles.lede}>{W.WEEK_ROOMS_LEDE}</p>

        {view.rows.length === 0 ? (
          <section className={styles.empty}>
            <h2 className={styles.emptyTitle}>{W.NO_SESSIONS_TITLE}</h2>
            <p className={styles.lede}>{W.NO_SESSIONS_LEDE}</p>
            {view.elsewhere ? (
              <p>
                <Link href={here(view.elsewhere.monday)} className={styles.textLink}>
                  {view.elsewhere.direction === "next" ? W.NEXT_WEEK_WITH_SESSIONS : W.LAST_WEEK_WITH_SESSIONS}
                </Link>
              </p>
            ) : null}
          </section>
        ) : (
          <>
            <ul className={styles.summary}>
              {W.summaryWords(view.counts).map((words, at) => (
                <li key={at}>{words}</li>
              ))}
            </ul>
            <WeekRoomsBoard roundId={reader.roundId} monday={view.monday} weekLabel={view.weekLabel} rows={view.rows} />
          </>
        )}
      </div>
    </ApplicationsRoot>
  );
}
