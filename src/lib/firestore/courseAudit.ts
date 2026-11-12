/**
 * `courseAudit/{autoId}`: ONE append-only log for every course operational
 * action that has to stay answerable after the fact.
 *
 * WHY ONE COLLECTION AND NOT ONE PER FEATURE. The codebase already carries
 * three per-feature audits (`impersonations`, `courseDeletions`,
 * `subscriptionEvents`) and no general one, so every new course action that
 * wanted logging was reaching for a fourth, a fifth and a sixth. The
 * questions asked of them are the same questions (who did this, to what,
 * when, and what did they say about it), and answering "what happened to
 * this run" across six collections is six queries and six chances to forget
 * one.
 * `kind` is the discriminator; `runId` is the query axis, and `roundId` is the
 * axis for the kinds that are about an application form rather than a run.
 *
 * APPEND-ONLY, AND SHUT TO EVERY CLIENT INCLUDING ADMINS. No client writes it:
 * that is the `courseDeletions` posture, for the reason stated there, that an
 * audit its own actor can amend is not an audit. No client reads it either. A
 * line about a decision on an application carries the applicant's account id,
 * the programme and the outcome, which the decision documents keep from every
 * browser until decision day, and an admin can be an applicant. Every writer
 * is an Admin SDK route, and every reader is server code that decides what the
 * person in front of it may see.
 *
 * NOT SWEPT BY ACCOUNT DELETION, and that is a decision rather than an
 * oversight. A row here names the ACTOR of a staff action (and sometimes its
 * subject), and erasing the record of who read a member's access
 * requirements, or who put a run into open enrolment, because that person
 * later deleted their account would destroy the only evidence the action ever
 * happened. `impersonations` and `courseDeletions` are retained on exactly
 * the same reasoning and are likewise not swept. The rows are staff-action
 * metadata, not member content: nothing here holds an applicant's answers,
 * their access requirements, or a facilitator's notes about them, only the
 * fact that a named actor touched them. The DESTROY cascade does clear them
 * per run, because destroying a run destroys the things the rows describe, and
 * the round destroy clears the rows keyed to its form for the same reason
 * (`src/lib/admissions/destroy.ts`).
 */

export const COURSE_AUDIT_COLLECTION = "courseAudit";

/**
 * What happened. Kept deliberately coarse: a kind earns its place when
 * somebody would go looking for it by name.
 */
export type CourseAuditKind =
  /** An admin edited a register after it was pushed and locked. */
  | "attendance-edit"
  /** A facilitator pressed PUSH ATTENDANCE, locking one register. */
  | "attendance-push"
  /** Staff opened a week's content before its lock date released it. */
  | "week-lock-override"
  | "facilitator-appointed"
  | "facilitator-removed"
  /** A member dropped themselves out of a run. */
  | "enrolment-dropout"
  /** A run moved between admissions and open enrolment. */
  | "enrol-mode-change"
  /** A run was settled: enrolments closed out and completion decided. */
  | "run-settled"
  /**
   * An admin or the programme's lead read somebody's answer of "No, I need a
   * different time" as "Most weeks, not all" ("They meant some weeks",
   * `src/lib/courses/timeAnswer/someWeeks.ts`), recording them excused on the
   * sessions chosen. `subjectUid` is the person; `detail` names the sessions
   * and never their words.
   */
  | "time-answer-changed"
  /**
   * An admin handed the people who hold a place on a programme of the
   * application form over to this run's allocation board. One row for each
   * press that put anybody there, saying how many and from which programme.
   * It is about the run, so it is keyed to the run like every kind above, and
   * it names no member.
   */
  | "run-hand-over"
  /**
   * Somebody read an applicant's access-requirements answer. Logged because
   * that answer is health and disability information held deliberately
   * outside the scored payload, and "who has read it" is the only control
   * left once a route can serve it at all.
   */
  | "access-requirements-read"
  /**
   * The six below belong to an APPLICATION FORM (`src/lib/applications/`).
   * They are about a form and the people who applied to it rather than about
   * a run, so a row of one of these kinds stores "" in `runId` and names the
   * form in `roundId`.
   *
   * A lead, or an admin, pressed Accept, Pool or Decline for one programme on
   * one application. One row per decision, and a changed mind is a second row.
   */
  | "application-decision"
  /** An admin took back an acceptance. `detail` carries the reason they gave. */
  | "application-decision-revoked"
  /** An admin picked what a pooled applicant will hear: an invitation, or no offer. */
  | "application-pooled-outcome"
  /** An admin gave one person a second place, as a named exception. */
  | "application-exception"
  /** An admin sent decision day: the outcomes were published and the emails went. */
  | "application-decisions-sent"
  /**
   * An admin offered freed places after decision day: people told "No offer
   * this time" were each given an invitation. One row for each press, saying
   * how many and on which programme, and naming nobody.
   */
  | "application-freed-places-offered"
  /**
   * The nine below are a GROUP'S TIME, ROOM AND LINK, one row for each
   * change, so a group's history can say who changed what, when, from what,
   * why, and how many were emailed (`weekId`, `before`, `after`, `reason`,
   * `emailed`). Written from the day these kinds shipped; nothing earlier was logged.
   *
   * One week's session moved, that week only ("Change a session", Move it).
   */
  | "session-moved"
  /** One week's session held online, same day and time. */
  | "session-online"
  /** One week's session cancelled, the group keeping pace. */
  | "session-cancelled"
  /** One week's session cancelled, and it and every later week pushed back a week. */
  | "session-pushed"
  /** One week's session put back as usual after one of the four above. */
  | "session-restored"
  /** A session whose time had passed recorded at the time it really met. */
  | "session-put-right"
  /** The group's regular day, time, length, room or campus changed from one week onwards. */
  | "group-time-changed"
  /** The room the group meets in every week set or changed, from the Groups tab. */
  | "group-room-changed"
  /** A session's meeting link set, for one week or every week. The row never holds the link. */
  | "group-link-set"
  /**
   * The four below are a session's REGISTER: who took it in whose place, and
   * what was done when a session did not happen. Each carries `weekId`.
   *
   * An admin or somebody leading the programme took a session's register in
   * its facilitators' place ("I'm covering it", or the first line they saved).
   */
  | "register-covered"
  /** An admin or a lead gave one session's register, check-in and report to somebody, until midnight. */
  | "register-given"
  /**
   * An admin or a lead changed whether one of the group's facilitators was at
   * a session. Admins' and leads' only: a group's history drops these rows for
   * anybody else (`loadGroupHistory`).
   */
  | "facilitator-record-changed"
  /**
   * A session that had started was called off after the fact, and the lines
   * its register held were cleared; `before` keeps what each line said.
   */
  | "session-did-not-happen"
  /**
   * Somebody running the group pressed Remind about one week's work: one row
   * for the press, saying how many it was for and how many were emailed,
   * naming nobody. Each person's own "Last reminded" is their record in
   * `courseNudges` (`src/lib/firestore/courseHandReminders.ts`).
   */
  | "week-reminded";

export const COURSE_AUDIT_KINDS: CourseAuditKind[] = [
  "attendance-edit",
  "attendance-push",
  "week-lock-override",
  "facilitator-appointed",
  "facilitator-removed",
  "enrolment-dropout",
  "enrol-mode-change",
  "run-settled",
  "time-answer-changed",
  "run-hand-over",
  "access-requirements-read",
  "application-decision",
  "application-decision-revoked",
  "application-pooled-outcome",
  "application-exception",
  "application-decisions-sent",
  "application-freed-places-offered",
  "session-moved",
  "session-online",
  "session-cancelled",
  "session-pushed",
  "session-restored",
  "session-put-right",
  "group-time-changed",
  "group-room-changed",
  "group-link-set",
  "register-covered",
  "register-given",
  "facilitator-record-changed",
  "session-did-not-happen",
  "week-reminded",
];

/** The label for a kind this build does not know. See `courseAuditKindLabel`. */
export const UNKNOWN_COURSE_AUDIT_LABEL = "Unrecognised action";

export const COURSE_AUDIT_KIND_LABEL: Record<CourseAuditKind, string> = {
  "attendance-edit": "Register edited after push",
  "attendance-push": "Register pushed",
  "week-lock-override": "Week unlocked early",
  "facilitator-appointed": "Facilitator appointed",
  "facilitator-removed": "Facilitator removed",
  "enrolment-dropout": "Member dropped out",
  "enrol-mode-change": "Enrolment mode changed",
  "run-settled": "Run settled",
  "time-answer-changed": "Time answer read as most weeks",
  "run-hand-over": "People handed over from the application form",
  "access-requirements-read": "Access requirements read",
  "application-decision": "Application decided",
  "application-decision-revoked": "Acceptance revoked",
  "application-pooled-outcome": "Pooled applicant’s outcome picked",
  "application-exception": "Placement exception made",
  "application-decisions-sent": "Decisions sent",
  "application-freed-places-offered": "Freed places offered",
  "session-moved": "Session moved for one week",
  "session-online": "Session held online",
  "session-cancelled": "Session cancelled, keeping pace",
  "session-pushed": "Session cancelled, later weeks pushed back",
  "session-restored": "Session put back as usual",
  "session-put-right": "Session put right after it happened",
  "group-time-changed": "Regular time changed",
  "group-room-changed": "Room changed",
  "group-link-set": "Meeting link set",
  "register-covered": "Register taken in a facilitator’s place",
  "register-given": "Session given to somebody covering",
  "facilitator-record-changed": "Whether a facilitator was there changed",
  "session-did-not-happen": "Session didn’t happen, register cleared",
  "week-reminded": "Reminded about a week’s work",
};

/**
 * Which filter of a group's history a row sits under: "Time and room",
 * "People", "Link" or "Registers". `other` is a row about the run or an
 * application, which a group's history does not offer a filter for (it still
 * shows under Everything). An unknown kind is `other`.
 */
export type CourseAuditCategory = "time-and-room" | "people" | "link" | "registers" | "other";

const COURSE_AUDIT_CATEGORY: Partial<Record<CourseAuditKind, CourseAuditCategory>> = {
  "session-moved": "time-and-room",
  "session-online": "time-and-room",
  "session-cancelled": "time-and-room",
  "session-pushed": "time-and-room",
  "session-restored": "time-and-room",
  "session-put-right": "time-and-room",
  "group-time-changed": "time-and-room",
  "group-room-changed": "time-and-room",
  "group-link-set": "link",
  "facilitator-appointed": "people",
  "facilitator-removed": "people",
  "enrolment-dropout": "people",
  "time-answer-changed": "people",
  "attendance-push": "registers",
  "attendance-edit": "registers",
  "register-covered": "registers",
  "register-given": "registers",
  "facilitator-record-changed": "registers",
  "session-did-not-happen": "registers",
  "week-reminded": "people",
};

/**
 * The kinds a group's history shows to admins and the people leading the
 * programme only: whether a facilitator was at a session is theirs alone
 * (never a facilitator's, nor anybody covering), so a history drawn for
 * anybody else drops these rows.
 */
export const LEAD_ONLY_AUDIT_KINDS: readonly CourseAuditKind[] = ["facilitator-record-changed"];

export function courseAuditCategory(kind: CourseAuditKind | string): CourseAuditCategory {
  return isCourseAuditKind(kind) ? (COURSE_AUDIT_CATEGORY[kind] ?? "other") : "other";
}

/**
 * The label for one row's `kind`, INCLUDING a kind this build has never heard
 * of. Always render through this: a rolled-back deploy, or a newer route
 * writing a kind this bundle predates, must not make a row claim to be a
 * different action than it was. `detail` still carries the sentence a reader
 * actually needs, so an unrecognised row is readable, just unlabelled.
 */
export function courseAuditKindLabel(kind: CourseAuditKind | string): string {
  return isCourseAuditKind(kind)
    ? COURSE_AUDIT_KIND_LABEL[kind]
    : UNKNOWN_COURSE_AUDIT_LABEL;
}

export function isCourseAuditKind(kind: unknown): kind is CourseAuditKind {
  return (
    typeof kind === "string" && COURSE_AUDIT_KINDS.includes(kind as CourseAuditKind)
  );
}

export const COURSE_AUDIT_LIMITS = {
  /** Human sentence describing the row, shown verbatim in the admin log. */
  detail: 1000,
  actorName: 120,
  targetLabel: 200,
  /** The reason a change was given, as the group was told it: one line. */
  reason: 200,
  /**
   * Keys in a `before` or `after` map, and the length of one text value in
   * it. As many as a register's lines (40), because a session called off
   * after the fact keeps what each cleared line said in its `before`.
   */
  changeKeys: 40,
  changeValue: 200,
} as const;

/** One value of a `before` or `after` map: plain, never a nested object. */
export type CourseAuditValue = string | number | boolean | null;

/**
 * The OPTIONAL fields a row may carry beside its sentence, written by the
 * kinds about a group's time, room, link and facilitators. A row written
 * before them, or by a kind that has none, reads null for each: the sentence
 * is still the whole record.
 */
export type CourseAuditChange = {
  /** The week a one-week change, or the first week of a regular one, is about ("w03"). */
  weekId: string | null;
  /** What it was, as small plain values ("weekday", "startTimeLocal", "room", ...). */
  before: Record<string, CourseAuditValue> | null;
  /** What it became, the same keys. */
  after: Record<string, CourseAuditValue> | null;
  /** The reason given, when one was. */
  reason: string | null;
  /** How many people the change emailed; 0 for nobody, null when the row predates the field. */
  emailed: number | null;
};

export type CourseAuditDoc = {
  /** Firestore auto-id. Rows are never addressed individually. */
  id: string;
  /**
   * WHAT WAS STORED, VERBATIM, even when this build does not recognise it.
   * Degrading an unknown kind to a known one would silently mis-label the
   * row as a different action, which is worse than a row that says it is
   * unrecognised: an audit that lies is not an audit. Render through
   * `courseAuditKindLabel`, and read `kindKnown` before branching on it.
   */
  kind: CourseAuditKind | string;
  /** False when `kind` is a string this build has no label or meaning for. */
  kindKnown: boolean;
  /**
   * The run the action belongs to. THE query axis, and the key the destroy
   * cascade drains on, so a row without one is unreachable by both. A row for
   * an action with no run stores "": the application kinds are the ones that
   * do, and they are found through `roundId` instead.
   */
  runId: string;
  /**
   * The application form the action belongs to. Written by the application
   * kinds, which have no run to key on, so that everything logged about one
   * form can be found with one equality. Null on every other row.
   */
  roundId: string | null;
  /** Optional narrower subjects, stored so a query can reach them later. */
  groupId: string | null;
  /** The member the action was ABOUT, when it was about one. */
  subjectUid: string | null;
  actorUid: string;
  actorName: string;
  /** Free-text label of the thing acted on, e.g. a week or a register id. */
  targetLabel: string;
  /** One human sentence: what changed, and from what to what. */
  detail: string;
  at: Date | null;
} & CourseAuditChange;

type Raw = Record<string, unknown>;

function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const obj = v as { toDate?: () => Date };
  return typeof obj?.toDate === "function" ? obj.toDate() : null;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/** A week id as every week map keys it: "w03". */
const WEEK_ID = /^w\d{2}$/;

/**
 * A `before` or `after` map as a reader may trust it: plain values only
 * (text capped, finite numbers, true or false, null), at most so many keys,
 * taken in key order so a hand-edited row truncates the same way every time.
 * Anything else, a nested map included, is left out; a map with nothing left
 * reads null.
 */
function changeMap(v: unknown): Record<string, CourseAuditValue> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, CourseAuditValue> = {};
  let count = 0;
  for (const key of Object.keys(v as Raw).sort()) {
    if (count >= COURSE_AUDIT_LIMITS.changeKeys) break;
    const value = (v as Raw)[key];
    if (typeof value === "string") out[key] = value.slice(0, COURSE_AUDIT_LIMITS.changeValue);
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean" || value === null) out[key] = value;
    else continue;
    count += 1;
  }
  return count > 0 ? out : null;
}

/**
 * The optional change fields of a stored row, each null when the row does not
 * carry it (every row written before they existed). Exported for the history
 * reader's tests, which hold a row with none of them to today's reading.
 */
export function courseAuditChangeOf(data: Raw): CourseAuditChange {
  const emailed = data.emailed;
  return {
    weekId: typeof data.weekId === "string" && WEEK_ID.test(data.weekId) ? data.weekId : null,
    before: changeMap(data.before),
    after: changeMap(data.after),
    reason: strOrNull(str(data.reason, COURSE_AUDIT_LIMITS.reason).replace(/\s+/g, " ").trim()),
    emailed: typeof emailed === "number" && Number.isInteger(emailed) && emailed >= 0 ? emailed : null,
  };
}

export function normalizeCourseAudit(id: string, data: Raw): CourseAuditDoc {
  // A kind this build does not recognise is KEPT as written and flagged,
  // never mapped onto a known one. The row still has to appear in the log
  // (hiding it would let a rollback silently shrink an audit trail), and
  // `detail` carries the sentence a reader needs, but nothing may claim it
  // was an action it was not.
  const rawKind = typeof data.kind === "string" ? data.kind : "";
  return {
    id,
    kind: rawKind,
    kindKnown: isCourseAuditKind(rawKind),
    runId: typeof data.runId === "string" ? data.runId : "",
    roundId: strOrNull(data.roundId),
    groupId: strOrNull(data.groupId),
    subjectUid: strOrNull(data.subjectUid),
    actorUid: typeof data.actorUid === "string" ? data.actorUid : "",
    actorName: str(data.actorName, COURSE_AUDIT_LIMITS.actorName),
    targetLabel: str(data.targetLabel, COURSE_AUDIT_LIMITS.targetLabel),
    detail: str(data.detail, COURSE_AUDIT_LIMITS.detail),
    at: tsToDate(data.at),
    ...courseAuditChangeOf(data),
  };
}
