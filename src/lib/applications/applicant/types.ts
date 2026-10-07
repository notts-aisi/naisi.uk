import type { AvailabilityGrid } from "@/lib/admissions/availability";
import type { AdmissionApplicationStatus } from "@/lib/firestore/admissionApplications";
import type {
  AboutYou,
  ApplicationContent,
  ApplicationResultKind,
  ProgrammeKind,
  QuestionSetRole,
  QuestionSetScope,
  QuestionType,
} from "../model";

/**
 * WHAT AN APPLICANT MAY KNOW, as it crosses the wire.
 *
 * These are the shapes the applicant's routes answer with and the form is
 * built from. Each one is a LIST OF FIELDS, written out, and the projections
 * in `./project.ts` fill them one field at a time. A field that is not named
 * here cannot reach an applicant, whatever is added to the stored documents
 * later, and `tests/applications-apply-projection.test.mjs` holds each shape
 * to its exact keys.
 *
 * Types only, with no import that runs, so the form (a client component) can
 * share them with the routes.
 */

/** A programme as the Choose step shows it. Nothing about who runs it. */
export type ApplicantProgramme = {
  id: string;
  kind: ProgrammeKind;
  name: string;
  shortName: string;
  pitch: string;
  facts: string;
  starts: string;
  closed: boolean;
};

/** A question as it is asked. Whether reviewers score it is not the applicant's to know. */
export type ApplicantQuestion = {
  id: string;
  text: string;
  help: string;
  type: QuestionType;
  options: string[];
  optionsFromRanking: boolean;
  wordLimit: number | null;
  required: boolean;
};

export type ApplicantQuestionSet = {
  id: string;
  role: QuestionSetRole;
  scope: QuestionSetScope;
  label: string;
  questions: ApplicantQuestion[];
};

/** Whether the form can be filled in right now. A draft form is never projected. */
export type ApplicantWindowState = "not-yet" | "open" | "closed";

/**
 * The form. Its dates are LABELS, already written out in Europe/London by the
 * server, so the browser never formats one in the reader's own zone.
 */
export type ApplicantForm = {
  id: string;
  label: string;
  windowState: ApplicantWindowState;
  /** "Tue 6 Oct", or null when the form has no opening date. */
  opensLabel: string | null;
  /** "Sun 18 Oct, 23:59", or null when the form has no deadline. */
  closesLabel: string | null;
  /** "Fri 23 Oct", the day everybody hears, or null when it is not set. */
  decisionsLabel: string | null;
  /** Every programme on the form, in the order the Choose step shows them. */
  programmes: ApplicantProgramme[];
  /** Question set ids in the order the form asks them. */
  questionSetIds: string[];
  asksFacilitating: boolean;
  availabilityGrid: AvailabilityGrid;
};

export type ApplicantResult = {
  kind: ApplicationResultKind;
  programmeId: string | null;
  publishedAt: string | null;
};

export type ApplicantInvitation = {
  programmeId: string;
  replyBy: string;
  response: "accepted" | "declined" | null;
  respondedAt: string | null;
};

export type ApplicantAttendance = {
  answer: "coming" | "cant-make-it";
  answeredAt: string | null;
};

/**
 * The caller's own application. `result`, `invitation` and `attendance` are
 * null until decision day has published them onto the document, so there is
 * nothing here to hear early.
 */
export type ApplicantApplication = {
  id: string;
  roundId: string;
  status: AdmissionApplicationStatus;
  draft: ApplicationContent;
  sent: ApplicationContent | null;
  createdAt: string | null;
  updatedAt: string | null;
  submittedAt: string | null;
  sentAt: string | null;
  /** "Sat 17 Oct", the day of the most recent send, or null. */
  sentLabel: string | null;
  result: ApplicantResult | null;
  invitation: ApplicantInvitation | null;
  attendance: ApplicantAttendance | null;
};

/** Everything the form needs to open: one GET, and the page's first render. */
export type ApplicantView = {
  form: ApplicantForm;
  sets: ApplicantQuestionSet[];
  application: ApplicantApplication | null;
  /** The caller's own About you answers, as their account holds them. */
  account: AboutYou;
};
