import { formatRoundDate } from "@/lib/admissions/window";
import { formatRunStartShort } from "@/lib/courses/window";
import { placeNextWords } from "../decisionDay/emailCopy";
import { own } from "../keys";
import type { ApplicationContent, ProgrammeKind } from "../model";
import { EITHER_OPTION, contentForSend } from "../validate";
import { formShapeOf, questionSetsOf, sameContent } from "../applicant/shape";
import type {
  ApplicantApplication,
  ApplicantForm,
  ApplicantProgramme,
  ApplicantQuestionSet,
} from "../applicant/types";
import { REPLY_BY_IS_A_DEADLINE } from "./replies";
import { standingOf, type PlaceVia } from "./standing";

/**
 * WHAT "YOUR APPLICATION" SHOWS ONE PERSON, worked out from what an applicant
 * is already sent: the form as they may know it, its question sets as they
 * are asked, and their own application.
 *
 * The page hands these three to `statusViewFor` and draws what comes back.
 * Every word on the page that depends on the person (their order, the day
 * they sent it, the programme they are in, the day to reply by) is decided
 * here, so it can be run in a test against the term the boards were drawn
 * from without a browser.
 *
 * ## Nothing here can say anything early
 *
 * The outcome comes from `standingOf`, which reads the person's own document
 * and nothing else. Until decision day has written a result onto it, the
 * answer is `sent`: the same page for everybody who applied, with no field in
 * it that could differ by what a lead has decided. A test holds that by
 * giving two applications the same answers and every status a lead's work
 * could leave them in, and comparing the views.
 *
 * Pure, with no server import, so the form in the browser can ask it for the
 * three steps it shows straight after a send.
 */

export type StepState = "done" | "now" | "next";

/** One of the three steps: its name, the day beside it, and where it stands. */
export type StatusStep = { name: string; when: string | null; state: StepState };

/** A programme as the outcome screens name it. */
export type ViewProgramme = {
  /** "AGI Strategy Fellowship". */
  name: string;
  /** "AGI Strategy". */
  shortName: string;
  /** "6 WEEKS · ~5 HRS A WEEK · starts w/c 26 Oct". Set in mono, upper case by CSS. */
  facts: string;
  /** "6 WEEKS · starts w/c 26 Oct": the first fact and the start, for a card. */
  shortFacts: string;
};

export type StatusView =
  /** No application on this form under this account. */
  | { kind: "none"; label: string; window: ApplicantForm["windowState"]; opensLabel: string | null; closesLabel: string | null }
  /** Started and never sent. */
  | { kind: "draft"; label: string; open: boolean; closesLabel: string | null }
  /** Sent, and nothing published: the board `ap-status`. */
  | {
      kind: "sent";
      label: string;
      sentLabel: string | null;
      /** Their order, by short name. */
      order: string[];
      /** "Yes, either programme", "Not this time", or null when the form did not ask. */
      facilitating: string | null;
      steps: StatusStep[];
      /** The form is still open, so the answers can still be changed. */
      canChange: boolean;
      closesLabel: string | null;
      /** They changed something after sending and have not sent again. */
      unsentChanges: boolean;
    }
  /** Taken out of the term by something other than a reply on this page. */
  | { kind: "withdrawn"; label: string }
  /** Holds a place. Somebody placed by their own ranking gets `ap-offer`. */
  | {
      kind: "place";
      label: string;
      decidedLabel: string | null;
      via: PlaceVia;
      programme: ViewProgramme | null;
      /**
       * What comes next, in the words of the kind of programme they are in:
       * a fellowship's small group, or an incubator's email about its first
       * week. The words are the decision email's own (`placeNextWords`).
       */
      next: string;
      saidComing: boolean;
    }
  /** Invited, not answered: the invitation card of `ap-outcomes`. */
  | {
      kind: "invitation";
      label: string;
      decidedLabel: string | null;
      programme: ViewProgramme | null;
      /** "the Research incubator", or "the A and the B": what they applied for. */
      appliedFor: string | null;
      /** "Sun 25 Oct". */
      replyByLabel: string | null;
      /** The day to reply by has passed. */
      late: boolean;
      /**
       * It can still be accepted here. False only when the day has passed AND
       * the day is a wall, which is the reply route's own rule, so the page
       * never offers a button the route would refuse.
       */
      canAccept: boolean;
    }
  /** Gave a place or an invitation back. */
  | {
      kind: "released";
      label: string;
      decidedLabel: string | null;
      via: PlaceVia;
      how: "cant-make-it" | "no-thanks";
      programme: ViewProgramme | null;
    }
  /** The kind no card of `ap-outcomes`. */
  | {
      kind: "no-place";
      label: string;
      decidedLabel: string | null;
      /** "AGI Strategy", or "AGI Strategy and Technical AI Safety". */
      appliedFor: string | null;
      /** What to call them, or "" when the application has no name on it. */
      firstName: string;
    }
  /** A result that cannot be read. The page asks them to write to us. */
  | { kind: "unclear"; label: string };

/** "A", "A and B", "A, B and C". */
export function inWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function programmeOn(form: ApplicantForm, id: string | null): ApplicantProgramme | null {
  if (!id) return null;
  return form.programmes.find((programme) => programme.id === id) ?? null;
}

/** The programmes they ranked that the form still carries, in their order, once each. */
function ranked(form: ApplicantForm, content: Pick<ApplicationContent, "rankedProgrammeIds">): ApplicantProgramme[] {
  const out: ApplicantProgramme[] = [];
  for (const id of content.rankedProgrammeIds) {
    const programme = programmeOn(form, id);
    if (programme && !out.includes(programme)) out.push(programme);
  }
  return out;
}

function viewProgramme(programme: ApplicantProgramme | null): ViewProgramme | null {
  if (!programme) return null;
  const facts = programme.facts.trim();
  const starts = programme.starts.trim();
  const startsPart = starts ? `starts ${starts}` : "";
  const first = facts.split("·")[0]?.trim() ?? "";
  return {
    name: programme.name,
    shortName: programme.shortName,
    facts: [facts, startsPart].filter(Boolean).join(" · "),
    shortFacts: [first, startsPart].filter(Boolean).join(" · "),
  };
}

/**
 * "Yes, either programme", "Yes, AGI Strategy", "Yes", "Not this time", or
 * null when the form did not ask or they did not say.
 *
 * Which programme comes from the facilitator question whose options are the
 * programmes they ranked. An answer that is not one of those reads as a
 * plain yes.
 */
export function facilitatingLine(
  form: ApplicantForm,
  sets: readonly ApplicantQuestionSet[],
  content: Pick<ApplicationContent, "rankedProgrammeIds" | "wantsToFacilitate" | "answers">,
): string | null {
  if (!form.asksFacilitating || content.wantsToFacilitate === null) return null;
  if (!content.wantsToFacilitate) return "Not this time";
  const names = ranked(form, content).map((programme) => programme.shortName);
  for (const set of sets) {
    if (set.role !== "facilitator") continue;
    const given = own(content.answers, set.id);
    for (const question of set.questions) {
      if (!question.optionsFromRanking) continue;
      const answer = own(given, question.id);
      if (typeof answer !== "string") continue;
      if (answer === EITHER_OPTION && names.length > 1) return "Yes, either programme";
      if (names.includes(answer)) return `Yes, ${answer}`;
    }
  }
  return "Yes";
}

/**
 * The name of the last of the three steps, from the kinds of programme
 * somebody ranked.
 *
 * "Meet your group" is a fellowship's: a small group with a facilitator. An
 * incubator is not run that way, and while everybody is waiting nobody knows
 * which of their choices it will be. So anybody with an incubator among their
 * choices reads "Start", which is true of every programme, and "Meet your
 * group" is said only to somebody who can end up nowhere but a fellowship.
 */
export function lastStepName(kinds: readonly ProgrammeKind[]): string {
  return kinds.includes("incubator") ? "Start" : "Meet your group";
}

/**
 * Sent, Hear back, and the start (`lastStepName`), while everybody is
 * waiting to hear.
 *
 * The last step carries when the programmes they ranked start. Where those
 * differ it lists each, because nobody knows yet which one it will be.
 */
export function waitingSteps(
  form: ApplicantForm,
  application: Pick<ApplicantApplication, "sent" | "sentLabel">,
): StatusStep[] {
  const choices = application.sent ? ranked(form, application.sent) : [];
  const starts: string[] = [];
  for (const programme of choices) {
    const label = programme.starts.trim();
    if (label && !starts.includes(label)) starts.push(label);
  }
  return [
    { name: "Sent", when: application.sentLabel, state: "done" },
    { name: "Hear back", when: form.decisionsLabel, state: "now" },
    {
      name: lastStepName(choices.map((programme) => programme.kind)),
      when: starts.length > 0 ? starts.join(" or ") : null,
      state: "next",
    },
  ];
}

function decidedLabelOf(form: ApplicantForm, application: ApplicantApplication): string | null {
  const at = application.result?.publishedAt ? new Date(application.result.publishedAt) : null;
  if (at && !Number.isNaN(at.getTime())) return formatRoundDate(at);
  return form.decisionsLabel;
}

/**
 * What the page shows this person. `today` is the civil date in London
 * ("2026-10-25"), which is what a reply-by day is compared with.
 * `replyByIsADeadline` is the reply route's own switch, taken from the same
 * constant unless a test says otherwise.
 */
export function statusViewFor(
  form: ApplicantForm,
  sets: readonly ApplicantQuestionSet[],
  application: ApplicantApplication | null,
  today: string,
  replyByIsADeadline: boolean = REPLY_BY_IS_A_DEADLINE,
): StatusView {
  const label = form.label;
  if (!application) {
    return {
      kind: "none",
      label,
      window: form.windowState,
      opensLabel: form.opensLabel,
      closesLabel: form.closesLabel,
    };
  }

  const standing = standingOf(application);
  const sent = application.sent;

  if (standing.kind === "withdrawn") return { kind: "withdrawn", label };
  if (standing.kind === "unclear") return { kind: "unclear", label };

  if (standing.kind === "waiting") {
    if (!sent) {
      return { kind: "draft", label, open: form.windowState === "open", closesLabel: form.closesLabel };
    }
    const wouldSend = contentForSend(formShapeOf(form), questionSetsOf(form, sets), application.draft);
    return {
      kind: "sent",
      label,
      sentLabel: application.sentLabel,
      order: ranked(form, sent).map((programme) => programme.shortName),
      facilitating: facilitatingLine(form, sets, sent),
      steps: waitingSteps(form, application),
      canChange: form.windowState === "open",
      closesLabel: form.closesLabel,
      unsentChanges: !sameContent(wouldSend, sent),
    };
  }

  const decidedLabel = decidedLabelOf(form, application);
  const applied = sent ? ranked(form, sent) : [];

  if (standing.kind === "place") {
    const placedOn = programmeOn(form, standing.programmeId);
    const next = placeNextWords(placedOn?.kind ?? null);
    return {
      kind: "place",
      label,
      decidedLabel,
      via: standing.via,
      programme: viewProgramme(placedOn),
      // The page of somebody their own ranking placed has room for the whole
      // sentence. The card of somebody who accepted an invitation has a line.
      next: standing.via === "ranking" ? next.page : next.card,
      saidComing: standing.saidComing,
    };
  }
  if (standing.kind === "invitation") {
    const late = standing.replyBy < today;
    return {
      kind: "invitation",
      label,
      decidedLabel,
      programme: viewProgramme(programmeOn(form, standing.programmeId)),
      appliedFor: applied.length > 0 ? inWords(applied.map((programme) => `the ${programme.name}`)) : null,
      replyByLabel: formatRunStartShort(standing.replyBy) ?? null,
      late,
      canAccept: !(late && replyByIsADeadline),
    };
  }
  if (standing.kind === "released") {
    return {
      kind: "released",
      label,
      decidedLabel,
      via: standing.via,
      how: standing.how,
      programme: viewProgramme(programmeOn(form, standing.programmeId)),
    };
  }
  return {
    kind: "no-place",
    label,
    decidedLabel,
    appliedFor: applied.length > 0 ? inWords(applied.map((programme) => programme.shortName)) : null,
    firstName: sent?.aboutYou.preferredName.trim() ?? "",
  };
}
