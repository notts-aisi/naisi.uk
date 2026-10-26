import { CONSENT_PURPOSES, sanitizeSurveyItems, type SurveyAnswer, type SurveyConsents, type SurveyItem } from "@/lib/surveys/items";
import { INCUBATOR_STRANDS, SURVEY_STAGES, type IncubatorStrand, type SurveyStage } from "@/lib/surveys/templates";

/**
 * SURVEYS: three server-only collections, the shapes their readers share.
 * `docs/surveys.md` is the contract this file implements.
 *
 *   surveys/{surveyId}                one survey: its words, its questions,
 *                                     who it is for, when it closes, when
 *                                     names come off, what has been sent
 *   surveyPeople/{surveyId}__{who}    one person a survey is for: the secret
 *                                     in their personal link, when it was
 *                                     sent and reminded, whether answered,
 *                                     and what their consent ticks say
 *   surveyAnswers/{autoId}            one person's answers, sent once
 *
 * SERVER-ONLY IN BOTH DIRECTIONS. `firestore.rules` shuts all three to every
 * browser, an admin's included: every read is a server page or route on the
 * Admin SDK, and every write is a route. A person's answers reach a browser
 * only as an admin's results, made on the server.
 *
 * CONFIDENTIAL, NEVER ANONYMOUS. Every survey on the site knows who answered:
 * an account today, and an event guest's own sign-up when event surveys
 * come. The person is a `respondent` map, `{ kind: "account", uid }`, found by
 * one equality on `respondent.uid`, so another kind can sit beside it without
 * a rewrite. Names come off by setting it to null on the answers (the totals
 * stay) and deleting the people rows: the job two years after the programme
 * (`src/lib/surveys/namesOff.ts`), and account deletion at once.
 *
 * WHAT IS NEVER KEPT: no draft of an answer before "Send my answers", no
 * record of when somebody opens a survey or for how long, no IP address.
 * `tests/surveys-no-tracking.test.mjs` walks the survey code for each.
 */

export const SURVEYS_COLLECTION = "surveys";
export const SURVEY_PEOPLE_COLLECTION = "surveyPeople";
export const SURVEY_ANSWERS_COLLECTION = "surveyAnswers";

/**
 * Which of a programme's surveys this is: before it, at its end, or a
 * follow-up 6 or 12 months on. Each pairs with the one before it.
 */
export type SurveyKind = SurveyStage;

/** Confidential is the only setting: no survey on the site is anonymous. */
export type SurveyPrivacy = "confidential";

/**
 * Who a survey is for. `programme`: everybody holding a place on one
 * programme of an application form when it is sent, which before a programme
 * is everybody starting and at its end everybody still on it. `followUps`:
 * everybody whose row on the programme's before survey (`consentFrom`) says
 * yes to being contacted at 6 and 12 months, now. Later kinds sit beside them
 * (people leaving, an event's sign-ups or who came).
 */
export type SurveyAudience =
  | { kind: "programme"; roundId: string; programmeId: string }
  | { kind: "followUps"; roundId: string; programmeId: string; consentFrom: string };

/** A person a survey is for, or who answered it. An account today. */
export type SurveyRespondent = { kind: "account"; uid: string };

export type SurveyProgrammeKind = "fellowship" | "incubator";

/** One press of a send button: the first send, a send to people who joined since, or a reminder. */
export type SurveyPressKind = "first" | "joined" | "remind";

export type SurveyPress = {
  id: string;
  kind: SurveyPressKind;
  at: Date | null;
  /** People the press emailed. */
  count: number;
};

/** The two emails a test is taken of. */
export type SurveyEmailKind = "survey" | "reminder";

/** The last test of one email that reached whoever sent it, and the wording it was made from. */
export type SurveyTest = {
  byUid: string;
  at: Date | null;
  /** `wordingFingerprint` of the email as the test sent it. */
  wording: string;
};

export type SurveyDoc = {
  id: string;
  kind: SurveyKind;
  privacy: SurveyPrivacy;
  /** The admins' name for it: "AGI Strategy: before". */
  name: string;
  /** What people see at the top: "Before you start". */
  title: string;
  /** The words under the title, and the email's opening. Paragraphs split by a blank line. */
  intro: string;
  items: SurveyItem[];
  /** "About 3 minutes". */
  minutes: number;
  audience: SurveyAudience;
  /** The programme as it was when the survey was made, so the survey stands without its form. */
  programmeName: string;
  programmeKind: SurveyProgrammeKind;
  /** The course run the programme named when the survey was made. */
  runId: string;
  /**
   * The survey of the stage before this one, for the same programme, when
   * this one was made: the after survey pairs with the before, a follow-up
   * with the after (or the before). Answers compare by person along the pairs.
   */
  pairOf: string | null;
  /** An incubator's research strand, for the first line of its skills question; null for a fellowship. */
  strand: IncubatorStrand | null;
  /** It refuses answers from this moment: 23:59 in London on the day an admin picked. */
  closesAt: Date | null;
  /** Closed early, by hand. */
  closedAt: Date | null;
  /** "YYYY-MM-DD", when names come off; null while the run's last session cannot be dated. */
  namesOffOn: string | null;
  /** When names came off. */
  namesOffAt: Date | null;
  /** The first send. From then on the questions, the words and the closing date are fixed. */
  firstSentAt: Date | null;
  presses: SurveyPress[];
  tests: Record<SurveyEmailKind, SurveyTest | null>;
  /** The secret in a test email's link: it opens the survey, and nothing sent through it is kept. */
  testToken: string | null;
  createdByUid: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type SurveyDelivery = "sent" | "held" | "suppressed";

export type SurveyPersonDoc = {
  id: string;
  surveyId: string;
  /** The form the survey's people came from, for the destroy and for one equality. */
  roundId: string;
  respondent: SurveyRespondent;
  /** The secret in their personal link. Never in a log line or an error. */
  token: string;
  /** The press that sent it to them. */
  pressId: string;
  sentAt: Date | null;
  delivery: SurveyDelivery | null;
  remindedAt: Date | null;
  reminders: number;
  answered: boolean;
  /**
   * What the person's ticks in the survey's consent blocks say, by purpose: a
   * yes or a no once they have sent their answers or changed it since, and
   * nothing before. A follow-up survey goes only to people whose row says yes.
   */
  consents: SurveyConsents;
  /** When the consents were last said, by sending the answers or changing them. */
  consentsAt: Date | null;
};

/** How somebody's answers came in. */
export type SurveyAnswerVia = "link" | "signed-in";

export type SurveyAnswerDoc = {
  id: string;
  surveyId: string;
  roundId: string;
  /** Null once names have come off: the answers stay in the totals. */
  respondent: SurveyRespondent | null;
  answers: Record<string, SurveyAnswer>;
  /** When "Send my answers" was pressed. */
  sentAt: Date | null;
  via: SurveyAnswerVia;
  /** Worked out when they were sent: had the person's group met for the first time? */
  afterFirstSession: boolean;
};

/** The longest each stored text may be. */
export const SURVEY_LIMITS = {
  name: 120,
  title: 120,
  intro: 1000,
  minMinutes: 1,
  maxMinutes: 60,
} as const;

/** One person's row: one per survey per person, so a second send to them is no second row. */
export function surveyPersonId(surveyId: string, respondent: SurveyRespondent): string {
  return `${surveyId}__${respondent.uid}`;
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** Whether a value has the shape of a survey link's secret. Says nothing of whether it is anybody's. */
export function isSurveyToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_SHAPE.test(value);
}

type Raw = Record<string, unknown>;

function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const obj = v as { toDate?: () => Date };
  return typeof obj?.toDate === "function" ? obj.toDate() : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function count(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function readRespondent(raw: unknown): SurveyRespondent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  if (r.kind === "account" && typeof r.uid === "string" && r.uid.length > 0) return { kind: "account", uid: r.uid };
  return null;
}

function readAudience(raw: unknown): SurveyAudience {
  const r = (raw ?? {}) as Raw;
  if (r.kind === "followUps" && typeof r.consentFrom === "string" && r.consentFrom) {
    return { kind: "followUps", roundId: str(r.roundId), programmeId: str(r.programmeId), consentFrom: r.consentFrom };
  }
  return { kind: "programme", roundId: str(r.roundId), programmeId: str(r.programmeId) };
}

function readConsents(raw: unknown): SurveyConsents {
  const out: SurveyConsents = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Raw;
  for (const purpose of CONSENT_PURPOSES) {
    if (typeof r[purpose] === "boolean") out[purpose] = r[purpose] as boolean;
  }
  return out;
}

function readTest(raw: unknown): SurveyTest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  if (typeof r.wording !== "string" || r.wording.length === 0) return null;
  return { byUid: str(r.byUid), at: tsToDate(r.at), wording: r.wording };
}

function readPresses(raw: unknown): SurveyPress[] {
  if (!Array.isArray(raw)) return [];
  const out: SurveyPress[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Raw;
    if (r.kind !== "first" && r.kind !== "joined" && r.kind !== "remind") continue;
    out.push({ id: str(r.id), kind: r.kind, at: tsToDate(r.at), count: count(r.count) });
  }
  return out;
}

export function normalizeSurvey(id: string, data: Raw): SurveyDoc {
  const tests = (data.tests ?? {}) as Raw;
  const minutes = count(data.minutes);
  return {
    id,
    kind: SURVEY_STAGES.includes(data.kind as SurveyKind) ? (data.kind as SurveyKind) : "before",
    privacy: "confidential",
    name: str(data.name),
    title: str(data.title),
    intro: str(data.intro),
    items: sanitizeSurveyItems(data.items),
    minutes: minutes > 0 ? minutes : 1,
    audience: readAudience(data.audience),
    programmeName: str(data.programmeName),
    programmeKind: data.programmeKind === "incubator" ? "incubator" : "fellowship",
    runId: str(data.runId),
    pairOf: typeof data.pairOf === "string" && data.pairOf ? data.pairOf : null,
    strand: INCUBATOR_STRANDS.includes(data.strand as IncubatorStrand) ? (data.strand as IncubatorStrand) : null,
    closesAt: tsToDate(data.closesAt),
    closedAt: tsToDate(data.closedAt),
    namesOffOn: typeof data.namesOffOn === "string" && DATE_KEY.test(data.namesOffOn) ? data.namesOffOn : null,
    namesOffAt: tsToDate(data.namesOffAt),
    firstSentAt: tsToDate(data.firstSentAt),
    presses: readPresses(data.presses),
    tests: { survey: readTest(tests.survey), reminder: readTest(tests.reminder) },
    testToken: isSurveyToken(data.testToken) ? data.testToken : null,
    createdByUid: str(data.createdByUid),
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
  };
}

/**
 * A stored person, or null for a row that is not whole: no person, or a
 * secret of the wrong shape. A row that is not whole is nobody's, and its
 * link opens nothing.
 */
export function normalizeSurveyPerson(id: string, data: Raw): SurveyPersonDoc | null {
  const respondent = readRespondent(data.respondent);
  if (!respondent || !isSurveyToken(data.token)) return null;
  const delivery = data.delivery;
  return {
    id,
    surveyId: str(data.surveyId),
    roundId: str(data.roundId),
    respondent,
    token: data.token,
    pressId: str(data.pressId),
    sentAt: tsToDate(data.sentAt),
    delivery: delivery === "sent" || delivery === "held" || delivery === "suppressed" ? delivery : null,
    remindedAt: tsToDate(data.remindedAt),
    reminders: count(data.reminders),
    answered: data.answered === true,
    consents: readConsents(data.consents),
    consentsAt: tsToDate(data.consentsAt),
  };
}

/** A stored answer. `items` are the survey's, so only its own questions are read back. */
export function normalizeSurveyAnswer(id: string, data: Raw, read: (raw: unknown) => Record<string, SurveyAnswer>): SurveyAnswerDoc {
  return {
    id,
    surveyId: str(data.surveyId),
    roundId: str(data.roundId),
    respondent: readRespondent(data.respondent),
    answers: read(data.answers),
    sentAt: tsToDate(data.sentAt),
    via: data.via === "signed-in" ? "signed-in" : "link",
    afterFirstSession: data.afterFirstSession === true,
  };
}
