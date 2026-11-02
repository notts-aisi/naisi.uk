import type { ReactNode } from "react";
import { Button, Link, Section, Text } from "@react-email/components";
import EmailChrome, { emailFooterTextStyle, emailLinkStyle } from "./EmailChrome";

/**
 * "You’re invited": an event for chosen people, to each person it was made
 * for, when it is published or when an organiser invites the people who joined
 * its tags since (`src/lib/events/invitations.ts`).
 *
 * ── TWO CLASSES, ONE MESSAGE ────────────────────────────────────────────────
 * An event that is part of a programme reaches the people holding a place on
 * it as a programme NOTICE: `sendNotice` hands this template the marker, which
 * sits under the greeting and says why it reached them whatever their
 * settings, and there is no unsubscribe footer, because there is nothing to
 * switch off. Everybody else is reached by their EVENTS ROW, and their copy
 * carries the events channel's unsubscribe link in the footer, as the
 * announcement's does. Exactly one of `notice` and `unsubscribeUrl` is given.
 *
 * ── WHAT IT SAYS ────────────────────────────────────────────────────────────
 * Title, when and where, and a button to the event's page, where the person
 * asks for a place: the page opens for them alone, signed in. The LOCATION is
 * the public one, since an invitation is not a place yet: the exact room of a
 * hidden location is what a confirmed place earns. No sign-up is made from
 * the email, and there is no signed link in it.
 */

type Props = {
  eventTitle: string;
  /** The name they go by, or "there". */
  recipientName: string;
  /** The schedule line, e.g. "Thu 26 Nov 2026, 7pm". */
  whenLine: string;
  /** The PUBLIC location line: the placeholder when the real one is hidden. */
  locationLine: string;
  /** Absolute URL of the event's page. */
  eventUrl: string;
  /** The programme's name when the event is part of one, or null. */
  programme: string | null;
  /** A drop-in: nobody asks for a place, so the button says "See the event". */
  noSignup: boolean;
  /** The notice lane's marker, built by `sendNotice`. Given for a programme notice only. */
  notice?: ReactNode;
  /** `/api/unsubscribe?t=<signed>` for this person and the events channel. Given for a copy sent by their settings only. */
  unsubscribeUrl?: string;
};

/** The subject line, shared with the sender so the two cannot disagree. */
export function invitationSubject(eventTitle: string): string {
  return `You’re invited: ${eventTitle}`;
}

export default function EventInvitationEmail({
  eventTitle,
  recipientName,
  whenLine,
  locationLine,
  eventUrl,
  programme,
  noSignup,
  notice,
  unsubscribeUrl,
}: Props) {
  return (
    <EmailChrome
      subject={invitationSubject(eventTitle)}
      preheader={`${whenLine} · ${locationLine}`}
      greeting={`Hi ${recipientName},`}
      footerSlot={
        unsubscribeUrl ? (
          <Text style={emailFooterTextStyle}>
            You are getting this because you said yes to event announcements. You can change that,
            or unsubscribe, at any time by visiting{" "}
            <Link href={unsubscribeUrl} style={emailLinkStyle}>
              your profile
            </Link>
            .
          </Text>
        ) : undefined
      }
    >
      {notice}
      <Section>
        <Text style={para}>
          {programme ? `You’re invited to ${eventTitle}, part of ${programme}.` : `You’re invited to ${eventTitle}.`}
        </Text>
        <Text style={para}>
          It’s for the people we chose, so it isn’t on the events page and it wasn’t announced. You’ll
          also find it on your Home on naisi.uk.
        </Text>
      </Section>

      <Section style={details}>
        <Text style={detailLine}>
          <strong>What:</strong> {eventTitle}
        </Text>
        <Text style={detailLine}>
          <strong>When:</strong> {whenLine}
        </Text>
        <Text style={detailLine}>
          <strong>Where:</strong> {locationLine}
        </Text>
      </Section>

      <Section>
        <Button href={eventUrl} style={ctaStyle}>
          {noSignup ? "See the event" : "Ask for a place"}
        </Button>
        <Text style={subtle}>
          {noSignup
            ? "Sign in to your NAISI account to open it: only the people invited can."
            : "Sign in to your NAISI account to open it: only the people invited can. Asking sends a request, and we email you when the people running it have decided."}
        </Text>
        <Text style={subtle}>
          Or paste this into your browser:{" "}
          <a href={eventUrl} style={emailLinkStyle}>
            {eventUrl}
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

const details: React.CSSProperties = {
  backgroundColor: "#fafafa",
  padding: "16px 20px",
  borderRadius: "8px",
  border: "1px solid #e4e4e7",
  margin: "0 0 16px",
};

const detailLine: React.CSSProperties = {
  fontSize: "15px",
  color: "#27272a",
  margin: "4px 0",
  lineHeight: 1.5,
};

const subtle: React.CSSProperties = {
  fontSize: "12px",
  color: "#71717a",
  margin: "16px 0 0",
  lineHeight: 1.5,
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
  marginTop: "4px",
};
