import { AVAILABILITY_DAYS, normalizeAvailabilityMask } from "@/lib/admissions/availability";
import { STATUSES_WITH_GRADUATION, STATUS_LABELS } from "@/lib/firestore/users";
import {
  APPLICATION_LIMITS,
  type AboutYou,
  type AnswerValue,
  type Answers,
  type ApplicationContent,
  type ApplicationQuestion,
  type QuestionSetDoc,
} from "../model";
import { isId, normaliseContent, type ApplicationForm } from "../normalise";
import { openProgrammes, orderedSets } from "../sections";
import { optionsFor } from "../validate";
import { withAccountEmail } from "./account";
import { hasOwn, isSafeKey, own } from "./keys";

/**
 * READING A DRAFT OFF THE WIRE, AND CLEANING ONE BEFORE IT IS SENT.
 *
 * A draft is allowed to be half written: a programme ticked and none of its
 * questions answered, an answer over its word limit, a required box still
 * empty. None of that is refused here. Sending is the one moment the whole
 * application is held to the form (`issuesFor`), and a save that refused an
 * unfinished form would be a form nobody could put down.
 *
 * What this module does is CLEAN: it keeps only what this form could have
 * asked for, in the shape the form asks for it.
 *
 *  - The programmes in somebody's order are programmes ON THIS FORM, found on
 *    the form's own list and never by looking an id up as a key (see
 *    `./keys.ts` for why). A save keeps only the ones still taking
 *    applications. A send keeps a closed one so that `issuesFor` can refuse
 *    it in words, and then checks the result against the open list again.
 *  - An answer is to a question on this form, and is the kind of value that
 *    question collects: text for a text question, one of the options for a
 *    choice, a point that exists on the scale. Anything else is dropped, so a
 *    stored draft never holds a value the send would have no way to read.
 *  - "What do you do at UoN?" is one of the answers the site offers, or blank.
 *  - The availability grid's geometry is the FORM'S. Only the painted days
 *    are taken from the request. A request that brought its own start time
 *    would store an answer whose first slot means one hour to the applicant
 *    and another to everybody who reads it.
 *  - The university email is the account's (see `./account.ts`).
 *
 * Pure, so the whole clean-up is executed by
 * `tests/applications-apply-draft.test.mjs`.
 */

export type DraftError = { error: string };

export function isDraftError(v: ApplicationContent | DraftError): v is DraftError {
  return "error" in v;
}

const UNREADABLE = "Your application arrived in a shape this site cannot read. Reload the page and try again.";

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** The ids of the programmes that are on the form and taking applications, in the form's order. */
export function openProgrammeIds(form: ApplicationForm): string[] {
  return openProgrammes(form)
    .map((programme) => programme.id)
    .filter((id) => isId(id) && hasOwn(form.programmes, id));
}

/**
 * The part of a ranking that names programmes on this form, in the order
 * given and without repeats. `openOnly` also drops a programme that is not
 * taking applications.
 */
export function rankingOnForm(
  form: ApplicationForm,
  ids: readonly string[],
  openOnly: boolean,
): string[] {
  const allowed = openOnly
    ? openProgrammeIds(form)
    : form.programmeIds.filter((id) => isId(id) && hasOwn(form.programmes, id));
  const out: string[] = [];
  for (const id of ids) {
    if (isId(id) && allowed.includes(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** One answer, cleaned for the question it answers, or undefined when it is not an answer to it. */
function cleanAnswer(
  question: ApplicationQuestion,
  value: AnswerValue | undefined,
  options: readonly string[],
): AnswerValue | undefined {
  const L = APPLICATION_LIMITS;
  if (value === undefined) return undefined;
  if (question.type === "short" || question.type === "long") {
    if (typeof value !== "string") return undefined;
    const cap = question.type === "short" ? L.shortAnswerChars : L.longAnswerChars;
    return value.slice(0, cap);
  }
  if (question.type === "choice") {
    return typeof value === "string" && options.includes(value) ? value : undefined;
  }
  if (question.type === "multi") {
    if (!Array.isArray(value)) return undefined;
    // In the question's own order, so two saves of the same ticks store the same list.
    return options.filter((option) => value.includes(option));
  }
  // scale: the index of a point on it.
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < options.length
    ? value
    : undefined;
}

function cleanAnswers(
  given: Answers,
  form: ApplicationForm,
  sets: readonly QuestionSetDoc[],
  ranking: Pick<ApplicationContent, "rankedProgrammeIds">,
): Answers {
  const out: Answers = {};
  // The form's own sets and questions are walked, and each is looked for
  // among what was given. Nothing given is ever used as a key.
  for (const set of orderedSets(form, sets)) {
    if (!isSafeKey(set.id)) continue;
    const answers = own(given, set.id);
    if (!answers || typeof answers !== "object") continue;
    const kept: Record<string, AnswerValue> = {};
    for (const question of set.questions) {
      if (!isSafeKey(question.id)) continue;
      const cleaned = cleanAnswer(question, own(answers, question.id), optionsFor(question, form, ranking));
      if (cleaned !== undefined) kept[question.id] = cleaned;
    }
    out[set.id] = kept;
  }
  return out;
}

function cleanAboutYou(about: AboutYou, account: AboutYou): AboutYou {
  // One of the answers the site offers, held as its own key: `in` would also
  // say yes to every name an object inherits.
  const status = hasOwn(STATUS_LABELS, about.status) ? about.status : "";
  const graduates = (STATUSES_WITH_GRADUATION as readonly string[]).includes(status);
  return withAccountEmail(
    {
      preferredName: about.preferredName.trim(),
      universityEmail: "",
      universityEmailVerified: false,
      status,
      statusOther: status === "other" ? about.statusOther.trim() : "",
      subject: about.subject.trim(),
      // Asked only of people on a course that ends, so it is kept only for them.
      expectedGraduation: graduates ? about.expectedGraduation : "",
      motivation: about.motivation,
      interests: about.interests,
    },
    account,
  );
}

/**
 * A content cleaned against the form. `ranking` says which programmes may
 * stay in the person's order: `"open"` for a save, `"on-form"` for a send
 * (see the note at the top). The availability is passed through; a request's
 * geometry is replaced by `readDraft` below.
 */
export function cleanContent(
  content: ApplicationContent,
  form: ApplicationForm,
  sets: readonly QuestionSetDoc[],
  account: AboutYou,
  ranking: "open" | "on-form",
): ApplicationContent {
  const rankedProgrammeIds = rankingOnForm(form, content.rankedProgrammeIds, ranking === "open");
  return {
    aboutYou: cleanAboutYou(content.aboutYou, account),
    rankedProgrammeIds,
    wantsToFacilitate: form.asksFacilitating ? content.wantsToFacilitate : null,
    answers: cleanAnswers(content.answers, form, sets, { rankedProgrammeIds }),
    availability: content.availability,
    suMembership: content.suMembership,
  };
}

/**
 * The draft a request carries, cleaned against the form, or the sentence to
 * refuse it with. `account` is the caller's own About you from their profile.
 */
export function readDraft(
  raw: unknown,
  form: ApplicationForm,
  sets: readonly QuestionSetDoc[],
  account: AboutYou,
): ApplicationContent | DraftError {
  if (!isRecord(raw)) return { error: UNREADABLE };
  for (const key of ["aboutYou", "answers", "availability"] as const) {
    const part = own(raw, key);
    if (part !== undefined && part !== null && !isRecord(part)) return { error: UNREADABLE };
  }
  const ranked = own(raw, "rankedProgrammeIds");
  if (ranked !== undefined && !Array.isArray(ranked)) return { error: UNREADABLE };
  const availability = own(raw, "availability");
  const days = isRecord(availability) ? own(availability, "days") : undefined;
  if (days !== undefined && !Array.isArray(days)) return { error: UNREADABLE };
  if (Array.isArray(days) && days.length > AVAILABILITY_DAYS) {
    return { error: "That is more days than the availability grid has." };
  }

  const grid = form.round.availabilityGrid;
  // The shape first (lengths, types, caps), then what this form allows.
  const cleaned = cleanContent(normaliseContent(raw, grid), form, sets, account, "open");
  return {
    aboutYou: cleaned.aboutYou,
    rankedProgrammeIds: cleaned.rankedProgrammeIds,
    wantsToFacilitate: cleaned.wantsToFacilitate,
    answers: cleaned.answers,
    // The form's grid FIRST, so the request's days cannot bring a geometry with them.
    availability: normalizeAvailabilityMask({ ...grid, days }, grid),
    suMembership: cleaned.suMembership,
  };
}
