import { COURSE_FIELD_LIMITS, weekDocId, type WeekPlanEntry } from "@/lib/firestore/courses";

/**
 * A RUN'S WEEK PLAN, CHANGED ONE STEP AT A TIME, from a programme's Weeks
 * tab: add a week at the end, add a break after a week, move a week or a
 * break up or down by one, remove a week or a break. Pure, so the page that
 * offers each step and the route that takes it work the step out the same
 * way (`./facts.ts` asks whether it may be taken, `./write.ts` takes it).
 *
 * ## Every week at its number's address
 *
 * The Nth taught entry of a plan is week N, and every reader of a week by a
 * member, a register or a group opens `weekDocId(N)`; the plan's own
 * `weekId` is what the older run editor opened. A step here works out the
 * new plan, then gives every week of it the address its new number says
 * (`target`) and says where that week's document is stored now (`source`,
 * its entry's stored `weekId`). Wherever the two differ the document moves,
 * with everything under it, in the step's own transaction. A plan the older
 * editor left with a week stored at another week's address is put right by
 * the same sum: what the older editor's Normalise week ids did, folded into
 * every step, never a press of its own.
 *
 * A week added at the end has no source: its address is used as it stands,
 * so a week page copied in from the course past the plan's end becomes that
 * week's page.
 */

/** One step, as the route takes it and the page sends it. */
export type PlanStep =
  | { kind: "add-week" }
  | { kind: "add-break"; afterWeek: number; label: string }
  | { kind: "move"; index: number; direction: "up" | "down" }
  | { kind: "remove"; index: number };

/** One week of the plan after a step: its number, the address that number says, and where its document is stored now. */
export type PlannedWeek = { weekNumber: number; target: string; source: string | null };

/** What a step makes of a plan. */
export type PlanChange = {
  /** The new plan, every week's `weekId` its own number's address. */
  plan: WeekPlanEntry[];
  weeks: PlannedWeek[];
  /** The week the step takes out, by its number before the step and where its document is stored. */
  removed: { weekNumber: number; source: string } | null;
  /** Weeks whose number the step changes: before and after. */
  renumbered: { from: number; to: number }[];
  /** A move or a removal: the owner's rule for those holds (`./facts.ts`). */
  reshapes: boolean;
};

export type StepProblem = "no-such-entry" | "cannot-move" | "full" | "no-such-week" | "label";

/** The most weeks and breaks a plan holds: weeks are addressed `w01` to `w60`. */
export const MAX_PLAN_ENTRIES = COURSE_FIELD_LIMITS.maxWeekPlanEntries;
/** The longest a break's label may be, as the older builder held it. */
export const MAX_BREAK_LABEL = COURSE_FIELD_LIMITS.runLabel;

/**
 * The plan as a page drew it, in one string: each entry's kind with its
 * stored address or its label. The route compares it with the plan it reads,
 * so a step worked out on an older drawing is never taken.
 */
export function planKeyOf(plan: readonly WeekPlanEntry[]): string {
  return plan.map((entry) => (entry.kind === "week" ? `w:${entry.weekId}` : `b:${entry.label}`)).join("|");
}

/** A request's body as a step and the drawing it was made on, or what is wrong with it. */
export function planStepOf(raw: unknown): { ok: true; step: PlanStep; planKey: string } | { ok: false } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false };
  const body = raw as Record<string, unknown>;
  const planKey = typeof body.planKey === "string" && body.planKey.length <= 10_000 ? body.planKey : null;
  if (planKey === null) return { ok: false };
  const index = typeof body.index === "number" && Number.isInteger(body.index) && body.index >= 0 ? body.index : null;
  switch (body.action) {
    case "add-week":
      return { ok: true, step: { kind: "add-week" }, planKey };
    case "add-break": {
      const afterWeek = typeof body.afterWeek === "number" && Number.isInteger(body.afterWeek) ? body.afterWeek : null;
      if (afterWeek === null || typeof body.label !== "string") return { ok: false };
      return { ok: true, step: { kind: "add-break", afterWeek, label: body.label }, planKey };
    }
    case "move":
      if (index === null || (body.direction !== "up" && body.direction !== "down")) return { ok: false };
      return { ok: true, step: { kind: "move", index, direction: body.direction }, planKey };
    case "remove":
      if (index === null) return { ok: false };
      return { ok: true, step: { kind: "remove", index }, planKey };
    default:
      return { ok: false };
  }
}

/** A break's label as it is kept: trimmed, one line. */
export function breakLabelOf(label: string): string {
  return label.replace(/\s+/g, " ").trim();
}

type Slot = { kind: "week"; source: string | null } | { kind: "break"; label: string };

/** What `step` makes of `plan`, or why it cannot be taken on this plan at all. */
export function applyStep(plan: readonly WeekPlanEntry[], step: PlanStep): { ok: true; change: PlanChange } | { ok: false; why: StepProblem } {
  const slots: Slot[] = plan.map((entry) => (entry.kind === "week" ? { kind: "week", source: entry.weekId } : { kind: "break", label: entry.label }));
  // The number each week had before the step, by its slot.
  const before = new Map<Slot, number>();
  let n = 0;
  for (const slot of slots) if (slot.kind === "week") before.set(slot, (n += 1));

  let removed: PlanChange["removed"] = null;
  switch (step.kind) {
    case "add-week":
      if (slots.length >= MAX_PLAN_ENTRIES) return { ok: false, why: "full" };
      slots.push({ kind: "week", source: null });
      break;
    case "add-break": {
      if (slots.length >= MAX_PLAN_ENTRIES) return { ok: false, why: "full" };
      const label = breakLabelOf(step.label);
      if (!label || label.length > MAX_BREAK_LABEL) return { ok: false, why: "label" };
      const at = slots.findIndex((slot) => slot.kind === "week" && before.get(slot) === step.afterWeek);
      if (at === -1) return { ok: false, why: "no-such-week" };
      slots.splice(at + 1, 0, { kind: "break", label });
      break;
    }
    case "move": {
      if (step.index >= slots.length) return { ok: false, why: "no-such-entry" };
      const to = step.direction === "up" ? step.index - 1 : step.index + 1;
      if (to < 0 || to >= slots.length) return { ok: false, why: "cannot-move" };
      [slots[step.index], slots[to]] = [slots[to], slots[step.index]];
      break;
    }
    case "remove": {
      if (step.index >= slots.length) return { ok: false, why: "no-such-entry" };
      const [gone] = slots.splice(step.index, 1);
      if (gone.kind === "week") removed = { weekNumber: before.get(gone) ?? 0, source: gone.source ?? "" };
      break;
    }
  }

  const next: WeekPlanEntry[] = [];
  const weeks: PlannedWeek[] = [];
  const renumbered: PlanChange["renumbered"] = [];
  let number = 0;
  for (const slot of slots) {
    if (slot.kind === "break") {
      next.push({ kind: "break", label: slot.label });
      continue;
    }
    number += 1;
    const target = weekDocId(number);
    next.push({ kind: "week", weekNumber: number, weekId: target });
    weeks.push({ weekNumber: number, target, source: slot.source });
    const was = before.get(slot);
    if (was !== undefined && was !== number) renumbered.push({ from: was, to: number });
  }
  return { ok: true, change: { plan: next, weeks, removed, renumbered, reshapes: step.kind === "move" || step.kind === "remove" } };
}

/** Each address whose contents the change moves, takes away or puts back: a source left, a target filled from elsewhere, the removed week's. */
export function touchedAddresses(change: PlanChange): string[] {
  const touched = new Set<string>();
  for (const week of change.weeks) {
    if (week.source !== null && week.source !== week.target) {
      touched.add(week.source);
      touched.add(week.target);
    }
  }
  if (change.removed?.source) touched.add(change.removed.source);
  return [...touched].sort();
}

/**
 * What each touched address holds once the change is made: the address its
 * contents come from (null: it is left empty), with the week number its
 * document then carries. An address a week was added at, with no source,
 * keeps what it holds unless another week's contents leave it, and then it
 * is left empty.
 */
export function finalSources(change: PlanChange): Map<string, { from: string | null; weekNumber: number | null }> {
  const out = new Map<string, { from: string | null; weekNumber: number | null }>();
  const touched = touchedAddresses(change);
  for (const address of touched) out.set(address, { from: null, weekNumber: null });
  for (const week of change.weeks) {
    if (!out.has(week.target)) continue;
    out.set(week.target, { from: week.source === null ? null : week.source, weekNumber: week.weekNumber });
  }
  return out;
}

/** Whether a plan has a week stored at another week's address: what the older editor's builder could leave. */
export function planHasDrifted(plan: readonly WeekPlanEntry[]): boolean {
  let n = 0;
  for (const entry of plan) {
    if (entry.kind !== "week") continue;
    n += 1;
    if (entry.weekId !== weekDocId(n)) return true;
  }
  return false;
}
