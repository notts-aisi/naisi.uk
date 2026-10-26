import { firstWord } from "@/lib/firestore/applicationEmails";
import { couldBeFollowed } from "@/lib/courses/followable";
// By its `@/` path, as every caller of a token filler imports one, so the
// tree walk in tests/email-unfilled-tokens.test.mjs finds the call.
import {
  NAISI_SIGN_OFF,
  always,
  composeWholeEmail,
  oneLine,
  placeInSentence,
  typed,
  type ComposedEmail,
  type EmailValue,
  type NoFirstSession,
  type PlacementTemplate,
  type PlacementTokenRule,
  type PlacementWhere,
  type WholeEmailProblem,
} from "@/lib/courses/placementEmail";

/**
 * THE EMAIL A FACILITATOR IS SENT WHEN GROUPS GO OUT: "You’re facilitating
 * Group B: Tuesdays at 6pm".
 *
 * Publish sends it once to each facilitator of each group with somebody in
 * it, beside the email that tells each person their group. It says when the
 * group meets, from its first session to its last, where, who else
 * facilitates it, how many are in it, and links to the facilitator's group
 * page, signed by the lead of the programme that names the run, or by NAISI
 * when no lead stands to sign it, as the group email is. The wording
 * is a template an admin can edit (`course-facilitating`, "You’re
 * facilitating" in Email designs), with `{tokens}` in it. Its seed copy is in
 * the board's words (st-emails): the room and who else facilitates sit
 * inside the sentence that says when the group meets, through the inline
 * tokens `{place}`, `{placeNote}` and `{facilitatingWith}`, and
 * `{namesOnPage}` says where the people's names are, and week 1's guide with
 * them while the group page shows it.
 *
 * ## Written whole or not at all
 *
 * By the placement email's own composer (`composeWholeEmail` in
 * `./placementEmail.ts`), under `FACILITATING_TOKEN_RULES`, so every rule
 * written there holds here: a missing value takes its own paragraph and
 * nothing beside it, no empty shell is left, a block with no token is never
 * touched, an essential token with nothing to fill it refuses the email, and
 * nothing returned for a send carries a token. Publish refuses with the
 * sentences below rather than send one that cannot be written.
 *
 *  - `always`: the facilitator's name, the course and the run.
 *  - `essential`: the group's name, its weekly time, its first and last
 *    session, how many are in it and the link to its page. The email exists
 *    to say these.
 *  - `optional`: where it meets, who else facilitates it, and who signs it.
 *    A group may have no room yet, one facilitator, or a run no programme
 *    names, and the paragraph that would have said so is left out. Exactly
 *    one of the two sign-offs is filled: the lead's (`{leadName}` with
 *    `{programmeName}`), or, when no lead stands, `{naisiSignOff}`, the
 *    group email's own `NAISI_SIGN_OFF`.
 *  - `inline`: the same where and who, worded to stand in the sentence or go
 *    from it ("in Hallward B12", "You’re facilitating with Sofia."), as the
 *    board says them. With nothing to say each is left out of its sentence
 *    alone (see `./placementEmail.ts`).
 *
 * `{where}` and `{coFacilitators}` stay on the list for wording saved before
 * the board's, which uses them in paragraphs of their own.
 *
 * ## The dates are the group's own
 *
 * The first and last session come from the group's own calendar (a group can
 * pace itself apart from its run), worked out by the caller with
 * `resolveSessions`, the resolver every schedule surface uses. Nothing here
 * reads a date.
 *
 * ## Never a meeting link
 *
 * As for the placement email, and for the same reason: an email can be
 * forwarded. An online group is told it is online and that the link to join
 * is on the facilitator's group page, which shows it to that group's
 * facilitators and admins. A room with anything in it a reader could follow
 * is not printed (`couldBeFollowed`, the function the placement email asks),
 * and the facilitator is told where to find it. `PlacementWhere` carries no
 * address, so the composer is never handed one.
 *
 * Pure, with no server import and no pattern of its own: every pattern that
 * reads the wording or a typed value is in `./placementEmail.ts` and
 * `./followable.ts`, where `tests/email-pattern-shapes.test.mjs` holds them.
 */

export const FACILITATING_TOKEN_RULES = {
  firstName: "always",
  preferredName: "always",
  courseTitle: "always",
  runLabel: "always",
  groupName: "essential",
  weeklySlot: "essential",
  firstSession: "essential",
  lastSession: "essential",
  groupSize: "essential",
  groupUrl: "essential",
  where: "optional",
  coFacilitators: "optional",
  leadName: "optional",
  programmeName: "optional",
  naisiSignOff: "optional",
  namesOnPage: "always",
  place: "inline",
  placeNote: "inline",
  facilitatingWith: "inline",
} as const satisfies Record<string, PlacementTokenRule>;

export type FacilitatingToken = keyof typeof FACILITATING_TOKEN_RULES;

export const FACILITATING_TOKENS = Object.keys(FACILITATING_TOKEN_RULES) as FacilitatingToken[];

/** The label of the template in the designer, so a sentence names it as the screen does. */
export const FACILITATING_TEMPLATE_LABEL = "You’re facilitating";

/** What the email is told about one facilitator of one group. Null is "there is nothing to say". */
export type FacilitatingFacts = {
  /** The facilitator's name, as the greeting uses it. */
  name: string;
  courseTitle: string;
  runLabel: string;
  groupName: string | null;
  /** "Tuesdays at 6pm" (`weeklySlotWords`), or null while the group has no day and time. */
  weeklySlot: string | null;
  /**
   * "Tue 3 Nov": the group's first session, on its own calendar, or its next
   * one once it has met (Publish's plan works it out).
   */
  firstSession: string | null;
  /** "Tue 8 Dec": its last. */
  lastSession: string | null;
  /** Where the group meets each week. Never an address. */
  where: PlacementWhere | null;
  /** The other facilitators' first names ("Sofia", "Sofia and Tom"), or null for somebody facilitating alone. */
  coFacilitators: string | null;
  /**
   * How many people in the group have been told their group by the time the
   * email goes: never one untold (Publish's plan works it out).
   */
  groupSize: number | null;
  /** The facilitator's group page, as a whole address. Null when the site does not know its own address. */
  groupUrl: string | null;
  /** The first name of the lead of the programme that names the run. */
  leadName: string | null;
  /** That programme's short name: "AGI Strategy". */
  programmeName: string | null;
  /**
   * Whether the facilitator's group page shows week 1's guide as the email
   * goes: the group's next session is its week 1, and week 1 of the course's
   * facilitator guide has its session plan or its notes (Publish's plan asks
   * the guide, through the guide's own gate for the group's facilitators).
   * Only then does `{namesOnPage}` say "and week 1’s guide".
   */
  weekOneGuide: boolean;
};

// ---------------------------------------------------------------------------
// Words for the values
// ---------------------------------------------------------------------------

/** Index = `GroupSession.weekday` (`Date.getDay()`, 0 = Sunday). */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * "6pm", "6:30pm", "12pm", "12am": a stored "HH:MM" wall-clock time the way
 * the site writes one. Null for anything that is not a time of day.
 */
export function clockWords(startTimeLocal: string): string | null {
  const parts = startTimeLocal.split(":");
  if (parts.length !== 2 || parts[0].length !== 2 || parts[1].length !== 2) return null;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "am" : "pm";
  return minute === 0 ? `${twelve}${suffix}` : `${twelve}:${String(minute).padStart(2, "0")}${suffix}`;
}

/** "Tuesdays at 6pm": a group's standing weekly slot. Null while it has no day or no time. */
export function weeklySlotWords(session: { weekday: number; startTimeLocal: string }): string | null {
  const day = WEEKDAYS[session.weekday];
  const at = clockWords(session.startTimeLocal);
  return day && at ? `${day}s at ${at}` : null;
}

/** The `{groupSize}` sentence, so a group of one reads right. */
export function groupSizeSentence(count: number): string {
  return count === 1 ? "There is 1 person in the group." : `There are ${count} people in the group.`;
}

/**
 * The `{namesOnPage}` sentence, after the group's size: where its people's
 * names are, and week 1's guide with them when the group page shows it
 * (`FacilitatingFacts.weekOneGuide`): the board's "Their names and week 1’s
 * guide are on your group page.". Without the guide, the names alone, so the
 * email never promises a link the page does not draw. A group of one reads
 * right.
 */
export function namesOnPageSentence(count: number, weekOneGuide = false): string {
  if (weekOneGuide) {
    return count === 1 ? "Their name and week 1’s guide are on your group page." : "Their names and week 1’s guide are on your group page.";
  }
  return count === 1 ? "Their name is on your group page." : "Their names are on your group page.";
}

/** "You’re facilitating with Sofia.": the `{facilitatingWith}` sentence. Null for somebody facilitating alone. */
export function facilitatingWithSentence(coFacilitators: string | null): string | null {
  const others = oneLine(coFacilitators);
  return others ? `You’re facilitating with ${others}.` : null;
}

/** "Sofia", "Sofia and Tom", "Sofia, Tom and Ana". */
export function namesInWords(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The weekly reminder's own word for a session that is online. */
const ONLINE = "Online";

/** Where an online group's facilitator finds the link to join: their group page shows it to them. */
const LINK_IS_ON_THE_GROUP_PAGE = "The link to join is on your group page.";

/** What stands for a room whose text is not printed. True of a room and of a call alike. */
const WHERE_IS_ON_THE_GROUP_PAGE = "You’ll find where it meets on your group page.";

function whereValue(where: PlacementWhere | null): EmailValue | null {
  if (!where) return null;
  if (where.kind === "on-page") return typed(WHERE_IS_ON_THE_GROUP_PAGE);
  // Asked again here, where it is printed, whatever the caller classified.
  if (where.kind === "room") return typed(couldBeFollowed(where.room) ? WHERE_IS_ON_THE_GROUP_PAGE : where.room);
  return typed(where.linkOnPage ? `${ONLINE}. ${LINK_IS_ON_THE_GROUP_PAGE}` : ONLINE);
}

/**
 * The `{placeNote}` sentence: for a place the email does not print, where
 * the facilitator finds it. The link to join, for an online group whose page
 * has one; where it meets, for a room with something a reader could follow
 * typed into it. Never an address.
 */
function placeNoteValue(where: PlacementWhere | null): EmailValue | null {
  if (!where) return null;
  if (where.kind === "online") return where.linkOnPage ? typed(LINK_IS_ON_THE_GROUP_PAGE) : null;
  if (where.kind === "on-page" || couldBeFollowed(where.room)) return typed(WHERE_IS_ON_THE_GROUP_PAGE);
  return null;
}

function valuesOf(facts: FacilitatingFacts): Record<FacilitatingToken, EmailValue | null> {
  const name = oneLine(facts.name);
  const size = facts.groupSize;
  const counted = size !== null && Number.isInteger(size) && size > 0;
  const lead = typed(facts.leadName);
  return {
    firstName: always(firstWord(name)),
    preferredName: always(name),
    courseTitle: always(facts.courseTitle),
    runLabel: always(facts.runLabel),
    groupName: typed(facts.groupName),
    weeklySlot: typed(facts.weeklySlot),
    firstSession: typed(facts.firstSession),
    lastSession: typed(facts.lastSession),
    // A group with nobody in it is not one a facilitator is told about yet.
    groupSize: counted ? typed(groupSizeSentence(size)) : null,
    groupUrl: typed(facts.groupUrl),
    where: whereValue(facts.where),
    coFacilitators: typed(facts.coFacilitators),
    leadName: lead,
    programmeName: typed(facts.programmeName),
    // Exactly one of the two sign-offs is there: the lead's, or NAISI's, as on the group email.
    naisiSignOff: lead ? null : typed(NAISI_SIGN_OFF),
    // The board's words for the same facts (see the header).
    namesOnPage: always(counted ? namesOnPageSentence(size, facts.weekOneGuide === true) : ""),
    place: typed(placeInSentence(facts.where)),
    placeNote: placeNoteValue(facts.where),
    facilitatingWith: typed(facilitatingWithSentence(facts.coFacilitators)),
  };
}

// ---------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------

/**
 * The email for one facilitator of one group, or the problems that stop it.
 * `proof: true` is the designer's, exactly as for the placement email: a
 * token this email cannot fill is left as typed for the admin to see.
 */
export function composeFacilitatingEmail(
  template: PlacementTemplate,
  facts: FacilitatingFacts,
  options: { proof?: boolean } = {},
): ComposedEmail {
  return composeWholeEmail(template, valuesOf(facts), FACILITATING_TOKEN_RULES, options);
}

/**
 * The facts for a PROOF: the designer's preview and its test send, which hold
 * sample values by token name. Missing or blank is "nothing to say", so a
 * proof leaves out what a send would. Never used for a send. The board's
 * tokens follow from the same samples as a send's follow from its facts:
 * `{place}` and `{placeNote}` from `where`, `{facilitatingWith}` from
 * `coFacilitators`, `{namesOnPage}` from `groupSize`.
 */
export function facilitatingFactsFromSample(sample: Readonly<Record<string, string | undefined>>): FacilitatingFacts {
  const said = (token: FacilitatingToken): string | null => oneLine(sample[token]) || null;
  const where = said("where");
  const size = Number(said("groupSize") ?? "");
  return {
    name: said("preferredName") ?? said("firstName") ?? "",
    courseTitle: said("courseTitle") ?? "",
    runLabel: said("runLabel") ?? "",
    groupName: said("groupName"),
    weeklySlot: said("weeklySlot"),
    firstSession: said("firstSession"),
    lastSession: said("lastSession"),
    where: where ? { kind: "room", room: where } : null,
    coFacilitators: said("coFacilitators"),
    groupSize: Number.isInteger(size) && size > 0 ? size : null,
    groupUrl: said("groupUrl"),
    leadName: said("leadName"),
    programmeName: said("programmeName"),
    // A sample is no course, so there is no guide to point at: a proof says
    // the names alone, as a send does for a course whose guide lacks week 1.
    weekOneGuide: false,
  };
}

// ---------------------------------------------------------------------------
// What an admin is told when publishing is refused
// ---------------------------------------------------------------------------

/** One group whose facilitators cannot be emailed, and why. */
export type RefusedFacilitatorGroup = {
  /** The group's name, or "" when it has none. */
  name: string;
  problems: WholeEmailProblem[];
  /** Why there is no first or last session, when that is one of the problems. */
  noFirstSession?: NoFirstSession;
};

function groupsInWords(names: readonly string[]): string {
  return namesInWords(names.map((name) => name || "a group with no name"));
}

function capitalise(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

/** What a group that lacks an optional value lacks, and what to set, as a sentence says it. */
const LACKS: Record<string, { lacks: string; set: string | null }> = {
  where: { lacks: "has no room or meeting link", set: "Set its room" },
  coFacilitators: { lacks: "has one facilitator, so there is nobody to name beside them", set: null },
  leadName: { lacks: "is on a run whose programme has no lead to sign the email", set: null },
  naisiSignOff: { lacks: "is on a run whose programme’s lead signs the email", set: null },
  programmeName: { lacks: "is on a run no programme names", set: null },
};

/**
 * The sentences an admin reads when publishing is refused for the
 * facilitators' email: what is missing and what to do about it, one sentence
 * to each kind of problem, each naming the groups it is about.
 */
export function facilitatingRefusal(groups: readonly RefusedFacilitatorGroup[]): string[] {
  const said: string[] = [];
  const missing = (token: string) =>
    groups.filter((group) => group.problems.some((problem) => problem.kind === "missing" && problem.token === token));

  if (missing("groupName").length > 0) {
    said.push(
      "A group with a facilitator to tell has no name, so they cannot be told which group they facilitate. Name the group, then publish again.",
    );
  }

  const noSlot = missing("weeklySlot");
  if (noSlot.length > 0) {
    const names = noSlot.map((group) => group.name);
    said.push(
      names.length === 1
        ? `${capitalise(groupsInWords(names))} has no day and time, so its facilitators cannot be told when it meets. Set its day and time, then publish again.`
        : `${names.length} groups have no day and time, so their facilitators cannot be told when they meet: ${groupsInWords(names)}. Set a day and time for each, then publish again.`,
    );
  }

  const undated = groups.filter(
    (group) =>
      !noSlot.includes(group) &&
      group.problems.some((problem) => problem.kind === "missing" && (problem.token === "firstSession" || problem.token === "lastSession")),
  );
  if (undated.some((group) => group.noFirstSession === "no-start-date")) {
    said.push(
      "This run has no start date, so its facilitators cannot be told when their groups meet. Set the start date on the run, then publish again.",
    );
  } else if (undated.some((group) => group.noFirstSession === "no-taught-week")) {
    said.push(
      "This run’s plan has no taught week, so its facilitators cannot be told when their groups meet. Add a week to the run’s plan, then publish again.",
    );
  } else if (undated.length > 0) {
    said.push(
      `${capitalise(groupsInWords(undated.map((group) => group.name)))} cannot be given a first and last session. Check ${undated.length === 1 ? "its" : "their"} day and time, then publish again.`,
    );
  }

  if (missing("groupUrl").length > 0) {
    said.push(
      `This copy of the site doesn’t know its own address, so the button in the “${FACILITATING_TEMPLATE_LABEL}” email would lead nowhere.`,
    );
  }

  const unknown = [
    ...new Set(groups.flatMap((group) => group.problems.flatMap((problem) => (problem.kind === "unknown-token" ? problem.tokens : [])))),
  ];
  if (unknown.length > 0) {
    said.push(
      `The “${FACILITATING_TEMPLATE_LABEL}” email uses ${namesInWords(unknown.map((token) => `{${token}}`))}, which this email cannot fill. Correct its wording in Email designs, then publish again.`,
    );
  }

  for (const where of ["subject", "paragraph"] as const) {
    for (const token of FACILITATING_TOKENS) {
      const lacking = groups.filter((group) =>
        group.problems.some(
          (problem) => problem.kind === "cannot-leave-out" && problem.where === where && problem.tokens.includes(token),
        ),
      );
      if (lacking.length === 0) continue;
      const names = lacking.map((group) => group.name);
      const place = where === "subject" ? "in its subject" : "in the same paragraph as the group or when it meets";
      const fix = where === "subject" ? `take {${token}} out of the subject` : `give {${token}} a paragraph of its own`;
      const about = LACKS[token] ?? { lacks: `has nothing for {${token}}`, set: null };
      said.push(
        `${capitalise(groupsInWords(names))} ${about.lacks}, and the “${FACILITATING_TEMPLATE_LABEL}” email uses {${token}} ${place}, where it cannot be left out. ` +
          (about.set ? `${about.set}, or ${fix} in Email designs, then publish again.` : `${capitalise(fix)} in Email designs, then publish again.`),
      );
    }
  }

  if (said.length === 0 && groups.some((group) => group.problems.length > 0)) {
    said.push(`The “${FACILITATING_TEMPLATE_LABEL}” email could not be written. Check its wording in Email designs, then publish again.`);
  }
  return said;
}
