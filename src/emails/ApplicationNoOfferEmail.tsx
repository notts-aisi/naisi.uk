import DecisionEmailBody from "@/features/applications/decisionDay/DecisionEmailBody";
import type { DecisionEmail } from "@/lib/applications/decisionDay/emailCopy";

type Props = {
  /** The email as `composeDecisionEmail` wrote it for somebody with no offer. */
  email: DecisionEmail & { kind: "no-offer" };
};

/**
 * "No offer this time": the decision-day email for a pooled applicant with
 * nothing else this term. A kind no.
 *
 * It says the answer, says when to try again, and points at the events, which
 * are open to everyone. It does not explain the decision and does not invite a
 * reply that argues it. Its one button opens the public list of events.
 *
 * The same email goes to a declined application when an admin has chosen to
 * email those, unless the programme they ranked first wrote its own "Declined"
 * wording.
 *
 * The words are `composeDecisionEmail`'s: the default from the design, or the
 * form's own "No offer this time" wording where an admin wrote one.
 */
export default function ApplicationNoOfferEmail({ email }: Props) {
  return <DecisionEmailBody email={email} />;
}
