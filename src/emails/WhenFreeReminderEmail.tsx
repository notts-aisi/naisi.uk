import DecisionEmailBody from "@/features/applications/decisionDay/DecisionEmailBody";
import type { FreeReminderEmail } from "@/lib/courses/getReady/words";

/**
 * "Tell us when you’re free for AGI Strategy": the email "Remind" on a
 * programme's Overview sends somebody holding a place on a fellowship who has
 * not said when they are free, while that is still theirs to add (boards
 * st-overview and st-overview-phone, "Remind 3 people").
 *
 * Its one button opens the person's own "When you’re free" page, where they
 * add their week. Drawn by the body every email signed by a programme's lead
 * uses, with the words exactly as composed (`composeFreeReminder`). No
 * unsubscribe footer: it is about the person's own place.
 */
export default function WhenFreeReminderEmail({ email }: { email: FreeReminderEmail }) {
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
