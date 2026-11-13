import "server-only";
import ExcusedEmail from "@/emails/ExcusedEmail";
import type { ExcusedEmailWords } from "@/lib/courses/excused/words";
import { sendEmail } from "./send";

/**
 * THE EMAILS OF A REQUEST TO BE EXCUSED, behind one door: approved (to the
 * person, with the reply; and to each of the group's facilitators, never
 * the reason), declined (to the person, with the reply), a reply without a
 * decision (to the person), and a new request (to each admin who decides
 * them and has not switched it off, never the reason). Withdrawing and
 * waiting email nobody, and asking emails no facilitator, no lead and never
 * the person.
 *
 * TRANSACTIONAL: each is about a request the person made, or about a line of
 * a register the facilitator takes, so no setting of theirs switches it off;
 * the suppression list still holds it back. It RETURNS an outcome and never
 * throws: the decision is already written when it is called, and a failed
 * email must not read as a failed decision.
 *
 * NEVER A MEETING LINK. The one link is a page on this site, built here
 * (`excusedPersonUrl`, `excusedGroupUrl`), so the decision and anything
 * after it cannot come to link anywhere else.
 */

export type ExcusedEmailOutcome = "sent" | "suppressed" | "failed";

function base(appUrl: string): string {
  return appUrl.trim().replace(/\/+$/, "");
}

/** The person's programme page, or "" when the site does not know its own address. */
export function excusedPersonUrl(appUrl: string, runId: string): string {
  const root = base(appUrl);
  return root ? `${root}/learn/${encodeURIComponent(runId)}` : "";
}

/** One request's page, for the admins who decide it, or "" when the site does not know its own address. */
export function excusedRequestUrl(appUrl: string, requestId: string): string {
  const root = base(appUrl);
  return root ? `${root}/admin/admissions/requests/${encodeURIComponent(requestId)}` : "";
}

/** The facilitators' group page, or "" when the site does not know its own address. */
export function excusedGroupUrl(appUrl: string, runId: string, groupId: string): string {
  const root = base(appUrl);
  return root ? `${root}/learn/${encodeURIComponent(runId)}/group/${encodeURIComponent(groupId)}` : "";
}

export async function sendExcusedEmail(opts: {
  to: string;
  /** The recipient's own first name, or "" for no name in the greeting. */
  name: string;
  /** Who decided or replied: the send's actor in the log. */
  actorUid: string;
  runId: string;
  /** The person's own email, a facilitator's, or an admin's about a new request. */
  audience: "person" | "facilitator" | "admin";
  link: string;
  words: ExcusedEmailWords;
}): Promise<ExcusedEmailOutcome> {
  try {
    const result = await sendEmail({
      to: opts.to,
      subject: opts.words.subject,
      kind: opts.audience === "facilitator" ? "course-facilitator" : opts.audience === "admin" ? "course-request" : "course-enrolment",
      actorUid: opts.actorUid,
      referenceId: opts.runId,
      react: ExcusedEmail({
        subject: opts.words.subject,
        recipientName: opts.name,
        before: opts.words.before,
        quote: opts.words.quote,
        after: opts.words.after,
        buttonLabel: opts.words.button,
        link: opts.link,
        footnote: opts.words.footnote,
      }),
    });
    return result && Array.isArray(result.suppressed) && result.suppressed.length > 0 ? "suppressed" : "sent";
  } catch (err) {
    console.error("[excused email] send failed", opts.runId, err);
    return "failed";
  }
}
