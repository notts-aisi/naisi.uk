"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import OptionRow from "@/components/ui/OptionRow";
import {
  RECAPTCHA_ENABLED,
  RecaptchaInvisible,
  type RecaptchaHandle,
} from "@/components/ui/RecaptchaInvisible";
import { Field, Input } from "@/components/ui/Input";
import { useAuth } from "@/auth/AuthProvider";
import { useHydrated } from "@/hooks/useHydrated";
import { useSiteNotice } from "@/features/maintenance/useSiteNotice";
import { SurfacePausedNotice } from "@/features/maintenance/SurfacePausedNotice";
import { isSurfacePaused } from "@/lib/siteNotice";
import {
  EMAIL_MAX,
  NAME_MAX,
  type EventDoc,
  type FormQuestion,
  type RsvpAnswer,
} from "@/lib/firestore/events";
import { REACH_WORDS, eventReach, needsAccount } from "@/lib/events/reach";
import { placesState, placesTone, placesWords } from "./eventWhen";
import FormRenderer from "./FormRenderer";
import links from "./eventLinks.module.css";
import styles from "./RsvpForm.module.css";

/**
 * The six facts the form needs, and NOT the event document.
 *
 * This is a client component rendered by a Server Component on the public
 * event page, and React serialises every prop a client component receives
 * into the page's HTML for the browser to hydrate from. Until 8 September
 * 2026 the prop was the whole `EventDoc`, so an anonymous visitor's view
 * source carried the exact location of a hidden-location event, the
 * reviewer's notes, the pending and waitlisted counts and the author's uid,
 * none of which the page rendered. `tests/public-client-props.test.mjs` walks
 * every anonymous-reachable Server Component for a document handed to a
 * client component, so the shape here is enforced rather than remembered.
 */
type Props = {
  eventId: string;
  signupForm: FormQuestion[];
  visibility: EventDoc["visibility"];
  capacity: number | null;
  /** Confirmed places taken, for the "full" state. Pending is not shown and not passed. */
  rsvpCountConfirmed: number;
  /** Whether a full event keeps a waiting list. The events list already says so in public. */
  waitlistEnabled: boolean;
  /** When true, renders a banner indicating test mode (still saves real RSVPs). */
  previewMode?: boolean;
};

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export default function RsvpForm({
  eventId,
  signupForm,
  visibility,
  capacity,
  rsvpCountConfirmed,
  waitlistEnabled,
  previewMode,
}: Props) {
  const router = useRouter();
  const { user, accountName, loading: authLoading } = useAuth();
  // The name and email boxes are UNCONTROLLED and read out of the DOM when the
  // form is submitted. The event page is server-rendered, so a guest can be
  // typing into this form before its JavaScript has landed, and controlled
  // boxes lost every one of those characters: React's first render wrote its
  // own empty state over them. They are a guest's boxes only: see
  // `signedInAs` below.
  const formRef = useRef<HTMLFormElement>(null);
  const recaptcha = useRef<RecaptchaHandle | null>(null);
  const readField = useCallback((id: string) => {
    const box = formRef.current?.querySelector<HTMLInputElement>(`#${id}`);
    return box?.value ?? "";
  }, []);
  // Disables the submit until React is listening. Before that a press ran the
  // browser's own submission instead: the page came back looking untouched,
  // with the answers gone and nothing said anywhere.
  const hydrated = useHydrated();
  const [answers, setAnswers] = useState<Record<string, RsvpAnswer>>({});
  const [joinEvents, setJoinEvents] = useState(false);
  const [joinNewsletter, setJoinNewsletter] = useState(false);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  // Maintenance notice: a paused eventSignups surface disables the submit with
  // the notice copy inline (client-side only — the RSVP route is untouched).
  // The token-gated change/cancel flows stay open on purpose: stranding
  // someone trying to free up a place helps nobody.
  const siteNotice = useSiteNotice();
  const signupsPaused = isSurfacePaused(siteNotice, "eventSignups");

  const questions: FormQuestion[] = signupForm;
  // Who the event is for decides whether a guest may sign up at all
  // (`src/lib/events/reach.ts`): only an event for anyone takes a guest.
  const reach = eventReach({ visibility });
  const needsLogin = needsAccount({ visibility }) && !user && !authLoading;
  const full = capacity !== null && rsvpCountConfirmed >= capacity;
  // The same words and tone the events list and the hero use for this event.
  const places = placesState({ capacity, rsvpCountConfirmed, waitlistEnabled, noSignup: false });

  // SIGNED IN, THE SESSION IS WHO SIGNS UP, and the route takes the name and
  // the address off it whatever the form sends. So the form draws no boxes for
  // them, which would only be two fields nobody can change, and says who the
  // sign-up is for: the account's name by the same rule the route stores it
  // by (`useAuth().accountName`, never the Firebase Auth name, which is empty
  // for an account made with an email address and a password), or the address
  // where the account holds no name. A guest types their own name and address
  // (public events only). A session with no address falls through to the
  // boxes, so the form is never bricked.
  //
  // The page is drawn on the server before anybody is known, so the boxes are
  // in its first markup for everybody and go once a session resolves. They
  // cannot wait for the session: a guest typing before the JavaScript lands
  // is the case the boxes are uncontrolled for.
  const signedInAs = user && user.email ? { name: accountName, email: user.email } : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // The session wins where there is one, exactly as the note says; otherwise
    // whatever the guest typed, however early they typed it. With a session
    // the route takes both off it and ignores these; they are still what the
    // optional mailing-list sign-up below goes out with, which greets a person
    // by the name, so an account with none sends none rather than its address.
    const name = signedInAs ? (signedInAs.name ?? "") : readField("rsvp-name");
    const email = signedInAs ? signedInAs.email : readField("rsvp-email");
    if (signupsPaused) {
      // Belt and braces behind the disabled submit — never a silent block.
      setState({ kind: "error", message: siteNotice.bannerMessage });
      return;
    }
    setState({ kind: "submitting" });
    try {
      // Minted at the press, never at page load: a Google token goes stale in
      // about two minutes and somebody reading an event page takes longer than
      // that. A null token is honest rather than an error, and the server
      // decides what it means: with no site key configured the widget yields
      // nothing, and `verifyRecaptcha` is open in development and fails closed
      // in production, which is the documented behaviour the RSVP route now
      // shares with /api/register.
      const recaptchaToken = RECAPTCHA_ENABLED
        ? ((await recaptcha.current?.execute()) ?? null)
        : null;
      // REFUSED HERE RATHER THAN BY THE SERVER. The widget renders only after
      // Google's script lands, which is an effect and a poll, while the submit
      // button goes live at hydration; a press in that window resolves no
      // token. Posting it anyway spends a request and comes back "Couldn't
      // verify you're human", which is both untrue and unhelpful, since the
      // answer is to wait a moment rather than to reload. The sign-in form
      // takes the same position for the same reason.
      if (RECAPTCHA_ENABLED && !recaptchaToken) {
        setState({
          kind: "error",
          message:
            "The spam check has not finished loading yet. Give it a moment and press Request a place again.",
        });
        return;
      }
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, answers, recaptchaToken }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; status?: "pending"; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setState({
          kind: "error",
          message: body?.error ?? `Signup failed (${res.status})`,
        });
        return;
      }

      // RSVP saved. Fire-and-forget the optional mailing-list opt-in — it must
      // never block the RSVP or surface its own errors to the attendee.
      const channels: string[] = [];
      if (joinEvents) channels.push("events");
      if (joinNewsletter) channels.push("newsletter");
      if (channels.length > 0) {
        void fetch("/api/subscriptions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, channels, source: "event-rsvp", name }),
          // Sent without waiting, so it has to outlive the page: tests/fetch-keepalive.test.mjs.
          keepalive: true,
        }).catch(() => {});
      }

      // Real submissions get a dedicated confirmation page so the "we've got
      // it" message can't be missed. The preview/test flow stays in place.
      if (previewMode) {
        setState({ kind: "success" });
      } else {
        router.push(`/events/${eventId}/rsvp/submitted`);
      }
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Signup failed",
      });
    }
  }

  if (needsLogin) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.h2}>{REACH_WORDS.badge["listed-account"]}</h2>
        <p className={styles.lede}>{REACH_WORDS.signInLede[reach]}</p>
        {/* An anchor, never a Button inside one: that nesting is invalid and
            its tap behaviour is unreliable in iOS Safari. The sign-in page
            comes back to the address in `next`. */}
        <a
          href={`/login?next=${encodeURIComponent(`/events/${eventId}`)}`}
          className={`${links.link} ${links.primary} ${links.large} ${styles.wide}`}
        >
          Sign in
        </a>
      </section>
    );
  }

  if (state.kind === "success") {
    return (
      <section className={styles.panel}>
        <h2 className={styles.h2}>Request submitted.</h2>
        <p className={styles.lede}>
          A NAISI organiser will review your RSVP and confirm your spot. We&apos;ll be
          in touch if there&apos;s anything else we need from you.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.h2}>Request a place</h2>
        {places.kind !== "open" && (
          <Badge tone={placesTone(places)}>{placesWords(places)}</Badge>
        )}
      </div>
      <p className={styles.lede}>{REACH_WORDS.formLede[reach]}</p>
      {previewMode && (
        <Notice tone="warning" role="note">
          Test mode: submissions here are saved like real ones. Use them to
          check the flow, then cancel them from the attendee dashboard.
        </Notice>
      )}
      {full && (
        <Notice tone="warning" role="note">
          {waitlistEnabled
            ? "We\u2019ve hit capacity. You can still ask for a place, and we\u2019ll add you to the waiting list."
            : "We\u2019ve hit capacity. You can still ask for a place, in case one comes free."}
        </Notice>
      )}

      {/* The address appears once: beside the name, or as the name where the
          account holds none. */}
      {signedInAs && (
        <Notice tone="neutral" role="note">
          Signing up as <strong>{signedInAs.name ?? signedInAs.email}</strong>
          {signedInAs.name !== null && ` (${signedInAs.email})`}. Sign out to RSVP with a
          different account.
        </Notice>
      )}

      {/* The bot gate. Mounted here rather than inside the form because Google
          renders a floating badge rather than anything in the layout, and
          `onSubmit` drives it through the ref. Renders nothing at all when no
          site key is configured, which is how local development works before
          the keys are provisioned. */}
      {RECAPTCHA_ENABLED && <RecaptchaInvisible ref={recaptcha} />}

      {/* Addressed by the browser end-to-end suite, which fills this form as a
          signed-out guest and checks it fits a phone. */}
      <form ref={formRef} onSubmit={onSubmit} className={styles.form} data-testid="rsvp-form">
        {!signedInAs && (
          <>
            {/* One box for both names: the people at the door tell two
                guests called Sam apart by the second. */}
            <Field id="rsvp-name" label="Your first and last name">
              <Input
                id="rsvp-name"
                maxLength={NAME_MAX}
                disabled={state.kind === "submitting"}
                required
                autoComplete="name"
              />
            </Field>
            <Field id="rsvp-email" label="Email">
              <Input
                id="rsvp-email"
                type="email"
                maxLength={EMAIL_MAX}
                disabled={state.kind === "submitting"}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </Field>
          </>
        )}

        {questions.length > 0 && (
          <FormRenderer
            questions={questions}
            answers={answers}
            onChange={setAnswers}
            disabled={state.kind === "submitting"}
          />
        )}

        <fieldset className={styles.channels} disabled={state.kind === "submitting"}>
          <legend className={styles.channelsLegend}>Stay in the loop (optional)</legend>
          <OptionRow
            checked={joinEvents}
            onChange={(e) => setJoinEvents(e.target.checked)}
            description="Get an email when we announce a new event."
          >
            Email me about future events
          </OptionRow>
          <OptionRow
            checked={joinNewsletter}
            onChange={(e) => setJoinNewsletter(e.target.checked)}
            description="Occasional society updates and what we're working on."
          >
            NAISI newsletter
          </OptionRow>
        </fieldset>

        {/* data-testid: when the browser end-to-end suite does not reach the
            confirmation page it reads this, so a refusal is reported as the
            sentence the guest saw rather than as a navigation timeout. */}
        {state.kind === "error" && (
          <p className={styles.danger} role="alert" data-testid="rsvp-error">
            {state.message}
          </p>
        )}

        {signupsPaused && (
          <SurfacePausedNotice notice={siteNotice} surface="eventSignups" />
        )}
        {/* `!hydrated` carries the disabled attribute into the server markup,
            so an early press or an Enter in a field does nothing at all
            rather than submitting the form the browser's own way.

            The button is an ordinary block in the form's column, as wide as
            the panel. It is never pinned to the screen and nothing is laid
            over it: the browser suite measures exactly that at two phone
            sizes on every pull request. */}
        <Button
          type="submit"
          size="lg"
          fullWidth
          disabled={state.kind === "submitting" || signupsPaused || !hydrated}
          data-testid="rsvp-submit"
        >
          {state.kind === "submitting" ? "Submitting…" : "Request a place"}
        </Button>
      </form>
      <p className={styles.after}>
        <MailIcon />
        <span>We&rsquo;ll email to confirm your spot.</span>
      </p>
    </section>
  );
}

function MailIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}
