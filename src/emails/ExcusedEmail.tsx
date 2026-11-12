import { Button, Section, Text } from "@react-email/components";
import EmailChrome, { emailLinkStyle } from "./EmailChrome";

type Props = {
  /** "You’re excused from week 2". The heading and the subject line. */
  subject: string;
  /** The recipient's own first name, or "" for no name in the greeting. */
  recipientName: string;
  /** The lines before the reply. */
  before: string[];
  /** "Zach says: “...”", or null with no reply. */
  quote: string | null;
  /** The lines after it. */
  after: string[];
  /** "Open your programme page", "Open your group". */
  buttonLabel: string;
  /** Absolute link to a page on this site, or "" for no button. Never a meeting link. */
  link: string;
  /** A note at the foot ("Rahul is told you’re excused, but not why."), or null. */
  footnote: string | null;
};

/**
 * A REQUEST TO BE EXCUSED, DECIDED OR REPLIED TO: approved (to the person,
 * and to the group's facilitators), declined, or a reply without a decision.
 *
 * Transactional: each is about a request the person made, or a line of a
 * register the facilitator takes, so no setting switches it off; the
 * suppression list still holds it back. NEVER THE REASON, and never a
 * meeting link: the one link is a page on this site. Every sentence is the
 * sender's (`src/lib/courses/excused/words.ts`), so the subject and the body
 * cannot disagree; this file lays them out.
 */
export default function ExcusedEmail({ subject, recipientName, before, quote, after, buttonLabel, link, footnote }: Props) {
  return (
    <EmailChrome subject={subject} greeting={recipientName ? `Hi ${recipientName},` : undefined}>
      <Section>
        {before.map((line) => (
          <Text key={line} style={para}>
            {line}
          </Text>
        ))}
        {quote ? <Text style={quoteStyle}>{quote}</Text> : null}
        {after.map((line) => (
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
        {footnote ? <Text style={subtle}>{footnote}</Text> : null}
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

const quoteStyle: React.CSSProperties = {
  ...para,
  borderLeft: "3px solid #d4d4d8",
  paddingLeft: "12px",
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
