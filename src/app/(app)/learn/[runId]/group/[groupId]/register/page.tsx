import { redirect } from "next/navigation";
import RegisterPageBody, { sessionParamOf } from "@/features/courses/register/RegisterPageBody";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { gateGroupRegister, givenSessionLapsed } from "@/lib/courses/registerAccess";
import {
  DIDNT_HAPPEN_MOVED_FACILITATOR,
  GIVEN_NO_LONGER_YOURS,
  REGISTER_NOT_YOURS_TITLE,
} from "@/lib/courses/registerCover/pageWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { facilitatorGuideReader } from "@/lib/courses/facilitatorGuide/access";
import { GUIDE_READ_FAILED, guideLinksView, guideReadOfIndex, type GuideLinksView } from "@/lib/courses/facilitatorGuide/links";
import { registerGuideWeek } from "@/lib/courses/facilitatorGuide/registerWeek";
import { readGuideIndex } from "@/lib/courses/facilitatorGuide/store";
import { resolveSessions } from "@/lib/courses/sessions";

/**
 * A GROUP'S REGISTER, on a page of its own (the register
 * under a way back to its group). "Take the register" on the group page and
 * on Home, each register's "See it", and the email to somebody given one
 * session (`?session=w02`) lead here.
 *
 * The register itself is the one the group page used to hold
 * (`AttendanceGrid`): every tap saves, and the foot under it says how this
 * register ends. The page around it is `RegisterPageBody`, shared with the
 * register under the programme's group page.
 *
 * THE GATE is the register's own (`gateGroupRegister`), restated here
 * because a page's only protection must not be a level above it: a live
 * facilitator of THIS group, an admin, a run's track lead (and the
 * programme's lead, who reaches this page only when the run admits them some
 * other way: they take a register from the programme's group page), and
 * SOMEBODY GIVEN ONE SESSION, for the session the address names and while
 * the grant holds. Given that one session they see its register and nothing
 * else: no other week, no notes, no way into the group's page. A grant that
 * has ended, or an address naming another session, gets the page's ordinary
 * answer: everybody else is sent to the run's home, never told whether the
 * group exists. The register's routes re-derive the same access from the
 * same documents and are the real boundary.
 *
 * THE FACILITATOR GUIDE, above the table: the week's link ("Facilitator
 * guide for week 3", the week this register is about: `registerGuideWeek`)
 * and the guide's course page, by the session card's one rule
 * (`src/lib/courses/facilitatorGuide/links.ts`). Asked of the guide's own
 * gate (`facilitatorGuideReader`), NEVER of the register's: the register
 * admits somebody given one session and a run's track lead, whom the guide
 * refuses, and they are drawn no link and no sentence. The read runs beside
 * the register's own; one that fails draws the course page's link for the
 * group's facilitators and admins, whom the guide admits, and nothing for
 * anybody else. The programme's lead's first name, for the sentence about
 * who loads a week, is read only when a sentence is drawn.
 */

export const dynamic = "force-dynamic";

export default async function GroupRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string; groupId: string }>;
  searchParams?: Promise<{ session?: string | string[] }>;
}) {
  const { runId, groupId } = await params;
  const session = sessionParamOf((await (searchParams ?? Promise.resolve({} as { session?: string | string[] }))).session);

  const access = await getRunAccess(runId);
  if (!access) {
    const user = await getSessionUser();
    redirect(user ? "/learn" : "/login");
  }

  const runHome = `/learn/${encodeURIComponent(runId)}`;
  if (!groupId || groupId.includes("/") || groupId === "." || groupId === "..") redirect(runHome);

  const db = getAdminDb();
  if (!db) redirect(runHome);

  // The register's own gate (`gateGroupRegister`), the same predicate as
  // every route that marks the register. The group must be on THIS run.
  const gated = await gateGroupRegister(groupId, access.user, db);
  // Somebody admitted only for a session they were given: that session, by
  // its address, while the grant holds and they run things on the programme,
  // and nothing else. A grant that holds and does not stand is said so in a
  // sentence, rather than sending them away with no word.
  const onlyGiven = gated.ok && !gated.isAdmin && !gated.facilitates && !gated.leads;
  if (!gated.ok || gated.runId !== runId || (onlyGiven && (!session || !gated.givenSessions.includes(session)))) {
    if (session && (await givenSessionLapsed(db, { runId, groupId, sessionKey: session }, access.user, new Date()))) {
      return (
        <div className={facilitator.page}>
          <h1 className={weekly.title}>{REGISTER_NOT_YOURS_TITLE}</h1>
          <p className={weekly.cardLine}>{GIVEN_NO_LONGER_YOURS}</p>
        </div>
      );
    }
    redirect(runHome);
  }
  // Somebody leading the programme is drawn this page only when the run
  // admits them, as the run layout decides it (a track lead, or somebody
  // with a place): the programme's lead takes a register under the
  // programme's group page, so this page restates the layout's refusal
  // rather than lean on it.
  const runAdmits = access.canLearn || access.isReviewer || access.isTrackLead;
  if (!gated.isAdmin && !gated.facilitates && gated.leads && !runAdmits) redirect(runHome);

  // The way back, and where "It didn't happen" lives: the group's page,
  // which takes its facilitators and admins. Nobody else is given a way
  // into it from here.
  const groupPath = `${runHome}/group/${encodeURIComponent(groupId)}`;
  const opensGroupPage = gated.isAdmin || gated.facilitates;

  // The facilitator guide above the table, read beside the register's own
  // reads and never through the register's gate (see the note at the top).
  const knownReader = gated.isAdmin || gated.facilitates;
  const now = new Date();
  const guide: Promise<GuideLinksView> = (async () => {
    const reader = await facilitatorGuideReader(db, access.user, access.run.courseId);
    const read = guideReadOfIndex(reader ? await readGuideIndex(db, reader) : null);
    const weekNumber = registerGuideWeek(resolveSessions(access.run, gated.group), session, now);
    const draw = (leadFirstName: string | null) =>
      guideLinksView({ read, courseId: access.run.courseId, weekNumber, knownReader, leadFirstName });
    // Who loads the guide is said only in a sentence: the lead is read only for one.
    const first = draw(null);
    if (!first.sentence) return first;
    const programme = await runProgrammeOf(db, runId).catch(() => null);
    return draw(programme?.leadFirstName ?? null);
  })().catch((err: unknown) => {
    console.error("[register page] the facilitator guide's read failed", groupId, err);
    return guideLinksView({ read: GUIDE_READ_FAILED, courseId: access.run.courseId, weekNumber: null, knownReader, leadFirstName: null });
  });

  // Called, not mounted: the page answers with the tree the body draws.
  return RegisterPageBody({
    gated,
    user: access.user,
    run: access.run,
    backHref: opensGroupPage ? groupPath : null,
    session,
    reportHref: `${groupPath}/report`,
    didntHappen: opensGroupPage ? { href: groupPath, words: DIDNT_HAPPEN_MOVED_FACILITATOR } : null,
    guide,
  });
}
