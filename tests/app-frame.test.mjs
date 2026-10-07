/**
 * The signed-in frame: the menu, the admin area's sections and the phone's
 * bottom bar.
 *
 * The frame is drawn from data in `src/layout/appNav.ts`. This file holds that
 * data to the tree it describes, in the directions a person would not notice
 * until somebody could no longer find a page.
 *
 * 1. EVERY ADDRESS IS A PAGE. An entry or an admin page that names an address
 *    with no `page.tsx` behind it is a link to the not-found screen.
 *
 * 2. EVERY ADMIN PAGE HAS ONE PLACE. The admin area used to be one strip of
 *    seventeen tabs; it is now four sections, and the strip shows only the
 *    section somebody is in. A page file under `src/app/(app)/admin/` that no
 *    section claims can only be reached by typing its address, and one that
 *    two claim lights two tabs. The tree is walked, so a page added next
 *    month is held to this without anybody remembering.
 *
 * 3. EVERY PAGE SOMEBODY CAN OPEN IS LIT IN THEIR MENU. For each audience of
 *    the admin area, every page its own strip offers them marks one entry of
 *    their sidebar as the current page. Nothing is left where the menu goes
 *    dark.
 *
 * 4. THE BOTTOM BAR OFFERS NOTHING THE MENU DOES NOT, and what it leaves out is
 *    one press away, behind Menu.
 *
 * 5. WHO IS SHOWN WHAT DID NOT MOVE. The menu was regrouped and renamed on the
 *    promise that nobody's menu gained or lost a page by it. The rule behind
 *    each entry, and the text of each rule, is written down here.
 *
 * 6. NOTHING STICKS UNDER THE BOTTOM BAR. On a narrow screen the frame fixes a
 *    bar to the bottom of the window. Anything else stuck or fixed there has
 *    to add `--app-bottom-inset` to its own `bottom`, or it is drawn under the
 *    bar where nobody can press it. Every stylesheet is walked for one.
 *
 * 7. EVERY ADMIN PAGE HAS ONE HEADING. An admin page is headed by its own
 *    name, as the page's one <h1>, with the section as a crumb above it. A
 *    page marked `ownHead` draws that head itself and the shared head stands
 *    down; any other page is given it by the shared head. So a page marked
 *    and drawing nothing has no heading, and a page not marked that draws one
 *    has two. Every admin page file is walked, with what it imports, both
 *    ways.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const APP = join(SRC, "app", "(app)");

const { loadTs } = createLoader({ stubs: [] });
const {
  APP_NAV,
  BOTTOM_BAR,
  BOTTOM_BAR_MENU_LABEL,
  HOME_HREF,
  ADMIN_SECTIONS,
  adminSectionFor,
  adminPageFor,
  currentEntry,
  barTitleFor,
  roleInWords,
} = await loadTs("layout/appNav.ts");

const read = (...parts) => readFileSync(join(SRC, ...parts), "utf8");
const posix = (path) => path.split(sep).join("/");

function walk(dir, keep) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, keep));
    else if (keep(name)) out.push(full);
  }
  return out;
}

/** The address a page file answers at: route groups dropped, `[x]` kept. */
function routeOf(pageFile) {
  const segments = posix(relative(APP, dirname(pageFile)))
    .split("/")
    .filter((s) => s && !/^\(.*\)$/.test(s));
  return `/${segments.join("/")}`;
}

const PAGE_FILES = walk(APP, (name) => name === "page.tsx");
const ROUTES = PAGE_FILES.map(routeOf);
const ENTRIES = APP_NAV.flatMap((group) => group.entries);
const ADMIN_PAGES = ADMIN_SECTIONS.flatMap((section) => section.pages);

// ---------------------------------------------------------------------------
// 1. Every address is a page
// ---------------------------------------------------------------------------

describe("every address in the menu is a page", () => {
  test("the tree was read", () => {
    assert.ok(PAGE_FILES.length > 40, `expected the signed-in pages under ${APP}: was the tree moved?`);
    assert.ok(ENTRIES.length >= 10 && ADMIN_PAGES.length >= 15, "appNav.ts lost its tables");
  });

  test("each menu entry, bar word and admin page names an address with a page file", () => {
    const named = [
      ...ENTRIES.map((e) => ["menu entry", e.label, e.href]),
      ...BOTTOM_BAR.map((b) => ["bar word", b.label, b.href]),
      ...ADMIN_PAGES.map((p) => ["admin page", p.label, p.href]),
    ];
    const missing = named.filter(([, , href]) => !ROUTES.includes(href));
    assert.deepEqual(
      missing,
      [],
      "these name an address no page.tsx under src/app/(app) answers at:\n  " +
        missing.map((m) => m.join(" | ")).join("\n  "),
    );
  });

  test("no two entries share an address, and no group is empty", () => {
    const hrefs = ENTRIES.map((e) => e.href);
    assert.equal(new Set(hrefs).size, hrefs.length, "two menu entries lead to the same address");
    for (const group of APP_NAV) assert.ok(group.entries.length > 0, `the group ${group.label} is empty`);
    const adminHrefs = ADMIN_PAGES.map((p) => p.href);
    assert.equal(new Set(adminHrefs).size, adminHrefs.length, "two admin pages share an address");
  });
});

// ---------------------------------------------------------------------------
// 2. Every admin page has one place
// ---------------------------------------------------------------------------

describe("every admin page file belongs to exactly one page of one section", () => {
  const adminRoutes = ROUTES.filter((r) => r === "/admin" || r.startsWith("/admin/"));

  test("the admin tree was read", () => {
    assert.ok(adminRoutes.length >= 30, "expected the admin pages: was the tree moved?");
  });

  test("each page file is claimed once", () => {
    const wrong = [];
    for (const route of adminRoutes) {
      // A sample address for a pattern: each `[x]` becomes a plain segment.
      const sample = route.replace(/\[[^\]]+\]/g, "sample");
      const claims = ADMIN_PAGES.filter((p) => p.match(sample)).map((p) => p.label);
      if (claims.length !== 1) wrong.push(`${route} is claimed by ${claims.length ? claims.join(" and ") : "no page"}`);
    }
    assert.deepEqual(
      wrong,
      [],
      "an admin page file needs exactly one place in ADMIN_SECTIONS (src/layout/appNav.ts), " +
        "or it cannot be reached from the strip:\n  " + wrong.join("\n  "),
    );
  });

  test("each page claims its own address, and the lookups agree", () => {
    for (const section of ADMIN_SECTIONS) {
      for (const page of section.pages) {
        assert.ok(page.match(page.href), `${page.label} does not match its own address`);
        assert.equal(adminSectionFor(page.href)?.id, section.id, `${page.href} resolves to another section`);
        assert.equal(adminPageFor(section, page.href)?.href, page.href);
      }
    }
    assert.equal(adminSectionFor("/dashboard"), null, "an address outside the admin area is in no section");
    // The trap the old strip had a comment about: one address is a prefix of another.
    assert.equal(adminPageFor(adminSectionFor("/admin/membership"), "/admin/membership").label, "SU membership");
    assert.equal(adminPageFor(adminSectionFor("/admin/members"), "/admin/members").label, "Accounts");
    assert.equal(adminPageFor(adminSectionFor("/admin/links/page-content"), "/admin/links/page-content").label, "The /links page");
    assert.equal(adminPageFor(adminSectionFor("/admin/admissions/forms/x/pool"), "/admin/admissions/forms/x/pool").label, "Application forms");
    assert.equal(adminPageFor(adminSectionFor("/admin/admissions/x/appointments"), "/admin/admissions/x/appointments").label, "Older rounds");
  });

  test("each section has a way in from the sidebar, to one of its own pages", () => {
    for (const section of ADMIN_SECTIONS) {
      const ways = ENTRIES.filter((e) => e.section === section.id);
      assert.ok(ways.length > 0, `no menu entry leads into ${section.label}`);
      for (const way of ways) {
        assert.ok(
          section.pages.some((p) => p.href === way.href),
          `${way.label} (${way.href}) claims to lead into ${section.label} but lands outside it`,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Every page somebody can open is lit in their menu
// ---------------------------------------------------------------------------

/**
 * The audiences of the admin area: what its layout resolves for each
 * (`AdminTabAccess`), and which menu rules each passes.
 *
 * `rules` restates the predicates in `AppShell.tsx` for one kind of person,
 * and section 5 below holds those predicates to their text, so the two cannot
 * part quietly. `courseAdmin` and `membershipAdmin` are the rules that leave
 * admins OUT on purpose: an admin reaches the same pages through a section.
 */
const NO_ACCESS = {
  isAdmin: false,
  canAuthorCourses: false,
  canAuthorRounds: false,
  isAdmissionsReviewer: false,
  canManageMembership: false,
};
const AUDIENCES = [
  {
    who: "an admin",
    access: { isAdmin: true, canAuthorCourses: true, canAuthorRounds: true, isAdmissionsReviewer: false, canManageMembership: true },
    rules: ["memberAndUp", "committeeAndUp", "suCommitteeAndUp", "adminOnly", "newsletter", "events", "admissions"],
  },
  {
    who: "a member who drafts courses",
    access: { ...NO_ACCESS, canAuthorCourses: true },
    rules: ["memberAndUp", "courseAdmin"],
  },
  {
    who: "a member who approves courses, and so authors rounds",
    access: { ...NO_ACCESS, canAuthorCourses: true, canAuthorRounds: true },
    rules: ["memberAndUp", "courseAdmin"],
  },
  {
    who: "an SU-recognised committee member named on a form",
    access: { ...NO_ACCESS, isAdmissionsReviewer: true },
    rules: ["memberAndUp", "committeeAndUp", "suCommitteeAndUp", "events", "admissions"],
  },
  {
    who: "an SU-recognised committee member who looks after SU membership",
    access: { ...NO_ACCESS, canManageMembership: true },
    rules: ["memberAndUp", "committeeAndUp", "suCommitteeAndUp", "events", "membershipAdmin"],
  },
];

describe("every admin page somebody can open is lit in their own menu", () => {
  for (const { who, access, rules } of AUDIENCES) {
    test(who, () => {
      const entries = ENTRIES.filter((e) => rules.includes(e.rule));
      const open = ADMIN_PAGES.filter((p) => p.visible(access));
      assert.ok(open.length > 0, `${who} is let into the admin area and offered no page of it`);
      const dark = open.filter((p) => currentEntry(entries, p.href) === null).map((p) => p.href);
      assert.deepEqual(dark, [], `${who} can open these pages and no entry of their menu is marked on them`);
      // And the entry lit is one that leads into the admin area, not Home.
      for (const page of open) {
        assert.ok(currentEntry(entries, page.href).href.startsWith("/admin"), `${page.href} lights an entry outside the admin area`);
      }
    });
  }

  test("the most particular entry wins, then the section's", () => {
    const all = ENTRIES;
    assert.equal(currentEntry(all, "/learn/run-1/weeks/2").label, "My programmes");
    assert.equal(currentEntry(all, "/committee/tasks").label, "Committee tasks");
    assert.equal(currentEntry(all, "/tasks").label, "My work");
    // Somebody shown both: the course pages belong to Courses, the rounds to Programmes.
    assert.equal(currentEntry(all, "/admin/courses/c1/runs/r1").href, "/admin/courses");
    assert.equal(currentEntry(all, "/admin/admissions").href, "/admin/admissions/forms");
    // An admin has no Courses entry: the section's way in is lit instead.
    const admin = ENTRIES.filter((e) => AUDIENCES[0].rules.includes(e.rule));
    assert.equal(currentEntry(admin, "/admin/courses/c1").label, "Programmes");
    assert.equal(currentEntry(admin, "/admin").label, "People");
    assert.equal(currentEntry(admin, "/admin/membership").href, "/admin/members");
    assert.equal(currentEntry(admin, "/admin/deliverability").label, "Settings");
    assert.equal(currentEntry(admin, "/admin/sources/some-slug").label, "Publicity");
    // A page the menu does not hold marks nothing.
    assert.equal(currentEntry(all, "/credentials"), null);
    assert.equal(currentEntry(ENTRIES.filter((e) => e.rule === "memberAndUp"), "/admin/members"), null);
  });
});

// ---------------------------------------------------------------------------
// 4. The bottom bar
// ---------------------------------------------------------------------------

describe("the phone's bottom bar offers nothing the menu does not", () => {
  test("each word is a short name for a menu entry every signed-in person has", () => {
    for (const word of BOTTOM_BAR) {
      const entry = ENTRIES.find((e) => e.href === word.href);
      assert.ok(entry, `the bar's ${word.label} leads to ${word.href}, which is not a menu entry`);
      assert.equal(
        entry.rule,
        "memberAndUp",
        `the bar's ${word.label} would be missing for some people, and the bar is the same for everybody`,
      );
    }
  });

  test("it starts at Home and leaves room for Menu at 360px", () => {
    assert.equal(BOTTOM_BAR[0].href, HOME_HREF);
    assert.equal(BOTTOM_BAR_MENU_LABEL, "Menu");
    // Five words across 360px is 72px each, still wider than a 44px target.
    assert.ok(BOTTOM_BAR.length + 1 <= 5, "more than five words in the bar: each target drops under 72px at 360px");
    const words = [...BOTTOM_BAR.map((b) => b.label), BOTTOM_BAR_MENU_LABEL];
    assert.equal(new Set(words).size, words.length, "two words in the bar read the same");
  });

  test("the top bar names the current entry, and stays quiet on Home", () => {
    assert.equal(barTitleFor(null), null);
    assert.equal(barTitleFor(ENTRIES.find((e) => e.href === HOME_HREF)), null);
    assert.equal(barTitleFor(ENTRIES.find((e) => e.href === "/tasks")), "My work");
  });

  test("the role under a name is said in words", () => {
    assert.equal(roleInWords("admin", false), "Admin");
    assert.equal(roleInWords("committee", true), "SU-recognised committee");
    assert.equal(roleInWords("committee", false), "Committee");
    assert.equal(roleInWords("member", false), "Member");
    assert.equal(roleInWords("pending", false), null);
    assert.equal(roleInWords(null, false), null);
  });
});

// ---------------------------------------------------------------------------
// 5. Who is shown what did not move
// ---------------------------------------------------------------------------

/**
 * address -> the rule that decides who is shown its entry, and why that rule.
 *
 * Checked both ways against `APP_NAV`. A new entry fails here until somebody
 * writes down which gate its page has; an entry taken out leaves a stale line.
 */
const ENTRY_RULES = {
  "/dashboard": ["memberAndUp", "The signed-in layout admits every approved account."],
  "/learn": ["memberAndUp", "Every approved account has a course area, empty or not."],
  "/tasks": ["memberAndUp", "My work lists the tasks a person is on; anybody can be on one."],
  "/profile": ["memberAndUp", "Everybody edits their own profile."],
  "/admin/admissions/forms": ["admissions", "The admissions tree admits admins and whoever is named on a form or a round."],
  "/admin/courses": ["courseAdmin", "The course tree admits a course grant; an admin reaches it through Programmes."],
  "/admin/members": ["adminOnly", "The (admin-only) group admits admins."],
  "/admin/membership": ["membershipAdmin", "The membership tree admits the grant; an admin reaches it through People."],
  "/events/manage": ["events", "The events area is open to the committee and to a draft or approve grant."],
  "/newsletter": ["newsletter", "The newsletter tools need a draft or approve grant."],
  "/admin/links": ["adminOnly", "The (admin-only) group admits admins."],
  "/committee/tasks": ["suCommitteeAndUp", "The committee layout admits admins and SU-recognised committee."],
  "/worksheets": ["committeeAndUp", "Every committee member drafts worksheets."],
  "/admin/site-status": ["adminOnly", "The (admin-only) group admits admins."],
};

/**
 * rule -> the constant that implements it in `AppShell.tsx`, and that
 * constant's body, as it stood when the menu was regrouped (7 Oct 2026).
 *
 * The bodies are compared with whitespace collapsed. Changing who is shown an
 * entry is a decision; make it here and there together.
 */
const RULE_BODIES = {
  memberAndUp: ["MEMBER_AND_UP", '(v: Viewer) => v.role === "member" || v.role === "committee" || v.role === "admin"'],
  committeeAndUp: ["COMMITTEE_AND_UP", '(v: Viewer) => v.role === "committee" || v.role === "admin"'],
  suCommitteeAndUp: ["SU_COMMITTEE_AND_UP", '(v: Viewer) => v.role === "admin" || (v.role === "committee" && v.suRecognised)'],
  adminOnly: ["ADMIN_ONLY", '(v: Viewer) => v.role === "admin"'],
  newsletter: [
    "NEWSLETTER_ACCESS",
    '(v: Viewer) => v.role === "admin" || Boolean(v.permissions.draftNewsletter) || Boolean(v.permissions.approveNewsletter)',
  ],
  events: [
    "EVENTS_ACCESS",
    '(v: Viewer) => v.role === "admin" || v.role === "committee" || Boolean(v.permissions.draftEvent) || Boolean(v.permissions.approveEvent)',
  ],
  admissions: ["ADMISSIONS_ACCESS", '(v: Viewer) => v.role === "admin" || v.admissionsReviewer'],
  courseAdmin: [
    "COURSE_ADMIN_ACCESS",
    '(v: Viewer) => v.role !== "admin" && (Boolean(v.permissions.draftCourse) || Boolean(v.permissions.approveCourse))',
  ],
  membershipAdmin: ["MEMBERSHIP_ADMIN_ACCESS", '(v: Viewer) => v.role !== "admin" && Boolean(v.permissions.manageMembership)'],
};

describe("regrouping the menu did not change who is shown what", () => {
  const shell = read("layout", "AppShell.tsx");
  const flat = (text) => text.replace(/\s+/g, " ").trim();

  test("every entry is decided by the rule written down for its address", () => {
    assert.deepEqual(
      Object.fromEntries(ENTRIES.map((e) => [e.href, e.rule])),
      Object.fromEntries(Object.entries(ENTRY_RULES).map(([href, [rule]]) => [href, rule])),
      "APP_NAV and ENTRY_RULES disagree: a new entry needs its rule and its reason here, and a removed one leaves a stale line",
    );
    for (const [href, [, why]] of Object.entries(ENTRY_RULES)) {
      assert.ok(typeof why === "string" && why.length > 30, `${href}: needs a written reason, not a placeholder`);
    }
  });

  test("every rule is one constant in AppShell.tsx, and each constant reads as written", () => {
    const used = new Set(ENTRIES.map((e) => e.rule));
    assert.deepEqual([...used].sort(), Object.keys(RULE_BODIES).sort(), "a rule is used that is not written down here, or the other way round");
    for (const [rule, [constant, body]] of Object.entries(RULE_BODIES)) {
      assert.match(
        shell,
        new RegExp(`\\b${rule}: ${constant},`),
        `AppShell.tsx no longer maps ${rule} to ${constant}`,
      );
      const start = shell.indexOf(`const ${constant} = `);
      assert.ok(start >= 0, `AppShell.tsx no longer defines ${constant}`);
      const found = flat(shell.slice(start + `const ${constant} = `.length, shell.indexOf(";", start)));
      assert.equal(found, body, `${constant} no longer reads as it did when the menu was regrouped`);
    }
  });

  test("the admin strip shows a page only to the callers its own gate admits", () => {
    const visibleTo = (access) => ADMIN_PAGES.filter((p) => p.visible(access)).map((p) => p.href).sort();
    assert.deepEqual(visibleTo({ ...NO_ACCESS }), [], "somebody with no way into the admin area is offered a page of it");
    assert.deepEqual(visibleTo({ ...NO_ACCESS, canAuthorCourses: true }), ["/admin/courses"]);
    assert.deepEqual(visibleTo({ ...NO_ACCESS, canManageMembership: true }), ["/admin/membership"]);
    assert.deepEqual(visibleTo({ ...NO_ACCESS, isAdmissionsReviewer: true }), ["/admin/admissions", "/admin/admissions/forms"]);
    assert.deepEqual(visibleTo({ ...NO_ACCESS, canAuthorRounds: true }), ["/admin/admissions", "/admin/admissions/forms"]);
    assert.deepEqual(
      visibleTo({ ...NO_ACCESS, isAdmin: true }),
      ADMIN_PAGES.map((p) => p.href).sort(),
      "an admin is offered every page of the admin area",
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Nothing sticks under the bottom bar
// ---------------------------------------------------------------------------

/**
 * Rules that fix or stick something to the bottom of the window and do NOT
 * read `--app-bottom-inset`, each with the reason it need not.
 *
 * Keyed `<stylesheet under src> <selector>`. Checked both ways: an entry that
 * matches nothing any more fails as stale.
 */
const WHOLE_SCREEN = "It covers the whole window (`inset: 0`), the bar included, and is stacked above it.";
const OUTSIDE = "It is drawn outside the signed-in frame, where there is no bottom bar.";
const NOT_UNDER_THE_BAR = {
  "layout/AppShell.module.css .bottomBar": "This is the bar.",
  "components/ui/Drawer.module.css .root": WHOLE_SCREEN,
  "components/ui/Modal.module.css .root": WHOLE_SCREEN,
  "components/ui/Dropdown.module.css .sheetRoot": WHOLE_SCREEN,
  "components/ui/PersonSelector.module.css .sheetRoot": WHOLE_SCREEN,
  "components/blocks/ImageCropModal.module.css .overlay": WHOLE_SCREEN,
  "features/tasks/components/TaskDetailModal.module.css .overlay": WHOLE_SCREEN,
  "features/tasks/components/SubtaskDetailModal.module.css .overlay": WHOLE_SCREEN,
  "features/events/CoverBrandingModal.module.css .overlay": WHOLE_SCREEN,
  "features/events/EventEditor.module.css .modalOverlay": WHOLE_SCREEN,
  "features/admin/adminLock.module.css .overlay": WHOLE_SCREEN,
  "features/maintenance/StatusPage.module.css .modalBackdrop": OUTSIDE,
  "features/applications/apply/form.module.css .bottomBar": OUTSIDE,
  "app/(auth)/register/registerSignIn.module.css .navPane": OUTSIDE,
};

/** Comments blanked, so a rule in a comment is not a rule. */
const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, " ");

/**
 * Every (selector, declaration) pair in a stylesheet. Reads the innermost
 * blocks, so a rule inside a media block is read like any other and keeps
 * its own selector.
 */
function declarations(css) {
  const out = [];
  for (const rule of withoutComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = rule[1].split(",").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
    for (const declaration of rule[2].split(";")) {
      const colon = declaration.indexOf(":");
      if (colon < 0) continue;
      const property = declaration.slice(0, colon).trim();
      const value = declaration.slice(colon + 1).replace(/\s+/g, " ").trim();
      for (const selector of selectors) out.push({ selector, property, value });
    }
  }
  return out;
}

const BOTTOM_EDGE = new Set(["bottom", "inset", "inset-block", "inset-block-end"]);

describe("nothing is stuck to the bottom of the window under the bottom bar", () => {
  const sheets = walk(SRC, (name) => name.endsWith(".css"));
  const stuck = new Map(); // key -> the bottom-edge values of a fixed or sticky selector
  for (const file of sheets) {
    const all = declarations(readFileSync(file, "utf8"));
    const pinned = new Set(
      all.filter((d) => d.property === "position" && /^(fixed|sticky)\b/.test(d.value)).map((d) => d.selector),
    );
    for (const d of all) {
      if (!pinned.has(d.selector) || !BOTTOM_EDGE.has(d.property)) continue;
      const key = `${posix(relative(SRC, file))} ${d.selector}`;
      stuck.set(key, [...(stuck.get(key) ?? []), d.value]);
    }
  }

  test("the stylesheets were read, and the scan sees the cases it is for", () => {
    assert.ok(sheets.length > 200, "expected every stylesheet under src");
    const sample = declarations(".a, .b { position: sticky; bottom: 0 }\n@media (max-width: 48rem) { .a { bottom: 4px; } }\n/* .c { position: fixed; bottom: 0 } */");
    assert.deepEqual(
      sample.filter((d) => d.property === "bottom").map((d) => `${d.selector}=${d.value}`),
      [".a=0", ".b=0", ".a=4px"],
    );
    assert.ok(stuck.has("layout/AppShell.module.css .bottomBar"), "the scan no longer sees the bar itself");
  });

  test("the profile's Save row is pinned to the bottom of the screen", () => {
    // OWNER DECISION, 7 October 2026: the profile page is long and nothing on
    // it saves by itself (the Push column apart), so its Save button stays in
    // reach: the row is stuck to the bottom of the screen for as long as the
    // form runs below it. The test under this one holds it above the phone's
    // bottom bar, as it holds every other pinned row.
    const row = stuck.get("features/profile/ProfileForm.module.css .saveRow");
    assert.ok(row, "the profile's Save row is no longer pinned to the bottom of the screen");
    assert.deepEqual(row, ["var(--app-bottom-inset, 0px)"]);
    const sheet = readFileSync(join(SRC, "features", "profile", "ProfileForm.module.css"), "utf8");
    const block = /\n\.saveRow \{([^}]*)\}/.exec(sheet);
    assert.ok(block, "could not find the Save row's rule");
    assert.match(block[1], /position: sticky;/);
    // Something has to be behind it, or the sections show through as they pass under.
    assert.match(block[1], /background: var\(--color-floor\);/);
  });

  test("each one adds the bar's height to its own bottom, or says why it need not", () => {
    const under = [];
    for (const [key, values] of stuck) {
      if (key in NOT_UNDER_THE_BAR) continue;
      const bare = values.filter((v) => !v.includes("var(--app-bottom-inset"));
      if (bare.length) under.push(`${key}  { bottom: ${bare.join(" | ")} }`);
    }
    assert.deepEqual(
      under,
      [],
      "these are fixed or stuck to the bottom of the window and would sit under the phone's bottom bar.\n" +
        "Add the bar's height to the value, for example\n" +
        "  bottom: calc(var(--space-4) + var(--app-bottom-inset, 0px));\n" +
        "or, for something outside the signed-in frame or covering the whole window, add it to\n" +
        "NOT_UNDER_THE_BAR in this file with the reason:\n\n  " + under.join("\n  "),
    );
  });

  test("every exception still exists and carries a reason", () => {
    const stale = Object.keys(NOT_UNDER_THE_BAR).filter((key) => !stuck.has(key));
    assert.deepEqual(stale, [], "these NOT_UNDER_THE_BAR entries match no rule any more. Delete them:\n  " + stale.join("\n  "));
    for (const [key, why] of Object.entries(NOT_UNDER_THE_BAR)) {
      assert.ok(typeof why === "string" && why.length > 10, `${key}: needs a written reason`);
    }
  });

  test("the frame publishes the property, zero where there is no bar", () => {
    const css = withoutComments(read("layout", "AppShell.module.css"));
    const wide = css.slice(0, css.lastIndexOf("@media (max-width: 60rem)"));
    const narrow = css.slice(css.lastIndexOf("@media (max-width: 60rem)"));
    assert.match(wide, /\.frame \{[^}]*--app-bottom-inset: 0px;/, "outside the phone layout the property has to be 0px");
    assert.match(
      narrow,
      /\.frame \{\s*--app-bottom-inset: calc\(var\(--frame-bar\) \+ env\(safe-area-inset-bottom, 0px\)\);/,
      "in the phone layout it is the bar and the home indicator beneath it",
    );
    assert.match(narrow, /\.bottomBar \{[^}]*height: var\(--app-bottom-inset\);/, "the bar is as tall as the space it says it takes");
    assert.match(
      narrow,
      /\.main \{[^}]*calc\(var\(--space-6\) \+ var\(--app-bottom-inset\)\)/,
      "the page pads its own bottom by the bar, so its last row is never under it",
    );
    assert.ok(!/\.bottomBar \{[^}]*display: (flex|grid|block)/.test(wide), "the bar must be hidden where the sidebar shows");
  });

  test("no component fixes itself to the window from an inline style without saying so", () => {
    // An inline `position: "fixed"` cannot be read by the stylesheet walk above.
    const INLINE = {
      "components/ui/ActionToast.tsx": WHOLE_SCREEN,
    };
    const found = walk(SRC, (name) => name.endsWith(".tsx"))
      .filter((file) => /position:\s*["'](fixed|sticky)["']/.test(readFileSync(file, "utf8")))
      .map((file) => posix(relative(SRC, file)));
    assert.deepEqual(found.sort(), Object.keys(INLINE).sort(), "an inline fixed or sticky position is not registered here, or an entry is stale");
  });
});

// ---------------------------------------------------------------------------
// 7. Every admin page has one heading
// ---------------------------------------------------------------------------

/**
 * A head: the shared component being USED, or an <h1> written out. The
 * component's own file has an <h1> in it and is reached by every page that
 * uses the component, so the two spellings find the same pages.
 */
const DRAWS_A_HEAD = /<PageHead\b|<h1\b/;

const ADMIN_DIR = join(APP, "admin");

/** Source with its comments gone, so a head written about is not a head drawn. */
function codeOf(file) {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Every module a file pulls VALUES from. A type-only import draws nothing. */
function valueSpecifiers(code) {
  const out = [];
  const statement = /(?:^|\n)[ \t]*((?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["'])/g;
  for (const match of code.matchAll(statement)) {
    if (/^(?:import|export)\s+type\b/.test(match[1])) continue;
    out.push(match[2]);
  }
  for (const match of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push(match[1]);
  return out;
}

function resolveLocal(specifier, fromFile) {
  let base;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

let headEdgesFollowed = 0;

/**
 * The files that draw a head, out of everything one admin page puts on the
 * screen: the page file, every layout between it and the admin area's own
 * layout, and whatever those import from `src`, all the way down.
 *
 * The admin area's own layout is left out on purpose. It mounts the shared
 * head for every page alike, which is the thing this section is checking the
 * pages against.
 */
function headsDrawnBy(pageFile) {
  const roots = [pageFile];
  for (let dir = dirname(pageFile); dir !== ADMIN_DIR; dir = dirname(dir)) {
    const layout = join(dir, "layout.tsx");
    if (existsSync(layout)) roots.push(layout);
  }
  const seen = new Set(roots);
  const queue = [...roots];
  const found = [];
  while (queue.length > 0) {
    const file = queue.shift();
    const code = codeOf(file);
    if (DRAWS_A_HEAD.test(code)) found.push(posix(relative(SRC, file)));
    for (const specifier of valueSpecifiers(code)) {
      const target = resolveLocal(specifier, file);
      if (!target || seen.has(target)) continue;
      headEdgesFollowed += 1;
      seen.add(target);
      queue.push(target);
    }
  }
  return found;
}

/**
 * Admin pages that draw a heading of their own and are NOT marked `ownHead`,
 * so they stand under the shared head with a second <h1>. Each was like that
 * before the shared head and the mark existed. An entry here is a page still
 * owed one of two things: its own heading stepped down a level, or a head of
 * its own in the agreed shape and the mark.
 *
 * A page cannot be marked by itself: the mark is on a section's entry and
 * covers every page under its address, and each of these shares its entry
 * with pages that draw no head.
 *
 * Checked both ways. A page here that stops drawing a head, or whose entry
 * gains the mark, makes its line stale and fails.
 */
const SECOND_HEADING_STILL_DRAWN = {
  "/admin/admissions/[roundId]":
    "The older round editor names the round in an <h1>, while the list of older rounds under the same entry draws no head. No redesign covers the older rounds.",
  "/admin/admissions/[roundId]/appointments":
    "The appointments queue of an older round writes its own <h1>, under the same entry as the list of older rounds, which draws none.",
  "/admin/courses/[courseId]":
    "The course editor names the course in an <h1>, while the list of courses under the same entry draws no head. No redesign covers the course editors.",
  "/admin/courses/[courseId]/page":
    "The editor of a course's public page writes its own <h1>, under the same entry as the list of courses.",
  "/admin/courses/[courseId]/runs/[runId]/retrospective":
    "A run's retrospective writes its own <h1>, under the same entry as the list of courses and the run pages that draw none.",
};

describe("every admin page has one heading: its own, or the shared one", () => {
  const adminPageFiles = PAGE_FILES.filter((file) => {
    const route = routeOf(file);
    return route === "/admin" || route.startsWith("/admin/");
  });
  // route -> { marked, heads }
  const pages = new Map();
  for (const file of adminPageFiles) {
    const route = routeOf(file);
    const sample = route.replace(/\[[^\]]+\]/g, "sample");
    const entry = ADMIN_PAGES.find((p) => p.match(sample)) ?? null;
    pages.set(route, { entry, marked: entry?.ownHead === true, heads: headsDrawnBy(file) });
  }

  test("the admin pages were walked, and the walk sees a head where there is one", () => {
    assert.ok(pages.size >= 30, "expected the admin pages: was the tree moved?");
    assert.ok(headEdgesFollowed > 400, `only ${headEdgesFollowed} imports were followed from the admin pages: the resolver is broken`);
    assert.ok(ADMIN_PAGES.some((p) => p.ownHead === true), "no admin page is marked ownHead, so one direction below is about nothing");
    assert.ok(ADMIN_PAGES.some((p) => p.ownHead !== true), "every admin page is marked ownHead, so the other direction is about nothing");
    // A head two files down from its page (the page mounts a component that
    // draws it) is found, and so is one a nested layout draws for its pages.
    assert.ok(pages.get("/admin/membership")?.heads.includes("features/admin/MembershipConsole.tsx"));
    assert.ok(
      pages
        .get("/admin/admissions/forms/[roundId]/programmes/[programmeId]/setup")
        ?.heads.some((file) => file.endsWith("(tabs)/layout.tsx")),
      "a head drawn by a layout beneath the admin area's own was not found for a page inside it",
    );
    // And a head that is only written about, in a comment, is not one.
    assert.ok(!DRAWS_A_HEAD.test(codeOf(join(SRC, "layout", "appNav.ts"))), "appNav.ts names <h1> in a comment only");
  });

  test("a page marked ownHead draws a head, or it would have no heading at all", () => {
    const headless = [...pages]
      .filter(([, page]) => page.marked && page.heads.length === 0)
      .map(([route, page]) => `${route} (under "${page.entry.label}")`);
    assert.deepEqual(
      headless,
      [],
      "these admin pages sit under an entry marked `ownHead` in src/layout/appNav.ts, so the shared " +
        "head draws no heading for them, and nothing they put on the screen draws one either " +
        "(no <PageHead and no <h1 in the page, its layouts or what they import). Give the page a " +
        "head with PageHead (its own name as the title, the section as the crumb), or take the " +
        "mark off its entry:\n  " + headless.join("\n  "),
    );
  });

  test("a page not marked draws no head, or it would have two", () => {
    const doubled = [...pages]
      .filter(([route, page]) => !page.marked && page.heads.length > 0 && !(route in SECOND_HEADING_STILL_DRAWN))
      .map(([route, page]) => `${route} (under "${page.entry?.label ?? "no entry"}") draws one in ${page.heads.join(", ")}`);
    assert.deepEqual(
      doubled,
      [],
      "these admin pages draw a head of their own (a <PageHead or an <h1 in the page, its layouts " +
        "or what they import), and their entry in src/layout/appNav.ts is not marked `ownHead`, so " +
        "the shared head draws a second <h1> above it. Mark the entry `ownHead: true` if every " +
        "page under its address draws its own head, or step this page's heading down a level:\n  " +
        doubled.join("\n  "),
    );
  });

  test("every page still listed with a second heading is one, and says why", () => {
    const stale = Object.keys(SECOND_HEADING_STILL_DRAWN).filter((route) => {
      const page = pages.get(route);
      return !page || page.marked || page.heads.length === 0;
    });
    assert.deepEqual(
      stale,
      [],
      "these SECOND_HEADING_STILL_DRAWN entries are no longer true (the page is gone, its entry is " +
        "marked, or it stopped drawing a head). Delete them:\n  " + stale.join("\n  "),
    );
    for (const [route, why] of Object.entries(SECOND_HEADING_STILL_DRAWN)) {
      assert.ok(typeof why === "string" && why.length > 40, `${route}: needs a written reason`);
    }
  });

  test("the shared head stands down only for a marked page, and draws the page's own name", () => {
    const tabs = codeOf(join(ADMIN_DIR, "AdminTabs.tsx"));
    assert.match(
      tabs,
      /const pageDrawsHead = !closed && activePage\?\.ownHead === true;/,
      "the shared head decides whether to draw from the active page's `ownHead` mark, and never stands down while the page beneath is not drawn",
    );
    assert.match(
      tabs,
      /\{!pageDrawsHead && \(\s*<PageHead\s+className=\{styles\.sharedHead\}\s+crumb=\{section\.label\}\s+title=\{activePage\?\.label \?\? single\?\.label \?\? section\.label\}\s*\/>\s*\)\}/,
      "the shared head is the section as the crumb and the page's own name as the heading",
    );
    assert.equal((tabs.match(/<h1\b/g) ?? []).length, 0, "the shared head draws its heading with PageHead, and no <h1> of its own beside it");
    assert.equal((tabs.match(/<PageHead\b/g) ?? []).length, 1, "the shared head draws one head");
    // The one screen where the page beneath is not drawn says so to the head.
    const layout = codeOf(join(ADMIN_DIR, "layout.tsx"));
    assert.match(layout, /if \(viewingAs\) \{[\s\S]*?<AdminTabs access=\{access\} closed \/>/, "the closed admin area still has a heading");
    assert.equal((layout.match(/<AdminTabs access=\{access\} \/>/g) ?? []).length, 1, "the open admin area leaves the head to the page that is marked");
  });
});
