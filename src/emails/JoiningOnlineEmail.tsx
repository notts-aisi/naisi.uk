import { Button, Section, Text } from "@react-email/components";
import EmailChrome, { emailLinkStyle } from "./EmailChrome";

type Props = {
  /** "Daniel Kim is joining week 2 online". The heading and the subject line. */
  subject: string;
  /** The recipient's own first name, or "" for no name in the greeting. */
  recipientName: string;
  /** Who is joining which session online, and where the link goes. */
  lines: string[];
  /** "Open your group". */
  buttonLabel: string;
  /** Absolute link to the group's page on this site, or "" for no button. Never a meeting link. */
  link: string;
  /** That the email is automated, and why it was sent. */
  footnote: string;
};

/**
 * SOMEBODY IN THE GROUP IS JOINING A SESSION ONLINE: to each of the group's
 * facilitators, once per person per session, when that person presses
 * "Joining online" on their programme page.
 *
 * Transactional: it is about a session its reader runs, so no setting
 * switches it off; the suppression list still holds it back. NEVER A MEETING
 * LINK: the one link is the group's page on this site. Every sentence is the
 * sender's (`src/lib/courses/joiningOnline/words.ts`), so the subject and the
 * body cannot disagree; this file lays them out.
 */
export default function JoiningOnlineEmail({ subject, recipientName, lines, buttonLabel, link, footnote }: Props) {
  return (
    <EmailChrome subject={subject} greeting={recipientName ? `Hi ${recipientName},` : undefined}>
      <Section>
        {lines.map((line) => (
          <Text key={line} style={para}>
            {line}
          </Text>
        ))}
        {link ? (
          <>
            <Button href={link} style={ctaStyle}>
              {buttonLabel}
            </Button>
            <Text style={subtle}>
              Or paste this into your browser:{" "}
              <a href={link} style={emailLinkStyle}>
                {link}
              </a>
            </Text>
          </>
        ) : null}
        <Text style={subtle}>{footnote}</Text>
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
