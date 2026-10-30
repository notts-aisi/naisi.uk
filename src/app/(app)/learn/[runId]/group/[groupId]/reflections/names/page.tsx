import Link from "next/link";
import { redirect } from "next/navigation";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import NamedReflections from "@/features/courses/facilitatorWeek/NamedReflections";
import named from "@/features/courses/facilitatorWeek/namedReflections.module.css";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { loadFacilitatorGroup } from "@/lib/courses/facilitatorGroup";
import { loadNamedReflections, weekOfGroup } from "@/lib/courses/facilitatorWeek/readers";
import {
  NO_REFLECTIONS,
  PICK_LINES_TO_READ_OUT,
  REFLECTIONS,
  namedReadersLine,
  readOutEyebrowWords,
  readOutTitleWords,
} from "@/lib/courses/facilitatorWeek/words";
import { resolveCalendar } from "@/lib/courses/groupResolve";
import { resolveSessions } from "@/lib/courses/sessions";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";

/**
 * A GROUP'S REFLECTIONS READ WITH NAMES, FOR ITS FACILITATORS (Zach, Fri 30
 * Oct: a group's facilitators read their own group's reflections with names;
 * the page where lines are picked to read out stays without). Reached from
 * the group page's review queue and from the page to read lines out, as
 * "Read them with names".
 *
 * THE GATE is the page to read lines out's, restated because a page's only
 * protection must not be a level above it: a live facilitator of THIS group,
 * on THIS run, or an admin. Everybody else is sent to the run's home, never
 * told whether the group exists. Nothing here writes.
 *
 * WHAT IS READ is the group's FELLOWS' reflections for the week, each under
 * its writer's whole name with when it was last written
 * (`loadNamedReflections`, drawn by `NamedReflections`, the layout the
 * programme's lead's page draws too). Never a facilitator's own reflections,
 * an admin's view of this page included: those are the programme's lead's
 * and admins' to read on the lead's page. Never a private note.
 *
 * `?week=N` opens a week of the group's own: a week it does not teach is
 * ignored, and the week it is getting ready for stands.
 */

export const dynamic = "force-dynamic";

export default async function GroupNamedReflectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string; groupId: string }>;
  searchParams?: Promise<{ week?: string | string[] }>;
}) {
  const { runId, groupId } = await params;
  const askedWeek = (await (searchParams ?? Promise.resolve({} as { week?: string | string[] }))).week;

  const access = await getRunAccess(runId);
  if (!access) {
    // Null is "no session" OR "no such run", fused in `getRunAccess`.
    const user = await getSessionUser();
    redirect(user ? "/learn" : "/login");
  }

  const runHome = `/learn/${encodeURIComponent(runId)}`;
  // Dynamic segments arrive decoded: a `/` here would make `doc()` throw.
  if (!groupId || groupId.includes("/") || groupId === "." || groupId === "..") redirect(runHome);

  const db = getAdminDb();
  if (!db) redirect(runHome);

  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  if (!groupSnap.exists) redirect(runHome);
  const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});

  // Live group only for a non-admin: the group page's own predicate.
  const facilitatesThisGroup =
    !group.archived && isNamedWithStanding(access.user, "courseGroups.facilitatorUids", group.facilitatorUids);
  if (group.runId !== runId || !(access.isAdmin || facilitatesThisGroup)) redirect(runHome);

  // ONE CLOCK for the week.
  const now = new Date();
  const taught = new Set(resolveSessions(access.run, group, resolveCalendar(access.run, group)).map((session) => session.weekNumber));
  const asked = typeof askedWeek === "string" && /^\d{1,2}$/.test(askedWeek) ? Number(askedWeek) : null;
  const weekNumber = asked !== null && taught.has(asked) ? asked : (weekOfGroup(access.run, group, now)?.weekNumber ?? null);

  const [model, programme] = await Promise.all([
    loadFacilitatorGroup(db, access.run, group, { isAdmin: access.isAdmin, actor: access.user }, now),
    runProgrammeOf(db, access.run.id),
  ]);
  const week =
    weekNumber === null
      ? null
      : await loadNamedReflections(db, {
          run: access.run,
          group,
          model,
          viewer: access.isAdmin ? "admin" : "facilitator",
          weekNumber,
          // Fellows only, whoever reads: a facilitator's own is the lead's page's.
          withOwn: false,
        });

  const groupName = group.name || "Group";
  const groupPath = `${runHome}/group/${encodeURIComponent(groupId)}`;
  const readOutPath = `${groupPath}/reflections${week ? `?week=${week.weekNumber}` : ""}`;

  return (
    <div className={`${facilitator.page} ${facilitator.registerPage}`}>
      <div className={`${weekly.bar} ${facilitator.phoneBar}`}>
        <div className={weekly.barStart}>
          <Link href={groupPath} className={weekly.back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span>{groupName}</span>
          </Link>
        </div>
        <span className={weekly.barTitle}>{REFLECTIONS}</span>
        <div className={weekly.barEnd} />
      </div>

      <header className={facilitator.wkReadHead}>
        <Link href={groupPath} className={`${facilitator.crumb} ${facilitator.crumbDesk}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          {groupName}
        </Link>
        {week && <p className={facilitator.wkReadEyebrow}>{readOutEyebrowWords(groupName, week.weekNumber)}</p>}
        <h1 className={facilitator.wkReadTitle}>{week ? readOutTitleWords({ kind: "week", weekNumber: week.weekNumber }) : REFLECTIONS}</h1>
      </header>

      <p className={named.switchLine}>
        {namedReadersLine(groupName, programme?.leadFirstName ?? null)}{" "}
        <Link href={readOutPath} className={named.switchLink}>
          {PICK_LINES_TO_READ_OUT}
        </Link>
      </p>

      {week === null ? <p className={weekly.cardLine}>{NO_REFLECTIONS}</p> : <NamedReflections prompts={week.prompts} />}
    </div>
  );
}
