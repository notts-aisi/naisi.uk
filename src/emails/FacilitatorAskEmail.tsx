import DecisionEmailBody from "@/features/applications/decisionDay/DecisionEmailBody";
import type { AskEmail } from "@/lib/courses/facilitatorAsks/words";

type Props = {
  /** The email as `composeAskEmail` or `composeAskReminder` wrote it. */
  email: AskEmail;
};

/**
 * "Would you facilitate a group on AGI Strategy?": the email a programme's
 * lead, or an admin, sends to somebody who said on the application form that
 * they would like to facilitate (board st-facilitators, "The email Grace
 * got"), and its reminder.
 *
 * Its one button, "Say yes or no", opens the person's own answer page, where
 * they answer. The button carries no answer in its address, so a mail scanner
 * that follows every link answers nothing on anybody's behalf.
 *
 * Drawn by the body every email signed by a programme's lead uses, with the
 * words exactly as composed: the lead's view, the test and the email the
 * person gets cannot say different things. No unsubscribe footer: it is the
 * answer to something the person said on their own application.
 */
export default function FacilitatorAskEmail({ email }: Props) {
  return (
    <DecisionEmailBody
      email={{
        subject: email.subject,
        greeting: email.greeting,
        paragraphs: email.paragraphs,
        buttons: [{ label: email.button.label, href: email.button.href, look: "primary" }],
        signOff: email.signOff,
      }}
    />
  );
}
