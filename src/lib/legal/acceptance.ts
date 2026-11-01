import { currentPolicy } from "./policies";

/**
 * WHETHER SOMEBODY IS SENT TO ACCEPT THE POLICIES (/re-consent), decided from
 * the agreement stored on their account or collaborator record
 * (`policyVersion`, "terms.1+privacy.15").
 *
 * Until privacy version 15 the two gated layouts asked whenever the stored
 * string was not exactly CURRENT_POLICY_VERSION, so every new version asked
 * everybody again. Version 15 is the last privacy version anybody is asked to
 * accept: it says that a later change to how we use somebody's information is
 * told on the site and by email before it takes effect, and that we will not
 * ask them to accept later versions. So an agreement is ASKED ABOUT when:
 *
 *  - there is none, or it cannot be read: not a string, not exactly one terms
 *    version and one privacy version, or a version the site has never served
 *    (above the current one). Nobody was ever shown a version that does not
 *    exist yet, so a claim to have accepted it is no agreement, the same rule
 *    `agreementCoversCourseworkUse` keeps; and asking is what puts a forged
 *    value right, which firestore.rules relies on, since a browser's create
 *    may write any version string;
 *  - its privacy version is below LAST_PRIVACY_VERSION_ASKED;
 *  - its terms version is below the current terms version. The promise not to
 *    ask again is the privacy policy's, so a new version of the Terms of Use
 *    still asks everybody.
 *
 * Otherwise it is not: any privacy version from 15 to the current one, with
 * the current terms. Accepting stamps CURRENT_POLICY_VERSION (the re-consent
 * route), which this answers no for.
 *
 * Pure: no reads, no clock, no server-only import. Safe anywhere.
 */

/**
 * The last privacy policy version anybody is asked to accept. Version 15 took
 * back several promises earlier versions made, so it asked everybody once
 * more, and it says itself that later versions are told, not asked: a later
 * version moves CURRENT_POLICY_VERSION and the date, and asks nobody whose
 * agreement is to 15 or after. Raising this would ask everybody again, which
 * version 15 promised we would not do.
 */
export const LAST_PRIVACY_VERSION_ASKED = 15;

/** One part of a stored agreement: "terms.1" or "privacy.15", no leading zero. */
const PART = /^(terms|privacy)\.([1-9]\d{0,3})$/;

/**
 * The two versions inside a stored agreement, or null when it cannot be read:
 * anything that is not one terms part and one privacy part joined by a "+",
 * in either order.
 */
export function agreementIn(policyVersion: unknown): { terms: number; privacy: number } | null {
  if (typeof policyVersion !== "string" || policyVersion.length > 64) return null;
  const parts = policyVersion.split("+");
  if (parts.length !== 2) return null;
  const found: Partial<Record<"terms" | "privacy", number>> = {};
  for (const part of parts) {
    const match = PART.exec(part);
    if (!match) return null;
    const key = match[1] as "terms" | "privacy";
    if (found[key] !== undefined) return null;
    found[key] = Number(match[2]);
  }
  return found.terms !== undefined && found.privacy !== undefined ? { terms: found.terms, privacy: found.privacy } : null;
}

/** Whether a stored agreement still needs the accept page. The rule is in this file's header. */
export function needsPolicyAcceptance(policyVersion: unknown): boolean {
  const agreed = agreementIn(policyVersion);
  if (!agreed) return true;
  const terms = currentPolicy("terms").version;
  const privacy = currentPolicy("privacy").version;
  // A version the site has never served is no agreement to anything.
  if (agreed.terms > terms || agreed.privacy > privacy) return true;
  if (agreed.privacy < LAST_PRIVACY_VERSION_ASKED) return true;
  return agreed.terms < terms;
}
