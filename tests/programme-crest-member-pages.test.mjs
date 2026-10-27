/**
 * The crest on a member's programme pages (run via `npm test`, Node's
 * built-in runner, against the member pages' world: the real routes, the
 * real run home and card, an in-memory store).
 *
 * Two placements, both by the run's rule in `src/lib/crests/resolve.ts`: the
 * crest of the programme on the form that names the run, else its course's,
 * else the NAISI emblem.
 *
 *  1. THE HEAD OF THE RUN'S OWN PAGE (`/learn/<run>`), 128px, decorative
 *     beside the programme's name. The overview route carries the answer as
 *     `shownCrest`, and nothing of the form or the course besides.
 *  2. THE CARD ON MY PROGRAMMES (`/learn`), 44px, decorative beside the
 *     run's name, from the hub's own route.
 *
 * Each rung of the rule is set up in the store the way an admin's two
 * settings would have left it, and read back as a member taking part and as
 * the group's facilitator see it.
 */
import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeMemberPagesWorld, memberSeed, RUN } from "./lib/memberPagesWorld.mjs";
import { AGI, COURSE, ROUND } from "./lib/hubAttendanceWorld.mjs";

const pages = await makeMemberPagesWorld("__crestMemberPages");
const { call, loadTs } = pages;
const RunCard = (await loadTs(join("features", "courses", "RunCard.tsx"))).default;
const meRoute = pages.routes.me;

const KEYS = ["agi-strategy", "technical-ai-safety", "governance-macrostrategy", "alignment"];

/** A member taking part in Group B, and the group's facilitator. */
const MEMBER = "amara";
const FACILITATOR = "rahul";

/** The store, with the programme's and the course's crests as the two settings left them. */
function seedWith({ programme = undefined, course = undefined } = {}) {
  const seed = memberSeed();
  if (programme !== undefined) seed[`admissionRounds/${ROUND}`].programmes[AGI].crest = programme;
  if (course !== undefined) seed[`courses/${COURSE.agi}`] = { ...seed[`courses/${COURSE.agi}`], crest: course };
  return seed;
}

/** The `<svg>` that opens a mark, and its attributes. */
const svgs = (html) => [...html.matchAll(/<svg\b[^>]*>/g)].map(([tag]) => tag);
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;
/** The marks at one height: the crest's svg, or the emblem's. */
const marksAt = (html, size) => svgs(html).filter((tag) => attr(tag, "height") === String(size));
/** Whether the drawing carries this programme's colour: only a crest does. */
const inks = (html, key) => html.includes(`var(--programme-${key}`);

beforeEach(() => pages.reset(seedWith()));

describe("the head of a run's own page", () => {
  test("the world names the run from the form, so the run's rule has a programme to ask", async () => {
    const answer = await pages.asBrowser(MEMBER);
    assert.equal(answer.status, 200);
    assert.ok(pages.ui.overview.programme, "no programme names the run in this world");
  });

  test("the programme's own crest wins over its course's", async () => {
    pages.reset(seedWith({ programme: "technical-ai-safety", course: "agi-strategy" }));
    for (const who of [MEMBER, FACILITATOR]) {
      await pages.asBrowser(who);
      assert.equal(pages.ui.overview.shownCrest, "technical-ai-safety", who);
      const { html } = pages.programmeHome(who);
      const [mark] = marksAt(html, 128);
      assert.ok(mark, `${who}: no 128px mark in the head`);
      assert.equal(attr(mark, "aria-hidden"), "true", `${who}: the name is beside it, so it is decorative`);
      assert.ok(inks(html, "technical-ai-safety"), who);
      assert.ok(!inks(html, "agi-strategy"), `${who}: the course's crest is not drawn as well`);
    }
  });

  test("a programme with none of its own shows its course's", async () => {
    pages.reset(seedWith({ programme: null, course: "agi-strategy" }));
    await pages.asBrowser(MEMBER);
    assert.equal(pages.ui.overview.shownCrest, "agi-strategy");
    const { html } = pages.programmeHome(MEMBER);
    assert.equal(marksAt(html, 128).length, 1);
    assert.ok(inks(html, "agi-strategy"));
  });

  test("with neither, the NAISI emblem stands in the crest's place, at the same height", async () => {
    pages.reset(seedWith({ programme: null, course: null }));
    await pages.asBrowser(MEMBER);
    assert.equal(pages.ui.overview.shownCrest, null);
    const { html } = pages.programmeHome(MEMBER);
    const [mark] = marksAt(html, 128);
    assert.ok(mark, "no 128px mark in the head");
    assert.equal(attr(mark, "class"), "emblem", "the emblem, drawn by BrandMark");
    assert.ok(!html.includes("var(--programme-"), "no crest is drawn");
  });

  test("a stored crest that is not one of the four keys shows the course's, then the emblem", async () => {
    pages.reset(seedWith({ programme: "dragon", course: "alignment" }));
    await pages.asBrowser(MEMBER);
    assert.equal(pages.ui.overview.shownCrest, "alignment");
    pages.reset(seedWith({ programme: "dragon", course: "Alignment" }));
    await pages.asBrowser(MEMBER);
    assert.equal(pages.ui.overview.shownCrest, null);
  });

  test("a run no programme names shows its course's crest", async () => {
    const seed = seedWith({ programme: "alignment", course: "agi-strategy" });
    seed[`admissionRounds/${ROUND}`].programmes[AGI].runId = null;
    pages.reset(seed);
    await pages.asBrowser(MEMBER);
    assert.equal(pages.ui.overview.programme, null);
    assert.equal(pages.ui.overview.shownCrest, "agi-strategy");
  });

  test("only the crest's key travels: nothing else of the form or the course", async () => {
    pages.reset(seedWith({ programme: "technical-ai-safety", course: "agi-strategy" }));
    const answer = await pages.asBrowser(MEMBER);
    assert.equal(answer.body.shownCrest, "technical-ai-safety");
    // Every value in the payload that is a crest's key: the one answer, once.
    const keys = [];
    const walk = (value) => {
      if (typeof value === "string" && KEYS.includes(value)) keys.push(value);
      else if (value && typeof value === "object") for (const inner of Object.values(value)) walk(inner);
    };
    walk(answer.body);
    assert.deepEqual(keys, ["technical-ai-safety"], "the course's crest does not travel when the programme's wins");
    assert.ok(!JSON.stringify(answer.body).includes(ROUND), "the form's id does not travel");
  });
});

describe("the card on My programmes", () => {
  const card = async (who) => {
    const answer = await call(who, meRoute.GET, {}, { course: true });
    assert.equal(answer.status, 200, who);
    const entry = answer.body.runs.find((row) => row.runId === RUN.agi);
    assert.ok(entry, `${who}: no card for the run`);
    return { entry, html: renderToStaticMarkup(createElement(RunCard, { entry })) };
  };

  test("the card shows the run's crest at 44px, decorative beside its name", async () => {
    pages.reset(seedWith({ programme: "governance-macrostrategy", course: "agi-strategy" }));
    const { entry, html } = await card(MEMBER);
    assert.equal(entry.shownCrest, "governance-macrostrategy");
    const [mark] = marksAt(html, 44);
    assert.ok(mark, "no 44px mark on the card");
    assert.equal(attr(mark, "aria-hidden"), "true");
    assert.ok(inks(html, "governance-macrostrategy"));
    assert.ok(!inks(html, "agi-strategy"), "the course's crest is not drawn as well");
  });

  test("the card falls back as the page does: the course's, then the emblem", async () => {
    pages.reset(seedWith({ programme: null, course: "alignment" }));
    assert.equal((await card(MEMBER)).entry.shownCrest, "alignment");
    pages.reset(seedWith({ programme: null, course: null }));
    const { entry, html } = await card(MEMBER);
    assert.equal(entry.shownCrest, null);
    assert.equal(attr(marksAt(html, 44)[0], "class"), "emblem");
  });

  test("the card and the run's own page agree", async () => {
    pages.reset(seedWith({ programme: "alignment", course: "technical-ai-safety" }));
    const { entry } = await card(MEMBER);
    await pages.asBrowser(MEMBER);
    assert.equal(entry.shownCrest, pages.ui.overview.shownCrest);
  });
});
