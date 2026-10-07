/**
 * The ways on that a public not-found or error screen offers.
 *
 * A module of its own, with no client marker, so a Server Component (the
 * not-found files) and a client one (an error boundary) can both read the
 * list as data.
 *
 * Every address is a page that exists. The second line of each says what
 * the page is and nothing that goes out of date: these screens are drawn for
 * any wrong address, so they read nothing from the database.
 */
export type WayOn = {
  label: string;
  /** One short line under the label. */
  sub: string;
  href: string;
};

export const PUBLIC_WAYS_ON: WayOn[] = [
  { label: "Home", sub: "Start from the top", href: "/" },
  { label: "Fellowships", sub: "6 weeks in a small group", href: "/courses" },
  { label: "Events", sub: "What’s on this term", href: "/events" },
  { label: "All our links", sub: "Every link we share", href: "/links" },
];
