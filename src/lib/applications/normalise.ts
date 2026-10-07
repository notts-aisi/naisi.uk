import {
  DEFAULT_AVAILABILITY_GRID,
  normalizeAvailabilityMask,
  type AvailabilityGrid,
} from "@/lib/admissions/availability";
import {
  ADMISSION_APPLICATION_STATUSES,
  type AdmissionApplicationStatus,
} from "@/lib/firestore/admissionApplications";
import {
  normalizeAdmissionRound,
  type AdmissionRoundDoc,
} from "@/lib/firestore/admissionRounds";
import { FIELD_LIMITS } from "@/lib/firestore/users";
import * as keys from "./keys";
import {
  APPLICATION_LIMITS,
  APPLICATION_RESULT_KINDS,
  FORM_VERSION,
  POOL_REASONS,
  PROGRAMME_DECISION_KINDS,
  PROGRAMME_EMAIL_KINDS,
  PROGRAMME_KINDS,
  QUESTION_SET_ROLES,
  QUESTION_TYPES,
  RESULT_EMAIL_STATES,
  type AboutYou,
  type AnswerValue,
  type Answers,
  type ApplicationContent,
  type ApplicationDoc,
  type ApplicationFormFields,
  type ApplicationQuestion,
  type ApplicationResult,
  type ApplicationResultKind,
  type Attendance,
  type DecisionDoc,
  type EmailWording,
  type Invitation,
  type PlacementException,
  type PoolReason,
  type PooledOutcome,
  type ProgrammeDecision,
  type ProgrammeDecisionKind,
  type ProgrammeEmailKind,
  type ProgrammeKind,
  type ProgrammeSettings,
  type QuestionSetDoc,
  type QuestionSetRole,
  type QuestionSetScope,
  type QuestionType,
  type ResultEmailState,
  type ReviewComment,
  type ReviewDoc,
} from "./model";
import { SENT_HISTORY_LIMITS, type SentVersion } from "./model";

/**
 * Reading the application system's documents.
 *
 * Every function here takes what Firestore handed back and returns the shape
 * `model.ts` declares, and nothing else: a field this build does not know is
 * dropped, a value of the wrong type becomes the empty value for its field,
 * and a list is cut at its cap. Nothing throws. A document somebody
 * hand-edited, or one written by an older build, reads as a smaller valid
 * document rather than taking a page down.
 *
 * Pure, with no Firestore import, so the same functions run in a route, in a
 * test, and in the browser against a payload a route already projected.
 */

type Raw = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Small coercions (the per-file idiom in this codebase)
// ---------------------------------------------------------------------------

function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string") {
    const parsed = new Date(v);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const obj = v as { toDate?: () => Date };
  return typeof obj?.toDate === "function" ? obj.toDate() : null;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asRecord(v: unknown): Raw {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {};
}

/** A whole number in a range, or null. */
function intIn(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= min && n <= max ? n : null;
}

/** "YYYY-MM-DD", or null. Never an instant. */
function dateKey(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

const { own } = keys;

/**
 * True for an id this system could have minted. What that means is decided in
 * ONE place, `./keys`, beside the accessor that reads a map by one: the shape,
 * and never a name every object carries.
 *
 * It is a function here and not a re-export on purpose. This module is where
 * a route looks for it, and the guard that proves a helper called before a
 * route's gate touches no document (`tests/gate-before-data.test.mjs`) reads
 * the helper's body in the module the route imported it from.
 */
export function isId(v: unknown): v is string {
  return keys.isId(v);
}

/** True for a key `questionKey()` could have built. Decided in `./keys`, as above. */
export function isQuestionKey(v: unknown): v is string {
  return keys.isQuestionKey(v);
}

/** Distinct, well-formed ids, in the order given, cut at `cap`. */
function idList(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const raw of v) {
    if (isId(raw) && !out.includes(raw)) out.push(raw);
    if (out.length >= cap) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

function asWording(v: unknown): EmailWording | null {
  const raw = asRecord(v);
  const subject = str(raw.subject, APPLICATION_LIMITS.emailSubject);
  const body = str(raw.body, APPLICATION_LIMITS.emailBody);
  return subject || body ? { subject, body } : null;
}

export function normaliseProgramme(id: string, v: unknown): ProgrammeSettings {
  const raw = asRecord(v);
  const L = APPLICATION_LIMITS;
  const kind = raw.kind as ProgrammeKind;
  const name = str(raw.name, L.programmeName);
  const emailWording: ProgrammeSettings["emailWording"] = {};
  const rawWording = asRecord(raw.emailWording);
  for (const key of PROGRAMME_EMAIL_KINDS) {
    const wording = asWording(own(rawWording, key));
    if (wording) emailWording[key as ProgrammeEmailKind] = wording;
  }
  return {
    id,
    kind: PROGRAMME_KINDS.includes(kind) ? kind : "fellowship",
    name,
    shortName: str(raw.shortName, L.programmeShortName) || name,
    pitch: str(raw.pitch, L.programmePitch),
    facts: str(raw.facts, L.programmeFacts),
    starts: str(raw.starts, L.programmeStarts),
    places: intIn(raw.places, 0, 10_000),
    groupCount: intIn(raw.groupCount, 0, 1_000),
    groupSize: str(raw.groupSize, L.programmeGroupSize),
    leadUid: typeof raw.leadUid === "string" && raw.leadUid ? raw.leadUid : null,
    reviewerUids: uidList(raw.reviewerUids, L.maxProgrammeReviewers),
    useScores: bool(raw.useScores),
    closed: bool(raw.closed),
    runId: isId(raw.runId) ? raw.runId : null,
    emailWording,
  };
}

/** Distinct non-empty uids, in the order given, cut at `cap`. */
function uidList(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const raw of v) {
    if (typeof raw === "string" && raw && !out.includes(raw)) out.push(raw);
    if (out.length >= cap) break;
  }
  return out;
}

/** True when a round is an application form of this version. */
export function isApplicationForm(data: unknown): boolean {
  return asRecord(data).formVersion === FORM_VERSION;
}

export function normaliseFormFields(data: unknown): ApplicationFormFields {
  const raw = asRecord(data);
  const L = APPLICATION_LIMITS;
  const stored = asRecord(raw.programmes);
  const programmes: Record<string, ProgrammeSettings> = {};
  // `programmeIds` is the authority on which programmes exist and in what
  // order. A settings entry with no place in the order is not shown anywhere,
  // so it is not read either. The entry is read as the stored map's OWN key:
  // an id in the order with no settings of its own names no programme.
  const programmeIds = idList(raw.programmeIds, L.maxProgrammes).filter((id) => {
    const entry = own(stored, id);
    return Boolean(entry) && typeof entry === "object";
  });
  for (const id of programmeIds) programmes[id] = normaliseProgramme(id, own(stored, id));
  return {
    formVersion: FORM_VERSION,
    programmeIds,
    programmes,
    questionSetIds: idList(raw.questionSetIds, L.maxQuestionSets),
    asksFacilitating: bool(raw.asksFacilitating, true),
    invitationReplyBy: dateKey(raw.invitationReplyBy),
    revealOtherReviews: bool(raw.revealOtherReviews),
    noOfferWording: asWording(raw.noOfferWording),
    decisionsSentAt: tsToDate(raw.decisionsSentAt),
    decisionsSentByUid:
      typeof raw.decisionsSentByUid === "string" && raw.decisionsSentByUid
        ? raw.decisionsSentByUid
        : null,
  };
}

/**
 * A round read as an application form: the round it is, plus the fields this
 * system adds. `round` is the existing normaliser's output, untouched, so the
 * window, the grid and the counters are read by the code that already reads
 * them.
 */
export type ApplicationForm = ApplicationFormFields & { round: AdmissionRoundDoc };

export function normaliseForm(id: string, data: unknown): ApplicationForm {
  return { round: normalizeAdmissionRound(id, asRecord(data)), ...normaliseFormFields(data) };
}

function asScope(v: unknown): QuestionSetScope | null {
  const raw = asRecord(v);
  if (raw.type === "facilitating") return { type: "facilitating" };
  if (raw.type === "kind" && PROGRAMME_KINDS.includes(raw.kind as ProgrammeKind)) {
    return { type: "kind", kind: raw.kind as ProgrammeKind };
  }
  if (raw.type === "programme" && isId(raw.programmeId)) {
    return { type: "programme", programmeId: raw.programmeId };
  }
  return null;
}

export function normaliseQuestion(v: unknown): ApplicationQuestion | null {
  const raw = asRecord(v);
  if (!isId(raw.id)) return null;
  const L = APPLICATION_LIMITS;
  const type = QUESTION_TYPES.includes(raw.type as QuestionType)
    ? (raw.type as QuestionType)
    : "long";
  const takesOptions = type === "choice" || type === "multi" || type === "scale";
  const options: string[] = [];
  if (takesOptions && Array.isArray(raw.options)) {
    for (const option of raw.options) {
      const text = str(option, L.optionText).trim();
      if (text && !options.includes(text)) options.push(text);
      if (options.length >= L.maxOptions) break;
    }
  }
  const isText = type === "short" || type === "long";
  return {
    id: raw.id,
    text: str(raw.text, L.questionText),
    help: str(raw.help, L.questionHelp),
    type,
    options,
    optionsFromRanking: type === "choice" && bool(raw.optionsFromRanking),
    wordLimit: isText ? intIn(raw.wordLimit, 1, L.maxWordLimit) : null,
    required: bool(raw.required),
    scored: bool(raw.scored),
  };
}

/**
 * A question set, or null when the stored document has no usable scope. A set
 * nobody can be shown is not a set, and returning one with a guessed scope
 * would show its questions to the wrong people.
 */
export function normaliseQuestionSet(id: string, data: unknown): QuestionSetDoc | null {
  const raw = asRecord(data);
  const scope = asScope(raw.scope);
  if (!isId(id) || !scope) return null;
  const L = APPLICATION_LIMITS;
  // The role follows from the scope wherever the scope decides it, so a
  // stored pair that disagrees cannot make a general set scorable.
  const storedRole = raw.role as QuestionSetRole;
  const role: QuestionSetRole =
    scope.type === "facilitating"
      ? "facilitator"
      : scope.type === "kind"
        ? "general"
        : QUESTION_SET_ROLES.includes(storedRole) && storedRole !== "facilitator"
          ? storedRole
          : "stream";
  const questions: ApplicationQuestion[] = [];
  if (Array.isArray(raw.questions)) {
    for (const entry of raw.questions) {
      const question = normaliseQuestion(entry);
      if (!question || questions.some((q) => q.id === question.id)) continue;
      // Only a stream set is scored. The flag is cleared on read as well as
      // refused on write, so no reader has to remember the rule.
      questions.push(role === "stream" ? question : { ...question, scored: false });
      if (questions.length >= L.maxQuestionsPerSet) break;
    }
  }
  return {
    id,
    roundId: str(raw.roundId, 120),
    role,
    scope,
    label: str(raw.label, L.setLabel),
    intro: str(raw.intro, L.setIntro),
    questions,
    createdAt: tsToDate(raw.createdAt),
    updatedAt: tsToDate(raw.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// What an applicant writes
// ---------------------------------------------------------------------------

export const EMPTY_ABOUT_YOU: AboutYou = {
  preferredName: "",
  universityEmail: "",
  universityEmailVerified: false,
  status: "",
  statusOther: "",
  subject: "",
  expectedGraduation: "",
  motivation: "",
  interests: "",
};

function asAboutYou(v: unknown): AboutYou {
  const raw = asRecord(v);
  const graduation = str(raw.expectedGraduation, 7);
  return {
    preferredName: str(raw.preferredName, FIELD_LIMITS.preferredName),
    universityEmail: str(raw.universityEmail, FIELD_LIMITS.universityEmail),
    universityEmailVerified: bool(raw.universityEmailVerified),
    status: str(raw.status, 40),
    statusOther: str(raw.statusOther, FIELD_LIMITS.statusOther),
    subject: str(raw.subject, FIELD_LIMITS.subject),
    expectedGraduation: /^\d{4}-\d{2}$/.test(graduation) ? graduation : "",
    motivation: str(raw.motivation, FIELD_LIMITS.motivation),
    interests: str(raw.interests, FIELD_LIMITS.interests),
  };
}

/** One stored answer, or undefined when it is not a shape this system writes. */
function asAnswer(v: unknown): AnswerValue | undefined {
  const L = APPLICATION_LIMITS;
  if (typeof v === "string") return v.slice(0, L.longAnswerChars);
  if (typeof v === "number") return intIn(v, 0, L.maxOptions - 1) ?? undefined;
  if (Array.isArray(v)) {
    const out: string[] = [];
    for (const item of v) {
      if (typeof item !== "string") continue;
      const text = item.slice(0, L.optionText);
      if (text && !out.includes(text)) out.push(text);
      if (out.length >= L.maxOptions) break;
    }
    return out;
  }
  return undefined;
}

function asAnswers(v: unknown): Answers {
  const L = APPLICATION_LIMITS;
  const out: Answers = {};
  let sets = 0;
  for (const [setId, rawSet] of Object.entries(asRecord(v))) {
    if (!isId(setId)) continue;
    if (sets >= L.maxQuestionSets) break;
    const set: Record<string, AnswerValue> = {};
    let kept = 0;
    for (const [questionId, rawAnswer] of Object.entries(asRecord(rawSet))) {
      if (!isId(questionId) || kept >= L.maxQuestionsPerSet) continue;
      const answer = asAnswer(rawAnswer);
      if (answer === undefined) continue;
      set[questionId] = answer;
      kept += 1;
    }
    out[setId] = set;
    sets += 1;
  }
  return out;
}

/**
 * `grid` is the form's current geometry, used only for an availability answer
 * stored without its own. A well-formed answer carries its geometry and
 * ignores it.
 */
export function normaliseContent(
  v: unknown,
  grid: AvailabilityGrid = DEFAULT_AVAILABILITY_GRID,
): ApplicationContent {
  const raw = asRecord(v);
  return {
    aboutYou: asAboutYou(raw.aboutYou),
    rankedProgrammeIds: idList(raw.rankedProgrammeIds, APPLICATION_LIMITS.maxProgrammes),
    wantsToFacilitate: typeof raw.wantsToFacilitate === "boolean" ? raw.wantsToFacilitate : null,
    answers: asAnswers(raw.answers),
    availability: normalizeAvailabilityMask(raw.availability, grid),
    suMembership:
      raw.suMembership === "yes" || raw.suMembership === "not-yet" ? raw.suMembership : null,
  };
}

/**
 * The earlier applications of record, oldest first, each read the way `sent`
 * is. An entry with no content of its own is not a version and is dropped.
 *
 * A list longer than the cap keeps what the cap's own rule keeps (the first,
 * and the most recent after it), so reading a document never loses the first
 * version sent. Only a document somebody edited by hand can be that long.
 */
function asSentHistory(v: unknown, grid: AvailabilityGrid): SentVersion[] {
  if (!Array.isArray(v)) return [];
  const out: SentVersion[] = [];
  for (const entry of v) {
    const raw = asRecord(entry);
    if (!raw.content || typeof raw.content !== "object" || Array.isArray(raw.content)) continue;
    out.push({ content: normaliseContent(raw.content, grid), sentAt: tsToDate(raw.sentAt) });
  }
  const cap = SENT_HISTORY_LIMITS.maxVersions;
  return out.length > cap ? [out[0], ...out.slice(out.length - (cap - 1))] : out;
}

function asResult(v: unknown): ApplicationResult | null {
  const raw = asRecord(v);
  const kind = raw.kind as ApplicationResultKind;
  if (!APPLICATION_RESULT_KINDS.includes(kind)) return null;
  const email = raw.email as ResultEmailState;
  return {
    kind,
    programmeId: isId(raw.programmeId) ? raw.programmeId : null,
    publishedAt: tsToDate(raw.publishedAt),
    // A result that does not say what became of its email reads as
    // unconfirmed, never as owed: nothing is sent to anybody on a guess.
    email: RESULT_EMAIL_STATES.includes(email) ? email : "unconfirmed",
    emailedAt: tsToDate(raw.emailedAt),
    emailClaimedAt: tsToDate(raw.emailClaimedAt),
  };
}

function asInvitation(v: unknown): Invitation | null {
  const raw = asRecord(v);
  const replyBy = dateKey(raw.replyBy);
  if (!isId(raw.programmeId) || !replyBy) return null;
  return {
    programmeId: raw.programmeId,
    replyBy,
    response: raw.response === "accepted" || raw.response === "declined" ? raw.response : null,
    respondedAt: tsToDate(raw.respondedAt),
    lastReminderOn: dateKey(raw.lastReminderOn),
  };
}

function asAttendance(v: unknown): Attendance | null {
  const raw = asRecord(v);
  if (raw.answer !== "coming" && raw.answer !== "cant-make-it") return null;
  return { answer: raw.answer, answeredAt: tsToDate(raw.answeredAt) };
}

/**
 * An application on a form of this version. Returns null for a document that
 * is not one (an application to an older round shares the collection), so a
 * caller cannot read the wrong kind of row as an empty application.
 */
export function normaliseApplication(
  id: string,
  data: unknown,
  grid: AvailabilityGrid = DEFAULT_AVAILABILITY_GRID,
): ApplicationDoc | null {
  const raw = asRecord(data);
  if (raw.formVersion !== FORM_VERSION) return null;
  const status = raw.status as AdmissionApplicationStatus;
  const sent = raw.sent && typeof raw.sent === "object" ? normaliseContent(raw.sent, grid) : null;
  return {
    id,
    roundId: str(raw.roundId, 120),
    uid: str(raw.uid, 128),
    email: str(raw.email, 320) || null,
    displayName: str(raw.displayName, 120),
    formVersion: FORM_VERSION,
    draft: normaliseContent(raw.draft, grid),
    sent,
    status: ADMISSION_APPLICATION_STATUSES.includes(status) ? status : "draft",
    submittedAt: tsToDate(raw.submittedAt),
    sentAt: tsToDate(raw.sentAt),
    sentChangedAt: tsToDate(raw.sentChangedAt),
    // An application never sent has no earlier version, whatever is stored.
    sentHistory: sent ? asSentHistory(raw.sentHistory, grid) : [],
    sentHistoryDropped: sent ? (intIn(raw.sentHistoryDropped, 0, 1_000_000) ?? 0) : 0,
    withdrawnAt: tsToDate(raw.withdrawnAt),
    result: asResult(raw.result),
    invitation: asInvitation(raw.invitation),
    attendance: asAttendance(raw.attendance),
    createdAt: tsToDate(raw.createdAt),
    updatedAt: tsToDate(raw.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// What reviewers write
// ---------------------------------------------------------------------------

function asScores(v: unknown): Record<string, number> {
  const L = APPLICATION_LIMITS;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(asRecord(v))) {
    if (!isQuestionKey(key)) continue;
    // A score is a whole number or it is nothing: 3.5 is not rounded to a
    // score somebody never gave.
    if (typeof raw !== "number" || !Number.isInteger(raw)) continue;
    if (raw >= L.minScore && raw <= L.maxScore) out[key] = raw;
  }
  return out;
}

function asComments(v: unknown): ReviewComment[] {
  if (!Array.isArray(v)) return [];
  const L = APPLICATION_LIMITS;
  const out: ReviewComment[] = [];
  for (const entry of v) {
    const raw = asRecord(entry);
    const text = str(raw.text, L.commentText).trim();
    if (!isId(raw.id) || !isQuestionKey(raw.questionKey) || !text) continue;
    if (out.some((c) => c.id === raw.id)) continue;
    out.push({
      id: raw.id,
      questionKey: raw.questionKey,
      text,
      createdAt: tsToDate(raw.createdAt),
      updatedAt: tsToDate(raw.updatedAt),
    });
    if (out.length >= L.maxCommentsPerReview) break;
  }
  return out;
}

/**
 * One reviewer's row, as this system reads it. The row is the existing
 * `admissionReviews` document: `scores` keys are question keys here, and the
 * free-text `notes` field is the overall comment.
 */
export function normaliseReview(id: string, data: unknown): ReviewDoc {
  const raw = asRecord(data);
  return {
    id,
    roundId: str(raw.roundId, 120),
    applicantUid: str(raw.applicantUid, 128),
    reviewerUid: str(raw.reviewerUid, 128),
    scores: asScores(raw.scores),
    comments: asComments(raw.comments),
    overallComment: str(raw.notes, APPLICATION_LIMITS.overallComment),
    createdAt: tsToDate(raw.createdAt),
    updatedAt: tsToDate(raw.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// What leads and admins decide
// ---------------------------------------------------------------------------

function asProgrammeDecision(v: unknown): ProgrammeDecision | null {
  const raw = asRecord(v);
  const decision = raw.decision as ProgrammeDecisionKind;
  if (!PROGRAMME_DECISION_KINDS.includes(decision)) return null;
  if (typeof raw.decidedByUid !== "string" || !raw.decidedByUid) return null;
  const pooled = decision === "pool";
  const reason = raw.poolReason as PoolReason;
  return {
    decision,
    poolReason: pooled && POOL_REASONS.includes(reason) ? reason : null,
    couldSuitProgrammeId: pooled && isId(raw.couldSuitProgrammeId) ? raw.couldSuitProgrammeId : null,
    decidedByUid: raw.decidedByUid,
    decidedAt: tsToDate(raw.decidedAt),
  };
}

function asPooledOutcome(v: unknown): PooledOutcome | null {
  const raw = asRecord(v);
  if (typeof raw.setByUid !== "string" || !raw.setByUid) return null;
  const setAt = tsToDate(raw.setAt);
  if (raw.kind === "no-offer") return { kind: "no-offer", setByUid: raw.setByUid, setAt };
  if (raw.kind === "invite" && isId(raw.programmeId)) {
    return { kind: "invite", programmeId: raw.programmeId, setByUid: raw.setByUid, setAt };
  }
  return null;
}

function asException(v: unknown): PlacementException | null {
  const raw = asRecord(v);
  const programmeIds = idList(raw.programmeIds, APPLICATION_LIMITS.maxProgrammes);
  if (programmeIds.length === 0 || typeof raw.setByUid !== "string" || !raw.setByUid) return null;
  return {
    programmeIds,
    reason: str(raw.reason, APPLICATION_LIMITS.exceptionReason),
    setByUid: raw.setByUid,
    setAt: tsToDate(raw.setAt),
  };
}

export function normaliseDecision(id: string, data: unknown): DecisionDoc {
  const raw = asRecord(data);
  const programmes: Record<string, ProgrammeDecision> = {};
  for (const [programmeId, entry] of Object.entries(asRecord(raw.programmes))) {
    if (!isId(programmeId)) continue;
    const decision = asProgrammeDecision(entry);
    if (decision) programmes[programmeId] = decision;
  }
  return {
    id,
    roundId: str(raw.roundId, 120),
    uid: str(raw.uid, 128),
    programmes,
    pooledOutcome: asPooledOutcome(raw.pooledOutcome),
    exception: asException(raw.exception),
    updatedAt: tsToDate(raw.updatedAt),
  };
}

/** A decision document for somebody nobody has decided anything about yet. */
export function emptyDecision(roundId: string, uid: string): DecisionDoc {
  return {
    id: `${roundId}__${uid}`,
    roundId,
    uid,
    programmes: {},
    pooledOutcome: null,
    exception: null,
    updatedAt: null,
  };
}
