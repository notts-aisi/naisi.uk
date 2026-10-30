import Link from "next/link";
import { redirect } from "next/navigation";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import ReadOutView from "@/features/courses/facilitatorWeek/ReadOutView";
import named from "@/features/courses/facilitatorWeek/namedReflections.module.css";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { loadFacilitatorGroup } from "@/lib/courses/facilitatorGroup";
import { loadReadOutWeek, weekOfGroup } from "@/lib/courses/facilitatorWeek/readers";
import { NO_REFLECTIONS, READ_WITH_NAMES, REFLECTIONS, readOutEyebrowWords, readOutTitleWords } from "@/lib/courses/facilitatorWeek/words";
import { resolveCalendar } from "@/lib/courses/groupResolve";
import { resolveSessions } from "@/lib/courses/sessions";
import { dayWords } from "@/lib/courses/sessionChange/words";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";

/**
 * THE PAGE WHERE A FACILITATOR PICKS REFLECTIONS TO READ OUT (boards
 * wk-reflections at 1440 and wk-reflections-phone at 390), reached from the
 * review queue's "Read them" on the group page: one week of the group, one
 * prompt at a time, everybody's answer with no name on it (Q37), lines picked
 * into "To read out tonight" and copied for the session.
 *
 * THE GATE is the group page's, restated because a page's only protection
 * must not be a level above it: a live facilitator of THIS group, on THIS
 * run, or an admin. Everybody else is sent to the run's home, never told
 * whether the group exists. Nothing here writes.
 *
 * WHAT IS READ is the group's fellows' reflections for the week, through
 * `loadReadOutWeek`, which hands words and counts, never a name, a uid or a
 * time on an answer. A facilitator's own reflections are never here: nobody
 * reads those out, and they are the programme's lead's and admins' to read
 * (the lead's page shows them, under the facilitator's name). The private
 * notes are never read out, so this page never reads them.
 *
 * The group's facilitators, the programme's lead and admins read the same
 * reflections WITH names on pages of their own (Zach, Fri 30 Oct): this page
 * links to the facilitators' one (`./names`), "Read them with names", and
 * draws no name itself.
 *
 * `?week=N` opens a week of the group's own: a week it does not teach is
 * ignored, and the week it is getting ready for stands.
 */

export const dynamic = "force-dynamic";

/** From 5pm a session is tonight's, as the ticket says. */
function evening(startTimeLocal: string): boolean {
  const hour = Number(startTimeLocal.slice(0, 2));
  return Number.isInteger(hour) && hour >= 17;
}

export default async function GroupReflectionsPage({
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

  // ONE CLOCK for the week, the heading and the counts.
  const now = new Date();
  const taught = new Set(resolveSessions(access.run, group, resolveCalendar(access.run, group)).map((session) => session.weekNumber));
  const asked = typeof askedWeek === "string" && /^\d{1,2}$/.test(askedWeek) ? Number(askedWeek) : null;
  const weekNumber = asked !== null && taught.has(asked) ? asked : (weekOfGroup(access.run, group, now)?.weekNumber ?? null);

  const model = await loadFacilitatorGroup(db, access.run, group, { isAdmin: access.isAdmin, actor: access.user }, now);
  const week =
    weekNumber === null
      ? null
      : await loadReadOutWeek(db, {
          run: access.run,
          group,
          model,
          viewer: access.isAdmin ? "admin" : "facilitator",
          weekNumber,
          now,
        });

  const groupName = group.name || "Group";
  const groupPath = `${runHome}/group/${encodeURIComponent(groupId)}`;
  const todayKey = londonDateKey(now);
  const session = week?.session ?? null;
  const today = session !== null && !session.over && session.dateKey === todayKey;
  const tonight = session !== null && today && evening(session.startTimeLocal);
  const title =
    week === null
      ? REFLECTIONS
      : readOutTitleWords(
          tonight
            ? { kind: "tonight" }
            : today
              ? { kind: "today" }
              : session && !session.over
                ? { kind: "day", day: dayWords(session.dateKey) }
                : { kind: "week", weekNumber: week.weekNumber },
        );

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
        <h1 className={facilitator.wkReadTitle}>{title}</h1>
      </header>

      {week === null ? (
        <p className={weekly.cardLine}>{NO_REFLECTIONS}</p>
      ) : (
        <>
          <ReadOutView prompts={week.prompts} tonight={tonight} readOut />
          {/* The way to the same reflections with names: a page of its own, which this one never draws. */}
          <p className={named.switchFoot}>
            <Link href={`${groupPath}/reflections/names?week=${week.weekNumber}`} className={named.switchLink}>
              {READ_WITH_NAMES}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
