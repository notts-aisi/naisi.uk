import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { londonDayLabel } from "@/lib/courses/londonLabels";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { isAddressableId } from "@/lib/courses/registerAccess";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import type { SessionUser } from "@/lib/firebase/session";
import { visitInWeek, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { VisitRequestDoc } from "@/lib/firestore/courseMemberRequests";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { requestStandingOf, weeksAbout } from "../excused/model";
import { dbReader, memberSessionChoices, ownWeeksAhead, readVisitFacts, type OwnWeek, type VisitFacts } from "../visit/plan";
import type { VisitSessionChoiceView } from "../visit/view";
import { hostRegisterIdOf, notHeldIn, visitRequestStandingOf, type SessionWhen, type VisitRequestStanding } from "./standing";
import {
  askedLineWords,
  cantGoAheadWords,
  declinedMessageWords,
  introWords,
  replyLineWords,
  rowLineWords,
  rowTitleWords,
  sentWhenWords,
  sessionsLegendWords,
  withdrewWords,
  type OwnVisitRowState,
} from "./words";

/**
 * A PERSON'S OWN REQUESTS TO GO TO ANOTHER SESSION, for their card (Home and
 * the programme page, through `nextSessionAnswersFor`), their form's page and
 * "Your requests". Their own records only, read by their own uid.
 *
 * WHICH WEEK IS OFFERED (`offeredWeekOf`): the week of their next session with
 * their own group, still to come (`ownWeeksAhead`, the visit's own rule), and
 * only while nothing else stands that week: no visit, no request to be
 * excused about that session waiting, and no request of theirs to go to
 * another session waiting anywhere ("One request at a time"). The people who
 * can have a visit at all are the staff visit's (`readVisitFacts` as the
 * member): an active learner's told place in a group, on a run with more than
 * one live group that is not an incubator, of somebody who facilitates no
 * live group of it. Anybody else is offered nothing and answered null.
 *
 * WHICH SESSIONS (`memberSessionChoices`): the staff visit's own, with its
 * own count of places left that week.
 */

/** One request of theirs, as "Your requests" lists it. */
export type OwnVisitRow = {
  id: string;
  askedAt: string | null;
  title: string;
  line: string;
  state: OwnVisitRowState;
  /** A reply sent without deciding, or with the decision: "Zach: “…”"; null with none. */
  reply: string | null;
};

/** What the card says about these requests, and offers. */
export type AnotherSessionView = {
  runId: string;
  /** The week "Go to another session this week" asks about, or null when nothing can be asked now. */
  offer: { weekNumber: number; homeGroupId: string; sessionKey: string } | null;
  /** The one request still waiting, with what the card says of it. */
  waiting: {
    requestId: string;
    weekNumber: number;
    hostName: string;
    sent: string;
    /** "You asked to go to Group I’s session on Wed 11 Nov, 6pm. An admin decides.", or, when the host's session is off, why it can't go ahead. */
    line: string;
    reply: string | null;
  } | null;
  /** A decline they have not dismissed, while that week's session has not ended. */
  declined: { requestId: string; line: string } | null;
  /**
   * "You withdrew your request to go to Group I.", for a request they
   * withdrew today while nothing of theirs waits, until that week's session
   * ends: worked out here, so the read the press itself starts keeps it.
   */
  withdrawn: { requestId: string; line: string } | null;
  rows: OwnVisitRow[];
};

const iso = (at: Date | null): string | null => (at ? at.toISOString() : null);

/** The week a person may ask about now, from the facts as the staff visit reads them; null when none. */
export function offeredWeekOf(facts: VisitFacts, standings: ReadonlyMap<string, VisitRequestStanding>, now: Date): OwnWeek | null {
  if (facts.oneGroup) return null;
  // One request at a time: one still waiting anywhere on the run.
  if ([...standings.values()].some((standing) => standing.state === "waiting")) return null;
  const week = ownWeeksAhead(facts, now)[0] ?? null;
  if (!week) return null;
  if (visitInWeek(facts.place, week.weekNumber)) return null;
  // A request to be excused about their own session that week, still waiting: decided first.
  const own = resolveSessions(facts.run, week.home).filter((session) => session.weekNumber === week.weekNumber);
  if (own.some((session) => requestStandingOf(weeksAbout(facts.requests, facts.place.uid, session.sessionKey, { groupId: week.home.id, visiting: false })) === "waiting")) {
    return null;
  }
  return week;
}

/** Each of their visit requests, by id, as it stands now. Reads the host registers that say a session did not happen from the facts. */
export function standingsOf(facts: VisitFacts, now: Date): Map<string, VisitRequestStanding> {
  const out = new Map<string, VisitRequestStanding>();
  for (const request of facts.visitRequests) {
    out.set(request.id, visitRequestStandingOf({ request, run: facts.run, groups: facts.groups, place: facts.place, hostNotHeld: hostNotHeldIn(facts, request), now }));
  }
  return out;
}

/** Whether the host's register that week, as the facts read it, says the session did not happen (`hostRegisterIdOf`, the one reading). */
function hostNotHeldIn(facts: Pick<VisitFacts, "run" | "groups" | "registers">, request: VisitRequestDoc): boolean {
  const id = hostRegisterIdOf(facts.run, facts.groups, request);
  return id ? notHeldIn(id, facts.registers.get(id)) : false;
}

/** The host's session as it is now, or as it was offered when they asked. */
function hostWhenOf(standing: VisitRequestStanding, request: VisitRequestDoc): SessionWhen {
  if (standing.state === "waiting" && standing.hostSession) {
    return { dateKey: standing.hostSession.dateKey, startTimeLocal: standing.hostSession.session.startTimeLocal };
  }
  return request.change.asked;
}

/** The rows of "Your requests", newest first. A request that went with their place (`gone`) is left off: no words say who closed it. */
export function ownRowsOf(
  requests: readonly VisitRequestDoc[],
  standings: ReadonlyMap<string, VisitRequestStanding>,
  names: { group: (id: string) => string; firstName: (uid: string) => string },
  now: Date,
): OwnVisitRow[] {
  return requests.flatMap((request) => {
    const standing = standings.get(request.id) ?? { state: request.status };
    if (standing.state === "gone") return [];
    const state: OwnVisitRowState = standing.state === "closed" ? "closed" : standing.state === "waiting" ? "waiting" : standing.state;
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
        title: rowTitleWords(names.group(request.change.hostGroupId), request.change.weekNumber),
        line: rowLineWords({
          state,
          by: decider,
          at: state === "withdrawn" ? request.withdrawnAt : request.decidedAt,
          askedAt: request.askedAt,
          now,
          lapse: standing.state === "closed" ? standing.lapse : null,
        }),
        state,
        reply,
      },
    ];
  });
}

/** First names of the people these requests name: who decided, who replied. */
async function firstNamesOf(db: Firestore, requests: readonly VisitRequestDoc[]): Promise<Map<string, string>> {
  const uids = [...new Set(requests.flatMap((request) => [request.decidedByUid ?? "", ...request.replies.map((reply) => reply.byUid)]))].filter(
    (uid) => uid && isAddressableId(uid),
  );
  const snaps = uids.length ? await db.getAll(...uids.map((uid) => db.collection("users").doc(uid))) : [];
  return new Map(snaps.filter((snap) => snap.exists).map((snap) => [snap.id, firstNameOfUser(snap.data() ?? {})]));
}

/** The card's view, from facts already read. */
export async function anotherSessionOf(db: Firestore, facts: VisitFacts, now: Date): Promise<AnotherSessionView> {
  const standings = standingsOf(facts, now);
  const firstNames = await firstNamesOf(db, facts.visitRequests);
  const groupName = (id: string) => facts.groups.find((group) => group.id === id)?.name.trim() || "another group";
  const firstName = (uid: string) => firstNames.get(uid) ?? "";
  const week = offeredWeekOf(facts, standings, now);
  const live = facts.visitRequests.find((request) => standings.get(request.id)?.state === "waiting") ?? null;
  let waiting: AnotherSessionView["waiting"] = null;
  if (live && live.askedAt) {
    const standing = standings.get(live.id) as Extract<VisitRequestStanding, { state: "waiting" }>;
    const hostName = groupName(live.change.hostGroupId);
    const lastReply = live.replies[live.replies.length - 1] ?? null;
    waiting = {
      requestId: live.id,
      weekNumber: live.change.weekNumber,
      hostName,
      sent: sentWhenWords(live.askedAt, now),
      line: standing.cantGoAhead ? cantGoAheadWords(hostName, hostWhenOf(standing, live).dateKey) : askedLineWords(hostName, hostWhenOf(standing, live)),
      reply: lastReply ? replyLineWords(firstName(lastReply.byUid), lastReply.text) : null,
    };
  }
  // That week's session has not ended: their own group's that week, or the
  // host's with none of their own.
  const weekStillOn = (request: VisitRequestDoc): boolean => {
    const home = facts.groups.find((group) => group.id === request.groupId) ?? null;
    const host = facts.groups.find((group) => group.id === request.change.hostGroupId) ?? null;
    const ownSession = home ? resolveSessions(facts.run, home).find((each) => each.weekNumber === request.change.weekNumber && each.occurrence === 1 && each.dateKey !== "" && !each.cancelled) : undefined;
    const hostSession = host ? resolveSessions(facts.run, host).find((each) => each.weekNumber === request.change.weekNumber && each.occurrence === 1 && each.dateKey !== "") : undefined;
    const session = ownSession ?? hostSession;
    const ends = session ? sessionInstants(session).endsAt : null;
    return ends !== null && ends.getTime() > now.getTime();
  };
  // Withdrawn today, with nothing of theirs waiting since: the line stays.
  const withdrawnRequest =
    live === null
      ? ([...facts.visitRequests]
          .sort((a, b) => (b.withdrawnAt?.getTime() ?? 0) - (a.withdrawnAt?.getTime() ?? 0))
          .find((request) => request.status === "withdrawn" && request.withdrawnAt !== null && londonDayLabel(request.withdrawnAt) === londonDayLabel(now) && weekStillOn(request)) ?? null)
      : null;
  // A decline not dismissed, while that week's session has not ended.
  const declinedRequest =
    facts.visitRequests.find((request) => {
      if (request.status !== "declined" || request.dismissedAt) return false;
      return weekStillOn(request);
    }) ?? null;
  return {
    runId: facts.run.id,
    offer: week ? { weekNumber: week.weekNumber, homeGroupId: week.home.id, sessionKey: week.session.sessionKey } : null,
    waiting,
    declined: declinedRequest
      ? {
          requestId: declinedRequest.id,
          line: declinedMessageWords({
            hostName: groupName(declinedRequest.change.hostGroupId),
            hostDateKey: hostWhenOf(standings.get(declinedRequest.id) ?? { state: "declined" }, declinedRequest).dateKey,
            deciderFirstName: declinedRequest.decidedByUid ? firstName(declinedRequest.decidedByUid) : "",
            reply: declinedRequest.reply,
          }),
        }
      : null,
    withdrawn: withdrawnRequest ? { requestId: withdrawnRequest.id, line: withdrewWords(groupName(withdrawnRequest.change.hostGroupId)) } : null,
    rows: ownRowsOf(facts.visitRequests, standings, { group: groupName, firstName }, now),
  };
}

/** The view for the card, or null for anybody who can have no visit at all (`readVisitFacts` as the member). */
export async function anotherSessionFor(
  db: Firestore,
  input: { user: SessionUser; run: CourseRunDoc; enrolment: CourseEnrolmentDoc | null; groups: readonly CourseGroupDoc[]; now: Date },
): Promise<AnotherSessionView | null> {
  if (!input.enrolment?.groupId || input.enrolment.uid !== input.user.uid) return null;
  const read = await readVisitFacts(dbReader(db), db, input.run.id, input.user.uid, "ahead", input.now, "member");
  if (!read.ok) return null;
  return anotherSessionOf(db, read.facts, input.now);
}

/** The form's page, as its server page draws it. */
export type AnotherSessionPageView = {
  runId: string;
  /** The form, or null when nothing can be asked now (the page says so in one sentence). */
  form: {
    weekNumber: number;
    intro: string;
    legend: string;
    choices: VisitSessionChoiceView[];
    /** No session of the week has a place. */
    noneWithAPlace: boolean;
  } | null;
  card: AnotherSessionView;
};

export async function anotherSessionPageFor(
  db: Firestore,
  input: { user: SessionUser; run: CourseRunDoc; enrolment: CourseEnrolmentDoc | null; now: Date },
): Promise<AnotherSessionPageView | null> {
  if (!input.enrolment?.groupId || input.enrolment.uid !== input.user.uid) return null;
  const read = await readVisitFacts(dbReader(db), db, input.run.id, input.user.uid, "ahead", input.now, "member");
  if (!read.ok) return null;
  const card = await anotherSessionOf(db, read.facts, input.now);
  const week = card.offer ? ownWeeksAhead(read.facts, input.now).find((each) => each.weekNumber === card.offer?.weekNumber) ?? null : null;
  if (!week) return { runId: input.run.id, form: null, card };
  const choices = memberSessionChoices(read.facts, week.weekNumber, input.now);
  return {
    runId: input.run.id,
    form: {
      weekNumber: week.weekNumber,
      intro: introWords(week.home.name, week.weekNumber),
      legend: sessionsLegendWords(week.weekNumber),
      choices,
      noneWithAPlace: choices.every((choice) => choice.full),
    },
    card,
  };
}
