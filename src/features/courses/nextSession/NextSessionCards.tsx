"use client";

import { useState, type ReactNode } from "react";
import { firstName } from "@/app/(app)/dashboard/homeWords";
import type { OverviewPayload } from "@/app/api/courses/runs/[runId]/overview/route";
import type { CantMakeItView } from "@/lib/courses/cantMakeIt/model";
import { sessionOf, ticketEntryOf } from "@/lib/courses/excused/card";
import type { ExcusedOwnView } from "@/lib/courses/excused/own";
import type { JoiningOnlineView } from "@/lib/courses/joiningOnline/model";
import { sessionWhenLabel } from "@/lib/courses/londonLabels";
import {
  cardGroupLineWords,
  eyebrowNamesTheDay,
  hoursWords,
  movedWhyWords,
  onlineWithWords,
  sessionEyebrow,
} from "@/lib/courses/memberPageWords";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { visitsAroundTicket } from "@/lib/courses/visit/view";
import TicketExcuse from "../excused/TicketExcuse";
import { ticketFacts } from "../sessionChange/cardFacts";
import SessionNotice from "../sessionChange/SessionNotice";
import VisitCard from "../visit/VisitCard";
import TicketAnswers from "../weekly/TicketAnswers";
import NextSessionCard from "./NextSessionCard";

/**
 * THE CARDS FOR A PERSON'S NEXT SESSIONS, decided once for Home and the
 * programme page, from the same two things on both: the run's overview
 * (`GET /api/courses/runs/[runId]/overview`: the group's next session, its
 * notice, the person's own one-week visits) and what the server says the
 * card can be told (`nextSessionAnswersFor`: "Can't make it", "I'm joining
 * online" and being excused), which the programme page's server page hands
 * it and Home reads from `GET /api/courses/runs/[runId]/next-session`.
 *
 * THE NEXT SESSION IS ONE CARD, "Your next session · week 2": a one-week
 * visit when its session comes first (`visitsAroundTicket`), with "Cancel this
 * visit" and the buttons acting on the host's session; otherwise their own
 * group's session (`NextSessionCard`). An evening that is off is said over it
 * (`SessionNotice`), as before.
 *
 * Home draws that one card. The programme page also draws, under it, their
 * own group's session after a visit ("Week 3") and any visit further ahead,
 * as it always listed them.
 *
 * THE BUTTONS, per session, from the server's answers alone, as the
 * programme page always drew them: for somebody taking part, being excused
 * in its states with "I'm joining online" beside it (`TicketExcuse`); for
 * somebody who facilitates the group they hold a place in, today's instant
 * "Can't make it" (`TicketAnswers`). A read that failed offers neither.
 * `locked` (an admin looking as the member) draws them and lets nothing be
 * pressed.
 */

export type CardAnswers = {
  cantMakeIt: CantMakeItView | null;
  joiningOnline: JoiningOnlineView | null;
  excused: ExcusedOwnView | null;
};

/** The session the next session's card is about: the first visit when it comes first, else their own group's next. */
export function nextCardSession(data: OverviewPayload): { weekNumber: number; dateKey: string; startTimeLocal: string; visiting: boolean } | null {
  const facts = data.group ? ticketFacts(data.group) : null;
  const first = visitsAroundTicket(data.visits ?? [], facts).first[0] ?? null;
  if (first) return { weekNumber: first.weekNumber, dateKey: first.dateKey, startTimeLocal: first.startTimeLocal, visiting: true };
  return facts ? { weekNumber: facts.weekNumber, dateKey: facts.dateKey, startTimeLocal: facts.startTimeLocal, visiting: false } : null;
}

export default function NextSessionCards({
  runId,
  data,
  answers,
  locked = false,
  home = false,
  calendar = false,
  wrapClass,
  stackClass,
}: {
  runId: string;
  data: OverviewPayload;
  /** The server's answers; null while Home's read is on its way, or when it failed: no buttons. */
  answers: CardAnswers | null;
  locked?: boolean;
  /** Home: the next session's card alone, with Add to calendar in a row of its own. */
  home?: boolean;
  /** Offer Add to calendar on their own group's card. */
  calendar?: boolean;
  /** Wraps each card (the programme page's order on a phone). */
  wrapClass?: string;
  /** Holds the notice and the card together. */
  stackClass?: string;
}) {
  const { group } = data;
  const cantMakeIt = answers?.cantMakeIt ?? null;
  const joiningOnline = answers?.joiningOnline ?? null;
  const excused = answers?.excused ?? null;
  // What they said about joining a session online, as each press saved it.
  const [saidBySession, setSaidBySession] = useState<Record<string, boolean>>({});
  const saidOf = (view: JoiningOnlineView | null) => (view ? (saidBySession[view.sessionKey] ?? view.said) : false);
  const hearSaid = (view: JoiningOnlineView | null) => (said: boolean) => {
    if (view) setSaidBySession((was) => ({ ...was, [view.sessionKey]: said }));
  };

  const facts = group ? ticketFacts(group) : null;
  const incubator = data.programme?.kind === "incubator";
  const facilitators = (group?.facilitatorNames ?? []).map((name, index) => ({
    uid: `${group?.id ?? "group"}-${index}`,
    name,
    firstName: firstName(name) || name,
  }));
  const facilitatorFirstNames = facilitators.map((person) => person.firstName);

  // What the reader can tell us about the session their own card shows, of
  // the group it is their place in: each only when it is about that session.
  const nextKey = group?.calendar.nextSession?.sessionKey ?? null;
  const ownCantMakeIt = cantMakeIt && group?.id === cantMakeIt.groupId && nextKey === cantMakeIt.sessionKey ? cantMakeIt : null;
  const ownJoiningOnline = joiningOnline && group?.id === joiningOnline.groupId && nextKey === joiningOnline.sessionKey ? joiningOnline : null;
  // Which way in: a request an admin decides for somebody taking part, or
  // today's instant "Can't make it" for somebody who facilitates the group
  // they hold a place in (`ticketEntryOf`). Neither when the view is missing.
  const entry = ticketEntryOf(excused, group?.id ?? null);
  const ownSession = entry === "ask" ? sessionOf(excused, nextKey) : null;
  const ownAnswers =
    entry === "ask" && excused && ownSession && facts ? (
      <TicketExcuse
        key={ownSession.sessionKey}
        view={excused}
        session={ownSession}
        groupName={group?.name ?? ""}
        facilitatorFirstNames={facilitatorFirstNames}
        joiningOnline={ownJoiningOnline}
        hasLink={facts.joinUrl !== null}
        locked={locked}
        certificateNeeds={data.certificateNeeds ?? null}
        onSaidChange={hearSaid(ownJoiningOnline)}
      />
    ) : ownJoiningOnline || (entry === "instant" && ownCantMakeIt) ? (
      <TicketAnswers
        key={(ownCantMakeIt ?? ownJoiningOnline)?.sessionKey}
        cantMakeIt={entry === "instant" ? ownCantMakeIt : null}
        joiningOnline={ownJoiningOnline}
        hasLink={facts?.joinUrl !== null && facts?.joinUrl !== undefined}
        locked={locked}
        facilitatorFirstNames={facilitatorFirstNames}
        onSaidChange={hearSaid(ownJoiningOnline)}
      />
    ) : null;

  // THE PERSON'S OWN ONE-WEEK VISITS, each the card for the session they go
  // to: the buttons act on the host's session (the server's view of their
  // sessions names it), and "Cancel this visit" is offered until the earlier
  // of the two sessions starts.
  const around = visitsAroundTicket(data.visits ?? [], facts);
  const visitSessionOf = (visit: { sessionKey: string; hostGroupId: string }) =>
    excused?.sessions.find((session) => session.sessionKey === visit.sessionKey && session.visit?.groupId === visit.hostGroupId) ?? null;
  const visitCardOf = (visit: NonNullable<OverviewPayload["visits"]>[number], label: string) => {
    const onThis = joiningOnline && joiningOnline.groupId === visit.hostGroupId && joiningOnline.sessionKey === visit.sessionKey ? joiningOnline : null;
    const hostSession = entry === "ask" ? visitSessionOf(visit) : null;
    const card = (
      <VisitCard
        runId={runId}
        visit={visit}
        locked={locked}
        label={label}
        answers={
          excused && hostSession ? (
            <TicketExcuse
              key={`visit-${visit.sessionKey}`}
              view={excused}
              session={hostSession}
              groupName={visit.hostName}
              facilitatorFirstNames={visit.hostFacilitatorFirstNames}
              joiningOnline={onThis}
              hasLink={visit.meetingUrl !== null}
              locked={locked}
              certificateNeeds={data.certificateNeeds ?? null}
            />
          ) : onThis ? (
            <TicketAnswers
              key={onThis.sessionKey}
              cantMakeIt={null}
              joiningOnline={onThis}
              hasLink={visit.meetingUrl !== null}
              locked={locked}
              facilitatorFirstNames={visit.hostFacilitatorFirstNames}
            />
          ) : null
        }
      />
    );
    return (
      <div key={`visit-${visit.weekNumber}`} className={wrapClass}>
        {card}
      </div>
    );
  };

  // Their own group's card: next, unless a visit comes first.
  const visitFirst = around.first.length > 0;
  const todayKey = londonDateKey(new Date());
  const lastSessionDate = group?.calendar.lastSessionDate ?? "";
  const eyebrowInput = facts
    ? {
        isToday: facts.dateKey === todayKey,
        isFirst: facts.dateKey === (group?.calendar.firstSessionDate ?? ""),
        isLast: lastSessionDate !== "" && facts.dateKey === lastSessionDate,
        startTimeLocal: facts.startTimeLocal,
        weekNumbers: facts.weekNumbers,
        dateKey: facts.dateKey,
        online: facts.mode === "virtual",
        home,
        next: !visitFirst,
      }
    : null;
  const schedule = facts ? data.weekSchedule.find((week) => week.weekNumber === facts.weekNumber) : undefined;
  const saidOnline = saidOf(ownJoiningOnline);
  const ownCard =
    group && facts && eyebrowInput ? (
      <NextSessionCard
        facts={facts}
        eyebrow={sessionEyebrow(eyebrowInput)}
        heading={
          (eyebrowNamesTheDay(eyebrowInput)
            ? ""
            : sessionWhenLabel({ weekday: -1, startTimeLocal: facts.startTimeLocal, durationMinutes: facts.durationMinutes }, facts.dateKey)) ||
          hoursWords(facts.startTimeLocal, facts.durationMinutes)
        }
        groupLine={cardGroupLineWords(group.name, facilitatorFirstNames, incubator)}
        onlineLine={onlineWithWords(group.name, facilitatorFirstNames, incubator)}
        facilitators={facilitators}
        roomChanged={schedule?.roomChanged === true}
        why={
          facts.moved
            ? movedWhyWords({
                reason: facts.moved.reason,
                usualWeekday: group.usualSlot.weekday,
                usualStartTimeLocal: group.usualSlot.startTimeLocal,
                usualRoom: group.usualSlot.location,
              })
            : ""
        }
        saidOnline={saidOnline && facts.mode !== "virtual"}
        home={home}
        calendar={calendar}
        answers={ownAnswers}
      />
    ) : null;

  const notice = group?.sessionNotice ? <SessionNotice notice={group.sessionNotice} /> : null;
  const ownBlock: ReactNode =
    notice || ownCard ? (
      <div className={wrapClass}>
        <div className={stackClass}>
          {notice}
          {ownCard}
        </div>
      </div>
    ) : null;

  // The label of the next session's card, on the visit when it comes first.
  const visitLabel = (visit: { weekNumber: number; dateKey: string; startTimeLocal: string }) =>
    sessionEyebrow({
      isToday: visit.dateKey === todayKey,
      isFirst: false,
      startTimeLocal: visit.startTimeLocal,
      weekNumbers: [visit.weekNumber],
      home,
    });

  if (home) {
    const first = around.first[0] ?? null;
    if (first) {
      return (
        <>
          {notice}
          {visitCardOf(first, visitLabel(first))}
        </>
      );
    }
    return ownBlock;
  }
  return (
    <>
      {around.first.map((visit, at) => visitCardOf(visit, at === 0 ? visitLabel(visit) : ""))}
      {ownBlock}
      {around.later.map((visit) => visitCardOf(visit, ""))}
    </>
  );
}
