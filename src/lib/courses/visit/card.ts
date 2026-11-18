import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { campusLabel } from "@/lib/courses/campus";
import { seesSessionLink } from "@/lib/courses/meetingLink/audience";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { sessionWhenLabel } from "@/lib/courses/londonLabels";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import type { SessionUser } from "@/lib/firebase/session";
import { ownGroupForWeek, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import { campusForWeek, sessionForWeek, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { sessionsWithGroup } from "../groupsByWeek";
import type { OverviewVisit } from "./view";
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
 * longer meets, or a session that is not happening, draws no card.
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
    const own = resolveSessions(run, home).find((each) => each.weekNumber === visit.weekNumber && each.occurrence === 1 && each.dateKey !== "" && !each.cancelled) ?? null;
    ahead.push({ weekNumber: visit.weekNumber, host, home, session, own, arrangedByUid: visit.arrangedByUid, arrangedAt: visit.arrangedAt });
  }
  if (ahead.length === 0) return [];

  const wanted = [...new Set(ahead.flatMap((each) => [...each.host.facilitatorUids, ...each.home.facilitatorUids, each.arrangedByUid ?? ""]))].filter(
    (uid) => uid && !uid.includes("/"),
  );
  const firstNames = new Map<string, string>();
  for (const snap of wanted.length ? await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid))) : []) {
    if (snap.exists) firstNames.set(snap.id, firstNameOfUser((snap.data() ?? {}) as Record<string, unknown>));
  }
  const firstOf = (uids: readonly string[]) => uids.filter((uid) => uid !== actor.uid).map((uid) => firstNames.get(uid) ?? "").filter(Boolean);
  const paired = sessionsWithGroup(place, (groupId) => {
    const group = live(groupId);
    return group ? resolveSessions(run, group) : null;
  });

  return ahead.map(({ weekNumber, host, home, session, own, arrangedByUid, arrangedAt }) => {
    const back = paired.find((each) => each.session.weekNumber > weekNumber && each.groupId === home.id && !each.session.cancelled && each.session.dateKey !== "") ?? null;
    const hostStart = sessionInstants(session).startsAt;
    const ownStart = own ? sessionInstants(own).startsAt : null;
    const earlier = ownStart && hostStart && ownStart.getTime() < hostStart.getTime() ? own : session;
    const earlierStart = earlier ? sessionInstants(earlier).startsAt : null;
    const until = earlier ? { dateKey: earlier.dateKey, startTimeLocal: earlier.session.startTimeLocal } : null;
    const told = [...new Set([...firstOf(home.facilitatorUids), ...firstOf(host.facilitatorUids)])];
    const ownWhen = own ? { dateKey: own.dateKey, startTimeLocal: own.session.startTimeLocal } : null;
    const arranger = arrangedByUid ? (firstNames.get(arrangedByUid) ?? "") : "";
    const link = sessionForWeek(host, session.weekId).meetingUrl;
    return {
      weekNumber,
      hostGroupId: host.id,
      hostName: host.name.trim(),
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
      meetingUrl: link && seesSessionLink({ viewer: actor, isAdmin: input.isAdmin, seat: place, group: host, sessionKey: session.sessionKey }) ? link : null,
    };
  });
}
