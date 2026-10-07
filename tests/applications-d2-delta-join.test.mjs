/**
 * Joining on the application form: the rules.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Somebody with no account answers the form's first step once, makes an
 * account, and what they typed is sent as their join request. The rules of
 * that are pure functions in `src/lib/applications/applicant/join.ts`, and
 * they are executed here, because each one is a promise somebody could break
 * without noticing:
 *
 *  1. WHAT STOPS A JOIN REQUEST. The same About you rules a send of the
 *     application applies, and the consent box.
 *  2. WHAT IS SENT. The join request's own fields and nothing typed anywhere
 *     else, never a claim that the university address is verified, and never
 *     a subscription to bulk email nobody was offered.
 *  3. WHAT IS KEPT WHILE THEY SIGN IN. The answers to one step, for a day, in
 *     the tab. Never a password, never the consent tick. One thing outlives
 *     the tab, and it is held to three limits: a copy for the tab an emailed
 *     link opens, made only once a link has been emailed, believed for an
 *     hour, and removed the moment the join request is sent.
 *  4. WHAT HOLDS A SEND. A waiting account whose university address has not
 *     been checked, and an account with no join request at all.
 *  5. WHERE THE EMAILED LINK MAY RETURN TO. This form, and nothing that only
 *     looks like it.
 *  6. WHERE SIGNING IN RETURNS TO. An account with no join request that goes
 *     to the sign-in page from a form comes back to the form's first step and
 *     is never left on the register page's own profile form.
 *
 * The last sections read the files that use these rules, so the rules cannot
 * be kept by the module and broken by its callers, and walk everything the
 * form's page draws, so a new way off the form to the sign-in page or the
 * register page is one somebody had to write down. The site's own top bar is
 * part of that page: on a form's page its Sign in comes back to the form,
 * and it draws no Join.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FORM_DIR = join(REPO_ROOT, "src", "features", "applications", "apply");
const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });

const rules = await loadTs(join("lib", "applications", "applicant", "join.ts"));
const validate = await loadTs(join("lib", "applications", "validate.ts"));
const notifications = await loadTs(join("lib", "firestore", "notifications.ts"));
const users = await loadTs(join("lib", "firestore", "users.ts"));
const authReturn = await loadTs(join("lib", "authReturn.ts"));
const joinClient = await loadTs(join("features", "applications", "apply", "joinClient.ts"));
const signInReturn = await loadTs(join("lib", "signInReturn.ts"));
const publicNav = await loadTs(join("layout", "publicNav.ts"));
const keptAnswers = await loadTs(join("features", "applications", "apply", "keptAnswers.ts"));

const sourceOf = (file) => readFileSync(join(FORM_DIR, file), "utf8");
/** Comments out, so a rule written in prose is not a use. */
const codeOf = (file) => sourceOf(file).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** A complete set of answers from an undergraduate. */
function answers(overrides = {}) {
  return {
    preferredName: "Dev",
    universityEmail: "someone@nottingham.ac.uk",
    universityEmailVerified: false,
    status: "undergraduate",
    statusOther: "",
    subject: "BSc Physics",
    expectedGraduation: "2028-07",
    motivation: "I want to know whether this is a real problem.",
    interests: "",
    ...overrides,
  };
}

const words = (count) => Array.from({ length: count }, (_, index) => `word${index}`).join(" ");

// ---------------------------------------------------------------------------
// 1. What stops a join request
// ---------------------------------------------------------------------------

describe("what stops a join request", () => {
  test("a step nobody has typed in is missing everything it asks, in the order it asks", () => {
    assert.deepEqual(rules.joinIssues(rules.emptyJoinAnswers(), false), [
      "Tell us what to call you.",
      "Add your university email.",
      "Tell us what you do at UoN.",
      "Add your degree.",
      "Tell us why you are interested in AI safety.",
      rules.CONSENT_NEEDED,
    ]);
  });

  test("complete answers and the consent box are enough", () => {
    assert.deepEqual(rules.joinIssues(answers(), true), []);
  });

  test("the consent box is asked for by itself, in the register page's own sentence", () => {
    assert.deepEqual(rules.joinIssues(answers(), false), [rules.CONSENT_NEEDED]);
    assert.equal(rules.CONSENT_NEEDED, "Please agree to the Terms of Use and Privacy Policy to continue.");
    const register = readFileSync(join(REPO_ROOT, "src", "app", "(auth)", "register", "page.tsx"), "utf8");
    assert.ok(register.includes(`"${rules.CONSENT_NEEDED}"`), "the register page no longer says this sentence");
  });

  test("the university address has to be a Nottingham one, in the site's own words", () => {
    for (const address of ["someone@example.com", "someone@nottingham.ac.uk.example.com", "not an address"]) {
      assert.deepEqual(rules.joinIssues(answers({ universityEmail: address }), true), [
        users.validateUniversityEmail(address),
      ]);
    }
    assert.deepEqual(rules.joinIssues(answers({ universityEmail: " ada@nottingham.ac.uk " }), true), []);
  });

  test("a student is asked when they graduate, and nobody else is", () => {
    assert.deepEqual(rules.joinIssues(answers({ expectedGraduation: "" }), true), ["Add when you expect to graduate."]);
    assert.deepEqual(rules.joinIssues(answers({ status: "employee", expectedGraduation: "" }), true), []);
  });

  test("somebody who picks Other has to say what they do", () => {
    assert.deepEqual(rules.joinIssues(answers({ status: "other", expectedGraduation: "" }), true), [
      "Tell us what you do at UoN.",
    ]);
    assert.deepEqual(
      rules.joinIssues(answers({ status: "other", statusOther: "Visiting researcher", expectedGraduation: "" }), true),
      [],
    );
  });

  test("the two long answers are held to the limits the step counts against", () => {
    assert.deepEqual(rules.joinIssues(answers({ motivation: words(100) }), true), []);
    assert.equal(rules.joinIssues(answers({ motivation: words(101) }), true).length, 1);
    assert.deepEqual(rules.joinIssues(answers({ interests: words(50) }), true), []);
    assert.equal(rules.joinIssues(answers({ interests: words(51) }), true).length, 1);
  });

  test("it is the contract's own About you rules, so the step and a send cannot disagree", () => {
    const form = { programmeIds: [], programmes: {}, questionSetIds: [], asksFacilitating: false };
    const content = (about) => ({
      aboutYou: about,
      rankedProgrammeIds: [],
      wantsToFacilitate: null,
      answers: {},
      availability: { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15, days: [] },
      suMembership: null,
    });
    const cases = [
      rules.emptyJoinAnswers(),
      answers(),
      answers({ universityEmail: "someone@example.com" }),
      answers({ status: "other" }),
      answers({ expectedGraduation: "" }),
      answers({ motivation: words(140), interests: words(70) }),
      answers({ preferredName: "   ", subject: " " }),
    ];
    for (const about of cases) {
      const contract = validate
        .issuesFor(form, [], content(about))
        .filter((issue) => issue.step === "about")
        .map((issue) => issue.message);
      assert.deepEqual(rules.joinIssues(about, true), contract);
    }
  });

  test("nothing about the rest of the form stops a join request", () => {
    // No programme is ticked and SU membership is unanswered, which stop a
    // send of the application. Neither is this step's business.
    const said = rules.joinIssues(answers(), true).join(" ");
    assert.equal(/programme|SU membership|facilitat/i.test(said), false);
  });
});

// ---------------------------------------------------------------------------
// 2. What is sent
// ---------------------------------------------------------------------------

describe("what is sent as the join request", () => {
  const SENT_KEYS = [
    "expectedGraduation",
    "interests",
    "motivation",
    "notifications",
    "preferredName",
    "statusOther",
    "status",
    "subject",
    "universityEmail",
  ].sort();

  test("exactly the join request's own fields, whatever else the answers object carries", () => {
    const request = rules.joinRequestFrom({
      ...answers(),
      password: "hunter2",
      email: "someone@example.com",
      agreed: true,
      role: "admin",
      uniEmailVerifiedAt: new Date(),
    });
    assert.deepEqual(Object.keys(request).sort(), SENT_KEYS);
  });

  test("every field it sends is one the register page's own function takes", () => {
    const source = readFileSync(join(REPO_ROOT, "src", "auth", "signInWithGoogle.ts"), "utf8");
    const start = source.indexOf("export async function completeRegistration(profile: {");
    assert.notEqual(start, -1, "completeRegistration was not found");
    const parameter = source.slice(start, source.indexOf("}): Promise<void>", start));
    const taken = [...parameter.matchAll(/^\s{2}(\w+)\??:/gm)].map((match) => match[1]);
    assert.ok(taken.length >= 9, "the function's parameter was not read");
    for (const key of SENT_KEYS) assert.ok(taken.includes(key), `completeRegistration does not take "${key}"`);
    // And the two it could pass to say the address is verified are never sent.
    for (const key of ["verifiedTokenId", "uniEmailVerifiedAt"]) {
      assert.ok(taken.includes(key), `completeRegistration no longer takes "${key}": read this test again`);
      assert.equal(key in rules.joinRequestFrom(answers()), false);
    }
  });

  test("it never says the university address is verified", () => {
    const request = rules.joinRequestFrom(answers({ universityEmailVerified: true }));
    assert.equal(JSON.stringify(request).toLowerCase().includes("verified"), false);
  });

  test("the answers go in as typed, without the spaces around them", () => {
    const request = rules.joinRequestFrom(
      answers({
        preferredName: "  Dev ",
        universityEmail: " Someone@Nottingham.ac.uk ",
        subject: " BSc Physics ",
        motivation: "  Curious.  ",
        interests: "  Evals ",
      }),
    );
    assert.equal(request.preferredName, "Dev");
    assert.equal(request.universityEmail, "Someone@Nottingham.ac.uk");
    assert.equal(request.subject, "BSc Physics");
    assert.equal(request.motivation, "Curious.");
    assert.equal(request.interests, "Evals");
    assert.equal(request.status, "undergraduate");
    assert.equal(request.expectedGraduation, "2028-07");
  });

  test("a graduation date is sent only for a student, and a role only for Other", () => {
    const staff = rules.joinRequestFrom(answers({ status: "employee", expectedGraduation: "2028-07", statusOther: "left over" }));
    assert.equal(staff.expectedGraduation, undefined);
    assert.equal(staff.statusOther, undefined);
    const other = rules.joinRequestFrom(answers({ status: "other", statusOther: " Visiting researcher ", expectedGraduation: "2028-07" }));
    assert.equal(other.statusOther, "Visiting researcher");
    assert.equal(other.expectedGraduation, undefined);
    assert.equal(rules.joinRequestFrom(answers({ interests: "   " })).interests, undefined);
  });

  test("the email preferences are the ones for somebody who was not asked: no bulk email", () => {
    const { notifications: sent } = rules.joinRequestFrom(answers());
    assert.deepEqual(sent, notifications.DEFAULT_NOTIFICATION_PREFS);
    // The two rows a person opts IN to are off. The step shows no switch for
    // them, so nothing on it could have been a yes.
    for (const row of notifications.OPT_IN_ROWS) {
      assert.equal(sent.categories[row], false, `${row} email was switched on for somebody who was never asked`);
      assert.equal(sent.push[row], false);
    }
    for (const row of notifications.SUBSCRIPTION_CATEGORIES) assert.equal(sent.categories[row], false);
  });

  test("each join request gets its own copy of the preferences", () => {
    const first = rules.joinRequestFrom(answers());
    first.notifications.categories.newsletter = true;
    first.notifications.channels.uniEmail = true;
    assert.equal(rules.joinRequestFrom(answers()).notifications.categories.newsletter, false);
    assert.equal(notifications.DEFAULT_NOTIFICATION_PREFS.categories.newsletter, false);
    assert.equal(notifications.DEFAULT_NOTIFICATION_PREFS.channels.uniEmail, false);
  });
});

// ---------------------------------------------------------------------------
// 3. What is kept while they sign in
// ---------------------------------------------------------------------------

describe("what is kept while somebody signs in", () => {
  const NOW = Date.UTC(2026, 9, 7, 9, 0, 0);
  const KEPT_FIELDS = [
    "expectedGraduation",
    "interests",
    "motivation",
    "preferredName",
    "status",
    "statusOther",
    "subject",
    "universityEmail",
  ];

  test("the answers to the first step, and nothing else that was handed over", () => {
    const text = rules.packKept(
      {
        ...answers({ universityEmailVerified: true }),
        password: "hunter2",
        email: "someone@example.com",
        agreed: true,
        recaptchaToken: "token",
        uid: "abc",
      },
      NOW,
    );
    const kept = JSON.parse(text);
    assert.deepEqual(Object.keys(kept).sort(), ["about", "at", "v"]);
    assert.deepEqual(Object.keys(kept.about).sort(), KEPT_FIELDS);
    for (const never of ["hunter2", "agreed", "token", "abc", "someone@example.com", "erified"]) {
      assert.equal(text.includes(never), false, `the kept text carries "${never}"`);
    }
  });

  test("what was kept comes back as it went in", () => {
    const back = rules.readKept(rules.packKept(answers({ interests: "Evals" }), NOW), NOW + 60_000);
    assert.deepEqual(back, answers({ interests: "Evals" }));
  });

  test("an address that comes back is never a verified one, whatever the text says", () => {
    const forged = JSON.stringify({
      v: 1,
      at: NOW,
      about: { ...answers(), universityEmailVerified: true, uniEmailVerifiedAt: "2026-10-01" },
    });
    assert.equal(rules.readKept(forged, NOW).universityEmailVerified, false);
  });

  test("it is believed for a day and no longer, and never from the future", () => {
    const text = rules.packKept(answers(), NOW);
    assert.ok(rules.readKept(text, NOW + rules.KEPT_MAX_AGE_MS));
    assert.equal(rules.readKept(text, NOW + rules.KEPT_MAX_AGE_MS + 1), null);
    assert.equal(rules.readKept(text, NOW - 1), null);
    assert.equal(rules.KEPT_MAX_AGE_MS, 24 * 60 * 60 * 1000);
  });

  test("a caller can hold it to less than a day, and never to more", () => {
    const text = rules.packKept(answers(), NOW);
    const HOUR = 60 * 60 * 1000;
    assert.equal(rules.ACROSS_TABS_MAX_AGE_MS, HOUR, "the copy that crosses tabs is believed for an hour");
    assert.ok(rules.readKept(text, NOW + HOUR, rules.ACROSS_TABS_MAX_AGE_MS));
    assert.equal(rules.readKept(text, NOW + HOUR + 1, rules.ACROSS_TABS_MAX_AGE_MS), null);
    assert.equal(rules.readKept(text, NOW - 1, rules.ACROSS_TABS_MAX_AGE_MS), null, "a time in the future is not believed");
    // Asking for longer than a day gets a day. Asking for nonsense gets nothing.
    assert.ok(rules.readKept(text, NOW + rules.KEPT_MAX_AGE_MS, 7 * rules.KEPT_MAX_AGE_MS));
    assert.equal(rules.readKept(text, NOW + rules.KEPT_MAX_AGE_MS + 1, 7 * rules.KEPT_MAX_AGE_MS), null);
    assert.equal(rules.readKept(text, NOW + rules.KEPT_MAX_AGE_MS + 1, Infinity), null);
    for (const nonsense of [NaN, -1, -Infinity]) {
      assert.equal(rules.readKept(text, NOW, nonsense), null, `believed for ${nonsense}`);
    }
    assert.ok(rules.readKept(text, NOW, 0), "a limit of nothing still believes this instant");
  });

  test("text that is not ours is not believed", () => {
    const good = JSON.parse(rules.packKept(answers(), NOW));
    for (const bad of [
      null,
      undefined,
      "",
      "not json",
      "[]",
      "null",
      "42",
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, at: "yesterday" }),
      JSON.stringify({ ...good, at: null }),
      JSON.stringify({ ...good, about: [] }),
      JSON.stringify({ ...good, about: "Dev" }),
      JSON.stringify({ v: 1, at: NOW }),
      // Nothing typed is nothing kept.
      rules.packKept(rules.emptyJoinAnswers(), NOW),
    ]) {
      assert.equal(rules.readKept(bad, NOW), null, `believed: ${bad}`);
    }
  });

  test("each answer comes back capped, and a status the site does not offer comes back blank", () => {
    const back = rules.readKept(
      JSON.stringify({
        v: 1,
        at: NOW,
        about: {
          ...answers(),
          preferredName: "x".repeat(5000),
          motivation: "y".repeat(50_000),
          status: "wizard",
          expectedGraduation: "next summer",
          subject: 12,
        },
      }),
      NOW,
    );
    assert.equal(back.preferredName.length, users.FIELD_LIMITS.preferredName);
    assert.equal(back.motivation.length, users.FIELD_LIMITS.motivation);
    assert.equal(back.status, "");
    assert.equal(back.expectedGraduation, "");
    assert.equal(back.subject, "");
  });

  test("a name every object carries is not read as an answer", () => {
    const back = rules.readKept(
      `{"v":1,"at":${NOW},"about":{"preferredName":"Dev","__proto__":{"motivation":"smuggled"},"constructor":"x"}}`,
      NOW,
    );
    assert.equal(back.preferredName, "Dev");
    assert.equal(back.motivation, "");
    assert.equal(Object.getPrototypeOf(back), Object.prototype);
  });

  test("there is one key per form, under the site's own prefix", () => {
    assert.equal(rules.keptKey("autumn-2026__k3f9a2b1"), "naisi.apply.join:autumn-2026__k3f9a2b1");
    assert.notEqual(rules.keptKey("a"), rules.keptKey("b"));
  });

  test("kept answers go under what is already typed, and never over it", () => {
    const typed = { ...rules.emptyJoinAnswers(), preferredName: "Devika", status: "employee" };
    const merged = rules.withKept(typed, answers());
    assert.equal(merged.preferredName, "Devika", "an answer already on the screen was replaced");
    assert.equal(merged.subject, "BSc Physics");
    assert.equal(merged.status, "employee");
    // The kept date belonged to a student. This person has said they are staff.
    assert.equal(merged.expectedGraduation, "");
    assert.equal(merged.universityEmailVerified, false);
    assert.equal(rules.withKept(rules.emptyJoinAnswers(), answers({ status: "other", statusOther: "Visitor" })).statusOther, "Visitor");
    assert.equal(rules.withKept({ ...rules.emptyJoinAnswers(), status: "phd" }, answers({ status: "other", statusOther: "Visitor" })).statusOther, "");
  });

  test("hasJoinAnswers is false for a blank step and true for one character", () => {
    assert.equal(rules.hasJoinAnswers(rules.emptyJoinAnswers()), false);
    assert.equal(rules.hasJoinAnswers({ ...rules.emptyJoinAnswers(), interests: "  " }), false);
    assert.equal(rules.hasJoinAnswers({ ...rules.emptyJoinAnswers(), interests: "x" }), true);
  });
});

// ---------------------------------------------------------------------------
// 3b. The copy that crosses tabs, and its three limits
// ---------------------------------------------------------------------------

/**
 * The step's own keeper (`keptAnswers.ts`) is run here against two stand-in
 * stores: `tab` for the tab's session storage and `shared` for the browser's
 * local storage, which every tab reads. Each remembers what was asked of it,
 * so a test can say that nothing was written, not only that nothing is there.
 *
 * The keeper remembers, in memory, which forms its page has asked for an
 * emailed link for. So every test uses a form id of its own: a form nobody
 * has asked about is a page that has not asked.
 */
describe("the copy that crosses tabs, and its three limits", () => {
  const T = Date.UTC(2026, 9, 7, 9, 0, 0);
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;

  function store(initial = {}) {
    const items = new Map(Object.entries(initial));
    const asked = [];
    return {
      items,
      asked,
      wrote: () => asked.filter(([what]) => what === "set"),
      getItem(key) {
        asked.push(["get", key]);
        return items.has(key) ? items.get(key) : null;
      },
      setItem(key, value) {
        asked.push(["set", key]);
        items.set(key, String(value));
      },
      removeItem(key) {
        asked.push(["remove", key]);
        items.delete(key);
      },
    };
  }
  const refusing = () => ({
    getItem() {
      throw new Error("refused");
    },
    setItem() {
      throw new Error("refused");
    },
    removeItem() {
      throw new Error("refused");
    },
  });
  /** One browser tab: its own store, and the store it shares with every other tab. */
  function browser(t, { tab = store(), shared = store() } = {}) {
    globalThis.window = { sessionStorage: tab, localStorage: shared };
    t.after(() => {
      delete globalThis.window;
    });
    return { tab, shared };
  }
  /** A second tab of the same browser: nothing of its own, the same shared store. */
  const anotherTab = (shared) => {
    globalThis.window = { sessionStorage: store(), localStorage: shared };
  };

  test("LIMIT 1: nothing is written unless a link has been emailed, whatever else the step does", (t) => {
    const round = "limit-one__never-asked";
    const { tab, shared } = browser(t);
    // Everything the step does for somebody who continues with Google, or who
    // goes to the sign-in page, or who has not chosen a way yet: it keeps what
    // they type in the tab, on every change, and reads it back.
    keptAnswers.keepAnswers(round, answers());
    keptAnswers.keepAnswers(round, answers({ interests: "Evals" }));
    assert.equal(keptAnswers.acrossTabs(round, "answers-changed"), null);
    assert.deepEqual(keptAnswers.loadKept(round), answers({ interests: "Evals" }));
    assert.ok(tab.items.has(rules.keptKey(round)), "the tab kept nothing, so this test proves nothing");
    assert.deepEqual(shared.wrote(), [], "something was written to local storage for somebody who never asked for a link");
    assert.equal(shared.items.size, 0);
  });

  test("LIMIT 1: the copy is made when a link has been emailed, and is the tab's own text", (t) => {
    const round = "limit-one__asked";
    const { tab, shared } = browser(t);
    tab.items.set(rules.keptKey(round), rules.packKept(answers(), T));
    assert.equal(keptAnswers.acrossTabs(round, "link-emailed", T + MINUTE), null, "only a read answers with anything");
    const copy = shared.items.get(rules.keptKey(round));
    assert.equal(copy, tab.items.get(rules.keptKey(round)), "what crossed is not what the tab holds");
    // So it is the first step's answers and when they were last changed, and
    // nothing else: the same object `packKept` makes.
    assert.deepEqual(Object.keys(JSON.parse(copy)).sort(), ["about", "at", "v"]);
    assert.equal(JSON.parse(copy).at, T, "the copy carries a time that is not when the answers were last changed");
    assert.deepEqual([...shared.items.keys()], ["naisi.apply.join:limit-one__asked"]);
  });

  test("LIMIT 1: a form nobody asked a link for is not touched by a link asked for another", (t) => {
    const { tab, shared } = browser(t);
    tab.items.set(rules.keptKey("limit-one__form-a"), rules.packKept(answers(), T));
    tab.items.set(rules.keptKey("limit-one__form-b"), rules.packKept(answers(), T));
    keptAnswers.acrossTabs("limit-one__form-a", "link-emailed", T);
    keptAnswers.acrossTabs("limit-one__form-b", "answers-changed", T);
    assert.deepEqual([...shared.items.keys()], [rules.keptKey("limit-one__form-a")]);
  });

  test("LIMIT 1: the step asks for the copy in one place, once the register route has taken the address", () => {
    const step = codeOf("JoinStep.tsx");
    assert.equal((step.match(/acrossTabs\(/g) ?? []).length, 1, "the step asks for the copy in more than one place");
    const onEmail = step.slice(step.indexOf("const onEmail = useCallback("), step.indexOf("const onProblem"));
    assert.match(
      onEmail,
      /if \(!started\.ok\) \{\s*setError\(started\.error\);\s*return;\s*\}\s*acrossTabs\(roundId, "link-emailed"\);/,
      "the copy is no longer made straight after the register route has said yes, and only then",
    );
    // Nowhere a Google credential arrives, a session is read or a join request
    // is sent, and in no other file of the form's folder.
    for (const file of readdirSync(FORM_DIR).filter((name) => /\.tsx?$/.test(name))) {
      const code = codeOf(file);
      const makes = (code.match(/"link-emailed"/g) ?? []).length;
      if (file === "JoinStep.tsx") assert.equal(makes, 1);
      else if (file === "keptAnswers.ts") assert.equal(makes, 2, "the ask is named where it is declared and where it is answered");
      else assert.equal(makes, 0, `${file} asks for a copy that crosses tabs`);
    }
  });

  test("LIMIT 2: the copy is believed for an hour from when the answers were last changed, and no longer", (t) => {
    const round = "limit-two__an-hour";
    const { tab, shared } = browser(t);
    tab.items.set(rules.keptKey(round), rules.packKept(answers(), T));
    keptAnswers.acrossTabs(round, "link-emailed", T + MINUTE);
    anotherTab(shared);
    assert.deepEqual(keptAnswers.acrossTabs(round, "read", T + HOUR), answers(), "the link's tab was not left the answers");
    assert.ok(shared.items.has(rules.keptKey(round)), "a copy that is still believed was thrown away");
    assert.equal(keptAnswers.acrossTabs(round, "read", T + HOUR + 1), null, "a copy past its hour was believed");
    assert.equal(shared.items.has(rules.keptKey(round)), false, "a copy past its hour was left in local storage");
  });

  test("LIMIT 2: answers last changed more than an hour ago do not cross at all", (t) => {
    const round = "limit-two__too-old";
    const { tab, shared } = browser(t);
    tab.items.set(rules.keptKey(round), rules.packKept(answers(), T));
    keptAnswers.acrossTabs(round, "link-emailed", T + HOUR + 1);
    assert.deepEqual(shared.wrote(), []);
    // The tab still believes its own for the rest of the day.
    assert.deepEqual(rules.readKept(tab.items.get(rules.keptKey(round)), T + HOUR + 1), answers());
  });

  test("LIMIT 2: a page that opens reads the copy with the hour, and its own tab's with the day", (t) => {
    const round = "limit-two__which-clock";
    const real = Date.now();
    const { tab, shared } = browser(t, {
      shared: store({ [rules.keptKey(round)]: rules.packKept(answers({ preferredName: "Shared" }), real - HOUR - MINUTE) }),
    });
    assert.equal(keptAnswers.loadKept(round), null, "the page believed a copy more than an hour old");
    assert.equal(shared.items.size, 0, "and left it there");
    tab.items.set(rules.keptKey(round), rules.packKept(answers({ preferredName: "Tab" }), real - HOUR - MINUTE));
    assert.equal(keptAnswers.loadKept(round).preferredName, "Tab", "the tab's own copy is believed for a day");
  });

  test("LIMIT 3: forgetting removes the copy with the tab's own, in whichever tab the join request went from", (t) => {
    const round = "limit-three__sent";
    const { tab, shared } = browser(t);
    tab.items.set(rules.keptKey(round), rules.packKept(answers(), T));
    keptAnswers.acrossTabs(round, "link-emailed", T);
    assert.equal(shared.items.size, 1);
    // The link's tab is where the join request is sent from.
    anotherTab(shared);
    keptAnswers.forgetAnswers(round);
    assert.equal(shared.items.size, 0, "the join request has gone and the copy is still in local storage");
    // And the first tab forgets its own when it learns of it.
    globalThis.window = { sessionStorage: tab, localStorage: shared };
    keptAnswers.forgetAnswers(round);
    assert.equal(tab.items.size, 0);
  });

  test("LIMIT 3: the step forgets the moment the join request has been sent, and before anything else", () => {
    const step = codeOf("JoinStep.tsx");
    const finish = step.slice(step.indexOf("const finishJoin = useCallback("), step.indexOf("const check = useCallback("));
    assert.match(
      finish,
      /await completeRegistration\(joinRequestFrom\(answers\)\);\s*\} catch \(err\) \{[^}]*return false;\s*\}\s*forgetAnswers\(roundId\);/,
      "something now sits between the join request being sent and what was kept being thrown away",
    );
    // `forgetAnswers` is the tab's own copy and the one that crosses, together.
    const keeper = codeOf("keptAnswers.ts");
    const forget = keeper.slice(keeper.indexOf("export function forgetAnswers("));
    assert.match(forget, /keptStore\(\)\?\.removeItem\(keptKey\(roundId\)\);/);
    assert.match(forget, /acrossTabs\(roundId, "forget"\);/);
  });

  test("once forgotten, a later change on the same page starts no new copy", (t) => {
    const round = "limit-three__no-restart";
    const { tab, shared } = browser(t);
    tab.items.set(rules.keptKey(round), rules.packKept(answers(), T));
    keptAnswers.acrossTabs(round, "link-emailed", T);
    keptAnswers.forgetAnswers(round);
    keptAnswers.keepAnswers(round, answers({ interests: "Typed after" }));
    assert.ok(tab.items.has(rules.keptKey(round)));
    assert.equal(shared.items.size, 0);
  });

  test("on the page that asked, a change to the answers reaches the copy, and emptying them removes it", (t) => {
    const round = "refresh__asked";
    const { tab, shared } = browser(t);
    keptAnswers.keepAnswers(round, answers());
    keptAnswers.acrossTabs(round, "link-emailed");
    keptAnswers.keepAnswers(round, answers({ interests: "Changed after the link was asked for" }));
    assert.equal(shared.items.get(rules.keptKey(round)), tab.items.get(rules.keptKey(round)));
    assert.equal(keptAnswers.acrossTabs(round, "read").interests, "Changed after the link was asked for");
    keptAnswers.keepAnswers(round, rules.emptyJoinAnswers());
    assert.equal(tab.items.size, 0);
    assert.equal(shared.items.size, 0);
  });

  test("the link's tab is given the copy, and a tab's own answers come before it", (t) => {
    const round = "read__the-links-tab";
    const { shared } = browser(t, {
      shared: store({ [rules.keptKey(round)]: rules.packKept(answers({ preferredName: "First tab" }), Date.now()) }),
    });
    assert.equal(keptAnswers.loadKept(round).preferredName, "First tab");
    keptAnswers.keepAnswers(round, answers({ preferredName: "This tab" }));
    assert.equal(keptAnswers.loadKept(round).preferredName, "This tab");
    // Typing in the link's tab starts no copy of its own: this page asked for no link.
    assert.equal(JSON.parse(shared.items.get(rules.keptKey(round))).about.preferredName, "First tab");
    assert.deepEqual(shared.wrote(), []);
  });

  test("what comes back from the copy is read as carefully as the tab's own", (t) => {
    const round = "read__forged";
    browser(t, {
      shared: store({
        [rules.keptKey(round)]: JSON.stringify({
          v: 1,
          at: T,
          about: { ...answers(), universityEmailVerified: true, status: "wizard", password: "hunter2" },
        }),
      }),
    });
    const back = keptAnswers.acrossTabs(round, "read", T);
    assert.equal(back.universityEmailVerified, false);
    assert.equal(back.status, "");
    assert.equal("password" in back, false);
  });

  test("text in the copy that is not ours is not believed, and is thrown away", (t) => {
    for (const [at, bad] of ["not json", "[]", JSON.stringify({ v: 2, at: T, about: answers() })].entries()) {
      const round = `read__not-ours-${at}`;
      const { shared } = browser(t, { shared: store({ [rules.keptKey(round)]: bad }) });
      assert.equal(keptAnswers.acrossTabs(round, "read", T), null, `believed: ${bad}`);
      assert.equal(shared.items.size, 0);
    }
  });

  test("a browser whose stores are missing or refuse keeps nothing across tabs, and nothing throws", (t) => {
    const round = "refused__everything";
    const asks = ["link-emailed", "answers-changed", "read", "forget"];
    t.after(() => {
      delete globalThis.window;
    });
    // No browser at all: the page is being drawn on the server.
    for (const ask of asks) assert.equal(keptAnswers.acrossTabs(round, ask, T), null);
    assert.equal(keptAnswers.loadKept(round), null);
    keptAnswers.keepAnswers(round, answers());
    keptAnswers.forgetAnswers(round);
    // A browser that refuses both stores, and one whose stores throw on being asked for.
    for (const fake of [
      { sessionStorage: refusing(), localStorage: refusing() },
      {
        get sessionStorage() {
          throw new Error("refused");
        },
        get localStorage() {
          throw new Error("refused");
        },
      },
      {},
    ]) {
      globalThis.window = fake;
      for (const ask of asks) assert.equal(keptAnswers.acrossTabs(round, ask, T), null);
      assert.equal(keptAnswers.loadKept(round), null);
      keptAnswers.keepAnswers(round, answers());
      keptAnswers.forgetAnswers(round);
    }
    // Local storage alone refuses: the tab still keeps its own.
    const tab = store();
    globalThis.window = { sessionStorage: tab, localStorage: refusing() };
    keptAnswers.keepAnswers(round, answers());
    keptAnswers.acrossTabs(round, "link-emailed");
    assert.deepEqual(keptAnswers.loadKept(round), answers());
    keptAnswers.forgetAnswers(round);
    assert.equal(tab.items.size, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. What holds a send
// ---------------------------------------------------------------------------

describe("what holds a send", () => {
  const unchecked = answers({ universityEmailVerified: false });
  const checked = answers({ universityEmailVerified: true });

  test("a waiting account whose university address has not been checked is held, on the last step", () => {
    assert.deepEqual(rules.sendHoldFor({ joined: true, role: "pending", about: unchecked }), {
      step: "check",
      questionId: null,
      message: rules.VERIFY_FIRST,
    });
  });

  test("the same account is not held once the address is checked", () => {
    assert.equal(rules.sendHoldFor({ joined: true, role: "pending", about: checked }), null);
  });

  test("an approved account is not asked again, whatever its address says", () => {
    for (const role of ["member", "committee", "admin"]) {
      assert.equal(rules.sendHoldFor({ joined: true, role, about: unchecked }), null, role);
      assert.equal(rules.mustVerifyBeforeSending(role), false, role);
    }
    assert.equal(rules.mustVerifyBeforeSending("pending"), true);
  });

  test("an account with no join request is held whatever else is true of it, on the first step", () => {
    for (const role of ["pending", "member", "admin"]) {
      for (const about of [unchecked, checked, rules.emptyJoinAnswers()]) {
        assert.deepEqual(rules.sendHoldFor({ joined: false, role, about }), {
          step: "about",
          questionId: null,
          message: rules.JOIN_FIRST,
        });
      }
    }
  });

  test("a waiting account with no address at all is left to the About you rules", () => {
    // `issuesFor` already says "Add your university email." This hold is for
    // an address that is there and unproved, and says a different thing.
    assert.equal(rules.sendHoldFor({ joined: true, role: "pending", about: answers({ universityEmail: " " }) }), null);
  });

  test("the sentences say what to do, and never one of the words applicants do not read", async () => {
    const { WORDS_APPLICANTS_NEVER_SEE } = await loadTs(join("lib", "applications", "words.ts"));
    for (const sentence of [rules.VERIFY_FIRST, rules.JOIN_FIRST, rules.CONSENT_NEEDED]) {
      // Built from the two code points, so this file carries neither dash.
      assert.equal(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`).test(sentence), false);
      for (const word of WORDS_APPLICANTS_NEVER_SEE) assert.equal(sentence.toLowerCase().includes(word), false, word);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Where the emailed link may return to
// ---------------------------------------------------------------------------

describe("where the emailed link may return to", () => {
  const ID = "autumn-2026__k3f9a2b1";

  test("this form, at an address registration is allowed to hand people back to", () => {
    const address = rules.joinReturnFor(ID);
    assert.equal(address, `/apply/${ID}?join=1`);
    assert.equal(authReturn.safeFunnelReturn(address), address, "the register route would refuse this return address");
    assert.equal(rules.formJoinReturn(address), address);
  });

  test("nothing that only looks like it", () => {
    for (const other of [
      `/apply/${ID}`,
      `/apply/${ID}?join=0`,
      `/apply/${ID}?join=1&next=https://example.com`,
      `/apply/${ID}?join=1#x`,
      `/apply/${ID}/extra?join=1`,
      `/apply/../admin?join=1`,
      `/apply/?join=1`,
      `/courses/${ID}?join=1`,
      `//example.com/apply/${ID}?join=1`,
      `https://example.com/apply/${ID}?join=1`,
      ` /apply/${ID}?join=1`,
      `/apply/${ID}?join=1\n`,
      `/apply/${"a".repeat(201)}?join=1`,
      "",
      null,
      undefined,
      42,
      { toString: () => `/apply/${ID}?join=1` },
    ]) {
      assert.equal(rules.formJoinReturn(other), null, `accepted: ${String(other)}`);
    }
  });

  test("the page the emailed link opens hands a form's own registrations back to the form", () => {
    const landing = readFileSync(
      join(REPO_ROOT, "src", "app", "verify-email", "[tokenId]", "LoginEmailVerified.tsx"),
      "utf8",
    );
    assert.match(landing, /import \{ formJoinReturn \} from "@\/lib\/applications\/applicant\/join";/);
    // A member's, and only an address the form itself marked. Everything else
    // still finishes at the register page, as it always has.
    assert.match(landing, /const onTheForm = audience === "member" \? formJoinReturn\(next\) : null;/);
    assert.match(landing, /const continueUrl = onTheForm\s*\? onTheForm\s*: next/);
    assert.match(landing, /router\.replace\(continueUrl\);/);
  });

  test("every address it accepts is one the site's own return list accepts", () => {
    for (const id of ["a", "A_b-9", ID]) {
      const address = rules.joinReturnFor(id);
      assert.equal(rules.formJoinReturn(address), address);
      assert.equal(authReturn.isFunnelReturn(address), true);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Where signing in returns to
// ---------------------------------------------------------------------------

describe("where signing in returns to", () => {
  const ID = "autumn-2026__k3f9a2b1";
  const BARE = `/apply/${ID}`;
  const MARKED = `/apply/${ID}?join=1`;
  const FORM_ROUTE = `/api/admissions/forms/${ID}/application`;

  /**
   * The sign-in page's own guard on its return address, with the page's own
   * fallback. The guard is `safeReturnPath` (`src/lib/signInReturn.ts`), the
   * one every copy of the address passes, and it is RUN here, not copied. A
   * test below holds the page to calling it.
   */
  const guarded = (next) => signInReturn.safeReturnPath(next) ?? "/dashboard";

  /**
   * Run `work` with the page's `fetch` replaced by `answer`, and say what was
   * asked for. Nothing here reaches a network.
   */
  async function asking(answer, work) {
    const real = globalThis.fetch;
    const asked = [];
    globalThis.fetch = async (url, init) => {
      asked.push({ url: String(url), init: init ?? {} });
      return answer();
    };
    try {
      return { went: await work(), asked };
    } finally {
      globalThis.fetch = real;
    }
  }
  const says = (body, status = 200) => () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const OPEN_AND_NOT_JOINED = { joined: false, account: { universityEmailVerified: false }, form: { windowState: "open" } };

  test("the step's way to the sign-in page is one address, made from the form's id, carrying the mark", () => {
    const href = rules.signInHrefFor(ID);
    assert.equal(href, `/login?next=${encodeURIComponent(MARKED)}`);
    // What the sign-in page reads back out of it is the address the form
    // marks, which the site's own return list accepts.
    const carried = new URL(href, "https://naisi.test").searchParams.get("next");
    assert.equal(carried, rules.joinReturnFor(ID));
    assert.equal(rules.formJoinReturn(carried), MARKED);
    assert.equal(authReturn.isFunnelReturn(carried), true);
    assert.deepEqual(rules.newAccountReturn(guarded(carried)), { to: "form", href: MARKED });
  });

  test("an address the step marked goes straight back to the step", () => {
    assert.deepEqual(rules.newAccountReturn(MARKED), { to: "form", href: MARKED });
  });

  test("an address with a form's shape and no mark is asked about, and never taken on trust", () => {
    // An older round lives at the same kind of address and needs the register
    // page's profile form first, so the address alone cannot send anybody to
    // a form. What is handed back to ask with is the id, and the address to
    // go to if the answer is yes is the marked one, built from that id.
    assert.deepEqual(rules.newAccountReturn(BARE), { to: "ask", roundId: ID, href: MARKED });
    for (const id of ["a", "A_b-9", "sample-term__seed0001", "x".repeat(200)]) {
      assert.deepEqual(rules.newAccountReturn(`/apply/${id}`), {
        to: "ask",
        roundId: id,
        href: rules.joinReturnFor(id),
      });
    }
  });

  test("every other address, and no address, is the register page as it always was", () => {
    for (const other of [
      // No return address at all, and the sign-in page's own default.
      null,
      undefined,
      "",
      "/dashboard",
      // Something after the form's address.
      `${BARE}/something-else`,
      `${BARE}/`,
      `${BARE}?join=0`,
      `${BARE}?join=1&next=https://example.com`,
      `${BARE}?step=choose`,
      `${BARE}#account`,
      `${MARKED}#account`,
      // Another site, however it is spelt.
      "//evil.example",
      `//evil.example${BARE}`,
      `https://evil.example${BARE}`,
      `/\\evil.example${BARE}`,
      "javascript:alert(1)",
      // A path that climbs out of the form's folder, plain or encoded.
      "/apply/../admin",
      "/apply/..",
      "/apply/%2e%2e",
      "/apply/a%2Fb",
      "/apply/",
      "/apply",
      // The other funnel, and an address that only begins like this one.
      "/courses/intro/apply",
      `/applications/${ID}`,
      `/applyx/${ID}`,
      // An id longer than any the site makes, and stray characters round a good one.
      `/apply/${"a".repeat(201)}`,
      ` ${BARE}`,
      `${BARE} `,
      `${BARE}\n`,
      `${BARE}\u0000`,
      // Not text.
      42,
      [BARE],
      { toString: () => BARE },
    ]) {
      assert.deepEqual(rules.newAccountReturn(other), { to: "register" }, `not the register page: ${String(other)}`);
    }
  });

  test("the address handed back never carries anything of the address handed in", () => {
    // Both answers that lead to a form are an address `joinReturnFor` makes,
    // whole. So whatever a return address was dressed in, the only thing that
    // survives is an id the pattern has already matched from end to end.
    for (const given of [MARKED, BARE, `/apply/sample-term__seed0001`, `/apply/Z9_-`]) {
      const where = rules.newAccountReturn(given);
      assert.notEqual(where.to, "register");
      assert.match(where.href, /^\/apply\/[A-Za-z0-9_-]{1,200}\?join=1$/);
      assert.equal(rules.formJoinReturn(where.href), where.href);
      assert.equal(authReturn.safeFunnelReturn(where.href), where.href);
    }
  });

  test("what the sign-in page's own guard lets through, this rule still sorts", () => {
    // `AuthEntry.tsx` holds `?next=` to a path on this site before anything
    // reads it. The two together, for each address a person could arrive with.
    const lands = (next) => rules.newAccountReturn(guarded(next));
    assert.deepEqual(lands(BARE), { to: "ask", roundId: ID, href: MARKED });
    assert.deepEqual(lands(MARKED), { to: "form", href: MARKED });
    assert.deepEqual(lands(`${BARE}/something-else`), { to: "register" });
    assert.deepEqual(lands("//evil"), { to: "register" });
    assert.deepEqual(lands("/apply/../admin"), { to: "register" });
    assert.deepEqual(lands(null), { to: "register" });
    // An address a browser reads as another site's never reaches the rule:
    // the page's own fallback does.
    assert.equal(guarded("/\\evil.example"), "/dashboard");
    assert.equal(guarded(`${MARKED}\n`), "/dashboard");
    assert.deepEqual(lands("/\\evil.example"), { to: "register" });
    // And the guard run here is the one the page has. Read from the file,
    // because the page is a component and nothing here can run it. The page
    // takes its address from `returnOnArrival`, which reads `?next=` and, for
    // somebody the callback route sent back with none, the tab's own copy;
    // tests/sign-in-return.test.mjs runs that function and the guard.
    const entry = stripSource(readFileSync(join(REPO_ROOT, "src", "app", "(auth)", "AuthEntry.tsx"), "utf8"), {
      keepStrings: true,
    });
    assert.match(entry, /const \[next\] = useState\(\(\) => returnOnArrival\(params, tabReturn\)\);/);
    assert.match(entry, /const safeNext = safeReturnPath\(next\) \?\? "\/dashboard";/);
  });

  test("a marked address is answered without asking anybody", async () => {
    const { went, asked } = await asking(says(OPEN_AND_NOT_JOINED), () => joinClient.joinStepForNewAccount(MARKED));
    assert.equal(went, MARKED);
    assert.deepEqual(asked, [], "the form's route was asked about an address the form itself marked");
  });

  test("a bare form address is answered by the form's own route, asked once", async () => {
    const { went, asked } = await asking(says(OPEN_AND_NOT_JOINED), () => joinClient.joinStepForNewAccount(BARE));
    assert.equal(went, MARKED);
    // The one route, read and never written, and never from a cache: the
    // sign-in that is asking is seconds old.
    assert.equal(asked.length, 1);
    assert.equal(asked[0].url, FORM_ROUTE);
    assert.deepEqual(asked[0].init, { cache: "no-store" });
  });

  test("only a form that is open, with no join request from this account, takes the person back", async () => {
    const cases = [
      ["the account already has a join request", says({ ...OPEN_AND_NOT_JOINED, joined: true })],
      ["the form has not opened yet", says({ ...OPEN_AND_NOT_JOINED, form: { windowState: "not-yet" } })],
      ["the form has closed", says({ ...OPEN_AND_NOT_JOINED, form: { windowState: "closed" } })],
      ["the answer does not say whether the form is open", says({ joined: false })],
      ["an older round, or a round that is not there", says({ error: "Not found." }, 404)],
      ["no session reached the route", says({ error: "Not signed in." }, 401)],
      ["an account that cannot apply", says({ error: "This account cannot apply." }, 403)],
      ["the route failed", says({ error: "Could not load your application." }, 500)],
      ["an answer that is not JSON", () => new Response("<html>", { status: 200 })],
      ["the site could not be reached", () => Promise.reject(new TypeError("fetch failed"))],
    ];
    for (const [what, answer] of cases) {
      const { went, asked } = await asking(answer, () => joinClient.joinStepForNewAccount(BARE));
      assert.equal(went, null, what);
      assert.equal(asked.length, 1, what);
    }
  });

  test("a route that never answers is not waited for", async () => {
    // A sign-in is finishing when this is asked. A person is not left on the
    // sign-in page for it: after the limit the answer is "the register page",
    // which is where they went before this rule existed.
    // Raced against a clock of this test's own, so a limit that has gone
    // missing fails here by name and does not hang the suite.
    const real = globalThis.fetch;
    let clock;
    globalThis.fetch = () => new Promise(() => {});
    try {
      const went = await Promise.race([
        joinClient.joinStepForNewAccount(BARE, 40),
        new Promise((resolve) => {
          clock = setTimeout(() => resolve("still waiting"), 2000);
        }),
      ]);
      assert.equal(went, null, "the limit handed in was not the limit kept");
    } finally {
      clearTimeout(clock);
      globalThis.fetch = real;
    }
    assert.ok(joinClient.ASK_THE_FORM_MS > 0 && joinClient.ASK_THE_FORM_MS <= 5000, "the wait a person can be kept is over five seconds");
    const client = codeOf("joinClient.ts");
    assert.match(client, /limitMs: number = ASK_THE_FORM_MS\b/);
  });

  test("an address that is not a form's is answered without asking, and is nowhere of the form's", async () => {
    for (const other of ["/dashboard", "", `${BARE}/something-else`, "//evil", "/apply/../admin", "/courses/intro/apply"]) {
      const { went, asked } = await asking(says(OPEN_AND_NOT_JOINED), () => joinClient.joinStepForNewAccount(other));
      assert.equal(went, null, other);
      assert.deepEqual(asked, [], `asked the form's route about ${other}`);
    }
  });

  test("the sign-in page asks before it sends a new Google account anywhere", () => {
    // HELD BY READING THE FILE. This branch runs after a sign-in with Google
    // that found no account, and nothing in this suite can make one.
    const entry = stripSource(readFileSync(join(REPO_ROOT, "src", "app", "(auth)", "AuthEntry.tsx"), "utf8"), {
      keepStrings: true,
    });
    assert.match(entry, /import \{ joinStepForNewAccount \} from "@\/features\/applications\/apply\/joinClient";/);
    const from = entry.indexOf("if (result.isNew) {");
    assert.ok(from !== -1, "the branch for a new account is gone");
    const body = entry.slice(from, entry.indexOf("return;", from));
    // The collaborator route is never asked and keeps its own branch; anybody
    // else is asked with the address the page's own guard has already held
    // to this site.
    assert.match(
      body,
      /const onTheForm =\s*mode === "register" && audience === "collaborator"\s*\? null\s*: await joinStepForNewAccount\(safeNext\);/,
    );
    // The form comes before the register page, and the register page is still
    // what everything else gets, with a funnel's return address or bare.
    assert.match(
      body,
      /const funnelNext = isFunnelReturn\(safeNext\)\s*\? `\/register\?next=\$\{encodeURIComponent\(safeNext\)\}`\s*: "\/register";/,
    );
    assert.match(
      body,
      /router\.replace\(\s*mode === "register" && audience === "collaborator"\s*\? "\/register\?type=collaborator"\s*: \(onTheForm \?\? funnelNext\),\s*\);/,
    );
    // One way out of the branch, and it is that one.
    assert.equal((body.match(/router\.(?:replace|push)\(|hardNavigate\(/g) ?? []).length, 1, "a second way out of the branch for a new account");
    // Asked while the sign-in is still marked as in hand, so the page's other
    // effects do not start moving it somewhere in the meantime.
    assert.ok(
      body.indexOf("await joinStepForNewAccount(safeNext)") < body.indexOf("credentialReceivedRef.current = false;"),
      "the sign-in is marked finished before the form has been asked",
    );
  });

  test("the sign-in page asks before it sends an email account with no join request anywhere", () => {
    // HELD BY READING THE FILE, for the same reason: the branch runs after a
    // real sign-in. Somebody who made an account by email, chose a password
    // and never sent a join request has neither kind of record. From a form,
    // that person belongs on the form's first step; from anywhere else the
    // sign-in page still offers the collaborator application.
    const entry = stripSource(readFileSync(join(REPO_ROOT, "src", "app", "(auth)", "AuthEntry.tsx"), "utf8"), {
      keepStrings: true,
    });
    const from = entry.indexOf("const result = await signInWithEmailPassword(trimmed, password);");
    assert.ok(from !== -1, "the email sign-in is gone");
    const body = entry.slice(from, entry.indexOf("} catch (err) {", from));
    // An account that has a record goes where it always went, and is not asked about.
    assert.match(body, /if \(result\.kind === "collaborator" \|\| result\.kind === "member"\) \{/);
    assert.match(body, /const dest =\s*result\.kind === "collaborator" \? "\/collaborator" : safeNext;/);
    const known = body.slice(0, body.indexOf("} else {"));
    assert.equal(/joinStepForNewAccount/.test(known), false, "an account with a record is asked about");
    // One with neither is asked, and the collaborator application is what is left.
    assert.match(body, /\} else \{\s*router\.push\(\(await joinStepForNewAccount\(safeNext\)\) \?\? "\/register\?type=collaborator"\);\s*\}/);
    assert.equal((body.match(/router\.(?:replace|push)\(/g) ?? []).length, 1);
    // The function is called from these two branches of the page and nowhere else on it.
    assert.equal((entry.match(/joinStepForNewAccount\(/g) ?? []).length, 2);
  });

  test("the step's three links to the sign-in page are that one address", () => {
    const step = codeOf("JoinStep.tsx");
    assert.match(step, /const signInHref = signInHrefFor\(roundId\);/);
    assert.match(step, /<JoinAccount\s+signInHref=\{signInHref\}/);
    const account = codeOf("JoinAccount.tsx");
    // Somebody who has an account, the same from the screen that says to
    // check an inbox, and the route to Google where its own button cannot be
    // drawn. No other link on either half leaves the form for a page that
    // asks who somebody is.
    assert.equal((account.match(/<Link href=\{signInHref\}/g) ?? []).length, 3);
    assert.deepEqual([...new Set(account.match(/href=(?:"[^"]*"|\{[^}]*\})/g) ?? [])], ["href={signInHref}"]);
    for (const file of ["JoinStep.tsx", "JoinAccount.tsx"]) {
      assert.equal(/["'`]\/(?:login|register)\b/.test(codeOf(file)), false, `${file} spells out a way off the form`);
    }
  });

  test("the step does not tell somebody new they will be asked the questions somewhere else", () => {
    // True while the sign-in page sent a new account on to the register page.
    // It brings one back here now, so the sentence under the link says that.
    const account = sourceOf("JoinAccount.tsx").replace(/\s+/g, " ");
    assert.ok(account.includes("Google opens its own page and brings you back to this form."));
    assert.equal(/asked these questions there/.test(account), false);
  });
});

// ---------------------------------------------------------------------------
// 7. The files that use the rules
// ---------------------------------------------------------------------------

describe("the join step keeps to them", () => {
  const formFiles = readdirSync(FORM_DIR);
  const JOIN_FILES = ["JoinStep.tsx", "JoinAccount.tsx", "joinClient.ts", "keptAnswers.ts"];

  test("the walk found the step", () => {
    for (const file of JOIN_FILES) assert.ok(formFiles.includes(file), `${file} is gone`);
  });

  test("answers are kept in the tab's own store, and one function alone reaches a store that outlives the tab", () => {
    const kept = codeOf("keptAnswers.ts");
    assert.match(kept, /window\.sessionStorage/);
    // Every file in the form's folder: a second place to keep something would
    // be a second thing the privacy page has to list.
    for (const file of formFiles.filter((name) => /\.tsx?$/.test(name))) {
      const code = codeOf(file);
      assert.equal(/\bindexedDB\b|document\.cookie/.test(code), false, `${file} keeps something outside the tab`);
      if (file !== "keptAnswers.ts") {
        assert.equal(/\blocalStorage\b/.test(code), false, `${file} keeps something outside the tab`);
        assert.equal(/\bsessionStorage\b/.test(code), false, `${file} reaches the tab's store without going through keptAnswers.ts`);
      }
    }
    // The browser's local storage outlives the tab, and the privacy page says
    // what is kept there, for whom, for how long and until when. So it is
    // named once in the whole folder, inside the one function that holds the
    // copy to those limits, and nowhere else in its own file.
    assert.equal((kept.match(/\blocalStorage\b/g) ?? []).length, 1, "local storage is reached in more than one place");
    const from = kept.indexOf("export function acrossTabs(");
    const to = kept.indexOf("export function loadKept(");
    assert.ok(from !== -1 && to > from, "the function that holds the copy that crosses tabs has gone, or has moved below its callers");
    assert.match(kept.slice(from, to), /const shared = window\.localStorage;/);
    assert.equal(/\bshared\b/.test(kept.slice(0, from) + kept.slice(to)), false, "the shared store is used outside the one function");
    // And the tab's own store is session storage and nothing else.
    assert.match(kept, /return typeof window === "undefined" \? null : window\.sessionStorage;/);
  });

  test("what is kept and what is read back are the module's own writes and nothing else", () => {
    const kept = codeOf("keptAnswers.ts");
    // Two writes in the whole module, one to each store: the tab's is the
    // answers as `packKept` makes them, and the copy that crosses tabs is
    // the tab's own text and never something packed afresh.
    assert.equal((kept.match(/\.setItem\(/g) ?? []).length, 2);
    assert.match(kept, /store\.setItem\(keptKey\(roundId\), packKept\(about, Date\.now\(\)\)\)/);
    assert.match(kept, /const text = keptStore\(\)\?\.getItem\(key\) \?\? null;\s*if \(text !== null && readKept\(text, now, ACROSS_TABS_MAX_AGE_MS\)\) shared\.setItem\(key, text\);/);
    assert.equal((kept.match(/packKept\(/g) ?? []).length, 1, "something other than the tab's own copy is packed");
    assert.match(kept, /readKept\(keptStore\(\)\?\.getItem\(keptKey\(roundId\)\), Date\.now\(\)\)/);
    // The copy is read back with the hour, and by nothing but its one function.
    assert.match(kept, /const kept = readKept\(raw, now, ACROSS_TABS_MAX_AGE_MS\);/);
    assert.equal((kept.match(/shared\.getItem\(/g) ?? []).length, 1);
  });

  test("the step has no password box, and asks for none", () => {
    for (const file of JOIN_FILES) {
      const code = codeOf(file);
      assert.equal(/type="password"|PasswordInput|autoComplete="(new|current)-password"/.test(code), false, `${file} draws a password box`);
      assert.equal(/createUserWithEmailAndPassword|signUpWithEmailPassword|signInWithEmailAndPassword/.test(code), false, `${file} makes or opens an account with a password`);
    }
  });

  test("an account is made only by the two ways the site already has", () => {
    const step = codeOf("JoinStep.tsx");
    assert.match(step, /import \{ completeRegistration, exchangeGoogleCredential, signOut \} from "@\/auth\/signInWithGoogle";/);
    assert.match(step, /await exchangeGoogleCredential\(credential\)/);
    assert.match(step, /await completeRegistration\(joinRequestFrom\(answers\)\)/);
    assert.equal((step.match(/completeRegistration\(/g) ?? []).length, 1, "the join request is sent from one place");
    const account = codeOf("JoinAccount.tsx");
    assert.match(account, /import GoogleSignInButton from "@\/components\/GoogleSignInButton";/);
    // The form's folder imports nothing from Firebase's sign-in library: every
    // sign-in goes through the site's own functions.
    for (const file of formFiles.filter((name) => /\.tsx?$/.test(name))) {
      assert.equal(/from "firebase\/auth"/.test(codeOf(file)), false, `${file} imports firebase/auth`);
    }
  });

  test("the requests the step makes are the site's existing routes, with the bodies those routes take", () => {
    const client = codeOf("joinClient.ts");
    const called = [...client.matchAll(/(?:post|fetch)\(\s*("[^"]+"|applicationUrl\(roundId\))/g)].map((match) => match[1]).sort();
    assert.deepEqual(called, [
      '"/api/auth/session"',
      '"/api/register"',
      '"/api/register/resend"',
      '"/api/verify-email/send"',
      "applicationUrl(roundId)",
      "applicationUrl(roundId)",
    ]);
    assert.match(client, /post\("\/api\/register", \{ email, audience: "member", recaptchaToken, next \}\)/);
    assert.match(client, /post\("\/api\/register\/resend", \{ email \}\)/);
    assert.match(client, /post\("\/api\/auth\/session", \{ idToken \}\)/);
    assert.match(client, /post\("\/api\/verify-email\/send", \{ email: email\.trim\(\)\.toLowerCase\(\), preferredName \}\)/);
    // Each of those routes exists, and none of them is this branch's.
    for (const route of ["register", "register/resend", "auth/session", "verify-email/send"]) {
      readFileSync(join(REPO_ROOT, "src", "app", "api", ...route.split("/"), "route.ts"), "utf8");
    }
  });

  test("a signed-out visitor's answers are sent nowhere: the email way carries an address and a return and nothing else", () => {
    const step = codeOf("JoinStep.tsx");
    assert.match(step, /await startEmailRegistration\(email, token, joinReturnFor\(roundId\)\)/);
    const client = codeOf("joinClient.ts");
    const start = client.slice(client.indexOf("export async function startEmailRegistration"), client.indexOf("export async function resendRegistration"));
    assert.equal(/about|draft|preferredName|motivation/.test(start), false, "the register request carries an answer");
    // The answers leave the page in two calls, and both come after the join
    // request, which needs a session.
    const afterJoin = step.slice(step.indexOf("await completeRegistration("));
    assert.ok(afterJoin.includes("saveAboutYou(roundId, answers)"));
    assert.ok(afterJoin.includes("sendUniversityCheck(answers.universityEmail, answers.preferredName)"));
    const beforeJoin = step.slice(0, step.indexOf("await completeRegistration("));
    assert.equal(/saveAboutYou\(|sendUniversityCheck\(/.test(beforeJoin.replace(/import \{[\s\S]*?\} from "\.\/joinClient";/, "")), false);
  });

  test("the join request is not sent before the answers and the consent box have been checked", () => {
    const step = codeOf("JoinStep.tsx");
    assert.match(step, /const issues = joinIssues\(aboutRef\.current, agreed\);/);
    const onContinue = step.slice(step.indexOf("async function onContinue()"), step.indexOf("const onGoogle"));
    assert.ok(onContinue.indexOf("if (!check()) return;") !== -1, "Continue does not check the answers");
    assert.ok(onContinue.indexOf("if (!check()) return;") < onContinue.indexOf("openAccount()"), "the account half opens before the answers are checked");
    assert.ok(onContinue.indexOf("if (!check()) return;") < onContinue.indexOf("finishJoin("), "the join request can go before the answers are checked");
    // The second half is drawn only from Continue, and Google's button and the
    // email box are only in the second half.
    assert.equal((step.match(/openAccount\(\)/g) ?? []).length, 1);
    assert.equal(/GoogleSignInButton|RecaptchaInvisible\b(?!")/.test(step.replace(/import[^;]*;/g, "")), false);
    // The consent box is the register page's own component.
    assert.match(step, /import PolicyConsent from "@\/components\/PolicyConsent";/);
    assert.match(step, /<PolicyConsent checked=\{agreed\} onChange=\{setAgreed\} id="join-consent" \/>/);
  });

  test("a signed-in person's session is used as it is, and a sign-in is never refreshed by force", () => {
    // A password chosen in another tab signs every older sign-in out. A tab
    // still holding the older one must not force a refresh (the sign-in
    // library answers a refusal by signing the whole browser out) and must
    // not make a session from it (that would replace the good one).
    for (const file of formFiles.filter((name) => /\.tsx?$/.test(name))) {
      assert.equal(/getIdToken\(\s*true\s*\)/.test(codeOf(file)), false, `${file} forces a sign-in to refresh`);
    }
    const step = codeOf("JoinStep.tsx");
    const kind = step.slice(step.indexOf("async function sessionKind()"), step.indexOf("async function onContinue()"));
    // The form's own read comes first, and answers from the session that is there.
    assert.ok(kind.indexOf("await readOwnAccount(roundId)") !== -1);
    assert.ok(kind.indexOf("await readOwnAccount(roundId)") < kind.indexOf("await mintSession("), "a session is made before the one that exists is asked");
    assert.match(kind, /if \(account\.ok\) return account\.joined \? "member" : "new";/);
    assert.match(kind, /if \(account\.status !== 401\) return \{ error: account\.error \};/);
    // The emailed link's own sign-in waits for its replacement before a session is made from it.
    assert.match(kind, /signInProvider === "custom"/);
    assert.ok(kind.indexOf('signInProvider === "custom"') < kind.indexOf("await mintSession("));
    assert.equal((step.match(/mintSession\(/g) ?? []).length, 1, "a session is made in more than one place");
  });

  test("a page that is behind the browser asks the server again a few times, and never for ever", () => {
    // Somebody signs in after the page was drawn for a visitor. The step asks
    // for the page again so the server can say what the account is, and the
    // first ask can beat the session it is asking about. So it asks a few
    // more times on a timer, and then only when the tab is looked at: a
    // session that is never coming must not be polled for.
    const step = codeOf("JoinStep.tsx");
    assert.match(step, /const TIMED_ASKS = 3;/);
    assert.match(step, /if \(timedAsks\.current >= TIMED_ASKS\) \{\s*window\.clearInterval\(timer\);\s*return;\s*\}/);
    assert.match(step, /return \(\) => \{\s*window\.clearInterval\(timer\);/);
    assert.match(step, /if \(Date\.now\(\) - lastAsked\.current < ASK_AGAIN_MS\) return;/);
    // Never while a join request is on its way: that ends by moving the page on.
    assert.match(step, /if \(busy !== null \|\| !uid\) return;/);
    assert.equal((step.match(/setInterval\(/g) ?? []).length, 1);
  });

  test("the consent tick is never restored: agreeing is a fresh act", () => {
    const step = codeOf("JoinStep.tsx");
    assert.match(step, /const \[agreed, setAgreed\] = useState\(false\);/);
    assert.equal(/setAgreed\((?!false)[^)]*kept|loadKept\([^)]*\)\.agreed/.test(step), false);
    assert.equal((step.match(/setAgreed\b/g) ?? []).length, 2, "the consent tick is set somewhere other than the box itself");
  });

  test("joining is held while an admin has paused new registrations, as the register page holds it", () => {
    const step = codeOf("JoinStep.tsx");
    assert.match(step, /const paused = isSurfacePaused\(siteNotice, "newRegistrations"\);/);
    assert.match(step, /disabled=\{!hydrated \|\| busy !== null \|\| paused\}/);
    assert.match(step, /<SurfacePausedNotice notice=\{siteNotice\} surface="newRegistrations" \/>/);
  });

  test("the page moves on inside the site after a join request, never by loading a new document", () => {
    // `completeRegistration` leaves requests on their way (the tracker, the
    // subscriptions sync, the confirmation email). A document load drops them.
    const step = codeOf("JoinStep.tsx");
    assert.equal(/window\.location\.(assign|replace|href\s*=)|hardNavigate/.test(step), false);
    assert.match(step, /router\.replace\(`\$\{formUrl\}\?\$\{STEP_PARAM\}=choose`\)/);
  });

  test("a page drawn afresh opens on the answers, and its address is made to say so", () => {
    // HELD BY READING THE FILE. The step is a component in a browser's
    // history, and nothing here can press Back.
    //
    // The second half is one step forward of the first in the browser's own
    // history, at an address ending `#account`. The view is never restored
    // from that address (agreeing is a fresh act, and only Continue opens the
    // second half), so somebody who comes Back to the page from the sign-in
    // page is drawn the answers. The address is put right to match, in the
    // same history entry: nothing is added to the history and no document is
    // loaded.
    const step = codeOf("JoinStep.tsx");
    assert.match(step, /const ACCOUNT_HASH = "#account";/);
    assert.match(step, /const \[view, setView\] = useState<View>\("questions"\);/);
    assert.match(
      step,
      /useEffect\(\(\) => \{\s*if \(window\.location\.hash !== ACCOUNT_HASH\) return;\s*window\.history\.replaceState\(null, "", `\$\{window\.location\.pathname\}\$\{window\.location\.search\}`\);\s*\}, \[\]\);/,
    );
    // The one entry the step adds is the second half's, and the one it
    // rewrites is this.
    assert.equal((step.match(/history\.pushState\(/g) ?? []).length, 1);
    assert.equal((step.match(/history\.replaceState\(/g) ?? []).length, 1);
    // The view is opened in one place and closed in two, and none of them reads the address to decide.
    assert.equal((step.match(/setView\("account"\)/g) ?? []).length, 1);
    assert.equal((step.match(/setView\("questions"\)/g) ?? []).length, 2);
  });

  test("Google's script and the reCAPTCHA check load with the second half, not with the page", () => {
    const account = codeOf("JoinAccount.tsx");
    assert.match(account, /<Script src=\{GOOGLE_SCRIPT\} strategy="afterInteractive" \/>/);
    assert.match(account, /\{RECAPTCHA_ENABLED \? <RecaptchaInvisible ref=\{recaptcha\} \/> : null\}/);
    const step = codeOf("JoinStep.tsx");
    assert.equal(/next\/script|gsi\/client/.test(step), false);
    // And the step says the page is protected by reCAPTCHA only where it is.
    for (const use of step.match(/<RecaptchaLine \/>/g) ?? []) assert.ok(use);
    assert.equal((step.match(/RECAPTCHA_ENABLED && !signedIn \? /g) ?? []).length, 2, "the reCAPTCHA line is drawn without checking that the check is configured");
    assert.equal((step.match(/<RecaptchaLine \/>/g) ?? []).length, 2);
  });

  test("the box Google's button is drawn in is a plain block, because the button measures it", () => {
    // The button asks Google for a width once, from the box it is drawn in:
    // 320px where there is room, the box's own width where there is not, and
    // never under 200px. The step's box is the column's width only while the
    // stylesheet leaves it alone.
    const button = stripSource(readFileSync(join(REPO_ROOT, "src", "components", "GoogleSignInButton.tsx"), "utf8"), {
      keepStrings: true,
    });
    assert.match(button, /const room = Math\.floor\(buttonRef\.current\.parentElement\?\.clientWidth \?\? 0\);/);
    assert.match(button, /const width = room > 0 \? Math\.max\(200, Math\.min\(320, room\)\) : 320;/);
    const sheet = sourceOf("join.module.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [...sheet.matchAll(/(?<![\w-])\.google(?![\w-])(\[[^\]]*\])?\s*\{([^}]*)\}/g)].map((match) => [
      match[1] ?? "",
      match[2].trim().replace(/\s+/g, " "),
    ]);
    assert.deepEqual(rules, [
      ["", "min-height: 2.75rem;"],
      ['[aria-busy="true"]', "opacity: 0.55; pointer-events: none;"],
    ]);
    // Nothing between that box and the button: the step hands the box the script and the button and nothing else.
    const account = codeOf("JoinAccount.tsx");
    assert.match(
      account,
      /<div className=\{styles\.google\} aria-busy=\{busy === "google"\}>\s*<Script src=\{GOOGLE_SCRIPT\} strategy="afterInteractive" \/>\s*<GoogleSignInButton onCredential=\{onGoogle\} onScriptError=\{scriptProblem\} \/>\s*<\/div>/,
    );
    // And the column it sits in gives its children the column's whole width.
    assert.match(sheet, /\.ways \{[^}]*align-items: stretch;[^}]*\}/);
  });

  test("Google's button is drawn when its script arrives late, and the message it put up comes down", () => {
    // HELD BY READING THE FILE. The button waits on another site's script
    // and a clock in a browser, and nothing here can stand in for either.
    //
    // On a slow connection the script is late, not blocked. The button tells
    // the caller once that sign-in could not load, and then goes on looking:
    // more slowly, and not for ever, because a blocked script never comes.
    const button = stripSource(readFileSync(join(REPO_ROOT, "src", "components", "GoogleSignInButton.tsx"), "utf8"), {
      keepStrings: true,
    });
    const from = button.indexOf("if (!window.google?.accounts?.id) {");
    const upTo = button.indexOf('mark("[gsi] script loaded, initializing");');
    assert.ok(from !== -1 && upTo > from, "the wait for Google's script is gone");
    const wait = button.slice(from, upTo);
    // Told once, and telling is not the end of the wait.
    assert.match(wait, /if \(!reported && performance\.now\(\) - startedAt > SCRIPT_LOAD_TIMEOUT_MS\) \{/);
    assert.match(wait, /setStatus\("error"\);\s*onReadyRef\.current\?\.\(\);\s*reported = true;\s*\}/);
    assert.equal((wait.match(/onScriptError\?\.\(\s*"Sign-in couldn't load\./g) ?? []).length, 1);
    // The only way out of the wait without the script is the limit.
    assert.match(
      wait,
      /if \(performance\.now\(\) - startedAt > SCRIPT_LATE_LIMIT_MS\) return;\s*setTimeout\(tryInit, reported \? SCRIPT_LATE_POLL_MS : 50\);\s*return;\s*\}/,
    );
    assert.equal((wait.match(/\breturn;/g) ?? []).length, 2, "a way out of the wait that is neither the limit nor the next look");
    // When it comes after the report, the caller is handed an empty message
    // before the button is drawn, and that is the whole of the recovery: the
    // same lines draw the button whenever the script arrives.
    assert.match(wait, /\}\s*if \(reported\) onScriptError\?\.\(""\);\s*$/);
    const number = (name) => Number((new RegExp(`const ${name} = ([\\d_]+);`).exec(button)?.[1] ?? "").replaceAll("_", ""));
    assert.equal(number("SCRIPT_LOAD_TIMEOUT_MS"), 5000);
    assert.ok(number("SCRIPT_LATE_POLL_MS") >= 250 && number("SCRIPT_LATE_POLL_MS") <= 5000, "the later looks are not between four a second and one every five");
    assert.ok(
      number("SCRIPT_LATE_LIMIT_MS") > number("SCRIPT_LOAD_TIMEOUT_MS") && number("SCRIPT_LATE_LIMIT_MS") <= 10 * 60 * 1000,
      "the looking has no end, or ends before it starts",
    );
    // The step shows other messages in the same place (an email address that
    // was not typed, a sign-in that failed), so it takes down only the one
    // the button gave it, and only while that is still the one showing.
    const account = codeOf("JoinAccount.tsx");
    assert.match(account, /if \(message\) \{\s*fromGoogle\.current = message;\s*onProblem\(message\);\s*\}/);
    assert.match(
      account,
      /else if \(fromGoogle\.current !== null && showing\.current === fromGoogle\.current\) \{\s*onProblem\(null\);\s*\}/,
    );
    assert.match(account, /<GoogleSignInButton onCredential=\{onGoogle\} onScriptError=\{scriptProblem\} \/>/);
  });

  test("inside the installed app the Google button is not drawn, because its return is received by the sign-in page", () => {
    const account = codeOf("JoinAccount.tsx");
    const branch = account.slice(account.indexOf("{standalone ? ("), account.indexOf("</div>\n        )}"));
    assert.ok(branch.includes("<Link href={signInHref}"), "the installed app has no way to sign in with Google");
    assert.ok(branch.indexOf("<Link href={signInHref}") < branch.indexOf("<GoogleSignInButton"));
  });
});

// ---------------------------------------------------------------------------
// 8. Every way off the form to the sign-in page or the register page
// ---------------------------------------------------------------------------

/**
 * A WALK, NOT A LIST OF FILES. It starts at the form's page and the two
 * layouts drawn round it, follows every import that carries code, and reads
 * every file it reaches for an address of the sign-in page or the register
 * page: a link's `href`, or what a router call is handed. Somebody on the
 * form's first step has no join request, and either page would send a new
 * account to the register page's own profile form unless the address it was
 * handed says otherwise. So each address found has to be one somebody
 * decided, written down below with the reason, and a new one fails here until
 * it is.
 *
 * WHAT IT CANNOT SEE: an address put together out of pieces (`"/" + "login"`)
 * and one that arrives as data. The first is not how this site writes an
 * address. The second is listed where the data is written: the header draws
 * its entries from a list, and the list is one of the files read.
 */
describe("every way off the form to the sign-in page or the register page is one somebody decided", () => {
  const SRC = join(REPO_ROOT, "src");
  const ROOTS = [
    // The form's own page: the form, and the older apply flow at the same address.
    "app/(public)/apply/[roundId]/page.tsx",
    // The header and footer drawn round it on anything wider than a phone.
    "app/(public)/layout.tsx",
    // What every page of the site is drawn inside.
    "app/layout.tsx",
  ];
  /** A local import that is not code: nothing in one can be a link. */
  const NOT_CODE = /\.(?:css|json|png|jpe?g|svg|gif|webp|ico|woff2?|md)$/;

  /** What a file imports that carries code. `import type` carries none. */
  function imported(code) {
    const found = [];
    for (const match of code.matchAll(/(?:^|[\n;])\s*(import|export)\s+(type\s+)?([^"';]*?\s+from\s+)?(["'])([^"']+)\4/g)) {
      if (match[2]) continue;
      if (match[1] === "export" && !match[3]) continue;
      found.push(match[5]);
    }
    for (const match of code.matchAll(/\bimport\(\s*(["'])([^"']+)\1\s*\)/g)) found.push(match[2]);
    return found;
  }

  function resolveLocal(specifier, fromFile) {
    const base = specifier.startsWith("@/")
      ? join(SRC, specifier.slice(2))
      : specifier.startsWith(".")
        ? join(dirname(fromFile), specifier)
        : null;
    if (base === null) return { is: "package" };
    if (NOT_CODE.test(base)) return { is: "not code" };
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) return { is: "file", file: candidate };
    }
    return { is: "missing" };
  }

  const walked = new Map();
  const unresolved = [];
  const queue = ROOTS.map((root) => join(SRC, root));
  while (queue.length > 0) {
    const file = queue.pop();
    if (walked.has(file)) continue;
    const code = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
    walked.set(file, code);
    for (const specifier of imported(code)) {
      const found = resolveLocal(specifier, file);
      if (found.is === "file") queue.push(found.file);
      if (found.is === "missing") unresolved.push(`${relative(SRC, file)} imports ${specifier}`);
    }
  }
  const reached = new Map([...walked].map(([file, code]) => [relative(SRC, file).split("\\").join("/"), code]));

  /**
   * An address of the sign-in page or the register page, as it is written: a
   * quote, then the path. Read up to the first thing that is not fixed text
   * (a `${`, or the closing quote), so `/login?next=${...}` reads as
   * `/login?next=` however the rest of it is built.
   */
  const ADDRESS = /(["'`])(\/(?:login|register)(?:[?#/][^"'`$\\]*)?)(?=["'`$])/g;
  const addressesIn = (code) => [...code.matchAll(ADDRESS)].map((match) => match[2]).sort();

  /**
   * Every address the walk may find, by file, each with why it is there and
   * what a brand-new account that takes it meets. An entry with no reason, an
   * entry the walk no longer finds, and an address that is not here all fail.
   */
  const DECIDED = new Map([
    [
      "lib/applications/applicant/join.ts",
      [
        [
          "/login?next=",
          "`signInHrefFor`, the one way the form's first step makes an address of the sign-in page. It carries the form's marked address, which brings a new account back to the step.",
        ],
      ],
    ],
    [
      "features/applications/apply/ApplyScreen.tsx",
      [
        [
          "/login?next=",
          "The card for a form that has closed. Nobody can join on a closed form, so there is no first step to come back to; somebody who applied signs in to see where it stands.",
        ],
        [
          "/register?next=",
          "The card for a form that has not opened yet. It has no first step to join on, so an account is made on the register page, which hands the person back here when it is done.",
        ],
      ],
    ],
    [
      "features/applications/apply/ApplicationForm.tsx",
      [
        [
          "/login?next=",
          "Drawn only inside the form itself, for an account that has a join request and whose session has lapsed. It opens in a new tab and signs that account in again.",
        ],
      ],
    ],
    [
      "app/(public)/apply/[roundId]/page.tsx",
      [
        [
          "/login?next=",
          "The older apply flow's card, drawn only for a round that is not an application form. Those rounds have no first step that takes a join request, and rely on the register page's profile form.",
        ],
        ["/register?next=", "The same card's link to make an account, for the same rounds and the same reason."],
      ],
    ],
    [
      "layout/publicNav.ts",
      [
        [
          "/login",
          "The site's own Sign in as the header draws it on a page that is NOT a form: the way in to the whole site, with nowhere to come back to. On a form's page the header never draws this address. `signedOutEntriesOn` gives it the sign-in page with that page as the place to come back to, and a test below runs it.",
        ],
        [
          "/register",
          "Where the header's Join entry leads while the Join page is switched off. Joining the society is what the register page is for. On a form's page the header draws no Join at all: the form's first step is the join request.",
        ],
      ],
    ],
    [
      "lib/authReturn.ts",
      [
        [
          "/login?next=",
          "`signInHrefWithReturn`, for the site's top bar on a page that is a form. It carries that page's own bare address, which the sign-in page puts to the form's route for an account with no join request: an open application form takes them back to its first step, and anything else is the register page with the form as the place to come back to.",
        ],
      ],
    ],
    [
      "layout/TransitionLink.tsx",
      [
        ["/login", "Not a link. One of the two addresses whose links start fetching Google's script a moment early."],
        ["/register", "Not a link either: the other of those two addresses, in the same list."],
      ],
    ],
  ]);

  test("the walk reached the form, its first step and the frame round them, and lost nothing on the way", () => {
    assert.deepEqual(unresolved, [], "an import the walk could not follow, so a file it never read");
    for (const file of [
      "features/applications/apply/ApplyScreen.tsx",
      "features/applications/apply/JoinStep.tsx",
      "features/applications/apply/JoinAccount.tsx",
      "features/applications/apply/ApplicationForm.tsx",
      "lib/applications/applicant/join.ts",
      "components/GoogleSignInButton.tsx",
      "layout/PublicHeader.tsx",
      "layout/PublicFooter.tsx",
      "layout/publicNav.ts",
      "auth/AuthProvider.tsx",
    ]) {
      assert.ok(reached.has(file), `the walk no longer reaches ${file}`);
    }
    // The reader finds an address where one is known to be, in each way one is written.
    assert.deepEqual(addressesIn('<a href="/login">x</a>'), ["/login"]);
    assert.deepEqual(addressesIn("router.push('/register?type=collaborator')"), ["/register?type=collaborator"]);
    assert.deepEqual(addressesIn("href={`/login?next=${encodeURIComponent(`/apply/${id}`)}`}"), ["/login?next="]);
    assert.deepEqual(addressesIn('post("/api/register/resend", { email })'), []);
    assert.deepEqual(addressesIn('"/logins" + "/registered" + "/registrations"'), []);
  });

  test("every address found is written down with its reason, and every one written down is found", () => {
    const found = new Map();
    for (const [file, code] of reached) {
      const addresses = addressesIn(code);
      if (addresses.length > 0) found.set(file, addresses);
    }
    for (const [file, addresses] of found) {
      assert.ok(
        DECIDED.has(file),
        `${file} holds ${addresses.join(", ")}: a way off the form to the sign-in page or the register page that nobody has decided. ` +
          "From the form's first step the way is `signInHrefFor`. Anywhere else, write it down here with what a new account that takes it meets.",
      );
      assert.deepEqual(
        addresses,
        DECIDED.get(file).map(([address]) => address).sort(),
        `${file} does not hold the addresses written down for it`,
      );
    }
    for (const [file, entries] of DECIDED) {
      assert.ok(found.has(file), `${file} is written down and the walk finds no address in it: take the entry out`);
      for (const [address, reason] of entries) {
        assert.ok(typeof reason === "string" && reason.length > 40, `${file} ${address} has no reason beside it`);
      }
    }
  });

  test("the first step itself holds none: its only way to the sign-in page is the one function", () => {
    for (const file of ["features/applications/apply/JoinStep.tsx", "features/applications/apply/JoinAccount.tsx"]) {
      assert.deepEqual(addressesIn(reached.get(file)), [], `${file} spells out a way off the form`);
    }
    // And the function makes one address, with the mark on it.
    const helper = reached.get("lib/applications/applicant/join.ts");
    assert.match(helper, /return `\/login\?next=\$\{encodeURIComponent\(joinReturnFor\(roundId\)\)\}`;/);
    assert.equal((helper.match(/\/login\b/g) ?? []).length, 1);
    assert.equal(/["'`]\/register\b/.test(helper), false);
  });

  test("on a form's page the top bar's Sign in comes back to the form, and there is no Join to leave by", async () => {
    const ID = "autumn-2026__k3f9a2b1";
    // The last three hold characters that mean something on an address: what
    // the sign-in page reads back has to be the page, character for character.
    const formPages = [`/apply/${ID}`, "/apply/sample-term__seed0001", "/courses/intro/apply", "/apply/a%26b", "/apply/a+b", "/courses/c%23d/apply"];
    for (const page of formPages) {
      const { signIn, join: joinEntry } = publicNav.signedOutEntriesOn(page);
      // The form's first step is the join request. A Join beside it leads to
      // the Join page and on to the register page's own profile form.
      assert.equal(joinEntry, null, `${page}: the top bar offers Join beside the form`);
      assert.equal(signIn.label, "Sign in");
      assert.equal(signIn.live, true);
      assert.equal(publicNav.addressOf(signIn), signIn.href);
      // The sign-in page, and one thing on its address: this page.
      const address = new URL(signIn.href, "https://naisi.test");
      assert.equal(address.pathname, "/login", page);
      assert.deepEqual([...address.searchParams.keys()], ["next"], page);
      assert.equal(address.searchParams.get("next"), page);
      // Which the sign-in page's own guard passes, and which registration
      // may hand somebody back to.
      assert.equal(signInReturn.safeReturnPath(page), page);
      assert.equal(authReturn.safeFunnelReturn(page), page);
      assert.equal(authReturn.formPageReturn(page), page);
    }
    // What the sign-in page then does with an account that has no join
    // request. An application form's address is asked about, and an open
    // form takes the person back to its first step: the address the top bar
    // made, put through the page's guard and the form's rule.
    const next = new URL(publicNav.signedOutEntriesOn(`/apply/${ID}`).signIn.href, "https://naisi.test").searchParams.get("next");
    const guarded = signInReturn.safeReturnPath(next) ?? "/dashboard";
    assert.deepEqual(rules.newAccountReturn(guarded), { to: "ask", roundId: ID, href: `/apply/${ID}?join=1` });
    const real = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ joined: false, account: { universityEmailVerified: false }, form: { windowState: "open" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    try {
      assert.equal(await joinClient.joinStepForNewAccount(guarded), `/apply/${ID}?join=1`);
    } finally {
      globalThis.fetch = real;
    }
    // The bare address is carried, never the marked one: an older round and a
    // form that is not open live at the same kind of address, and the mark
    // would send an account with no join request to a page with no first
    // step to join on.
    assert.notEqual(publicNav.signedOutEntriesOn(`/apply/${ID}`).signIn.href, rules.signInHrefFor(ID));
  });

  test("on every other page the top bar is the two entries as they stand", () => {
    const asTheyStand = { signIn: publicNav.ACCOUNT_ENTRIES.signIn, join: publicNav.ACCOUNT_ENTRIES.join };
    for (const page of [
      "/",
      "/courses",
      "/courses/intro",
      "/courses/intro/weeks/2",
      "/courses/intro/apply/more",
      "/courses//apply",
      "/events",
      "/events/abc",
      "/join",
      "/about",
      "/apply",
      "/apply/",
      "/apply/a/b",
      "/apply/..",
      "/apply/a\\b",
      "/applications",
      "/applications/autumn-2026__k3f9a2b1",
      "//evil.example/apply/x",
      "",
      null,
      undefined,
    ]) {
      assert.deepEqual(publicNav.signedOutEntriesOn(page), asTheyStand, String(page));
    }
    assert.equal(asTheyStand.signIn.href, "/login");
    assert.equal(publicNav.addressOf(asTheyStand.join), "/join");
  });

  test("the header draws its signed-out controls from that one function, for the page it is on", () => {
    // HELD BY READING THE FILE. The header is a component, and nothing here
    // can draw it; the function it asks is run in the two tests above.
    const header = reached.get("layout/PublicHeader.tsx");
    assert.match(header, /const pathname = usePathname\(\);/);
    assert.match(header, /const \{ signIn, join \} = signedOutEntriesOn\(pathname\);/);
    assert.match(header, /return \{ note: null, quiet: signIn, outlined: join, inPhoneBar: true, long: false \};/);
    assert.match(header, /const signedOut = signedOutOn\(pathname\);/);
    // Signed out, and signed in with no join request yet: both are that view.
    assert.match(header, /const account: AccountView = !user\s*\? signedOut\s*:/);
    assert.match(header, /: role === "rejected"\s*\? NOT_APPROVED\s*: signedOut;/);
    assert.equal(/ACCOUNT_ENTRIES\.(?:signIn|join)\b/.test(header), false, "the header draws Sign in or Join without asking which page it is on");
    // The bar, the phone's bar and the menu each allow for there being no Join.
    assert.equal((header.match(/control\(account\.outlined,/g) ?? []).length, 3);
    assert.equal((header.match(/account\.outlined && control\(account\.outlined,/g) ?? []).length, 3);
    // And the header holds no address of either page itself.
    assert.deepEqual(addressesIn(header), []);
  });

  test("no file in the form's folder is outside the walk with an address of its own", () => {
    // The walk follows imports, so a file nothing imports yet is not on it.
    // The form's folder is read whole as well, for the day one is added.
    for (const name of readdirSync(FORM_DIR).filter((each) => /\.tsx?$/.test(each))) {
      const file = `features/applications/apply/${name}`;
      const addresses = addressesIn(stripSource(sourceOf(name), { keepStrings: true }));
      assert.deepEqual(
        addresses,
        (DECIDED.get(file) ?? []).map(([address]) => address).sort(),
        `${file} holds an address of the sign-in page or the register page that is not written down`,
      );
    }
  });
});
