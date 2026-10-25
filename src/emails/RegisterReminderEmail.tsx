import { Button, Section, Text } from "@react-email/components";
import EmailChrome, { emailLinkStyle } from "./EmailChrome";

type Props = {
  /** "Group B’s register isn’t finished". The heading and the subject line. */
  subject: string;
  /** The facilitator's own name, or "" for no name in the greeting. */
  recipientName: string;
  /** "Group B’s register for Tue 17 Nov isn’t finished yet." Built by the sender. */
  lead: string;
  /** What finishing it does, in the words of the button they will press. */
  effect: string;
  /** "Open the register". */
  buttonLabel: string;
  /** Absolute link to the group's page, where the register is. */
  registerLink: string;
  /** What happens next if nothing does, or "" when nothing more will. */
  next: string;
};

/**
 * The ONE reminder a group's facilitators get when a session's register is
 * still not finished a while after the session ended (the
 * `courses-register-reminders` job, which ships switched off).
 *
 * Every value in it comes from records the sender has already read: the
 * group's name, the session's date, the button's name (which depends on
 * whether next week's email is on its schedule), and who gets a task if it
 * stays unfinished. The sender writes the sentences so the subject and the
 * body cannot disagree; this file lays them out.
 *
 * No unsubscribe footer: it is about a register the facilitator agreed to
 * keep, it comes once per session, and the profile's "Tasks and worksheets"
 * switch is its off switch.
 */
export default function RegisterReminderEmail({
  subject,
  recipientName,
  lead,
  effect,
  buttonLabel,
  registerLink,
  next,
}: Props) {
  return (
    <EmailChrome subject={subject} greeting={recipientName ? `Hi ${recipientName},` : undefined}>
      <Section>
        <Text style={para}>{lead}</Text>
        <Text style={para}>{effect}</Text>
        <Button href={registerLink} style={ctaStyle}>
          {buttonLabel}
        </Button>
        <Text style={subtle}>
          Or paste this into your browser:{" "}
          <a href={registerLink} style={emailLinkStyle}>
            {registerLink}
          </a>
        </Text>
        <Text style={subtle}>
          If the session didn’t happen, the register can say so, and it still needs
          finishing.
        </Text>
        {next ? <Text style={subtle}>{next}</Text> : null}
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
