import type { Lean } from "../assessment/types";
import { own } from "../keys";
import { MAX_OPTIONS, type Candidate, type Strength } from "./options";
import { canMake, type ArrangePerson, type Plan } from "./plan";

/**
 * WHAT CLAUDE IS TOLD ABOUT SEVERAL ARRANGEMENTS, AND WHAT IS KEPT OF WHAT IT
 * SAYS BACK.
 *
 * Claude sees the options `./options.ts` worked out, with people numbered
 * ("Applicant 3") and groups labelled by option ("Group B2"), never named.
 * For each person, once: whether they offered to facilitate, whether they
 * have been told their group, whether they marked little time, and Claude's
 * own earlier read of their application (its lean, summary, strengths,
 * concerns and how many answers it found thin), with reviewers made "a
 * reviewer". Never their week: under each option, only which of THAT
 * option's groups they can make. Never what any check of their writing found.
 *
 * It is asked for: a facilitator's potential for each person who might lead
 * a group, the options worth an admin's time (at most five), ranked, each
 * with pros and cons, a sentence for every group on why its people suit each
 * other, a lead facilitator for every group (and a second, who offered,
 * beside a lead who did not), and any moves.
 *
 * NOTHING IT SAYS IS TAKEN ON TRUST (`applyChoice`). An option it names has
 * to be one of the options it was shown. A move has to be to a group the
 * person can make, with room, and never of somebody already told their
 * group. A facilitator has to be one of the people, sits in the group they
 * lead (moved there when that is allowed), and leads one group. A lead who
 * did not offer is given a second who did: Claude's if it named one who can
 * be, else the site's best guess in that group, else the screen says nobody
 * can. A second beside a lead who offered is not kept: one per group. Where
 * Claude named no lead, the site's best guess who offered is used, except in
 * a group of the run that has facilitators already. Everything not kept is
 * listed with why.
 *
 * Pure, so a test can read every line that would go and every rule applied.
 */

export type ReadNote = {
  lean: Lean | null;
  summary: string;
  strengths: string[];
  concerns: string[];
  /** How many answers Claude's read called thin. */
  thin: number;
} | null;

export type ChoiceInput = {
  message: string;
  /** "Applicant 3" to the account. */
  applicants: Record<string, string>;
  /** "Option B" to the candidate's index. */
  optionAt: Record<string, number>;
  /** "Group B2" to [candidate index, group index]. */
  groups: Record<string, [number, number]>;
};

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LETTERS = "ABCDEFGH";

const reviewerWords = (text: string) => text.replace(/\bReviewer [A-Z]\b/g, "a reviewer");

export function choiceInputFrom(input: {
  programmeName: string;
  candidates: readonly Candidate[];
  people: ReadonlyMap<string, ArrangePerson>;
  reads: ReadonlyMap<string, ReadNote>;
  kept: ReadonlySet<string>;
  /** How many facilitators each of the run's groups has already, by group id. */
  staffed: ReadonlyMap<string, number>;
}): ChoiceInput {
  const uids = [...input.people.keys()].sort();
  const labelOf = new Map(uids.map((uid, i) => [uid, `Applicant ${i + 1}`] as const));
  const applicants: Record<string, string> = {};
  for (const [uid, label] of labelOf) applicants[label] = uid;
  const optionAt: Record<string, number> = {};
  const groups: Record<string, [number, number]> = {};

  const lines = [`# ${input.programmeName}: ${uids.length} people holding a place`, "", "## The people"];
  for (const uid of uids) {
    const person = input.people.get(uid)!;
    const read = input.reads.get(uid) ?? null;
    const parts = [
      `${labelOf.get(uid)}:`,
      person.facilitates ? "offered to facilitate." : "did not offer to facilitate.",
      input.kept.has(uid) ? "Already told their group, so stays in it." : "",
      person.week.kind === "given" && person.week.minimal ? "Marked under 4 hours in the week." : "",
      person.week.kind !== "given" ? "Said nothing about when they are free." : "",
      read
        ? [
            read.lean ? `Lean ${read.lean}.` : "",
            reviewerWords(read.summary),
            read.strengths.length ? `Strengths: ${read.strengths.map(reviewerWords).join("; ")}.` : "",
            read.concerns.length ? `Concerns: ${read.concerns.map(reviewerWords).join("; ")}.` : "",
            read.thin > 0 ? `${read.thin} ${read.thin === 1 ? "answer" : "answers"} thin or brief.` : "",
          ]
            .filter(Boolean)
            .join(" ")
        : "Not read by Claude.",
    ];
    lines.push(`- ${parts.filter(Boolean).join(" ")}`);
  }

  input.candidates.forEach((candidate, c) => {
    const letter = LETTERS[c];
    optionAt[`Option ${letter}`] = c;
    const { plan } = candidate;
    const near = new Set(plan.nearUids);
    lines.push("", `## Option ${letter}: groups of up to ${candidate.size}`);
    lines.push(
      `Seats ${candidate.score.seated} who marked a real week in a group they can make; ${plan.nearUids.length} placed near their time, not in it; ${plan.unplaced.length} not placed.`,
    );
    plan.groups.forEach((group, g) => {
      const label = `Group ${letter}${g + 1}`;
      groups[label] = [c, g];
      const when = `${DAY[group.session.weekday] ?? "?"} ${group.session.startTimeLocal}, ${group.session.durationMinutes} minutes`;
      const already = group.id ? (input.staffed.get(group.id) ?? 0) : 0;
      const notes = [
        `room for ${group.room}`,
        group.id === null ? "a new group" : group.timeIsNew ? "a new time" : "",
        already > 0 ? `already has ${already} ${already === 1 ? "facilitator" : "facilitators"} on the run, so it needs no lead` : "",
      ].filter(Boolean);
      lines.push(`### ${label}: ${when} (${notes.join("; ")})`);
      for (const uid of group.memberUids) {
        const person = input.people.get(uid);
        const others = plan.groups
          .map((other, index) => (index !== g && person && canMake(person, other.session) ? `${letter}${index + 1}` : null))
          .filter(Boolean);
        const where = near.has(uid) ? "near their time, not in it" : others.length ? `can also make ${others.join(", ")}` : "can make no other group here";
        lines.push(`- ${labelOf.get(uid)} (${where})`);
      }
      if (group.memberUids.length === 0) lines.push("- Nobody yet.");
    });
    if (plan.unplaced.length > 0) {
      lines.push("### Not placed");
      for (const { uid, reason } of plan.unplaced) {
        const why = reason === "no-week" ? "said nothing about when they are free" : reason === "fits-none" ? "can make none of these times" : "no room in a group they can make";
        lines.push(`- ${labelOf.get(uid)}: ${why}.`);
      }
    }
  });
  return { message: lines.join("\n"), applicants, optionAt, groups };
}

export type ChoiceGroup = { group: string; why: string; facilitator: string; facilitatorWhy: string; second: string; secondWhy: string };
export type ChoiceOption = {
  option: string;
  rank: number;
  title: string;
  pros: string[];
  cons: string[];
  groups: ChoiceGroup[];
  moves: { applicant: string; to: string; why: string }[];
};
export type Choice = {
  potential: { applicant: string; level: "high" | "medium" | "low"; why: string }[];
  options: ChoiceOption[];
  preferred: string;
  preferredWhy: string;
  notes: string;
};

/** Claude's answer as this module reads it, or null when it is not one. */
export function choiceFrom(value: unknown): Choice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const texts = (v: unknown) => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);
  const items = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []) as Record<string, unknown>[];
  const level = (v: unknown) => (v === "high" || v === "medium" || v === "low" ? v : null);
  return {
    potential: items(raw.potential).flatMap((x) => {
      const said = level(x.level);
      return said ? [{ applicant: text(x.applicant), level: said, why: text(x.why) }] : [];
    }),
    options: items(raw.options).map((x) => ({
      option: text(x.option),
      rank: typeof x.rank === "number" && Number.isFinite(x.rank) ? x.rank : 99,
      title: text(x.title),
      pros: texts(x.pros),
      cons: texts(x.cons),
      groups: items(x.groups).map((g) => ({
        group: text(g.group),
        why: text(g.why),
        facilitator: text(g.facilitator),
        facilitatorWhy: text(g.facilitatorWhy),
        second: text(g.second),
        secondWhy: text(g.secondWhy),
      })),
      moves: items(x.moves).map((m) => ({ applicant: text(m.applicant), to: text(m.to), why: text(m.why) })),
    })),
    preferred: text(raw.preferred),
    preferredWhy: text(raw.preferredWhy),
    notes: text(raw.notes),
  };
}

export type ChosenFacilitator = {
  uid: string;
  role: "lead" | "second";
  offered: boolean;
  why: string;
  /** Picked by the site, not Claude. */
  bySite: boolean;
};

export type ChosenOption = {
  /** The candidate it was made from. */
  candidate: number;
  title: string;
  pros: string[];
  cons: string[];
  plan: Plan;
  /** By the plan's group index. */
  groups: { why: string; facilitators: ChosenFacilitator[] }[];
  movedUids: string[];
  /** Claude's own preference among them. */
  preferred: boolean;
};

export type Potential = { level: "high" | "medium" | "low"; why: string };

export type AppliedChoice = {
  /** Best first. */
  options: ChosenOption[];
  potential: Map<string, Potential>;
  preferredWhy: string;
  notes: string;
  dropped: { suggestion: string; why: string }[];
};

const LEVEL_SCORE: Record<Potential["level"], number> = { high: 3, medium: 2, low: 1 };

/** Who in this group the site would ask to lead it: somebody who offered, strongest first. */
function bestWhoOffered(
  members: readonly string[],
  people: ReadonlyMap<string, ArrangePerson>,
  potential: ReadonlyMap<string, Potential>,
  strength: Strength,
  taken: ReadonlySet<string>,
): string | null {
  const score = (uid: string) => (potential.has(uid) ? LEVEL_SCORE[potential.get(uid)!.level] * 10 : 0) + (strength.get(uid) ?? 0);
  return (
    members
      .filter((uid) => people.get(uid)?.facilitates && !taken.has(uid))
      .sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0] ?? null
  );
}

/** One option, its facilitators picked by the site alone: for an arrangement Claude was not asked about. */
export function siteOption(
  candidate: Candidate,
  index: number,
  people: ReadonlyMap<string, ArrangePerson>,
  strength: Strength,
  /** The run's groups that have facilitators already: none is picked for them. */
  staffed: ReadonlySet<string> = new Set(),
): ChosenOption {
  const taken = new Set<string>();
  return {
    candidate: index,
    title: "",
    pros: [],
    cons: [],
    plan: candidate.plan,
    groups: candidate.plan.groups.map((group) => {
      if (group.id && staffed.has(group.id)) return { why: "", facilitators: [] };
      const lead = bestWhoOffered(group.memberUids, people, new Map(), strength, taken);
      if (lead) taken.add(lead);
      return { why: "", facilitators: lead ? [{ uid: lead, role: "lead", offered: true, why: "", bySite: true }] : [] };
    }),
    movedUids: [],
    preferred: index === 0,
  };
}

/** Keep what the rules allow of Claude's choice; list the rest with why. */
export function applyChoice(
  candidates: readonly Candidate[],
  people: ReadonlyMap<string, ArrangePerson>,
  strength: Strength,
  labels: ChoiceInput,
  choice: Choice,
  /** The run's groups that have facilitators already: the site picks none for them. */
  staffed: ReadonlySet<string> = new Set(),
): AppliedChoice {
  const dropped: AppliedChoice["dropped"] = [];
  const potential = new Map<string, Potential>();
  for (const said of choice.potential) {
    const uid = own(labels.applicants, said.applicant);
    if (uid) potential.set(uid, { level: said.level, why: said.why });
  }

  const usedCandidates = new Set<number>();
  const ranked = [...choice.options].sort((a, b) => a.rank - b.rank);
  const options: ChosenOption[] = [];
  for (const suggestion of ranked) {
    const index = own(labels.optionAt, suggestion.option);
    if (index === undefined) {
      dropped.push({ suggestion: suggestion.option || "an option", why: "is not one of the options it was shown" });
      continue;
    }
    if (usedCandidates.has(index)) continue;
    if (options.length >= MAX_OPTIONS) break;
    usedCandidates.add(index);
    const candidate = candidates[index];
    const kept = new Set([...candidate.plan.keptUids]);
    const groups = candidate.plan.groups.map((group) => ({ ...group, memberUids: [...group.memberUids] }));
    const movedUids = new Set<string>();
    const where = (uid: string) => groups.findIndex((group) => group.memberUids.includes(uid));
    /** A group by its index: one `groupOf` answered from the labels, or `where`. */
    const groupAt = (at: number) => groups.at(at)!;
    const groupOf = (label: string) => {
      const at = own(labels.groups, label);
      return at && at[0] === index ? at[1] : undefined;
    };
    const fits = (uid: string, to: number) => {
      const person = people.get(uid);
      if (!person) return "is not one of the people being arranged";
      if (kept.has(uid)) return "has already been told their group";
      if (!canMake(person, groupAt(to).session)) return `cannot make that group's time`;
      if (groupAt(to).memberUids.length >= groupAt(to).room) return "would join a group that is full";
      return null;
    };
    const move = (uid: string, to: number) => {
      const from = where(uid);
      if (from >= 0) groupAt(from).memberUids.splice(groupAt(from).memberUids.indexOf(uid), 1);
      groupAt(to).memberUids.push(uid);
      movedUids.add(uid);
    };

    for (const said of suggestion.moves) {
      const uid = own(labels.applicants, said.applicant);
      const to = groupOf(said.to);
      const what = `${suggestion.option}: move ${said.applicant} to ${said.to}`;
      if (!uid || to === undefined) {
        dropped.push({ suggestion: what, why: "names somebody or a group that is not in that option" });
        continue;
      }
      if (where(uid) === to) continue;
      const problem = fits(uid, to);
      if (problem) dropped.push({ suggestion: what, why: `${said.applicant} ${problem}` });
      else move(uid, to);
    }

    const taken = new Set<string>();
    const chosen = groups.map(() => ({ why: "", facilitators: [] as ChosenFacilitator[] }));
    /** Seat `uid` in group `at` to facilitate it, if they are not there already; a sentence when that cannot be done. */
    const seat = (uid: string, at: number): string | null => {
      if (taken.has(uid)) return "already facilitates another group in this option";
      if (where(uid) === at) return null;
      const problem = fits(uid, at);
      if (problem) return problem;
      move(uid, at);
      return null;
    };
    for (const said of suggestion.groups) {
      const at = groupOf(said.group);
      if (at === undefined) {
        dropped.push({ suggestion: `${suggestion.option}: ${said.group}`, why: "is not a group in that option" });
        continue;
      }
      chosen[at].why = said.why;
      if (!said.facilitator) continue;
      const lead = own(labels.applicants, said.facilitator);
      const what = `${said.facilitator} to lead ${said.group}`;
      const problem = lead ? seat(lead, at) : "is not one of the people being arranged";
      if (!lead || problem) {
        dropped.push({ suggestion: what, why: `${said.facilitator} ${problem}` });
        continue;
      }
      taken.add(lead);
      const offered = people.get(lead)?.facilitates === true;
      chosen[at].facilitators.push({ uid: lead, role: "lead", offered, why: said.facilitatorWhy, bySite: false });
      if (offered) {
        if (said.second) dropped.push({ suggestion: `${said.second} as a second in ${said.group}`, why: "the lead offered, so one facilitator is enough" });
        continue;
      }
      // A lead who did not offer has a second who did.
      const second = said.second ? own(labels.applicants, said.second) : undefined;
      if (second && people.get(second)?.facilitates) {
        const secondProblem = seat(second, at);
        if (!secondProblem) {
          taken.add(second);
          chosen[at].facilitators.push({ uid: second, role: "second", offered: true, why: said.secondWhy, bySite: false });
          continue;
        }
        dropped.push({ suggestion: `${said.second} as a second in ${said.group}`, why: `${said.second} ${secondProblem}` });
      } else if (said.second) {
        dropped.push({ suggestion: `${said.second} as a second in ${said.group}`, why: `${said.second} did not offer to facilitate` });
      }
      const backup = bestWhoOffered(groupAt(at).memberUids, people, potential, strength, taken);
      if (backup) {
        taken.add(backup);
        chosen[at].facilitators.push({ uid: backup, role: "second", offered: true, why: "", bySite: true });
      }
    }
    // A group Claude named nobody for: the site's best guess who offered, unless it is staffed already.
    chosen.forEach((group, at) => {
      if (group.facilitators.length > 0) return;
      const id = groupAt(at).id;
      if (id && staffed.has(id)) return;
      const lead = bestWhoOffered(groupAt(at).memberUids, people, potential, strength, taken);
      if (lead) {
        taken.add(lead);
        group.facilitators.push({ uid: lead, role: "lead", offered: true, why: "", bySite: true });
      }
    });

    const placed = new Set(groups.flatMap((group) => group.memberUids));
    options.push({
      candidate: index,
      title: suggestion.title,
      pros: suggestion.pros,
      cons: suggestion.cons,
      plan: { ...candidate.plan, groups, unplaced: candidate.plan.unplaced.filter((entry) => !placed.has(entry.uid)) },
      groups: chosen,
      movedUids: [...movedUids].sort(),
      preferred: suggestion.option === choice.preferred,
    });
  }

  // Claude kept none it was shown: the site's own, best first.
  if (options.length === 0) {
    candidates.slice(0, MAX_OPTIONS).forEach((candidate, index) => options.push(siteOption(candidate, index, people, strength, staffed)));
  }
  if (!options.some((option) => option.preferred)) options[0].preferred = true;
  return { options, potential, preferredWhy: choice.preferredWhy, notes: choice.notes, dropped };
}
