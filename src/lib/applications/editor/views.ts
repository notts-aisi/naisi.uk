import { formatRoundDate, formatRoundDeadline, roundWindowState } from "@/lib/admissions/window";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { formatRunStartShort } from "@/lib/courses/window";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import type { AdmissionRoundStatus } from "@/lib/firestore/admissionRounds";
import type { ProgrammeRole } from "../access";
import type {
  ApplicationQuestion,
  EmailWording,
  ProgrammeEmailKind,
  ProgrammeKind,
  ProgrammeSettings,
  QuestionSetDoc,
  QuestionSetRole,
  QuestionSetScope,
  QuestionType,
} from "../model";
import { PROGRAMME_EMAIL_KINDS } from "../model";
import { programmeEmailSubject } from "../decisionDay/emailCopy";
import type { ApplicationForm } from "../normalise";
import { RESULT_LABEL } from "../words";
import { lockedSentence, questionsLocked, sentCount } from "./lock";
import { own } from "./own";
import {
  describeSet,
  familyOf,
  isScoredSet,
  setsForProgramme,
  summaryLabel,
  whoSees,
  type SetFamily,
} from "./sets";

/**
 * WHAT THE EDITOR'S SCREENS ARE GIVEN.
 *
 * The form, its question sets and each programme's settings are read on the
 * server and never from a browser, so what a screen holds is whatever a route
 * or a page chose to hand it. Each function here is one such choice, written
 * out field by field for the people it serves:
 *
 *  - `projectFormForStaff`: anybody with a role on the form (an admin, a
 *    programme's lead, a programme's reviewer).
 *  - `projectSetForEditor`: admins, who are the only people who edit the form.
 *  - `projectProgrammeForSetup`: one programme's lead, and admins.
 *
 * A field reaches a screen when somebody adds it here on purpose. Nothing is
 * spread from a stored document, so a field a later build adds to the round
 * stays on the server until it is named below.
 *
 * Dates leave as what the screen prints ("Tue 6 Oct") beside the London date
 * and time a form control holds, so no component formats an instant itself.
 *
 * Pure, with no server import. The caller works out who is asking and passes
 * the answer in.
 */

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** An instant, as a London date and wall clock and as the words for it. */
export type MomentView = {
  /** "2026-10-06", Europe/London. */
  date: string;
  /** "09:00", Europe/London. */
  time: string;
  /** "Tue 6 Oct". */
  day: string;
  /** "Tue 6 Oct, 09:00". */
  dayAndTime: string;
};

/** A civil date and the words for it. */
export type DayView = { date: string; day: string };

/** Somebody the form names. */
export type PersonView = {
  uid: string;
  name: string;
  /** True for the person looking at the screen. */
  you: boolean;
};

/** Where the form is in its term, in one chip. */
export type FormStateView = {
  key: "draft" | "opens" | "open" | "closed" | "deciding" | "settled" | "cancelled" | "archived";
  label: string;
  /** Drawn with the live dot: the thing happening now. */
  live: boolean;
};

export type StaffContext = {
  now: Date;
  /** The uid of the person asking, for the "(you)" beside their own name. */
  viewerUid: string;
  /** The caller's role on a programme, from `roleOnProgramme`. */
  roleOn: (programmeId: string) => ProgrammeRole | null;
  /** Display names by uid for everybody the form names. */
  names: ReadonlyMap<string, string>;
  /** `canRunTerm(user)`. */
  canRunTerm: boolean;
};

function momentView(instant: Date | null): MomentView | null {
  if (!instant) return null;
  return {
    date: londonDateKey(instant),
    time: formatSiteDate(instant, { hour: "2-digit", minute: "2-digit" }),
    day: formatRoundDate(instant),
    dayAndTime: formatRoundDeadline(instant),
  };
}

function dayView(key: string | null): DayView | null {
  if (!key) return null;
  const day = formatRunStartShort(key);
  return day ? { date: key, day } : null;
}

function personView(uid: string, context: Pick<StaffContext, "names" | "viewerUid">): PersonView {
  return {
    uid,
    name: context.names.get(uid) ?? "Somebody whose account has gone",
    you: uid === context.viewerUid,
  };
}

const STATUS_LABEL: Record<AdmissionRoundStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
  deciding: "Deciding",
  settled: "Settled",
  cancelled: "Cancelled",
};

/**
 * The one chip that says where the form is. It follows the same window
 * predicate the apply routes enforce, so a form the chip calls open is a form
 * that takes applications.
 */
export function formStateFor(form: ApplicationForm, now: Date): FormStateView {
  const round = form.round;
  if (round.archived) return { key: "archived", label: "Archived", live: false };
  if (round.status !== "open") {
    return {
      key: round.status,
      label: STATUS_LABEL[round.status],
      live: round.status === "deciding",
    };
  }
  const window = roundWindowState(round, now);
  if (window.state === "not-yet" && window.opensAt) {
    return { key: "opens", label: `Opens ${formatRoundDate(window.opensAt)}`, live: false };
  }
  if (window.state === "open") return { key: "open", label: "Open", live: true };
  return { key: "closed", label: "Closed", live: false };
}

// ---------------------------------------------------------------------------
// The form, for anybody with a role on it
// ---------------------------------------------------------------------------

/** One programme as the staff screens list it. */
export type ProgrammeSummaryView = {
  id: string;
  kind: ProgrammeKind;
  name: string;
  shortName: string;
  facts: string;
  starts: string;
  places: number | null;
  groupCount: number | null;
  closed: boolean;
  lead: PersonView | null;
  /** The caller's own role here, or null when they have none. */
  role: ProgrammeRole | null;
};

export type FormStaffView = {
  id: string;
  label: string;
  state: FormStateView;
  /** True while the form has never been opened. */
  draft: boolean;
  opens: MomentView | null;
  closes: MomentView | null;
  /** The day everybody hears. */
  decisions: DayView | null;
  /** The day invitations are accepted by. */
  replyBy: DayView | null;
  asksFacilitating: boolean;
  /** How many people have sent an application. */
  sent: number;
  /** True once anybody has: the questions can no longer change. */
  locked: boolean;
  programmes: ProgrammeSummaryView[];
  /** True for an admin: the form itself is theirs to edit. */
  canRunTerm: boolean;
};

function programmeSummary(programme: ProgrammeSettings, context: StaffContext): ProgrammeSummaryView {
  return {
    id: programme.id,
    kind: programme.kind,
    name: programme.name,
    shortName: programme.shortName,
    facts: programme.facts,
    starts: programme.starts,
    places: programme.places,
    groupCount: programme.groupCount,
    closed: programme.closed,
    lead: programme.leadUid ? personView(programme.leadUid, context) : null,
    role: context.roleOn(programme.id),
  };
}

/**
 * The form as the people who work on it see it: its dates, where it is in the
 * term, and its programmes with the caller's own role on each. Nothing about
 * any applicant beyond how many have sent.
 */
export function projectFormForStaff(form: ApplicationForm, context: StaffContext): FormStaffView {
  const round = form.round;
  const programmes: ProgrammeSummaryView[] = [];
  for (const id of form.programmeIds) {
    const programme = own(form.programmes, id);
    if (programme) programmes.push(programmeSummary(programme, context));
  }
  return {
    id: round.id,
    label: round.label,
    state: formStateFor(form, context.now),
    draft: round.status === "draft",
    opens: momentView(round.opensAt),
    closes: momentView(round.closesAt),
    decisions: dayView(round.decisionsByDate),
    replyBy: dayView(form.invitationReplyBy),
    asksFacilitating: form.asksFacilitating,
    sent: sentCount(round.applicationCounts),
    locked: questionsLocked(round.applicationCounts),
    programmes,
    canRunTerm: context.canRunTerm,
  };
}

// ---------------------------------------------------------------------------
// A question set, for the admins who edit the form
// ---------------------------------------------------------------------------

export type QuestionView = {
  id: string;
  text: string;
  help: string;
  type: QuestionType;
  options: string[];
  optionsFromRanking: boolean;
  wordLimit: number | null;
  required: boolean;
  scored: boolean;
};

export type QuestionSetView = {
  id: string;
  role: QuestionSetRole;
  scope: QuestionSetScope;
  /** The sets it is shown beside in the editor. */
  family: SetFamily;
  label: string;
  /** The line applicants read under the heading. */
  intro: string;
  /** "People who tick AGI Strategy": the line under its name in the list. */
  audience: string;
  /** The sentence under its heading when it is open. */
  description: string;
  questions: QuestionView[];
};

function questionView(question: ApplicationQuestion): QuestionView {
  return {
    id: question.id,
    text: question.text,
    help: question.help,
    type: question.type,
    options: [...question.options],
    optionsFromRanking: question.optionsFromRanking,
    wordLimit: question.wordLimit,
    required: question.required,
    scored: question.scored,
  };
}

function scopeView(scope: QuestionSetScope): QuestionSetScope {
  if (scope.type === "kind") return { type: "kind", kind: scope.kind };
  if (scope.type === "programme") return { type: "programme", programmeId: scope.programmeId };
  return { type: "facilitating" };
}

/**
 * One question set with every question in it, for the form's editor. Admins
 * only: the questions are the whole of what the editor changes.
 */
export function projectSetForEditor(
  set: QuestionSetDoc,
  form: ApplicationForm,
  sets: readonly QuestionSetDoc[],
): QuestionSetView {
  return {
    id: set.id,
    role: set.role,
    scope: scopeView(set.scope),
    family: familyOf(set, form),
    label: set.label,
    intro: set.intro,
    audience: whoSees(set, form),
    description: describeSet(set, form, sets),
    questions: set.questions.map(questionView),
  };
}

/** The form's sets in the order it asks them, empty ones included. */
export function setsInFormOrder(
  form: Pick<ApplicationForm, "questionSetIds">,
  sets: readonly QuestionSetDoc[],
): QuestionSetDoc[] {
  const byId = new Map(sets.map((set) => [set.id, set]));
  const out: QuestionSetDoc[] = [];
  for (const id of form.questionSetIds) {
    const set = byId.get(id);
    if (set) out.push(set);
  }
  return out;
}

// ---------------------------------------------------------------------------
// One programme's settings, for its lead and for admins
// ---------------------------------------------------------------------------

/**
 * The subject a decision-day email goes out under until the programme words
 * its own. It is the decision-day emails' own function under the name this
 * module has always exported, so the standard subjects are written in one
 * place and this page cannot show one the send does not use.
 */
export { standardSubject as defaultEmailSubject } from "../decisionDay/emailCopy";

const EMAIL_TITLE: Record<ProgrammeEmailKind, string> = {
  accepted: RESULT_LABEL.accepted,
  invitation: RESULT_LABEL.invited,
  declined: RESULT_LABEL.declined,
};

const EMAIL_NOTE: Record<ProgrammeEmailKind, string> = {
  accepted: "with I’m coming and I can’t make it",
  invitation: "if the committee invites a pooled applicant here",
  declined: "off unless an admin switches it on",
};

export type EmailView = {
  kind: ProgrammeEmailKind;
  /** "You’re in". */
  title: string;
  /** The subject it goes out under: the programme's own, or the standard one. */
  subject: string;
  /** What comes after the subject on its row. */
  note: string;
  /** The programme's own wording, or null while it uses the standard one. */
  wording: EmailWording | null;
};

export type QuestionSetSummaryView = {
  id: string;
  /** "Fellowship questions, shared with Technical AI Safety". */
  label: string;
  questions: number;
  scored: boolean;
};

export type CandidateView = { uid: string; name: string; fullName: string };

export type ProgrammeSetupView = {
  roundId: string;
  /** "Autumn 2026". */
  formLabel: string;
  state: FormStateView;
  opens: MomentView | null;
  closes: MomentView | null;
  decisions: DayView | null;
  id: string;
  kind: ProgrammeKind;
  name: string;
  shortName: string;
  pitch: string;
  facts: string;
  starts: string;
  places: number | null;
  groupCount: number | null;
  groupSize: string;
  useScores: boolean;
  closed: boolean;
  /** The caller's role: only a lead or an admin is given this view. */
  role: "admin" | "lead";
  lead: PersonView | null;
  reviewers: PersonView[];
  /** People who could be named here. Empty for a caller who names nobody. */
  candidates: CandidateView[];
  questionSets: QuestionSetSummaryView[];
  /** How many people have applied to this programme. */
  applications: number;
  /** "57 people have applied, so the questions are locked.", or null. */
  lockedSentence: string | null;
  emails: EmailView[];
};

export type SetupContext = StaffContext & {
  role: "admin" | "lead";
  candidates: readonly CandidateView[];
  /** People whose sent application ranks this programme. */
  applications: number;
};

/**
 * One programme's settings, for its lead and for admins: what applicants are
 * shown, who reads its applications, and the wording of its emails. Its
 * questions are summarised, never listed: they belong to the form.
 */
export function projectProgrammeForSetup(
  form: ApplicationForm,
  sets: readonly QuestionSetDoc[],
  programme: ProgrammeSettings,
  context: SetupContext,
): ProgrammeSetupView {
  const round = form.round;
  const locked = questionsLocked(round.applicationCounts);
  // The number beside the lock is this programme's own while it has one, so it
  // agrees with the count on its Applications tab. The lock itself is the
  // form's: one person applying to anything locks every set.
  const applied = context.applications > 0 ? context.applications : sentCount(round.applicationCounts);
  const emails: EmailView[] = PROGRAMME_EMAIL_KINDS.map((kind) => {
    const wording = programme.emailWording[kind] ?? null;
    return {
      kind,
      title: EMAIL_TITLE[kind],
      // Asked of the code that sends, never worked out again here.
      subject: programmeEmailSubject(form, programme, kind),
      note: EMAIL_NOTE[kind],
      wording: wording ? { subject: wording.subject, body: wording.body } : null,
    };
  });
  return {
    roundId: round.id,
    formLabel: round.label,
    state: formStateFor(form, context.now),
    opens: momentView(round.opensAt),
    closes: momentView(round.closesAt),
    decisions: dayView(round.decisionsByDate),
    id: programme.id,
    kind: programme.kind,
    name: programme.name,
    shortName: programme.shortName,
    pitch: programme.pitch,
    facts: programme.facts,
    starts: programme.starts,
    places: programme.places,
    groupCount: programme.groupCount,
    groupSize: programme.groupSize,
    useScores: programme.useScores,
    closed: programme.closed,
    role: context.role,
    lead: programme.leadUid ? personView(programme.leadUid, context) : null,
    reviewers: programme.reviewerUids.map((uid) => personView(uid, context)),
    candidates: context.candidates.map((candidate) => ({
      uid: candidate.uid,
      name: candidate.name,
      fullName: candidate.fullName,
    })),
    questionSets: setsForProgramme(form, sets, programme.id).map((set) => ({
      id: set.id,
      label: summaryLabel(set, form, programme.id),
      questions: set.questions.length,
      scored: isScoredSet(set),
    })),
    applications: context.applications,
    lockedSentence: locked ? lockedSentence(applied) : null,
    emails,
  };
}
