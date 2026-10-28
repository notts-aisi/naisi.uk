import { own } from "../keys";
import { canMake, type ArrangePerson, type Plan } from "./plan";
import type { Lean } from "../assessment/types";

/**
 * WHAT CLAUDE IS TOLD ABOUT A PROPOSED ARRANGEMENT, AND WHAT IS KEPT OF WHAT
 * IT SAYS BACK.
 *
 * Claude sees the plan `./plan.ts` made, with people numbered and groups
 * numbered, never named. For each person: whether they would like to
 * facilitate, which OTHER planned groups they can make (a list of numbers,
 * never their week), and, where Claude has read their application, its lean
 * and one-line summary. It is asked for a facilitator per group and for any
 * moves that would make the groups work better.
 *
 * Nothing it says is taken on trust. `applyAdvice` keeps a suggestion only
 * when the plan's own rules allow it: a facilitator has to have said they
 * would like to facilitate and be able to make the group; a move has to be to
 * a group the person can make, with room, and never of somebody already told
 * their group. A facilitator sits in the group they facilitate, so one seated
 * elsewhere is moved there when that is allowed. Every suggestion that is
 * not kept is listed with why.
 *
 * Pure, so a test can read every line that would go and every rule applied.
 */

export type ReadNote = { lean: Lean; summary: string } | null;

export type AdviceInput = {
  message: string;
  /** "Applicant 3" to the account. */
  applicants: Record<string, string>;
  /** "Group 2" to the plan's group index. */
  groups: Record<string, number>;
};

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function adviceInputFrom(input: {
  programmeName: string;
  size: number;
  plan: Plan;
  people: ReadonlyMap<string, ArrangePerson>;
  reads: ReadonlyMap<string, ReadNote>;
}): AdviceInput {
  const uids = [...input.people.keys()].sort();
  const labelOf = new Map(uids.map((uid, i) => [uid, `Applicant ${i + 1}`] as const));
  const applicants: Record<string, string> = {};
  for (const [uid, label] of labelOf) applicants[label] = uid;
  const groups: Record<string, number> = {};
  input.plan.groups.forEach((_, index) => {
    groups[`Group ${index + 1}`] = index;
  });

  const kept = new Set(input.plan.keptUids);
  const near = new Set(input.plan.nearUids);
  const describe = (uid: string, here: number | null): string => {
    const person = input.people.get(uid)!;
    const others = input.plan.groups
      .map((group, index) => (index !== here && canMake(person, group.session) ? `Group ${index + 1}` : null))
      .filter(Boolean);
    const read = input.reads.get(uid) ?? null;
    const parts = [
      `${labelOf.get(uid)}:`,
      person.facilitates ? "would like to facilitate." : "has not offered to facilitate.",
      kept.has(uid) ? "Already told their group, so stays." : others.length ? `Can also make ${others.join(", ")}.` : "Can make no other group.",
      person.week.kind === "given" && person.week.minimal ? "Marked under 4 hours in the week, so read as free from their first time each day." : "",
      near.has(uid) ? "Placed near their time, not in it: none of the groups is at a time they marked." : "",
      read ? `Lean ${read.lean}. ${read.summary.replace(/\bReviewer [A-Z]\b/g, "a reviewer")}` : "Not read by Claude.",
    ];
    return `- ${parts.filter(Boolean).join(" ")}`;
  };

  const lines = [
    `# ${input.programmeName}: ${uids.length} people, groups of up to ${input.size}`,
    "",
  ];
  input.plan.groups.forEach((group, index) => {
    const when = `${DAY[group.session.weekday] ?? "?"} ${group.session.startTimeLocal}, ${group.session.durationMinutes} minutes`;
    lines.push(`## Group ${index + 1} (${when}; room for ${group.room}${group.id === null ? "; a new group" : ""})`);
    for (const uid of group.memberUids) lines.push(describe(uid, index));
    if (group.memberUids.length === 0) lines.push("- Nobody yet.");
    lines.push("");
  });
  if (input.plan.unplaced.length > 0) {
    lines.push("## Not placed");
    for (const { uid, reason } of input.plan.unplaced) {
      const why =
        reason === "no-week" ? "said nothing about when they are free" : reason === "fits-none" ? "can make none of these times" : "no room in a group they can make";
      lines.push(`- ${labelOf.get(uid)}: ${why}.`);
    }
  }
  return { message: lines.join("\n"), applicants, groups };
}

export type AdviceFacilitator = { group: string; applicant: string; why: string };
export type AdviceMove = { applicant: string; to: string; why: string };
export type Advice = { facilitators: AdviceFacilitator[]; moves: AdviceMove[]; notes: string };

export type AppliedAdvice = {
  plan: Plan;
  /** The plan's group index to the facilitator's account and why. */
  facilitators: Map<number, { uid: string; why: string }>;
  moves: { uid: string; from: number; to: number; why: string }[];
  dropped: { suggestion: string; why: string }[];
};

/** Keep what the plan's rules allow of Claude's advice; list the rest with why. */
export function applyAdvice(
  plan: Plan,
  people: ReadonlyMap<string, ArrangePerson>,
  labels: AdviceInput,
  advice: Advice,
): AppliedAdvice {
  const groups = plan.groups.map((group) => ({ ...group, memberUids: [...group.memberUids] }));
  const kept = new Set(plan.keptUids);
  const dropped: AppliedAdvice["dropped"] = [];
  const moves: AppliedAdvice["moves"] = [];
  const facilitators = new Map<number, { uid: string; why: string }>();
  const where = (uid: string) => groups.findIndex((group) => group.memberUids.includes(uid));
  /** A group by its index in the plan: always one `own` answered from the labels, or `where`. */
  const groupAt = (index: number) => groups.at(index)!;
  const fits = (uid: string, to: number) => {
    const person = people.get(uid);
    if (!person) return "is not one of the people being arranged";
    if (kept.has(uid)) return "has already been told their group";
    if (!canMake(person, groupAt(to).session)) return `cannot make Group ${to + 1}`;
    if (groupAt(to).memberUids.length >= groupAt(to).room) return `cannot join Group ${to + 1}, which is full`;
    return null;
  };
  const move = (uid: string, to: number, why: string) => {
    const from = where(uid);
    if (from >= 0) groupAt(from).memberUids.splice(groupAt(from).memberUids.indexOf(uid), 1);
    groupAt(to).memberUids.push(uid);
    moves.push({ uid, from, to, why });
  };

  for (const suggestion of advice.moves) {
    const uid = own(labels.applicants, suggestion.applicant);
    const to = own(labels.groups, suggestion.to);
    const said = `move ${suggestion.applicant} to ${suggestion.to}`;
    if (!uid || to === undefined) {
      dropped.push({ suggestion: said, why: "names somebody or a group that is not in the plan" });
      continue;
    }
    if (where(uid) === to) continue;
    const problem = fits(uid, to);
    if (problem) {
      dropped.push({ suggestion: said, why: `${suggestion.applicant} ${problem}` });
      continue;
    }
    move(uid, to, suggestion.why);
  }

  for (const suggestion of advice.facilitators) {
    const at = own(labels.groups, suggestion.group);
    if (at === undefined || !suggestion.applicant) continue;
    const said = `${suggestion.applicant} to facilitate ${suggestion.group}`;
    const uid = own(labels.applicants, suggestion.applicant);
    const person = uid ? people.get(uid) : undefined;
    if (!uid || !person) {
      dropped.push({ suggestion: said, why: "names somebody who is not in the plan" });
      continue;
    }
    if (!person.facilitates) {
      dropped.push({ suggestion: said, why: `${suggestion.applicant} has not offered to facilitate` });
      continue;
    }
    if ([...facilitators.values()].some((chosen) => chosen.uid === uid)) {
      dropped.push({ suggestion: said, why: `${suggestion.applicant} is already suggested for another group` });
      continue;
    }
    // A facilitator sits in the group they facilitate.
    if (where(uid) !== at) {
      const problem = fits(uid, at);
      if (problem) {
        dropped.push({ suggestion: said, why: `${suggestion.applicant} ${problem}` });
        continue;
      }
      move(uid, at, `to facilitate ${suggestion.group}`);
    }
    facilitators.set(at, { uid, why: suggestion.why });
  }

  const placed = new Set(groups.flatMap((group) => group.memberUids));
  return {
    plan: { ...plan, groups, unplaced: plan.unplaced.filter((entry) => !placed.has(entry.uid)) },
    facilitators,
    moves,
    dropped,
  };
}
