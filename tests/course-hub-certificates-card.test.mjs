/**
 * "Your certificate" on the programme's page after the end (board
 * en-after-phone's card), and the credit line on the programme's Settings.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The card is its owner's alone: read by its two addresses on the server
 * (`readOwnCertificates`), never during a view-as session, nothing at all
 * for somebody sent none, both for a facilitator who also finished. RunHome
 * draws it under the head, and draws nothing for an empty list. The Settings
 * card shows the course's credit line read-only, with the way to change it
 * offered only to somebody the course's page opens for.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AGI, APP_URL, COURSE, END, ROUND, RUN, certificateDoc, certificatePath, makeCertificateWorld } from "./lib/certificateWorld.mjs";
import { makeFinishWorld, textOf } from "./lib/finishWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

mock.timers.enable({ apis: ["Date"], now: END });
process.env.NEXT_PUBLIC_APP_URL = APP_URL;

const made = await makeCertificateWorld("__certificateCard");
const { world, reset, loadTs, loadUi, sessionOf, draw } = made;
const own = await loadTs(join("lib", "courses", "certificates", "own.ts"));
const { default: CertificateCard } = await loadUi(join("features", "courses", "CertificateCard.tsx"));
const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const { default: SetupPage } = await loadUi(join(TABS, "setup", "page.tsx"));

const finish = await makeFinishWorld("__certificateCardFinish");

const AMARA = "K7Q2M9XH4PWR3TDB";
const AMARA_FAC = "F4C1X1TAT0R5AB2C";

beforeEach(() => {
  mock.timers.setTime(END.getTime());
  reset();
  world.db.seed(certificatePath("amara"), certificateDoc("amara", { code: AMARA }));
});

const read = (uid, { viewAs = false } = {}) => own.readOwnCertificates(world.courseDb, RUN.agi, uid, viewAs, APP_URL);
const card = (views) => draw(createElement(CertificateCard, { certificates: views }));

// ---------------------------------------------------------------------------
// Who is handed a card
// ---------------------------------------------------------------------------

describe("whose card it is", () => {
  test("its owner: the certificate's day, that only they can see it, and the way to its page and to LinkedIn", async () => {
    const views = await read("amara");
    assert.equal(views.length, 1);
    const { html, text } = card(views);
    for (const words of [
      "Your certificate",
      "Issued Mon 14 Dec",
      "Only you can see it until you turn its link on.",
      "See your certificate",
      "Add to LinkedIn",
      "Amara Okafor",
      "finished the",
    ]) {
      assert.ok(text.includes(words), `missing "${words}"`);
    }
    assert.match(html, new RegExp(`href="/c/${AMARA}"`));
    assert.match(html, /href="https:\/\/www\.linkedin\.com\/profile\/add\?startTask=CERTIFICATION_NAME&amp;name=AGI\+Strategy\+Fellowship&amp;issueYear=2026&amp;issueMonth=12&amp;certUrl=/);
    assert.ok(!text.includes("Check it at"), "the link is off");
  });

  test("while its link is on the card says anyone with the link can see it", async () => {
    world.db.poke(certificatePath("amara"), { linkOn: true });
    const { text } = card(await read("amara"));
    assert.ok(text.includes("Anyone with the link can see it."));
    assert.ok(!text.includes("Only you can see it"));
  });

  test("somebody who did not finish, a stranger, and an admin viewing as the owner are handed nothing", async () => {
    for (const uid of ["bea", "dev", "claudia", "zach", "sofia"]) assert.deepEqual(await read(uid), [], uid);
    assert.deepEqual(await read("amara", { viewAs: true }), []);
    assert.equal(renderToStaticMarkup(createElement(CertificateCard, { certificates: [] })), "");
  });

  test("a certificate whose owner is gone is nobody's card; one on another run is not this run's", async () => {
    world.db.poke(certificatePath("amara"), { uid: null, linkOn: true });
    assert.deepEqual(await read("amara"), []);
    world.db.seed(certificatePath("dev", "finished", "another-run"), certificateDoc("dev", { code: "BBBBBBBBBBBBBBBB", runId: "another-run" }));
    assert.deepEqual(await read("dev"), []);
  });

  test("a facilitator's card, and both for somebody who facilitated and finished, each with its own way in", async () => {
    world.db.seed(
      certificatePath("rahul", "facilitated"),
      certificateDoc("rahul", { kind: "facilitated", name: "Rahul Mehta", code: "R3H8T5VW2KQ9MZ4C" }),
    );
    const rahul = card(await read("rahul"));
    assert.ok(rahul.text.includes("facilitated a group on the") && rahul.text.includes("See your certificate"));

    world.db.seed(certificatePath("amara", "facilitated"), certificateDoc("amara", { kind: "facilitated", code: AMARA_FAC }));
    const both = await read("amara");
    assert.deepEqual(both.map((view) => view.kind), ["finished", "facilitated"]);
    const { html, text } = card(both);
    assert.ok(text.startsWith("Your certificates"));
    assert.ok(text.includes("See your certificate for finishing") && text.includes("See your certificate for facilitating"));
    assert.match(html, new RegExp(`href="/c/${AMARA}"`));
    assert.match(html, new RegExp(`href="/c/${AMARA_FAC}"`));
  });
});

// ---------------------------------------------------------------------------
// Where it is drawn
// ---------------------------------------------------------------------------

describe("the programme's page", () => {
  test("RunHome draws the card under the head for its owner, and nothing for somebody sent none", async () => {
    finish.reset();
    const overview = await finish.ask.overview("amara");
    assert.equal(overview.status, 200);
    finish.world.overview = overview.body;
    const props = { runId: RUN.agi, isAdmin: false, canEmailCohort: false, pitching: null };
    const without = textOf(renderToStaticMarkup(createElement(finish.member.RunHome, props)));
    assert.ok(!without.includes("Your certificate"));
    const views = await read("amara");
    const withCard = textOf(renderToStaticMarkup(createElement(finish.member.RunHome, { ...props, certificates: views })));
    assert.ok(withCard.includes("Your certificate"));
    // Under the head's "You finished", before anything else in the page's columns.
    assert.ok(withCard.indexOf("You finished") < withCard.indexOf("Your certificate"));
  });

  test("the run home's page reads the caller's own, by their uid, and none during view-as", () => {
    const page = readFileSync(join(SRC, "app", "(app)", "learn", "[runId]", "page.tsx"), "utf8");
    assert.match(page, /const viewAs = markerIsLive\(await getImpersonator\(\), access\.user\.uid\);/);
    assert.match(page, /readOwnCertificates\(db, access\.run\.id, access\.user\.uid, viewAs, process\.env\.NEXT_PUBLIC_APP_URL\)/);
    assert.match(page, /\{\.\.\.\(certificates\.length > 0 \? \{ certificates \} : \{\}\)\}/);
    const home = readFileSync(join(SRC, "features", "courses", "RunHome.tsx"), "utf8");
    assert.match(home, /<div className=\{weekly\.colMain\}>\s*<CertificateCard certificates=\{certificates\} \/>/);
  });

  test("the card takes the card's view and never a stored document", () => {
    const source = readFileSync(join(SRC, "features", "courses", "CertificateCard.tsx"), "utf8");
    assert.match(source, /certificates: CertificateCardView\[\]/);
    assert.doesNotMatch(source, /CertificateDoc|snapshot|firebase/);
  });
});

// ---------------------------------------------------------------------------
// The credit line on Settings
// ---------------------------------------------------------------------------

describe("the credit line on the programme's Settings", () => {
  async function settings(who) {
    world.user = sessionOf(who);
    return draw(await SetupPage({ params: Promise.resolve({ roundId: ROUND, programmeId: AGI }) }));
  }

  test("shows the course's line read-only, its first letter in capitals, and how a certificate prints it", async () => {
    const { text } = await settings("claudia");
    for (const words of [
      "Certificates",
      "Credit line",
      "Based on the BlueDot Impact curriculum",
      "Every certificate prints it after its weeks and a dot, as “· based on the BlueDot Impact curriculum”.",
      "An admin or the course’s author changes it on the course’s page.",
    ]) {
      assert.ok(text.includes(words), `missing "${words}"`);
    }
  });

  test("offers the way to change it to somebody the course's page opens for, and to nobody else", async () => {
    const asAdmin = await settings("zach");
    assert.ok(asAdmin.text.includes("Change it on the course"));
    assert.match(asAdmin.html, new RegExp(`href="/admin/courses/${COURSE.agi}"`));
    const asLead = await settings("claudia");
    assert.ok(!asLead.text.includes("Change it on the course"));
  });

  test("a course with no line says so", async () => {
    world.db.poke(`courses/${COURSE.agi}`, { credit: "" });
    const { text } = await settings("claudia");
    assert.ok(text.includes("None. Certificates of this programme carry no credit line."));
    assert.ok(!text.includes("Every certificate prints it"));
  });

  test("the first letter is the only one changed, so a name it starts with is kept", async () => {
    const words = await loadTs(join("lib", "courses", "certificates", "words.ts"));
    assert.equal(words.creditAsLine("based on the BlueDot Impact curriculum"), "Based on the BlueDot Impact curriculum");
    assert.equal(words.creditAsLine("BlueDot Impact’s curriculum, adapted"), "BlueDot Impact’s curriculum, adapted");
    assert.equal(words.creditAsLine(""), "");
  });
});
