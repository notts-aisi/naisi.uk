import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { own } from "@/lib/applications/keys";
import { isId, type ApplicationForm } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import { listForms } from "@/lib/applications/handover/run";
import { isValidDateKey, londonDateKey, londonWallClockToInstant } from "@/lib/courses/weekPlan";
import { SURVEYS_COLLECTION, SURVEY_LIMITS, normalizeSurvey, type SurveyDoc } from "@/lib/firestore/surveys";
import {
  SURVEY_ITEM_LIMITS,
  TEMPLATE_LINE_COUNT,
  beforeSurveyItems,
  sameQuestions,
  sanitizeSurveyItems,
  surveyQuestionsOf,
  validateSurveyItems,
  type SurveyItem,
} from "./items";
import { namesOffDayFor } from "./namesOff";
import { BEFORE_MINUTES, BEFORE_TITLE, REFUSAL, beforeIntro, beforeSurveyName } from "./words";

/**
 * MAKING A PROGRAMME'S BEFORE SURVEY, AND CHANGING IT UNTIL IT IS SENT.
 *
 * An admin picks a programme on an application form, types the lines of
 * question 4 (what people could explain, one line per week from 2 to 6) and
 * the day it closes. Everything else is the template's (`beforeSurveyItems`):
 * the six change questions as drawn, three pages, "about 3 minutes".
 *
 * Until its first send an admin may change its words, its options and lines
 * and their order, how long it takes and the day it closes. From the first
 * send all of that is fixed: the email people were sent names the day it
 * closes, and the after survey has to ask the same questions.
 *
 * The day names come off is worked out from records (a year after the run's
 * last session) when the survey is made and each time it is saved, and fixed
 * by the first send.
 */

/** The last minute of the closing day, in London. */
const CLOSING_CLOCK = "23:59";

/** When a survey closing on `day` stops taking answers. */
export function closesAtFor(day: string): Date {
  return londonWallClockToInstant(day, CLOSING_CLOCK);
}

type Raw = Record<string, unknown>;
const isRaw = (value: unknown): value is Raw => value !== null && typeof value === "object" && !Array.isArray(value);

export type Refused = { ok: false; status: number; error: string };

function closingDay(raw: unknown, now: Date): string | Refused {
  if (typeof raw !== "string" || !isValidDateKey(raw)) {
    return { ok: false, status: 400, error: "Pick the day it closes." };
  }
  if (raw < londonDateKey(now)) return { ok: false, status: 400, error: REFUSAL.closesPast };
  return raw;
}

function linesOf(raw: unknown): string[] | Refused {
  if (!Array.isArray(raw)) return { ok: false, status: 400, error: REFUSAL.body };
  const lines = raw.map((line) => (typeof line === "string" ? line.replace(/\s+/g, " ").trim() : ""));
  if (lines.length < SURVEY_ITEM_LIMITS.minLines || lines.length > SURVEY_ITEM_LIMITS.maxLines) {
    return { ok: false, status: 400, error: `Question 4 takes between ${SURVEY_ITEM_LIMITS.minLines} and ${SURVEY_ITEM_LIMITS.maxLines} lines.` };
  }
  if (lines.some((line) => line.length === 0)) {
    return { ok: false, status: 400, error: "Type each line of question 4: what people could explain, one line a week." };
  }
  if (lines.some((line) => line.length > SURVEY_ITEM_LIMITS.lineLabel)) {
    return { ok: false, status: 400, error: `Each line of question 4 can be up to ${SURVEY_ITEM_LIMITS.lineLabel} characters.` };
  }
  return lines;
}

export type CreateInput = { roundId: string; programmeId: string; lines: string[]; closesOn: string };

/** A request to make a before survey, checked before anything is read. */
export function parseCreate(raw: unknown, now: Date): { ok: true; input: CreateInput } | Refused {
  if (!isRaw(raw) || !isId(raw.roundId) || !isId(raw.programmeId)) {
    return { ok: false, status: 400, error: "Pick the programme the survey is for." };
  }
  const lines = linesOf(raw.lines);
  if (!Array.isArray(lines)) return lines;
  const closesOn = closingDay(raw.closesOn, now);
  if (typeof closesOn !== "string") return closesOn;
  return { ok: true, input: { roundId: raw.roundId, programmeId: raw.programmeId, lines, closesOn } };
}

/** A programme a before survey can be made for, as the New survey page lists them. */
export type ProgrammeChoice = {
  roundId: string;
  programmeId: string;
  /** "AGI Strategy" */
  name: string;
  /** "Autumn 2026" */
  formName: string;
  /** Why it cannot have one yet, or "" when it can. */
  blocked: string;
};

const NO_RUN = "Name the programme’s course run in its Settings first, so the survey knows when the programme ends.";
const NOT_SENT = "Decisions haven’t been sent yet, so nobody holds a place.";
const HAS_ONE = "It has its before survey already.";

function programmeNameOf(form: ApplicationForm, programmeId: string): string {
  const programme = own(form.programmes, programmeId);
  return programme ? programme.shortName.trim() || programme.name.trim() : "";
}

/** Every programme on a form, with whether a before survey can be made for it now. */
export async function listProgrammeChoices(db: Firestore, surveys: readonly SurveyDoc[]): Promise<ProgrammeChoice[]> {
  const forms = await listForms(db);
  const out: ProgrammeChoice[] = [];
  for (const form of forms) {
    for (const programmeId of form.programmeIds) {
      const programme = own(form.programmes, programmeId);
      if (!programme) continue;
      const hasOne = surveys.some(
        (survey) => survey.kind === "before" && survey.audience.roundId === form.round.id && survey.audience.programmeId === programmeId,
      );
      out.push({
        roundId: form.round.id,
        programmeId,
        name: programmeNameOf(form, programmeId),
        formName: form.round.label.trim() || "An application form",
        blocked: hasOne ? HAS_ONE : form.decisionsSentAt === null ? NOT_SENT : programme.runId === null ? NO_RUN : "",
      });
    }
  }
  return out.sort((a, b) => a.formName.localeCompare(b.formName, "en") || a.name.localeCompare(b.name, "en"));
}

/** Make the before survey for one programme. The route has held the caller to admin. */
export async function createBeforeSurvey(
  db: Firestore,
  createdByUid: string,
  input: CreateInput,
  now: Date,
): Promise<{ ok: true; id: string } | Refused> {
  const form = await loadForm(db, input.roundId);
  const programme = form ? own(form.programmes, input.programmeId) : undefined;
  if (!form || !programme) return { ok: false, status: 404, error: "That programme isn’t on a form any more." };
  if (form.decisionsSentAt === null) return { ok: false, status: 409, error: NOT_SENT };
  if (programme.runId === null) return { ok: false, status: 409, error: NO_RUN };

  const existing = await db.collection(SURVEYS_COLLECTION).where("roundId", "==", input.roundId).get();
  const hasOne = existing.docs.some((doc) => {
    const survey = normalizeSurvey(doc.id, doc.data() ?? {});
    return survey.kind === "before" && survey.audience.programmeId === input.programmeId;
  });
  if (hasOne) return { ok: false, status: 409, error: HAS_ONE };

  const namesOffOn = await namesOffDayFor(db, programme.runId, now);
  if (!namesOffOn) return { ok: false, status: 409, error: REFUSAL.noNamesOff };

  const name = programmeNameOf(form, input.programmeId);
  const items = beforeSurveyItems(input.lines);
  const ref = db.collection(SURVEYS_COLLECTION).doc();
  await ref.set({
    kind: "before",
    privacy: "confidential",
    name: beforeSurveyName(name),
    title: BEFORE_TITLE,
    intro: beforeIntro(surveyQuestionsOf(items).length, BEFORE_MINUTES),
    items,
    minutes: BEFORE_MINUTES,
    audience: { kind: "programme", roundId: input.roundId, programmeId: input.programmeId },
    roundId: input.roundId,
    programmeName: name,
    programmeKind: programme.kind,
    runId: programme.runId,
    closesAt: closesAtFor(input.closesOn),
    closedAt: null,
    namesOffOn,
    namesOffAt: null,
    firstSentAt: null,
    presses: [],
    tests: { survey: null, reminder: null },
    testToken: null,
    createdByUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, id: ref.id };
}

export type SaveInput = { title: string; intro: string; minutes: number; closesOn: string; items: SurveyItem[] };

/** A save from the editor, checked against the survey's own questions before anything is written. */
export function parseSave(raw: unknown, survey: SurveyDoc, now: Date): { ok: true; input: SaveInput } | Refused {
  if (!isRaw(raw)) return { ok: false, status: 400, error: REFUSAL.body };
  const title = typeof raw.title === "string" ? raw.title.replace(/\s+/g, " ").trim() : "";
  if (!title) return { ok: false, status: 400, error: "The survey needs a title people see." };
  if (title.length > SURVEY_LIMITS.title) return { ok: false, status: 400, error: `The title can be up to ${SURVEY_LIMITS.title} characters.` };
  const intro = typeof raw.intro === "string" ? raw.intro.replace(/\r\n?/g, "\n").trim() : "";
  if (intro.length > SURVEY_LIMITS.intro) return { ok: false, status: 400, error: `The intro can be up to ${SURVEY_LIMITS.intro} characters.` };
  const minutes = raw.minutes;
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < SURVEY_LIMITS.minMinutes || minutes > SURVEY_LIMITS.maxMinutes) {
    return { ok: false, status: 400, error: `About how many minutes it takes: a whole number from ${SURVEY_LIMITS.minMinutes} to ${SURVEY_LIMITS.maxMinutes}.` };
  }
  const closesOn = closingDay(raw.closesOn, now);
  if (typeof closesOn !== "string") return closesOn;
  const items = sanitizeSurveyItems(raw.items, { clampLimits: false });
  const problems = validateSurveyItems(items);
  if (problems.length > 0) return { ok: false, status: 400, error: problems[0].message };
  if (!sameQuestions(survey.items, items)) {
    return {
      ok: false,
      status: 400,
      error: "Questions can’t be added, taken out or changed in kind here: only their words, options, lines and order.",
    };
  }
  return { ok: true, input: { title, intro, minutes, closesOn, items } };
}

/** Write an editor's save, unless the survey has been sent meanwhile. */
export async function saveSurvey(db: Firestore, survey: SurveyDoc, input: SaveInput, now: Date): Promise<{ ok: true } | Refused> {
  const namesOffOn = await namesOffDayFor(db, survey.runId, now);
  const ref = db.collection(SURVEYS_COLLECTION).doc(survey.id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, status: 404, error: REFUSAL.noSurvey } as const;
    if ((snap.data() ?? {}).firstSentAt) return { ok: false, status: 409, error: REFUSAL.sent } as const;
    tx.update(ref, {
      title: input.title,
      intro: input.intro,
      minutes: input.minutes,
      closesAt: closesAtFor(input.closesOn),
      items: input.items,
      namesOffOn,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true } as const;
  });
}

/** The template's line count, for the New survey form's boxes. */
export { TEMPLATE_LINE_COUNT };
