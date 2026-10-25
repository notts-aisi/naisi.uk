import {
  addDaysToKey,
  isValidDateKey,
  londonWallClockToInstant,
  type WeekPlanEntry,
} from "@/lib/courses/weekPlan";
import { formatRunStartShort } from "@/lib/courses/window";
import type { ProgrammeRole } from "../access";
import { hasBeenTold, isInTerm } from "../decisions";
import { isId, own } from "../keys";
import type { ApplicationDoc, ApplicationFormFields, DecisionDoc, ProgrammeSettings } from "../model";
import type { AdmissionRoundDoc } from "@/lib/firestore/admissionRounds";
import { standingOf } from "../status/standing";

/**
 * OFFERING A FREED PLACE: THE RULE, AS PURE FUNCTIONS.
 *
 * Decision day is the one send that tells everybody, and until this rule
 * nothing changed an outcome after it. A place given back after decision day
 * could only be offered by email, and nobody could then be put on the run.
 * The rule that replaces that is held strictly, and every part of it is here:
 *
 *  - AN OUTCOME CHANGES AFTER THE SEND ONLY FROM "No offer this time" TO AN
 *    INVITATION, written beside the result, which stays what decision day
 *    said ({@link offerProblem}). Nothing else after the send changes what
 *    anybody was told: every other writer's refusal stays as it is.
 *  - ONLY FOR A POOLED APPLICANT WHO RANKED THE PROGRAMME, and whom that
 *    programme's own lead pooled. Somebody it declined is not offered its
 *    place: its lead said they were not eligible.
 *  - ONLY WHILE A PLACE IS FREE (`freePlaces`, read, never rewritten: a place
 *    kept for an invitation nobody has answered is not free) AND THE WINDOW IS
 *    OPEN: from the send until the end of week 1 of the course run the
 *    programme names, worked out from that run's own calendar
 *    ({@link freedPlaceWindow}). No date is typed in code.
 *  - ONLY BY WHOEVER {@link offersFreedPlaces} SAYS: an admin, or the
 *    programme's own lead.
 *
 * Pure, with type-only imports from the server side, so the page, the routes,
 * the writer and the tests all ask the same functions.
 */

// ---------------------------------------------------------------------------
// Who offers
// ---------------------------------------------------------------------------

/**
 * WHO MAY OFFER A FREED PLACE, by their role on the programme: an admin, or
 * the programme's own lead, who places its people on the run it names and
 * publishes their groups. A reviewer reads and scores, and offers nothing.
 * The page, both routes and the writer's own transaction all ask this and
 * nothing else, and the role is `roleOnProgramme`'s, which asks a lead's
 * standing at the point of use.
 *
 * An admin sees every score, so the page shows them. A lead who is not an
 * admin is shown a person's score only once their own review of that
 * application is done (`otherReviewsShownTo`), as on every other list of
 * applications: the page asks the same rule of each person it lists.
 */
export function offersFreedPlaces(role: ProgrammeRole | null): boolean {
  return role === "admin" || role === "lead";
}

/** What anybody else with a role on the programme is told. */
export const ADMINS_OFFER = "Only an admin or the programme’s lead can offer freed places.";

// ---------------------------------------------------------------------------
// When: the window
// ---------------------------------------------------------------------------

/** The run, as much of it as its calendar needs. */
export type WindowRun = { startDate: string; weekPlan: readonly WeekPlanEntry[] };

/** Days in a week-plan slot: the run calendar's own constant. */
const DAYS_PER_SLOT = 7;

/**
 * The last day of week 1 of a run, as a civil date in London, or null when
 * its calendar cannot say: no start date, or no week numbered 1 in its plan.
 * Week 1 is the slot its plan numbers 1, wherever it sits, so a plan that
 * opens with a break still ends week 1 where the run's members see it end.
 */
export function weekOneLastDay(run: WindowRun): string | null {
  if (!isValidDateKey(run.startDate)) return null;
  const index = run.weekPlan.findIndex((entry) => entry.kind === "week" && entry.weekNumber === 1);
  if (index === -1) return null;
  return addDaysToKey(run.startDate, index * DAYS_PER_SLOT + DAYS_PER_SLOT - 1);
}

export type FreedPlaceWindow =
  /** Decisions have not gone out: nothing has been told, so nothing can change. */
  | { state: "before-send"; lastDayKey: null; closesAt: null }
  /** The programme names no course run, or the run it names is not there. */
  | { state: "no-run"; lastDayKey: null; closesAt: null }
  /** The run it names has no start date or no week 1. */
  | { state: "no-week-one"; lastDayKey: null; closesAt: null }
  /** Offers can be made until `closesAt`: midnight in London at the end of `lastDayKey`. */
  | { state: "open" | "closed"; lastDayKey: string; closesAt: Date };

/**
 * WHEN A FREED PLACE CAN BE OFFERED: from decision day's send until the end
 * of the last day of week 1 of the course run the programme names, in London.
 * The end is the first instant of the next day there, so the whole of that
 * day counts, whichever side of a clock change it falls.
 */
export function freedPlaceWindow(
  decisionsSentAt: Date | null,
  run: WindowRun | null,
  now: Date,
): FreedPlaceWindow {
  if (!decisionsSentAt) return { state: "before-send", lastDayKey: null, closesAt: null };
  if (!run) return { state: "no-run", lastDayKey: null, closesAt: null };
  const lastDayKey = weekOneLastDay(run);
  if (!lastDayKey) return { state: "no-week-one", lastDayKey: null, closesAt: null };
  const closesAt = londonWallClockToInstant(addDaysToKey(lastDayKey, 1), "00:00");
  return {
    state: now.getTime() < closesAt.getTime() ? "open" : "closed",
    lastDayKey,
    closesAt,
  };
}

/** "Wed 4 Nov": the last day of week 1, as the page and a refusal say it. */
export function lastDayLabel(window: FreedPlaceWindow): string | null {
  return window.lastDayKey ? (formatRunStartShort(window.lastDayKey) ?? null) : null;
}

/**
 * What the page says about the window, and what a refusal says when it is not
 * open. The open sentence is the board's own.
 */
export function windowSentence(
  window: FreedPlaceWindow,
  programme: Pick<ProgrammeSettings, "shortName">,
  termLabel: string,
): string {
  const day = lastDayLabel(window);
  switch (window.state) {
    case "before-send":
      return `Decisions for ${termLabel} haven’t gone out yet. Freed places are offered after decision day.`;
    case "no-run":
      return (
        `${programme.shortName} doesn’t name its course run yet, so the end of its week 1 can’t be ` +
        "worked out. Name the run on the programme’s Settings tab first."
      );
    case "no-week-one":
      return (
        `${programme.shortName}’s course run has no start date or no week 1 yet, so the end of week 1 ` +
        "can’t be worked out."
      );
    case "closed":
      return `Freed places on ${programme.shortName} could be offered until ${day}, the end of week 1. That has passed.`;
    case "open":
      return `You can offer freed places until ${day}, the end of week 1.`;
  }
}

// ---------------------------------------------------------------------------
// What: the form and the programme
// ---------------------------------------------------------------------------

type FormFacts = Pick<ApplicationFormFields, "programmes" | "decisionsSentAt"> & {
  round: Pick<AdmissionRoundDoc, "label" | "status" | "archived">;
};

export type Refusal = { status: 400 | 403 | 404 | 409; error: string };

export const NO_PROGRAMME = "That programme is not on this form.";

/**
 * Why nothing can be offered on this programme right now, or null. The form
 * itself first (a form that is finished offers nothing), then the programme,
 * then the window. Free places are counted by the caller, which holds the
 * term.
 */
export function programmeProblem(
  form: FormFacts,
  programmeId: string,
  window: FreedPlaceWindow,
): Refusal | null {
  const programme = own(form.programmes, programmeId);
  if (!programme) return { status: 404, error: NO_PROGRAMME };
  if (form.round.archived) {
    return { status: 409, error: "This application form is archived, so nothing can be offered from it." };
  }
  if (form.round.status === "cancelled") {
    return { status: 409, error: "This application form was cancelled, so nothing can be offered from it." };
  }
  if (form.round.status === "settled") {
    // Settling writes each person's record of the term. An offer made after
    // it would leave that record saying something that is no longer true.
    return { status: 409, error: "This term is settled, so no outcome can change now." };
  }
  if (programme.closed) {
    return { status: 409, error: `${programme.shortName} is closed this term, so nobody can be offered a place on it.` };
  }
  if (programme.places === null) {
    return { status: 409, error: `${programme.shortName} has no number of places set, so it has no freed places.` };
  }
  if (window.state !== "open") {
    return { status: 409, error: windowSentence(window, programme, form.round.label) };
  }
  return null;
}

/** Why `asked` people cannot be offered `free` places, or null when they can. */
export function placesProblem(
  programme: Pick<ProgrammeSettings, "shortName">,
  free: number | null,
  asked: number,
): string | null {
  if (free === null) return `${programme.shortName} has no number of places set, so it has no freed places.`;
  if (free <= 0) return `${programme.shortName} has no freed places to offer.`;
  if (asked > free) {
    return `${programme.shortName} has ${free === 1 ? "1 freed place" : `${free} freed places`}, so ${asked} people can’t be offered one.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Who: the people a freed place can be offered to
// ---------------------------------------------------------------------------

/** One person, as the rule reads them. `ranked` is their ranking as the form knows it. */
export type Candidate = {
  name: string;
  ranked: readonly string[];
  decision: Pick<DecisionDoc, "programmes"> | null;
  application: Pick<ApplicationDoc, "sent" | "status" | "result" | "invitation" | "attendance">;
};

/**
 * WHY THIS PERSON CANNOT BE OFFERED A FREED PLACE ON THIS PROGRAMME, as a
 * sentence an admin can act on, or null when they can.
 *
 * The person has to be in the term, told "No offer this time", holding no
 * invitation and no place since, to have ranked the programme, and to be one
 * its own lead pooled. Each is read off the documents the caller holds: the
 * writer asks this of the documents its transaction read.
 */
export function offerProblem(
  candidate: Candidate,
  programme: Pick<ProgrammeSettings, "id" | "shortName">,
): string | null {
  const { name, application } = candidate;
  if (!application.sent) return `${name} hasn’t sent an application on this form.`;
  if (!isInTerm(application)) {
    return `${name} is no longer in the term: they withdrew, or gave a place or an invitation back.`;
  }
  if (!hasBeenTold(application)) return `${name} hasn’t been told their outcome yet.`;
  if (application.result?.kind !== "no-offer") {
    return `${name} wasn’t told “No offer this time”, so a freed place isn’t theirs to be offered.`;
  }
  const standing = standingOf(application);
  if (standing.kind === "invitation") return `${name} already has an invitation to answer.`;
  if (standing.kind === "place") return `${name} already holds a place.`;
  if (standing.kind !== "no-place") return `${name} has nothing on their application a freed place can follow.`;
  if (!candidate.ranked.includes(programme.id)) {
    return `${name} didn’t rank ${programme.shortName}, so its freed places aren’t theirs to be offered.`;
  }
  const decided = own(candidate.decision?.programmes, programme.id)?.decision ?? null;
  if (decided === "decline") {
    return `${programme.shortName} declined ${name}, so they aren’t offered its place.`;
  }
  if (decided !== "pool") return `${programme.shortName} didn’t pool ${name}, so they aren’t offered its place.`;
  return null;
}

// ---------------------------------------------------------------------------
// Where: a seat in a group whose time the email names
// ---------------------------------------------------------------------------

/** A group, as much of it as a seat count needs. */
export type SeatGroup = { id: string; capacity: number | null; memberCount: number };

/**
 * How many more people a group can be promised, or null for a group with no
 * cap: its places, less the people in it and less the freed places already
 * offered naming it that still wait on a seat. Never below zero.
 */
export function seatsFree(group: SeatGroup, waiting: ReadonlyMap<string, number>): number | null {
  if (group.capacity === null) return null;
  return Math.max(0, group.capacity - group.memberCount - (waiting.get(group.id) ?? 0));
}

/**
 * The freed places already offered that wait on a seat in a group, by group
 * id: offered and not answered, or accepted by somebody not yet put in a
 * group on the run (`placedUids`). A place said no to, or given back, waits
 * on nothing.
 */
export function waitingOnGroups(
  applications: readonly Pick<
    ApplicationDoc,
    "uid" | "sent" | "status" | "result" | "invitation" | "attendance" | "freedPlace"
  >[],
  placedUids: ReadonlySet<string>,
): Map<string, number> {
  const waiting = new Map<string, number>();
  for (const application of applications) {
    const groupId = application.freedPlace?.groupId;
    if (!groupId || !isInTerm(application)) continue;
    const standing = standingOf(application);
    const waits =
      standing.kind === "invitation" ||
      (standing.kind === "place" && standing.via === "invitation" && !placedUids.has(application.uid));
    if (waits) waiting.set(groupId, (waiting.get(groupId) ?? 0) + 1);
  }
  return waiting;
}

// ---------------------------------------------------------------------------
// What a request may carry, checked before anything is read
// ---------------------------------------------------------------------------

/** The most people one press offers places to. Free places bound it long before this does. */
export const MAX_PICKS = 50;

/** One person picked, and the group whose weekly time their email names. */
export type OfferPick = { uid: string; groupId: string };

/** "Send N invitations": who, which group's time for each, the day to accept by, and the number on the button. */
export type OfferRequest = { picks: OfferPick[]; replyBy: string; invitations: number };

/** "Send a test to me": the first person picked, as the send would email them. */
export type TestRequest = { pick: OfferPick; replyBy: string };

/** "Send N emails still to go": the number on the button. */
export type OwedRequest = { emails: number };

type Parsed<T> = { ok: true; request: T } | { ok: false; error: string };

export const REQUEST_PROBLEMS = {
  noPicks: "Pick at least one person to offer a place to.",
  tooMany: `Offer places to at most ${MAX_PICKS} people at a time.`,
  pick: "Each person picked needs a group whose time their email names. Reload the page and pick again.",
  twice: "Each person can be picked once.",
  replyBy: "Choose the day they’re asked to accept by.",
  replyByPast: "The day to accept by has passed. Choose today or a later day.",
  count:
    "The button and the people picked disagree on how many invitations this sends. Reload the page and check again.",
  emails: "Say how many emails this sends. Reload the page and press the button again.",
} as const;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function parsePick(v: unknown): OfferPick | null {
  const raw = asRecord(v);
  return isId(raw.uid) && isId(raw.groupId) ? { uid: raw.uid, groupId: raw.groupId } : null;
}

/** A day to accept by: a real date in London, today or later. `today` is London's date key. */
export function parseReplyBy(v: unknown, today: string): Parsed<string> {
  if (typeof v !== "string" || !isValidDateKey(v)) return { ok: false, error: REQUEST_PROBLEMS.replyBy };
  if (v < today) return { ok: false, error: REQUEST_PROBLEMS.replyByPast };
  return { ok: true, request: v };
}

export function parseOfferRequest(body: unknown, today: string): Parsed<OfferRequest> {
  const raw = asRecord(body);
  if (!Array.isArray(raw.picks) || raw.picks.length === 0) return { ok: false, error: REQUEST_PROBLEMS.noPicks };
  if (raw.picks.length > MAX_PICKS) return { ok: false, error: REQUEST_PROBLEMS.tooMany };
  const picks: OfferPick[] = [];
  for (const entry of raw.picks) {
    const pick = parsePick(entry);
    if (!pick) return { ok: false, error: REQUEST_PROBLEMS.pick };
    if (picks.some((picked) => picked.uid === pick.uid)) return { ok: false, error: REQUEST_PROBLEMS.twice };
    picks.push(pick);
  }
  const replyBy = parseReplyBy(raw.replyBy, today);
  if (!replyBy.ok) return replyBy;
  if (raw.invitations !== picks.length) return { ok: false, error: REQUEST_PROBLEMS.count };
  return { ok: true, request: { picks, replyBy: replyBy.request, invitations: picks.length } };
}

export function parseTestRequest(body: unknown, today: string): Parsed<TestRequest> {
  const raw = asRecord(body);
  const pick = parsePick(raw);
  if (!pick) return { ok: false, error: REQUEST_PROBLEMS.pick };
  const replyBy = parseReplyBy(raw.replyBy, today);
  if (!replyBy.ok) return replyBy;
  return { ok: true, request: { pick, replyBy: replyBy.request } };
}

export function parseOwedRequest(body: unknown): Parsed<OwedRequest> {
  const emails = asRecord(body).emails;
  if (typeof emails !== "number" || !Number.isInteger(emails) || emails < 1) {
    return { ok: false, error: REQUEST_PROBLEMS.emails };
  }
  return { ok: true, request: { emails } };
}
