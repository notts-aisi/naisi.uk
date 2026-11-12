import "server-only";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { campusLabel } from "@/lib/courses/campus";
import { cantMakeItState } from "@/lib/courses/cantMakeIt/model";
import { writeTakenBack } from "@/lib/courses/cantMakeIt/seat";
import { groupHistoryRow } from "@/lib/courses/groupChange/facts";
import { historyDetail, momentWords, regularHeadline } from "@/lib/courses/groupChange/words";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { currentTimeAnswer, timeQuestionSinceOf } from "@/lib/courses/timeAnswer/model";
import type { SessionUser } from "@/lib/firebase/session";
import { attendanceDocId, normalizeCourseAttendance, registerIsTaken } from "@/lib/firestore/courseAttendance";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { normalizeCourseEnrolment, placementIsTold } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { planRegularChange, type RegularPlan, type RegularRefusal } from "./model";
import type { RegularPress } from "./parse";
import { REGULAR_REFUSAL } from "./words";

/**
 * THE ONE WRITE OF A NEW REGULAR TIME, in one transaction that reads the
 * group, every taught week's register and the group's places again, plans
 * the change on what it read (`planRegularChange`) and writes:
 *
 *  1. the pins on every earlier taught week (no change record: a pin is not
 *     a change), and the same values into the `was` of an earlier week's own
 *     change record, where it holds none of them, so putting that change back
 *     lands on the pin;
 *  2. the group's standing `session` (day, start, length, room) and, when the
 *     press set one, its `campus`;
 *  3. a cancelled evening's record moved to its week's new date, so it stays
 *     cancelled;
 *  4. when the day or the start changed, `timeQuestionSince`, so every answer
 *     to "Can you make this time?" given before it stops counting and people
 *     are asked again (their stored answers are kept);
 *  5. on every register nobody has taken, the session's new start
 *     (`sessionAt`);
 *  6. when the day or the start changed, for each active, told fellow whose
 *     answer is "Most weeks, not all": each session they ticked whose start
 *     this change moves, that has not started on the new dates and whose
 *     line is still their own word, is taken back, through the writer "I can
 *     make it after all" uses. A week that keeps its time keeps the word. A
 *     one-off "can't make it" or "joining online" is left as it is;
 *  7. one row of the group's history.
 *
 * The caller has already read the run and admitted the presser.
 */

/** The register of one week's first session. */
function registerRef(db: Firestore, run: CourseRunDoc, groupId: string, weekNumber: number): DocumentReference {
  return db.collection("courseAttendance").doc(attendanceDocId(run.id, groupId, weekNumber, 1));
}

/** Every taught week's register, by week number, as the planner reads them. */
export function registerRefsOf(
  db: Firestore,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  sessions: readonly ResolvedSession[],
): Array<{ weekNumber: number; ref: DocumentReference }> {
  return sessions
    .filter((session) => session.occurrence === 1)
    .map((session) => ({ weekNumber: session.weekNumber, ref: registerRef(db, run, group.id, session.weekNumber) }));
}

/** The week ids the group's overrides hold AS STORED: what the cap counts. */
export function storedOverrideWeekIds(raw: Record<string, unknown>): string[] {
  const stored = raw.sessionOverrides;
  return stored && typeof stored === "object" ? Object.keys(stored as object) : [];
}

export type RegularApplied = {
  plan: RegularPlan;
  /** How many sessions ticked under "Most weeks, not all" were taken back. */
  takenBack: number;
};

export async function applyRegularChange(
  db: Firestore,
  input: {
    run: CourseRunDoc;
    groupRef: DocumentReference;
    press: RegularPress;
    actor: SessionUser;
    now: Date;
    /** How many the button said it would email: written into the history row. */
    emailed: number;
  },
): Promise<{ ok: true; applied: RegularApplied } | RegularRefusal> {
  const { run, groupRef, press, actor, now } = input;
  return db.runTransaction(async (tx) => {
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) return { ok: false, status: 400, error: REGULAR_REFUSAL.gone } as RegularRefusal;
    const raw = groupSnap.data() ?? {};
    const group = normalizeCourseGroup(groupSnap.id, raw);
    if (group.archived || group.runId !== run.id) return { ok: false, status: 400, error: REGULAR_REFUSAL.gone } as RegularRefusal;

    const refs = registerRefsOf(db, run, group, resolveSessions(run, group));
    const [registerSnaps, seatSnap] = await Promise.all([
      refs.length ? tx.getAll(...refs.map((each) => each.ref)) : Promise.resolve([]),
      tx.get(
        db
          .collection("courseEnrolments")
          .where("runId", "==", run.id)
          .where("groupId", "==", group.id)
          .where("status", "==", "active"),
      ),
    ]);
    const registers = new Map<number, Record<string, unknown>>();
    refs.forEach((each, index) => {
      const snap = registerSnaps[index];
      if (snap?.exists) registers.set(each.weekNumber, snap.data() ?? {});
    });

    const planned = planRegularChange({
      run,
      group,
      fromWeek: press.fromWeek,
      slot: {
        weekday: press.weekday,
        startTimeLocal: press.startTimeLocal,
        durationMinutes: press.durationMinutes,
        location: press.room,
        campus: press.campus,
      },
      registers,
      storedOverrideWeekIds: storedOverrideWeekIds(raw),
      now,
    });
    if (!planned.ok) return planned;
    const { plan } = planned;

    // ── 1 to 4: the group ────────────────────────────────────────────────────
    const update: Record<string, unknown> = {
      "session.weekday": plan.session.weekday,
      "session.startTimeLocal": plan.session.startTimeLocal,
      "session.durationMinutes": plan.session.durationMinutes,
      "session.location": plan.session.location,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (plan.campus) update.campus = plan.campus;
    for (const [weekId, pin] of Object.entries(plan.pins)) {
      for (const [field, value] of Object.entries(pin)) update[`sessionOverrides.${weekId}.${field}`] = value;
    }
    // A pinned week's own change keeps the pin as what it held before, so putting that change back lands on it.
    for (const [weekId, wasPin] of Object.entries(plan.wasPins)) {
      for (const [field, value] of Object.entries(wasPin)) update[`sessionChanges.${weekId}.was.${field}`] = value;
    }
    for (const [weekId, dateKey] of Object.entries(plan.cancelledMoves)) {
      update[`sessionChanges.${weekId}.dateKey`] = dateKey;
    }
    if (plan.dayOrTimeChanged) update.timeQuestionSince = FieldValue.serverTimestamp();
    tx.update(groupRef, update);

    // ── 5: registers nobody has taken keep their session's start ─────────────
    const refOf = new Map(refs.map((each) => [each.weekNumber, each.ref] as const));
    for (const move of plan.moves) {
      const data = registers.get(move.weekNumber);
      const ref = refOf.get(move.weekNumber);
      const startsAt = sessionInstants(move.after).startsAt;
      if (!data || !ref || !startsAt || registerIsTaken(data)) continue;
      tx.update(ref, { sessionAt: startsAt });
    }

    // ── 6: "Most weeks, not all" ticks, taken back for the new time ──────────
    let takenBack = 0;
    if (plan.dayOrTimeChanged) {
      const since = timeQuestionSinceOf(group);
      // Only the weeks whose start this change moves: a week that keeps its
      // time (pinned before the starting week, or keeping its own one-week
      // change) is still at the time the person said they can't make.
      const startOf = (session: ResolvedSession) => sessionInstants(session).startsAt?.getTime() ?? null;
      const timeMoves = new Set(
        plan.moves.filter((move) => startOf(move.before) !== startOf(move.after)).map((move) => move.weekNumber),
      );
      for (const doc of seatSnap.docs) {
        const seat = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
        if (seat.role !== "learner" || seat.groupId !== group.id || !placementIsTold(seat)) continue;
        const answer = currentTimeAnswer(seat, since);
        if (answer?.kind !== "mostWeeks") continue;
        for (const key of answer.sessionKeys) {
          const session = plan.sessionsAfter.find((each) => each.sessionKey === key && each.occurrence === 1);
          if (!session || !timeMoves.has(session.weekNumber)) continue;
          const ref = refOf.get(session.weekNumber);
          const data = registers.get(session.weekNumber);
          if (!ref || !data) continue;
          const register = normalizeCourseAttendance(ref.id, data);
          const state = cantMakeItState({
            startsAt: sessionInstants(session).startsAt,
            cancelled: session.cancelled,
            line: {
              finished: register.pushedAt !== null,
              notHeld: !register.held,
              mark: register.records[seat.uid] ?? null,
              toldAt: register.excusedInAdvance[seat.uid] ?? null,
            },
            now,
          });
          if (state.kind !== "told") continue;
          writeTakenBack(tx, { session, ref, data, state }, seat.uid);
          takenBack += 1;
        }
      }
    }

    // ── 7: the group's history ───────────────────────────────────────────────
    const firstMove = plan.moves[0];
    tx.set(
      db.collection(COURSE_AUDIT_COLLECTION).doc(),
      groupHistoryRow({
        kind: "group-time-changed",
        run,
        group,
        actor,
        weekId: plan.moves[0]?.weekId ?? null,
        detail: historyDetail({
          headline: regularHeadline(
            plan.fromWeek,
            {
              weekday: plan.session.weekday,
              hhmm: plan.session.startTimeLocal,
              minutes: plan.session.durationMinutes,
              room: plan.session.location,
            },
            plan.kept.filter((week) => week.pinned).map((week) => week.weekNumber),
          ),
          before: firstMove
            ? momentWords({
                dateKey: firstMove.before.dateKey,
                hhmm: firstMove.before.session.startTimeLocal,
                room: firstMove.before.session.location.trim(),
              })
            : undefined,
          reason: press.reason,
          emailed: input.emailed,
        }),
        before: {
          weekday: group.session.weekday,
          startTimeLocal: group.session.startTimeLocal,
          durationMinutes: group.session.durationMinutes,
          room: group.session.location,
          campus: group.campus,
        },
        after: {
          weekday: plan.session.weekday,
          startTimeLocal: plan.session.startTimeLocal,
          durationMinutes: plan.session.durationMinutes,
          room: plan.session.location,
          campus: plan.campus ?? group.campus,
          campusName: campusLabel(plan.campus ?? group.campus) || null,
          fromWeek: plan.fromWeek,
          pinnedWeeks: plan.kept.filter((week) => week.pinned).length,
        },
        reason: press.reason || null,
        emailed: input.emailed,
      }),
    );
    return { ok: true as const, applied: { plan, takenBack } };
  });
}
