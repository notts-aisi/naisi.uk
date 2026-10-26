import type { ReactNode } from "react";
import { Button, Section, Text } from "@react-email/components";
import EmailChrome, { emailLinkStyle } from "./EmailChrome";

type Props = {
  /** The email's subject, and its heading. */
  subject: string;
  /** Its sentences, in order, written by `surveyEmailWords` or `reminderEmailWords`. */
  paragraphs: string[];
  /** "Answer the 6 questions". */
  button: string;
  /** The person's own link: the secret in it is theirs alone. */
  link: string;
  /** "Zach", "For NAISI". */
  signOff: string[];
  /** The notice lane's marker, built by `sendNotice`. Absent on a test. */
  notice?: ReactNode;
  /** A test's own line above the email's words. */
  testLine?: string;
};

/**
 * A survey's email, and its reminder: the words the sender wrote (so the
 * subject and the body cannot disagree), a button to the person's own link,
 * and the name of whoever pressed Send. It never carries an answer or a
 * result, and never a meeting link.
 *
 * Sent as a notice to everyone holding a place (`docs/notifications.md`), so
 * the marker sits above the words and there is no unsubscribe footer: nothing
 * here can be switched off, and offering to would be untrue.
 */
export default function SurveyEmail({ subject, paragraphs, button, link, signOff, notice, testLine }: Props) {
  return (
    <EmailChrome subject={subject} preheader={paragraphs[0]}>
      {notice}
      <Section>
        {testLine ? <Text style={test}>{testLine}</Text> : null}
        {paragraphs.map((paragraph, index) => (
          <Text key={index} style={para}>
            {paragraph}
          </Text>
        ))}
        <Button href={link} style={cta}>
          {button}
        </Button>
        <Text style={subtle}>
          Or paste this into your browser:{" "}
          <a href={link} style={emailLinkStyle}>
            {link}
          </a>
        </Text>
        <Text style={sign}>
          {signOff.map((line, index) => (
            <span key={index}>
              {index > 0 ? <br /> : null}
              {line}
            </span>
          ))}
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

const test: React.CSSProperties = {
  fontSize: "13px",
  color: "#52525b",
  backgroundColor: "#fafafa",
  border: "1px solid #e4e4e7",
  borderRadius: "8px",
  padding: "10px 14px",
  margin: "0 0 16px",
  lineHeight: 1.5,
};

const cta: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 18px",
  background: "#09090b",
  color: "#fafafa",
  borderRadius: "8px",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: 600,
  marginTop: "4px",
};

const subtle: React.CSSProperties = {
  fontSize: "12px",
  color: "#71717a",
  margin: "14px 0 0",
  overflowWrap: "anywhere",
};

const sign: React.CSSProperties = {
  fontSize: "15px",
  color: "#27272a",
  margin: "20px 0 0",
  lineHeight: 1.5,
};
