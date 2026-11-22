import "server-only";
import { inGroupForWeek } from "@/lib/courses/groupsByWeek";
import { joinsLaterOf } from "@/lib/courses/staffMove/joins";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser, readNamingProgramme, readRunLead, standingUserOf } from "@/lib/courses/programmeLead";
import { displayNameOf } from "@/lib/courses/registerAccess";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { slotDays } from "@/lib/courses/sessionChange/model";
import { updateEmailAudience } from "@/lib/courses/updates/audience";
import { addDaysToKey, londonDateKey } from "@/lib/courses/weekPlan";
import { loadGroupHistory } from "@/lib/courses/groupHistory/load";
import { placesInGroup } from "@/lib/courses/groupArchive/plan";
import { registerOwed } from "@/lib/courses/groupArchive/restored";
import { readHeldSeats } from "@/lib/courses/placesAndName/held";
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
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { normalizeCourseEnrolment, ownGroupForWeek, placementIsTold, visitInWeek, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import { awayAtWords, visitingLineWords } from "@/lib/courses/visit/words";
import { weekLinkKind } from "@/lib/courses/meetingLink/plan";
import {
  campusForWeek,
  normalizeCourseGroup,
  sessionChangeForWeek,
  sessionModeForWeek,
  type CourseGroupDoc,
} from "@/lib/firestore/courseGroups";
import { weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import {
  beforeTheSessionOf,
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
  // "Before the session", on the facilitator's page: the group's next
  // session still to end, not cancelled and dated, whichever week is chosen.
  const beforeSession = staff
    ? null
    : (sessions.find((session) => {
        const { endsAt } = sessionInstants(session);
        return !session.cancelled && session.dateKey && !(endsAt && endsAt.getTime() <= now.getTime());
      }) ?? null);

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
  // Somebody from another group coming to one of its sessions for one week (a
  // one-week visit), for the page's staff (the facilitator's cut lists no
  // people) and for the week's work. BOUNDED: first one row at most, by two
  // equalities, of the History a visit TO this group leaves on the visitor's
  // own group when it is arranged (`member-visits`, its `after` naming this
  // group; every visit is arranged that way and History rows are never
  // deleted while a place is). With none, nobody ever visited this group and
  // nothing more is read; with one, the run's active places (one equality on
  // the run and one on the status). A place Publish has not told is never a
  // visitor: a visit is arranged only for a told place.
  const visitorsRead = seatRead.then(async () => {
    const hosted = await db
      .collection(COURSE_AUDIT_COLLECTION)
      .where("after.groupId", "==", group.id)
      .where("kind", "==", "member-visits")
      .limit(1)
      .get();
    if (hosted.empty) return { seats: [] as CourseEnrolmentDoc[], homes: new Map<string, CourseGroupDoc>() };
    const snap = await db.collection("courseEnrolments").where("runId", "==", run.id).where("status", "==", "active").get();
    const visitors = snap.docs
      .map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}))
      .filter((seat) => seat.runId === run.id && seat.role === "learner" && seat.groupId !== group.id && placementIsTold(seat) && (seat.visits ?? []).some((visit) => visit.groupId === group.id));
    // The groups they belong to in the weeks they visit, by address: named on their line.
    const homeIds = [...new Set(visitors.flatMap((seat) => (seat.visits ?? []).map((visit) => ownGroupForWeek(seat, visit.weekNumber) ?? "")))].filter((id) => id && !id.includes("/"));
    const homes = new Map<string, CourseGroupDoc>();
    for (const homeSnap of homeIds.length ? await db.getAll(...homeIds.map((id) => db.collection("courseGroups").doc(id))) : []) {
      if (homeSnap.exists) homes.set(homeSnap.id, normalizeCourseGroup(homeSnap.id, homeSnap.data() ?? {}));
    }
    return { seats: visitors, homes };
  });
  // The groups this group's people go to for one week, by address: named on their line ("At Group F this week").
  const awayHostsRead = seatsRead.then(async (seats) => {
    const ids = [...new Set(seats.flatMap((seat) => (seat.visits ?? []).map((visit) => visit.groupId)))].filter((id) => id && !id.includes("/"));
    const out = new Map<string, string>();
    for (const hostSnap of ids.length ? await db.getAll(...ids.map((id) => db.collection("courseGroups").doc(id))) : []) {
      if (hostSnap.exists) out.set(hostSnap.id, normalizeCourseGroup(hostSnap.id, hostSnap.data() ?? {}).name.trim());
    }
    return out;
  });
  const namesRead = Promise.all([seatsRead, registerRead, visitorsRead]).then(([seats, snaps, visitors]) =>
    namesOf(db, [
      ...group.facilitatorUids,
      ...seats.map((seat) => seat.uid),
      ...visitors.seats.map((seat) => seat.uid),
      ...[...visitors.homes.values()].flatMap((home) => home.facilitatorUids),
      ...coverUidsOf(snaps),
    ]),
  );

  // The chosen week's work, read beside the names it is drawn with. Not for
  // an incubator's group, whose weeks are rows with no card, on either page.
  // A read of it that fails draws no card rather than no page.
  const workRead = Promise.all([namingRead, seatsRead, visitorsRead])
    .then(([naming, seats, visitors]) => {
      const placed = seats.filter((seat) => !facilitatorSet.has(seat.uid));
      if (workWeek === null || placed.length === 0 || naming?.kind === "incubator") return null;
      return readGroupWeekWork(db, {
        run,
        group,
        weekNumber: workWeek,
        // A facilitator's own week is read only for the programme's lead and
        // admins. Somebody moved into the group mid-term is in its week's
        // work only from the week they joined it: the week is the group's
        // when their place belonged to it that week (`ownGroupForWeek`, the
        // card's own rule, `GroupWeekRead.belongs`).
        // A visitor to that week's session is read too, for their row: read,
        // never reminded by this group.
        uids: [
          ...seats.filter((seat) => ownGroupForWeek(seat, workWeek) === group.id).map((seat) => seat.uid),
          ...visitors.seats.filter((seat) => visitInWeek(seat, workWeek)?.groupId === group.id).map((seat) => seat.uid),
          ...(staff ? group.facilitatorUids : []),
        ],
        now,
      });
    })
    .catch((err: unknown) => {
      console.error("[group page] the week's work could not be read", group.id, workWeek, err);
      return null;
    });

  // Requests to be excused: one of two facts per person per session (what
  // the register is sent), for the page's staff about every session, and
  // for the facilitator's "Before the session" about that one session alone.
  const excuseRead: Promise<ExcuseFacts> =
    staff || beforeSession
      ? seatsRead.then((placed) =>
          excuseFactsForGroup(db, {
            runId: run.id,
            groupId: group.id,
            uids: new Set(placed.filter((seat) => !facilitatorSet.has(seat.uid)).map((seat) => seat.uid)),
            sessionKeys: staff ? sessions.map((session) => session.sessionKey) : beforeSession ? [beforeSession.sessionKey] : [],
          }),
        )
      : Promise.resolve<ExcuseFacts>({});

  // The group's places and what they can't go below, for the page's staff:
  // every place on the run whose group this is (two equalities, so no
  // declared index), counted as the Groups tab counts them
  // (`placesInGroup`), and the seats freed places hold in it
  // (`readHeldSeats`), as the places route counts both; and whether "no
  // limit" is allowed, which it never is on an open-enrolment run.
  const placesRead = staff
    ? Promise.all([
        db.collection("courseEnrolments").where("runId", "==", run.id).where("groupId", "==", group.id).get(),
        readHeldSeats(db, run.id, group.id),
      ]).then(([placeSnap, heldSeats]) => ({
        capacity: group.capacity,
        inGroup: placesInGroup({ group, places: placeSnap.docs.map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {})) }).length,
        heldSeats,
        noLimitAllowed: run.enrolMode !== "open",
      }))
    : Promise.resolve(null);

  const [naming, registerSnaps, weekSnaps, seats, audience, history, withRecords, lead, names, worked, excuseFacts, visitors, places] = await Promise.all([
    namingRead,
    registerRead,
    weekRefs.length ? db.getAll(...weekRefs) : Promise.resolve([]),
    seatsRead,
    updateEmailAudience(db, run, [group], "group", group.id, viewerUid, { withFacilitators: true }),
    // Rows about whether a facilitator was at a session are loaded only for
    // an admin or the programme's lead who does not facilitate the group:
    // that record is sent to nobody else.
    // Who approved a request to be excused is an admin's alone, here as on the register.
    staff
      ? loadGroupHistory(db, run.id, group.id, { facilitatorRecord: !group.facilitatorUids.includes(viewerUid), isAdmin: viewer === "admin" })
      : Promise.resolve(null),
    // Which sessions have a check-in or a session report: push back is not offered for them.
    sessionsWithCheckInOrReport(db, run.id, group.id, sessions.map((session) => session.sessionKey)),
    namingRead.then((found) => readRunLead(db, run.id, found)),
    namesRead,
    workRead,
    excuseRead,
    visitorsRead,
    placesRead,
  ]);
  const awayHosts = await awayHostsRead;
  const awayNameOf = (groupId: string) => awayHosts.get(groupId) || "another group";

  const fellows = seats.filter((seat) => !facilitatorSet.has(seat.uid));
  const placedFacilitators = seats.filter((seat) => facilitatorSet.has(seat.uid));

  // A facilitator is named while they still meet the bar they were appointed behind.
  const standingFacilitators = group.facilitatorUids.filter((uid) => {
    const person = names.get(uid);
    return person && isNamedWithStanding(standingUserOf(uid, person.data), "courseGroups.facilitatorUids", group.facilitatorUids);
  });
  const nameOf = (uid: string) => names.get(uid)?.goesBy ?? "";
  const anyName = (uid: string) => names.get(uid)?.full || "NAISI member";

  /**
   * One week's people and what each has said, from its register as stored:
   * the staff page's week card lists them for every week, and the
   * facilitator's "Before the session" is drawn from them for one.
   */
  const peopleOf = (session: (typeof sessions)[number], register: Record<string, unknown> | undefined): GroupPageWeek["people"] => {
    const records = (register?.records ?? {}) as Record<string, unknown>;
    const onlineUids = new Set(keysOf(register?.[ONLINE_SAID]));
    // A word in advance still stands while the line is still theirs: excused, on their word.
    const cantUids = new Set(keysOf(register?.[EXCUSED_IN_ADVANCE]).filter((uid) => records[uid] === "excused"));
    const saidOf = (uid: string): WeekSaid => (cantUids.has(uid) ? "cant" : onlineUids.has(uid) ? "online" : "coming");
    // Somebody moved into the group mid-term is one of a week's people only
    // from the week they joined it: before it they are listed as joining
    // later (`joinsLaterOf`), with no word said, in no count of who said what.
    const inWeek = (seat: CourseEnrolmentDoc) => inGroupForWeek(seat, group.id, session.weekNumber);
    // Somebody from another group at this session for one week: one of its people that week.
    const visitingIn = visitors.seats.filter((seat) => visitInWeek(seat, session.weekNumber)?.groupId === group.id);
    const visitingLine = (seat: CourseEnrolmentDoc) => {
      const home = visitors.homes.get(ownGroupForWeek(seat, session.weekNumber) ?? "") ?? null;
      return visitingLineWords({
        firstName: names.get(seat.uid)?.first || nameOf(seat.uid),
        homeName: home?.name ?? "",
        weekNumber: session.weekNumber,
        homeFacilitatorFirstNames: (home?.facilitatorUids ?? []).map((uid) => names.get(uid)?.first ?? "").filter(Boolean),
      });
    };
    return [
      ...fellows.map((seat) => {
        const joins = inWeek(seat) ? null : joinsLaterOf(seat, group.id, session.weekNumber);
        if (joins) return { uid: seat.uid, name: nameOf(seat.uid) || "NAISI member", said: "coming" as const, joins };
        // At another group's session that week: listed, with no word said, in no count.
        const away = visitInWeek(seat, session.weekNumber);
        if (away && away.groupId !== group.id) {
          return { uid: seat.uid, name: nameOf(seat.uid) || "NAISI member", said: "coming" as const, awayAt: awayNameOf(away.groupId) };
        }
        const excuse = excuseFacts[session.sessionKey]?.[seat.uid];
        return { uid: seat.uid, name: nameOf(seat.uid) || "NAISI member", said: saidOf(seat.uid), ...(excuse ? { excuse } : {}) };
      }),
      ...visitingIn.map((seat) => ({ uid: seat.uid, name: nameOf(seat.uid) || "NAISI member", said: saidOf(seat.uid), visiting: { line: visitingLine(seat) } })),
    ].sort((a, b) => a.name.localeCompare(b.name));
  };

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
    const inWeek = (seat: CourseEnrolmentDoc) => inGroupForWeek(seat, group.id, session.weekNumber);
    const visitingIn = visitors.seats.filter((seat) => visitInWeek(seat, session.weekNumber)?.groupId === group.id);
    const everyone = [...seats.filter(inWeek).map((seat) => seat.uid), ...visitingIn.map((seat) => seat.uid)];
    return {
      weekNumber: session.weekNumber,
      weekId: session.weekId,
      // Nobody is asked to take a register that is not owed (`registerOwed`).
      owed: registerOwed(group, startsAt),
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
      link: weekLinkKind(group, session.weekId),
      slotDays: slotDays(session.slotStartKey),
      // Names for the pages that draw them; the facilitator's cut draws none.
      joiningOnline: staff ? everyone.filter((uid) => onlineUids.has(uid) && !cantUids.has(uid)).map(nameOf).filter(Boolean) : [],
      cantMakeIt: staff ? everyone.filter((uid) => cantUids.has(uid)).map(nameOf).filter(Boolean) : [],
      people: staff ? peopleOf(session, register) : [],
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
        // Somebody from another group at that week's session: their row, read and never reminded here.
        visitors: visitors.seats
          .filter((seat) => workWeek !== null && visitInWeek(seat, workWeek)?.groupId === group.id)
          .map((seat) => ({ uid: seat.uid, name: nameOf(seat.uid) || "NAISI member", firstName: names.get(seat.uid)?.first ?? "" }))
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
  // "Before the session", for the facilitator: that session's people, said
  // the way the staff page's week card says them, never handed as people.
  const beforeIndex = beforeSession ? sessions.indexOf(beforeSession) : -1;
  const before =
    beforeSession && beforeIndex >= 0
      ? beforeTheSessionOf({
          weekNumber: beforeSession.weekNumber,
          dateKey: beforeSession.dateKey,
          online: sessionModeForWeek(group, beforeSession.weekId) === "virtual",
          people: peopleOf(beforeSession, registerSnaps[beforeIndex]?.exists ? (registerSnaps[beforeIndex].data() ?? {}) : undefined),
          awayWords: awayAtWords,
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
    places,
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
    before,
    coverLeadUids: staff ? [...new Set([...(lead ? [lead.uid] : []), ...run.trackLeadUids])] : [],
    history: history
      ? {
          rows: history.rows.map((row) => {
            const { headline, rest } = historyLines(row.detail);
            return { id: row.id, at: row.at, ...(row.day ? { day: row.day } : {}), actorName: row.actorName, headline, rest, category: row.category };
          }),
          more: history.more,
        }
      : null,
  };
}
