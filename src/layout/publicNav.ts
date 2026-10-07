/**
 * What the public header and footer say and where each entry leads, in one
 * place. `PublicHeader` and `PublicFooter` render these lists and hold no
 * entry of their own.
 *
 * THE RULE A MAINTAINER KEEPS: every entry carries `live`, and an entry is
 * rendered only while it is `true`. An entry whose page does not exist yet is
 * written here with `live: false`, so a menu never leads to a page that is
 * not there. Switching one on is a one-word edit, made in the pull request
 * that adds the page.
 *
 * News, Members and Resources are deliberately in neither menu. Their pages
 * stay where they are and are reached by address.
 */
import { CONTACT_EMAIL, LINKS_PAGE_PATH, SU_PAGE_URL, socialHref } from "@/content/socials";
import { formPageReturn, signInHrefWithReturn } from "@/lib/authReturn";

export type NavEntry = {
  /** A stable name: the React key, and how a caller finds one entry. */
  key: string;
  label: string;
  /** A path on this site. A full address when `external` is set. */
  href: string;
  /** Rendered only while true. */
  live: boolean;
  /**
   * Where the entry leads while `live` is false. An entry with one is always
   * rendered and only its address changes; an entry without one is left out
   * until its page exists.
   */
  meanwhile?: string;
  /** Somewhere off this site. It opens in a new tab. */
  external?: boolean;
};

/** An entry as it is rendered today: the label and the address it leads to. */
export type ShownEntry = {
  key: string;
  label: string;
  href: string;
  external: boolean;
};

/** The address an entry leads to today, or null when it is not rendered. */
export function addressOf(entry: NavEntry): string | null {
  if (entry.live) return entry.href;
  return entry.meanwhile ?? null;
}

/** The entries to render, in order, each with the address it leads to today. */
export function shown(entries: readonly NavEntry[]): ShownEntry[] {
  const out: ShownEntry[] = [];
  for (const entry of entries) {
    const href = addressOf(entry);
    if (href === null) continue;
    out.push({ key: entry.key, label: entry.label, href, external: entry.external === true });
  }
  return out;
}

/**
 * True when `pathname` is the entry's page or a page beneath it, so a
 * programme's own page marks Fellowships and one event's page marks Events.
 */
export function isCurrentPage(pathname: string, href: string): boolean {
  const path = href.split(/[?#]/)[0];
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

/* -------------------------------------------------------------------------
 * The header
 * ---------------------------------------------------------------------- */

/** The pages in the bar, left to right. The phone menu lists the same ones. */
export const HEADER_PAGES: readonly NavEntry[] = [
  { key: "fellowships", label: "Fellowships", href: "/courses", live: true },
  { key: "incubator", label: "Incubator", href: "/incubator", live: true },
  { key: "events", label: "Events", href: "/events", live: true },
  { key: "about", label: "About", href: "/about", live: true },
];

/**
 * What sits after the hairline. A signed-out visitor gets `signIn` and
 * `join`, as `signedOutEntriesOn` gives them for the page they are on.
 * Somebody signed in gets the entry for where their account stands in place
 * of `join`, and a Sign out button in place of `signIn`.
 *
 * `join` leads to the sign-up page until the Join page exists, and to the
 * Join page from the moment its `live` is switched on.
 */
export const ACCOUNT_ENTRIES = {
  signIn: { key: "sign-in", label: "Sign in", href: "/login", live: true },
  join: { key: "join", label: "Join", href: "/join", live: true, meanwhile: "/register" },
  /** An approved account: into the signed-in area. */
  dashboard: { key: "dashboard", label: "Dashboard", href: "/dashboard", live: true },
  /** An account the committee has not approved yet: its waiting page. */
  waiting: { key: "waiting", label: "Application status", href: "/pending-approval", live: true },
} as const satisfies Record<string, NavEntry>;

/**
 * The two signed-out entries as they are drawn on the page at `pathname`.
 *
 * ON A PAGE THAT IS A FORM (an application form, an older round, a course's
 * apply page: `formPageReturn`) the bar must not lose the form:
 *
 *  - `signIn` leads to the sign-in page WITH that page as the place to come
 *    back to. Whoever signs in there is brought back, and an account with no
 *    join request is brought back to an application form's own first step by
 *    the sign-in page's rule, never left on the register page.
 *  - `join` is not drawn. The form is how somebody joins from here: its
 *    first step is the join request. The Join page leads on to the register
 *    page's own profile form, away from what they have typed.
 *
 * Everywhere else both are the entries above, as they stand.
 */
export function signedOutEntriesOn(pathname: string | null | undefined): {
  signIn: NavEntry;
  join: NavEntry | null;
} {
  const formPage = formPageReturn(pathname);
  if (formPage === null) return { signIn: ACCOUNT_ENTRIES.signIn, join: ACCOUNT_ENTRIES.join };
  return { signIn: { ...ACCOUNT_ENTRIES.signIn, href: signInHrefWithReturn(formPage) }, join: null };
}

/** Shown, with no link, to an account that was not approved. */
export const NOT_APPROVED_LABEL = "Application not approved";
export const NOT_APPROVED_HINT =
  "Your application wasn't approved. Sign out to try a different account.";

/* -------------------------------------------------------------------------
 * The footer
 * ---------------------------------------------------------------------- */

export type NavColumn = {
  heading: string;
  entries: readonly NavEntry[];
};

/** The footer's three columns, left to right. */
export const FOOTER_COLUMNS: readonly NavColumn[] = [
  {
    heading: "Programmes",
    entries: [
      { key: "fellowships", label: "Fellowships", href: "/courses", live: true },
      { key: "incubator", label: "Research incubator", href: "/incubator", live: true },
      // Leads to the part of the fellowships page that says how to lead a
      // group. tests/public-nav-pages.test.mjs holds the id to that page.
      { key: "facilitate", label: "Facilitate a group", href: "/courses#lead-a-group", live: true },
      // The form's own address carries the term's id, so there is no fixed
      // address to give yet. Switch on only once something answers at this
      // one, or render the term's own Apply link in its place.
      { key: "apply", label: "Apply", href: "/apply", live: false },
    ],
  },
  {
    heading: "NAISI",
    entries: [
      { key: "events", label: "Events", href: "/events", live: true },
      { key: "about", label: "About us", href: "/about", live: true },
      { key: "sources", label: "Sources for our claims", href: "/sources", live: true },
      { key: "links", label: "All our links", href: LINKS_PAGE_PATH, live: true },
    ],
  },
  {
    heading: "Elsewhere",
    entries: [
      {
        key: "instagram",
        label: "Instagram @notts.ai.safety",
        href: socialHref("Instagram"),
        live: true,
        external: true,
      },
      { key: "newsletter", label: "Newsletter", href: socialHref("Substack"), live: true, external: true },
      { key: "su", label: "Students’ Union page", href: SU_PAGE_URL, live: true, external: true },
      { key: "email", label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}`, live: true },
    ],
  },
];

/** The row under the footer's hairline. */
export const LEGAL_ENTRIES: readonly NavEntry[] = [
  { key: "privacy", label: "Privacy", href: "/privacy", live: true },
  { key: "terms", label: "Terms", href: "/terms", live: true },
  { key: "status", label: "Status", href: "/status", live: true },
];
