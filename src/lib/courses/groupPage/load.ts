import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser, readNamingProgramme, readRunLead, standingUserOf } from "@/lib/courses/programmeLead";
import { displayNameOf } from "@/lib/courses/registerAccess";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { slotDays } from "@/lib/courses/sessionChange/model";
import { updateEmailAudience } from "@/lib/courses/updates/audience";
import { addDaysToKey, londonDateKey } from "@/lib/courses/weekPlan";
import { loadGroupHistory } from "@/lib/courses/groupHistory/load";
import { excuseFactsForGroup, type ExcuseFacts } from "@/lib/courses/excused/facts";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { coverIsLive, startedByFacilitator } from "@/lib/courses/registerCover/model";
import { startedAgoWords } from "@/lib/courses/registerCover/pageWords";
import {
  EXCUSED_IN_ADVANCE,
  ONLINE_SAID,
  attendanceDocId,
  normalizeCourseAttendance,
  registerIsTaken,
} from "@/lib/firestore/courseAttendance";
import { normalizeCourseEnrolment, placementIsTold } from "@/lib/firestore/courseEnrolments";
import {
  campusForWeek,
  sessionChangeForWeek,
  sessionModeForWeek,
  type CourseGroupDoc,
} from "@/lib/firestore/courseGroups";
import { weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import {
  historyLines,
  openingWeek,
  termChipOf,
  weekStateOf,
  type GroupPageView,
  type GroupPageViewer,
  type GroupPageWeek,
  type WeekChange,
} from "./model";
import { termChipWords, type WeekSaid } from "./words";

/**
 * ONE GROUP'S PAGE, read on the server: how the group meets, every week of
 * its plan with its date and state, who said what about each session, and
 * (for admins and the programme's lead) the group's people and its history.
 * Worked out from the records every other surface reads (`resolveSessions`,
 * the registers, the places), so the page cannot tell a different story
 * from the programme page or the register.
 *
 * WHO CALLS IT, AND WHAT EACH IS GIVEN:
 *  - The group's page under a programme's Groups tab, for an admin or the
 *    programme's lead, after `loadProgrammeRun` has let them through and the
 *    page has checked the group is the run's: everything here.
 *  - The facilitator's own group page, after its own gate: how the group
 *    meets and the weeks, with no people and no history (the facilitator's
 *    page already draws its people its own way).
 *
 * NAMES ONLY. No address, no account field, no meeting link: whether a week
 * has a link is a yes or no. The counts on the buttons that email are the
 * send's own (`updateEmailAudience` with the group's facilitators), never
 * the viewer.
 */

/** People's names by uid: the whole name for staff lists, the first name for a week's "with Rahul". */
async function namesOf(
  db: Firestore,
  uids: readonly string[],
): Promise<Map<string, { full: string; goesBy: string; first: string; data: Record<string, unknown> }>> {
  const unique = [...new Set(uids.filter(Boolean))];
  const out = new Map<string, { full: string; goesBy: string; first: string; data: Record<string, unknown> }>();
  if (unique.length === 0) return out;
  const docs = await db.getAll(...unique.map((uid) => db.collection("users").doc(uid)));
  for (const doc of docs) {
    if (!doc.exists) continue;
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const display = typeof data.displayName === "string" ? data.displayName.trim() : "";
    out.set(doc.id, { full: display || displayNameOf(data), goesBy: displayNameOf(data), first: firstNameOfUser(data), data });
  }
  return out;
}

/** The keys of a map on a register, or none. */
function keysOf(value: unknown): string[] {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value as object) : [];
}

export async function loadGroupPage(
  db: Firestore,
  input: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    viewer: GroupPageViewer;
    /** Who is looking: never counted among who a notice reaches. */
    viewerUid: string;
    now: Date;
  },
): Promise<GroupPageView> {
  const { run, group, viewer, viewerUid, now } = input;
  const staff = viewer !== "facilitator";
  const todayKey = londonDateKey(now);
  const tomorrowKey = addDaysToKey(todayKey, 1);
  const groupName = group.name.trim() || "Untitled group";

  // Each taught week's first session, in the group's plan order.
  const sessions = resolveSessions(run, group).filter((session) => session.occurrence === 1);
  const registerRefs = sessions.map((session) =>
    db.collection("courseAttendance").doc(attendanceDocId(run.id, group.id, session.weekNumber, 1)),
  );
  const weekRefs = sessions.map((session) => db.collection("courseRuns").doc(run.id).collection("weeks").doc(weekDocId(session.weekNumber)));

  const [naming, registerSnaps, weekSnaps, seatSnap, audience, history] = await Promise.all([
    readNamingProgramme(db, run.id),
    registerRefs.length ? db.getAll(...registerRefs) : Promise.resolve([]),
    weekRefs.length ? db.getAll(...weekRefs) : Promise.resolve([]),
    // Three equalities, the order the declared (runId, groupId, status) index serves.
    db
      .collection("courseEnrolments")
      .where("runId", "==", run.id)
      .where("groupId", "==", group.id)
      .where("status", "==", "active")
      .get(),
    updateEmailAudience(db, run, [group], "group", group.id, viewerUid, { withFacilitators: true }),
    // Rows about whether a facilitator was at a session are loaded only for
    // an admin or the programme's lead who does not facilitate the group:
    // that record is sent to nobody else.
    staff ? loadGroupHistory(db, run.id, group.id, { facilitatorRecord: !group.facilitatorUids.includes(viewerUid) }) : Promise.resolve(null),
  ]);
  const lead = await readRunLead(db, run.id, naming);

  // The group's people: fellows holding a place, and its facilitators apart.
  // Admins and the programme's lead are shown every place, told or not, as
  // the Groups tab shows them; a facilitator never learns of a place Publish
  // has not told its owner about.
  const seats = seatSnap.docs
    .map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}))
    .filter((seat) => seat.runId === run.id && seat.groupId === group.id && seat.role === "learner")
    .filter((seat) => staff || placementIsTold(seat));
  const facilitatorSet = new Set(group.facilitatorUids);
  const fellows = seats.filter((seat) => !facilitatorSet.has(seat.uid));
  const placedFacilitators = seats.filter((seat) => facilitatorSet.has(seat.uid));

  const names = await namesOf(db, [...group.facilitatorUids, ...seats.map((seat) => seat.uid)]);
  // A facilitator is named while they still meet the bar they were appointed behind.
  const standingFacilitators = group.facilitatorUids.filter((uid) => {
    const person = names.get(uid);
    return person && isNamedWithStanding(standingUserOf(uid, person.data), "courseGroups.facilitatorUids", group.facilitatorUids);
  });
  const nameOf = (uid: string) => names.get(uid)?.goesBy ?? "";
  // Who took a register in a facilitator's place, or was given a session,
  // may be anybody with an account: named for the page's staff only.
  const coverUids = staff
    ? [...new Set(registerSnaps.map((snap) => (snap?.exists ? normalizeCourseAttendance(snap.id, snap.data() ?? {}).cover?.byUid ?? "" : "")).filter(Boolean))]
    : [];
  const [coverNames, excuseFacts] = await Promise.all([
    namesOf(db, coverUids.filter((uid) => !names.has(uid))),
    // Requests to be excused: one of two facts per person per session, for
    // the page's staff only (the facilitator's cut lists no people).
    staff
      ? excuseFactsForGroup(db, {
          runId: run.id,
          groupId: group.id,
          uids: new Set(fellows.map((seat) => seat.uid)),
          sessionKeys: sessions.map((session) => session.sessionKey),
        })
      : Promise.resolve<ExcuseFacts>({}),
  ]);
  const anyName = (uid: string) => names.get(uid)?.full || coverNames.get(uid)?.full || "NAISI member";

  const weeks: GroupPageWeek[] = sessions.map((session, index) => {
    const register = registerSnaps[index]?.exists ? (registerSnaps[index].data() ?? {}) : undefined;
    const stored = register ? normalizeCourseAttendance(registerSnaps[index].id, register) : null;
    const title = weekSnaps[index]?.exists ? String(weekSnaps[index].data()?.title ?? "").trim() : "";
    const { startsAt, endsAt } = sessionInstants(session);
    const started = Boolean(startsAt && startsAt.getTime() <= now.getTime());
    const ended = Boolean(endsAt && endsAt.getTime() <= now.getTime());
    const taken = registerIsTaken(register);
    const record = sessionChangeForWeek(group, session.weekId);
    const change: WeekChange | null =
      record?.kind === "online" || record?.kind === "moved" || record?.kind === "cancelled" || record?.kind === "pushed"
        ? record.kind
        : null;
    const online = sessionModeForWeek(group, session.weekId) === "virtual";
    const records = (register?.records ?? {}) as Record<string, unknown>;
    const onlineUids = new Set(keysOf(register?.[ONLINE_SAID]));
    // A word in advance still stands while the line is still theirs: excused, on their word.
    const cantUids = new Set(keysOf(register?.[EXCUSED_IN_ADVANCE]).filter((uid) => records[uid] === "excused"));
    const saidOf = (uid: string): WeekSaid => (cantUids.has(uid) ? "cant" : onlineUids.has(uid) ? "online" : "coming");
    const everyone = [...seats.map((seat) => seat.uid)];
    return {
      weekNumber: session.weekNumber,
      weekId: session.weekId,
      sessionKey: session.sessionKey,
      title,
      dateKey: session.dateKey,
      hhmm: session.session.startTimeLocal,
      minutes: session.session.durationMinutes,
      room: session.session.location.trim(),
      campus: campusForWeek(group, session.weekId),
      online,
      cancelled: session.cancelled,
      change,
      state: weekStateOf({
        dateKey: session.dateKey,
        started,
        taken,
        heldFalse: register?.held === false,
        cancelled: session.cancelled,
        change,
        online,
        todayKey,
        tomorrowKey,
      }),
      started,
      ended,
      taken,
      hasLink: Boolean(session.session.meetingUrl),
      slotDays: slotDays(session.slotStartKey),
      // Names for the pages that draw them; the facilitator's cut draws none.
      joiningOnline: staff ? everyone.filter((uid) => onlineUids.has(uid) && !cantUids.has(uid)).map(nameOf).filter(Boolean) : [],
      cantMakeIt: staff ? everyone.filter((uid) => cantUids.has(uid)).map(nameOf).filter(Boolean) : [],
      people: staff
        ? fellows
            .map((seat) => {
              const excuse = excuseFacts[session.sessionKey]?.[seat.uid];
              return { uid: seat.uid, name: nameOf(seat.uid) || "NAISI member", said: saidOf(seat.uid), ...(excuse ? { excuse } : {}) };
            })
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
      finished: Boolean(stored?.pushedAt),
      heldFalse: register?.held === false,
      facilitatorStarted: startedByFacilitator(stored, group.facilitatorUids),
      cover:
        staff && stored?.cover
          ? { kind: stored.cover.kind, byName: anyName(stored.cover.byUid), live: coverIsLive(stored.cover, now) }
          : null,
      startedAgo: started && startsAt ? startedAgoWords(startsAt, now) : "",
    };
  });

  const chip = termChipOf(weeks, fellows.length, todayKey, tomorrowKey);
  // "Set the link" for every week saves on the next session still to end, as the link route asks.
  const linkWeek = weeks.find((week) => !week.ended && !week.cancelled && week.dateKey) ?? null;

  return {
    viewer,
    runId: run.id,
    groupId: group.id,
    groupName,
    programmeName: (naming?.shortName ?? "").trim() || run.courseTitle,
    incubator: naming?.kind === "incubator",
    chip: chip ? termChipWords(chip) : null,
    facilitatorNames: standingFacilitators.map((uid) => names.get(uid)?.full ?? "").filter(Boolean),
    facilitatorFirstNames: standingFacilitators.map((uid) => names.get(uid)?.first ?? "").filter(Boolean),
    peopleCount: fellows.length,
    facilitatorsWithPlaces: staff ? placedFacilitators.map((seat) => nameOf(seat.uid)).filter(Boolean) : [],
    meets: {
      weekday: group.session.weekday,
      hhmm: group.session.startTimeLocal,
      minutes: group.session.durationMinutes,
      room: group.session.location.trim(),
      campus: group.campus,
      hasLink: Boolean(group.session.meetingUrl),
    },
    canChangeRegular: staff,
    leadFirstName: lead?.firstName || null,
    weeks,
    openWeek: openingWeek(weeks),
    todayKey,
    notice: { emails: audience.refused ? 0 : audience.recipients.length, refused: audience.refused },
    linkSessionKey: linkWeek?.sessionKey ?? null,
    linkWeekNumber: linkWeek?.weekNumber ?? null,
    history: history
      ? {
          rows: history.rows.map((row) => {
            const { headline, rest } = historyLines(row.detail);
            return { id: row.id, at: row.at, actorName: row.actorName, headline, rest, category: row.category };
          }),
          more: history.more,
        }
      : null,
  };
}
