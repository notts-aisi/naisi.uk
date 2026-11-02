/**
 * THE OUTSIDE SERVICES THE SITE USES, drawn on /privacy/services. The privacy
 * policy (from version 15) says we use the services listed there, each with
 * what it receives, and that adding a service updates that page and is told
 * to people before the service receives anything about them. So this list is
 * the policy's own words, kept outside a version file on purpose: adding a
 * service is an edit here, the date below and a notice, not a new version.
 *
 * Each service's sentences are the ones privacy version 14 said of it, made
 * shorter: no promise here about retention or training that version 14 did
 * not make. Google's hosting line is the one whose `receives` is new words,
 * because version 14 said only what it hosts, and a host holds what it hosts;
 * the request logs are the ones the policy's own Logs line names.
 *
 * Pure data: safe anywhere. `tests/privacy-policy.test.mjs` holds the list to
 * the code that calls each service.
 */

export type OutsideService = {
  /** A stable key, also the list item's id on the page. */
  id: string;
  /** Who the service is, as the policy names it. */
  name: string;
  /** What it does for us. "AI-assisted review" in it links to that part of the policy. */
  does: string;
  /** What it receives or sees, and anything that limits it. */
  receives: string;
  /** Its own privacy policy or terms, where one applies to what it does for us. */
  policy: { href: string; label: string } | null;
};

/** The day this list last changed. Moves with every service added, changed or removed. */
export const SERVICES_LAST_UPDATED = "31 October 2026";

/** The words in a service's `does` that link to the policy's AI-assisted review, and where. */
export const AI_REVIEW_LINK = { words: "AI-assisted review", href: "/privacy#ai-review" } as const;

export const OUTSIDE_SERVICES: readonly OutsideService[] = [
  {
    id: "google-cloud",
    name: "Google (Firebase and Google Cloud)",
    does: "Hosts the site, the database, file uploads and sign-in.",
    receives:
      "Everything the site holds, which it stores for us, and the request logs of each visit (IP address, browser and time).",
    policy: { href: "https://firebase.google.com/support/privacy", label: "firebase.google.com/support/privacy" },
  },
  {
    id: "resend",
    name: "Resend",
    does: "Sends our email.",
    receives:
      "It processes your email address, your name if we have it, and the message, for delivery, bounces and abuse reports.",
    policy: { href: "https://resend.com/legal/privacy-policy", label: "resend.com/legal/privacy-policy" },
  },
  {
    id: "recaptcha",
    name: "Google reCAPTCHA",
    does:
      "Checks that the person filling in our registration, event sign-up and application forms is not a bot. On the application form it runs only while somebody who is not signed in is making an account.",
    receives:
      "While it runs, Google receives information about your browser and how you used the page, and sets its own cookie. We see only its pass or fail.",
    policy: { href: "https://policies.google.com/privacy", label: "policies.google.com/privacy" },
  },
  {
    id: "youtube",
    name: "YouTube (Google)",
    does: "Hosts the thumbnail in an email of ours that embeds a video.",
    receives:
      "If your mail client loads remote images, it fetches the thumbnail from YouTube, which tells Google the email was opened and roughly where. Blocking remote images stops it.",
    policy: { href: "https://policies.google.com/privacy", label: "policies.google.com/privacy" },
  },
  {
    id: "anthropic",
    name: "Anthropic",
    does: "Provides Claude (see AI-assisted review).",
    receives:
      "It receives what is sent for each request, with no name or email address in it, and does not use it to train its models.",
    policy: { href: "https://www.anthropic.com/legal/commercial-terms", label: "anthropic.com/legal/commercial-terms" },
  },
  {
    id: "pangram",
    name: "Pangram Labs",
    does: "Provides Pangram (see AI-assisted review).",
    receives: "It receives the words of the answers it checks and nothing else.",
    policy: { href: "https://www.pangram.com/privacy-policy", label: "pangram.com/privacy-policy" },
  },
  {
    id: "push",
    name: "Your browser's push service (Google, Apple or Mozilla, for example)",
    does: "Delivers notifications to a device where you turned them on.",
    receives: "The notifications, encrypted to that device before they leave us.",
    policy: null,
  },
];
