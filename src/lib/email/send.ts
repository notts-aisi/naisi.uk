import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  logEmailSend,
  logHeldSend,
  logSuppressedSend,
  type EmailSendKind,
  type EmailSendSurface,
} from "@/lib/firestore/emailSends";
import { filterSuppressed } from "@/lib/firestore/suppression";
import {
  HELD_REASON,
  isMisconfiguredProduction,
  resolveEmailAudience,
  splitByAudience,
} from "./audience";
import { parseSesMessageId } from "./sesMessageId";
import { parseResendMessageId } from "./resendMessageId";

/**
 * THE SEND CHOKEPOINT. Every message this product posts goes through
 * `sendEmail`, and the suppression list is consulted HERE rather than in each
 * feature's own helper, so no caller has to remember it. The per-feature
 * checks stay where they are: they are harmless duplicates, and several of
 * them save rendering an email nobody will read.
 *
 * A suppressed recipient is DROPPED, not failed: the caller asked for a
 * message to be sent and the answer is that this address is not sendable,
 * which is not an error in the caller's work. It leaves an `emailSends` row at
 * status `suppressed` carrying the same kind, subject, reference and actor the
 * send would have carried, so the deliverability tab answers "what did we
 * withhold, from whom, and why" rather than showing a silent gap.
 *
 * WHO THIS COPY OF THE SITE MAY EMAIL is decided here too, second, by
 * `./audience.ts`: the live site writes to everyone, and every other copy of
 * it (staging, a laptop) writes only to the addresses its own setting lists.
 * A recipient outside that audience is HELD the same way a suppressed one is
 * dropped, with a row at status `held`. Suppression is asked first on purpose:
 * an address the provider has told us not to write to is suppressed on every
 * copy of the site, and its row should say so wherever it was tried.
 */

/** What a send reports back. Fields are added here, never removed: callers read them. */
export type SendResult = {
  /** The provider's id for the message. Empty when every recipient was suppressed. */
  messageId: string;
  sesMessageId?: string;
  resendEmailId?: string;
  /** Addresses the message really went to. */
  delivered: string[];
  /** Addresses dropped because they are on the suppression list. */
  suppressed: string[];
  /**
   * Addresses held because this copy of the site may not write to them (see
   * `./audience.ts`). Always empty on the live site.
   */
  held: string[];
};

type SendArgs = {
  to: string | string[];
  subject: string;
  react: ReactElement;
  replyTo?: string;
  /** Override the display name in the From header (e.g. "NAISI Events"). */
  fromName?: string;
  /** Category for the deliverability dashboard. Defaults to 'unknown'. */
  kind?: EmailSendKind;
  /**
   * Which notice-lane surface this came from. Passed by `sendNotice` only
   * (`src/lib/email/notice.ts`) and carried onto the receipt so the
   * deliverability tab can show what bypassed the notification grid and from
   * where. Nothing else sets it.
   */
  surface?: EmailSendSurface;
  /** Uid of the admin / committee member who triggered this send, if any. */
  actorUid?: string;
  /** Related entity id (draft id, event id, RSVP id) for cross-referencing. */
  referenceId?: string;
  /**
   * RFC 8058 one-click unsubscribe. Setting this adds the
   * `List-Unsubscribe` + `List-Unsubscribe-Post` headers that Gmail/Yahoo
   * require on bulk senders since Feb 2024 — and that give inbox clients
   * permission to render a prominent "unsubscribe" affordance.
   */
  listUnsubscribe?: {
    /** Must be a direct HTTPS URL that will accept a POST with empty body. */
    url: string;
    /** Optional mailto fallback for inbox clients that don't do one-click. */
    mailto?: string;
  };
  /** File attachments passed straight through to nodemailer (e.g. a calendar .ics). */
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
};

let cached: Transporter | null = null;

function transporter(): Transporter {
  if (cached) return cached;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured — set SMTP_HOST, SMTP_USER, SMTP_PASSWORD in the environment.",
    );
  }
  cached = nodemailer.createTransport({
    host,
    port,
    // Gmail requires STARTTLS on 587; implicit TLS only on 465.
    secure: port === 465,
    auth: { user, pass },
    // Nodemailer defaults are 2min connect / 10min socket, which outlive App
    // Hosting's 60s request ceiling (apphosting.yaml runConfig.timeoutSeconds).
    // Bulk senders bound their wall clock on a worst-case per-send cost, so one
    // hung connection must fail fast rather than park a worker past the request
    // deadline with its rate-limit slot already spent.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return cached;
}

export async function sendEmail({
  to,
  subject,
  react,
  replyTo,
  fromName,
  kind,
  surface,
  actorUid,
  referenceId,
  listUnsubscribe,
  attachments,
}: SendArgs): Promise<SendResult> {
  const displayName = fromName ?? process.env.SMTP_FROM_NAME ?? "NAISI";
  const fromEmail = process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER;
  if (!fromEmail) throw new Error("SMTP_FROM_EMAIL or SMTP_USER must be set.");

  const db = getAdminDb();
  const requested = (Array.isArray(to) ? to : [to]).map((addr) => addr.trim()).filter(Boolean);
  // An empty `to` is the caller's bug, and it has to stay one: the early
  // return below means "everybody was suppressed", and a silent no-op for a
  // caller that addressed nobody would read as the same outcome.
  if (requested.length === 0) throw new Error("sendEmail was given no recipient address.");

  // The suppression list decides who is left BEFORE anything is rendered or
  // handed to the provider. Without a db there is no list to read, so the send
  // goes ahead and a warning is logged.
  let recipients = requested;
  let suppressed: string[] = [];
  if (db) {
    const verdict = await filterSuppressed(db, requested);
    recipients = verdict.allowed;
    suppressed = verdict.suppressed;
  } else {
    console.warn(
      "[sendEmail] no Admin SDK, so the suppression list was not consulted for this send.",
    );
  }

  // The audience decides who is left of THOSE, and it needs no database: it is
  // a fact about which copy of the site this is. It runs whether or not the
  // suppression list could be read, so a server with no Admin SDK still cannot
  // write to a stranger from anywhere but the live site.
  const audience = resolveEmailAudience(process.env);
  const cleared = splitByAudience(recipients, audience);
  recipients = cleared.allowed;
  const held = cleared.held;
  if (held.length > 0 && isMisconfiguredProduction(audience)) {
    // The one state that must never be quiet: the live site holding its own
    // mail because the setting that opens the door is missing.
    console.error(
      `[sendEmail] HELD ${held.length} message(s) on the production project: the audience ` +
        "setting does not say everyone. Nothing is reaching members until it does.",
    );
  }

  const withheld = async () => {
    if (!db) return;
    const row = (addr: string) => ({
      to: addr,
      subject,
      fromEmail,
      fromName: displayName,
      kind: kind ?? "unknown",
      surface,
      actorUid,
      referenceId,
    });
    await Promise.all([
      ...suppressed.map((addr) =>
        logSuppressedSend(db, row(addr)).catch((err) => {
          console.warn("[sendEmail] failed to log a suppressed recipient", err);
        }),
      ),
      ...held.map((addr) =>
        logHeldSend(db, { ...row(addr), reason: HELD_REASON }).catch((err) => {
          console.warn("[sendEmail] failed to log a held recipient", err);
        }),
      ),
    ]);
  };

  // Nobody left: the provider is never contacted, and the withheld rows are
  // the only trace, which is the trace that was missing.
  if (recipients.length === 0) {
    await withheld();
    return { messageId: "", delivered: [], suppressed, held };
  }

  const [html, text] = await Promise.all([render(react), render(react, { plainText: true })]);

  // Default Reply-To (e.g. a human-monitored inbox) so a recipient who hits
  // "Reply" reaches a person. Per-call replyTo still wins.
  const effectiveReplyTo = replyTo ?? process.env.EMAIL_DEFAULT_REPLY_TO;

  const extraHeaders: Record<string, string> = {};
  if (listUnsubscribe) {
    const parts = [`<${listUnsubscribe.url}>`];
    if (listUnsubscribe.mailto) parts.push(`<mailto:${listUnsubscribe.mailto}>`);
    extraHeaders["List-Unsubscribe"] = parts.join(", ");
    extraHeaders["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const info = await transporter().sendMail({
    from: `"${displayName}" <${fromEmail}>`,
    to: recipients.join(", "),
    replyTo: effectiveReplyTo,
    subject,
    html,
    text,
    headers: extraHeaders,
    attachments,
  });

  // Pull the provider's own message id out of the 250 response so later
  // bounce/complaint events can link back to this exact row. The two parsers
  // are mutually exclusive in practice (one matches, the other returns
  // undefined) — the webhook handler tolerates both being absent via a
  // recipient + recency fallback.
  const sesMessageId = parseSesMessageId(info.response);
  const resendEmailId = parseResendMessageId(info.response);

  // Log the send to Firestore. Swallow failures: a missing dashboard entry
  // is never worth failing the caller's API request over.
  if (db) {
    await Promise.all([
      ...recipients.map((addr) =>
        logEmailSend(db, {
          messageId: info.messageId,
          sesMessageId,
          resendEmailId,
          to: addr,
          subject,
          fromEmail,
          fromName: displayName,
          kind: kind ?? "unknown",
          surface,
          actorUid,
          referenceId,
        }).catch((err) => {
          console.warn("[sendEmail] failed to log to emailSends", err);
        }),
      ),
      withheld(),
    ]);
  }

  return {
    messageId: info.messageId,
    sesMessageId,
    resendEmailId,
    delivered: recipients,
    suppressed,
    held,
  };
}
