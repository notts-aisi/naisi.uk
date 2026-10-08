"use client";

import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import OptionRow from "@/components/ui/OptionRow";
import { useHydrated } from "@/hooks/useHydrated";
import { attributedSource } from "@/lib/campaign/attribution";
import styles from "./SubscribeForm.module.css";

type ChannelOption = {
  /** Channel id sent to the API (e.g. "newsletter", "events"). */
  id: string;
  /** Human label shown next to the checkbox. */
  label: string;
  /** Optional one-line description shown beneath the label. */
  description?: string;
  /**
   * Whether the box is ticked when the form first renders. Leave it out: a
   * list is something a person ticks, and the homepage ticks nothing for
   * them. It is still honoured for a page whose whole point is one list.
   */
  defaultChecked?: boolean;
};

type Props = {
  /**
   * One option per ticked-or-untickable channel. If exactly one option is
   * passed, the checkbox is hidden and the form auto-subscribes to that
   * single channel; this keeps the form usable as a "subscribe to X" CTA
   * embed where the channel is the section's whole point.
   */
  channels: ChannelOption[];
  /** Pre-populates the email field. */
  initialEmail?: string;
  /** Pre-populates the name field. */
  initialName?: string;
  /**
   * Source string sent on the API call (e.g. "homepage-combined"). It is the
   * form's own label and the fallback: a `?q=<slug>` in the address bar, left
   * there by a scanned QR code, takes its place. See `attribution.ts`.
   */
  source: string;
  /**
   * What the person said they are waiting for, appended to the source. Only
   * the /links page sets it, from its application buttons.
   */
  interest?: string | null;
  /** Optional copy override for the helper text below the input. */
  hint?: string;
  /** Optional override for the success copy. */
  successMessage?: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NAME_MAX_LEN = 80;

function defaultSuccessMessage(
  selectedChannels: string[],
  kind: "added" | "confirmation",
): string {
  if (kind === "added") {
    return `You're subscribed. Check your inbox for the receipt.`;
  }
  if (selectedChannels.length > 1) {
    return "Sent. Check your inbox for a single confirmation link covering both lists.";
  }
  if (selectedChannels[0] === "newsletter") {
    return "Sent. Check your inbox for a confirmation link before the next newsletter.";
  }
  if (selectedChannels[0] === "events") {
    return "Sent. Check your inbox for a confirmation link before we email about events.";
  }
  return "Sent. Check your inbox for a confirmation link.";
}

/**
 * Single-form, multi-channel subscribe widget. Renders a name field, an
 * email field, and one ticked box in a row per channel option. Submits all
 * selected channels in a single call to /api/subscriptions, which sends one
 * confirmation email listing them.
 *
 * If only one channel is passed, the checkbox UI is suppressed and the
 * form auto-subscribes to that channel on submit.
 *
 * Rules a maintainer has to keep:
 *
 *  - NOTHING IS SENT UNTIL A LIST IS TICKED. With more than one list on
 *    offer the form refuses, and says so, until the person has chosen.
 *  - THE BOXES ARE THE BROWSER'S OWN until the form is sent. The fields are
 *    read from the form when it is submitted, never mirrored in state, so
 *    what somebody types before the page's script arrives is still there
 *    when it does. The button stays disabled until then, because a press
 *    before that would be the browser's own submission of a form nothing is
 *    listening to.
 *  - The form promises what an email is, never how many there will be.
 */
export default function SubscribeForm({
  channels,
  initialEmail = "",
  initialName = "",
  source,
  interest,
  hint,
  successMessage,
}: Props) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const hydrated = useHydrated();

  const reactId = useId();
  const emailFieldId = `subscribe-email-${reactId}`;
  const nameFieldId = `subscribe-name-${reactId}`;
  const showCheckboxes = channels.length > 1;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.kind === "submitting") return;

    const form = new FormData(e.currentTarget);
    const trimmedEmail = String(form.get("email") ?? "").trim();
    const ticked = new Set(form.getAll("channels").map(String));
    const selectedChannels = showCheckboxes
      ? channels.filter((c) => ticked.has(c.id)).map((c) => c.id)
      : channels.map((c) => c.id);

    if (!trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
      setStatus({ kind: "error", message: "That doesn’t look like an email address." });
      return;
    }
    if (showCheckboxes && selectedChannels.length === 0) {
      setStatus({ kind: "error", message: "Tick at least one thing to hear about." });
      return;
    }
    const trimmedName = String(form.get("name") ?? "").trim().slice(0, NAME_MAX_LEN);

    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          channels: selectedChannels,
          // Read at submit, not on mount: the address bar is the only place
          // the marker lives, and reading it here keeps the form free of an
          // effect and of any hydration difference.
          source: attributedSource({
            source,
            search: window.location.search,
            interest,
          }),
          ...(trimmedName ? { name: trimmedName } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: boolean; kind?: "confirmation-sent" | "added" }
        | { error: string }
        | null;
      if (!res.ok || !body || "error" in body) {
        const msg =
          (body && "error" in body && body.error) ||
          "Couldn't subscribe right now. Try again in a moment.";
        setStatus({ kind: "error", message: msg });
        return;
      }
      const successKind = body.kind === "added" ? "added" : "confirmation";
      setStatus({
        kind: "success",
        message:
          successMessage ?? defaultSuccessMessage(selectedChannels, successKind),
      });
    } catch (err) {
      console.error("[SubscribeForm] submit failed", err);
      setStatus({ kind: "error", message: "Network hiccup. Try again." });
    }
  }

  if (status.kind === "success") {
    return (
      <div className={styles.success} role="status" aria-live="polite">
        <p className={styles.successHeading}>Thanks.</p>
        <p className={styles.successBody}>{status.message}</p>
      </div>
    );
  }

  const submitting = status.kind === "submitting";

  return (
    <form onSubmit={onSubmit} className={styles.form} noValidate>
      <div className={styles.fields}>
        <Field
          id={nameFieldId}
          label={
            <>
              First name <span className={styles.optional}>(optional)</span>
            </>
          }
        >
          <Input
            id={nameFieldId}
            name="name"
            type="text"
            autoComplete="given-name"
            maxLength={NAME_MAX_LEN}
            defaultValue={initialName}
            placeholder="Alex"
            readOnly={submitting}
          />
        </Field>

        <Field id={emailFieldId} label="Email" hint={hint}>
          <Input
            id={emailFieldId}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            defaultValue={initialEmail}
            placeholder="you@example.com"
            readOnly={submitting}
          />
        </Field>
      </div>

      {showCheckboxes ? (
        <fieldset className={styles.channels}>
          <legend className={styles.channelsLegend}>Send me</legend>
          <div className={styles.channelsList}>
            {channels.map((c) => (
              <OptionRow
                key={c.id}
                name="channels"
                value={c.id}
                defaultChecked={Boolean(c.defaultChecked)}
                description={c.description}
              >
                {c.label}
              </OptionRow>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className={styles.submitRow}>
        <Button type="submit" variant="primary" size="lg" disabled={!hydrated || submitting}>
          {submitting ? "Sending…" : "Join the mailing list"}
        </Button>
        <span className={styles.micro}>We’ll send you an email to confirm.</span>
      </div>

      {status.kind === "error" ? (
        <p className={styles.error} role="alert">
          {status.message}
        </p>
      ) : null}
    </form>
  );
}
