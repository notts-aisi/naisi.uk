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
 *     the tab. Never a password, never the consent tick, never anything that
 *     outlives the tab.
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
 * register page is one somebody had to write down.
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

  /** The sign-in page's own guard on `?next=`, as `AuthEntry.tsx` writes it. A test below holds the two together. */
  const guarded = (next) => {
    const given = next ?? "/dashboard";
    return given.startsWith("/") && !given.startsWith("//") ? given : "/dashboard";
  };

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
    // And the guard written here is the one the page has. Read from the file,
    // because the page is a component and nothing here can run it.
    const entry = stripSource(readFileSync(join(REPO_ROOT, "src", "app", "(auth)", "AuthEntry.tsx"), "utf8"), {
      keepStrings: true,
    });
    assert.match(entry, /const \[next\] = useState\(\(\) => params\.get\("next"\) \?\? "\/dashboard"\);/);
    assert.match(entry, /const safeNext = next\.startsWith\("\/"\) && !next\.startsWith\("\/\/"\) \? next : "\/dashboard";/);
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

  test("answers are kept in the tab's own store, and nowhere that outlives the tab", () => {
    const kept = codeOf("keptAnswers.ts");
    assert.match(kept, /window\.sessionStorage/);
    // Every file in the form's folder: a second place to keep something would
    // be a second thing the privacy page has to list.
    for (const file of formFiles.filter((name) => /\.tsx?$/.test(name))) {
      const code = codeOf(file);
      assert.equal(/\blocalStorage\b|\bindexedDB\b|document\.cookie/.test(code), false, `${file} keeps something outside the tab`);
      if (file !== "keptAnswers.ts") {
        assert.equal(/\bsessionStorage\b/.test(code), false, `${file} reaches the tab's store without going through keptAnswers.ts`);
      }
    }
  });

  test("what is kept and what is read back are the module's two functions and nothing else", () => {
    const kept = codeOf("keptAnswers.ts");
    assert.equal((kept.match(/\.setItem\(/g) ?? []).length, 1);
    assert.match(kept, /store\.setItem\(keptKey\(roundId\), packKept\(about, Date\.now\(\)\)\)/);
    assert.match(kept, /readKept\(keptStore\(\)\?\.getItem\(keptKey\(roundId\)\), Date\.now\(\)\)/);
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
          "The site's own Sign in, which the header draws in its bar and in the menu a narrow window opens instead. It carries no return address: it is the way in to the whole site, on every public page, and the header is hidden on a phone while the form is on the page.",
        ],
        [
          "/register",
          "Where the header's Join entry leads while the Join page is switched off. Joining the society is what the register page is for.",
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
