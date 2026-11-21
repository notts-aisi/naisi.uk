import { CONTACT_EMAIL } from "@/content/socials";
import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import type { ExcusedEmailWords } from "@/lib/courses/excused/words";
import type { TeamTopic } from "@/lib/firestore/courseTeamAsks";

/**
 * THE WORDS OF ASK THE TEAM, in one place: the member's page, the foot link,
 * the box on the programme page, the Requests page's section and switch, a
 * message's own page, Home's line, the routes' refusals and both emails.
 *
 * No server imports, so the member's form and the admins' page read the same
 * sentences the routes answer with. Times print through the house clock
 * (`londonDayLabel`, `londonClockLabel`).
 */

// ---------------------------------------------------------------------------
// Where it is reached
// ---------------------------------------------------------------------------

/** The page's address. */
export const ASK_THE_TEAM_PATH = "/ask-the-team";

/** The foot of every signed-in page, before "Anonymous feedback". */
export const ASK_THE_TEAM = "Ask the team";

/** The box beside the next session's card on a learner's programme page. */
export const NEED_SOMETHING = {
  title: "Need something?",
  line: "Ask the team about your group, a session, access or anything else. You’ll get a reply here and by email.",
  button: ASK_THE_TEAM,
} as const;

// ---------------------------------------------------------------------------
// The member's page
// ---------------------------------------------------------------------------

export const PAGE_WORDS = {
  title: ASK_THE_TEAM,
  intro: "Goes to the people running NAISI. You’ll get a reply here and by email.",
  aboutLabel: "What’s it about?",
  visitTopic: "One week at another session",
  visitTopicLine: "Opens this week’s other sessions.",
  whichProgramme: "Which programme?",
  messageLabel: "Your message",
  messageHint: "Please don’t include medical details or anything about your health.",
  send: "Send to the team",
  sending: "Sending…",
  sent: "Sent. You’ll get a reply here and by email.",
  didntSend: "That didn’t send. Try again.",
  yourRequests: "Your requests",
  nothingSent: "Nothing sent yet.",
  programmePageLine: "Requests about your sessions and your group are on your programme page.",
  openProgrammePage: "Open your programme page",
} as const;

/** Each written topic, as the form offers it. */
export const TOPIC_WORDS: Record<TeamTopic, string> = {
  site: "Something’s wrong on the site",
  else: "Something else",
};

/** Each topic, as a row's title begins ("Something’s wrong: ..."). */
export const TOPIC_SHORT: Record<TeamTopic, string> = {
  site: "Something’s wrong",
  else: "Something else",
};

// ---------------------------------------------------------------------------
// Access needs: the topic, its own form, and what the member's list says
// ---------------------------------------------------------------------------

/**
 * The access form. It asks what would help, never why: nothing here invites
 * a condition or a diagnosis.
 */
export const ACCESS_WORDS = {
  /** The topic on the main form, and its line. */
  topic: "Access needs",
  topicLine: "Only admins read it.",
  /** The way back to the main form. */
  back: ASK_THE_TEAM,
  heading: "Access needs",
  onlyAdmins: "Only admins read this: not your facilitator, not the programme’s lead. We record each time an admin opens it.",
  label: "What would help?",
  /** Above the box. */
  hint: "Say what would help. You don’t need to tell us why, or anything about your health.",
  tick: "You may tell my facilitator what’s needed, but not why",
  tickLine: "Off unless you tick it.",
  send: "Send to admins",
} as const;

/** The access form's refusals. */
export const ACCESS_REFUSAL = {
  empty: "Write what would help first.",
  long: "What you wrote is longer than 2,000 characters. Shorten it, then press Send to admins again.",
} as const;

/** An access ask's title on the member's own list: never what they wrote. */
export const ACCESS_ROW_TITLE = ACCESS_WORDS.topic;

/** A row's chip on the member's page. */
export const OWN_CHIP = { waiting: "Waiting", replied: "Replied" } as const;

/** How much of a message a title carries before it is cut. */
const EXCERPT_AT = 48;

/**
 * The start of a message as one line: its first line, cut at a word near 48
 * characters, with "…" when cut. Never more than the sender's own words.
 */
export function excerptOf(words: string): string {
  const first = (words.split(/\r?\n/).find((line) => line.trim() !== "") ?? "").replace(/\s+/g, " ").trim();
  if (first.length <= EXCERPT_AT) return first;
  const cut = first.slice(0, EXCERPT_AT + 1);
  const space = cut.lastIndexOf(" ");
  const kept = (space >= EXCERPT_AT / 2 ? cut.slice(0, space) : first.slice(0, EXCERPT_AT)).replace(/[\s,;:.]+$/, "");
  return `${kept}…`;
}

/** "Something’s wrong: week 2’s second reading link". */
export function ownTitleWords(topic: TeamTopic, words: string): string {
  const start = excerptOf(words);
  return start ? `${TOPIC_SHORT[topic]}: ${start}` : TOPIC_SHORT[topic];
}

/** "Sent Mon 9 Nov". */
export function ownSentWords(askedAt: Date | null): string {
  return askedAt ? `Sent ${londonDayLabel(askedAt)}` : "";
}

/** "Lloyd replied Sat 7 Nov: “Yes, socials are open to anyone.”" */
export function ownRepliedWords(replierFirstName: string, at: Date | null, reply: string): string {
  const who = replierFirstName.trim() || "The team";
  const when = at ? ` ${londonDayLabel(at)}` : "";
  return `${who} replied${when}: “${reply.replace(/\s+/g, " ").trim()}”`;
}

// ---------------------------------------------------------------------------
// The send route's refusals, each one sentence a member can act on
// ---------------------------------------------------------------------------

export const ASK_REFUSAL = {
  body: "Something about that didn’t look like this form. Reload the page and try again.",
  chooseFirst: "Choose what it’s about first.",
  notOffered: "That choice isn’t on the form any more. Reload the page and choose again.",
  empty: "Write your message first.",
  long: "Your message is longer than 2,000 characters. Shorten it, then press Send to the team again.",
  tooMany: `You’ve sent the team five messages today. Try again tomorrow, or email ${CONTACT_EMAIL}.`,
  notMember: "Forbidden",
} as const;

// ---------------------------------------------------------------------------
// The Requests page and a message's own page (admins)
// ---------------------------------------------------------------------------

/** The section of the Requests page. */
export const MESSAGES_SECTION = "Something’s wrong, something else";

/** The section's line in "Who sees what". */
export const MESSAGES_WHO_SEES =
  "Messages to the team, access needs among them, are for admins only: no programme’s lead or facilitator sees them. A new one emails an admin only if they switch it on above. Replying emails the person and closes the message.";

/** The access section of the Requests page, and its tag. Its rows never carry what was written. */
export const ACCESS_SECTION = "Access needs";
export const ADMINS_ONLY = "Admins only";

/** The second switch, off unless switched on. */
export const EMAIL_ME_ABOUT_MESSAGES = "Email me about messages to the team";
export const EMAIL_ME_ABOUT_MESSAGES_LINE = "When somebody sends the team a message: who, what it’s about and when, never what they wrote.";

/** A row's or a page's state chip. */
export const STAFF_CHIP = { waiting: "Waiting", handling: "Being handled", replied: "Replied" } as const;

/** A message's page heading: "Marcus Bell: something’s wrong on the site". */
export function messageTitleWords(name: string, topic: TeamTopic): string {
  const who = name.trim() || "NAISI member";
  return `${who}: ${topic === "site" ? "something’s wrong on the site" : "something else"}`;
}

/** An access ask's page heading: "Elena Rossi: access needs". */
export function accessTitleWords(name: string): string {
  return `${name.trim() || "NAISI member"}: access needs`;
}

/** Before an admin opens an access ask. */
export function accessOpenLineWords(firstName: string): string {
  return `Only admins can open what ${firstName.trim() || "they"} wrote, and each opening is recorded.`;
}

/** The button that opens it, and records the opening. */
export function accessOpenButtonWords(firstName: string): string {
  return `Open what ${firstName.trim() || "they"} wrote`;
}

/** After opening, the tick as the admin reads it. */
export function accessTickWords(firstName: string, tellFacilitator: boolean): string {
  const who = firstName.trim() || "They";
  return tellFacilitator
    ? `${who} says you may tell the facilitator what’s needed, but not why.`
    : `${who} hasn’t said you may tell the facilitator.`;
}

/** Under the reply box of an access ask: a reply is not behind the opening. */
export const ACCESS_REPLY_GENERAL = "Keep the reply general. It is emailed, and other admins see it without opening what was written.";

/** The opening could not be read and recorded together, so nothing is shown. */
export const ACCESS_DIDNT_OPEN = "That didn’t open. Try again.";

/** The open route's refusal of the sender. */
export const ACCESS_OWN = "You sent this, so another admin opens it.";

/** The person block with no place this term. */
export const NO_PLACE_THIS_TERM = "Not on a programme this term.";

/** "Reply to Marcus". */
export function replyToWords(firstName: string): string {
  return `Reply to ${firstName.trim() || "them"}`;
}

export const REPLY_LABEL = "Reply";
export const HANDLING = "Handling";
export const SEND_THE_REPLY = "Send the reply";

/** Under the reply box. */
export function replyLineWords(firstName: string): string {
  const who = firstName.trim() || "the person";
  return `Sent by email and shown under ${who}’s message. Sending it closes the message.`;
}

/**
 * Once replied, from the route's answer about the email: sent, no address on
 * their account, or held back or failed ("Replied. Nobody was emailed.", the
 * sentence the other request pages use).
 */
export function repliedSaidWords(firstName: string, emailed: string): string {
  const who = firstName.trim() || "The person";
  if (emailed === "sent") return `Replied. ${who} has been emailed.`;
  if (emailed === "no-address") return `Replied. ${who} has no address we can email, so it shows on their page only.`;
  return "Replied. Nobody was emailed.";
}

/** The message is the reader's own: another admin answers it. */
export const YOURS = "You sent this, so another admin replies to it.";

/** A line of a message's history: "Marcus sent this", "Zach took it", "Zach replied", and on an access ask "Zach opened it". */
export function historyWords(what: "asked" | "taken" | "replied" | "opened", byName: string): string {
  const who = byName.trim().split(/\s+/)[0] || "Somebody";
  if (what === "asked") return `${who} sent this`;
  if (what === "opened") return `${who} opened it`;
  return what === "taken" ? `${who} took it` : `${who} replied`;
}

/** A replied row's end on the Requests page: "Zach replied". */
export function repliedRowWords(byName: string): string {
  return historyWords("replied", byName);
}

/** The reply route's refusals. */
export const REPLY_REFUSAL = {
  body: "Expected a JSON object body.",
  empty: "Write the reply first.",
  paragraph: "The reply must be one paragraph.",
  link: "The reply can’t include a link.",
  long: "The reply is longer than 600 characters.",
  own: "You can’t reply to your own message.",
  /** Take it, pressed on your own message. */
  ownTake: "You sent this, so another admin takes it.",
  answered: "It’s already been answered.",
} as const;

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

/** Home's clause for messages waiting: "Somebody has sent the team a message." */
export function messagesWaitingWords(count: number): string {
  return count === 1 ? "Somebody has sent the team a message." : `${count} messages to the team are waiting.`;
}

// ---------------------------------------------------------------------------
// The emails
// ---------------------------------------------------------------------------

/** "today at 1:05pm", or "on Mon 9 Nov at 1:05pm". */
function whenAsked(askedAt: Date, now: Date): string {
  return londonDayLabel(askedAt) === londonDayLabel(now)
    ? `today at ${londonClockLabel(askedAt)}`
    : `on ${londonDayLabel(askedAt)} at ${londonClockLabel(askedAt)}`;
}

/**
 * "Marcus Bell sent the team a message": to each admin who switched on
 * "Email me about messages to the team". Who, what it is about and when, and
 * the way to its page. NEVER what they wrote.
 */
export function newMessageEmailWords(input: { personName: string; topic: TeamTopic; askedAt: Date; now: Date }): ExcusedEmailWords {
  const person = input.personName.trim() || "Somebody";
  const about = input.topic === "site" ? "something wrong on the site" : "something else";
  return {
    subject: `${person} sent the team a message`,
    before: [`${person} sent the team a message ${whenAsked(input.askedAt, input.now)}, about ${about}.`],
    quote: null,
    after: ["What they wrote is on the request’s page, and isn’t in this email."],
    button: "Open the request",
    footnote: "You get this because you switched on emails about messages to the team. You can switch it off on the Requests page.",
  };
}

/**
 * "Somebody sent the admins a message about access needs": to each admin
 * who switched on "Email me about messages to the team". When, and the way
 * to its page, where opening it is recorded. NEVER what they wrote, nothing
 * of the tick, and NOT WHO: the subject is kept in the email log, which
 * outlives the account, so neither it nor the body names the person. Their
 * name is on the request's page.
 */
export function accessNeedsEmailWords(input: { askedAt: Date; now: Date }): ExcusedEmailWords {
  return {
    subject: "Somebody sent the admins a message about access needs",
    before: [`Somebody sent the admins a message about access needs ${whenAsked(input.askedAt, input.now)}.`],
    quote: null,
    after: ["What they wrote is on the request’s page, for admins only, and isn’t in this email. Opening it is recorded."],
    button: "Open the request",
    footnote: "You get this because you switched on emails about messages to the team. You can switch it off on the Requests page.",
  };
}

/**
 * "About your message to the team": the reply, to the person who sent it.
 * The reply in quotes, never their own message. THE SAME WORDS FOR AN ACCESS
 * ASK, subject and body, so nothing in the email, its preview or its plain
 * text part says "access needs".
 */
export function replyEmailWords(input: { replierFirstName: string; reply: string; askedAt: Date | null; now: Date }): ExcusedEmailWords {
  const replier = input.replierFirstName.trim() || "An admin";
  const sameDay = input.askedAt !== null && londonDayLabel(input.askedAt) === londonDayLabel(input.now);
  const sent = input.askedAt === null ? "" : sameDay ? " today" : ` on ${londonDayLabel(input.askedAt)}`;
  return {
    subject: "About your message to the team",
    before: [`${replier} replied to the message you sent the team${sent}.`],
    quote: `${replier} says: “${input.reply.trim()}”`,
    after: [],
    button: "Open Ask the team",
    footnote: null,
  };
}
