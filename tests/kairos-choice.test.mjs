/**
 * THE KAIROS CHOICE, THROUGH ITS REAL ROUTES AND PAGES (src/lib/kairos/):
 * shared with Kairos by default, a way to say no at the end of every
 * programme survey's form and on the person's profile, kept on one record
 * per person that one function reads and one function writes, and gone with
 * the account.
 *
 * Callers: a fellow who keeps the default, one who said no, one who changed
 * back; a member who holds no place; somebody signed out; a test link; and a
 * view-as session, which changes nothing.
 *
 * The world is `tests/lib/surveyWorld.mjs` (AGI Strategy on Thu 29 Oct 2026;
 * every send answers each required question plainly, `everyRequired`, as the
 * answer routes insist since 30 Oct 2026,
 * week 1), with the profile page's browser-only neighbours stubbed. Run with
 * `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NOW, RUN, makeSurveyWorld, surveySeed } from "./lib/surveyWorld.mjs";
import { seedTerm } from "./lib/applicationsSmallTerm.mjs";
import { CASCADE_FIRESTORE_STUB, makeCascadeDb } from "./lib/cascadeStore.mjs";
import { walkSource } from "./lib/functionScan.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The profile page's neighbours that only run in a browser, drawn as nothing. */
const PROFILE_NEIGHBOURS = [
  ["@/features/profile/ProfileForm", "export default function ProfileForm() { return null; }"],
  ["@/features/pwa/PushSettings", "export function PushSettings() { return null; }"],
  ["@/features/pwa/pushDevice", "export function PushDeviceProvider({ children }) { return children; }"],
  ["@/features/admin/AdminLockUI", "export function MaintenanceNotice() { return null; }"],
];

const w = await makeSurveyWorld("__kairosChoice", PROFILE_NEIGHBOURS);
const { routes, call } = w;
const kairosRoute = await w.loadTs(join("app", "api", "account", "kairos", "route.ts"));
const profilePage = (await w.loadTs(join("app", "(app)", "profile", "page.tsx"))).default;
const { KAIROS_FORM_WORDS, KAIROS_SETTING_WORDS, KAIROS_REFUSAL } = await w.loadTs(join("lib", "kairos", "words.ts"));
const { normalizeKairosChoice, sharesWithKairos } = await w.loadTs(join("lib", "kairos", "model.ts"));
const { kairosIn } = await w.loadTs(join("features", "surveys", "answer", "SurveyForm.tsx"));

/** The clock, set to `at` for one test: Date only. */
function clock(t, at = NOW) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

const short = (response) => [response.status, response.body?.error ?? null];
const choiceOf = (uid) => w.world.db.read(`kairosChoices/${uid}`);
const said = (uid, shared, via = "settings") => ({ uid, shared, at: NOW, via });

/** The before survey, made and sent to the four holding a place, after a test. */
async function sentSurvey(stage = "before", emails = 4) {
  const made = await w.make("zach", { stage, closesOn: stage === "before" ? "2026-11-04" : "2026-12-20" });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.survey.id;
  const sent = await w.sendFirst(id, "zach", { emails });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  return id;
}

const linkPage = (id, uid) => w.page(w.pages.link, { params: Promise.resolve({ token: w.tokenOf(id, uid) }) });

/** The Kairos block of a page's markup, from its legend to the end of its fieldset. */
function kairosBlock(html) {
  const start = html.indexOf(`>${KAIROS_FORM_WORDS.heading}</legend>`);
  if (start === -1) return null;
  return html.slice(start, html.indexOf("</fieldset>", start));
}

/** Whether the box that says no is ticked in the drawn form. */
function boxTicked(block) {
  const input = /<input[^>]*name="kairos\.no"[^>]*>/.exec(block);
  assert.ok(input, "the block has no box that says no");
  return /\schecked=""/.test(input[0]);
}

// ---------------------------------------------------------------------------
// The record: shared until the person says no
// ---------------------------------------------------------------------------

describe("the record is shared until the person says no", () => {
  test("no document, a document that is not whole and a yes all read as shared; only a stored no does not", () => {
    assert.equal(sharesWithKairos(null), true);
    assert.equal(sharesWithKairos(undefined), true);
    assert.equal(sharesWithKairos(normalizeKairosChoice("amara", { uid: "bea", shared: false })), true, "a document whose uid is not its own id says nothing");
    assert.equal(sharesWithKairos(normalizeKairosChoice("amara", { uid: "amara", shared: "no" })), true, "a no that is not a no says nothing");
    assert.equal(sharesWithKairos(normalizeKairosChoice("amara", { uid: "amara", shared: true })), true);
    assert.equal(sharesWithKairos(normalizeKairosChoice("amara", { uid: "amara", shared: false })), false);
  });

  test("the form sends the choice only when the person changed the box from where it started", () => {
    const form = (was, ticked) => {
      const data = new FormData();
      data.set("kairos.was", was);
      if (ticked) data.set("kairos.no", "yes");
      return data;
    };
    assert.equal(kairosIn(form("shared", false)), undefined, "left as it was: nothing sent");
    assert.equal(kairosIn(form("shared", true)), false, "ticked: not shared");
    assert.equal(kairosIn(form("no", true)), undefined, "a no left as it was: nothing sent");
    assert.equal(kairosIn(form("no", false)), true, "unticked again: shared");
    assert.equal(kairosIn(new FormData()), undefined, "a form with no Kairos block sends nothing");
  });
});

// ---------------------------------------------------------------------------
// On every programme survey's form
// ---------------------------------------------------------------------------

describe("every programme survey's form ends with the choice, starting where the person's record stands", () => {
  test("the before survey: unticked for a fellow who keeps the default, ticked for one who said no, with the sentence that sharing helps", async (t) => {
    clock(t);
    w.reset(surveySeed({ "kairosChoices/bea": said("bea", false) }));
    const id = await sentSurvey();
    const before = w.everything();
    const amara = await linkPage(id, "amara");
    const bea = await linkPage(id, "bea");
    assert.equal(w.everything(), before, "opening the page wrote something");
    for (const [page, who] of [[amara, "amara"], [bea, "bea"]]) {
      for (const words of [KAIROS_FORM_WORDS.what, KAIROS_FORM_WORDS.why, KAIROS_FORM_WORDS.box, KAIROS_FORM_WORDS.after]) {
        assert.ok(page.text.includes(words), `${who}'s form lacks: ${words}`);
      }
    }
    assert.equal(boxTicked(kairosBlock(amara.html)), false, "the default is to share: the box that says no starts unticked");
    assert.match(kairosBlock(amara.html), /name="kairos\.was" value="shared"/);
    assert.equal(boxTicked(kairosBlock(bea.html)), true, "Bea said no: Bea's box starts ticked");
    assert.match(kairosBlock(bea.html), /name="kairos\.was" value="no"/);
    // The block is the last thing before Send, on the last page.
    const block = amara.html.indexOf(`>${KAIROS_FORM_WORDS.heading}</legend>`);
    const send = amara.html.indexOf("Send my answers");
    assert.ok(block !== -1 && send !== -1 && block < send, "the choice is not drawn before Send");
    assert.equal(amara.html.indexOf(`>${KAIROS_FORM_WORDS.heading}</legend>`, block + 1), -1, "the choice is drawn twice");
  });

  test("the survey at the end and the follow-ups carry it too, and a test link draws it unticked and reads nobody's record", async (t) => {
    clock(t);
    w.reset(surveySeed({ "kairosChoices/amara": said("amara", false) }));
    const before = await sentSurvey();
    assert.equal((await call(null, routes.answerByLink.POST, {}, { body: { token: w.tokenOf(before, "amara"), answers: w.everyRequired(before), consents: { followUps: true } } })).status, 200);
    const after = await sentSurvey("after", 4);
    const six = await sentSurvey("followUp6", 1);
    for (const id of [after, six]) {
      const page = await linkPage(id, "amara");
      assert.equal(boxTicked(kairosBlock(page.html)), true, `${w.survey(id).kind}: Amara's no is where Amara's box starts`);
    }
    const test = await w.page(w.pages.link, { params: Promise.resolve({ token: w.survey(after).testToken }) });
    assert.equal(boxTicked(kairosBlock(test.html)), false, "a test starts as the default");
  });

  test("signed in, the same block, read for the person signed in", async (t) => {
    clock(t);
    w.reset(surveySeed({ "kairosChoices/amara": said("amara", false) }));
    const id = await sentSurvey();
    const page = await w.page(w.pages.signedIn, { params: Promise.resolve({ runId: RUN.agi, surveyId: id }) }, "amara");
    assert.equal(boxTicked(kairosBlock(page.html)), true);
  });
});

// ---------------------------------------------------------------------------
// Kept with the answers
// ---------------------------------------------------------------------------

describe("the choice is kept with the answers, only when the person changed it", () => {
  test("by a personal link: a no is kept on the person's own record, and leaving the box alone keeps nothing", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const id = await sentSurvey();
    const amara = await call(null, routes.answerByLink.POST, {}, { body: { token: w.tokenOf(id, "amara"), answers: w.everyRequired(id), kairos: false } });
    assert.equal(amara.status, 200, JSON.stringify(amara.body));
    const kept = choiceOf("amara");
    assert.equal(kept.uid, "amara");
    assert.equal(kept.shared, false);
    assert.equal(kept.via, "survey");
    assert.ok(kept.at, "when it was said is kept");
    const bea = await call(null, routes.answerByLink.POST, {}, { body: { token: w.tokenOf(id, "bea"), answers: w.everyRequired(id) } });
    assert.equal(bea.status, 200);
    assert.equal(choiceOf("bea"), undefined, "a fellow who kept the default has no record");
  });

  test("a choice that is not a yes or no is refused with the answers, and neither is kept", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const id = await sentSurvey();
    const before = w.everything();
    const refused = await call(null, routes.answerByLink.POST, {}, { body: { token: w.tokenOf(id, "amara"), answers: w.everyRequired(id), kairos: "no" } });
    assert.equal(refused.status, 400);
    assert.equal(w.everything(), before, "a refused answer kept something");
  });

  test("signed in, the choice is the caller's own, and a fellow who said no can change back", async (t) => {
    clock(t);
    w.reset(surveySeed({ "kairosChoices/amara": said("amara", false) }));
    const before = await sentSurvey();
    const back = await call("amara", routes.answerSignedIn.POST, { surveyId: before }, { body: { answers: w.everyRequired(before), kairos: true } });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(choiceOf("amara").shared, true, "the later word is the one kept");
    assert.equal(choiceOf("amara").via, "survey");
    assert.equal(choiceOf("bea"), undefined, "nobody else's record changed");
  });

  test("a view-as session and a test link keep nothing", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const id = await sentSurvey();
    const viewAs = await call("amara", routes.answerSignedIn.POST, { surveyId: id }, { body: { answers: w.everyRequired(id), kairos: false }, viewAs: true });
    assert.equal(viewAs.status, 403);
    const test = await call(null, routes.answerByLink.POST, {}, { body: { token: w.survey(id).testToken, answers: w.everyRequired(id), kairos: false } });
    assert.equal(test.status, 409);
    assert.equal(choiceOf("amara"), undefined);
  });
});

// ---------------------------------------------------------------------------
// On the profile
// ---------------------------------------------------------------------------

describe("the profile shows the same choice and changes it", () => {
  test("the section says where it stands for a fellow who kept the default, one who said no and one who changed back", async (t) => {
    clock(t);
    w.reset(
      surveySeed({
        "kairosChoices/bea": said("bea", false),
        "kairosChoices/dev": said("dev", true),
      }),
    );
    const amara = await w.page(profilePage, {}, "amara");
    assert.ok(amara.text.includes(KAIROS_SETTING_WORDS.heading));
    assert.ok(amara.text.includes(KAIROS_SETTING_WORDS.shared));
    assert.ok(amara.text.includes(KAIROS_SETTING_WORDS.note));
    assert.match(amara.html, new RegExp(`<button type="button"[^>]*disabled=""[^>]*>${KAIROS_SETTING_WORDS.stop}</button>`), "the button waits for the page's script");
    const bea = await w.page(profilePage, {}, "bea");
    assert.ok(bea.text.includes(KAIROS_SETTING_WORDS.notShared));
    assert.ok(bea.text.includes(KAIROS_SETTING_WORDS.start));
    const dev = await w.page(profilePage, {}, "dev");
    assert.ok(dev.text.includes(KAIROS_SETTING_WORDS.shared), "a fellow who changed back reads as shared");
    const nobody = await w.page(profilePage, {}, "nobody");
    assert.ok(nobody.text.includes(KAIROS_SETTING_WORDS.shared), "a member with no place sees the default too");
  });

  test("the route changes the caller's own record, either way, and nothing else", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const no = await call("amara", kairosRoute.POST, {}, { body: { shared: false } });
    assert.deepEqual(no.body, { ok: true, shared: false });
    assert.deepEqual({ ...choiceOf("amara"), at: null }, { uid: "amara", shared: false, at: null, via: "settings" });
    const yes = await call("amara", kairosRoute.POST, {}, { body: { shared: true } });
    assert.deepEqual(yes.body, { ok: true, shared: true });
    assert.equal(choiceOf("amara").shared, true);
    const nobody = await call("nobody", kairosRoute.POST, {}, { body: { shared: false } });
    assert.equal(nobody.status, 200, "a member with no place may say no before they take part");
    assert.equal(choiceOf("bea"), undefined);
  });

  test("signed out, a body that is not a yes or no, and a view-as session are refused and change nothing", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const before = w.everything();
    assert.deepEqual(short(await call(null, kairosRoute.POST, {}, { body: { shared: false } })), [401, KAIROS_REFUSAL.notSignedIn]);
    assert.deepEqual(short(await call("amara", kairosRoute.POST, {}, { body: { shared: "no" } })), [400, KAIROS_REFUSAL.body]);
    assert.deepEqual(short(await call("amara", kairosRoute.POST, {}, { body: {} })), [400, KAIROS_REFUSAL.body]);
    assert.equal((await call("amara", kairosRoute.POST, {}, { body: { shared: false }, viewAs: true })).status, 403);
    assert.equal(w.everything(), before);
  });

  test("what the profile changed is where the next form starts", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const id = await sentSurvey();
    await call("amara", kairosRoute.POST, {}, { body: { shared: false } });
    assert.equal(boxTicked(kairosBlock((await linkPage(id, "amara")).html)), true);
  });
});

// ---------------------------------------------------------------------------
// Gone with the account
// ---------------------------------------------------------------------------

describe("the choice goes with the account", () => {
  const { loadTs } = createLoader({
    stubs: new Map([
      ["server-only", "export {};"],
      ["firebase-admin/firestore", CASCADE_FIRESTORE_STUB],
      ["next/server", "export class NextResponse { static json(body, init) { return { body, status: (init && init.status) || 200 }; } }"],
      ["@/lib/firebase/admin", "export function getAdminDb() { throw new Error('not used here'); }\nexport function getAdminStorage() { return null; }"],
      ["@/lib/firebase/session", "export async function getCurrentUser() { return null; }"],
      ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() { return null; }"],
    ]),
  });
  const auth = { async deleteUser() {}, async revokeRefreshTokens() {} };

  test("deleting an account deletes its choice, counts it, and leaves everybody else's", async () => {
    const { deleteAccountCascade } = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
    const db = makeCascadeDb(
      seedTerm({ over: { "kairosChoices/amara": said("amara", false), "kairosChoices/dev": said("dev", false) } }),
    );
    const summary = await deleteAccountCascade(auth, db, "amara");
    assert.equal(summary.kairosChoiceDeleted, true);
    assert.equal(db.read("kairosChoices/amara"), undefined);
    assert.deepEqual(db.read("kairosChoices/dev").uid, "dev", "somebody else's choice was touched");
    const none = await deleteAccountCascade(auth, makeCascadeDb(seedTerm({ over: {} })), "amara");
    assert.equal(none.kairosChoiceDeleted, false, "an account with no choice counts none");
  });
});

// ---------------------------------------------------------------------------
// One record, one reader, one writer
// ---------------------------------------------------------------------------

describe("one record per person, read by one function and written by one", () => {
  const files = [...walkSource(join(REPO_ROOT, "src"))].map((file) => file.slice(REPO_ROOT.length + 1));
  const code = (file) =>
    readFileSync(join(REPO_ROOT, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const naming = (pattern) => files.filter((file) => pattern.test(code(file))).sort();

  test("only the record's own module and its reader name the collection", () => {
    assert.deepEqual(naming(/\bKAIROS_CHOICES_COLLECTION\b|["'`]kairosChoices["'`]/), [
      "src/lib/kairos/choice.ts",
      "src/lib/kairos/model.ts",
    ]);
  });

  test("every caller of the reader and the writer is named, with why it may ask", () => {
    const READERS = new Map([
      ["src/lib/kairos/choice.ts", "the reader itself, and one person's answer built on it"],
      ["src/lib/surveys/answerView.ts", "where a person's own form starts, read for the person whose page it is"],
      ["src/app/(app)/profile/page.tsx", "the person's own profile, read for the person signed in"],
      ["src/lib/kairos/file.ts", "the Kairos file, an admin's download, which leaves out everybody who said no"],
      ["src/lib/surveys/kairosReportLoad.ts", "the Kairos report, an admin's page of totals: how many of the strongest share"],
    ]);
    const WRITERS = new Map([
      ["src/lib/kairos/choice.ts", "the writer itself"],
      ["src/lib/surveys/answer.ts", "the choice changed on the form, kept with the answers in one transaction, on the person's own record"],
      ["src/app/api/account/kairos/route.ts", "the choice changed on the profile, on the caller's own record"],
    ]);
    const DELETERS = new Map([["src/lib/kairos/choice.ts", "the deleter itself"], ["src/lib/firestore/accountDeletion.ts", "the account's deletion"]]);
    for (const [pattern, expected, what] of [
      [/\bkairosChoicesOf\(/, READERS, "reading"],
      [/\bwriteKairosChoice\(/, WRITERS, "writing"],
      [/\bdeleteKairosChoice\(/, DELETERS, "deleting"],
    ]) {
      const found = naming(pattern);
      const missing = [...expected.keys()].filter((file) => !found.includes(file));
      const extra = found.filter((file) => !expected.has(file));
      assert.deepEqual(missing, [], `${what} the Kairos choice: these no longer do, so take them off the list`);
      assert.deepEqual(extra, [], `${what} the Kairos choice: add each with why it may to this list, or stop it`);
    }
  });

  test("the profile's route writes the caller's own record and calls the view-as guard first", () => {
    const route = code("src/app/api/account/kairos/route.ts");
    assert.match(route, /export async function POST\(req: Request\) \{\s*const blocked = await assertNotImpersonating\(\);\s*if \(blocked\) return blocked;/);
    assert.match(route, /await writeKairosChoice\(db, \{ uid: actor\.uid, shared, via: "settings" \}\);/);
  });
});
