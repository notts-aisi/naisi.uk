/**
 * ONE CALM PAGE for a group's own pages, driven through the real pages as
 * every kind of caller: the facilitator's group page
 * (`/learn/[runId]/group/[groupId]`), the draw's page (`/learn/draw/[groupId]`,
 * where the slips are copied in) and the pairs page (`/learn/pairs/[groupId]`).
 *
 *  1. The words: a heading, who the page is for (the group page leaves the
 *     programme's lead out, because it does not admit the lead; the draw's
 *     and the pairs pages keep the lead, because they do), what to do if that
 *     is wrong, and the way on to My programmes. Nothing names a group. And
 *     the second, fixed answer for somebody the page DOES admit at an address
 *     it cannot open, who is never told the page is not for their account.
 *  2. THE SAME BYTES WHATEVER THE TRUTH IS. For everybody the page does not
 *     admit, a real group that is not theirs, an archived group, a group of
 *     another run, a run that is being destroyed, a made-up id and an id that
 *     can name no document (a separator, a reserved id, one too long) all
 *     draw the first page byte for byte; for an admin (and, on the draw's and
 *     the pairs pages, the lead the gate admits) every such address draws the
 *     second byte for byte. The page is drawn, never a redirect, never
 *     `notFound()`.
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

/** The first calm page as each page draws it, for somebody it does not admit. */
const calm = (page) => renderToStaticMarkup(createElement(NotForYou, { page }));
/** The second, for somebody it admits at an address it cannot open. */
const cantOpen = (page) => renderToStaticMarkup(createElement(NotForYou, { page, admitted: true }));

/** Ids that can name no document: a separator, dots, a reserved id, and one over 1,500 bytes. */
const UNADDRESSABLE = ["a/b", ".", "..", "__x__", "x".repeat(1501)];

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

const short = (id) => (id.length > 24 ? `${id.slice(0, 8)}... (${id.length} characters)` : id);

/** Asserts `drawn` is the first calm page for `page`, byte for byte. */
function assertCalm(drawn, page, at) {
  assert.equal(drawn.to, null, `${at}: sent to ${drawn.to} instead of the calm page`);
  assert.equal(drawn.html, calm(page), `${at}: not the first calm page byte for byte`);
}

/** Asserts `drawn` is the second calm page, byte for byte: admitted, so never told it is not theirs. */
function assertCantOpen(drawn, page, at) {
  assert.equal(drawn.to, null, `${at}: sent to ${drawn.to} instead of the calm page`);
  assert.equal(drawn.html, cantOpen(page), `${at}: not the second calm page byte for byte`);
}

/** Asserts `drawn` is the page itself, not either calm page. */
function assertAdmitted(drawn, at) {
  assert.equal(drawn.to, null, `${at}: sent to ${drawn.to}`);
  assert.ok(drawn.html.length > 0, `${at}: drew nothing`);
  assert.ok(!drawn.html.includes('data-testid="not-for-you"'), `${at}: given the first calm page`);
  for (const heading of [words.NOT_FOR_YOU_HEADING, words.CANT_OPEN_HEADING]) assert.ok(!drawn.html.includes(heading), `${at}: given a calm page`);
}

/** The visible pieces of a calm page's markup, in order, as the browser specs read them one by one. */
function piecesOf(html) {
  return [...html.matchAll(/<(h1|p|a)\b([^>]*)>([^<]*)<\/\1>/g)].map(([, tag, attrs, text]) => {
    const href = /href="([^"]*)"/.exec(attrs)?.[1];
    return href ? [tag, text, href] : [tag, text];
  });
}

describe("the words", () => {
  test("every sentence, word for word, with the lead only where the page admits the lead", () => {
    assert.equal(words.NOT_FOR_YOU_HEADING, "This page isn’t for your account");
    assert.equal(words.notForYouWho("group"), "It’s for a group’s facilitators and admins.");
    assert.equal(words.notForYouWho("draw"), "It’s for a group’s facilitators, the programme’s lead and admins.");
    assert.equal(words.notForYouWho("pairs"), "It’s for a group’s facilitators, the programme’s lead and admins.");
    assert.equal(words.NOT_FOR_YOU_HELP, "If you facilitate this group and can’t open it, ask the team and we’ll put it right.");
    assert.equal(words.CANT_OPEN_HEADING, "This page can’t be opened");
    assert.equal(words.CANT_OPEN_LINE, "The group is archived, its programme is closing, or the address isn’t right.");
    for (const page of ["group", "draw", "pairs"]) {
      for (const html of [calm(page), cantOpen(page)]) {
        // One way on, to My programmes, and no control for anything else.
        assert.deepEqual([...html.matchAll(/<a\b[^>]*href="([^"]*)"/g)].map((m) => m[1]), ["/learn"], page);
        assert.equal((html.match(/<h1\b/g) ?? []).length, 1, page);
        assert.doesNotMatch(html, /<(button|form|input|select)\b/, page);
        assert.doesNotMatch(html, /[\u2013\u2014]/, `${page}: a dash`);
      }
    }
    assert.ok(!calm("group").includes("lead"), "the group page's version names the lead, whom the group page does not admit");
    assert.equal(calm("draw"), calm("pairs"), "the draw's and the pairs pages say different things");
    // The second answer is the same whichever page draws it, and never says the page is not theirs.
    assert.equal(cantOpen("group"), cantOpen("draw"));
    assert.equal(cantOpen("draw"), cantOpen("pairs"));
    assert.ok(!cantOpen("group").includes("for your account"));
  });

  test("each piece is its own element, with no text between them: the browser specs read them one at a time", () => {
    // `textContent` runs sibling elements' text together with nothing between,
    // so the specs check each element on its own; these are exactly the
    // elements, in order, that they read.
    for (const page of ["group", "draw", "pairs"]) {
      assert.deepEqual(piecesOf(calm(page)), [
        ["h1", words.NOT_FOR_YOU_HEADING],
        ["p", words.notForYouWho(page)],
        ["p", words.NOT_FOR_YOU_HELP],
        ["a", "My programmes", "/learn"],
      ], page);
      assert.deepEqual(piecesOf(cantOpen(page)), [
        ["h1", words.CANT_OPEN_HEADING],
        ["p", words.CANT_OPEN_LINE],
        ["a", "My programmes", "/learn"],
      ], page);
      // Nothing outside those elements: the text of the whole is theirs run together.
      const all = calm(page).replace(/<[^>]+>/g, "");
      assert.equal(all, `${words.NOT_FOR_YOU_HEADING}${words.notForYouWho(page)}${words.NOT_FOR_YOU_HELP}My programmes`);
      assert.match(calm(page), /^<div [^>]*data-testid="not-for-you">/);
      assert.match(cantOpen(page), /^<div class="[^"]*">/, "the second answer carries an id no spec asks for");
    }
  });
});

describe("the group page", () => {
  test("the same bytes for everybody it does not admit: a real group that is not theirs, an archived one, another run's and an id that names nothing", async () => {
    seedElsewhere();
    const cases = [];
    // A real, live group that is not theirs, as each kind of caller the run admits.
    for (const who of ["tom", "grace", "amara", "chloe", "kofi", "claudia", "tess", "yusuf", "lloyd", "nobody"]) cases.push([who, B]);
    // An address that was never a group, and ones that can name no document.
    for (const id of ["no-such-group", ...UNADDRESSABLE]) cases.push(["tom", id], ["claudia", id]);
    // A group of another run, even to its own facilitator.
    cases.push(["tom", ELSEWHERE]);
    for (const [who, groupId] of cases) assertCalm(await pages.group(who, groupId), "group", `${who} on ${short(groupId)}`);

    // An archived group, to strangers: the same bytes as a group that is not there.
    w.world.db.poke(`courseGroups/${B}`, { archived: true });
    for (const who of ["tom", "chloe", "claudia"]) assertCalm(await pages.group(who), "group", `${who} on an archived group`);
  });

  test("an archived group's own facilitators are not admitted either, and are told it was archived and who to ask, in place of the page", async () => {
    w.world.db.poke(`courseGroups/${B}`, { archived: true });
    for (const who of ["rahul", "sofia", "farah"]) {
      const drawn = await pages.group(who);
      assert.equal(drawn.to ?? null, null, who);
      assert.ok(drawn.text.includes("Group B is archived."), `${who}: ${drawn.text.slice(0, 300)}`);
      assert.match(drawn.text, /Its registers are kept\. (\S+, the programme’s lead,|An admin) can tell you more\./, who);
      assert.doesNotMatch(drawn.text, /Take the register|Write to/, who);
    }
  });

  test("an admin, whom it admits to every group, is never told it is not theirs: the second answer, the same at every address it cannot open", async () => {
    seedElsewhere();
    for (const groupId of ["no-such-group", ...UNADDRESSABLE, ELSEWHERE]) {
      assertCantOpen(await pages.group("zach", groupId), "group", `an admin on ${short(groupId)}`);
    }
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
    test("the same bytes for everybody it does not admit: a real group that is not theirs, an archived one, a run being destroyed and an id that names nothing", async () => {
      w.seedGroupB();
      const cases = [];
      for (const who of ["tom", "grace", "amara", "chloe", "kofi", "tess", "yusuf", "lloyd", "nobody"]) cases.push([who, B]);
      // An address that was never a group: the lead and the group's facilitator are admitted to no such group.
      for (const id of ["no-such-group", ...UNADDRESSABLE]) cases.push(["tom", id], ["claudia", id], ["rahul", id]);
      for (const [who, groupId] of cases) assertCalm(await pages[page](who, groupId), page, `${who} on ${short(groupId)}`);

      // An archived group: `drawGate` admits no facilitator of an archived
      // group, so its own facilitators get the first answer, as strangers do.
      w.world.db.poke(`courseGroups/${B}`, { archived: true });
      for (const who of ["rahul", "sofia", "farah", "tom", "chloe"]) assertCalm(await pages[page](who), page, `${who} on an archived group`);

      // A live group whose run is being destroyed, to strangers.
      w.reset();
      w.world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
      for (const who of ["tom", "chloe"]) assertCalm(await pages[page](who), page, `${who} while the run is destroyed`);
    });

    test("somebody it admits is never told it is not theirs: an admin anywhere, and the lead once the gate admits them, get the second answer, the same at every address", async () => {
      w.seedGroupB();
      for (const id of ["no-such-group", ...UNADDRESSABLE]) assertCantOpen(await pages[page]("zach", id), page, `an admin on ${short(id)}`);
      w.world.db.poke(`courseGroups/${B}`, { archived: true });
      for (const who of ["zach", "claudia"]) assertCantOpen(await pages[page](who), page, `${who} on an archived group`);
      w.reset();
      w.world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
      for (const who of ["rahul", "sofia", "claudia", "zach"]) assertCantOpen(await pages[page](who), page, `${who} while the run is destroyed`);
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
      const calmPages = [...source.matchAll(/<NotForYou page="(\w+)"/g)].map((m) => m[1]);
      assert.ok(calmPages.length >= 4, `${page}: the calm page is drawn at ${calmPages.length} points`);
      assert.deepEqual([...new Set(calmPages)], [page], `${page} draws another page's calm page`);
      // The calm page takes the page's name and whether the caller is admitted, and nothing else: no group, run or id.
      for (const [element] of source.matchAll(/<NotForYou\b[^>]*\/>/g)) {
        assert.match(element, /^<NotForYou page="\w+"(?: admitted(?:=\{admin\})?)? \/>$/, `${page} hands the calm page ${element}`);
      }
      // Each page asks the shared id check, which refuses reserved and over-long ids.
      assert.match(source, /if \(!isAddressableId\(groupId\)\) return <NotForYou /, page);
    }
  });

  test("the calm page reads nothing and takes nothing but the page and whether the caller is admitted", () => {
    const component = code(join(SRC, "features", "courses", "facilitator", "NotForYou.tsx"));
    assert.doesNotMatch(component, /getAdminDb|firebase|await|fetch\(/);
    assert.match(component, /export default function NotForYou\(\{ page, admitted = false \}: \{ page: NotForYouPage; admitted\?: boolean \}\)/);
  });
});
