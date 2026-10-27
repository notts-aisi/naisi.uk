import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import FacilitatorAskEmail from "@/emails/FacilitatorAskEmail";
import { enrolmentRefsFor, seatFor } from "@/lib/courses/groupFacilitators";
import { readRunLead } from "@/lib/courses/programmeLead";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { sendEmail } from "@/lib/email/send";
import type { SessionUser } from "@/lib/firebase/session";
import { askContext, refuse, type AskContext, type AskRefusal } from "./context";
import { groupAskFacts, type GroupAskFacts } from "./groups";
import { askLinkFor } from "./load";
import {
  FACILITATING_COLLECTION,
  FACILITATING_LIMITS,
  askTestId,
  normalizeAsk,
  trainingId,
  type AskDelivery,
  type FacilitatorAsk,
  type WallClock,
} from "./model";
import { loadFacilitatorPeople, type FacilitatorPerson } from "./people";
import { readAsk, readAskTest, readTraining } from "./read";
import type { AskRequest, RemindRequest, TestRequest } from "./requests";
import {
  askStateOf,
  hasPlaceOn,
  isApprovedRole,
  mayBeAsked,
  personStatus,
  replyByInstant,
  type PersonFacts,
} from "./rules";
import { askFingerprint, askIsTested, askTestStanding } from "./tested";
import {
  ASK_REPLY_TO,
  NOT_ON_THE_LIST,
  NOT_SENT_YET,
  NOT_WAITING,
  NOT_YOURSELF,
  NO_ADDRESS,
  NO_SITE_ADDRESS,
  NO_SUCH_GROUP,
  REMINDED_ENOUGH,
  REMINDED_RECENTLY,
  REPLY_BY_PAST,
  STILL_ASKED,
  TOO_MANY_ASKS,
  WRONG_COUNT,
  CANT_UNTIL_ANSWERED,
  CANT_UNTIL_APPROVED,
  askElsewhereWords,
  askFullWords,
  clockIn,
  composeAskEmail,
  composeAskReminder,
  dayIn,
  emailFailedWords,
  notWholeWords,
  testSubject,
  trainingWords,
  type AskEmail,
  type AskEmailInput,
} from "./words";

/**
 * ASKING SOMEBODY TO FACILITATE: the one writer of an ask, its reminder, the
 * test that comes first, and the run's training. Every one of them is the
 * programme's lead's or an admin's (`askContext`), and every refusal is a
 * sentence a person can act on that writes nothing.
 *
 * ## An ask
 *
 * One person, one group, one email, with the day and time to answer by chosen
 * when asking. It goes only when:
 *
 *  - decision day has been sent, so everybody knows where they stand;
 *  - the person is on the list (said yes to facilitating and chose this
 *    programme or Either) and may be asked (`mayBeAsked`): never somebody
 *    invited to this programme who has not answered, never somebody already
 *    asked, and only an approved account, since only an approved account can
 *    facilitate. Somebody holding a place on it may be asked;
 *  - the group is one of the run's, and its email can be written whole;
 *  - a yes could place them in that group (`seatFor`): somebody holding a
 *    place who sits in another group is asked for their own group or moved
 *    on the board first, and a group with no room left for somebody it
 *    would place is refused. The answer asks again, from what is stored
 *    then;
 *  - the day and time to answer by is still to come;
 *  - a test for that day and time has reached the person asking
 *    (`askIsTested`), and the button's number is the one this press sends.
 *
 * The ask is written first, in a transaction that reads every ask of the run
 * again, so two presses at once cannot ask one person twice or fill a seat
 * twice. Then its email goes, and the ask records what the mail door did. An
 * email that fails takes its ask back with it: nobody is asked who was not
 * told.
 *
 * ## A reminder
 *
 * Emails only that person, only while their ask is waiting, at most three
 * times and twelve hours apart, with the facts as they stand now and the day
 * to answer by as it was asked.
 *
 * NOBODY ASKS THEMSELVES: the caller's own id is refused before anything is
 * read, and a test is always somebody else's email, sent to the caller.
 */

const ONE_EMAIL = 1;

type Delivered = { delivery: Exclude<AskDelivery, "sending"> };

/** Hand one email to the mail door. Throws when it could not be handed over. */
async function deliver(
  to: string,
  email: AskEmail,
  input: { runId: string; actorUid: string; test: boolean },
): Promise<Delivered> {
  const result = await sendEmail({
    to,
    subject: input.test ? testSubject(email.subject) : email.subject,
    react: FacilitatorAskEmail({ email }),
    replyTo: ASK_REPLY_TO,
    kind: input.test ? "course-test" : "course-application",
    actorUid: input.actorUid,
    referenceId: input.runId,
  });
  if (result.delivered.length > 0) return { delivery: "sent" };
  return { delivery: result.held.length > 0 ? "held" : "suppressed" };
}

/** What every email of this run says, apart from who and which group. */
type RunFacts = { leadName: string; training: AskEmailInput["training"] };

async function runFacts(db: Firestore, runId: string): Promise<RunFacts> {
  const [lead, training] = await Promise.all([readRunLead(db, runId), readTraining(db, runId)]);
  return { leadName: lead?.firstName ?? "", training: trainingWords(training) };
}

/** The email that asks one person about one group. Null when it cannot be written whole. */
function emailInput(
  context: AskContext,
  person: Pick<FacilitatorPerson, "firstName">,
  facts: GroupAskFacts,
  run: RunFacts,
  replyBy: WallClock,
  link: string,
): AskEmailInput {
  return {
    firstName: person.firstName,
    shortName: context.programme.shortName,
    programmeName: context.programme.name,
    groupName: facts.name,
    meets: facts.meets ?? "",
    where: facts.where,
    weeks: facts.weeks,
    firstSession: facts.firstSession ?? "",
    capacity: facts.capacity,
    training: run.training,
    replyBy: { day: dayIn(replyBy.dateKey) ?? "", time: clockIn(replyBy.time) ?? "" },
    leadName: run.leadName,
    link,
  };
}

/** The sentence that holds an ask until the email has been tested for this day and time. */
function testProblem(context: AskContext, test: Awaited<ReturnType<typeof readAskTest>>, replyBy: WallClock): string | null {
  if (askIsTested(test, context.programme.id, replyBy)) return null;
  const standing = askTestStanding(test, context.programme.id);
  if (standing.state === "none") return "Send yourself a test of this email first. “Send a test to me” does it.";
  if (standing.state === "stale") {
    return "This email’s wording has changed since your last test. Send yourself a test again before you ask.";
  }
  const tested = `${dayIn(standing.replyBy.dateKey)} at ${clockIn(standing.replyBy.time)}`;
  const chosen = `${dayIn(replyBy.dateKey)} at ${clockIn(replyBy.time)}`;
  return `Your last test asked for an answer by ${tested}. Send yourself a test with ${chosen} before you ask.`;
}

/** Why a person may not be asked, in the words of where they stand. */
function whyNot(facts: PersonFacts, uid: string): string {
  const status = personStatus(uid, facts);
  if (status.ask === "asked") return STILL_ASKED;
  if (status.note === CANT_UNTIL_ANSWERED) return `That person is invited to ${facts.programme.shortName}, and can’t be asked until they answer.`;
  if (status.note === CANT_UNTIL_APPROVED) return "That person’s account is waiting for approval, so they can’t be asked yet.";
  if (!facts.decisionsSent) return NOT_SENT_YET;
  return "That person already facilitates one of this run’s groups.";
}

/** The facts `personStatus` asks of one person, from the context and the run's asks. */
function factsFor(context: AskContext, person: FacilitatorPerson, runAsks: FacilitatorAsk[], now: Date): PersonFacts {
  const facilitates = new Map<string, string>();
  for (const group of context.groups) {
    if (group.facilitatorUids.includes(person.uid)) facilitates.set(group.id, group.name.trim() || "Untitled group");
  }
  return {
    programme: context.programme,
    standing: person.standing,
    role: person.role,
    decisionsSent: context.form.decisionsSentAt !== null,
    runAsks: runAsks.filter((ask) => ask.programmeId === context.programme.id),
    facilitates,
    groupNames: new Map(context.groups.map((group) => [group.id, group.name.trim() || "Untitled group"] as const)),
    now,
  };
}

/** The person on the list, and their group's facts: what a test and an ask both need. */
async function personAndGroup(
  db: Firestore,
  actor: SessionUser,
  context: AskContext,
  request: TestRequest,
  now: Date,
): Promise<{ ok: true; person: FacilitatorPerson; facts: GroupAskFacts } | AskRefusal> {
  const group = context.groups.find((each) => each.id === request.groupId);
  if (!group) return refuse(404, NO_SUCH_GROUP);
  const facts = groupAskFacts(context.run, group, now);
  if (!facts.askable) return refuse(409, notWholeWords(facts.name));
  const people = await loadFacilitatorPeople(db, context.form, context.sets, context.programme, actor.uid);
  const person = people.find((each) => each.uid === request.uid);
  if (!person) return refuse(409, NOT_ON_THE_LIST);

  // Could a yes place them in this group? Asked of their row on the run as it
  // stands, so the lead is told before anybody is emailed; the answer asks
  // again of what is stored then. Somebody holding a place on the programme
  // with no row on the run yet is placed in this group by their yes, so here
  // their place stands in for their row on the run's list, and they need
  // room in the group too.
  const [row] = await db.getAll(...enrolmentRefsFor(db, context.run.id, [person.uid]));
  const seat = seatFor(group.id, {
    row: row?.exists ? (row.data() ?? {}) : null,
    accepted: hasPlaceOn(person.standing, context.programme.id),
  });
  if (seat.kind === "elsewhere") {
    const other = context.groups.find((each) => each.id === seat.groupId);
    return refuse(409, askElsewhereWords(other?.name.trim() || "another group", facts.name));
  }
  if (seat.kind === "place" && group.capacity !== null && group.memberCount >= group.capacity) {
    return refuse(409, askFullWords(facts.name));
  }
  return { ok: true, person, facts };
}

// ---------------------------------------------------------------------------
// "Send a test to me"
// ---------------------------------------------------------------------------

export async function sendAskTest(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  request: TestRequest,
  now: Date,
): Promise<{ ok: true; delivery: Delivered["delivery"] } | AskRefusal> {
  if (request.uid === actor.uid) return refuse(409, NOT_YOURSELF);
  if (!actor.email) return refuse(409, "Your account has no address to send a test to.");
  const context = await askContext(db, actor, roundId, programmeId);
  if (!context.ok) return context;
  const found = await personAndGroup(db, actor, context, request, now);
  if (!found.ok) return found;
  const link = askLinkFor("test");
  if (!link) return refuse(409, NO_SITE_ADDRESS);

  const email = composeAskEmail(
    emailInput(context, found.person, found.facts, await runFacts(db, context.run.id), request.replyBy, link),
  );
  if (!email) return refuse(409, notWholeWords(found.facts.name));

  let delivered: Delivered;
  try {
    delivered = await deliver(actor.email, email, { runId: context.run.id, actorUid: actor.uid, test: true });
  } catch (err) {
    console.error("[facilitator asks] test failed", context.run.id, err);
    return refuse(502, "The test didn’t go. Try again in a moment.");
  }
  // Only a test that reached its sender counts.
  if (delivered.delivery === "sent") {
    await db
      .collection(FACILITATING_COLLECTION)
      .doc(askTestId(context.run.id))
      .set({
        kind: "ask-test",
        runId: context.run.id,
        byUid: actor.uid,
        at: FieldValue.serverTimestamp(),
        wording: askFingerprint(context.programme.id, request.replyBy),
        replyBy: request.replyBy,
      });
  }
  return { ok: true, delivery: delivered.delivery };
}

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

export async function askToFacilitate(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  request: AskRequest,
  now: Date,
): Promise<{ ok: true; askId: string; delivery: Delivered["delivery"]; firstName: string } | AskRefusal> {
  if (request.uid === actor.uid) return refuse(409, NOT_YOURSELF);
  if (replyByInstant(request.replyBy).getTime() <= now.getTime()) return refuse(400, REPLY_BY_PAST);
  if (request.emails !== ONE_EMAIL) return refuse(409, WRONG_COUNT);

  const context = await askContext(db, actor, roundId, programmeId);
  if (!context.ok) return context;
  if (context.form.decisionsSentAt === null) return refuse(409, NOT_SENT_YET);
  const problem = testProblem(context, await readAskTest(db, context.run.id), request.replyBy);
  if (problem) return refuse(409, problem);

  const found = await personAndGroup(db, actor, context, request, now);
  if (!found.ok) return found;
  const { person, facts } = found;
  if (!isApprovedRole(person.role)) return refuse(409, "That person’s account is waiting for approval, so they can’t be asked yet.");

  const account = await db.collection("users").doc(person.uid).get();
  const address = account.exists ? account.data()?.email : null;
  if (typeof address !== "string" || address.trim() === "") return refuse(409, NO_ADDRESS);

  const ref = db.collection(FACILITATING_COLLECTION).doc();
  const link = askLinkFor(ref.id);
  if (!link) return refuse(409, NO_SITE_ADDRESS);
  const run = await runFacts(db, context.run.id);
  const email = composeAskEmail(emailInput(context, person, facts, run, request.replyBy, link));
  if (!email) return refuse(409, notWholeWords(facts.name));

  // The claim: written before the email goes, after every ask of the run is
  // read again inside the transaction.
  const claimed = await db.runTransaction(async (tx): Promise<AskRefusal | null> => {
    const snap = await tx.get(db.collection(FACILITATING_COLLECTION).where("runId", "==", context.run.id));
    const runAsks: FacilitatorAsk[] = [];
    let documents = 0;
    for (const doc of snap.docs) {
      documents += 1;
      const ask = normalizeAsk(doc.id, doc.data() as Record<string, unknown>);
      if (ask && ask.runId === context.run.id) runAsks.push(ask);
    }
    if (documents >= FACILITATING_LIMITS.maxAsksPerRun) return refuse(409, TOO_MANY_ASKS);
    const facts = factsFor(context, person, runAsks, now);
    if (!mayBeAsked(person.uid, facts)) return refuse(409, whyNot(facts, person.uid));
    if (request.seat !== null) {
      const seat = runAsks.filter((ask) => ask.seat === request.seat);
      if (seat.length === 0 || seat.some((ask) => ask.groupId !== request.groupId)) {
        return refuse(409, "That isn’t a place anybody was asked for in this group.");
      }
      if (seat.some((ask) => ask.answer === "yes")) return refuse(409, "Somebody has already said yes to that place.");
    }
    tx.create(ref, {
      kind: "ask",
      runId: context.run.id,
      roundId: context.form.round.id,
      programmeId: context.programme.id,
      groupId: request.groupId,
      uid: person.uid,
      seat: request.seat ?? ref.id,
      askedByUid: actor.uid,
      askedAt: FieldValue.serverTimestamp(),
      replyBy: request.replyBy,
      answer: null,
      answeredAt: null,
      remindedAt: null,
      reminders: 0,
      delivery: "sending",
      email,
      toName: person.name,
      firstName: person.firstName,
      leadName: run.leadName,
    });
    return null;
  });
  if (claimed) return claimed;

  let delivered: Delivered;
  try {
    delivered = await deliver(address.trim(), email, { runId: context.run.id, actorUid: actor.uid, test: false });
  } catch (err) {
    console.error("[facilitator asks] ask failed", context.run.id, err);
    // Nobody is asked who was not told: the ask goes with its email.
    await ref.delete().catch(() => undefined);
    return refuse(502, emailFailedWords(person.firstName));
  }
  await ref.update({ delivery: delivered.delivery }).catch((err) => {
    console.error("[facilitator asks] could not record the delivery", ref.id, err);
  });
  return { ok: true, askId: ref.id, delivery: delivered.delivery, firstName: person.firstName };
}

// ---------------------------------------------------------------------------
// Reminding
// ---------------------------------------------------------------------------

export async function remindAsk(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  request: RemindRequest,
  now: Date,
): Promise<{ ok: true; delivery: Delivered["delivery"]; firstName: string } | AskRefusal> {
  if (request.emails !== ONE_EMAIL) return refuse(409, WRONG_COUNT);
  const context = await askContext(db, actor, roundId, programmeId);
  if (!context.ok) return context;
  const ask = await readAsk(db, request.askId);
  if (!ask || ask.runId !== context.run.id || ask.programmeId !== context.programme.id) {
    return refuse(404, "There is no ask here to remind anybody of.");
  }
  const group = context.groups.find((each) => each.id === ask.groupId);
  if (!group) return refuse(409, NO_SUCH_GROUP);
  const facts = groupAskFacts(context.run, group, now);

  const account = await db.collection("users").doc(ask.uid).get();
  const address = account.exists ? account.data()?.email : null;
  if (typeof address !== "string" || address.trim() === "") return refuse(409, NO_ADDRESS);
  const link = askLinkFor(ask.id);
  if (!link) return refuse(409, NO_SITE_ADDRESS);
  // Called what the ask called them, by the facts as they stand now.
  const firstName = ask.firstName || "there";
  const run = await runFacts(db, context.run.id);
  const email = composeAskReminder(emailInput(context, { firstName }, facts, run, ask.replyBy, link), {
    lastDay: ask.replyBy.dateKey === londonDateKey(now),
  });
  if (!email) return refuse(409, notWholeWords(facts.name));

  // The claim: the reminder is counted before it goes, after the ask is read
  // again, so two presses at once send one.
  const ref = db.collection(FACILITATING_COLLECTION).doc(ask.id);
  const before = { remindedAt: ask.remindedAt, reminders: ask.reminders };
  const claimed = await db.runTransaction(async (tx): Promise<AskRefusal | null> => {
    const snap = await tx.get(db.collection(FACILITATING_COLLECTION).where("runId", "==", context.run.id));
    const runAsks: FacilitatorAsk[] = [];
    for (const doc of snap.docs) {
      const read = normalizeAsk(doc.id, doc.data() as Record<string, unknown>);
      if (read && read.runId === context.run.id) runAsks.push(read);
    }
    const current = runAsks.find((each) => each.id === ask.id);
    if (!current || askStateOf(current, runAsks, now).kind !== "waiting") return refuse(409, NOT_WAITING);
    if (current.reminders >= FACILITATING_LIMITS.maxReminders) return refuse(409, REMINDED_ENOUGH);
    if (current.remindedAt && now.getTime() - current.remindedAt.getTime() < FACILITATING_LIMITS.remindAfterMs) {
      return refuse(409, REMINDED_RECENTLY);
    }
    tx.update(ref, { remindedAt: FieldValue.serverTimestamp(), reminders: current.reminders + 1 });
    return null;
  });
  if (claimed) return claimed;

  try {
    const delivered = await deliver(address.trim(), email, { runId: context.run.id, actorUid: actor.uid, test: false });
    return { ok: true, delivery: delivered.delivery, firstName };
  } catch (err) {
    console.error("[facilitator asks] reminder failed", ask.id, err);
    // A reminder that did not go is not counted.
    await ref.update({ remindedAt: before.remindedAt, reminders: before.reminders }).catch(() => undefined);
    return refuse(502, `The reminder to ${firstName} didn’t go. Try again in a moment.`);
  }
}

// ---------------------------------------------------------------------------
// The training
// ---------------------------------------------------------------------------

/** Set the run's training, or clear it with `null`. Answers it as the card shows it. */
export async function setTraining(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  training: (WallClock & { room: string }) | null,
): Promise<{ ok: true; training: AskEmailInput["training"] } | AskRefusal> {
  const context = await askContext(db, actor, roundId, programmeId);
  if (!context.ok) return context;
  const ref = db.collection(FACILITATING_COLLECTION).doc(trainingId(context.run.id));
  if (training === null) {
    await ref.delete();
    return { ok: true, training: null };
  }
  await ref.set({
    kind: "training",
    runId: context.run.id,
    dateKey: training.dateKey,
    time: training.time,
    room: training.room,
    setByUid: actor.uid,
    setAt: FieldValue.serverTimestamp(),
  });
  return {
    ok: true,
    training: trainingWords(training),
  };
}
