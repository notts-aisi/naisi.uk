import { Button, Section, Text } from "@react-email/components";
import EmailChrome, { emailLinkStyle } from "./EmailChrome";

type Props = {
  /** "You’re moving to Group F". The heading and the subject line. */
  subject: string;
  /** The recipient's own first name, or "" for no name in the greeting. */
  recipientName: string;
  /** The move, in its approved words. */
  lines: string[];
  /** "Open your programme page", or "Open your group". */
  buttonLabel: string;
  /** Absolute link to a page on this site, or "" for no button. Never a meeting link. */
  link: string;
  /** That the email is automated and why it was sent, or "" for none (the person's own has none). */
  footnote: string;
};

/**
 * A MOVE TO ANOTHER GROUP FOR GOOD, MADE MID-TERM: to the person moved, to
 * each of the new group's facilitators and to each of the old group's, once
 * the move is saved (`src/lib/courses/staffMove/save.ts`).
 *
 * Transactional: it is about the reader's own place, or a group the reader
 * runs, so no setting switches it off; the suppression list still holds it
 * back. NEVER A MEETING LINK and never the reason given for the move. Every
 * sentence is the sender's (`src/lib/courses/staffMove/words.ts`), so the
 * subject and the body cannot disagree; this file lays them out.
 */
export default function MoveEmail({ subject, recipientName, lines, buttonLabel, link, footnote }: Props) {
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
