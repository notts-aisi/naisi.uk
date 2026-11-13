import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readJobSwitches } from "@/lib/courses/groupChange/facts";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { coveredWeeks } from "@/lib/courses/sessionChange/model";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { isBlockWeek, type WeekBlock } from "@/lib/courses/weekBlocks/model";
import { weekTaskNeeds, type TaskNeeds } from "@/lib/courses/weekBlocks/progress";
import { WEEK_REMINDER_DAYS, weekEmailSendAt, weekLeft, type WeekLeft } from "@/lib/courses/weekEmails/model";
import { weekDone, weekWritingNeeds, workIsClosed, type WeekDue } from "@/lib/courses/weekWork/model";
import { loadPeopleWeekFacts, loadRunWeekStates, type RunWeekStates } from "@/lib/courses/weekWork/readers";
import { facilitatingOnRunOf, liveGroupsOf } from "@/lib/courses/writtenAnswers/access";
import { resolveNoticeAudience } from "@/lib/email/courseFacilitatorEmails";
import { weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import {
  HAND_REMINDERS_COLLECTION,
  HAND_REMINDER_KIND,
  handReminderId,
  normalizeHandReminder,
} from "@/lib/firestore/courseHandReminders";
import { SCHEDULER_MARKERS_COLLECTION, weekReminderMarker } from "@/lib/firestore/schedulerMarkers";
import {
  NOTHING_DONE,
  latestReminder,
  notRemindedBecause,
  personWeekStateOf,
  remindedRecently,
  weekPiecesOf,
  type LastReminded,
  type PersonFacts,
  type WeekPiece,
} from "./model";
import {
  automaticRemindersWords,
  doneMeansWords,
  lateDetail,
  lateLineWords,
  ownWeekLine,
  pieceCellWords,
  pieceLabel,
  facilitatorRowName,
  type AutomaticReminders,
} from "./words";
import type { GroupWeekWorkView, OwnWeekRow, WorkRow } from "./view";

/**
 * THE READS BEHIND A WEEK'S CARD ON A GROUP'S PAGE, AND BEHIND REMIND, on
 * the server, each after its caller's own gate (the group's page, or the
 * Remind route). `./model.ts` decides; this file reads what it decides from:
 *
 *  - THE WEEK: the group's own copy or the run's (`resolveWeekDoc`), written
 *    as blocks and published, or nothing to say.
 *  - WHERE EVERY PERSON'S WEEK STANDS: the run's stored weeks and places
 *    (`loadRunWeekStates`, two equalities on the run), and what each person
 *    asked about did of the week (`loadPeopleWeekFacts`: equalities on the
 *    run and the week, as counts and times, never a word).
 *  - LAST REMINDED: the automatic reminders' markers (`schedulerMarkers`,
 *    by id) and the record of a reminder by hand (`courseNudges`, by id).
 *  - WHO REMIND REACHES: the notice audience of the group
 *    (`resolveNoticeAudience`: the group's told places, at their addresses,
 *    unsuppressed), held to `notRemindedBecause`.
 *
 * No new query: every read is by id or by equalities a declared index or a
 * single field already serves, and the rest is worked out here.
 */

/** This lane's voice in the shared audience derivation: Remind about a week, to one group. */
const LANE = {
  logTag: "courses remind",
  overCapAdvice: "remind people one at a time",
} as const;

/** One week of one group, read for the people asked about. */
export type GroupWeekRead = {
  weekNumber: number;
  weekId: string;
  blocks: WeekBlock[];
  tasks: TaskNeeds[];
  asks: TaskNeeds;
  pieces: WeekPiece[];
  states: RunWeekStates;
  /** The programme has closed: nothing changes in its weeks. */
  closed: boolean;
  /** Every session the group holds, in order. */
  sessions: ResolvedSession[];
  /** The week's own first session, or null when the plan does not date it. */
  session: ResolvedSession | null;
  /** When it starts, or null. */
  sessionAt: Date | null;
  facts: Map<string, PersonFacts>;
  /**
   * Everybody who facilitates a live group of the run, this one included
   * (`facilitatingOnRunOf`, which the readers of a group's week ask too).
   * Their own work is the programme's lead's and admins' alone (privacy v17,
   * "Who reads it"), wherever they hold a place: never a row of the group's,
   * and never somebody Remind reaches.
   */
  runFacilitatorUids: ReadonlySet<string>;
};

/** Why a week cannot be read for its card or reminded about. */
export type WeekNotRead = "week" | "notBlocks" | "unpublished";

/**
 * ONE WEEK OF A GROUP'S PLAN, read for some people: the week as the group
 * reads it, written as blocks and published; where each of the run's people
 * stands on it; and what each person asked about did of it.
 */
export async function readGroupWeek(
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc; weekNumber: number; uids: readonly string[]; now: Date },
): Promise<{ ok: true; read: GroupWeekRead } | { ok: false; why: WeekNotRead }> {
  const { run, group, weekNumber, now } = input;
  const sessions = resolveSessions(run, group);
  const own = sessions.find((session) => session.weekNumber === weekNumber && session.occurrence === 1) ?? null;
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || !sessions.some((session) => session.weekNumber === weekNumber)) {
    return { ok: false, why: "week" };
  }
  const weekId = weekDocId(weekNumber);
  // The week and the run's live groups are asked together: neither waits for the other.
  const [{ week }, liveGroups] = await Promise.all([resolveWeekDoc(db, run.id, group.id, weekId), liveGroupsOf(db, run.id)]);
  if (!week || !isBlockWeek(week)) return { ok: false, why: "notBlocks" };
  if (!week.published) return { ok: false, why: "unpublished" };
  const blocks = week.blocks as WeekBlock[];
  const tasks = weekTaskNeeds(blocks);
  const asks = weekWritingNeeds(blocks);
  const uids = [...new Set(input.uids.filter(Boolean))];
  const [states, facts] = await Promise.all([
    loadRunWeekStates(db, { run, liveGroups, now }),
    loadPeopleWeekFacts(db, { runId: run.id, weekNumber, blocks, uids }),
  ]);
  return {
    ok: true,
    read: {
      weekNumber,
      weekId,
      blocks,
      tasks,
      asks,
      pieces: weekPiecesOf(blocks, tasks, asks),
      states,
      closed: workIsClosed(states.closesAt, now),
      sessions,
      session: own,
      sessionAt: own ? sessionInstants(own).startsAt : null,
      facts: new Map([...facts].map(([uid, each]) => [uid, each as PersonFacts])),
      runFacilitatorUids: facilitatingOnRunOf(group, liveGroups),
    },
  };
}

/** One person's facts on the week, or nothing done. */
function factsOf(read: GroupWeekRead, uid: string): PersonFacts {
  return read.facts.get(uid) ?? NOTHING_DONE;
}

/** Whether one person's week is done, by the one meaning. */
export function isWeekDone(read: GroupWeekRead, uid: string): boolean {
  const facts = factsOf(read, uid);
  return weekDone({
    tasks: read.tasks,
    state: facts.state,
    submitted: read.states.submittedOf(uid, read.weekNumber) !== null,
    asks: read.asks,
  });
}

/** What is left of one person's week, as the automatic reminders list it. */
export function leftOf(read: GroupWeekRead, uid: string): WeekLeft {
  return weekLeft({ blocks: read.blocks, tasks: read.tasks, state: factsOf(read, uid).state });
}

// ---------------------------------------------------------------------------
// Last reminded
// ---------------------------------------------------------------------------

/** When each person was last reminded about the week, and how many each automatic reminder of its own session went to. */
export type RemindedRead = {
  last: Map<string, LastReminded | null>;
  /** The week's own session's automatic reminders: how many went, 3 days and 1 day before. */
  went: { threeDay: number; oneDay: number };
};

/**
 * WHEN EACH PERSON WAS LAST REMINDED ABOUT A WEEK: the latest of the
 * automatic reminders that went before a session covering the week (its own,
 * or the next one held after a cancelled week, which reminds about both), and
 * the latest reminder by hand, with the first name of whoever pressed. A
 * marker stamped as skipped is no reminder. By id, in one read.
 */
export async function readLastReminded(
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc; read: Pick<GroupWeekRead, "sessions" | "weekNumber" | "weekId" | "session">; uids: readonly string[] },
): Promise<RemindedRead> {
  const { run, group, read } = input;
  const uids = [...new Set(input.uids.filter(Boolean))];
  const out: RemindedRead = { last: new Map(uids.map((uid) => [uid, null])), went: { threeDay: 0, oneDay: 0 } };
  if (uids.length === 0) return out;
  const firsts = read.sessions.filter((session) => session.occurrence === 1);
  const covering = firsts.filter((session) => coveredWeeks(read.sessions, session).includes(read.weekNumber));
  type Ask = { uid: string; how: "3-day" | "1-day" | "hand"; own: boolean };
  const asks: Ask[] = [];
  const refs: FirebaseFirestore.DocumentReference[] = [];
  for (const uid of uids) {
    for (const session of covering) {
      for (const days of WEEK_REMINDER_DAYS) {
        let id: string;
        try {
          id = weekReminderMarker(group.id, session.sessionKey, uid, days).id;
        } catch {
          continue;
        }
        refs.push(db.collection(SCHEDULER_MARKERS_COLLECTION).doc(id));
        asks.push({ uid, how: days === 3 ? "3-day" : "1-day", own: session.sessionKey === read.session?.sessionKey });
      }
    }
    refs.push(db.collection(HAND_REMINDERS_COLLECTION).doc(handReminderId(run.id, uid, read.weekId)));
    asks.push({ uid, how: "hand", own: false });
  }
  const snaps = await db.getAll(...refs);
  const byUids = new Set<string>();
  const found: Array<{ uid: string; at: Date; how: Ask["how"]; byUid: string | null }> = [];
  snaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const ask = asks[index];
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    if (ask.how === "hand") {
      if (data.kind !== HAND_REMINDER_KIND) return;
      const record = normalizeHandReminder(data);
      if (!record.at || record.uid !== ask.uid) return;
      if (record.byUid) byUids.add(record.byUid);
      found.push({ uid: ask.uid, at: record.at, how: "hand", byUid: record.byUid });
      return;
    }
    const sentAt = data.sentAt as { toDate?: () => Date } | Date | undefined;
    const at = sentAt instanceof Date ? sentAt : sentAt && typeof sentAt.toDate === "function" ? sentAt.toDate() : null;
    if (!at || Number.isNaN(at.getTime())) return;
    if (ask.own) {
      if (ask.how === "3-day") out.went.threeDay += 1;
      else out.went.oneDay += 1;
    }
    found.push({ uid: ask.uid, at, how: ask.how, byUid: null });
  });
  const names = new Map<string, string>();
  if (byUids.size > 0) {
    const docs = await db.getAll(...[...byUids].map((uid) => db.collection("users").doc(uid)));
    for (const doc of docs) if (doc.exists) names.set(doc.id, firstNameOfUser((doc.data() ?? {}) as Record<string, unknown>));
  }
  for (const uid of uids) {
    out.last.set(
      uid,
      latestReminder(
        found
          .filter((each) => each.uid === uid)
          .map((each) => ({ at: each.at.toISOString(), how: each.how, byName: each.byUid ? names.get(each.byUid) || null : null })),
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Who Remind reaches
// ---------------------------------------------------------------------------

/** One person a Remind would email, with everything its email and its preview say of them. */
export type RemindPerson = {
  uid: string;
  address: string;
  /** The name the account goes by, with no placeholder: "" when none. For the greeting. */
  ownName: string;
  due: WeekDue;
  left: WeekLeft;
};

/**
 * WHO A REMIND ABOUT ONE WEEK REACHES NOW: the group's notice audience (its
 * told places at their addresses, deduped and unsuppressed), each held to
 * `notRemindedBecause` (never the presser, never anybody who facilitates a
 * live group of the run, this one or another, never somebody whose week is
 * done or who joined it late, nobody once the programme has closed),
 * narrowed to one person when asked. The preview's count and the press's
 * are this one function's. The page's button counts the same rule from its
 * rows (`remindableOf`) and reads no address: the preview says who an
 * address leaves out.
 */
export async function readRemindAudience(
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc; read: GroupWeekRead; presserUid: string; onlyUid?: string | null },
): Promise<{ people: RemindPerson[]; refusal: string | null }> {
  const { run, group, read, presserUid } = input;
  if (read.closed) return { people: [], refusal: null };
  const audience = await resolveNoticeAudience(db, run.id, LANE, { groupId: group.id });
  if (audience.refusal) return { people: [], refusal: audience.refusal };
  const people: RemindPerson[] = [];
  for (const member of audience.members) {
    if (input.onlyUid && member.uid !== input.onlyUid) continue;
    if (member.groupId !== group.id) continue;
    // The notice audience holds only places Publish has told.
    if (!remindableOf(read, { uid: member.uid, told: true, presserUid })) continue;
    const due = read.states.dueOf(member.uid, read.weekNumber);
    people.push({ uid: member.uid, address: member.address, ownName: member.ownName, due, left: leftOf(read, member.uid) });
  }
  return { people, refusal: null };
}

/**
 * Whether Remind reaches one person of the group about the week, by
 * `notRemindedBecause`, before any address is asked: the preview's audience
 * and the page's rows both ask this.
 */
export function remindableOf(read: GroupWeekRead, person: { uid: string; told: boolean; presserUid: string }): boolean {
  return (
    notRemindedBecause({
      uid: person.uid,
      presserUid: person.presserUid,
      facilitatorUids: [...read.runFacilitatorUids],
      told: person.told,
      weekDone: isWeekDone(read, person.uid),
      due: read.states.dueOf(person.uid, read.weekNumber),
      closed: read.closed,
    }) === null
  );
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

/** What the card says of the automatic reminders before this week's own session. */
function automaticOf(weekReminders: boolean, read: GroupWeekRead, went: RemindedRead["went"], now: Date): AutomaticReminders {
  if (!weekReminders) return { kind: "off" };
  const session = read.session;
  if (!session || session.cancelled || !session.dateKey || !read.sessionAt) return { kind: "undated" };
  if (read.sessionAt.getTime() <= now.getTime()) return { kind: "stopped" };
  const at = (days: number) => weekEmailSendAt(session.dateKey, days)?.toISOString() ?? null;
  return { kind: "on", threeDay: { at: at(3), went: went.threeDay }, oneDay: { at: at(1), went: went.oneDay } };
}

/** Everything one week's card is worked out from, read before the names it is drawn with. */
export type GroupWeekWorkRead = {
  read: GroupWeekRead;
  reminded: RemindedRead;
  automatic: AutomaticReminders;
};

/**
 * THE READS BEHIND ONE WEEK'S CARD, which need nothing but who holds a place
 * (`uids`, and for the programme's lead and admins the group's facilitators
 * too), so the group's page asks them beside its own reads and names. Null
 * for a week with nothing to count (not written as blocks, or not
 * published). Nothing Remind's preview alone needs is read here: no
 * subscription list and no address.
 *
 * The week and the run's live groups together, then where everybody stands
 * and what each person did together, then when each fellow was last
 * reminded beside whether the automatic reminders are switched on.
 */
export async function readGroupWeekWork(
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc; weekNumber: number; uids: readonly string[]; now: Date },
): Promise<GroupWeekWorkRead | null> {
  const { run, group, weekNumber, now } = input;
  const got = await readGroupWeek(db, { run, group, weekNumber, uids: input.uids, now });
  if (!got.ok) return null;
  const { read } = got;
  const [reminded, switches] = await Promise.all([
    // A facilitator's own week has no "Last reminded": it is no row.
    readLastReminded(db, { run, group, read, uids: input.uids.filter((uid) => !read.runFacilitatorUids.has(uid)) }),
    readJobSwitches(db).catch(() => ({ weekReminders: false, weekOpenEmail: false })),
  ]);
  return { read, reminded, automatic: automaticOf(switches.weekReminders, read, reminded.went, now) };
}

/**
 * ONE WEEK'S CARD ON A GROUP'S PAGE, as its viewer may read it, from
 * `readGroupWeekWork`'s reads. Pure.
 *
 * WHO IS IN IT: the group's fellows the page lists (`people`), less anybody
 * who facilitates a live group of the run, this one or another, whoever is
 * looking. A facilitator's own week, and so whether it was late, is read for
 * the programme's lead and admins only (`readsOwnWork`, with the group's own
 * facilitators in `ownPeople`, and anybody in `people` who facilitates
 * another group beside them) and counted in no number.
 *
 * WHO HAS A REMIND: each row Remind reaches by `remindableOf`, the rule the
 * preview's audience keeps, worked out from the rows with no address read.
 * The button's count is theirs; the preview then says who it emails.
 */
export function groupWeekWorkView(
  worked: GroupWeekWorkRead,
  input: {
    /** Who is looking: never in Remind's count. */
    viewerUid: string;
    /** The group's people holding a place, named as the page names them, and whether Publish has told them. */
    people: ReadonlyArray<{ uid: string; name: string; firstName: string; told: boolean }>;
    /** The programme's lead and admins: a facilitator's own week is theirs to read. */
    readsOwnWork: boolean;
    /**
     * The group's facilitators, for `readsOwnWork` alone. One with no place
     * in the group is listed only once they have done something of the week.
     */
    ownPeople: ReadonlyArray<{ uid: string; name: string; firstName: string; seatedHere: boolean }>;
    leadFirstName: string | null;
    now: Date;
  },
): GroupWeekWorkView {
  const { read, reminded, automatic } = worked;
  const { viewerUid, readsOwnWork, leadFirstName, now } = input;
  const weekNumber = read.weekNumber;
  const sessionStarted = Boolean(read.sessionAt && read.sessionAt.getTime() <= now.getTime());
  const fellows = input.people.filter((person) => !read.runFacilitatorUids.has(person.uid));
  // Somebody holding a place here who facilitates another group: apart, as the group's own facilitators are.
  const facilitatingElsewhere = input.people.filter((person) => read.runFacilitatorUids.has(person.uid));
  const ownPeople = readsOwnWork
    ? [
        ...input.ownPeople,
        ...facilitatingElsewhere
          .filter((person) => !input.ownPeople.some((own) => own.uid === person.uid))
          .map((person) => ({ uid: person.uid, name: person.name, firstName: person.firstName, seatedHere: true })),
      ]
    : [];

  const stateOf = (uid: string) =>
    personWeekStateOf({
      tasks: read.tasks,
      asks: read.asks,
      pieces: read.pieces,
      facts: factsOf(read, uid),
      submittedAt: read.states.submittedOf(uid, weekNumber),
      due: read.states.dueOf(uid, weekNumber),
    });

  const rows: WorkRow[] = fellows.map((person) => {
    const state = stateOf(person.uid);
    const latePieces = state.pieces.filter((piece) => piece.bucket === "done-late");
    return {
      uid: person.uid,
      name: person.name,
      firstName: person.firstName,
      week: { bucket: state.bucket, text: state.text, detail: state.detail },
      pieces: state.pieces.map((piece) => ({
        key: piece.key,
        bucket: piece.bucket,
        text: pieceCellWords(piece),
        late: lateDetail(piece.lateMs),
      })),
      lastReminded: reminded.last.get(person.uid) ?? null,
      recent: remindedRecently(reminded.last.get(person.uid) ?? null, now),
      remindable: remindableOf(read, { uid: person.uid, told: person.told, presserUid: viewerUid }),
      late:
        state.bucket === "done-late"
          ? {
              line: lateLineWords(
                latePieces.map((piece) => ({ key: piece.key, title: read.pieces.find((each) => each.key === piece.key)?.title ?? "" })),
                state.progress.doneAt,
              ),
              detail: lateDetail(state.lateMs) ?? "",
            }
          : null,
    };
  });

  const ownRows: OwnWeekRow[] = ownPeople.flatMap((person) => {
    const state = stateOf(person.uid);
    if (!person.seatedHere && !state.progress.started && !state.progress.weekDone) return [];
    return [
      {
        uid: person.uid,
        name: facilitatorRowName(person.name),
        line: ownWeekLine({ firstName: person.firstName, weekNumber, text: state.text, leadFirstName }),
        bucket: state.bucket,
        late: lateDetail(state.lateMs),
      },
    ];
  });
  // Null for anybody but the lead and admins; an empty list for them when no facilitator has a week to show.
  const own: OwnWeekRow[] | null = ownPeople.length > 0 ? ownRows : null;

  return {
    weekNumber,
    sessionStarted,
    closed: read.closed,
    pieces: read.pieces.map((piece) => ({ key: piece.key, label: pieceLabel(piece.key, piece.title), title: piece.title })),
    doneMeans: doneMeansWords(read.pieces),
    rows,
    own,
    remind: read.closed ? null : { count: rows.filter((row) => row.remindable).length },
    automatic: automaticRemindersWords(automatic),
  };
}
