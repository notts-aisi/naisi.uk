import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { excusedRequestUrl } from "@/lib/email/excusedEmail";
import type { SessionUser } from "@/lib/firebase/session";
import { MOVE_KIND } from "@/lib/firestore/courseMemberRequests";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import { ADMIN_EMAILS_A_DAY, adminsToldTodayIn, askerNameForAdmins, emailAdminsWords } from "../excused/alert";
import { aRequestWaits } from "../requests/oneAtATime";
import { txReader } from "../visit/plan";
import { ASK_REFUSAL } from "../visitRequest/words";
import { choiceStateOf, groupsWithAPlace, readChangeFacts } from "./facts";
import type { MoveAskPress } from "./model";
import { placeRecordKey } from "./standing";
import { MOVE_ASK_REFUSAL, newMoveRequestEmailWords } from "./words";

/**
 * ASKING TO CHANGE GROUP FOR THE REST OF THE PROGRAMME: the ask route's work.
 *
 * WHO: the caller about their own place, by their own uid, and only somebody
 * the staff move could move (`readChangeFacts`). WHICH GROUP: one the form
 * offers ("Groups with a place", the staff move's own count of places now),
 * never the week, which the staff move's rule decides at the approval.
 *
 * EVERY REFUSAL IS ONE SENTENCE AND WRITES NOTHING: nothing can be asked (no
 * place a move takes, an incubator, a group they facilitate, no session left
 * to move from); one request waiting already, of this kind or a request to go
 * to another session ("One request at a time", `../requests/oneAtATime.ts`);
 * no group chosen; one the form does not offer; one that has just filled
 * (every one full: the sentence the form says itself).
 *
 * WHAT IT WRITES: one `courseRequests` document of kind `move`, in a
 * transaction that reads the facts first (the run, its groups, the place, the
 * person's requests), so two asks at once, of either kind, cannot both land.
 * Nothing on the place, a group or a register. The admins are emailed after
 * the commit through the one alert function, under the same daily cap
 * (`adminsToldOn`) and the same switch as every request of theirs.
 */

export type MoveAskOutcome =
  | { ok: true; request: { id: string; askedAt: string; toGroupId: string } }
  | { ok: false; status: 404 | 409; error: string };

const refuse = (status: 404 | 409, error: string): MoveAskOutcome => ({ ok: false, status, error });

export async function askToChangeGroup(db: Firestore, user: SessionUser, runId: string, press: MoveAskPress, now: Date): Promise<MoveAskOutcome> {
  const naming = await readNamingProgramme(db, runId).catch(() => null);
  const requestRef = db.collection(COURSE_REQUESTS_COLLECTION).doc();
  const todayKey = londonDateKey(now);
  let told: { fromName: string; toName: string } | null = null;
  const outcome = await db.runTransaction(async (tx): Promise<MoveAskOutcome> => {
    told = null;
    const read = await readChangeFacts(txReader(tx), db, runId, user.uid, now, { names: false });
    // Nobody the staff move could move: one sentence, whatever the reason.
    if (!read.ok) return refuse(404, MOVE_ASK_REFUSAL.nothingToAsk);
    const { facts } = read;
    // One request at a time, across kinds.
    if (aRequestWaits(facts.visitStandings.values(), facts.moveStandings.values())) return refuse(409, ASK_REFUSAL.alreadyWaiting);
    if (!facts.movable) return refuse(409, MOVE_ASK_REFUSAL.nothingToAsk);
    const offered = groupsWithAPlace(facts);
    const state = choiceStateOf(facts, press.toGroupId);
    if (state !== "offered") {
      if (offered.length === 0) return refuse(409, MOVE_ASK_REFUSAL.noneWithAPlace);
      return refuse(409, state === "full" ? MOVE_ASK_REFUSAL.justFilled : MOVE_ASK_REFUSAL.notOffered);
    }
    const to = facts.groups.find((group) => group.id === press.toGroupId);
    const adminsToldToday = await adminsToldTodayIn(tx, db, user.uid, runId, todayKey);
    const tellsAdmins = adminsToldToday < ADMIN_EMAILS_A_DAY;
    tx.create(requestRef, {
      kind: MOVE_KIND,
      runId: facts.run.id,
      groupId: facts.from.id,
      roundId: naming?.roundId ?? null,
      programmeId: naming?.programmeId ?? null,
      sessionKey: "",
      weekId: "",
      subjectUid: user.uid,
      askedByUid: user.uid,
      askedAt: now,
      change: {
        toGroupId: press.toGroupId,
        fromWeek: null,
        recordAsked: placeRecordKey(facts.place),
        replies: [],
      },
      reason: press.reason,
      ...(tellsAdmins ? { adminsToldOn: todayKey } : {}),
      status: "waiting",
      handlingUid: null,
      handlingAt: null,
      decidedByUid: null,
      decidedAt: null,
      withdrawnAt: null,
      dismissedAt: null,
      reply: "",
      history: [{ what: "asked", byUid: user.uid, at: now }],
      updatedAt: now,
    });
    told = tellsAdmins ? { fromName: facts.from.name, toName: to?.name ?? "" } : null;
    return { ok: true, request: { id: requestRef.id, askedAt: now.toISOString(), toGroupId: press.toGroupId } };
  });
  // The admins who decide these are told, once the request is written and
  // outside its transaction: a failed send never fails the ask.
  const written = told as { fromName: string; toName: string } | null;
  if (outcome.ok && written) {
    try {
      const personName = await askerNameForAdmins(db, user.uid);
      await emailAdminsWords(db, {
        runId,
        askerUid: user.uid,
        words: newMoveRequestEmailWords({ personName, fromName: written.fromName, toName: written.toName, askedAt: now }),
        link: excusedRequestUrl(process.env.NEXT_PUBLIC_APP_URL ?? "", outcome.request.id),
        which: "excused",
      });
    } catch (err) {
      console.error("[move request email] could not tell the admins", runId, err instanceof Error ? err.message : "unknown");
    }
  }
  return outcome;
}
