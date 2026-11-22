import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { excusedRequestUrl } from "@/lib/email/excusedEmail";
import type { SessionUser } from "@/lib/firebase/session";
import { VISIT_KIND } from "@/lib/firestore/courseMemberRequests";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import { ADMIN_EMAILS_A_DAY, adminsToldTodayIn, askerNameForAdmins, emailAdminsWords } from "../excused/alert";
import { memberSessionChoices, planVisit, readVisitFacts, txReader } from "../visit/plan";
import { offeredWeekOf, standingsOf } from "./own";
import type { VisitAskPress } from "./model";
import { ASK_REFUSAL, newVisitRequestEmailWords } from "./words";

/**
 * ASKING TO GO TO ANOTHER GROUP'S SESSION FOR ONE WEEK: the ask route's work.
 *
 * WHO: the caller about their own place, by their own uid, and only somebody
 * the staff visit could arrange a visit for (`readVisitFacts` as the member).
 * WHICH WEEK: the week of their next session (`offeredWeekOf`), never sent
 * by the page. WHICH SESSION: one the form offers that week
 * (`memberSessionChoices`), with a place, and one the staff visit's own plan
 * would arrange now (`planVisit`), so a request never asks for what its
 * approval would refuse at the moment it is sent.
 *
 * EVERY REFUSAL IS ONE SENTENCE AND WRITES NOTHING: nothing can be asked
 * (no place, no week, a visit standing, their session started, a request to
 * be excused waiting about it); one waiting already ("One request at a
 * time", over their requests of this kind on this run alone); no session
 * chosen; one the form no longer offers; one that has just filled.
 *
 * WHAT IT WRITES: one `courseRequests` document of kind `visit`, in a
 * transaction that reads the facts first (the run, its groups, every active
 * place for the count, the person's requests), so two asks at once cannot
 * both land. Nothing on any register or place. The admins are emailed after
 * the commit, through the alert requests to be excused send, under the same
 * daily cap (`adminsToldOn`, which counts every kind of theirs on the run)
 * and the same switch.
 */

export type VisitAskOutcome =
  | { ok: true; request: { id: string; askedAt: string; weekNumber: number; hostGroupId: string } }
  | { ok: false; status: 404 | 409; error: string };

const refuse = (status: 404 | 409, error: string): VisitAskOutcome => ({ ok: false, status, error });

export async function askForVisit(db: Firestore, user: SessionUser, runId: string, press: VisitAskPress, now: Date): Promise<VisitAskOutcome> {
  const naming = await readNamingProgramme(db, runId);
  const requestRef = db.collection(COURSE_REQUESTS_COLLECTION).doc();
  const todayKey = londonDateKey(now);
  let told: { hostName: string; homeName: string; weekNumber: number; host: { dateKey: string; startTimeLocal: string } } | null = null;
  const outcome = await db.runTransaction(async (tx): Promise<VisitAskOutcome> => {
    told = null;
    const read = await readVisitFacts(txReader(tx), db, runId, user.uid, "ahead", now, "member");
    // Nobody the staff visit could arrange one for: one sentence, whatever the reason.
    if (!read.ok) return refuse(404, ASK_REFUSAL.nothingToAsk);
    const { facts } = read;
    const standings = standingsOf(facts, now);
    if ([...standings.values()].some((standing) => standing.state === "waiting")) return refuse(409, ASK_REFUSAL.alreadyWaiting);
    const week = offeredWeekOf(facts, standings, now);
    if (!week) return refuse(409, ASK_REFUSAL.nothingToAsk);
    const choices = memberSessionChoices(facts, week.weekNumber, now);
    const chosen = choices.find((choice) => choice.groupId === press.hostGroupId) ?? null;
    // No session with a place (none offered at all included): the sentence the form says itself.
    if (!chosen) return refuse(409, choices.every((choice) => choice.full) ? ASK_REFUSAL.noneWithAPlace : ASK_REFUSAL.notOffered);
    if (chosen.full) return refuse(409, choices.every((choice) => choice.full) ? ASK_REFUSAL.noneWithAPlace : ASK_REFUSAL.justFilled);
    // What its approval would ask, now: everything the staff visit refuses is refused here.
    const planned = planVisit(facts, week.weekNumber, press.hostGroupId, user.uid, now);
    if (!planned.ok) return refuse(409, ASK_REFUSAL.notOffered);
    if (planned.plan.overLimit !== null) return refuse(409, ASK_REFUSAL.justFilled);
    const adminsToldToday = await adminsToldTodayIn(tx, db, user.uid, runId, todayKey);
    const tellsAdmins = adminsToldToday < ADMIN_EMAILS_A_DAY;
    const host = planned.plan.hostSession;
    tx.create(requestRef, {
      kind: VISIT_KIND,
      runId: facts.run.id,
      groupId: week.home.id,
      roundId: naming?.roundId ?? null,
      programmeId: naming?.programmeId ?? null,
      sessionKey: week.session.sessionKey,
      weekId: week.session.weekId,
      subjectUid: user.uid,
      askedByUid: user.uid,
      askedAt: now,
      change: {
        weekNumber: week.weekNumber,
        hostGroupId: planned.plan.hostGroupId,
        hostSessionKey: host.sessionKey,
        asked: { dateKey: host.dateKey, startTimeLocal: host.session.startTimeLocal },
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
    told = tellsAdmins
      ? {
          hostName: planned.plan.hostName,
          homeName: planned.plan.homeName,
          weekNumber: week.weekNumber,
          host: { dateKey: host.dateKey, startTimeLocal: host.session.startTimeLocal },
        }
      : null;
    return { ok: true, request: { id: requestRef.id, askedAt: now.toISOString(), weekNumber: week.weekNumber, hostGroupId: planned.plan.hostGroupId } };
  });
  // The admins who decide these are told, once the request is written and
  // outside its transaction: a failed send never fails the ask.
  const written = told as { hostName: string; homeName: string; weekNumber: number; host: { dateKey: string; startTimeLocal: string } } | null;
  if (outcome.ok && written) {
    try {
      const personName = await askerNameForAdmins(db, user.uid);
      await emailAdminsWords(db, {
        runId,
        askerUid: user.uid,
        words: newVisitRequestEmailWords({ personName, hostName: written.hostName, homeName: written.homeName, weekNumber: written.weekNumber, host: written.host, askedAt: now }),
        link: excusedRequestUrl(process.env.NEXT_PUBLIC_APP_URL ?? "", outcome.request.id),
        which: "excused",
      });
    } catch (err) {
      console.error("[visit request email] could not tell the admins", runId, err instanceof Error ? err.message : "unknown");
    }
  }
  return outcome;
}
