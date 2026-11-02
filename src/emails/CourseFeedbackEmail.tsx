import { Button, Section, Text } from "@react-email/components";
import EmailChrome, { emailLinkStyle } from "./EmailChrome";

type Props = {
  /** "New feedback on your AGI Strategy work". The heading and the subject line. */
  subject: string;
  /** "Hi Sofia,", or null for a greeting with no name. */
  greeting: string | null;
  /** "Rahul has left feedback on your week 2 written answer." Built by the sender. */
  lead: string;
  /** "Read your feedback". */
  buttonLabel: string;
  /** Absolute link to the newest of those weeks' pages, at its Feedback. */
  link: string;
  /** The words before the link, for a mail app that shows no buttons. */
  pasteIt: string;
};

/**
 * THE "YOU HAVE FEEDBACK" EMAIL: one to each person an admin's batch reaches,
 * however many pieces of feedback it announces. Who left feedback, on which
 * weeks, and a button to the newest of those weeks' pages, where the
 * feedback is. The feedback itself stays on the site: no word of it, no
 * word of the person's work and nothing about when it was written is in this
 * email.
 *
 * Every sentence is written by `src/lib/courses/feedback/words.ts` from
 * records, through the batch's sender (`src/lib/courses/feedback/send.ts`),
 * so the subject and the body cannot disagree; this file lays them out.
 * Transactional: it is about the person's own work.
 */
export default function CourseFeedbackEmail({ subject, greeting, lead, buttonLabel, link, pasteIt }: Props) {
  return (
    <EmailChrome subject={subject} preheader={lead} greeting={greeting ?? undefined}>
      <Section>
        <Text style={para}>{lead}</Text>
        <Button href={link} style={ctaStyle}>
          {buttonLabel}
        </Button>
        <Text style={subtle}>
          {pasteIt}{" "}
          <a href={link} style={emailLinkStyle}>
            {link}
          </a>
        </Text>
      </Section>
    </EmailChrome>
  );
}

const para: React.CSSProperties = {
  fontSize: "15px",
  color: "#27272a",
  margin: "0 0 12px",
  lineHeight: 1.6,
};

const subtle: React.CSSProperties = {
  fontSize: "12px",
  color: "#71717a",
  margin: "16px 0 0",
};

const ctaStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 18px",
  background: "#09090b",
  color: "#fafafa",
  borderRadius: "8px",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: 600,
  marginTop: "8px",
};
