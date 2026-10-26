import { issuedYearMonth } from "./dates";
import type { CertificateKind } from "./model";
import { linkedInTitle } from "./words";

/**
 * ADD TO LINKEDIN: a plain link to LinkedIn's own "add a certification" form.
 *
 * The privacy policy (version 7, "Certificates") says Add to LinkedIn sends
 * nothing until it is pressed, and that pressing it takes the certificate's
 * title, the date and its link to LinkedIn. So the address carries exactly
 * those three, as LinkedIn's parameters name them (`name`; `issueYear` and
 * `issueMonth`; `certUrl`), and the one word that says which of LinkedIn's
 * forms to open (`startTask`). Never the name of the person, their account,
 * the code on its own or an organisation. Nothing is sent from the site: the
 * person's own browser goes there when they press it.
 *
 * Pure.
 */

/** LinkedIn's form for adding a certification to a profile. */
export const LINKEDIN_ADD = "https://www.linkedin.com/profile/add";

/** Which of LinkedIn's forms the address opens: not anything about the person. */
export const LINKEDIN_TASK = "CERTIFICATION_NAME";

/** Every parameter the address may carry, in the order it carries them. */
export const LINKEDIN_PARAMETERS = ["startTask", "name", "issueYear", "issueMonth", "certUrl"] as const;

export function linkedInHref(input: {
  kind: CertificateKind;
  programme: string;
  /** When it was issued, read in London for the year and month. */
  issuedAt: Date;
  /** The certificate's whole address. */
  url: string;
}): string {
  const { year, month } = issuedYearMonth(input.issuedAt);
  const params = new URLSearchParams();
  params.set("startTask", LINKEDIN_TASK);
  params.set("name", linkedInTitle(input.kind, input.programme));
  params.set("issueYear", String(year));
  params.set("issueMonth", String(month));
  params.set("certUrl", input.url);
  return `${LINKEDIN_ADD}?${params.toString()}`;
}
