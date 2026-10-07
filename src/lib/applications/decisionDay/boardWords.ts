import { STATUS_LABELS, type AffiliationStatus } from "@/lib/firestore/users";
import type { AboutYou } from "../model";

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
export function sendButtonLabel(emails: number, people: number, perPress: number, alreadyPublished: number): string {
  // Everybody has their result and the term was never marked as sent: an
  // earlier press was cut short at the very end.
  if (people === 0 && alreadyPublished > 0) return "Finish the send";
  if (people > perPress) {
    return `Send the ${alreadyPublished > 0 ? "next" : "first"} ${perPress} of ${people} decisions`;
  }
  if (alreadyPublished > 0) return `Send the remaining ${emailsLabel(emails)}`;
  return `Send ${emailsLabel(emails)}`;
}
