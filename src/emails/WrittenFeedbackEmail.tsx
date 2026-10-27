import { Button, Section, Text } from "@react-email/components";
import EmailChrome, { emailLinkStyle } from "./EmailChrome";

type Props = {
  /** "Feedback on your week 3 written answer". The heading and the subject line. */
  subject: string;
  /** "Rahul has left feedback on your threat model." Built by the sender. */
  lead: string;
  /** "Read your feedback". */
  buttonLabel: string;
  /** Absolute link to the person's own feedback page. */
  feedbackLink: string;
};

/**
 * THE ONE SHORT "FEEDBACK IS WAITING" EMAIL (Q34 B, board wk-review's "The
 * email Amara gets"): who left feedback on what, and a button to the
 * feedback page. The feedback itself stays on the site: no level, no
 * comment and no word of the answer is in this email, and nothing about
 * when it was sent.
 *
 * One message per feedback sent, to the person whose answer it is. The
 * sender writes the sentences (`src/lib/email/writtenFeedbackEmail.ts`) so the
 * subject and the body cannot disagree; this file lays them out.
 */
export default function WrittenFeedbackEmail({ subject, lead, buttonLabel, feedbackLink }: Props) {
  return (
    <EmailChrome subject={subject} preheader={lead}>
      <Section>
        <Text style={para}>{lead}</Text>
        <Button href={feedbackLink} style={ctaStyle}>
          {buttonLabel}
        </Button>
        <Text style={subtle}>
          Or paste this into your browser:{" "}
          <a href={feedbackLink} style={emailLinkStyle}>
            {feedbackLink}
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
