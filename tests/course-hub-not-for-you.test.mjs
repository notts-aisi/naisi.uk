/**
 * ONE CALM PAGE for a group's own pages, driven through the real pages as
 * every kind of caller: the facilitator's group page
 * (`/learn/[runId]/group/[groupId]`), the draw's page (`/learn/draw/[groupId]`,
 * where the slips are copied in) and the pairs page (`/learn/pairs/[groupId]`).
 *
 *  1. The words: a heading, who the page is for (the group page leaves the
 *     programme's lead out, because it does not admit the lead; the draw's
 *     and the pairs pages keep the lead, because they do), what to do if that
 *     is wrong, and the way on to My programmes. Nothing names a group.
 *  2. THE SAME BYTES WHATEVER THE TRUTH IS. A real group that is not the
 *     caller's, an archived group, a group of another run, a run that is
 *     being destroyed, a made-up id and an id that can name no document all
 *     draw the page byte for byte, for each of the three pages, so the page
 *     says nothing about whether a group exists. The page is drawn, never a
 *     redirect, never `notFound()`.
 *  3. WHO EACH PAGE ADMITS IS UNCHANGED: the group page its live
 *     facilitators and admins (an admin on an archived group too); the draw's
 *     and the pairs pages the group's live facilitators, the programme's lead
 *     and admins, on a live group. Signed out still goes to sign in, and a
 *     made-up run id on the group page still goes to My programmes.
 *  4. In the source: each page's only redirect left is the signed-out one
 *     (and the group page's no-run one), no `notFound()`, and each page
 *     draws the calm page under its own name.
 *
 * The world is `tests/lib/pairsWorld.mjs`: AGI Strategy in week 3, Group B
 * (Chloe, Farah, Kofi; Rahul, Sofia and Farah facilitating), Group C (Tom
 * facilitating), Claudia leading the programme and Tess another, Yusuf the
 * run's track lead, Lloyd a reviewer, Zach an admin.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { B, C, NOW, RUN, makePairsWorld } from "./lib/pairsWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const PAGE_FILES = {
  group: join(SRC, "app", "(app)", "learn", "[runId]", "group", "[groupId]", "page.tsx"),
  draw: join(SRC, "app", "(app)", "learn", "draw", "[groupId]", "page.tsx"),
  pairs: join(SRC, "app", "(app)", "learn", "pairs", "[groupId]", "page.tsx"),
};

const w = await makePairsWorld("__notForYou");
const { default: NotForYou } = await w.loadTs(join("features", "courses", "facilitator", "NotForYou.tsx"));
const words = await w.loadTs(join("lib", "courses", "notForYouWords.ts"));

before(() => mock.timers.enable({ apis: ["Date"], now: NOW }));
after(() => mock.timers.reset());
beforeEach(() => w.reset());

/** The calm page as each page draws it. */
const calm = (page) => renderToStaticMarkup(createElement(NotForYou, { page }));

/** A group of another run, facilitated by Tom, for the group page's run check. */
const ELSEWHERE = "tais-autumn-2026-thursdays__grp00009";
function seedElsewhere() {
  w.world.db.seed(`courseGroups/${ELSEWHERE}`, {
    ...w.world.db.read(`courseGroups/${C}`),
    runId: RUN.tais,
    name: "Group T",
    facilitatorUids: ["tom"],
  });
}

/** Each page as `who`, on `groupId`. */
const pages = {
  group: (who, groupId = B, runId = RUN.agi) => w.draw(w.pages.group, who, { runId, groupId }),
  draw: (who, groupId = B) => w.drawPage(who, groupId),
  pairs: (who, groupId = B) => w.pairsPage(who, groupId),
};

/** Asserts `drawn` is the calm page for `page`, byte for byte. */
function assertCalm(drawn, page, at) {
  assert.equal(drawn.to, null, `${at}: sent to ${drawn.to} instead of the calm page`);
  assert.equal(drawn.html, calm(page), `${at}: not the calm page byte for byte`);
}

/** Asserts `drawn` is the page itself, not the calm page. */
function assertAdmitted(drawn, at) {
  assert.equal(drawn.to, null, `${at}: sent to ${drawn.to}`);
  assert.ok(drawn.html.length > 0, `${at}: drew nothing`);
  assert.ok(!drawn.html.includes('data-testid="not-for-you"'), `${at}: given the calm page`);
  assert.ok(!drawn.html.includes(words.NOT_FOR_YOU_HEADING), `${at}: given the calm page's heading`);
}

describe("the words", () => {
  test("every sentence, word for word, with the lead only where the page admits the lead", () => {
    assert.equal(words.NOT_FOR_YOU_HEADING, "This page isn’t for your account");
    assert.equal(words.notForYouWho("group"), "It’s for a group’s facilitators and admins.");
    assert.equal(words.notForYouWho("draw"), "It’s for a group’s facilitators, the programme’s lead and admins.");
    assert.equal(words.notForYouWho("pairs"), "It’s for a group’s facilitators, the programme’s lead and admins.");
    assert.equal(words.NOT_FOR_YOU_HELP, "If you facilitate this group and can’t open it, ask the team and we’ll put it right.");
    for (const page of ["group", "draw", "pairs"]) {
      const html = calm(page);
      const text = html.replace(/<[^>]+>/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
      assert.deepEqual(text, [words.NOT_FOR_YOU_HEADING, words.notForYouWho(page), words.NOT_FOR_YOU_HELP, "My programmes"], page);
      // One way on, to My programmes, and no control for anything else.
      assert.deepEqual([...html.matchAll(/<a\b[^>]*href="([^"]*)"/g)].map((m) => m[1]), ["/learn"], page);
      assert.equal((html.match(/<h1\b/g) ?? []).length, 1, page);
      assert.doesNotMatch(html, /<(button|form|input|select)\b/, page);
      assert.doesNotMatch(html, /[\u2013\u2014]/, `${page}: a dash`);
    }
    assert.ok(!calm("group").includes("lead"), "the group page's version names the lead, whom the group page does not admit");
    assert.equal(calm("draw"), calm("pairs"), "the draw's and the pairs pages say different things");
  });
});

describe("the group page", () => {
  test("the same bytes for a real group that is not theirs, an archived one, another run's and an id that names nothing", async () => {
    seedElsewhere();
    const cases = [];
    // A real, live group that is not theirs, as each kind of caller the run admits.
    for (const who of ["tom", "grace", "amara", "chloe", "kofi", "claudia", "tess", "yusuf", "lloyd", "nobody"]) cases.push([who, B]);
    // An address that was never a group, and one that can name no document.
    for (const id of ["no-such-group", "a/b", ".", ".."]) cases.push(["tom", id]);
    // A group of another run, even to its own facilitator.
    cases.push(["tom", ELSEWHERE]);
    cases.push(["zach", ELSEWHERE]);
    for (const [who, groupId] of cases) assertCalm(await pages.group(who, groupId), "group", `${who} on ${groupId}`);

    // An archived group, to the facilitators it had.
    w.world.db.poke(`courseGroups/${B}`, { archived: true });
    for (const who of ["rahul", "sofia", "farah", "tom", "chloe"]) assertCalm(await pages.group(who), "group", `${who} on an archived group`);
  });

  test("who it admits is unchanged: the group's live facilitators and admins, an admin on an archived group too", async () => {
    for (const who of ["rahul", "sofia", "farah", "zach"]) {
      const drawn = await pages.group(who);
      assertAdmitted(drawn, who);
      assert.match(drawn.text, /Group B/, who);
    }
    w.world.db.poke(`courseGroups/${B}`, { archived: true });
    assertAdmitted(await pages.group("zach"), "an admin on an archived group");
  });

  test("signed out still goes to sign in, and a run that is not there to My programmes", async () => {
    assert.equal((await pages.group(null)).to, "/login");
    assert.equal((await pages.group("tom", B, "no-such-run")).to, "/learn");
    assert.equal((await pages.group("zach", "no-such-group", "no-such-run")).to, "/learn");
  });
});

for (const page of ["draw", "pairs"]) {
  describe(`the ${page === "draw" ? "draw's" : "pairs"} page`, () => {
    test("the same bytes for a real group that is not theirs, an archived one, a run being destroyed and an id that names nothing", async () => {
      w.seedGroupB();
      const cases = [];
      for (const who of ["tom", "grace", "amara", "chloe", "kofi", "tess", "yusuf", "lloyd", "nobody"]) cases.push([who, B]);
      for (const id of ["no-such-group", "a/b", ".", ".."]) cases.push(["tom", id], ["zach", id], ["claudia", id]);
      for (const [who, groupId] of cases) assertCalm(await pages[page](who, groupId), page, `${who} on ${groupId}`);

      // An archived group: nobody, an admin and the lead included.
      w.world.db.poke(`courseGroups/${B}`, { archived: true });
      for (const who of ["rahul", "sofia", "farah", "claudia", "zach", "tom", "chloe"]) {
        assertCalm(await pages[page](who), page, `${who} on an archived group`);
      }

      // A live group whose run is being destroyed.
      w.reset();
      w.world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
      for (const who of ["rahul", "claudia", "zach", "tom"]) assertCalm(await pages[page](who), page, `${who} while the run is destroyed`);
    });

    test("who it admits is unchanged: the group's live facilitators, the programme's lead and admins", async () => {
      w.seedGroupB();
      for (const who of ["rahul", "sofia", "farah", "claudia", "zach"]) assertAdmitted(await pages[page](who), who);
    });

    test("signed out still goes to sign in", async () => {
      assert.equal((await pages[page](null)).to, `/login?next=${encodeURIComponent(`/learn/${page}/${B}`)}`);
      assert.equal((await pages[page](null, "no-such-group")).to, `/login?next=${encodeURIComponent(`/learn/${page}/no-such-group`)}`);
    });
  });
}

describe("in the source", () => {
  /** The code, without comments, so prose about redirects is not counted. */
  const code = (file) =>
    readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  test("each page's only redirects left are for somebody signed out or a run that is not there, and none calls notFound()", () => {
    const group = code(PAGE_FILES.group);
    assert.deepEqual([...group.matchAll(/redirect\(([^;]*)\);/g)].map((m) => m[1]), ['user ? "/learn" : "/login"']);
    for (const page of ["draw", "pairs"]) {
      const source = code(PAGE_FILES[page]);
      const redirects = [...source.matchAll(/\bredirect\(/g)];
      assert.equal(redirects.length, 1, `${page}: ${redirects.length} redirects`);
      assert.match(source, /if \(!user\) redirect\(`\/login\?next=/, page);
    }
    for (const [page, file] of Object.entries(PAGE_FILES)) {
      const source = code(file);
      assert.doesNotMatch(source, /\bnotFound\b/, `${page} calls notFound()`);
      const calmPages = [...source.matchAll(/<NotForYou page="(\w+)" \/>/g)].map((m) => m[1]);
      assert.ok(calmPages.length >= 4, `${page}: the calm page is drawn at ${calmPages.length} points`);
      assert.deepEqual([...new Set(calmPages)], [page], `${page} draws another page's calm page`);
      // The calm page takes the page's name and nothing else: no group, run or id.
      assert.doesNotMatch(source, /<NotForYou\b(?![^>]*page="\w+" \/>)/, `${page} hands the calm page something else`);
    }
  });

  test("the calm page reads nothing and takes nothing but the page", () => {
    const component = code(join(SRC, "features", "courses", "facilitator", "NotForYou.tsx"));
    assert.doesNotMatch(component, /getAdminDb|firebase|await|fetch\(/);
    assert.match(component, /export default function NotForYou\(\{ page \}: \{ page: NotForYouPage \}\)/);
  });
});
