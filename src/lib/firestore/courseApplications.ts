import { isId } from "@/lib/applications/keys";
import type { RsvpAnswer } from "./events";

/**
 * `courseApplications/{runId}__{uid}` — one member's application to one course
 * run. ALL writes go through server routes (`allow write: if false` in rules,
 * like subscriptions / eventRsvps): applications carry server-sourced PII
 * (email) plus reviewer-owned decision fields, and the status counters on the
 * run doc must move in the same transaction.
 *
 * The doc id is DETERMINISTIC — that's the structural one-application-per-
 * (run, user) invariant: the apply route uses `.create()`, which throws
 * ALREADY_EXISTS instead of quietly duplicating. No uniqueness query, no race.
 *
 * Answers reuse the events form machinery end-to-end: the run's
 * `applicationForm` is `FormQuestion[]`, answers are the same `RsvpAnswer`
 * union, and the submit route validates them with the shared
 * `validateAnswers` (src/lib/events/validateAnswers.ts).
 */

export type CourseApplicationStatus =
  | "pending"
  | "accepted"
  | "waitlisted"
  | "rejected"
  | "withdrawn";

export const COURSE_APPLICATION_STATUSES: CourseApplicationStatus[] = [
  "pending",
  "accepted",
  "waitlisted",
  "rejected",
  "withdrawn",
];

export const COURSE_APPLICATION_STATUS_LABEL: Record<CourseApplicationStatus, string> = {
  pending: "Pending review",
  accepted: "Accepted",
  waitlisted: "Waitlisted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/**
 * Field budgets for the application form's course-specific fields. The routes
 * are the security boundary; these power the client form's maxLength +
 * counters (same split as `users.FIELD_LIMITS`). Form-question answers are
 * capped separately by `validateAnswers` against the run's `applicationForm`.
 */
export const APPLICATION_FIELD_LIMITS = {
  availability: 500,
  reviewerNotes: 2000,
  decidedReason: 500,
  maxFacilitatorPreferences: 3,
} as const;

/**
 * Where a row came from, when it did not come from this run's own form.
 *
 * The term's application form (`src/lib/applications/`) decides who holds a
 * place on each programme, and a programme names the run its people go onto.
 * An admin's hand-over then writes one ACCEPTED row here for each of those
 * people, so that the allocation board, the allocate route and Publish find
 * them exactly where they find anybody else. `fromForm` is how such a row
 * says so: the form it came from and the programme on it.
 *
 * A ROW WITH `fromForm` CARRIES NOTHING OF THE APPLICATION. No address, no
 * answer, no availability: the board asks the application system for what it
 * needs when it draws (`src/lib/applications/handover/board.ts`). So nothing
 * a person wrote on the form is stored a second time on the course side.
 *
 * AND IT IS ANNOUNCED TO ITS OWNER AS NOTHING. It is the course side's list
 * to place people from, not news: what became of somebody's application is
 * said on their own application page and on the list of their applications.
 * So anything that draws a person's own row for them passes a row with
 * `fromForm` over before it looks at its status (`/api/courses/me` does),
 * and the first thing the course system shows that person is their group.
 */
export type CourseApplicationFromForm = {
  /** The application form's round id. */
  roundId: string;
  /** The programme on that form whose place this is. */
  programmeId: string;
};

export type CourseApplicationDoc = {
  /** Firestore doc id: `courseApplicationId(runId, uid)`. */
  id: string;
  runId: string;
  courseId: string;
  uid: string;
  /**
   * Set on a row the application form's hand-over wrote, null on a row made
   * by this run's own form. See {@link CourseApplicationFromForm}.
   */
  fromForm: CourseApplicationFromForm | null;
  /**
   * Server-sourced from the session user — never client-supplied, so an
   * applicant can't plant someone else's address. PII: own-row + admin read
   * only; the reviewer payload strips it.
   */
  email: string | null;
  /** Denormalised display name so review lists render without user reads. */
  displayName: string;
  /** Answers to the run's `applicationForm`, keyed by question id. */
  answers: Record<string, RsvpAnswer>;
  /** Up to 3 facilitators the applicant would prefer, in order. */
  facilitatorPreferenceUids: string[];
  /** Free-text availability for weekly sessions (plain text, member-authored). */
  availability: string;
  status: CourseApplicationStatus;
  /**
   * Snapshot of the paid-membership badge AT APPLY TIME (year-scoped tag on
   * the user doc). A snapshot, not a live read, so the review queue shows what
   * was true when they applied — never a gate, only a badge at review.
   */
  paidMembershipAtApply: boolean;
  // -- Reviewer-owned fields (decide/notes routes only) --
  reviewerNotes?: string;
  /** Reviewer's suggested placement, consumed by the allocation board. */
  reviewerPreferredGroupId?: string;
  reviewerPreferredFacilitatorUid?: string;
  decidedByUid?: string;
  decidedAt?: Date | null;
  decidedReason?: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

/**
 * Deterministic doc id: one application per (run, user), enforced by
 * `.create()` on this id (see module comment). CONSTRUCT-ONLY — `uid` and
 * `runId` are stored as fields, so lookups query fields, never parse the id.
 */
export function courseApplicationId(runId: string, uid: string): string {
  return `${runId}__${uid}`;
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

function asUidList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  for (const u of v) {
    if (typeof u === "string" && u) seen.add(u);
  }
  return Array.from(seen);
}

/**
 * A stored `fromForm`, or null. BOTH ids have to be there and be ids as the
 * application form means one (`isId`, which is pure and imports nothing, so
 * the browser bundle that reads a member's own row stays free of the rest of
 * the application system). A row is from the form whole, or it is a row of
 * the run's own: half a pointer reads as none.
 */
function asFromForm(v: unknown): CourseApplicationFromForm | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const { roundId, programmeId } = v as { roundId?: unknown; programmeId?: unknown };
  if (!isId(roundId) || !isId(programmeId)) return null;
  return { roundId, programmeId };
}

export function normalizeCourseApplication(id: string, data: Raw): CourseApplicationDoc {
  const status = data.status as CourseApplicationStatus;
  const doc: CourseApplicationDoc = {
    id,
    runId: str(data.runId),
    courseId: str(data.courseId),
    uid: str(data.uid),
    fromForm: asFromForm(data.fromForm),
    email: (data.email as string | null | undefined) ?? null,
    displayName: str(data.displayName),
    answers: (data.answers as Record<string, RsvpAnswer>) ?? {},
    facilitatorPreferenceUids: asUidList(data.facilitatorPreferenceUids).slice(
      0,
      APPLICATION_FIELD_LIMITS.maxFacilitatorPreferences,
    ),
    availability: str(data.availability),
    status: COURSE_APPLICATION_STATUSES.includes(status) ? status : "pending",
    paidMembershipAtApply: data.paidMembershipAtApply === true,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
  };
  if (typeof data.reviewerNotes === "string" && data.reviewerNotes) {
    doc.reviewerNotes = data.reviewerNotes;
  }
  if (typeof data.reviewerPreferredGroupId === "string" && data.reviewerPreferredGroupId) {
    doc.reviewerPreferredGroupId = data.reviewerPreferredGroupId;
  }
  if (
    typeof data.reviewerPreferredFacilitatorUid === "string" &&
    data.reviewerPreferredFacilitatorUid
  ) {
    doc.reviewerPreferredFacilitatorUid = data.reviewerPreferredFacilitatorUid;
  }
  if (typeof data.decidedByUid === "string" && data.decidedByUid) {
    doc.decidedByUid = data.decidedByUid;
    doc.decidedAt = tsToDate(data.decidedAt);
  }
  if (typeof data.decidedReason === "string" && data.decidedReason) {
    doc.decidedReason = data.decidedReason;
  }
  return doc;
}

/** The applicant-editable shape submitted from the apply form. */
export type CourseApplicationInput = {
  availability: string;
  facilitatorPreferenceUids: string[];
};

/**
 * Validate the course-specific application input. Used by BOTH the client
 * form (inline errors) and the apply route (the security boundary). The
 * form-question answers are validated separately via the events
 * `validateAnswers` against the run's `applicationForm`. Returns an error
 * string, or null when valid.
 */
export function validateApplicationInput(input: CourseApplicationInput): string | null {
  const L = APPLICATION_FIELD_LIMITS;
  if (input.availability.length > L.availability) {
    return "Your availability is a little too long.";
  }
  if (!Array.isArray(input.facilitatorPreferenceUids)) {
    return "Facilitator preferences look malformed.";
  }
  if (input.facilitatorPreferenceUids.length > L.maxFacilitatorPreferences) {
    return `Please pick at most ${L.maxFacilitatorPreferences} preferred facilitators.`;
  }
  if (input.facilitatorPreferenceUids.some((u) => typeof u !== "string" || !u)) {
    return "Facilitator preferences look malformed.";
  }
  return null;
}

/** Server-sourced fields the apply route supplies alongside the form input. */
export type CourseApplicationServerFields = {
  runId: string;
  courseId: string;
  uid: string;
  email: string | null;
  displayName: string;
  /** Validated answers (post-`validateAnswers`). */
  answers: Record<string, RsvpAnswer>;
  paidMembershipAtApply: boolean;
};

/**
 * Build a clean application payload for `.create()`: trims member text and
 * OMITS empty optionals entirely (never writes `undefined` — Firestore
 * rejects it, per the documented no-undefined-in-setDoc convention;
 * collaborators' `buildApplication` precedent). Reviewer/decision fields are
 * deliberately absent — they're written later by the decide/notes routes.
 * Timestamps are the caller's job (server timestamps at the route).
 */
export function buildApplication(
  server: CourseApplicationServerFields,
  input: CourseApplicationInput,
): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    runId: server.runId,
    courseId: server.courseId,
    uid: server.uid,
    email: server.email,
    displayName: server.displayName,
    answers: server.answers,
    status: "pending" satisfies CourseApplicationStatus,
    paidMembershipAtApply: server.paidMembershipAtApply,
    facilitatorPreferenceUids: input.facilitatorPreferenceUids
      .filter((u) => typeof u === "string" && u)
      .slice(0, APPLICATION_FIELD_LIMITS.maxFacilitatorPreferences),
  };
  const availability = input.availability.trim();
  if (availability) {
    doc.availability = availability.slice(0, APPLICATION_FIELD_LIMITS.availability);
  }
  return doc;
}

// ---------------------------------------------------------------------------
// A place the application form gave
// ---------------------------------------------------------------------------

/**
 * WHO A ROW IS SERVED TO, AMONG STAFF.
 *
 * A row from this run's own form is read by the people the run names: its
 * admissions reviewers decide it and its track leads place it. A row the
 * application form put here is different. The person applied on the form,
 * where who may read an application is decided programme by programme, and
 * being named on a run gives nobody that right. So such a row is an ADMIN'S,
 * on every staff route that reads or acts on rows: nobody else is listed it,
 * may place it, is named it in a refusal, or may decide or annotate it.
 *
 * The run's own gates are unchanged. A track lead still opens the board and
 * still sees and places everybody who applied to the run itself.
 *
 * Every staff reader of this collection asks here, and
 * `tests/applications-handover-row-readers.test.mjs` walks the tree for one
 * that does not.
 */
export function rowIsServedTo(
  row: Pick<CourseApplicationDoc, "fromForm">,
  viewer: { isAdmin: boolean },
): boolean {
  return row.fromForm === null || viewer.isAdmin;
}

/**
 * WHAT A ROW ITSELF KNOWS ABOUT PAID MEMBERSHIP, for a screen that could not
 * read the person's account.
 *
 * The allocation board and the run's own queue draw a membership badge
 * ("Paid 2026/27" or "Unpaid"). They read it from the person's account when
 * the screen is drawn (`users.paidMembershipYears`, the cache the membership
 * record's own writers keep, against the run's academic year), and they ask
 * the row only when that account cannot be read.
 *
 *  - A row from the run's own form carries a snapshot taken when the person
 *    applied (`paidMembershipAtApply`), and that is its answer.
 *  - A row the application form wrote carries no snapshot: nothing about
 *    membership crosses over from the form. Its answer is `null`, which is
 *    "not known", and a screen then draws no badge at all.
 *
 * A screen never says "Unpaid" about somebody it knows nothing about. The
 * field being absent is not an answer.
 */
export function membershipKnownFromRow(
  row: Pick<CourseApplicationDoc, "fromForm" | "paidMembershipAtApply">,
): boolean | null {
  return row.fromForm === null ? row.paidMembershipAtApply : null;
}

/**
 * The whole of a row the application form's hand-over creates: who the
 * person is, that they hold a place, and where the place came from. Nothing
 * else is written, and nothing here is ever updated by the hand-over.
 *
 * `status` is `accepted` because that is the one status the board, the
 * allocate route and Publish read. No `email`: the placement email goes to
 * the account's own address (`users.email`), and a row with no address is a
 * row the run's own decide route can never email about. Timestamps are the
 * caller's (server timestamps, in the transaction that creates the row).
 */
export function buildFormPlaceRow(input: {
  runId: string;
  courseId: string;
  uid: string;
  displayName: string;
  fromForm: CourseApplicationFromForm;
}): Record<string, unknown> {
  return {
    runId: input.runId,
    courseId: input.courseId,
    uid: input.uid,
    displayName: input.displayName,
    status: "accepted" satisfies CourseApplicationStatus,
    fromForm: {
      roundId: input.fromForm.roundId,
      programmeId: input.fromForm.programmeId,
    },
  };
}
