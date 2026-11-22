import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { heldOnline } from "@/lib/courses/joiningOnline/model";
import { londonDayLabel } from "@/lib/courses/londonLabels";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { attendanceDocId, normalizeCourseAttendance } from "@/lib/firestore/courseAttendance";
import { GROUP_FIELD_LIMITS, campusForWeek, sessionModeForWeek, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { validateSubmissionUrl, type CourseRunDoc } from "@/lib/firestore/courses";

/**
 * THE BOX AT THE TOP OF A FACILITATOR'S GROUP PAGE AND REGISTER: each
 * session still to end where somebody in the group has said they are joining
 * online ("Joining online" on their programme page), who, and whether the
 * session has a meeting link yet. Without one, the box asks for it ("2
 * people are joining online on Tue 10 Nov. Add a meeting link for week 2.");
 * with one, it says who is joining online and asks nothing.
 *
 * WHO CALLS IT has already decided its caller may read the group: the group
 * page and the register page admit a live facilitator of the group and
 * admins, and hand in the rows they show that caller, named as that caller
 * is shown people. Nobody else is a row here.
 *
 * WHO IS JOINING ONLINE: a row whose word stands on the session's register
 * (`onlineSaid`), and whose line does not say they are absent or excused:
 * somebody who has told us they can't make it is nobody's to expect online.
 * A session held online for everybody is not asked about (everybody joins
 * it online, and "Hold it online" already asks for its link), nor one
 * cancelled through "Change a session", nor a week's second session, whose
 * link no week can set apart.
 *
 * ADDRESSED READS ONLY: the sessions still to end, each by its register's
 * id, in one `getAll`. Nothing is written, and the link itself is never
 * handed back: only whether there is one.
 */

/** One session in the box. */
export type JoiningOnlineBoxSession = {
  sessionKey: string;
  weekNumber: number;
  /** "Tue 10 Nov", or "" for a session with no date. */
  day: string;
  /** Who is joining online, as the caller is shown them, in the rows' order. */
  names: string[];
  /** The session has a meeting link already: its week's own or the group's. */
  hasLink: boolean;
};

/**
 * A row of the group, as the page that calls this names it for its reader.
 * `weeks`, for a visitor from another group: the weeks they visit, the only
 * sessions they are named under. Absent for the group's own people.
 */
export type BoxPerson = { uid: string; name: string; weeks?: readonly number[] };

/**
 * THE PEOPLE THE GROUP PAGE'S BOX NAMES: the group's own people still taking
 * part, as before, and every visitor with a visit standing to the group,
 * each named only under a session of a week they visit. A visit called off
 * is gone from the place, so its visitor is named nowhere.
 */
export function boxPeopleOf(model: {
  people: readonly { uid: string; name: string; left: unknown }[];
  visitorsAhead: readonly { uid: string; name: string; weeks: readonly number[] }[];
}): BoxPerson[] {
  return [
    ...model.people.filter((person) => person.left === null).map((person) => ({ uid: person.uid, name: person.name })),
    ...model.visitorsAhead.map((visitor) => ({ uid: visitor.uid, name: visitor.name, weeks: [...visitor.weeks] })),
  ];
}

export async function joiningOnlineBox(
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc; people: readonly BoxPerson[]; now: Date },
): Promise<JoiningOnlineBoxSession[]> {
  const { run, group, people, now } = input;
  if (group.archived || people.length === 0) return [];
  const ahead = resolveSessions(run, group).filter((session) => {
    if (session.cancelled || session.occurrence !== 1) return false;
    const { endsAt } = sessionInstants(session);
    if (endsAt === null || endsAt.getTime() <= now.getTime()) return false;
    const mode = sessionModeForWeek(group, session.weekId);
    return !heldOnline({ mode, campus: campusForWeek(group, session.weekId), room: session.session.location });
  });
  if (ahead.length === 0) return [];

  const refs = ahead.map((session) =>
    db.collection("courseAttendance").doc(attendanceDocId(run.id, group.id, session.weekNumber, session.occurrence)),
  );
  const snaps = await db.getAll(...refs);
  const byId = new Map(snaps.filter((snap) => snap.exists).map((snap) => [snap.id, snap.data() ?? {}]));

  const out: JoiningOnlineBoxSession[] = [];
  for (const session of ahead) {
    const id = attendanceDocId(run.id, group.id, session.weekNumber, session.occurrence);
    const data = byId.get(id);
    if (!data) continue;
    const register = normalizeCourseAttendance(id, data);
    const names = people
      .filter((person) => {
        if (person.weeks && !person.weeks.includes(session.weekNumber)) return false;
        if (!register.onlineSaid[person.uid]) return false;
        const mark = register.records[person.uid];
        return mark !== "absent" && mark !== "excused";
      })
      .map((person) => person.name);
    if (names.length === 0) continue;
    const link = session.session.meetingUrl;
    const { startsAt } = sessionInstants(session);
    out.push({
      sessionKey: session.sessionKey,
      weekNumber: session.weekNumber,
      day: startsAt ? londonDayLabel(startsAt) : "",
      names,
      hasLink: Boolean(link) && validateSubmissionUrl(link ?? "", GROUP_FIELD_LIMITS.meetingUrl) === null,
    });
  }
  return out;
}
