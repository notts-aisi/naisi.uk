import "server-only";
import WrittenFeedbackEmail from "@/emails/WrittenFeedbackEmail";
import {
  READ_YOUR_FEEDBACK,
  feedbackEmailLead,
  feedbackEmailSubject,
} from "@/lib/courses/writtenAnswerWords";
import { sendEmail } from "./send";

/**
 * THE "FEEDBACK IS WAITING" EMAIL'S WORDS AND ITS SEND, BEHIND ONE DOOR (Q34
 * B): one short message to the person whose written answer it is, each time
 * feedback is sent on it, linking to their feedback page. The feedback stays
 * on the site.
 *
 * TRANSACTIONAL, as the course hub's other messages to one person about
 * their own place and their own work are (the placement email, the leaving
 * note): the person sent their answer for feedback, and this says the
 * feedback they asked for is there. It consults no notification preference;
 * suppression still applies, in `sendEmail`. No time, no place and no link
 * to a meeting is in it, so it can never go out half right.
 *
 * NEVER THROWS: the feedback is saved before this is called, and a message
 * that does not go must not undo it. It answers whether the message went,
 * so the review page can say so.
 */

export type WrittenFeedbackFacts = {
  weekNumber: number;
  /** The first name the reviewer goes by. */
  byFirstName: string;
  /** The answer in running text: "your threat model", "your written answer". */
  answerName: string;
};

export type WrittenFeedbackWords = { subject: string; lead: string; buttonLabel: string };

/** Every sentence of the email, from records. Exported so a test can read it. */
export function writtenFeedbackWords(facts: WrittenFeedbackFacts): WrittenFeedbackWords {
  return {
    subject: feedbackEmailSubject(facts.weekNumber),
    lead: feedbackEmailLead(facts.byFirstName || "Your facilitator", facts.answerName),
    buttonLabel: READ_YOUR_FEEDBACK,
  };
}

/**
 * Where "Read your feedback" goes: the person's own feedback page for the
 * week, as a whole address on this site. Built here, behind the one door.
 */
export function feedbackPageUrl(appUrl: string, runId: string, weekNumber: number): string {
  return `${appUrl}/learn/${encodeURIComponent(runId)}/weeks/${weekNumber}/feedback`;
}

export type WrittenFeedbackOptions = {
  /** The address on the person's own account, read by the caller. */
  to: string;
  /** The person whose answer it is: the send's actor in the log. */
  uid: string;
  runId: string;
  /** This site's own address, with no trailing slash. */
  appUrl: string;
  facts: WrittenFeedbackFacts;
};

/** One message. Answers whether it went. */
export async function sendWrittenFeedbackEmail(opts: WrittenFeedbackOptions): Promise<boolean> {
  try {
    const words = writtenFeedbackWords(opts.facts);
    const result = await sendEmail({
      to: opts.to,
      subject: words.subject,
      kind: "course-feedback",
      actorUid: opts.uid,
      referenceId: opts.runId,
      react: WrittenFeedbackEmail({
        subject: words.subject,
        lead: words.lead,
        buttonLabel: words.buttonLabel,
        feedbackLink: feedbackPageUrl(opts.appUrl, opts.runId, opts.facts.weekNumber),
      }),
    });
    return Array.isArray(result?.delivered) ? result.delivered.length > 0 : true;
  } catch (err) {
    console.error("[written feedback email] send failed", opts.runId, opts.uid, err);
    return false;
  }
}
