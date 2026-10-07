import { Fragment } from "react";
import { Button, Section, Text } from "@react-email/components";
import EmailChrome from "@/emails/EmailChrome";
import type {
  DecisionEmail,
  DecisionEmailButtonLook,
} from "@/lib/applications/decisionDay/emailCopy";

/**
 * The body the three decision-day emails share: the paragraphs, the buttons
 * and the sign-off, inside the frame every email from this site uses.
 *
 * It draws what `composeDecisionEmail` hands it and adds no words of its own,
 * so the preview an admin reads, the test they send themselves and the email
 * an applicant gets cannot say different things.
 *
 * EVERY STRING IS A TEXT NODE. A programme's own wording is typed by a lead
 * and is rendered as text, never as markup: nothing here reaches
 * `dangerouslySetInnerHTML`.
 *
 * No unsubscribe footer: this is the answer to an application the person
 * sent, so it goes whatever their notification settings say.
 */
export default function DecisionEmailBody({ email }: { email: DecisionEmail }) {
  return (
    <EmailChrome subject={email.subject} preheader={email.subject} greeting={email.greeting}>
      <Section>
        {email.paragraphs.map((paragraph, at) => (
          <Text key={at} style={paragraphStyle}>
            {paragraph}
          </Text>
        ))}
        {email.buttons.length > 0 ? (
          <Section style={buttonRowStyle}>
            {email.buttons.map((button, at) => (
              <Fragment key={button.label}>
                {/*
                  A space between two buttons. In the text alternative each
                  button is its words and then its address, so without the
                  space the first address runs into the next button's words
                  and a reader who taps it is sent to a page that is not there.
                */}
                {at > 0 ? " " : null}
                <Button href={button.href} style={BUTTON_STYLE[button.look]}>
                  {button.label}
                </Button>
              </Fragment>
            ))}
          </Section>
        ) : null}
        <Text style={signNameStyle}>{email.signOff.name}</Text>
        {email.signOff.role ? <Text style={signRoleStyle}>{email.signOff.role}</Text> : null}
      </Section>
    </EmailChrome>
  );
}

/*
 * Colours are written out because an inbox has no stylesheet and no CSS
 * variables, the same as every other template here. The main button is the
 * site's accent with a dark label, which is the pairing that reads; the
 * quieter one is the accent as text on the email's white ground.
 */
const paragraphStyle: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: 1.6,
  color: "#27272a",
  margin: "0 0 12px",
  // A single line break in a lead's own wording stays a line break.
  whiteSpace: "pre-line",
};

const buttonRowStyle: React.CSSProperties = {
  margin: "8px 0 20px",
};

const buttonBase: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 18px",
  marginRight: "10px",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
};

const BUTTON_STYLE: Record<DecisionEmailButtonLook, React.CSSProperties> = {
  primary: { ...buttonBase, background: "#6a82ff", color: "#050810", border: "1px solid #6a82ff" },
  quiet: { ...buttonBase, padding: "10px 6px", background: "transparent", color: "#3b55e3" },
  outline: { ...buttonBase, background: "#ffffff", color: "#1a2032", border: "1px solid #c5cbd6" },
};

const signNameStyle: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: 1.6,
  color: "#27272a",
  margin: 0,
};

const signRoleStyle: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: 1.6,
  color: "#71717a",
  margin: 0,
};
