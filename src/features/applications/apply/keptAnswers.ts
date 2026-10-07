import type { AboutYou } from "@/lib/applications/model";
import {
  ACROSS_TABS_MAX_AGE_MS,
  hasJoinAnswers,
  keptKey,
  packKept,
  readKept,
} from "@/lib/applications/applicant/join";

/**
 * Where the join step keeps what somebody has typed while they sign in.
 *
 * IN THE TAB. This is the browser's session storage: it belongs to one tab
 * and goes when the tab closes. The answers are personal (a name, a
 * university address, why somebody is interested), so they are kept for
 * exactly as long as they are needed and in the smallest place that works.
 *
 * AND, FOR AN EMAILED LINK ONLY, WHERE THE BROWSER'S OTHER TABS CAN READ IT.
 * Somebody who chooses to continue with an email address is sent a link, and
 * a link in an email opens in a tab of its own, which has none of the first
 * tab's session storage. So for that way of making an account, and for no
 * other, a copy of what the tab keeps goes into the browser's local storage,
 * where the link's tab finds it. Local storage outlives the tab and is read
 * by every tab of the browser, so the copy is held to three limits, and
 * `acrossTabs` is the one function that touches it:
 *
 *  1. ONLY ONCE A LINK HAS BEEN EMAILED. The copy is made when the register
 *     route has taken the address, and at no other moment. Google's button
 *     and every link to the sign-in page leave nothing there.
 *  2. FOR AN HOUR. A copy whose answers were last changed more than an hour
 *     ago is not believed, and whichever page reads it next throws it away.
 *  3. UNTIL THE JOIN REQUEST HAS GONE. `forgetAnswers` removes it with the
 *     tab's own, the moment the join request is sent.
 *
 * The site's privacy page says where that copy is kept, for which way of
 * making an account, for how long and until when, and it lists everything
 * else the site keeps in local storage. `tests/privacy-policy.test.mjs` holds
 * the page and this module together: a change to one of the three limits is
 * a change to the page, in a new version of it.
 *
 * WHAT is kept is decided by `packKept` and `readKept`
 * (`src/lib/applications/applicant/join.ts`): the answers to the first step
 * and nothing else. Never a password, never the address somebody signs in
 * with, never whether they agreed to the terms. The copy that crosses tabs is
 * the tab's own text, character for character, so it can hold nothing more.
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

/** What the step can ask of the copy that crosses tabs. */
export type AcrossTabsAsk =
  /** The register route has taken an address, so a link is on its way. */
  | "link-emailed"
  /** The answers this tab keeps have just changed. */
  | "answers-changed"
  /** A page wants whatever an emailed link's tab was left. */
  | "read"
  /** The join request has gone, or was never needed. */
  | "forget";

/**
 * The forms this page has asked for an emailed link for. Held in memory and
 * nowhere else, so it goes with the page. It is what lets a later change to
 * the answers bring the copy up to date, and what stops any other page from
 * starting one.
 */
const linkEmailedFor = new Set<string>();

/**
 * THE ONE FUNCTION THAT TOUCHES THE BROWSER'S LOCAL STORAGE FOR THIS FORM.
 *
 * It answers the copy an emailed link's tab was left when it is asked to
 * `read`, and null for every other ask. `now` is the clock, handed in so the
 * hour can be checked by a test.
 *
 *  - `link-emailed` makes the copy: the text this tab keeps, as it is.
 *  - `answers-changed` brings it up to date, and only on a page that asked
 *    for a link. On any other page it writes nothing, which is what keeps
 *    the answers of somebody who continues with Google out of local storage.
 *  - `read` believes a copy for an hour from when its answers were last
 *    changed, and removes one it does not believe.
 *  - `forget` removes it.
 *
 * Nothing here throws. Local storage can be missing, full or refused, and
 * then nothing crosses tabs: the answers are still in the tab they were
 * typed in, which is where the step says to come back to.
 */
export function acrossTabs(roundId: string, ask: AcrossTabsAsk, now: number = Date.now()): AboutYou | null {
  try {
    if (typeof window === "undefined") return null;
    const shared = window.localStorage;
    const key = keptKey(roundId);
    if (ask === "forget") {
      linkEmailedFor.delete(roundId);
      shared.removeItem(key);
      return null;
    }
    if (ask === "read") {
      const raw = shared.getItem(key);
      const kept = readKept(raw, now, ACROSS_TABS_MAX_AGE_MS);
      if (raw !== null && !kept) shared.removeItem(key);
      return kept;
    }
    if (ask === "link-emailed") linkEmailedFor.add(roundId);
    if (!linkEmailedFor.has(roundId)) return null;
    // What crosses is what the tab holds, and only while it would be believed.
    const text = keptStore()?.getItem(key) ?? null;
    if (text !== null && readKept(text, now, ACROSS_TABS_MAX_AGE_MS)) shared.setItem(key, text);
    else shared.removeItem(key);
    return null;
  } catch {
    return null;
  }
}

/**
 * The answers kept for this form, or null: what this tab keeps, or failing
 * that what a page that asked for an emailed link left for the link's tab.
 */
export function loadKept(roundId: string): AboutYou | null {
  // Asked every time, because reading is also what throws away a copy past its hour.
  const left = acrossTabs(roundId, "read");
  try {
    return readKept(keptStore()?.getItem(keptKey(roundId)), Date.now()) ?? left;
  } catch {
    return left;
  }
}

/** Keep these answers in the tab, or keep nothing when there are none. */
export function keepAnswers(roundId: string, about: AboutYou): void {
  try {
    const store = keptStore();
    if (store) {
      if (hasJoinAnswers(about)) store.setItem(keptKey(roundId), packKept(about, Date.now()));
      else store.removeItem(keptKey(roundId));
    }
  } catch {
    // Storage is full or refused: nothing is kept, and nothing else changes.
  }
  acrossTabs(roundId, "answers-changed");
}

/**
 * Throw away what was kept, in the tab and across tabs: the join request has
 * been sent, or was never needed.
 */
export function forgetAnswers(roundId: string): void {
  try {
    keptStore()?.removeItem(keptKey(roundId));
  } catch {
    // Nothing to forget.
  }
  acrossTabs(roundId, "forget");
}
