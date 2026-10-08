import { own } from "./keys";
import type {
  ApplicationContent,
  ApplicationFormFields,
  ProgrammeSettings,
  QuestionSetDoc,
} from "./model";

/**
 * WHICH PARTS OF THE FORM ONE PERSON SEES.
 *
 * The form is one list of steps for everybody, and a step only appears when
 * it applies: you rank only if you ticked two or more programmes, you see the
 * questions for everybody once whatever you ticked, the fellowship questions
 * once however many fellowships you ticked, a stream's questions only if you
 * ticked that stream, and the facilitator questions only if you said yes. No
 * question is asked twice.
 *
 * Everything here is derived from the form and from what the person has
 * written so far. Nothing is stored, so the form, the check page, the send
 * validation and the review screen all agree about what was asked, because
 * they all ask this module.
 */

type Form = Pick<
  ApplicationFormFields,
  "programmeIds" | "programmes" | "questionSetIds" | "asksFacilitating"
>;

type Ranking = Pick<ApplicationContent, "rankedProgrammeIds">;
type Choices = Pick<ApplicationContent, "rankedProgrammeIds" | "wantsToFacilitate">;

/** The programmes a person can tick: on the form, in its order, and not closed. */
export function openProgrammes(form: Form): ProgrammeSettings[] {
  return form.programmeIds
    .map((id) => own(form.programmes, id))
    .filter(
      (programme): programme is ProgrammeSettings => programme !== undefined && !programme.closed,
    );
}

/**
 * The programmes this person ranked, in their order, as the form knows them.
 * An id the form no longer carries is skipped, so a programme removed after
 * somebody ticked it simply stops counting rather than breaking their page.
 *
 * A ranking is something an applicant typed, so each id is looked up as the
 * form's OWN key (`own`, in `./keys`): an id that names something every
 * object carries is not a programme, and is skipped like any other the form
 * does not hold.
 */
export function rankedProgrammes(form: Form, content: Ranking): ProgrammeSettings[] {
  const out: ProgrammeSettings[] = [];
  for (const id of content.rankedProgrammeIds) {
    const programme = own(form.programmes, id);
    if (programme && !out.includes(programme)) out.push(programme);
  }
  return out;
}

/**
 * Where a programme sits in somebody's ranking: 1 for their 1st choice.
 * Null when they did not rank it.
 */
export function choiceNumber(form: Form, content: Ranking, programmeId: string): number | null {
  const at = rankedProgrammes(form, content).findIndex((p) => p.id === programmeId);
  return at === -1 ? null : at + 1;
}

/** Does this question set apply to somebody who has made these choices? */
export function setApplies(set: QuestionSetDoc, form: Form, content: Choices): boolean {
  const ranked = rankedProgrammes(form, content);
  const scope = set.scope;
  if (scope.type === "facilitating") {
    return form.asksFacilitating && content.wantsToFacilitate === true;
  }
  // Everybody is anybody who has picked a programme the form carries. Nobody
  // is asked these before they have: there is nobody yet to read the answers.
  if (scope.type === "everybody") return ranked.length > 0;
  if (scope.type === "kind") return ranked.some((programme) => programme.kind === scope.kind);
  return ranked.some((programme) => programme.id === scope.programmeId);
}

/**
 * A list of sets with the one for everybody first, and the rest as they were.
 *
 * WHERE THAT SET IS ASKED IS A RULE, NOT A PLACE IN A STORED LIST. The form's
 * own order puts it first when it is made, and every reader that orders sets
 * goes through this as well, so a stored order that says otherwise changes
 * nothing anybody is shown.
 */
export function everybodyFirst<S extends Pick<QuestionSetDoc, "scope">>(sets: readonly S[]): S[] {
  return [
    ...sets.filter((set) => set.scope.type === "everybody"),
    ...sets.filter((set) => set.scope.type !== "everybody"),
  ];
}

/**
 * The question sets in the order the form asks them: the set for everybody,
 * then the form's own order. A set with no questions asks nothing.
 */
export function orderedSets(form: Form, sets: readonly QuestionSetDoc[]): QuestionSetDoc[] {
  const byId = new Map(sets.map((set) => [set.id, set]));
  const out: QuestionSetDoc[] = [];
  for (const id of form.questionSetIds) {
    const set = byId.get(id);
    if (set && set.questions.length > 0) out.push(set);
  }
  return everybodyFirst(out);
}

/**
 * The sets this person is asked, in the order they are asked them.
 *
 * That is the set for everybody and then the form's order (`orderedSets`),
 * with one exception: stream sets that sit next to each other are asked in
 * the order the person RANKED their programmes.
 * Somebody who put AGI Strategy first answers its questions before Technical
 * AI Safety's, whichever the committee happened to list first.
 */
export function applicableSets(
  form: Form,
  sets: readonly QuestionSetDoc[],
  content: Choices,
): QuestionSetDoc[] {
  const asked = orderedSets(form, sets).filter((set) => setApplies(set, form, content));
  const rankOf = (set: QuestionSetDoc): number =>
    set.scope.type === "programme" ? content.rankedProgrammeIds.indexOf(set.scope.programmeId) : -1;
  const out: QuestionSetDoc[] = [];
  let run: QuestionSetDoc[] = [];
  const flush = () => {
    // A stable sort: two sets on one programme keep the form's order.
    run.sort((a, b) => rankOf(a) - rankOf(b));
    out.push(...run);
    run = [];
  };
  for (const set of asked) {
    if (set.role === "stream" && set.scope.type === "programme") run.push(set);
    else {
      flush();
      out.push(set);
    }
  }
  flush();
  return out;
}

/**
 * The stream sets that belong to one programme, in order. These are the sets
 * a programme's reviewers score, and the only ones that can be scored.
 */
export function streamSetsFor(
  form: Form,
  sets: readonly QuestionSetDoc[],
  programmeId: string,
): QuestionSetDoc[] {
  return orderedSets(form, sets).filter(
    (set) =>
      set.role === "stream" &&
      set.scope.type === "programme" &&
      set.scope.programmeId === programmeId,
  );
}

export type StepKind =
  | "about"
  | "choose"
  | "rank"
  | "facilitating"
  | "questions"
  | "availability"
  | "check";

export type FormStep = {
  /** Stable for a given form: the step's kind, or `set:<id>` for a question set. */
  id: string;
  kind: StepKind;
  /** Present on a `questions` step. */
  setId: string | null;
};

/**
 * The steps one person walks through, in order. The count changes as they
 * tick and untick, which is intended: "Step 5 of 10" is true for them.
 */
export function stepsFor(
  form: Form,
  sets: readonly QuestionSetDoc[],
  content: Choices,
): FormStep[] {
  const steps: FormStep[] = [
    { id: "about", kind: "about", setId: null },
    { id: "choose", kind: "choose", setId: null },
  ];
  // Ranking one thing is not a question.
  if (rankedProgrammes(form, content).length >= 2) {
    steps.push({ id: "rank", kind: "rank", setId: null });
  }
  if (form.asksFacilitating) steps.push({ id: "facilitating", kind: "facilitating", setId: null });
  for (const set of applicableSets(form, sets, content)) {
    steps.push({ id: `set:${set.id}`, kind: "questions", setId: set.id });
  }
  steps.push({ id: "availability", kind: "availability", setId: null });
  steps.push({ id: "check", kind: "check", setId: null });
  return steps;
}
