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
 *
 * The last section reads the files that use these rules, so the rules cannot
 * be kept by the module and broken by its callers.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FORM_DIR = join(REPO_ROOT, "src", "features", "applications", "apply");
const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });

const rules = await loadTs(join("lib", "applications", "applicant", "join.ts"));
const validate = await loadTs(join("lib", "applications", "validate.ts"));
const notifications = await loadTs(join("lib", "firestore", "notifications.ts"));
const users = await loadTs(join("lib", "firestore", "users.ts"));
const authReturn = await loadTs(join("lib", "authReturn.ts"));

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

  test("every address it accepts is one the site's own return list accepts", () => {
    for (const id of ["a", "A_b-9", ID]) {
      const address = rules.joinReturnFor(id);
      assert.equal(rules.formJoinReturn(address), address);
      assert.equal(authReturn.isFunnelReturn(address), true);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The files that use the rules
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

  test("inside the installed app the Google button is not drawn, because its return goes elsewhere", () => {
    const account = codeOf("JoinAccount.tsx");
    const branch = account.slice(account.indexOf("{standalone ? ("), account.indexOf("</div>\n        )}"));
    assert.ok(branch.includes("<Link href={signInHref}"), "the installed app has no way to sign in with Google");
    assert.ok(branch.indexOf("<Link href={signInHref}") < branch.indexOf("<GoogleSignInButton"));
  });
});
