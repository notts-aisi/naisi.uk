import "server-only";
import ApplicationAcceptedEmail from "@/emails/ApplicationAcceptedEmail";
import ApplicationInvitationEmail from "@/emails/ApplicationInvitationEmail";
import ApplicationNoOfferEmail from "@/emails/ApplicationNoOfferEmail";
import { sendEmail } from "@/lib/email/send";
import { DECISION_REPLY_TO, testSubject, type DecisionEmail } from "./emailCopy";

/**
 * The one door a decision-day email leaves through.
 *
 * The send and the test both call this, so a test is the same template, the
 * same reply-to and the same words as the real thing, apart from the marker in
 * its subject.
 *
 * It asks nobody's notification settings: the email is the answer to an
 * application the person sent. The do-not-email list and the rule about which
 * copy of the site may write to whom are applied inside `sendEmail`, as they
 * are for every message, and what they decided comes back as the result here.
 */

/** What happened to one email that did not fail. */
export type Delivery =
  /** Handed to the mail provider. */
  | "sent"
  /** This copy of the site may not write to that address, so nothing went. */
  | "held"
  /** The address is on the do-not-email list, so nothing went. */
  | "suppressed";

function templateFor(email: DecisionEmail) {
  switch (email.kind) {
    case "accepted":
      return ApplicationAcceptedEmail({ email: { ...email, kind: "accepted" } });
    case "invitation":
      return ApplicationInvitationEmail({ email: { ...email, kind: "invitation" } });
    case "no-offer":
      return ApplicationNoOfferEmail({ email: { ...email, kind: "no-offer" } });
  }
}

export type DecisionEmailSend = {
  /** One address. Each person gets their own message. */
  to: string;
  email: DecisionEmail;
  /** The form's id, so one term's mail can be found in the send log. */
  roundId: string;
  /** The admin who pressed Send. */
  actorUid: string;
  /** A rehearsal to the admin's own address. */
  test?: boolean;
};

/** Resolves with what happened, and throws when the email could not be sent. */
export async function sendDecisionEmail(send: DecisionEmailSend): Promise<Delivery> {
  const result = await sendEmail({
    to: send.to,
    subject: send.test ? testSubject(send.email.subject) : send.email.subject,
    react: templateFor(send.email),
    replyTo: DECISION_REPLY_TO,
    kind: send.test ? "admin-test" : "admissions",
    actorUid: send.actorUid,
    referenceId: send.roundId,
  });
  if (result.delivered.length > 0) return "sent";
  return result.held.length > 0 ? "held" : "suppressed";
}
