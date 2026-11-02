/**
 * `courseSessionReports/{id}`: a facilitator's report on one session of their
 * group, written straight after the register: how it went, what went well,
 * what didn't, what seemed unclear, who engaged well and why, who seemed not
 * to have done the readings, who might need a hand, and anything for the
 * programme's lead or admins.
 *
 * NOT A SURVEY AND NOT A NOTE. It is a course record written by staff about
 * named people, read with those names by the programme's lead and admins
 * (privacy policy v15, "Session reports"). It is never filed in the notes
 * admins keep about a person (`src/lib/memberNotes/`), and
 * `tests/course-session-reports.test.mjs` lists every file that addresses
 * this collection, so a reader added anywhere else fails.
 *
 * ONE REPORT PER WRITER PER SESSION, by its id (`sessionReportId`): run,
 * group, session and writer. Two facilitators of a group write two reports
 * on the same session, and neither reads the other's.
 *
 * PEOPLE ARE STORED BY ACCOUNT, never by a typed name: each answer that picks
 * people holds their uids (with the words written about each one), and
 * `aboutUids` holds every uid the answers pick, so a person can be found and
 * taken out. Names typed into the free-text answers cannot be found, and
 * stay, as they do in a group's notes.
 *
 * WRITTEN AND READ ONLY ON THE SERVER. The one writer is the report route
 * (`src/app/api/courses/groups/[groupId]/session-report/route.ts`), and every
 * read goes through `src/lib/courses/sessionReports/`. `firestore.rules`
 * refuses every browser, admins included.
 *
 * WHAT TAKES IT AWAY: destroying the run deletes every report on it; deleting
 * an account takes that person's entries out of every report that picks them,
 * and keeps the reports the account wrote with no writer at all
 * (`src/lib/firestore/accountDeletion.ts`), as a register keeps the notes on
 * it.
 *
 * Pure, with no imports, so the form in the browser reads its limits here.
 */

export const COURSE_SESSION_REPORTS_COLLECTION = "courseSessionReports";

/**
 * The questions, by their fixed ids, in the order the form asks them. The
 * answers are keyed by these ids, so the questions' words can change (or
 * become editable) without touching a stored report.
 */
export const SESSION_REPORT_QUESTIONS = [
  "how",
  "wentWell",
  "didnt",
  "unclear",
  "engaged",
  "notRead",
  "needsHand",
  "forLead",
] as const;

export type SessionReportQuestion = (typeof SESSION_REPORT_QUESTIONS)[number];

/** The option under "What seemed unclear" that is none of the week's parts. */
export const SOMETHING_ELSE = "something-else";

/** The top of "How did the session go?": 1 to `HOW_TOP`. */
export const HOW_TOP = 5;

export const SESSION_REPORT_LIMITS = {
  /** Each free-text answer: what went well, what didn't, anything for the lead. */
  text: 2000,
  /** What made somebody stand out, or a word about somebody who might need a hand. */
  aboutOne: 300,
  /** The most people one answer can pick: a register's most rows. */
  people: 100,
  /** The most parts of a week one report keeps. */
  parts: 40,
  /** The longest part title kept, in characters. */
  partTitle: 200,
} as const;

/** One person an answer picks, with the words written about them ("" for none). */
export type ReportPick = { uid: string; note: string };

/** A part of the week as it read when the report was written. */
export type ReportPart = { id: string; title: string };

export type SessionReportAnswers = {
  /** 1 to 5; null only on a stored report that has lost it. */
  how: number | null;
  wentWell: string;
  didnt: string;
  /** Part ids of the week, and `SOMETHING_ELSE`. */
  unclear: string[];
  /** Who engaged well, each with what made them stand out. */
  engaged: ReportPick[];
  /** Who seemed not to have done the readings. */
  notRead: string[];
  /** Who might need a hand, each with a word about them. */
  needsHand: ReportPick[];
  forLead: string;
};

export type CourseSessionReportDoc = {
  id: string;
  runId: string;
  groupId: string;
  /** `sessionKey(weekNumber, occurrence)`: "w03". */
  sessionKey: string;
  weekNumber: number;
  occurrence: number;
  /**
   * Who wrote it. Null once the writer's account is deleted: the report stays
   * for the lead and admins and records no writer.
   */
  writerUid: string | null;
  answers: SessionReportAnswers;
  /** Every uid the answers pick, sorted: how a person is found in reports. */
  aboutUids: string[];
  /** The week's parts as they read when the report was last sent. */
  parts: ReportPart[];
  /** When it was first sent. */
  sentAt: Date | null;
  /** When it was last sent. */
  updatedAt: Date | null;
};

/**
 * The id of one writer's report on one session. CONSTRUCT-ONLY: every part is
 * also a field, and nothing parses the id (a run's and a group's ids already
 * hold `__`). A report whose writer's account was deleted moves to an
 * automatic id, so no uid of theirs is left in it.
 */
export function sessionReportId(runId: string, groupId: string, sessionKey: string, writerUid: string): string {
  return `${runId}__${groupId}__${sessionKey}__${writerUid}`;
}

/** Every uid the answers pick, once each, sorted. */
export function aboutUidsOf(answers: Pick<SessionReportAnswers, "engaged" | "notRead" | "needsHand">): string[] {
  const uids = new Set<string>();
  for (const pick of answers.engaged) uids.add(pick.uid);
  for (const uid of answers.notRead) uids.add(uid);
  for (const pick of answers.needsHand) uids.add(pick.uid);
  return [...uids].sort();
}

/** The answers with one person taken out of every answer that picks them. */
export function answersWithout(answers: SessionReportAnswers, uid: string): SessionReportAnswers {
  return {
    ...answers,
    engaged: answers.engaged.filter((pick) => pick.uid !== uid),
    notRead: answers.notRead.filter((each) => each !== uid),
    needsHand: answers.needsHand.filter((pick) => pick.uid !== uid),
  };
}

type Raw = Record<string, unknown>;

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

/** A uid as stored: a non-empty string that names one document. */
function isUid(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !value.includes("/");
}

function uids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const each of value) {
    if (out.length >= SESSION_REPORT_LIMITS.people) break;
    if (isUid(each) && !out.includes(each)) out.push(each);
  }
  return out;
}

function picks(value: unknown): ReportPick[] {
  if (!Array.isArray(value)) return [];
  const out: ReportPick[] = [];
  for (const each of value) {
    if (out.length >= SESSION_REPORT_LIMITS.people) break;
    if (!each || typeof each !== "object") continue;
    const uid = (each as Raw).uid;
    if (!isUid(uid) || out.some((pick) => pick.uid === uid)) continue;
    out.push({ uid, note: text((each as Raw).note, SESSION_REPORT_LIMITS.aboutOne) });
  }
  return out;
}

function partIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const each of value) {
    if (out.length > SESSION_REPORT_LIMITS.parts) break;
    if (typeof each === "string" && each && each.length <= 64 && !out.includes(each)) out.push(each);
  }
  return out;
}

function partsList(value: unknown): ReportPart[] {
  if (!Array.isArray(value)) return [];
  const out: ReportPart[] = [];
  for (const each of value) {
    if (out.length >= SESSION_REPORT_LIMITS.parts) break;
    if (!each || typeof each !== "object") continue;
    const id = (each as Raw).id;
    if (typeof id !== "string" || !id || out.some((part) => part.id === id)) continue;
    out.push({ id, title: text((each as Raw).title, SESSION_REPORT_LIMITS.partTitle) });
  }
  return out;
}

/** The answers as stored, read leniently: whatever cannot be trusted is left out. */
export function normalizeReportAnswers(value: unknown): SessionReportAnswers {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};
  const how = raw.how;
  return {
    how: typeof how === "number" && Number.isInteger(how) && how >= 1 && how <= HOW_TOP ? how : null,
    wentWell: text(raw.wentWell, SESSION_REPORT_LIMITS.text),
    didnt: text(raw.didnt, SESSION_REPORT_LIMITS.text),
    unclear: partIds(raw.unclear),
    engaged: picks(raw.engaged),
    notRead: uids(raw.notRead),
    needsHand: picks(raw.needsHand),
    forLead: text(raw.forLead, SESSION_REPORT_LIMITS.text),
  };
}

/**
 * A stored report, or null for a row that cannot say which run, group and
 * session it is about. A null row is shown to nobody, the safe direction for
 * a row nobody can place.
 */
export function normalizeSessionReport(id: string, data: Raw): CourseSessionReportDoc | null {
  const runId = typeof data.runId === "string" ? data.runId : "";
  const groupId = typeof data.groupId === "string" ? data.groupId : "";
  const sessionKey = typeof data.sessionKey === "string" ? data.sessionKey : "";
  const weekNumber = typeof data.weekNumber === "number" && Number.isInteger(data.weekNumber) ? data.weekNumber : 0;
  if (!runId || !groupId || !sessionKey || weekNumber < 1) return null;
  const occurrence =
    typeof data.occurrence === "number" && Number.isInteger(data.occurrence) && data.occurrence >= 1 ? data.occurrence : 1;
  const answers = normalizeReportAnswers(data.answers);
  return {
    id,
    runId,
    groupId,
    sessionKey,
    weekNumber,
    occurrence,
    writerUid: isUid(data.writerUid) ? data.writerUid : null,
    answers,
    aboutUids: aboutUidsOf(answers),
    parts: partsList(data.parts),
    sentAt: tsToDate(data.sentAt),
    updatedAt: tsToDate(data.updatedAt),
  };
}
