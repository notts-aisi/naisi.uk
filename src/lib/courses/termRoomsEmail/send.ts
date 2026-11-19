import "server-only";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { render } from "@react-email/render";
import NoticeMarker from "@/emails/NoticeMarker";
import WeekEmail from "@/emails/WeekEmail";
import { groupHistoryRow } from "@/lib/courses/groupChange/facts";
import { firstNameOfUser, readNamingProgramme } from "@/lib/courses/programmeLead";
import { updateEmailAudience } from "@/lib/courses/updates/audience";
import { UPDATE_REPLY_TO } from "@/lib/courses/updates/words";
import type { WeekEmailWords } from "@/lib/courses/weekEmails/words";
import { resolveNoticeAudience } from "@/lib/email/courseFacilitatorEmails";
import { courseProgrammeUrl } from "@/lib/email/courseNudgeEmail";
import { dispatchSends } from "@/lib/email/dispatch";
import { sendNotice } from "@/lib/email/notice";
import { noticeSlotsIn, noticeSlotsRefusal } from "@/lib/email/noticeCaps";
import type { SessionUser } from "@/lib/firebase/session";
import { firstWord } from "@/lib/firestore/applicationEmails";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { normalizeCourseEnrolment, placementIsTold, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { termRoomsWindows } from "./limits";
import { TERM_ROOMS_RECORD_KIND, termRoomsRecordId } from "./record";
import { emailGroupName, linesForPlace, noEmailWhy, sessionsStillToCome, weeksOf, type NoEmailWhy, type TermRoomsSession } from "./model";
import { ALREADY_SENT, NO_EMAIL, REFUSAL, countChangedWords, historyWords, sentWords, termRoomsEmailWords } from "./words";

/**
 * A GROUP'S ROOMS FOR THE REST OF TERM, EMAILED BY HAND: who it goes to, the
 * preview the dialog shows, and the press. The route
 * (`/api/courses/groups/[groupId]/rooms-email`) gates; this reads, claims,
 * records and sends.
 *
 * ── WHO ─────────────────────────────────────────────────────────────────────
 * The group's own people, as every notice to a group finds them
 * (`resolveNoticeAudience`: an active learner's place Publish has told, at
 * the address their cohort row holds or else their account's own, deduped,
 * the do-not-email list applied, whatever they unsubscribed from), narrowed
 * to the places that BELONG to the group in at least one week of a session
 * still to come (`belongingInWeeks`), each with the lines of their own weeks
 * (`./model.ts`); and the group's facilitators who still meet their bar,
 * with every line. Never the presser. Nobody placed and not yet told,
 * nobody who left, nobody only visiting the group for a week.
 *
 * ── A NOTICE ────────────────────────────────────────────────────────────────
 * The people running the programme telling the people on it where it meets
 * (docs/notifications.md): sent through `sendNotice` on the `course-group`
 * surface, the room-change notice's own, so its marker line is the one that
 * email already carries ("you are in this course group") and its receipt is
 * `kind: "notice"`. One message per address. Never a meeting link: a line
 * says a room, "online" or "room to be confirmed", and a link typed as a room
 * is "room to be confirmed".
 *
 * ── THE PRESS, ONCE ─────────────────────────────────────────────────────────
 * The count on the button is worked out again first, and a difference is a
 * 409 with the new count and nothing sent. Then ONE transaction reads the
 * group's record of its last rooms email (`./record.ts`)
 * and both limits (`./limits.ts`): a press carrying the key of the press the
 * record already holds is the same press again (a double press, a retried
 * request) and sends nothing; a limit met refuses (429) and claims nothing.
 * Otherwise the transaction claims both limits, writes the record and the
 * group's History row, and only then do the emails go. A send that fails for
 * somebody is counted and reported, the History row and the record are
 * brought to what really went (a press that reached nobody is not the
 * group's last email: the page goes back to the one before it), and nothing
 * is retried by itself.
 */

/** The surface the email goes on: the room-change notice's own. */
const SURFACE = "course-group" as const;

export type TermRoomsRecipient = {
  uid: string;
  address: string;
  /** For the greeting: "" when the account gives no name. */
  firstName: string;
  lines: string[];
  facilitator: boolean;
};

export type TermRoomsPlan =
  | { ok: false; why: NoEmailWhy | "nobody" | "overCap"; sessions: number }
  | {
      ok: true;
      groupName: string;
      sessions: TermRoomsSession[];
      recipients: TermRoomsRecipient[];
      programmeUrl: string;
    };

/** The sentence a group with no email is answered with. */
export function noEmailWords(why: NoEmailWhy | "nobody" | "overCap"): string {
  return why === "overCap" ? REFUSAL.overCap : NO_EMAIL[why];
}

/**
 * The run's active places by uid, for whose weeks are whose. One equality on
 * `runId` and `status`. Only a place Publish has told: the audience above
 * already leaves the rest out, and a place nobody has told gives nobody a line.
 */
async function placesOf(db: Firestore, runId: string): Promise<Map<string, CourseEnrolmentDoc>> {
  const snap = await db.collection("courseEnrolments").where("runId", "==", runId).where("status", "==", "active").get();
  const out = new Map<string, CourseEnrolmentDoc>();
  for (const doc of snap.docs) {
    const place = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
    if (place.runId === runId && place.uid && placementIsTold(place)) out.set(place.uid, place);
  }
  return out;
}

/** WHO THE GROUP'S ROOMS EMAIL GOES TO NOW, AND WHAT EACH ONE'S SAYS, for the presser `writerUid`. */
export async function planTermRoomsEmail(
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc; writerUid: string; now: Date },
): Promise<TermRoomsPlan> {
  const { run, group, writerUid, now } = input;
  const naming = await readNamingProgramme(db, run.id);
  const sessions = sessionsStillToCome(run, group, now);
  const why = noEmailWhy({ incubator: naming?.kind === "incubator", group, sessions });
  if (why) return { ok: false, why, sessions: sessions.length };

  const audience = await resolveNoticeAudience(
    db,
    run.id,
    { logTag: "courses term rooms email", overCapAdvice: "ask an admin" },
    { groupId: group.id, belongingInWeeks: weeksOf(sessions) },
  );
  if (audience.refusal) return { ok: false, why: "overCap", sessions: sessions.length };
  const places = audience.members.length > 0 ? await placesOf(db, run.id) : new Map<string, CourseEnrolmentDoc>();

  const recipients: TermRoomsRecipient[] = [];
  const uids = new Set<string>();
  const addresses = new Set<string>();
  for (const member of audience.members) {
    if (member.uid === writerUid) continue;
    const place = places.get(member.uid);
    const lines = place ? linesForPlace(place, group.id, sessions) : [];
    if (lines.length === 0) continue;
    uids.add(member.uid);
    addresses.add(member.address.toLowerCase());
    recipients.push({ uid: member.uid, address: member.address, firstName: firstWord(member.ownName), lines, facilitator: false });
  }

  // The group's facilitators who still meet their bar, never the presser, each once.
  const facilitators = await updateEmailAudience(db, run, [group], "facilitators", null, writerUid);
  const fresh = facilitators.recipients.filter((each) => !uids.has(each.uid) && !addresses.has(each.address.toLowerCase()));
  const accounts = fresh.length > 0 ? await db.getAll(...fresh.map((each) => db.collection("users").doc(each.uid))) : [];
  const nameOf = new Map(accounts.map((snap) => [snap.id, snap.exists ? firstNameOfUser((snap.data() ?? {}) as Record<string, unknown>) : ""]));
  for (const each of fresh) {
    if (uids.has(each.uid) || addresses.has(each.address.toLowerCase())) continue;
    uids.add(each.uid);
    addresses.add(each.address.toLowerCase());
    recipients.push({
      uid: each.uid,
      address: each.address,
      firstName: nameOf.get(each.uid) ?? "",
      lines: sessions.map((session) => session.line),
      facilitator: true,
    });
  }
  if (recipients.length === 0) return { ok: false, why: "nobody", sessions: sessions.length };

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  return { ok: true, groupName: emailGroupName(group), sessions, recipients, programmeUrl: courseProgrammeUrl(appUrl, run.id) };
}

/** One person's words. */
export function wordsFor(plan: Extract<TermRoomsPlan, { ok: true }>, recipient: TermRoomsRecipient): WeekEmailWords {
  return termRoomsEmailWords({ groupName: plan.groupName, firstName: recipient.firstName, lines: recipient.lines, programmeUrl: plan.programmeUrl });
}

/** The person the preview shows: the first holding a place with every line, else the first of all. */
function sampleOf(plan: Extract<TermRoomsPlan, { ok: true }>): TermRoomsRecipient {
  return plan.recipients.find((each) => !each.facilitator && each.lines.length === plan.sessions.length) ?? plan.recipients[0];
}

export type TermRoomsPreview = {
  /** How many it goes to: the number on the button, and the number the press is held to. */
  emails: number;
  /** Sessions still to come. */
  sessions: number;
  /** People with fewer lines than the group has sessions: they move group part way through. */
  fewer: number;
  /** One email exactly as it goes, with the first name it greets. Null when none goes. */
  sample: { firstName: string; subject: string; html: string } | null;
  /** Why no email goes, in one staff-facing sentence; null when one does. */
  none: string | null;
  /** The limit a press would meet now, in its sentence; null while there is room. */
  limit: string | null;
};

/** THE PREVIEW: who it goes to, one email as it goes, and the limit a press would meet. Sends and writes nothing. */
export async function previewTermRoomsEmail(
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc; actor: SessionUser; now: Date },
): Promise<TermRoomsPreview> {
  const plan = await planTermRoomsEmail(db, { run: input.run, group: input.group, writerUid: input.actor.uid, now: input.now });
  if (!plan.ok) return { emails: 0, sessions: plan.sessions, fewer: 0, sample: null, none: noEmailWords(plan.why), limit: null };
  let limit: string | null;
  try {
    const refused = await noticeSlotsRefusal(db, { windows: termRoomsWindows(input.group, input.actor.uid), noun: "emails" });
    limit = refused ? (refused.refusal ?? REFUSAL.unread) : null;
  } catch (err) {
    console.error("[courses term rooms email] limits read failed", input.group.id, err);
    limit = REFUSAL.unread;
  }
  const sample = sampleOf(plan);
  const words = wordsFor(plan, sample);
  const html = await render(WeekEmail({ words, notice: NoticeMarker({ surface: SURFACE }) }));
  return {
    emails: plan.recipients.length,
    sessions: plan.sessions.length,
    fewer: plan.recipients.filter((each) => each.lines.length < plan.sessions.length).length,
    sample: { firstName: sample.firstName, subject: words.subject, html },
    none: null,
    limit,
  };
}

export type TermRoomsTally = { planned: number; sent: number; held: number; suppressed: number; failed: number };

export type TermRoomsAnswer = { status: number; body: Record<string, unknown>; headers?: Record<string, string> };

class Refused extends Error {
  constructor(
    readonly answer: TermRoomsAnswer,
  ) {
    super("refused");
  }
}

/** THE PRESS: the count again, then one transaction for the record, the limits and History, then the emails. */
export async function pressTermRoomsEmail(
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc; actor: SessionUser; emailCount: number; pressKey: string; now: Date },
): Promise<TermRoomsAnswer> {
  const { run, group, actor, pressKey } = input;
  const plan = await planTermRoomsEmail(db, { run, group, writerUid: actor.uid, now: input.now });
  if (!plan.ok) return { status: 409, body: { error: noEmailWords(plan.why), emails: 0 } };
  if (plan.recipients.length !== input.emailCount) {
    return { status: 409, body: { error: countChangedWords(plan.recipients.length), emails: plan.recipients.length } };
  }

  const recordRef = db.collection("courseNudges").doc(termRoomsRecordId(group.id));
  const groupRef = db.collection("courseGroups").doc(group.id);
  const auditRef = db.collection(COURSE_AUDIT_COLLECTION).doc();
  const planned = plan.recipients.length;
  try {
    await db.runTransaction(async (tx) => {
      const [recordSnap, groupSnap] = await Promise.all([tx.get(recordRef), tx.get(groupRef)]);
      const now = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
      if (!now || now.archived || now.runId !== run.id) throw new Refused({ status: 400, body: { error: REFUSAL.gone } });
      const record = recordSnap.exists ? (recordSnap.data() ?? {}) : {};
      // The same press again: it went once, and nothing goes now.
      if (record.pressKey === pressKey) {
        throw new Refused({ status: 200, body: { ok: true, already: true, said: ALREADY_SENT, emailed: null } });
      }
      const limits = await noticeSlotsIn(tx, db, { windows: termRoomsWindows(group, actor.uid), noun: "emails" });
      if (limits.refusal) {
        throw new Refused({
          status: 429,
          body: { error: limits.refusal.refusal ?? REFUSAL.unread },
          headers: { "Retry-After": String(limits.refusal.retryAfterSeconds) },
        });
      }
      limits.write();
      const at = Timestamp.fromMillis(Date.now());
      tx.set(recordRef, {
        kind: TERM_ROOMS_RECORD_KIND,
        runId: run.id,
        groupId: group.id,
        pressKey,
        at,
        auditId: auditRef.id,
        planned,
        sent: planned,
        // What the page says ("Last emailed ..."): this press, until its sends say otherwise.
        emailedAt: at,
        emailedAuditId: auditRef.id,
        // The last press that reached anybody before this one, put back if nothing of this one goes.
        priorEmailedAt: record.emailedAt ?? null,
        priorEmailedAuditId: typeof record.emailedAuditId === "string" ? record.emailedAuditId : null,
      });
      tx.set(
        auditRef,
        groupHistoryRow({
          kind: "rooms-emailed",
          run,
          group,
          actor,
          detail: historyWords(plan.groupName, plan.sessions.length, planned),
          emailed: planned,
        }),
      );
    });
  } catch (err) {
    if (err instanceof Refused) return err.answer;
    // Fail closed: a limit that cannot be read is no licence to send.
    console.error("[courses term rooms email] the press failed", group.id, err);
    return { status: 500, body: { error: REFUSAL.failed } };
  }

  const tally: TermRoomsTally = { planned, sent: 0, held: 0, suppressed: 0, failed: 0 };
  await dispatchSends(plan.recipients, async (recipient) => {
    try {
      const words = wordsFor(plan, recipient);
      // ONE address. One message.
      const result = await sendNotice({
        to: recipient.address,
        subject: words.subject,
        surface: SURFACE,
        actorUid: actor.uid,
        referenceId: group.id,
        replyTo: UPDATE_REPLY_TO,
        render: (notice) => WeekEmail({ words, notice }),
      });
      if (result.held.length > 0) tally.held += 1;
      else if (result.suppressed.length > 0) tally.suppressed += 1;
      else tally.sent += 1;
    } catch (err) {
      // A uid, never an address. Not tried again: the report says it didn't go.
      console.error("[courses term rooms email] send failed", group.id, recipient.uid, err);
      tally.failed += 1;
    }
  });

  if (tally.sent !== planned) {
    // History and the record say what really went. A press that reached nobody is not the group's last email:
    // the page goes back to the one before it, or to "Not emailed its rooms yet." with none.
    const recordFix: Record<string, unknown> = { sent: tally.sent };
    if (tally.sent === 0) {
      try {
        const now = (await recordRef.get()).data() ?? {};
        recordFix.emailedAt = now.priorEmailedAt ?? null;
        recordFix.emailedAuditId = typeof now.priorEmailedAuditId === "string" ? now.priorEmailedAuditId : null;
      } catch (err) {
        console.error("[courses term rooms email] could not read the record back", group.id, err);
        recordFix.emailedAt = null;
        recordFix.emailedAuditId = null;
      }
    }
    try {
      await Promise.all([
        auditRef.update({ emailed: tally.sent, detail: historyWords(plan.groupName, plan.sessions.length, tally.sent) }),
        recordRef.update(recordFix),
      ]);
    } catch (err) {
      console.error("[courses term rooms email] could not record what the email did", group.id, err);
    }
  }
  return { status: 200, body: { ok: true, already: false, said: sentWords(tally), emailed: tally } };
}
