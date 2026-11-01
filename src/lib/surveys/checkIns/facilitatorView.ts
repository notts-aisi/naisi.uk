import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { sessionInstants } from "@/lib/courses/sessions";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { SURVEYS_COLLECTION, isCheckIn, normalizeSurvey, type CheckInSurveyDoc } from "@/lib/firestore/surveys";
import { pageCodeShape } from "@/lib/qr/pageCode";
import { answersOf, isOpen, peopleOf, sentCountOf } from "../repo";
import { checkInSurveyId } from "./ids";
import { facilitatorCount, windowState, type FacilitatorCount } from "./model";
import { readCheckInSession, readRegisterMarks } from "./sessionRead";
import {
  closeConfirmWords,
  closesByItselfWords,
  sentInAllWords,
  sentSoFarWords,
  tooFewWords,
  totalsHeadingWords,
  totalsLineParts,
} from "./words";

/**
 * WHAT THE REGISTER'S CHECK-IN CARD IS HANDED, for a group's facilitators and
 * admins (the route has asked `gateGroupRegister` first): the one floored
 * view of a check-in a facilitator ever reads.
 *
 *  - Before it is opened, on its session's day: that it can be opened, when
 *    it would close, and which of the register's rows it would leave out
 *    (the group's facilitators), so the button counts who it is for.
 *  - While it is open: how many have sent it, of how many it is for, never
 *    who; when it closes; and the code to show the room.
 *  - Once it has closed: how many sent it, and its totals from three answers
 *    (`facilitatorCount`), never a comment, never who.
 *
 * Beside it, the group's latest closed check-in before this session's, with
 * its totals the same way. Every answer is counted here and none leaves: what
 * is handed back is counts, averages and the options' own words, as lines.
 */

export type CheckInCodeView = { size: number; d: string; address: string };

export type CheckInCardView =
  /** On its session's day, not opened yet. `notCounted` are the rows it never reaches: the group's facilitators. */
  | { state: "ready"; closes: string; notCounted: string[] }
  | { state: "open"; sent: string; answered: number; of: number; closes: string; confirm: string; code: CheckInCodeView }
  | { state: "closed"; sent: string; totals: string[] | null; tooFew: string | null };

export type CheckInTotalsView = { heading: string; totals: string[] | null; tooFew: string | null };

export type CheckInRegisterView = {
  sessionKey: string;
  /** The check-in for this session, or null when it has none now. */
  card: CheckInCardView | null;
  /** The group's latest closed check-in before this session's, when the card is not a closed one itself. */
  last: CheckInTotalsView | null;
};

/** A closed check-in's totals as lines, or too few to show. */
function totalsLines(count: FacilitatorCount): { totals: string[] | null; tooFew: string | null } {
  if (count.state !== "closed") return { totals: null, tooFew: null };
  return count.totals ? { totals: totalsLineParts(count.totals), tooFew: null } : { totals: null, tooFew: tooFewWords(count.answered, count.of) };
}

/** A closed check-in, counted for its group's facilitators: its answers read here, and only numbers kept. */
async function closedCount(db: Firestore, survey: CheckInSurveyDoc): Promise<FacilitatorCount> {
  const answers = await answersOf(db, survey);
  return facilitatorCount("closed", survey.items, answers, sentCountOf(survey));
}

/**
 * The group's latest closed check-in of a session before `beforeKey`'s, by
 * the ids its sessions give (no query), or null.
 */
async function lastClosed(
  db: Firestore,
  runId: string,
  group: CourseGroupDoc,
  sessions: readonly { sessionKey: string; startsAt: Date | null }[],
  beforeKey: string,
  now: Date,
): Promise<CheckInSurveyDoc | null> {
  const earlier = sessions.filter((each) => each.sessionKey !== beforeKey && each.startsAt && each.startsAt.getTime() <= now.getTime());
  if (earlier.length === 0) return null;
  const snaps = await db.getAll(...earlier.map((each) => db.collection(SURVEYS_COLLECTION).doc(checkInSurveyId(runId, group.id, each.sessionKey))));
  let best: CheckInSurveyDoc | null = null;
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const survey = normalizeSurvey(snap.id, snap.data() ?? {});
    if (!isCheckIn(survey) || survey.audience.groupId !== group.id || isOpen(survey, now)) continue;
    const at = survey.checkIn.startsAt?.getTime() ?? 0;
    if (!best || at > (best.checkIn.startsAt?.getTime() ?? 0)) best = survey;
  }
  return best;
}

export async function checkInRegisterView(
  db: Firestore,
  input: { runId: string; group: CourseGroupDoc; sessionKey: string; now: Date },
): Promise<CheckInRegisterView | null> {
  const { runId, group, now } = input;
  const at = await readCheckInSession(db, runId, group, input.sessionKey);
  if (!at) return null;
  const { session, window } = at;
  const id = checkInSurveyId(runId, group.id, session.sessionKey);
  const snap = await db.collection(SURVEYS_COLLECTION).doc(id).get();
  const stored = snap.exists ? normalizeSurvey(snap.id, snap.data() ?? {}) : null;
  const survey = stored && isCheckIn(stored) && stored.audience.groupId === group.id ? stored : null;

  let card: CheckInCardView | null = null;
  if (survey && isOpen(survey, now)) {
    const people = await peopleOf(db, survey.id);
    const answered = people.filter((person) => person.answered).length;
    const of = people.length;
    const closesAt = survey.closesAt ?? now;
    card = {
      state: "open",
      sent: sentSoFarWords(answered, of),
      answered,
      of,
      closes: closesByItselfWords(closesAt, now),
      confirm: closeConfirmWords(answered, of),
      code: pageCodeShape(`/learn/${runId}/survey/${survey.id}`),
    };
  } else if (survey) {
    const count = await closedCount(db, survey);
    card = { state: "closed", sent: sentInAllWords(count.answered, count.of), ...totalsLines(count) };
  } else if (window && !session.cancelled && windowState(window, now) === "now") {
    const register = await readRegisterMarks(db, runId, group.id, session);
    if (register.held) {
      card = { state: "ready", closes: closesByItselfWords(window.closesAt, now), notCounted: [...new Set(group.facilitatorUids)].sort() };
    }
  }

  let last: CheckInTotalsView | null = null;
  if (card === null || card.state !== "closed") {
    const sessions = at.sessions.map((each) => ({ sessionKey: each.sessionKey, startsAt: sessionInstants(each).startsAt }));
    const previous = await lastClosed(db, runId, group, sessions, session.sessionKey, now);
    if (previous) {
      last = { heading: totalsHeadingWords(previous.audience.weekNumber, previous.checkIn.groupName || group.name), ...totalsLines(await closedCount(db, previous)) };
    }
  }
  return { sessionKey: session.sessionKey, card, last };
}
