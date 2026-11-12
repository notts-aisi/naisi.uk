import Link from "next/link";
import AttendanceGrid from "@/features/courses/AttendanceGrid";
import JoiningOnlineBox from "@/features/courses/facilitator/JoiningOnlineBox";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { NAMES_WHEN_GROUPS_GO_OUT } from "@/features/courses/groupNamesWords";
import { registerTitle } from "@/lib/courses/facilitatorPageWords";
import { loadRegisterMembers, type RegisterGate } from "@/lib/courses/registerAccess";
import { joiningOnlineBox } from "@/lib/courses/meetingLink/box";
import { getAdminDb } from "@/lib/firebase/admin";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseRunDoc } from "@/lib/firestore/courses";

/**
 * ONE GROUP'S REGISTER, as a page: the register's own two doors draw this,
 * the facilitator's under `/learn/[runId]/group/[groupId]/register` and the
 * one under the programme's group page for an admin and the programme's
 * lead. The page that draws it has asked its own gate first, and the
 * register's routes ask theirs again on every read and every tap.
 *
 * WHAT EACH READER IS SHOWN:
 *  - the group's facilitators and admins: the register as it always was,
 *    the box about who is joining online at the top, and the way back to the
 *    group;
 *  - the programme's lead and a run's track leads: the same register, with
 *    no notes (the grid offers no box for one), and the line saying whose
 *    place the first line takes;
 *  - SOMEBODY GIVEN ONE SESSION: that session's column only (the read sends
 *    nothing else), names only, no notes, no box about joining online, and no
 *    way into the group's page: the group's name is not a link.
 */
export default async function RegisterPageBody({
  gated,
  user,
  run,
  backHref,
  session,
  reportHref,
  didntHappen,
  requestsBase = null,
}: {
  gated: Extract<RegisterGate, { ok: true }>;
  user: SessionUser;
  run: CourseRunDoc;
  /** The way back to the group's page, or null for somebody who may not open it. */
  backHref: string | null;
  /** The session the address names (`?session=w02`), when it names one. */
  session: string | null;
  /** The session report's page for this group. */
  reportHref: string;
  /** Where "It didn't happen" lives for this reader, in words with its link, or null. */
  didntHappen: { href: string; words: string } | null;
  /** The Requests page, for a reader who decides requests and can open it; null elsewhere. */
  requestsBase?: string | null;
}) {
  const db = getAdminDb();
  const groupName = gated.group.name || "Group";
  const onlyGiven = !gated.isAdmin && !gated.facilitates && !gated.leads;
  // Before Publish has told anybody their group the register has no row and
  // draws nothing, so the page says when the names come, in the boards'
  // sentence. The rows are the register's own (`loadRegisterMembers`).
  const roster = db
    ? await loadRegisterMembers(db, gated.runId, gated.group.id, { isAdmin: gated.isAdmin })
    : { members: [], notYetTold: false };
  const namesToCome = roster.members.length === 0 && roster.notYetTold;
  // The box at the top, named as the register names its rows for this
  // reader: never for somebody given one session. Nothing is offered to press
  // in a view-as session, where nothing is written.
  const [joiningOnline, viewAs] = await Promise.all([
    db && !onlyGiven
      ? joiningOnlineBox(db, {
          run,
          group: gated.group,
          people: roster.members.map((member) => ({ uid: member.uid, name: member.displayName })),
          now: new Date(),
        }).catch(() => [])
      : Promise.resolve([]),
    getImpersonator().then((marker) => markerIsLive(marker, user.uid)),
  ]);

  return (
    <div className={`${facilitator.page} ${facilitator.registerPage}`}>
      <div className={`${weekly.bar} ${facilitator.phoneBar}`}>
        <div className={weekly.barStart}>
          {backHref ? (
            <Link href={backHref} className={weekly.back}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
                <path d="M15 6l-6 6 6 6" />
              </svg>
              <span>{groupName}</span>
            </Link>
          ) : (
            <span className={weekly.barTitle}>{groupName}</span>
          )}
        </div>
        <div className={weekly.barEnd} />
      </div>

      <header className={facilitator.registerHead}>
        {backHref ? (
          <Link href={backHref} className={`${facilitator.crumb} ${facilitator.crumbDesk}`}>
            {groupName}
          </Link>
        ) : (
          <span className={`${facilitator.crumb} ${facilitator.crumbDesk}`}>{groupName}</span>
        )}
        <h1 className={weekly.title}>{registerTitle(groupName)}</h1>
      </header>

      {/* Who is joining a session online, and the field for its link. */}
      {!onlyGiven && <JoiningOnlineBox groupId={gated.group.id} sessions={joiningOnline} canAdd={!viewAs} />}

      {namesToCome && <p className={weekly.cardLine}>{NAMES_WHEN_GROUPS_GO_OUT}</p>}

      {/* The register owns its own week controls and its own horizontal
          overflow: a wide table handles its own responsiveness rather than
          widening the shell (the `.mainWide` rule). */}
      <AttendanceGrid groupId={gated.group.id} runId={gated.runId} reportHref={reportHref} session={session} didntHappen={didntHappen} requestsBase={requestsBase} />
    </div>
  );
}

/** "w03" or "w03-2" from the address, or null. */
export function sessionParamOf(raw: string | string[] | undefined): string | null {
  return typeof raw === "string" && /^w\d{2}(?:-\d)?$/.test(raw) ? raw : null;
}
