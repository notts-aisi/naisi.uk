/**
 * CERTIFICATES (boards en-cert and en-cert-phone, the Certificates section of
 * en-finish, the card on en-after-phone; Q8 with Q26).
 *
 * When a programme ends, its lead or an admin sends a certificate to everybody
 * the programme's record says finished it, and to each person who facilitated
 * one of its groups. Each is a page at `/c/<code>`, private until its owner
 * turns its link on, and a PDF its owner can download. What the privacy
 * policy (version 7, "Certificates" and "Retention") says about them is what
 * this module and its neighbours do.
 *
 * ## The one collection: `courseCertificates`
 *
 * One document per person, run and kind, at `{runId}__{uid}__{kind}`, so a
 * second certificate of the same kind for the same person on the same run
 * cannot be made: the send creates the document, and a create fails where one
 * stands. Written only on the server (the send, the owner's switch, the two
 * deletion cascades) and refused to every browser by `firestore.rules`.
 *
 *  - `code`: what the page's address carries. Sixteen characters of
 *    Crockford's base32 (`CODE_ALPHABET`), 80 bits from the operating
 *    system's random source. The policy says the link is not guessable, so a
 *    code is longer than the six characters the boards draw (about 30 bits):
 *    keep it at 80 bits or more.
 *  - `uid`: the owner's account, or null once that account is deleted while
 *    the link was on (a certificate whose link is off goes with the account).
 *  - `runId`: the run it is for, or null once that run is destroyed while the
 *    link was on (one whose link is off goes with the run).
 *  - `linkOn`: false when it is made. Only its owner turns it on and off.
 *  - `issuedAt`: when it was made, the moment the send created it.
 *  - `snapshot`: every word the certificate shows, as they were when it was
 *    issued: the name, what they did ("finished the" or "facilitated a group
 *    on the"), the programme, the term, how many weeks it ran, the course's
 *    credit line (on both kinds, as the boards draw them, when the course has
 *    one) and the day it was issued. The page and the PDF draw from the
 *    snapshot alone, so a certificate reads the same after its run, its
 *    course and its owner's account are gone.
 *  - `email`: what happened to the email that sent it (see `CertificateEmail`).
 *
 * The id is CONSTRUCT-ONLY: run ids contain `__`, so a reader checks the
 * stored fields and never parses the id.
 *
 * Pure: no reads, nothing server-only, so the page's client code can import
 * the types and the parsers from here.
 */

export const CERTIFICATES_COLLECTION = "courseCertificates";

/** Finished the programme, or facilitated a group on it. */
export type CertificateKind = "finished" | "facilitated";

export const CERTIFICATE_KINDS: readonly CertificateKind[] = ["finished", "facilitated"];

/**
 * Crockford's base32: the ten digits and the capitals without I, L, O and U,
 * so nothing in a code can be read as another character, or as a word.
 */
export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Characters in a code: 16 of 32 symbols is 80 bits. */
export const CODE_LENGTH = 16;

/** Bounds of the stored words. Field limits, never settings of a term. */
export const CERTIFICATE_LIMITS = {
  name: 120,
  programme: 120,
  term: 60,
  weeks: 20,
  credit: 80,
  issuedOn: 40,
  /** A uid in a stored field: well above any account id. */
  uid: 128,
} as const;

/** The words a certificate says about what its owner did. */
export const DID_WORDS: Record<CertificateKind, string> = {
  finished: "finished the",
  facilitated: "facilitated a group on the",
};

/** The one certificate a person may hold of a kind on a run. CONSTRUCT-ONLY, NEVER PARSE. */
export function certificateId(runId: string, uid: string, kind: CertificateKind): string {
  return `${runId}__${uid}__${kind}`;
}

const CODE_SHAPE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/**
 * A code from an address or a body, in its stored form (capitals), or null
 * for anything that cannot be one. Lower case is read as upper case, because
 * a code printed on a PDF is typed by hand; nothing else is forgiven.
 */
export function codeFrom(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return CODE_SHAPE.test(code) ? code : null;
}

/** Every word a certificate shows, frozen when it was issued. */
export type CertificateSnapshot = {
  /** "Amara Okafor". */
  name: string;
  /** "finished the" or "facilitated a group on the". */
  did: string;
  /** "AGI Strategy Fellowship". */
  programme: string;
  /** "Autumn 2026". */
  term: string;
  /** "6 weeks". */
  weeks: string;
  /**
   * "based on the BlueDot Impact curriculum", or null when the course had
   * none. Either kind carries it. Kept as it prints after "·": the course's
   * setting stores it that way (`CourseDoc.credit`).
   */
  credit: string | null;
  /** "Mon 14 Dec 2026". */
  issuedOn: string;
};

/**
 * What happened to the email that sent the certificate. `sending` is the
 * claim a press takes before it hands the message over; it is settled to what
 * the mail door answered. A send that threw is `failed`, and a press counts
 * that person as owed again, as it does a claim older than a press can live
 * (`STALE_SENDING_MS`).
 */
export type CertificateEmailState = "sending" | "sent" | "held" | "suppressed" | "failed";

export const CERTIFICATE_EMAIL_STATES: readonly CertificateEmailState[] = [
  "sending",
  "sent",
  "held",
  "suppressed",
  "failed",
];

export type CertificateEmail = { state: CertificateEmailState; at: Date | null };

/**
 * How long a claim to send one person's email stands before a press may try
 * them again. A request on the site lives for at most a minute, so a claim
 * this old belongs to a press that stopped before it could say what happened.
 */
export const STALE_SENDING_MS = 10 * 60_000;

export type CertificateDoc = {
  id: string;
  kind: CertificateKind;
  code: string;
  /** The owner's account, or null once it is deleted and the certificate stayed. */
  uid: string | null;
  /** The run, or null once it is destroyed and the certificate stayed. */
  runId: string | null;
  linkOn: boolean;
  issuedAt: Date | null;
  snapshot: CertificateSnapshot;
  email: CertificateEmail;
};

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const holder = value as { toDate?: () => Date } | null;
  if (holder && typeof holder.toDate === "function") {
    const date = holder.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** A stored word: a string with something in it, within its limit. */
function word(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= limit ? trimmed : null;
}

/**
 * A stored snapshot, or null when any word it must show is missing or
 * damaged. A certificate that cannot be drawn whole is not drawn at all.
 */
export function normalizeSnapshot(raw: unknown, kind: CertificateKind): CertificateSnapshot | null {
  if (!isRecord(raw)) return null;
  const name = word(raw.name, CERTIFICATE_LIMITS.name);
  const programme = word(raw.programme, CERTIFICATE_LIMITS.programme);
  const term = word(raw.term, CERTIFICATE_LIMITS.term);
  const weeks = word(raw.weeks, CERTIFICATE_LIMITS.weeks);
  const issuedOn = word(raw.issuedOn, CERTIFICATE_LIMITS.issuedOn);
  if (!name || !programme || !term || !weeks || !issuedOn) return null;
  if (raw.did !== DID_WORDS[kind]) return null;
  let credit: string | null = null;
  if (raw.credit !== null && raw.credit !== undefined) {
    credit = word(raw.credit, CERTIFICATE_LIMITS.credit);
    if (credit === null) return null;
  }
  return { name, did: DID_WORDS[kind], programme, term, weeks, credit, issuedOn };
}

/** A stored email state, read safely: anything else is `failed`, which a press tries again. */
function normalizeEmail(raw: unknown): CertificateEmail {
  if (!isRecord(raw)) return { state: "failed", at: null };
  const state = CERTIFICATE_EMAIL_STATES.includes(raw.state as CertificateEmailState)
    ? (raw.state as CertificateEmailState)
    : "failed";
  return { state, at: asDate(raw.at) };
}

const ownerOrNull = (value: unknown): string | null =>
  typeof value === "string" && value && value.length <= CERTIFICATE_LIMITS.uid && !value.includes("/") ? value : null;

/**
 * A stored certificate, or null for a document that is not one: an unknown
 * kind, a code that cannot be one, an id its own fields do not build (while
 * it still has an owner and a run), or a snapshot that cannot be drawn whole.
 */
export function normalizeCertificate(id: string, data: Record<string, unknown> | undefined): CertificateDoc | null {
  if (!data) return null;
  const kind = CERTIFICATE_KINDS.includes(data.kind as CertificateKind) ? (data.kind as CertificateKind) : null;
  if (!kind) return null;
  const code = codeFrom(data.code);
  if (!code || code !== data.code) return null;
  const uid = ownerOrNull(data.uid);
  const runId = ownerOrNull(data.runId);
  // While a certificate has both its owner and its run, its fields must build
  // the id it was read from. Once either is gone the id is history.
  if (uid && runId && certificateId(runId, uid, kind) !== id) return null;
  const snapshot = normalizeSnapshot(data.snapshot, kind);
  if (!snapshot) return null;
  return {
    id,
    kind,
    code,
    uid,
    runId,
    linkOn: data.linkOn === true,
    issuedAt: asDate(data.issuedAt),
    snapshot,
    email: normalizeEmail(data.email),
  };
}

/**
 * Whether a person still has a certificate email owed: none went, the send
 * threw, or a press claimed it and never said what happened.
 */
export function emailOwed(email: CertificateEmail, now: Date): boolean {
  if (email.state === "failed") return true;
  if (email.state !== "sending") return false;
  return email.at === null || now.getTime() - email.at.getTime() >= STALE_SENDING_MS;
}

// ---------------------------------------------------------------------------
// The bodies the routes take, checked before anything is read
// ---------------------------------------------------------------------------

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** The owner's switch: `{ linkOn }`. */
export function parseLinkSwitch(raw: unknown): Parsed<{ linkOn: boolean }> {
  if (!isRecord(raw) || typeof raw.linkOn !== "boolean") {
    return { ok: false, error: "Say whether the link is on: true or false." };
  }
  return { ok: true, value: { linkOn: raw.linkOn } };
}

/** At most this many emails in one press: the site's request budget, each send being SMTP and a pause. */
export const MAX_CERTIFICATE_EMAILS_PER_PRESS = 200;

const wholeIn = (value: unknown, low: number, high: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= low && value <= high;

/**
 * The press: `{ certificates, emails }`, the two numbers the button and the
 * line under it showed. A person sent both certificates is one email, so the
 * certificates are at least as many as the emails and at most twice as many.
 */
export function parseSendRequest(raw: unknown): Parsed<{ certificates: number; emails: number }> {
  const say = `Say how many certificates and emails the button showed: whole numbers, from 1 to ${MAX_CERTIFICATE_EMAILS_PER_PRESS} emails.`;
  if (!isRecord(raw)) return { ok: false, error: say };
  const { certificates, emails } = raw;
  if (!wholeIn(emails, 1, MAX_CERTIFICATE_EMAILS_PER_PRESS) || !wholeIn(certificates, emails, emails * 2)) {
    return { ok: false, error: say };
  }
  return { ok: true, value: { certificates, emails } };
}
