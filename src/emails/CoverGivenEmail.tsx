import { Button, Section, Text } from "@react-email/components";
import EmailChrome, { emailLinkStyle } from "./EmailChrome";

type Props = {
  /** "You’re covering Group E today at 4pm". The heading and the subject line. */
  subject: string;
  /** The person's own name, or "" for no name in the greeting. */
  recipientName: string;
  /** The first lines, built by the sender. */
  lines: string[];
  /** "Open the register". */
  buttonLabel: string;
  /** Absolute link to that session's register. */
  registerLink: string;
};

/**
 * ONE SESSION GIVEN TO SOMEBODY COVERING: the one email they are sent, saying
 * which session, when and where, and that its register, check-in and report
 * are theirs from the link below until midnight.
 *
 * Transactional: it is about one session handed to them, so no setting
 * switches it off. NEVER A MEETING LINK: the register's page is the one link.
 * Every sentence is the sender's (`coverEmailWords`), so the subject and the
 * body cannot disagree; this file lays them out.
 */
export default function CoverGivenEmail({ subject, recipientName, lines, buttonLabel, registerLink }: Props) {
  return (
    <EmailChrome subject={subject} greeting={recipientName ? `Hi ${recipientName},` : undefined}>
      <Section>
        {lines.map((line) => (
          <Text key={line} style={para}>
            {line}
          </Text>
        ))}
        <Button href={registerLink} style={ctaStyle}>
          {buttonLabel}
        </Button>
        <Text style={subtle}>
          Or paste this into your browser:{" "}
          <a href={registerLink} style={emailLinkStyle}>
            {registerLink}
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
