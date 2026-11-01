import { sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import type { AttendanceStatus } from "@/lib/firestore/courseAttendance";
import {
  HOW_TOP,
  SESSION_REPORT_LIMITS,
  SOMETHING_ELSE,
  type ReportPick,
  type SessionReportAnswers,
} from "@/lib/firestore/courseSessionReports";
import { ANSWER_NAMES, REPORT_REFUSAL, tooLongWords } from "./words";

/**
 * A SESSION REPORT'S RULES, pure: what a press of Send may carry, when a
 * session's report is open, and who an answer may pick. The route and the
 * facilitator's page both ask these, so the page never offers what the route
 * would refuse.
 *
 *  - WHEN. From the session's start until the group's next session starts
 *    (the next one that is held and dated), so a report can be changed on the
 *    walk home and the next morning, and is settled before the group meets
 *    again. After the group's last session, a week from its start. A session
 *    that was called off, or that has no date, has no report.
 *  - WHO IS PICKED. People are picked from the session's register, never
 *    typed: who engaged well and who seemed not to have done the readings
 *    from the people the register has down as here (present, late or left
 *    early); who might need a hand from everybody on it. Never the group's
 *    facilitators: the caller hands in the register's rows without them.
 *  - WHAT IS ASKED. "How did the session go?" needs an answer; every other
 *    answer may be left empty.
 */

/** The marks that say somebody was in the room. */
export const CAME: readonly AttendanceStatus[] = ["present", "late", "left-early"];

/** A session key as `sessionKey` makes one: "w03", or "w03-2" for a week's second session. */
const SESSION_KEY = /^w(\d{2})(?:-([2-4]))?$/;

/** A part id as a week's ids are made: letters, digits, `-` and `_`, at most 48. */
const PART_ID = /^[A-Za-z0-9_-]{1,48}$/;

/** A uid as the client sends it: a non-empty string that names one document. */
function isUid(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !value.includes("/");
}

/** Words a person typed, with their line breaks made `\n` and the ends trimmed. */
function typed(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  return value.replace(/\r\n?/g, "\n").trim();
}

export type ParsedReport =
  | { ok: true; sessionKey: string; answers: SessionReportAnswers }
  | { ok: false; error: string };

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** One answer that picks people, each with optional words about them. */
function parsePicks(value: unknown): ReportPick[] | "bad" | "long" {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > SESSION_REPORT_LIMITS.people) return "bad";
  const out: ReportPick[] = [];
  for (const each of value) {
    if (!isObject(each) || !isUid(each.uid)) return "bad";
    const note = typed(each.note);
    if (note === null) return "bad";
    if (note.length > SESSION_REPORT_LIMITS.aboutOne) return "long";
    if (out.some((pick) => pick.uid === each.uid)) continue;
    out.push({ uid: each.uid, note });
  }
  return out;
}

/**
 * THE BODY OF A PRESS ON SEND, checked before anything is read:
 * `{ sessionKey, answers }`. Every free-text answer is trimmed with its line
 * breaks made `\n`, so what is counted against its limit is what is kept. A
 * person picked twice in one answer is kept once.
 */
export function parseReportBody(raw: unknown): ParsedReport {
  if (!isObject(raw) || !isObject(raw.answers)) return { ok: false, error: REPORT_REFUSAL.body };
  const sessionKey = raw.sessionKey;
  if (typeof sessionKey !== "string" || !SESSION_KEY.test(sessionKey)) return { ok: false, error: REPORT_REFUSAL.session };
  const answers = raw.answers;

  const how = answers.how;
  if (typeof how !== "number" || !Number.isInteger(how) || how < 1 || how > HOW_TOP) {
    return { ok: false, error: REPORT_REFUSAL.how };
  }

  const texts: Record<"wentWell" | "didnt" | "forLead", string> = { wentWell: "", didnt: "", forLead: "" };
  for (const key of ["wentWell", "didnt", "forLead"] as const) {
    const value = typed(answers[key]);
    if (value === null) return { ok: false, error: REPORT_REFUSAL.body };
    if (value.length > SESSION_REPORT_LIMITS.text) {
      return { ok: false, error: tooLongWords(ANSWER_NAMES[key], SESSION_REPORT_LIMITS.text) };
    }
    texts[key] = value;
  }

  const unclearRaw = answers.unclear ?? [];
  if (!Array.isArray(unclearRaw) || unclearRaw.length > SESSION_REPORT_LIMITS.parts + 1) {
    return { ok: false, error: REPORT_REFUSAL.body };
  }
  const unclear: string[] = [];
  for (const id of unclearRaw) {
    if (typeof id !== "string" || !(id === SOMETHING_ELSE || PART_ID.test(id))) return { ok: false, error: REPORT_REFUSAL.body };
    if (!unclear.includes(id)) unclear.push(id);
  }

  const notReadRaw = answers.notRead ?? [];
  if (!Array.isArray(notReadRaw) || notReadRaw.length > SESSION_REPORT_LIMITS.people) {
    return { ok: false, error: REPORT_REFUSAL.body };
  }
  const notRead: string[] = [];
  for (const uid of notReadRaw) {
    if (!isUid(uid)) return { ok: false, error: REPORT_REFUSAL.body };
    if (!notRead.includes(uid)) notRead.push(uid);
  }

  const engaged = parsePicks(answers.engaged);
  const needsHand = parsePicks(answers.needsHand);
  for (const parsed of [engaged, needsHand]) {
    if (parsed === "bad") return { ok: false, error: REPORT_REFUSAL.body };
    if (parsed === "long") return { ok: false, error: tooLongWords(ANSWER_NAMES.aboutOne, SESSION_REPORT_LIMITS.aboutOne) };
  }

  return {
    ok: true,
    sessionKey,
    answers: {
      how,
      wentWell: texts.wentWell,
      didnt: texts.didnt,
      unclear,
      engaged: engaged as ReportPick[],
      notRead,
      needsHand: needsHand as ReportPick[],
      forLead: texts.forLead,
    },
  };
}

// ---------------------------------------------------------------------------
// When a session's report is open
// ---------------------------------------------------------------------------

/** How long the report on a group's last session stays open: a week from its start. */
export const LAST_SESSION_REPORT_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReportWindow = {
  session: ResolvedSession;
  opensAt: Date;
  closesAt: Date;
  /** The week of the session whose start closes it, or null after the group's last session. */
  nextWeekNumber: number | null;
};

/**
 * When the report on `sessionKey` can be written: from the session's start
 * until the next session of the group that is held and dated starts, or a
 * week after the start for the last one. Null for a session the group does
 * not hold, one called off through "Change a session" and one with no date.
 */
export function reportWindowOf(sessions: readonly ResolvedSession[], sessionKey: string): ReportWindow | null {
  const index = sessions.findIndex((session) => session.sessionKey === sessionKey);
  if (index < 0) return null;
  const session = sessions[index];
  if (session.cancelled) return null;
  const { startsAt } = sessionInstants(session);
  if (!startsAt) return null;
  for (const later of sessions.slice(index + 1)) {
    if (later.cancelled) continue;
    const next = sessionInstants(later).startsAt;
    if (next && next.getTime() > startsAt.getTime()) {
      return { session, opensAt: startsAt, closesAt: next, nextWeekNumber: later.weekNumber };
    }
  }
  return { session, opensAt: startsAt, closesAt: new Date(startsAt.getTime() + LAST_SESSION_REPORT_DAYS * DAY_MS), nextWeekNumber: null };
}

export type WindowState = "not-yet" | "open" | "closed";

export function windowStateAt(window: Pick<ReportWindow, "opensAt" | "closesAt">, now: Date): WindowState {
  if (now.getTime() < window.opensAt.getTime()) return "not-yet";
  return now.getTime() < window.closesAt.getTime() ? "open" : "closed";
}

/**
 * The session a report is for when the address names none: the latest of
 * the group's sessions that has started, leaving out one called off. Null
 * before the first.
 */
export function latestStartedSession(sessions: readonly ResolvedSession[], now: Date): ResolvedSession | null {
  let best: { session: ResolvedSession; at: number } | null = null;
  for (const session of sessions) {
    if (session.cancelled) continue;
    const { startsAt } = sessionInstants(session);
    if (!startsAt || startsAt.getTime() > now.getTime()) continue;
    if (!best || startsAt.getTime() > best.at) best = { session, at: startsAt.getTime() };
  }
  return best?.session ?? null;
}

// ---------------------------------------------------------------------------
// Who an answer may pick, and which parts it may tick
// ---------------------------------------------------------------------------

/**
 * Whether every person the answers pick may be picked: who engaged well and
 * who seemed not to have done the readings from `came`, who might need a hand
 * from `inGroup`. Somebody picked who is in neither is refused rather than
 * dropped: a report that quietly lost a name would read as sent whole.
 */
export function pickRefusal(
  answers: Pick<SessionReportAnswers, "engaged" | "notRead" | "needsHand">,
  came: ReadonlySet<string>,
  inGroup: ReadonlySet<string>,
): string | null {
  const fromCame = [...answers.engaged.map((pick) => pick.uid), ...answers.notRead];
  if (fromCame.some((uid) => !came.has(uid))) return REPORT_REFUSAL.pickedCame;
  if (answers.needsHand.some((pick) => !inGroup.has(pick.uid))) return REPORT_REFUSAL.pickedGroup;
  return null;
}

/** Whether every part the answers tick is one of the week's, or "Something else". */
export function unclearRefusal(answers: Pick<SessionReportAnswers, "unclear">, partIds: ReadonlySet<string>): string | null {
  return answers.unclear.every((id) => id === SOMETHING_ELSE || partIds.has(id)) ? null : REPORT_REFUSAL.parts;
}
