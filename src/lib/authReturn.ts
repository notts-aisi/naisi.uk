/**
 * The ONE allowlist of return addresses that survive sign-in and registration.
 *
 * ## Why an allowlist rather than an open-redirect guard
 *
 * Registration is the back half of two funnels. The course apply page's whole
 * premise is "any account can apply, including one you make in the next
 * minute", and the admission round's is the same promise at the scale of the
 * whole autumn intake: at the freshers' fair, "register, then apply" IS the
 * journey, and the two fairs are the two days that decide how many people the
 * programme reaches. Without this, finishing registration always lands on
 * `/pending-approval` and leaves the applicant to find their way back to a
 * form they were halfway through.
 *
 * The allowlist is a set of PREFIXES, not a general parser, and that is
 * deliberate: two funnels need this, and a narrow prefix is far easier to be
 * sure about than a scheme-and-host parser. Everything dangerous fails it for
 * free:
 *
 *  - an absolute URL ("https://evil.example") does not start with a slash;
 *  - a protocol-relative one ("//evil.example") fails the second character;
 *  - the backslash trick browsers normalise to a slash ("/\evil.example")
 *    fails the prefix, and any later backslash is rejected outright;
 *  - a scheme with no slash ("javascript:alert(1)") fails the first character.
 *
 * The prefix alone is not quite enough, though: "/courses/../admin" starts
 * with one and still leaves the funnel the moment a browser normalises the
 * path. So a dot-dot SEGMENT is rejected too, which keeps the allowlist
 * meaning what it says rather than what it happens to spell.
 *
 * Anything that does not match falls back to `/pending-approval`, which is
 * still the right answer for the overwhelming majority of registrations.
 *
 * Lives in `lib/` rather than beside either caller because three files decide
 * this now (the register page, `AuthEntry`, and the Google redirect callback's
 * cookie), and three copies of a redirect allowlist is three chances for one
 * of them to be widened alone.
 */

/**
 * Path prefixes a return address may start with. Each one is a form somebody
 * can be halfway through when they are asked to make an account.
 */
export const FUNNEL_RETURN_PREFIXES = ["/courses/", "/apply/"] as const;

/** True when `raw` is one of the funnel return addresses. */
export function isFunnelReturn(raw: string | null | undefined): boolean {
  return safeFunnelReturn(raw) !== null;
}

/** `raw` when it is a safe funnel return address, otherwise null. */
export function safeFunnelReturn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!FUNNEL_RETURN_PREFIXES.some((prefix) => raw.startsWith(prefix))) return null;
  // Backslashes and control characters never appear in a path this site
  // generates, and both are the raw material of redirect tricks.
  if (raw.includes("\\")) return null;
  // Checked by code point rather than a regex so this source file carries no
  // literal control characters of its own. A newline is the one that matters.
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return null;
  }
  // Segment-wise, so a legitimate ".." inside a course id (or a lone dot) is
  // untouched while a real traversal segment is refused. The query string and
  // fragment are split off first: they are not path segments and a "?a=.." is
  // not a traversal.
  const path = raw.split(/[?#]/, 1)[0];
  if (path.split("/").includes("..")) return null;
  return raw;
}

/**
 * A page that IS one of those forms: an application form or an older round
 * (`/apply/<id>`), or a course's own apply page (`/courses/<id>/apply`).
 */
const FORM_PAGE = /^\/(?:apply\/[^/]+|courses\/[^/]+\/apply)$/;

/**
 * `pathname` when somebody on that page is on a form, otherwise null.
 *
 * NARROWER THAN THE LIST ABOVE, ON PURPOSE. That list says where signing in
 * or registering may hand somebody BACK to, and a course's public page is on
 * it. This says which pages somebody is ON when leaving them loses a form,
 * which is the question the site's top bar asks (`signedOutEntriesOn`,
 * `src/layout/publicNav.ts`). Every address it passes is on the list above.
 */
export function formPageReturn(pathname: string | null | undefined): string | null {
  const safe = safeFunnelReturn(pathname);
  return safe !== null && FORM_PAGE.test(safe) ? safe : null;
}

/**
 * The sign-in page, with a form's page as the place to come back to.
 *
 * `formPage` is an address `formPageReturn` passed. The BARE address is
 * carried, never an application form's marked one (`signInHrefFor`,
 * `src/lib/applications/applicant/join.ts`): from the address alone nobody
 * can tell an application form from an older round or from a form that is
 * not open, and the sign-in page already sorts a bare one for an account
 * with no join request, by asking the form's own route (`newAccountReturn`).
 */
export function signInHrefWithReturn(formPage: string): string {
  return `/login?next=${encodeURIComponent(formPage)}`;
}
