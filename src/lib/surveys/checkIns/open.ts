import "server-only";
import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import SurveyEmail from "@/emails/SurveyEmail";
import { own } from "@/lib/applications/keys";
import { loadForm } from "@/lib/applications/repo";
import { firstNameOfUser, readNamingProgramme } from "@/lib/courses/programmeLead";
import { loadToldRegisterMembers } from "@/lib/courses/registerAccess";
import { dispatchSends } from "@/lib/email/dispatch";
import { sendNotice } from "@/lib/email/notice";
import { DAY_MS, reserveNoticeSlots } from "@/lib/email/noticeCaps";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import {
  SURVEY_PEOPLE_COLLECTION,
  SURVEYS_COLLECTION,
  surveyPersonId,
  type CheckInAudience,
  type SurveyDelivery,
} from "@/lib/firestore/surveys";
import { siteAddress, surveyLink } from "../emails";
import { surveyQuestionsOf } from "../items";
import { namesOffDayFor } from "../namesOff";
import { checkInSetItems } from "../questionSetsStore";
import { mintSurveyToken } from "../token";
import { SURVEY_FROM_NAME, SURVEY_REPLY_TO } from "../words";
import { checkInSurveyId } from "./ids";
import { CHECK_INS_PER_DAY, MAX_CHECK_IN_PEOPLE, hereOf, windowState } from "./model";
import { readCheckInSession, readCheckInWeek, readRegisterMarks } from "./sessionRead";
import { CHECK_IN_MINUTES } from "./template";
import {
  CHECK_IN_REFUSAL,
  checkInEmailWords,
  checkInName,
  checkInTitle,
  hereChangedWords,
  sessionWhenWords,
} from "./words";

/**
 * OPENING A CHECK-IN, from the register, by a facilitator of the group or an
 * admin (the route has asked `gateGroupRegister` first). In this order, and
 * nothing is written before the last refusal:
 *
 *  1. THE SESSION: one the group holds, that can be dated, that happened (not
 *     cancelled, and its register not marked as not held), and whose window
 *     is now: from its start until it closes (`checkInWindow`).
 *  2. WHO IT IS FOR: the people its register marks there, never the group's
 *     facilitators (`hereOf`), at least one and at most a register's forty,
 *     and exactly the number on the button pressed: when the register has
 *     moved since the button was drawn, nothing is opened and the answer
 *     carries the new number.
 *  3. THE PROGRAMME that names the run, for its name, the day names come off
 *     and the box's lead; refused when the run is no programme's.
 *  4. THE CAP: two check-ins a London day per group, by the notice lane's
 *     durable counter.
 *  5. THE CLAIM: the check-in's document is CREATED, at an id worked out from
 *     the session (`checkInSurveyId`), in one batch with every person's row
 *     and its secret. Two presses make one check-in: the second's create
 *     fails, and it is told it is open already.
 *  6. THE EMAILS: one notice each, to the account's own address, with the
 *     person's own link (surface `course-check-in`), whatever their settings
 *     say, and each row stamped with what became of it. A row is theirs from
 *     the moment it is written, so somebody whose email fails still has the
 *     check-in on Home and by the code.
 *
 * Its questions are made now from the group's own copy of the week and never
 * change. It is never sent again: somebody marked there later gets a row and
 * no email (`./lateMark.ts`), and nobody is reminded.
 */

export type OpenOutcome =
  | { ok: true; surveyId: string; people: number; tally: { sent: number; held: number; suppressed: number; failed: number; noAddress: number } }
  | { ok: false; status: number; error: string; people?: number; retryAfterSeconds?: number };

/** The account addresses of these people, by uid. */
async function addressesOf(db: Firestore, uids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wanted = uids.filter((uid) => uid && !uid.includes("/"));
  if (wanted.length === 0) return out;
  const docs = await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid)));
  for (const doc of docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const address = typeof data.email === "string" ? data.email.trim() : "";
    if (doc.exists && address) out.set(doc.id, address);
  }
  return out;
}

/** Whether a write failed because the document is already there. */
function alreadyThere(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  return e?.code === 6 || e?.code === "already-exists" || (typeof e?.message === "string" && e.message.includes("ALREADY_EXISTS"));
}

export async function openCheckIn(
  db: Firestore,
  input: { opener: { uid: string }; group: CourseGroupDoc; runId: string; sessionKey: string; people: number; now: Date },
): Promise<OpenOutcome> {
  const { group, runId, now } = input;
  const refuse = (status: number, error: string, extra: { people?: number; retryAfterSeconds?: number } = {}): OpenOutcome => ({
    ok: false,
    status,
    error,
    ...extra,
  });

  // 1. The session.
  const at = await readCheckInSession(db, runId, group, input.sessionKey);
  if (!at) return refuse(400, CHECK_IN_REFUSAL.noSession);
  const { session, window, startsAt, endsAt } = at;
  if (session.cancelled) return refuse(409, CHECK_IN_REFUSAL.notHeld);
  if (!window) return refuse(409, CHECK_IN_REFUSAL.undated);
  const when = windowState(window, now);
  if (when === "early") return refuse(409, CHECK_IN_REFUSAL.early);
  if (when === "past") return refuse(409, CHECK_IN_REFUSAL.past);
  const surveyId = checkInSurveyId(runId, group.id, session.sessionKey);
  const surveyRef = db.collection(SURVEYS_COLLECTION).doc(surveyId);
  if ((await surveyRef.get()).exists) return refuse(409, CHECK_IN_REFUSAL.alreadyOpen);

  // 2. Who it is for: the register's rows (people Publish has told, whoever opens it) its marks say were there.
  const [register, roster] = await Promise.all([
    readRegisterMarks(db, runId, group.id, session),
    loadToldRegisterMembers(db, runId, group.id),
  ]);
  if (!register.held) return refuse(409, CHECK_IN_REFUSAL.notHeld);
  const here = hereOf(register.marks, roster.members, group.facilitatorUids);
  if (here.length === 0) return refuse(409, CHECK_IN_REFUSAL.nobody, { people: 0 });
  if (here.length > MAX_CHECK_IN_PEOPLE) return refuse(400, CHECK_IN_REFUSAL.tooMany, { people: here.length });
  if (here.length !== input.people) return refuse(409, hereChangedWords(here.length), { people: here.length });

  // 3. The programme that names the run.
  const naming = await readNamingProgramme(db, runId);
  const form = naming ? await loadForm(db, naming.roundId) : null;
  const programme = naming && form ? own(form.programmes, naming.programmeId) : undefined;
  if (!naming || !programme) return refuse(409, CHECK_IN_REFUSAL.noProgramme);
  const programmeName = programme.shortName.trim() || programme.name.trim();
  const namesOffOn = await namesOffDayFor(db, runId, now);
  if (!namesOffOn) return refuse(409, CHECK_IN_REFUSAL.noNamesOff);
  if (!siteAddress()) return refuse(503, CHECK_IN_REFUSAL.noAddress);

  const [week, addresses, openerSnap] = await Promise.all([
    readCheckInWeek(db, runId, group.id, session),
    addressesOf(db, here),
    db.collection("users").doc(input.opener.uid).get(),
  ]);
  // The check-in set's words as it opens: a later change to the set never reaches it.
  const items = await checkInSetItems(db, week);
  const signer = openerSnap.exists ? firstNameOfUser((openerSnap.data() ?? {}) as Record<string, unknown>) : "";
  const groupName = group.name.trim() || "Your group";

  // 4. The cap: two a London day for the group, whoever opens them.
  const caps = await reserveNoticeSlots(db, {
    day: { key: `checkinday__${group.id}`, limit: CHECK_INS_PER_DAY, windowMs: DAY_MS },
    noun: "check-ins",
  });
  if (!caps.ok) return refuse(429, caps.refusal ?? CHECK_IN_REFUSAL.inFlight, { retryAfterSeconds: caps.retryAfterSeconds });

  // 5. The claim, with every row, in one batch: created once, or not at all.
  const pressId = randomUUID();
  const audience: CheckInAudience = {
    kind: "checkIn",
    roundId: naming.roundId,
    programmeId: naming.programmeId,
    groupId: group.id,
    sessionKey: session.sessionKey,
    weekNumber: session.weekNumber,
  };
  const rows = here.map((uid) => ({ uid, token: mintSurveyToken() }));
  const batch = db.batch();
  batch.create(surveyRef, {
    kind: "checkIn",
    privacy: "confidential",
    name: checkInName(programmeName, groupName, session.weekNumber),
    title: checkInTitle(session.weekNumber),
    intro: startsAt ? `${groupName}, ${sessionWhenWords(startsAt)}.` : `${groupName}.`,
    items,
    minutes: CHECK_IN_MINUTES,
    audience,
    programmeName,
    programmeKind: naming.kind,
    runId,
    pairOf: null,
    strand: null,
    checkIn: { groupName, startsAt, endsAt },
    closesAt: window.closesAt,
    closedAt: null,
    namesOffOn,
    namesOffAt: null,
    firstSentAt: FieldValue.serverTimestamp(),
    presses: [{ id: pressId, kind: "first", at: now, count: rows.length, byUid: input.opener.uid }],
    reached: 0,
    tests: { survey: null, reminder: null },
    testToken: null,
    createdByUid: input.opener.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  for (const row of rows) {
    batch.set(db.collection(SURVEY_PEOPLE_COLLECTION).doc(surveyPersonId(surveyId, { kind: "account", uid: row.uid })), {
      surveyId,
      roundId: naming.roundId,
      respondent: { kind: "account", uid: row.uid },
      token: row.token,
      pressId,
      // Theirs from now, emailed or not: Home's card and the code open it too.
      sentAt: FieldValue.serverTimestamp(),
      delivery: null,
      remindedAt: null,
      reminders: 0,
      answered: false,
    });
  }
  try {
    await batch.commit();
  } catch (err) {
    if (alreadyThere(err)) return refuse(409, CHECK_IN_REFUSAL.alreadyOpen);
    throw err;
  }

  // 6. The emails: one notice each, with the person's own link.
  const words = checkInEmailWords({
    title: checkInTitle(session.weekNumber),
    groupName,
    startsAt,
    questions: surveyQuestionsOf(items).length,
    minutes: CHECK_IN_MINUTES,
    programmeName,
    closesAt: window.closesAt,
    signer,
  });
  const tally = { sent: 0, held: 0, suppressed: 0, failed: 0, noAddress: 0 };
  await dispatchSends(rows, async (row) => {
    const address = addresses.get(row.uid);
    if (!address) {
      tally.noAddress += 1;
      return;
    }
    let delivery: SurveyDelivery;
    try {
      const result = await sendNotice({
        to: address,
        subject: words.subject,
        surface: "course-check-in",
        actorUid: input.opener.uid,
        referenceId: surveyId,
        replyTo: SURVEY_REPLY_TO,
        fromName: SURVEY_FROM_NAME,
        render: (marker) => SurveyEmail({ ...words, link: surveyLink(row.token) ?? "", notice: marker }),
      });
      delivery = result.held.length > 0 ? "held" : result.suppressed.length > 0 ? "suppressed" : "sent";
    } catch (err) {
      // A uid, never an address or a secret.
      console.error("[check-ins] email failed", surveyId, row.uid, err);
      tally.failed += 1;
      return;
    }
    tally[delivery] += 1;
    await db.collection(SURVEY_PEOPLE_COLLECTION).doc(surveyPersonId(surveyId, { kind: "account", uid: row.uid })).update({ delivery });
  });
  return { ok: true, surveyId, people: rows.length, tally };
}
