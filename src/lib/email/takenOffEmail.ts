import "server-only";
import MoveEmail from "@/emails/MoveEmail";
import type { TakeOffEmailWords } from "@/lib/courses/takeOff/words";
import { sendEmail } from "./send";

/**
 * THE TWO EMAILS OF TAKING SOMEBODY OFF A RUN, behind one door: "Your place
 * on AGI Strategy has ended" to the person, and "Rahul has left Group C" to
 * each facilitator of the group Publish had told them about. Sent by
 * `src/lib/courses/takeOff/send.ts`, once the removal has committed.
 *
 * TRANSACTIONAL: the person's is a decision about their own place, and each
 * facilitator's is about a group the reader runs, so no setting of theirs
 * switches it off; the suppression list still holds it back. Its rows in the
 * log carry a kind of their own, `course-taken-off`, with the run as the
 * reference. It RETURNS an outcome and never throws: the removal is already
 * written when it is called, and a failed email must not read as a failed
 * removal.
 *
 * NO LINK AND NO REASON. The run closes to the person the moment they are
 * off it, so there is no page to send them to, and the facilitators' email
 * says only that they have left. The line staff typed for the person is in
 * the person's email alone. The greeting is the first words of the first
 * line, so the layout is the move's (`src/emails/MoveEmail.tsx`) with no
 * greeting, button or footnote of its own. Replies go to the site's own
 * reply address (`EMAIL_DEFAULT_REPLY_TO`): no `replyTo` is passed.
 */

export type TakenOffEmailOutcome = "sent" | "suppressed" | "failed";

export async function sendTakenOffEmail(opts: {
  to: string;
  /** Who pressed: the send's actor in the log. */
  actorUid: string;
  runId: string;
  words: TakeOffEmailWords;
}): Promise<TakenOffEmailOutcome> {
  try {
    const result = await sendEmail({
      to: opts.to,
      subject: opts.words.subject,
      kind: "course-taken-off",
      actorUid: opts.actorUid,
      referenceId: opts.runId,
      react: MoveEmail({
        subject: opts.words.subject,
        recipientName: "",
        lines: opts.words.lines,
        buttonLabel: "",
        link: "",
        footnote: "",
      }),
    });
    return result && Array.isArray(result.suppressed) && result.suppressed.length > 0 ? "suppressed" : "sent";
  } catch (err) {
    console.error("[taken off email] send failed", opts.runId, err instanceof Error ? err.message : "unknown");
    return "failed";
  }
}
