import { Button, Section, Text } from "@react-email/components";
import EmailChrome, { emailLinkStyle } from "./EmailChrome";

type Props = {
  /** "Your certificate for AGI Strategy". The heading and the subject line. */
  subject: string;
  /** "Hi Amara,", or null for a greeting with no name. */
  greeting: string | null;
  /** The sentences before the buttons. */
  lead: string[];
  /** One button a certificate: its words and the absolute address of its page. */
  buttons: { label: string; href: string }[];
  /** The sentences after them. */
  after: string[];
  /** "NAISI". */
  signOff: string;
  /** The words before each page's address, for a mail app that shows no buttons. */
  pasteIt: string;
};

/**
 * THE CERTIFICATE EMAIL (board en-finish, "The email"): one to each person a
 * programme's lead or an admin sends certificates to, with a button to each
 * of their certificates' pages, both for a facilitator who also finished.
 *
 * Every sentence comes from records and is written by `emailWords` in
 * `src/lib/courses/certificates/words.ts`; this file lays them out. It names
 * no time and no place, never an address or a meeting link, and nobody but
 * the person it is to. Transactional: it goes to the people a programme's
 * record says finished, and its facilitators, whatever their notification
 * settings say, as their certificate is theirs.
 */
export default function CertificateEmail({ subject, greeting, lead, buttons, after, signOff, pasteIt }: Props) {
  return (
    <EmailChrome subject={subject} preheader={lead[0]} greeting={greeting ?? undefined}>
      <Section>
        {lead.map((paragraph) => (
          <Text key={paragraph} style={para}>
            {paragraph}
          </Text>
        ))}
        {buttons.map((button) => (
          <Section key={button.href} style={buttonRow}>
            <Button href={button.href} style={ctaStyle}>
              {button.label}
            </Button>
          </Section>
        ))}
        {after.map((paragraph) => (
          <Text key={paragraph} style={para}>
            {paragraph}
          </Text>
        ))}
        <Text style={para}>{signOff}</Text>
        {buttons.map((button) => (
          <Text key={`paste-${button.href}`} style={subtle}>
            {pasteIt}{" "}
            <a href={button.href} style={emailLinkStyle}>
              {button.href}
            </a>
          </Text>
        ))}
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

const buttonRow: React.CSSProperties = {
  margin: "4px 0 12px",
};

const subtle: React.CSSProperties = {
  fontSize: "12px",
  color: "#71717a",
  margin: "8px 0 0",
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
};
