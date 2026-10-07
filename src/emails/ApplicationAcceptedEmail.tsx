import DecisionEmailBody from "@/features/applications/decisionDay/DecisionEmailBody";
import type { DecisionEmail } from "@/lib/applications/decisionDay/emailCopy";

type Props = {
  /** The email as `composeDecisionEmail` wrote it for somebody who has a place. */
  email: DecisionEmail & { kind: "accepted" };
};

/**
 * "You're in": the decision-day email for somebody a programme they ranked
 * has accepted.
 *
 * It is a presumed yes. The person does not have to reply: "I'm coming" is
 * there because it helps plan groups, and "I can't make it" frees their place
 * for somebody else. Both buttons open their own application page, where they
 * answer. Neither answers for them, so a mail scanner that follows every link
 * changes nothing.
 *
 * The words are `composeDecisionEmail`'s: the default from the design, or the
 * programme's own "You're in" wording where its lead wrote one.
 */
export default function ApplicationAcceptedEmail({ email }: Props) {
  return <DecisionEmailBody email={email} />;
}
