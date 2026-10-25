import { addDaysToKey, isValidDateKey, type WeekPlanEntry } from "../weekPlan";
import { resolveCalendar } from "../groupResolve";
import { resolveSessions, sessionRange, type ResolvedSession, type SessionGroup } from "../sessions";
import type { SessionChange } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { PUSHED_BREAK_LABEL, coversLine, noticeCancelledLine, noticeKeepPaceLine } from "./words";

/**
 * CHANGING ONE WEEK'S SESSION (Q25), as arithmetic: which session a change is
 * about, what each kind of cancel makes true before anybody presses, the plan
 * a push back writes, and the notice a group's people read.
 *
 * PURE and isomorphic, like `sessions.ts` beneath it: no reads, no clock
 * unless one is passed. The dialog's sentences ("still finishes on Tue 8
 * Dec"), the route's writes and the member's notice are all answered here, by
 * resolving the group's sessions the one way every schedule surface does
 * (`resolveSessions`), so the dialog cannot promise a finishing date the
 * write does not make.
 *
 * The four kinds, and where each one's effect lives on the group document:
 *
 *  - HOLD IT ONLINE: `sessionModes[week] = "virtual"`, same day and time.
 *  - MOVE IT: the week's `sessionOverrides` entry (day, time, room), that
 *    week only.
 *  - CANCEL IT, AND KEEP PACE: a `cancelled` record in `sessionChanges`. The
 *    week stays where it is in the plan, its reading stays open, and the next
 *    session covers both weeks; the group finishes when it would have.
 *  - CANCEL IT, AND PUSH THE REST BACK A WEEK: a break slot in the group's own
 *    plan where the week was, so it and every week after move back one slot.
 *    The group finishes a week later.
 */

/** The run, as the session resolver takes it. */
export type ChangeRun = CourseRunDoc;

/** The week's first session: the one its changes are about (the override maps have no occurrence). */
export function sessionOfWeek(
  sessions: readonly ResolvedSession[],
  weekNumber: number,
): ResolvedSession | null {
  return sessions.find((s) => s.weekNumber === weekNumber && s.occurrence === 1) ?? null;
}

/** The seven civil dates of a week slot, from its first day. Empty for no date. */
export function slotDays(slotStartKey: string): string[] {
  if (!isValidDateKey(slotStartKey)) return [];
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(slotStartKey, i));
}

/**
 * The weeks one session covers: its own, and those of the cancelled sessions
 * straight before it, oldest first. Week 5's session after week 4's was
 * cancelled covers weeks 4 and 5.
 */
export function coveredWeeks(
  sessions: readonly ResolvedSession[],
  session: Pick<ResolvedSession, "sessionKey" | "weekNumber">,
): number[] {
  const firsts = sessions.filter((s) => s.occurrence === 1);
  const index = firsts.findIndex((s) => s.sessionKey === session.sessionKey);
  const weeks = [session.weekNumber];
  if (index < 0) return weeks;
  for (let i = index - 1; i >= 0 && firsts[i].cancelled; i -= 1) weeks.unshift(firsts[i].weekNumber);
  return weeks;
}

/** The first session after `session`, in schedule order, that is held. */
export function nextHeldAfter(
  sessions: readonly ResolvedSession[],
  session: Pick<ResolvedSession, "sessionKey">,
): ResolvedSession | null {
  const index = sessions.findIndex((s) => s.sessionKey === session.sessionKey);
  if (index < 0) return null;
  return sessions.slice(index + 1).find((s) => !s.cancelled && s.dateKey !== "") ?? null;
}

/** The group with one week's change record laid over it, as a resolver would read it after the write. */
export function withChange<G extends SessionGroup>(group: G, weekId: string, change: SessionChange | null): G {
  const next = { ...(group.sessionChanges ?? {}) };
  if (change) next[weekId] = change;
  else delete next[weekId];
  return { ...group, sessionChanges: next };
}

/** What "Cancel it, and keep pace" would make true. */
export type KeepPaceOutcome = {
  /** The next session that is held, and the weeks it then covers. Null when the cancelled one was the last. */
  next: { dateKey: string; weekNumbers: number[] } | null;
  /** The group's last session once this one is off. */
  finishDateKey: string;
  /** True when that is not the date it finished on before: the cancelled session was the last. */
  finishMoves: boolean;
};

export function keepPaceOutcome(
  run: ChangeRun,
  group: SessionGroup,
  weekNumber: number,
): KeepPaceOutcome | null {
  const before = resolveSessions(run, group);
  const target = sessionOfWeek(before, weekNumber);
  if (!target || !target.dateKey) return null;
  const after = resolveSessions(
    run,
    withChange(group, target.weekId, { kind: "cancelled", reason: "", dateKey: target.dateKey, byUid: "", at: null }),
  );
  const cancelled = sessionOfWeek(after, weekNumber);
  const next = cancelled ? nextHeldAfter(after, cancelled) : null;
  const finishBefore = sessionRange(before).lastDateKey;
  const finishAfter = sessionRange(after).lastDateKey;
  return {
    next: next ? { dateKey: next.dateKey, weekNumbers: coveredWeeks(after, next) } : null,
    finishDateKey: finishAfter,
    finishMoves: finishAfter !== finishBefore,
  };
}

/**
 * The plan with a break slot put in where week `weekNumber` is, so that week
 * and every week after it move back one slot. Null when the week is not in
 * the plan. The break is labelled with the words the week rail and the run
 * home show for it.
 */
export function planWithBreakBefore(plan: readonly WeekPlanEntry[], weekNumber: number): WeekPlanEntry[] | null {
  const index = plan.findIndex((entry) => entry.kind === "week" && entry.weekNumber === weekNumber);
  if (index < 0) return null;
  return [...plan.slice(0, index), { kind: "break", label: PUSHED_BREAK_LABEL }, ...plan.slice(index)];
}

/** What "Cancel it, and push the rest back a week" would make true, and the plan it writes. */
export type PushBackOutcome = {
  /** The group's whole plan after the push, to store as its own (`paceWeekPlan`). */
  plan: WeekPlanEntry[];
  /** Where the pushed week's session then falls. */
  newDateKey: string;
  /** The group's last session after the push. */
  lastDateKey: string;
};

export function pushBackOutcome(
  run: ChangeRun,
  group: SessionGroup,
  weekNumber: number,
): PushBackOutcome | null {
  const calendar = resolveCalendar(run, group);
  const plan = planWithBreakBefore(calendar.weekPlan, weekNumber);
  if (!plan) return null;
  const pushed: SessionGroup = { ...group, paceWeekPlan: plan };
  const after = resolveSessions(run, pushed);
  return {
    plan,
    newDateKey: sessionOfWeek(after, weekNumber)?.dateKey ?? "",
    lastDateKey: sessionRange(after).lastDateKey,
  };
}

/**
 * Is a `pushed` record still what happened? Only while the pushed week's
 * session falls on another date than the cancelled evening: a plan put back
 * by hand (the pace editor) holds the week on that evening again, and no
 * notice may then say it is off.
 */
export function pushStillHolds(sessions: readonly ResolvedSession[], weekNumber: number, change: SessionChange): boolean {
  if (change.kind !== "pushed") return false;
  const now = sessionOfWeek(sessions, weekNumber);
  return now !== null && now.dateKey !== "" && now.dateKey !== change.dateKey;
}

// ---------------------------------------------------------------------------
// What a group's people read
// ---------------------------------------------------------------------------

/** A cancelled evening, as the programme page tells the group about it (wk-changes). */
export type SessionNotice = {
  kind: "cancelled" | "pushed";
  /** The evening nobody meets. */
  dateKey: string;
  /** When it would have started, for "tonight" or "today". */
  startTimeLocal: string;
  /** The week whose session it was. */
  weekNumber: number;
  /** What the group was told. */
  reason: string;
  /**
   * After a cancel that keeps pace, the next session and the weeks it covers.
   * After a push back, the pushed week's new session. Null when there is none.
   */
  next: { dateKey: string; weekNumbers: number[] } | null;
};

/**
 * THE CANCELLED EVENING A GROUP'S PEOPLE MUST READ ABOUT before their next
 * session, or null.
 *
 * Shown from the change until the evening itself has passed (the date is
 * compared, so "No session tonight" stays up all of that day), and only while
 * no held session comes before it: a cancellation three weeks out is read
 * about once the sessions before it have been.
 */
export function sessionNoticeFor(
  sessions: readonly ResolvedSession[],
  group: Pick<SessionGroup, "sessionChanges">,
  todayKey: string,
): SessionNotice | null {
  const candidates: SessionNotice[] = [];
  for (const session of sessions) {
    if (!session.cancelled || session.dateKey < todayKey) continue;
    const change = group.sessionChanges?.[session.weekId];
    const next = nextHeldAfter(sessions, session);
    candidates.push({
      kind: "cancelled",
      dateKey: session.dateKey,
      startTimeLocal: session.session.startTimeLocal,
      weekNumber: session.weekNumber,
      reason: change?.reason ?? "",
      next: next ? { dateKey: next.dateKey, weekNumbers: coveredWeeks(sessions, next) } : null,
    });
  }
  for (const [weekId, change] of Object.entries(group.sessionChanges ?? {})) {
    if (change.kind !== "pushed" || change.dateKey < todayKey) continue;
    const week = sessions.find((s) => s.weekId === weekId && s.occurrence === 1);
    if (!week || !pushStillHolds(sessions, week.weekNumber, change)) continue;
    candidates.push({
      kind: "pushed",
      dateKey: change.dateKey,
      startTimeLocal: week.session.startTimeLocal,
      weekNumber: week.weekNumber,
      reason: change.reason,
      next: { dateKey: week.dateKey, weekNumbers: [week.weekNumber] },
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const first = candidates[0];
  const heldBefore = sessions.some(
    (s) => !s.cancelled && s.dateKey !== "" && s.dateKey >= todayKey && s.dateKey < first.dateKey,
  );
  return heldBefore ? null : first;
}

/**
 * WHAT A GROUP'S SESSION CARD SAYS ABOUT CHANGED SESSIONS, worked out once per
 * group from the sessions the card is already built from: the weeks, room and
 * link of the next session it names, the notice to show, and the sessions
 * that are off. `next` is `sessionRange`'s, which never names a cancelled
 * session. The link is the caller's to withhold: this hands over what the
 * resolved session carries.
 */
export function cardChangeFacts(
  sessions: readonly ResolvedSession[],
  group: Pick<SessionGroup, "sessionChanges">,
  next: ResolvedSession | null,
  todayKey: string,
): {
  next: { weekNumbers: number[]; location: string; meetingUrl: string | null } | null;
  notice: SessionNotice | null;
  cancelled: { weekNumber: number; dateKey: string; reason: string }[];
} {
  return {
    next: next
      ? {
          weekNumbers: coveredWeeks(sessions, next),
          location: next.session.location,
          meetingUrl: next.session.meetingUrl,
        }
      : null,
    notice: sessionNoticeFor(sessions, group, todayKey),
    cancelled: sessions
      .filter((session) => session.cancelled)
      .map((session) => ({
        weekNumber: session.weekNumber,
        dateKey: session.dateKey,
        reason: group.sessionChanges?.[session.weekId]?.reason ?? "",
      })),
  };
}

/**
 * WHAT NEXT WEEK'S EMAIL SAYS ABOUT A CHANGED SESSION (Q25): "Cancelling or
 * moving a session rewrites its email" (wk-messages). A moved session and an
 * online one need no words of their own: the email's day, time and room are
 * the week's own (`resolveSessions` applies the move) and an online week's
 * place is "Online" (never the link). What does:
 *
 *  - a CANCELLED session: the email about it says it is off, why, and when
 *    the group meets next, in the words the programme page uses, and drops
 *    its sentence about when and where the group meets;
 *  - the session AFTER one, which covers both weeks: says so.
 *
 * "" when nothing about the session changed.
 */
export function nextWeekChangeLine(
  sessions: readonly ResolvedSession[],
  group: Pick<SessionGroup, "sessionChanges">,
  session: ResolvedSession,
): string {
  if (session.cancelled) {
    const reason = group.sessionChanges?.[session.weekId]?.reason ?? "";
    const next = nextHeldAfter(sessions, session);
    return `${noticeCancelledLine(session.dateKey, reason)} ${noticeKeepPaceLine(
      session.weekNumber,
      next ? { dateKey: next.dateKey, weekNumbers: coveredWeeks(sessions, next) } : null,
    )}`;
  }
  const covers = coveredWeeks(sessions, session);
  return covers.length > 1 ? coversLine(session.dateKey, covers) : "";
}

/** The session a group holds on a day of a range, the week's first: what the Sessions view draws. */
export function sessionBetween(
  sessions: readonly ResolvedSession[],
  fromKey: string,
  toKey: string,
): ResolvedSession | null {
  return (
    sessions.find((s) => s.occurrence === 1 && s.dateKey !== "" && s.dateKey >= fromKey && s.dateKey <= toKey) ?? null
  );
}

/** A pushed-back evening that fell in a range, while the push still holds. */
export function pushedBetween(
  sessions: readonly ResolvedSession[],
  group: Pick<SessionGroup, "sessionChanges">,
  fromKey: string,
  toKey: string,
): { weekNumber: number; dateKey: string } | null {
  for (const [weekId, change] of Object.entries(group.sessionChanges ?? {})) {
    if (change.kind !== "pushed" || change.dateKey < fromKey || change.dateKey > toKey) continue;
    const week = sessions.find((s) => s.weekId === weekId && s.occurrence === 1);
    if (week && pushStillHolds(sessions, week.weekNumber, change)) {
      return { weekNumber: week.weekNumber, dateKey: change.dateKey };
    }
  }
  return null;
}
