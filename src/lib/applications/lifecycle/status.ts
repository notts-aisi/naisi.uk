import { nextStatuses, planStatusChange } from "@/lib/admissions/roundStatus";
import { formatRoundDate, formatRoundDeadline, roundWindowState } from "@/lib/admissions/window";
import {
  ADMISSION_ROUND_STATUSES,
  type AdmissionRoundDoc,
  type AdmissionRoundStatus,
} from "@/lib/firestore/admissionRounds";
import type { ApplicationFormFields } from "../model";

/**
 * MOVING AN APPLICATION FORM ALONG ITS TERM.
 *
 * A form is stored on an admission round, and a round's `status` already has
 * a machine: `ADMISSION_ROUND_TRANSITIONS`, read by `planStatusChange`. A form
 * moves by that same table and no other. This module is the form's reading of
 * it: which moves the table allows, what else a form asks before one is made,
 * and the sentence each refusal carries, in the form's own words.
 *
 * ## What a form adds to the table
 *
 * The older round console holds four refusals on top of the table, and a form
 * keeps all four:
 *
 *  1. A form that is being destroyed does not move at all.
 *  2. Reopening (`closed` to `open`) has to be confirmed.
 *  3. Opening needs the form to be READY (`./readiness.ts`). That one needs
 *     the question sets and the leads, so it is the caller's to ask: the plan
 *     says `needsReadiness`.
 *  4. An archived form cannot be opened.
 *
 * And three of its own, which follow from decision day:
 *
 *  5. A form whose decisions have been sent cannot be opened again. Everybody
 *     has been told, and an application taken after that would be one nobody
 *     decides.
 *  6. A form is settled only once decision day has been sent. Settling keeps
 *     each applicant's record, and there is no outcome to keep before then.
 *  7. A form is not settled while it is still taking applications.
 *
 * ## Settling walks the table, it does not jump it
 *
 * The table reaches `settled` through `closed` and `deciding`. For a form
 * those two are states the dates already tell: applications close when the
 * clock says so, and the leads decide from then until the send. Nobody should
 * have to press a button to say what the calendar says. So a move to
 * `settled` may be asked for from `open`, `closed` or `deciding`, and the plan
 * names every status on the way (`through`). Each hop is asked of
 * `planStatusChange` one at a time, so the walk follows the table's own
 * arrows and would stop the day the table lost one. Every other move is one
 * arrow, as it is for a round.
 *
 * ## Why the stage is not the status
 *
 * `termStageFor` is where the form IS, in the sense a person means: a form
 * whose status is `open` and whose close has passed is not open, it is being
 * decided. The status only ever moves when an admin moves it; the stage also
 * follows the clock and decision day. The page's sentence, its buttons and
 * the step marked Now are all read from the stage.
 *
 * Pure. The status route and the term page both ask this module, so a button
 * the page offers is a move the route makes.
 */

// ---------------------------------------------------------------------------
// The move
// ---------------------------------------------------------------------------

/** What a move depends on, read off the stored form. */
export type FormMoveFacts = Pick<AdmissionRoundDoc, "archived" | "opensAt" | "closesAt"> &
  Pick<ApplicationFormFields, "decisionsSentAt"> & {
    /**
     * The status as it is STORED, not as a normaliser repaired it. A form
     * whose status is not one this site knows is not quietly taken for a
     * draft and opened.
     */
    status: unknown;
    /** The destroy cascade's own marker on the round. */
    destroying: boolean;
    /**
     * Decision day has told somebody, though perhaps not everybody yet
     * (`decisionDayHasBegun`). A send can stop part way, and a form that
     * took applications again then would let somebody decided on and not yet
     * told send a different application.
     */
    anybodyTold?: boolean;
  };

export type FormMoveRefusalCode =
  | "destroying"
  | "unknown-status"
  | "terminal"
  | "illegal"
  | "archived"
  | "decisions-sent"
  | "decisions-not-sent"
  | "still-open";

export type FormMovePlan =
  | {
      ok: true;
      /** The form is already there: write nothing. */
      kind: "noop";
      status: AdmissionRoundStatus;
    }
  | {
      ok: true;
      kind: "move";
      to: AdmissionRoundStatus;
      /** Every status the move passes, ending in `to`. One entry for a single arrow. */
      through: AdmissionRoundStatus[];
      /** True for reopening: the route needs `confirm: true` in the body. */
      requiresConfirmation: boolean;
      /** The sentence the page puts in its confirmation. */
      confirmPrompt: string | null;
      /** True for a move to open: the caller still has to ask `formReadiness`. */
      needsReadiness: boolean;
    }
  | { ok: false; code: FormMoveRefusalCode; error: string };

/** How a status reads after "A form that is". */
const IS_WORDS: Record<AdmissionRoundStatus, string> = {
  draft: "a draft",
  open: "open",
  closed: "closed",
  deciding: "deciding",
  settled: "settled",
  cancelled: "cancelled",
};

/** How a move to a status reads after "can only be". */
const MOVED_WORDS: Record<AdmissionRoundStatus, string> = {
  draft: "made a draft",
  open: "opened",
  closed: "closed",
  deciding: "moved to deciding",
  settled: "settled",
  cancelled: "cancelled",
};

/** What reopening is answered with while a send is part way. */
export const SOME_DECISIONS_SENT =
  "Some decisions for this term have already gone out, so the form cannot take applications again.";

export const REOPEN_PROMPT =
  "Reopening tells everybody who was shown a closed form that it is taking applications again. Only do it if you are extending the window.";

const DESTROYING =
  "A destroy of this form has begun and has not finished, so it cannot be moved. Finish the destroy first: part of the form is already gone, and opening it would take applications that the rest of the destroy would then delete.";

const ARCHIVED =
  "This form is archived. Bring it back out of the archive before opening it, or applicants would be filling in a form nobody is watching.";

export const NOT_A_FORM_STATUS = "That is not a status an application form can be in.";

/** The statuses a form passes on its way to being settled, in order. */
const ROAD_TO_SETTLED: readonly AdmissionRoundStatus[] = ["open", "closed", "deciding", "settled"];

export function isFormStatus(value: unknown): value is AdmissionRoundStatus {
  return typeof value === "string" && ADMISSION_ROUND_STATUSES.includes(value as AdmissionRoundStatus);
}

function refuse(code: FormMoveRefusalCode, error: string): FormMovePlan {
  return { ok: false, code, error };
}

/** The table's refusal for one arrow, in the form's words. Null when the arrow is there. */
function arrowRefusal(from: unknown, to: unknown): FormMovePlan | null {
  const plan = planStatusChange(from, to);
  if (plan.ok) return null;
  if (plan.code === "unknown-status") {
    return refuse(
      "unknown-status",
      isFormStatus(from)
        ? NOT_A_FORM_STATUS
        : "This form’s status is not one this site recognises, so it cannot be moved.",
    );
  }
  // Past the unknown-status answer, `from` is a status the table knows.
  const at = from as AdmissionRoundStatus;
  if (plan.code === "terminal") {
    return refuse("terminal", `A ${IS_WORDS[at]} form is finished and cannot be moved again.`);
  }
  const allowed = nextStatuses(at).map((status) => MOVED_WORDS[status]);
  return refuse("illegal", `A form that is ${IS_WORDS[at]} can only be ${allowed.join(" or ")}.`);
}

/**
 * May this form move to `to`, and what does the move still need?
 *
 * Everything is decided here but readiness and the confirmation: the plan
 * says when each is owed, and the caller refuses without it. A refusal is a
 * sentence an admin can act on.
 */
export function planFormMove(facts: FormMoveFacts, to: unknown, now: Date): FormMovePlan {
  // First, because it refuses every move and not one of them: a write onto a
  // form that is part gone is a mistake whichever way it points.
  if (facts.destroying) return refuse("destroying", DESTROYING);

  const from = facts.status;
  if (isFormStatus(from) && from === to) return { ok: true, kind: "noop", status: from };

  // Settling is the one move that may be asked for from further back.
  let through: AdmissionRoundStatus[];
  const startsOnRoad = isFormStatus(from) ? ROAD_TO_SETTLED.indexOf(from) : -1;
  if (to === "settled" && startsOnRoad !== -1) {
    through = ROAD_TO_SETTLED.slice(startsOnRoad + 1);
    let at: AdmissionRoundStatus = ROAD_TO_SETTLED[startsOnRoad];
    for (const hop of through) {
      const refusal = arrowRefusal(at, hop);
      if (refusal) return refusal;
      at = hop;
    }
  } else {
    const refusal = arrowRefusal(from, to);
    if (refusal) return refusal;
    through = [to as AdmissionRoundStatus];
  }
  const target = through[through.length - 1];

  if (target === "open") {
    if (facts.archived) return refuse("archived", ARCHIVED);
    if (facts.decisionsSentAt) {
      return refuse(
        "decisions-sent",
        `Decisions for this term went out on ${formatRoundDate(facts.decisionsSentAt)}, so the form cannot take applications again.`,
      );
    }
    // The same, from the first person told and not from the last.
    if (facts.anybodyTold) return refuse("decisions-sent", SOME_DECISIONS_SENT);
  }

  if (target === "settled") {
    if (!facts.decisionsSentAt) {
      return refuse(
        "decisions-not-sent",
        "Decision day has not been sent, so there is nothing to settle yet. Send every decision first.",
      );
    }
    // The same predicate the apply routes refuse on. Past the table's own
    // answer above, `from` is a status the table knows.
    const window = roundWindowState({ ...facts, status: from as AdmissionRoundStatus }, now);
    if (window.state === "open" || window.state === "not-yet") {
      const until = window.closesAt ? ` until ${formatRoundDeadline(window.closesAt)}` : "";
      return refuse(
        "still-open",
        window.state === "open"
          ? `Applications are still open${until}. Close them before settling the term.`
          : "Applications have not opened yet, so there is no term to settle.",
      );
    }
  }

  const reopening = from === "closed" && target === "open";
  return {
    ok: true,
    kind: "move",
    to: target,
    through,
    requiresConfirmation: reopening,
    confirmPrompt: reopening ? REOPEN_PROMPT : null,
    needsReadiness: target === "open",
  };
}

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

/** What the status route is asked for: where to move the form, and whether it was confirmed. */
export type FormMoveRequest = { to: AdmissionRoundStatus; confirm: boolean };

/**
 * Read the body of a move. Refused, with a sentence, before any document is
 * read: a status this site does not know is not looked up against a form.
 */
export function parseFormMove(
  body: unknown,
): { ok: true; request: FormMoveRequest } | { ok: false; error: string } {
  const raw = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<
    string,
    unknown
  >;
  if (!isFormStatus(raw.status)) {
    return {
      ok: false,
      error: raw.status === undefined ? "Say which status to move the form to." : NOT_A_FORM_STATUS,
    };
  }
  if (raw.confirm !== undefined && typeof raw.confirm !== "boolean") {
    return { ok: false, error: "Whether the move was confirmed is either true or false." };
  }
  return { ok: true, request: { to: raw.status, confirm: raw.confirm === true } };
}

// ---------------------------------------------------------------------------
// Where the form is
// ---------------------------------------------------------------------------

/**
 * Where a form is in its term, as a person would say it.
 *
 *  - `draft`: being made. Nobody can apply.
 *  - `opens-later`: opened by an admin, and its opening time is still ahead.
 *  - `open`: taking applications.
 *  - `deciding`: applications have closed, by the clock or by an admin, and
 *    decision day has not been sent.
 *  - `decided`: decision day has been sent, and the term is not settled.
 *  - `settled`, `cancelled`, `archived`: finished, each in its own way.
 */
export type TermStage =
  | "draft"
  | "opens-later"
  | "open"
  | "deciding"
  | "decided"
  | "settled"
  | "cancelled"
  | "archived";

export type TermStageFacts = Pick<AdmissionRoundDoc, "status" | "archived" | "opensAt" | "closesAt"> &
  Pick<ApplicationFormFields, "decisionsSentAt">;

export function termStageFor(facts: TermStageFacts, now: Date): TermStage {
  if (facts.archived) return "archived";
  if (facts.status === "cancelled") return "cancelled";
  if (facts.status === "settled") return "settled";
  if (facts.status === "draft") return "draft";
  if (facts.decisionsSentAt) return "decided";
  // The same predicate the apply routes refuse on, so a form this calls open
  // is a form that takes applications.
  const window = roundWindowState(facts, now);
  if (window.state === "not-yet") return "opens-later";
  if (window.state === "open") return "open";
  return "deciding";
}

/**
 * Why no programme can be added to this form any more, as a sentence, or
 * null while one can.
 *
 * A programme added once decisions have gone out could take no applications
 * and would never be decided, and one added to a form that is settled,
 * cancelled or archived would change a term whose record has been kept. The
 * term page offers "New programme" on exactly these terms, and the route that
 * adds one refuses on them, both by asking here.
 */
export function closedToNewProgrammes(
  facts: Pick<TermStageFacts, "status" | "archived" | "decisionsSentAt">,
): string | null {
  if (facts.archived) {
    return "This application form is archived, so a programme can no longer be added to it.";
  }
  if (facts.status === "cancelled") {
    return "This application form was cancelled, so a programme can no longer be added to it.";
  }
  if (facts.status === "settled") {
    return "This term is settled, so a programme can no longer be added to it.";
  }
  if (facts.decisionsSentAt) {
    return "Decisions for this term have been sent, so a programme can no longer be added to it.";
  }
  return null;
}

/** One of the form's days in the strip: been and gone, the one the term is on, or still to come. */
export type StepState = "done" | "now" | "ahead";

export type TermSteps = {
  opens: StepState;
  closes: StepState;
  decisions: StepState;
  start: StepState;
};

const ALL_AHEAD: TermSteps = { opens: "ahead", closes: "ahead", decisions: "ahead", start: "ahead" };

/**
 * Which of the form's days is marked Now. It is the next one the term is
 * heading for: the opening while that is ahead, the close while applications
 * are open, decision day while the leads decide, and the start once
 * everybody has been told. A draft has not begun, so none of its days has
 * been, and a cancelled or archived form is on none of them.
 */
export function termStepsFor(stage: TermStage): TermSteps {
  switch (stage) {
    case "opens-later":
      return { ...ALL_AHEAD, opens: "now" };
    case "open":
      return { ...ALL_AHEAD, opens: "done", closes: "now" };
    case "deciding":
      return { opens: "done", closes: "done", decisions: "now", start: "ahead" };
    case "decided":
    case "settled":
      return { opens: "done", closes: "done", decisions: "done", start: "now" };
    default:
      return ALL_AHEAD;
  }
}

// ---------------------------------------------------------------------------
// The careful actions
// ---------------------------------------------------------------------------

/** The four things an admin does to a form's term. Each is one move in the table. */
export type FormAction = "open" | "close" | "reopen" | "settle";

/** The status each action asks the route for. */
export const ACTION_TARGET: Record<FormAction, AdmissionRoundStatus> = {
  open: "open",
  close: "closed",
  reopen: "open",
  settle: "settled",
};

/**
 * The actions the page offers an admin, from where the form is. Offered is
 * not the same as allowed: opening and reopening still have to be ready, and
 * the route decides every one of them again.
 *
 * A form whose close has passed while its status stayed `open` is offered
 * nothing here. It is taking no applications, and what would take them again
 * is a later close, which is a change to the form's dates and not a move.
 */
export function actionsFor(stage: TermStage, status: AdmissionRoundStatus): FormAction[] {
  if (stage === "draft") return ["open"];
  if (stage === "opens-later" || stage === "open") return ["close"];
  if (stage === "deciding" && status === "closed") return ["reopen"];
  if (stage === "decided") return ["settle"];
  return [];
}
