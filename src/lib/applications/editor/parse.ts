import { isValidDateKey, londonWallClockToInstant } from "@/lib/courses/weekPlan";
import { ADMISSION_ROUND_FIELD_LIMITS } from "@/lib/firestore/admissionRounds";
import {
  APPLICATION_LIMITS,
  PROGRAMME_EMAIL_KINDS,
  PROGRAMME_KINDS,
  QUESTION_TYPES,
  type EmailWording,
  type ProgrammeEmailKind,
  type ProgrammeKind,
  type QuestionSetScope,
  type QuestionType,
} from "../model";
import { isId } from "../normalise";
import type { ProgrammeRolesChange } from "../roles";

/**
 * READING WHAT THE EDITOR SENDS.
 *
 * Every body a route in this lane accepts is read here, into a typed change or
 * a sentence the person can act on. Nothing is trimmed to fit and nothing is
 * dropped quietly: a name twelve characters too long is refused with the
 * number, because an editor that thinks it saved something and a server that
 * shortened it is the mistake nobody notices until an applicant reads it.
 *
 * Only what the body says is decided here. Whatever depends on the stored
 * form (is the deadline after the opening, does this programme exist, are the
 * questions locked) is decided by the writer, inside its transaction.
 *
 * Pure, so the rules are executed by a test rather than through a database.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

type Body = Record<string, unknown>;

const L = APPLICATION_LIMITS;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function asBody(raw: unknown): Body | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Body) : null;
}

/** Text within its limit, trimmed. `what` starts the sentence when it is refused. */
function readText(
  raw: unknown,
  what: string,
  max: number,
  required: boolean,
): Parsed<string> {
  if (typeof raw !== "string") return fail(`${what} has to be text.`);
  const value = raw.trim();
  if (required && !value) return fail(`${what} cannot be empty.`);
  if (value.length > max) {
    const over = value.length - max;
    return fail(`${what} is ${over} character${over === 1 ? "" : "s"} over its limit of ${max}.`);
  }
  return { ok: true, value };
}

/** A whole number in a range, or null for an empty box. */
function readCount(raw: unknown, what: string, min: number, max: number): Parsed<number | null> {
  if (raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    return fail(`${what} has to be a whole number.`);
  }
  if (raw < min || raw > max) return fail(`${what} has to be between ${min} and ${max}.`);
  return { ok: true, value: raw };
}

/** "YYYY-MM-DD" naming a real day, or null. */
function readDay(raw: unknown, what: string): Parsed<string | null> {
  if (raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !isValidDateKey(raw)) {
    return fail(`${what} has to be a real calendar date.`);
  }
  return { ok: true, value: raw };
}

const WALL_CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A London date and wall clock, as the instant they name. The editor sends
 * the two parts a person typed and the server does the conversion, with the
 * one function that knows about clock changes, so no browser's own time zone
 * ever decides when a form closes.
 */
function readMoment(raw: unknown, what: string): Parsed<Date | null> {
  if (raw === null) return { ok: true, value: null };
  const parts = asBody(raw);
  if (!parts) return fail(`${what} has to be a date and a time, or empty.`);
  if (typeof parts.date !== "string" || !isValidDateKey(parts.date)) {
    return fail(`${what} needs a real calendar date.`);
  }
  if (typeof parts.time !== "string" || !WALL_CLOCK.test(parts.time)) {
    return fail(`${what} needs a time like 23:59.`);
  }
  return { ok: true, value: londonWallClockToInstant(parts.date, parts.time) };
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

export type NewForm = { label: string };

export function parseNewForm(raw: unknown): Parsed<NewForm> {
  const body = asBody(raw);
  if (!body || typeof body.label !== "string" || !body.label.trim()) {
    return fail("Give the application form a name.");
  }
  const label = readText(body.label, "The name", ADMISSION_ROUND_FIELD_LIMITS.label, true);
  if (!label.ok) return label;
  return { ok: true, value: { label: label.value } };
}

export type NewProgramme = { name: string; shortName: string; kind: ProgrammeKind };

function readNewProgramme(raw: unknown): Parsed<NewProgramme> {
  const body = asBody(raw);
  if (!body) return fail("A new programme needs a name.");
  const name = readText(body.name ?? "", "The programme’s name", L.programmeName, true);
  if (!name.ok) return name;
  const shortRaw = typeof body.shortName === "string" && body.shortName.trim() ? body.shortName : name.value;
  const shortName = readText(shortRaw, "The short name", L.programmeShortName, true);
  if (!shortName.ok) return shortName;
  if (!PROGRAMME_KINDS.includes(body.kind as ProgrammeKind)) {
    return fail("Say whether the programme is a fellowship or an incubator.");
  }
  return {
    ok: true,
    value: { name: name.value, shortName: shortName.value, kind: body.kind as ProgrammeKind },
  };
}

/** What an admin may change about the form itself. Every field is optional. */
export type FormChange = {
  label?: string;
  opensAt?: Date | null;
  closesAt?: Date | null;
  decisionsByDate?: string | null;
  invitationReplyBy?: string | null;
  asksFacilitating?: boolean;
  /** The programmes in the order the Choose step shows them. */
  programmeIds?: string[];
  addProgramme?: NewProgramme;
};

/** Fields on the round that this route never writes, with where they are written. */
const FORM_FOREIGN_FIELDS: Record<string, string> = {
  status: "Opening and closing the form is not done here.",
  programmes: "A programme’s settings are saved on its own page.",
  questionSetIds: "Question sets are added and removed in the form’s list of sections.",
  reviewerUids: "Leads and reviewers are named on each programme’s settings.",
  applicationCounts: "The counts follow the applications and cannot be set.",
  formVersion: "An application form cannot be turned into anything else.",
};

export function parseFormChange(raw: unknown): Parsed<FormChange> {
  const body = asBody(raw);
  if (!body) return fail("Nothing to save.");
  for (const [field, why] of Object.entries(FORM_FOREIGN_FIELDS)) {
    if (field in body) return fail(why);
  }
  const change: FormChange = {};
  if ("label" in body) {
    const label = readText(body.label, "The name", ADMISSION_ROUND_FIELD_LIMITS.label, true);
    if (!label.ok) return label;
    change.label = label.value;
  }
  if ("opens" in body) {
    const opens = readMoment(body.opens, "The opening");
    if (!opens.ok) return opens;
    change.opensAt = opens.value;
  }
  if ("closes" in body) {
    const closes = readMoment(body.closes, "The close");
    if (!closes.ok) return closes;
    change.closesAt = closes.value;
  }
  if ("decisions" in body) {
    const day = readDay(body.decisions, "The day everyone hears");
    if (!day.ok) return day;
    change.decisionsByDate = day.value;
  }
  if ("replyBy" in body) {
    const day = readDay(body.replyBy, "The day invitations are accepted by");
    if (!day.ok) return day;
    change.invitationReplyBy = day.value;
  }
  if ("asksFacilitating" in body) {
    if (typeof body.asksFacilitating !== "boolean") {
      return fail("Whether the form asks about facilitating has to be yes or no.");
    }
    change.asksFacilitating = body.asksFacilitating;
  }
  if ("programmeIds" in body) {
    const ids = body.programmeIds;
    if (!Array.isArray(ids) || ids.some((id) => !isId(id)) || new Set(ids).size !== ids.length) {
      return fail("That is not a list of this form’s programmes. Reload and try again.");
    }
    change.programmeIds = ids as string[];
  }
  if ("addProgramme" in body) {
    const programme = readNewProgramme(body.addProgramme);
    if (!programme.ok) return programme;
    change.addProgramme = programme.value;
  }
  if (Object.keys(change).length === 0) return fail("Nothing to save.");
  return { ok: true, value: change };
}

// ---------------------------------------------------------------------------
// Question sets
// ---------------------------------------------------------------------------

function readScope(raw: unknown): Parsed<QuestionSetScope> {
  const scope = asBody(raw);
  if (scope?.type === "facilitating") return { ok: true, value: { type: "facilitating" } };
  if (scope?.type === "kind" && PROGRAMME_KINDS.includes(scope.kind as ProgrammeKind)) {
    return { ok: true, value: { type: "kind", kind: scope.kind as ProgrammeKind } };
  }
  if (scope?.type === "programme" && isId(scope.programmeId)) {
    return { ok: true, value: { type: "programme", programmeId: scope.programmeId } };
  }
  return fail("Say who the question set is for.");
}

export type NewSet = { label: string; scope: QuestionSetScope };

export function parseNewSet(raw: unknown): Parsed<NewSet> {
  const body = asBody(raw);
  if (!body) return fail("Give the question set a name.");
  const label = readText(body.label ?? "", "The set’s name", L.setLabel, true);
  if (!label.ok) return label;
  const scope = readScope(body.scope);
  if (!scope.ok) return scope;
  return { ok: true, value: { label: label.value, scope: scope.value } };
}

/**
 * One question as the editor sent it. `id` is the id of a question the set
 * already has, or null for a new one: the writer keeps an id only when the
 * stored set carries it, and mints every other.
 */
export type QuestionInput = {
  id: string | null;
  text: string;
  help: string;
  type: QuestionType;
  options: string[];
  optionsFromRanking: boolean;
  wordLimit: number | null;
  required: boolean;
  scored: boolean;
};

function readQuestion(raw: unknown, position: number): Parsed<QuestionInput> {
  const body = asBody(raw);
  const name = `Question ${position}`;
  if (!body) return fail(`${name} is not a question.`);
  if (typeof body.text !== "string" || !body.text.trim()) return fail(`${name} needs its text.`);
  const text = readText(body.text, name, L.questionText, true);
  if (!text.ok) return text;
  const help = readText(body.help ?? "", `${name}’s help text`, L.questionHelp, false);
  if (!help.ok) return help;
  if (!QUESTION_TYPES.includes(body.type as QuestionType)) {
    return fail(`${name} has an answer type this form does not know.`);
  }
  const type = body.type as QuestionType;
  const isText = type === "short" || type === "long";
  const optionsFromRanking = type === "choice" && body.optionsFromRanking === true;

  const options: string[] = [];
  if (!isText && !optionsFromRanking) {
    if (!Array.isArray(body.options)) return fail(`${name} needs its options.`);
    for (const entry of body.options) {
      const option = readText(entry, `An option on ${name.toLowerCase()}`, L.optionText, true);
      if (!option.ok) return option;
      if (options.includes(option.value)) {
        return fail(`${name} lists “${option.value}” twice.`);
      }
      options.push(option.value);
    }
    if (options.length < 2) return fail(`${name} needs at least 2 options.`);
    if (options.length > L.maxOptions) {
      return fail(`${name} takes at most ${L.maxOptions} options.`);
    }
  }

  let wordLimit: number | null = null;
  if (isText && body.wordLimit !== undefined) {
    const limit = readCount(body.wordLimit, `${name}’s word limit`, 1, L.maxWordLimit);
    if (!limit.ok) return limit;
    wordLimit = limit.value;
  }
  if (body.required !== undefined && typeof body.required !== "boolean") {
    return fail(`${name} is either required or it is not.`);
  }
  if (body.scored !== undefined && typeof body.scored !== "boolean") {
    return fail(`${name} is either scored or it is not.`);
  }
  return {
    ok: true,
    value: {
      id: isId(body.id) ? body.id : null,
      text: text.value,
      help: help.value,
      type,
      options,
      optionsFromRanking,
      wordLimit,
      required: body.required === true,
      scored: body.scored === true,
    },
  };
}

export type SetChange = {
  label?: string;
  intro?: string;
  /** The whole list, in order. A question left out is deleted. */
  questions?: QuestionInput[];
};

export function parseSetChange(raw: unknown): Parsed<SetChange> {
  const body = asBody(raw);
  if (!body) return fail("Nothing to save.");
  if ("scope" in body || "role" in body) {
    return fail("Who a question set is for is fixed when it is made. Make a new set instead.");
  }
  const change: SetChange = {};
  if ("label" in body) {
    const label = readText(body.label, "The set’s name", L.setLabel, true);
    if (!label.ok) return label;
    change.label = label.value;
  }
  if ("intro" in body) {
    const intro = readText(body.intro, "The line under the heading", L.setIntro, false);
    if (!intro.ok) return intro;
    change.intro = intro.value;
  }
  if ("questions" in body) {
    if (!Array.isArray(body.questions)) return fail("The questions have to be a list.");
    if (body.questions.length > L.maxQuestionsPerSet) {
      return fail(`A set takes at most ${L.maxQuestionsPerSet} questions.`);
    }
    const questions: QuestionInput[] = [];
    for (const [at, entry] of body.questions.entries()) {
      const question = readQuestion(entry, at + 1);
      if (!question.ok) return question;
      if (question.value.id && questions.some((other) => other.id === question.value.id)) {
        return fail(`Question ${at + 1} is in the list twice. Reload and try again.`);
      }
      questions.push(question.value);
    }
    change.questions = questions;
  }
  if (Object.keys(change).length === 0) return fail("Nothing to save.");
  return { ok: true, value: change };
}

// ---------------------------------------------------------------------------
// A programme's settings
// ---------------------------------------------------------------------------

export type ProgrammeChange = {
  name?: string;
  shortName?: string;
  pitch?: string;
  facts?: string;
  starts?: string;
  places?: number | null;
  groupCount?: number | null;
  groupSize?: string;
  useScores?: boolean;
  /** Admin only. The route refuses it from anybody else. */
  closed?: boolean;
  /** A wording to store per email, or null to go back to the standard one. */
  emailWording?: Partial<Record<ProgrammeEmailKind, EmailWording | null>>;
};

/** Fields a programme carries that this route never writes, with where they are written. */
const PROGRAMME_FOREIGN_FIELDS: Record<string, string> = {
  leadUid: "The lead is named in the Reviewing section, by an admin.",
  reviewerUids: "Reviewers are added and removed in the Reviewing section.",
  kind: "Whether a programme is a fellowship or an incubator is fixed when it is added.",
  id: "A programme’s id never changes.",
  runId: "The course run a programme places people on is not set here.",
};

function readWording(raw: unknown, title: string): Parsed<EmailWording | null> {
  if (raw === null) return { ok: true, value: null };
  const body = asBody(raw);
  if (!body) return fail(`The ${title} email needs a subject and a message, or nothing.`);
  const subject = readText(body.subject ?? "", `The ${title} email’s subject`, L.emailSubject, false);
  if (!subject.ok) return subject;
  const text = readText(body.body ?? "", `The ${title} email’s message`, L.emailBody, false);
  if (!text.ok) return text;
  // Two empty boxes are the standard wording, not a wording of nothing.
  if (!subject.value && !text.value) return { ok: true, value: null };
  return { ok: true, value: { subject: subject.value, body: text.value } };
}

const EMAIL_NAME: Record<ProgrammeEmailKind, string> = {
  accepted: "“You’re in”",
  invitation: "invitation",
  declined: "declined",
};

export function parseProgrammeChange(raw: unknown): Parsed<ProgrammeChange> {
  const body = asBody(raw);
  if (!body) return fail("Nothing to save.");
  for (const [field, why] of Object.entries(PROGRAMME_FOREIGN_FIELDS)) {
    if (field in body) return fail(why);
  }
  const change: ProgrammeChange = {};
  const texts: [keyof ProgrammeChange & string, string, number, boolean][] = [
    ["name", "The name", L.programmeName, true],
    ["shortName", "The short name", L.programmeShortName, true],
    ["pitch", "The one-line description", L.programmePitch, false],
    ["facts", "The facts line", L.programmeFacts, false],
    ["starts", "When it starts", L.programmeStarts, false],
    ["groupSize", "The group size", L.programmeGroupSize, false],
  ];
  for (const [field, what, max, required] of texts) {
    if (!(field in body)) continue;
    const value = readText(body[field], what, max, required);
    if (!value.ok) return value;
    (change as Record<string, unknown>)[field] = value.value;
  }
  if ("places" in body) {
    const places = readCount(body.places, "The number of places", 0, 10_000);
    if (!places.ok) return places;
    change.places = places.value;
  }
  if ("groupCount" in body) {
    const groups = readCount(body.groupCount, "The number of groups", 1, 1_000);
    if (!groups.ok) return groups;
    change.groupCount = groups.value;
  }
  for (const field of ["useScores", "closed"] as const) {
    if (!(field in body)) continue;
    if (typeof body[field] !== "boolean") {
      return fail(
        field === "useScores"
          ? "Whether the programme uses scores has to be yes or no."
          : "A programme is either closed or it is not.",
      );
    }
    change[field] = body[field] as boolean;
  }
  if ("emailWording" in body) {
    const given = asBody(body.emailWording);
    if (!given) return fail("The wording has to name which email it is for.");
    const wording: ProgrammeChange["emailWording"] = {};
    for (const key of Object.keys(given)) {
      if (!PROGRAMME_EMAIL_KINDS.includes(key as ProgrammeEmailKind)) {
        return fail("That is not one of this programme’s emails.");
      }
      const kind = key as ProgrammeEmailKind;
      const entry = readWording(given[kind], EMAIL_NAME[kind]);
      if (!entry.ok) return entry;
      wording[kind] = entry.value;
    }
    if (Object.keys(wording).length === 0) return fail("Nothing to save.");
    change.emailWording = wording;
  }
  if (Object.keys(change).length === 0) return fail("Nothing to save.");
  return { ok: true, value: change };
}

// ---------------------------------------------------------------------------
// Who reviews a programme
// ---------------------------------------------------------------------------

/**
 * The shape of a roles change, and nothing about who may make it: every rule
 * about who may name whom is `setProgrammeRoles`'s, in `../roles.ts`.
 */
export function parseRolesChange(raw: unknown): Parsed<ProgrammeRolesChange> {
  const body = asBody(raw);
  if (!body || (!("leadUid" in body) && !("reviewerUids" in body))) {
    return fail("Say who leads the programme or who reviews it.");
  }
  const change: ProgrammeRolesChange = {};
  if ("leadUid" in body) {
    if (body.leadUid !== null && typeof body.leadUid !== "string") {
      return fail("The lead has to be one person, or nobody yet.");
    }
    change.leadUid = body.leadUid;
  }
  if ("reviewerUids" in body) {
    const uids = body.reviewerUids;
    if (!Array.isArray(uids) || uids.some((uid) => typeof uid !== "string" || !uid.trim())) {
      return fail("The reviewers have to be a list of people.");
    }
    change.reviewerUids = uids as string[];
  }
  return { ok: true, value: change };
}
