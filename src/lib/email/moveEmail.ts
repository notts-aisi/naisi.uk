import "server-only";
import MoveEmail from "@/emails/MoveEmail";
import type { MoveEmailWords } from "@/lib/courses/staffMove/words";
import { sendEmail } from "./send";

/**
 * THE THREE EMAILS OF A MOVE TO ANOTHER GROUP FOR GOOD, MADE MID-TERM, behind
 * one door: "You’re moving to Group F" to the person moved, "Leo Park joins
 * Group F from week 3" to each of the new group's facilitators and "Leo Park
 * leaves Group C from week 3" to each of the old group's
 * (`src/lib/courses/staffMove/save.ts`, once the move has committed).
 *
 * TRANSACTIONAL: each is about the reader's own place or a group the reader
 * runs, so no setting of theirs switches it off; the suppression list still
 * holds it back. Its rows in the log carry a kind of their own,
 * `course-move`, with the run as the reference. It RETURNS an outcome and
 * never throws: the move is already written when it is called, and a failed
 * email must not read as a failed move.
 *
 * NEVER A MEETING LINK and never the reason given for the move. The one link
 * is a page on this site, built here (`movePersonUrl`, `moveGroupUrl`), so
 * nothing after it can come to link anywhere else.
 */

export type MoveEmailOutcome = "sent" | "suppressed" | "failed";

function base(appUrl: string): string {
  return appUrl.trim().replace(/\/+$/, "");
}

/** The person's programme page, or "" when the site does not know its own address. */
export function movePersonUrl(appUrl: string, runId: string): string {
  const root = base(appUrl);
  return root ? `${root}/learn/${encodeURIComponent(runId)}` : "";
}

/** A facilitator's group page, or "" when the site does not know its own address. */
export function moveGroupUrl(appUrl: string, runId: string, groupId: string): string {
  const root = base(appUrl);
  return root ? `${root}/learn/${encodeURIComponent(runId)}/group/${encodeURIComponent(groupId)}` : "";
}

export async function sendMoveEmail(opts: {
  to: string;
  /** The recipient's own first name, or "" for no name in the greeting. */
  name: string;
  /** Who pressed Move: the send's actor in the log. */
  actorUid: string;
  runId: string;
  link: string;
  words: MoveEmailWords;
}): Promise<MoveEmailOutcome> {
  try {
    const result = await sendEmail({
      to: opts.to,
      subject: opts.words.subject,
      kind: "course-move",
      actorUid: opts.actorUid,
      referenceId: opts.runId,
      react: MoveEmail({
        subject: opts.words.subject,
        recipientName: opts.name,
        lines: opts.words.lines,
        buttonLabel: opts.words.button,
        link: opts.link,
        footnote: opts.words.footnote,
      }),
    });
    return result && Array.isArray(result.suppressed) && result.suppressed.length > 0 ? "suppressed" : "sent";
  } catch (err) {
    console.error("[move email] send failed", opts.runId, err instanceof Error ? err.message : "unknown");
    return "failed";
  }
}
