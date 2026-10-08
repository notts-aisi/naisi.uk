import { firstWord } from "@/lib/firestore/applicationEmails";
import { GROUP_FIELD_LIMITS, type GroupSession, type GroupSessionMode } from "@/lib/firestore/courseGroups";
import { validateSubmissionUrl } from "@/lib/firestore/courses";
import type { Block } from "@/lib/firestore/newsletterBlocks";
import { couldBeFollowed } from "./followable";

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
 *    start. Where there is nothing to say, the unit that holds the token is
 *    left out whole, and the rest of the email goes.
 *
 * ## What is left out, and what never is
 *
 * A UNIT is a heading, a caption, or one run of text in a rich-text block:
 * what sits between two tags that begin or end a block (`BLOCK_TAG`), so a
 * paragraph, a bullet, or text that stands outside both. Three things hold:
 *
 *  - A MISSING VALUE TAKES ITS OWN UNIT AND NOTHING BESIDE IT: not the next
 *    bullet, and not a line of text that happens to follow.
 *  - NO EMPTY SHELL IS LEFT. The element a unit sat in goes with it when it
 *    then holds nothing, and so on outwards: the paragraph, a bullet that
 *    held only that paragraph, a list that held only that bullet
 *    (`takeEmptiedShells`). A rich-text block goes when nothing in it is
 *    left to show.
 *  - A BLOCK THAT HOLDS NO TOKEN IS NEVER LEFT OUT AND NEVER CHANGED. It is
 *    the admin's own, whatever is in it: a line of emoji, a paragraph kept
 *    empty for space. Only what a token was in can go.
 *
 * Two limits are the rule itself, and not accidents of it. Lines inside one
 * paragraph (a line break is not a block) are one unit, so a missing value
 * takes the paragraph. And a token is filled in text and in the tags inside
 * text (a link's address), never in the tag that opens a paragraph or a
 * list: wording with one there is refused, and the token is named.
 *
 * THE COPY RULE THAT FALLS OUT OF IT: an optional token goes in a paragraph
 * or a bullet of its own. It cannot be left out of a subject line, or of a
 * unit that also carries an essential token, without taking what the email
 * is for with it. Wording that puts one there is refused for a group that
 * lacks the value, with a sentence that says which to change. The seed copy
 * in `courseEmails.ts` obeys the rule, and the same rule is what the weekly
 * reminder asks of its own copy.
 *
 * ## Values go in as text
 *
 * A group's name, a room and a facilitator's name are typed by people. Each
 * is HTML-escaped before it goes into a rich-text block, and collapsed to one
 * line, so nothing typed into a profile or a group can become markup or a
 * second header line. A curly bracket in a typed value is written as a round
 * one, so no value can read as a token, and nobody's name can stop an email
 * being written. No markup is made here at all.
 *
 * ## This email never carries a meeting link
 *
 * An email can be forwarded, and a link to an online session lets whoever
 * holds it into the call. So THIS EMAIL says that a group is online and
 * never prints its link: the link is on the programme's page in the member
 * area, which shows it to that group's members, its facilitators and admins.
 * The weekly reminder keeps the same rule for the same reason
 * (`courseNudgeSessionWhere` says "Online" and never the link).
 *
 * THE RULE IS ABOUT THESE TWO EMAILS, AND NOT ABOUT EVERY EMAIL THE SITE
 * SENDS. A facilitator's own notice to their group is theirs to word, and it
 * can carry the link: `RoomNoticeComposer` writes one into the notice for a
 * week that has moved online.
 *
 * `placementWhere` answers "online" and whether the link is there to be found
 * on that page, and nothing in `PlacementFacts` can hold an address. The
 * composer is never handed one.
 *
 * A ROOM IS TYPED BY A PERSON, AND A LINK CAN BE TYPED INTO ONE. So a room
 * is printed only when nothing in it could be followed (`couldBeFollowed`
 * in `./followable.ts`: an address, a host name, a long number a phone
 * would dial). Otherwise the email says where the person will find it, in
 * words that are true of a room and of a call alike, and prints none of
 * what was typed. The check is made where the room is classified and again
 * where it is printed. The weekly reminder asks the same function of the
 * same room, so the two emails cannot come to differ on what counts.
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

/**
 * Where a group's first session is: a room, online, or "on their programme's
 * page", for a room whose text is not printed (see the header). For an
 * online one, `linkOnPage` says whether the placed person will find the link
 * to join on their programme's page. The link itself is not here.
 */
export type PlacementWhere =
  | { kind: "room"; room: string }
  | { kind: "online"; linkOnPage: boolean }
  | { kind: "on-page" };

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
 * Where a session is, for the email: the room, or that it is online. Null
 * when the group has neither a room nor a link for it.
 *
 * The week's own switch decides which is live, as it does on the member's
 * session card: `virtual` is online and never the room, `in-person` is the
 * room and never online. With no switch set, a room wins over a link.
 *
 * THE LINK IS READ HERE AND GOES NO FURTHER. It decides one thing: whether
 * the placed person will find a link to join on their programme's page, which
 * draws one only for an address that passes the check made here (the same
 * check that page makes). What is returned says so, and carries no address.
 */
export function placementWhere(
  session: Pick<GroupSession, "location" | "meetingUrl">,
  mode: GroupSessionMode | null,
): PlacementWhere | null {
  const room = oneLine(session.location);
  const url = oneLine(session.meetingUrl);
  const linkOnPage = url !== "" && validateSubmissionUrl(url, GROUP_FIELD_LIMITS.meetingUrl) === null;
  const inARoom = (): PlacementWhere => (couldBeFollowed(room) ? { kind: "on-page" } : { kind: "room", room });
  if (mode === "virtual") return { kind: "online", linkOnPage };
  if (mode === "in-person") return room ? inARoom() : null;
  if (room) return inARoom();
  return linkOnPage ? { kind: "online", linkOnPage } : null;
}

/** The weekly reminder's own word for a session that is online. */
const ONLINE = "Online";

/**
 * What an online group's people are told about joining, where the link is
 * there for them to find. Their programme's page in the member area shows a
 * placed person their first session, with the way to join it.
 */
const LINK_IS_ON_THE_PAGE = "The link to join is on your programme's page in the learning space.";

/**
 * What stands for a room whose text is not printed. It is true of a room and
 * of a call alike: the programme's page shows the placed person their first
 * session, with the room as it was typed or the way to join.
 */
const WHERE_IS_ON_THE_PAGE = "You'll find where it meets on your programme's page in the learning space.";

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
  if (where.kind === "on-page") return typed(WHERE_IS_ON_THE_PAGE);
  // Asked again here, where it is printed, whatever the caller classified.
  if (where.kind === "room") return typed(couldBeFollowed(where.room) ? WHERE_IS_ON_THE_PAGE : where.room);
  return typed(where.linkOnPage ? `${ONLINE}. ${LINK_IS_ON_THE_PAGE}` : ONLINE);
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
 * Fill one unit: a subject, a heading, a caption, or one run of text in a
 * rich-text block. A token with no value becomes nothing, and the caller
 * decides what happens to the unit. A token this email does not fill is left
 * exactly as typed.
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

// ---------------------------------------------------------------------------
// The units of a rich-text block
// ---------------------------------------------------------------------------

/**
 * A tag that begins or ends a block of its own: a paragraph, a list and each
 * of its items, a quote, a rule. What sits between two of them is ONE UNIT of
 * text, with whatever inline tags it carries (bold, a link, a line break),
 * and a unit is what is left out when it has nothing to say. So a missing
 * value takes its own paragraph or its own bullet, and never the bullet
 * beside it or a line of text that happens to follow.
 */
const BLOCK_TAG =
  /(<\/?(?:p|li|ul|ol|blockquote|h[1-6]|div|pre|hr|table|thead|tbody|tfoot|tr|td|th|dl|dt|dd|section|article|header|footer|figure|figcaption)\b[^>]*>)/i;

/** One piece of a rich-text block: a block tag, or the run of text between two of them. */
type Piece = { tag: { name: string; closes: boolean } | null; text: string; gone: boolean };

function piecesOf(html: string): Piece[] {
  // A split on one capturing group puts the tags at the odd places.
  return html.split(BLOCK_TAG).map((text, index) => {
    if (index % 2 === 0) return { tag: null, text, gone: false };
    const name = (/^<\/?([a-z0-9]+)/i.exec(text)?.[1] ?? "").toLowerCase();
    return { tag: { name, closes: text.startsWith("</") }, text, gone: false };
  });
}

/** Gone already, or only the space between two tags. */
function isNothing(piece: Piece): boolean {
  return piece.gone || (piece.tag === null && piece.text.trim() === "");
}

/**
 * A unit was left out at `index`. Take away each element that now has
 * nothing in it, working outwards: the paragraph, then a bullet that held
 * only that paragraph, then a list that held only that bullet.
 *
 * NO EMPTY SHELL IS LEFT, AND NOTHING ELSE IS TOUCHED. The walk starts from a
 * unit that was left out and stops at the first element that still holds
 * something, so a paragraph an admin left empty on purpose is never reached.
 */
function takeEmptiedShells(pieces: Piece[], index: number): void {
  let left = index - 1;
  let right = index + 1;
  for (;;) {
    while (left >= 0 && isNothing(pieces[left])) left -= 1;
    while (right < pieces.length && isNothing(pieces[right])) right += 1;
    const opens = pieces[left]?.tag;
    const closes = pieces[right]?.tag;
    if (!opens || !closes || opens.closes || !closes.closes || opens.name !== closes.name) return;
    for (let at = left; at <= right; at += 1) pieces[at].gone = true;
    left -= 1;
    right += 1;
  }
}

/** Anything a reader would see: a character that is not space, a picture, or a rule. */
function showsAnything(html: string): boolean {
  if (/<(?:img|hr)\b/i.test(html)) return true;
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;|&#xa0;/gi, " ").trim() !== "";
}

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
 * and every unit with nothing to say left out, or `ok: false` and why.
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
    // A BLOCK THAT HOLDS NO TOKEN IS THE ADMIN'S OWN, and goes as it is,
    // whatever is in it: a line of emoji, a paragraph left empty for space.
    // Only a block a token was in can be left out, and only when filling it
    // left nothing to show.
    if (unfilledTokens(textOf(block)).length === 0) {
      blocks.push(block);
    } else if (block.type === "heading") {
      const text = unit(block.text, "text", true);
      if (text !== null && text.trim()) blocks.push({ ...block, text });
    } else if (block.type === "richText") {
      const pieces = piecesOf(block.html);
      pieces.forEach((piece, index) => {
        // A block tag is not text. A token inside one is not filled, and the
        // look at what is about to be returned, below, refuses it by name.
        if (piece.gone || piece.tag || piece.text.trim() === "") return;
        const filled = unit(piece.text, "html", true);
        if (filled === null) {
          piece.gone = true;
          takeEmptiedShells(pieces, index);
        } else {
          piece.text = filled;
        }
      });
      const html = pieces
        .filter((piece) => !piece.gone)
        .map((piece) => piece.text)
        .join("");
      if (showsAnything(html)) blocks.push({ ...block, html });
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
