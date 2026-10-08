import { own } from "@/lib/applications/keys";
import type { ProgrammeSettings, QuestionSetDoc } from "@/lib/applications/model";
import { isId } from "@/lib/applications/normalise";
import type { FormStep } from "@/lib/applications/sections";
import type { Issue } from "@/lib/applications/validate";

/**
 * WHAT EACH STEP IS CALLED.
 *
 * Which steps a person walks through, and in what order, is decided by
 * `stepsFor` in `src/lib/applications/sections.ts` and nowhere else. This
 * module only NAMES them: the label in the progress line ("Step 5 of 10 ·
 * Fellowship questions"), the heading on the step itself, and the words of the
 * Change link on the last step.
 *
 * A question set is named from what it is, not from a list of the sets that
 * exist this term, so a set the committee adds next term reads properly
 * without a change here:
 *
 *  - a general set is named for its kind ("Fellowship questions");
 *  - a stream set is named for itself ("AGI Strategy questions");
 *  - the facilitator set is "Facilitator questions", under the heading
 *    "Facilitating".
 */

/** Just what naming a programme needs, so the form can pass its own shapes. */
type Named = Pick<ProgrammeSettings, "id" | "kind" | "closed">;
type SetLike = Pick<QuestionSetDoc, "id" | "role" | "scope" | "label">;

const FIXED_LABEL: Record<string, string> = {
  about: "About you",
  choose: "Choose",
  rank: "Rank",
  facilitating: "Facilitating",
  availability: "Availability",
  check: "Check and send",
};

const FIXED_HEADING: Record<string, string> = {
  about: "About you",
  choose: "What would you like to do?",
  rank: "Put them in order",
  facilitating: "Would you like to facilitate a group?",
  availability: "When are you free?",
  check: "Check and send",
};

function endsInQuestions(label: string): boolean {
  return label.trim().toLowerCase().endsWith("questions");
}

/** "Fellowship questions", "AGI Strategy questions", "Facilitator questions". */
export function setStepLabel(set: SetLike): string {
  if (set.scope.type === "facilitating") return "Facilitator questions";
  if (set.scope.type === "kind") {
    return set.scope.kind === "incubator" ? "Incubator questions" : "Fellowship questions";
  }
  return endsInQuestions(set.label) ? set.label : `${set.label} questions`;
}

/** The heading over a set's questions. */
export function setHeading(set: SetLike): string {
  if (set.scope.type === "facilitating") return "Facilitating";
  return set.label;
}

/** What follows "Change your" on the last step: "fellowship answers", "AGI Strategy answers". */
export function setChangeLabel(set: SetLike): string {
  if (set.scope.type === "facilitating") return "facilitator answers";
  if (set.scope.type === "kind") {
    return set.scope.kind === "incubator" ? "incubator answers" : "fellowship answers";
  }
  return `${set.label} answers`;
}

export type SetChip = { text: string; tone: "accent" | "neutral" };

/**
 * The small label beside a set's heading, when there is something to say:
 * a general fellowship set is asked once for every fellowship on the form,
 * and an incubator's stream is the one running this term.
 */
export function setChip(set: SetLike, programmes: readonly Named[]): SetChip | null {
  if (set.scope.type === "kind" && set.scope.kind === "fellowship") {
    const open = programmes.filter((programme) => programme.kind === "fellowship" && !programme.closed);
    if (open.length === 2) return { text: "For both fellowships", tone: "accent" };
    if (open.length > 2) return { text: "For every fellowship", tone: "accent" };
    return null;
  }
  if (set.scope.type === "programme") {
    const programmeId = set.scope.programmeId;
    const programme = programmes.find((candidate) => candidate.id === programmeId);
    if (programme?.kind === "incubator") return { text: "This term’s stream", tone: "neutral" };
  }
  return null;
}

/** The label of one step, as the progress line and the section list show it. */
export function stepLabel(step: FormStep, sets: readonly SetLike[]): string {
  if (step.kind !== "questions") return own(FIXED_LABEL, step.kind) ?? step.id;
  const set = sets.find((candidate) => candidate.id === step.setId);
  return set ? setStepLabel(set) : "Questions";
}

/** The heading at the top of one step. */
export function stepHeading(step: FormStep, sets: readonly SetLike[]): string {
  if (step.kind !== "questions") return own(FIXED_HEADING, step.kind) ?? step.id;
  const set = sets.find((candidate) => candidate.id === step.setId);
  return set ? setHeading(set) : "Questions";
}

/** "Step 5 of 10 · Fellowship questions". */
export function progressLine(index: number, total: number, label: string): string {
  return `Step ${index + 1} of ${total} · ${label}`;
}

/** Where in the address bar a step lives: `?step=<id>`. */
export const STEP_PARAM = "step";

const FIXED_STEP_IDS: readonly string[] = ["about", "choose", "rank", "facilitating", "availability", "check"];
const SET_STEP_PREFIX = "set:";

/**
 * True when a value from an address has the SHAPE of a step id: one of the
 * fixed steps, or `set:` and a question set id. Anything else is ignored
 * before it goes any further. Whether the step exists for this person is
 * then a comparison against their own list of steps, never a lookup.
 */
export function isStepId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (FIXED_STEP_IDS.includes(value)) return true;
  return value.startsWith(SET_STEP_PREFIX) && isId(value.slice(SET_STEP_PREFIX.length));
}

/** The step an address names, or -1. */
export function stepIndexOf(steps: readonly FormStep[], id: string | null | undefined): number {
  return id ? steps.findIndex((step) => step.id === id) : -1;
}

/**
 * Where somebody coming back to the form lands.
 *
 * A new application starts at the beginning. An application already sent
 * opens on the last step, which shows everything with a Change link. A draft
 * opens on the first step that still needs something, counting Availability
 * as needing a visit until some time is painted (nothing requires it, but an
 * empty grid is rarely somebody's finished answer).
 */
export function landingStepIndex(
  steps: readonly FormStep[],
  issues: readonly Issue[],
  state: { started: boolean; sent: boolean; hasAvailability: boolean },
): number {
  const last = steps.length - 1;
  if (!state.started) return 0;
  if (state.sent) return last;
  const needing = new Set(issues.map((issue) => issue.step));
  const at = steps.findIndex(
    (step) => needing.has(step.id) || (step.kind === "availability" && !state.hasAvailability),
  );
  return at === -1 ? last : at;
}
