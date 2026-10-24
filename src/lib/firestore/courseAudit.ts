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
   * The five below belong to an APPLICATION FORM (`src/lib/applications/`).
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
  | "application-decisions-sent";

export const COURSE_AUDIT_KINDS: CourseAuditKind[] = [
  "attendance-edit",
  "attendance-push",
  "week-lock-override",
  "facilitator-appointed",
  "facilitator-removed",
  "enrolment-dropout",
  "enrol-mode-change",
  "run-settled",
  "run-hand-over",
  "access-requirements-read",
  "application-decision",
  "application-decision-revoked",
  "application-pooled-outcome",
  "application-exception",
  "application-decisions-sent",
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
  "run-hand-over": "People handed over from the application form",
  "access-requirements-read": "Access requirements read",
  "application-decision": "Application decided",
  "application-decision-revoked": "Acceptance revoked",
  "application-pooled-outcome": "Pooled applicant’s outcome picked",
  "application-exception": "Placement exception made",
  "application-decisions-sent": "Decisions sent",
};

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
} as const;

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
};

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
  };
}
