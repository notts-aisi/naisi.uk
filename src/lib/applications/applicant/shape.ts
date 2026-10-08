import { emptyMask, type AvailabilityGrid } from "@/lib/admissions/availability";
import type {
  AboutYou,
  AnswerValue,
  ApplicationContent,
  ApplicationFormFields,
  ProgrammeSettings,
  QuestionSetDoc,
} from "../model";
import { isSafeKey, own } from "./keys";
import type { ApplicantForm, ApplicantProgramme, ApplicantQuestionSet } from "./types";

/**
 * FROM WHAT AN APPLICANT WAS SENT, BACK TO THE SHAPES THE RULES READ.
 *
 * Which steps a person sees, what stops a send and which options a question
 * offers are all decided by the pure functions in `../sections.ts` and
 * `../validate.ts`, and the form in the browser asks those same functions so
 * that the screen and the server cannot disagree. They take the stored
 * shapes; the browser only holds the applicant's projection of them. These
 * two functions rebuild the stored shape around the projection.
 *
 * The fields an applicant was never sent are filled with their EMPTY values
 * (no lead, no reviewers, no places, not scored). That is safe because none
 * of the functions the form calls reads them: they read a programme's id,
 * kind, short name and whether it is closed, and a question's own text, type,
 * options, limit and whether it is required.
 *
 * Pure and free of server imports, so the form can import it.
 */

/** The four form fields the section and validation rules read. */
export type FormShape = Pick<
  ApplicationFormFields,
  "programmeIds" | "programmes" | "questionSetIds" | "asksFacilitating"
>;

function programmeShape(programme: ApplicantProgramme): ProgrammeSettings {
  return {
    id: programme.id,
    kind: programme.kind,
    name: programme.name,
    shortName: programme.shortName,
    pitch: programme.pitch,
    facts: programme.facts,
    starts: programme.starts,
    closed: programme.closed,
    places: null,
    groupCount: null,
    groupSize: "",
    leadUid: null,
    reviewerUids: [],
    useScores: false,
    runId: null,
    courseId: null,
    emailWording: {},
  };
}

export function formShapeOf(form: ApplicantForm): FormShape {
  const programmes: Record<string, ProgrammeSettings> = {};
  const programmeIds: string[] = [];
  for (const programme of form.programmes) {
    if (!isSafeKey(programme.id)) continue;
    programmes[programme.id] = programmeShape(programme);
    programmeIds.push(programme.id);
  }
  return {
    programmeIds,
    programmes,
    questionSetIds: form.questionSetIds,
    asksFacilitating: form.asksFacilitating,
  };
}

export function questionSetsOf(form: ApplicantForm, sets: readonly ApplicantQuestionSet[]): QuestionSetDoc[] {
  return sets.map((set) => ({
    id: set.id,
    roundId: form.id,
    role: set.role,
    scope: set.scope,
    label: set.label,
    intro: "",
    applicantLine: set.applicantLine,
    questions: set.questions.map((question) => ({
      id: question.id,
      text: question.text,
      help: question.help,
      type: question.type,
      options: question.options,
      optionsFromRanking: question.optionsFromRanking,
      wordLimit: question.wordLimit,
      required: question.required,
      scored: false,
    })),
    createdAt: null,
    updatedAt: null,
  }));
}

/** A form nobody has written in yet, opening with the account's own About you. */
export function emptyContent(account: AboutYou, grid: AvailabilityGrid): ApplicationContent {
  return {
    aboutYou: { ...account },
    rankedProgrammeIds: [],
    wantsToFacilitate: null,
    answers: {},
    availability: emptyMask(grid),
    suMembership: null,
  };
}

function sameAnswer(a: AnswerValue | undefined, b: AnswerValue | undefined): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  return a === b;
}

/**
 * True when two contents say the same thing. Used to tell an applicant
 * whether what the form is showing is what they sent. Compare the output of
 * `contentForSend` on both sides, so answers to sets that no longer apply do
 * not count as a change.
 */
export function sameContent(a: ApplicationContent, b: ApplicationContent): boolean {
  const aboutKeys = Object.keys(a.aboutYou) as (keyof AboutYou)[];
  if (!aboutKeys.every((key) => a.aboutYou[key] === b.aboutYou[key])) return false;
  if (a.wantsToFacilitate !== b.wantsToFacilitate || a.suMembership !== b.suMembership) return false;
  if (a.rankedProgrammeIds.length !== b.rankedProgrammeIds.length) return false;
  if (!a.rankedProgrammeIds.every((id, index) => id === b.rankedProgrammeIds[index])) return false;
  if (a.availability.days.join("|") !== b.availability.days.join("|")) return false;
  if (
    a.availability.startMinute !== b.availability.startMinute ||
    a.availability.endMinute !== b.availability.endMinute ||
    a.availability.slotMinutes !== b.availability.slotMinutes
  ) {
    return false;
  }
  const setIds = new Set([...Object.keys(a.answers), ...Object.keys(b.answers)]);
  for (const setId of setIds) {
    const left = own(a.answers, setId) ?? {};
    const right = own(b.answers, setId) ?? {};
    const questionIds = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const questionId of questionIds) {
      if (!sameAnswer(own(left, questionId), own(right, questionId))) return false;
    }
  }
  return true;
}
