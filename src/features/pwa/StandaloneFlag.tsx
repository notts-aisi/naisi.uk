/**
 * Stamps `data-standalone` and `data-standalone-ios` on <html> BEFORE first
 * paint, so CSS can react to being an installed app with no flash.
 *
 * Why an inline script rather than the useIsStandalone hook: the hook
 * deliberately returns false on the server and on the first client render, so
 * anything driven by it changes at hydration. For a colour or a hidden button
 * that is fine. For layout, on the very first screen of a freshly launched
 * app, it is a visible jump. This is the same pre-paint pattern theme
 * switchers use for exactly the same reason.
 *
 * Server-rendered output is byte-identical for every visitor. The attributes
 * only ever appear on a device where the site is genuinely installed, so a
 * browser tab is untouched, in full screen or out of it.
 *
 * WHAT COUNTS AS INSTALLED is the rule on `isStandaloneNow` in
 * src/lib/pwa/displayMode.ts, written a second time here because this runs
 * before any module does. The two are one rule: change them together.
 * tests/pwa-display-mode.test.mjs runs this script and that function over the
 * same windows and fails when they disagree.
 *
 * Kept deliberately tiny and wrapped in try/catch: it runs before anything
 * else and must never be the reason a page fails to render.
 */

// Minified by hand because it ships inline on every page. Expanded:
//   const key = 'naisi.pwa.installed';   // INSTALLED_WINDOW_KEY
//   // The browser says so outright.
//   let installed = matchMedia('(display-mode: standalone)').matches
//     || navigator.standalone === true;
//   try {
//     const store = window.sessionStorage;
//     if (installed) {
//       store.setItem(key, '1');
//     } else if (matchMedia('(display-mode: fullscreen)').matches) {
//       // Full screen does not change what a window is: it is installed
//       // when it was the last time it was seen out of full screen.
//       installed = store.getItem(key) === '1';
//     } else {
//       store.removeItem(key);
//     }
//   } catch {
//     // Storage is refused: nothing is remembered, and `installed` stands.
//   }
//   if (installed) {
//     root.dataset.standalone = 'true';
//     // iPadOS 13+ reports a Mac UA, so maxTouchPoints disambiguates.
//     if (/iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) {
//       root.dataset.standaloneIos = 'true';
//     }
//     // Ask the browser not to evict our storage under pressure. Fire and
//     // forget: the Firebase Auth session lives in IndexedDB, and losing it
//     // is what strands an installed app on a signed-out screen (the
//     // SessionSanityGuard repairs that state, but not needing the repair
//     // is better). Installed apps are the one context where persistence is
//     // usually granted without a prompt.
//     navigator.storage?.persist?.();
//   }
const SCRIPT = `try{var m=window.matchMedia,n=navigator,u=n.userAgent,k='naisi.pwa.installed',a=m('(display-mode: standalone)').matches||n.standalone===true,s;try{s=window.sessionStorage;if(a){s.setItem(k,'1')}else if(m('(display-mode: fullscreen)').matches){a=s.getItem(k)==='1'}else{s.removeItem(k)}}catch(e){}if(a){var d=document.documentElement;d.dataset.standalone='true';if(/iPad|iPhone|iPod/.test(u)||(u.indexOf('Macintosh')>-1&&n.maxTouchPoints>1)){d.dataset.standaloneIos='true'}if(n.storage&&n.storage.persist){n.storage.persist()}}}catch(e){}`;

export function StandaloneFlag() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
