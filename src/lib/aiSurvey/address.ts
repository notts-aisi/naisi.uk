/**
 * Which addresses may answer the AI at Nottingham survey, and the one form an
 * address is reduced to before it is hashed and before a code is sent to it.
 *
 * Pure, so the page can refuse an address beside its box before anything is
 * sent, and the server applies the very same rule again.
 *
 * NOT `validateUniversityEmail` from src/lib/firestore/users.ts: that one
 * allows subdomains, which is right for an account and wrong here. A student
 * holds exactly one University address, and only `nottingham.ac.uk` counts.
 */

export const UNIVERSITY_DOMAIN = "nottingham.ac.uk";

/** The longest local part an address may have (RFC 5321). */
const MAX_LOCAL = 64;

/**
 * The address reduced to its one form, or null when it is not a University
 * address.
 *
 * Trimmed, lower-cased, and with anything from a plus sign to the @ dropped,
 * so `Someone+survey@Nottingham.ac.uk` and `someone@nottingham.ac.uk` are one
 * student.
 * The part after the @ must be EXACTLY the University's domain: a subdomain,
 * a look-alike or a trailing dot is somebody else's address.
 */
export function normaliseUniversityAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  // Longer than any real address: refuse before doing any work on it.
  if (trimmed.length === 0 || trimmed.length > 254) return null;
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || trimmed.indexOf("@") !== at) return null;
  const domain = trimmed.slice(at + 1);
  if (domain !== UNIVERSITY_DOMAIN) return null;
  const plus = trimmed.indexOf("+");
  const local = plus >= 0 && plus < at ? trimmed.slice(0, plus) : trimmed.slice(0, at);
  if (local.length === 0 || local.length > MAX_LOCAL) return null;
  // Letters, digits and the few marks a University mailbox name carries. No
  // spaces, quotes or control characters, so nothing typed here can break out
  // of the address when the code email is addressed to it.
  if (!/^[a-z0-9](?:[a-z0-9._'-]*[a-z0-9])?$/.test(local)) return null;
  if (local.includes("..")) return null;
  return `${local}@${UNIVERSITY_DOMAIN}`;
}

/** Six digits and nothing else, with the spaces a phone's keypad or a paste may add taken out. */
export function normaliseCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}
