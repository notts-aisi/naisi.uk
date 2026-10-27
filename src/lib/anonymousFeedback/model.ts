import { londonDateKey } from "@/lib/courses/weekPlan";

/**
 * THE ANONYMOUS KEEP, CHANGE AND DROP FORM (docs/surveys.md, "The anonymous
 * form at a programme's end"): three open questions about one programme, what
 * to keep, what to change and what to drop, reached by one link per programme
 * that is the same for everybody on it.
 *
 * IT IS NOT A SURVEY. A survey knows who answered; this form never does. It
 * has its own records, its own routes and its own pages, and no file of it
 * reaches survey code (`tests/anonymous-feedback-no-trace.test.mjs` holds the
 * wall both ways). The survey at a programme's end opens the form when it is
 * first sent, closes it when it closes, and links to it once a person has
 * sent their answers; that is all the two share.
 *
 * Three collections, each server-only in both directions (the rules refuse
 * every browser, admins included):
 *
 *  - `anonymousFeedbackForms/{surveyId}`: one form per programme, keyed by the
 *    survey at its end, holding the secret in its link, the programme, and
 *    when it closes. Nothing about anybody.
 *  - `anonymousFeedbackWaiting/{autoId}`: one answer as it came in, kept until
 *    the night's move. The database stamps every record with the time it was
 *    written, so this record carries the time for as long as it lasts.
 *  - `anonymousFeedback/{autoId}`: one answer as it is kept. The move writes a
 *    whole night's answers in one transaction, so the database's own time on
 *    each is the move's, shared by all of them, and says nothing about when
 *    any one came in.
 *
 * AN ANSWER HOLDS EXACTLY `ANSWER_FIELDS`: the three answers, the programme
 * (the form it was on, the programme, the course run it named) and the day
 * it came in as a date with no time. Never an account, a session, a token, an
 * address or anything about a device. This file is pure: no reads, no
 * writes.
 */

export const ANONYMOUS_FORMS_COLLECTION = "anonymousFeedbackForms";
export const ANONYMOUS_WAITING_COLLECTION = "anonymousFeedbackWaiting";
export const ANONYMOUS_ANSWERS_COLLECTION = "anonymousFeedback";

/** The three questions, in the order the form asks them. */
export const QUESTION_KEYS = ["keep", "change", "drop"] as const;
export type QuestionKey = (typeof QUESTION_KEYS)[number];

/** Every field an answer holds, waiting or kept. Nothing else is ever written. */
export const ANSWER_FIELDS = ["roundId", "programmeId", "runId", "keep", "change", "drop", "day"] as const;

/** The longest answer to one question, in characters. */
export const ANSWER_MAX_CHARS = 2000;

/** The most a request may carry, in characters: three full answers, the link's secret and room for the JSON around them. */
export const BODY_MAX_CHARS = 3 * ANSWER_MAX_CHARS * 2 + 400;

/** One answer: the three answers ("" for a question left blank), the programme and the day. */
export type AnonymousAnswer = {
  roundId: string;
  programmeId: string;
  runId: string;
  keep: string;
  change: string;
  drop: string;
  /** "YYYY-MM-DD", the day in London it came in. Never a time. */
  day: string;
};

/** One programme's form. */
export type AnonymousForm = {
  /** The survey at the programme's end, which this form follows: the document's id. */
  id: string;
  roundId: string;
  programmeId: string;
  runId: string;
  /** The programme as the survey at its end named it: "AGI Strategy". */
  programmeName: string;
  programmeKind: "fellowship" | "incubator";
  /** The secret in the form's one link. The same for everybody on the programme. */
  token: string;
  /** When the survey at the end was first sent, which opened the form. */
  opensAt: Date | null;
  /** The survey at the end's closing time: 23:59 in London on the day an admin picked. */
  closesAt: Date | null;
  /** Closed by hand, with the survey at the end. */
  closedAt: Date | null;
};

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;
const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether a value has the shape of a form link's secret. Says nothing of whether it opens a form. */
export function isFormToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_SHAPE.test(value);
}

/** Whether a value has the shape of a document id the form's records use. */
export function isRecordId(value: unknown): value is string {
  return typeof value === "string" && ID_SHAPE.test(value);
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** A stored form, or null when the record is not whole enough to open. */
export function normaliseForm(id: string, raw: Record<string, unknown>): AnonymousForm | null {
  const token = raw.token;
  if (!isFormToken(token)) return null;
  const roundId = text(raw.roundId);
  const programmeId = text(raw.programmeId);
  const runId = text(raw.runId);
  if (!roundId || !programmeId || !runId) return null;
  return {
    id,
    roundId,
    programmeId,
    runId,
    programmeName: text(raw.programmeName).trim(),
    programmeKind: raw.programmeKind === "incubator" ? "incubator" : "fellowship",
    token,
    opensAt: toDate(raw.opensAt),
    closesAt: toDate(raw.closesAt),
    closedAt: toDate(raw.closedAt),
  };
}

/** Whether a form takes answers at `now`: opened, not closed by hand, and before its closing time. */
export function isFormOpen(form: Pick<AnonymousForm, "opensAt" | "closesAt" | "closedAt">, now: Date): boolean {
  if (!form.opensAt || form.closedAt) return false;
  if (!form.closesAt) return false;
  return now.getTime() < form.closesAt.getTime();
}

/** The day a form stopped taking answers, or null while it is open. */
export function formClosedOn(form: Pick<AnonymousForm, "closesAt" | "closedAt">, now: Date): Date | null {
  if (form.closedAt) return form.closedAt;
  if (form.closesAt && now.getTime() >= form.closesAt.getTime()) return form.closesAt;
  return null;
}

/** The day in London an answer sent at `at` came in: "2026-12-09". */
export function dayOf(at: Date): string {
  return londonDateKey(at);
}

/** A stored answer, waiting or kept, or null when it is not one. Only `ANSWER_FIELDS` are read. */
export function normaliseAnswer(raw: Record<string, unknown>): AnonymousAnswer | null {
  const roundId = text(raw.roundId);
  const programmeId = text(raw.programmeId);
  const runId = text(raw.runId);
  const day = text(raw.day);
  if (!roundId || !programmeId || !runId || !DAY_SHAPE.test(day)) return null;
  return { roundId, programmeId, runId, keep: text(raw.keep), change: text(raw.change), drop: text(raw.drop), day };
}

/** What a person sent, checked: the form's secret and the three answers, trimmed. */
export type SentAnswers = { token: string; keep: string; change: string; drop: string };

export type BodyProblem = "shape" | "empty" | "long";

/**
 * Read a request's body as text. Refused as "shape" when it is not a JSON
 * object holding a well-formed secret and three strings (an absent one is
 * blank), "long" when an answer is over `ANSWER_MAX_CHARS`, and "empty" when
 * all three are blank. Nothing else in the body is kept or read.
 */
export function readAnswerBody(raw: string): { ok: true; sent: SentAnswers } | { ok: false; problem: BodyProblem } {
  if (raw.length > BODY_MAX_CHARS) return { ok: false, problem: "long" };
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, problem: "shape" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, problem: "shape" };
  const body = parsed as { token?: unknown; keep?: unknown; change?: unknown; drop?: unknown };
  if (!isFormToken(body.token)) return { ok: false, problem: "shape" };
  // Each answer read by its own name, never by a key worked out at run time.
  const keep = oneAnswer(body.keep);
  const change = oneAnswer(body.change);
  const drop = oneAnswer(body.drop);
  if (!keep.ok || !change.ok || !drop.ok) {
    const shape = [keep, change, drop].some((one) => !one.ok && one.problem === "shape");
    return { ok: false, problem: shape ? "shape" : "long" };
  }
  if (!keep.text && !change.text && !drop.text) return { ok: false, problem: "empty" };
  return { ok: true, sent: { token: body.token, keep: keep.text, change: change.text, drop: drop.text } };
}

/** One answer from the body: its words trimmed ("" when absent), or what is wrong with it. */
function oneAnswer(value: unknown): { ok: true; text: string } | { ok: false; problem: "shape" | "long" } {
  if (value === undefined || value === null) return { ok: true, text: "" };
  if (typeof value !== "string") return { ok: false, problem: "shape" };
  const text = value.trim();
  return text.length > ANSWER_MAX_CHARS ? { ok: false, problem: "long" } : { ok: true, text };
}

/**
 * The answer as it is written, field by field and in `ANSWER_FIELDS`' order,
 * from the form it was sent to and the day it came in. The one place an
 * answer's fields are named for writing.
 */
export function answerToKeep(form: Pick<AnonymousForm, "roundId" | "programmeId" | "runId">, sent: Omit<SentAnswers, "token">, day: string): AnonymousAnswer {
  return {
    roundId: form.roundId,
    programmeId: form.programmeId,
    runId: form.runId,
    keep: sent.keep,
    change: sent.change,
    drop: sent.drop,
    day,
  };
}

/**
 * Whether a waiting answer is due to move at `today`: only once its own day
 * is over in London, so a whole day's answers move together and the move's
 * time says no more than the day does.
 */
export function dueToMove(answer: Pick<AnonymousAnswer, "day">, today: string): boolean {
  return answer.day < today;
}

/**
 * Every answer of one question, for the readers: the ones with words, in
 * alphabetical order of their words, which has nothing to do with when each
 * came in. Ties keep no order of their own (equal words read the same).
 */
export function answersInOrder(answers: readonly AnonymousAnswer[], key: QuestionKey): string[] {
  const collator = new Intl.Collator("en-GB", { sensitivity: "base", numeric: true });
  return answers
    .map((answer) => answer[key])
    .filter((words) => words.length > 0)
    .sort((a, b) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0));
}
