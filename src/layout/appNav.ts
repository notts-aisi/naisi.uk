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
 *
 * One part of the menu is not a fixed list: Facilitating, whose entries are
 * the groups the person facilitates and the guide to their courses, made
 * from what `GET /api/messages` answers (`menuFor`). Its addresses are
 * written here as shapes (`FACILITATING_ADDRESSES`), which the same test
 * holds to page files.
 */

import { PROGRAMMES_PATH } from "@/lib/applications/programmes/path";
import { FACILITATOR_GUIDE } from "@/lib/courses/facilitatorGuide/words";
import { UNNAMED_GROUP_WORDS, facilitatingCourses, type FacilitatingGroup } from "@/lib/courses/facilitatingMenu";

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
  | "membershipAdmin"
  | "messages"
  | "facilitating";

export type AdminSectionId = "people" | "programmes" | "courses" | "publicity" | "surveys" | "reports" | "site";

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
  /**
   * A line under the entry's name in the phone's Menu ("Wednesdays 3pm ·
   * Portland A21"). Only the Facilitating part's entries carry one.
   */
  detail?: string;
  /**
   * Draw `detail` in the sidebar too, not only in the phone's Menu: set on
   * two of a person's groups that share a name, so they can be told apart.
   */
  detailInSidebar?: boolean;
  /**
   * Other addresses this entry is the current one on, beside its own and
   * those beneath it: a group's draw and pairs pages, which are not under
   * the group's address.
   */
  also?: string[];
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
      // Admins, and anybody named on a term's form or an older round: the
      // Programmes page, every programme of a term that is not over that the
      // person may open.
      { label: "Programmes", href: PROGRAMMES_PATH, rule: "admissions", section: "programmes" },
      // The course pages, a section of their own since a course outlives its
      // terms: for admins, and for somebody who holds a course grant.
      { label: "Courses", href: "/admin/courses", rule: "courseAdmin", section: "courses" },
      { label: "People", href: "/admin/members", rule: "adminOnly", section: "people", count: "joinRequests" },
      // The same word for somebody who is not an admin and looks after SU
      // membership: the one page of People they can open. Nobody is shown both.
      { label: "People", href: "/admin/membership", rule: "membershipAdmin", section: "people" },
      { label: "Manage events", href: "/events/manage", rule: "events" },
      // Writing to people: admins, a programme's lead and a group's
      // facilitator, each to the people the picker gives them.
      { label: "Messages", href: "/messages", rule: "messages" },
      { label: "Newsletter", href: "/newsletter", rule: "newsletter" },
      { label: "Publicity", href: "/admin/links", rule: "adminOnly", section: "publicity" },
      { label: "Committee tasks", href: "/committee/tasks", rule: "suCommitteeAndUp" },
      // Every committee member drafts worksheets: SU recognition gates the
      // task board, not this.
      { label: "Worksheets", href: "/worksheets", rule: "committeeAndUp" },
      // Only admins make, send and read surveys (docs/surveys.md).
      { label: "Surveys", href: "/admin/surveys", rule: "adminOnly", section: "surveys" },
      // This term in numbers, Public numbers and Kairos: admins' reading of
      // the term's records, which were buttons on the Surveys page's head.
      { label: "Reports", href: "/admin/reports", rule: "adminOnly", section: "reports" },
    ],
  },
  {
    label: "Site",
    entries: [{ label: "Settings", href: "/admin/site-status", rule: "adminOnly", section: "site" }],
  },
];

// ---------------------------------------------------------------------------
// Facilitating: the part of the menu made for one person
// ---------------------------------------------------------------------------

/** The part's heading, in the sidebar and in the phone's Menu. */
export const FACILITATING_LABEL = "Facilitating";

/**
 * The addresses the Facilitating part leads to, as shapes, each segment in
 * brackets filled from the answer. `tests/app-frame.test.mjs` holds each to
 * a page file and to the rule written down for it.
 *
 *  - `group`: a group's page, which the group's facilitators open;
 *  - `guide`: one course's facilitator guide;
 *  - `guides`: the short list of guides, for somebody facilitating on two
 *    courses or more;
 *  - `draw`, `pairs`: a group's draw and pairs pages, which light the
 *    group's entry although they are not under its address.
 */
export const FACILITATING_ADDRESSES = {
  group: "/learn/[runId]/group/[groupId]",
  guide: "/learn/facilitator-guide/[courseId]",
  guides: "/learn/facilitator-guide",
  draw: "/learn/draw/[groupId]",
  pairs: "/learn/pairs/[groupId]",
} as const;

/** A shape with its bracketed segments filled, each encoded as one segment. */
export function fillAddress(shape: string, values: Record<string, string>): string {
  return shape.replace(/\[(\w+)\]/g, (_, key: string) => encodeURIComponent(values[key] ?? ""));
}

/** "Wednesdays 3pm · Portland A21": when a group meets and where, each that is known. */
export function facilitatingDetailWords(slot: string, room: string): string {
  return [slot.trim(), room.trim()].filter(Boolean).join(" · ");
}

/** "AGI Strategy", "AGI Strategy and Technical AI Safety", "A, B and C". */
export function titlesWords(titles: readonly string[]): string {
  const named = titles.map((title) => title.trim()).filter(Boolean);
  if (named.length <= 1) return named[0] ?? "";
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

/**
 * The Facilitating part for these groups, or null with none: each group by
 * its name, in the order the answer lists them (the order they meet), then
 * the facilitator guide. With one course the guide's entry opens that
 * course's guide; with two or more, the short list of each one's.
 */
export function facilitatingPartOf(groups: readonly FacilitatingGroup[]): NavGroup | null {
  if (groups.length === 0) return null;
  const courses = facilitatingCourses(groups);
  const labelOf = (group: FacilitatingGroup) => group.name.trim() || UNNAMED_GROUP_WORDS;
  const shared = (group: FacilitatingGroup) => groups.filter((other) => labelOf(other) === labelOf(group));
  // Two groups by one name are told apart by when and where they meet, and,
  // when that is the same too, by their course.
  const detailOf = (group: FacilitatingGroup) => {
    const own = facilitatingDetailWords(group.slot, group.room);
    const twins = shared(group);
    const sameDetail = twins.filter((other) => facilitatingDetailWords(other.slot, other.room) === own).length > 1;
    return sameDetail ? [own, group.courseTitle.trim()].filter(Boolean).join(" · ") : own;
  };
  return {
    label: FACILITATING_LABEL,
    entries: [
      ...groups.map(
        (group): NavEntry => ({
          label: labelOf(group),
          href: fillAddress(FACILITATING_ADDRESSES.group, { runId: group.runId, groupId: group.groupId }),
          rule: "facilitating",
          detail: detailOf(group),
          ...(shared(group).length > 1 ? { detailInSidebar: true } : {}),
          also: [
            fillAddress(FACILITATING_ADDRESSES.draw, { groupId: group.groupId }),
            fillAddress(FACILITATING_ADDRESSES.pairs, { groupId: group.groupId }),
          ],
        }),
      ),
      {
        label: FACILITATOR_GUIDE,
        href:
          courses.length === 1
            ? fillAddress(FACILITATING_ADDRESSES.guide, { courseId: courses[0].courseId })
            : FACILITATING_ADDRESSES.guides,
        rule: "facilitating",
        detail: titlesWords(courses.map((course) => course.courseTitle)),
      },
    ],
  };
}

/**
 * The whole menu for somebody facilitating these groups: `APP_NAV` with the
 * Facilitating part after the first group. With no groups, `APP_NAV` itself,
 * so somebody who facilitates nothing is drawn exactly the menu they had.
 */
export function menuFor(groups: readonly FacilitatingGroup[]): NavGroup[] {
  const part = facilitatingPartOf(groups);
  return part ? [APP_NAV[0], part, ...APP_NAV.slice(1)] : APP_NAV;
}

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

/** A facilitator's bar: their group (or groups) and the guide, after Home and Programme. */
export const BAR_GROUP_LABEL = "Group";
export const BAR_GROUPS_LABEL = "Groups";
export const BAR_GUIDE_LABEL = "Guide";

/** The words of `BOTTOM_BAR` a facilitator's bar keeps. Profile is one press away, in Menu. */
const FACILITATOR_BAR_KEEPS = [HOME_HREF, "/learn"];

/** One word in the bar: where it goes, and the entries it is lit for. */
export type BarWord = { label: string; href: string; lights: string[] };

/**
 * The words in the phone's bottom bar for one person, left to right, before
 * Menu, which the shell always draws last.
 *
 * Everybody but a facilitator: `BOTTOM_BAR`'s words for the entries they
 * have, each lit on its own entry, as the bar always was. A facilitator
 * (`facilitating`, the menu's Facilitating part): Home, Programme, then
 * Group, to their group's page, lit there and on its draw and pairs pages
 * (with two groups or more, Groups, to My programmes, which lists them, lit
 * on any of their groups), then Guide, to the guide's entry.
 */
export function bottomBarFor(entries: readonly NavEntry[], facilitating: NavGroup | null): BarWord[] {
  const has = (href: string) => entries.some((entry) => entry.href === href);
  if (!facilitating) {
    return BOTTOM_BAR.filter((word) => has(word.href)).map((word) => ({ ...word, lights: [word.href] }));
  }
  const guide = facilitating.entries[facilitating.entries.length - 1];
  const groups = facilitating.entries.slice(0, -1);
  const kept = BOTTOM_BAR.filter((word) => FACILITATOR_BAR_KEEPS.includes(word.href) && has(word.href)).map((word) => ({
    ...word,
    lights: [word.href],
  }));
  const group: BarWord =
    groups.length === 1
      ? { label: BAR_GROUP_LABEL, href: groups[0].href, lights: [groups[0].href] }
      : { label: BAR_GROUPS_LABEL, href: "/learn", lights: groups.map((entry) => entry.href) };
  return [...kept, group, { label: BAR_GUIDE_LABEL, href: guide.href, lights: [guide.href] }];
}

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
  count?: "joinRequests" | "collaborators";
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
/** The same, leaving out addresses beneath it that belong to another page. */
const underBut =
  (href: string, ...not: string[]) =>
  (p: string) =>
    under(href)(p) && !not.some((each) => under(each)(p));

const FORMS_PATH = "/admin/admissions/forms";

/** The list of application forms, and a form's editor and everything beneath it. */
const isApplicationFormsPage = (p: string) => p === FORMS_PATH || /^\/admin\/admissions\/forms\/[^/]+\/form(\/|$)/.test(p);

/** The Programmes page, and every other address under a term's form: its page, its programmes and the term's own work. */
const isProgrammesPage = (p: string) => under(PROGRAMMES_PATH)(p) || (under(FORMS_PATH)(p) && !isApplicationFormsPage(p));

/**
 * The three reports Run NAISI › Reports holds. Each kept the address it had
 * when it was a button on the Surveys page's head, so the Surveys page leaves
 * them out and Reports takes them in.
 */
const REPORT_ADDRESSES = ["/admin/surveys/term", "/admin/surveys/public-numbers", "/admin/surveys/kairos"];

/**
 * The admin area's pages, grouped as the sidebar reaches them.
 *
 * When the menu was regrouped (7 Oct 2026) no address was new and none moved:
 * the old flat strip was sorted into four sections, with two pages that used
 * to be reached from inside another page given a place of their own (the
 * application forms, and what the public /links page says). Surveys came
 * later, as a section of one page, and Reports after it, a section of one
 * page that also holds the three reports beneath Surveys' address.
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
      // Every programme a reader may open, and everything of a term's: its
      // page, its programmes' pages, and the term's own work beneath it.
      { label: "Programmes", href: PROGRAMMES_PATH, match: isProgrammesPage, visible: ADMISSIONS, ownHead: true },
      // The list of forms and the form editor, as they were.
      { label: "Application forms", href: FORMS_PATH, match: isApplicationFormsPage, visible: ADMISSIONS, ownHead: true },
      // The requests the people running a programme decide: in the admissions
      // tree because its gate admits a programme's lead.
      { label: "Requests", href: "/admin/admissions/requests", match: under("/admin/admissions/requests"), visible: ADMISSIONS, ownHead: true },
      { label: "Older rounds", href: "/admin/admissions", match: underBut("/admin/admissions", FORMS_PATH, "/admin/admissions/requests", PROGRAMMES_PATH), visible: ADMISSIONS },
    ],
  },
  {
    id: "courses",
    label: "Courses",
    pages: [
      { label: "Courses", href: "/admin/courses", match: under("/admin/courses"), visible: (a) => a.isAdmin || a.canAuthorCourses },
    ],
  },
  {
    id: "publicity",
    label: "Publicity",
    pages: [
      { label: "Short links", href: "/admin/links", match: underBut("/admin/links", "/admin/links/page-content"), visible: ADMIN_ONLY, ownHead: true },
      { label: "The /links page", href: "/admin/links/page-content", match: under("/admin/links/page-content"), visible: ADMIN_ONLY, ownHead: true },
      { label: "Source sheets", href: "/admin/sources", match: under("/admin/sources"), visible: ADMIN_ONLY, ownHead: true },
    ],
  },
  {
    id: "surveys",
    label: "Surveys",
    pages: [
      { label: "Surveys", href: "/admin/surveys", match: underBut("/admin/surveys", ...REPORT_ADDRESSES), visible: ADMIN_ONLY, ownHead: true },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    pages: [
      {
        label: "Reports",
        href: "/admin/reports",
        match: (p) => under("/admin/reports")(p) || REPORT_ADDRESSES.some((each) => under(each)(p)),
        visible: ADMIN_ONLY,
        ownHead: true,
      },
    ],
  },
  {
    id: "site",
    label: "Site settings",
    pages: [
      { label: "Site notice and scheduled jobs", href: "/admin/site-status", match: under("/admin/site-status"), visible: ADMIN_ONLY, ownHead: true },
      { label: "Email delivery", href: "/admin/deliverability", match: under("/admin/deliverability"), visible: ADMIN_ONLY, ownHead: true },
      { label: "Sign-up problems", href: "/admin/registrations", match: under("/admin/registrations"), visible: ADMIN_ONLY, ownHead: true },
      { label: "Sign-up emails", href: "/admin/email-designs", match: under("/admin/email-designs"), visible: ADMIN_ONLY, ownHead: true },
      { label: "Projects", href: "/admin/projects", match: under("/admin/projects"), visible: ADMIN_ONLY, ownHead: true },
      { label: "Task templates", href: "/admin/task-templates", match: under("/admin/task-templates"), visible: ADMIN_ONLY, ownHead: true },
      { label: "Newsletter recipients", href: "/admin/newsletter", match: under("/admin/newsletter"), visible: ADMIN_ONLY, ownHead: true },
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
 * An entry that is the way into an admin section holds only that section's
 * addresses, so "Surveys" is not lit on the reports beneath its address,
 * which belong to Reports. Failing that, the first entry that is a way into
 * the page's admin section, so "People" is lit on Join requests (`/admin`),
 * "Settings" on Email delivery and "Reports" on This term in numbers. Null
 * when nothing the person is shown leads here.
 */
export function currentEntry(entries: readonly NavEntry[], pathname: string): NavEntry | null {
  const section = adminSectionFor(pathname);
  let best: NavEntry | null = null;
  let bestLength = -1;
  for (const entry of entries) {
    // The longest of the entry's addresses that holds the page: its own, or
    // one of `also` (a group's draw and pairs pages).
    const held = [entry.href, ...(entry.also ?? [])].filter((href) => isAtOrUnder(pathname, href));
    if (held.length === 0) continue;
    if (entry.section && section && entry.section !== section.id) continue;
    const length = Math.max(...held.map((href) => href.length));
    if (!best || length > bestLength) {
      best = entry;
      bestLength = length;
    }
  }
  if (best) return best;
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
