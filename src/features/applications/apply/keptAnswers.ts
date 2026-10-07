import type { AboutYou } from "@/lib/applications/model";
import { hasJoinAnswers, keptKey, packKept, readKept } from "@/lib/applications/applicant/join";

/**
 * Where the join step keeps what somebody has typed while they sign in.
 *
 * IN THE TAB, AND NOWHERE ELSE. This is the browser's session storage: it
 * belongs to one tab and goes when the tab closes. The answers are personal
 * (a name, a university address, why somebody is interested), so they are
 * kept for exactly as long as they are needed and in the smallest place that
 * works. The site's privacy page lists what it keeps in the browser's local
 * storage, which outlives the tab, and this is deliberately not there.
 *
 * WHAT is kept is decided by `packKept` and `readKept`
 * (`src/lib/applications/applicant/join.ts`): the answers to the first step
 * and nothing else. Never a password, never the address somebody signs in
 * with, never whether they agreed to the terms.
 *
 * Every call is wrapped: a browser with storage switched off keeps nothing,
 * and the step works the same for as long as the page is open.
 */
function keptStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The answers this tab is keeping for this form, or null. */
export function loadKept(roundId: string): AboutYou | null {
  try {
    return readKept(keptStore()?.getItem(keptKey(roundId)), Date.now());
  } catch {
    return null;
  }
}

/** Keep these answers, or keep nothing when there are none. */
export function keepAnswers(roundId: string, about: AboutYou): void {
  try {
    const store = keptStore();
    if (!store) return;
    if (hasJoinAnswers(about)) store.setItem(keptKey(roundId), packKept(about, Date.now()));
    else store.removeItem(keptKey(roundId));
  } catch {
    // Storage is full or refused: nothing is kept, and nothing else changes.
  }
}

/** Throw away what was kept: the join request has been sent, or was never needed. */
export function forgetAnswers(roundId: string): void {
  try {
    keptStore()?.removeItem(keptKey(roundId));
  } catch {
    // Nothing to forget.
  }
}
