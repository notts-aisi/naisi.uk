import "server-only";
import ExcusedEmail from "@/emails/ExcusedEmail";
import type { ExcusedEmailWords } from "@/lib/courses/excused/words";
import { sendEmail } from "./send";

/**
 * THE TEAM'S REPLY TO A MESSAGE SENT FROM ASK THE TEAM, behind one door: one
 * email to the person who sent it, with the reply, and the way to their own
 * page of messages. Its own kind in the log (`team-reply`).
 *
 * TRANSACTIONAL: it answers something the person did, so no setting of
 * theirs switches it off; the suppression list still holds it back. It never
 * carries their own message, and its one link is a page on this site, built
 * here (`askTheTeamUrl`). It RETURNS an outcome and never throws: the reply
 * is already stored when it is called, and a failed email must not read as a
 * failed reply.
 *
 * The alert to the admins that a message has arrived goes through the door
 * of requests to be excused (`src/lib/courses/excused/alert.ts`), as every
 * kind's alert does.
 */

export type TeamReplyEmailOutcome = "sent" | "suppressed" | "failed";

/** The person's own page of messages, or "" when the site does not know its own address. */
export function askTheTeamUrl(appUrl: string): string {
  const root = appUrl.trim().replace(/\/+$/, "");
  return root ? `${root}/ask-the-team` : "";
}

export async function sendTeamReplyEmail(opts: {
  to: string;
  /** The person's own first name, or "" for no name in the greeting. */
  name: string;
  /** Who replied: the send's actor in the log. */
  actorUid: string;
  /** The message's id. */
  requestId: string;
  words: ExcusedEmailWords;
}): Promise<TeamReplyEmailOutcome> {
  try {
    const result = await sendEmail({
      to: opts.to,
      subject: opts.words.subject,
      kind: "team-reply",
      actorUid: opts.actorUid,
      referenceId: opts.requestId,
      react: ExcusedEmail({
        subject: opts.words.subject,
        recipientName: opts.name,
        before: opts.words.before,
        quote: opts.words.quote,
        after: opts.words.after,
        buttonLabel: opts.words.button,
        link: askTheTeamUrl(process.env.NEXT_PUBLIC_APP_URL ?? ""),
        footnote: opts.words.footnote,
      }),
    });
    return result && Array.isArray(result.suppressed) && result.suppressed.length > 0 ? "suppressed" : "sent";
  } catch (err) {
    console.error("[team reply email] send failed", opts.requestId, err instanceof Error ? err.message : "unknown");
    return "failed";
  }
}
