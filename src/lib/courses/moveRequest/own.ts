import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { isAddressableId } from "@/lib/courses/registerAccess";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { whyOfferedFor } from "@/lib/applications/handover/whyOffered";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import type { MoveRequestDoc } from "@/lib/firestore/courseMemberRequests";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { aRequestWaits } from "../requests/oneAtATime";
import { dbReader } from "../visit/plan";
import type { OwnVisitRow } from "../visitRequest/own";
import { approvedByWords, replyLineWords, rowLineWords, sentWhenWords, type OwnVisitRowState } from "../visitRequest/words";
import { groupsWithAPlace, readChangeFacts, type ChangeFacts, type ChangeGroupChoice } from "./facts";
import type { MoveRequestStanding } from "./standing";
import { CHANGE_GROUP_INTRO, GROUPS_WITH_A_PLACE, moveDeclinedMessageWords, moveRowTitleWords, movedInWords, movingWaitingWords } from "./words";

/**
 * A PERSON'S OWN REQUESTS TO CHANGE GROUP FOR GOOD, for the programme page's
 * card, the form's page and "Your requests". Their own records only, read by
 * their own uid (`readChangeFacts`). Never on Home: the way in is a button on
 * the programme page, and Home's card is not told of these.
 *
 *  - `offer`: "Change group for good" can be pressed: they can ask at all
 *    (who the staff move could move, on a run that takes a move, with a
 *    session of theirs still to come to move from), and no request of theirs
 *    waits, of this kind or to go to another session (one at a time).
 *  - `waiting`: the one still waiting, with "Withdraw the request".
 *  - `declined`: a decline at the top, with "Dismiss", until they dismiss it
 *    or `MESSAGE_SHOWN_DAYS` days after the decision (there is no session
 *    for it to pass).
 *  - `approved`: "You’re in Group I from week 3. ..." at the top, while they
 *    are still in that group, until their first session with it starts, and never longer than
 *    `MESSAGE_SHOWN_DAYS` days after the decision.
 *  - `rows`: "Your requests", newest first. A request that went by itself (a
 *    move made by somebody else since, the place gone, the run over) is left
 *    off: no words say who closed it.
 */

/** How long a decision's message stays at the top with nothing to pass: a week. */
export const MESSAGE_SHOWN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ChangeGroupView = {
  runId: string;
  offer: boolean;
  waiting: { requestId: string; toName: string; sent: string; line: string; reply: string | null } | null;
  declined: { requestId: string; line: string } | null;
  approved: { requestId: string; line: string; by: string } | null;
  rows: OwnVisitRow[];
};

const iso = (at: Date | null): string | null => (at ? at.toISOString() : null);

/** First names of the people these requests name: who decided, who replied. */
async function firstNamesOf(db: Firestore, requests: readonly MoveRequestDoc[]): Promise<Map<string, string>> {
  const uids = [...new Set(requests.flatMap((request) => [request.decidedByUid ?? "", ...request.replies.map((reply) => reply.byUid)]))].filter(
    (uid) => uid && isAddressableId(uid),
  );
  const snaps = uids.length ? await db.getAll(...uids.map((uid) => db.collection("users").doc(uid))) : [];
  return new Map(snaps.filter((snap) => snap.exists).map((snap) => [snap.id, firstNameOfUser(snap.data() ?? {})]));
}

/** The rows of "Your requests" of this kind, newest first, as the one-week rows read. */
export function ownMoveRowsOf(
  requests: readonly MoveRequestDoc[],
  standings: ReadonlyMap<string, MoveRequestStanding>,
  names: { group: (id: string) => string; firstName: (uid: string) => string },
  now: Date,
): OwnVisitRow[] {
  return requests.flatMap((request) => {
    const standing = standings.get(request.id) ?? { state: request.status };
    if (standing.state === "gone") return [];
    const state: OwnVisitRowState = standing.state;
    const decider = request.decidedByUid ? names.firstName(request.decidedByUid) : "";
    const lastReply = request.replies[request.replies.length - 1] ?? null;
    const reply =
      (state === "approved" || state === "declined") && request.reply
        ? replyLineWords(decider, request.reply)
        : state === "waiting" && lastReply
          ? replyLineWords(names.firstName(lastReply.byUid), lastReply.text)
          : null;
    return [
      {
        id: request.id,
        askedAt: iso(request.askedAt),
        title: moveRowTitleWords(names.group(request.change.toGroupId)),
        line: rowLineWords({ state, by: decider, at: state === "withdrawn" ? request.withdrawnAt : request.decidedAt, askedAt: request.askedAt, now, lapse: null }),
        state,
        reply,
      },
    ];
  });
}

/** The card's view, from facts already read. */
export async function changeGroupOf(db: Firestore, facts: ChangeFacts, now: Date): Promise<ChangeGroupView> {
  const firstNames = await firstNamesOf(db, facts.moveRequests);
  const groupName = (id: string) => facts.groups.find((group) => group.id === id)?.name.trim() || "another group";
  const firstName = (uid: string) => firstNames.get(uid) ?? "";
  const waits = aRequestWaits(facts.visitStandings.values(), facts.moveStandings.values());
  const live = facts.moveRequests.find((request) => facts.moveStandings.get(request.id)?.state === "waiting") ?? null;
  const lastReply = live ? (live.replies[live.replies.length - 1] ?? null) : null;
  const withinDays = (at: Date | null) => at !== null && now.getTime() < at.getTime() + MESSAGE_SHOWN_DAYS * DAY_MS;
  const declinedRequest = facts.moveRequests.find((request) => request.status === "declined" && !request.dismissedAt && withinDays(request.decidedAt)) ?? null;
  // Approved: while they are still in the group it moved them to, until their
  // first session with it starts, and never longer than a week. Moved again
  // since (by staff or on the allocation board), the line would name the wrong group.
  const approvedRequest =
    facts.moveRequests.find((request) => {
      if (request.status !== "approved" || request.change.fromWeek === null || !withinDays(request.decidedAt)) return false;
      if (facts.place.groupId !== request.change.toGroupId) return false;
      const to = facts.groups.find((group) => group.id === request.change.toGroupId);
      const first = to ? resolveSessions(facts.run, to).find((each) => each.weekNumber === request.change.fromWeek && each.occurrence === 1) : undefined;
      const startsAt = first ? sessionInstants(first).startsAt : null;
      return startsAt === null || now.getTime() < startsAt.getTime();
    }) ?? null;
  return {
    runId: facts.run.id,
    offer: facts.movable && !waits,
    waiting:
      live && live.askedAt
        ? {
            requestId: live.id,
            toName: groupName(live.change.toGroupId),
            sent: sentWhenWords(live.askedAt, now),
            line: movingWaitingWords(groupName(live.change.toGroupId)),
            reply: lastReply ? replyLineWords(firstName(lastReply.byUid), lastReply.text) : null,
          }
        : null,
    declined: declinedRequest
      ? {
          requestId: declinedRequest.id,
          line: moveDeclinedMessageWords({
            toName: groupName(declinedRequest.change.toGroupId),
            deciderFirstName: declinedRequest.decidedByUid ? firstName(declinedRequest.decidedByUid) : "",
            reply: declinedRequest.reply,
          }),
        }
      : null,
    approved:
      approvedRequest && approvedRequest.change.fromWeek !== null && approvedRequest.decidedAt
        ? {
            requestId: approvedRequest.id,
            line: movedInWords(groupName(approvedRequest.change.toGroupId), approvedRequest.change.fromWeek),
            by: approvedByWords(approvedRequest.decidedByUid ? firstName(approvedRequest.decidedByUid) : "", approvedRequest.decidedAt, approvedRequest.reply),
          }
        : null,
    rows: ownMoveRowsOf(facts.moveRequests, facts.moveStandings, { group: groupName, firstName }, now),
  };
}

/** The view for the programme page's card, or null for anybody the staff move could not move (`readChangeFacts`). */
export async function changeGroupFor(
  db: Firestore,
  input: { user: SessionUser; run: CourseRunDoc; enrolment: CourseEnrolmentDoc | null; now: Date },
): Promise<ChangeGroupView | null> {
  if (!input.enrolment?.groupId || input.enrolment.uid !== input.user.uid) return null;
  const read = await readChangeFacts(dbReader(db), db, input.run.id, input.user.uid, input.now, { names: false });
  if (!read.ok) return null;
  return changeGroupOf(db, read.facts, input.now);
}

/** The form's page, as its server page draws it. */
export type ChangeGroupPageView = {
  runId: string;
  /** The form, or null when nothing can be asked now (the page says so in one sentence). */
  form: {
    intro: string;
    legend: string;
    choices: ChangeGroupChoice[];
    /** No other group has a place. */
    noneWithAPlace: boolean;
  } | null;
  card: ChangeGroupView;
};

export async function changeGroupPageFor(
  db: Firestore,
  input: {
    user: SessionUser;
    run: CourseRunDoc;
    enrolment: CourseEnrolmentDoc | null;
    now: Date;
    /**
     * Whether this is a view-as session, worked out by the caller before
     * anything is read: then the person's own application is neither read
     * nor shown, so no group says why. Required, as the one-week form's is.
     */
    viewingAs: boolean;
  },
): Promise<ChangeGroupPageView | null> {
  if (!input.enrolment?.groupId || input.enrolment.uid !== input.user.uid) return null;
  const read = await readChangeFacts(dbReader(db), db, input.run.id, input.user.uid, input.now, { names: true });
  if (!read.ok) return null;
  const card = await changeGroupOf(db, read.facts, input.now);
  if (!card.offer) return { runId: input.run.id, form: null, card };
  const offered = groupsWithAPlace(read.facts);
  // "Why:" under each group, from the times they gave, by its usual weekly
  // slot (the one-week form's own reader, `whyOfferedFor`): every group
  // offered has a place. Never in a view-as session; a read that fails says nothing.
  const why = input.viewingAs !== false
    ? new Map<string, string>()
    : await whyOfferedFor(db, {
        uid: input.user.uid,
        runId: input.run.id,
        sessions: offered.map((choice) => {
          const group = read.facts.groups.find((each) => each.id === choice.groupId);
          const slot = group && group.session.startTimeLocal ? { weekday: group.session.weekday, startTimeLocal: group.session.startTimeLocal, durationMinutes: group.session.durationMinutes } : null;
          return { key: choice.groupId, slot, hasRoom: true };
        }),
      }).catch(() => new Map<string, string>());
  const choices = offered.map((choice) => ({ ...choice, why: why.get(choice.groupId) ?? null }));
  return {
    runId: input.run.id,
    form: { intro: CHANGE_GROUP_INTRO, legend: GROUPS_WITH_A_PLACE, choices, noneWithAPlace: choices.length === 0 },
    card,
  };
}
