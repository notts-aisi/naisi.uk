import "server-only";
import MoveEmail from "@/emails/MoveEmail";
import type { VisitEmailWords } from "@/lib/courses/visit/words";
import { moveGroupUrl, movePersonUrl } from "./moveEmail";
import { sendEmail } from "./send";

/**
 * THE EMAILS OF A ONE-WEEK VISIT TO ANOTHER GROUP'S SESSION, behind one door:
 * arranged ("You’re going to Group I’s session on Wed 11 Nov" to the person,
 * "Daniel Kim is joining Group I for week 2" to the host group's
 * facilitators, "Daniel Kim is at Group I for week 2" to their own group's),
 * and called off ("Daniel Kim’s visit to Group I for week 2 is off" to both
 * groups' facilitators, and "Your visit to Group I for week 2 is off" to the
 * person when staff call it off). Sent by `src/lib/courses/visit/save.ts`,
 * once the visit is written.
 *
 * TRANSACTIONAL: each is about the reader's own place or a group the reader
 * runs, so no setting of theirs switches it off; the suppression list still
 * holds it back. Its rows in the log carry a kind of their own,
 * `course-visit`, with the run as the reference. It RETURNS an outcome and
 * never throws: the visit is already written when it is called.
 *
 * NEVER A MEETING LINK and never the reason given for the visit. The one link
 * is a page on this site, built here, and the layout is the move's
 * (`src/emails/MoveEmail.tsx`): a subject, its lines, a button and a line at
 * its foot, every sentence the sender's.
 */

export type VisitEmailOutcome = "sent" | "suppressed" | "failed";

/** The person's programme page, or "" when the site does not know its own address. */
export const visitPersonUrl = movePersonUrl;

/** A facilitator's group page, or "" when the site does not know its own address. */
export const visitGroupUrl = moveGroupUrl;

export async function sendVisitEmail(opts: {
  to: string;
  /** The recipient's own first name, or "" for no greeting (the called-off email to facilitators has none). */
  name: string;
  /** Who pressed: the send's actor in the log. */
  actorUid: string;
  runId: string;
  link: string;
  words: VisitEmailWords;
}): Promise<VisitEmailOutcome> {
  try {
    const result = await sendEmail({
      to: opts.to,
      subject: opts.words.subject,
      kind: "course-visit",
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
    console.error("[visit email] send failed", opts.runId, err instanceof Error ? err.message : "unknown");
    return "failed";
  }
}
