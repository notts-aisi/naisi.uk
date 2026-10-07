import type { AvailabilityGrid } from "@/lib/admissions/availability";
import type {
  ApplicationFormFields,
  ApplicationQuestion,
  ProgrammeKind,
  ProgrammeSettings,
  QuestionSetDoc,
  QuestionSetRole,
  QuestionSetScope,
  QuestionType,
} from "../model";
import { everybodyFirst } from "../sections";
import { namedAsQuestions } from "../words";
import { own } from "./own";

/**
 * HOW THE EDITOR TALKS ABOUT THE FORM'S SECTIONS.
 *
 * The application form is one list of sections. Some are built in (About you,
 * Choose, Rank, Facilitating, Availability, Check and send) and the rest are
 * question sets the committee writes. This module is the editor's vocabulary
 * for them: which family a set belongs to, where a new set goes, and the
 * sentences that say who each one is shown to.
 *
 * Every sentence here is derived from the form. Nothing is stored, so the
 * list on the left of the editor and the summary on a programme's settings
 * cannot disagree with what `sections.ts` will actually ask.
 *
 * Pure, with no server import: the routes, the pages and the browser all read
 * these.
 */

type Form = Pick<ApplicationFormFields, "programmeIds" | "programmes" | "questionSetIds">;
type Scoped = Pick<QuestionSetDoc, "scope">;

/** What the form calls a general set when it makes one itself. */
export const GENERAL_SET_LABEL: Record<ProgrammeKind, string> = {
  fellowship: "Fellowships",
  incubator: "Research incubator",
};

/** What the form calls the facilitator set when it makes one itself. */
export const FACILITATOR_SET_LABEL = "Facilitator questions";

/** The chip beside a set's name. */
export const SET_ROLE_LABEL: Record<QuestionSetRole, string> = {
  general: "General",
  stream: "Stream",
  facilitator: "Facilitator",
};

/** Why a set's Scored switch cannot be turned on, or null when it can. */
export function scoredRefusal(role: QuestionSetRole): string | null {
  if (role === "general") return "General questions aren’t scored.";
  if (role === "facilitator") return "Facilitator questions aren’t scored.";
  return null;
}

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  short: "Short answer",
  long: "Long answer",
  choice: "Choice",
  multi: "Multi-choice",
  scale: "Scale",
};

/** "1 question", "2 questions". */
export function questionCountLabel(count: number): string {
  return count === 1 ? "1 question" : `${count} questions`;
}

/** True when any of a set's questions is scored. Only a stream set can be. */
export function isScoredSet(set: Pick<QuestionSetDoc, "role" | "questions">): boolean {
  return set.role === "stream" && set.questions.some((question) => question.scored);
}

/**
 * The chips under a question in the list: its type, its limit and whether it
 * has to be answered.
 */
export function questionChips(question: ApplicationQuestion): string[] {
  const chips = [QUESTION_TYPE_LABEL[question.type]];
  if (question.type === "short" || question.type === "long") {
    if (question.wordLimit !== null) chips.push(`${question.wordLimit} words`);
  } else if (question.type === "choice" && question.optionsFromRanking) {
    chips.push("From their ranking");
  } else if (question.type === "scale") {
    chips.push(question.options.length === 1 ? "1 point" : `${question.options.length} points`);
  } else {
    chips.push(question.options.length === 1 ? "1 option" : `${question.options.length} options`);
  }
  return chips;
}

// ---------------------------------------------------------------------------
// Families and order
// ---------------------------------------------------------------------------

/**
 * The group a set is shown with in the editor: the general set for a kind of
 * programme sits with that kind's streams, and the set for everybody stands
 * by itself. `unplaced` is a stream whose programme is no longer on the form.
 */
export type SetFamily = ProgrammeKind | "everybody" | "facilitating" | "unplaced";

export function familyOf(set: Scoped, form: Pick<Form, "programmes">): SetFamily {
  const scope = set.scope;
  switch (scope.type) {
    case "everybody":
      return "everybody";
    case "facilitating":
      return "facilitating";
    case "kind":
      return scope.kind;
    case "programme":
      return own(form.programmes, scope.programmeId)?.kind ?? "unplaced";
  }
}

/** The role a scope gives a set. The same rule the reader applies. */
export function roleForScope(scope: QuestionSetScope): QuestionSetRole {
  switch (scope.type) {
    case "everybody":
    case "kind":
      return "general";
    case "programme":
      return "stream";
    case "facilitating":
      return "facilitator";
  }
}

/**
 * The form's order with a new set added where it belongs.
 *
 * The set for everybody goes first, because it is asked first. Any other set
 * joins the end of its own family, so a stream lands under its general set
 * and beside its sibling streams. A family the form has not met yet goes
 * after every programme's questions and before the facilitator questions,
 * which stay last because they are asked last.
 */
export function orderWithNewSet(
  order: readonly string[],
  sets: readonly (Scoped & { id: string })[],
  form: Pick<Form, "programmes">,
  added: Scoped & { id: string },
): string[] {
  const byId = new Map(sets.map((set) => [set.id, set]));
  const family = familyOf(added, form);
  const next = order.filter((id) => id !== added.id);
  if (family === "everybody") return [added.id, ...next];
  let after = -1;
  let firstFacilitating = -1;
  next.forEach((id, at) => {
    const set = byId.get(id);
    if (!set) return;
    const itsFamily = familyOf(set, form);
    if (itsFamily === family) after = at;
    if (itsFamily === "facilitating" && firstFacilitating === -1) firstFacilitating = at;
  });
  const at =
    after !== -1
      ? after + 1
      : family === "facilitating" || firstFacilitating === -1
        ? next.length
        : firstFacilitating;
  next.splice(at, 0, added.id);
  return next;
}

// ---------------------------------------------------------------------------
// Who sees a set
// ---------------------------------------------------------------------------

function openOfKind(form: Form, kind: ProgrammeKind): ProgrammeSettings[] {
  return form.programmeIds
    .map((id) => own(form.programmes, id))
    .filter(
      (programme): programme is ProgrammeSettings =>
        programme !== undefined && programme.kind === kind && !programme.closed,
    );
}

/** "the incubator" while the form has one, "an incubator" once it has more. */
function incubatorPhrase(form: Form): string {
  return openOfKind(form, "incubator").length > 1 ? "an incubator" : "the incubator";
}

/** The line under a set's name in the list: "People who tick either fellowship". */
export function whoSees(set: Scoped & Pick<QuestionSetDoc, "label">, form: Form): string {
  const scope = set.scope;
  if (scope.type === "everybody") return "Everyone, whatever they tick";
  if (scope.type === "facilitating") return "People who say yes to facilitating";
  if (scope.type === "kind") {
    if (scope.kind === "incubator") return `People who tick ${incubatorPhrase(form)}`;
    return openOfKind(form, "fellowship").length === 2
      ? "People who tick either fellowship"
      : "People who tick a fellowship";
  }
  const programme = own(form.programmes, scope.programmeId);
  if (!programme) return "Nobody. Its programme is no longer on the form";
  if (programme.closed) return `Nobody while ${programme.shortName} is closed`;
  if (programme.kind === "incubator") {
    return openOfKind(form, "incubator").length > 1
      ? `Everyone who ticks ${programme.shortName}`
      : "Everyone who ticks the incubator";
  }
  return `People who tick ${programme.shortName}`;
}

/** The sentence under an open set's heading, for the committee. */
export function describeSet(
  set: Scoped,
  form: Form,
  sets: readonly Scoped[],
): string {
  const scope = set.scope;
  if (scope.type === "everybody") {
    return "Asked once, to everyone, before every other set. The lead and reviewers of each programme they pick read the answers.";
  }
  if (scope.type === "facilitating") return "Asked to anyone who says yes to facilitating.";
  if (scope.type === "kind") {
    return scope.kind === "incubator"
      ? `Asked once, to anyone who ticks ${incubatorPhrase(form)}.`
      : "Asked once, to anyone who ticks a fellowship.";
  }
  const programme = own(form.programmes, scope.programmeId);
  if (!programme) return "Nobody sees these. The programme they belonged to is no longer on the form.";
  if (programme.closed) return `Nobody sees these while ${programme.shortName} is closed.`;
  const hasGeneral = sets.some(
    (other) => other.scope.type === "kind" && other.scope.kind === programme.kind,
  );
  const afterGeneral = hasGeneral
    ? programme.kind === "incubator"
      ? " after the incubator questions"
      : " after the fellowship questions"
    : "";
  if (programme.kind === "incubator" && openOfKind(form, "incubator").length <= 1) {
    return `Everyone who ticks the incubator sees these${afterGeneral}.`;
  }
  return `People who tick ${programme.shortName} see these${afterGeneral}.`;
}

/** "A", "A and B", "A, B and C". */
function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The sets one programme's applicants are asked, in the order they are asked:
 * the set for everybody, the general sets for its kind and its own streams. A
 * set with no questions is kept, because the programme's settings say so
 * rather than hide it.
 */
export function setsForProgramme<S extends Scoped & { id: string }>(
  form: Form,
  sets: readonly S[],
  programmeId: string,
): S[] {
  const programme = own(form.programmes, programmeId);
  if (!programme) return [];
  const byId = new Map(sets.map((set) => [set.id, set]));
  const out: S[] = [];
  for (const id of form.questionSetIds) {
    const set = byId.get(id);
    if (!set) continue;
    const scope = set.scope;
    if (scope.type === "everybody") out.push(set);
    if (scope.type === "kind" && scope.kind === programme.kind) out.push(set);
    if (scope.type === "programme" && scope.programmeId === programmeId) out.push(set);
  }
  return everybodyFirst(out);
}

/**
 * What a programme's settings call one of its sets: "Fellowship questions,
 * shared with Technical AI Safety", "AGI Strategy questions", "Shared
 * questions, asked of everyone".
 */
export function summaryLabel(
  set: Scoped & Pick<QuestionSetDoc, "label">,
  form: Form,
  programmeId: string,
): string {
  const scope = set.scope;
  if (scope.type === "everybody") return `${namedAsQuestions(set.label)}, asked of everyone`;
  if (scope.type !== "kind") {
    return /questions$/i.test(set.label.trim()) ? set.label.trim() : `${set.label.trim()} questions`;
  }
  const base = scope.kind === "incubator" ? "Incubator questions" : "Fellowship questions";
  const others = openOfKind(form, scope.kind)
    .filter((programme) => programme.id !== programmeId)
    .map((programme) => programme.shortName);
  return others.length > 0 ? `${base}, shared with ${listNames(others)}` : base;
}

// ---------------------------------------------------------------------------
// The built-in sections
// ---------------------------------------------------------------------------

export type FixedSection = {
  id: "about" | "choose" | "rank" | "facilitating" | "availability" | "check";
  label: string;
  detail: string;
};

/** "9am", "9pm", "9:30am", from minutes after midnight. */
function clockLabel(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  const rest = minute % 60;
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return rest === 0 ? `${twelve}${suffix}` : `${twelve}:${String(rest).padStart(2, "0")}${suffix}`;
}

/** The built-in sections asked before the question sets. */
export function fixedSectionsBefore(
  form: Pick<ApplicationFormFields, "asksFacilitating">,
): FixedSection[] {
  const sections: FixedSection[] = [
    { id: "about", label: "About you", detail: "Same as joining. Edit in Site settings › Sign-up questions" },
    { id: "choose", label: "Choose", detail: "The programmes open this term" },
    { id: "rank", label: "Rank", detail: "Shows when they tick 2 or more" },
  ];
  if (form.asksFacilitating) {
    sections.push({ id: "facilitating", label: "Facilitating", detail: "Yes or Not this time" });
  }
  return sections;
}

/** The built-in sections asked after the question sets. */
export function fixedSectionsAfter(grid: AvailabilityGrid): FixedSection[] {
  return [
    {
      id: "availability",
      label: "Availability",
      detail: `${grid.slotMinutes}-minute slots, ${clockLabel(grid.startMinute)} to ${clockLabel(grid.endMinute)}`,
    },
    { id: "check", label: "Check and send", detail: "Includes the SU membership question" },
  ];
}
