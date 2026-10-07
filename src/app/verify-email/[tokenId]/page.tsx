import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import Card from "@/components/ui/Card";
import { getAdminDb } from "@/lib/firebase/admin";
import { getSessionUid } from "@/lib/firebase/session";
import { confirmUniEmailVerification } from "@/lib/email/confirmUniEmailVerification";
import { confirmLoginEmailVerification } from "@/lib/email/confirmLoginEmailVerification";
import { verifyToken } from "@/lib/signedTokens";
import LoginEmailVerified from "./LoginEmailVerified";
import styles from "./verify.module.css";

type SearchParams = { t?: string | string[] };

type Result =
  | { status: "ok"; email: string }
  | {
      status: "login";
      customToken: string;
      audience: "member" | "collaborator";
      next: string | null;
    }
  | { status: "error"; message: string };

/**
 * Magic-link landing page. Hit from the email button; confirms the token
 * server-side, tells the user they can close the tab (their original
 * register tab is subscribed via onSnapshot and will update on its own).
 *
 * Calls `confirmUniEmailVerification` directly rather than fetching the
 * sibling API route on its own origin.
 */
export default async function VerifyEmailLandingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const raw = params.t;
  const signed = Array.isArray(raw) ? raw[0] : raw;

  let result: Result;
  if (!signed) {
    result = {
      status: "error",
      message: "This link is missing its verification token.",
    };
  } else {
    const db = getAdminDb();
    if (!db) {
      console.error("[verify-email/page] getAdminDb returned null");
      result = {
        status: "error",
        message: "We couldn't reach the verification service. Try again in a moment.",
      };
    } else if (verifyToken(signed, "verify-login-email")) {
      // Login-email magic link (registration v3): verify + sign in (option A).
      const r = await confirmLoginEmailVerification(db, signed);
      result = r.ok
        ? {
            status: "login",
            customToken: r.customToken,
            audience: r.audience,
            next: r.next,
          }
        : { status: "error", message: r.error };
    } else {
      // The uni-email link verifies an attribute on an already-signed-in
      // account, so the confirming request must be that account: pass the
      // caller's own session uid to the helper, which refuses a token minted
      // for a different account (the ownership binding — see its docblock).
      const session = await getSessionUid();
      const r = await confirmUniEmailVerification(db, signed, session?.uid ?? null);
      result = r.ok
        ? { status: "ok", email: r.email }
        : { status: "error", message: r.error };
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <Link href="/" aria-label="NAISI home" className={styles.brand}>
          <BrandMark size={32} className={styles.brandMark} />
        </Link>
      </header>
      <main className={styles.main}>
      <div className={styles.frame}>
        <Card padding="lg" className={styles.card}>
          {result.status === "login" ? (
            <LoginEmailVerified
              customToken={result.customToken}
              audience={result.audience}
              next={result.next}
            />
          ) : result.status === "ok" ? (
            <>
              <h1>University email verified</h1>
              <p>
                We&apos;ve confirmed you own <strong>{result.email}</strong>.
              </p>
              <p>
                You can close this tab now. Your registration tab will
                update automatically. If you closed it, head back to{" "}
                <Link href="/register">the sign-up page</Link> and finish from
                there.
              </p>
            </>
          ) : (
            <>
              <h1>Couldn&apos;t verify this link</h1>
              <p>
                {result.message} If your original link expired, head back
                to your registration tab and click &quot;Resend&quot;.
                We&apos;ll email a fresh one.
              </p>
              <Link
                href="/register"
                className={styles.action}
                style={{
                  color: "var(--color-on-accent)",
                }}
              >
                Go to the sign-up page
              </Link>
            </>
          )}
        </Card>
      </div>
      </main>
    </div>
  );
}
