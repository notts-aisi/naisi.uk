import "server-only";
import JoiningOnlineEmail from "@/emails/JoiningOnlineEmail";
import type { JoiningOnlineEmailWords } from "@/lib/courses/joiningOnline/words";
import { sendEmail } from "./send";

/**
 * THE EMAIL THAT TELLS A GROUP'S FACILITATORS SOMEBODY IS JOINING A SESSION
 * ONLINE, behind one door: "Daniel Kim is joining week 2 online", to each of
 * the group's facilitators, once per person per session
 * (`src/lib/courses/joiningOnline/tell.ts`).
 *
 * TRANSACTIONAL: it is about a session its reader runs, so no setting of
 * theirs switches it off; the suppression list still holds it back. Its rows
 * in the log carry a kind of their own, `course-joining-online`, with the run
 * as the reference. It RETURNS an outcome and never throws: the person's word
 * is already written when it is called, and a failed email must not read as
 * a failed press.
 *
 * NEVER A MEETING LINK. The one link is the group's page on this site
 * (`joiningOnlineGroupUrl`), built here so nothing after it can come to link
 * anywhere else.
 */

export type JoiningOnlineEmailOutcome = "sent" | "suppressed" | "failed";

/** The facilitators' group page, where the box asks for the link, or "" when the site does not know its own address. */
export function joiningOnlineGroupUrl(appUrl: string, runId: string, groupId: string): string {
  const root = appUrl.trim().replace(/\/+$/, "");
  return root ? `${root}/learn/${encodeURIComponent(runId)}/group/${encodeURIComponent(groupId)}` : "";
}

export async function sendJoiningOnlineEmail(opts: {
  to: string;
  /** The facilitator's own first name, or "" for no name in the greeting. */
  name: string;
  /** Who said they are joining online: the send's actor in the log. */
  actorUid: string;
  runId: string;
  link: string;
  words: JoiningOnlineEmailWords;
}): Promise<JoiningOnlineEmailOutcome> {
  try {
    const result = await sendEmail({
      to: opts.to,
      subject: opts.words.subject,
      kind: "course-joining-online",
      actorUid: opts.actorUid,
      referenceId: opts.runId,
      react: JoiningOnlineEmail({
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
    console.error("[joining online email] send failed", opts.runId, err instanceof Error ? err.message : "unknown");
    return "failed";
  }
}
