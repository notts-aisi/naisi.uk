import Link from "next/link";
import { redirect } from "next/navigation";
import PairsEditor from "@/features/courses/pairs/PairsEditor";
import draw from "@/features/courses/packsAndCases/packsAndCases.module.css";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { getSessionUser } from "@/features/courses/runAccess";
import { isAddressableId } from "@/lib/addressableId";
import { resolveGroupCalendar } from "@/lib/courses/groupResolve";
import { drawGate, readDrawPeople, readGroupWeek } from "@/lib/courses/packsAndCases/readers";
import { readGroupPairs } from "@/lib/courses/pairs/readers";
import {
  noPairsThisWeekWords,
  pairsFootWords,
  pairsHeadingWords,
  pairsLedeWords,
  pairsTitleWords,
} from "@/lib/courses/pairs/words";
import { resolveSessions, sessionRange } from "@/lib/courses/sessions";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * PAIRS FOR A SESSION IN PAIRS, TYPED IN (Technical AI Safety's hands-on
 * night; no board draws it): before the session a group's facilitators pair
 * everybody up, with at least one laptop in each pair, and say who is
 * bringing one. The pairs as they stand with their checks, then one row per
 * person in the group's pairs (its people taking part and its facilitators,
 * who take part too, so a facilitator can pair themselves), each with a
 * "Pair" select and, on a week that asks, "Bringing a laptop". Save writes
 * what changed (`/api/courses/groups/[groupId]/pairs`); nobody is emailed.
 *
 * WHICH WEEK: `?week=5`, or else the week of the group's next session. Only
 * a week whose In the session block asks for pairs has a form
 * (`pairsAskOf`); any other says it has no session in pairs.
 *
 * WHO (`drawGate`, the route's own gate, restated because a page's only
 * protection must not be a level above it): the group's live facilitators,
 * the lead of the programme that names the run, and admins. Everybody else
 * is sent to /learn, never told whether the group exists.
 *
 * A STATIC SEGMENT UNDER /learn, not `/learn/[runId]/...`, whose layout sends
 * away a programme's lead who holds no role on the run, as the draw's page
 * is. The group page links here for its facilitators; the lead opens it by
 * its address until the programme's Groups tab links it.
 */

export const dynamic = "force-dynamic";

export default async function PairsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const [{ groupId }, query] = await Promise.all([params, searchParams]);
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/learn/pairs/${groupId}`)}`);
  if (!isAddressableId(groupId)) redirect("/learn");

  const db = getAdminDb();
  if (!db) redirect("/learn");

  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  if (!groupSnap.exists) redirect("/learn");
  const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
  const gate = await drawGate(db, user, group);
  if (!gate.ok || group.archived) redirect("/learn");

  const runSnap = group.runId ? await db.collection("courseRuns").doc(group.runId).get() : null;
  if (!runSnap?.exists || (runSnap.data() ?? {}).destroying === true) redirect("/learn");
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});

  // The week: asked for, or the week of the group's next session.
  const now = new Date();
  const asked = typeof query.week === "string" && /^\d{1,2}$/.test(query.week) ? Number(query.week) : 0;
  const sessions = resolveSessions(run, group, resolveGroupCalendar(run, group, now).calendar);
  const weekNumber =
    asked >= 1 && asked <= 60
      ? asked
      : (sessionRange(sessions, now).next?.weekNumber ?? sessions[sessions.length - 1]?.weekNumber ?? 1);

  const [people, week] = await Promise.all([
    readDrawPeople(db, run.id, group, { isAdmin: gate.isAdmin }, now),
    readGroupWeek(db, run.id, groupId, weekNumber),
  ]);
  if (!people) redirect("/learn");
  const pairs = week ? await readGroupPairs(db, run.id, groupId, week, people) : null;

  const groupName = group.name.trim() || "Group";
  // A facilitator and an admin go back to the group's page; a lead to their programme's Groups.
  const back =
    gate.facilitates || gate.isAdmin || !gate.leadOf
      ? { href: `/learn/${encodeURIComponent(run.id)}/group/${encodeURIComponent(groupId)}`, label: groupName }
      : {
          href: `/admin/admissions/forms/${encodeURIComponent(gate.leadOf.roundId)}/programmes/${encodeURIComponent(gate.leadOf.programmeId)}/groups`,
          label: "Groups",
        };
  const laptops = pairs?.ask.laptops ?? false;

  return (
    // The facilitator pages' size container, at the width the shell gives
    // it, so the phone's bar and the laptop's breadcrumb switch where the
    // group page's do; the form keeps to a column inside it.
    <div className={facilitator.page}>
      <div className={`${weekly.bar} ${facilitator.phoneBar}`}>
        <div className={weekly.barStart}>
          <Link href={back.href} className={weekly.back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span>{back.label}</span>
          </Link>
        </div>
        <div className={weekly.barTitle}>{pairs ? pairsTitleWords(laptops) : `Week ${weekNumber}`}</div>
        <div className={weekly.barEnd} />
      </div>

      <div className={draw.drawPage}>
        <header className={draw.drawHead}>
          <Link href={back.href} className={`${facilitator.crumb} ${facilitator.crumbDesk}`}>
            {back.label}
          </Link>
          <p className={draw.drawEyebrow}>{groupName}</p>
          <h1 className={draw.drawTitle}>{pairs ? pairsHeadingWords(weekNumber, laptops) : `Week ${weekNumber}`}</h1>
          {pairs && <p className={draw.drawLede}>{pairsLedeWords(laptops)}</p>}
        </header>

        {pairs ? (
          <PairsEditor
            groupId={groupId}
            weekId={pairs.weekId}
            weekNumber={weekNumber}
            blockId={pairs.ask.blockId}
            laptops={laptops}
            people={people.map((person) => ({ uid: person.uid, name: person.name, firstName: person.firstName }))}
            // A week that asks nothing about laptops starts every switch off,
            // whatever a row left over from an earlier paste holds, so a save
            // never sends a laptop the route would refuse.
            initial={Object.fromEntries(people.flatMap((person) => {
              const entry = pairs.entries.get(person.uid);
              return entry ? [[person.uid, { pair: entry.pair, laptop: laptops && entry.laptop }]] : [];
            }))}
            foot={pairsFootWords(weekNumber, laptops)}
          />
        ) : (
          <p className={weekly.cardLine}>{noPairsThisWeekWords(weekNumber)}</p>
        )}
      </div>
    </div>
  );
}
