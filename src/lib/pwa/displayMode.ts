/**
 * Is the site running as an installed app, and on what?
 *
 * The single source of truth for display-mode questions. The React binding
 * lives in src/hooks/useDisplayMode.ts, matching where useBodyScrollLock and
 * useInViewOnce already sit.
 *
 * All of these are safe to call during SSR: each returns the "browser tab"
 * answer when there is no window, which is the correct conservative default
 * (nothing should light up standalone-only behaviour on the server and then
 * have it disappear on hydration).
 *
 * The predicates read and change nothing, with one exception:
 * `isStandaloneNow` remembers its last answer for the window it is asked in,
 * which is how it answers for a window in full screen. See the rule on it.
 */

/**
 * Non-standard iOS-only flag. Safari sets navigator.standalone on home-screen
 * web apps and has done since long before display-mode was supported, and
 * older iOS still needs it, so both are checked.
 */
type IosNavigator = Navigator & { standalone?: boolean };

/**
 * Where a window is remembered as the installed app's: the window's own
 * session storage, which lasts exactly as long as the window does and is
 * shared with no other. The script in src/features/pwa/StandaloneFlag.tsx
 * reads and writes the same key, and tests/pwa-display-mode.test.mjs runs the
 * two side by side.
 */
export const INSTALLED_WINDOW_KEY = "naisi.pwa.installed";

/** True when this window was the installed app's the last time it was not in full screen. */
function wasInstalled(): boolean {
  try {
    return window.sessionStorage.getItem(INSTALLED_WINDOW_KEY) === "1";
  } catch {
    // Storage is refused: nothing is known about this window.
    return false;
  }
}

/** Keep, or drop, what `wasInstalled` reads. Written only when it changes. */
function remember(installed: boolean): void {
  try {
    const store = window.sessionStorage;
    const had = store.getItem(INSTALLED_WINDOW_KEY) === "1";
    if (installed && !had) store.setItem(INSTALLED_WINDOW_KEY, "1");
    if (!installed && had) store.removeItem(INSTALLED_WINDOW_KEY);
  } catch {
    // Storage is refused: nothing is remembered, and the answer still stands.
  }
}

/**
 * Running in an installed app window rather than a browser tab.
 *
 * THE RULE, in the order it is asked:
 *
 *  1. The browser says so outright: the `standalone` display mode, which is
 *     what the manifest asks for (src/app/manifest.ts), or the flag iOS sets
 *     on a home-screen web app. Installed.
 *  2. The window is in FULL SCREEN. That says nothing by itself: Chrome and
 *     the browsers built on it report the `fullscreen` display mode for
 *     every window put into full screen, an ordinary browser window as much
 *     as an installed app's. So full screen does not change what a window
 *     is: it is installed when it was installed the last time it was seen
 *     out of full screen, and a window first seen in full screen is a
 *     browser's.
 *  3. Anything else is a browser window.
 *
 * Two things a maintainer has to keep:
 *
 *  - NOTHING STARTS IN FULL SCREEN. That holds while the manifest's `display`
 *    is `standalone` and no app wraps the site (a wrapper may launch in
 *    `fullscreen`). Change either and step 2 has to change with it.
 *  - THE SAME RULE IS WRITTEN TWICE: here, and by hand in the script
 *    StandaloneFlag.tsx puts on every page, which has to run before any
 *    module does. Change them together.
 */
export function isStandaloneNow(): boolean {
  if (typeof window === "undefined") return false;
  if (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as IosNavigator).standalone === true
  ) {
    remember(true);
    return true;
  }
  if (window.matchMedia("(display-mode: fullscreen)").matches) return wasInstalled();
  remember(false);
  return false;
}

/**
 * Subscribe to standalone changes. Both queries change whenever a window
 * enters or leaves full screen, and under the rule above the answer usually
 * stays what it was. useSyncExternalStore needs a subscribe function, and a
 * matchMedia listener is cheaper than polling.
 */
export function subscribeDisplayMode(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const queries = [
    window.matchMedia("(display-mode: standalone)"),
    window.matchMedia("(display-mode: fullscreen)"),
  ];
  queries.forEach((q) => q.addEventListener("change", onChange));
  return () => queries.forEach((q) => q.removeEventListener("change", onChange));
}

/** iOS or iPadOS, including iPads that report as Macs with a touchscreen. */
export function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports a Mac UA. A Mac with a touchscreen does not exist, so
  // maxTouchPoints disambiguates.
  return ua.includes("Macintosh") && window.navigator.maxTouchPoints > 1;
}

export type InstallPlatform = "ios" | "android" | "desktop";

/**
 * Which set of install instructions applies. Only meaningful when NOT already
 * standalone; callers should check isStandaloneNow() first.
 *
 * iOS is the one that needs prose, because Safari has no install prompt event
 * and the only route in is Share, then Add to Home Screen.
 */
export function getInstallPlatform(): InstallPlatform {
  if (isIos()) return "ios";
  if (typeof window !== "undefined" && /Android/.test(window.navigator.userAgent)) {
    return "android";
  }
  return "desktop";
}
