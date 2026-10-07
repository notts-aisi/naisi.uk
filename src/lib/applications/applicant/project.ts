import "server-only";
import { formatRoundDate, formatRoundDeadline } from "@/lib/admissions/window";
import { formatRunStartShort } from "@/lib/courses/window";
import type { AdmissionApplicationStatus } from "@/lib/firestore/admissionApplications";
import type {
  AboutYou,
  Answers,
  AnswerValue,
  ApplicationContent,
  ApplicationDoc,
  ApplicationQuestion,
  ProgrammeSettings,
  QuestionSetDoc,
  QuestionSetScope,
} from "../model";
import type { ApplicationForm } from "../normalise";
import type {
  ApplicantApplication,
  ApplicantForm,
  ApplicantProgramme,
  ApplicantQuestion,
  ApplicantQuestionSet,
  ApplicantWindowState,
} from "./types";
import { isSafeKey, own } from "./keys";
import { formWindow } from "./window";

/**
 * THE APPLICANT'S SIDE OF THE BOUNDARY: three projections, each built one
 * field at a time.
 *
 * A stored form carries who leads each programme, who reviews it, how many
 * places it has, whether it is scored and what its emails will say. A stored
 * question carries whether reviewers score it. A stored round carries its
 * counters and its reviewer list. None of that is an applicant's to read, and
 * none of it can reach one from here, because nothing below spreads a stored
 * document: every field that leaves is named on its own line, so adding a
 * field to `model.ts` adds nothing to an applicant's payload.
 *
 * `tests/applications-apply-projection.test.mjs` fills every staff-only field
 * with a marker and fails if one survives, and holds each projection to its
 * exact list of keys.
 *
 * THE RULE: a new field reaches an applicant by being added to the type in
 * `./types.ts`, to the projection here and to that test, in one change. Never
 * by a spread.
 */

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function programmeForApplicant(programme: ProgrammeSettings): ApplicantProgramme {
  return {
    id: programme.id,
    kind: programme.kind,
    name: programme.name,
    shortName: programme.shortName,
    pitch: programme.pitch,
    facts: programme.facts,
    starts: programme.starts,
    closed: programme.closed,
  };
}

/**
 * The form as an applicant may know it: its label, its dates as labels, the
 * public half of each programme, and the geometry of the availability grid.
 *
 * A form that is not visible (a draft, or archived) must never be passed
 * here: the callers answer those as not found before they project anything.
 * Should one arrive anyway it reads as closed, which says nothing about why.
 */
export function projectFormForApplicant(form: ApplicationForm, now: Date): ApplicantForm {
  const state = formWindow(form, now);
  const windowState: ApplicantWindowState = state === "inactive" ? "closed" : state;
  const round = form.round;
  const programmes: ApplicantProgramme[] = [];
  for (const id of form.programmeIds) {
    const programme = own(form.programmes, id);
    if (programme) programmes.push(programmeForApplicant(programme));
  }
  return {
    id: round.id,
    label: round.label,
    windowState,
    opensLabel: round.opensAt ? formatRoundDate(round.opensAt) : null,
    closesLabel: round.closesAt ? formatRoundDeadline(round.closesAt) : null,
    decisionsLabel: round.decisionsByDate
      ? (formatRunStartShort(round.decisionsByDate) ?? null)
      : null,
    programmes,
    questionSetIds: [...form.questionSetIds],
    asksFacilitating: form.asksFacilitating,
    availabilityGrid: {
      version: round.availabilityGrid.version,
      startMinute: round.availabilityGrid.startMinute,
      endMinute: round.availabilityGrid.endMinute,
      slotMinutes: round.availabilityGrid.slotMinutes,
    },
  };
}

function questionForApplicant(question: ApplicationQuestion): ApplicantQuestion {
  return {
    id: question.id,
    text: question.text,
    help: question.help,
    type: question.type,
    options: [...question.options],
    optionsFromRanking: question.optionsFromRanking,
    wordLimit: question.wordLimit,
    required: question.required,
  };
}

function scopeForApplicant(scope: QuestionSetScope): QuestionSetScope {
  switch (scope.type) {
    case "everybody":
      return { type: "everybody" };
    case "kind":
      return { type: "kind", kind: scope.kind };
    case "programme":
      return { type: "programme", programmeId: scope.programmeId };
    case "facilitating":
      return { type: "facilitating" };
  }
}

/**
 * One question set as it is asked. The committee's own line about who sees
 * the set (`intro`) stays behind with the `scored` flag.
 */
export function projectQuestionSetForApplicant(set: QuestionSetDoc): ApplicantQuestionSet {
  return {
    id: set.id,
    role: set.role,
    scope: scopeForApplicant(set.scope),
    label: set.label,
    questions: set.questions.map(questionForApplicant),
  };
}

function aboutYouOf(about: AboutYou): AboutYou {
  return {
    preferredName: about.preferredName,
    universityEmail: about.universityEmail,
    universityEmailVerified: about.universityEmailVerified,
    status: about.status,
    statusOther: about.statusOther,
    subject: about.subject,
    expectedGraduation: about.expectedGraduation,
    motivation: about.motivation,
    interests: about.interests,
  };
}

function answersOf(answers: Answers): Answers {
  const out: Answers = {};
  for (const [setId, given] of Object.entries(answers)) {
    if (!isSafeKey(setId)) continue;
    const set: Record<string, AnswerValue> = {};
    for (const [questionId, value] of Object.entries(given)) {
      if (!isSafeKey(questionId)) continue;
      set[questionId] = Array.isArray(value) ? [...value] : value;
    }
    out[setId] = set;
  }
  return out;
}

function contentOf(content: ApplicationContent): ApplicationContent {
  return {
    aboutYou: aboutYouOf(content.aboutYou),
    rankedProgrammeIds: [...content.rankedProgrammeIds],
    wantsToFacilitate: content.wantsToFacilitate,
    answers: answersOf(content.answers),
    availability: {
      version: content.availability.version,
      startMinute: content.availability.startMinute,
      endMinute: content.availability.endMinute,
      slotMinutes: content.availability.slotMinutes,
      days: [...content.availability.days],
    },
    suMembership: content.suMembership,
  };
}

/**
 * A NO IS ONE THING TO THE PERSON WHO GETS IT. The committee tells an
 * application every programme declined (spam, or not eligible) from a pooled
 * one with no offer this term, and the person is not told which: their page
 * reads the same for both (`standingOf`), and so does the email a declined
 * person gets when one is sent. What their own route hands their browser has
 * to say the same one thing, or the difference the page hides is there to be
 * read beside it. So both read as no offer here. The stored document, and
 * everything the committee is shown, keeps the word.
 */
const SAID_AS: Partial<Record<AdmissionApplicationStatus, AdmissionApplicationStatus>> = {
  declined: "no-offer",
};

/**
 * The caller's own application: what they wrote, what they sent, where it
 * stands, and (once decision day has published them onto this document) what
 * they were told.
 *
 * The stored `email` and `displayName` are the session's, kept for the
 * committee, and are not echoed back. An invitation's `lastReminderOn` is the
 * reminder job's own bookkeeping and stays behind too.
 */
export function projectApplicationForOwner(application: ApplicationDoc): ApplicantApplication {
  const result = application.result;
  const invitation = application.invitation;
  const attendance = application.attendance;
  return {
    id: application.id,
    roundId: application.roundId,
    status: SAID_AS[application.status] ?? application.status,
    draft: contentOf(application.draft),
    sent: application.sent ? contentOf(application.sent) : null,
    createdAt: iso(application.createdAt),
    updatedAt: iso(application.updatedAt),
    submittedAt: iso(application.submittedAt),
    sentAt: iso(application.sentAt),
    sentLabel: application.sentAt ? formatRoundDate(application.sentAt) : null,
    result: result
      ? {
          kind: result.kind === "declined" ? "no-offer" : result.kind,
          programmeId: result.programmeId,
          publishedAt: iso(result.publishedAt),
        }
      : null,
    invitation: invitation
      ? {
          programmeId: invitation.programmeId,
          replyBy: invitation.replyBy,
          response: invitation.response,
          respondedAt: iso(invitation.respondedAt),
        }
      : null,
    attendance: attendance
      ? { answer: attendance.answer, answeredAt: iso(attendance.answeredAt) }
      : null,
  };
}
