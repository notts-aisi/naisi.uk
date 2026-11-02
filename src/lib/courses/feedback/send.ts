import "server-only";
import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import CourseFeedbackEmail from "@/emails/CourseFeedbackEmail";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { sendEmail } from "@/lib/email/send";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseEnrolment, placementIsTold } from "@/lib/firestore/courseEnrolments";
import {
  COURSE_FEEDBACK_COLLECTION,
  COURSE_FEEDBACK_SENDS_COLLECTION,
  feedbackEmailOwed,
  feedbackIsClaimed,
  feedbackPressId,
  normalizeCourseFeedback,
  normalizeCourseFeedbackSend,
  type CourseFeedbackDoc,
  type FeedbackDelivery,
} from "@/lib/firestore/courseFeedback";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { londonDayLabel } from "../londonLabels";
import { firstNameOfUser, fullNameOfUser } from "../programmeLead";
import { emailAboutOf, type EmailPiece } from "./model";
import {
  ADMINS_SEND,
  NOBODY_TO_TEST,
  NO_ADDRESS_FOR_TEST,
  NO_RUN_HERE,
  NOT_IN_A_GROUP,
  PASTE_IT,
  PRESS_IN_PROGRESS,
  READ_YOUR_FEEDBACK,
  TEST_FIRST,
  TEST_FIRST_LINE,
  countMovedWords,
  emailLeadWords,
  emailSubjectWords,
  feedbackOnWords,
  greetingWords,
  noAddressWords,
  sendReportWords,
  testSubjectWords,
  waitingLineWords,
  type FeedbackSendReport,
} from "./words";

/**
 * THE "YOU HAVE FEEDBACK" EMAILS, SENT IN A BATCH (privacy v15: "we may email
 * you to say feedback is waiting"), from the programme's Overview.
 *
 * WHAT IS OWED. Every piece of feedback on the run (`courseFeedback`) whose
 * email has not gone and that no press is sending, about somebody who still
 * takes part (a place in a live group, told it by Publish, active or
 * finished; or a live group they facilitate) and has an address on their
 * account. Feedback given before pieces existed is on the answers' own rows,
 * was emailed when it was given, and is never here.
 *
 * WHO SEES IT, WHO SENDS IT. The programme's lead and admins see the list
 * (the Overview's own gate); only an admin sends, and the lead is told so.
 * The routes beside this file ask the session for an admin before anything
 * is read.
 *
 * THE ORDER OF A PRESS, as the certificates' and the newsletter's:
 *  1. A TEST FIRST. The presser has sent themselves a test on this run in the
 *     last day (`kind: "test"` in `courseFeedbackSends`), or nothing goes.
 *  2. THE COUNT ON THE BUTTON IS A PROMISE. The body names the pieces left
 *     ticked and the two numbers the button showed (pieces, and people); the
 *     press is refused, with the numbers as they are now, when a ticked piece
 *     is no longer owed or either number has moved.
 *  3. ONE PRESS AT A TIME on a run (`press__{runId}`, taken in a
 *     transaction, let go when the press ends or five minutes later).
 *  4. EACH PIECE CLAIMED ONCE. For each person, their ticked pieces are
 *     claimed in one transaction (`emailClaimedAt`, `sendId`): a piece
 *     emailed already, deleted, or claimed by another press is left out, so
 *     two presses send once. Then their ONE email goes, however many pieces
 *     it announces, and each piece is settled: emailed (sent, held by this
 *     copy of the site, or stopped by the do-not-email list), or, for a send
 *     that threw, let go, so the next press tries it again.
 *  5. The press's own row records who pressed, when, how many people and
 *     pieces, which pieces, and what became of the emails.
 *
 * TRANSACTIONAL, as the email that announced feedback one piece at a time
 * was: it is about the person's own work, and consults no notification
 * preference. Suppression still applies, in `sendEmail`. It carries no
 * feedback: who left it, on which weeks, and a link to the newest of those
 * weeks' pages. No time, no place, no meeting link.
 */

/** The pause between two emails, as Publish paces its own. */
const PACE_MS = 200;
/** At most this many emails in one press: the site's request budget, each send being SMTP and a pause. */
export const MAX_FEEDBACK_EMAILS_PER_PRESS = 200;
/** A test unlocks its presser's press on the run for this long. */
export const FEEDBACK_TEST_LASTS_MS = 24 * 60 * 60 * 1000;
/** How long a press holds the run before another may take it: longer than any request lives. */
const PRESS_STALE_MS = 5 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type BatchRefusal = { ok: false; status: 400 | 403 | 404 | 409; error: string };
const refuse = (status: BatchRefusal["status"], error: string): BatchRefusal => ({ ok: false, status, error });

/** One person feedback is owed to. Server only: their address never reaches a page. */
type Person = { uid: string; name: string; firstName: string; address: string; groupName: string };

/** Everything the card, the test and the press read, once. */
type BatchContext = {
  run: CourseRunDoc;
  /** The pieces whose email is owed, about somebody who takes part, oldest first. */
  owed: CourseFeedbackDoc[];
  people: Map<string, Person>;
  /** Writers' first names, by uid. */
  writers: Map<string, string>;
  /** Somebody has ever saved a piece on this run. */
  anyEver: boolean;
  lastSend: Date | null;
  /** The person asking has sent themselves a test on this run in the last day. */
  tested: boolean;
  programme: string;
  now: Date;
};

/** The run's people who take part and may be emailed: a told place in a live group, or a live group they facilitate. */
function takingPart(
  enrolments: ReturnType<typeof normalizeCourseEnrolment>[],
  liveGroups: readonly CourseGroupDoc[],
): Map<string, string> {
  const groupOf = new Map<string, string>();
  const live = new Map(liveGroups.map((group) => [group.id, group]));
  for (const seat of enrolments) {
    const group = seat.groupId ? live.get(seat.groupId) : undefined;
    if (seat.role !== "learner" || !group || !(seat.status === "active" || seat.status === "completed") || !placementIsTold(seat)) continue;
    groupOf.set(seat.uid, group.name.trim() || NOT_IN_A_GROUP);
  }
  for (const group of liveGroups) {
    for (const uid of group.facilitatorUids) if (!groupOf.has(uid)) groupOf.set(uid, group.name.trim() || NOT_IN_A_GROUP);
  }
  return groupOf;
}

/** The run, unless it is gone or being destroyed. One addressed read. */
async function readLiveRun(db: Firestore, runId: string): Promise<CourseRunDoc | null> {
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists || (snap.data() ?? {}).destroying === true) return null;
  return normalizeCourseRun(snap.id, snap.data() ?? {});
}

/** Read everything a card, a test or a press needs. Null run: refused. */
async function readBatch(db: Firestore, user: SessionUser, runId: string, now: Date): Promise<{ ok: true; context: BatchContext } | BatchRefusal> {
  const run = await readLiveRun(db, runId);
  if (!run) return refuse(404, NO_RUN_HERE);
  // One equality on one field each, so no declared index.
  const [groupSnap, enrolSnap, pieceSnap, sendSnap, programme] = await Promise.all([
    db.collection("courseGroups").where("runId", "==", runId).get(),
    db.collection("courseEnrolments").where("runId", "==", runId).get(),
    db.collection(COURSE_FEEDBACK_COLLECTION).where("runId", "==", runId).get(),
    db.collection(COURSE_FEEDBACK_SENDS_COLLECTION).where("runId", "==", runId).get(),
    runProgrammeOf(db, runId).catch(() => null),
  ]);
  // Archived groups staff nobody and place nobody, as everywhere else.
  const liveGroups = groupSnap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => !group.archived);
  const enrolments = enrolSnap.docs.map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {})).filter((seat) => seat.runId === runId);
  const groupOf = takingPart(enrolments, liveGroups);
  const pieces = pieceSnap.docs
    .map((doc) => normalizeCourseFeedback(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
    .filter((piece) => piece.runId === runId);
  const owedAll = pieces.filter((piece) => piece.weekNumber > 0 && groupOf.has(piece.uid) && feedbackEmailOwed(piece, now));

  let lastSend: Date | null = null;
  let tested = false;
  for (const doc of sendSnap.docs) {
    const row = normalizeCourseFeedbackSend(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
    if (row.runId !== runId || !row.at) continue;
    if (row.kind === "send" && (!lastSend || row.at.getTime() > lastSend.getTime())) lastSend = row.at;
    if (row.kind === "test" && row.byUid === user.uid && now.getTime() - row.at.getTime() < FEEDBACK_TEST_LASTS_MS) tested = true;
  }

  const uids = [...new Set([...owedAll.map((piece) => piece.uid), ...owedAll.map((piece) => piece.byUid).filter(Boolean)])];
  const accounts = new Map<string, Record<string, unknown>>();
  for (const snap of uids.length ? await db.getAll(...uids.map((uid) => db.collection("users").doc(uid))) : []) {
    if (snap.exists) accounts.set(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  }
  const people = new Map<string, Person>();
  for (const uid of new Set(owedAll.map((piece) => piece.uid))) {
    const account = accounts.get(uid) ?? {};
    people.set(uid, {
      uid,
      // The list's name is for the person pressing, by the names rule; the
      // email greets them by the first name they go by.
      name: nameForViewer(user, accountNamesOf(account), "NAISI member"),
      firstName: firstNameOfUser(account),
      address: typeof account.email === "string" ? account.email.trim() : "",
      groupName: groupOf.get(uid) ?? NOT_IN_A_GROUP,
    });
  }
  const writers = new Map<string, string>();
  for (const piece of owedAll) {
    if (!piece.byUid || writers.has(piece.byUid)) continue;
    const account = accounts.get(piece.byUid);
    writers.set(piece.byUid, account ? firstNameOfUser(account) || fullNameOfUser(account) : "");
  }
  // In the list's order: by person, then the oldest piece first.
  const owed = [...owedAll].sort(
    (a, b) =>
      (people.get(a.uid)?.name ?? "").localeCompare(people.get(b.uid)?.name ?? "", "en-GB") ||
      a.uid.localeCompare(b.uid) ||
      (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
      a.id.localeCompare(b.id),
  );
  return {
    ok: true,
    context: {
      run,
      owed,
      people,
      writers,
      anyEver: pieces.length > 0,
      lastSend,
      tested,
      programme: programme?.shortName ?? "",
      now,
    },
  };
}

/** The pieces that can be emailed: owed, about somebody with an address. */
function sendable(context: BatchContext): CourseFeedbackDoc[] {
  return context.owed.filter((piece) => (context.people.get(piece.uid)?.address ?? "") !== "");
}

/** People owed feedback with no address on file, by name. */
function withNoAddress(context: BatchContext): string[] {
  const out: string[] = [];
  for (const uid of new Set(context.owed.map((piece) => piece.uid))) {
    const person = context.people.get(uid);
    if (person && !person.address) out.push(person.name);
  }
  return out;
}

/** One person's email, in words, from the pieces it announces. */
export type FeedbackLetter = { subject: string; greeting: string | null; lead: string; button: string; weekNumber: number };

function letterFor(context: BatchContext, person: Person, pieces: readonly CourseFeedbackDoc[]): FeedbackLetter {
  const about = emailAboutOf(
    pieces.map(
      (piece): EmailPiece => ({
        weekNumber: piece.weekNumber,
        on: piece.on.kind,
        byName: context.writers.get(piece.byUid) ?? "",
        at: piece.createdAt,
      }),
    ),
  );
  return {
    subject: emailSubjectWords(context.programme),
    greeting: greetingWords(person.firstName),
    lead: emailLeadWords(about),
    button: READ_YOUR_FEEDBACK,
    weekNumber: about.newestWeek,
  };
}

/** Where "Read your feedback" leads: the newest week's page, at its Feedback, as a whole address on this site. */
export function feedbackWeekUrl(appUrl: string | undefined, runId: string, weekNumber: number): string {
  const origin = (appUrl ?? "").trim().replace(/\/+$/, "");
  return `${origin}/learn/${encodeURIComponent(runId)}/weeks/${weekNumber}#feedback`;
}

function emailOf(letter: FeedbackLetter, link: string, subject = letter.subject) {
  return CourseFeedbackEmail({ subject, greeting: letter.greeting, lead: letter.lead, buttonLabel: letter.button, link, pasteIt: PASTE_IT });
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

/** One piece in the list (board's columns): who it is for, their group, what it is on, who wrote it and the day. */
export type FeedbackBatchRow = { id: string; uid: string; name: string; group: string; on: string; byName: string; saved: string };

export type FeedbackBatchModel = {
  /** Somebody has saved feedback on this run at least once: the card is drawn from then on. */
  show: boolean;
  rows: FeedbackBatchRow[];
  pieces: number;
  people: number;
  /** "7 pieces of feedback for 6 people aren’t emailed yet. The last send was Sun 8 Nov." */
  line: string;
  /** An admin's card: tick boxes, the test and the send. The lead reads the list. */
  mayPress: boolean;
  /** The admin has sent themselves a test on this run in the last day. */
  tested: boolean;
  /** "Send a test to yourself first. A test unlocks this for a day.", while it is locked and something is owed. */
  testFirst: string | null;
  /** "An admin sends these emails.", on the lead's card. */
  leadLine: string | null;
  /** The email the first person in the list gets, as the card shows it; null with nothing to send. */
  email: { subject: string; lead: string; button: string } | null;
  /** People owed feedback with no address on file. */
  noAddress: string | null;
};

function buildModel(context: BatchContext, viewer: "admin" | "lead"): FeedbackBatchModel {
  const ready = sendable(context);
  const rows = ready.map((piece): FeedbackBatchRow => {
    const person = context.people.get(piece.uid);
    return {
      id: piece.id,
      uid: piece.uid,
      name: person?.name ?? "NAISI member",
      group: person?.groupName ?? NOT_IN_A_GROUP,
      on: feedbackOnWords(piece.weekNumber, piece.on.kind),
      byName: context.writers.get(piece.byUid) || "",
      saved: piece.createdAt ? londonDayLabel(piece.createdAt) : "",
    };
  });
  const people = new Set(ready.map((piece) => piece.uid)).size;
  const first = ready[0] ? context.people.get(ready[0].uid) : undefined;
  const letter = first ? letterFor(context, first, ready.filter((piece) => piece.uid === first.uid)) : null;
  const missing = withNoAddress(context);
  return {
    show: context.anyEver,
    rows,
    pieces: ready.length,
    people,
    line: waitingLineWords(ready.length, people, context.lastSend, context.anyEver),
    mayPress: viewer === "admin",
    tested: viewer === "admin" && context.tested,
    testFirst: viewer === "admin" && ready.length > 0 && !context.tested ? TEST_FIRST_LINE : null,
    leadLine: viewer === "lead" ? ADMINS_SEND : null,
    email: letter ? { subject: letter.subject, lead: letter.lead, button: letter.button } : null,
    noAddress: missing.length > 0 ? noAddressWords(missing) : null,
  };
}

/**
 * The card the Overview draws, for its lead and admins, after the Overview's
 * own gate; null when the run cannot be read.
 */
export async function loadFeedbackBatch(
  db: Firestore,
  user: SessionUser,
  runId: string,
  viewer: "admin" | "lead",
  now: Date = new Date(),
): Promise<FeedbackBatchModel | null> {
  const read = await readBatch(db, user, runId, now);
  return read.ok ? buildModel(read.context, viewer) : null;
}

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------

const deliveryOf = (result: { delivered: string[]; suppressed: string[] }): FeedbackDelivery =>
  result.delivered.length > 0 ? "sent" : result.suppressed.length > 0 ? "suppressed" : "held";

export type FeedbackTestOutcome = { ok: true; delivery: FeedbackDelivery; subject: string; model: FeedbackBatchModel } | BatchRefusal;

/**
 * "Send a test to me": the email the first person in the list would get,
 * marked as a test, to the address on the presser's own session and nobody
 * else, its button leading where theirs would. Only a test that reached them
 * is recorded, and only that unlocks their press, for a day.
 */
export async function sendFeedbackTest(
  db: Firestore,
  user: SessionUser,
  runId: string,
  now: Date = new Date(),
  appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL,
): Promise<FeedbackTestOutcome> {
  const read = await readBatch(db, user, runId, now);
  if (!read.ok) return read;
  const { context } = read;
  const ready = sendable(context);
  const person = ready[0] ? context.people.get(ready[0].uid) : undefined;
  if (!person) return refuse(409, NOBODY_TO_TEST);
  const address = (user.email ?? "").trim();
  if (!address) return refuse(400, NO_ADDRESS_FOR_TEST);
  const letter = letterFor(context, person, ready.filter((piece) => piece.uid === person.uid));
  const subject = testSubjectWords(letter.subject);
  const result = await sendEmail({
    to: address,
    subject,
    react: emailOf(letter, feedbackWeekUrl(appUrl, runId, letter.weekNumber), subject),
    kind: "course-test",
    actorUid: user.uid,
    referenceId: runId,
  });
  const delivery = deliveryOf(result);
  if (delivery === "sent") {
    await db.collection(COURSE_FEEDBACK_SENDS_COLLECTION).doc().set({
      kind: "test",
      runId,
      byUid: user.uid,
      at: FieldValue.serverTimestamp(),
    });
  }
  const after = await readBatch(db, user, runId, new Date());
  if (!after.ok) return after;
  return { ok: true, delivery, subject, model: buildModel(after.context, "admin") };
}

// ---------------------------------------------------------------------------
// The press
// ---------------------------------------------------------------------------

export type FeedbackPressRequest = { ids: string[]; pieces: number; people: number };

export type FeedbackSendOutcome =
  | { ok: true; report: FeedbackSendReport; said: string[]; model: FeedbackBatchModel }
  | (BatchRefusal & { pieces?: number; people?: number; model?: FeedbackBatchModel });

/** Take the run for one press, unless another press holds it and started under five minutes ago. */
async function takePress(db: Firestore, runId: string, byUid: string): Promise<string | null> {
  const ref = db.collection(COURSE_FEEDBACK_SENDS_COLLECTION).doc(feedbackPressId(runId));
  const token = randomUUID();
  return db.runTransaction<string | null>(async (tx) => {
    const snap = await tx.get(ref);
    const held = snap.exists ? (snap.data() ?? {}) : null;
    const since = typeof held?.claimedAtMs === "number" ? held.claimedAtMs : null;
    if (held && since !== null && Date.now() - since < PRESS_STALE_MS) return null;
    tx.set(ref, { kind: "press", runId, byUid, token, claimedAtMs: Date.now() });
    return token;
  });
}

/** Give the run back, if this press still holds it. */
async function releasePress(db: Firestore, runId: string, token: string): Promise<void> {
  const ref = db.collection(COURSE_FEEDBACK_SENDS_COLLECTION).doc(feedbackPressId(runId));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && (snap.data() ?? {}).token === token) tx.delete(ref);
  });
}

/**
 * Claim one person's ticked pieces for this press, in one transaction: each
 * still there, still on this run and about them, not emailed and claimed by
 * no other press. Answers the pieces claimed, as they stand.
 */
async function claim(db: Firestore, runId: string, uid: string, ids: readonly string[], sendId: string): Promise<CourseFeedbackDoc[]> {
  return db.runTransaction(async (tx) => {
    const now = new Date();
    const refs = ids.map((id) => db.collection(COURSE_FEEDBACK_COLLECTION).doc(id));
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const claimed: CourseFeedbackDoc[] = [];
    snaps.forEach((snap, index) => {
      if (!snap.exists) return;
      const piece = normalizeCourseFeedback(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
      if (piece.runId !== runId || piece.uid !== uid || piece.emailedAt || feedbackIsClaimed(piece, now)) return;
      tx.update(refs[index], { emailClaimedAt: FieldValue.serverTimestamp(), sendId });
      claimed.push(piece);
    });
    return claimed;
  });
}

/** Settle each claimed piece to what the mail door said; a send that threw lets them go, so the next press tries again. */
async function settle(db: Firestore, pieces: readonly CourseFeedbackDoc[], byUid: string, delivery: FeedbackDelivery | "failed"): Promise<void> {
  const batch = db.batch();
  for (const piece of pieces) {
    const ref = db.collection(COURSE_FEEDBACK_COLLECTION).doc(piece.id);
    if (delivery === "failed") batch.update(ref, { emailClaimedAt: null, sendId: "" });
    else batch.update(ref, { emailedAt: FieldValue.serverTimestamp(), emailedByUid: byUid, emailDelivery: delivery, emailClaimedAt: null });
  }
  await batch.commit();
}

/** "Send 6 emails". `request` holds the ticked pieces and the two numbers the button showed. */
export async function sendFeedbackBatch(
  db: Firestore,
  user: SessionUser,
  runId: string,
  request: FeedbackPressRequest,
  now: Date = new Date(),
  appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL,
): Promise<FeedbackSendOutcome> {
  const read = await readBatch(db, user, runId, now);
  if (!read.ok) return read;
  const { context } = read;
  if (!context.tested) return refuse(409, TEST_FIRST);

  const ready = sendable(context);
  const ticked = new Set(request.ids);
  const chosen = ready.filter((piece) => ticked.has(piece.id));
  const people = [...new Set(chosen.map((piece) => piece.uid))];
  if (chosen.length !== ticked.size || chosen.length !== request.pieces || people.length !== request.people) {
    const allPeople = new Set(ready.map((piece) => piece.uid)).size;
    return {
      ...refuse(409, countMovedWords(ready.length, allPeople)),
      pieces: ready.length,
      people: allPeople,
      model: buildModel(context, "admin"),
    };
  }
  if (people.length > MAX_FEEDBACK_EMAILS_PER_PRESS) {
    return refuse(400, `A press sends at most ${MAX_FEEDBACK_EMAILS_PER_PRESS} emails. Untick some, and send the rest after.`);
  }

  const token = await takePress(db, runId, user.uid);
  if (!token) return refuse(409, PRESS_IN_PROGRESS);
  const sendRef = db.collection(COURSE_FEEDBACK_SENDS_COLLECTION).doc();
  const report: FeedbackSendReport = { sent: 0, held: 0, suppressed: 0, failed: [], noAddress: withNoAddress(context) };
  const emailedIds: string[] = [];
  let emailedPeople = 0;
  try {
    for (const [at, uid] of people.entries()) {
      const person = context.people.get(uid);
      if (!person) continue;
      if (at > 0) await sleep(PACE_MS);
      const claimed = await claim(
        db,
        runId,
        uid,
        chosen.filter((piece) => piece.uid === uid).map((piece) => piece.id),
        sendRef.id,
      );
      if (claimed.length === 0) continue;
      const letter = letterFor(context, person, claimed);
      let delivery: FeedbackDelivery;
      try {
        const result = await sendEmail({
          to: person.address,
          subject: letter.subject,
          react: emailOf(letter, feedbackWeekUrl(appUrl, runId, letter.weekNumber)),
          kind: "course-feedback",
          actorUid: user.uid,
          referenceId: runId,
        });
        delivery = deliveryOf(result);
      } catch (err) {
        // One bad send must not strand the rest: let its pieces go, so the next press tries them again.
        console.error("[course feedback] email failed", runId, uid, err);
        report.failed.push(person.name);
        await settle(db, claimed, user.uid, "failed").catch((settleErr) => {
          console.error("[course feedback] could not let a failed email's pieces go", runId, uid, settleErr);
        });
        continue;
      }
      report[delivery] += 1;
      emailedPeople += 1;
      emailedIds.push(...claimed.map((piece) => piece.id));
      try {
        await settle(db, claimed, user.uid, delivery);
      } catch (err) {
        // The email went; only the record of it did not. The claim goes
        // stale and a later press sends it again, the lesser harm.
        console.error("[course feedback] could not record a sent email", runId, uid, err);
      }
    }
    // The press's own row, once something went: who pressed, how many, which pieces, and what became of them.
    if (emailedPeople > 0) await sendRef.set({
      kind: "send",
      runId,
      byUid: user.uid,
      at: FieldValue.serverTimestamp(),
      people: emailedPeople,
      pieces: emailedIds.length,
      pieceIds: emailedIds,
      sent: report.sent,
      held: report.held,
      suppressed: report.suppressed,
      failed: report.failed.length,
    });
  } finally {
    await releasePress(db, runId, token).catch((err) => {
      console.error("[course feedback] could not give the run back", runId, err);
    });
  }
  const after = await readBatch(db, user, runId, new Date());
  if (!after.ok) return after;
  return { ok: true, report, said: sendReportWords(report), model: buildModel(after.context, "admin") };
}
