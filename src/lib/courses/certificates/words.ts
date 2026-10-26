/**
 * THE WORDS OF CERTIFICATES, in one place: the certificate itself (boards
 * en-cert and en-cert-phone), its owner's controls, the page anybody else is
 * shown, the card on the programme page after the end (en-after-phone), the
 * Certificates section on the programme's Overview (en-finish), the email,
 * and the routes' refusals.
 *
 * The boards' words are kept exactly, apostrophes included. Words the boards
 * do not draw are written in their voice, and are listed in the job's notes
 * for the boards' designers to confirm. Every name, number and date comes in
 * from a record: nothing here knows a term.
 *
 * NO COMMITTEE NAMES on a certificate: it is issued by NAISI, and the words
 * below name nobody but its owner. Never a gendered pronoun.
 *
 * Pure: no reads, nothing server-only.
 */
import { finishedCertificateLead } from "../finishing/words";
import type { CertificateKind, CertificateSnapshot } from "./model";

/** "A", "A and B", "A, B and C". */
function inWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------
// The certificate
// ---------------------------------------------------------------------------

/** "6 weeks", "1 week": how many weeks the programme ran. */
export function weeksWords(weeks: number): string {
  return weeks === 1 ? "1 week" : `${weeks} weeks`;
}

/** Over a finished certificate's name: "Certificate · Autumn 2026" (capitals by its stylesheet). */
export function eyebrowLine(snapshot: Pick<CertificateSnapshot, "term">): string {
  return `Certificate · ${snapshot.term}`;
}

/**
 * Under the programme: "6 weeks · based on the BlueDot Impact curriculum" on
 * a finished certificate, "Autumn 2026 · 6 weeks · based on the BlueDot
 * Impact curriculum" on a facilitator's, as the boards draw each (a
 * facilitator's carries the term here and no eyebrow). The credit line is
 * left off, with its dot, when the course had none.
 */
export function metaLine(kind: CertificateKind, snapshot: CertificateSnapshot): string {
  const parts = kind === "facilitated" ? [snapshot.term, snapshot.weeks] : [snapshot.weeks];
  if (snapshot.credit) parts.push(snapshot.credit);
  return parts.join(" · ");
}

/** The sentence under the rule. */
export function issuedSentence(issuedOn: string): string {
  return `Issued on ${issuedOn} by NAISI, the AI safety student community at the University of Nottingham.`;
}

/** "naisi.uk/c/K7Q2M9…": the page's address as a person types it. */
export function addressWords(host: string, code: string): string {
  return `${host}/c/${code}`;
}

/** At the foot of a certificate whose link is on: "Check it at naisi.uk/c/K7Q2M9…". */
export function checkLine(host: string, code: string): string {
  return `Check it at ${addressWords(host, code)}`;
}

/** What a screen reader is told the drawing is. */
export function certificateLabel(name: string): string {
  return `Certificate for ${name}`;
}

// ---------------------------------------------------------------------------
// The credit line in a programme's Settings
// ---------------------------------------------------------------------------

/**
 * The credit line as a line of its own: its first letter in capitals
 * ("Based on the BlueDot Impact curriculum"). A certificate prints it as it
 * is stored, after a dot ("6 weeks · based on the BlueDot Impact
 * curriculum"). Only the first letter changes, so a name it starts with is
 * never spoilt.
 */
export function creditAsLine(credit: string): string {
  return credit ? credit.charAt(0).toLocaleUpperCase("en-GB") + credit.slice(1) : credit;
}

export const CREDIT_CARD_TITLE = "Certificates";
export const CREDIT_LABEL = "Credit line";
export const CREDIT_NONE = "None. Certificates of this programme carry no credit line.";

/** How the line prints on a certificate: after its weeks and a dot, as it is stored. */
export function creditPrints(credit: string): string {
  return `Every certificate prints it after its weeks and a dot, as “· ${credit}”.`;
}

/** Where it is set, and who can change it there. */
export function creditFrom(courseTitle: string): string {
  return `It comes from the course, ${courseTitle}, and a change reaches the certificates sent after it.`;
}
export const CREDIT_CHANGE = "Change it on the course";
export const CREDIT_ASK = "An admin or the course’s author changes it on the course’s page.";

// ---------------------------------------------------------------------------
// The owner's controls (en-cert)
// ---------------------------------------------------------------------------

export const ONLY_YOU = "Only you see this";
export const DOWNLOAD_PDF = "Download PDF";
export const ADD_TO_LINKEDIN = "Add to LinkedIn";
export const LINK_SWITCH = "Anyone with the link can see it";
export const COPY_LINK = "Copy link";
/** After "Copy link" worked. */
export const LINK_COPIED = "Link copied";
/** When the browser would not copy. */
export const COPY_FAILED = "Your browser wouldn’t copy it. The address is at the top of this page.";
/** When the switch did not save. */
export const SWITCH_FAILED = "That didn’t save. Try again in a minute.";
export const SWITCH_OFFLINE = "Couldn’t reach the site to save that. Check your connection and try again.";

// ---------------------------------------------------------------------------
// The one page for a link that is off, a code that is unknown or malformed
// ---------------------------------------------------------------------------

/**
 * The same words whether or not there is a certificate behind the address,
 * so the page says nothing about whether one exists.
 */
export const CALM_EYEBROW = "Certificate";
export const CALM_TITLE = "There’s nothing to show at this address";
export const CALM_BODY =
  "A certificate shows here only while its owner has its link turned on. If somebody sent you this address, ask them to turn its link on.";
/** For somebody signed out, after the body. */
export const CALM_SIGN_IN = "If it’s yours, sign in to see it.";
export const CALM_SIGN_IN_LINK = "Sign in";
export const CALM_HOME_LINK = "NAISI home";

// ---------------------------------------------------------------------------
// The card on the programme page after the end (en-after-phone)
// ---------------------------------------------------------------------------

export const CARD_TITLE = "Your certificate";
/** For somebody sent both. */
export const CARD_TITLE_BOTH = "Your certificates";
/** "Issued Mon 14 Dec" (capitals by its stylesheet). */
export function cardIssuedLine(issuedShort: string): string {
  return `Issued ${issuedShort}`;
}
export const CARD_PRIVATE = "Only you can see it until you turn its link on.";
/** While the link is on: the switch's own words, as a sentence. */
export const CARD_PUBLIC = `${LINK_SWITCH}.`;
export const SEE_YOUR_CERTIFICATE = "See your certificate";

// ---------------------------------------------------------------------------
// The Certificates section on the Overview (en-finish)
// ---------------------------------------------------------------------------

export const SECTION_TITLE = "Certificates";

/** "28 people who finished and 5 facilitators." */
export function countsSentence(finished: number, facilitators: number): string {
  const people = `${finished} ${finished === 1 ? "person" : "people"} who finished`;
  const staff = `${facilitators} ${facilitators === 1 ? "facilitator" : "facilitators"}`;
  if (finished > 0 && facilitators > 0) return `${people} and ${staff}.`;
  if (finished > 0) return `${people}.`;
  if (facilitators > 0) return `${staff}. Nobody is marked as finished.`;
  return "Nobody is marked as finished, and no group has a facilitator.";
}

/** The thumbnail's name for a screen reader: "Preview Amara Okafor’s certificate page". */
export function previewLabel(name: string): string {
  return `Preview ${name}’s certificate page`;
}

export const THE_EMAIL = "The email";
export const PREVIEW = "Preview";
export const SEND_TEST = "Send a test to me";

/** "Send 33 certificates" the first time; "Send 2 more" once some have gone. Counts certificates, not emails. */
export function sendButtonWords(certificates: number, someSent: boolean): string {
  if (someSent) return `Send ${certificates} more`;
  return `Send ${certificates} ${certificates === 1 ? "certificate" : "certificates"}`;
}

export const TEST_FIRST_LINE = "Send a test to yourself first. Then this unlocks.";

/**
 * "Emails 33 people. Each email links to their certificate page." One email
 * goes to each person, so a facilitator who also finished is one email with
 * both certificates in it, and the line says so when anybody is.
 */
export function emailsLine(emails: number, both: number): string {
  const head = `Emails ${emails} ${emails === 1 ? "person" : "people"}.`;
  if (both === 0) return `${head} Each email links to their certificate page.`;
  return `${head} Each email links to their certificate page, or to both of theirs for the ${both === 1 ? "one person" : `${both} people`} who facilitated and finished.`;
}

export const NOT_FINISHED_LINE = "People who didn’t finish get nothing and aren’t told.";

/** What a test answered, as the team email's test says it. */
export function testSaid(delivery: "sent" | "held" | "suppressed", subject: string): string {
  if (delivery === "sent") return `A test is on its way to you: “${subject}”.`;
  if (delivery === "suppressed") {
    return "Your address is on the do-not-email list, so the test wasn’t sent. Nothing changes until one reaches you.";
  }
  return "This copy of the site doesn’t send to your address, so the test was held. Nothing changes until one reaches you.";
}

/** Once everybody has theirs. */
export const ALL_SENT = "Everybody who finished and every facilitator has been sent theirs.";

/** People owed a certificate who have no email address on file. */
export function noAddressLine(names: readonly string[]): string {
  return `No email address is on file for ${inWords(names)}, so ${names.length === 1 ? "no certificate goes to them" : "no certificates go to them"}.`;
}

/** Over the preview page. */
export function previewPageTitle(name: string): string {
  return `${name}’s certificate page`;
}
export const PREVIEW_PAGE_NOTE =
  "This is how the page will look to its owner once the certificate is sent, with its link off. Nobody else can open it until they turn the link on.";
export const PREVIEW_BACK = "Overview";
/** The preview, with nobody to send a certificate to. */
export const PREVIEW_NOBODY = "Nobody is marked as finished and no group has a facilitator, so there’s no certificate to show.";

// ---------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------

/** "Your certificate for AGI Strategy": the subject and the heading; "certificates" for somebody sent both. */
export function emailSubject(shortName: string, count = 1): string {
  return `Your ${count === 1 ? "certificate" : "certificates"} for ${shortName}`;
}

/** A test is marked as one in its subject. */
export function testSubject(subject: string): string {
  return `[TEST] ${subject}`;
}

export type CertificateEmailWords = {
  subject: string;
  /** "Hi Amara,", or null with no name to greet. */
  greeting: string | null;
  /** The sentences before the buttons. */
  lead: string[];
  /** One button for each certificate the email sends, in the order of `kinds`. */
  buttons: { kind: CertificateKind; label: string }[];
  /** The sentences after them. */
  after: string[];
  signOff: string;
};

/** The order a person's certificates are named in: finished first. */
export function inOrder(kinds: readonly CertificateKind[]): CertificateKind[] {
  return (["finished", "facilitated"] as const).filter((kind) => kinds.includes(kind));
}

/**
 * The email that sends somebody their certificate, or both of them to a
 * facilitator who also finished: one email a person. It names the programme
 * and links to each certificate's page, and nothing else: no time, no place,
 * no other person's name.
 */
export function emailWords(input: {
  kinds: readonly CertificateKind[];
  firstName: string;
  shortName: string;
  programme: string;
}): CertificateEmailWords {
  const kinds = inOrder(input.kinds);
  const both = kinds.length === 2;
  // Somebody the record says finished is told so in the record's own words (C43).
  const lead =
    kinds[0] === "finished"
      ? [finishedCertificateLead(input.programme, both)]
      : [`Thank you for facilitating a group on the ${input.programme}. Your certificate is ready.`];
  return {
    subject: emailSubject(input.shortName, kinds.length),
    greeting: input.firstName ? `Hi ${input.firstName},` : null,
    lead,
    buttons: kinds.map((kind) => ({
      kind,
      label: both ? (kind === "finished" ? SEE_FOR_FINISHING : SEE_FOR_FACILITATING) : SEE_YOUR_CERTIFICATE,
    })),
    after: [
      both
        ? "They’re private: only you can see each one until you turn its link on. From each page you can download it as a PDF or add it to LinkedIn."
        : "It’s private: only you can see it until you turn its link on. From its page you can download it as a PDF or add it to LinkedIn.",
    ],
    signOff: "NAISI",
  };
}

/** The two buttons of an email that sends both. */
export const SEE_FOR_FINISHING = "See your certificate for finishing";
export const SEE_FOR_FACILITATING = "See your certificate for facilitating";

/** Under the buttons: the address of each, for a mail app that shows no buttons. */
export const PASTE_IT = "Or paste this into your browser:";

// ---------------------------------------------------------------------------
// Add to LinkedIn
// ---------------------------------------------------------------------------

/** The certification's name LinkedIn is given. */
export function linkedInTitle(kind: CertificateKind, programme: string): string {
  return kind === "finished" ? programme : `Facilitator, ${programme}`;
}

// ---------------------------------------------------------------------------
// The routes' refusals
// ---------------------------------------------------------------------------

/** Any code that does not open a certificate for this caller: one answer, whatever the reason. */
export const NOT_HERE = "There’s no certificate here.";

export const NO_PROGRAMME = "That programme is not on this form.";
export const LEADS_AND_ADMINS = "Only the programme’s lead and admins can send its certificates.";
export const NO_RUN = "This programme doesn’t name a course run yet, so nobody can have finished it.";
export const RUN_GONE = "The course run this programme names is no longer on the site.";

/** Before the run's last session is over. */
export function notOverYet(lastDay: string | null): string {
  return lastDay
    ? `Certificates can be sent once the last session is over, on ${lastDay}.`
    : "Certificates can be sent once the last session is over, and this programme’s sessions have no dates yet.";
}

export const TEST_FIRST = "Send a test to yourself first, then press again.";
export const NO_ADDRESS_FOR_TEST = "Your account has no email address on file, so there is nowhere to send a test.";
export const NOBODY_TO_TEST = "Nobody is owed a certificate, so there’s no email to test.";
export const NOBODY_OWED = "Everybody who finished and every facilitator has been sent theirs already.";
export const PRESS_IN_PROGRESS =
  "Somebody is sending this programme’s certificates right now. Wait a minute, then press again.";

/** The numbers on the button are no longer what a press would send. */
export function countMoved(certificates: number, emails: number): string {
  return `There are now ${certificates} ${certificates === 1 ? "certificate" : "certificates"} to send, to ${emails} ${emails === 1 ? "person" : "people"}. Check the list, then press again.`;
}

/** A certificate that cannot be written whole stops the press. */
export function cannotWriteWhole(name: string, reason: string): string {
  return `The certificate for ${name} can’t be written whole: ${reason}. Nothing was sent.`;
}

export const MISSING_TERM = "the course run has no term, and its form has no name";
export const MISSING_WEEKS = "the course run has no weeks";
export const MISSING_NAME = "their account has no name";
export const MISSING_PROGRAMME = "the programme has no name";

/** Who finished's switch, for somebody already sent a certificate for finishing. */
export function certificateHolds(name: string): string {
  return `${name} has been sent a certificate for finishing, so they stay finished while it stands. Nothing was saved.`;
}

/** The rule for who finished, when it would untick somebody sent a certificate for finishing. */
export function ruleWouldUntick(names: readonly string[]): string {
  const who = inWords(names);
  return names.length === 1
    ? `${who} has been sent a certificate for finishing, and that rule would mark them as not finished. Nothing was saved.`
    : `${who} have been sent certificates for finishing, and that rule would mark them as not finished. Nothing was saved.`;
}

// ---------------------------------------------------------------------------
// What a press did
// ---------------------------------------------------------------------------

export type SendReport = { sent: number; held: number; suppressed: number; failed: string[]; noAddress: string[] };

/** The sentences under the buttons after a press, from what each send answered. */
export function sendReportWords(report: SendReport): string[] {
  const out: string[] = [];
  if (report.sent > 0) out.push(`${report.sent} ${report.sent === 1 ? "certificate" : "certificates"} sent.`);
  if (report.held > 0) {
    out.push(`${report.held} held by this copy of the site, which doesn’t email those addresses.`);
  }
  if (report.suppressed > 0) {
    out.push(`${report.suppressed} not sent: ${report.suppressed === 1 ? "that address is" : "those addresses are"} on the do-not-email list.`);
  }
  if (report.failed.length > 0) {
    out.push(`Couldn’t send to ${inWords(report.failed)}. Press again to try ${report.failed.length === 1 ? "that one" : "those"} again.`);
  }
  if (report.noAddress.length > 0) out.push(noAddressLine(report.noAddress));
  return out;
}
