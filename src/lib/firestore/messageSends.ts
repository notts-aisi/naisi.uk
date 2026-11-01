import { COURSE_UPDATE_LIMITS } from "./courseUpdates";

/**
 * `messageSends/{id}`: one message written in Messages and sent, as a record
 * of who wrote it, who it was for and how each person was reached or why they
 * were left out (docs/messages.md). One document per send; the id is
 * Firestore's own.
 *
 * WRITTEN ONLY ON THE SERVER, by the send route
 * (`src/app/api/messages/route.ts`) on the Admin SDK, and read by nothing in
 * the browser: `firestore.rules` refuses every browser, admins included.
 *
 * WHAT IT KEEPS, and what it never does:
 *  - who wrote it (`writerUid`), the subject and when (`sentAt`);
 *  - the tags, included and left out, each with the words the writer saw,
 *    and their ids again as plain strings (`tagIds`), so a send can be found
 *    by a tag it was for;
 *  - how it went: as a programme notice or by the one row of the settings
 *    grid the writer chose (`mode`, `row`);
 *  - each person it reached, by account id, with how a message would reach
 *    them, why they were left out if they were, and what became of the email
 *    once it was sent (`people`). A guest or a walk-in is kept as having no
 *    account, with nothing that says who;
 *  - the counts, and how many were left out for each reason.
 *
 * NEVER AN ADDRESS, and never the message itself: the email was the message,
 * and the record is of who it reached.
 *
 * It is written unsettled before the first message goes and settled after
 * the last, so a send that was cut off says so rather than claiming counts it
 * never reached.
 */

export const MESSAGE_SENDS_COLLECTION = "messageSends";

/**
 * The longest subject and message. The same as an update's title and
 * message, because a message posted on a programme's page as well is kept
 * there as one (`src/lib/firestore/courseUpdates.ts`), and those are the
 * staff email's own limits.
 */
export const MESSAGE_LIMITS = {
  subject: COURSE_UPDATE_LIMITS.title,
  message: COURSE_UPDATE_LIMITS.message,
} as const;

/** How the email reached one person, once it was sent. */
export type MessageOutcome = "sent" | "held" | "suppressed" | "failed";

/** One person a message reached. No address, and no name: an account id or nothing. */
export type MessagePerson = {
  /** The account, or null for a guest or a walk-in. */
  uid: string | null;
  /** How a message would reach them: as a notice, or by their settings. */
  kind: "notice" | "grid";
  /** Why they were left out (`LeftOutReason` in src/lib/audience/words.ts), or null. */
  leftOut: string | null;
  /** What became of the email, once the send settled; null for somebody left out, or before it settled. */
  outcome: MessageOutcome | null;
};

/** What a send's emails did, in people. */
export type MessageTally = { sent: number; held: number; suppressed: number; failed: number };
