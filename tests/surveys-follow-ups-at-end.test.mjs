/**
 * THE FOLLOW-UPS BOX AT THE END (docs/surveys.md, "Follow-ups and changing a
 * consent"): the survey at the end asks "Contact me at 6 and 12 months" again,
 * of somebody whose row on the before survey says nothing about follow-ups
 * (they missed it), keeps their word on their row there, and the follow-ups
 * then go to them too. Whoever said yes or no on the before survey is not
 * asked again: their word there decides, and they change it from any of the
 * programme's surveys.
 *
 * The world is `tests/lib/surveyWorld.mjs` (AGI Strategy, week 1); every
 * send answers each required question plainly (`everyRequired`), as the
 * answer routes insist since 30 Oct 2026. Amara says
 * yes on the before survey, Bea says no, and Dev and Tariq send nothing.
 * Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { NOW, makeSurveyWorld, surveySeed } from "./lib/surveyWorld.mjs";

const w = await makeSurveyWorld("__surveysFollowUpsAtEnd");
const { routes, call } = w;
const BOX = "Contact me at 6 and 12 months with a short follow-up survey";

function clock(t, at = NOW) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

const short = (response) => [response.status, response.body?.error ?? null];

async function makeAndSend(stage, emails) {
  const made = await w.make("zach", { stage, closesOn: stage === "before" ? "2026-11-04" : "2026-12-20" });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.survey.id;
  const sent = await w.sendFirst(id, "zach", { emails });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  return id;
}

/** The before survey sent to the four, Amara saying yes to follow-ups and Bea no; then the survey at the end. */
async function world() {
  const before = await makeAndSend("before", 4);
  const answer = (uid, followUps) =>
    call(null, routes.answerByLink.POST, {}, { body: { token: w.tokenOf(before, uid), answers: w.everyRequired(before), consents: { followUps } } });
  assert.equal((await answer("amara", true)).status, 200);
  assert.equal((await answer("bea", false)).status, 200);
  const after = await makeAndSend("after", 4);
  return { before, after };
}

const pageOf = (id, uid) => w.page(w.pages.link, { params: Promise.resolve({ token: w.tokenOf(id, uid) }) });
/** Whether the follow-ups box is on a form: its checkbox, by its field name. */
const boxOn = (page) => /name="consent\.followUps"/.test(page.html);

describe("who the survey at the end asks about follow-ups", () => {
  test("only somebody whose before survey says nothing: the box for Dev, and none for Amara or Bea, who have their panel", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const { after } = await world();
    const dev = await pageOf(after, "dev");
    assert.ok(boxOn(dev), "Dev missed the before survey and is not asked about follow-ups at the end");
    assert.ok(dev.text.includes(BOX));
    assert.ok(!dev.text.includes("Stop the follow-ups"), "Dev is shown the panel beside the box");
    assert.ok(!dev.text.includes("You haven’t said we may contact you at 6 and 12 months."), "Dev is shown the panel beside the box");
    const amara = await pageOf(after, "amara");
    assert.ok(!boxOn(amara), "Amara said yes on the before survey and is asked again");
    assert.ok(amara.text.includes("You said we may contact you at 6 and 12 months with a short follow-up survey."));
    assert.ok(amara.text.includes("Stop the follow-ups"));
    const bea = await pageOf(after, "bea");
    assert.ok(!boxOn(bea), "Bea said no on the before survey and is asked again");
    assert.ok(bea.text.includes("You haven’t said we may contact you at 6 and 12 months."));
    const test = await w.page(w.pages.link, { params: Promise.resolve({ token: w.survey(after).testToken }) });
    assert.ok(boxOn(test), "a test shows the box the survey holds");
  });

  test("Dev's tick is kept on Dev's row at the end; a box Bea was not shown says nothing for Bea", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const { before, after } = await world();
    const send = (uid, consents) => call(null, routes.answerByLink.POST, {}, { body: { token: w.tokenOf(after, uid), answers: w.everyRequired(after), consents } });
    assert.equal((await send("dev", { followUps: true })).status, 200);
    const row = (id, uid) => w.people(id).find((each) => each.respondent.uid === uid);
    assert.equal(row(after, "dev").consents.followUps, true);
    assert.ok(row(after, "dev").consentsAt);
    // Bea's form had no box: a stale one sent anyway changes nothing of Bea's.
    assert.equal((await send("bea", { followUps: true })).status, 200);
    assert.equal(row(after, "bea").consents?.followUps, undefined);
    assert.equal(row(before, "bea").consents.followUps, false, "Bea's word on the before survey stands");
    // Tariq sends the end with the box left unticked: a no, kept at the end.
    assert.equal((await send("tariq", undefined)).status, 200);
    assert.equal(row(after, "tariq").consents.followUps, false);
  });
});

describe("the follow-ups reach everybody who said yes, before or at the end", () => {
  test("Amara from the before survey and Dev from the end; never Bea, whose before survey said no", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const { after } = await world();
    await call(null, routes.answerByLink.POST, {}, { body: { token: w.tokenOf(after, "dev"), answers: w.everyRequired(after), consents: { followUps: true } } });
    // A yes at the end on Bea's row, as no writer here makes one: Bea's before survey's no still decides.
    w.world.db.poke(`surveyPeople/${after}__bea`, { "consents.followUps": true });
    const six = (await w.make("zach", { stage: "followUp6", closesOn: "2026-12-20" })).body.survey.id;
    const sent = await w.sendFirst(six, "zach", { emails: 2 });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const reached = w.people(six).map((each) => each.respondent.uid).sort();
    assert.deepEqual(reached, ["amara", "dev"]);
  });

  test("where both rows hold a word, the before survey's decides what the page says and what a change touches", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const { before, after } = await world();
    // A yes at the end on Bea's row, as no writer here makes one: Bea's before survey said no.
    w.world.db.poke(`surveyPeople/${after}__bea`, { "consents.followUps": true });
    w.world.db.poke(`surveys/${after}`, { closedAt: NOW });
    const page = await pageOf(after, "bea");
    assert.ok(page.text.includes("You haven’t said we may contact you at 6 and 12 months."), "Bea's page reads Bea's row at the end");
    const yes = await call(null, routes.consentByLink.POST, {}, { body: { token: w.tokenOf(after, "bea"), purpose: "followUps", given: true } });
    assert.deepEqual(yes.body, { ok: true, given: true });
    assert.equal(w.people(before).find((each) => each.respondent.uid === "bea").consents.followUps, true, "the change went to Bea's row at the end");
  });

  test("Dev stops them from the follow-up's page, which changes Dev's row at the end", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const { after } = await world();
    await call(null, routes.answerByLink.POST, {}, { body: { token: w.tokenOf(after, "dev"), answers: w.everyRequired(after), consents: { followUps: true } } });
    const six = (await w.make("zach", { stage: "followUp6", closesOn: "2026-12-20" })).body.survey.id;
    await w.sendFirst(six, "zach", { emails: 2 });
    const page = await pageOf(six, "dev");
    assert.ok(page.text.includes("You said we may contact you at 6 and 12 months with a short follow-up survey."));
    const stopped = await call(null, routes.consentByLink.POST, {}, { body: { token: w.tokenOf(six, "dev"), purpose: "followUps", given: false } });
    assert.deepEqual(stopped.body, { ok: true, given: false });
    assert.equal(w.people(after).find((each) => each.respondent.uid === "dev").consents.followUps, false);
    // The next press reads it: a reminder reaches Amara alone now.
    assert.equal((await call("zach", routes.test.POST, { surveyId: six }, { body: { email: "reminder" } })).status, 200);
    const stale = await call("zach", routes.remind.POST, { surveyId: six }, { body: { emails: 2 } });
    assert.deepEqual(short(stale), [409, w.lib.words.countChangedWords(1)], "the reminder still counts Dev");
    const sentBefore = w.world.mail.length;
    const remind = await call("zach", routes.remind.POST, { surveyId: six }, { body: { emails: 1 } });
    assert.equal(remind.status, 200, JSON.stringify(remind.body));
    const reminded = w.mailText().slice(sentBefore).map((message) => message.to);
    assert.deepEqual(reminded, ["amara@example.com"], "the reminder went to somebody who stopped the follow-ups, or to nobody");
  });
});
