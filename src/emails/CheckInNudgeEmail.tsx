import { Button, Section, Text } from "@react-email/components";
import EmailChrome, { emailLinkStyle } from "./EmailChrome";

type Props = {
  /** "Group B’s check-in hasn’t been opened". The heading and the subject line. */
  subject: string;
  /** The facilitator's own first name, or "" for no name in the greeting. */
  recipientName: string;
  /** Its sentences, in order, written by `facilitatorNudgeWords`. */
  paragraphs: string[];
  /** "Open the register". */
  button: string;
  /** Absolute link to the group's register. */
  registerLink: string;
  /** "Zach", "For NAISI": whoever pressed. */
  signOff: string[];
};

/**
 * The ONE email an admin's press sends a group's facilitators from the
 * programme's Check-ins view, when a session's check-in has not been opened
 * or its register is not finished: what is not done, and the way to the
 * register. At most once a session a day.
 *
 * Every sentence comes from `facilitatorNudgeWords`, from records the sender
 * read: the group's name, the session's day, what is not done and until when
 * the check-in can still be opened. It never carries an answer, a count of
 * who answered, or a meeting link. About the facilitator's own session, owed
 * to them by the press, so it has no unsubscribe footer.
 */
export default function CheckInNudgeEmail({ subject, recipientName, paragraphs, button, registerLink, signOff }: Props) {
  return (
    <EmailChrome subject={subject} greeting={recipientName ? `Hi ${recipientName},` : undefined} preheader={paragraphs[0]}>
      <Section>
        {paragraphs.map((paragraph, index) => (
          <Text key={index} style={para}>
            {paragraph}
          </Text>
        ))}
        <Button href={registerLink} style={cta}>
          {button}
        </Button>
        <Text style={subtle}>
          Or paste this into your browser:{" "}
          <a href={registerLink} style={emailLinkStyle}>
            {registerLink}
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
