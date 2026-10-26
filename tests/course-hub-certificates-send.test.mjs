/**
 * Sending certificates (board en-finish's Certificates section): the section
 * on the programme's Overview, "Send a test to me", the press, the preview,
 * and what a certificate does to who finished afterwards.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The real routes, pages and libraries run against the end of AGI Strategy's
 * run (`tests/lib/certificateWorld.mjs`): the rule at 4 sessions, so the
 * lead's list says Amara, Chloe, Dev, Hamza and Yasmin finished (an admin's
 * adds Una), and Sofia, Rahul, Tom and Grace facilitated its four groups.
 * Every email is read word for word, and counted against the button.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  A,
  AGI,
  APP_URL,
  BEFORE,
  END,
  ROUND,
  RUN,
  certificatePath,
  makeCertificateWorld,
  rulePath,
  short,
} from "./lib/certificateWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: END });
process.env.NEXT_PUBLIC_APP_URL = APP_URL;

const made = await makeCertificateWorld("__certificateSend");
const { world, reset, loadTs, loadUi, call, sessionOf, everything, certificates, draw } = made;
const BASE = join("app", "api", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "certificates");
const sendRoute = await loadTs(join(BASE, "route.ts"));
const testRoute = await loadTs(join(BASE, "test", "route.ts"));
const FINISHING = join("app", "api", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "finishing");
const finishingRoute = await loadTs(join(FINISHING, "route.ts"));
const ruleRoute = await loadTs(join(FINISHING, "rule", "route.ts"));
const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const { default: OverviewPage } = await loadUi(join(TABS, "overview", "page.tsx"));
const { default: PreviewPage } = await loadUi(join(TABS, "overview", "certificates", "page.tsx"));

const params = { roundId: ROUND, programmeId: AGI };
const PREVIEW = `${APP_URL}/admin/admissions/forms/${ROUND}/programmes/${AGI}/overview/certificates#page`;

beforeEach(() => {
  mock.timers.setTime(END.getTime());
  reset();
});

const test_ = (who, opts = {}) => call(who, testRoute.POST, params, opts);
const press = (who, body, opts = {}) => call(who, sendRoute.POST, params, { body, ...opts });

/** What the mail door was handed, as a person reads it. */
function mail(args) {
  const { html, text } = draw(args.react);
  const hrefs = [...html.matchAll(/href="(https:\/\/naisi\.invalid\/[^"]+)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));
  return { to: args.to, subject: args.subject, replyTo: args.replyTo, kind: args.kind, text, hrefs: [...new Set(hrefs)] };
}

/** A page drawn as `who`. */
async function page(Page, who) {
  world.user = sessionOf(who);
  return draw(await Page({ params: Promise.resolve(params) }));
}

/**
 * What `promise` settles to within a bounded number of turns of the event
 * loop, or `undefined` if it has not. A press held on an email never settles,
 * so a test waiting on one would wait for ever instead of failing.
 */
async function within(promise, turns = 5000) {
  let outcome = null;
  promise.then(
    (value) => (outcome = { value }),
    (error) => (outcome = { error }),
  );
  for (let turn = 0; outcome === null && turn < turns; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  if (outcome === null) return undefined;
  if ("error" in outcome) throw outcome.error;
  return outcome.value;
}

/** Who finished (the lead's list) and who facilitated, by uid. */
const FINISHED = ["amara", "chloe", "dev", "hamza", "yasmin"];
const FACILITATORS = ["grace", "rahul", "sofia", "tom"];
const NAMES = {
  amara: "Amara Okafor",
  chloe: "Chloe Nguyen",
  dev: "Dev Patel",
  hamza: "Hamza Qureshi",
  yasmin: "Yasmin Farouk",
  una: "Una Byrne",
  bea: "Bea Lindqvist",
  grace: "Grace Okoye",
  rahul: "Rahul Mehta",
  sofia: "Sofia Rossi",
  tom: "Tom Fletcher",
};

// ---------------------------------------------------------------------------
// Who may
// ---------------------------------------------------------------------------

describe("who may test and send", () => {
  test("the programme's lead and an admin; a reviewer is told whose it is; anybody else that there is nothing here", async () => {
    assert.equal((await test_("claudia")).status, 200);
    assert.equal((await test_("zach")).status, 200);
    const before = everything();
    assert.deepEqual(short(await test_("lloyd")), [403, "Only the programme’s lead and admins can send its certificates."]);
    assert.deepEqual(short(await press("lloyd", { certificates: 9, emails: 9 })), [403, "Only the programme’s lead and admins can send its certificates."]);
    for (const uid of ["tess", "yusuf", "amara", "sofia"]) {
      assert.deepEqual(short(await test_(uid)), [404, "That programme is not on this form."], uid);
      assert.deepEqual(short(await press(uid, { certificates: 9, emails: 9 })), [404, "That programme is not on this form."], uid);
    }
    assert.equal(everything(), before, "a refusal wrote something");
    assert.equal(world.sent.length, 2, "a refusal emailed somebody");
  });

  test("signed out is asked to sign in; a view-as session is turned away first; nothing is sent", async () => {
    assert.equal((await test_(null)).status, 401);
    assert.equal((await press(null, { certificates: 9, emails: 9 })).status, 401);
    assert.equal((await test_("claudia", { viewAs: true })).status, 403);
    assert.equal((await press("claudia", { certificates: 9, emails: 9 }, { viewAs: true })).status, 403);
    assert.equal(world.sent.length, 0);
  });

  test("not before the run's last session is over, and the answer says when that is", async () => {
    mock.timers.setTime(BEFORE.getTime());
    assert.deepEqual(short(await test_("claudia")), [409, "Certificates can be sent once the last session is over, on Wed 9 Dec."]);
    assert.equal(world.sent.length, 0);
  });

  test("a press says how many certificates and emails the button showed, or is refused before anything is read", async () => {
    for (const body of [{}, { emails: 9 }, { certificates: 9 }, { certificates: 9, emails: 0 }, { certificates: 19, emails: 9 }, { certificates: 8, emails: 9 }, "x"]) {
      assert.equal((await press("claudia", body)).status, 400, JSON.stringify(body));
    }
  });
});

// ---------------------------------------------------------------------------
// The section
// ---------------------------------------------------------------------------

describe("the section on the Overview", () => {
  test("to the lead: the board's words, the counts from the record, locked until a test reaches them", async () => {
    const { text, html } = await page(OverviewPage, "claudia");
    for (const words of [
      "Certificates",
      "5 people who finished and 4 facilitators.",
      "The email",
      "Your certificate for AGI Strategy",
      "Preview",
      "Send a test to me",
      "Send 9 certificates",
      "Send a test to yourself first. Then this unlocks.",
      "Emails 9 people. Each email links to their certificate page.",
      "People who didn’t finish get nothing and aren’t told.",
    ]) {
      assert.ok(text.includes(words), `missing "${words}"`);
    }
    // Under Who finished, as the board places it.
    const whoFinished = html.indexOf('id="who-finished"');
    assert.ok(whoFinished > -1 && whoFinished < html.indexOf('id="overview-certificates"'), "the section is not under Who finished");
    // The thumbnail is the first person's certificate, linking to the preview.
    assert.match(html, /aria-label="Preview Amara Okafor’s certificate page"/);
    assert.match(html, new RegExp(`href="/admin/admissions/forms/${ROUND}/programmes/${AGI}/overview/certificates#page"`));
    assert.match(html, new RegExp(`href="/admin/admissions/forms/${ROUND}/programmes/${AGI}/overview/certificates#email"`));
    assert.match(html, /Certificate · Autumn 2026/);
    // Locked: the send is drawn and cannot be pressed.
    assert.match(html.match(/<button[^>]*>Send 9 certificates<\/button>/)?.[0] ?? "", /disabled/);
  });

  test("an admin's counts take in everybody placed, as their list does", async () => {
    const { text } = await page(OverviewPage, "zach");
    assert.ok(text.includes("6 people who finished and 4 facilitators."));
    assert.ok(text.includes("Send 10 certificates"));
  });

  test("before the end there is no section", async () => {
    mock.timers.setTime(BEFORE.getTime());
    const { text } = await page(OverviewPage, "claudia");
    assert.ok(!text.includes("Send a test to me") && !text.includes("Certificates go"));
  });
});

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------

describe("Send a test to me", () => {
  test("goes to the presser alone, marked as a test, with the first person's words, and unlocks the press", async () => {
    const answer = await test_("claudia");
    assert.equal(answer.status, 200);
    assert.equal(answer.body.delivery, "sent");
    assert.equal(answer.body.subject, "[TEST] Your certificate for AGI Strategy");
    assert.equal(world.sent.length, 1);
    const sent = mail(world.sent[0]);
    assert.deepEqual(
      { to: sent.to, subject: sent.subject, replyTo: sent.replyTo, kind: sent.kind },
      { to: "claudia@example.com", subject: "[TEST] Your certificate for AGI Strategy", replyTo: "ai-safety@uonsu.com", kind: "course-test" },
    );
    for (const words of [
      "Hi Amara,",
      "You finished the AGI Strategy Fellowship, and your certificate is ready.",
      "See your certificate",
      "It’s private: only you can see it until you turn its link on. From its page you can download it as a PDF or add it to LinkedIn.",
      "NAISI",
    ]) {
      assert.ok(sent.text.includes(words), `the test lacks "${words}"`);
    }
    // Nothing is made by a test, so it leads to the lead's preview.
    assert.deepEqual(sent.hrefs.filter((href) => !href.includes("/brand/")), [PREVIEW]);
    assert.deepEqual(certificates(), {});
    assert.ok(world.db.read(`courseNudges/certificatestest__${RUN.agi}__claudia`), "the test was not recorded");
    assert.equal(answer.body.model.tested, true);
    assert.equal(answer.body.model.testFirst, null);
  });

  test("one that did not reach the presser unlocks nothing", async () => {
    world.mailFate = "held";
    assert.equal((await test_("claudia")).body.delivery, "held");
    assert.equal(world.db.read(`courseNudges/certificatestest__${RUN.agi}__claudia`), undefined);
    assert.deepEqual(short(await press("claudia", { certificates: 9, emails: 9 })), [409, "Send a test to yourself first, then press again."]);
    assert.equal(world.sent.length, 1);
  });

  test("a test is the presser's own: another's does not unlock the press for them", async () => {
    await test_("zach");
    assert.deepEqual(short(await press("claudia", { certificates: 9, emails: 9 })), [409, "Send a test to yourself first, then press again."]);
  });
});

// ---------------------------------------------------------------------------
// The press
// ---------------------------------------------------------------------------

describe("the press", () => {
  test("emails each person their certificate, whole, and makes it: private, with a code of its own", async () => {
    await test_("claudia");
    world.sent = [];
    const answer = await press("claudia", { certificates: 9, emails: 9 });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body.said, ["9 certificates sent."]);
    assert.equal(world.sent.length, 9);
    const byAddress = new Map(world.sent.map((args) => [args.to, mail(args)]));
    assert.deepEqual([...byAddress.keys()].sort(), [...FINISHED, ...FACILITATORS].map((uid) => `${uid}@example.com`).sort());

    const stored = certificates();
    for (const uid of FINISHED) {
      const cert = stored[certificatePath(uid)];
      assert.ok(cert, `${uid} has no certificate`);
      assert.match(cert.code, /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{16}$/);
      assert.deepEqual(
        { uid: cert.uid, runId: cert.runId, kind: cert.kind, linkOn: cert.linkOn, email: cert.email.state },
        { uid, runId: RUN.agi, kind: "finished", linkOn: false, email: "sent" },
      );
      assert.deepEqual(cert.snapshot, {
        name: NAMES[uid],
        did: "finished the",
        programme: "AGI Strategy Fellowship",
        term: "Autumn 2026",
        weeks: "6 weeks",
        credit: "based on the BlueDot Impact curriculum",
        issuedOn: "Thu 10 Dec 2026",
      });
      const sent = byAddress.get(`${uid}@example.com`);
      assert.equal(sent.subject, "Your certificate for AGI Strategy");
      assert.equal(sent.replyTo, "ai-safety@uonsu.com");
      assert.equal(sent.kind, "course-certificate");
      assert.ok(sent.text.includes(`Hi ${NAMES[uid].split(" ")[0]},`));
      assert.ok(sent.text.includes("You finished the AGI Strategy Fellowship, and your certificate is ready."));
      assert.deepEqual(sent.hrefs.filter((href) => !href.includes("/brand/")), [`${APP_URL}/c/${cert.code}`]);
    }
    for (const uid of FACILITATORS) {
      const cert = stored[certificatePath(uid, "facilitated")];
      assert.ok(cert, `${uid} has no certificate`);
      assert.equal(cert.snapshot.did, "facilitated a group on the");
      assert.equal(cert.snapshot.credit, "based on the BlueDot Impact curriculum");
      const sent = byAddress.get(`${uid}@example.com`);
      assert.ok(sent.text.includes("Thank you for facilitating a group on the AGI Strategy Fellowship. Your certificate is ready."));
      assert.deepEqual(sent.hrefs.filter((href) => !href.includes("/brand/")), [`${APP_URL}/c/${cert.code}`]);
    }
    // Nobody who did not finish, nobody who left, and nobody the lead cannot see.
    for (const uid of ["bea", "tariq", "farah", "kofi", "freya", "sam", "omar", "una"]) {
      assert.ok(!byAddress.has(`${uid}@example.com`), `${uid} was emailed`);
    }
    // Every code is its own.
    const codes = Object.values(stored).map((cert) => cert.code);
    assert.equal(new Set(codes).size, codes.length);
    // No meeting link, no address and nobody else's name in any of them.
    for (const [address, sent] of byAddress) {
      assert.doesNotMatch(sent.text, /zoom\.us|meet\.google|teams\.microsoft|@example\.com/i, address);
      for (const [uid, name] of Object.entries(NAMES)) {
        if (`${uid}@example.com` !== address) assert.ok(!sent.text.includes(name), `${address}'s email names ${name}`);
      }
    }
    // And the section says so.
    assert.equal(answer.body.model.owed.certificates, 0);
    assert.equal(answer.body.model.allSent, "Everybody who finished and every facilitator has been sent theirs.");
    assert.equal(answer.body.model.emailsLine, null);
  });

  test("the numbers the button showed must still be true, or nothing is sent and the page is told the new ones", async () => {
    await test_("claudia");
    world.sent = [];
    const before = everything();
    const answer = await press("claudia", { certificates: 8, emails: 8 });
    assert.deepEqual(answer.body, {
      error: "There are now 9 certificates to send, to 9 people. Check the list, then press again.",
      certificates: 9,
      emails: 9,
    });
    assert.equal(answer.status, 409);
    assert.equal(world.sent.length, 0);
    assert.equal(everything(), before);
  });

  test("two presses send one batch: the second is refused while the first holds the run", async () => {
    await test_("claudia");
    await test_("zach");
    world.sent = [];
    let open;
    world.mailGate = new Promise((resolve) => {
      open = resolve;
    });
    const first = press("claudia", { certificates: 9, emails: 9 });
    // Let the first press take the run and reach its first email: Amara's,
    // claimed, so an admin's button now shows the 9 left of their 10. A
    // press refused before it sends would never get there: the wait is
    // bounded, and says so.
    for (let turn = 0; world.sent.length === 0 && turn < 5000; turn += 1) await new Promise((resolve) => setImmediate(resolve));
    if (world.sent.length !== 1) assert.fail(`the first press sent nothing: ${JSON.stringify((await first).body)}`);
    // A second press that went on would be held on its first email for ever,
    // so this wait is bounded too.
    const second = await within(press("zach", { certificates: 9, emails: 9 }));
    if (second === undefined) assert.fail("the second press went on to send while the first held the run");
    assert.deepEqual(short(second), [409, "Somebody is sending this programme’s certificates right now. Wait a minute, then press again."]);
    // A press with the numbers from before the first began is refused on them, before the run is asked.
    assert.equal((await press("zach", { certificates: 10, emails: 10 })).body.certificates, 9);
    world.mailGate = null;
    open();
    assert.equal((await first).status, 200);
    assert.equal(world.sent.length, 9);
    // Once it is done, a press finds the run free, and only Una still owed (an admin's list).
    world.sent = [];
    const third = await press("zach", { certificates: 1, emails: 1 });
    assert.deepEqual(third.body.said, ["1 certificate sent."]);
    assert.deepEqual(world.sent.map((args) => args.to), ["una@example.com"]);
    assert.deepEqual(short(await press("claudia", { certificates: 1, emails: 1 })), [409, "Everybody who finished and every facilitator has been sent theirs already."]);
  });

  /** Amara's certificate, made by another press, its email as given. */
  const amaraMadeElsewhere = (email) => ({
    kind: "finished",
    code: "AAAAAAAAAAAAAAAA",
    uid: "amara",
    runId: RUN.agi,
    linkOn: false,
    issuedAt: END,
    snapshot: { name: "Amara Okafor", did: "finished the", programme: "AGI Strategy Fellowship", term: "Autumn 2026", weeks: "6 weeks", credit: null, issuedOn: "Thu 10 Dec 2026" },
    email,
  });

  test("a certificate another press is sending is never sent twice; one whose claim went stale is", async () => {
    await test_("claudia");
    world.sent = [];
    world.db.seed(certificatePath("amara"), amaraMadeElsewhere({ state: "sending", at: new Date(END.getTime() - 60_000) }));
    // Amara is in hand elsewhere: the button says 8, and the press leaves Amara alone.
    assert.equal((await press("claudia", { certificates: 8, emails: 8 })).status, 200);
    assert.ok(!world.sent.some((args) => args.to === "amara@example.com"));
    assert.equal(certificates()[certificatePath("amara")].email.state, "sending");
    // Ten minutes on, that claim belongs to a press that stopped: Amara is owed again, the code kept.
    world.db.poke(certificatePath("amara"), { email: { state: "sending", at: new Date(END.getTime() - 11 * 60_000) } });
    world.sent = [];
    assert.equal((await press("claudia", { certificates: 1, emails: 1 })).status, 200);
    assert.deepEqual(world.sent.map((args) => args.to), ["amara@example.com"]);
    assert.deepEqual(mail(world.sent[0]).hrefs.filter((href) => !href.includes("/brand/")), [`${APP_URL}/c/AAAAAAAAAAAAAAAA`]);
    assert.equal(certificates()[certificatePath("amara")].email.state, "sent");
  });

  test("one sent after the press read who was owed is not sent again: each claim reads it afresh", async () => {
    await test_("claudia");
    world.sent = [];
    // The press's first write is taking the run. Just before it lands,
    // another press finishes and gives the run back, having sent Amara hers
    // after this press counted her as owed.
    world.db.beforeCommit = () => world.db.seed(certificatePath("amara"), amaraMadeElsewhere({ state: "sent", at: END }));
    const answer = await press("claudia", { certificates: 9, emails: 9 });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.ok(!world.sent.some((args) => args.to === "amara@example.com"), "Amara was sent hers a second time");
    assert.equal(world.sent.length, 8);
    assert.deepEqual(answer.body.said, ["8 certificates sent."]);
    assert.equal(certificates()[certificatePath("amara")].code, "AAAAAAAAAAAAAAAA");
    assert.equal(certificates()[certificatePath("amara")].email.state, "sent");
  });

  test("a send that fails is marked so, the rest still go, and the next press is Send 1 more", async () => {
    await test_("claudia");
    world.sent = [];
    world.mailFate = (to) => (to === "dev@example.com" ? "fail" : "sent");
    const answer = await press("claudia", { certificates: 9, emails: 9 });
    assert.deepEqual(answer.body.said, ["8 certificates sent.", "Couldn’t send to Dev Patel. Press again to try that one again."]);
    assert.equal(certificates()[certificatePath("dev")].email.state, "failed");
    assert.equal(answer.body.model.button, "Send 1 more");
    assert.equal(answer.body.model.emailsLine, "Emails 1 person. Each email links to their certificate page.");
    world.mailFate = "sent";
    world.sent = [];
    assert.deepEqual((await press("claudia", { certificates: 1, emails: 1 })).body.said, ["1 certificate sent."]);
    assert.deepEqual(world.sent.map((args) => args.to), ["dev@example.com"]);
  });

  test("held by this copy of the site, or stopped by the do-not-email list: not tried again", async () => {
    await test_("claudia");
    world.mailFate = (to) => (to === "tom@example.com" ? "suppressed" : to === "grace@example.com" ? "held" : "sent");
    const answer = await press("claudia", { certificates: 9, emails: 9 });
    assert.deepEqual(answer.body.said, [
      "7 certificates sent.",
      "1 held by this copy of the site, which doesn’t email those addresses.",
      "1 not sent: that address is on the do-not-email list.",
    ]);
    assert.equal(certificates()[certificatePath("tom", "facilitated")].email.state, "suppressed");
    assert.equal(certificates()[certificatePath("grace", "facilitated")].email.state, "held");
    assert.equal(answer.body.model.owed.certificates, 0);
  });

  test("an account that no longer stands is sent nothing, a facilitator's or a finisher's", async () => {
    world.db.poke("users/tom", { role: "pending" });
    world.db.poke("users/dev", { role: "pending" });
    const { text } = await page(OverviewPage, "claudia");
    assert.ok(text.includes("4 people who finished and 3 facilitators."));
    assert.ok(text.includes("Send 7 certificates"));
    await test_("claudia");
    world.sent = [];
    assert.equal((await press("claudia", { certificates: 7, emails: 7 })).status, 200);
    assert.ok(!world.sent.some((args) => args.to === "tom@example.com" || args.to === "dev@example.com"));
  });

  test("somebody with no address on file is named, and not counted on the button", async () => {
    world.db.poke("users/hamza", { email: "" });
    const { text } = await page(OverviewPage, "claudia");
    assert.ok(text.includes("Send 8 certificates"));
    assert.ok(text.includes("No email address is on file for Hamza Qureshi, so no certificate goes to them."));
    await test_("claudia");
    const answer = await press("claudia", { certificates: 8, emails: 8 });
    assert.deepEqual(answer.body.said, ["8 certificates sent.", "No email address is on file for Hamza Qureshi, so no certificate goes to them."]);
    assert.equal(certificates()[certificatePath("hamza")], undefined);
  });

  test("a certificate that cannot be written whole stops the press, naming the person, and nothing is sent", async () => {
    world.db.poke("users/chloe", { displayName: "", profile: { ...world.db.read("users/chloe").profile, preferredName: "" } });
    await test_("claudia");
    world.sent = [];
    const before = everything();
    assert.deepEqual(short(await press("claudia", { certificates: 9, emails: 9 })), [
      409,
      "The certificate for NAISI member can’t be written whole: their account has no name. Nothing was sent.",
    ]);
    assert.equal(world.sent.length, 0);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// A facilitator who held a place and finished
// ---------------------------------------------------------------------------

describe("a facilitator who held a place and finished", () => {
  beforeEach(() => {
    // Amara, who finished in Group A, facilitates it too.
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "amara"] });
  });

  test("is counted once among each, and the line says one email carries both", async () => {
    const { text } = await page(OverviewPage, "claudia");
    assert.ok(text.includes("5 people who finished and 5 facilitators."));
    assert.ok(text.includes("Send 10 certificates"));
    assert.ok(
      text.includes("Emails 9 people. Each email links to their certificate page, or to both of theirs for the one person who facilitated and finished."),
    );
  });

  test("is sent both certificates in one email, a button to each", async () => {
    await test_("claudia");
    world.sent = [];
    const answer = await press("claudia", { certificates: 10, emails: 9 });
    assert.deepEqual(answer.body.said, ["10 certificates sent."]);
    const toAmara = world.sent.filter((args) => args.to === "amara@example.com").map(mail);
    assert.equal(toAmara.length, 1);
    const [sent] = toAmara;
    assert.equal(sent.subject, "Your certificates for AGI Strategy");
    for (const words of [
      "You finished the AGI Strategy Fellowship and facilitated a group on it, so you have two certificates, and both are ready.",
      "See your certificate for finishing",
      "See your certificate for facilitating",
      "They’re private: only you can see each one until you turn its link on. From each page you can download it as a PDF or add it to LinkedIn.",
    ]) {
      assert.ok(sent.text.includes(words), `missing "${words}"`);
    }
    const stored = certificates();
    const finished = stored[certificatePath("amara")];
    const facilitated = stored[certificatePath("amara", "facilitated")];
    assert.equal(finished.snapshot.did, "finished the");
    assert.equal(facilitated.snapshot.did, "facilitated a group on the");
    assert.notEqual(finished.code, facilitated.code);
    assert.deepEqual(sent.hrefs.filter((href) => !href.includes("/brand/")), [`${APP_URL}/c/${finished.code}`, `${APP_URL}/c/${facilitated.code}`]);
  });
});

// ---------------------------------------------------------------------------
// After a send: who finished keeps the certificate's word
// ---------------------------------------------------------------------------

describe("after a send, who finished cannot untick somebody sent a certificate for finishing", () => {
  const finishing = (who, body) => call(who, finishingRoute.PUT, params, { body });

  test("their switch is refused with a sentence, and somebody sent none still switches", async () => {
    await test_("claudia");
    await press("claudia", { certificates: 9, emails: 9 });
    const before = everything();
    assert.deepEqual(short(await finishing("claudia", { uid: "amara", finished: false })), [
      409,
      "Amara Okafor has been sent a certificate for finishing, so they stay finished while it stands. Nothing was saved.",
    ]);
    assert.equal(everything(), before);
    // Ticking somebody who did not finish still saves, and they are then owed one.
    const answer = await finishing("claudia", { uid: "bea", finished: true });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const { text } = await page(OverviewPage, "claudia");
    assert.ok(text.includes("Send 1 more"));
  });

  test("a stricter rule that would untick them is refused, naming them; one that unticks nobody sent one saves", async () => {
    await test_("claudia");
    await press("claudia", { certificates: 9, emails: 9 });
    const setRule = (atLeast) => call("claudia", ruleRoute.PUT, params, { body: { atLeast } });
    const answer = await setRule(6);
    assert.equal(answer.status, 409, JSON.stringify(answer.body));
    assert.equal(
      answer.body.error,
      "Dev Patel and Yasmin Farouk have been sent certificates for finishing, and that rule would mark them as not finished. Nothing was saved.",
    );
    assert.equal(world.db.read(rulePath).atLeast, 4);
    assert.equal((await setRule(3)).status, 200);
  });
});

// ---------------------------------------------------------------------------
// The preview
// ---------------------------------------------------------------------------

describe("the preview", () => {
  test("shows the lead one person's certificate page and the email, with nothing made or sent", async () => {
    const before = everything();
    const { text, html } = await page(PreviewPage, "claudia");
    for (const words of [
      "Amara Okafor’s certificate page",
      "This is how the page will look to its owner once the certificate is sent, with its link off. Nobody else can open it until they turn the link on.",
      "Certificate · Autumn 2026",
      "6 weeks · based on the BlueDot Impact curriculum",
      "The email",
      "Your certificate for AGI Strategy",
    ]) {
      assert.ok(text.includes(words), `missing "${words}"`);
    }
    assert.ok(!text.includes("Check it at"), "a preview has no link to check");
    assert.match(html, /<iframe[^>]*sandbox=""/);
    assert.match(html, /srcDoc=|srcdoc=/i);
    assert.equal(everything(), before);
    assert.equal(world.sent.length, 0);
  });

  test("a reviewer is told whose it is; before the end it says when", async () => {
    assert.ok((await page(PreviewPage, "lloyd")).text.includes("Only the programme’s lead and admins can send its certificates."));
    mock.timers.setTime(BEFORE.getTime());
    assert.ok((await page(PreviewPage, "claudia")).text.includes("Certificates can be sent once the last session is over, on Wed 9 Dec."));
  });
});
