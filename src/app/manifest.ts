import type { MetadataRoute } from "next";
import { PAGE_FLOOR } from "@/theme/brandColors";

/*
 * Web app manifest, served at /manifest.webmanifest.
 *
 * This is what makes the site installable to the home screen on iOS and
 * Android. It is progressive enhancement and nothing more: a browser that
 * ignores this file sees the site exactly as before, and no service worker is
 * required for either platform to install us (Chrome dropped the fetch-handler
 * requirement in 108 on mobile and 112 on desktop, and iOS 26 installs any
 * site with no requirements at all).
 *
 * Next discovers this file statically and injects <link rel="manifest"> into
 * every page, so the root layout deliberately does NOT set metadata.manifest.
 * mergeStaticMetadata runs after a layout's own metadata and would overwrite
 * an explicit value anyway.
 *
 * The route is a Route Handler, cached by default. Nothing here touches a
 * request-time API, so it prerenders. src/proxy.ts's matcher does not cover
 * /manifest.webmanifest, and browsers fetch manifests uncredentialed, so there
 * is no auth interaction to worry about.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Nottingham AI Safety Initiative",
    // Home-screen labels truncate hard, around 12 characters on iOS.
    short_name: "NAISI",
    description:
      "The AI safety student community at the University of Nottingham.",

    /*
     * Must be "/", not "/dashboard". A signed-out installer opening
     * /dashboard is bounced through proxy.ts to /login, which is a poor first
     * launch. "/" is a public page, so it opens for anybody. Returning a
     * signed-in member to where they were is a separate concern and does not
     * belong in start_url.
     */
    start_url: "/",
    /*
     * The whole origin. Has to cover /login and the (app) tree. Scope is
     * same-origin only and can never include accounts.google.com, so it has no
     * bearing on the Google sign-in flow.
     */
    scope: "/",

    /*
     * No display_override. The only member worth having would be
     * window-controls-overlay, which needs a titlebar drag region designed
     * into AppShell, and the spec's standalone to minimal-ui to browser
     * fallback chain already covers everything else.
     */
    display: "standalone",

    /*
     * Explicitly unlocked rather than omitted, so the intent is on the record.
     * /committee/tasks is a horizontally scrolling kanban that is better in
     * landscape, and locking orientation is hostile to anyone using a rotated
     * or mounted device.
     */
    orientation: "any",

    lang: "en",
    dir: "ltr",
    categories: ["education"],

    /*
     * One value for both. background_color fills the Android splash screen and
     * theme_color tints the standalone status bar, so matching them means the
     * two form a single flat field with no seam. See brandColors.ts for why
     * #050810 and not --color-bg or the authed top strip's composite.
     */
    background_color: PAGE_FLOOR,
    theme_color: PAGE_FLOOR,

    /*
     * Chrome's richer install sheet (the one that reads like an app listing
     * rather than a bare Add-to-Home-Screen row) is driven by screenshots.
     * Captured from the live site by Playwright; retake them when a surface
     * they show is redesigned, and only ever from PUBLIC pages, since these
     * ship in a world-readable manifest. Narrow drives the phone dialog,
     * wide the desktop one; each form factor's entries must share one size.
     */
    screenshots: [
      {
        src: "/icons/screenshot-narrow-home.png",
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: "Make AI go well. From Nottingham.",
      },
      {
        src: "/icons/screenshot-narrow-resources.png",
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: "Curated AI safety resources",
      },
      {
        src: "/icons/screenshot-wide-home.png",
        sizes: "1280x800",
        type: "image/png",
        form_factor: "wide",
        label: "The Nottingham AI Safety Initiative",
      },
    ],

    /*
     * The home-screen icon: the whole emblem on its own dark ground, made by
     * `npm run brand` from brand-source/3-app-icon/. Not the tab icon, which
     * is a different picture on purpose (src/app/favicon.ico and icon.svg).
     *
     * Each file is listed twice, once per purpose. The artwork keeps the
     * emblem inside the centre circle Android guarantees to show when it crops
     * an icon, so one file serves as both a plain and a maskable icon, and
     * Icon.purpose is a single-value union in Next's types, so the combined
     * "any maskable" string is a type error here. Two entries with one src
     * say the same thing.
     */
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],

    /*
     * Android's long-press menu, and macOS Safari 17.4+. iOS ignores these.
     * Labels match the signed-in menu (APP_NAV in src/layout/appNav.ts) verbatim so the menu and the app agree.
     * All three are role-gated, so a signed-out tap lands on /login?next=...,
     * which is a reasonable outcome rather than a broken one.
     */
    /*
     * Android: launching from the icon focuses the existing app window
     * instead of navigating it back to start_url, which preserves where the
     * member was with no code at all. Safari ignores this member entirely,
     * which is why RelaunchRestore.tsx exists for iOS.
     */
    launch_handler: { client_mode: "focus-existing" },

    shortcuts: [
      { name: "Home", url: "/dashboard" },
      { name: "My work", url: "/tasks" },
      { name: "My programmes", url: "/learn" },
    ],
  };
}
