import { FIELD_LIMITS, STATUS_LABELS } from "@/lib/firestore/users";
import type { AboutYou } from "../model";
import { hasOwn } from "./keys";

/**
 * ABOUT YOU, AND WHERE EACH PART OF IT COMES FROM.
 *
 * The first step of the form asks the same questions as joining the site, and
 * for somebody with an account it opens already filled in from their profile
 * (`users/{uid}.profile`). What they confirm is saved on the application as
 * `aboutYou`.
 *
 * ## The application keeps its own copy
 *
 * An edit on this step changes the APPLICATION and nothing else. It does not
 * write back to the profile. The profile has rules of its own (a university
 * address is only trusted once its owner has followed an emailed link, and a
 * change to it is rate limited), and a form that could rewrite the profile
 * would be a second door into all of them. It also means a reviewer reads
 * what was true when the person applied, which is what the copy is for.
 *
 * ## The university email is the account's, always
 *
 * `universityEmail` and `universityEmailVerified` are never taken from a
 * request. `withAccountEmail` overwrites both with what the account holds,
 * on every save and again on every send, so the "Verified" chip a reviewer
 * sees is the account's own verified address and cannot be typed.
 */

type Raw = Record<string, unknown>;

function record(v: unknown): Raw {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {};
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

const GRADUATION_SHAPE = /^\d{4}-\d{2}$/;

/**
 * The About you answers a person's account already holds, read off the raw
 * `users/{uid}` document. Anything missing or malformed reads as blank, so a
 * profile written by an older version of the site still opens the form.
 */
export function aboutYouFromAccount(userData: unknown): AboutYou {
  const profile = record(record(userData).profile);
  const status = typeof profile.status === "string" && hasOwn(STATUS_LABELS, profile.status) ? profile.status : "";
  const graduation = text(profile.expectedGraduation, 7);
  const universityEmail = text(profile.universityEmail, FIELD_LIMITS.universityEmail);
  return {
    preferredName: text(profile.preferredName, FIELD_LIMITS.preferredName),
    universityEmail,
    // Only an address the account has proved is its own counts as verified.
    universityEmailVerified: Boolean(universityEmail) && Boolean(profile.uniEmailVerifiedAt),
    status,
    statusOther: status === "other" ? text(profile.statusOther, FIELD_LIMITS.statusOther) : "",
    subject: text(profile.subject, FIELD_LIMITS.subject),
    expectedGraduation: GRADUATION_SHAPE.test(graduation) ? graduation : "",
    motivation: text(profile.motivation, FIELD_LIMITS.motivation),
    interests: text(profile.interests, FIELD_LIMITS.interests),
  };
}

/** `about`, with the university email and its verified flag replaced by the account's. */
export function withAccountEmail(about: AboutYou, account: AboutYou): AboutYou {
  return {
    preferredName: about.preferredName,
    universityEmail: account.universityEmail,
    universityEmailVerified: account.universityEmailVerified,
    status: about.status,
    statusOther: about.statusOther,
    subject: about.subject,
    expectedGraduation: about.expectedGraduation,
    motivation: about.motivation,
    interests: about.interests,
  };
}
