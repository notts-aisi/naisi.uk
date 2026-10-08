import { formatRoundDate, formatRoundDeadline } from "@/lib/admissions/window";
import type { AdmissionRoundStatus } from "@/lib/firestore/admissionRounds";
import type { ApplicationForm } from "../normalise";
import type { FormReadiness } from "./readiness";
import {
  ACTION_TARGET,
  REOPEN_PROMPT,
  actionsFor,
  termStageFor,
  termStepsFor,
  type FormAction,
  type TermStage,
  type TermSteps,
} from "./status";

/**
 * WHAT THE TERM PAGE IS HANDED ABOUT THE FORM'S LIFECYCLE.
 *
 * Where the form is, in a sentence; which of its days is marked Now; and, for
 * an admin, the careful actions with the words of each confirmation and the
 * list of what is left before the form can open.
 *
 * Built here, field by field, from the stage (`./status.ts`) and the
 * readiness list (`./readiness.ts`), so the page formats nothing and decides
 * nothing: a button it draws is a move the route would make, and a line it
 * shows as missing is a line the route refuses on.
 *
 * WHO SEES WHAT is settled by `canRunTerm`. An admin is given the actions and
 * the list. A lead or a reviewer is given the sentence and the steps, and
 * nothing that names another programme's lead or questions.
 *
 * Pure, with no server import.
 */

export type ReadinessLineView = {
  id: string;
  label: string;
  ok: boolean;
  /** What to do about it. Empty when `ok`. */
  hint: string;
  /**
   * Where it is put right, when that is another page. Null when the line is
   * met, and when it is put right on the term page itself.
   */
  link: { href: string; label: string } | null;
};

export type ReadinessView = {
  ready: boolean;
  /** How many lines are not met. */
  left: number;
  lines: ReadinessLineView[];
};

export type ActionDialogView = {
  title: string;
  /** The paragraphs of the confirmation, in order. */
  lines: string[];
  /** The button that does it, and what it says while it is doing it. */
  confirm: string;
  busy: string;
};

export type ActionView = {
  action: FormAction;
  /** The status the route is asked for when it is confirmed. */
  target: AdmissionRoundStatus;
  /** The button's words on the page. */
  label: string;
  /** False when the route would refuse it as things stand. `reason` says why. */
  enabled: boolean;
  reason: string | null;
  dialog: ActionDialogView;
};

export type LifecycleView = {
  stage: TermStage;
  /** The stage in a word or two, for a chip: "Draft", "Opens Tue 6 Oct", "Deciding". */
  title: string;
  /** True for a stage that is happening now, which a chip marks with a dot. */
  live: boolean;
  /** Where the form is, in a sentence anybody on the form can be shown. */
  line: string;
  steps: TermSteps;
  /** For an admin. Empty for everybody else. */
  actions: ActionView[];
  /**
   * For an admin: the whole list while the form is a draft, and the list
   * again when something on it stops a closed form reopening. Null otherwise.
   */
  readiness: ReadinessView | null;
  /** For an admin: where to go for something no button here does. */
  pointer: { text: string; label: string; href: string } | null;
};

const TITLE: Record<TermStage, string> = {
  draft: "Draft",
  "opens-later": "Not open yet",
  open: "Open",
  deciding: "Deciding",
  decided: "Decisions sent",
  settled: "Settled",
  cancelled: "Cancelled",
  archived: "Archived",
};

function titleFor(stage: TermStage, form: ApplicationForm): string {
  if (stage === "opens-later" && form.round.opensAt) {
    return `Opens ${formatRoundDate(form.round.opensAt)}`;
  }
  return TITLE[stage];
}

/** Where a form is, as a chip: the stage, its word or two, and whether it is happening now. */
export type StageSummary = { stage: TermStage; title: string; live: boolean };

/**
 * The chip for one form. The term page and the list of forms both draw it
 * from here, so a form is never Closed on one and Deciding on the other.
 */
export function stageSummaryFor(form: ApplicationForm, now: Date): StageSummary {
  const stage = termStageFor({ ...form.round, decisionsSentAt: form.decisionsSentAt }, now);
  return { stage, title: titleFor(stage, form), live: stage === "open" || stage === "deciding" };
}

/** The link under a line that is not met, from where it is put right. */
function fixLink(home: string, fixAt: string | null): { href: string; label: string } | null {
  // Null is a line that is met. "" is the term page, which is where they are.
  if (!fixAt) return null;
  return {
    href: `${home}${fixAt}`,
    label: fixAt.startsWith("/programmes/") ? "Open its settings" : "Open the application form",
  };
}

const DECIDING = "Each lead is deciding their own programme.";

function sentSoFar(sent: number): string {
  if (sent === 0) return "Nobody has sent an application yet.";
  return sent === 1 ? "1 application sent so far." : `${sent} applications sent so far.`;
}

function lineFor(stage: TermStage, form: ApplicationForm, canRunTerm: boolean, sent: number, now: Date): string {
  const { opensAt, closesAt } = form.round;
  const closes = closesAt ? formatRoundDeadline(closesAt) : null;
  switch (stage) {
    case "draft":
      return canRunTerm
        ? "Nobody can apply to a draft. Open applications once everything on the list below is in place."
        : "This form is a draft, so nobody can apply yet. An admin opens it.";
    case "opens-later": {
      const opens = opensAt ? formatRoundDeadline(opensAt) : "a time that is not set";
      return closes
        ? `Applications open on ${opens} and close on ${closes}.`
        : `Applications open on ${opens}.`;
    }
    case "open":
      return `${closes ? `Applications are open until ${closes}.` : "Applications are open."} ${sentSoFar(sent)}`;
    case "deciding": {
      // The close has been and gone: the clock closed the form.
      if (closesAt && closesAt.getTime() <= now.getTime()) {
        return `Applications closed on ${closes}. ${DECIDING}`;
      }
      // Otherwise an admin did, ahead of the time the form gives.
      return closes
        ? `Applications are closed. An admin closed them before ${closes}. ${DECIDING}`
        : `Applications are closed. ${DECIDING}`;
    }
    case "decided": {
      const sentOn = form.decisionsSentAt ? formatRoundDate(form.decisionsSentAt) : "";
      const told = sentOn ? `Every decision went out on ${sentOn}.` : "Every decision has gone out.";
      return canRunTerm ? `${told} Settle the term to keep each applicant’s record.` : told;
    }
    case "settled":
      return form.decisionsSentAt
        ? `This term is settled. Every decision went out on ${formatRoundDate(form.decisionsSentAt)}.`
        : "This term is settled.";
    case "cancelled":
      return "This form was cancelled. Nobody can apply to it, and nothing is sent from it.";
    case "archived":
      return "This form is archived, so it is out of sight and takes no applications.";
  }
}

function openDialog(form: ApplicationForm, now: Date): ActionDialogView {
  const { opensAt, closesAt } = form.round;
  const until = closesAt ? ` until ${formatRoundDeadline(closesAt)}` : "";
  const from =
    opensAt && opensAt.getTime() > now.getTime()
      ? `People will be able to apply from ${formatRoundDeadline(opensAt)}${until}.`
      : `People will be able to apply straight away${until}.`;
  return {
    title: "Open applications?",
    lines: [from, "Once somebody has sent an application, the questions are locked."],
    confirm: "Open applications",
    busy: "Opening…",
  };
}

function closeDialog(stage: TermStage, form: ApplicationForm, sent: number): ActionDialogView {
  const { opensAt, closesAt } = form.round;
  const lines =
    stage === "opens-later"
      ? [
          opensAt
            ? `Applications have not opened yet. Closing the form now means they do not open on ${formatRoundDeadline(opensAt)}.`
            : "Applications have not opened yet. Closing the form now means they do not open.",
        ]
      : [
          closesAt
            ? `The form says applications close on ${formatRoundDeadline(closesAt)}. Closing now stops anybody applying, or changing what they sent, from this moment.`
            : "Closing now stops anybody applying, or changing what they sent, from this moment.",
          sentSoFar(sent),
        ];
  return { title: "Close applications early?", lines, confirm: "Close applications", busy: "Closing…" };
}

function reopenDialog(form: ApplicationForm): ActionDialogView {
  const { closesAt } = form.round;
  return {
    title: "Reopen applications?",
    lines: [
      REOPEN_PROMPT,
      closesAt
        ? `Applications will be open until ${formatRoundDeadline(closesAt)}.`
        : "Applications will be open again.",
    ],
    confirm: "Reopen applications",
    busy: "Reopening…",
  };
}

const SETTLE_DIALOG: ActionDialogView = {
  title: "Settle the term?",
  lines: [
    "Settling finishes this term’s applications. It keeps a record of each application with the applicant’s member record: when they applied, what for, the outcome, their scores and the reviewers’ notes.",
    "It cannot be undone.",
  ],
  confirm: "Settle the term",
  busy: "Settling…",
};

function thingsLeft(left: number): string {
  return left === 1 ? "1 thing is left to do first." : `${left} things are left to do first.`;
}

function actionView(
  action: FormAction,
  stage: TermStage,
  form: ApplicationForm,
  readiness: FormReadiness | null,
  sent: number,
  now: Date,
): ActionView {
  // Opening and reopening both end in an open form, so both wait on the list.
  const unready = readiness !== null && !readiness.ready;
  const target = ACTION_TARGET[action];
  switch (action) {
    case "open":
      return {
        action,
        target,
        label: "Open applications",
        enabled: !unready,
        reason: unready ? thingsLeft(readiness.unmet.length) : null,
        dialog: openDialog(form, now),
      };
    case "close":
      return {
        action,
        target,
        label: "Close early",
        enabled: true,
        reason: null,
        dialog: closeDialog(stage, form, sent),
      };
    case "reopen":
      return {
        action,
        target,
        label: "Reopen",
        enabled: !unready,
        reason: unready ? readiness.unmet.map((check) => check.hint).join(" ") : null,
        dialog: reopenDialog(form),
      };
    case "settle":
      return {
        action,
        target,
        label: "Settle the term",
        enabled: true,
        reason: null,
        dialog: SETTLE_DIALOG,
      };
  }
}

export type LifecycleInput = {
  form: ApplicationForm;
  /** The readiness list, when the caller worked it out. Null when it did not need to. */
  readiness: FormReadiness | null;
  /** `canRunTerm(user)`. */
  canRunTerm: boolean;
  /** How many people have sent an application. */
  sent: number;
  /** The form's own page, which every link here hangs off. */
  home: string;
  now: Date;
};

/** True when the page needs the readiness list worked out: an admin, and a form that could open. */
export function wantsReadiness(form: ApplicationForm, canRunTerm: boolean, now: Date): boolean {
  if (!canRunTerm) return false;
  const stage = termStageFor({ ...form.round, decisionsSentAt: form.decisionsSentAt }, now);
  return actionsFor(stage, form.round.status).some((action) => action === "open" || action === "reopen");
}

export function buildLifecycleView(input: LifecycleInput): LifecycleView {
  const { form, readiness, canRunTerm, sent, home, now } = input;
  const { stage, title, live } = stageSummaryFor(form, now);
  const offered = canRunTerm ? actionsFor(stage, form.round.status) : [];
  const waitsOnList = offered.some((action) => action === "open" || action === "reopen");
  // A draft is shown the whole list, ticks and all: getting through it is
  // what the page is for until the form opens. A form an admin closed has
  // been through it once, so it is shown the list only when something on it
  // would now stop a reopening.
  const showsList =
    waitsOnList && readiness !== null && (offered.includes("open") || !readiness.ready);

  // A form whose close has passed, and whose status nobody moved, takes
  // applications again when its close is moved. That is a date, not a move.
  const pointer =
    canRunTerm && stage === "deciding" && form.round.status === "open"
      ? {
          text: "To take applications again, move the close to a later time.",
          label: "Application form",
          href: `${home}/form`,
        }
      : null;

  return {
    stage,
    title,
    live,
    line: lineFor(stage, form, canRunTerm, sent, now),
    steps: termStepsFor(stage),
    actions: offered.map((action) => actionView(action, stage, form, waitsOnList ? readiness : null, sent, now)),
    readiness:
      showsList && readiness
        ? {
            ready: readiness.ready,
            left: readiness.unmet.length,
            lines: readiness.checks.map((check) => ({
              id: check.id,
              label: check.label,
              ok: check.ok,
              hint: check.hint,
              link: fixLink(home, check.fixAt),
            })),
          }
        : null,
    pointer,
  };
}
