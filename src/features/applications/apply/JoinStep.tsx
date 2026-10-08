"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/auth/AuthProvider";
import { completeRegistration, exchangeGoogleCredential, signOut } from "@/auth/signInWithGoogle";
import PolicyConsent from "@/components/PolicyConsent";
import { RECAPTCHA_ENABLED } from "@/components/ui/RecaptchaInvisible";
import kit from "@/features/applications/kit/kit.module.css";
import { SurfacePausedNotice } from "@/features/maintenance/SurfacePausedNotice";
import { useSiteNotice } from "@/features/maintenance/useSiteNotice";
import { useIsStandalone } from "@/hooks/useDisplayMode";
import { useHydrated } from "@/hooks/useHydrated";
import type { AboutYou } from "@/lib/applications/model";
import {
  emptyJoinAnswers,
  hasJoinAnswers,
  joinIssues,
  joinRequestFrom,
  joinReturnFor,
  signInHrefFor,
  withKept,
} from "@/lib/applications/applicant/join";
import { getClientAuth } from "@/lib/firebase/client";
import { isSurfacePaused } from "@/lib/siteNotice";
import AboutStep from "./AboutStep";
import JoinAccount from "./JoinAccount";
import { ArrowRightIcon, BackIcon, CloseIcon } from "./icons";
import {
  mintSession,
  readOwnAccount,
  saveAboutYou,
  sendUniversityCheck,
  startEmailRegistration,
  type AccountKind,
} from "./joinClient";
import { acrossTabs, forgetAnswers, keepAnswers, loadKept } from "./keptAnswers";
import { STEP_PARAM } from "./steps";
import styles from "./form.module.css";
import join from "./join.module.css";

/**
 * The form's first step, for somebody who has not sent a join request.
 *
 * About you asks the same questions as joining the site. Somebody with an
 * account has answered them already and is shown them filled in
 * (`ApplicationForm`). Somebody without one answers them HERE, once: this
 * step is their join request, and when they continue it is sent by the same
 * client function the register page calls (`completeRegistration`), copied
 * into their application, and the form moves on to its second step.
 *
 * ## Who is drawn this step
 *
 * A visitor who is not signed in, and an account that is signed in and has
 * no join request (it made an account and never filled the profile in).
 * `signedIn` is the page's answer to which. The second kind needs no way
 * to sign in: Continue sends the join request.
 *
 * ## Continue checks the answers
 *
 * Every other step of the form lets somebody past with boxes empty. This one
 * does not, because what leaves it is a document the committee reads and
 * approves. The check is `joinIssues`, and agreeing to the terms is part of
 * it: `completeRegistration` records that agreement, so it must have been
 * given on this screen.
 *
 * ## What is kept, and what is sent where
 *
 * The answers stay in this tab while the person signs in (`keptAnswers.ts`).
 * Signed out, the only things this step sends anywhere are an email address
 * to the register route and a Google credential to the sign-in function.
 * The answers are sent once, under the person's own session, as the join
 * request.
 *
 * ## Nothing here says Saved
 *
 * Until the join request has gone there is no application to save into, so
 * the corner of the bar that says Saved on every other step is empty here.
 *
 * ## The link that checks a university address
 *
 * It is asked for the moment the join request exists, because the page that
 * confirms it stamps the account only once there is an account to stamp.
 * Nothing waits for it: the person carries on, and the form holds the send.
 */

type Props = {
  roundId: string;
  /** "Autumn 2026". */
  label: string;
  closesLabel: string | null;
  decisionsLabel: string | null;
  /** The page was drawn for a session, and that account has no join request. */
  signedIn: boolean;
  /** That session's address, when it has one. */
  signedInAs: string | null;
  /**
   * The person arrived by the link emailed to a new account. That link opens
   * in a tab of its own, and what they typed before it is in the tab they
   * typed it in, so this one says where to find it.
   */
  fromLink: boolean;
};

type View = "questions" | "account";
/** What the step is in the middle of: a sign-in, a check of the session, the email request, or the join request itself. */
type Busy = "google" | "session" | "email" | "join" | null;

const ACCOUNT_HASH = "#account";

/** The least time between two asks of the server for the page again. */
const ASK_AGAIN_MS = 3000;
/** How many of those asks are made on a timer before the step waits to be looked at. */
const TIMED_ASKS = 3;
/**
 * How long a sign-in made by an emailed link is given to be replaced by the
 * one that follows it. Longer than the browser takes to carry a sign-in from
 * one tab to another.
 */
const SETTLE_MS = 1500;

const SIGN_IN_AGAIN = "We couldn’t find your sign-in in this browser. Sign out, then press Continue again.";
const JOIN_FAILED = "We couldn’t send your join request. What you’ve typed is still here. Try again in a moment.";
const COLLABORATOR =
  "That account belongs to an external collaborator, and these programmes are for University of Nottingham students and staff. Sign in with a different account to apply.";
const SIGN_IN_FAILED = "Sign-in failed. Please try again.";

function RecaptchaLine() {
  return (
    <p className={join.recaptcha}>
      This site is protected by reCAPTCHA. Google’s{" "}
      <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
        Privacy Policy
      </a>{" "}
      and{" "}
      <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">
        Terms of Service
      </a>{" "}
      apply.
    </p>
  );
}

export default function JoinStep({
  roundId,
  label,
  closesLabel,
  decisionsLabel,
  signedIn: drawnSignedIn,
  signedInAs,
  fromLink,
}: Props) {
  const router = useRouter();
  const hydrated = useHydrated();
  const standalone = useIsStandalone();
  const { user, role, loading: authLoading } = useAuth();
  const siteNotice = useSiteNotice();
  const paused = isSurfacePaused(siteNotice, "newRegistrations");

  // `drawn` counts how often the boxes have been drawn afresh. They are
  // uncontrolled, so answers that come back from the tab's own store after
  // the page loads are shown by drawing the boxes again, holding them.
  const [answers, setAnswers] = useState<{ about: AboutYou; drawn: number }>(() => ({
    about: emptyJoinAnswers(),
    drawn: 0,
  }));
  const about = answers.about;
  const aboutRef = useRef(about);
  const [agreed, setAgreed] = useState(false);
  const [view, setView] = useState<View>("questions");
  const [inboxFor, setInboxFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  /** True from the first moment a join request is on its way, so one press sends one. */
  const joining = useRef(false);

  // Signed in is true the moment either side knows: the page (a session it
  // was drawn for) or this browser (a sign-in that has just happened here, or
  // in another tab after an emailed link).
  const signedIn = drawnSignedIn || Boolean(user);
  const address = user?.email ?? signedInAs;
  // Somebody who is signed in has no account to make.
  const shown: View = signedIn ? "questions" : view;
  const formUrl = `/apply/${encodeURIComponent(roundId)}`;
  // Every way from this step to the sign-in page carries the address the form
  // marks for the way back, so an account with no join request that signs in
  // there is sent back to this step and never to the register page's own
  // profile form. An account that has one lands on the form either way.
  const signInHref = signInHrefFor(roundId);
  const title = `Apply · ${label}`;

  // --- the answers, and what this tab keeps of them ---------------------------
  const patch = useCallback(
    (change: Partial<AboutYou>) => {
      const next = { ...aboutRef.current, ...change };
      aboutRef.current = next;
      setAnswers((current) => ({ about: next, drawn: current.drawn }));
      keepAnswers(roundId, next);
    },
    [roundId],
  );

  useEffect(() => {
    const kept = loadKept(roundId);
    if (!kept) return;
    // Under whatever was typed before the page was listening: a box with
    // something in it keeps it.
    const merged = withKept(aboutRef.current, kept);
    if (JSON.stringify(merged) === JSON.stringify(aboutRef.current)) return;
    aboutRef.current = merged;
    // Once, when the page is first in a browser: the tab's own store cannot
    // be read while the page is being drawn on the server.
    setAnswers((current) => ({ about: merged, drawn: current.drawn + 1 }));
  }, [roundId]);

  // --- a page drawn for somebody the browser now knows better ------------------
  // Two ways the page can be behind the browser, and the answer to both is to
  // ask the server for it again:
  //
  //  - The account HAS a join request. The page drawn for it is the form
  //    itself, never this step. Asked once for each account.
  //  - Somebody signed in after the page was drawn (in this tab, or in
  //    another after an emailed link). The page was drawn for a visitor and
  //    the server has not yet said what this account is. The first ask can
  //    arrive before the session it is asking about, so it is asked again a
  //    few times over the next seconds, and after that each time the tab is
  //    looked at, until the page has caught up.
  const toldJoined = useRef<string | null>(null);
  const lastAsked = useRef(0);
  const timedAsks = useRef(0);
  const behind = !authLoading && Boolean(user) && !drawnSignedIn && role === null;
  const hasJoined = !authLoading && Boolean(user) && role !== null;
  const uid = user?.uid ?? null;
  useEffect(() => {
    // Not while a join request is on its way: that ends by moving the page
    // on, and if it fails this runs again.
    if (busy !== null || !uid) return;
    if (hasJoined) {
      if (toldJoined.current === uid) return;
      toldJoined.current = uid;
      forgetAnswers(roundId);
      router.refresh();
      return;
    }
    if (!behind) return;
    const ask = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastAsked.current < ASK_AGAIN_MS) return;
      lastAsked.current = Date.now();
      router.refresh();
    };
    ask();
    // A session that is not coming (it lapsed long ago) is not asked for
    // for ever: a few timed asks, then only when the tab is looked at.
    const timer = window.setInterval(() => {
      if (timedAsks.current >= TIMED_ASKS) {
        window.clearInterval(timer);
        return;
      }
      timedAsks.current += 1;
      ask();
    }, ASK_AGAIN_MS + 100);
    document.addEventListener("visibilitychange", ask);
    window.addEventListener("focus", ask);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
      window.removeEventListener("focus", ask);
    };
  }, [behind, hasJoined, uid, roundId, router, busy]);

  // --- moving between the two halves ---------------------------------------------
  useEffect(() => {
    if (moved === 0) return;
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [moved]);

  // The second half is one step back from the first in the browser's own
  // history, so the back gesture on a phone returns to the answers instead of
  // leaving the form.
  useEffect(() => {
    const onPop = () => {
      if (window.location.hash === ACCOUNT_HASH) return;
      setView("questions");
      setInboxFor(null);
      setMoved((count) => count + 1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A page drawn afresh always opens on the answers: agreeing is never
  // restored, and only Continue opens the second half. Somebody who comes
  // Back to this page from the sign-in page arrives at an address that still
  // says the second half, so the address is put right, in the same history
  // entry, and the address and the view agree.
  useEffect(() => {
    if (window.location.hash !== ACCOUNT_HASH) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, []);

  const openAccount = useCallback(() => {
    if (window.location.hash !== ACCOUNT_HASH) {
      window.history.pushState(null, "", `${window.location.pathname}${window.location.search}${ACCOUNT_HASH}`);
    }
    setView("account");
    setMoved((count) => count + 1);
  }, []);

  const backToAnswers = useCallback(() => {
    setError(null);
    if (window.location.hash === ACCOUNT_HASH) {
      window.history.back();
      return;
    }
    setView("questions");
    setInboxFor(null);
    setMoved((count) => count + 1);
  }, []);

  // --- sending the join request ----------------------------------------------------
  /**
   * What happens once the server has said what kind of account this is.
   * Resolves true when a join request has gone and the page is moving on.
   */
  const finishJoin = useCallback(
    async (kind: AccountKind): Promise<boolean> => {
      if (kind === "collaborator") {
        setError(COLLABORATOR);
        return false;
      }
      if (kind === "member") {
        // This account has a join request already, so nothing is sent. The
        // page is asked for again, and what comes back is the form itself,
        // opened from their profile.
        forgetAnswers(roundId);
        router.refresh();
        return false;
      }
      const answers = aboutRef.current;
      setBusy("join");
      try {
        await completeRegistration(joinRequestFrom(answers));
      } catch (err) {
        console.error(err);
        setError(siteNotice.bannerVisible ? siteNotice.bannerMessage : JOIN_FAILED);
        return false;
      }
      forgetAnswers(roundId);
      // Both are best effort from here. The join request is in. The form's
      // own save covers the first failing, and "Send the link again" on the
      // last step covers the second.
      await Promise.all([
        saveAboutYou(roundId, answers),
        sendUniversityCheck(answers.universityEmail, answers.preferredName),
      ]);
      // A move inside the site, never a new document: the join request's own
      // follow-up requests are still on their way and a page load would drop
      // them.
      router.replace(`${formUrl}?${STEP_PARAM}=choose`);
      return true;
    },
    [roundId, router, formUrl, siteNotice.bannerVisible, siteNotice.bannerMessage],
  );

  const check = useCallback((): boolean => {
    const issues = joinIssues(aboutRef.current, agreed);
    setProblems(issues);
    if (issues.length > 0) {
      window.requestAnimationFrame(() => noticeRef.current?.focus());
      return false;
    }
    if (paused) {
      // Said by the notice under the step. Nothing is sent while joining is paused.
      return false;
    }
    return true;
  }, [agreed, paused]);

  /**
   * What kind of account this browser is signed in to, as the server sees
   * it, for somebody who is already signed in when they press Continue.
   *
   * THE SESSION THAT IS THERE IS USED, AND NOT REPLACED. When the page was
   * drawn for this account the server has a session for it, so the form's
   * own read answers whether there is a join request. A new session is made
   * only when the server has none for this sign-in: it lapsed, or the page
   * was drawn before the sign-in happened.
   *
   * Two things a maintainer has to keep here, both about a password chosen in
   * ANOTHER tab after an emailed link (which signs every older sign-in out):
   *
   *  - Never ask the sign-in library to refresh by force. A tab still holding
   *    the older sign-in would be refused, and the library answers a refusal
   *    by signing the whole browser out, the newer sign-in included.
   *  - Never make a session from a sign-in that may be about to be replaced.
   *    The link's own sign-in is recognisable (`custom`), and it is given a
   *    moment for its replacement to arrive from the other tab first.
   */
  async function sessionKind(): Promise<AccountKind | { error: string }> {
    const auth = getClientAuth();
    const first = auth.currentUser;
    if (!first) return { error: SIGN_IN_AGAIN };
    const sameAccount = !signedInAs || !first.email || signedInAs.toLowerCase() === first.email.toLowerCase();
    if (drawnSignedIn && sameAccount) {
      const account = await readOwnAccount(roundId);
      if (account.ok) return account.joined ? "member" : "new";
      if (account.status !== 401) return { error: account.error };
    }
    try {
      if ((await first.getIdTokenResult()).signInProvider === "custom") {
        await new Promise((resolve) => window.setTimeout(resolve, SETTLE_MS));
      }
      const current = auth.currentUser;
      if (!current) return { error: SIGN_IN_AGAIN };
      const minted = await mintSession(await current.getIdToken());
      if (minted.ok) return minted.kind;
      return { error: minted.status === 401 ? SIGN_IN_AGAIN : minted.error };
    } catch {
      return { error: SIGN_IN_AGAIN };
    }
  }

  async function onContinue() {
    if (busy || joining.current) return;
    setError(null);
    if (!check()) return;
    if (!signedIn) {
      openAccount();
      return;
    }
    joining.current = true;
    setBusy("session");
    const kind = await sessionKind();
    const done = typeof kind === "string" ? await finishJoin(kind) : false;
    if (typeof kind !== "string") setError(kind.error);
    if (!done) {
      joining.current = false;
      setBusy(null);
    }
  }

  const onGoogle = useCallback(
    async (credential: string) => {
      if (joining.current) return;
      joining.current = true;
      setError(null);
      setBusy("google");
      let done = false;
      try {
        const result = await exchangeGoogleCredential(credential);
        done = await finishJoin(result.kind);
      } catch (err) {
        console.error(err);
        setError(SIGN_IN_FAILED);
      }
      if (!done) {
        joining.current = false;
        setBusy(null);
      }
    },
    [finishJoin],
  );

  const onEmail = useCallback(
    async (email: string, token: string | null) => {
      setError(null);
      setBusy("email");
      const started = await startEmailRegistration(email, token, joinReturnFor(roundId));
      setBusy(null);
      if (!started.ok) {
        setError(started.error);
        return;
      }
      // The link opens in a tab of its own, so that tab is left what was
      // typed here. This is the only way of making an account that does it.
      acrossTabs(roundId, "link-emailed");
      setInboxFor(email);
      setMoved((count) => count + 1);
    },
    [roundId],
  );

  const onProblem = useCallback((message: string | null) => setError(message), []);

  async function leave() {
    if (busy) return;
    setError(null);
    setBusy("session");
    try {
      await signOut();
    } catch (err) {
      console.error(err);
    }
    toldJoined.current = null;
    lastAsked.current = 0;
    timedAsks.current = 0;
    setBusy(null);
    router.refresh();
  }

  const continueButton = (className: string) => (
    <button
      type="button"
      className={`${kit.primary} ${className}`}
      onClick={onContinue}
      disabled={!hydrated || busy !== null || paused}
    >
      {busy === "join" ? (
        <span>Sending your join request…</span>
      ) : busy === "google" || busy === "session" ? (
        <span>One moment…</span>
      ) : (
        <>
          <span className={styles.onPhone}>Continue</span>
          <span className={styles.onLaptop}>Next</span>
          <ArrowRightIcon />
        </>
      )}
    </button>
  );

  return (
    <div className={`${styles.shell} ${styles.takeover}`}>
      <div className={styles.topBar}>
        <header className={styles.appBar}>
          <div className={styles.appBarSide}>
            {shown === "questions" ? (
              <Link href="/" className={styles.iconButton} aria-label="Close">
                <CloseIcon />
              </Link>
            ) : (
              <button type="button" className={styles.iconButton} aria-label="Back" onClick={backToAnswers}>
                <BackIcon />
              </button>
            )}
          </div>
          <div className={styles.appBarTitle}>{title}</div>
          <div className={styles.appBarSide} data-end="true" />
        </header>
        <div role="progressbar" aria-label="Step 1" aria-valuetext="Step 1" className={styles.progress}>
          <div className={`${styles.progressFill} ${join.firstStep}`} />
        </div>
      </div>

      <div className={styles.columns}>
        <aside className={styles.aside}>
          <div className={styles.asideHead}>
            <div className={`${kit.mono} ${styles.eyebrow}`}>{title}</div>
          </div>
          {closesLabel || decisionsLabel ? (
            <div className={styles.asideCard}>
              {closesLabel ? (
                <p>
                  Applications close <strong>{closesLabel}</strong>. You can change your answers until then.
                </p>
              ) : null}
              {decisionsLabel ? (
                <p>
                  Everyone hears on <span className={styles.together}>{decisionsLabel}</span>.
                </p>
              ) : null}
            </div>
          ) : null}
          <p className={styles.asideHelp}>
            Questions? <a href="mailto:ai-safety@uonsu.com">ai-safety@uonsu.com</a>
          </p>
        </aside>

        <div className={styles.main}>
          <div className={styles.stepRow}>
            <span className={`${kit.mono} ${styles.stepLine}`}>Step 1 · About you</span>
          </div>
          <div
            role="progressbar"
            aria-label="Step 1"
            aria-valuetext="Step 1"
            className={`${styles.progress} ${styles.desktopProgress}`}
          >
            <div className={`${styles.progressFill} ${join.firstStep}`} />
          </div>

          {shown === "account" ? (
            <JoinAccount
              signInHref={signInHref}
              inboxFor={inboxFor}
              busy={busy}
              error={error}
              standalone={standalone}
              headingRef={headingRef}
              onGoogle={onGoogle}
              onEmail={onEmail}
              onBack={backToAnswers}
              onProblem={onProblem}
            />
          ) : (
            <>
              <div>
                <h1 ref={headingRef} tabIndex={-1} className={styles.heading}>
                  About you
                </h1>
                <p className={styles.lede}>
                  {signedIn
                    ? "You haven’t joined NAISI yet, so this step is your join request too. You can keep applying while the committee checks it. If you get a place, that approves your account."
                    : "You don’t have an account yet, so this step is your join request too. You can keep applying while the committee checks it. If you get a place, that approves your account."}
                </p>
                {signedIn ? (
                  <p className={styles.lede}>
                    {address ? (
                      <>
                        Signed in as <span className={join.address}>{address}</span>.
                      </>
                    ) : (
                      "You’re signed in."
                    )}{" "}
                    <button type="button" className={join.leave} onClick={leave} disabled={!hydrated || busy !== null}>
                      Not you? Sign out
                    </button>
                  </p>
                ) : (
                  // Somebody who has an account, or who started this form on
                  // another day, reaches this view signed out and would
                  // otherwise answer it all again. The link is the form's own
                  // (`signInHref`), so signing in brings them back here, to
                  // where they left off.
                  <p className={styles.lede}>
                    Already have an account, or started an application before?{" "}
                    <Link href={signInHref} className={join.asideLink}>
                      Sign in
                    </Link>{" "}
                    to carry on.
                  </p>
                )}
              </div>

              {signedIn && fromLink && !hasJoinAnswers(about) ? (
                <div className={styles.notice}>
                  <p>
                    If you started this form in another tab, what you typed is still there. Go back to that tab
                    and press Continue, or answer here.
                  </p>
                </div>
              ) : null}
              {problems.length > 0 ? (
                <div ref={noticeRef} tabIndex={-1} className={styles.notice} data-tone="warn" role="alert">
                  <p>A few things to finish before you continue.</p>
                  <ul>
                    {problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {error ? (
                <div className={styles.notice} data-tone="warn" role="alert">
                  <p>{error}</p>
                  {error === SIGN_IN_AGAIN ? (
                    <p>
                      <button type="button" className={join.leave} onClick={leave} disabled={busy !== null}>
                        Sign out
                      </button>
                    </p>
                  ) : null}
                </div>
              ) : null}

              <AboutStep key={answers.drawn} about={about} email={{ kind: "typed" }} onChange={patch} problems={[]} />

              <div className={join.consent}>
                <PolicyConsent checked={agreed} onChange={setAgreed} id="join-consent" />
              </div>

              {paused ? <SurfacePausedNotice notice={siteNotice} surface="newRegistrations" /> : null}

              <div className={styles.desktopNav}>
                <span className={styles.navSpacer} />
                {continueButton(styles.next)}
              </div>
              {RECAPTCHA_ENABLED && !signedIn ? (
                <div className={styles.onLaptop}>
                  <RecaptchaLine />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {shown === "questions" ? (
        <div className={styles.bottomBar}>
          {RECAPTCHA_ENABLED && !signedIn ? <RecaptchaLine /> : null}
          <div className={styles.bottomActions}>{continueButton(styles.continue)}</div>
        </div>
      ) : null}
    </div>
  );
}
