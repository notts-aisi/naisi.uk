import { mergedAnswers } from "@/lib/surveys/blanks";
import { CONSENT_PURPOSES, sanitizeSurveyItems, type SurveyAnswer, type SurveyConsents, type SurveyItem } from "@/lib/surveys/items";
import { INCUBATOR_STRANDS, SURVEY_TEMPLATES, type IncubatorStrand, type SurveyTemplate } from "@/lib/surveys/templates";

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
 *   surveyAnswers/{autoId}            one person's answers, sent once,
 *                                     and beside them each later send of
 *                                     questions they had left blank
 *
 * SERVER-ONLY IN BOTH DIRECTIONS. `firestore.rules` shuts all three to every
 * browser, an admin's included: every read is a server page or route on the
 * Admin SDK, and every write is a route. A person's answers reach a browser
 * only as an admin's results, made on the server.
 *
 * CONFIDENTIAL, NEVER ANONYMOUS. Every survey on the site knows who answered:
 * an account, or after an event somebody with no account, by the sign-up or
 * the check-in that brought them (`{ kind: "guest", signupId }`). The person is
 * a `respondent` map, `{ kind: "account", uid }`, found by one equality on
 * `respondent.uid`, so another kind sits beside it without a rewrite. Names
 * come off by setting it to null on the answers (the totals stay) and deleting
 * the people rows: the job two years after the programme or the event
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
 * follow-up 6 or 12 months on, each pairing with the one before it; the
 * survey for people leaving it (`leaving`), which pairs with none, is never
 * sent, and has no closing day; the survey after an event (`event`), which
 * pairs with none; or the check-in at the end of one session of one group
 * (`checkIn`, `src/lib/surveys/checkIns/`), which pairs with none, is opened
 * by the group's facilitator from the register and closes by itself that
 * night.
 */
export type SurveyKind = SurveyTemplate | "event" | "checkIn";

/** Every kind but the check-in: what the whole-collection reads list (`listSurveys`). */
export const SURVEY_KINDS_LISTED: readonly SurveyKind[] = [...SURVEY_TEMPLATES, "event"];

/** Confidential is the only setting: no survey on the site is anonymous. */
export type SurveyPrivacy = "confidential";

/**
 * Who a survey is for. `programme`: everybody holding a place on one
 * programme of an application form when it is sent, which before a programme
 * is everybody starting and at its end everybody still on it. `followUps`:
 * everybody whose row on the programme's before survey (`consentFrom`) says
 * yes to being contacted at 6 and 12 months, now. `leaving`: each person who
 * leaves the programme by their own hand while the survey is open, whose row
 * is made as they leave (`src/lib/surveys/leaving.ts`): nobody presses send.
 * `checkIn`: the people the register marks at one session of one group
 * (`CheckInAudience`). Later kinds sit beside them (an event's sign-ups or
 * who came).
 */
export type SurveyAudience =
  | { kind: "programme"; roundId: string; programmeId: string }
  | { kind: "followUps"; roundId: string; programmeId: string; consentFrom: string }
  | { kind: "leaving"; roundId: string; programmeId: string }
  | CheckInAudience
  | EventAudience;

/**
 * Who a check-in is for: the people the register of one session of one group
 * marks there (present, late or left early), never the group's facilitators,
 * each with a row made when it opens, and anybody marked there while it is
 * open with a row made as they are marked (`src/lib/surveys/checkIns/`). The
 * programme it belongs to, for names off and the admins' pages; the group and
 * the session it is about. Fixed when it opens.
 */
export type CheckInAudience = {
  kind: "checkIn";
  roundId: string;
  programmeId: string;
  groupId: string;
  /** `sessionKey(weekNumber, occurrence)`: "w03". */
  sessionKey: string;
  weekNumber: number;
};

/**
 * The session a check-in is about, as it was when it opened, so the check-in
 * stands without the group or its calendar: the group's name and when the
 * session started and ended.
 */
export type CheckInFacts = { groupName: string; startsAt: Date | null; endsAt: Date | null };

/**
 * Who a survey after an event is for (`src/lib/surveys/events/audience.ts`):
 * the people who came (`event-came`, from check-in), or everybody whose
 * sign-up was confirmed (`event-signups`). Never anybody who did neither.
 * Chosen when the survey is made, and fixed by its first email.
 */
export type EventAudience = { kind: "event-came" | "event-signups"; eventId: string };

/** Whether an audience is an event's. */
export function isEventAudience(audience: SurveyAudience): audience is EventAudience {
  return audience.kind === "event-came" || audience.kind === "event-signups";
}

/**
 * The form and programme a programme survey's people come from. A survey
 * after an event has neither, so both are "" and nothing keyed on a form
 * finds it.
 */
export function programmeOf(audience: SurveyAudience): { roundId: string; programmeId: string } {
  return isEventAudience(audience) ? { roundId: "", programmeId: "" } : { roundId: audience.roundId, programmeId: audience.programmeId };
}

/** Whether a survey's audience is one programme's: never an event's. */
export function isProgrammeAudience(audience: SurveyAudience, roundId: string, programmeId: string): boolean {
  return !isEventAudience(audience) && audience.roundId === roundId && audience.programmeId === programmeId;
}

/** A survey after an event: its audience is the event's. */
export type EventSurveyDoc = SurveyDoc & { kind: "event"; audience: EventAudience; event: SurveyEventFacts };

/** Whether a survey is one after an event. */
export function isEventSurvey(survey: SurveyDoc): survey is EventSurveyDoc {
  return survey.kind === "event" && isEventAudience(survey.audience) && survey.event !== null;
}

/** A check-in: its audience is one session of one group. */
export type CheckInSurveyDoc = SurveyDoc & { kind: "checkIn"; audience: CheckInAudience; checkIn: CheckInFacts };

/**
 * Whether a survey is a check-in at the end of a session. Its kind, its
 * audience and its facts all say so, or it is none: a record with any one of
 * them missing is read as no check-in, and every reader that tells kinds apart
 * asks this.
 */
export function isCheckIn(survey: SurveyDoc): survey is CheckInSurveyDoc {
  return survey.kind === "checkIn" && survey.audience.kind === "checkIn" && survey.checkIn !== null;
}

/** A person a programme survey is for, or who answered it: an account. */
export type SurveyRespondent = { kind: "account"; uid: string };

/**
 * Somebody with no account a survey after an event is for: a guest who signed
 * up (`signupId` is their sign-up's id), or a walk-in who left an email at the
 * door (`signupId` is the check-in record the door made for them).
 */
export type SurveyGuest = { kind: "guest"; signupId: string };

/** A person a survey after an event is for: an account, or a guest. */
export type EventRespondent = SurveyRespondent | SurveyGuest;

/** The event a survey is about, as it was when the survey was made, so the survey stands without it. */
export type SurveyEventFacts = { title: string; startAt: Date | null; endAt: Date | null };

export type SurveyProgrammeKind = "fellowship" | "incubator";

/** One press of a send button: the first send, a send to people who joined since, or a reminder. */
export type SurveyPressKind = "first" | "joined" | "remind";

export type SurveyPress = {
  id: string;
  kind: SurveyPressKind;
  at: Date | null;
  /** People the press emailed. */
  count: number;
  /** Who pressed it, where the press recorded them (a survey after an event's do: its organisers are told who sent it). */
  byUid?: string;
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
  /** The programme as it was when the survey was made, so the survey stands without its form. "" after an event. */
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
  /** The event a survey after an event is about, as it was when made; null for a programme's. */
  event: SurveyEventFacts | null;
  /** The session a check-in is about, as it was when it opened; null for any other kind. */
  checkIn: CheckInFacts | null;
  /** It refuses answers from this moment: 23:59 in London on the day an admin picked. Null for a leaving survey, which has no closing day. */
  closesAt: Date | null;
  /** Closed early, by hand. */
  closedAt: Date | null;
  /** "YYYY-MM-DD", when names come off; null while the run's last session cannot be dated. */
  namesOffOn: string | null;
  /** When names came off. */
  namesOffAt: Date | null;
  /**
   * The first send. From then on the questions, the words and the closing
   * date are fixed. A leaving survey is never sent: this is when an admin
   * opened it, from when it reaches whoever leaves, and fixes it the same way.
   * A survey after an event takes answers from its QR code before its email
   * goes: this is whichever came first, an admin opening it for the code or
   * its first email.
   */
  firstSentAt: Date | null;
  presses: SurveyPress[];
  /**
   * How many people a leaving survey has reached: one for each person whose
   * row was made as they left. It outlives the rows, which go when names come
   * off, as `presses` does for a survey that is sent. Nought for any other.
   */
  reached: number;
  tests: Record<SurveyEmailKind, SurveyTest | null>;
  /** The secret in a test email's link: it opens the survey, and nothing sent through it is kept. */
  testToken: string | null;
  createdByUid: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type SurveyDelivery = "sent" | "held" | "suppressed";

/**
 * The link of the questions somebody left blank (docs/surveys.md, "Sending
 * the questions left blank"): its own secret, minted by an admin's press (the
 * first link never reopens the survey), what became of its email, and when
 * the answers sent through it came in, after which it is spent. A later press
 * mints a new secret, and the old link opens nothing.
 */
export type SurveyBlanksLink = {
  /** Never in a log line or an error. */
  token: string;
  sentAt: Date | null;
  delivery: SurveyDelivery | null;
  spentAt: Date | null;
};

/** One press of "Send the questions they left blank": when, by whom, and how many questions it sent. */
export type SurveyBlanksPress = { at: Date | null; byUid: string; count: number };

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
  /** The link of the questions they left blank, once an admin has pressed for one; null before. */
  blanks: SurveyBlanksLink | null;
  /** Every press of "Send the questions they left blank" for them, oldest first. */
  blanksPresses: SurveyBlanksPress[];
};

/** How somebody's answers came in. */
export type SurveyAnswerVia = "link" | "signed-in";

/**
 * One later send of questions somebody had left blank, kept beside the first
 * send and never over it: its answers (only to questions that were blank),
 * when it was sent, how, and whether the person's group had met by then.
 */
export type SurveyFill = {
  answers: Record<string, SurveyAnswer>;
  sentAt: Date | null;
  via: SurveyAnswerVia;
  /** Always false on a survey after an event, which keeps no group. */
  afterFirstSession: boolean;
};

export type SurveyAnswerDoc = {
  id: string;
  surveyId: string;
  roundId: string;
  /** Null once names have come off: the answers stay in the totals. */
  respondent: SurveyRespondent | null;
  /**
   * Every answer the person has given: the first send's, with what each later
   * send added (`mergedAnswers`). What every reader of the answers reads.
   */
  answers: Record<string, SurveyAnswer>;
  /** The first send's answers, exactly as they were sent. Never written again. */
  first: Record<string, SurveyAnswer>;
  /** The later sends of questions left blank, oldest first. */
  fills: SurveyFill[];
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

/**
 * Whether a survey's form ends with the Kairos choice: every programme
 * survey does (before, at the end, and the follow-ups), whatever its items,
 * so no edit can take the way to say no off a form. A later kind of survey
 * (one after an event) does not ask it.
 */
export function asksKairos(survey: Pick<SurveyDoc, "audience">): boolean {
  return survey.audience.kind === "programme" || survey.audience.kind === "followUps";
}

/**
 * Whether a survey's long answers each carry the box "You can quote this,
 * without my name". Exactly the surveys whose confidential box says that
 * comments ticked to be quoted may go in reports or on the site: a
 * programme's before survey, the one at its end, its follow-ups, and a
 * survey after an event. The survey about leaving says only that totals may
 * go in reports, so its long answer has no box and none of its comments can
 * ever be quoted, and a check-in's box says nothing of quoting at all.
 * `tests/surveys-quote-tick.test.mjs` holds the box's words and this to the
 * same answer for every kind.
 */
export function asksQuotes(survey: Pick<SurveyDoc, "kind">): boolean {
  return survey.kind !== "leaving" && survey.kind !== "checkIn";
}

/** One person's row: one per survey per person, so a second send to them is no second row. */
export function surveyPersonId(surveyId: string, respondent: SurveyRespondent): string {
  return `${surveyId}__${respondent.uid}`;
}

/** The same for a survey after an event, whose person may be a guest: `{surveyId}__g_{signupId}`. */
export function eventPersonId(surveyId: string, respondent: EventRespondent): string {
  return respondent.kind === "account" ? surveyPersonId(surveyId, respondent) : `${surveyId}__g_${respondent.signupId}`;
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

/** An account or a guest: what the rows and answers of a survey after an event hold. */
function readEventRespondent(raw: unknown): EventRespondent | null {
  const account = readRespondent(raw);
  if (account) return account;
  const r = (raw ?? {}) as Raw;
  if (r.kind === "guest" && typeof r.signupId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(r.signupId)) {
    return { kind: "guest", signupId: r.signupId };
  }
  return null;
}

/** A check-in's session key ("w03", "w03-2"), as `sessionKey` makes one. */
const SESSION_KEY = /^w\d{2}(-\d)?$/;

function readAudience(raw: unknown): SurveyAudience {
  const r = (raw ?? {}) as Raw;
  if (r.kind === "followUps" && typeof r.consentFrom === "string" && r.consentFrom) {
    return { kind: "followUps", roundId: str(r.roundId), programmeId: str(r.programmeId), consentFrom: r.consentFrom };
  }
  if (r.kind === "leaving") return { kind: "leaving", roundId: str(r.roundId), programmeId: str(r.programmeId) };
  if ((r.kind === "event-came" || r.kind === "event-signups") && typeof r.eventId === "string" && r.eventId) {
    return { kind: r.kind, eventId: r.eventId };
  }
  // A check-in's audience is whole or it is none: a group, a session and its
  // week. One that is not whole is read as a programme's, and `isCheckIn`
  // then answers no, so nothing treats it as a check-in.
  if (
    r.kind === "checkIn" &&
    typeof r.groupId === "string" &&
    r.groupId &&
    typeof r.sessionKey === "string" &&
    SESSION_KEY.test(r.sessionKey) &&
    typeof r.weekNumber === "number" &&
    Number.isInteger(r.weekNumber) &&
    r.weekNumber >= 1
  ) {
    return {
      kind: "checkIn",
      roundId: str(r.roundId),
      programmeId: str(r.programmeId),
      groupId: r.groupId,
      sessionKey: r.sessionKey,
      weekNumber: r.weekNumber,
    };
  }
  return { kind: "programme", roundId: str(r.roundId), programmeId: str(r.programmeId) };
}

function readEvent(raw: unknown): SurveyEventFacts | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  return { title: str(r.title), startAt: tsToDate(r.startAt), endAt: tsToDate(r.endAt) };
}

function readCheckIn(raw: unknown): CheckInFacts | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  return { groupName: str(r.groupName), startsAt: tsToDate(r.startsAt), endsAt: tsToDate(r.endsAt) };
}

/** The kind a stored survey says it is. An unknown kind reads as the before survey, as it always has. */
function readKind(raw: unknown): SurveyKind {
  if (raw === "event" || raw === "checkIn") return raw;
  return SURVEY_TEMPLATES.includes(raw as SurveyTemplate) ? (raw as SurveyTemplate) : "before";
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

function readBlanksLink(raw: unknown): SurveyBlanksLink | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  if (!isSurveyToken(r.token)) return null;
  const delivery = r.delivery;
  return {
    token: r.token,
    sentAt: tsToDate(r.sentAt),
    delivery: delivery === "sent" || delivery === "held" || delivery === "suppressed" ? delivery : null,
    spentAt: tsToDate(r.spentAt),
  };
}

function readBlanksPresses(raw: unknown): SurveyBlanksPress[] {
  if (!Array.isArray(raw)) return [];
  const out: SurveyBlanksPress[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Raw;
    out.push({ at: tsToDate(r.at), byUid: str(r.byUid), count: count(r.count) });
  }
  return out;
}

/** The later sends of blanks, each read against the survey's questions, oldest first. */
function readFills(raw: unknown, read: (raw: unknown) => Record<string, SurveyAnswer>): SurveyFill[] {
  if (!Array.isArray(raw)) return [];
  const out: SurveyFill[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Raw;
    out.push({
      answers: read(r.answers),
      sentAt: tsToDate(r.sentAt),
      via: r.via === "signed-in" ? "signed-in" : "link",
      afterFirstSession: r.afterFirstSession === true,
    });
  }
  return out.sort((a, b) => (a.sentAt?.getTime() ?? 0) - (b.sentAt?.getTime() ?? 0));
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
    const press: SurveyPress = { id: str(r.id), kind: r.kind, at: tsToDate(r.at), count: count(r.count) };
    if (typeof r.byUid === "string" && r.byUid) press.byUid = r.byUid;
    out.push(press);
  }
  return out;
}

export function normalizeSurvey(id: string, data: Raw): SurveyDoc {
  const tests = (data.tests ?? {}) as Raw;
  const minutes = count(data.minutes);
  return {
    id,
    kind: readKind(data.kind),
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
    event: data.kind === "event" ? readEvent(data.event) : null,
    checkIn: data.kind === "checkIn" ? readCheckIn(data.checkIn) : null,
    closesAt: tsToDate(data.closesAt),
    closedAt: tsToDate(data.closedAt),
    namesOffOn: typeof data.namesOffOn === "string" && DATE_KEY.test(data.namesOffOn) ? data.namesOffOn : null,
    namesOffAt: tsToDate(data.namesOffAt),
    firstSentAt: tsToDate(data.firstSentAt),
    presses: readPresses(data.presses),
    reached: count(data.reached),
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
    blanks: readBlanksLink(data.blanks),
    blanksPresses: readBlanksPresses(data.blanksPresses),
  };
}

/**
 * One person's row on a survey after an event, whose person may be a guest.
 * The programme surveys' fields, less the consents (an event's survey asks
 * none).
 */
export type EventSurveyPersonDoc = Omit<SurveyPersonDoc, "respondent" | "roundId" | "consents" | "consentsAt"> & {
  respondent: EventRespondent;
};

/** A stored row of a survey after an event, or null for one that is not whole. */
export function normalizeEventPerson(id: string, data: Raw): EventSurveyPersonDoc | null {
  const respondent = readEventRespondent(data.respondent);
  if (!respondent || !isSurveyToken(data.token)) return null;
  const delivery = data.delivery;
  return {
    id,
    surveyId: str(data.surveyId),
    respondent,
    token: data.token,
    pressId: str(data.pressId),
    sentAt: tsToDate(data.sentAt),
    delivery: delivery === "sent" || delivery === "held" || delivery === "suppressed" ? delivery : null,
    remindedAt: tsToDate(data.remindedAt),
    reminders: count(data.reminders),
    answered: data.answered === true,
    blanks: readBlanksLink(data.blanks),
    blanksPresses: readBlanksPresses(data.blanksPresses),
  };
}

/** One person's answers to a survey after an event: when, how, and who, while the name is on them. */
export type EventSurveyAnswerDoc = Pick<SurveyAnswerDoc, "id" | "surveyId" | "answers" | "first" | "fills" | "sentAt" | "via"> & {
  /** Null once names have come off. */
  respondent: EventRespondent | null;
};

/** A stored answer to a survey after an event. */
export function normalizeEventAnswer(
  id: string,
  data: Raw,
  read: (raw: unknown) => Record<string, SurveyAnswer>,
): EventSurveyAnswerDoc {
  const first = read(data.answers);
  const fills = readFills(data.fills, read);
  return {
    id,
    surveyId: str(data.surveyId),
    respondent: readEventRespondent(data.respondent),
    // Every reader reads the first send with each later send of blanks added, through the one merge.
    answers: mergedAnswers(first, fills),
    first,
    fills,
    sentAt: tsToDate(data.sentAt),
    via: data.via === "signed-in" ? "signed-in" : "link",
  };
}

/** A stored answer. `items` are the survey's, so only its own questions are read back. */
export function normalizeSurveyAnswer(id: string, data: Raw, read: (raw: unknown) => Record<string, SurveyAnswer>): SurveyAnswerDoc {
  const first = read(data.answers);
  const fills = readFills(data.fills, read);
  return {
    id,
    surveyId: str(data.surveyId),
    roundId: str(data.roundId),
    respondent: readRespondent(data.respondent),
    // Every reader reads the first send with each later send of blanks added, through the one merge.
    answers: mergedAnswers(first, fills),
    first,
    fills,
    sentAt: tsToDate(data.sentAt),
    via: data.via === "signed-in" ? "signed-in" : "link",
    afterFirstSession: data.afterFirstSession === true,
  };
}
