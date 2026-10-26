import Link from "next/link";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import NotYours from "@/features/applications/groups/NotYours";
import RunBlank from "@/features/applications/groups/RunBlank";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import ReadOutView from "@/features/courses/facilitatorWeek/ReadOutView";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { loadFacilitatorGroup } from "@/lib/courses/facilitatorGroup";
import { openLeadDoor } from "@/lib/courses/facilitatorWeek/leadDoor";
import { loadReadOutWeek, weekOfGroup } from "@/lib/courses/facilitatorWeek/readers";
import {
  ATTENDANCE,
  NO_REFLECTIONS,
  REFLECTIONS,
  facilitatorsOwnLine,
  groupWeekTitleWords,
  noGroupsWords,
  readOutEyebrowWords,
  readOutTitleWords,
} from "@/lib/courses/facilitatorWeek/words";
import { resolveCalendar } from "@/lib/courses/groupResolve";
import { resolveSessions } from "@/lib/courses/sessions";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * THE LEAD'S AND ADMINS' READING OF ONE GROUP'S REFLECTIONS (Q30), at
 * `.../programmes/[programmeId]/reflections?group=&week=`, reached from
 * "Read them" on the lead's view of the group's week.
 *
 * The group's answers to each prompt are shown as its facilitators see them
 * when they pick lines to read out: the words, with no name on them, in the
 * order of the words. Nothing is picked or copied here: the lead runs no
 * session. Beside them, the group's FACILITATORS' OWN reflections, under each
 * facilitator's name and marked as theirs (Zach, Mon 26 Oct), which no
 * facilitator is ever shown and nobody reads out.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`openLeadDoor`), decided from the
 * form before the run is read; a reviewer is told it is the lead's and an
 * admin's. The private notes are never read here. Nothing here writes.
 */

export const dynamic = "force-dynamic";

export default async function LeadGroupReflectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams?: Promise<{ group?: string | string[]; week?: string | string[] }>;
}) {
  const [{ roundId, programmeId }, query, user] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { group?: string | string[]; week?: string | string[] }),
    requireAdmissionsPage(),
  ]);
  const db = getAdminDb();
  const door = db ? await openLeadDoor(db, user, roundId, programmeId, query.group) : null;
  if (!db || !door || door.kind === "none") return <NoProgrammeHere roundId={roundId} />;
  if (door.kind === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Attendance" />;
  if (door.kind === "blank") return <RunBlank view={door.view} />;

  // Every address here is a page of this site written out from ids, never from stored text.
  const round = encodeURIComponent(roundId);
  const programmeKey = encodeURIComponent(programmeId);
  if (door.kind === "no-groups") {
    return (
      <div className={facilitator.page}>
        <header className={facilitator.wkReadHead}>
          <Link href={`/admin/admissions/forms/${round}/programmes/${programmeKey}/attendance`} className={facilitator.crumb}>
            {ATTENDANCE}
          </Link>
        </header>
        <p className={weekly.cardLine}>{noGroupsWords(door.view.programmeName)}</p>
      </div>
    );
  }

  const { run, group, viewer } = door;
  const now = new Date();
  const taught = new Set(resolveSessions(run, group, resolveCalendar(run, group)).map((session) => session.weekNumber));
  const asked = typeof query.week === "string" && /^\d{1,2}$/.test(query.week) ? Number(query.week) : null;
  const weekNumber = asked !== null && taught.has(asked) ? asked : (weekOfGroup(run, group, now)?.weekNumber ?? null);
  const [model, programme] = await Promise.all([
    loadFacilitatorGroup(db, run, group, { isAdmin: viewer === "admin" }, now),
    runProgrammeOf(db, run.id),
  ]);
  const week =
    weekNumber === null
      ? null
      : await loadReadOutWeek(db, { run, group, model, viewer, weekNumber, withOwn: true, now });

  const lead = viewer === "lead" ? { firstName: "", isReader: true } : programme?.leadFirstName ? { firstName: programme.leadFirstName, isReader: false } : null;

  return (
    <div className={facilitator.page}>
      <header className={facilitator.wkReadHead}>
        <Link href={`/admin/admissions/forms/${round}/programmes/${programmeKey}/week?group=${encodeURIComponent(group.id)}`} className={facilitator.crumb}>
          {groupWeekTitleWords(group.name)}
        </Link>
        {week && <p className={facilitator.wkReadEyebrow}>{readOutEyebrowWords(group.name, week.weekNumber)}</p>}
        <h1 className={facilitator.wkReadTitle}>{week ? readOutTitleWords({ kind: "week", weekNumber: week.weekNumber }) : REFLECTIONS}</h1>
      </header>
      {week === null ? (
        <p className={weekly.cardLine}>{NO_REFLECTIONS}</p>
      ) : (
        <ReadOutView prompts={week.prompts} tonight={false} readOut={false} own={week.own} ownLine={facilitatorsOwnLine(lead)} />
      )}
    </div>
  );
}
