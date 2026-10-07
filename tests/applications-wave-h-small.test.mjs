/**
 * Three small rules, each held where a screen and a route have to agree.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  1. A TERM THAT IS OVER TAKES NO NEW PROGRAMME. The term page stopped
 *     offering "New programme" once decisions had gone out, and the route
 *     went on taking the request. Both now ask one predicate,
 *     `closedToNewProgrammes` (`src/lib/applications/lifecycle/status.ts`).
 *     Executed here against every stage a form can be in; the route's own
 *     refusals are executed in `applications-editor-routes` and in the
 *     journey.
 *  2. "COULD SUIT" NEVER OFFERS A PROGRAMME THE PERSON RANKED. The list is
 *     executed in `applications-review-routes`, with the route that refuses
 *     the same thing. Here the two are held to one rule in the source.
 *  3. THE WAITING PAGE LEADS TO AN APPLICATION. A waiting account that signs
 *     in again from a decision email's button is brought to the waiting
 *     page, which had no way on to the application the email was about.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const flat = (...parts) => readFileSync(join(SRC, ...parts), "utf8").replace(/\s+/g, " ");

const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const status = await loadTs(join("lib", "applications", "lifecycle", "status.ts"));

// ---------------------------------------------------------------------------
// 1. A new programme
// ---------------------------------------------------------------------------

const OPENS = new Date("2026-10-06T08:00:00Z");
const CLOSES = new Date("2026-10-18T22:59:00Z");
const SENT_AT = new Date("2026-10-23T09:00:00Z");
const facts = (over = {}) => ({ status: "open", archived: false, opensAt: OPENS, closesAt: CLOSES, decisionsSentAt: null, ...over });

/** A form in each stage there is, with the moment it is looked at. */
const STAGES = [
  ["draft", facts({ status: "draft" }), new Date("2026-10-01T09:00:00Z")],
  ["opens-later", facts(), new Date("2026-10-05T09:00:00Z")],
  ["open", facts(), new Date("2026-10-10T09:00:00Z")],
  ["deciding", facts(), new Date("2026-10-20T09:00:00Z")],
  ["decided", facts({ decisionsSentAt: SENT_AT }), new Date("2026-10-24T09:00:00Z")],
  ["settled", facts({ status: "settled", decisionsSentAt: SENT_AT }), new Date("2026-10-27T09:00:00Z")],
  ["cancelled", facts({ status: "cancelled" }), new Date("2026-10-10T09:00:00Z")],
  ["archived", facts({ status: "settled", archived: true, decisionsSentAt: SENT_AT }), new Date("2026-11-27T09:00:00Z")],
];

describe("a term that is over takes no new programme", () => {
  test("the sample forms are in the stages their names say", () => {
    for (const [stage, form, now] of STAGES) assert.equal(status.termStageFor(form, now), stage);
  });

  test("a programme can be added until decisions have gone out, and never after", () => {
    assert.deepEqual(
      Object.fromEntries(STAGES.map(([stage, form]) => [stage, status.closedToNewProgrammes(form)])),
      {
        draft: null,
        "opens-later": null,
        open: null,
        deciding: null,
        decided: "Decisions for this term have been sent, so a programme can no longer be added to it.",
        settled: "This term is settled, so a programme can no longer be added to it.",
        cancelled: "This application form was cancelled, so a programme can no longer be added to it.",
        archived: "This application form is archived, so a programme can no longer be added to it.",
      },
    );
  });

  test("a form that is cancelled and never sent is still closed to one", () => {
    assert.notEqual(status.closedToNewProgrammes({ status: "cancelled", archived: false, decisionsSentAt: null }), null);
    assert.notEqual(status.closedToNewProgrammes({ status: "draft", archived: true, decisionsSentAt: null }), null);
  });

  test("the term page offers the button, and the route takes the request, on that one answer", () => {
    const page = flat("app", "(app)", "admin", "admissions", "forms", "[roundId]", "page.tsx");
    assert.match(
      page,
      /\{closedToNewProgrammes\(\{ status: loaded\.form\.round\.status, archived: loaded\.form\.round\.archived, decisionsSentAt: loaded\.form\.decisionsSentAt, \}\) === null && <NewProgrammeButton roundId=\{form\.id\} \/>\}/,
    );
    assert.equal(page.match(/<NewProgrammeButton/g).length, 1, "offered in one place");
    const write = flat("lib", "applications", "editor", "write.ts");
    const at = write.indexOf("if (change.addProgramme !== undefined) {", write.indexOf("let addedProgrammeId"));
    assert.ok(at > 0);
    // The first thing the branch does, before a programme is minted.
    assert.match(
      write.slice(at, at + 520),
      /const closed = closedToNewProgrammes\(\{ status: round\.status, archived: round\.archived, decisionsSentAt: form\.decisionsSentAt, \}\); if \(closed\) return refuse\(409, closed\);/,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Could suit
// ---------------------------------------------------------------------------

describe("could suit never names a programme the person ranked", () => {
  test("the review screen's list leaves them out", () => {
    const detail = flat("lib", "applications", "review", "detail.ts");
    assert.match(
      detail,
      /couldSuitOptions: form\.programmeIds \.filter\(\(id\) => id !== programmeId && !ranked\.includes\(id\)\)/,
    );
  });

  test("and the decision write refuses one, in the words it already uses for the programme itself", () => {
    const decide = flat("lib", "applications", "review", "decide.ts");
    assert.match(
      decide,
      /if \(change\.couldSuitProgrammeId && ranked\.includes\(change\.couldSuitProgrammeId\)\) \{ return \{ outcome: "refused", status: 400, reason: "Pick a different programme they could suit\.", name, \}; \}/,
    );
    assert.equal(decide.match(/"Pick a different programme they could suit\."/g).length, 2);
  });
});

// ---------------------------------------------------------------------------
// 3. The waiting page
// ---------------------------------------------------------------------------

describe("the waiting page leads to an application", () => {
  const page = flat("app", "(auth)", "pending-approval", "page.tsx");

  test("one link, Your applications, to the list that admits a waiting account", () => {
    const links = page.match(/<Link href="\/applications"[^>]*> Your applications <\/Link>/g) ?? [];
    assert.equal(links.length, 1);
    assert.equal(page.match(/href="\/applications"/g).length, 1);
  });

  test("in the style of the link beside it", () => {
    const style = 'style={{ color: "var(--color-accent)", fontSize: "var(--text-sm)" }}';
    assert.ok(page.includes(`<Link href="/applications" ${style}> Your applications </Link>`));
    assert.ok(page.includes(`<Link href="/" ${style}>`), "the homepage link it sits above");
  });

  test("the two links that were there are still there", () => {
    assert.match(page, /<Link href="\/courses" style=\{\{ color: "var\(--color-accent\)" \}\}> apply for a course <\/Link>/);
    assert.match(page, /← Back to the homepage/);
  });
});
