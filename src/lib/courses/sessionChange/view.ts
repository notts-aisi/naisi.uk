import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { roomOrCampus } from "@/lib/courses/campus";
import { readRunLead, standingUserOf, firstNameOfUser } from "@/lib/courses/programmeLead";
import { displayNameOf } from "@/lib/courses/registerAccess";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { updateAudienceCounts } from "@/lib/courses/updates/audience";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { sessionChangeForWeek, sessionModeForWeek, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { keepPaceOutcome, pushBackOutcome, slotDays } from "./model";
import {
  SESSION_STARTED,
  cardWeekWords,
  changeSubtitle,
  changeTitle,
  clockWords,
  dayWords,
  keepPaceHint,
  namesWords,
  noLinkHint,
  onlineHint,
  pushHint,
  restoreHint,
  sessionWhenWords,
  slotLine,
  slotWords,
  tellLine,
  whoCanLine,
} from "./words";

/**
 * WHAT A GROUP'S OWN SESSIONS PAGE DRAWS (its facilitators' list of
 * sessions from today, each with "Change a session"), and every fact the change dialog needs, worked out on the server from records:
 * the group's own sessions (`resolveSessions`), its facilitators' names, who
 * leads the programme, who an update to the group reaches (counted by the
 * function the update's own press counts with), and what each kind of cancel
 * would make true.
 *
 * Nothing about anybody but names reaches the page: no address, no account
 * field. The dialog's counts are numbers; its "who can change a session" line
 * is first names.
 */

/** One option of the dialog's Day. */
export type DayOption = { dateKey: string; label: string };

/** Everything the change dialog draws for one session, from records. */
export type DialogFacts = {
  runId: string;
  groupId: string;
  groupName: string;
  weekNumber: number;
  /** The session's date now: what the press names, and what the route checks. */
  dateKey: string;
  /** "Change Group B’s week 4 session". */
  title: string;
  /** "Tue 24 Nov · 6pm · [Room] · Rahul and Sofia". */
  subtitle: string;
  /** What is in force for the week now, if "Change a session" changed it. */
  current: "online" | "moved" | "cancelled" | null;
  online: { available: boolean; hint: string };
  move: { days: DayOption[]; dayKey: string; time: string; room: string };
  keepPace: { hint: string };
  push: { available: boolean; hint: string };
  /** Offered only when the week has an arrangement of its own to put back. */
  restore: { hint: string } | null;
  /** Who "Tell the group" reaches: the people the update is to, and the emails it sends. */
  tell: { people: number; emails: number; refused: boolean; line: string };
  /** "Rahul, Sofia, Claudia and admins can change a session." */
  whoCan: string;
};

/** One card of the view: a group's session in the week shown, or one session of a group. */
export type SessionCardView = {
  key: string;
  /** "Group B", or "Week 4" on a group's own page. */
  heading: string;
  /** "Tuesdays 6pm · [Room]". */
  sub: string;
  /** The facilitators, for the chips beside their names. */
  people: { uid: string; name: string }[];
  /** "Rahul Mehta and Sofia Rossi". */
  peopleLine: string;
  /** "Week 4", above the session. Empty when there is none. */
  eyebrow: string;
  /** "Today, 6pm", "Tue 24 Nov, 6pm". Empty when there is none. */
  when: string;
  /** The room a moved session moved to. */
  where: string;
  state: "online" | "moved" | "cancelled" | null;
  /** A line instead of a session: none this week, cancelled and pushed, started. */
  note: string | null;
  /** The dialog's facts, when the session can be changed. */
  dialog: DialogFacts | null;
};

/**
 * The account's whole name, then the name they go by: a card names a
 * group's facilitators in full ("Rahul Mehta and Sofia Rossi"), as the
 * Facilitators view does. Never an address.
 */
function fullNameOf(data: Record<string, unknown>): string {
  const display = typeof data.displayName === "string" ? data.displayName.trim() : "";
  return display || displayNameOf(data);
}

/** People's whole names and first names, by uid, for the accounts given. */
async function namesOf(
  db: Firestore,
  uids: readonly string[],
): Promise<Map<string, { name: string; first: string; data: Record<string, unknown> }>> {
  const unique = [...new Set(uids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const docs = await db.getAll(...unique.map((uid) => db.collection("users").doc(uid)));
  const out = new Map<string, { name: string; first: string; data: Record<string, unknown> }>();
  for (const doc of docs) {
    if (!doc.exists) continue;
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    out.set(doc.id, { name: fullNameOf(data), first: firstNameOfUser(data), data });
  }
  return out;
}

/** What a run's groups need beside their sessions: names, the lead, the counts. */
type Context = {
  run: CourseRunDoc;
  names: Awaited<ReturnType<typeof namesOf>>;
  leadFirst: string;
  trackLeadFirsts: string[];
  counts: Map<string, { people: number; emails: number; members: number; refused: boolean }>;
  now: Date;
  todayKey: string;
};

async function contextFor(
  db: Firestore,
  run: CourseRunDoc,
  groups: readonly CourseGroupDoc[],
  now: Date,
  viewerUid: string | null,
): Promise<Context> {
  const trackLeadUids = Array.isArray(run.trackLeadUids) ? run.trackLeadUids.filter((uid) => typeof uid === "string") : [];
  const only = { groupIds: groups.map((group) => group.id) };
  const [names, lead, counted, members] = await Promise.all([
    namesOf(db, [...groups.flatMap((group) => group.facilitatorUids), ...trackLeadUids]),
    readRunLead(db, run.id),
    // A change's update is emailed to the group's facilitators too: every
    // email it sends, and, apart, how many of them are the group's people.
    groups.length ? updateAudienceCounts(db, run, groups, only, viewerUid, { withFacilitators: true }) : Promise.resolve([]),
    groups.length ? updateAudienceCounts(db, run, groups, only, viewerUid) : Promise.resolve([]),
  ]);
  const membersOf = new Map(members.map((count) => [count.groupId, count.emails] as const));
  const counts = new Map<string, { people: number; emails: number; members: number; refused: boolean }>();
  for (const count of counted) {
    if (count.groupId) {
      counts.set(count.groupId, {
        people: count.people,
        emails: count.emails,
        members: membersOf.get(count.groupId) ?? count.emails,
        refused: count.refused,
      });
    }
  }
  // A track lead counts as somebody who can change a session only while they
  // still meet the bar they were named behind.
  const trackLeadFirsts = trackLeadUids
    .filter((uid) => {
      const person = names.get(uid);
      return person && isNamedWithStanding(standingUserOf(uid, person.data), "courseRuns.trackLeadUids", trackLeadUids);
    })
    .map((uid) => names.get(uid)?.first ?? "")
    .filter(Boolean);
  return {
    run,
    names,
    leadFirst: lead?.firstName ?? "",
    trackLeadFirsts,
    counts,
    now,
    todayKey: londonDateKey(now),
  };
}

/** The group's facilitators who can change its sessions: live, and still meeting the bar. */
function standingFacilitators(group: CourseGroupDoc, context: Context): { uid: string; name: string; first: string }[] {
  const out: { uid: string; name: string; first: string }[] = [];
  for (const uid of group.facilitatorUids) {
    const person = context.names.get(uid);
    if (!person) continue;
    if (!isNamedWithStanding(standingUserOf(uid, person.data), "courseGroups.facilitatorUids", group.facilitatorUids)) {
      continue;
    }
    out.push({ uid, name: person.name, first: person.first });
  }
  return out;
}

const groupNameOf = (group: CourseGroupDoc) => group.name.trim() || "Untitled group";

/** What is in force for a session's week, as the cards and the dialog name it. */
function stateOf(group: CourseGroupDoc, session: ResolvedSession): SessionCardView["state"] {
  if (session.cancelled) return "cancelled";
  if (sessionModeForWeek(group, session.weekId) === "virtual") return "online";
  const change = sessionChangeForWeek(group, session.weekId);
  if (change?.kind === "moved") return "moved";
  return null;
}

/** The dialog's facts for one session of one group, or null when it cannot be changed. */
function dialogFor(group: CourseGroupDoc, session: ResolvedSession, context: Context): DialogFacts | null {
  const { startsAt } = sessionInstants(session);
  if (!session.dateKey || !startsAt || startsAt.getTime() <= context.now.getTime()) return null;
  const { run } = context;
  const name = groupNameOf(group);
  const facilitators = standingFacilitators(group, context);
  const current = stateOf(group, session);
  const keepPace = keepPaceOutcome(run, group, session.weekNumber);
  const pushed = pushBackOutcome(run, group, session.weekNumber);
  const counted = context.counts.get(group.id) ?? { people: 0, emails: 0, members: 0, refused: false };
  const count = { people: counted.people, emails: counted.emails, refused: counted.refused };
  const mode = sessionModeForWeek(group, session.weekId);
  const where = mode === "virtual" ? "Online" : session.session.location;
  const days = slotDays(session.slotStartKey)
    .filter((dateKey) => dateKey >= context.todayKey)
    .map((dateKey) => ({ dateKey, label: dayWords(dateKey) }));
  const change = sessionChangeForWeek(group, session.weekId);
  const standing = slotWords(group.session.weekday, group.session.startTimeLocal);
  return {
    runId: run.id,
    groupId: group.id,
    groupName: name,
    weekNumber: session.weekNumber,
    dateKey: session.dateKey,
    title: changeTitle(name, session.weekNumber),
    subtitle: changeSubtitle({
      dateKey: session.dateKey,
      hhmm: session.session.startTimeLocal,
      where,
      facilitators: namesWords(facilitators.map((person) => person.first).filter(Boolean)),
    }),
    current,
    online: session.session.meetingUrl
      ? { available: true, hint: onlineHint(name) }
      : { available: false, hint: noLinkHint(name) },
    move: {
      days,
      dayKey: session.dateKey,
      time: clockWords(session.session.startTimeLocal),
      room: session.session.location,
    },
    keepPace: {
      hint: keepPace
        ? keepPaceHint({
            weekNumber: session.weekNumber,
            next: keepPace.next,
            finishDateKey: keepPace.finishDateKey,
            finishMoves: keepPace.finishMoves,
          })
        : "",
    },
    push: pushed ? { available: true, hint: pushHint(name, pushed.lastDateKey) } : { available: false, hint: "" },
    // Only a week "Change a session" changed has anything to put back: a
    // week whose override has no change record is pinned to when it met, or
    // holds its own link (`checkPress`).
    restore:
      change && change.kind !== "pushed"
        ? { hint: restoreHint(standing, group.session.location) }
        : null,
    tell: { ...count, line: tellLine(name, count.people, count.emails, counted.members) },
    whoCan: whoCanLine([
      ...facilitators.map((person) => person.first),
      context.leadFirst,
      ...context.trackLeadFirsts,
    ]),
  };
}

/** A card for one session of a group, headed as the caller draws it. */
function cardFor(
  group: CourseGroupDoc,
  session: ResolvedSession,
  context: Context,
  heading: "group" | "week",
): SessionCardView {
  const facilitators = standingFacilitators(group, context);
  const started = (() => {
    const { startsAt } = sessionInstants(session);
    return Boolean(startsAt && startsAt.getTime() <= context.now.getTime());
  })();
  const state = stateOf(group, session);
  return {
    key: `${group.id}__${session.sessionKey}`,
    heading: heading === "group" ? groupNameOf(group) : cardWeekWords(session.weekNumber),
    sub:
      heading === "group"
        ? slotLine(slotWords(group.session.weekday, group.session.startTimeLocal), roomOrCampus(group.session.location, group.campus))
        : "",
    people: heading === "group" ? facilitators.map(({ uid, name }) => ({ uid, name })) : [],
    peopleLine: heading === "group" ? namesWords(facilitators.map((person) => person.name)) : "",
    eyebrow: heading === "group" ? cardWeekWords(session.weekNumber) : "",
    when: sessionWhenWords(session.dateKey, session.session.startTimeLocal, context.todayKey),
    where: state === "moved" ? session.session.location : "",
    state,
    note: started ? SESSION_STARTED : null,
    dialog: started ? null : dialogFor(group, session, context),
  };
}

/**
 * ONE GROUP'S SESSIONS FROM TODAY, for its facilitators' own page: each one a
 * card with the change dialog behind it, in date order. A session already
 * under way is left to the register.
 */
export async function loadGroupSessions(
  db: Firestore,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  now: Date,
  /** Who is looking: the update a change posts is theirs, and never emailed to its own writer. */
  viewerUid: string | null,
): Promise<SessionCardView[]> {
  const context = await contextFor(db, run, [group], now, viewerUid);
  const sessions = resolveSessions(run, group);
  return sessions
    .filter((session) => session.occurrence === 1 && session.dateKey !== "")
    .filter((session) => {
      const { startsAt } = sessionInstants(session);
      return Boolean(startsAt && startsAt.getTime() > now.getTime());
    })
    .map((session) => cardFor(group, session, context, "week"));
}
