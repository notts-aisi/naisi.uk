/**
 * The signed-in menu, as data.
 *
 * Three things read this file, and they have to agree:
 *
 *   - the shell (`AppShell.tsx`): the sidebar, the phone's Menu drawer, the
 *     phone's bottom bar and the title in its top bar;
 *   - the admin area's strip (`AdminTabs.tsx`), which shows the pages of the
 *     section somebody is in;
 *   - `tests/app-frame.test.mjs`, which holds every address here to a page
 *     file and every admin page file to a place in a section.
 *
 * Nothing in here decides who may see a page. A page's own layout and its
 * routes do that. This file only decides which links are drawn, and each
 * link's rule mirrors the gate of the page it leads to.
 *
 * To add an entry: one line in `APP_NAV` naming an address and a rule. To put
 * it in the phone's bottom bar as well: one more line in `BOTTOM_BAR`.
 */

// ---------------------------------------------------------------------------
// The menu
// ---------------------------------------------------------------------------

/**
 * Who is shown an entry. Each name is a predicate in `AppShell.tsx`.
 *
 * The predicates live there and not here because they read the raw
 * `permissions` keys off the live sign-in, and `tests/authority-at-use.test.mjs`
 * registers `AppShell.tsx` as the one place in the frame that may. A name used
 * here with no predicate there does not compile.
 */
export type NavRule =
  | "memberAndUp"
  | "committeeAndUp"
  | "suCommitteeAndUp"
  | "adminOnly"
  | "newsletter"
  | "events"
  | "admissions"
  | "courseAdmin"
  | "membershipAdmin";

export type AdminSectionId = "people" | "programmes" | "publicity" | "site";

export type NavEntry = {
  label: string;
  href: string;
  rule: NavRule;
  /**
   * The admin section this entry is the way into. The entry is then the
   * current one on every page of that section the person can open, not only
   * on its own address.
   */
  section?: AdminSectionId;
  /** The count drawn on the entry. Today there is one: people waiting to join. */
  count?: "joinRequests";
};

export type NavGroup = {
  /** Null for the first group, which has no heading. */
  label: string | null;
  entries: NavEntry[];
};

export const HOME_HREF = "/dashboard";

export const APP_NAV: NavGroup[] = [
  {
    label: null,
    entries: [
      { label: "Home", href: HOME_HREF, rule: "memberAndUp" },
      { label: "My programmes", href: "/learn", rule: "memberAndUp" },
      { label: "My work", href: "/tasks", rule: "memberAndUp" },
      { label: "Profile", href: "/profile", rule: "memberAndUp" },
    ],
  },
  {
    label: "Run NAISI",
    entries: [
      // Admins, and anybody named on a term's form or an older round.
      { label: "Programmes", href: "/admin/admissions/forms", rule: "admissions", section: "programmes" },
      // Somebody who is not an admin and holds a course grant reaches the
      // course pages and nothing else in the admin area, so they get their own
      // way in. An admin finds the same pages inside Programmes. It is this
      // person's way into the section too: a course approver also authors
      // rounds, and reaches them from the strip on the course pages.
      { label: "Courses", href: "/admin/courses", rule: "courseAdmin", section: "programmes" },
      { label: "People", href: "/admin/members", rule: "adminOnly", section: "people", count: "joinRequests" },
      // The same word for somebody who is not an admin and looks after SU
      // membership: the one page of People they can open. Nobody is shown both.
      { label: "People", href: "/admin/membership", rule: "membershipAdmin", section: "people" },
      { label: "Manage events", href: "/events/manage", rule: "events" },
      { label: "Newsletter", href: "/newsletter", rule: "newsletter" },
      { label: "Publicity", href: "/admin/links", rule: "adminOnly", section: "publicity" },
      { label: "Committee tasks", href: "/committee/tasks", rule: "suCommitteeAndUp" },
      // Every committee member drafts worksheets: SU recognition gates the
      // task board, not this.
      { label: "Worksheets", href: "/worksheets", rule: "committeeAndUp" },
    ],
  },
  {
    label: "Site",
    entries: [{ label: "Settings", href: "/admin/site-status", rule: "adminOnly", section: "site" }],
  },
];

// ---------------------------------------------------------------------------
// The phone's bottom bar
// ---------------------------------------------------------------------------

/**
 * The words in the phone's bottom bar, left to right. Each is a short name for
 * a menu entry, found by its address, so the bar can never offer a page the
 * person's menu does not. The shell adds Menu after them, which opens the
 * whole menu, so nothing the bar leaves out is out of reach.
 */
export const BOTTOM_BAR: { label: string; href: string }[] = [
  { label: "Home", href: HOME_HREF },
  { label: "Programme", href: "/learn" },
  { label: "Profile", href: "/profile" },
];

export const BOTTOM_BAR_MENU_LABEL = "Menu";

// ---------------------------------------------------------------------------
// The admin area
// ---------------------------------------------------------------------------

/**
 * What the caller may reach in the admin area, resolved once by its server
 * layout.
 *
 * Five capabilities rather than one `isAdmin` boolean, because the admin area
 * has four audiences behind four gates: full admins, course permission
 * holders (`/admin/courses`), round authors or appointed reviewers
 * (`/admin/admissions`), and whoever looks after SU membership
 * (`/admin/membership`). A link a caller cannot open is a link that redirects
 * to the dashboard, so the strip has to know the same predicates the page
 * gates do.
 */
export type AdminTabAccess = {
  isAdmin: boolean;
  /** `draftCourse` or `approveCourse`: the course authoring tree. */
  canAuthorCourses: boolean;
  /** `approveCourse`: authoring an admission round. */
  canAuthorRounds: boolean;
  /** Appointed on some round. Reads its own round, writes nothing. */
  isAdmissionsReviewer: boolean;
  /** `manageMembership`: periods, tier grants and the membership console. */
  canManageMembership: boolean;
};

export type AdminPage = {
  label: string;
  href: string;
  /** Whether an address is this page or one beneath it. */
  match: (pathname: string) => boolean;
  /** Who may open it. Mirrors the page's own gate, never a looser rule. */
  visible: (access: AdminTabAccess) => boolean;
  /** The count drawn beside the label. The strip owns the numbers. */
  count?: "joinRequests" | "collaborators" | "courseApplications";
  /**
   * This page, and every page under its address, draws its own head: its own
   * name as the page's one <h1>, with the section's name as a small crumb
   * above it. The shared head (`AdminTabs`) then draws the strip and no
   * heading at all.
   *
   * Left off, the shared head draws that same shape itself, from this entry:
   * the section as the crumb and `label` as the <h1>. So every admin page
   * reads the same way whoever draws its head.
   *
   * It is a statement about EVERY page file under the address, and
   * `tests/app-frame.test.mjs` walks them both ways: a flagged page that
   * draws no head would have no <h1>, and an unflagged one that draws a head
   * would have two.
   */
  ownHead?: boolean;
};

export type AdminSection = {
  id: AdminSectionId;
  label: string;
  pages: AdminPage[];
};

const ADMIN_ONLY = (a: AdminTabAccess) => a.isAdmin;
const ADMISSIONS = (a: AdminTabAccess) => a.isAdmin || a.canAuthorRounds || a.isAdmissionsReviewer;

/** This address or one beneath it. Never a bare prefix: see Accounts below. */
const under = (href: string) => (p: string) => p === href || p.startsWith(`${href}/`);
/** The same, leaving out one address beneath it that is a page of its own. */
const underBut = (href: string, not: string) => (p: string) => under(href)(p) && !under(not)(p);

/**
 * The admin area's pages, grouped as the sidebar reaches them.
 *
 * No address here is new and none has moved: this is the old flat strip
 * sorted into four sections, with two pages that used to be reached from
 * inside another page given a place of their own (the application forms, and
 * what the public /links page says).
 *
 * Every admin address belongs to exactly ONE page here. Where one page's
 * address sits beneath another's (the application forms beneath the older
 * rounds, the /links page beneath the short links), the outer page's matcher
 * leaves the inner one out, so the order of a section is only the order its
 * pages are drawn in.
 *
 * Every page file under `src/app/(app)/admin/` has to be matched by a page
 * here, and `tests/app-frame.test.mjs` fails one that is not: a page left out
 * of every section could only be reached by typing its address.
 */
export const ADMIN_SECTIONS: AdminSection[] = [
  {
    id: "people",
    label: "People",
    pages: [
      // This address or one beneath it, never a plain prefix:
      // "/admin/membership" starts with "/admin/members", so a prefix test
      // would light Accounts up on the membership console.
      { label: "Accounts", href: "/admin/members", match: under("/admin/members"), visible: ADMIN_ONLY, ownHead: true },
      { label: "Join requests", href: "/admin", match: (p) => p === "/admin", visible: ADMIN_ONLY, count: "joinRequests", ownHead: true },
      { label: "Collaborators", href: "/admin/collaborators", match: under("/admin/collaborators"), visible: ADMIN_ONLY, count: "collaborators", ownHead: true },
      { label: "SU membership", href: "/admin/membership", match: under("/admin/membership"), visible: (a) => a.isAdmin || a.canManageMembership, ownHead: true },
      { label: "Mailing list", href: "/admin/subscriptions", match: under("/admin/subscriptions"), visible: ADMIN_ONLY, ownHead: true },
    ],
  },
  {
    id: "programmes",
    label: "Programmes",
    pages: [
      { label: "Application forms", href: "/admin/admissions/forms", match: under("/admin/admissions/forms"), visible: ADMISSIONS, ownHead: true },
      { label: "Older rounds", href: "/admin/admissions", match: underBut("/admin/admissions", "/admin/admissions/forms"), visible: ADMISSIONS },
      { label: "Courses", href: "/admin/courses", match: under("/admin/courses"), visible: (a) => a.isAdmin || a.canAuthorCourses, count: "courseApplications" },
    ],
  },
  {
    id: "publicity",
    label: "Publicity",
    pages: [
      { label: "Short links", href: "/admin/links", match: underBut("/admin/links", "/admin/links/page-content"), visible: ADMIN_ONLY },
      { label: "The /links page", href: "/admin/links/page-content", match: under("/admin/links/page-content"), visible: ADMIN_ONLY },
      { label: "Source sheets", href: "/admin/sources", match: under("/admin/sources"), visible: ADMIN_ONLY },
    ],
  },
  {
    id: "site",
    label: "Site settings",
    pages: [
      { label: "Site notice and scheduled jobs", href: "/admin/site-status", match: under("/admin/site-status"), visible: ADMIN_ONLY },
      { label: "Email delivery", href: "/admin/deliverability", match: under("/admin/deliverability"), visible: ADMIN_ONLY },
      { label: "Sign-up problems", href: "/admin/registrations", match: under("/admin/registrations"), visible: ADMIN_ONLY },
      { label: "Sign-up emails", href: "/admin/email-designs", match: under("/admin/email-designs"), visible: ADMIN_ONLY },
      { label: "Projects", href: "/admin/projects", match: under("/admin/projects"), visible: ADMIN_ONLY },
      { label: "Task templates", href: "/admin/task-templates", match: under("/admin/task-templates"), visible: ADMIN_ONLY },
      { label: "Newsletter recipients", href: "/admin/newsletter", match: under("/admin/newsletter"), visible: ADMIN_ONLY },
      // TEMP: fire-once data-wipe controls. Remove this entry along with
      // `src/app/(app)/admin/(admin-only)/danger-zone/` and
      // `src/app/api/admin/nuke-tasks/` once both environments have been reset.
      { label: "Danger zone", href: "/admin/danger-zone", match: under("/admin/danger-zone"), visible: ADMIN_ONLY },
    ],
  },
];

/** The section an address belongs to, or null outside the admin area. */
export function adminSectionFor(pathname: string): AdminSection | null {
  return ADMIN_SECTIONS.find((s) => s.pages.some((p) => p.match(pathname))) ?? null;
}

/** The page of a section an address belongs to. */
export function adminPageFor(section: AdminSection, pathname: string): AdminPage | null {
  return section.pages.find((p) => p.match(pathname)) ?? null;
}

// ---------------------------------------------------------------------------
// Where somebody is
// ---------------------------------------------------------------------------

/** This address or one beneath it. */
export function isAtOrUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The entry to mark as the current page, out of the entries one person is
 * shown.
 *
 * An entry whose own address holds the page wins, the longest address first,
 * so "Courses" beats "Programmes" on a course page for somebody shown both.
 * Failing that, the first entry that is a way into the page's admin section,
 * so "People" is lit on Join requests (`/admin`) and "Settings" on Email
 * delivery. Null when nothing the person is shown leads here.
 */
export function currentEntry(entries: NavEntry[], pathname: string): NavEntry | null {
  let best: NavEntry | null = null;
  for (const entry of entries) {
    if (!isAtOrUnder(pathname, entry.href)) continue;
    if (!best || entry.href.length > best.href.length) best = entry;
  }
  if (best) return best;
  const section = adminSectionFor(pathname);
  if (!section) return null;
  return entries.find((entry) => entry.section === section.id) ?? null;
}

/**
 * The words in the middle of the phone's top bar: the current entry's name.
 * Home has none, because the brand beside it already says where you are.
 */
export function barTitleFor(entry: NavEntry | null): string | null {
  if (!entry || entry.href === HOME_HREF) return null;
  return entry.label;
}

/** The role under somebody's name at the foot of the menu, in words. */
export function roleInWords(role: string | null, suRecognised: boolean): string | null {
  if (role === "admin") return "Admin";
  if (role === "committee") return suRecognised ? "SU-recognised committee" : "Committee";
  if (role === "member") return "Member";
  return null;
}
