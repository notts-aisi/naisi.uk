import Link from "next/link";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import NotYours from "@/features/applications/groups/NotYours";
import RunBlank from "@/features/applications/groups/RunBlank";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import ThisWeeksWork, { ReflectionsQueueCard } from "@/features/courses/facilitatorWeek/ThisWeeksWork";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { loadFacilitatorGroup } from "@/lib/courses/facilitatorGroup";
import { openLeadDoor } from "@/lib/courses/facilitatorWeek/leadDoor";
import { loadGroupWeek } from "@/lib/courses/facilitatorWeek/readers";
import { ATTENDANCE, NO_WEEK_TO_SHOW, groupWeekTitleWords, noGroupsWords } from "@/lib/courses/facilitatorWeek/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * THE LEAD'S AND ADMINS' VIEW OF ONE GROUP'S WEEK, at
 * `.../programmes/[programmeId]/week?group=`, reached from the Attendance
 * tab's "Each group’s week": This week's work for the week the group is
 * getting ready for, who ticked each source by name (Q31), and how many have
 * written each part's reflection, with the way to read them.
 *
 * THE GROUP'S FACILITATORS' OWN WORK IS HERE, marked as theirs (Zach, Mon 26
 * Oct: a facilitator does the group's coursework as themselves, and their
 * own ticks and reflections are read by the programme's lead and admins),
 * which no page a facilitator opens ever shows. The private notes left on a
 * source are not shown to the lead (Q38: the group's facilitators and admins
 * read them); an admin reads them here as on the group page.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`openLeadDoor`), decided from the
 * form before the run is read; a reviewer is told it is the lead's and an
 * admin's. Outside the tabs, as a single application is: a screen of its own,
 * with the way back to the Attendance tab. Nothing here writes.
 */

export const dynamic = "force-dynamic";

export default async function LeadGroupWeekPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams?: Promise<{ group?: string | string[] }>;
}) {
  const [{ roundId, programmeId }, query, user] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { group?: string | string[] }),
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
  const back = (
    <Link href={`/admin/admissions/forms/${round}/programmes/${programmeKey}/attendance`} className={facilitator.crumb}>
      {ATTENDANCE}
    </Link>
  );
  if (door.kind === "no-groups") {
    return (
      <div className={facilitator.page}>
        <header className={facilitator.wkReadHead}>{back}</header>
        <p className={weekly.cardLine}>{noGroupsWords(door.view.programmeName)}</p>
      </div>
    );
  }

  const { run, group, viewer } = door;
  const now = new Date();
  const model = await loadFacilitatorGroup(db, run, group, { isAdmin: viewer === "admin", actor: user }, now);
  const week = await loadGroupWeek(db, { run, group, model, viewer, now });

  return (
    <div className={facilitator.page}>
      <header className={facilitator.wkReadHead}>
        {back}
        <h1 className={facilitator.wkReadTitle}>{groupWeekTitleWords(group.name)}</h1>
      </header>
      {week === null ? (
        <p className={weekly.cardLine}>{NO_WEEK_TO_SHOW}</p>
      ) : (
        <div className={facilitator.wkRows}>
          {week.counts.length > 0 && week.counts[0].of > 0 && (
            <ReflectionsQueueCard
              counts={week.counts}
              href={`/admin/admissions/forms/${round}/programmes/${programmeKey}/reflections?group=${encodeURIComponent(group.id)}&week=${week.weekNumber}`}
              lead
            />
          )}
          <ThisWeeksWork week={week} groupName={group.name} />
        </div>
      )}
    </div>
  );
}
