import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { own } from "@/lib/applications/keys";
import { isId, type ApplicationForm } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import { listForms } from "@/lib/applications/handover/run";
import { isValidDateKey, londonDateKey, londonWallClockToInstant } from "@/lib/courses/weekPlan";
import { SURVEYS_COLLECTION, SURVEY_LIMITS, isEventSurvey, isProgrammeAudience, normalizeSurvey, type SurveyAudience, type SurveyDoc } from "@/lib/firestore/surveys";
import { alignWalkInEmails, eventNamesOffDay } from "./events/records";
import { sameQuestions, sanitizeSurveyItems, surveyQuestionsOf, validateSurveyItems, type SurveyItem } from "./items";
import { namesOffDayFor } from "./namesOff";
import { programmeTemplateItems } from "./questionSetsStore";
import { mintSurveyToken } from "./token";
import {
  INCUBATOR_STRANDS,
  SURVEY_STAGES,
  SURVEY_TEMPLATES,
  stageAsksStrand,
  templateMinutes,
  type IncubatorStrand,
  type SurveyTemplate,
} from "./templates";
import { REFUSAL, STAGE_WORDS, introFor, surveyNameFor } from "./words";

/**
 * MAKING A PROGRAMME'S SURVEYS, AND CHANGING EACH UNTIL IT IS SENT.
 *
 * An admin picks a programme on an application form, a stage (before it, at
 * its end, 6 months on, 12 months on) and the day it closes; for an
 * incubator, which research it does, for the first line of its skills
 * question. Everything else is the stage's template (`templateItems`): the
 * questionnaire's questions, in pages, "about 5 minutes" before, in the words
 * of the stage's question set where an admin changed them
 * (`programmeTemplateItems`). The survey keeps the questions it was made
 * with: a later change to the set never reaches it.
 *
 * EACH STAGE PAIRS WITH THE ONE BEFORE IT, for the same programme: the after
 * survey with the before, a follow-up with the after (or the before), the
 * second follow-up with the first. The pair is found when a survey is made
 * and fixed then (`pairOf`), so answers compare by person along the pairs. A
 * follow-up goes only to people who said yes to follow-ups on the
 * programme's before survey, so it cannot be made without one.
 *
 * Until its first send an admin may change its words, its options and lines
 * and their order, how long it takes and the day it closes. From the first
 * send all of that is fixed: the email people were sent names the day it
 * closes, and the later stages have to ask the same questions.
 *
 * The day names come off is worked out from records when the survey is made
 * and each time it is saved, and fixed by the first send.
 *
 * THE LEAVING SURVEY (Q46) is made the same way, one per programme, from its
 * own template, and differs in four things: it pairs with no other survey; it
 * has no closing day; nobody sends it, so it is opened (`openLeavingSurvey`
 * in `./leaving.ts`), which fixes it as a first send does; and its test link
 * is made with it, so an admin can see it as people will before opening it.
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

export type CreateInput = {
  roundId: string;
  programmeId: string;
  stage: SurveyTemplate;
  /** "YYYY-MM-DD", or null for a leaving survey, which never closes. */
  closesOn: string | null;
  /** An incubator's research, or null to take its pair's (or for a fellowship). */
  strand: IncubatorStrand | null;
};

/** A request to make a survey, checked before anything is read. */
export function parseCreate(raw: unknown, now: Date): { ok: true; input: CreateInput } | Refused {
  if (!isRaw(raw) || !isId(raw.roundId) || !isId(raw.programmeId)) {
    return { ok: false, status: 400, error: "Pick the programme the survey is for." };
  }
  const stage = raw.stage === undefined ? "before" : raw.stage;
  if (!SURVEY_TEMPLATES.includes(stage as SurveyTemplate)) return { ok: false, status: 400, error: "Pick which of the programme’s surveys to make." };
  // A leaving survey has no closing day: whatever was sent for one is not read.
  const closesOn = stage === "leaving" ? null : closingDay(raw.closesOn, now);
  if (closesOn !== null && typeof closesOn !== "string") return closesOn;
  const strand = raw.strand === undefined || raw.strand === null || raw.strand === "" ? null : raw.strand;
  if (strand !== null && !INCUBATOR_STRANDS.includes(strand as IncubatorStrand)) {
    return { ok: false, status: 400, error: REFUSAL.strand };
  }
  return {
    ok: true,
    input: { roundId: raw.roundId, programmeId: raw.programmeId, stage: stage as SurveyTemplate, closesOn, strand: strand as IncubatorStrand | null },
  };
}

/** A programme a survey of one stage can be made for, as the New survey page lists them. */
export type ProgrammeChoice = {
  roundId: string;
  programmeId: string;
  /** "AGI Strategy" */
  name: string;
  /** "Autumn 2026" */
  formName: string;
  kind: "fellowship" | "incubator";
  /** Why it cannot have one yet, or "" when it can. */
  blocked: string;
};

const NO_RUN = "Name the programme’s course run in its Settings first, so the survey knows when the programme ends.";
const NOT_SENT = "Decisions haven’t been sent yet, so nobody holds a place.";
const HAS_ONE: Record<SurveyTemplate, string> = {
  before: "It has its before survey already.",
  after: "It has its survey at the end already.",
  followUp6: "It has its six-month follow-up already.",
  followUp12: "It has its follow-up a year on already.",
  leaving: "It has its leaving survey already.",
};
const NO_BEFORE = "Its before survey asks who may be contacted for follow-ups, and it hasn’t been sent.";

function programmeNameOf(form: ApplicationForm, programmeId: string): string {
  const programme = own(form.programmes, programmeId);
  return programme ? programme.shortName.trim() || programme.name.trim() : "";
}

/** The surveys already made for one programme, by stage. A check-in is no stage: it is one session's. */
function surveysOf(surveys: readonly SurveyDoc[], roundId: string, programmeId: string): Map<SurveyTemplate, SurveyDoc> {
  const out = new Map<SurveyTemplate, SurveyDoc>();
  for (const survey of surveys) {
    if (survey.kind === "event" || survey.kind === "checkIn") continue;
    if (isProgrammeAudience(survey.audience, roundId, programmeId) && !out.has(survey.kind)) out.set(survey.kind, survey);
  }
  return out;
}

/** The survey a new one of `stage` pairs with: the nearest earlier stage the programme has. The leaving survey pairs with none. */
function pairFor(stage: SurveyTemplate, made: Map<SurveyTemplate, SurveyDoc>): SurveyDoc | null {
  if (stage === "leaving") return null;
  const earlier = SURVEY_STAGES.slice(0, SURVEY_STAGES.indexOf(stage)).reverse();
  for (const each of earlier) {
    const survey = made.get(each);
    if (survey) return survey;
  }
  return null;
}

/** Why a programme cannot have a survey of `stage` yet, or "". */
function blockedFor(stage: SurveyTemplate, form: ApplicationForm, runId: string | null, made: Map<SurveyTemplate, SurveyDoc>): string {
  if (made.has(stage)) return HAS_ONE[stage];
  // Somebody leaves the programme's run, so it needs one; nobody is sent it.
  if (stage === "leaving") return runId === null ? NO_RUN : "";
  if (stage === "before" || stage === "after") {
    if (form.decisionsSentAt === null) return NOT_SENT;
    if (runId === null) return NO_RUN;
    return "";
  }
  const before = made.get("before");
  if (!before || !before.firstSentAt) return NO_BEFORE;
  return "";
}

/** Every programme on a form, with whether a survey of `stage` can be made for it now. */
export async function listProgrammeChoices(db: Firestore, surveys: readonly SurveyDoc[], stage: SurveyTemplate = "before"): Promise<ProgrammeChoice[]> {
  const forms = await listForms(db);
  const out: ProgrammeChoice[] = [];
  for (const form of forms) {
    for (const programmeId of form.programmeIds) {
      const programme = own(form.programmes, programmeId);
      if (!programme) continue;
      const made = surveysOf(surveys, form.round.id, programmeId);
      out.push({
        roundId: form.round.id,
        programmeId,
        name: programmeNameOf(form, programmeId),
        formName: form.round.label.trim() || "An application form",
        kind: programme.kind,
        blocked: blockedFor(stage, form, programme.runId, made),
      });
    }
  }
  return out.sort((a, b) => a.formName.localeCompare(b.formName, "en") || a.name.localeCompare(b.name, "en"));
}

/** Make one stage's survey for one programme. The route has held the caller to admin. */
export async function createSurvey(
  db: Firestore,
  createdByUid: string,
  input: CreateInput,
  now: Date,
): Promise<{ ok: true; id: string } | Refused> {
  const form = await loadForm(db, input.roundId);
  const programme = form ? own(form.programmes, input.programmeId) : undefined;
  if (!form || !programme) return { ok: false, status: 404, error: "That programme isn’t on a form any more." };

  const existing = await db.collection(SURVEYS_COLLECTION).where("roundId", "==", input.roundId).get();
  const made = surveysOf(
    existing.docs.map((doc) => normalizeSurvey(doc.id, doc.data() ?? {})),
    input.roundId,
    input.programmeId,
  );
  const blocked = blockedFor(input.stage, form, programme.runId, made);
  if (blocked) return { ok: false, status: 409, error: blocked };

  const pair = pairFor(input.stage, made);
  const before = made.get("before") ?? null;
  const followUp = input.stage === "followUp6" || input.stage === "followUp12";
  // A follow-up keeps its before survey's run, so its names come off the same day.
  const runId = followUp ? (before?.runId ?? null) : programme.runId;
  if (!runId) return { ok: false, status: 409, error: NO_RUN };

  const strand = programme.kind === "incubator" && stageAsksStrand(input.stage) ? (input.strand ?? pair?.strand ?? null) : null;
  if (programme.kind === "incubator" && stageAsksStrand(input.stage) && strand === null) {
    return { ok: false, status: 400, error: REFUSAL.strand };
  }

  const namesOffOn = await namesOffDayFor(db, runId, now);
  if (!namesOffOn) return { ok: false, status: 409, error: REFUSAL.noNamesOff };

  const name = programmeNameOf(form, input.programmeId);
  const items = await programmeTemplateItems(db, input.stage, programme.kind, strand);
  const minutes = templateMinutes(input.stage);
  const leaving = input.stage === "leaving";
  const audience: SurveyAudience = leaving
    ? { kind: "leaving", roundId: input.roundId, programmeId: input.programmeId }
    : followUp && before
      ? { kind: "followUps", roundId: input.roundId, programmeId: input.programmeId, consentFrom: before.id }
      : { kind: "programme", roundId: input.roundId, programmeId: input.programmeId };
  const ref = db.collection(SURVEYS_COLLECTION).doc();
  await ref.set({
    kind: input.stage,
    privacy: "confidential",
    name: surveyNameFor(name, input.stage),
    title: STAGE_WORDS[input.stage].title,
    intro: introFor(input.stage, surveyQuestionsOf(items).length, minutes),
    items,
    minutes,
    audience,
    roundId: input.roundId,
    programmeName: name,
    programmeKind: programme.kind,
    runId,
    pairOf: pair?.id ?? null,
    strand,
    closesAt: input.closesOn === null ? null : closesAtFor(input.closesOn),
    closedAt: null,
    namesOffOn,
    namesOffAt: null,
    firstSentAt: null,
    presses: [],
    reached: 0,
    tests: { survey: null, reminder: null },
    // Nobody is sent a leaving survey, so no test email makes its test link:
    // it is made here, for the admin to see it as people will.
    testToken: leaving ? mintSurveyToken() : null,
    createdByUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, id: ref.id };
}

/** Make a programme's before survey: the first stage. */
export async function createBeforeSurvey(
  db: Firestore,
  createdByUid: string,
  input: Omit<CreateInput, "stage" | "strand"> & { strand?: IncubatorStrand | null },
  now: Date,
): Promise<{ ok: true; id: string } | Refused> {
  return createSurvey(db, createdByUid, { ...input, stage: "before", strand: input.strand ?? null }, now);
}

/** An editor's save. `closesOn` is null for a leaving survey, which has no closing day. */
export type SaveInput = { title: string; intro: string; minutes: number; closesOn: string | null; items: SurveyItem[] };

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
  const closesOn = survey.kind === "leaving" ? null : closingDay(raw.closesOn, now);
  if (closesOn !== null && typeof closesOn !== "string") return closesOn;
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
  // A survey after an event takes its day from the event (src/lib/surveys/events/create.ts).
  const namesOffOn = isEventSurvey(survey) ? await eventNamesOffDay(db, survey) : await namesOffDayFor(db, survey.runId, now);
  const ref = db.collection(SURVEYS_COLLECTION).doc(survey.id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, status: 404, error: REFUSAL.noSurvey } as const;
    if ((snap.data() ?? {}).firstSentAt) return { ok: false, status: 409, error: REFUSAL.sent } as const;
    tx.update(ref, {
      title: input.title,
      intro: input.intro,
      minutes: input.minutes,
      closesAt: input.closesOn === null ? null : closesAtFor(input.closesOn),
      items: input.items,
      namesOffOn,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true } as const;
  }).then(async (saved) => {
    // A survey after an event: its walk-ins' emails follow its closing day.
    if (saved.ok && isEventSurvey(survey)) await alignWalkInEmails(db, survey.id, now);
    return saved;
  });
}
