/**
 * "I'D JOIN ONLINE" ON A REQUEST TO GO TO ANOTHER GROUP'S SESSION: the tick on
 * the person's form, what the admin deciding it reads, and what approving it
 * writes and sends.
 *
 *   POST /api/courses/runs/[runId]/requests/visit                 { hostGroupId, reason?, online? }
 *   POST /api/courses/requests/[requestId]/visit/approve          admins
 *   /learn/[runId]/another-session                                the person's form
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this holds
 *
 *  1. THE TICK is off unless ticked, stored on the request as a strict true,
 *     and shown to the admin deciding it. The member is told nothing new.
 *  2. ONE TRANSACTION. Approving a ticked request writes the decision, the
 *     visit and the person's "joining online" word on the HOST'S register for
 *     that session, with the stamp that says its email went, exactly as the
 *     person's own press of "I’m joining online" writes it. Anything that
 *     refuses the approval writes none of the three.
 *  3. ONE EMAIL. The host's facilitators' email about the visit carries the
 *     approved lines, by whether the session has a meeting link; the email
 *     that press would have sent does not also go, then or on a later press.
 *     NO EMAIL CARRIES A MEETING LINK.
 *  4. WITHOUT THE TICK every email and every register is as it is today, and
 *     a staff-arranged visit is unchanged.
 *  5. THE LINK: the visitor sees the host's link for that one session, by the
 *     rule that decides who sees a session's link, and no other.
 *  6. THE BOX the email names: the host's group page lists the visitor in the
 *     box at the top, with the field and the button the email names.
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * the clock is Tue 17 Nov 2026 at noon. Chloe is in Group B, whose week 3
 * session is tonight; she asks for Group C's, Wed 18 Nov at 1pm (Tom). Zach
 * is an admin.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGI, B, C, NOW, ROUND, RUN, makeLeavingWorld, registerPath } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__visitRequestOnline");
const { world, call } = w;
const askRoute = await w.courseRoute("runs", "[runId]", "requests", "visit");
const approveRoute = await w.courseRoute("requests", "[requestId]", "visit", "approve");
const withdrawRoute = await w.courseRoute("requests", "[requestId]", "visit", "withdraw");
const onlineRoute = await w.courseRoute("groups", "[groupId]", "joining-online");
const visitRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "visit");
const cancelRoute = await w.courseRoute("runs", "[runId]", "visit", "cancel");
const changeRoute = await w.courseRoute("groups", "[groupId]", "session", "change");
const removeRoute = await w.courseRoute("runs", "[runId]", "enrolments", "[uid]", "remove");
const facilitatorsRoute = await w.courseRoute("groups", "[groupId]", "facilitators");
const excusedAskRoute = await w.courseRoute("groups", "[groupId]", "excused");
const excusedApproveRoute = await w.courseRoute("requests", "[requestId]", "excused", "approve");
const enrolments = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const { normalizeCourseRun } = await w.loadTs(join("lib", "firestore", "courses.ts"));
const { normalizeCourseGroup } = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));
const { normalizeVisitRequest } = await w.loadTs(join("lib", "firestore", "courseMemberRequests.ts"));
const { parseVisitAsk } = await w.loadTs(join("lib", "courses", "visitRequest", "model.ts"));
const { loadVisitRequestPage } = await w.loadTs(join("lib", "courses", "visitRequest", "page.ts"));
const { loadFacilitatorGroup } = await w.loadTs(join("lib", "courses", "facilitatorGroup.ts"));
const { joiningOnlineBox } = await w.loadTs(join("lib", "courses", "meetingLink", "box.ts"));
const { seesSessionLink } = await w.loadTs(join("lib", "courses", "meetingLink", "audience.ts"));
const { boxPeopleOf } = await w.loadTs(join("lib", "courses", "meetingLink", "box.ts"));
const { onlineWordsGoWithPlacingIn } = await w.loadTs(join("lib", "courses", "groupFacilitators.ts"));
const { linkFieldLabel, ADD_LINK } = await w.loadTs(join("lib", "courses", "joiningOnline", "words.ts"));
const anotherPage = (await w.loadTs(join("app", "(app)", "learn", "[runId]", "another-session", "page.tsx"))).default;

const LINK = "https://meet.example.com/group-c-week-3";
const NO_LINK_LINE =
  "Chloe will join online. The session has no meeting link yet. To add one, open your group page: the box at the top has a field “Meeting link for week 3”. Paste the link there and press “Add the link”.";
const LINK_LINE = "Chloe will join online. The session already has a meeting link, so there’s nothing to add.";
const JOINING_ONLINE_SUBJECT = "Chloe Nguyen is joining week 3 online";

const read = (path) => world.db.read(path);
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const seat = (uid) => enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, read(seatPath(uid)));
const groupOf = (id) => normalizeCourseGroup(id, read(`courseGroups/${id}`));
const runOf = () => normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
const mailTo = (uid) => world.mail.filter((message) => message.to.startsWith(`${uid}@`));
const textOfMail = (message) => JSON.stringify(message);
const hostRegister = () => read(registerPath(C, 3)) ?? {};

const ask = (who, body) => call(who, askRoute.POST, { runId: RUN.agi }, { body, course: true });
const approve = (requestId, body) => call("zach", approveRoute.POST, { requestId }, { body, course: true });

/** Chloe asks for Group C's session, ticked or not, and the request's id. */
async function chloeAsks(online) {
  const body = online === undefined ? { hostGroupId: C } : { hostGroupId: C, online };
  const answer = await ask("chloe", body);
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  await w.settle();
  return answer.body.request.id;
}

/** Zach approves it the way the page does: the preview's count and full flag sent back. */
async function zachApproves(requestId, reply = "") {
  const page = await loadVisitRequestPage(world.courseDb, w.sessionOf("zach"), requestId, new Date());
  assert.ok(page.view.approving?.ok, JSON.stringify(page.view.approving));
  world.mail.length = 0;
  const answer = await approve(requestId, { emailCount: page.view.approving.preview.emails, overLimit: page.view.approving.preview.overLimit !== null, ...(reply ? { reply } : {}) });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  await w.settle();
  return { page, answer };
}

/** Group C's standing session with a meeting link, or with none. */
function hostLink(url) {
  const group = read(`courseGroups/${C}`);
  world.db.poke(`courseGroups/${C}`, { session: { ...group.session, meetingUrl: url } });
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  hostLink(null);
});

describe("1. the tick on the form and on the request", () => {
  test("the form draws the tick, off, with the approved label", async () => {
    const page = await w.draw(anotherPage, "chloe", { runId: RUN.agi });
    assert.match(page.html, /<input type="checkbox"[^>]*\/><span>I’d join online<\/span>/);
    assert.doesNotMatch(page.html, /<input type="checkbox"[^>]*checked/, "off unless ticked");
    assert.equal(page.wrote, false);
  });

  test("the body: absent is not ticked, a boolean is kept, anything else is refused before anything is read", async () => {
    assert.equal(parseVisitAsk({ hostGroupId: C }).value.online, false);
    assert.equal(parseVisitAsk({ hostGroupId: C, online: true }).value.online, true);
    assert.equal(parseVisitAsk({ hostGroupId: C, online: false }).value.online, false);
    assert.equal(parseVisitAsk({ hostGroupId: C, online: "yes" }).ok, false);
    const refused = await ask("chloe", { hostGroupId: C, online: "yes" });
    assert.equal(refused.status, 400);
    assert.equal(world.db.paths().filter((path) => path.startsWith("courseRequests/")).length, 0);
  });

  test("stored on the request as a strict true; a request stored before the tick reads as not ticked", async () => {
    const ticked = await chloeAsks(true);
    assert.equal(read(`courseRequests/${ticked}`).change.online, true);
    assert.equal(normalizeVisitRequest(ticked, read(`courseRequests/${ticked}`)).change.online, true);
    const before = { ...read(`courseRequests/${ticked}`), change: { ...read(`courseRequests/${ticked}`).change } };
    delete before.change.online;
    assert.equal(normalizeVisitRequest(ticked, before).change.online, false);
    assert.equal(normalizeVisitRequest(ticked, { ...before, change: { ...before.change, online: "true" } }).change.online, false);
    w.reset();
    hostLink(null);
    const unticked = await chloeAsks();
    assert.equal(read(`courseRequests/${unticked}`).change.online, false);
  });

  test("the admin deciding it reads that she would join online, only when ticked; asking writes nothing on any register", async () => {
    const id = await chloeAsks(true);
    assert.equal(read(registerPath(C, 3)), undefined, "nothing on the host's register until it is approved");
    const page = await loadVisitRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date());
    assert.equal(page.view.online, "Chloe would join online.");
    w.reset();
    hostLink(null);
    const plain = await chloeAsks();
    assert.equal((await loadVisitRequestPage(world.courseDb, w.sessionOf("zach"), plain, new Date())).view.online, null);
  });

  test("the member's waiting card says nothing new", async () => {
    const plain = await chloeAsks();
    const untickedPage = await w.draw(anotherPage, "chloe", { runId: RUN.agi });
    w.reset();
    hostLink(null);
    await chloeAsks(true);
    const tickedPage = await w.draw(anotherPage, "chloe", { runId: RUN.agi });
    assert.ok(plain);
    assert.equal(tickedPage.text, untickedPage.text);
    assert.doesNotMatch(tickedPage.text, /online/i);
  });
});

describe("2. approving a ticked request: one transaction, one email", () => {
  test("the decision, the visit and her word on the host's register land together, stamped as emailed, as her own press writes it", async () => {
    const id = await chloeAsks(true);
    await zachApproves(id);
    assert.equal(read(`courseRequests/${id}`).status, "approved");
    assert.equal(seat("chloe").visits.length, 1);
    const register = hostRegister();
    assert.ok(register.onlineSaid?.chloe, "her word on Group C's week 3 register");
    assert.ok(register.onlineEmailed?.chloe, "with the stamp that says its email went");
    assert.equal(register.setBy.chloe.how, "self");
    assert.equal(register.setBy.chloe.byUid, "chloe", "her own word, whoever's press it rode on");
    assert.equal(register.runId, RUN.agi);
    assert.equal(register.groupId, C);
    assert.equal(register.weekNumber, 3);
    assert.equal(register.occurrence, 1);
    assert.deepEqual(register.records ?? {}, {}, "never a mark");
    assert.equal(read(registerPath(B, 3))?.onlineSaid?.chloe, undefined, "never on her own group's register");

    // The same fields her own press writes, on a register as it was.
    const approvedKeys = Object.keys(register).sort();
    w.reset();
    hostLink(null);
    world.db.poke(seatPath("chloe"), { visits: [{ weekNumber: 3, groupId: C, arrangedByUid: "zach", arrangedAt: NOW }] });
    const pressed = await call("chloe", onlineRoute.POST, { groupId: C }, { body: { sessionKey: "w03", online: true }, course: true });
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    assert.deepEqual(Object.keys(hostRegister()).sort(), approvedKeys);
    assert.deepEqual(Object.keys(hostRegister().setBy.chloe).sort(), Object.keys(register.setBy.chloe).sort());
  });

  test("the host's email carries the approved lines with no link set, and no joining-online email goes, then or on a later press", async () => {
    const id = await chloeAsks(true);
    const { page } = await zachApproves(id);
    assert.equal(world.mail.length, page.view.approving.preview.emails, "the count on the button, no more");
    const toTom = mailTo("tom");
    assert.equal(toTom.length, 1);
    assert.equal(toTom[0].subject, "Chloe Nguyen is joining Group C for week 3");
    assert.ok(textOfMail(toTom[0]).includes(NO_LINK_LINE), textOfMail(toTom[0]));
    // The field and the button are the box's own words.
    assert.ok(NO_LINK_LINE.includes(`“${linkFieldLabel(3)}”`));
    assert.ok(NO_LINK_LINE.includes(`“${ADD_LINK}”`));
    assert.ok(!world.mail.some((message) => message.subject === JOINING_ONLINE_SUBJECT));
    // Her own press later, after taking it back: the stamp holds, nobody is told twice.
    world.mail.length = 0;
    assert.equal((await call("chloe", onlineRoute.POST, { groupId: C }, { body: { sessionKey: "w03", online: false }, course: true })).status, 200);
    assert.equal((await call("chloe", onlineRoute.POST, { groupId: C }, { body: { sessionKey: "w03", online: true }, course: true })).status, 200);
    await w.settle();
    assert.equal(world.mail.length, 0);
  });

  test("with a link set: the approved line that there is nothing to add, and the link is in no email", async () => {
    hostLink(LINK);
    const id = await chloeAsks(true);
    await zachApproves(id, "Enjoy Group C.");
    const toTom = mailTo("tom");
    assert.equal(toTom.length, 1);
    assert.ok(textOfMail(toTom[0]).includes(LINK_LINE), textOfMail(toTom[0]));
    assert.ok(!textOfMail(toTom[0]).includes("no meeting link yet"));
    for (const message of world.mail) assert.ok(!textOfMail(message).includes("meet.example.com"), `the link in an email to ${message.to}`);
    assert.ok(!world.mail.some((message) => message.subject === JOINING_ONLINE_SUBJECT));
  });

  test("only the host's email changes: the person's and the home's are a plain approval's", async () => {
    const ticked = await chloeAsks(true);
    await zachApproves(ticked, "Enjoy Group C.");
    const tickedMail = world.mail.filter((message) => !message.to.startsWith("tom@")).map((message) => ({ to: message.to, subject: message.subject, body: textOfMail(message) }));
    w.reset();
    hostLink(null);
    const plain = await chloeAsks();
    await zachApproves(plain, "Enjoy Group C.");
    const plainMail = world.mail.filter((message) => !message.to.startsWith("tom@")).map((message) => ({ to: message.to, subject: message.subject, body: textOfMail(message) }));
    assert.deepEqual(tickedMail, plainMail);
    assert.ok(!textOfMail(mailTo("tom")[0]).includes("will join online"), "and no online line without the tick");
  });

  test("without the tick: nothing on the host's register, and the host's email is a staff-arranged visit's, word for word", async () => {
    const id = await chloeAsks();
    await zachApproves(id);
    assert.equal(hostRegister().onlineSaid?.chloe, undefined);
    const approvedTom = mailTo("tom").map((message) => ({ subject: message.subject, body: textOfMail(message) }));
    w.reset();
    hostLink(null);
    const shown = await call("zach", visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { body: { weekNumber: 3, hostGroupId: C, preview: true }, course: true });
    world.mail.length = 0;
    const saved = await call(
      "zach",
      visitRoute.POST,
      { roundId: ROUND, programmeId: AGI, uid: "chloe" },
      { body: { weekNumber: 3, hostGroupId: C, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null }, course: true },
    );
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    await w.settle();
    assert.deepEqual(
      mailTo("tom").map((message) => ({ subject: message.subject, body: textOfMail(message) })),
      approvedTom,
    );
    assert.equal(hostRegister().onlineSaid?.chloe, undefined, "a staff-arranged visit writes no word");
  });

  test("a withdraw that lands first: no decision, no visit, no word, no email", async () => {
    const id = await chloeAsks(true);
    const page = await loadVisitRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date());
    await call("chloe", withdrawRoute.POST, { requestId: id }, { body: {}, course: true });
    world.mail.length = 0;
    const late = await approve(id, { emailCount: page.view.approving.preview.emails });
    assert.equal(late.status, 409);
    assert.equal(seat("chloe").visits, undefined);
    assert.equal(read(registerPath(C, 3))?.onlineSaid?.chloe, undefined);
    assert.equal(world.mail.length, 0);
  });
});

describe("3. what approving with the tick refuses, and what it leaves alone", () => {
  test("the host's register already finished: refused on the page and at the press in the register's own sentence, and nothing is written", async () => {
    const id = await chloeAsks(true);
    const count = (await loadVisitRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date())).view.approving.preview.emails;
    world.db.seed(registerPath(C, 3), { runId: RUN.agi, groupId: C, weekNumber: 3, occurrence: 1, records: {}, held: true, pushedAt: new Date("2026-11-17T09:00:00Z") });
    const page = await loadVisitRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date());
    assert.deepEqual(page.view.approving, { ok: false, error: "That session’s register is already finished." });
    world.mail.length = 0;
    const refused = await approve(id, { emailCount: count });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, "That session’s register is already finished.");
    assert.equal(read(`courseRequests/${id}`).status, "waiting");
    assert.equal(seat("chloe").visits, undefined);
    assert.equal(hostRegister().onlineSaid?.chloe, undefined);
    assert.equal(world.mail.length, 0);
  });

  test("her line on the host's register already filled in: refused in the visit's own sentence", async () => {
    const id = await chloeAsks(true);
    world.db.seed(registerPath(C, 3), { runId: RUN.agi, groupId: C, weekNumber: 3, occurrence: 1, records: { chloe: "present" }, held: true, pushedAt: null });
    const page = await loadVisitRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date());
    assert.deepEqual(page.view.approving, { ok: false, error: "Chloe is already marked on Group C’s register for week 3." });
  });

  test("a session held online for everybody: approved, nothing written about joining online, and the host's email as any visit's", async () => {
    world.db.poke(`courseGroups/${C}`, { sessionModes: { w03: "virtual" } });
    const id = await chloeAsks(true);
    await zachApproves(id);
    assert.equal(read(`courseRequests/${id}`).status, "approved");
    assert.equal(hostRegister().onlineSaid?.chloe, undefined);
    assert.ok(!textOfMail(mailTo("tom")[0]).includes("will join online"));
    assert.ok(!world.mail.some((message) => message.subject === JOINING_ONLINE_SUBJECT));
  });

  test("said already on the host's register: approved, the word not written again, its stamp written alone, and the email still says it", async () => {
    const id = await chloeAsks(true);
    const said = new Date("2026-11-17T10:00:00Z");
    world.db.seed(registerPath(C, 3), { runId: RUN.agi, groupId: C, weekNumber: 3, occurrence: 1, records: {}, held: true, pushedAt: null, onlineSaid: { chloe: said } });
    await zachApproves(id);
    assert.equal(hostRegister().onlineSaid.chloe.getTime(), said.getTime(), "the word as it was");
    assert.ok(hostRegister().onlineEmailed?.chloe, "the stamp, as the visit's email says it");
    assert.ok(textOfMail(mailTo("tom")[0]).includes(NO_LINK_LINE));
    // So taking it back and saying it again tells nobody a second time.
    world.mail.length = 0;
    assert.equal((await call("chloe", onlineRoute.POST, { groupId: C }, { body: { sessionKey: "w03", online: false }, course: true })).status, 200);
    assert.equal((await call("chloe", onlineRoute.POST, { groupId: C }, { body: { sessionKey: "w03", online: true }, course: true })).status, 200);
    await w.settle();
    assert.equal(world.mail.length, 0);
  });
});

describe("4. the link and the box", () => {
  test("the visitor sees the host's link for that one session, by the rule that decides who sees a session's link", async () => {
    hostLink(LINK);
    const id = await chloeAsks(true);
    await zachApproves(id);
    const place = seat("chloe");
    const viewer = w.sessionOf("chloe");
    assert.equal(seesSessionLink({ viewer, isAdmin: false, seat: place, group: groupOf(C), sessionKey: "w03" }), true);
    assert.equal(seesSessionLink({ viewer, isAdmin: false, seat: place, group: groupOf(C), sessionKey: "w04" }), false, "never another week's");
    assert.equal(seesSessionLink({ viewer, isAdmin: false, seat: place, group: groupOf(C), sessionKey: null }), false, "never the standing link");
  });

  /** The box at the top of a group's page, as the page builds it (`boxPeopleOf`). */
  async function boxOf(groupId, who) {
    const model = await loadFacilitatorGroup(world.courseDb, runOf(), groupOf(groupId), { isAdmin: false, actor: w.sessionOf(who) }, new Date());
    const box = await joiningOnlineBox(world.courseDb, { run: runOf(), group: groupOf(groupId), people: boxPeopleOf(model), now: new Date() });
    return { model, box: box.map((each) => ({ weekNumber: each.weekNumber, names: each.names, hasLink: each.hasLink })) };
  }

  test("the host's group page box lists her under week 3, so the field and the button the email names are there", async () => {
    const id = await chloeAsks(true);
    await zachApproves(id);
    assert.deepEqual((await boxOf(C, "tom")).box, [{ weekNumber: 3, names: ["Chloe Nguyen"], hasLink: false }]);
    // The group page hands the box exactly these people.
    const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "(app)", "learn", "[runId]", "group", "[groupId]", "page.tsx"), "utf8");
    assert.match(page, /people: boxPeopleOf\(model\),/);
  });

  test("with the host's week 2 register left unfinished, the box still lists her under week 3", async () => {
    // The group's next session, as its page reads it, is week 2's: a register nobody has finished.
    world.db.poke(registerPath(C, 2), { pushedAt: null });
    const id = await chloeAsks(true);
    await zachApproves(id);
    assert.ok(textOfMail(mailTo("tom")[0]).includes(NO_LINK_LINE), "the email names the box");
    const { model, box } = await boxOf(C, "tom");
    assert.deepEqual(model.visitors, [], "the page's next-session visitors are week 2's: nobody");
    assert.deepEqual(box, [{ weekNumber: 3, names: ["Chloe Nguyen"], hasLink: false }]);
  });

  test("a visitor is named only under the week they visit, and nowhere once the visit is off", async () => {
    const id = await chloeAsks(true);
    await zachApproves(id);
    // A word of hers on another week's register of the host names her nowhere.
    world.db.seed(registerPath(C, 4), { runId: RUN.agi, groupId: C, weekNumber: 4, occurrence: 1, records: {}, held: true, pushedAt: null, onlineSaid: { chloe: new Date() } });
    assert.deepEqual((await boxOf(C, "tom")).box, [{ weekNumber: 3, names: ["Chloe Nguyen"], hasLink: false }]);
    assert.equal((await call("chloe", cancelRoute.POST, { runId: RUN.agi }, { body: { weekNumber: 3 }, course: true })).status, 200);
    assert.deepEqual((await boxOf(C, "tom")).box, []);
  });

  test("a group with no visitors: the box's people are exactly its own people still taking part, as before", async () => {
    for (const [groupId, who] of [
      [B, "rahul"],
      [C, "tom"],
    ]) {
      const { model } = await boxOf(groupId, who);
      assert.deepEqual(model.visitorsAhead, []);
      assert.deepEqual(
        boxPeopleOf(model),
        model.people.filter((person) => person.left === null).map((person) => ({ uid: person.uid, name: person.name })),
      );
    }
  });
});

describe("5. her word goes with the visit, by every way a visit ends", () => {
  /** Her ticked request approved: the word and both stamps on Group C's week 3 register. */
  async function approvedTicked() {
    const id = await chloeAsks(true);
    await zachApproves(id);
    const register = hostRegister();
    assert.ok(register.onlineSaid?.chloe && register.onlineEmailed?.chloe && register.setBy?.chloe);
  }
  /** Nothing of her word is left on the host's register. */
  function wordGone(why) {
    const register = hostRegister();
    assert.equal(register.onlineSaid?.chloe, undefined, `${why}: the word`);
    assert.equal(register.onlineEmailed?.chloe, undefined, `${why}: the stamp that its email went`);
    assert.equal(register.setBy?.chloe, undefined, `${why}: the stamp that she set the line`);
  }

  test("her own cancel", async () => {
    await approvedTicked();
    assert.equal((await call("chloe", cancelRoute.POST, { runId: RUN.agi }, { body: { weekNumber: 3 }, course: true })).status, 200);
    wordGone("her cancel");
  });

  test("staff calling the visit off", async () => {
    await approvedTicked();
    const run = runOf();
    const { readVisitFacts, dbReader, standingVisits } = await w.loadTs(join("lib", "courses", "visit", "plan.ts"));
    const facts = await readVisitFacts(dbReader(world.courseDb), world.courseDb, run.id, "chloe", "ahead", new Date());
    const standing = standingVisits(facts.facts, "zach", new Date()).find((each) => each.weekNumber === 3);
    const off = await call("zach", visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { body: { weekNumber: 3, callOff: true, emailCount: standing.emails }, course: true });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    wordGone("staff's call-off");
  });

  test("the host's session called off", async () => {
    await approvedTicked();
    const base = { week: 3, dateKey: "2026-11-18", kind: "cancel", reason: "Tom is away.", tell: false };
    const shown = await call("tom", changeRoute.POST, { groupId: C }, { body: { ...base, preview: true }, course: true });
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    const visitEmails = shown.body.preview?.visitsOff?.emails ?? 0;
    const off = await call("tom", changeRoute.POST, { groupId: C }, { body: { ...base, ...(visitEmails > 0 ? { visitEmails } : {}) }, course: true });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal(seat("chloe").visits, undefined);
    wordGone("the host's session called off");
  });

  test("staff taking her off the run", async () => {
    await approvedTicked();
    const shown = await call("zach", removeRoute.POST, { runId: RUN.agi, uid: "chloe" }, { body: { preview: true }, course: true });
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    const removed = await call("zach", removeRoute.POST, { runId: RUN.agi, uid: "chloe" }, { body: { emails: shown.body.preview.emails }, course: true });
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    wordGone("her removal");
  });

  test("leaving the run", async () => {
    // Chloe applied to the run itself and cannot leave by herself; Amara, who
    // holds her place through the form, can. Her visit to Group C's week 3,
    // with her word and both stamps on its register, as an approval leaves them.
    const said = new Date("2026-11-17T10:00:00Z");
    world.db.poke(seatPath("amara"), { visits: [{ weekNumber: 3, groupId: C, arrangedByUid: "zach", arrangedAt: NOW }] });
    world.db.seed(registerPath(C, 3), {
      runId: RUN.agi, groupId: C, weekNumber: 3, occurrence: 1, records: {}, held: true, pushedAt: null,
      onlineSaid: { amara: said }, onlineEmailed: { amara: said }, setBy: { amara: { byUid: "amara", at: said, how: "self" } },
    });
    const left = await w.leave("amara");
    assert.equal(left.status, 200, JSON.stringify(left.body));
    const register = hostRegister();
    assert.equal(register.onlineSaid?.amara, undefined);
    assert.equal(register.onlineEmailed?.amara, undefined);
    assert.equal(register.setBy?.amara, undefined);
  });

  test("a placement made by an appointment, which ends any visit on the place", async () => {
    await approvedTicked();
    // A place in no group, as the appointment's placement takes one, still holding the visit.
    world.db.poke(seatPath("chloe"), { groupId: null });
    const snap = await world.courseDb.collection("courseEnrolments").doc(`${RUN.agi}__chloe`).get();
    await world.courseDb.runTransaction(async (tx) => {
      const write = await onlineWordsGoWithPlacingIn(tx, world.courseDb, { run: runOf(), placing: new Map([["chloe", { row: "update" }]]), enrolments: new Map([["chloe", snap]]), now: new Date() });
      write();
    });
    wordGone("an appointment's placement");
    // And both doors to an appointment ask it before they write.
    const src = (...parts) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", ...parts), "utf8");
    for (const file of [src("app", "api", "courses", "groups", "[groupId]", "facilitators", "route.ts"), src("lib", "courses", "facilitatorAsks", "answer.ts")]) {
      const asked = file.indexOf("await onlineWordsGoWithPlacingIn(tx, db, {");
      const written = file.indexOf("writeFacilitatorChange(tx, db, {");
      assert.ok(asked !== -1 && asked < written, "the words are read before the change is written");
      assert.ok(file.indexOf("wordsGo();", written) > written, "and go with its writes");
    }
    assert.ok(facilitatorsRoute.POST);
  });

  test("an excusal approved for that week: excused wins, and the line keeps the approval's own stamp", async () => {
    await approvedTicked();
    const asked = await call("chloe", excusedAskRoute.POST, { groupId: C }, {
      body: { sessionKeys: ["w03"], reason: "A family wedding that weekend.", inPerson: true, ownOnline: true, otherOnline: true },
      course: true,
    });
    assert.equal(asked.status, 200, JSON.stringify(asked.body));
    const requestPath = world.db.paths().find((path) => path.startsWith("courseRequests/") && read(path).kind === "excused");
    const approved = await call("zach", excusedApproveRoute.POST, { requestId: requestPath.split("/")[1] }, { body: { sessionKey: "w03" }, course: true });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    const register = hostRegister();
    assert.equal(register.onlineSaid?.chloe, undefined);
    assert.equal(register.onlineEmailed?.chloe, undefined);
    assert.ok(register.excusedInAdvance?.chloe || register.records?.chloe === "excused", "excused on the host's register");
  });

  test("Change a session counts and names a word only from somebody due at the session, whatever path left one behind", async () => {
    await approvedTicked();
    // A word left by somebody who is not due at Group C's week 3 (no visit, another group), and one beside an excused line.
    const register = hostRegister();
    world.db.seed(registerPath(C, 3), {
      ...register,
      onlineSaid: { ...register.onlineSaid, amara: new Date("2026-11-17T10:00:00Z"), hamza: new Date("2026-11-17T10:00:00Z") },
      records: { hamza: "excused" },
    });
    const shown = await call("tom", changeRoute.POST, { groupId: C }, { body: { week: 3, dateKey: "2026-11-18", kind: "cancel", reason: "Tom is away.", tell: false, preview: true }, course: true });
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    assert.deepEqual(shown.body.preview.said.joiningOnline, { count: 1, names: ["Chloe"] });
  });

  test("called off and arranged again: her next press tells the host's facilitators, and saying it twice tells nobody twice", async () => {
    await approvedTicked();
    assert.equal((await call("chloe", cancelRoute.POST, { runId: RUN.agi }, { body: { weekNumber: 3 }, course: true })).status, 200);
    const shown = await call("zach", visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { body: { weekNumber: 3, hostGroupId: C, preview: true }, course: true });
    const saved = await call("zach", visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { body: { weekNumber: 3, hostGroupId: C, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null }, course: true });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    await w.settle();
    world.mail.length = 0;
    assert.equal((await call("chloe", onlineRoute.POST, { groupId: C }, { body: { sessionKey: "w03", online: true }, course: true })).status, 200);
    await w.settle();
    assert.deepEqual(world.mail.map((message) => message.subject), [JOINING_ONLINE_SUBJECT]);
    // Her own take-back and say-again, the only thing she can do alone, sends nothing more.
    world.mail.length = 0;
    await call("chloe", onlineRoute.POST, { groupId: C }, { body: { sessionKey: "w03", online: false }, course: true });
    await call("chloe", onlineRoute.POST, { groupId: C }, { body: { sessionKey: "w03", online: true }, course: true });
    await w.settle();
    assert.equal(world.mail.length, 0);
  });
});
