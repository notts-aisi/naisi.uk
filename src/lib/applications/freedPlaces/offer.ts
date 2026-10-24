import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { formatRunStartShort } from "@/lib/courses/window";
import { admissionApplicationUrl } from "@/lib/email/admissionEmails";
import { COURSE_AUDIT_COLLECTION, type CourseAuditKind } from "@/lib/firestore/courseAudit";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import type { SessionUser } from "@/lib/firebase/session";
import { roleOnProgramme } from "../access";
import { freePlaces, isInTerm } from "../decisions";
import { sendDecisionEmail, type Delivery } from "../decisionDay/deliver";
import type { DecisionEmail } from "../decisionDay/emailCopy";
import { emailStanding, handoverAfter } from "../decisionDay/emailState";
import { loadFirstNames } from "../decisionDay/people";
import { firstNameOf, planTerm } from "../decisionDay/plan";
import { programmeOf } from "../decisionDay/programmes";
import type { ApplicationDoc, DecisionDoc, ProgrammeSettings, ResultEmailState } from "../model";
import {
  isApplicationForm,
  normaliseApplication,
  normaliseDecision,
  normaliseForm,
  type ApplicationForm,
} from "../normalise";
import { applicationRef, formRef, loadForm } from "../repo";
import { OWN_APPLICATION } from "../review/refusals";
import { rankedProgrammes } from "../sections";
import { decisionRef, listSentApplications, loadApplication, loadDecision } from "../staffRepo";
import { standingOf } from "../status/standing";
import { enrolmentRef, fits, groupRef, groupWords, isTimed, placedIn, readRun, runRef } from "./groups";
import {
  ADMINS_OFFER,
  NO_PROGRAMME,
  freedPlaceWindow,
  offerProblem,
  offersFreedPlaces,
  placesProblem,
  programmeProblem,
  seatsFree,
  waitingOnGroups,
  type OfferPick,
  type OfferRequest,
  type OwedRequest,
  type Refusal,
  type TestRequest,
  windowSentence,
} from "./rules";
import { freedPlaceFingerprint, freedPlaceTestStanding, sendIsTested } from "./tested";
import type { OfferReport } from "./views";
import { composeFreedPlaceEmail, toldOnWords } from "./words";

/**
 * OFFERING FREED PLACES: the one writer of an offer, the emails that follow
 * it, and the test that has to come first.
 *
 * ## What a press writes, and all it writes
 *
 * One transaction, for everybody picked at once, so a press offers all of
 * them or none:
 *
 *  - on each person's OWN application: `invitation` (decision day's shape,
 *    with the day to accept by chosen on the page), `freedPlace` (when, the
 *    group whose time the email names, and the email's own state, taken up
 *    as `sending`), and `status` from `no-offer` to `invited`. `result` is
 *    not touched: it is what decision day told them.
 *  - on the form: the counters, `no-offer` down and `invited` up by as many,
 *    as decision day's own send moves them.
 *  - one line in the log, of kind `application-freed-places-offered`, saying
 *    how many and on which programme, and naming nobody.
 *
 * ## What it asks first, of what the transaction read
 *
 * Who may (`offersFreedPlaces` of the caller's role on the form it read), the
 * form and the programme and the window (`programmeProblem`, with the window
 * worked out from the run it read), the test (`sendIsTested`), the places
 * free over the WHOLE term, the caller included (`freePlaces`, never
 * rewritten), each person (`offerProblem`), each group (on the run, with a
 * time, covered by the person's week, with a seat), and each email, which has
 * to be whole. Any one of them refuses the whole press with a sentence, and
 * nothing is written. Two presses at once read the same documents: the one
 * that commits second has read something that changed, runs again, and meets
 * the refusal, so the last place can be offered once.
 *
 * ## The emails, after the commit
 *
 * The email's buttons open the person's own application page, so the offer
 * is written first and the email follows, as on decision day. What became of
 * each is settled on `freedPlace` the way decision day settles its own
 * (`decisionDay/emailState.ts`): an email is sent again only when the site
 * knows the last attempt handed nothing over, by the press that sends what is
 * still to go, which takes it up in a transaction that requires that.
 *
 * NOBODY IS OFFERED THEIR OWN PLACE: the caller's own id is refused before
 * anything is read, and a test is always somebody else's email.
 */

/** The log's kind for a press. Held to the log's own list by its type. */
export const FREED_PLACES_AUDIT_KIND = "application-freed-places-offered" satisfies CourseAuditKind;

/** Decision day's own sentence, for the same reason. */
const NO_SITE_ADDRESS =
  "This copy of the site doesn’t know its own address, so the buttons in the emails would lead nowhere.";

const NOBODY = "Nobody by that id has an application on this form.";

/** A known failure is tried once more; one that may have gone is not. */
const EMAIL_ATTEMPTS = 2;
const RETRY_AFTER_MS = 400;
const SETTLE_ATTEMPTS = 3;

export type OfferOutcome = { ok: true; report: OfferReport } | ({ ok: false } & Refusal);

const refuse = (status: Refusal["status"], error: string): { ok: false } & Refusal => ({ ok: false, status, error });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The name the committee's screens read, by the same rule as decision day's. */
function nameOf(application: Pick<ApplicationDoc, "displayName" | "sent">): string {
  return application.displayName.trim() || application.sent?.aboutYou.preferredName.trim() || "Unnamed applicant";
}

/** What is said before decisions have gone out: the window's own sentence for that. */
function beforeTheSend(programme: ProgrammeSettings, form: ApplicationForm): string {
  return windowSentence(freedPlaceWindow(null, null, new Date()), programme, form.round.label);
}

/** The sentence that holds a send until the email has been tested. */
function testProblem(form: ApplicationForm, programme: ProgrammeSettings, replyBy: string): string | null {
  if (sendIsTested(form, programme, replyBy)) return null;
  const standing = freedPlaceTestStanding(form, programme);
  if (standing.state === "none") return "Send yourself a test of this email first. The page’s “Send a test to me” does it.";
  if (standing.state === "stale") {
    return "This email’s wording has changed since your last test. Send yourself a test again before you send.";
  }
  const tested = formatRunStartShort(standing.replyBy) ?? standing.replyBy;
  const chosen = formatRunStartShort(replyBy) ?? replyBy;
  return `Your last test asked for an answer by ${tested}. Send yourself a test with ${chosen} before you send.`;
}

/** What one email needs from the run, the group and the person. Null when it cannot be written whole. */
function emailFor(input: {
  application: ApplicationDoc;
  form: ApplicationForm;
  programme: ProgrammeSettings;
  leadName: string;
  run: CourseRunDoc;
  group: CourseGroupDoc;
  replyBy: string;
  link: string;
  now: Date;
}): DecisionEmail | null {
  const { application, form, programme, run, group, now } = input;
  const words = groupWords(run, group, now);
  const toldAt = application.result?.publishedAt ?? form.decisionsSentAt;
  return composeFreedPlaceEmail({
    firstName: firstNameOf(application),
    programme: { shortName: programme.shortName, kind: programme.kind },
    leadName: input.leadName,
    toldOn: toldAt ? toldOnWords(toldAt, now) : "",
    meets: words.meets ?? "",
    startsOn: words.startsOn ?? "",
    freeOn: words.freeOn ?? "",
    replyBy: formatRunStartShort(input.replyBy) ?? "",
    link: input.link,
  });
}

/** Why an email cannot be written whole, in words an admin can act on. */
function notWhole(name: string, group: CourseGroupDoc): string {
  return `The email to ${name} can’t be written whole, so nothing was sent: ${group.name} has no session still to come.`;
}

/** The lead's first name, which an email is signed with. "" for a programme with none. */
async function leadNameOf(db: Firestore, programme: ProgrammeSettings): Promise<string> {
  if (!programme.leadUid) return "";
  return (await loadFirstNames(db, [programme.leadUid])).get(programme.leadUid) ?? "";
}

// ---------------------------------------------------------------------------
// The emails
// ---------------------------------------------------------------------------

type Letter = { uid: string; name: string; to: string | null; email: DecisionEmail };
type Fate = Delivery | "failed" | "unconfirmed";

/** Hand one email to the mail door. Never rejects. */
async function deliver(roundId: string, actorUid: string, letter: Letter & { to: string }): Promise<Fate> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await sendDecisionEmail({ to: letter.to, email: letter.email, roundId, actorUid });
    } catch (err) {
      console.error("[freed places] email failed", roundId, letter.uid, err);
      if (handoverAfter(err) === "unknown") return "unconfirmed";
      if (attempt >= EMAIL_ATTEMPTS) return "failed";
      await sleep(RETRY_AFTER_MS);
    }
  }
}

/**
 * Record what became of an email this press holds. Only an email still
 * `sending` is settled, so this never overwrites what another press arrived
 * at. A record that cannot be written leaves it `sending`, which reads as
 * unconfirmed once the claim is old: it is never sent again either way.
 */
async function settle(db: Firestore, form: ApplicationForm, uid: string, fate: Fate): Promise<void> {
  const state: ResultEmailState = fate === "failed" ? "owed" : fate;
  const ref = applicationRef(db, form.round.id, uid);
  for (let attempt = 1; ; attempt += 1) {
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const application = snap.exists
          ? normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid)
          : null;
        if (application?.freedPlace?.email !== "sending") return;
        tx.update(ref, {
          "freedPlace.email": state,
          "freedPlace.emailedAt": state === "sent" ? FieldValue.serverTimestamp() : null,
          "freedPlace.emailClaimedAt": null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      return;
    } catch (err) {
      if (attempt >= SETTLE_ATTEMPTS) {
        console.error("[freed places] could not record what became of an email", form.round.id, uid, err);
        return;
      }
      await sleep(RETRY_AFTER_MS);
    }
  }
}

/** Send every letter a press took up, one after another, and say what became of each. */
async function sendLetters(
  db: Firestore,
  form: ApplicationForm,
  actorUid: string,
  letters: readonly Letter[],
  report: OfferReport,
): Promise<void> {
  for (const letter of letters) {
    if (!letter.to) {
      // Offered, and nobody can be written to: it stays to go, and is named.
      report.failed.push(letter.name);
      continue;
    }
    const fate = await deliver(form.round.id, actorUid, { ...letter, to: letter.to });
    await settle(db, form, letter.uid, fate);
    if (fate === "sent") report.emailed += 1;
    else if (fate === "held") report.held += 1;
    else if (fate === "suppressed") report.suppressed += 1;
    else if (fate === "failed") report.failed.push(letter.name);
    else report.unconfirmed.push(letter.name);
  }
}

const emptyReport = (offered: number): OfferReport => ({
  offered,
  emailed: 0,
  held: 0,
  suppressed: 0,
  failed: [],
  unconfirmed: [],
});

// ---------------------------------------------------------------------------
// The press
// ---------------------------------------------------------------------------

/**
 * Offer one programme's freed places to the people picked, and email them.
 * `user` is the session pressing it; `clock` is the time, which a test moves.
 */
export async function offerFreedPlaces(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  request: OfferRequest,
  clock: () => Date = () => new Date(),
): Promise<OfferOutcome> {
  // Before anything is read, so the answer is the same wherever the caller's
  // own application stands.
  if (request.picks.some((pick) => pick.uid === user.uid)) return refuse(403, OWN_APPLICATION);

  const form = await loadForm(db, roundId);
  const programme = form ? programmeOf(form, programmeId) : undefined;
  const role = form && programme ? roleOnProgramme(user, form, programmeId) : null;
  if (!form || !programme || role === null) return refuse(404, NO_PROGRAMME);
  if (!offersFreedPlaces(role)) return refuse(403, ADMINS_OFFER);
  const link = admissionApplicationUrl(form.round.id, "status");
  if (!link) return refuse(409, NO_SITE_ADDRESS);
  // Nothing is offered, and nobody is read, before decisions have gone out.
  if (form.decisionsSentAt === null) return refuse(409, beforeTheSend(programme, form));

  // Who is on the form is settled before the transaction: the list only says
  // which documents to read, and every one of them is read again inside it.
  const [sent, leadName] = await Promise.all([listSentApplications(db, form), leadNameOf(db, programme)]);
  const uids = sent.map((application) => application.uid);
  if (request.picks.some((pick) => !uids.includes(pick.uid))) return refuse(404, NOBODY);
  const now = clock();

  const written = await db.runTransaction(async (tx) => {
    const formSnap = await tx.get(formRef(db, roundId));
    if (!formSnap.exists || !isApplicationForm(formSnap.data())) return refuse(404, NO_PROGRAMME);
    const live = normaliseForm(formSnap.id, formSnap.data());
    const liveProgramme = programmeOf(live, programmeId);
    // Who may is asked again of the form this transaction read.
    const liveRole = liveProgramme ? roleOnProgramme(user, live, programmeId) : null;
    if (!liveProgramme || liveRole === null) return refuse(404, NO_PROGRAMME);
    if (!offersFreedPlaces(liveRole)) return refuse(403, ADMINS_OFFER);

    const runSnap = liveProgramme.runId ? await tx.get(runRef(db, liveProgramme.runId)) : null;
    const run = runSnap?.exists ? normalizeCourseRun(runSnap.id, runSnap.data() ?? {}) : null;
    const window = freedPlaceWindow(live.decisionsSentAt, run, now);
    const problem = programmeProblem(live, programmeId, window);
    if (problem) return refuse(problem.status, problem.error);
    if (!run) return refuse(409, NO_PROGRAMME);
    const untested = testProblem(live, liveProgramme, request.replyBy);
    if (untested) return refuse(409, untested);

    // EVERYBODY, the caller's own application included: a place offered has
    // to be really free, and a place somebody holds is taken whoever asks.
    const [applicationSnaps, decisionSnaps] = await Promise.all([
      tx.getAll(...uids.map((uid) => applicationRef(db, roundId, uid))),
      tx.getAll(...uids.map((uid) => decisionRef(db, roundId, uid))),
    ]);
    const applications: ApplicationDoc[] = [];
    const decisions = new Map<string, DecisionDoc>();
    uids.forEach((uid, at) => {
      const applicationSnap = applicationSnaps[at];
      const application = applicationSnap.exists
        ? normaliseApplication(applicationSnap.id, applicationSnap.data(), live.round.availabilityGrid)
        : null;
      if (application?.sent) applications.push(application);
      const decisionSnap = decisionSnaps[at];
      if (decisionSnap.exists) decisions.set(uid, normaliseDecision(decisionSnap.id, decisionSnap.data()));
    });
    const term = planTerm(live, applications, decisions);
    const free = freePlaces(live, term.tally, programmeId);
    const short = placesProblem(liveProgramme, free, request.picks.length);
    if (short) return refuse(409, short);

    const byUid = new Map(applications.map((application) => [application.uid, application]));
    const picked: { pick: OfferPick; application: ApplicationDoc }[] = [];
    for (const pick of request.picks) {
      const application = byUid.get(pick.uid);
      if (!application?.sent) return refuse(404, NOBODY);
      const ranked = rankedProgrammes(live, application.sent).map((each) => each.id);
      const why = offerProblem(
        { name: nameOf(application), ranked, decision: decisions.get(pick.uid) ?? null, application },
        liveProgramme,
      );
      if (why) return refuse(409, why);
      picked.push({ pick, application });
    }

    // The groups whose times the emails name, read here so a group moved or
    // filled a moment ago is seen.
    const groupIds = [...new Set(request.picks.map((pick) => pick.groupId))];
    const groupSnaps = await tx.getAll(...groupIds.map((groupId) => groupRef(db, groupId)));
    const groups = new Map<string, CourseGroupDoc>();
    groupSnaps.forEach((snap) => {
      if (snap.exists) groups.set(snap.id, normalizeCourseGroup(snap.id, snap.data() ?? {}));
    });
    for (const { pick, application } of picked) {
      const group = groups.get(pick.groupId);
      if (!group || !isTimed(group, run.id)) {
        return refuse(409, `That group isn’t one of ${liveProgramme.shortName}’s run’s groups with a weekly time.`);
      }
      if (!application.sent || !fits(application.sent.availability, live.round.availabilityGrid, group)) {
        return refuse(
          409,
          `${nameOf(application)}’s week doesn’t cover ${group.name}’s time, so the email can’t say they’re free then.`,
        );
      }
    }
    // A seat in each group, counting the offers already waiting on one.
    const waitingUids = applications
      .filter((application) => application.freedPlace && groups.has(application.freedPlace.groupId))
      .map((application) => application.uid);
    const enrolmentSnaps =
      waitingUids.length > 0 ? await tx.getAll(...waitingUids.map((uid) => enrolmentRef(db, run.id, uid))) : [];
    const placed = placedIn(
      enrolmentSnaps.map((snap) => (snap.exists ? { id: snap.id, data: snap.data() ?? {} } : null)),
    );
    const waiting = waitingOnGroups(applications, placed);
    for (const [groupId, group] of groups) {
      const asked = request.picks.filter((pick) => pick.groupId === groupId).length;
      const seats = seatsFree(group, waiting);
      if (seats !== null && seats < asked) {
        return refuse(
          409,
          seats === 0
            ? `${group.name} has no free seat.`
            : `${group.name} has ${seats === 1 ? "1 free seat" : `${seats} free seats`}, not ${asked}.`,
        );
      }
    }

    // Each email, whole or not at all, before anything is written.
    const letters: Letter[] = [];
    for (const { pick, application } of picked) {
      const group = groups.get(pick.groupId) as CourseGroupDoc;
      const email = emailFor({
        application,
        form: live,
        programme: liveProgramme,
        leadName,
        run,
        group,
        replyBy: request.replyBy,
        link,
        now,
      });
      if (!email) return refuse(409, notWhole(nameOf(application), group));
      letters.push({ uid: pick.uid, name: nameOf(application), to: (application.email ?? "").trim() || null, email });
    }

    for (const letter of letters) {
      const pick = request.picks.find((each) => each.uid === letter.uid) as OfferPick;
      tx.update(applicationRef(db, roundId, letter.uid), {
        status: "invited",
        invitation: {
          programmeId,
          replyBy: request.replyBy,
          response: null,
          respondedAt: null,
          lastReminderOn: null,
        },
        freedPlace: {
          groupId: pick.groupId,
          offeredAt: FieldValue.serverTimestamp(),
          // Taken up by this press, which sends it after the commit. An
          // offer with nowhere to write to is still to go, and is named.
          email: letter.to ? "sending" : "owed",
          emailedAt: null,
          emailClaimedAt: letter.to ? FieldValue.serverTimestamp() : null,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    // The counters move with the statuses, in the same transaction.
    tx.update(formRef(db, roundId), {
      "applicationCounts.no-offer": FieldValue.increment(-letters.length),
      "applicationCounts.invited": FieldValue.increment(letters.length),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const replyByLabel = formatRunStartShort(request.replyBy) ?? request.replyBy;
    tx.create(db.collection(COURSE_AUDIT_COLLECTION).doc(), {
      kind: FREED_PLACES_AUDIT_KIND,
      // A form is not a run: the run axis is empty and the form's id is kept.
      runId: "",
      roundId,
      groupId: null,
      subjectUid: null,
      actorUid: user.uid,
      actorName: user.displayName ?? "",
      targetLabel: live.round.label,
      detail:
        `Offered ${letters.length === 1 ? "1 freed place" : `${letters.length} freed places`} on ` +
        `${liveProgramme.shortName}, to be accepted by ${replyByLabel}.`,
      at: FieldValue.serverTimestamp(),
    });
    return { ok: true as const, letters };
  });
  if (!written.ok) return written;

  const report = emptyReport(written.letters.length);
  await sendLetters(db, form, user.uid, written.letters, report);
  return { ok: true, report };
}

// ---------------------------------------------------------------------------
// The emails still to go
// ---------------------------------------------------------------------------

/**
 * Send the freed-place emails of this programme that are still to go: offered
 * and unanswered, with an email the site knows was never handed over. The
 * number on the button comes with the press, and the press is refused when
 * it is no longer true. Each is taken up in a transaction that requires it to
 * be still to go, so two presses cannot both send one.
 *
 * The offer was tested before it was made. What is asked here is only that
 * the wording has not changed since the last test, so what goes is what an
 * admin read.
 */
export async function sendOwedFreedPlaceEmails(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  request: OwedRequest,
  clock: () => Date = () => new Date(),
): Promise<OfferOutcome> {
  const form = await loadForm(db, roundId);
  const programme = form ? programmeOf(form, programmeId) : undefined;
  const role = form && programme ? roleOnProgramme(user, form, programmeId) : null;
  if (!form || !programme || role === null) return refuse(404, NO_PROGRAMME);
  if (!offersFreedPlaces(role)) return refuse(403, ADMINS_OFFER);
  const link = admissionApplicationUrl(form.round.id, "status");
  if (!link) return refuse(409, NO_SITE_ADDRESS);
  // Nothing has been offered, and nobody is read, before decisions have gone out.
  if (form.decisionsSentAt === null) return refuse(409, beforeTheSend(programme, form));
  if (freedPlaceTestStanding(form, programme).state !== "fresh") {
    return refuse(409, "This email’s wording has changed since your last test. Send yourself a test again before you send.");
  }
  const now = clock();
  const run = await readRun(db, programme.runId);
  if (!run) return refuse(409, NO_PROGRAMME);

  const owed = (await listSentApplications(db, form)).filter(
    (application) =>
      application.uid !== user.uid &&
      application.freedPlace !== null &&
      application.invitation?.programmeId === programmeId &&
      isInTerm(application) &&
      standingOf(application).kind === "invitation" &&
      emailStanding(application.freedPlace, now) === "owed" &&
      (application.email ?? "").trim() !== "",
  );
  if (owed.length !== request.emails) {
    return refuse(
      409,
      `The emails still to go have changed since this page loaded: there are now ${owed.length}, not ${request.emails}. Reload the page and check again.`,
    );
  }
  const leadName = await leadNameOf(db, programme);
  const report = emptyReport(0);
  const letters: Letter[] = [];
  let stillMay = true;
  for (const application of owed) {
    const claimed = await db.runTransaction<Letter | "not-yours" | null>(async (tx) => {
      // Who may is asked again of the form this transaction reads, so an
      // email is never taken up for somebody who may no longer send it.
      const formSnap = await tx.get(formRef(db, roundId));
      const liveForm =
        formSnap.exists && isApplicationForm(formSnap.data()) ? normaliseForm(formSnap.id, formSnap.data()) : null;
      if (!liveForm || !offersFreedPlaces(roleOnProgramme(user, liveForm, programmeId))) return "not-yours";
      const ref = applicationRef(db, roundId, application.uid);
      const snap = await tx.get(ref);
      const live = snap.exists ? normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid) : null;
      if (!live?.freedPlace || !isInTerm(live) || standingOf(live).kind !== "invitation") return null;
      if (emailStanding(live.freedPlace, now) !== "owed") return null;
      const groupSnap = await tx.get(groupRef(db, live.freedPlace.groupId));
      const group = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
      const to = (live.email ?? "").trim();
      if (!group || !isTimed(group, run.id) || !to || !live.invitation) return null;
      const email = emailFor({
        application: live,
        form,
        programme,
        leadName,
        run,
        group,
        replyBy: live.invitation.replyBy,
        link,
        now,
      });
      if (!email) return null;
      tx.update(ref, {
        "freedPlace.email": "sending",
        "freedPlace.emailClaimedAt": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { uid: live.uid, name: nameOf(live), to, email } satisfies Letter;
    });
    if (claimed === "not-yours") {
      // Nothing more is taken up. What was taken up already is sent below,
      // or it would sit as sending and never go.
      stillMay = false;
      break;
    }
    if (claimed) letters.push(claimed);
    else report.failed.push(nameOf(application));
  }
  if (!stillMay && letters.length === 0) return refuse(403, ADMINS_OFFER);
  await sendLetters(db, form, user.uid, letters, report);
  return { ok: true, report };
}

// ---------------------------------------------------------------------------
// A test, to the caller's own address
// ---------------------------------------------------------------------------

export type TestOutcome =
  | { ok: true; delivery: Delivery; subject: string; recorded: boolean }
  | ({ ok: false } & Refusal)
  | { ok: false; status: 502; error: string };

/**
 * "Send a test to me": the first person's real email, exactly as the send
 * would compose it, to the address on the caller's own session and nowhere
 * else, marked as a test. A test that reaches the mail provider is recorded
 * on the form with the day to accept by it was sent for, which is what the
 * send asks for. One this copy of the site held, or one the do-not-email
 * list refused, reached nobody and is not recorded.
 *
 * It tells no applicant anything and writes nothing to any application. It
 * asks everything the send asks about the person and the group, and not
 * whether a place is free: it reaches nobody but the caller.
 */
export async function sendFreedPlaceTest(
  db: Firestore,
  user: SessionUser & { email: string },
  roundId: string,
  programmeId: string,
  request: TestRequest,
  clock: () => Date = () => new Date(),
): Promise<TestOutcome> {
  // A test is somebody else's email, never the asker's own, sent to them early.
  if (request.pick.uid === user.uid) return refuse(403, OWN_APPLICATION);
  const form = await loadForm(db, roundId);
  const programme = form ? programmeOf(form, programmeId) : undefined;
  const role = form && programme ? roleOnProgramme(user, form, programmeId) : null;
  if (!form || !programme || role === null) return refuse(404, NO_PROGRAMME);
  if (!offersFreedPlaces(role)) return refuse(403, ADMINS_OFFER);
  const link = admissionApplicationUrl(form.round.id, "status");
  if (!link) return refuse(409, NO_SITE_ADDRESS);

  const now = clock();
  const run = await readRun(db, programme.runId);
  const problem = programmeProblem(form, programmeId, freedPlaceWindow(form.decisionsSentAt, run, now));
  if (problem) return refuse(problem.status, problem.error);
  if (!run) return refuse(409, NO_PROGRAMME);

  const [application, decision, groupSnap, leadName] = await Promise.all([
    loadApplication(db, form, request.pick.uid),
    loadDecision(db, roundId, request.pick.uid),
    groupRef(db, request.pick.groupId).get(),
    leadNameOf(db, programme),
  ]);
  if (!application?.sent) return refuse(404, NOBODY);
  const ranked = rankedProgrammes(form, application.sent).map((each) => each.id);
  const why = offerProblem({ name: nameOf(application), ranked, decision, application }, programme);
  if (why) return refuse(409, why);
  const group = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
  if (!group || !isTimed(group, run.id)) {
    return refuse(409, `That group isn’t one of ${programme.shortName}’s run’s groups with a weekly time.`);
  }
  if (!fits(application.sent.availability, form.round.availabilityGrid, group)) {
    return refuse(
      409,
      `${nameOf(application)}’s week doesn’t cover ${group.name}’s time, so the email can’t say they’re free then.`,
    );
  }
  const email = emailFor({ application, form, programme, leadName, run, group, replyBy: request.replyBy, link, now });
  if (!email) return refuse(409, notWhole(nameOf(application), group));

  let delivery: Delivery;
  try {
    delivery = await sendDecisionEmail({ to: user.email, email, roundId, actorUid: user.uid, test: true });
  } catch (err) {
    console.error("[freed places] test send failed", roundId, err);
    return { ok: false, status: 502, error: "That test could not be sent. Try again in a minute." };
  }
  if (delivery !== "sent") return { ok: true, delivery, subject: email.subject, recorded: false };
  try {
    await formRef(db, roundId).update({
      [`freedPlaceTests.${programmeId}`]: {
        byUid: user.uid,
        at: FieldValue.serverTimestamp(),
        replyBy: request.replyBy,
        wording: freedPlaceFingerprint(programme, request.replyBy),
      },
    });
  } catch (err) {
    console.error("[freed places] could not record a test", roundId, err);
    return {
      ok: false,
      status: 502,
      error: "The test was sent to you, but it could not be recorded. Send it again in a minute.",
    };
  }
  return { ok: true, delivery, subject: email.subject, recorded: true };
}
