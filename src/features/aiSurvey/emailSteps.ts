/**
 * Which step the AI at Nottingham survey's page opens at, where each press on
 * its email check leads, and the one word the page's address carries while
 * somebody is at the code step.
 *
 * PLAIN FUNCTIONS, with no React and no browser in them: SurveyFlow.tsx asks
 * these and does what they say, so tests/ai-survey.test.mjs runs every
 * decision without a page.
 *
 * WHY THE ADDRESS CARRIES A MARK. Somebody on a phone types their University
 * email, reaches the code box, and switches to their mail app to read the
 * code. The phone may reload the survey's tab while it is in the background,
 * and where somebody is in the email check is held in the page's memory
 * alone. So while the code step is shown the page's address ends `#code`,
 * set without a new history entry, and a page that loads with it comes back
 * to the code box, in a form that asks for the address again beside the
 * code. The mark is that one word and nothing else: never the address, the
 * code or anything about the person. A fragment is never sent to a server.
 *
 * WHAT IT NEVER SKIPS. A page that loads with the mark still opens at the
 * start screen, and its button has to be pressed again in that page load,
 * with both boxes ticked and the consent answer given on that screen. (Some
 * browsers put back what was ticked before a reload; the page never stores
 * it.) Only that button leads on, and it leads to the code box in place of
 * the email step. Nobody reaches the
 * code step in a page load without what the start screen requires being given
 * in that page load.
 *
 * The server already allows it: a code is checked against the address and
 * the code alone, and the browser's own value (its claim) is given at the
 * check, so a reloaded page with a new claim can use a code that was asked
 * for before the reload (tests/ai-survey-flow.test.mjs).
 */
import { normaliseUniversityAddress } from "@/lib/aiSurvey/address";
import type { AiSurveyDefinition } from "@/lib/aiSurvey/types";

type EmailCheckWords = AiSurveyDefinition["emailCheck"];
export type ErrorName = keyof EmailCheckWords["errors"];

/** The mark on the page's address while the code step is shown. One word, and nothing about anybody. */
export const CODE_MARK = "#code";

/**
 * What the code step says above its boxes:
 *  - `sent`: a code has just been sent, or somebody says they already have one.
 *  - `sentRecently`: "Send my code" was pressed again inside the minute, so
 *    the code sent a moment ago is the one to type.
 *  - `comeBack`: the page reloaded at the code step, so the address is asked
 *    for again, beside the code.
 */
export type CodeLead = "sent" | "sentRecently" | "comeBack";

export type Step =
  | { at: "start" }
  | { at: "declined" }
  | { at: "comingBack" }
  | { at: "address" }
  | { at: "code"; lead: CodeLead }
  | { at: "already" }
  | { at: "in" }
  | { at: "page"; index: number }
  | { at: "end" }
  | { at: "closed" };

/** The words the code step shows above its boxes, for each way of arriving there. */
export const LEAD_WORDS: Record<CodeLead, "codeSent" | "codeSentRecently" | "comeBackToCode"> = {
  sent: "codeSent",
  sentRecently: "codeSentRecently",
  comeBack: "comeBackToCode",
};

/** True when the code step asks for the address again, beside the code. */
export const asksForAddress = (step: Step): boolean => step.at === "code" && step.lead === "comeBack";

// ---------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------

/**
 * The step the page opens at: the start screen, or the closed screen. NEVER
 * further, whatever the address carries or the browser keeps: the server
 * draws it before any of that can be read, and a kept pass or the code
 * step's mark is acted on only after it is drawn.
 */
export function firstStep(closed: boolean): Step {
  return closed ? { at: "closed" } : { at: "start" };
}

export type Opening = {
  /** True when the start screen's button leads to the code box in place of the email step. */
  comeBack: boolean;
  /** True when the mark on the address is to be taken off at once. */
  dropMark: boolean;
};

/**
 * What a fresh load of the page does with the mark, once the first step
 * (`firstStep`) is drawn. A survey that has closed says so whatever the
 * address carries. A pass kept in this browser always
 * wins: somebody with one is past the email check, and the page asks the
 * server about it as it always has. Otherwise the mark means the page
 * reloaded at the code step.
 */
export function opening(load: { closed: boolean; hash: string; passKept: boolean }): Opening {
  const marked = load.hash === CODE_MARK;
  const comeBack = marked && !load.closed && !load.passKept;
  return { comeBack, dropMark: marked && !comeBack };
}

// ---------------------------------------------------------------------------
// Every change of step
// ---------------------------------------------------------------------------

export type Arrival = {
  /** The step shown. */
  step: Step;
  /** Whether the start screen's button still leads to the code box. */
  comeBack: boolean;
  /** What the page's address ends with there: the mark, or nothing. */
  mark: typeof CODE_MARK | null;
};

/**
 * EVERY CHANGE OF STEP PASSES THROUGH HERE. `next` is the step a press asked
 * for. After a load that came back to the code step, the start screen's
 * button asks for the email step as it always does, and is given the code
 * step in its come-back form in its place, once. Anywhere else the page goes
 * where it was asked to, and the mark is on the address while the code step
 * is shown and nowhere else: leaving for a different email, "You're in",
 * "already used", a closed survey or "you chose not to take part" takes it
 * off.
 */
export function arrive(next: Step, comeBack: boolean): Arrival {
  if (comeBack && next.at === "address") return { step: { at: "code", lead: "comeBack" }, comeBack: false, mark: CODE_MARK };
  // Still on the start screen, still coming back: the mark stays, so another reload comes back too.
  if (next.at === "start") return { step: next, comeBack, mark: comeBack ? CODE_MARK : null };
  return { step: next, comeBack: false, mark: next.at === "code" ? CODE_MARK : null };
}

// ---------------------------------------------------------------------------
// The presses
// ---------------------------------------------------------------------------

/** What asking for a code got back: the server's answer, or the page's own refusal before it asked. */
export type SendResult = { ok: true } | { ok: false; error: string };

export type Outcome = {
  /** The step to go to, or null to stay where the page is. */
  go: Step | null;
  /** The sentence to show, by its name in `emailCheck.errors`, or null for none. */
  error: ErrorName | null;
  /** Empty the code box. */
  clearCode: boolean;
};

const goTo = (step: Step, clearCode = false): Outcome => ({ go: step, error: null, clearCode });
const stay = (error: ErrorName | null, clearCode = false): Outcome => ({ go: null, error, clearCode });

/** The name of a sentence the page holds, or `fallback` for anything it does not. */
export function errorName(error: string, errors: EmailCheckWords["errors"], fallback: ErrorName): ErrorName {
  return Object.prototype.hasOwnProperty.call(errors, error) ? (error as ErrorName) : fallback;
}

/**
 * "Send my code" on the email step (`from` is "address"), or "Send a new
 * code" on the code step (`from` is the code step's lead).
 *
 * Asked again inside the minute, the email step leads to the code box: the
 * code sent a moment ago still works, because a refusal inside the minute
 * leaves it where it is, and the address typed is in the page's memory. On
 * the code step the same answer keeps today's sentence and stays.
 */
export function afterSend(from: "address" | CodeLead, result: SendResult, errors: EmailCheckWords["errors"]): Outcome {
  if (result.ok) {
    if (from === "address") return goTo({ at: "code", lead: "sent" }, true);
    // A new code is on its way: the code step now says so, in its ordinary form.
    return from === "sent" ? stay(null, true) : goTo({ at: "code", lead: "sent" }, true);
  }
  if (result.error === "closed") return goTo({ at: "closed" });
  if (result.error === "askedAgainTooSoon" && from === "address") return goTo({ at: "code", lead: "sentRecently" }, true);
  return stay(errorName(result.error, errors, "couldNotSend"));
}

/**
 * "I already have a code", on the email step. With a University address
 * typed it opens the code step, in its ordinary form, and asks nothing of the
 * server; without one it says what it says for an address that is not a
 * University one.
 */
export function alreadyHaveCode(address: string): Outcome {
  return normaliseUniversityAddress(address) ? goTo({ at: "code", lead: "sent" }, true) : stay("notUniversityAddress");
}

/**
 * Which box a sentence is shown under on the code step. Only the come-back
 * form has an address box, and only the sentence about the address goes
 * under it.
 */
export function errorBox(step: Step, error: string | null, notUniversityAddress: string): "email" | "code" | null {
  if (error === null) return null;
  if (step.at === "address") return "email";
  return asksForAddress(step) && error === notUniversityAddress ? "email" : "code";
}
