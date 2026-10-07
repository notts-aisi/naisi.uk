import type { ApplicationFormFields, EmailWording, ProgrammeSettings } from "../model";
import { programmeOf } from "./programmes";

/**
 * THE WORDS OF THE THREE DECISION-DAY EMAILS.
 *
 * Everybody who applied hears on one day, in one of three emails: "You're in",
 * an invitation to something they did not pick, or a kind no. This module
 * turns one person's outcome into the email they are sent: subject, greeting,
 * paragraphs, buttons and sign-off.
 *
 * It is pure, with no server import, because three things have to agree to
 * the letter: the preview an admin reads before pressing Send, the test they
 * send themselves, and the email that goes out. All three call
 * {@link composeDecisionEmail} and render what it returns.
 *
 * ## The committee's own wording
 *
 * A programme can word its own "You're in", "Invitation" and "Declined"
 * emails (`programmes[id].emailWording`), and the form carries one wording for
 * "No offer this time" (`noOfferWording`). Where a subject or a body is set it
 * replaces the default one. It is used as written, as plain text: nothing in
 * it is a placeholder and nothing in it is markup. The greeting, the buttons
 * and the sign-off are added around it, because only they know who the email
 * is for.
 *
 * ## An email changes nothing by being opened
 *
 * Every button is a link to a page. The reply buttons go to the person's own
 * application page, where they answer; none of them carries an answer in its
 * address, so a mail scanner that follows every link accepts nothing on
 * anybody's behalf.
 */

/** Where every reply to a decision-day email goes. */
export const DECISION_REPLY_TO = "ai-safety@uonsu.com";

export type DecisionEmailKind = "accepted" | "invitation" | "no-offer";

export const DECISION_EMAIL_KINDS: readonly DecisionEmailKind[] = [
  "accepted",
  "invitation",
  "no-offer",
];

/** How a button is drawn: the one main action, a quieter second, or an outline. */
export type DecisionEmailButtonLook = "primary" | "quiet" | "outline";

export type DecisionEmailButton = {
  label: string;
  href: string;
  look: DecisionEmailButtonLook;
};

export type DecisionEmailSignOff = {
  /** "Claudia". */
  name: string;
  /** "AGI Strategy lead, NAISI". Empty when the programme has no lead. */
  role: string;
};

/** One email, as it will read. */
export type DecisionEmail = {
  kind: DecisionEmailKind;
  subject: string;
  /** "Hi Chloe," */
  greeting: string;
  paragraphs: string[];
  buttons: DecisionEmailButton[];
  signOff: DecisionEmailSignOff;
};

/** What one person is being told. `declined` only when an admin chose to email them. */
export type DecisionEmailOutcome =
  | { kind: "accepted"; programmeId: string }
  | { kind: "invited"; programmeId: string }
  | { kind: "no-offer" }
  | { kind: "declined" };

type Form = Pick<ApplicationFormFields, "programmes" | "noOfferWording">;

export type ComposeInput = {
  outcome: DecisionEmailOutcome;
  /** What to call them. Falls back to "there". */
  firstName: string;
  form: Form;
  /** The programmes they ranked, in their order, as the form knows them. */
  ranked: readonly string[];
  /** Each programme's lead, by programme id: the first name they go by. */
  leadNames: Readonly<Record<string, string>>;
  /** The reply-by day for an invitation, already formatted: "Sun 25 Oct". */
  replyBy: string | null;
  links: {
    /** The person's own application page. */
    application: string;
    /** The public list of events. */
    events: string;
  };
};

export const NO_OFFER_SUBJECT = "Your NAISI application";

const ACCEPTED_REPLY =
  "You don’t need to reply. If you’re coming, tap the button. It helps us plan groups. " +
  "If you can’t make it, tell us and we’ll give your place to someone else.";

const NO_OFFER_BODY = [
  "Thanks for applying. We can’t offer you a place this term.",
  "We’ll email you when applications next open. Our events are open to everyone, so come along to one.",
];

/** "A", "A and B", "A, B and C". */
export function listInWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * A body as the committee typed it, cut into paragraphs at each blank line.
 * A single line break stays inside its paragraph.
 */
export function paragraphsOf(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/** The default subject and paragraphs, with the committee's own laid over them. */
function worded(
  wording: EmailWording | null | undefined,
  fallback: { subject: string; paragraphs: string[] },
): { subject: string; paragraphs: string[] } {
  const subject = wording?.subject.trim() ?? "";
  const paragraphs = wording ? paragraphsOf(wording.body) : [];
  return {
    subject: subject || fallback.subject,
    paragraphs: paragraphs.length > 0 ? paragraphs : fallback.paragraphs,
  };
}

function signOffFor(
  programme: ProgrammeSettings | undefined,
  leadNames: Readonly<Record<string, string>>,
): DecisionEmailSignOff {
  const lead =
    programme && Object.hasOwn(leadNames, programme.id) ? leadNames[programme.id].trim() : "";
  // A programme with no lead named yet still has to sign its email as somebody.
  if (!programme || !lead) return { name: "NAISI", role: "" };
  return { name: lead, role: `${programme.shortName} lead, NAISI` };
}

function greetingFor(firstName: string): string {
  return `Hi ${firstName.trim() || "there"},`;
}

function acceptedEmail(input: ComposeInput, programme: ProgrammeSettings): DecisionEmail {
  const starts = programme.starts.trim();
  const { subject, paragraphs } = worded(programme.emailWording.accepted, {
    subject: `You’re in ${programme.shortName}`,
    paragraphs: [
      // A programme with no start written down yet says nothing about when,
      // rather than "It starts ." with a hole in it.
      `You’re in the ${programme.name}.${starts ? ` It starts ${starts}.` : ""} ` +
        "You’ll be in a small group with a facilitator, on campus, and we’ll email you " +
        "your group and when it meets before you start.",
      ACCEPTED_REPLY,
    ],
  });
  return {
    kind: "accepted",
    subject,
    greeting: greetingFor(input.firstName),
    paragraphs,
    buttons: [
      { label: "I’m coming", href: input.links.application, look: "primary" },
      { label: "I can’t make it", href: input.links.application, look: "quiet" },
    ],
    signOff: signOffFor(programme, input.leadNames),
  };
}

function invitationEmail(input: ComposeInput, programme: ProgrammeSettings): DecisionEmail {
  const applied = input.ranked
    .map((programmeId) => programmeOf(input.form, programmeId))
    .filter((ranked): ranked is ProgrammeSettings => Boolean(ranked))
    .map((ranked) => `the ${ranked.name}`);
  const thanks = applied.length > 0 ? `Thanks for applying to ${listInWords(applied)}.` : "Thanks for applying.";
  const { subject, paragraphs } = worded(programme.emailWording.invitation, {
    subject: `An invitation to ${programme.shortName}`,
    paragraphs: [
      `${thanks} The pool was really strong and we don’t have space for you this time, ` +
        `but we think you’d be a great fit for the ${programme.name} instead.`,
      input.replyBy
        ? `Accept your invitation by ${input.replyBy} to let us know you’re coming.`
        : "Accept your invitation to let us know you’re coming.",
    ],
  });
  return {
    kind: "invitation",
    subject,
    greeting: greetingFor(input.firstName),
    paragraphs,
    buttons: [
      { label: "Accept your invitation", href: input.links.application, look: "primary" },
      { label: "No thanks", href: input.links.application, look: "quiet" },
    ],
    signOff: signOffFor(programme, input.leadNames),
  };
}

function noOfferEmail(input: ComposeInput, wording: EmailWording | null | undefined): DecisionEmail {
  const firstChoice = programmeOf(input.form, input.ranked[0]);
  const { subject, paragraphs } = worded(wording, {
    subject: NO_OFFER_SUBJECT,
    paragraphs: NO_OFFER_BODY,
  });
  return {
    kind: "no-offer",
    subject,
    greeting: greetingFor(input.firstName),
    paragraphs,
    buttons: [{ label: "See what’s on", href: input.links.events, look: "outline" }],
    signOff: signOffFor(firstChoice, input.leadNames),
  };
}

/**
 * The email for one outcome, or null when the outcome names a programme the
 * form no longer carries (there is nothing true to say about a place on it).
 *
 * A declined application that an admin has chosen to email is sent its 1st
 * choice's own "Declined" wording where that programme wrote one, and the
 * "No offer this time" email otherwise.
 */
export function composeDecisionEmail(input: ComposeInput): DecisionEmail | null {
  const { outcome, form } = input;
  if (outcome.kind === "accepted" || outcome.kind === "invited") {
    const programme = programmeOf(form, outcome.programmeId);
    if (!programme) return null;
    return outcome.kind === "accepted"
      ? acceptedEmail(input, programme)
      : invitationEmail(input, programme);
  }
  if (outcome.kind === "declined") {
    const own = programmeOf(form, input.ranked[0])?.emailWording.declined;
    return noOfferEmail(input, own ?? form.noOfferWording);
  }
  return noOfferEmail(input, form.noOfferWording);
}

/**
 * The daily reminder for an invitation nobody has answered yet.
 *
 * It is the invitation email again, word for word, under one line that says
 * it is a reminder and when the reply is due. So it reads the same as what
 * the person was first sent, a programme's own wording included, and somebody
 * whose first email went astray learns everything from the reminder alone.
 * Null when the programme has left the form: there is nothing true to say.
 */
export function composeInvitationReminder(
  input: ComposeInput & { outcome: { kind: "invited"; programmeId: string } },
  due: {
    /** The reply-by day, already formatted: "Sun 25 Oct". */
    replyBy: string;
    /** True on the reply-by day itself. */
    lastDay: boolean;
  },
): DecisionEmail | null {
  const invitation = composeDecisionEmail({ ...input, replyBy: due.replyBy });
  if (!invitation || invitation.kind !== "invitation") return null;
  const when = due.lastDay ? `it’s due today, ${due.replyBy}` : `it’s due by ${due.replyBy}`;
  return {
    ...invitation,
    subject: `Reminder: ${invitation.subject}`,
    paragraphs: [
      `This is a reminder. We haven’t had your reply yet, and ${when}.`,
      ...invitation.paragraphs,
    ],
  };
}

/** The subject a test send carries, so it cannot be mistaken for the real one. */
export function testSubject(subject: string): string {
  return `[TEST] ${subject}`;
}
