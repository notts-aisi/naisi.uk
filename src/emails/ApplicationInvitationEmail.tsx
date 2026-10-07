import DecisionEmailBody from "@/features/applications/decisionDay/DecisionEmailBody";
import type { DecisionEmail } from "@/lib/applications/decisionDay/emailCopy";

type Props = {
  /** The email as `composeDecisionEmail` wrote it for somebody who is invited. */
  email: DecisionEmail & { kind: "invitation" };
};

/**
 * "Invitation": the decision-day email for a pooled applicant the committee
 * is offering a programme they did not pick.
 *
 * Unlike a place, an invitation is not presumed: the person accepts it, by the
 * reply-by day the email names. "Accept your invitation" and "No thanks" both
 * open their own application page, where they answer. Neither answers for
 * them, so a mail scanner that follows every link accepts nothing.
 *
 * The words are `composeDecisionEmail`'s: the default from the design, or the
 * inviting programme's own "Invitation" wording where its lead wrote one.
 */
export default function ApplicationInvitationEmail({ email }: Props) {
  return <DecisionEmailBody email={email} />;
}
