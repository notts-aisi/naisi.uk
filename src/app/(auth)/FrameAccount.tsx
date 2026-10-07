"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import InitialsChip from "@/components/ui/InitialsChip";
import { useAuth } from "@/auth/AuthProvider";
import { signOut } from "@/auth/signInWithGoogle";
import { useBackHome } from "./LogoLink";
import styles from "./layout.module.css";

/**
 * The two pages whose own card changes when the visitor signs out: each shows
 * its signed-out card in place. Any other page in this frame has nothing to
 * show a signed-out visitor, so signing out there leads home.
 */
const SIGN_IN_PAGES = new Set(["/login", "/register"]);

function Chevron() {
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
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/**
 * The top right of the sign-in frame. Signed out, it is the way back to the
 * site. Signed in, it says which account this is and offers the way out of
 * it, which is what somebody who picked the wrong Google account needs while
 * they are still setting up.
 *
 * It renders the signed-out link until an account is known, so the corner is
 * never empty and is in the page's own HTML.
 */
export default function FrameAccount() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const backHome = useBackHome();

  if (!user) {
    return (
      <Link href="/" className={styles.back} onClick={backHome}>
        <span>Back to naisi.uk</span>
        <Chevron />
      </Link>
    );
  }

  async function handleSignOut() {
    await signOut();
    if (!SIGN_IN_PAGES.has(pathname)) router.push("/");
  }

  const address = user.email ?? "";
  const name = user.displayName?.trim() || address || "Account";

  return (
    <div className={styles.account}>
      <InitialsChip name={name} uid={user.uid} />
      {address && <span className={styles.address}>{address}</span>}
      <button type="button" className={styles.signOut} onClick={handleSignOut}>
        Sign out
      </button>
    </div>
  );
}
