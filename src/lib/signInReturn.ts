/**
 * WHERE A SIGN-IN COMES BACK TO, and how that survives a trip to Google.
 *
 * The sign-in page is opened with a return address, `?next=`: the page
 * somebody was on their way to. In a browser window Google signs people in
 * through a pop-up, the page never unloads, and the address is simply still
 * there. In the installed app a pop-up cannot open, so the whole window goes
 * to Google, and Google hands the person back with a form POST from its own
 * site to `/api/auth/google/callback`, which sends them on to the sign-in
 * page. Nothing of the page that left survives that trip except what was
 * carried on purpose. So the return address is carried THREE ways, and the
 * first to arrive is used:
 *
 *  1. IN `state`. Google's button is handed the address, and Google posts it
 *     back beside the credential: its reference lists `state` among the
 *     parameters of that POST. It rides the trip itself, so it is the one
 *     the callback route believes first.
 *  2. IN A COOKIE the callback route can read, `__auth_next`. The POST comes
 *     from another site, and a browser sends a cookie on a cross-site POST
 *     only when the cookie says `SameSite=None; Secure`. Google's script
 *     writes its own `g_csrf_token` cookie that way for the same trip, and
 *     this one is written that way wherever the page is served over https.
 *  3. IN THE TAB, in session storage. The sign-in page reads it when the
 *     callback route sent the person back with no address at all.
 *
 * ## One guard for every copy
 *
 * `safeReturnPath` decides whether a string is a path on this site, and
 * every copy passes it on the way in and again on the way out: the address
 * the page was opened with, what Google posts back as `state`, the cookie,
 * the tab's copy, and the address a document load is finally asked for
 * (`hardNavigate`). Nothing that reads a return address tests it any other
 * way.
 *
 * ## What this does NOT decide
 *
 * Where an account with no join request goes. That is `newAccountReturn`
 * (`src/lib/applications/applicant/join.ts`), asked by the sign-in page with
 * whatever address this module restored. And which addresses survive
 * REGISTRATION is the narrower list in `src/lib/authReturn.ts`.
 *
 * No import here runs only on a server or only in a browser: the callback
 * route, the sign-in page, the Google button and the tests read one module.
 */

/** The cookie the callback route reads. The privacy page lists it by this name. */
export const RETURN_COOKIE = "__auth_next";

/** The key the tab keeps its own copy under. */
export const RETURN_TAB_KEY = "naisi.auth.next";

/** How long a carried address is believed, in seconds. The cookie's life, and the tab's copy keeps to it. */
export const RETURN_MAX_AGE_SECONDS = 600;

/** The longest address that is carried or followed. Far longer than any path this site makes. */
export const RETURN_MAX_LENGTH = 1024;

/** What the callback route puts on the sign-in page's address when Google has handed somebody back. */
export const CAME_BACK_FROM_GOOGLE = "google-redirect";

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

/**
 * `raw` when it is a path on this site, otherwise null.
 *
 * A path on this site starts with ONE slash. Three things a browser reads as
 * the start of another site's address are refused, and the test of this
 * function asks a URL parser the same question of every string it accepts:
 *
 *  - a second slash (`//host`);
 *  - a backslash, which a browser reads as a slash (`/\host`), refused
 *    wherever it stands;
 *  - a tab, a line break or any other control character, which a browser
 *    drops before it reads the address, so that `/<tab>/host` is `//host`.
 *
 * No path this site makes holds a backslash or a control character, so
 * nothing real is lost by refusing them.
 */
export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > RETURN_MAX_LENGTH) return null;
  if (raw[0] !== "/" || raw[1] === "/") return null;
  // By code point, so this file carries no control character of its own.
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f || ch === "\\") return null;
  }
  return raw;
}

// ---------------------------------------------------------------------------
// The cookie
// ---------------------------------------------------------------------------

/**
 * What to hand `document.cookie` so the callback route can read `path` when
 * Google hands the person back.
 *
 * OVER HTTPS the cookie says `SameSite=None; Secure`, because the request it
 * has to ride is a POST from Google's site, and a `Lax` cookie is not sent
 * on one. The cookie holds a path on this site and nothing else, and the
 * route passes it through the guard before it believes it.
 *
 * OVER PLAIN HTTP, which is a laptop's own dev server and nothing else,
 * `SameSite=None` is not available: a browser refuses it without `Secure`,
 * and `Secure` is refused over http outside a few browsers' exceptions for
 * the loopback address. So the cookie stays `Lax` there, as it always was,
 * and the trip is covered by `state` and the tab's copy.
 */
export function returnCookieText(path: string, overHttps: boolean): string {
  const sameSite = overHttps ? "samesite=none; secure" : "samesite=lax";
  return `${RETURN_COOKIE}=${encodeURIComponent(path)}; path=/; max-age=${RETURN_MAX_AGE_SECONDS}; ${sameSite}`;
}

// ---------------------------------------------------------------------------
// The tab's copy
// ---------------------------------------------------------------------------

const TAB_VERSION = 1;

/** The text the tab keeps for `path`: the address, and when it was kept. */
export function packTabReturn(path: string, now: number): string {
  return JSON.stringify({ v: TAB_VERSION, at: now, next: path });
}

/**
 * The address a kept text holds, or null when there is nothing to believe:
 * no text, text that is not ours, another version, kept longer ago than the
 * cookie lives, kept in the future, or not a path on this site.
 */
export function readTabReturn(raw: string | null | undefined, now: number): string | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const { v, at, next } = parsed as { v?: unknown; at?: unknown; next?: unknown };
  if (v !== TAB_VERSION) return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  if (at > now || now - at > RETURN_MAX_AGE_SECONDS * 1000) return null;
  return safeReturnPath(next);
}

// ---------------------------------------------------------------------------
// What each end of the trip does
// ---------------------------------------------------------------------------

/**
 * Leave `path` where a trip to Google can find it again: the cookie and the
 * tab. Called by the sign-in page when it opens with a return address.
 *
 * Nothing is carried that the guard refuses, and nothing here throws: a
 * browser that refuses cookies or storage carries one copy fewer.
 */
export function carryReturn(path: string): void {
  const safe = safeReturnPath(path);
  if (!safe || typeof window === "undefined") return;
  try {
    document.cookie = returnCookieText(safe, window.location.protocol === "https:");
  } catch {
    // Cookies are refused: the other copies are still made.
  }
  try {
    window.sessionStorage.setItem(RETURN_TAB_KEY, packTabReturn(safe, Date.now()));
  } catch {
    // Storage is refused or full: the other copies are still made.
  }
}

/** The tab's own copy, or null. Reads, and changes nothing. */
export function tabReturn(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return readTabReturn(window.sessionStorage.getItem(RETURN_TAB_KEY), Date.now());
  } catch {
    return null;
  }
}

/**
 * What the callback route restores to the sign-in page's address: the first
 * of the copies it was handed that passes the guard. `state` first, because
 * it made this very trip; the cookie may be an earlier visit's.
 */
export function returnFromTrip(handed: { state: unknown; cookie: unknown }): string | null {
  return safeReturnPath(handed.state) ?? safeReturnPath(handed.cookie);
}

/**
 * The return address a sign-in page has when it opens, or null for none.
 *
 *  - `next` on its own address, when the guard passes it.
 *  - Otherwise, ONLY when the address says the callback route sent the
 *    person here (it came back from Google, or the trip failed and they are
 *    about to try again), the tab's copy.
 *
 * A page somebody simply opened with no `next` has no return address,
 * whatever the tab is keeping from an earlier visit.
 *
 * `tabCopy` is asked only when it is needed, so the caller can hand over a
 * function that reads the browser (`tabReturn`) and still be drawn on a
 * server, where the answer is the address's own or nothing.
 */
export function returnOnArrival(
  address: { get(name: string): string | null },
  tabCopy: () => string | null,
): string | null {
  const own = safeReturnPath(address.get("next"));
  if (own) return own;
  const sentBack = address.get("from") === CAME_BACK_FROM_GOOGLE || Boolean(address.get("google_error"));
  return sentBack ? safeReturnPath(tabCopy()) : null;
}
