/**
 * A set of questions has two lines of its own, and applicants are sent one.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  - THE LINE SHOWN TO APPLICANTS (`applicantLine`) is drawn under the set's
 *    heading on its step, before its first question. An admin writes it, as
 *    plain text of at most 300 characters as typed, in which an `https://`
 *    address and `[words](https://address)` are drawn as links by the one
 *    component that does that.
 *  - THE NOTE FOR ADMINS (`intro`) is kept with the set for whoever edits the
 *    form next. An applicant is never sent it.
 *
 * What is held: the two are separate fields end to end, so the note never
 * stands in for the line, by any route and whatever each holds. Every kind of
 * set can carry a line. The line is drawn on the form and nowhere else: not
 * on the review screen, and not on an applicant's page after sending.
 *
 * Real: every route handler used, the loaders, builders and writers under
 * `src/lib/applications/`, and the form's own component for the line. Faked:
 * `next/server`, the sentinels `firebase-admin/firestore` supplies, the
 * view-as guard, the session, the mail door, the stylesheet, and the Admin
 * SDK handle, which is `tests/lib/applicationsStore.mjs`.
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import {
  AGI,
  CAST,
  ROUND,
  TAIS,
  WHILE_DECIDING,
  WHILE_OPEN,
  seedTerm,
} from "./lib/applicationsSmallTerm.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(REPO_ROOT, file), "utf8");

const world = { db: null, user: null };
globalThis.__setLine = world;

/** A stylesheet: every class it is asked for is its own name. */
const STYLES = "export default new Proxy({}, { get: (_, name) => String(name) });";

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "next/server",
      "export class NextResponse {\n" +
        "  constructor(body, init) {\n" +
        "    this.body = body;\n" +
        "    this.status = (init && init.status) || 200;\n" +
        "  }\n" +
        "  static json(body, init) { return new NextResponse(body, init); }\n" +
        "}",
    ],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    ["@/lib/firebase/admin", "export function getAdminDb() {\n  return globalThis.__setLine.db;\n}"],
    ["@/lib/firebase/session", "export async function getCurrentUser() {\n  return globalThis.__setLine.user;\n}"],
    ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() {\n  return null;\n}"],
    // Nothing in this file sends, and nothing could.
    ["@/lib/email/send", "export async function sendEmail() {\n  throw new Error('this suite sends nothing');\n}"],
    ["./form.module.css", STYLES],
  ]),
});
const lib = (...parts) => loadTs(join("lib", "applications", ...parts));
const api = (...parts) => loadTs(join("app", "api", "admissions", "forms", "[roundId]", ...parts, "route.ts"));

const model = await lib("model.ts");
const normalise = await lib("normalise.ts");
const editorParse = await lib("editor", "parse.ts");
const project = await lib("applicant", "project.ts");
const shape = await lib("applicant", "shape.ts");
const lock = await lib("editor", "lock.ts");
const statusLoad = await lib("status", "load.ts");
const { LINKS_HINT } = await lib("linkedText.ts");
const { default: SetLine } = await loadTs(join("features", "applications", "apply", "SetLine.tsx"));

const routes = {
  sets: await api("sets"),
  set: await api("sets", "[setId]"),
  application: await api("application"),
  review: await api("applications", "[uid]"),
};

mock.timers.enable({ apis: ["Date"], now: WHILE_OPEN });
const at = (when) => mock.timers.setTime(when.getTime());

// ---------------------------------------------------------------------------
// The term
// ---------------------------------------------------------------------------

/** What only an admin should ever read, and what an applicant should. Neither is in the other. */
const NOTE = "ONLY-FOR-ADMINS: ask Lloyd before changing these.";
const LINE = "Read the briefs first: https://example.org/briefs";

const setPath = (id) => `admissionRounds/${ROUND}/questionSets/${id}`;

const question = (id, text) => ({
  id,
  text,
  help: "",
  type: "long",
  options: [],
  optionsFromRanking: false,
  wordLimit: null,
  required: true,
  scored: false,
});

/** One set of every kind a set can be. */
const KINDS = {
  shared: { role: "general", scope: { type: "everybody" }, label: "Shared" },
  fellowships: { role: "general", scope: { type: "kind", kind: "fellowship" }, label: "Fellowships" },
  [AGI]: { role: "stream", scope: { type: "programme", programmeId: AGI }, label: "AGI Strategy" },
  facilitator: { role: "facilitator", scope: { type: "facilitating" }, label: "Facilitator questions" },
};

function termDocs({ round = {}, sets = {}, applications = true } = {}) {
  const over = {};
  for (const [id, kind] of Object.entries(KINDS)) {
    over[setPath(id)] = { roundId: ROUND, intro: "", questions: [question("q", `A question in ${kind.label}`)], ...kind, ...(sets[id] ?? {}) };
  }
  const docs = seedTerm({
    round: { questionSetIds: ["shared", "fellowships", AGI, TAIS, "facilitator"], asksFacilitating: true, ...round },
    over,
  });
  if (!applications) {
    for (const path of Object.keys(docs)) {
      if (path.startsWith("admissionApplications/")) delete docs[path];
    }
  }
  return docs;
}

/** A form nobody has applied to yet, which an admin can still change. */
function openForm(sets = {}) {
  at(WHILE_OPEN);
  world.db = makeDb(
    termDocs({ round: { status: "open", applicationCounts: { draft: 0, submitted: 0 } }, sets, applications: false }),
    { now: WHILE_OPEN },
  );
  return world.db;
}

let requests = 0;
async function call(who, handler, params, { body, query = "" } = {}) {
  requests += 1;
  world.user = who ? CAST[who] : null;
  const init = {
    method: handler.name,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.${(requests >> 16) & 255}.${(requests >> 8) & 255}.${requests & 255}`,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await handler(new Request(`https://naisi.invalid/api${query}`, init), {
    params: Promise.resolve({ roundId: ROUND, ...params }),
  });
  return { status: response.status, body: structuredClone(response.body) };
}
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));

// ---------------------------------------------------------------------------
// 1. Two fields, read apart
// ---------------------------------------------------------------------------

describe("a set's two lines are two fields", () => {
  const stored = (over) => normalise.normaliseQuestionSet("a-set", { roundId: ROUND, ...KINDS.shared, questions: [], ...over });

  test("each is read from its own field, and neither stands in for the other", () => {
    const both = stored({ intro: NOTE, applicantLine: LINE });
    assert.equal(both.intro, NOTE);
    assert.equal(both.applicantLine, LINE);
    // A set stored before the line existed has none, whatever its note says.
    assert.equal(stored({ intro: NOTE }).applicantLine, "");
    assert.equal(stored({ applicantLine: LINE }).intro, "");
    for (const wrong of [undefined, null, 7, ["a"], { text: "a" }]) {
      assert.equal(stored({ intro: NOTE, applicantLine: wrong }).applicantLine, "");
    }
  });

  test("the line has the note's limit, and a reader cuts a longer one", () => {
    assert.equal(model.APPLICATION_LIMITS.setApplicantLine, 300);
    assert.equal(model.APPLICATION_LIMITS.setApplicantLine, model.APPLICATION_LIMITS.setIntro);
    assert.equal(stored({ applicantLine: "a".repeat(400) }).applicantLine.length, 300);
  });

  test("an applicant is sent the line, and the note is not a field of what they are sent", () => {
    const sent = project.projectQuestionSetForApplicant(stored({ intro: NOTE, applicantLine: LINE }));
    assert.equal(sent.applicantLine, LINE);
    assert.deepEqual(Object.keys(sent).sort(), ["applicantLine", "id", "label", "questions", "role", "scope"]);
    assert.ok(!JSON.stringify(sent).includes("ONLY-FOR-ADMINS"), "an applicant was sent the note for admins");
    assert.ok(!JSON.stringify(sent).includes("intro"));
    // With no line, they are sent an empty one. Never the note in its place.
    const without = project.projectQuestionSetForApplicant(stored({ intro: NOTE }));
    assert.equal(without.applicantLine, "");
    assert.ok(!JSON.stringify(without).includes("ONLY-FOR-ADMINS"));
    // And the copy the form in the browser rebuilds carries the line and an empty note.
    const [rebuilt] = shape.questionSetsOf({ id: ROUND }, [sent]);
    assert.deepEqual([rebuilt.applicantLine, rebuilt.intro], [LINE, ""]);
  });

  test("the projection names the line's own field and never the note's", () => {
    const code = stripSource(read("src/lib/applications/applicant/project.ts"), { keepStrings: true });
    assert.match(code, /applicantLine: set\.applicantLine,/);
    assert.ok(!/\.intro\b/.test(code), "the applicant's projection reads a set's note for admins");
    const reader = stripSource(read("src/lib/applications/normalise.ts"), { keepStrings: true });
    assert.match(reader, /applicantLine: str\(raw\.applicantLine, L\.setApplicantLine\),/);
    // Nothing in the form's own folder reads the note either.
    const shaped = stripSource(read("src/lib/applications/applicant/shape.ts"), { keepStrings: true });
    assert.match(shaped, /intro: "",\s*applicantLine: set\.applicantLine,/);
  });
});

// ---------------------------------------------------------------------------
// 2. Through the editor's routes
// ---------------------------------------------------------------------------

describe("an admin writes the line, on any kind of set", () => {
  test("every kind of set can carry one, and writing it leaves the note alone", async () => {
    openForm({ shared: { intro: NOTE }, fellowships: { intro: NOTE }, [AGI]: { intro: NOTE }, facilitator: { intro: NOTE } });
    for (const id of Object.keys(KINDS)) {
      const written = await call("zach", routes.set.PATCH, { setId: id }, { body: { applicantLine: `  ${LINE}  ` } });
      assert.equal(written.status, 200, id);
      const doc = world.db.read(setPath(id));
      assert.equal(doc.applicantLine, LINE, `${id}: the line was not stored as typed, trimmed`);
      assert.equal(doc.intro, NOTE, `${id}: writing the line changed the note for admins`);
      assert.deepEqual([written.body.set.applicantLine, written.body.set.intro], [LINE, NOTE], id);
    }
    // And the other way: the note is written without touching the line.
    const noted = await call("zach", routes.set.PATCH, { setId: "shared" }, { body: { intro: "Another note." } });
    assert.equal(noted.status, 200);
    assert.deepEqual(
      [world.db.read(setPath("shared")).intro, world.db.read(setPath("shared")).applicantLine],
      ["Another note.", LINE],
    );
    // It can be taken away again.
    assert.equal((await call("zach", routes.set.PATCH, { setId: "shared" }, { body: { applicantLine: "" } })).status, 200);
    assert.equal(world.db.read(setPath("shared")).applicantLine, "");
  });

  test("a new set starts with no line, and is given one by the same request", async () => {
    openForm();
    const made = await call("zach", routes.sets.POST, {}, { body: { label: "More for AGI", scope: { type: "programme", programmeId: AGI } } });
    assert.equal(made.status, 201);
    assert.equal(world.db.read(setPath(made.body.id)).applicantLine, "");
    assert.equal(made.body.sets.find((set) => set.id === made.body.id).applicantLine, "");
    const written = await call("zach", routes.set.PATCH, { setId: made.body.id }, { body: { applicantLine: LINE } });
    assert.equal(written.status, 200);
    assert.equal(world.db.read(setPath(made.body.id)).applicantLine, LINE);
  });

  test("the limit counts what was typed, a link's brackets and address included", async () => {
    openForm();
    const link = "[the briefs](https://example.org/briefs)";
    const exactly = `${link} ${"a".repeat(300 - link.length - 1)}`;
    assert.equal(exactly.length, 300);
    assert.deepEqual(editorParse.parseSetChange({ applicantLine: exactly }), { ok: true, value: { applicantLine: exactly } });
    assert.equal((await call("zach", routes.set.PATCH, { setId: "shared" }, { body: { applicantLine: exactly } })).status, 200);
    assert.equal(world.db.read(setPath("shared")).applicantLine, exactly);

    const before = everything();
    const over = await call("zach", routes.set.PATCH, { setId: "shared" }, { body: { applicantLine: `${exactly}a` } });
    assert.equal(over.status, 400);
    assert.equal(over.body.error, "The line shown to applicants is 1 character over its limit of 300.");
    for (const notText of [7, null, ["a"], { text: "a" }]) {
      const refused = await call("zach", routes.set.PATCH, { setId: "shared" }, { body: { applicantLine: notText } });
      assert.equal(refused.status, 400);
      assert.equal(refused.body.error, "The line shown to applicants has to be text.");
    }
    // Each line is refused under its own name, so a refusal points at the right box.
    const note = await call("zach", routes.set.PATCH, { setId: "shared" }, { body: { intro: "a".repeat(301) } });
    assert.equal(note.status, 400);
    assert.equal(note.body.error, "The note for admins is 1 character over its limit of 300.");
    // One that is over refuses the whole request: nothing of it is saved.
    const both = await call("zach", routes.set.PATCH, { setId: "shared" }, {
      body: { label: "Renamed", intro: "A note.", applicantLine: "a".repeat(301) },
    });
    assert.equal(both.status, 400);
    assert.equal(everything(), before, "a refused line changed something");
  });

  test("only an admin writes it, and not once somebody has applied", async () => {
    openForm();
    const before = everything();
    for (const who of ["claudia", "lloyd", "yusuf", "amara", null]) {
      const response = await call(who, routes.set.PATCH, { setId: AGI }, { body: { applicantLine: "Mine." } });
      assert.ok([401, 403, 404].includes(response.status), `${who}: ${response.status}`);
    }
    assert.equal(everything(), before);
    // It is part of what applicants were shown, so it locks with the questions.
    at(WHILE_OPEN);
    world.db = makeDb(termDocs(), { now: WHILE_OPEN });
    const locked = await call("zach", routes.set.PATCH, { setId: AGI }, { body: { applicantLine: "Too late." } });
    assert.equal(locked.status, 409);
    assert.equal(locked.body.error, lock.lockedSentence(3));
  });
});

// ---------------------------------------------------------------------------
// 3. What an applicant is sent, and what the form draws
// ---------------------------------------------------------------------------

describe("an applicant reads the line under the set's heading, and never the note", () => {
  test("their own route sends each set its own line, and no note at all", async () => {
    openForm({
      shared: { intro: NOTE, applicantLine: "Short and rough is fine." },
      fellowships: { intro: NOTE, applicantLine: LINE },
      [AGI]: { intro: NOTE },
    });
    const view = await call("nina", routes.application.GET, {});
    assert.equal(view.status, 200);
    const lines = Object.fromEntries(view.body.sets.map((set) => [set.id, set.applicantLine]));
    assert.deepEqual(lines, {
      shared: "Short and rough is fine.",
      fellowships: LINE,
      [AGI]: "",
      [TAIS]: "",
      facilitator: "",
    });
    const body = JSON.stringify(view.body);
    assert.ok(!body.includes("ONLY-FOR-ADMINS"), "the applicant's own route sent a note for admins");
    assert.ok(!body.includes("intro"));
    for (const set of view.body.sets) {
      assert.deepEqual(Object.keys(set).sort(), ["applicantLine", "id", "label", "questions", "role", "scope"]);
    }
  });

  const draw = (set) => renderToStaticMarkup(createElement(SetLine, { set }));

  test("the form draws it as its author's text, with its links", () => {
    assert.equal(
      draw({ applicantLine: LINE }),
      '<p class="lede">Read the briefs first: <a href="https://example.org/briefs" target="_blank" rel="noopener noreferrer" class="inlineLink">https://example.org/briefs<span class="visually-hidden"> (opens in a new tab)</span></a></p>',
    );
    assert.match(draw({ applicantLine: "Read [the briefs](https://example.org/briefs) before you rank." }), />the briefs<span/);
    // Anything else in it is text.
    const hostile = draw({ applicantLine: "[the briefs](javascript:alert(1)) <img src=x onerror=alert(1)> http://example.org" });
    assert.ok(!hostile.includes("<a"), "a line with no https address was drawn with a link");
    assert.ok(!hostile.includes("<img"), "markup in the line was drawn as markup");
  });

  test("a set with no line draws nothing, whatever else it carries", () => {
    assert.equal(draw({ applicantLine: "" }), "");
    assert.equal(draw({ applicantLine: "   " }), "");
    assert.equal(draw(null), "");
    // Handed a whole set by mistake, it still reads the one field.
    assert.equal(draw({ applicantLine: "", intro: NOTE, label: "Shared" }), "");
    const code = stripSource(read("src/features/applications/apply/SetLine.tsx"), { keepStrings: true });
    assert.match(code, /const line = set\?\.applicantLine\.trim\(\) \?\? "";/);
    assert.match(code, /<LinkedText text=\{line\} linkClassName=\{styles\.inlineLink\} \/>/);
    assert.ok(!/intro/.test(code), "the component that draws the line names the note for admins");
  });

  test("it sits under the heading and above the questions, on the step of the set it belongs to", () => {
    const form = stripSource(read("src/features/applications/apply/ApplicationForm.tsx"), { keepStrings: true });
    const heading = form.indexOf("{stepHeading(step, setDocs)}");
    const line = form.indexOf("<SetLine set={set} />");
    const questions = form.indexOf("<QuestionsStep");
    assert.ok(heading !== -1 && line !== -1 && questions !== -1);
    assert.ok(heading < line && line < questions, "the line is not between the set's heading and its questions");
    assert.equal(form.split("<SetLine").length - 1, 1);
    // `set` is the set of the step on screen, and nothing for any other step.
    assert.match(form, /const set = step\.kind === "questions" \? setDocs\.find\(\(each\) => each\.id === step\.setId\) \?\? null : null;/);
    // Nothing in the applicant's form reads the note.
    assert.ok(!/\.intro\b/.test(form));
  });
});

// ---------------------------------------------------------------------------
// 4. Where it is not drawn
// ---------------------------------------------------------------------------

describe("the line is for filling the form in, and is drawn nowhere else", () => {
  test("not on the review screen, and not on an applicant's page after sending", async () => {
    at(WHILE_DECIDING);
    world.db = makeDb(
      termDocs({ round: { status: "deciding" }, sets: { fellowships: { intro: NOTE, applicantLine: LINE }, [AGI]: { applicantLine: LINE } } }),
      { now: WHILE_DECIDING },
    );
    for (const who of ["zach", "claudia", "lloyd"]) {
      const review = await call(who, routes.review.GET, { uid: "amara" }, { query: `?programme=${AGI}` });
      assert.equal(review.status, 200, who);
      const body = JSON.stringify(review.body);
      assert.ok(!body.includes("example.org/briefs"), `${who} was sent a set's line for applicants on the review screen`);
      assert.ok(!body.includes("applicantLine"));
      assert.ok(!body.includes("ONLY-FOR-ADMINS"));
    }
    const page = await statusLoad.loadStatus(world.db, ROUND, "amara", new Date());
    assert.equal(page.view.kind, "sent");
    assert.ok(!JSON.stringify(page.view).includes("example.org/briefs"));
  });

  test("so nothing but the form and the editor names it", () => {
    for (const file of [
      "src/lib/applications/review/detail.ts",
      "src/lib/applications/review/types.ts",
      "src/lib/applications/review/earlier.ts",
      "src/lib/applications/status/view.ts",
      "src/lib/applications/versions/kept.ts",
      "src/lib/applications/validate.ts",
      "src/lib/applications/sections.ts",
      "src/features/applications/review/ReviewSections.tsx",
      "src/features/applications/status/StatusPage.tsx",
      "src/features/applications/apply/CheckStep.tsx",
    ]) {
      assert.ok(!/applicantLine/.test(read(file)), `${file} now reads a set's line for applicants`);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. The editor's two boxes
// ---------------------------------------------------------------------------

describe("the editor has a box for each line, and each says who reads it", () => {
  const editor = read("src/features/applications/editor/FormEditor.tsx");
  const dialog = editor.slice(editor.indexOf("function RenameSetDialog("), editor.indexOf("function DeleteSetDialog("));

  test("the line's box is labelled for applicants, held to its limit, and says what becomes a link", () => {
    assert.match(dialog, /Line shown to applicants <span className=\{shared\.optional\}>\(optional\)<\/span>/);
    const box = dialog.slice(dialog.indexOf("`${ids}-applicant-line`"), dialog.indexOf("`${ids}-intro`"));
    assert.match(box, /value=\{applicantLine\}\s*maxLength=\{L\.setApplicantLine\}/);
    assert.match(box, /Applicants read it under the heading, before the first question\. \{LINKS_HINT\}/);
    assert.match(LINKS_HINT, /^An address that starts https:\/\/ becomes a link\./);
  });

  test("the note's box says what it always said", () => {
    assert.match(dialog, /Note for admins <span className=\{shared\.optional\}>\(optional\)<\/span>/);
    assert.match(dialog, /Kept with the set for whoever edits this form next\. Applicants never see it\./);
    const box = dialog.slice(dialog.indexOf("`${ids}-intro`"));
    assert.match(box, /value=\{intro\}\s*maxLength=\{L\.setIntro\}/);
    // The sentence about links is beside the line and not beside the note.
    assert.equal(dialog.split("{LINKS_HINT}").length - 1, 1);
    assert.ok(!box.includes("LINKS_HINT"));
  });

  test("the two are saved under their own names", () => {
    assert.match(dialog, /await patchSet\(roundId, set\.id, \{ label, applicantLine, intro \}\);/);
    // Each box opens on what the set holds, and the editor keeps what the
    // server stored. A box that reopened on an older line would save that
    // older line over the new one the next time the set was renamed.
    assert.match(dialog, /useState\(set\?\.applicantLine \?\? ""\)/);
    assert.match(dialog, /useState\(set\?\.intro \?\? ""\)/);
    assert.match(
      editor,
      /label: stored\.label,\s*intro: stored\.intro,\s*applicantLine: stored\.applicantLine,/,
      "the editor does not keep the line it has just saved",
    );
    assert.match(read("src/lib/applications/editor/write.ts"), /if \(change\.applicantLine !== undefined\) update\.applicantLine = change\.applicantLine;/);
    assert.match(read("src/lib/applications/editor/write.ts"), /if \(change\.intro !== undefined\) update\.intro = change\.intro;/);
  });
});
