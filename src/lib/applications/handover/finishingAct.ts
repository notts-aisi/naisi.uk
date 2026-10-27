import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { CERTIFICATES_COLLECTION, certificateId } from "@/lib/courses/certificates/model";
import { certificateHolds, ruleWouldUntick } from "@/lib/courses/certificates/words";
import {
  FINISHING_COLLECTION,
  finishDecisionId,
  finishRuleId,
  normalizeFinishDecision,
  normalizeFinishRule,
  type FinishDecision,
} from "@/lib/courses/finishing/model";
import { recordOf, runEndOf, suggestedBy } from "@/lib/courses/finishing/record";
import { loadWhoFinished, type WhoFinishedModel } from "@/lib/courses/finishing/whoFinished";
import {
  LEADS_AND_ADMINS,
  NOT_ON_THE_LIST,
  NO_PROGRAMME,
  OWN_FINISHED,
  NO_RUN,
  RUN_GONE,
  leftTheProgramme,
  moreThanItHolds,
  notOverYet,
} from "@/lib/courses/finishing/words";
import { listGroups, readRunRecords, weeksOf, type RunRecords } from "@/lib/courses/programmeAttendance";
import type { SessionUser } from "@/lib/firebase/session";
import { loadProgrammeRun, type ProgrammeRunView } from "./programmeRun";

/**
 * SAYING WHO FINISHED: the one writer of `courseFinishing` besides the two
 * deletion cascades (`src/lib/courses/finishing/model.ts` says what is
 * stored).
 *
 * Two things, each the programme's lead's or an admin's, decided from the
 * form before the run is read (`loadProgrammeRun`, which holds a lead to the
 * lead's bar at the point of use):
 *
 *  - SET THE RULE: the least number of sessions a person must have come to,
 *    or none. Any time, before the end or after it. A number above the most
 *    sessions any of the run's groups is due to hold is refused, since nobody
 *    could meet it.
 *  - DECIDE ONE PERSON, once the run's last session is over: their switch on
 *    the Overview. Where the switch now says what the suggestion says, any
 *    stored decision is removed and the suggestion decides again; otherwise
 *    the decision is stored with who pressed it and when. Somebody who left,
 *    or who is nobody on the viewer's list, is refused, and so is the
 *    caller's own switch, whoever the caller is.
 *
 * NOBODY SENT A CERTIFICATE FOR FINISHING STOPS BEING FINISHED while it
 * stands (`courseCertificates`, src/lib/courses/certificates/): neither their
 * switch nor a stricter rule may untick them, so the record and the
 * certificate never say different things. Each is checked inside the write,
 * so a certificate made at the same moment is seen.
 *
 * Every refusal is a sentence the lead can act on, and writes nothing. Nobody
 * is emailed, and nothing here is shown to a member but their own record.
 */

export type FinishingRefusal = { ok: false; status: 403 | 404 | 409; error: string };

const refuse = (status: FinishingRefusal["status"], error: string): FinishingRefusal => ({ ok: false, status, error });

/** What the Settings card shows of the rule. */
export type FinishRuleView = {
  /** The rule's number, or null while the run has none. */
  atLeast: number | null;
  /** The most sessions any of the run's groups is due to hold, or null while it cannot say. */
  sessions: number | null;
};

type Context = { ok: true; view: ProgrammeRunView & { run: { id: string; courseId: string } }; records: RunRecords };

/** The gate, then the run the programme names and its records. */
async function finishingContext(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
): Promise<Context | FinishingRefusal> {
  const outcome = await loadProgrammeRun(db, actor, roundId, programmeId);
  if (outcome.status === "none") return refuse(404, NO_PROGRAMME);
  if (outcome.status === "not-yours") return refuse(403, LEADS_AND_ADMINS);
  const { view } = outcome;
  if (!view.run) return refuse(409, view.blank === "run-gone" ? RUN_GONE : NO_RUN);
  const records = await readRunRecords(db, view.run.id);
  if (!records) return refuse(409, RUN_GONE);
  return { ok: true, view: { ...view, run: view.run }, records };
}

/** The rule as the Settings card shows it after a save, and how many sessions the run's groups meet. */
function ruleView(atLeast: number | null, records: RunRecords, now: Date): FinishRuleView {
  const sessions = runEndOf(records.run, records.groups, now).sessions;
  return { atLeast, sessions: sessions > 0 ? sessions : null };
}

/** Set or clear the run's rule. Answers the card's view of it as stored. */
export async function setFinishRule(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  atLeast: number | null,
  now: Date,
): Promise<{ ok: true; rule: FinishRuleView } | FinishingRefusal> {
  const context = await finishingContext(db, actor, roundId, programmeId);
  if (!context.ok) return context;
  const { records } = context;
  const sessions = runEndOf(records.run, records.groups, now).sessions;
  if (atLeast !== null && sessions > 0 && atLeast > sessions) return refuse(409, moreThanItHolds(sessions));

  const runId = records.run.id;
  const ref = db.collection(FINISHING_COLLECTION).doc(finishRuleId(runId));
  const end = runEndOf(records.run, records.groups, now);
  // Every row of the run, as an admin's list has them, for the check below.
  const rows = listGroups(records, { isAdmin: true }, now, weeksOf(records)).flatMap((listed) =>
    listed.people.map((person) => person.row),
  );
  const unticked = await db.runTransaction(async (tx) => {
    // One equality on one field each, so no declared index.
    const [finishingSnap, certificateSnap] = await Promise.all([
      tx.get(db.collection(FINISHING_COLLECTION).where("runId", "==", runId)),
      tx.get(db.collection(CERTIFICATES_COLLECTION).where("runId", "==", runId)),
    ]);
    const holders = new Set<string>();
    for (const doc of certificateSnap.docs) {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      if (data.kind === "finished" && typeof data.uid === "string") holders.add(data.uid);
    }
    if (end.over && holders.size > 0) {
      const decisions = new Map<string, FinishDecision>();
      for (const doc of finishingSnap.docs) {
        const decision = normalizeFinishDecision(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
        if (decision && decision.runId === runId) decisions.set(decision.uid, decision);
      }
      const rule = atLeast === null ? null : { runId, atLeast, setAt: now };
      const lost = rows
        .filter((row) => holders.has(row.uid) && recordOf(row, { rule, decisions }, end)?.finished !== true)
        .map((row) => row.name)
        .sort((a, b) => a.localeCompare(b, "en-GB"));
      if (lost.length > 0) return lost;
    }
    if (atLeast === null) {
      tx.delete(ref);
    } else {
      tx.set(ref, { kind: "rule", runId, atLeast, setAt: FieldValue.serverTimestamp() });
    }
    return [];
  });
  if (unticked.length > 0) return refuse(409, ruleWouldUntick(unticked));
  return { ok: true, rule: ruleView(atLeast, records, now) };
}

/**
 * Decide one person's switch. Answers the section as it now stands, for the
 * caller, so the page's counts and marks are the server's.
 */
export async function decideFinished(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  change: { uid: string; finished: boolean },
  now: Date,
): Promise<{ ok: true; model: WhoFinishedModel } | FinishingRefusal> {
  const context = await finishingContext(db, actor, roundId, programmeId);
  if (!context.ok) return context;
  const { records, view } = context;
  const end = runEndOf(records.run, records.groups, now);
  if (!end.over) return refuse(409, notOverYet(end.lastDay));

  const viewer = { isAdmin: view.viewer === "admin", uid: actor.uid };
  // The person as this viewer's list shows them: the same rows the section draws.
  const row = listGroups(records, { isAdmin: viewer.isAdmin }, now, weeksOf(records))
    .flatMap((listed) => listed.people)
    .find((person) => person.row.uid === change.uid)?.row;
  if (!row) return refuse(404, NOT_ON_THE_LIST);
  // Nobody decides their own switch, an admin or the lead included.
  if (row.uid === actor.uid) return refuse(403, OWN_FINISHED);
  if (row.left !== null) return refuse(409, leftTheProgramme(row.name));

  const runId = records.run.id;
  const ruleRef = db.collection(FINISHING_COLLECTION).doc(finishRuleId(runId));
  const decisionRef = db.collection(FINISHING_COLLECTION).doc(finishDecisionId(runId, change.uid));
  const certificateRef = db.collection(CERTIFICATES_COLLECTION).doc(certificateId(runId, change.uid, "finished"));
  const held = await db.runTransaction(async (tx) => {
    // A certificate for finishing keeps its owner finished while it stands.
    if (!change.finished && (await tx.get(certificateRef)).exists) return true;
    // The rule as it is when the switch is written, so a decision is stored
    // exactly where it differs from what the rule says of this person.
    const ruleSnap = await tx.get(ruleRef);
    const rule = ruleSnap.exists ? normalizeFinishRule(ruleSnap.id, ruleSnap.data() as Record<string, unknown>) : null;
    const suggested = suggestedBy(rule, row);
    if (change.finished === suggested) {
      tx.delete(decisionRef);
      return false;
    }
    tx.set(decisionRef, {
      kind: "person",
      runId,
      uid: change.uid,
      finished: change.finished,
      byUid: actor.uid,
      at: FieldValue.serverTimestamp(),
    });
    return false;
  });
  if (held) return refuse(409, certificateHolds(row.name));
  return { ok: true, model: await loadWhoFinished(db, records, viewer, now) };
}
