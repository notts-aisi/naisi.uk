import { STATUS_LABELS, type AffiliationStatus } from "@/lib/firestore/users";
import type { AboutYou, SuMembershipAnswer } from "../model";
import type { OwnApplication } from "./plan";
import type { SendReport } from "./views";

/**
 * THE SENTENCES THE TWO SCREENS BUILD FROM NUMBERS.
 *
 * Each is a line of the design with its numbers taken out, so "2 invitations"
 * becomes "1 invitation" without anybody writing the plural twice. Pure, and
 * shared by the server (which states the readiness rows) and the browser
 * (which restates the totals as an admin flips a switch).
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * The one line that tells an admin who has applied that their own
 * application is not on the page. Null for somebody who has not.
 *
 * It is said whenever they have one, wherever it stands, so the line itself
 * says nothing about that. Once decision day has told them, nobody has an
 * outcome left to choose, and they know it: their own page shows it.
 */
export function ownApplicationLine(own: OwnApplication, page: "pool" | "send"): string | null {
  if (own === "none") return null;
  const notShown = "Your own application is not shown or counted here.";
  if (own === "told") return notShown;
  return page === "pool"
    ? `${notShown} Another admin has to choose its outcome.`
    : `${notShown} Another admin has to choose its outcome, and you hear with everybody else.`;
}

/**
 * What somebody answered when the form asked whether they have SU
 * membership, as the decision-day page says it under their name.
 *
 * It is their own answer to that question and not a membership record, which
 * the site keeps elsewhere, so the line says that they said it. The form's
 * two answers are "Yes" and "Not yet".
 */
export function suMembershipLabel(answer: SuMembershipAnswer | null): string {
  if (answer === "yes") return "SU membership: said yes";
  if (answer === "not-yet") return "SU membership: said not yet";
  return "SU membership: no answer";
}

function invitations(n: number): string {
  return `${n} ${n === 1 ? "invitation" : "invitations"}`;
}

/**
 * The line under somebody's degree. The form asks when they expect to
 * graduate and what they do at the university, so that is what is shown.
 */
export function studyLine(about: Pick<AboutYou, "status" | "statusOther" | "expectedGraduation">): string {
  const match = /^(\d{4})-(\d{2})$/.exec(about.expectedGraduation);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  if (match && month) return `Graduating ${month} ${match[1]}`;
  if (about.status === "other") return about.statusOther.trim();
  return STATUS_LABELS[about.status as AffiliationStatus] ?? "";
}

// ---------------------------------------------------------------------------
// Pooled applicants
// ---------------------------------------------------------------------------

/** "All 32 places taken." or "22 of 24 places taken." */
export function placesTakenLine(places: number | null, placed: number): string {
  if (places === null) return "No number of places set yet.";
  if (placed === places) return `All ${places} places taken.`;
  return `${placed} of ${places} places taken.`;
}

/**
 * "Both are picked for invitations.": what the invitations already picked do
 * to the places still open. Empty when nobody has been invited here.
 */
export function invitationsPickedLine(open: number | null, invited: number): string {
  if (invited === 0 || open === null) return "";
  if (invited > open) {
    return `${invitations(invited)} picked, for ${open} free ${open === 1 ? "place" : "places"}.`;
  }
  if (invited === open) {
    if (open === 1) return "It’s picked for an invitation.";
    if (open === 2) return "Both are picked for invitations.";
    return `All ${open} are picked for invitations.`;
  }
  return invited === 1 ? "1 is picked for an invitation." : `${invited} are picked for invitations.`;
}

/** "55 pooled · 2 invitations · 53 no offer", and who still needs an outcome. */
export function poolTotalsLine(counts: {
  pooled: number;
  invitations: number;
  noOffer: number;
  needsOutcome: number;
}): string {
  const parts = [
    `${counts.pooled} pooled`,
    invitations(counts.invitations),
    `${counts.noOffer} no offer`,
  ];
  if (counts.needsOutcome > 0) {
    parts.push(`${counts.needsOutcome} ${counts.needsOutcome === 1 ? "needs" : "need"} an outcome`);
  }
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Decision day
// ---------------------------------------------------------------------------

/** "22 of 24 places, and 2 invitations". */
export function placesDetail(places: number | null, placed: number, invited: number): string {
  const taken = places === null ? `${placed} placed` : `${placed} of ${places} places`;
  return invited > 0 ? `${taken}, and ${invitations(invited)}` : taken;
}

/** "2 invitations, 53 no offer". */
export function pooledDetail(invited: number, noOffer: number): string {
  return `${invitations(invited)}, ${noOffer} no offer`;
}

/** "66 accepted, 2 invitations and 53 no offer". */
export function sendTotalsLine(accepted: number, invited: number, noOffer: number): string {
  return `${accepted} accepted, ${invitations(invited)} and ${noOffer} no offer`;
}

/** "66 emails", "1 email". */
export function emailsLabel(n: number): string {
  return `${n} ${n === 1 ? "email" : "emails"}`;
}

/** "1 application", "3 applications". */
export function applicationsLabel(n: number): string {
  return `${n} ${n === 1 ? "application" : "applications"}`;
}

/** What happens to the declined applications, said under the totals. Empty when there are none. */
export function declinedLine(count: number, emailThem: boolean): string {
  if (count === 0) return "";
  if (emailThem) {
    return count === 1
      ? "The declined application gets the “No offer this time” email."
      : `The ${count} declined applications get the “No offer this time” email.`;
  }
  return count === 1
    ? "The declined application isn’t emailed."
    : `The ${count} declined applications aren’t emailed.`;
}

/**
 * What the one primary button says: how many emails this press sends. When a
 * term is too big for one press, or an earlier press was cut short, it says
 * that too, so the number on the button is always the number that goes.
 */
export function sendButtonLabel(
  emails: number,
  people: number,
  perPress: number,
  alreadyPublished: number,
  owed = 0,
): string {
  // Everybody has their result and the term was never marked as sent: an
  // earlier press was cut short at the very end. What is left is the emails
  // still owed, when there are any, and marking the term.
  if (people === 0 && alreadyPublished > 0) {
    return owed > 0 ? owedButtonLabel(owed) : "Finish the send";
  }
  if (people + owed > perPress) {
    return `Send the ${alreadyPublished > 0 ? "next" : "first"} ${perPress} of ${people + owed} decisions`;
  }
  if (alreadyPublished > 0) return `Send the remaining ${emailsLabel(emails)}`;
  return `Send ${emailsLabel(emails)}`;
}

/** The button that sends only what is still owed to people already told. */
export function owedButtonLabel(owed: number): string {
  return owed === 1 ? "Send the 1 email still owed" : `Send the ${owed} emails still owed`;
}

/** How many names a sentence lists before it says how many more there are. */
const NAMES_IN_A_SENTENCE = 8;

/** "Ada Obi", "Ada Obi and Ben Hartley", "Ada Obi, Ben Hartley and 3 more". */
export function nameList(names: readonly string[], cap = NAMES_IN_A_SENTENCE): string {
  if (names.length === 0) return "";
  if (names.length > cap) return `${names.slice(0, cap).join(", ")} and ${names.length - cap} more`;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Who has their result and not their email, and which button sends it. */
export function owedLine(names: readonly string[], sentByTheMainButton: boolean): string {
  const one = names.length === 1;
  const line =
    `${nameList(names)} ${one ? "has" : "have"} their result on the site, ` +
    `but ${one ? "their email has" : "their emails have"} not gone.`;
  return sentByTheMainButton
    ? `${line} The Send button below sends ${one ? "it" : "them"} too.`
    : line;
}

/** Somebody owed an email whose application has no address to send it to. */
export function noAddressLine(names: readonly string[]): string {
  const one = names.length === 1;
  return (
    `${nameList(names)} ${one ? "has" : "have"} no email address on their ${one ? "application" : "applications"}, ` +
    `so there is nowhere to send ${one ? "their email" : "their emails"}. ` +
    `${one ? "Their result is" : "Their results are"} on the site.`
  );
}

/** Emails a press is sending at this moment. */
export function inFlightLine(count: number): string {
  return (
    `${count} ${count === 1 ? "email is" : "emails are"} being sent right now. ` +
    "Reload the page in a minute."
  );
}

/**
 * Why an email nobody can vouch for is left alone, and what to do about it.
 * Said after a press and again on the page for as long as it is true.
 */
export function unconfirmedLine(names: readonly string[]): string {
  return (
    `We can’t tell whether the email to ${nameList(names)} went: the send was cut off while it was being handed over. ` +
    "It won’t be sent again, so nobody gets their decision twice. " +
    "Look for it in Deliverability, and write to them yourself if it isn’t there."
  );
}

/**
 * Accepted people whose account is still waiting, and where to approve them.
 * Said when the send does not approve accounts, and again after a send that
 * could not approve somebody's.
 */
export function accountsWaitingLine(waiting: number, sendingApproves: boolean): string {
  const one = waiting === 1;
  const who = `${waiting} of them ${one ? "has" : "have"} an account that’s still waiting.`;
  return sendingApproves
    ? `${who} Approve ${one ? "it" : "them"} in Approvals.`
    : `${who} Sending doesn’t approve it, so approve ${one ? "it" : "them"} in Approvals.`;
}

/** Accepted people whose join request was refused before they were accepted. */
export function accountsRefusedLine(names: readonly string[]): string {
  const one = names.length === 1;
  return (
    `${nameList(names)} ${one ? "was" : "were"} accepted, but ${one ? "their join request was" : "their join requests were"} refused earlier. ` +
    `Sending leaves ${one ? "that account as it is" : "those accounts as they are"}.`
  );
}

/** What one press did, in sentences whose numbers add up to the people it looked at. */
export function reportLines(report: SendReport): string[] {
  const lines: string[] = [];
  const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

  const did: string[] = [];
  if (report.published > 0) did.push(`${people(report.published)} told`);
  if (report.retried > 0) {
    did.push(`${report.retried} owed ${report.retried === 1 ? "email" : "emails"} taken up`);
  }
  if (did.length > 0) {
    const parts = [`${report.emailed} emailed`];
    if (report.held > 0) parts.push(`${report.held} held`);
    if (report.suppressed > 0) parts.push(`${report.suppressed} on the do-not-email list`);
    if (report.failed > 0) parts.push(`${report.failed} failed`);
    if (report.unconfirmed > 0) parts.push(`${report.unconfirmed} not confirmed`);
    if (report.notEmailed > 0) parts.push(`${report.notEmailed} declined and not emailed`);
    lines.push(`${did.join(" and ")}: ${parts.join(", ")}.`);
  } else {
    lines.push(report.owedOnly ? "No owed email was sent." : "Nobody new was told.");
  }
  if (report.held > 0) {
    lines.push(
      "Held means this copy of the site may not write to that address, so nothing was sent to it. That is how a rehearsal works.",
    );
  }
  if (report.failed > 0) {
    lines.push(
      `The email could not be sent to ${nameList(report.failedNames)}. ` +
        "Their result is on their application page, and the email is still owed: it is listed on this page until it goes.",
    );
  }
  if (report.unconfirmed > 0) lines.push(unconfirmedLine(report.unconfirmedNames));
  if (report.accountsApproved > 0) {
    lines.push(
      report.accountsApproved === 1
        ? "1 account that was waiting is now approved."
        : `${report.accountsApproved} accounts that were waiting are now approved.`,
    );
  }
  if (report.accountsFailed.length > 0) {
    const one = report.accountsFailed.length === 1;
    lines.push(
      `Could not approve the ${one ? "account" : "accounts"} of ${nameList(report.accountsFailed)}. ` +
        `Approve ${one ? "it" : "them"} in Approvals.`,
    );
  }
  if (report.accountsRefused.length > 0) lines.push(accountsRefusedLine(report.accountsRefused));
  if (!report.owedOnly && report.skipped > 0) {
    lines.push(`${people(report.skipped)} already had their result, so nothing went to them again.`);
  }
  if (report.changed > 0) {
    lines.push(
      `${people(report.changed)} ${report.changed === 1 ? "was" : "were"} left out because their decision changed after you pressed Send. Check the page and send again.`,
    );
  }
  if (report.stopped === "emails-failing") {
    lines.push(
      report.owedOnly
        ? "The send stopped because emails were failing. Try again once the mail is working."
        : "The send stopped because emails were failing. Nobody else was told. Press Send again once the mail is working.",
    );
  } else if (report.notReached > 0) {
    lines.push(
      report.owedOnly
        ? `${report.notReached} owed ${report.notReached === 1 ? "email was" : "emails were"} not reached. Press the button again for the rest.`
        : `${people(report.notReached)} still to be told. Press Send again for the rest.`,
    );
  }
  if (report.complete && !report.owedOnly) lines.push("Everybody in the term now has their result.");
  return lines;
}
