import { firstWord } from "@/lib/firestore/applicationEmails";
import { couldBeFollowed } from "@/lib/courses/followable";
// By its `@/` path, as every caller of a token filler imports one, so the
// tree walk in tests/email-unfilled-tokens.test.mjs finds the call.
import {
  always,
  composeWholeEmail,
  oneLine,
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
 * THE EMAIL AN INCUBATOR'S PEOPLE ARE SENT WHEN PUBLISH GOES OUT: "Your
 * Research incubator sessions: Mondays at 5pm".
 *
 * Publish tells each person placed on a run their group. An incubator has
 * one weekly session for everybody on it and no groups to speak of, and its
 * people are never told the word: decision day promised them "We’ll email
 * you before you start with how the first week works." So when the
 * programme that names the run is an incubator, Publish sends its people this
 * email in place of "Placed in a group": the weekly session (its day, its
 * time and where), the date it starts, who runs it, and a button to their
 * programme's page, where week 1 is. Nothing in it names a group or a
 * facilitator, and no token can: there is no token for the group's name or
 * for who facilitates it. The wording is a template an admin can edit
 * (`course-allocated-incubator`, "Placed on an incubator" in Email designs),
 * with `{tokens}` in it.
 *
 * ## Written whole or not at all
 *
 * By the placement email's own composer (`composeWholeEmail` in
 * `./placementEmail.ts`), under `INCUBATOR_START_TOKEN_RULES`, so every rule
 * written there holds here: a missing value takes its own paragraph and
 * nothing beside it, no empty shell is left, a block with no token is never
 * touched, an essential token with nothing to fill it refuses the email, and
 * nothing returned for a send carries a token. Publish refuses with the
 * sentences below rather than send one that cannot be written.
 *
 *  - `always`: the person's name, the course, the run and the programme's
 *    name. This email goes only to the people of a run a programme names.
 *  - `essential`: when it meets each week, the date of its first session,
 *    and the link to the programme's page. The email exists to say these.
 *  - `optional`: where it meets, and who runs it. The run may have no room
 *    yet, or a programme with no lead, and the paragraph that would have said
 *    so is left out, the sign-off with it.
 *
 * ## Every value is a record's
 *
 * The weekly time is the group's standing slot ("Mondays at 5pm"), the first
 * session is the group's own calendar ("Mon 2 Nov", worked out by the caller
 * with `resolveSessions`), the place is the slot's room, and who runs it is
 * the first name of the lead of the programme that names the run. Nothing
 * here reads a date or types one.
 *
 * ## Never a meeting link
 *
 * As for the placement email, and for the same reason: an email can be
 * forwarded. An online session is told it is online and that the link to
 * join is on the programme's page, which shows it to the people placed on
 * the run. A room with anything in it a reader could follow is not printed
 * (`couldBeFollowed`, the function both other emails ask), and the reader is
 * told where to find it. `PlacementWhere` carries no address, so the composer
 * is never handed one.
 *
 * Pure, with no server import and no pattern of its own: every pattern that
 * reads the wording or a typed value is in `./placementEmail.ts` and
 * `./followable.ts`, where `tests/email-pattern-shapes.test.mjs` holds them.
 */

export const INCUBATOR_START_TOKEN_RULES = {
  firstName: "always",
  preferredName: "always",
  courseTitle: "always",
  runLabel: "always",
  programmeName: "always",
  weeklySlot: "essential",
  firstSession: "essential",
  programmeUrl: "essential",
  where: "optional",
  leadName: "optional",
} as const satisfies Record<string, PlacementTokenRule>;

export type IncubatorStartToken = keyof typeof INCUBATOR_START_TOKEN_RULES;

export const INCUBATOR_START_TOKENS = Object.keys(INCUBATOR_START_TOKEN_RULES) as IncubatorStartToken[];

/** The label of the template in the designer, so a sentence names it as the screen does. */
export const INCUBATOR_START_TEMPLATE_LABEL = "Placed on an incubator";

/** What the email is told about one person on an incubator's run. Null is "there is nothing to say". */
export type IncubatorStartFacts = {
  /** The person's name, as the greeting uses it. */
  name: string;
  courseTitle: string;
  runLabel: string;
  /** The programme's short name: "Research incubator". */
  programmeName: string;
  /** "Mondays at 5pm" (`weeklySlotWords`), or null while the slot has no day and time. */
  weeklySlot: string | null;
  /** "Mon 2 Nov": the first session, on the group's own calendar. */
  firstSession: string | null;
  /** Where the weekly session is. Never an address. */
  where: PlacementWhere | null;
  /** The first name of the lead of the programme that names the run, or null when it has none. */
  leadName: string | null;
  /** The programme's page in the member area, as a whole address. Null when the site does not know its own address. */
  programmeUrl: string | null;
};

// ---------------------------------------------------------------------------
// Words for the values
// ---------------------------------------------------------------------------

/** The weekly reminder's own word for a session that is online. */
const ONLINE = "Online";

/** Where somebody on an online run finds the link to join: their programme's page shows it to them. */
const LINK_IS_ON_THE_PAGE = "The link to join is on your programme’s page.";

/** What stands for a room whose text is not printed. True of a room and of a call alike. */
const WHERE_IS_ON_THE_PAGE = "You’ll find where it meets on your programme’s page.";

function whereValue(where: PlacementWhere | null): EmailValue | null {
  if (!where) return null;
  if (where.kind === "on-page") return typed(WHERE_IS_ON_THE_PAGE);
  // Asked again here, where it is printed, whatever the caller classified.
  if (where.kind === "room") return typed(couldBeFollowed(where.room) ? WHERE_IS_ON_THE_PAGE : where.room);
  return typed(where.linkOnPage ? `${ONLINE}. ${LINK_IS_ON_THE_PAGE}` : ONLINE);
}

function valuesOf(facts: IncubatorStartFacts): Record<IncubatorStartToken, EmailValue | null> {
  const name = oneLine(facts.name);
  return {
    firstName: always(firstWord(name)),
    preferredName: always(name),
    courseTitle: always(facts.courseTitle),
    runLabel: always(facts.runLabel),
    programmeName: always(facts.programmeName),
    weeklySlot: typed(facts.weeklySlot),
    firstSession: typed(facts.firstSession),
    programmeUrl: typed(facts.programmeUrl),
    where: whereValue(facts.where),
    leadName: typed(facts.leadName),
  };
}

// ---------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------

/**
 * The email for one person on an incubator's run, or the problems that stop
 * it. `proof: true` is the designer's, exactly as for the placement email: a
 * token this email cannot fill is left as typed for the admin to see.
 */
export function composeIncubatorStartEmail(
  template: PlacementTemplate,
  facts: IncubatorStartFacts,
  options: { proof?: boolean } = {},
): ComposedEmail {
  return composeWholeEmail(template, valuesOf(facts), INCUBATOR_START_TOKEN_RULES, options);
}

/**
 * The facts for a PROOF: the designer's preview and its test send, which hold
 * sample values by token name. Missing or blank is "nothing to say", so a
 * proof leaves out what a send would. Never used for a send.
 */
export function incubatorStartFactsFromSample(sample: Readonly<Record<string, string | undefined>>): IncubatorStartFacts {
  const said = (token: IncubatorStartToken): string | null => oneLine(sample[token]) || null;
  const where = said("where");
  return {
    name: said("preferredName") ?? said("firstName") ?? "",
    courseTitle: said("courseTitle") ?? "",
    runLabel: said("runLabel") ?? "",
    programmeName: said("programmeName") ?? "",
    weeklySlot: said("weeklySlot"),
    firstSession: said("firstSession"),
    where: where ? { kind: "room", room: where } : null,
    leadName: said("leadName"),
    programmeUrl: said("programmeUrl"),
  };
}

// ---------------------------------------------------------------------------
// What an admin is told when publishing is refused
// ---------------------------------------------------------------------------

/** One group whose people cannot be sent this email, and why. */
export type RefusedIncubatorGroup = {
  /** The group's name, or "" when it has none. */
  name: string;
  problems: WholeEmailProblem[];
  /** Why there is no first session, when that is one of the problems. */
  noFirstSession?: NoFirstSession;
};

/** "A", "A and B", "A, B and C". */
function inWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "Group A", "Group A and Group B", with a group that has no name said so. */
function groupsInWords(names: readonly string[]): string {
  return inWords(names.map((name) => name || "a group with no name"));
}

function capitalise(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

/** What a group that lacks an optional value lacks, and what to set, as a sentence says it. */
const LACKS: Record<string, { lacks: string; set: string | null }> = {
  where: { lacks: "has no room or meeting link", set: "Set its room" },
  leadName: { lacks: "is on a run whose programme has no lead to name", set: null },
};

/**
 * The sentences an admin reads when publishing is refused for this email:
 * what is missing and what to do about it, one sentence to each kind of
 * problem, each naming the groups it is about. They are an admin's, and name
 * the run's groups as the board does. Empty when no group is refused.
 */
export function incubatorStartRefusal(groups: readonly RefusedIncubatorGroup[]): string[] {
  const said: string[] = [];
  const missing = (token: string) =>
    groups.filter((group) => group.problems.some((problem) => problem.kind === "missing" && problem.token === token));

  const noSlot = missing("weeklySlot");
  if (noSlot.length > 0) {
    const names = noSlot.map((group) => group.name);
    said.push(
      names.length === 1
        ? `${capitalise(groupsInWords(names))} has no day and time, so its people cannot be told when they meet. Set its day and time, then publish again.`
        : `${names.length} groups have no day and time, so their people cannot be told when they meet: ${groupsInWords(names)}. Set a day and time for each, then publish again.`,
    );
  }

  const undated = missing("firstSession").filter((group) => !noSlot.includes(group));
  if (undated.some((group) => group.noFirstSession === "no-start-date")) {
    said.push(
      "This run has no start date, so nobody can be told when their first session is. Set the start date on the run, then publish again.",
    );
  } else if (undated.some((group) => group.noFirstSession === "no-taught-week")) {
    said.push(
      "This run’s plan has no taught week, so there is no first session to tell anybody about. Add a week to the run’s plan, then publish again.",
    );
  } else if (undated.length > 0) {
    said.push(
      `${capitalise(groupsInWords(undated.map((group) => group.name)))} cannot be given a first session. Check ${undated.length === 1 ? "its" : "their"} day and time, then publish again.`,
    );
  }

  if (missing("programmeUrl").length > 0) {
    said.push(
      `This copy of the site doesn’t know its own address, so the button in the “${INCUBATOR_START_TEMPLATE_LABEL}” email would lead nowhere.`,
    );
  }

  const unknown = [
    ...new Set(groups.flatMap((group) => group.problems.flatMap((problem) => (problem.kind === "unknown-token" ? problem.tokens : [])))),
  ];
  if (unknown.length > 0) {
    said.push(
      `The “${INCUBATOR_START_TEMPLATE_LABEL}” email uses ${inWords(unknown.map((token) => `{${token}}`))}, which this email cannot fill. Correct its wording in Email designs, then publish again.`,
    );
  }

  for (const where of ["subject", "paragraph"] as const) {
    for (const token of INCUBATOR_START_TOKENS) {
      const lacking = groups.filter((group) =>
        group.problems.some(
          (problem) => problem.kind === "cannot-leave-out" && problem.where === where && problem.tokens.includes(token),
        ),
      );
      if (lacking.length === 0) continue;
      const names = lacking.map((group) => group.name);
      const place = where === "subject" ? "in its subject" : "in the same paragraph as when it meets";
      const fix = where === "subject" ? `take {${token}} out of the subject` : `give {${token}} a paragraph of its own`;
      const about = LACKS[token] ?? { lacks: `has nothing for {${token}}`, set: null };
      said.push(
        `${capitalise(groupsInWords(names))} ${about.lacks}, and the “${INCUBATOR_START_TEMPLATE_LABEL}” email uses {${token}} ${place}, where it cannot be left out. ` +
          (about.set ? `${about.set}, or ${fix} in Email designs, then publish again.` : `${capitalise(fix)} in Email designs, then publish again.`),
      );
    }
  }

  if (said.length === 0 && groups.some((group) => group.problems.length > 0)) {
    said.push(`The “${INCUBATOR_START_TEMPLATE_LABEL}” email could not be written. Check its wording in Email designs, then publish again.`);
  }
  return said;
}
