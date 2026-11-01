import "server-only";
import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { render } from "@react-email/render";
import CertificateEmail from "@/emails/CertificateEmail";
import { opensProgrammeGroups, roleOnProgramme } from "@/lib/applications/access";
import { RUNS_COLLECTION, readRun } from "@/lib/applications/handover/run";
import { own } from "@/lib/applications/keys";
import type { ProgrammeSettings } from "@/lib/applications/model";
import { isId, type ApplicationForm } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import { readFinishing, recordOf, runEndOf, type RunEnd } from "@/lib/courses/finishing/record";
import { listGroups, readRunRecords, weeksOf, type RunRecords } from "@/lib/courses/programmeAttendance";
import { firstNameOfUser, standingUserOf } from "@/lib/courses/programmeLead";
import { certificateNameOf } from "@/lib/names/certificateName";
import { sendEmail } from "@/lib/email/send";
import { holdsStanding, isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourse } from "@/lib/firestore/courses";
import { newCertificateCode } from "./code";
import { certificateUrl, faceOf, siteOrigin, type CertificateFaceView } from "./face";
import {
  CERTIFICATE_MARKERS,
  CERTIFICATES_PRESS_KIND,
  CERTIFICATES_TEST_KIND,
  PRESS_STALE_MS,
  certificatesPressId,
  certificatesTestId,
} from "./markers";
import {
  CERTIFICATES_COLLECTION,
  MAX_CERTIFICATE_EMAILS_PER_PRESS,
  certificateId,
  emailOwed,
  normalizeCertificate,
  type CertificateDoc,
  type CertificateKind,
  type CertificateSnapshot,
} from "./model";
import { writeSnapshot } from "./snapshot";
import {
  ALL_SENT,
  LEADS_AND_ADMINS,
  NOBODY_OWED,
  NOBODY_TO_TEST,
  NOT_FINISHED_LINE,
  NO_ADDRESS_FOR_TEST,
  NO_PROGRAMME,
  NO_RUN,
  PASTE_IT,
  PRESS_IN_PROGRESS,
  RUN_GONE,
  TEST_FIRST,
  TEST_FIRST_LINE,
  cannotWriteWhole,
  countMoved,
  countsSentence,
  emailWords,
  emailsLine,
  inOrder,
  noAddressLine,
  notOverYet,
  previewLabel,
  sendButtonWords,
  sendReportWords,
  testSubject,
  type CertificateEmailWords,
  type SendReport,
} from "./words";

/**
 * SENDING CERTIFICATES (board en-finish, its Certificates section), for a
 * programme's lead and admins, once the run's last session is over.
 *
 * ## Who is sent one
 *
 *  - FINISHED: everybody the programme's record says finished it: the rows
 *    of the run's grid this viewer is shown (`listGroups`: a lead sees the
 *    people Publish has told, an admin everybody placed), whose record
 *    (`recordOf`) says finished, with an account that stands. Somebody who
 *    left has no record. Nobody else is sent anything, or told.
 *  - FACILITATED: each facilitator of a live group of the run with anybody
 *    in it, held to their standing as a facilitator, once however many
 *    groups they ran.
 *
 * A facilitator who held a place and finished is sent both, in one email
 * (one email a person). One certificate per person, run and kind, ever: the
 * document's id is built from the three (`certificateId`).
 *
 * ## The order of a press, as the newsletter's send and the team email's
 *
 *  1. The presser has sent themselves a test on this run (a marker each,
 *     `certificatestest__{runId}__{uid}`), or nothing goes.
 *  2. Every email is written whole first: a certificate whose name, term,
 *     weeks or programme cannot be written stops the press, naming the
 *     person, and nothing is sent.
 *  3. The two numbers the button showed (certificates, and emails) are sent
 *     back and compared, and the press is refused with the numbers as they
 *     are now when either has moved.
 *  4. One press at a time on a run (`certificatespress__{runId}`, taken in a
 *     transaction, let go when the press ends or five minutes later).
 *  5. For each person, their certificates are CLAIMED in a transaction
 *     first: created with a fresh code and the email marked `sending`, or,
 *     for one whose email failed, marked `sending` again. A certificate whose
 *     email went, or that another press is sending, is never claimed twice,
 *     so two presses send one batch. Then their one email goes, whole, and
 *     each certificate is settled to what the mail door said: sent, held by
 *     this copy of the site, or stopped by the do-not-email list; a send that
 *     threw is `failed`, and the next press tries it again, as it does a
 *     claim older than a press can live.
 *
 * Transactional, as Publish's placement email is: it is the person's own
 * certificate. Replies go to ai-safety@uonsu.com. No time, no place and no
 * meeting link are in it.
 */

/** Where replies to the certificate email go. */
export const CERTIFICATES_REPLY_TO = "ai-safety@uonsu.com";

/** The pause between two emails, as Publish paces its own. */
const PACE_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SendRefusal = { ok: false; status: 400 | 403 | 404 | 409; error: string };

const refuse = (status: SendRefusal["status"], error: string): SendRefusal => ({ ok: false, status, error });

/** One person a certificate goes to. Server only: their address never reaches a page. */
type Person = {
  uid: string;
  /** Their whole name, as the lead's tabs name people. */
  name: string;
  firstName: string;
  address: string;
  account: Record<string, unknown>;
  /** The certificates their record gives them, finished first. */
  kinds: CertificateKind[];
};

export type CertificatesContext = {
  user: SessionUser;
  form: ApplicationForm;
  programme: ProgrammeSettings;
  viewer: "admin" | "lead";
  records: RunRecords;
  end: RunEnd;
  /** The course's credit line, as a certificate prints it, or "". */
  credit: string;
  /** Everybody a certificate goes to, by name. */
  people: Person[];
  finished: number;
  facilitators: number;
  /** The run's certificates already made, by id. */
  stored: Map<string, CertificateDoc>;
  /** Whether the presser has sent themselves a test on this run. */
  tested: boolean;
  now: Date;
};

/** The programme's own address under the admissions pages. */
export function programmePathOf(roundId: string, programmeId: string): string {
  return `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}`;
}

/** The lead's preview of one certificate's page and its email (board en-finish's thumbnail and Preview). */
export function previewPathOf(roundId: string, programmeId: string): string {
  return `${programmePathOf(roundId, programmeId)}/overview/certificates`;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

type Gate = { ok: true; form: ApplicationForm; programme: ProgrammeSettings; viewer: "admin" | "lead" } | SendRefusal;

/** Who may see and send a programme's certificates: its lead and admins, from the form alone. */
async function certificatesGate(db: Firestore, user: SessionUser, roundId: string, programmeId: string): Promise<Gate> {
  const none = refuse(404, NO_PROGRAMME);
  if (!isId(roundId) || !isId(programmeId)) return none;
  const form = await loadForm(db, roundId);
  if (!form) return none;
  const programme = own(form.programmes, programmeId);
  if (!programme) return none;
  const role = roleOnProgramme(user, form, programmeId);
  if (role === null) return none;
  if (!opensProgrammeGroups(role)) return refuse(403, LEADS_AND_ADMINS);
  return { ok: true, form, programme, viewer: role === "admin" ? "admin" : "lead" };
}

/**
 * Everything the section, the test and the press read, once, after the
 * gate: the run's records, its end, who finished, its facilitators, its
 * certificates, the presser's test, the course's credit. Refused before the
 * run's last session is over.
 */
export async function readCertificatesContext(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  now: Date,
): Promise<{ ok: true; context: CertificatesContext } | SendRefusal> {
  const gate = await certificatesGate(db, user, roundId, programmeId);
  if (!gate.ok) return gate;
  const { form, programme, viewer } = gate;
  if (programme.runId === null) return refuse(409, NO_RUN);
  const runSnap = await db.collection(RUNS_COLLECTION).doc(programme.runId).get();
  const read = runSnap.exists ? readRun(runSnap.id, runSnap.data()) : null;
  if (!read || read.destroying) return refuse(409, RUN_GONE);
  const records = await readRunRecords(db, read.run.id);
  if (!records) return refuse(409, RUN_GONE);
  const end = runEndOf(records.run, records.groups, now);
  if (!end.over) return refuse(409, notOverYet(end.lastDay));

  const runId = records.run.id;
  // One equality on one field each, so no declared index.
  const [finishing, storedSnap, testSnap, courseSnap] = await Promise.all([
    readFinishing(db, runId),
    db.collection(CERTIFICATES_COLLECTION).where("runId", "==", runId).get(),
    db.collection(CERTIFICATE_MARKERS).doc(certificatesTestId(runId, user.uid)).get(),
    records.run.courseId ? db.collection("courses").doc(records.run.courseId).get() : Promise.resolve(null),
  ]);

  const kindsOf = new Map<string, Set<CertificateKind>>();
  const give = (uid: string, kind: CertificateKind) => {
    const kinds = kindsOf.get(uid) ?? new Set<CertificateKind>();
    kinds.add(kind);
    kindsOf.set(uid, kinds);
  };
  const standing = (uid: string) => {
    const account = records.accounts.get(uid);
    return account ? standingUserOf(uid, account) : null;
  };

  const listed = listGroups(records, { isAdmin: viewer === "admin" }, now, weeksOf(records));
  for (const entry of listed) {
    for (const { row } of entry.people) {
      if (recordOf(row, finishing, end)?.finished !== true) continue;
      const member = standing(row.uid);
      if (member && holdsStanding(member, "courseEnrolments.uid")) give(row.uid, "finished");
    }
    // A group nobody was in was facilitated by nobody.
    if (entry.people.length === 0) continue;
    for (const uid of entry.group.facilitatorUids) {
      const facilitator = standing(uid);
      if (facilitator && isNamedWithStanding(facilitator, "courseGroups.facilitatorUids", entry.group.facilitatorUids)) {
        give(uid, "facilitated");
      }
    }
  }

  const people: Person[] = [...kindsOf]
    .map(([uid, kinds]) => {
      const account = records.accounts.get(uid) ?? {};
      return {
        uid,
        // What a certificate prints, by its own rule (src/lib/names/certificateName.ts).
        name: certificateNameOf(account),
        firstName: firstNameOfUser(account),
        address: typeof account.email === "string" ? account.email.trim() : "",
        account,
        kinds: inOrder([...kinds]),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB") || a.uid.localeCompare(b.uid));

  const stored = new Map<string, CertificateDoc>();
  for (const doc of storedSnap.docs) {
    const certificate = normalizeCertificate(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
    if (certificate && certificate.runId === runId) stored.set(doc.id, certificate);
  }
  const course = courseSnap?.exists ? normalizeCourse(courseSnap.id, (courseSnap.data() ?? {}) as Record<string, unknown>) : null;

  return {
    ok: true,
    context: {
      user,
      form,
      programme,
      viewer,
      records,
      end,
      credit: course?.credit ?? "",
      people,
      finished: people.filter((person) => person.kinds.includes("finished")).length,
      facilitators: people.filter((person) => person.kinds.includes("facilitated")).length,
      stored,
      tested: testSnap.exists,
      now,
    },
  };
}

/** The certificates a person is still owed: none made, or made with an email that is owed again. */
function owedKinds(context: CertificatesContext, person: Person): CertificateKind[] {
  return person.kinds.filter((kind) => {
    const stored = context.stored.get(certificateId(context.records.run.id, person.uid, kind));
    return !stored || emailOwed(stored.email, context.now);
  });
}

/** What one certificate says: as it was issued, or as it would be issued now. */
function snapshotFor(
  context: CertificatesContext,
  person: Person,
  kind: CertificateKind,
): { ok: true; snapshot: CertificateSnapshot } | { ok: false; reason: string } {
  const stored = context.stored.get(certificateId(context.records.run.id, person.uid, kind));
  if (stored) return { ok: true, snapshot: stored.snapshot };
  return writeSnapshot({
    kind,
    account: person.account,
    programme: { name: context.programme.name },
    run: context.records.run,
    formLabel: context.form.round.label,
    credit: context.credit,
    now: context.now,
  });
}

/** One person's email, written whole, with the snapshot of each certificate it sends. */
type Letter = {
  person: Person;
  kinds: CertificateKind[];
  snapshots: Map<CertificateKind, CertificateSnapshot>;
  words: CertificateEmailWords;
};

function writeLetter(context: CertificatesContext, person: Person, kinds: CertificateKind[]): { ok: true; letter: Letter } | SendRefusal {
  const snapshots = new Map<CertificateKind, CertificateSnapshot>();
  for (const kind of kinds) {
    const written = snapshotFor(context, person, kind);
    if (!written.ok) return refuse(409, cannotWriteWhole(person.name, written.reason));
    snapshots.set(kind, written.snapshot);
  }
  return { ok: true, letter: { person, kinds, snapshots, words: wordsFor(context, person, kinds, snapshots) } };
}

/** The email's words for these of a person's certificates, the programme named as the certificate names it. */
function wordsFor(
  context: CertificatesContext,
  person: Person,
  kinds: readonly CertificateKind[],
  snapshots: Map<CertificateKind, CertificateSnapshot>,
): CertificateEmailWords {
  return emailWords({
    kinds,
    firstName: person.firstName,
    shortName: context.programme.shortName.trim() || context.programme.name.trim(),
    programme: snapshots.get(kinds[0])?.programme ?? context.programme.name,
  });
}

/** The person the preview and the test are about: the first still owed, else the first of all. */
function previewPerson(context: CertificatesContext): { person: Person; kinds: CertificateKind[] } | null {
  for (const person of context.people) {
    const owed = owedKinds(context, person);
    if (owed.length > 0) return { person, kinds: owed };
  }
  const first = context.people[0];
  return first ? { person: first, kinds: first.kinds } : null;
}

// ---------------------------------------------------------------------------
// The section
// ---------------------------------------------------------------------------

export type CertificatesSectionModel = {
  /** "28 people who finished and 5 facilitators." */
  counts: string;
  /** One person's certificate as the thumbnail draws it, and where it opens; null when none can be drawn. */
  preview: { face: CertificateFaceView; label: string; href: string } | null;
  /** "Your certificate for AGI Strategy", and where its preview opens; null with nobody to send to. */
  email: { subject: string; href: string } | null;
  /** What a press would send now: certificates, and emails (one a person with an address). */
  owed: { certificates: number; emails: number };
  /** "Send 33 certificates", or "Send 2 more". */
  button: string;
  /** Whether the person looking has sent themselves a test on this run. */
  tested: boolean;
  /** "Send a test to yourself first. Then this unlocks.", while it is locked and something is owed. */
  testFirst: string | null;
  /** "Emails 33 people. Each email links to their certificate page.", while something is owed. */
  emailsLine: string | null;
  /** Everybody has theirs. */
  allSent: string | null;
  /** People owed one with no address on file. */
  noAddress: string | null;
  /** "People who didn’t finish get nothing and aren’t told." */
  notFinished: string;
};

/** The section the Overview draws, from what `readCertificatesContext` read. */
export function buildCertificatesSection(context: CertificatesContext, roundId: string, programmeId: string): CertificatesSectionModel {
  let certificates = 0;
  let emails = 0;
  let both = 0;
  const noAddress: string[] = [];
  for (const person of context.people) {
    const owed = owedKinds(context, person);
    if (owed.length === 0) continue;
    if (!person.address) {
      noAddress.push(person.name);
      continue;
    }
    certificates += owed.length;
    emails += 1;
    if (owed.length === 2) both += 1;
  }
  const someSent = context.stored.size > 0;
  const href = previewPathOf(roundId, programmeId);
  const shown = previewPerson(context);
  let preview: CertificatesSectionModel["preview"] = null;
  let email: CertificatesSectionModel["email"] = null;
  if (shown) {
    const written = writeLetter(context, shown.person, shown.kinds);
    if (written.ok) {
      const kind = written.letter.kinds[0];
      const snapshot = written.letter.snapshots.get(kind) as CertificateSnapshot;
      preview = { face: faceOf(kind, snapshot, null), label: previewLabel(snapshot.name), href: `${href}#page` };
      email = { subject: written.letter.words.subject, href: `${href}#email` };
    }
  }
  return {
    counts: countsSentence(context.finished, context.facilitators),
    preview,
    email,
    owed: { certificates, emails },
    button: sendButtonWords(certificates, someSent),
    tested: context.tested,
    testFirst: emails > 0 && !context.tested ? TEST_FIRST_LINE : null,
    emailsLine: emails > 0 ? emailsLine(emails, both) : null,
    allSent: someSent && certificates === 0 && noAddress.length === 0 ? ALL_SENT : null,
    noAddress: noAddress.length > 0 ? noAddressLine(noAddress) : null,
    notFinished: NOT_FINISHED_LINE,
  };
}

/** The section, read and built for the Overview, or null before the run is over or for anybody else. */
export async function loadCertificatesSection(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  now: Date,
): Promise<CertificatesSectionModel | null> {
  const read = await readCertificatesContext(db, user, roundId, programmeId, now);
  return read.ok ? buildCertificatesSection(read.context, roundId, programmeId) : null;
}

// ---------------------------------------------------------------------------
// The preview
// ---------------------------------------------------------------------------

export type CertificatesPreview = {
  /** The person's certificate as its page would draw it for its owner, link off. */
  face: CertificateFaceView;
  name: string;
  /** The email they would be sent, laid out; its buttons lead to this preview. */
  email: { subject: string; html: string };
};

/** The lead's preview: one person's certificate and the email that sends it, with nothing sent. */
export async function loadCertificatesPreview(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  now: Date,
  appUrl: string | undefined,
): Promise<{ ok: true; preview: CertificatesPreview | null } | SendRefusal> {
  const read = await readCertificatesContext(db, user, roundId, programmeId, now);
  if (!read.ok) return read;
  const shown = previewPerson(read.context);
  if (!shown) return { ok: true, preview: null };
  const written = writeLetter(read.context, shown.person, shown.kinds);
  if (!written.ok) return written;
  const { letter } = written;
  const kind = letter.kinds[0];
  const snapshot = letter.snapshots.get(kind) as CertificateSnapshot;
  const back = `${siteOrigin(appUrl)}${previewPathOf(roundId, programmeId)}#page`;
  const html = await render(emailOf(letter.words, letter.kinds.map(() => back)));
  return {
    ok: true,
    preview: { face: faceOf(kind, snapshot, null), name: snapshot.name, email: { subject: letter.words.subject, html } },
  };
}

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------

function emailOf(words: CertificateEmailWords, hrefs: string[], subject = words.subject) {
  return CertificateEmail({
    subject,
    greeting: words.greeting,
    lead: words.lead,
    buttons: words.buttons.map((button, i) => ({ label: button.label, href: hrefs[i] })),
    after: words.after,
    signOff: words.signOff,
    pasteIt: PASTE_IT,
  });
}

type Delivery = "sent" | "held" | "suppressed";

const deliveryOf = (result: { delivered: string[]; suppressed: string[] }): Delivery =>
  result.delivered.length > 0 ? "sent" : result.suppressed.length > 0 ? "suppressed" : "held";

export type TestOutcome = { ok: true; delivery: Delivery; subject: string; model: CertificatesSectionModel } | SendRefusal;

/**
 * "Send a test to me": the email the first person still owed would get (or
 * the first of all, once everybody has theirs), marked as a test, to the
 * address on the presser's own session and nobody else. Its buttons open the
 * lead's preview, since nothing has been made. Only a test that reached them
 * is recorded, and only that unlocks the press.
 */
export async function sendCertificateTest(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  now: Date = new Date(),
  appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL,
): Promise<TestOutcome> {
  const read = await readCertificatesContext(db, user, roundId, programmeId, now);
  if (!read.ok) return read;
  const { context } = read;
  const address = (user.email ?? "").trim();
  if (!address) return refuse(400, NO_ADDRESS_FOR_TEST);
  const shown = previewPerson(context);
  if (!shown) return refuse(409, NOBODY_TO_TEST);
  const written = writeLetter(context, shown.person, shown.kinds);
  if (!written.ok) return written;
  const { words } = written.letter;
  const subject = testSubject(words.subject);
  const back = `${siteOrigin(appUrl)}${previewPathOf(roundId, programmeId)}#page`;
  const result = await sendEmail({
    to: address,
    subject,
    react: emailOf(words, words.buttons.map(() => back), subject),
    replyTo: CERTIFICATES_REPLY_TO,
    kind: "course-test",
    actorUid: user.uid,
    referenceId: context.records.run.id,
  });
  const delivery = deliveryOf(result);
  if (delivery === "sent") {
    await db.collection(CERTIFICATE_MARKERS).doc(certificatesTestId(context.records.run.id, user.uid)).set({
      kind: CERTIFICATES_TEST_KIND,
      runId: context.records.run.id,
      byUid: user.uid,
      at: FieldValue.serverTimestamp(),
    });
  }
  const after = await readCertificatesContext(db, user, roundId, programmeId, now);
  if (!after.ok) return after;
  return { ok: true, delivery, subject, model: buildCertificatesSection(after.context, roundId, programmeId) };
}

// ---------------------------------------------------------------------------
// The press
// ---------------------------------------------------------------------------

export type SendOutcome =
  | { ok: true; report: SendReport; said: string[]; model: CertificatesSectionModel }
  | (SendRefusal & { certificates?: number; emails?: number });

/** Take the run for one press, unless another press holds it and started under five minutes ago. */
async function takePress(db: Firestore, runId: string, byUid: string): Promise<string | null> {
  const ref = db.collection(CERTIFICATE_MARKERS).doc(certificatesPressId(runId));
  const token = randomUUID();
  return db.runTransaction<string | null>(async (tx) => {
    const snap = await tx.get(ref);
    const held = snap.exists ? (snap.data() ?? {}) : null;
    const since = typeof held?.claimedAtMs === "number" ? held.claimedAtMs : null;
    if (held && since !== null && Date.now() - since < PRESS_STALE_MS) return null;
    tx.set(ref, { kind: CERTIFICATES_PRESS_KIND, runId, byUid, token, claimedAtMs: Date.now() });
    return token;
  });
}

/** Give the run back, if this press still holds it. */
async function releasePress(db: Firestore, runId: string, token: string): Promise<void> {
  const ref = db.collection(CERTIFICATE_MARKERS).doc(certificatesPressId(runId));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && (snap.data() ?? {}).token === token) tx.delete(ref);
  });
}

/** A code no certificate has. Eighty bits from the operating system make a clash all but impossible; it is still asked. */
async function freshCode(db: Firestore): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = newCertificateCode();
    const taken = await db.collection(CERTIFICATES_COLLECTION).where("code", "==", code).limit(1).get();
    if (taken.empty) return code;
  }
  throw new Error("courseCertificates: no free code after four tries");
}

/**
 * Claim one person's owed certificates, in one transaction: create each that
 * is not made yet, and mark again each whose email is owed. Answers the codes
 * of the certificates claimed, in `kinds` order; one another press holds, or
 * whose email went, is left out.
 */
async function claim(
  db: Firestore,
  context: CertificatesContext,
  letter: Letter,
  codes: Map<CertificateKind, string>,
): Promise<{ kind: CertificateKind; code: string }[]> {
  const runId = context.records.run.id;
  return db.runTransaction(async (tx) => {
    const now = new Date();
    const claimed: { kind: CertificateKind; code: string }[] = [];
    const refs = letter.kinds.map((kind) =>
      db.collection(CERTIFICATES_COLLECTION).doc(certificateId(runId, letter.person.uid, kind)),
    );
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    letter.kinds.forEach((kind, i) => {
      const snap = snaps[i];
      const current = snap.exists ? normalizeCertificate(snap.id, (snap.data() ?? {}) as Record<string, unknown>) : null;
      if (snap.exists) {
        // Made already: claimed again only while its email is owed.
        if (!current || !emailOwed(current.email, now)) return;
        tx.update(refs[i], { email: { state: "sending", at: now } });
        claimed.push({ kind, code: current.code });
        return;
      }
      const code = codes.get(kind);
      if (!code) return;
      tx.create(refs[i], {
        kind,
        code,
        uid: letter.person.uid,
        runId,
        linkOn: false,
        // The moment its words were written, so the day it states is the day it was issued.
        issuedAt: context.now,
        snapshot: letter.snapshots.get(kind),
        email: { state: "sending", at: now },
      });
      claimed.push({ kind, code });
    });
    return claimed;
  });
}

/** Settle each claimed certificate's email to what happened. */
async function settle(db: Firestore, runId: string, uid: string, kinds: CertificateKind[], state: Delivery | "failed") {
  const batch = db.batch();
  const at = new Date();
  for (const kind of kinds) {
    batch.update(db.collection(CERTIFICATES_COLLECTION).doc(certificateId(runId, uid, kind)), { email: { state, at } });
  }
  await batch.commit();
}

/** "Send 33 certificates". `request` holds the two numbers the button showed. */
export async function sendCertificates(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  request: { certificates: number; emails: number },
  now: Date = new Date(),
  appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL,
): Promise<SendOutcome> {
  const read = await readCertificatesContext(db, user, roundId, programmeId, now);
  if (!read.ok) return read;
  const { context } = read;
  if (!context.tested) return refuse(409, TEST_FIRST);

  const letters: Letter[] = [];
  for (const person of context.people) {
    const owed = owedKinds(context, person);
    if (owed.length === 0) continue;
    const written = writeLetter(context, person, owed);
    if (!written.ok) return written;
    letters.push(written.letter);
  }
  const noAddress = letters.filter((letter) => !letter.person.address).map((letter) => letter.person.name);
  const batch = letters.filter((letter) => letter.person.address).slice(0, MAX_CERTIFICATE_EMAILS_PER_PRESS);
  if (batch.length === 0) return refuse(409, NOBODY_OWED);
  const certificates = batch.reduce((sum, letter) => sum + letter.kinds.length, 0);
  if (certificates !== request.certificates || batch.length !== request.emails) {
    return { ...refuse(409, countMoved(certificates, batch.length)), certificates, emails: batch.length };
  }

  const runId = context.records.run.id;
  const token = await takePress(db, runId, user.uid);
  if (!token) return refuse(409, PRESS_IN_PROGRESS);
  const report: SendReport = { sent: 0, held: 0, suppressed: 0, failed: [], noAddress };
  try {
    for (const [at, letter] of batch.entries()) {
      if (at > 0) await sleep(PACE_MS);
      const codes = new Map<CertificateKind, string>();
      for (const kind of letter.kinds) {
        if (!context.stored.has(certificateId(runId, letter.person.uid, kind))) codes.set(kind, await freshCode(db));
      }
      const claimed = await claim(db, context, letter, codes);
      if (claimed.length === 0) continue;
      const kinds = claimed.map((entry) => entry.kind);
      const words = kinds.length === letter.kinds.length ? letter.words : wordsFor(context, letter.person, kinds, letter.snapshots);
      let delivery: Delivery;
      try {
        const result = await sendEmail({
          to: letter.person.address,
          subject: words.subject,
          react: emailOf(
            words,
            claimed.map((entry) => certificateUrl(appUrl, entry.code)),
          ),
          replyTo: CERTIFICATES_REPLY_TO,
          kind: "course-certificate",
          actorUid: user.uid,
          referenceId: runId,
        });
        delivery = deliveryOf(result);
      } catch (err) {
        // One bad send must not strand the rest. Marked failed, so the next
        // press tries this person again.
        console.error("[certificates] email failed", runId, letter.person.uid, err);
        report.failed.push(letter.person.name);
        await settle(db, runId, letter.person.uid, kinds, "failed").catch((settleErr) => {
          console.error("[certificates] could not mark a failed email", runId, letter.person.uid, settleErr);
        });
        continue;
      }
      report[delivery] += kinds.length;
      try {
        await settle(db, runId, letter.person.uid, kinds, delivery);
      } catch (err) {
        // The email went; only the record of it did not. The claim goes
        // stale and a later press sends it again, the lesser harm.
        console.error("[certificates] could not record a sent email", runId, letter.person.uid, err);
      }
    }
  } finally {
    await releasePress(db, runId, token).catch((err) => {
      console.error("[certificates] could not give the run back", runId, err);
    });
  }
  const after = await readCertificatesContext(db, user, roundId, programmeId, new Date());
  if (!after.ok) return after;
  return { ok: true, report, said: sendReportWords(report), model: buildCertificatesSection(after.context, roundId, programmeId) };
}
