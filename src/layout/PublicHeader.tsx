"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import Drawer from "@/components/ui/Drawer";
import TransitionLink from "./TransitionLink";
import { useArrivedByNavigation, usePublicTransition } from "./PublicMain";
import { useAuth } from "@/auth/AuthProvider";
import { signOut } from "@/auth/signInWithGoogle";
import {
  ACCOUNT_ENTRIES,
  HEADER_PAGES,
  NOT_APPROVED_HINT,
  NOT_APPROVED_LABEL,
  addressOf,
  isCurrentPage,
  shown,
  type NavEntry,
} from "./publicNav";
import styles from "./PublicHeader.module.css";

const DRAWER_ID = "public-nav-drawer";

/**
 * What sits after the hairline, for one account state. Every state fills the
 * same two places the signed-out bar has: a quiet text control where "Sign
 * in" is, and an outlined button where "Join" is.
 */
type AccountView = {
  /** A line of text with no link, before the controls. */
  note: { label: string; hint: string } | null;
  /** The text control. Null when the state has only the outlined one. */
  quiet: NavEntry | "sign-out" | null;
  /** The outlined button. */
  outlined: NavEntry | "sign-out";
  /** Whether the outlined button also sits beside the menu button on a phone. */
  inPhoneBar: boolean;
  /** Long words: the bar closes its gaps a little just above the phone layout. */
  long: boolean;
};

const SIGNED_OUT: AccountView = {
  note: null,
  quiet: ACCOUNT_ENTRIES.signIn,
  outlined: ACCOUNT_ENTRIES.join,
  inPhoneBar: true,
  long: false,
};

const APPROVED: AccountView = {
  note: null,
  quiet: "sign-out",
  outlined: ACCOUNT_ENTRIES.dashboard,
  inPhoneBar: true,
  long: false,
};

// Its label is too long to share a phone's bar with the brand and the menu
// button at 360px, so on a phone this state lives in the menu only.
const WAITING: AccountView = {
  note: null,
  quiet: "sign-out",
  outlined: ACCOUNT_ENTRIES.waiting,
  inPhoneBar: false,
  long: true,
};

const NOT_APPROVED: AccountView = {
  note: { label: NOT_APPROVED_LABEL, hint: NOT_APPROVED_HINT },
  quiet: null,
  outlined: "sign-out",
  inPhoneBar: false,
  long: true,
};

function MenuIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export default function PublicHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The bar lifts off the top of the screen on the way to sign-in or the
  // signed-in area. The context fires `headerLifting` BEFORE the body
  // fade-out (`exiting`) so the bar clears the viewport as a discrete moment
  // before the page transitions away.
  const publicTransition = usePublicTransition();
  const lifting = publicTransition?.headerLifting ?? false;
  // Entrance, for a bar reached by a navigation inside the browser only: it
  // mounts held above the screen (.headerWaiting) and one animation frame
  // later the class is stripped, so the transition brings it down into place.
  // A bar that arrives in the page's own HTML is in place from the first
  // paint and waits for no script.
  const arrivedByNavigation = useArrivedByNavigation();
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const waiting = arrivedByNavigation && !settled;

  const pages = shown(HEADER_PAGES);

  /*
    Default to the signed-out pair while auth is still resolving: an empty
    place for two or three seconds was the common complaint. If the visitor
    turns out to be signed in, Sign in bounces through /login's effect, which
    redirects to the right place for their role. An account with no role yet
    (signed in, sign-up not finished) reads as signed out here for the same
    reason.
  */
  const account: AccountView = !user
    ? SIGNED_OUT
    : role === "member" || role === "committee" || role === "admin"
      ? APPROVED
      : role === "pending"
        ? WAITING
        : role === "rejected"
          ? NOT_APPROVED
          : SIGNED_OUT;

  const closeDrawer = () => setDrawerOpen(false);

  async function handleSignOut() {
    closeDrawer();
    await signOut();
    // Deliberately a soft refresh, not a hard navigation. This runs on a
    // PUBLIC page, and refreshDynamicData does drop the bfcache + segment
    // entries. The one thing it cannot clear is the route cache, but the
    // only entry that could matter here (/dashboard -> /dashboard, recorded
    // while signed in) is truthful, and forcing a full reload of a marketing
    // page on every sign-out is the worse trade. NOTE: this is not what clears
    // protected-route entries; see lib/navigation/hardNavigate.ts.
    router.refresh();
  }

  /**
   * One account control. TransitionLink plays the page's exit only when the
   * address leaves the public frame, so an entry that later points at a
   * public page needs no change here. In the menu the exit waits about a
   * second, long enough for the drawer's 900ms close to finish first.
   */
  const control = (what: NavEntry | "sign-out", className: string, inDrawer: boolean) => {
    if (what === "sign-out") {
      return (
        <button type="button" onClick={handleSignOut} className={className}>
          Sign out
        </button>
      );
    }
    const href = addressOf(what);
    if (href === null) return null;
    return (
      <TransitionLink
        href={href}
        className={className}
        onClick={inDrawer ? closeDrawer : undefined}
        delayMs={inDrawer ? 1000 : undefined}
      >
        {what.label}
      </TransitionLink>
    );
  };

  return (
    <>
      <header
        className={[
          styles.header,
          waiting ? styles.headerWaiting : "",
          lifting ? styles.headerLifting : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={styles.inner}>
          <Link href="/" className={styles.brand} aria-label="NAISI home">
            <BrandMark size={32} className={styles.brandMark} />
          </Link>

          <div className={account.long ? `${styles.desk} ${styles.deskLong}` : styles.desk}>
            <nav className={styles.nav} aria-label="Primary">
              {pages.map((entry) => (
                <Link
                  key={entry.key}
                  href={entry.href}
                  className={styles.navLink}
                  aria-current={isCurrentPage(pathname, entry.href) ? "page" : undefined}
                >
                  {entry.label}
                </Link>
              ))}
            </nav>
            <span className={styles.rule} aria-hidden="true" />
            <div className={styles.account}>
              {account.note && (
                <span className={styles.note} title={account.note.hint}>
                  {account.note.label}
                </span>
              )}
              {account.quiet && control(account.quiet, styles.quiet, false)}
              {control(account.outlined, styles.outlined, false)}
            </div>
          </div>

          <div className={styles.phone}>
            {account.inPhoneBar && control(account.outlined, styles.outlined, false)}
            <button
              type="button"
              className={styles.menuButton}
              aria-label={drawerOpen ? "Close menu" : "Open menu"}
              aria-expanded={drawerOpen}
              aria-controls={DRAWER_ID}
              onClick={() => setDrawerOpen(true)}
            >
              <MenuIcon />
            </button>
          </div>
        </div>
      </header>
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        id={DRAWER_ID}
        ariaLabel="Site navigation"
      >
        <div className={styles.drawerBrand}>
          <BrandMark size={32} className={styles.brandMark} />
        </div>
        <nav className={styles.drawerNav} aria-label="Primary">
          {pages.map((entry) => (
            <Link
              key={entry.key}
              href={entry.href}
              className={styles.drawerLink}
              aria-current={isCurrentPage(pathname, entry.href) ? "page" : undefined}
              onClick={closeDrawer}
            >
              {entry.label}
            </Link>
          ))}
        </nav>
        <div className={styles.drawerAccount}>
          {account.note && <span className={styles.drawerNote}>{account.note.label}</span>}
          {account.quiet && control(account.quiet, styles.drawerQuiet, true)}
          {control(account.outlined, styles.drawerOutlined, true)}
        </div>
      </Drawer>
    </>
  );
}
