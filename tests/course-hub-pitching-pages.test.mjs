/**
 * Pitching week's page for somebody taking part (board in-pitch-phone),
 * rendered to the HTML the server sends, in each state it can be in.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * What it holds: the board's words with every value from a record; the
 * toggles are real buttons with `aria-pressed` and the board's labels; your
 * own pitch is marked and has no toggle; nothing on the page counts anybody
 * else's picks; before the page's script arrives nothing pretends to work
 * (the edit link is an address, the buttons are disabled); after the close
 * everything is read only. And the server page's gate: somebody not taking
 * part is sent back to the programme's home.
 *
 * The page is drawn from the GET route's own answer, so what is drawn is what
 * the route serves.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { AT, INC, makePitchingWorld, pitchingSeed } from "./lib/pitchingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: AT.wednesdayNoon });

const made = await makePitchingWorld("__pitchingPages");
const { world, reset, ask, pitchBody, pitchTitled, loadUi, sessionOf } = made;

const { default: PitchingWeek } = await loadUi(join("features", "courses", "pitching", "PitchingWeek.tsx"));
const { default: PitchingPage } = await loadUi(join("app", "(app)", "learn", "[runId]", "pitching", "page.tsx"));

beforeEach(() => {
  mock.timers.setTime(AT.wednesdayNoon.getTime());
  reset();
});

const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** The page as `who` is served it, drawn from the GET route's answer. */
async function draw(who, { editing = false } = {}) {
  const answer = await ask.view(who);
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  const html = renderToStaticMarkup(world.h(PitchingWeek, { initial: answer.body.view, editing }));
  return { html, text: text(html) };
}

/** Bea and Tariq pitch; Amara picks Tariq's. */
async function othersPitch() {
  await ask.pitch("bea", pitchBody({ title: "Steering at scale", twist: "Try the method on 3 model sizes and compare" }));
  await ask.pitch("tariq", pitchBody({ title: "Unlearning check", twist: "Check whether the forgotten facts come back" }));
  await ask.pick("amara", pitchTitled("Unlearning check").id);
}

describe("the page, open", () => {
  test("before you pitch: the heading, the line, the form, and the board's way back", async () => {
    const { html, text: said } = await draw("amara");
    assert.match(html, new RegExp(`<a href="/learn/${INC.run}" class="back">`));
    assert.match(said, /Research incubator Pitching week Incubator: Research incubator · Week 3 Pitching week/);
    assert.match(said, /No pitches yet\. Pick up to 3 you’d join before the session on Thu 12 Nov at 6pm\./);
    assert.match(said, /Your pitch Title Paper/);
    // The paper picker offers the week's readings, then one typed in.
    assert.match(html, /<option value="m_probe_paper"[^>]*>Probes that transfer<\/option>/);
    assert.match(html, /<option value="typed">Another paper<\/option>/);
    assert.match(said, /Twist 280 characters left/);
    assert.match(html, /<option value="" selected="">No partner, I’m pitching alone<\/option><option value="bea">Bea<\/option><option value="dev">Dev<\/option><option value="tariq">Tariq<\/option>/);
    // Before the page's script arrives the form does not pretend to work.
    assert.match(html, /<button type="submit" class="primary" disabled="">Send pitch<\/button>/);
    assert.match(said, /Pitches \(0\) 0 of 3 picked/);
    assert.match(said, /Tess makes the teams on Thu 19 Nov\. Teams are 2 to 4 people\.$/);
  });

  test("after you pitch: your card, the group's list with the board's toggles, and your own pitch marked", async () => {
    await ask.pitch("amara", pitchBody());
    await othersPitch();
    const { html, text: said } = await draw("amara");
    assert.match(said, /Your pitch Probe transfer Sent Paper: Probes that transfer Twist: Test whether the probes still work on a smaller open model\. Edit until 6pm on Thu 12 Nov/);
    assert.match(html, /<a href="\?edit=1" class="editLink">/);
    assert.match(said, /Pitches \(3\) 1 of 3 picked/);
    assert.match(said, /Pitches are in\. Pick up to 3 you’d join before the session on Thu 12 Nov at 6pm\./);
    // Your own pitch: "Pitched by you", marked, and no toggle.
    assert.match(said, /Probe transfer Pitched by you Your pitch/);
    assert.ok(!html.includes("I’d join this: Probe transfer"));
    // The others: real buttons, pressed or not, labelled with the pitch.
    assert.match(html, /<button type="button" class="join joinOn" aria-pressed="true" aria-label="I’d join this: Unlearning check" disabled="">/);
    assert.match(html, /<button type="button" class="join " aria-pressed="false" aria-label="I’d join this: Steering at scale" disabled="">/);
    assert.match(said, /Steering at scale Pitched by Bea I’d join this Try the method on 3 model sizes and compare/);
    // Nothing counts anybody's picks.
    assert.ok(!/would join|\d+ (?:people|person) picked/.test(said));
  });

  test("“Edit until 6pm” opens your pitch in its form, with what you sent", async () => {
    await ask.pitch("amara", pitchBody({ paper: { kind: "typed", title: "A paper about probes" }, partnerUid: "dev" }));
    const { html, text: said } = await draw("amara", { editing: true });
    assert.match(html, /<input id="[^"]+-title" class="input" maxLength="80" autoComplete="off" required="" name="title" value="Probe transfer"\/>/);
    assert.match(html, /<option value="typed" selected="">Another paper<\/option>/);
    assert.match(html, /class="input" maxLength="200" autoComplete="off" name="paperTitle" value="A paper about probes"/);
    assert.match(html, /<option value="dev" selected="">Dev<\/option>/);
    assert.match(html, />Save changes<\/button>/);
    assert.match(html, new RegExp(`<a href="/learn/${INC.run}/pitching" class="quiet">Cancel</a>`));
    assert.ok(!said.includes("Sent"), "the card is drawn beside its form");
  });

  test("the partner's form changes the words and names who sent it, without a partner picker", async () => {
    await ask.pitch("amara", pitchBody({ partnerUid: "dev" }));
    const { html, text: said } = await draw("dev", { editing: true });
    assert.ok(!/name="partner"/.test(html), "the partner is offered a choice that is the sender's");
    assert.match(said, /Partner: Amara/);
  });

  test("with no pick limit there are no toggles and no count, and the line says when pitching closes", async () => {
    reset(pitchingSeed({ settings: { pickLimit: null, teamSizeMin: null, teamSizeMax: null, teamsMadeOn: null } }));
    await ask.pitch("bea", pitchBody({ title: "Steering at scale" }));
    const { html, text: said } = await draw("amara");
    assert.ok(!/aria-pressed/.test(html));
    assert.ok(!/picked/.test(said));
    assert.match(said, /Pitches are in\. You can pitch until the session on Thu 12 Nov at 6pm\./);
    assert.ok(!said.includes("makes the teams"));
  });
});

describe("once the page's script has arrived", () => {
  test("open: the toggles and the form's button can be pressed, except a pick past the limit", async () => {
    reset(pitchingSeed({ settings: { pickLimit: 1, teamSizeMin: 2, teamSizeMax: 4, teamsMadeOn: "2026-11-19" } }));
    await othersPitch();
    world.ui.hydrated = true;
    const { html } = await draw("amara");
    // Amara picked Tariq's, which is her one: she may take it off, and may not add Bea's.
    assert.match(html, /<button type="button" class="join joinOn" aria-pressed="true" aria-label="I’d join this: Unlearning check">/);
    assert.match(html, /<button type="button" class="join " aria-pressed="false" aria-label="I’d join this: Steering at scale" disabled="">/);
    assert.match(html, /<button type="submit" class="primary">Send pitch<\/button>/);
  });

  test("closed: every toggle is held as it was, and none can be pressed", async () => {
    await othersPitch();
    mock.timers.setTime(AT.sessionStarts.getTime());
    world.ui.hydrated = true;
    const { html } = await draw("amara");
    assert.match(html, /aria-pressed="true" aria-label="I’d join this: Unlearning check" disabled=""/);
    assert.match(html, /aria-pressed="false" aria-label="I’d join this: Steering at scale" disabled=""/);
  });
});

describe("the page, closed", () => {
  test("after the group's session starts it is all read only: no form, no edit link, toggles held as they were", async () => {
    await ask.pitch("amara", pitchBody());
    await othersPitch();
    mock.timers.setTime(AT.sessionStarts.getTime());
    const { html, text: said } = await draw("amara", { editing: true });
    assert.match(said, /Pitching closed at 6pm on Thu 12 Nov, when your group’s session started\./);
    assert.ok(!/<form/.test(html), "a form after the close");
    assert.ok(!/edit=1/.test(html), "an edit link after the close");
    assert.match(said, /Your pitch Probe transfer Sent/);
    assert.match(html, /aria-pressed="true" aria-label="I’d join this: Unlearning check" disabled=""/);
    assert.match(html, /aria-pressed="false" aria-label="I’d join this: Steering at scale" disabled=""/);
  });

  test("somebody who did not pitch sees no form and no empty pitch after the close", async () => {
    await othersPitch();
    mock.timers.setTime(AT.sessionStarts.getTime());
    const { html, text: said } = await draw("dev");
    assert.ok(!/<form/.test(html));
    assert.ok(!said.includes("Your pitch"));
    assert.match(said, /Pitches \(2\) 0 of 3 picked/);
  });
});

describe("the server page", () => {
  async function serve(who, query = {}) {
    world.user = sessionOf(who);
    try {
      const element = await PitchingPage({
        params: Promise.resolve({ runId: INC.run }),
        searchParams: Promise.resolve(query),
      });
      return { html: renderToStaticMarkup(element), to: null };
    } catch (err) {
      if (err?.to) return { html: "", to: err.to };
      throw err;
    }
  }

  test("draws the page for somebody taking part, and sends everybody else back to the programme's home", async () => {
    assert.match((await serve("amara")).html, /<h1 class="title">Pitching week<\/h1>/);
    for (const who of ["claudia", "tess", "zach", "ines", "nina"]) {
      assert.equal((await serve(who)).to, `/learn/${INC.run}`, who);
    }
    world.db.poke(`courseRuns/${INC.run}/weeks/w03`, { published: false });
    assert.equal((await serve("amara")).to, `/learn/${INC.run}`);
  });

  test("?edit=1 opens your pitch while it is open, and only then", async () => {
    await ask.pitch("amara", pitchBody());
    assert.match((await serve("amara", { edit: "1" })).html, /<form/);
    assert.ok(!/<form/.test((await serve("amara")).html));
    mock.timers.setTime(AT.sessionStarts.getTime());
    assert.ok(!/<form/.test((await serve("amara", { edit: "1" })).html));
  });
});
