import { firstWord } from "@/lib/firestore/applicationEmails";
import { GROUP_FIELD_LIMITS, type GroupSession, type GroupSessionMode } from "@/lib/firestore/courseGroups";
import { validateSubmissionUrl } from "@/lib/firestore/courses";
import type { Block } from "@/lib/firestore/newsletterBlocks";

/**
 * THE EMAIL THAT TELLS SOMEBODY THEIR GROUP: what it is filled with, and what
 * happens where there is nothing to fill it with.
 *
 * Publishing an allocation emails each placed person their group, who
 * facilitates it, and when and where it first meets. The wording is a
 * template an admin can edit (`course-allocated`), with `{tokens}` in it. A
 * group formed in a hurry can lack a facilitator, a room or a time, and this
 * module is where each of those is decided, so the route has one question to
 * ask: can this email be written for this person?
 *
 * ## The rule this file exists for
 *
 * NOTHING `composePlacementEmail` RETURNS FOR A SEND CARRIES AN UNFILLED
 * TOKEN. It returns the finished subject and blocks, or it returns the
 * problems that stop it, and never something in between. The last thing it
 * does is look for a token in what it is about to return.
 *
 * ## What happens to each token
 *
 * `PLACEMENT_TOKEN_RULES` is the whole list. A token outside it is not this
 * email's to fill, and a template that uses one is a problem to put right.
 *
 *  - `always`: the recipient's name, the course and the run. Every placement
 *    has them.
 *  - `essential`: the group's name and its first session. The email exists
 *    to say these, so a placement without one is refused, with a sentence
 *    that says what to set. Nobody is told "your first session is" nothing.
 *  - `optional`: the facilitators, where the first session is, and the run's
 *    start. Where there is nothing to say, the paragraph (or the heading)
 *    that holds the token is left out whole, and the rest of the email goes.
 *
 * THE COPY RULE THAT FALLS OUT OF IT: an optional token goes in a paragraph
 * of its own. It cannot be left out of a subject line, or of a paragraph that
 * also carries an essential token, without taking what the email is for with
 * it. Wording that puts one there is refused for a group that lacks the
 * value, with a sentence that says which to change. The seed copy in
 * `courseEmails.ts` obeys the rule, and the same rule is what the weekly
 * reminder asks of its own copy.
 *
 * ## Values go in as text
 *
 * A group's name, a room and a facilitator's name are typed by people. Each
 * is HTML-escaped before it goes into a rich-text block, and collapsed to one
 * line, so nothing typed into a profile or a group can become markup or a
 * second header line. A curly bracket in a typed value is written as a round
 * one, so no value can read as a token, and nobody's name can stop an email
 * being written. The one piece of markup made here is the link to an online
 * group's meeting, from an address `placementWhere` has checked.
 *
 * ## An admin proofing the wording
 *
 * `proof: true` is for the designer's preview and its test send. Those hold
 * sample values and go to the admin who asked, so a token this email cannot
 * fill is left as typed for them to notice, as every other template's proof
 * does. Nothing that reaches a placed person is composed that way.
 *
 * Pure, with no server import, so the route, the designer and a test all run
 * the same function.
 */

/** What becomes of a token when there is nothing to fill it with. See the header. */
export type PlacementTokenRule = "always" | "essential" | "optional";

export const PLACEMENT_TOKEN_RULES = {
  firstName: "always",
  preferredName: "always",
  courseTitle: "always",
  runLabel: "always",
  groupName: "essential",
  firstSessionWhen: "essential",
  startDate: "optional",
  facilitatorNames: "optional",
  firstSessionWhere: "optional",
} as const satisfies Record<string, PlacementTokenRule>;

export type PlacementToken = keyof typeof PLACEMENT_TOKEN_RULES;

export const PLACEMENT_TOKENS = Object.keys(PLACEMENT_TOKEN_RULES) as PlacementToken[];

/** Where a group's first session is: a room, or the link to an online one. */
export type PlacementWhere = { kind: "room"; room: string } | { kind: "online"; url: string };

/** What the email is told about one placed person. Null is "there is nothing to say". */
export type PlacementFacts = {
  /** The recipient's name, as the greeting uses it. */
  name: string;
  courseTitle: string;
  runLabel: string;
  /** The run's first day, written out: "Monday 26 October". */
  startDate: string | null;
  groupName: string | null;
  /** "Priya and Sam", or null while the group has no facilitator. */
  facilitatorNames: string | null;
  /** "Tuesday 27 October, 18:00", or null when no first session can be worked out. */
  firstSessionWhen: string | null;
  firstSessionWhere: PlacementWhere | null;
};

/** Why an email could not be written. Each has a sentence in `placementRefusal`. */
export type PlacementProblem =
  | { kind: "no-group-name" }
  | { kind: "no-first-session" }
  /** The wording uses a token this email does not fill. */
  | { kind: "unknown-token"; tokens: string[] }
  /** An optional token with no value sits where it cannot be left out. */
  | { kind: "cannot-leave-out"; tokens: PlacementToken[]; where: "subject" | "paragraph" };

export type PlacementTemplate = { subject: string; blocks: Block[] };

export type ComposedPlacement =
  | { ok: true; subject: string; blocks: Block[] }
  | { ok: false; problems: PlacementProblem[] };

// ---------------------------------------------------------------------------
// Where the first session is
// ---------------------------------------------------------------------------

/**
 * Where a session is, for the email: the room, or the link for a group that
 * meets online. Null when the group has neither for it.
 *
 * The week's own switch decides which is live, as it does on the member's
 * session card: `virtual` is the link and never the room, `in-person` is the
 * room and never the link. With no switch set, a room wins over a link.
 *
 * The link is the placed person's own group's, which they may see on the
 * site as a member of it. It is checked the way the site checks it before
 * drawing it as a link, and one that fails is left out.
 */
export function placementWhere(
  session: Pick<GroupSession, "location" | "meetingUrl">,
  mode: GroupSessionMode | null,
): PlacementWhere | null {
  const room = oneLine(session.location);
  const url = oneLine(session.meetingUrl);
  const link = url && validateSubmissionUrl(url, GROUP_FIELD_LIMITS.meetingUrl) === null ? url : "";
  if (mode === "virtual") return link ? { kind: "online", url: link } : null;
  if (mode === "in-person") return room ? { kind: "room", room } : null;
  if (room) return { kind: "room", room };
  return link ? { kind: "online", url: link } : null;
}

// ---------------------------------------------------------------------------
// The values
// ---------------------------------------------------------------------------

/** A value as plain text (a subject, a heading) and as HTML (a rich-text block). */
type Value = { text: string; html: string };

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Collapse to one line and trim. Also what keeps a typed value out of a header. */
function oneLine(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** A typed value as it is printed: one line, with no curly bracket in it. */
function plain(value: string | null | undefined): string {
  return oneLine(value).replace(/\{/g, "(").replace(/\}/g, ")");
}

/** A value, or null when there is nothing to say. */
function typed(value: string | null | undefined): Value | null {
  const text = plain(value);
  return text ? { text, html: escapeHtml(text) } : null;
}

/** A value every placement has. An empty one is printed as nothing, and is never a reason to leave a sentence out. */
function always(value: string | null | undefined): Value {
  return typed(value) ?? { text: "", html: "" };
}

function whereValue(where: PlacementWhere | null): Value | null {
  if (!where) return null;
  if (where.kind === "room") return typed(where.room);
  // In an address a curly bracket is written as its escape, which is the same address.
  const url = oneLine(where.url).replace(/\{/g, "%7B").replace(/\}/g, "%7D");
  if (!url) return null;
  const safe = escapeHtml(url);
  return { text: `online, at ${url}`, html: `online, at <a href="${safe}">${safe}</a>` };
}

function valuesOf(facts: PlacementFacts): Record<PlacementToken, Value | null> {
  const name = oneLine(facts.name);
  return {
    firstName: always(firstWord(name)),
    preferredName: always(name),
    courseTitle: always(facts.courseTitle),
    runLabel: always(facts.runLabel),
    groupName: typed(facts.groupName),
    firstSessionWhen: typed(facts.firstSessionWhen),
    startDate: typed(facts.startDate),
    facilitatorNames: typed(facts.facilitatorNames),
    firstSessionWhere: whereValue(facts.firstSessionWhere),
  };
}

// ---------------------------------------------------------------------------
// Filling one unit of text
// ---------------------------------------------------------------------------

const TOKEN = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;

/** The names of the `{tokens}` in a text, each once, in the order they appear. */
export function unfilledTokens(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN)].map((match) => match[1]))];
}

function isPlacementToken(name: string): name is PlacementToken {
  return Object.prototype.hasOwnProperty.call(PLACEMENT_TOKEN_RULES, name);
}

type Filled = {
  /** The unit with every token it could fill filled. */
  text: string;
  /** Tokens this email does not fill. */
  unknown: string[];
  /** Tokens it fills, with no value this time. */
  absent: PlacementToken[];
  /** It also carries an essential token that does have a value. */
  holdsEssential: boolean;
};

/**
 * Fill one unit: a subject, a heading, or one paragraph of a rich-text block.
 * A token with no value becomes nothing, and the caller decides what happens
 * to the unit. A token this email does not fill is left exactly as typed.
 */
function fillUnit(input: string, values: Record<PlacementToken, Value | null>, as: "text" | "html"): Filled {
  const unknown: string[] = [];
  const absent: PlacementToken[] = [];
  let holdsEssential = false;
  const text = input.replace(TOKEN, (match, name: string) => {
    if (!isPlacementToken(name)) {
      if (!unknown.includes(name)) unknown.push(name);
      return match;
    }
    const value = values[name];
    if (!value) {
      if (!absent.includes(name)) absent.push(name);
      return "";
    }
    if (PLACEMENT_TOKEN_RULES[name] === "essential") holdsEssential = true;
    return as === "html" ? value.html : value.text;
  });
  return { text, unknown, absent, holdsEssential };
}

/** Any letter or digit left once the tags are gone? */
function hasVisibleText(html: string): boolean {
  return /[\p{L}\p{N}]/u.test(html.replace(/<[^>]*>/g, " "));
}

/** Each `<p>` on its own, and whatever sits between two of them. */
const PARAGRAPHS = /(<p\b[^>]*>[\s\S]*?<\/p>)/i;

// ---------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------

function sameProblem(a: PlacementProblem, b: PlacementProblem): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The email for one placed person, or the problems that stop it.
 *
 * For a send (`proof` unset) the answer is all or nothing: every token filled
 * and every paragraph with nothing to say left out, or `ok: false` and why.
 */
export function composePlacementEmail(
  template: PlacementTemplate,
  facts: PlacementFacts,
  options: { proof?: boolean } = {},
): ComposedPlacement {
  const proof = options.proof === true;
  const values = valuesOf(facts);
  const problems: PlacementProblem[] = [];
  const note = (problem: PlacementProblem) => {
    if (!problems.some((seen) => sameProblem(seen, problem))) problems.push(problem);
  };

  if (!values.groupName) note({ kind: "no-group-name" });
  if (!values.firstSessionWhen) note({ kind: "no-first-session" });

  /**
   * One unit, filled, or null when it is left out. `canGo` is false for a
   * subject, which an email cannot do without.
   */
  const unit = (input: string, as: "text" | "html", canGo: boolean): string | null => {
    const filled = fillUnit(input, values, as);
    if (filled.unknown.length > 0 && !proof) note({ kind: "unknown-token", tokens: filled.unknown });
    // An essential token with no value is reported once, above. Here it only
    // has to keep its own sentence from being printed with a hole in it.
    const missing = filled.absent.filter((token) => PLACEMENT_TOKEN_RULES[token] === "optional");
    if (filled.absent.length === 0) return filled.text;
    if (proof) return canGo ? null : filled.text;
    if (missing.length > 0 && (!canGo || filled.holdsEssential)) {
      note({ kind: "cannot-leave-out", tokens: missing, where: canGo ? "paragraph" : "subject" });
    }
    return canGo ? null : filled.text;
  };

  const subject = (unit(template.subject, "text", false) ?? "").replace(/\s+/g, " ").trim();

  const blocks: Block[] = [];
  for (const block of template.blocks) {
    if (block.type === "heading") {
      const text = unit(block.text, "text", true);
      if (text !== null && text.trim()) blocks.push({ ...block, text });
    } else if (block.type === "richText") {
      const html = block.html
        .split(PARAGRAPHS)
        .map((segment) => (segment ? (unit(segment, "html", true) ?? "") : ""))
        .join("");
      if (hasVisibleText(html)) blocks.push({ ...block, html });
    } else if (block.type === "image") {
      const caption = block.caption ? unit(block.caption, "text", true) : null;
      blocks.push({ ...block, alt: unit(block.alt, "text", true) ?? "", caption: caption ?? undefined });
    } else if (block.type === "video") {
      const caption = block.caption ? unit(block.caption, "text", true) : null;
      blocks.push({ ...block, caption: caption ?? undefined });
    } else {
      blocks.push(block);
    }
  }

  if (proof) return { ok: true, subject, blocks };

  // The rule this file exists for, asked of the thing about to be returned.
  const left = unfilledTokens([subject, ...blocks.map(textOf)].join("\n"));
  if (left.length > 0) note({ kind: "unknown-token", tokens: left });
  if (!subject) note({ kind: "cannot-leave-out", tokens: [], where: "subject" });

  return problems.length > 0 ? { ok: false, problems } : { ok: true, subject, blocks };
}

/** Every piece of text a block prints. */
function textOf(block: Block): string {
  if (block.type === "heading") return block.text;
  if (block.type === "richText") return block.html;
  if (block.type === "image") return `${block.alt}\n${block.caption ?? ""}`;
  if (block.type === "video") return block.caption ?? "";
  return "";
}

/**
 * The facts for a PROOF: the designer's preview and its test send, which hold
 * sample values by token name and no run. A value that is missing or blank is
 * "nothing to say", so a proof leaves the same paragraph out that a send
 * would. Never used for a send: those facts come from the run and the group.
 */
export function placementFactsFromSample(sample: Readonly<Record<string, string | undefined>>): PlacementFacts {
  const said = (token: PlacementToken): string | null => oneLine(sample[token]) || null;
  const where = said("firstSessionWhere");
  return {
    name: said("preferredName") ?? said("firstName") ?? "",
    courseTitle: said("courseTitle") ?? "",
    runLabel: said("runLabel") ?? "",
    startDate: said("startDate"),
    groupName: said("groupName"),
    facilitatorNames: said("facilitatorNames"),
    firstSessionWhen: said("firstSessionWhen"),
    firstSessionWhere: where ? { kind: "room", room: where } : null,
  };
}

// ---------------------------------------------------------------------------
// What an admin is told when publishing is refused
// ---------------------------------------------------------------------------

/** The label of the template in the designer, so the sentence names it as the screen does. */
export const PLACEMENT_TEMPLATE_LABEL = "Placed in a group";

/** What each optional token is called in a sentence about a group that lacks it. */
const LACKS: Record<string, string> = {
  facilitatorNames: "has no facilitator yet",
  firstSessionWhere: "has no room or meeting link for its first session",
  startDate: "is on a run with no start date",
};

/** Why a group has no first session to tell its people about. */
export type NoFirstSession = "no-start-date" | "no-taught-week" | "no-session-time";

/** One group whose people cannot be emailed, and why. */
export type RefusedGroup = {
  /** The group's name, or "" when it has none. */
  name: string;
  problems: PlacementProblem[];
  /** Set when `problems` holds `no-first-session`. */
  noFirstSession?: NoFirstSession;
};

function named(names: string[]): string {
  const said = names.map((name) => name || "a group with no name");
  if (said.length <= 1) return said[0] ?? "";
  return `${said.slice(0, -1).join(", ")} and ${said[said.length - 1]}`;
}

/**
 * The sentences an admin reads when publishing is refused: what is missing,
 * and what to do about it. One sentence to each kind of problem, each naming
 * the groups it is about. Empty when no group is refused.
 */
export function placementRefusal(groups: readonly RefusedGroup[]): string[] {
  const said: string[] = [];
  const withProblem = (test: (problem: PlacementProblem, group: RefusedGroup) => boolean) =>
    groups.filter((group) => group.problems.some((problem) => test(problem, group)));

  const noSession = withProblem((problem) => problem.kind === "no-first-session");
  if (noSession.some((group) => group.noFirstSession === "no-start-date")) {
    said.push(
      "This run has no start date, so nobody can be told when their first session is. Set the start date on the run, then publish again.",
    );
  } else if (noSession.some((group) => group.noFirstSession === "no-taught-week")) {
    said.push(
      "This run’s plan has no taught week, so there is no first session to tell anybody about. Add a week to the run’s plan, then publish again.",
    );
  } else if (noSession.length > 0) {
    const names = noSession.map((group) => group.name);
    said.push(
      names.length === 1
        ? `${capitalise(named(names))} has no session time, so its people cannot be told when they first meet. Set its day and time, then publish again.`
        : `${names.length} groups have no session time, so their people cannot be told when they first meet: ${named(names)}. Set a day and time for each, then publish again.`,
    );
  }

  if (withProblem((problem) => problem.kind === "no-group-name").length > 0) {
    said.push(
      "A group with people placed in it has no name, so they cannot be told which group they are in. Name the group, then publish again.",
    );
  }

  const unknown = [
    ...new Set(groups.flatMap((group) => group.problems.flatMap((p) => (p.kind === "unknown-token" ? p.tokens : [])))),
  ];
  if (unknown.length > 0) {
    const tokens = named(unknown.map((token) => `{${token}}`));
    said.push(
      `The “${PLACEMENT_TEMPLATE_LABEL}” email uses ${tokens}, which this email cannot fill. Correct its wording in Email designs, then publish again.`,
    );
  }

  for (const where of ["subject", "paragraph"] as const) {
    for (const token of PLACEMENT_TOKENS) {
      const lacking = withProblem(
        (problem) => problem.kind === "cannot-leave-out" && problem.where === where && problem.tokens.includes(token),
      );
      if (lacking.length === 0) continue;
      const names = lacking.map((group) => group.name);
      const place = where === "subject" ? "in its subject" : "in the same paragraph as the group or its first session";
      const fix = where === "subject" ? `take {${token}} out of the subject` : `give {${token}} a paragraph of its own`;
      said.push(
        `${capitalise(named(names))} ${LACKS[token] ?? `has nothing for {${token}}`}, and the “${PLACEMENT_TEMPLATE_LABEL}” email uses {${token}} ${place}, where it cannot be left out. ` +
          `Fill it in for ${names.length === 1 ? "that group" : "those groups"}, or ${fix} in Email designs, then publish again.`,
      );
    }
  }

  if (said.length === 0 && groups.some((group) => group.problems.length > 0)) {
    said.push(`The “${PLACEMENT_TEMPLATE_LABEL}” email could not be written. Check its wording in Email designs, then publish again.`);
  }
  return said;
}

function capitalise(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}
