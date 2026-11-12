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
import { groupWeekWorkView, readGroupWeekWork } from "@/lib/courses/groupWeekWork/load";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { coverIsLive, startedByFacilitator } from "@/lib/courses/registerCover/model";
import { sessionsWithCheckInOrReport } from "@/lib/courses/sessionChange/didNotHappen";
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
 * THE CHOSEN WEEK'S WORK (`work`, `readGroupWeekWork` then
 * `groupWeekWorkView`): who has done the week, each piece of it, who was
 * late, when each person was last reminded, and how many a Remind would
 * email, for the week asked for (`week`, the page's `?week=`) or the week
 * the page opens on. The group's fellows only, never anybody who
 * facilitates a live group of the run; a facilitator's own week, and so
 * whether it was late, only for an admin or the programme's lead. None for
 * an incubator's group, whose weeks are rows. A read of it that fails draws
 * no card rather than no page.
 *
 * EVERY READ IS ASKED AT ONCE, each waiting only for what it needs (the
 * names and the week's work wait for the group's places, the lead and the
 * card for the programme), so a visit costs the longest chain of reads, not
 * their sum. The week's card reads no subscription list and no address:
 * Remind's preview reads those when it is opened.
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
    /** The week whose work the page shows (`?week=`); the week it opens on when missing or not one of the plan's. */
    week?: number | null;
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

  // The week whose work the card shows, known before anything is read: the
  // week asked for when it is one of the plan's, else the week the page opens on.
  const openWeek = openingWeek(
    sessions.map((session) => {
      const { endsAt } = sessionInstants(session);
      return {
        weekNumber: session.weekNumber,
        dateKey: session.dateKey,
        cancelled: session.cancelled,
        ended: Boolean(endsAt && endsAt.getTime() <= now.getTime()),
      };
    }),
  );
  const workWeek =
    input.week !== undefined && input.week !== null && sessions.some((session) => session.weekNumber === input.week) ? input.week : openWeek;

  // EVERY READ AT ONCE, each waiting only for what it needs: the group's
  // places for the names and the week's work, the programme for its lead and
  // whether it is an incubator's, the registers for who covered.
  const namingRead = readNamingProgramme(db, run.id);
  // Three equalities, the order the declared (runId, groupId, status) index serves.
  const seatRead = db
    .collection("courseEnrolments")
    .where("runId", "==", run.id)
    .where("groupId", "==", group.id)
    .where("status", "==", "active")
    .get();
  const registerRead = registerRefs.length ? db.getAll(...registerRefs) : Promise.resolve([]);

  // The group's people: fellows holding a place, and its facilitators apart.
  // Admins and the programme's lead are shown every place, told or not, as
  // the Groups tab shows them; a facilitator never learns of a place Publish
  // has not told its owner about.
  const seatsRead = seatRead.then((snap) =>
    snap.docs
      .map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}))
      .filter((seat) => seat.runId === run.id && seat.groupId === group.id && seat.role === "learner")
      .filter((seat) => staff || placementIsTold(seat)),
  );
  const facilitatorSet = new Set(group.facilitatorUids);

  // Who took a register in a facilitator's place, or was given a session,
  // may be somebody outside the group: named for the page's staff only.
  const coverUidsOf = (snaps: readonly FirebaseFirestore.DocumentSnapshot[]) =>
    staff
      ? [...new Set(snaps.map((snap) => (snap?.exists ? normalizeCourseAttendance(snap.id, snap.data() ?? {}).cover?.byUid ?? "" : "")).filter(Boolean))]
      : [];
  const namesRead = Promise.all([seatsRead, registerRead]).then(([seats, snaps]) =>
    namesOf(db, [...group.facilitatorUids, ...seats.map((seat) => seat.uid), ...coverUidsOf(snaps)]),
  );

  // The chosen week's work, read beside the names it is drawn with. Not for
  // an incubator's group, whose weeks are rows with no card, on either page.
  // A read of it that fails draws no card rather than no page.
  const workRead = Promise.all([namingRead, seatsRead])
    .then(([naming, seats]) => {
      const placed = seats.filter((seat) => !facilitatorSet.has(seat.uid));
      if (workWeek === null || placed.length === 0 || naming?.kind === "incubator") return null;
      return readGroupWeekWork(db, {
        run,
        group,
        weekNumber: workWeek,
        // A facilitator's own week is read only for the programme's lead and admins.
        uids: [...seats.map((seat) => seat.uid), ...(staff ? group.facilitatorUids : [])],
        now,
      });
    })
    .catch((err: unknown) => {
      console.error("[group page] the week's work could not be read", group.id, workWeek, err);
      return null;
    });

  // Requests to be excused: one of two facts per person per session, for
  // the page's staff only (the facilitator's cut lists no people).
  const excuseRead: Promise<ExcuseFacts> = staff
    ? seatsRead.then((placed) =>
        excuseFactsForGroup(db, {
          runId: run.id,
          groupId: group.id,
          uids: new Set(placed.filter((seat) => !facilitatorSet.has(seat.uid)).map((seat) => seat.uid)),
          sessionKeys: sessions.map((session) => session.sessionKey),
        }),
      )
    : Promise.resolve<ExcuseFacts>({});

  const [naming, registerSnaps, weekSnaps, seats, audience, history, withRecords, lead, names, worked, excuseFacts] = await Promise.all([
    namingRead,
    registerRead,
    weekRefs.length ? db.getAll(...weekRefs) : Promise.resolve([]),
    seatsRead,
    updateEmailAudience(db, run, [group], "group", group.id, viewerUid, { withFacilitators: true }),
    // Rows about whether a facilitator was at a session are loaded only for
    // an admin or the programme's lead who does not facilitate the group:
    // that record is sent to nobody else.
    staff ? loadGroupHistory(db, run.id, group.id, { facilitatorRecord: !group.facilitatorUids.includes(viewerUid) }) : Promise.resolve(null),
    // Which sessions have a check-in or a session report: push back is not offered for them.
    sessionsWithCheckInOrReport(db, run.id, group.id, sessions.map((session) => session.sessionKey)),
    namingRead.then((found) => readRunLead(db, run.id, found)),
    namesRead,
    workRead,
    excuseRead,
  ]);

  const fellows = seats.filter((seat) => !facilitatorSet.has(seat.uid));
  const placedFacilitators = seats.filter((seat) => facilitatorSet.has(seat.uid));

  // A facilitator is named while they still meet the bar they were appointed behind.
  const standingFacilitators = group.facilitatorUids.filter((uid) => {
    const person = names.get(uid);
    return person && isNamedWithStanding(standingUserOf(uid, person.data), "courseGroups.facilitatorUids", group.facilitatorUids);
  });
  const nameOf = (uid: string) => names.get(uid)?.goesBy ?? "";
  const anyName = (uid: string) => names.get(uid)?.full || "NAISI member";

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
      checkInOrReport: withRecords.has(session.sessionKey),
    };
  });

  const chip = termChipOf(weeks, fellows.length, todayKey, tomorrowKey);
  // The week's card, from the reads made above and the names the page goes by.
  const work = worked
    ? groupWeekWorkView(worked, {
        viewerUid,
        people: fellows
          .map((seat) => ({
            uid: seat.uid,
            name: nameOf(seat.uid) || "NAISI member",
            firstName: names.get(seat.uid)?.first ?? "",
            told: placementIsTold(seat),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        readsOwnWork: staff,
        // A facilitator's own week is the programme's lead's and admins' alone.
        ownPeople: staff
          ? standingFacilitators
              .map((uid) => ({
                uid,
                name: names.get(uid)?.full ?? "",
                firstName: names.get(uid)?.first ?? "",
                seatedHere: placedFacilitators.some((seat) => seat.uid === uid),
              }))
              .filter((person) => person.name)
          : [],
        leadFirstName: lead?.firstName || null,
        now,
      })
    : null;
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
    openWeek,
    workWeek,
    work,
    todayKey,
    notice: { emails: audience.refused ? 0 : audience.recipients.length, refused: audience.refused },
    linkSessionKey: linkWeek?.sessionKey ?? null,
    linkWeekNumber: linkWeek?.weekNumber ?? null,
    // The people leading the programme, for who a session may be given to: staff only.
    coverLeadUids: staff ? [...new Set([...(lead ? [lead.uid] : []), ...run.trackLeadUids])] : [],
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
