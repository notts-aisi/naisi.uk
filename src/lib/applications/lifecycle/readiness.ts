import { formatRoundDeadline } from "@/lib/admissions/window";
import { londonDateKey } from "@/lib/courses/weekPlan";
import type { AdmissionRoundDoc } from "@/lib/firestore/admissionRounds";
import { own } from "../keys";
import {
  PROGRAMME_KINDS,
  type ApplicationFormFields,
  type ApplicationQuestion,
  type ProgrammeKind,
  type ProgrammeSettings,
  type QuestionSetDoc,
} from "../model";
import { applicableSets, openProgrammes } from "../sections";

/**
 * READINESS: everything that has to be true before an application form may
 * open, checked in one place and reported as a list.
 *
 * ## Why it is one predicate
 *
 * A form is made over days: an admin adds programmes, each lead fills in
 * their own, and the questions are written last. No save can know whether the
 * form is finished, so no save is asked to. The one moment that matters is
 * the move to open, because from then on a real person can reach the form,
 * and once one of them has sent an application the questions lock.
 *
 * The term page's panel and the status route both call `formReadiness`, so
 * what the panel lists as missing is exactly what the route refuses on. A
 * second opinion in either place would be a screen that says ready beside a
 * button that says no.
 *
 * ## What is on the list, and what is not
 *
 * Every line is something an applicant would meet: a window that is set and
 * still ahead, a day they are told they will hear, a programme to tick,
 * somebody who can read what they send, and questions that can be answered.
 * Nothing is here because it would be tidy. A programme with no places set,
 * no pitch or no scored question can still take applications, so none of
 * those holds a form shut.
 *
 * WHICH QUESTION SETS COUNT is asked of `applicableSets`, the function the
 * form itself uses to decide what one person is shown. It is handed somebody
 * who ticked every programme that is open and said yes to facilitating: the
 * sets that person is shown are exactly the sets anybody can be shown. A set
 * with no questions asks nothing, so it reads here as it reads to them, as
 * not there.
 *
 * EVERYBODY WHO APPLIES IS ASKED SOMETHING. That is what the lines about
 * general questions hold, and there are two ways to meet it. A set for
 * everybody with a question in it meets it for every programme at once, and
 * then no kind of programme needs a general set of its own: one that is
 * missing or empty asks nobody anything, like a stream with no questions.
 * Without it, each kind with a programme open needs its own general set, as
 * it always has.
 *
 * Pure. The caller reads the documents and says which leads still have the
 * standing to be one.
 */

export type FormReadinessCheckId =
  | "window"
  | "decisions"
  | "programmes"
  | "leads"
  | "general-everybody"
  | "general-fellowship"
  | "general-incubator"
  | "facilitator"
  | "questions";

export type FormReadinessCheck = {
  id: FormReadinessCheckId;
  /** What is being asserted, in the affirmative: it reads as a tick. */
  label: string;
  ok: boolean;
  /** What to do about it. Empty when `ok`. */
  hint: string;
  /**
   * Where it is put right, as a path under the form's own page: "" for the
   * term page, "/form" for the application form, "/programmes/<id>/setup" for
   * one programme's settings. Null when `ok`.
   */
  fixAt: string | null;
};

type Form = Pick<
  ApplicationFormFields,
  "programmeIds" | "programmes" | "questionSetIds" | "asksFacilitating"
>;

/**
 * What readiness depends on. Structural, so the predicate can be run without
 * building a whole round, and so it cannot quietly start reading another
 * field. The three dates are the round's own (when it opens, when it closes,
 * and the day everybody hears), under the round's own names.
 */
export type FormReadinessInput = Pick<
  AdmissionRoundDoc,
  "opensAt" | "closesAt" | "decisionsByDate"
> & {
  form: Form;
  sets: readonly QuestionSetDoc[];
  /**
   * The uids, among the form's leads, whose account is still an admin's or
   * an SU-recognised committee member's. Worked out by the caller from each
   * lead's live user document.
   */
  leadsInStanding: ReadonlySet<string>;
};

export type FormReadiness = {
  ready: boolean;
  checks: FormReadinessCheck[];
  /** The failing subset, in the same order. What the refusal lists. */
  unmet: FormReadinessCheck[];
};

const FORM = "/form";

/** How a kind of programme reads in a sentence about ticking one. */
const KIND_NOUN: Record<ProgrammeKind, string> = {
  fellowship: "a fellowship",
  incubator: "the incubator",
};

const GENERAL_ID: Record<ProgrammeKind, FormReadinessCheckId> = {
  fellowship: "general-fellowship",
  incubator: "general-incubator",
};

const GENERAL_LABEL: Record<ProgrammeKind, string> = {
  fellowship: "People who tick a fellowship are asked the fellowship questions",
  incubator: "People who tick the incubator are asked the incubator questions",
};

const EVERYBODY_LABEL = "Everybody who applies is asked the questions for everyone";

function passed(id: FormReadinessCheckId, label: string): FormReadinessCheck {
  return { id, label, ok: true, hint: "", fixAt: null };
}

function failed(
  id: FormReadinessCheckId,
  label: string,
  hint: string,
  fixAt: string,
): FormReadinessCheck {
  return { id, label, ok: false, hint, fixAt };
}

/** "A", "A and B", "A, B and C". */
function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function windowCheck(input: FormReadinessInput, now: Date): FormReadinessCheck {
  const label = "Applications open and close at set times, and the close is still ahead";
  const { opensAt, closesAt } = input;
  const fail = (hint: string) => failed("window", label, hint, FORM);
  if (!opensAt && !closesAt) return fail("Set when applications open and when they close.");
  if (!opensAt) return fail("Set when applications open.");
  if (!closesAt) {
    return fail(
      "Set when applications close. Without a close the form never shuts, and nobody can be told a deadline.",
    );
  }
  if (closesAt.getTime() <= opensAt.getTime()) {
    return fail("Applications have to close after they open. Move one of the two.");
  }
  if (closesAt.getTime() <= now.getTime()) {
    return fail(
      `The close, ${formatRoundDeadline(closesAt)}, has already passed, so opening would open a window that is over. Move the close to a time that is still ahead.`,
    );
  }
  return passed("window", label);
}

function decisionsCheck(input: FormReadinessInput): FormReadinessCheck {
  const label = "Everybody is told the day they will hear";
  if (!input.decisionsByDate) {
    return failed(
      "decisions",
      label,
      "Set the day everybody hears. Applicants are shown it.",
      FORM,
    );
  }
  // A day, compared with the day of the close in London. The same day passes,
  // as it does when the dates are saved: the promise is about a day, and the
  // day does not end before a close inside it.
  if (input.closesAt && input.decisionsByDate < londonDateKey(input.closesAt)) {
    return failed(
      "decisions",
      label,
      "Everyone hears after applications close. Pick a later day.",
      FORM,
    );
  }
  return passed("decisions", label);
}

function programmesCheck(form: Form, open: readonly ProgrammeSettings[]): FormReadinessCheck {
  const label = "At least one programme is taking applications";
  if (open.length > 0) return passed("programmes", label);
  const onForm = form.programmeIds.filter((id) => own(form.programmes, id) !== undefined);
  return failed(
    "programmes",
    label,
    onForm.length === 0
      ? "Add a programme. With none, an applicant has nothing to tick."
      : "Every programme on this form is closed. Reopen one in its settings, or add another.",
    "",
  );
}

function leadsCheck(
  open: readonly ProgrammeSettings[],
  leadsInStanding: ReadonlySet<string>,
): FormReadinessCheck {
  const label = "Every programme has a lead who can read its applications";
  const unled = open.filter((programme) => !programme.leadUid);
  const fallen = open.filter(
    (programme) => programme.leadUid !== null && !leadsInStanding.has(programme.leadUid),
  );
  if (unled.length === 0 && fallen.length === 0) return passed("leads", label);

  const parts: string[] = [];
  if (unled.length > 0) {
    parts.push(
      `Name a lead for ${listOf(unled.map((programme) => programme.shortName))}. A programme’s lead is who decides its applications.`,
    );
  }
  if (fallen.length > 0) {
    const names = listOf(fallen.map((programme) => programme.shortName));
    parts.push(
      fallen.length === 1
        ? `The lead of ${names} is no longer an admin or SU-recognised committee, so they cannot read its applications. Name another.`
        : `The leads of ${names} are no longer admins or SU-recognised committee, so they cannot read those applications. Name others.`,
    );
  }
  const first = unled[0] ?? fallen[0];
  return failed("leads", label, parts.join(" "), `/programmes/${first.id}/setup`);
}

/** The set on the form's own order that is for everybody who ticks this kind, whatever it holds. */
function listedGeneralSet(
  form: Form,
  sets: readonly QuestionSetDoc[],
  kind: ProgrammeKind,
): QuestionSetDoc | undefined {
  return sets.find(
    (set) =>
      set.scope.type === "kind" && set.scope.kind === kind && form.questionSetIds.includes(set.id),
  );
}

function generalCheck(
  form: Form,
  sets: readonly QuestionSetDoc[],
  shown: readonly QuestionSetDoc[],
  kind: ProgrammeKind,
): FormReadinessCheck {
  const id = GENERAL_ID[kind];
  const label = GENERAL_LABEL[kind];
  if (shown.some((set) => set.scope.type === "kind" && set.scope.kind === kind)) {
    return passed(id, label);
  }
  const empty = listedGeneralSet(form, sets, kind);
  if (empty) {
    return failed(
      id,
      label,
      `“${empty.label}” has no questions yet. Add at least one: everybody who ticks ${KIND_NOUN[kind]} answers it, and questions lock once somebody applies.`,
      `${FORM}?set=${empty.id}`,
    );
  }
  return failed(
    id,
    label,
    `There is no question set for everybody who ticks ${KIND_NOUN[kind]}. Add one in the application form, with at least one question.`,
    FORM,
  );
}

function facilitatorCheck(
  form: Form,
  sets: readonly QuestionSetDoc[],
  shown: readonly QuestionSetDoc[],
): FormReadinessCheck {
  const label = "People who say yes to facilitating are asked the facilitator questions";
  if (shown.some((set) => set.scope.type === "facilitating")) return passed("facilitator", label);
  const empty = sets.find(
    (set) => set.scope.type === "facilitating" && form.questionSetIds.includes(set.id),
  );
  if (empty) {
    return failed(
      "facilitator",
      label,
      `“${empty.label}” has no questions yet. Add at least one, or switch off the question about facilitating.`,
      `${FORM}?set=${empty.id}`,
    );
  }
  return failed(
    "facilitator",
    label,
    "There are no facilitator questions. Add a set for them, or switch off the question about facilitating.",
    FORM,
  );
}

/** What stops one question being answered, as the end of a sentence, or null. */
function questionProblem(question: ApplicationQuestion): string | null {
  if (!question.text.trim()) return "has no text";
  if (question.type === "rank" && question.options.length < 2) {
    return "has fewer than 2 options to put in order";
  }
  const offersOptions = question.type === "choice" || question.type === "multi" || question.type === "scale";
  if (offersOptions && !question.optionsFromRanking && question.options.length < 2) {
    return "has fewer than 2 options to pick from";
  }
  return null;
}

/** How many broken questions the hint names before it counts the rest. */
const NAMED_QUESTIONS = 3;

function questionsCheck(shown: readonly QuestionSetDoc[]): FormReadinessCheck {
  const label = "Every question an applicant is shown can be answered";
  const problems: { setId: string; sentence: string }[] = [];
  for (const set of shown) {
    set.questions.forEach((question, at) => {
      const problem = questionProblem(question);
      if (problem) {
        problems.push({ setId: set.id, sentence: `Question ${at + 1} in “${set.label}” ${problem}.` });
      }
    });
  }
  if (problems.length === 0) return passed("questions", label);
  const named = problems.slice(0, NAMED_QUESTIONS).map((problem) => problem.sentence);
  const rest = problems.length - named.length;
  if (rest > 0) named.push(rest === 1 ? "So does 1 more." : `So do ${rest} more.`);
  named.push(problems.length === 1 ? "Finish it or delete it." : "Finish each one or delete it.");
  return failed("questions", label, named.join(" "), `${FORM}?set=${problems[0].setId}`);
}

/**
 * Is this form ready to open, and if not, what is left?
 *
 * A check that cannot apply is left off the list, so the panel never shows a
 * tick nobody earned: with no programme open there is no lead to ask about
 * and no question anybody would be shown, and a form that does not ask about
 * facilitating has no facilitator questions to want.
 */
export function formReadiness(input: FormReadinessInput, now: Date): FormReadiness {
  const { form, sets } = input;
  const open = openProgrammes(form);
  // Somebody who ticked everything open and said yes to facilitating is shown
  // every set anybody can be shown.
  const shown = applicableSets(form, sets, {
    rankedProgrammeIds: open.map((programme) => programme.id),
    wantsToFacilitate: true,
  });

  const checks: FormReadinessCheck[] = [
    windowCheck(input, now),
    decisionsCheck(input),
    programmesCheck(form, open),
  ];
  if (open.length > 0) {
    checks.push(leadsCheck(open, input.leadsInStanding));
    if (shown.some((set) => set.scope.type === "everybody")) {
      // One set with a question in it, asked of everybody: nobody who applies
      // is asked nothing, whichever kind of programme they tick.
      checks.push(passed("general-everybody", EVERYBODY_LABEL));
    } else {
      for (const kind of PROGRAMME_KINDS) {
        if (open.some((programme) => programme.kind === kind)) {
          checks.push(generalCheck(form, sets, shown, kind));
        }
      }
    }
  }
  if (form.asksFacilitating) checks.push(facilitatorCheck(form, sets, shown));
  if (shown.length > 0) checks.push(questionsCheck(shown));

  const unmet = checks.filter((check) => !check.ok);
  return { ready: unmet.length === 0, checks, unmet };
}

/** The refusal the status route answers with: one sentence a blocker. */
export function readinessRefusal(unmet: readonly FormReadinessCheck[]): string {
  return `This form is not ready to open. ${unmet.map((check) => check.hint).join(" ")}`;
}
