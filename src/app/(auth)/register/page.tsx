"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import CountedTextarea from "@/components/ui/CountedTextarea";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import SigningIn from "@/components/SigningIn";
import signinStyles from "@/components/SigningIn.module.css";
import styles from "./registerSignIn.module.css";
import CollaboratorApply from "./CollaboratorApply";
import VerifyEmailStep from "./VerifyEmailStep";
import AuthEntry from "../AuthEntry";
import PolicyConsent from "@/components/PolicyConsent";
import { AUTH_BACK_HOME_EVENT, AUTH_PAGE_READY_EVENT } from "../LogoLink";
import GraduationSelect from "@/components/ui/GraduationSelect";
import Notice from "@/components/ui/Notice";
import StatusSelect from "@/components/ui/StatusSelect";
import Switch from "@/components/ui/Switch";
import { Field, Input } from "@/components/ui/Input";
import {
  completeRegistration,
  exchangeGoogleCredential,
  signOut,
} from "@/auth/signInWithGoogle";
import { signUpWithEmailPassword, startOver } from "@/auth/signInWithEmailPassword";
import DeleteAccountButton from "@/components/DeleteAccountButton";
import { useAuth } from "@/auth/AuthProvider";
import { safeFunnelReturn } from "@/lib/authReturn";
import { hardNavigate } from "@/lib/navigation/hardNavigate";
import { claimSelfHealAttempt } from "@/lib/navigation/selfHealGuard";
import { useSiteNotice } from "@/features/maintenance/useSiteNotice";
import { SurfacePausedNotice } from "@/features/maintenance/SurfacePausedNotice";
import { isSurfacePaused } from "@/lib/siteNotice";
import { getClientDb } from "@/lib/firebase/client";
import {
  FIELD_LIMITS,
  STATUSES_WITH_GRADUATION,
  subjectLabel,
  validateUniversityEmail,
  type AffiliationStatus,
} from "@/lib/firestore/users";
import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
  setCategory,
  setChannel,
  SUBSCRIPTION_CATEGORIES,
  type NotificationCategory,
  type NotificationPrefs,
} from "@/lib/firestore/notifications";

/**
 * The rows this form asks about, and it is NOT `ALL_CATEGORIES`.
 *
 * `tasks` is deliberately absent: it defaults on, it is not bulk mail, and a
 * registrant with no tasks yet cannot make a useful decision about review
 * requests they have never seen. It is switched on /profile, beside the copy
 * that says what turning it off stops.
 */
const REGISTER_CATEGORIES: NotificationCategory[] = [
  "newsletter",
  "events",
  "courses",
];

type SignInPhase = "idle" | "active" | "success" | "exiting" | "exitingBack";

const MIN_ACTIVE_MS = 1700;
const SUCCESS_DURATION_MS = 2550;
const SUCCESS_HOLD_TAIL_MS = 1330;
const EXIT_DURATION_MS = 530;
const CANCEL_GRACE_MS = 900;
const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

type VerificationState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; tokenId: string; nextSendAt: number }
  | { status: "verified"; tokenId: string; verifiedAt: Date }
  | { status: "error"; message: string };

/**
 * Set by AuthEntry (and re-set by the Google redirect callback) so a `?next=`
 * destination survives the hop through Google. It matters HERE because the
 * new-account leg of that hop lands on a bare `/register` with no query
 * string: AuthEntry sends `result.isNew` to `/register` without carrying the
 * parameter, so the cookie is the only thing left holding the address.
 * Mirrored in `AuthEntry.tsx` and `api/auth/google/callback/route.ts`.
 */
const AUTH_NEXT_COOKIE = "__auth_next";

/** The `__auth_next` value, or null. Browser-only: reads `document.cookie`. */
function readAuthNextCookie(): string | null {
  if (typeof document === "undefined") return null;
  const found = new RegExp(`(?:^|;\\s*)${AUTH_NEXT_COOKIE}=([^;]*)`).exec(document.cookie);
  if (!found) return null;
  try {
    return decodeURIComponent(found[1]);
  } catch {
    return null;
  }
}

/** Burn the marker so a stale one can't redirect an unrelated registration. */
function clearAuthNextCookie(): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${AUTH_NEXT_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } catch {
    /* storage unavailable: the marker expires on its own in ten minutes */
  }
}

export default function RegisterPage() {
  // Next 16 requires `useSearchParams()` consumers to live under a Suspense
  // boundary so the bailout-to-CSR semantics are explicit at build time.
  return (
    <Suspense fallback={null}>
      <RegisterRouter />
    </Suspense>
  );
}

/**
 * Signed out → the unified <AuthEntry> (in register mode; the mode + audience
 * toggles morph in place). Once an account exists, hand off to the
 * audience-specific continuation (collaborator application / member profile),
 * which skips its own entry step because the user is already signed in.
 */
function RegisterRouter() {
  const { user } = useAuth();
  const type = useSearchParams().get("type");

  if (!user) return <AuthEntry initialMode="register" />;
  return type === "collaborator" ? <CollaboratorApply /> : <RegisterPageInner />;
}

function RegisterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromSubscriber = searchParams.get("from") === "subscriber";
  const nextParam = searchParams.get("next");

  /**
   * Where finishing registration lands you. `/pending-approval` for almost
   * everyone; the form they came from when they arrived through one of the
   * application funnels, a course apply page or an admission round.
   *
   * Which addresses qualify is `safeFunnelReturn` in `src/lib/authReturn.ts`,
   * shared with `AuthEntry`, which decides the same question on the sign-in
   * leg. Two copies of a redirect allowlist is two chances for one of them to
   * be widened alone.
   *
   * Resolved lazily and CACHED in a ref, for two reasons. It reads
   * `document.cookie` (the fallback for the Google new-account hop, which
   * drops the query string), so it cannot run during a server render. And it
   * BURNS that cookie on first read, so a second call must not see a different
   * answer and re-navigate somewhere else mid-flow.
   */
  const returnToRef = useRef<string | null>(null);
  const returnTo = useCallback((): string => {
    if (returnToRef.current === null) {
      const found =
        safeFunnelReturn(nextParam) ?? safeFunnelReturn(readAuthNextCookie());
      if (found) clearAuthNextCookie();
      returnToRef.current = found ?? "/pending-approval";
    }
    return returnToRef.current;
  }, [nextParam]);
  const { user, role, loading: authLoading } = useAuth();
  // Site-wide maintenance notice: while an admin has paused new registrations
  // the final submit is disabled with the notice's copy inline, and a failing
  // submit surfaces that copy instead of the generic error. Client-side only —
  // the underlying Firestore write is untouched (see src/lib/siteNotice.ts).
  const siteNotice = useSiteNotice();
  const registrationsPaused = isSurfacePaused(siteNotice, "newRegistrations");

  const [step, setStep] = useState<"sign-in" | "profile">(
    user && !role ? "profile" : "sign-in",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Sign-in phase mirrors /login. Drives the ambient SigningIn surge,
  // the green success sweep, and the card slide-out on credential success.
  const [signinPhase, setSigninPhase] = useState<SignInPhase>("idle");
  const [successAt, setSuccessAt] = useState<number | null>(null);
  const [entering, setEntering] = useState(true);
  const activeStartRef = useRef(0);
  const credentialReceivedRef = useRef(false);

  // Email + password sign-up for UoN members (an alternative to Google sign-in).
  // The account is created here; the existing profile step + completeRegistration
  // run unchanged afterwards. Input focus only flips the ambient surge — it stays
  // off the Google popup-cancellation watchdog (which keys off window blur).
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [manualVerified, setManualVerified] = useState(false);
  const [agreedPolicies, setAgreedPolicies] = useState(false);

  useEffect(() => {
    if (!entering) return;
    const t = setTimeout(() => setEntering(false), 3200);
    return () => clearTimeout(t);
  }, [entering]);

  const handleGisReady = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          setEntering(false);
          try {
            window.dispatchEvent(new CustomEvent(AUTH_PAGE_READY_EVENT));
          } catch {
            /* CustomEvent unavailable */
          }
        }, 220);
      });
    });
  }, []);

  // Logo click → swipe back to the homepage. Only meaningful when on the
  // sign-in step; if the user is mid-profile-form we let the layout
  // handle the normal Link navigation (the page is leaving anyway).
  useEffect(() => {
    if (step !== "sign-in") return;
    const onBack = (e: Event) => {
      if (
        signinPhase === "exiting" ||
        signinPhase === "exitingBack" ||
        signinPhase === "success"
      ) {
        return;
      }
      e.preventDefault();
      setSigninPhase("exitingBack");
      setTimeout(() => router.push("/"), EXIT_DURATION_MS);
    };
    window.addEventListener(AUTH_BACK_HOME_EVENT, onBack);
    return () => window.removeEventListener(AUTH_BACK_HOME_EVENT, onBack);
  }, [step, signinPhase, router]);

  const startSurge = useCallback(() => {
    setSigninPhase((p) => {
      if (p !== "idle") return p;
      activeStartRef.current = performance.now();
      return "active";
    });
  }, []);

  // Settle the ambient surge back to idle when the user leaves an empty
  // email/password form and nothing is in flight (mirrors /login).
  const calmIfEmpty = useCallback(() => {
    if (!email.trim() && !password && !confirm && !accountBusy) {
      setSigninPhase("idle");
    }
  }, [email, password, confirm, accountBusy]);

  const handleCreateAccount = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setAccountError(null);
      if (!email.trim() || !password) {
        setAccountError("Enter an email and a password.");
        return;
      }
      if (password.length < 6) {
        setAccountError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirm) {
        setAccountError("Those passwords don't match.");
        return;
      }
      setAccountBusy(true);
      try {
        await signUpWithEmailPassword(email.trim(), password);
        // New account → straight to the profile form (mirrors the Google
        // new-user path, which swaps inline rather than sliding out).
        setSigninPhase("idle");
        setStep("profile");
      } catch (err) {
        setAccountError(
          err instanceof Error ? err.message : "Couldn't create your account.",
        );
      } finally {
        setAccountBusy(false);
      }
    },
    [email, password, confirm],
  );

  // Abandon an incomplete signup (created an account but didn't finish the
  // profile) so the user can start fresh with a different email. Safe: the
  // shared helper only deletes a genuine orphan (no users/collaborators doc).
  const handleStartOver = useCallback(async () => {
    setResetBusy(true);
    try {
      await startOver();
      setStep("sign-in");
      setManualVerified(false);
      setEmail("");
      setPassword("");
      setConfirm("");
    } finally {
      setResetBusy(false);
    }
  }, []);

  const handleVerified = useCallback(() => setManualVerified(true), []);
  // Email/password members must verify their login email before the profile
  // form; Google users are already verified (cached emailVerified) → straight
  // through. manualVerified is the live flip from VerifyEmailStep.
  const emailVerified = manualVerified || Boolean(user?.emailVerified);

  useEffect(() => {
    if (step !== "sign-in") return;
    let lastMouseDown = 0;
    let lastBlurAt = 0;
    const onMouseDown = () => {
      lastMouseDown = performance.now();
    };
    const onBlur = () => {
      lastBlurAt = performance.now();
      if (signinPhase === "idle" && performance.now() - lastMouseDown < 1500) {
        startSurge();
      }
    };
    const onFocus = () => {
      if (signinPhase !== "active") return;
      if (credentialReceivedRef.current) return;
      if (performance.now() - lastBlurAt > 3000) return;
      setTimeout(() => {
        if (!credentialReceivedRef.current && signinPhase === "active") {
          setSigninPhase("idle");
        }
      }, CANCEL_GRACE_MS);
    };
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [signinPhase, step, startSurge]);

  // Already signed in? Bounce away based on role. The `loading` guard
  // keeps the bounce from racing the inline credential-exchange path:
  // signInWithCredential fires onAuthStateChanged before the cookie POST
  // completes, and we don't want to navigate before /api/auth/session
  // mints the cookie.
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (loading) return;
    if (role === "member" || role === "committee" || role === "admin") {
      // Hard nav, guarded — the twin of AuthEntry's self-heal bounce. A soft
      // replace would replay any /dashboard -> /login redirect this document
      // already recorded (see lib/navigation/hardNavigate.ts), and since a
      // document load re-runs this effect, it needs the same one-shot guard to
      // avoid a reload loop.
      if (claimSelfHealAttempt()) hardNavigate("/dashboard", "replace");
    } else if (role === "pending") {
      // Normally /pending-approval. When they came through the course apply
      // funnel it is the apply page instead: a `pending` account is welcome
      // to apply (that page lives in the PUBLIC route group precisely so it
      // can), so bouncing them to "your membership is with the committee"
      // would strand them one click from the form they were filling in.
      router.replace(returnTo());
    } else if (role === "rejected") {
      router.replace("/");
    }
  }, [authLoading, user, role, router, loading, returnTo]);

  // Reverse guard: a signed-in collaborator has a collaborators doc but no
  // users doc, so `role` is null and the bounce above never fires — without
  // this they'd land on the member profile form and could end up with BOTH a
  // users and a collaborators doc on one uid. Probe by the `uid` field (the
  // collaborators doc id is name-slugged), mirroring CollaboratorApply. null =
  // still resolving.
  const [hasCollabDoc, setHasCollabDoc] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user) return;
    const db = getClientDb();
    const q = query(collection(db, "collaborators"), where("uid", "==", user.uid));
    return onSnapshot(
      q,
      (snap) => setHasCollabDoc(!snap.empty),
      () => setHasCollabDoc(false),
    );
  }, [user]);

  // Profile state
  const [preferredName, setPreferredName] = useState("");
  const [universityEmail, setUniversityEmail] = useState("");
  const [status, setStatus] = useState<AffiliationStatus | "">("");
  const [statusOther, setStatusOther] = useState("");
  const [subject, setSubject] = useState("");
  const [expectedGraduation, setExpectedGraduation] = useState("");
  const [motivation, setMotivation] = useState("");
  const [interests, setInterests] = useState("");
  // Form defaults, not storage defaults — every switch below is rendered, so
  // whatever is submitted is an answer the registrant saw and could change.
  // `courses` starts ON because it is an OPT-OUT, not an opt-in: cohort mail
  // is consented to by enrolling, and the category is the switch that stops
  // it (see the run email route's module comment). Starting it OFF would
  // stamp every new member with an explicit `courses: false` refusal at
  // signup — which the run email route reads as "never mail me about my
  // cohort" long before they have one.
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    channels: { gmail: true, uniEmail: false },
    // `newsletter` and `events` start OFF. They are the two OPT-IN rows: the
    // privacy policy says those emails go to people who have opted in, and a
    // switch that starts on is not somebody opting in. So the registrant
    // turns each on themselves, which is also how a join request made on an
    // application form starts (DEFAULT_NOTIFICATION_PREFS).
    // tests/privacy-policy.test.mjs holds the policy's sentence and these two
    // values together: change one and the other has to change with it.
    // `tasks` starts ON for the same reason as `courses` and is not rendered
    // (see REGISTER_CATEGORIES).
    categories: { newsletter: false, events: false, courses: true, tasks: true },
    // No switch on this form, and there should not be one: push is per
    // device and a registrant has not enabled notifications on anything yet.
    // The stored defaults are written so the shape is complete from the first
    // save; the switches live on /profile beside the device opt-in. The two
    // opt-in rows are stored OFF: ticking "email me the newsletter" is not
    // consent to a notification about it.
    push: { newsletter: false, events: false, courses: true, tasks: true },
  });

  // Verification state
  const [verification, setVerification] = useState<VerificationState>({ status: "idle" });
  const [cooldown, setCooldown] = useState(0);
  const [allowUnverifiedSubmit, setAllowUnverifiedSubmit] = useState(false);
  const lastVerifiedEmailRef = useRef<string | null>(null);

  const showGraduation = status !== "" && STATUSES_WITH_GRADUATION.includes(status);
  const showStatusOther = status === "other";
  /**
   * Whether the "Deliver to" channel panel has anything to control — and
   * therefore whether it renders at all.
   *
   * `SUBSCRIPTION_CATEGORIES` (newsletter + events), NOT every category and
   * NOT `isSubscribedToAnything`, which counts `courses` too. Those two
   * channel switches decide which verified address newsletter and event mail
   * goes to, and nothing else: `completeRegistration` mints subscription rows
   * for those two only, and both course email routes resolve ONE address per
   * recipient server-side and never read the channels map. So a registrant who
   * unticks newsletter and events but leaves course announcements on — the
   * default, since it is an opt-out — would otherwise be shown a delivery
   * section that routes nothing.
   *
   * The submit-time guard below reads the same value on purpose: an error
   * demanding a channel while the channel switches are hidden is a dead end.
   */
  const anySubscriptionCategoryOn = SUBSCRIPTION_CATEGORIES.some(
    (cat) => prefs.categories[cat],
  );
  // A typed-out university email that isn't a Nottingham address (e.g. another
  // institution, or the .edu.cn/.edu.my campuses — eligibility is .ac.uk-only)
  // → steer them to the external-collaborator flow. Gated on "@" so it only
  // fires once they've actually typed a domain, not on every keystroke.
  const uniEmailRejected =
    universityEmail.includes("@") &&
    validateUniversityEmail(universityEmail) !== null;

  // Subscribe to the outstanding verification doc. Firestore rules gate read
  // to authUid == request.auth.uid, so only this tab (signed in as the
  // initiator) can see the doc update.
  useEffect(() => {
    if (verification.status !== "sent") return;
    if (!user) return;
    const tokenId = verification.tokenId;
    const db = getClientDb();
    const unsub = onSnapshot(doc(db, "emailVerifications", tokenId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.verifiedAt) {
        const verifiedAt =
          data.verifiedAt instanceof Date
            ? data.verifiedAt
            : typeof (data.verifiedAt as { toDate?: () => Date }).toDate === "function"
              ? (data.verifiedAt as { toDate: () => Date }).toDate()
              : new Date();
        lastVerifiedEmailRef.current = (data.email as string) ?? universityEmail.trim().toLowerCase();
        setVerification({ status: "verified", tokenId, verifiedAt });
      }
    });
    return unsub;
  }, [verification, user, universityEmail]);

  // Cooldown ticker - drives the resend button countdown. The initial value
  // is seeded in sendVerification when the "sent" state is set; this effect
  // only keeps it ticking, so it never has to setState synchronously.
  useEffect(() => {
    if (verification.status !== "sent") return;
    const { nextSendAt } = verification;
    const id = setInterval(() => {
      setCooldown(Math.max(0, Math.ceil((nextSendAt - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(id);
  }, [verification]);

  // If user edits the uni email after a successful verification, the stamp
  // no longer applies — reset verification state. They need to re-verify.
  useEffect(() => {
    if (verification.status !== "verified") return;
    const current = universityEmail.trim().toLowerCase();
    if (current !== lastVerifiedEmailRef.current) {
      setVerification({ status: "idle" });
    }
  }, [universityEmail, verification]);

  const sendVerification = useCallback(async () => {
    setError(null);
    const emailError = validateUniversityEmail(universityEmail);
    if (emailError) {
      setError(emailError);
      return;
    }
    setVerification({ status: "sending" });
    try {
      const res = await fetch("/api/verify-email/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: universityEmail.trim().toLowerCase(),
          preferredName: preferredName.trim(),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: boolean; tokenId: string; cooldownRemaining: number }
        | { error: string }
        | null;
      if (!res.ok || !body || "error" in body) {
        const msg =
          (body && "error" in body && body.error) ||
          "Couldn't send the verification email. Try again in a moment.";
        throw new Error(msg);
      }
      const nextSendAt = Date.now() + body.cooldownRemaining * 1000;
      setCooldown(body.cooldownRemaining);
      setVerification({ status: "sent", tokenId: body.tokenId, nextSendAt });
    } catch (err) {
      console.error(err);
      setVerification({
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [universityEmail, preferredName]);

  const onCredential = useCallback(
    async (idToken: string) => {
      credentialReceivedRef.current = true;
      setError(null);
      setLoading(true);
      startSurge();
      try {
        const result = await exchangeGoogleCredential(idToken);
        if (result.isNew) {
          // New user — exchange completed but they still need to fill the
          // profile form, so we don't slide-out, just swap inline.
          setSigninPhase("idle");
          credentialReceivedRef.current = false;
          setStep("profile");
        } else {
          // Existing user → cascade through, green success sweep, slide.
          const elapsed = performance.now() - activeStartRef.current;
          const remaining = Math.max(0, MIN_ACTIVE_MS - elapsed);
          if (remaining > 0) await sleep(remaining);

          setSuccessAt(performance.now());
          setSigninPhase("success");
          await sleep(SUCCESS_DURATION_MS + SUCCESS_HOLD_TAIL_MS);

          try {
            sessionStorage.setItem("naisi:from-signin", "1");
          } catch {
            /* sessionStorage may be unavailable */
          }
          setSigninPhase("exiting");
          await sleep(EXIT_DURATION_MS);
          // Hard nav: /dashboard is protected, so this document may already
          // hold a poisoned route cache entry for it. The exit animation has
          // finished and "naisi:from-signin" survives the load.
          hardNavigate("/dashboard");
        }
      } catch (err) {
        console.error(err);
        setError("Sign-in failed. Please try again.");
        credentialReceivedRef.current = false;
        setSuccessAt(null);
        setSigninPhase("idle");
      } finally {
        setLoading(false);
      }
    },
    [startSurge],
  );

  const onScriptError = useCallback((message: string) => {
    setError(message);
  }, []);

  async function handleSubmitProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (registrationsPaused) {
      // Belt and braces behind the disabled submit — never a silent block.
      setError(siteNotice.bannerMessage);
      return;
    }
    if (!preferredName || !universityEmail || !status || !subject || !motivation) {
      setError("Please fill in every required field.");
      return;
    }
    const uniEmailError = validateUniversityEmail(universityEmail);
    if (uniEmailError) {
      setError(uniEmailError);
      return;
    }
    if (showStatusOther && !statusOther.trim()) {
      setError("Please describe your role since you picked Other.");
      return;
    }
    if (showGraduation && !expectedGraduation) {
      setError("Please pick your expected graduation month and year.");
      return;
    }
    if (
      anySubscriptionCategoryOn &&
      !prefs.channels.gmail &&
      !prefs.channels.uniEmail
    ) {
      setError("Pick at least one email to send messages to, or turn off all subscriptions.");
      return;
    }

    const verified = verification.status === "verified";
    if (!verified && !allowUnverifiedSubmit) {
      setError(
        "Please verify your university email first. We sent a link to your inbox. If you're stuck, click 'I'm having trouble' below.",
      );
      return;
    }

    if (!agreedPolicies) {
      setError("Please agree to the Terms of Use and Privacy Policy to continue.");
      return;
    }

    setLoading(true);
    try {
      await completeRegistration({
        preferredName,
        universityEmail: universityEmail.trim(),
        status: status as AffiliationStatus,
        statusOther: showStatusOther ? statusOther.trim() : undefined,
        subject,
        expectedGraduation: showGraduation ? expectedGraduation : undefined,
        motivation,
        interests: interests.trim() || undefined,
        notifications: prefs,
        verifiedTokenId: verified ? verification.tokenId : undefined,
        uniEmailVerifiedAt: verified ? verification.verifiedAt : undefined,
      });
      // The return address, when there is one. Same value the role bounce
      // above will compute a beat later (it is cached in a ref), so the two
      // cannot race each other to different pages.
      router.push(returnTo());
    } catch (err) {
      console.error(err);
      // During a declared incident the admin-written notice copy is the error
      // message.
      setError(
        siteNotice.bannerVisible
          ? siteNotice.bannerMessage
          : "Failed to save your application. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  // Hold the authed render until we know whether they're a collaborator, so a
  // collaborator never flashes the member profile form before the guard.
  if (user && !role && hasCollabDoc === null) {
    return (
      <div className={styles.frame}>
        <Card padding="lg" className={styles.card} style={{ width: "100%" }}>
          <p className={styles.para}>Loading…</p>
        </Card>
      </div>
    );
  }

  // Signed in as an external collaborator → they can't also register as a
  // member on the same account. Mirror of CollaboratorApply's member guard.
  if (user && !role && hasCollabDoc) {
    return (
      <div className={styles.frame}>
        <Card padding="lg" className={styles.card} style={{ width: "100%" }}>
          <h1 className={styles.heading}>You&apos;re signed in as a collaborator</h1>
          <p className={styles.lede}>
            You&apos;re signed in as an external collaborator ({user.email}). Head to
            your collaborator space, or sign out to register as a University of
            Nottingham student or staff member on a different account.
          </p>
          <div className={styles.buttonRow}>
            <Button onClick={() => router.push("/collaborator")}>
              Go to your collaborator space
            </Button>
            <Button variant="secondary" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const frameClass = [
    signinStyles.exitFrame,
    entering ? signinStyles.entering : "",
    signinPhase === "exiting" ? signinStyles.exiting : "",
    signinPhase === "exitingBack" ? signinStyles.exitingBack : "",
  ]
    .filter(Boolean)
    .join(" ");

  // The form of ten fields gets the wider column; the two short steps before
  // it keep the sign-in card's width.
  const onProfileForm = step === "profile" && emailVerified;

  return (
    <div
      className={`${frameClass} ${styles.frame}${onProfileForm ? ` ${styles.frameWide}` : ""}`}
    >
    <Card padding="lg" className={styles.card} style={{ width: "100%" }}>
      {onProfileForm && <p className={`meta ${styles.eyebrow}`}>Your account</p>}
      <h1 className={styles.heading}>{onProfileForm ? "A bit about you" : "Join NAISI"}</h1>
      <p className={styles.lede}>
        {step === "sign-in"
          ? "Apply to join the Nottingham AI Safety Initiative. We'll review your application and be in touch."
          : !emailVerified
            ? "Verify your email address to continue."
            : "The committee reads this with your join request. You can change it later in your profile."}
      </p>

      {step === "profile" && user && emailVerified && (
        <p className={styles.accountLine}>
          Signed in as {user.email}. Not you?{" "}
          <button
            type="button"
            onClick={() => void handleStartOver()}
            disabled={resetBusy}
            className={styles.inlineAction}
          >
            {resetBusy ? "Starting over…" : "Start over with a different email"}
          </button>
          {" · "}
          <DeleteAccountButton />
        </p>
      )}

      {fromSubscriber && (
        <Notice tone="info" role="note" className={styles.noticeGap}>
          We noticed you&apos;ve subscribed to NAISI emails before. Completing
          registration will move your subscription onto your member account so
          you don&apos;t get duplicate emails.
        </Notice>
      )}

      {step === "sign-in" ? (
        <>
          <div className={styles.googleWrap} onMouseDown={startSurge}>
            <GoogleSignInButton
              onCredential={onCredential}
              onScriptError={onScriptError}
              onReady={handleGisReady}
            />
          </div>
          {error && <p className={`${styles.formError} ${styles.boxNote}`}>{error}</p>}

          <div className={styles.divider}>
            <span className={styles.dividerLine} />
            <span>or</span>
            <span className={styles.dividerLine} />
          </div>

          <form
            id="register-account-form"
            onSubmit={handleCreateAccount}
            className={styles.authForm}
          >
            <Field
              id="register-email"
              label="Email"
              hint="A personal email you'll keep. Your university address can't be used to sign in. You'll add your university email separately to confirm eligibility."
            >
              <Input
                id="register-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={startSurge}
                onMouseDown={startSurge}
                onBlur={calmIfEmpty}
                autoComplete="email"
                placeholder="you@gmail.com"
                required
              />
            </Field>
            <Field id="register-password" label="Password" hint="At least 6 characters.">
              <Input
                id="register-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={startSurge}
                onMouseDown={startSurge}
                onBlur={calmIfEmpty}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field id="register-confirm" label="Confirm password">
              <Input
                id="register-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onFocus={startSurge}
                onMouseDown={startSurge}
                onBlur={calmIfEmpty}
                autoComplete="new-password"
                required
              />
            </Field>
            {accountError && <p className={styles.formError}>{accountError}</p>}
          </form>

          <p className={`${styles.formNote} ${styles.boxNote}`}>
            Already have an account?{" "}
            <Link href="/login" className={styles.inlineLink}>
              Sign in
            </Link>
          </p>

          <div className={styles.footer}>
            <Button
              type="submit"
              form="register-account-form"
              fullWidth
              size="lg"
              disabled={accountBusy}
            >
              {accountBusy ? "Creating account…" : "Create account & continue"}
            </Button>
            <SigningIn
              active={signinPhase !== "idle"}
              successStartAt={signinPhase === "success" || signinPhase === "exiting" ? successAt : null}
            />
          </div>
        </>
      ) : !emailVerified ? (
        <VerifyEmailStep
          email={user?.email ?? null}
          onVerified={handleVerified}
          onStartOver={() => void handleStartOver()}
          startingOver={resetBusy}
        />
      ) : (
        <form onSubmit={handleSubmitProfile} className={styles.profileForm}>
          <Field id="preferredName" label="Preferred name">
            <Input
              id="preferredName"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              placeholder="What should we call you?"
              maxLength={FIELD_LIMITS.preferredName}
              required
            />
          </Field>
          <Field
            id="universityEmail"
            label="University email"
            hint="We accept @nottingham.ac.uk (including subdomains like exmail.nottingham.ac.uk). Staff welcome. If your address is a different format, email ai-safety@uonsu.com and we'll add you manually."
          >
            <div className={styles.uniRow}>
              <Input
                id="universityEmail"
                type="email"
                value={universityEmail}
                onChange={(e) => setUniversityEmail(e.target.value)}
                placeholder="you@nottingham.ac.uk"
                maxLength={FIELD_LIMITS.universityEmail}
                pattern="^[^@\s]+@([a-zA-Z0-9-]+\.)*nottingham\.ac\.uk$"
                title="Use your University of Nottingham email address"
                required
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const local = universityEmail.split("@")[0].trim();
                  if (local) setUniversityEmail(`${local}@nottingham.ac.uk`);
                }}
                title="Append @nottingham.ac.uk to what you've typed"
              >
                @nottingham.ac.uk
              </Button>
            </div>
            <p className={styles.fieldNote}>
              We&rsquo;ll email you a link to check it&rsquo;s yours.
            </p>

            <VerificationPanel
              state={verification}
              cooldown={cooldown}
              hasEmail={Boolean(universityEmail.trim())}
              onSend={sendVerification}
              allowUnverifiedSubmit={allowUnverifiedSubmit}
              onToggleAllowUnverified={() => setAllowUnverifiedSubmit((v) => !v)}
            />

            {uniEmailRejected && (
              <Notice tone="neutral" className={styles.boxNote}>
                Not a University of Nottingham student or staff member?{" "}
                <Link href="/register?type=collaborator" className={styles.inlineLink}>
                  Apply as an external collaborator
                </Link>{" "}
                instead. No university email is needed.
              </Notice>
            )}
          </Field>
          <Field id="status" label="What do you do at UoN?">
            <StatusSelect id="status" value={status} onChange={setStatus} required />
          </Field>
          {showStatusOther && (
            <Field
              id="statusOther"
              label="Describe your role"
              hint="A short description of what you do at or with the university."
            >
              <Input
                id="statusOther"
                value={statusOther}
                onChange={(e) => setStatusOther(e.target.value)}
                maxLength={FIELD_LIMITS.statusOther}
                required
              />
            </Field>
          )}
          <Field
            id="subject"
            label={subjectLabel(status || undefined)}
            hint={
              status === "postdoc" || status === "employee"
                ? "e.g. Machine learning, department of Computer Science"
                : status === "other"
                  ? "e.g. what field you work or study in"
                  : "e.g. BSc Mathematics, MSc Artificial Intelligence"
            }
          >
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={FIELD_LIMITS.subject}
              required
            />
          </Field>
          {showGraduation && (
            <Field
              id="expectedGraduation"
              label="Expected graduation"
              hint="Month and year you expect to finish."
            >
              <GraduationSelect
                id="expectedGraduation"
                value={expectedGraduation}
                onChange={setExpectedGraduation}
                required
              />
            </Field>
          )}
          <Field
            id="motivation"
            label="Why are you interested in AI safety?"
            hint="A couple of sentences is plenty."
          >
            <CountedTextarea
              id="motivation"
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              max={FIELD_LIMITS.motivation}
              required
            />
          </Field>
          <Field
            id="interests"
            label={
              <>
                Interests within AI safety <span className={styles.optional}>(optional)</span>
              </>
            }
            hint="e.g. interpretability, alignment, governance, evals. Anything that draws you in."
          >
            <CountedTextarea
              id="interests"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              max={FIELD_LIMITS.interests}
              rows={2}
            />
          </Field>

          <hr className={styles.rule} />
          <div className={styles.emails}>
            <h2 className={styles.sectionTitle}>Emails</h2>
            <fieldset className={styles.switchGroup}>
              <legend className={styles.groupLegend}>Send me</legend>
              {REGISTER_CATEGORIES.map((cat) => (
                <div key={cat} className={styles.switchRow}>
                  <Switch
                    checked={prefs.categories[cat]}
                    onChange={(next) => setPrefs((p) => setCategory(p, cat, next))}
                    label={CATEGORY_LABELS[cat]}
                    description={CATEGORY_DESCRIPTIONS[cat]}
                  />
                </div>
              ))}
            </fieldset>
            {/* Only the two subscription categories have a delivery choice:
                see `anySubscriptionCategoryOn`. Cohort mail is addressed to
                one proven address by the run itself, so these switches would
                not move it. */}
            {anySubscriptionCategoryOn && (
              <fieldset className={styles.switchGroup}>
                {/* Names the two it actually routes. A bare "Deliver to"
                    under three switches reads as covering all three, and
                    course announcements go to whichever address the run has
                    proven, whatever is picked here. */}
                <legend className={styles.groupLegend}>
                  Deliver newsletter and event email to
                </legend>
                <div className={styles.switchRow}>
                  <Switch
                    checked={prefs.channels.gmail}
                    onChange={(next) => setPrefs((p) => setChannel(p, "gmail", next))}
                    label={`Account email (${user?.email ?? "your sign-in email"})`}
                  />
                </div>
                <div className={styles.switchRow}>
                  <Switch
                    checked={prefs.channels.uniEmail}
                    onChange={(next) => setPrefs((p) => setChannel(p, "uniEmail", next))}
                    label="University email"
                  />
                </div>
              </fieldset>
            )}
            <Notice tone="neutral" role="note">
              Emails about your own applications and places always come.
            </Notice>
          </div>
          <PolicyConsent
            checked={agreedPolicies}
            onChange={setAgreedPolicies}
            id="member-consent"
          />
          {error && <p className={styles.formError}>{error}</p>}
          {registrationsPaused && (
            <SurfacePausedNotice notice={siteNotice} surface="newRegistrations" />
          )}
          <Button
            data-testid="register-submit"
            type="submit"
            fullWidth
            size="lg"
            disabled={loading || registrationsPaused}
          >
            {loading ? "Sending…" : "Finish"}
          </Button>
        </form>
      )}
    </Card>
    </div>
  );
}

function VerificationPanel({
  state,
  cooldown,
  hasEmail,
  onSend,
  allowUnverifiedSubmit,
  onToggleAllowUnverified,
}: {
  state: VerificationState;
  cooldown: number;
  hasEmail: boolean;
  onSend: () => void;
  allowUnverifiedSubmit: boolean;
  onToggleAllowUnverified: () => void;
}) {
  if (!hasEmail) return null;

  if (state.status === "verified") {
    return (
      <div data-testid="register-uni-verified" className={styles.verified}>
        <Badge tone="success">Verified</Badge>
        <span>You&apos;re all set. This email is confirmed.</span>
      </div>
    );
  }

  return (
    <div className={styles.verify}>
      <div className={styles.verifyRow}>
        <Badge tone={state.status === "sent" ? "accent" : "neutral"}>
          {state.status === "sent" ? "Check your inbox" : "Not verified"}
        </Badge>
        {state.status === "sent" ? (
          <Button type="button" variant="secondary" onClick={onSend} disabled={cooldown > 0}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
          </Button>
        ) : (
          <Button
            data-testid="register-uni-send"
            type="button"
            onClick={onSend}
            disabled={state.status === "sending"}
          >
            {state.status === "sending" ? "Sending…" : "Send verification email"}
          </Button>
        )}
      </div>
      {state.status === "sent" && (
        <p className={styles.formNote}>
          We&apos;ve sent a link to your university email. Click it and
          this page will update automatically when we see the click.
          Check spam if it doesn&apos;t land in a minute.
        </p>
      )}
      {state.status === "error" && <p className={styles.formError}>{state.message}</p>}
      <label className={styles.escape}>
        <input
          type="checkbox"
          checked={allowUnverifiedSubmit}
          onChange={onToggleAllowUnverified}
        />
        <span>
          I&apos;m having trouble with the verification email. Let me
          submit without verifying. The committee will check my email
          manually before approving.
        </span>
      </label>
    </div>
  );
}
