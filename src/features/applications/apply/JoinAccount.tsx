"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type Ref } from "react";
import Link from "next/link";
import Script from "next/script";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import {
  RECAPTCHA_ENABLED,
  RecaptchaInvisible,
  type RecaptchaHandle,
} from "@/components/ui/RecaptchaInvisible";
import kit from "@/features/applications/kit/kit.module.css";
import { useHydrated } from "@/hooks/useHydrated";
import { ArrowRightIcon, BackIcon } from "./icons";
import { resendRegistration } from "./joinClient";
import form from "./form.module.css";
import styles from "./join.module.css";

/**
 * The second half of the join step: making the account.
 *
 * It is drawn once the answers on the first half are complete, and it offers
 * the two ways the site already has. Neither is built here:
 *
 *  - GOOGLE is the site's own button (`GoogleSignInButton`), and the
 *    credential it hands back goes to the step, which gives it to the same
 *    function the sign-in page uses.
 *  - EMAIL posts an address to the register route. The account is made by
 *    that route with a password nobody knows, and a link is emailed. The
 *    person chooses their password on the page the link opens. THERE IS NO
 *    PASSWORD BOX HERE, and there must not be one.
 *
 * Google's script and the reCAPTCHA check are loaded when this is drawn,
 * which is after somebody has asked to continue, and never when the form's
 * page first opens.
 *
 * INSIDE THE INSTALLED APP the Google button cannot open its own window, so
 * it leaves for Google, and what Google sends back is received by the
 * sign-in page and by no other. So the button is not drawn there: the app
 * offers email on this step, and a plain link to the sign-in page, which
 * carries this form's marked address (`signInHref`) and so brings a new
 * account back to this step once it has signed in.
 *
 * "The installed app" is whatever `useIsStandalone` answers yes to, and the
 * rule is on `isStandaloneNow` (`src/lib/pwa/displayMode.ts`). A browser
 * window is never one, in full screen or out of it, so every browser window
 * is drawn Google's own button and signs in here, on the form.
 */

const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";

/** How long before the confirmation link can be asked for again. The server holds the same minute. */
const RESEND_SECONDS = 60;

const NOT_HUMAN = "We couldn’t check that you’re not a robot. Please try again.";

function Resend({ email }: { email: string }) {
  const [left, setLeft] = useState(RESEND_SECONDS);
  const [busy, setBusy] = useState(false);
  const until = useRef(0);

  useEffect(() => {
    until.current = Date.now() + RESEND_SECONDS * 1000;
    const tick = setInterval(() => {
      setLeft(Math.max(0, Math.ceil((until.current - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(tick);
  }, []);

  async function again() {
    if (left > 0 || busy) return;
    setBusy(true);
    // The answer is the same whether or not anything was sent.
    await resendRegistration(email);
    until.current = Date.now() + RESEND_SECONDS * 1000;
    setLeft(RESEND_SECONDS);
    setBusy(false);
  }

  return (
    <button type="button" className={`${form.ghost} ${styles.resend}`} onClick={again} disabled={left > 0 || busy}>
      {left > 0 ? `Send it again in ${left}s` : "Send it again"}
    </button>
  );
}

export default function JoinAccount({
  signInHref,
  inboxFor,
  busy,
  error,
  standalone,
  headingRef,
  onGoogle,
  onEmail,
  onBack,
  onProblem,
}: {
  /** The sign-in page, with this form as the place to come back to. */
  signInHref: string;
  /** The address a link has just been sent to, when one has. */
  inboxFor: string | null;
  busy: "google" | "session" | "email" | "join" | null;
  error: string | null;
  /** Running as the installed app. See the note at the top. */
  standalone: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  onGoogle: (idToken: string) => void;
  /** `token` is the reCAPTCHA answer, or null where the check is not configured. */
  onEmail: (email: string, token: string | null) => void;
  onBack: () => void;
  onProblem: (message: string | null) => void;
}) {
  const hydrated = useHydrated();
  const recaptcha = useRef<RecaptchaHandle>(null);
  // Read out of the box when it is needed, so an address a password manager
  // filled in before the page was listening is not lost.
  const emailBox = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);

  // What Google's button last said could not be done, and what this half is
  // showing now. The button says so again with an empty message when its
  // script arrives late after all, and then only its own message is taken
  // down: anything said since belongs to whoever said it.
  const fromGoogle = useRef<string | null>(null);
  const showing = useRef(error);
  useEffect(() => {
    showing.current = error;
  });
  const scriptProblem = useCallback(
    (message: string) => {
      if (message) {
        fromGoogle.current = message;
        onProblem(message);
      } else if (fromGoogle.current !== null && showing.current === fromGoogle.current) {
        onProblem(null);
      }
    },
    [onProblem],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || checking) return;
    const email = (emailBox.current?.value ?? "").trim().toLowerCase();
    if (!email) {
      onProblem("Enter your email.");
      return;
    }
    onProblem(null);
    setChecking(true);
    // Silent for most people. Somebody the check is unsure of is shown a
    // puzzle first, and closing it answers null.
    const token = RECAPTCHA_ENABLED ? await (recaptcha.current?.execute() ?? Promise.resolve(null)) : null;
    setChecking(false);
    if (RECAPTCHA_ENABLED && !token) {
      onProblem(NOT_HUMAN);
      return;
    }
    onEmail(email, token);
  }

  if (inboxFor) {
    return (
      <>
        <div>
          <h1 ref={headingRef} tabIndex={-1} className={form.heading}>
            Check your inbox
          </h1>
          <p className={form.lede}>
            If <strong className={styles.address}>{inboxFor}</strong> isn’t already registered, we’ve sent it a link to
            confirm your email and finish signing up.
          </p>
          <p className={form.lede}>
            Open the link and choose a password, then come back to this tab. Your answers are waiting here.
          </p>
        </div>
        <div className={styles.ways}>
          <Resend email={inboxFor} />
          <p className={styles.aside}>
            No email is sent if you already have an account.{" "}
            <Link href={signInHref} className={styles.asideLink}>
              Sign in
            </Link>
          </p>
          <button type="button" className={`${form.textLink} ${styles.back}`} onClick={onBack}>
            <BackIcon />
            Back to your answers
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div>
        <h1 ref={headingRef} tabIndex={-1} className={form.heading}>
          Make your account
        </h1>
        <p className={form.lede}>
          Your application is saved to an account. What you’ve typed stays in this tab while you sign in.
        </p>
      </div>

      {error ? (
        <div className={form.notice} data-tone="warn" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <div className={styles.ways}>
        {standalone ? (
          <Link href={signInHref} className={`${form.secondary} ${styles.wide}`}>
            Continue with Google
          </Link>
        ) : (
          <div className={styles.google} aria-busy={busy === "google"}>
            <Script src={GOOGLE_SCRIPT} strategy="afterInteractive" />
            <GoogleSignInButton onCredential={onGoogle} onScriptError={scriptProblem} />
          </div>
        )}
        {standalone ? (
          <p className={styles.aside}>
            Google opens its own page and brings you back to this form.
          </p>
        ) : null}

        <div className={styles.or} role="separator">
          <span>or</span>
        </div>

        <form className={styles.emailForm} onSubmit={submit} noValidate>
          <div className={form.field}>
            <label htmlFor="join-email" className={form.label}>
              Email
            </label>
            <input
              ref={emailBox}
              id="join-email"
              type="email"
              className={form.input}
              autoComplete="email"
              inputMode="email"
              placeholder="you@gmail.com"
              aria-describedby="join-email-help"
            />
            <p id="join-email-help" className={form.helpBelow}>
              Use a personal email you’ll keep, not a university address. We’ll send it a link, and you choose a
              password after that.
            </p>
          </div>
          <button
            type="submit"
            className={`${kit.primary} ${styles.wide}`}
            disabled={!hydrated || busy !== null || checking}
          >
            <span>{busy === "email" || checking ? "Sending…" : "Continue with email"}</span>
            <ArrowRightIcon />
          </button>
          {RECAPTCHA_ENABLED ? <RecaptchaInvisible ref={recaptcha} /> : null}
        </form>

        <p className={styles.aside}>
          Already have an account?{" "}
          <Link href={signInHref} className={styles.asideLink}>
            Sign in
          </Link>
        </p>
        <button type="button" className={`${form.textLink} ${styles.back}`} onClick={onBack}>
          <BackIcon />
          Back to your answers
        </button>
      </div>
    </>
  );
}
