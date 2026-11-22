import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { excusedRequestUrl } from "@/lib/email/excusedEmail";
import type { SessionUser } from "@/lib/firebase/session";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import { ACCESS_NEEDS_KIND, ACCESS_TOPIC, TEAM_MESSAGE_KIND, TEAM_MESSAGE_LIMITS } from "@/lib/firestore/courseTeamAsks";
import { ADMIN_EMAILS_A_DAY, adminsToldTodayIn, askerNameForAdmins, emailAdminsWords } from "../excused/alert";
import type { AskPress } from "./model";
import { ASK_REFUSAL, accessNeedsEmailWords, newMessageEmailWords } from "./words";

/**
 * SENDING THE TEAM A MESSAGE: the send route's work.
 *
 * WHO: the caller, by their own uid, as the sender and the person it is
 * about. Nothing in the body names anybody.
 *
 * THE DAILY LIMIT: five messages a person a London day, counted in the send's
 * own transaction from the messages themselves (`askedByUid` and `askedOn`,
 * two equalities merged from the automatic single-field indexes), so the
 * count is durable, kept on the server and gone with the account. A sixth is
 * refused in one sentence and writes nothing.
 *
 * WHAT IT WRITES: one `courseRequests` document of kind `team-message` that
 * belongs to no run (`src/lib/firestore/courseTeamAsks.ts`).
 *
 * WHO IS TOLD: each admin who switched on "Email me about messages to the
 * team" (`requestEmails.team`, off unless a stored true), never the sender,
 * after the commit and outside the transaction, through the alert requests
 * to be excused send (`emailAdminsWords`). Under the same daily cap as every
 * other kind: the first three messages by one person in one London day
 * (`adminsToldTodayIn` with no run, which only these messages have) email
 * the admins, and later ones that day wait on the Requests page. NEVER what
 * they wrote.
 *
 * ACCESS NEEDS go through here too, from the access form alone (`topic:
 * "access"`): one document of kind `access-needs`, holding what would help
 * and the tick, counted under the same daily limit and the same cap, and the
 * admins' email says only that somebody sent one and when, and that opening
 * it is recorded: not who, because its subject is kept in the email log. The
 * answer is the id and the time, as for a message: never the words, which
 * nothing but `./openAccessNeeds.ts` reads back.
 */

export type TeamAskOutcome = { ok: true; request: { id: string; askedAt: string } } | { ok: false; status: 429; error: string };

/** One person's messages counted for the daily limit: one more than the limit is enough to know. */
const READ_FOR_LIMIT = TEAM_MESSAGE_LIMITS.aDay + 1;

export async function sendTeamMessage(db: Firestore, user: SessionUser, press: AskPress, now: Date): Promise<TeamAskOutcome> {
  const requestRef = db.collection(COURSE_REQUESTS_COLLECTION).doc();
  const todayKey = londonDateKey(now);
  let tellsAdmins = false;
  const outcome = await db.runTransaction(async (tx): Promise<TeamAskOutcome> => {
    tellsAdmins = false;
    const today = await tx.get(
      db.collection(COURSE_REQUESTS_COLLECTION).where("askedByUid", "==", user.uid).where("askedOn", "==", todayKey).limit(READ_FOR_LIMIT),
    );
    // Messages and access asks share the limit: both are things sent to the team.
    const sentToday = today.docs.filter((doc) => {
      const kind = doc.data()?.kind;
      return kind === TEAM_MESSAGE_KIND || kind === ACCESS_NEEDS_KIND;
    }).length;
    if (sentToday >= TEAM_MESSAGE_LIMITS.aDay) return { ok: false, status: 429, error: ASK_REFUSAL.tooMany };
    const adminsToldToday = await adminsToldTodayIn(tx, db, user.uid, "", todayKey);
    tellsAdmins = adminsToldToday < ADMIN_EMAILS_A_DAY;
    const access = press.topic === ACCESS_TOPIC;
    tx.create(requestRef, {
      kind: access ? ACCESS_NEEDS_KIND : TEAM_MESSAGE_KIND,
      runId: "",
      groupId: "",
      roundId: null,
      programmeId: null,
      sessionKey: "",
      weekId: "",
      subjectUid: user.uid,
      askedByUid: user.uid,
      askedAt: now,
      askedOn: todayKey,
      change:
        press.topic === ACCESS_TOPIC
          ? { words: press.words, tellFacilitator: press.tellFacilitator, replies: [] }
          : { topic: press.topic, words: press.words, replies: [] },
      ...(tellsAdmins ? { adminsToldOn: todayKey } : {}),
      status: "waiting",
      handlingUid: null,
      handlingAt: null,
      decidedByUid: null,
      decidedAt: null,
      reply: "",
      history: [{ what: "asked", byUid: user.uid, at: now }],
      updatedAt: now,
    });
    return { ok: true, request: { id: requestRef.id, askedAt: now.toISOString() } };
  });
  // The admins who switched it on are told, once the message is written and
  // outside its transaction: a failed send never fails the message.
  if (outcome.ok && tellsAdmins) {
    try {
      // An access ask's alert names nobody (its subject is kept in the email log), so no name is read for it,
      // and the log's own row for the send carries no actor (`namesNobody`).
      const personName = press.topic === ACCESS_TOPIC ? "" : await askerNameForAdmins(db, user.uid);
      await emailAdminsWords(db, {
        runId: "",
        askerUid: user.uid,
        words:
          press.topic === ACCESS_TOPIC
            ? accessNeedsEmailWords({ askedAt: now, now })
            : newMessageEmailWords({ personName, topic: press.topic, askedAt: now, now }),
        link: excusedRequestUrl(process.env.NEXT_PUBLIC_APP_URL ?? "", outcome.request.id),
        which: "team",
        namesNobody: press.topic === ACCESS_TOPIC,
      });
    } catch (err) {
      console.error("[team message email] could not tell the admins", err instanceof Error ? err.message : "unknown");
    }
  }
  return outcome;
}
