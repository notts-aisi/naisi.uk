import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { CAMPUS_LABEL } from "@/lib/courses/campusWords";
import { placesInGroup } from "@/lib/courses/groupArchive/plan";
import { archivedWhenWords, readRestoreQuestion } from "@/lib/courses/groupArchive/restoreQuestion";
import { weekStateOf, type WeekChange } from "@/lib/courses/groupPage/model";
import { dayAndTimeWords, roomLine, weekWords } from "@/lib/courses/groupPage/words";
import { londonDayLabel } from "@/lib/courses/londonLabels";
import { programmeWeekNow } from "@/lib/courses/programmeAttendance";
import { standingUserOf } from "@/lib/courses/programmeLead";
import { FULL, NO_TIME_YET, seatsWords } from "@/features/applications/groups/peopleInGroupsWords";
import { pushedBetween, sessionBetween } from "@/lib/courses/sessionChange/model";
import { NO_SESSION_THIS_WEEK, pushedCardWords } from "@/lib/courses/sessionChange/words";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { addDaysToKey, isValidDateKey, londonDateKey } from "@/lib/courses/weekPlan";
import { isAddressableId } from "@/lib/addressableId";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { attendanceDocId, registerIsTaken } from "@/lib/firestore/courseAttendance";
import { normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import {
  compareGroupsByMeeting,
  normalizeCourseGroup,
  sessionChangeForWeek,
  sessionModeForWeek,
  type CourseGroupDoc,
} from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { accountNamesOf, nameForViewer, type NameViewer } from "@/lib/names/staffName";
import { archivedRowWords, weekCellWords } from "./words";

/**
 * ALL GROUPS, a view of a programme's Groups tab, read on the server: one row
 * per live group of the run, in the order every tab lists them
 * (`compareGroupsByMeeting`, Monday first), and the run's archived groups for
 * the foot. NOTHING IS CHANGED HERE: every name opens the group's page, where
 * everything about a group is changed.
 *
 * WHAT A ROW SAYS: the name; when it meets ("Mondays, 6pm to 8pm", or "No
 * time yet"); its room with its campus as the group's page says it
 * ("George Green C14, University Park", "Room to be confirmed, Jubilee"), or
 * none, which the page marks "No room yet"; its facilitators who still meet
 * the bar they were named behind, each as the reader may see them (the names
 * rule: staff the full name), or none, marked "No facilitator yet"; how many
 * are in it against its places as the Groups tab counts them
 * (`placesInGroup`: "8 of 8 · Full", "7 of 8"); and, while the run has dates,
 * its session in the programme's week ("Met Mon 9 Nov", "Today, 1pm",
 * "Tomorrow, 3pm", "Thu 12 Nov"), by the group's own calendar and the state
 * the group's page gives the week (`weekStateOf`).
 *
 * AN ARCHIVED GROUP: what it was ("Was Fridays, 11am to 1pm"), when and by
 * whom it was archived (the day alone, or "Archived" alone for one archived
 * before those were recorded), whether anybody is in it, and what the restore
 * question says before it is pressed (`readRestoreQuestion`, the archived
 * group's own page's reader).
 *
 * WHAT IS READ, one read serving the list: the run's groups and the run's
 * places (one equality each, so no declared index), the registers of the
 * week's sessions and the accounts the rows name (each addressed by id, in one
 * batch apiece); then, for each archived group only, what its restore
 * question says. No address, no link and no account field leaves this module:
 * the rows are words.
 *
 * WHAT IS WRITTEN: nothing.
 */

export type AllGroupsRow = {
  id: string;
  name: string;
  /** "Mondays, 6pm to 8pm", or "No time yet". */
  meets: string;
  /** "George Green C14, University Park", "Room to be confirmed, Jubilee"; null with neither a room nor a campus. */
  room: string | null;
  /** "Priya Shah", "Priya Shah, Hannah Clarke"; null with nobody facilitating. */
  facilitators: string | null;
  /** "8 of 8 · Full", "7 of 8", "7" with no limit. */
  people: string;
  /** Its session in the week the column names; null when the view has no week column. */
  week: string | null;
};

export type ArchivedGroupRow = {
  id: string;
  name: string;
  /** "Was Fridays, 11am to 1pm · Archived Mon 2 Nov by Maya Rao · Nobody in it". */
  line: string;
  /** What the restore question says: how it comes back, and who it comes back without (or ""). */
  restore: { body: string; note: string };
};

export type AllGroupsView = {
  /** The week column's heading ("Week 2", or a break's name), or null while the run has no dates. */
  week: string | null;
  rows: AllGroupsRow[];
  archived: ArchivedGroupRow[];
};

/** The programme's week, as the column names it, and its seven days. Null while the run has no dates. */
function weekShown(run: CourseRunDoc, now: Date): { label: string; fromKey: string; toKey: string } | null {
  if (!isValidDateKey(run.startDate) || run.weekPlan.length === 0) return null;
  const plan = run.weekPlan;
  // The programme's own week, asked the one way the lead's tabs ask it: its
  // first before it starts, its last after it ends.
  const current = programmeWeekNow(run, now);
  const index =
    current?.phase === "running" && current.planIndex !== null ? current.planIndex : current?.phase === "after" ? plan.length - 1 : 0;
  const entry = plan[index];
  const fromKey = addDaysToKey(run.startDate, index * 7);
  return {
    label: entry?.kind === "week" ? weekWords(entry.weekNumber) : entry?.label || "Break",
    fromKey,
    toKey: addDaysToKey(fromKey, 6),
  };
}

const nameOf = (group: CourseGroupDoc) => group.name.trim() || "Untitled group";

export async function loadAllGroups(
  db: Firestore,
  input: { run: CourseRunDoc; viewer: NameViewer; now: Date },
): Promise<AllGroupsView> {
  const { run, viewer, now } = input;
  const [groupSnap, placeSnap] = await Promise.all([
    db.collection("courseGroups").where("runId", "==", run.id).get(),
    db.collection("courseEnrolments").where("runId", "==", run.id).get(),
  ]);
  const groups = groupSnap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => group.runId === run.id);
  const places = placeSnap.docs.map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {})).filter((place) => place.runId === run.id);
  const live = groups.filter((group) => !group.archived).sort(compareGroupsByMeeting);
  const archived = groups.filter((group) => group.archived).sort(compareGroupsByMeeting);
  const inGroup = (group: CourseGroupDoc) => placesInGroup({ group, places }).length;

  // Each live group's session in the programme's week, by its own calendar.
  const week = weekShown(run, now);
  const sessions = new Map(
    live.map((group) => {
      const all = resolveSessions(run, group);
      return [group.id, { all, one: week ? sessionBetween(all, week.fromKey, week.toKey) : null }] as const;
    }),
  );
  const withSession = live.filter((group) => sessions.get(group.id)?.one);
  const registerRefs = withSession.map((group) => {
    const one = sessions.get(group.id)?.one;
    return db.collection("courseAttendance").doc(attendanceDocId(run.id, group.id, one?.weekNumber ?? 0, one?.occurrence ?? 1));
  });
  const uids = [
    ...new Set(
      [...live.flatMap((group) => group.facilitatorUids), ...archived.map((group) => group.archivedByUid ?? "")].filter((uid) => uid && isAddressableId(uid)),
    ),
  ];
  const [registerSnaps, userSnaps, questions] = await Promise.all([
    registerRefs.length ? db.getAll(...registerRefs) : Promise.resolve([]),
    uids.length ? db.getAll(...uids.map((uid) => db.collection("users").doc(uid))) : Promise.resolve([]),
    Promise.all(archived.map((group) => readRestoreQuestion(db, { group, liveGroups: live, viewer, now }))),
  ]);
  const registers = new Map(withSession.map((group, index) => [group.id, registerSnaps[index]?.exists ? (registerSnaps[index].data() ?? {}) : null] as const));
  const accounts = new Map(userSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, (snap.data() ?? {}) as Record<string, unknown>] as const));
  const named = (uid: string) => {
    const data = accounts.get(uid);
    return data ? nameForViewer(viewer, accountNamesOf(data), "") : "";
  };

  const todayKey = londonDateKey(now);
  const tomorrowKey = addDaysToKey(todayKey, 1);
  const weekCell = (group: CourseGroupDoc): string | null => {
    if (!week) return null;
    const found = sessions.get(group.id);
    const one = found?.one ?? null;
    if (!one) {
      const pushed = found ? pushedBetween(found.all, group, week.fromKey, week.toKey) : null;
      return pushed ? pushedCardWords(pushed.dateKey) : NO_SESSION_THIS_WEEK;
    }
    const register = registers.get(group.id) ?? null;
    const { startsAt } = sessionInstants(one);
    const record = sessionChangeForWeek(group, one.weekId);
    const change: WeekChange | null =
      record?.kind === "online" || record?.kind === "moved" || record?.kind === "cancelled" || record?.kind === "pushed" ? record.kind : null;
    const state = weekStateOf({
      dateKey: one.dateKey,
      started: Boolean(startsAt && startsAt.getTime() <= now.getTime()),
      taken: registerIsTaken(register),
      heldFalse: register?.held === false,
      cancelled: one.cancelled,
      change,
      online: sessionModeForWeek(group, one.weekId) === "virtual",
      todayKey,
      tomorrowKey,
    });
    return weekCellWords(state, one.dateKey, one.session.startTimeLocal);
  };

  const rows: AllGroupsRow[] = live.map((group) => {
    const campus = group.campus ? CAMPUS_LABEL[group.campus] : "";
    const room = group.session.location.trim();
    // A facilitator is named while they still meet the bar they were named behind.
    const facilitators = group.facilitatorUids
      .filter((uid) => {
        const data = accounts.get(uid);
        return data && isNamedWithStanding(standingUserOf(uid, data), "courseGroups.facilitatorUids", group.facilitatorUids);
      })
      .map(named)
      .filter(Boolean);
    const count = inGroup(group);
    const full = group.capacity !== null && count >= group.capacity;
    return {
      id: group.id,
      name: nameOf(group),
      meets: group.session.startTimeLocal ? dayAndTimeWords(group.session.weekday, group.session.startTimeLocal, group.session.durationMinutes) : NO_TIME_YET,
      room: room || campus ? roomLine(room, campus) : null,
      facilitators: facilitators.length > 0 ? facilitators.join(", ") : null,
      people: full ? `${seatsWords(count, group.capacity)} · ${FULL}` : seatsWords(count, group.capacity),
      week: weekCell(group),
    };
  });

  const archivedRows: ArchivedGroupRow[] = archived.map((group, index) => ({
    id: group.id,
    name: nameOf(group),
    line: archivedRowWords({
      was: archivedWhenWords(group),
      dayLabel: group.archivedAt ? londonDayLabel(group.archivedAt) : "",
      byName: group.archivedAt && group.archivedByUid ? named(group.archivedByUid) : "",
      inGroup: inGroup(group),
    }),
    restore: questions[index] ?? { body: "", note: "" },
  }));

  return { week: week?.label ?? null, rows, archived: archivedRows };
}
