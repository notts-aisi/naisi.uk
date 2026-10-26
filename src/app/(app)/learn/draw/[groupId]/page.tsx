import Link from "next/link";
import { redirect } from "next/navigation";
import DrawEditor from "@/features/courses/packsAndCases/DrawEditor";
import styles from "@/features/courses/packsAndCases/packsAndCases.module.css";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { getSessionUser } from "@/features/courses/runAccess";
import { isAddressableId } from "@/lib/addressableId";
import { resolveGroupCalendar } from "@/lib/courses/groupResolve";
import { drawTalkOf, hasDraw } from "@/lib/courses/packsAndCases/model";
import { drawGate, readDrawPeople, readDrawState, readGroupWeek } from "@/lib/courses/packsAndCases/readers";
import {
  CASE,
  DRAW_LEDE,
  drawEyebrowWords,
  drawFootWords,
  drawHeadingWords,
  drawTitleWords,
  nothingGivenOutWords,
} from "@/lib/courses/packsAndCases/words";
import { resolveSessions, sessionRange } from "@/lib/courses/sessions";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * THE DRAW, TYPED IN (plan item 8; Q32 A; board wk-cases, option A): at the
 * end of a session a facilitator hands out next week's packs and cases on
 * paper, then copies the slips in here; swaps go through them too. One row
 * per person in the group (its people taking part and its facilitators, who
 * take part too), each with the Choose one's select ("Pathway") and the
 * case's ("Case"), whose list offers only that pathway's cases and never a
 * case with a content note. "Swap two people" swaps two rows. Save writes
 * what changed (`/api/courses/groups/[groupId]/draw`); nobody is emailed.
 *
 * WHICH WEEK: `?week=3`, or else the week of the group's next session, which
 * is the week whose slips were handed out at the end of the last one.
 *
 * WHO (`drawGate`, the route's own gate, restated because a page's only
 * protection must not be a level above it): the group's live facilitators,
 * the lead of the programme that names the run, and admins. Everybody else
 * is sent to /learn, never told whether the group exists.
 *
 * A STATIC SEGMENT UNDER /learn, not `/learn/[runId]/...`, whose layout sends
 * away a programme's lead who holds no role on the run (as the facilitator
 * material's pages are). The group page links here for its facilitators; the
 * lead opens it by its address until the programme's Groups tab links it.
 */

export const dynamic = "force-dynamic";

export default async function DrawPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const [{ groupId }, query] = await Promise.all([params, searchParams]);
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/learn/draw/${groupId}`)}`);
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
  const state = week && hasDraw(week.draw) ? await readDrawState(db, run.id, week, people) : new Map();

  const groupName = group.name.trim() || "Group";
  // A facilitator and an admin go back to the group's page; a lead to their programme's Groups.
  const back =
    gate.facilitates || gate.isAdmin || !gate.leadOf
      ? { href: `/learn/${encodeURIComponent(run.id)}/group/${encodeURIComponent(groupId)}`, label: groupName }
      : {
          href: `/admin/admissions/forms/${encodeURIComponent(gate.leadOf.roundId)}/programmes/${encodeURIComponent(gate.leadOf.programmeId)}/groups`,
          label: "Groups",
        };

  const draw = week?.draw ?? { packs: [], cases: [] };
  // A week that gives nothing out is named by its number.
  const title = hasDraw(draw) ? drawTitleWords(draw) : `Week ${weekNumber}`;

  return (
    // The page is the facilitator pages' size container, at the width the
    // shell gives it, so the phone's bar and the laptop's breadcrumb switch
    // where the group page's do; the draw itself keeps to a column inside it.
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
        <div className={weekly.barTitle}>{title}</div>
        <div className={weekly.barEnd} />
      </div>

      <div className={styles.drawPage}>
        <header className={styles.drawHead}>
          <Link href={back.href} className={`${facilitator.crumb} ${facilitator.crumbDesk}`}>
            {back.label}
          </Link>
          <p className={styles.drawEyebrow}>{drawEyebrowWords(groupName, weekNumber)}</p>
          <h1 className={styles.drawTitle}>{week && hasDraw(draw) ? drawHeadingWords(weekNumber, draw) : `Week ${weekNumber}`}</h1>
          {week && hasDraw(draw) && <p className={styles.drawLede}>{DRAW_LEDE}</p>}
        </header>

        {week && hasDraw(draw) ? (
          <DrawEditor
            groupId={groupId}
            weekId={week.weekId}
            people={people.map((person) => ({ uid: person.uid, name: person.name, firstName: person.firstName }))}
            packs={draw.packs.map((chooseOne) => ({
              id: chooseOne.id,
              title: chooseOne.title.trim() || "Pack",
              packs: chooseOne.packs.map((pack) => ({ id: pack.id, name: pack.name })),
            }))}
            talks={draw.cases.map((talk) => drawTalkOf(week.blocks, talk))}
            caseLabel={CASE}
            initial={Object.fromEntries(people.map((person) => [person.uid, state.get(person.uid) ?? { packs: {}, cases: {} }]))}
            foot={drawFootWords(weekNumber)}
            weekNumber={weekNumber}
          />
        ) : (
          <p className={weekly.cardLine}>{nothingGivenOutWords(weekNumber)}</p>
        )}
      </div>
    </div>
  );
}
