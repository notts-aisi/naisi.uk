import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { campusLabel } from "@/lib/courses/campus";
import { seesSessionLink } from "@/lib/courses/meetingLink/audience";
import { firstNameOfUser, fullNameOfUser, standingUserOf } from "@/lib/courses/programmeLead";
import { sessionWhenLabel } from "@/lib/courses/londonLabels";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import type { SessionUser } from "@/lib/firebase/session";
import { attendanceDocId, normalizeCourseAttendance } from "@/lib/firestore/courseAttendance";
import { ownGroupForWeek, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import { campusForWeek, sessionForWeek, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { sessionsWithGroup } from "../groupsByWeek";
import { cancelDeadline, ownSessionThatWeek, visitRecipients } from "./plan";
import type { OverviewVisit, OverviewVisitReaders } from "./view";
import { hostReadsWeek } from "./reading";
import {
  arrangedByWords,
  cancelQuestionWords,
  cancelUntilWords,
  cancelledWords,
  hostWithWords,
  placeWords,
  stillInWords,
  visitingChipWords,
} from "./words";

export type { OverviewVisit };

/**
 * A ONE-WEEK VISIT ON THE PERSON'S OWN PROGRAMME PAGE: the card for the
 * session they go to, in the approved words (`./words.ts`), worked out on the
 * server for the overview (`GET /api/courses/runs/[runId]/overview`):
 *
 *   chip "Visiting Group I"; "Wed 11 Nov, 6pm to 8pm"; "Monica Partridge C12,
 *   University Park"; "Group I with Lucy, this week only"; "You’re still in
 *   Group C: back on Wed 18 Nov."; who arranged it; and, until the earlier of
 *   the two sessions starts, "Cancel this visit" with "You can cancel until
 *   Wed 11 Nov, 6pm. Rahul and Lucy are told.", the question asked once
 *   before it cancels and the line after.
 *
 * Only the caller's own place, and only while the session they go to has not
 * ended. The host's link for that one session travels behind the one gate
 * every link does (`seesSessionLink`, by the session's key). A host that no
 * longer meets, or a session that is not happening (called off, or its
 * register marked as not held, before it starts as after), draws no card:
 * the person's own cancel reads such a visit as none, so the card never
 * offers what the press would then refuse.
 */


/** The caller's own visits, as their card draws each. Reads the accounts it names, by address. */
export async function ownVisitsOf(
  db: Firestore,
  input: {
    run: CourseRunDoc;
    groups: readonly CourseGroupDoc[];
    place: CourseEnrolmentDoc;
    actor: SessionUser;
    isAdmin: boolean;
    now: Date;
  },
): Promise<OverviewVisit[]> {
  const { run, groups, place, actor, now } = input;
  const live = (groupId: string) => groups.find((group) => group.id === groupId && !group.archived) ?? null;
  const ahead: Array<{ weekNumber: number; host: CourseGroupDoc; home: CourseGroupDoc; session: ResolvedSession; own: ResolvedSession | null; arrangedByUid: string | null; arrangedAt: Date | null }> = [];
  for (const visit of place.visits ?? []) {
    const host = live(visit.groupId);
    const home = live(ownGroupForWeek(place, visit.weekNumber) ?? "");
    if (!host || !home) continue;
    const session = resolveSessions(run, host).find((each) => each.weekNumber === visit.weekNumber && each.occurrence === 1 && each.dateKey !== "") ?? null;
    if (!session || session.cancelled) continue;
    const { endsAt } = sessionInstants(session);
    if (endsAt && endsAt.getTime() <= now.getTime()) continue;
    const own = ownSessionThatWeek(run, home, visit.weekNumber);
    ahead.push({ weekNumber: visit.weekNumber, host, home, session, own, arrangedByUid: visit.arrangedByUid, arrangedAt: visit.arrangedAt });
  }
  if (ahead.length === 0) return [];
  // The host's register of each session, for a session marked as not held.
  const registerSnaps = await db.getAll(
    ...ahead.map((each) => db.collection("courseAttendance").doc(attendanceDocId(run.id, each.host.id, each.session.weekNumber, each.session.occurrence))),
  );
  const notHeld = new Set(
    ahead.filter((_, at) => registerSnaps[at]?.exists && normalizeCourseAttendance(registerSnaps[at].id, registerSnaps[at].data() ?? {}).held === false).map((each) => each.weekNumber),
  );
  const shown = ahead.filter((each) => !notHeld.has(each.weekNumber));
  if (shown.length === 0) return [];

  const wanted = [...new Set(shown.flatMap((each) => [...each.host.facilitatorUids, ...each.home.facilitatorUids, each.arrangedByUid ?? ""]))].filter(
    (uid) => uid && !uid.includes("/"),
  );
  const firstNames = new Map<string, string>();
  const accounts = new Map<string, Record<string, unknown>>();
  for (const snap of wanted.length ? await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid))) : []) {
    if (!snap.exists) continue;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    accounts.set(snap.id, data);
    firstNames.set(snap.id, firstNameOfUser(data));
  }
  const firstOf = (uids: readonly string[]) => uids.filter((uid) => uid !== actor.uid).map((uid) => firstNames.get(uid) ?? "").filter(Boolean);
  // "... are told": exactly the people the person's own cancel emails (`visitRecipients`), their own group's first.
  const toldOf = (host: CourseGroupDoc, home: CourseGroupDoc) => {
    const recipients = visitRecipients({ person: null, personUid: place.uid, host, home, accounts, actorUid: actor.uid });
    return [...recipients.filter((each) => each.as === "home"), ...recipients.filter((each) => each.as === "host")].map((each) => each.firstName).filter(Boolean);
  };
  const paired = sessionsWithGroup(place, (groupId) => {
    const group = live(groupId);
    return group ? resolveSessions(run, group) : null;
  });

  return shown.map(({ weekNumber, host, home, session, own, arrangedByUid, arrangedAt }) => {
    const back = paired.find((each) => each.session.weekNumber > weekNumber && each.groupId === home.id && !each.session.cancelled && each.session.dateKey !== "") ?? null;
    // The one deadline the person's own cancel is held to (`cancelDeadline`).
    const deadline = cancelDeadline({ host, hostSession: session, home, ownSession: own, arrangedAt });
    const earlier = deadline.first?.session ?? null;
    const earlierStart = deadline.until;
    const until = earlier ? { dateKey: earlier.dateKey, startTimeLocal: earlier.session.startTimeLocal } : null;
    const told = toldOf(host, home);
    const ownWhen = own ? { dateKey: own.dateKey, startTimeLocal: own.session.startTimeLocal } : null;
    const arranger = arrangedByUid ? (firstNames.get(arrangedByUid) ?? "") : "";
    const link = sessionForWeek(host, session.weekId).meetingUrl;
    return {
      weekNumber,
      hostGroupId: host.id,
      hostName: host.name.trim(),
      firstName: (deadline.first?.group ?? host).name.trim(),
      sessionKey: session.sessionKey,
      dateKey: session.dateKey,
      startTimeLocal: session.session.startTimeLocal,
      durationMinutes: session.session.durationMinutes,
      chip: visitingChipWords(host.name),
      when: sessionWhenLabel({ weekday: -1, startTimeLocal: session.session.startTimeLocal, durationMinutes: session.session.durationMinutes }, session.dateKey),
      place: placeWords(session.session.location ?? "", campusLabel(campusForWeek(host, session.weekId))),
      withLine: hostWithWords(host.name, firstOf(host.facilitatorUids)),
      stillIn: stillInWords(home.name, back ? back.session.dateKey : null),
      arrangedBy: arranger && arrangedAt ? arrangedByWords(arranger, arrangedAt) : null,
      cancel:
        until && (!earlierStart || now.getTime() < earlierStart.getTime())
          ? {
              until: cancelUntilWords(until, told),
              question: cancelQuestionWords({ hostName: host.name, hostDateKey: session.dateKey, homeName: home.name, own: ownWhen, toldFirstNames: told }),
              done: cancelledWords({ hostName: host.name, homeName: home.name, own: ownWhen }),
            }
          : null,
      hostFacilitatorFirstNames: firstOf(host.facilitatorUids),
      meetingUrl: link && seesSessionLink({ viewer: actor, isAdmin: input.isAdmin, seat: place, group: host, sessionKey: session.sessionKey }) ? link : null,
    };
  });
}

/**
 * WHO OF THE HOST MAY READ EACH VISIT WEEK OF THE CALLER'S WORK: each
 * facilitator of the host group for whom the reading rule itself says yes
 * (`hostReadsWeek`, with their own standing), for every visit that stands to
 * a group that still meets, but somebody who also facilitates the group the
 * place belongs to that week (named there already). The person's week page
 * adds them to its existing sentences about who can read their work, for
 * that week alone, by the name a sentence uses (`OverviewVisitReaders`).
 * Reads the accounts it names, by address.
 */
export async function visitReadersOf(
  db: Firestore,
  input: { groups: readonly CourseGroupDoc[]; place: CourseEnrolmentDoc },
): Promise<OverviewVisitReaders[]> {
  const liveGroups = input.groups.filter((group) => !group.archived);
  const visits = (input.place.visits ?? []).flatMap((visit) => {
    const host = liveGroups.find((group) => group.id === visit.groupId);
    const home = liveGroups.find((group) => group.id === ownGroupForWeek(input.place, visit.weekNumber)) ?? null;
    return host ? [{ weekNumber: visit.weekNumber, host, home }] : [];
  });
  const wanted = [...new Set(visits.flatMap((each) => [...each.host.facilitatorUids, ...(each.home?.facilitatorUids ?? [])]))].filter((uid) => uid && !uid.includes("/"));
  if (wanted.length === 0) return [];
  const accounts = new Map<string, Record<string, unknown>>();
  for (const snap of await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid)))) {
    if (snap.exists) accounts.set(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  }
  const firstOf = (uid: string) => firstNameOfUser(accounts.get(uid) ?? {});
  return visits.map(({ weekNumber, host, home }) => {
    const homeUids = (home?.facilitatorUids ?? []).filter((uid) => uid !== input.place.uid);
    const readers = host.facilitatorUids.filter((uid) => {
      const data = accounts.get(uid);
      return data !== undefined && !homeUids.includes(uid) && hostReadsWeek(standingUserOf(uid, data), input.place, liveGroups, weekNumber) && firstOf(uid) !== "";
    });
    // Every first name the sentence holds that week: their own group's facilitators and these readers.
    const firsts = [...homeUids.map(firstOf), ...readers.map(firstOf)].filter(Boolean);
    const shared = (first: string) => firsts.filter((each) => each === first).length > 1;
    return {
      weekNumber,
      firstNames: readers.map(firstOf),
      names: readers.map((uid) => (shared(firstOf(uid)) ? fullNameOfUser(accounts.get(uid) ?? {}) || firstOf(uid) : firstOf(uid))),
    };
  });
}
