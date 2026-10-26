import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { own } from "@/lib/applications/keys";
import { applicationRef, loadForm } from "@/lib/applications/repo";
import { normaliseApplication } from "@/lib/applications/normalise";
import { standingOf } from "@/lib/applications/status/standing";
import { enrolmentRefsFor, writeFacilitatorChange, type AppointmentRecord } from "@/lib/courses/groupFacilitators";
import type { SessionUser } from "@/lib/firebase/session";
import { GROUP_FIELD_LIMITS, normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { FACILITATING_COLLECTION, normalizeAsk, type AskAnswer, type FacilitatorAsk } from "./model";
import { askStateOf, isApprovedRole, takesPartIn } from "./rules";
import {
  NOT_AN_ASK,
  NO_LONGER_OPEN,
  TOO_MANY_FACILITATORS,
  clockIn,
  dayIn,
  lateWords,
  seatGoneWords,
  takingPartNowWords,
} from "./words";

/**
 * THE ANSWER TO AN ASK, from the person asked and nobody else: "Yes, I’ll
 * facilitate" or "I can’t this term" on their own page (st-fac-ask-phone).
 *
 * One transaction reads the ask, every ask of its run, the group, the run and
 * the person's own application and row on the run, and writes the answer.
 *
 *  - YES puts them on the group as a facilitator through
 *    `writeFacilitatorChange` (`src/lib/courses/groupFacilitators.ts`), the
 *    one place a group's facilitators change, in the same transaction, with
 *    the appointment record its slot was made for: who asked, when, and that
 *    they agreed. Nothing is emailed: groups going out (Publish) tells them
 *    their group, as it tells everybody.
 *  - NO is recorded, and the lead can ask somebody else.
 *
 * REFUSED, each with a sentence and nothing written: an answer after the day
 * and time to answer by; an ask somebody else has already taken the place
 * of; a second answer; a yes from somebody taking part in the programme, or
 * invited to it (Q21); a yes to a group that has gone, or that has as many
 * facilitators as a group can have. An ask that is not the caller's own is
 * "There is no ask here", the same as one that does not exist, so a guessed
 * address learns nothing.
 *
 * It reads no review, no decision and no other person's application: it
 * serves the person asked.
 */

export type AnswerRefusal = { ok: false; status: 403 | 404 | 409; error: string };

const refuse = (status: AnswerRefusal["status"], error: string): AnswerRefusal => ({ ok: false, status, error });

/** The name the record keeps of who asked: their account's name, or "" once it is gone. */
async function askerName(db: Firestore, uid: string): Promise<string> {
  if (!uid) return "";
  const snap = await db.collection("users").doc(uid).get();
  const name = snap.exists ? snap.data()?.displayName : null;
  return typeof name === "string" ? name.trim().slice(0, GROUP_FIELD_LIMITS.appointedByName) : "";
}

export async function answerAsk(
  db: Firestore,
  actor: SessionUser,
  askId: string,
  answer: AskAnswer,
  now: Date,
): Promise<{ ok: true; answer: AskAnswer } | AnswerRefusal> {
  const first = await db.collection(FACILITATING_COLLECTION).doc(askId).get();
  const seen = first.exists ? normalizeAsk(first.id, first.data() as Record<string, unknown>) : null;
  // Not theirs reads as not there.
  if (!seen || seen.uid !== actor.uid) return refuse(404, NOT_AN_ASK);
  if (!isApprovedRole(actor.role)) return refuse(403, "Only an approved account can facilitate.");
  const [byName, form] = await Promise.all([
    answer === "yes" ? askerName(db, seen.askedByUid) : Promise.resolve(""),
    loadForm(db, seen.roundId),
  ]);
  const shortName = (form ? own(form.programmes, seen.programmeId)?.shortName : undefined) ?? "this programme";

  return db.runTransaction(async (tx) => {
    const askRef = db.collection(FACILITATING_COLLECTION).doc(askId);
    const groupRef = db.collection("courseGroups").doc(seen.groupId);
    const [askSnap, runAsksSnap, groupSnap, runSnap, applicationSnap] = await Promise.all([
      tx.get(askRef),
      tx.get(db.collection(FACILITATING_COLLECTION).where("runId", "==", seen.runId)),
      tx.get(groupRef),
      tx.get(db.collection("courseRuns").doc(seen.runId)),
      tx.get(applicationRef(db, seen.roundId, actor.uid)),
    ]);
    const ask = askSnap.exists ? normalizeAsk(askSnap.id, askSnap.data() as Record<string, unknown>) : null;
    if (!ask || ask.uid !== actor.uid) return refuse(404, NOT_AN_ASK);
    const runAsks: FacilitatorAsk[] = [];
    for (const doc of runAsksSnap.docs) {
      const read = normalizeAsk(doc.id, doc.data() as Record<string, unknown>);
      if (read && read.runId === ask.runId) runAsks.push(read);
    }

    const state = askStateOf(ask, runAsks, now);
    const group = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
    const groupName = group?.name.trim() || "the group";
    if (state.kind === "yes" || state.kind === "no") return refuse(409, "You’ve answered this already.");
    if (state.kind === "taken") return refuse(409, seatGoneWords(groupName));
    if (state.kind === "late") {
      return refuse(409, lateWords(dayIn(ask.replyBy.dateKey) ?? "", clockIn(ask.replyBy.time) ?? ""));
    }
    if (!group || group.runId !== ask.runId || group.archived) return refuse(409, NO_LONGER_OPEN);
    if (!runSnap.exists || runSnap.data()?.destroying === true) return refuse(409, NO_LONGER_OPEN);

    if (answer === "no") {
      tx.update(askRef, { answer: "no", answeredAt: FieldValue.serverTimestamp() });
      return { ok: true as const, answer };
    }

    // Q21: never a facilitator of a programme they take part in, or may yet.
    const application = applicationSnap.exists
      ? normaliseApplication(applicationSnap.id, applicationSnap.data())
      : null;
    if (application && takesPartIn(standingOf(application), ask.programmeId)) {
      return refuse(409, takingPartNowWords(shortName));
    }
    const [enrolment] = await tx.getAll(...enrolmentRefsFor(db, ask.runId, [actor.uid]));
    const row = enrolment?.exists ? (enrolment.data() ?? {}) : null;
    if (row && row.role === "learner" && row.status === "active") return refuse(409, takingPartNowWords(shortName));

    // Every question is asked before anything is written.
    const current = [...group.facilitatorUids];
    const already = current.includes(actor.uid);
    if (!already && current.length >= GROUP_FIELD_LIMITS.maxFacilitators) return refuse(409, TOO_MANY_FACILITATORS);

    tx.update(askRef, { answer: "yes", answeredAt: FieldValue.serverTimestamp() });
    if (already) return { ok: true as const, answer };
    const agreed = new Map<string, AppointmentRecord>([[actor.uid, { byUid: ask.askedByUid, byName }]]);
    writeFacilitatorChange(tx, db, {
      groupRef,
      runId: ask.runId,
      courseId: group.courseId,
      current,
      next: [...current, actor.uid],
      enrolments: new Map([[actor.uid, enrolment]]),
      recorded: new Set(Object.keys(group.facilitatorAppointments)),
      agreed,
    });
    return { ok: true as const, answer };
  });
}
