import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { freedPlaceWindow, lastDayLabel } from "@/lib/applications/freedPlaces/rules";
import { formPlaceFactsFor } from "@/lib/applications/handover/board";
import { HAND_OVER_AUDIT_KIND } from "@/lib/applications/handover/handOver";
import { own } from "@/lib/applications/keys";
import { rowMatches } from "@/lib/applications/people/filters";
import { loadProgrammePeople } from "@/lib/applications/people/load";
import type { PeopleCounts, PersonRow } from "@/lib/applications/people/views";
import { loadForm } from "@/lib/applications/repo";
import { loadFacilitatorsModel } from "@/lib/courses/facilitatorAsks/load";
import { shortSlotWords } from "@/lib/courses/facilitatorAsks/words";
import { weeklySlotWords } from "@/lib/courses/facilitatingEmail";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { firstWeekOf, groupsGoOutDay } from "@/lib/courses/groupsGoOut";
import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import { placedOutsideTheirTimes, sessionLabelOf } from "@/lib/courses/outsideTheirTimes";
import { gaveTheirPlaceBack } from "@/lib/courses/placeGivenBack";
import { noteStandingFor } from "@/lib/courses/placementNotes/model";
import { readPlacementNotes } from "@/lib/courses/placementNotes/store";
import { placementWhere } from "@/lib/courses/placementEmail";
import type { RunRecords } from "@/lib/courses/programmeAttendance";
import { runStaffingOf } from "@/lib/courses/runStaffing";
import { isValidDateKey, londonDateKey } from "@/lib/courses/weekPlan";
import { weekOneLine } from "@/lib/courses/weekOneLine";
import { weekReadingTime } from "@/lib/courses/weekTime";
import { loadWeeksTab } from "@/lib/courses/weeksTab/load";
import { formatRunStartShort } from "@/lib/courses/window";
import { placingCounts } from "@/features/courses/allocationTally";
import type { SessionUser } from "@/lib/firebase/session";
import { firstWord } from "@/lib/firestore/applicationEmails";
import { COURSE_AUDIT_COLLECTION, normalizeCourseAudit } from "@/lib/firestore/courseAudit";
import { normalizeCourseApplication, rowIsServedTo } from "@/lib/firestore/courseApplications";
import { enrolmentIsPutBack } from "@/lib/firestore/courseEnrolments";
import { weekDocId } from "@/lib/firestore/courses";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import type { GetReadyFacts, ReadyFacilitating, ReadyGroup } from "./model";
import { readFreeReminders } from "./remind";

/**
 * EVERYTHING "GET READY FOR WEEK 1" AND PUBLISH'S READINESS CHECK READ, read
 * once for one caller (`./model.ts` works them out).
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD. Both pages that call this have
 * answered everybody else from the form already (`loadProgrammeRun`), and the
 * two readers it asks of the form's people each ask again, from the form, in
 * their own way: the People tab's (`loadProgrammePeople`) and the Facilitators
 * view's (`loadFacilitatorsModel`). It writes nothing.
 *
 * ## The run's own list, read as the allocation board reads it
 *
 * Who is in a group is `placingCounts`, over the run's own list of accepted
 * people joined with each one's seat, with the board's own test for a card in
 * the To place column (no group that still meets). Every row of that list is
 * asked `rowIsServedTo` with the caller's own standing on the run, as every
 * staff reader of the list does: a row from the application form is an
 * admin's and the lead's of the programme that names the run, and nobody
 * else's. The rows' names and replies are not read from here: names, replies
 * and when people are free are the People tab's.
 *
 * ## Read once, asked many times
 *
 * The one count is asked once for everybody holding a place, once for the
 * people holding one who have not said when they are free, and once for each
 * person (to name who Publish waits for), so nothing here counts on its own.
 *
 * ## Who is placed outside the times they gave
 *
 * Asked of `placedOutsideTheirTimes`, the one answer the board's "Not free"
 * card and Publish's plan ask, of the same facts: the run's own list, each
 * seat, and which groups each painted week covers, read through
 * `formPlaceFactsFor` (only that answer comes back, never the week). Of those
 * not told yet, who still has nothing chosen (`noteStandingFor`) is who
 * Publish waits for.
 *
 * NO ADDRESS LEAVES THIS FILE: names, days, times, rooms and counts only.
 */

export type GetReadyRead = {
  facts: GetReadyFacts;
  /** The run's course, for the run editor's address (an admin's). */
  courseId: string;
};

/** The board's four states of a seat, from a learner's row on the run (`completed` holds a seat). */
function seatState(status: string | undefined): "none" | "active" | "withdrawn" | "removed" {
  if (status === undefined) return "none";
  if (status === "withdrawn" || status === "removed") return status;
  return "active";
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date } | null;
  return typeof stamp?.toDate === "function" ? stamp.toDate() : null;
}

/**
 * The facts for the run a programme names. `records` is the run as the
 * programme's tabs read it (`readRunRecords`): its groups that still meet,
 * its learners' seats and their accounts. Null when there is no form or no
 * such programme.
 */
export async function readGetReady(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  records: RunRecords,
  now: Date,
): Promise<GetReadyRead | null> {
  const form = await loadForm(db, roundId);
  const programme = form ? own(form.programmes, programmeId) : undefined;
  if (!form || !programme) return null;
  const { run } = records;

  // The run's own list, served to the caller as the board serves it.
  const staffing = await runStaffingOf(db, actor, run);
  const [peopleOutcome, facilitatorsOutcome, listSnap, auditSnap, rawRun, weeksTab, weekOne] = await Promise.all([
    loadProgrammePeople(db, actor, roundId, programmeId),
    loadFacilitatorsModel(db, actor, roundId, programmeId, now),
    db.collection("courseApplications").where("runId", "==", run.id).get(),
    db.collection(COURSE_AUDIT_COLLECTION).where("runId", "==", run.id).get(),
    db.collection("courseRuns").doc(run.id).get(),
    loadWeeksTab(db, run.id, programme.shortName, actor),
    resolveWeekDoc(db, run.id, null, weekDocId(1)),
  ]);
  const accepted = listSnap.docs
    .map((doc) => normalizeCourseApplication(doc.id, doc.data() ?? {}))
    .filter((row) => rowIsServedTo(row, staffing))
    .filter((row) => row.status === "accepted");

  // ── The People tab's rows and counts ───────────────────────────────────────
  const peopleView = peopleOutcome.status === "ok" ? peopleOutcome.view : null;
  const people: PersonRow[] = peopleView?.rows ?? [];
  const counts: PeopleCounts = peopleView?.counts ?? {
    everyone: 0,
    coming: 0,
    "havent-said": 0,
    "not-said-free": 0,
    "gave-back": 0,
    invited: 0,
  };

  // ── Who is in a group: the one count, over the board's cards ──────────────
  const liveGroupIds = new Set(records.groups.map((group) => group.id));
  const seatOf = new Map(records.enrolments.map((seat) => [seat.uid, seat] as const));
  const cards = accepted.map((row) => {
    const seat = seatOf.get(row.uid);
    return { uid: row.uid, enrolmentStatus: seatState(seat?.status), groupId: seat?.groupId ?? null };
  });
  const inPool = (card: (typeof cards)[number]) => !card.groupId || !liveGroupIds.has(card.groupId);
  const holders = people.filter((row) => row.category === "holding");
  const placing = placingCounts(cards, inPool, { holders: holders.map((row) => row.uid), invited: counts.invited });
  const notSaid = holders.filter((row) => row.free.kind === "not-said").map((row) => row.uid);
  const toPlaceOnList = holders
    .filter((row) => {
      const one = placingCounts(cards, inPool, { holders: [row.uid], invited: 0 });
      return one.toPlace === 1 && one.notOnTheRun === 0;
    })
    .map((row) => ({ uid: row.uid, firstName: row.firstName || firstWord(row.name) }));

  // ── Who is placed outside the times they gave ──────────────────────────────
  // The board's own facts and the one answer, for everybody seated in a group
  // that still meets and still holding their place; then, of those Publish
  // has not told, what was chosen for each.
  const formPlaces = await formPlaceFactsFor(
    db,
    staffing,
    accepted.filter((row) => row.fromForm !== null),
    records.groups.map((group) => ({ id: group.id, session: group.session })),
  );
  const groupById = new Map(records.groups.map((group) => [group.id, group] as const));
  const personAt = new Map(people.map((row, at) => [row.uid, { row, at }] as const));
  const seated = accepted.flatMap((row) => {
    const seat = seatOf.get(row.uid);
    const group = seat && seat.groupId ? groupById.get(seat.groupId) : undefined;
    if (!seat || !group || seatState(seat.status) !== "active") return [];
    const place = row.fromForm !== null ? formPlaces.get(row.uid) : undefined;
    if (gaveTheirPlaceBack(place, { putBack: enrolmentIsPutBack(seat) })) return [];
    const given = {
      availability: row.availability
        .split(",")
        .map((label) => label.trim())
        .filter(Boolean),
      fromForm: place ? { availability: place.availability, canMakeGroupIds: place.canMakeGroupIds } : null,
    };
    if (!placedOutsideTheirTimes(given, { id: group.id, sessionLabel: sessionLabelOf(group.session) })) return [];
    return [{ row, group, told: Boolean(seat.allocatedEmailAt) }];
  });
  const notes = await readPlacementNotes(
    db,
    run.id,
    seated.filter((entry) => !entry.told).map((entry) => entry.row.uid),
  );
  const outside = seated
    .map(({ row, group, told }) => {
      const person = personAt.get(row.uid);
      const name = person?.row.name || row.displayName || "NAISI member";
      return {
        uid: row.uid,
        name,
        firstName: person?.row.firstName || firstWord(name),
        groupId: group.id,
        told,
        note: told ? ("told" as const) : noteStandingFor(notes.get(row.uid), group.id).state,
        order: person?.at ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "en-GB"))
    .map(({ order: _order, ...entry }) => entry);

  // ── The groups, and who facilitates them ───────────────────────────────────
  const groups: ReadyGroup[] = records.groups.map((group) => ({
    id: group.id,
    name: group.name,
    short: shortSlotWords(group.session),
    meets: weeklySlotWords(group.session),
    hasPlace: placementWhere(group.session, null) !== null,
  }));
  const facilitatorsModel = facilitatorsOutcome.ok ? facilitatorsOutcome.model : null;
  // The Facilitators view's own model; if it could not be read, each group's
  // facilitators as the run holds them, by the names rule for the caller, with
  // nothing said of any answer, so the checklist never says a group has nobody
  // when it has somebody.
  const facilitating: ReadyFacilitating[] = facilitatorsModel
    ? facilitatorsModel.groups.map((group) => ({
        groupId: group.id,
        facilitators: group.facilitators.map((person) => ({
          uid: person.uid,
          name: person.name,
          saidYes: person.chip?.tone === "yes",
        })),
        waiting: group.asks
          .filter((ask) => ask.state === "waiting")
          .map((ask) => ({ uid: ask.uid, name: ask.name, firstName: ask.firstName })),
      }))
    : records.groups.map((group) => ({
        groupId: group.id,
        facilitators: group.facilitatorUids.map((uid) => ({
          uid,
          name: nameForViewer(actor, accountNamesOf(records.accounts.get(uid) ?? {}), "NAISI member"),
          saidYes: false,
        })),
        waiting: [],
      }));

  // ── The last hand-over that put anybody on the run's list ──────────────────
  const handOvers = auditSnap.docs
    .map((doc) => normalizeCourseAudit(doc.id, doc.data() ?? {}))
    .filter((row) => row.kind === HAND_OVER_AUDIT_KIND && row.runId === run.id && row.at !== null)
    .sort((a, b) => (b.at as Date).getTime() - (a.at as Date).getTime());
  const lastHandOver = handOvers[0] ?? null;

  // ── Week 1, and the run's other weeks ──────────────────────────────────────
  const planHasWeekOne = run.weekPlan.some((entry) => entry.kind === "week" && entry.weekNumber === 1);
  const otherWeeks = (weeksTab?.weeks ?? [])
    .filter((week) => week.weekNumber !== 1)
    .map((week) => ({ weekNumber: week.weekNumber, ready: week.state === "ready" }));

  // ── Who "Remind" on the card of who has not said when they are free emails ──
  const notSaidRows = people.filter((row) => rowMatches(row, "not-said-free"));
  const reminders = await readFreeReminders(db, run.id, notSaidRows, programme.kind === "fellowship", now);

  // ── Days ───────────────────────────────────────────────────────────────────
  const todayKey = londonDateKey(now);
  const firstWeek = firstWeekOf(run);
  const window = freedPlaceWindow(form.decisionsSentAt, run, now);
  const publishedAt = toDate(rawRun.data()?.allocationPublishedAt);

  return {
    courseId: run.courseId,
    facts: {
      viewer: actor.role === "admin" ? "admin" : "lead",
      runId: run.id,
      kind: programme.kind,
      decisionsSent: form.decisionsSentAt !== null,
      places: programme.places,
      groupsGoOut: groupsGoOutDay(run.groupsGoOutOn, todayKey),
      weekOneStarts: firstWeek ? (formatRunStartShort(firstWeek.from) ?? null) : null,
      today: formatRunStartShort(todayKey) ?? "",
      runDated: isValidDateKey(run.startDate) && run.weekPlan.some((entry) => entry.kind === "week"),
      handOver: lastHandOver?.at
        ? { by: firstWord(lastHandOver.actorName), day: londonDayLabel(lastHandOver.at), clock: londonClockLabel(lastHandOver.at) }
        : null,
      groups,
      facilitating,
      outside,
      training: facilitatorsModel?.training ?? null,
      people,
      counts,
      placing: {
        holding: placing.holding,
        inAGroup: placing.inAGroup,
        notOnTheRun: placing.notOnTheRun,
        notSaidToPlace: placingCounts(cards, inPool, { holders: notSaid, invited: 0 }).toPlace,
        toPlaceOnList,
      },
      weekOne: planHasWeekOne ? weekOneLine(weekOne.week) : null,
      weekOneTime: planHasWeekOne ? weekReadingTime(weekOne.week) : null,
      otherWeeks,
      published: publishedAt ? { day: londonDayLabel(publishedAt), clock: londonClockLabel(publishedAt) } : null,
      remind: {
        firstNames: reminders.sendable.map((person) => person.firstName),
        remindedToday: reminders.remindedToday,
        told: reminders.told,
      },
      freedWindow: {
        state: window.state === "open" ? "open" : window.state === "closed" ? "closed" : "other",
        lastDay: lastDayLabel(window),
      },
    },
  };
}

