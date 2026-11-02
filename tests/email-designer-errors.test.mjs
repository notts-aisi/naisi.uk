/**
 * The email designers' routes (Email designs, for application and course
 * mail) answer a failure in fixed words, and keep the error itself in the
 * server log.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * An `Error`'s own message is written for whoever reads the log: it can name
 * an address, a host, a key's name or a library's internals, and the words
 * change whenever a dependency does. A route answers with a sentence it chose,
 * so what a browser is told is decided in the route and never by whatever
 * threw.
 *
 *  1. THE HANDLERS, driven for real with a mail door that throws and a
 *     renderer that throws: the answer carries neither the thrown words nor
 *     an address, and the log does.
 *  2. THE TREE: every route under the two designers' folders, so a route
 *     added beside them is held to the same rule.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { makeWorld } from "./lib/handoverWorld.mjs";
import { session, userDoc } from "./lib/applicationsSmallTerm.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

/** What the failing door and the failing renderer say: words no answer may carry. */
const THROWN = "smtp.example.invalid refused zach@example.com with key ab12cd";

const w = makeWorld("__emailDesignerErrors");
const r = makeWorld("__emailDesignerRenderErrors", [
  ["@react-email/render", `export async function render() { throw new Error(${JSON.stringify(THROWN)}); }`],
]);

const route = (world, ...parts) => world.loadTs(join("app", "api", "admin", ...parts, "route.ts"));
const courseSendTest = await route(w, "course-emails", "[templateId]", "send-test");
const applicationSendTest = await route(w, "application-emails", "[templateId]", "send-test");
const coursePreview = await route(r, "course-emails", "preview");
const applicationPreview = await route(r, "application-emails", "preview");
const { templateDefaults } = await w.loadTs(join("lib", "firestore", "applicationEmails.ts"));

function seed() {
  const zach = userDoc(session("zach", "admin", false, "Zach Levin"));
  const defaults = templateDefaults["application-submitted"];
  return {
    "users/zach": { ...zach, email: "zach@example.com", profile: { ...zach.profile, universityEmail: "zach@nottingham.example.ac.uk" } },
    "applicationEmailTemplates/application-submitted": {
      templateId: "application-submitted",
      subject: defaults.subject,
      blocks: defaults.blocks,
      recipients: defaults.recipients,
    },
  };
}

/** Every line the route logged, as one string. */
function logged(t) {
  const lines = [];
  t.mock.method(console, "error", (...args) => lines.push(args.map((each) => String(each?.message ?? each)).join(" ")));
  return () => lines.join("\n");
}

function assertFixed(answer, what) {
  const text = JSON.stringify(answer.body);
  assert.ok(!text.includes("smtp.example.invalid") && !text.includes("ab12cd"), `${what} answered with the thrown words: ${text}`);
  assert.ok(!text.includes("mail door"), `${what} answered with the thrown words: ${text}`);
  assert.equal(typeof answer.body.error, "string", what);
}

describe("the designers' routes answer a failure in fixed words", () => {
  test("a test send whose every email fails says so without the error or an address, and logs the error", async (t) => {
    for (const [what, handler, templateId] of [
      ["course send-test", courseSendTest.POST, "course-allocated"],
      ["application send-test", applicationSendTest.POST, "application-submitted"],
    ]) {
      w.reset(seed());
      const log = logged(t);
      w.world.mailFate = () => "fail";
      const answer = await w.call("zach", handler, { templateId });
      assert.equal(answer.status, 500, `${what}: ${JSON.stringify(answer.body)}`);
      assertFixed(answer, what);
      assert.doesNotMatch(JSON.stringify(answer.body), /@/, `${what} answered with an address`);
      assert.match(log(), /mail door refused/, `${what} did not log the error`);
    }
  });

  test("a test send that half fails reports the failure in fixed words", async () => {
    w.reset(seed());
    // The account's own address fails; the university one is sent.
    w.world.mailFate = (args) => (args.to === "zach@example.com" ? "fail" : "sent");
    const answer = await w.call("zach", courseSendTest.POST, { templateId: "course-allocated" });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body.sentTo, ["zach@nottingham.example.ac.uk"]);
    for (const failure of answer.body.failures) assert.doesNotMatch(failure.error, /mail door/);
  });

  test("a preview that cannot render says so without the error, and logs it", async (t) => {
    for (const [what, handler] of [
      ["course preview", coursePreview.POST],
      ["application preview", applicationPreview.POST],
    ]) {
      r.reset(seed());
      const log = logged(t);
      const answer = await r.call("zach", handler, {}, { body: { subject: "Hello", blocks: [], tokens: {} } });
      assert.equal(answer.status, 500, `${what}: ${JSON.stringify(answer.body)}`);
      assertFixed(answer, what);
      assert.ok(log().includes(THROWN), `${what} did not log the error`);
    }
  });
});

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

const DESIGNER_FOLDERS = ["src/app/api/admin/course-emails", "src/app/api/admin/application-emails"];

function routesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routesUnder(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

describe("every route in the designers' folders", () => {
  test("hands no Error's own message to a response", () => {
    const routes = DESIGNER_FOLDERS.flatMap((folder) => routesUnder(join(REPO_ROOT, folder)));
    assert.ok(routes.length >= 5, `found ${routes.length} routes: the walk reached too little`);
    for (const file of routes) {
      const code = stripSource(readFileSync(file, "utf8"));
      // `.message` read off anything at all: a route that wants to answer with
      // words it wrote has them in a constant, not on an Error.
      assert.doesNotMatch(code, /\b(?:err|error|e|cause)\??\.message\b/, `${relative(REPO_ROOT, file)} answers with an Error's own message`);
    }
  });
});
