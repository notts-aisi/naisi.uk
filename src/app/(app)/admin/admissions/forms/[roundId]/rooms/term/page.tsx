import Link from "next/link";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import shared from "@/features/applications/editor/editor.module.css";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import TermRoomsDownload from "@/features/courses/weekRooms/TermRoomsDownload";
import TermRoomsGrid from "@/features/courses/weekRooms/TermRoomsGrid";
import styles from "@/features/courses/weekRooms/WeekRooms.module.css";
import { applicationFormPath } from "@/lib/applications/editor/olderRounds";
import { loadTermRooms } from "@/lib/courses/weekRooms/load";
import { termRoomsPath, weekRoomsPath } from "@/lib/courses/weekRooms/paths";
import * as W from "@/lib/courses/weekRooms/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * THE TERM'S ROOMS, at `/admin/admissions/forms/[roundId]/rooms/term`: each
 * group's room week by week, a grid a programme, across every programme on
 * the term the reader may see, or one with `?programme=`. Each cell opens
 * that week on the week's rooms with the group's row in view. Nothing on this
 * page writes; Download makes a file of what it shows, in the browser.
 *
 * FOR AN ADMIN AND A PROGRAMME'S LEAD, by the same gate as the week's rooms
 * (`loadTermRooms`): anybody else, a form that is not there and a programme
 * the reader may not see are all drawn the same "there is no programme here".
 */
export default async function TermRoomsPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string }>;
  searchParams: Promise<{ programme?: string | string[] }>;
}) {
  const [{ roundId }, query, user] = await Promise.all([params, searchParams, requireAdmissionsPage()]);
  const asked = Array.isArray(query.programme) ? query.programme[0] : query.programme;
  const db = getAdminDb();
  const loaded = db ? await loadTermRooms(db, user, { roundId, only: asked ?? null }) : null;
  if (!loaded || loaded.status !== "ok") return <NoProgrammeHere roundId={roundId} />;

  const { reader, only, programmes, sections } = loaded;
  return (
    <ApplicationsRoot className={shared.page}>
      <nav className={shared.crumb} aria-label="Breadcrumb">
        <Link href={applicationFormPath(reader.roundId)}>{W.PROGRAMMES_CRUMB}</Link>
        <span aria-hidden="true">/</span>
        <Link href={applicationFormPath(reader.roundId)}>{reader.termLabel}</Link>
      </nav>
      <header className={shared.head}>
        <div className={shared.headMain}>
          <h1 className={shared.title}>{W.TERM_ROOMS_TITLE}</h1>
          <p className={shared.lede}>{W.TERM_ROOMS_LEDE}</p>
        </div>
        <div className={shared.headActions}>
          <Link href={weekRoomsPath(reader.roundId, { programme: only })} className={styles.textLink}>
            {W.TO_WEEK_ROOMS}
          </Link>
          <TermRoomsDownload sections={sections} />
        </div>
      </header>

      <div className={styles.board}>
        {programmes.length > 1 ? (
          <nav aria-label={W.VIEWS_NAV}>
            <ul className={styles.chips}>
              <li>
                <Link href={termRoomsPath(reader.roundId)} className={styles.chip} aria-current={only === null ? "page" : undefined}>
                  {W.ALL_PROGRAMMES}
                </Link>
              </li>
              {programmes.map((programme) => (
                <li key={programme.programmeId}>
                  <Link
                    href={termRoomsPath(reader.roundId, programme.programmeId)}
                    className={styles.chip}
                    aria-current={only === programme.programmeId ? "page" : undefined}
                  >
                    {programme.programmeName}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <TermRoomsGrid sections={sections} />
      </div>
    </ApplicationsRoot>
  );
}
