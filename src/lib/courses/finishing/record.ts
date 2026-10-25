import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import {
  listGroups,
  weeksOf,
  type GridPerson,
  type RunRecords,
} from "@/lib/courses/programmeAttendance";
import { normalizeCourseAttendance, type CourseAttendanceDoc } from "@/lib/firestore/courseAttendance";
import type { CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import { compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import {
  FINISHING_COLLECTION,
  finishDecisionId,
  finishRuleId,
  meetsRule,
  normalizeFinishDecision,
  normalizeFinishRule,
  type FinishDecision,
  type FinishRule,
} from "./model";
import { liveGroupsOf, runEndOf, type RunEnd } from "./runEnd";

// When the run is over is its own module (`./runEnd.ts`), which the lead's
// attendance asks too; every reader of the record keeps asking it here.
export { liveGroupsOf, runEndOf, type RunEnd };

/**
 * EVERY READER OF THE FINISHED RECORD ASKS HERE: the lead's list on the
 * Overview, the routes that change it, the header over the programme's tabs,
 * and a member's own pages (the run home, the hub's cards, Home). See
 * `./model.ts` for what the record is.
 *
 * Two rules every answer keeps:
 *
 *  - NOT BEFORE THE END. Nobody finished anything until the run's last
 *    session is over (`runEndOf`): the latest end of a session any of its
 *    live groups holds, a cancelled one left out, as `sessionRange` leaves it
 *    out. Before then every member's record answers "not finished".
 *  - "CAME" IS THE ATTENDANCE TAB'S. A person's count is their row of the
 *    run's grid (`listGroups` in `programmeAttendance.ts`): present, late and
 *    left early on the registers of their group, from the week they joined.
 *    The member's own answer builds that same row from the same function, so
 *    the lead's list and the member's page cannot count differently.
 *
 * Every query is one equality on one field, so none needs a declared index.
 */

// ---------------------------------------------------------------------------
// When the run is over
// ---------------------------------------------------------------------------

/**
 * The run's live groups and when it ends, read from the run alone. The groups
 * come back in the one order every tab of a programme's page lists them in
 * (`compareGroupsByMeeting`), so a caller that draws them draws that order.
 */
export async function readRunEnd(
  db: Firestore,
  run: CourseRunDoc,
  now: Date,
): Promise<{ groups: CourseGroupDoc[]; end: RunEnd }> {
  const snap = await db.collection("courseGroups").where("runId", "==", run.id).get();
  const groups = liveGroupsOf(
    run.id,
    snap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})),
  ).sort(compareGroupsByMeeting);
  return { groups, end: runEndOf(run, groups, now) };
}

/**
 * When a run ends, read from its id: the run and its groups. Null for a run
 * that is not there or is being destroyed, as the programme's tabs read it.
 */
export async function readRunEndById(db: Firestore, runId: string, now: Date): Promise<RunEnd | null> {
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists || snap.data()?.destroying === true) return null;
  const run = normalizeCourseRun(snap.id, snap.data() ?? {});
  return (await readRunEnd(db, run, now)).end;
}

// ---------------------------------------------------------------------------
// What is stored: the rule and the lead's decisions
// ---------------------------------------------------------------------------

export type Finishing = {
  rule: FinishRule | null;
  /** The lead's decisions, by uid. Only where they differ from the suggestion. */
  decisions: Map<string, FinishDecision>;
};

/** The run's rule alone, by its address: what the Settings card shows. */
export async function readFinishRule(db: Firestore, runId: string): Promise<FinishRule | null> {
  if (!runId || runId.includes("/")) return null;
  const snap = await db.collection(FINISHING_COLLECTION).doc(finishRuleId(runId)).get();
  const rule = snap.exists ? normalizeFinishRule(snap.id, snap.data() as Record<string, unknown>) : null;
  return rule && rule.runId === runId ? rule : null;
}

/** The run's rule and every decision on it: one equality on `runId`. */
export async function readFinishing(db: Firestore, runId: string): Promise<Finishing> {
  const snap = await db.collection(FINISHING_COLLECTION).where("runId", "==", runId).get();
  let rule: FinishRule | null = null;
  const decisions = new Map<string, FinishDecision>();
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    if (data.kind === "rule") {
      const read = normalizeFinishRule(doc.id, data);
      if (read && read.runId === runId) rule = read;
      continue;
    }
    const decision = normalizeFinishDecision(doc.id, data);
    if (decision && decision.runId === runId) decisions.set(decision.uid, decision);
  }
  return { rule, decisions };
}

// ---------------------------------------------------------------------------
// One person's record
// ---------------------------------------------------------------------------

export type FinishRecord = {
  finished: boolean;
  /** What the rule says of them, or false with no rule. */
  suggested: boolean;
  /** "lead" for a stored decision, "suggestion" when the rule decided, null while there is neither. */
  decidedBy: "lead" | "suggestion" | null;
  /** The decision's own time; for a suggestion, the later of the last session's end and the rule being set. */
  at: Date | null;
  decision: FinishDecision | null;
};

/**
 * What the rule says of one person, from their row of the grid: false with no
 * rule. The switch's route asks this too, so a decision is stored exactly
 * where it differs from what the lead's list shows.
 */
export function suggestedBy(rule: FinishRule | null, row: Pick<GridPerson, "came" | "groupHeld">): boolean {
  return rule !== null && meetsRule(row.came, row.groupHeld, rule.atLeast);
}

/**
 * A person's record, from their row of the grid. Null before the run is over
 * and for somebody who left: they are listed as having left, and have no
 * finished record at all.
 */
export function recordOf(
  row: Pick<GridPerson, "uid" | "came" | "groupHeld" | "left">,
  finishing: Finishing,
  end: RunEnd,
): FinishRecord | null {
  if (!end.over || row.left !== null) return null;
  const decision = finishing.decisions.get(row.uid) ?? null;
  const rule = finishing.rule;
  const suggested = suggestedBy(rule, row);
  if (decision) {
    return { finished: decision.finished, suggested, decidedBy: "lead", at: decision.at, decision };
  }
  if (!rule) return { finished: false, suggested: false, decidedBy: null, at: null, decision: null };
  const ruleAt = rule.setAt?.getTime() ?? 0;
  const endAt = end.endsAt?.getTime() ?? 0;
  return {
    finished: suggested,
    suggested,
    decidedBy: "suggestion",
    at: new Date(Math.max(ruleAt, endAt)),
    decision: null,
  };
}

/** The switches the register's ending reads: the grid's rows do not depend on them. */
const NO_SWITCHES = { scheduled: false, remindersOn: false, tasksOn: false } as const;

/**
 * ONE MEMBER'S OWN ANSWER: true only when their record says they finished.
 * False says nothing more: not over yet, not decided, not finished, somebody
 * who left, or somebody who is not a learner here. A page that is told false
 * says the programme has ended, and claims nothing.
 *
 * Who is taking part, and that somebody who left has no record, are the
 * grid's rule and `recordOf`'s, as on the lead's list: they are not decided
 * again here. Reads only what the answer needs, and stops as soon as it is known:
 * the run's groups (unless the caller already holds them, when a run that is
 * not over costs no read at all), then the rule and this person's decision,
 * then, when there is either, the registers of their own group. Their row is
 * the grid's (`listGroups`), built from those, and their record is
 * `recordOf`'s, as on the lead's list.
 */
export async function finishedForMember(
  db: Firestore,
  run: CourseRunDoc,
  enrolment: CourseEnrolmentDoc | null,
  now: Date,
  heldGroups?: readonly CourseGroupDoc[],
): Promise<boolean> {
  if (!enrolment || enrolment.role !== "learner" || enrolment.runId !== run.id || !enrolment.groupId) return false;

  const groups = heldGroups
    ? liveGroupsOf(run.id, heldGroups)
    : (await readRunEnd(db, run, now)).groups;
  const end = runEndOf(run, groups, now);
  if (!end.over) return false;
  if (!groups.some((group) => group.id === enrolment.groupId)) return false;

  const [ruleSnap, decisionSnap] = await db.getAll(
    db.collection(FINISHING_COLLECTION).doc(finishRuleId(run.id)),
    db.collection(FINISHING_COLLECTION).doc(finishDecisionId(run.id, enrolment.uid)),
  );
  const decision = decisionSnap.exists
    ? normalizeFinishDecision(decisionSnap.id, decisionSnap.data() as Record<string, unknown>)
    : null;
  const rule = ruleSnap.exists ? normalizeFinishRule(ruleSnap.id, ruleSnap.data() as Record<string, unknown>) : null;
  if (!decision && !rule) return false;
  const finishing: Finishing = {
    rule: rule && rule.runId === run.id ? rule : null,
    decisions: new Map(decision && decision.runId === run.id && decision.uid === enrolment.uid ? [[decision.uid, decision]] : []),
  };

  // The registers of their own group: one equality on `groupId`.
  const registerSnap = await db.collection("courseAttendance").where("groupId", "==", enrolment.groupId).get();
  const registers = new Map<string, CourseAttendanceDoc>();
  for (const doc of registerSnap.docs) {
    const register = normalizeCourseAttendance(doc.id, doc.data() ?? {});
    if (register.runId === run.id && register.groupId === enrolment.groupId) registers.set(doc.id, register);
  }
  const records: RunRecords = {
    run,
    groups: [...groups],
    enrolments: [enrolment],
    registers,
    accounts: new Map(),
    switches: NO_SWITCHES,
  };
  const row = listGroups(records, { isAdmin: true }, now, weeksOf(records))
    .flatMap((listed) => listed.people)
    .find((person) => person.enrolment.uid === enrolment.uid)?.row;
  if (!row) return false;
  return recordOf(row, finishing, end)?.finished === true;
}
