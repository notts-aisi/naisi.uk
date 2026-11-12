import "server-only";
import CoverGivenEmail from "@/emails/CoverGivenEmail";
import type { CoverEmailWords } from "@/lib/courses/registerCover/words";
import { sendEmail } from "./send";

/**
 * THE EMAIL TO SOMEBODY GIVEN ONE SESSION, behind one door: "You're covering
 * Group E today at 4pm", to that one person.
 *
 * TRANSACTIONAL: it is about a session an admin or a lead handed to them, so
 * no setting of theirs switches it off; the suppression list still holds it
 * back. It RETURNS an outcome and never throws: the grant is already written
 * when it is called, and a failed email must not read as a failed grant.
 *
 * NEVER A MEETING LINK. The one link is that session's register
 * (`coverRegisterUrl`), built here so the route and anything after it cannot
 * come to link to two pages.
 */

export type CoverGivenOutcome = "sent" | "suppressed" | "failed";

/**
 * Where "Open the register" goes: the group's register on this site, opened
 * at that session. The register's page decides what somebody given the
 * session sees there: that session and nothing else of the group.
 */
export function coverRegisterUrl(appUrl: string, runId: string, groupId: string, sessionKey: string): string {
  const base = appUrl.trim().replace(/\/+$/, "");
  return `${base}/learn/${encodeURIComponent(runId)}/group/${encodeURIComponent(groupId)}/register?session=${encodeURIComponent(sessionKey)}`;
}

export async function sendCoverGivenEmail(opts: {
  to: string;
  /** The person's own first name, or "" for no name in the greeting. */
  name: string;
  /** Who gave it: the send's actor in the log. */
  actorUid: string;
  runId: string;
  link: string;
  words: CoverEmailWords;
}): Promise<CoverGivenOutcome> {
  try {
    const result = await sendEmail({
      to: opts.to,
      subject: opts.words.subject,
      kind: "course-facilitator",
      actorUid: opts.actorUid,
      referenceId: opts.runId,
      react: CoverGivenEmail({
        subject: opts.words.subject,
        recipientName: opts.name,
        lines: opts.words.lines,
        buttonLabel: opts.words.button,
        registerLink: opts.link,
      }),
    });
    return result && Array.isArray(result.suppressed) && result.suppressed.length > 0 ? "suppressed" : "sent";
  } catch (err) {
    console.error("[cover given email] send failed", opts.runId, err);
    return "failed";
  }
}
