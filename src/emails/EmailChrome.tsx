import type { ReactNode } from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * Email images must be referenced by absolute URL: inbox clients cannot
 * resolve a bundled or relative asset.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://naisi.uk";

/**
 * The logo at the top of every email that uses this chrome.
 *
 * A PNG, because mail clients do not show SVG. The colour lockup, the one
 * made for light grounds, because the card it sits on is white. `npm run
 * brand` copies it from brand-source/2-lockup/ at 600px wide and it is shown
 * at half that, so it stays sharp on a dense screen. No height is given: the
 * picture is 600 by 261, which has no whole number at 300 wide, and a mail
 * client works the height out from the width without squeezing it.
 */
const LOGO_PATH = "/brand/naisi-lockup-email.png";
const LOGO_WIDTH = 300;

type Props = {
  subject: string;
  preheader?: string;
  greeting?: string;
  children: ReactNode;
  footerSlot?: ReactNode;
};

/**
 * Shared chrome for every transactional email NAISI sends. Wraps the body in
 * the standard container/header/footer, so the only per-email variance is the
 * content slot + an optional variable footer line above the org signature.
 */
export default function EmailChrome({
  subject,
  preheader,
  greeting,
  children,
  footerSlot,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{preheader ?? subject}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section>
            <Img
              src={`${APP_URL}${LOGO_PATH}`}
              alt="Nottingham AI Safety Initiative"
              width={LOGO_WIDTH}
              style={logo}
            />
            <Heading style={heading}>{subject}</Heading>
            {greeting ? <Text style={greetingStyle}>{greeting}</Text> : null}
          </Section>

          {children}

          <Hr style={hr} />
          <Section>
            {footerSlot}
            <Text style={footerMuted}>
              Nottingham AI Safety Initiative · University of Nottingham · ai-safety@uonsu.com
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#f4f4f5",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
};

const container: React.CSSProperties = {
  margin: "40px auto",
  padding: "32px",
  maxWidth: "600px",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  border: "1px solid #e4e4e7",
};

const logo: React.CSSProperties = {
  display: "block",
  margin: "0 0 18px",
  // On a phone narrower than the logo, shrink with the card and keep the shape.
  maxWidth: "100%",
  height: "auto",
};

const heading: React.CSSProperties = {
  fontSize: "26px",
  fontWeight: 700,
  color: "#09090b",
  margin: "0 0 16px",
  lineHeight: 1.3,
};

const greetingStyle: React.CSSProperties = {
  fontSize: "16px",
  color: "#27272a",
  margin: "0 0 8px",
};

const hr: React.CSSProperties = {
  borderColor: "#e4e4e7",
  margin: "32px 0 20px",
};

const footerMuted: React.CSSProperties = {
  fontSize: "12px",
  color: "#a1a1aa",
  margin: 0,
};

export const emailLinkStyle: React.CSSProperties = {
  color: "#3f3f46",
  textDecoration: "underline",
};

export const emailFooterTextStyle: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "1.6",
  color: "#71717a",
  margin: "0 0 8px",
};
