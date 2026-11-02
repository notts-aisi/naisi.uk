import { isAddressableId } from "@/lib/addressableId";
import { sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import {
  EXPLAINER_TOPIC_MAX,
  explainerOnSession,
  isExplainerMinutes,
  type CourseExplainerDoc,
  type ExplainerMinutes,
} from "@/lib/firestore/courseExplainers";
import { EXPLAINER_WORDS, oneLineTopic, sessionChoiceWords } from "./words";

/**
 * WHAT AN EXPLAINER IS SCHEDULED ON, worked out from records: each live
 * group's next session that meets, the choices the page offers, and what a
 * request asks for. Pure: the page, the route and the tests run the same
 * code on the same facts.
 *
 * THE NEXT SESSION THAT MEETS is the soonest of the group's own sessions
 * (`resolveSessions`, its own calendar, a session moved for one week at its
 * new day and time) that is not cancelled and has not started. A group with
 * no session to come that has a day and time is offered none, and the page
 * says so.
 */

/** The session a group meets at next, and when it starts; null with none to come that has a day and time. */
export function nextMeeting(
  sessions: readonly ResolvedSession[],
  now: Date,
): { session: ResolvedSession; startsAt: Date } | null {
  let best: { session: ResolvedSession; startsAt: Date } | null = null;
  for (const session of sessions) {
    if (session.cancelled) continue;
    const { startsAt } = sessionInstants(session);
    if (!startsAt || startsAt.getTime() <= now.getTime()) continue;
    if (!best || startsAt.getTime() < best.startsAt.getTime()) best = { session, startsAt };
  }
  return best;
}

/** One session the page offers, for one live group. */
export type SessionChoice = {
  groupId: string;
  groupName: string;
  sessionKey: string;
  weekNumber: number;
  startsAt: Date;
  /** "Group C, week 4: Wed 25 Nov, 3pm". */
  label: string;
  /** The topic of the explainer already opening it, or null: one per session. */
  taken: string | null;
};

/**
 * Every live group's next session, in the order they meet, and the groups
 * with none to offer. `groups` are the run's live groups, each with its own
 * sessions resolved.
 */
export function sessionChoices(
  groups: ReadonlyArray<{ id: string; name: string; sessions: readonly ResolvedSession[] }>,
  explainers: readonly CourseExplainerDoc[],
  now: Date,
): { choices: SessionChoice[]; undated: string[] } {
  const choices: SessionChoice[] = [];
  const undated: string[] = [];
  for (const group of groups) {
    const name = group.name.trim() || "Untitled group";
    const next = nextMeeting(group.sessions, now);
    if (!next) {
      undated.push(name);
      continue;
    }
    const on = explainerOnSession(explainers, group.id, next.session.sessionKey);
    choices.push({
      groupId: group.id,
      groupName: name,
      sessionKey: next.session.sessionKey,
      weekNumber: next.session.weekNumber,
      startsAt: next.startsAt,
      label: sessionChoiceWords(name, next.session.weekNumber, next.startsAt),
      taken: on ? on.topic : null,
    });
  }
  choices.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.groupName.localeCompare(b.groupName, "en-GB"));
  return { choices, undated };
}

/** What a request to schedule one asks for, read and checked before anything is. */
export type ScheduleAsk = {
  topic: string;
  explainerUid: string;
  minutes: ExplainerMinutes;
  sessions: Array<{ groupId: string; sessionKey: string }>;
};

/** The most sessions one request may name: more than any run's live groups. */
export const MAX_ASKED_SESSIONS = 60;

/** An id that names one document: no separator, and not so long it names nothing. */
const isId = (value: unknown): value is string => typeof value === "string" && value.length <= 200 && isAddressableId(value);
/** A session's key: "w04", or "w04-2" for a week's second meeting (`sessionKey`). */
const SESSION_KEY = /^w\d{2}(?:-\d{1,2})?$/;

/**
 * A request's body, read: the topic on one line and within its length, who
 * explains by account, how long, and each session by its group and key, each
 * group once. Nothing about anybody is looked up here.
 */
export function readScheduleAsk(raw: unknown): { ok: true; ask: ScheduleAsk } | { ok: false; error: string } {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!body) return { ok: false, error: EXPLAINER_WORDS.badTopic };
  const topic = typeof body.topic === "string" ? oneLineTopic(body.topic) : "";
  if (!topic || topic.length > EXPLAINER_TOPIC_MAX) return { ok: false, error: EXPLAINER_WORDS.badTopic };
  const explainerUid = body.explainerUid;
  if (!isId(explainerUid)) return { ok: false, error: EXPLAINER_WORDS.badExplainer };
  if (!isExplainerMinutes(body.minutes)) return { ok: false, error: EXPLAINER_WORDS.badMinutes };
  if (!Array.isArray(body.sessions)) return { ok: false, error: EXPLAINER_WORDS.badSessions };
  if (body.sessions.length === 0) return { ok: false, error: EXPLAINER_WORDS.noSessions };
  if (body.sessions.length > MAX_ASKED_SESSIONS) return { ok: false, error: EXPLAINER_WORDS.badSessions };
  const sessions: ScheduleAsk["sessions"] = [];
  for (const each of body.sessions) {
    const entry = each && typeof each === "object" ? (each as Record<string, unknown>) : {};
    const { groupId, sessionKey } = entry;
    if (!isId(groupId)) return { ok: false, error: EXPLAINER_WORDS.badSessions };
    if (typeof sessionKey !== "string" || !SESSION_KEY.test(sessionKey)) return { ok: false, error: EXPLAINER_WORDS.badSessions };
    if (sessions.some((session) => session.groupId === groupId)) return { ok: false, error: EXPLAINER_WORDS.badSessions };
    sessions.push({ groupId, sessionKey });
  }
  return { ok: true, ask: { topic, explainerUid, minutes: body.minutes, sessions } };
}

/** What a member's ticket, and "Week N is open", says of an explainer: how long and what about. */
export type MemberExplainer = { minutes: number; topic: string };

/** The explainer still on that opens this group's session, as a member reads it, or null. */
export function memberExplainerOn(
  explainers: readonly CourseExplainerDoc[],
  groupId: string,
  sessionKey: string | null | undefined,
): MemberExplainer | null {
  if (!sessionKey) return null;
  const on = explainerOnSession(explainers, groupId, sessionKey);
  return on ? { minutes: on.minutes, topic: on.topic } : null;
}
