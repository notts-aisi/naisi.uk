/**
 * WHAT PUSHING A REGISTER EMAILS, said before the press and after it: the
 * register's foot, the confirm in front of its button and the push's own
 * answer, read together, as the group's facilitator, the programme's lead and
 * an admin, with the emails the push sends counted.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule
 *
 * While next week's email is not on its schedule, pushing a register sends
 * the group the email about the session after the one being finished. A
 * button that emails says truly whom it emails and how many, so the three
 * places that say what this press does give one answer, worked out once on
 * the server (`src/lib/courses/pushEmail.ts`):
 *
 *  - the session after is the next one in the group's WHOLE schedule, with
 *    each week's changes applied, never the register's next column (the
 *    columns are only the sessions that have started, which is how this
 *    week's confirm came to say "the group's last session" every week);
 *  - whether the email goes, and to how many, is the send's own decision,
 *    asked without sending;
 *  - the register's GET carries the answer for every register on the page,
 *    whoever reads it, and the foot and the confirm put it into words.
 *
 * Every case below is read as the three people who open a register: the
 * group's facilitator, the lead of the programme that names the run, and an
 * admin. The lead reads registers and may not push them; the facilitator and
 * the admin push, and the mail the push hands to the door is counted against
 * the number the confirm gave.
 *
 * ## The cases
 *
 * Next week published (the ordinary case), not published, moved, held online,
 * cancelled, the group's last session, a register whose own session was
 * cancelled, a register for an earlier week pushed late, people the email
 * does not reach (a switched-off course row, a suppressed address, a
 * placement nobody has told yet), an email that has already gone, a group
 * nobody can be emailed in, a run with no dates, a one-person group, and the
 * finished ending (next week's email on its schedule), which is unchanged.
 *
 * ## The tree
 *
 * The last section walks `src` and holds the one answer in place: the
 * session after a register's is indexed in one function, every file that
 * acts on or says what a push emails asks it, and the confirm is handed the
 * route's answer by the one page that draws it.
 *
 * Built on `tests/lib/registerWorld.mjs`: the run starts on Thursday 15
 * October 2026; Group B meets on Tuesdays from 6pm to 8pm in Room C20 (Rahul
 * and Sofia; Amara, Chloe and Farah in it), Group A on Mondays (Amelia, with
 * Ana). Weeks 1 and 2 are published. Claudia leads the programme; Zach is an
 * admin.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render } from "@react-email/render";
import { AT, GROUP, RUN, makeWorld, registerPath, seedWorld } from "./lib/registerWorld.mjs";
import { reachOf, scanModule, walkSource } from "./lib/functionScan.mjs";
import { assertReadable, stripSource } from "./lib/stripSource.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const inSrc = (file) => relative(SRC, file).split(sep).join("/");

/** Every stylesheet any file under `src` imports, by the specifier it is imported by. */
function stylesheets() {
  const found = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) {
      found.add(specifier);
    }
  }
  return [...found];
}

/** What the page's components are handed: the grid's data hook reads it. */
const UI = "__registerPushEmailUi";
globalThis[UI] = { attendance: null };
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

// The routes and the page's own components, through the world's one loader.
// The page needs three things the routes never reach: the grid is handed
// the register route's own answer through its data hook, a dialog is drawn
// where it stands (the real one waits for the browser to portal itself), and
// a stylesheet reads as its class names.
const made = makeWorld("__registerPushEmail", [
  ["./useAttendance", `export default function useAttendance() { return globalThis[${JSON.stringify(UI)}].attendance; }`],
  ["@/components/ui/Modal", "export default function Modal(props) { return props.open ? props.children : null; }"],
  ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
]);
const { world, reset, call, courseRoute, loadTs } = made;

const register = await courseRoute("groups", "[groupId]", "attendance");
const push = await courseRoute("groups", "[groupId]", "attendance", "push");
const change = await courseRoute("groups", "[groupId]", "session", "change");
const { default: AttendanceGrid } = await loadTs("features/courses/AttendanceGrid.tsx");
const { default: PushConfirm } = await loadTs("features/courses/PushConfirm.tsx");
const { pushEmailSentence, registerEndingWords } = await loadTs("features/courses/registerEndingWords.ts");

mock.timers.enable({ apis: ["Date"], now: AT.week1Evening });
const at = (instant) => mock.timers.setTime(new Date(instant).getTime());

// ---------------------------------------------------------------------------
// The page, drawn by its own components
// ---------------------------------------------------------------------------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'" };
/** Markup as a reader reads it: tags gone, the five entities decoded, spaces collapsed. */
const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, name) => ENTITIES[name])
    .replace(/\s+/g, " ")
    .trim();

/** The foot under the grid as the page draws it: the line under the button, then the notes. */
function drawnFoot(payload) {
  globalThis[UI].attendance = {
    group: payload.group,
    sessions: payload.sessions,
    members: payload.members,
    notYetTold: payload.notYetTold,
    leavers: payload.leavers,
    records: payload.records,
    participantNotes: payload.participantNotes,
    canEditPushed: payload.canEditPushed,
    ending: payload.ending,
    loading: false,
    loaded: true,
    error: null,
    reload: () => {},
    mark: async () => {},
    edit: async () => ({}),
    push: async () => ({}),
    saveNote: async () => ({}),
  };
  const html = renderToStaticMarkup(createElement(AttendanceGrid, { groupId: payload.group.id }));
  const pick = (name) => [...html.matchAll(new RegExp(`<p class="${name}">([\\s\\S]*?)</p>`, "g"))].map((m) => textOf(m[1]));
  return { effect: pick("footEffect")[0] ?? null, notes: pick("footNote") };
}

/**
 * The confirm in front of one register's button, as the grid opens it: the
 * register's column, the group's name, and the route's answer for that
 * register. Its first point is who the press emails.
 */
function drawnConfirm(payload, sessionKey) {
  const session = payload.sessions.find((each) => each.sessionKey === sessionKey);
  assert.ok(session, `the register has no column ${sessionKey}`);
  const html = renderToStaticMarkup(
    createElement(PushConfirm, {
      open: true,
      onClose: () => {},
      onConfirm: () => {},
      busy: false,
      session,
      groupName: payload.group.name,
      eligible: 3,
      unmarked: 0,
      email: payload.ending.pushEmails[sessionKey] ?? null,
      scheduled: payload.ending.scheduled,
    }),
  );
  const points = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1]));
  return { title: textOf(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(html)?.[1] ?? ""), first: points[0] ?? null, points };
}

// ---------------------------------------------------------------------------
// The world's people, and a register read and pushed
// ---------------------------------------------------------------------------

const FACILITATOR = { [GROUP.b]: "rahul", [GROUP.a]: "amelia" };
const LEAD = "claudia";
const ADMIN = "zach";
const IN_GROUP = { [GROUP.b]: ["amara", "chloe", "farah"], [GROUP.a]: ["ana"] };
const address = (uid) => `${uid}@example.com`;
const read = (path) => world.db.read(path);
const key = (weekNumber) => `w0${weekNumber}`;

/** A message as its reader reads it: the real template, rendered to text. */
async function emailText(message) {
  return (await render(message.react, { plainText: true })).replace(/\s+/g, " ");
}

/** Every person in the group marked present, as the facilitator taps them in. */
async function markAll(groupId, weekNumber) {
  const marked = await call(FACILITATOR[groupId], register.POST, { groupId }, {
    body: { weekNumber, marks: IN_GROUP[groupId].map((uid) => ({ uid, status: "present" })) },
  });
  assert.equal(marked.status, 200, JSON.stringify(marked.body));
}

/**
 * The register's GET as the group's facilitator, the programme's lead and an
 * admin: the same answer about what each press emails, whoever reads it.
 * Answers the facilitator's payload.
 */
async function readAsEveryone(groupId) {
  const payloads = {};
  for (const who of [FACILITATOR[groupId], LEAD, ADMIN]) {
    const answer = await call(who, register.GET, { groupId });
    assert.equal(answer.status, 200, `${who}: ${JSON.stringify(answer.body).slice(0, 300)}`);
    payloads[who] = answer.body;
  }
  const own = payloads[FACILITATOR[groupId]];
  for (const who of [LEAD, ADMIN]) {
    assert.deepEqual(payloads[who].ending.pushEmails, own.ending.pushEmails, `${who} is told something else about what a press emails`);
    assert.deepEqual(registerEndingWords(payloads[who].ending), registerEndingWords(own.ending), `${who} reads another foot`);
  }
  return own;
}

/**
 * One press of one register, read together: the answer and the confirm before
 * it, the lead's press refused, then the press itself, the mail it handed to
 * the door, and the answer it gave. `by` is who presses: the facilitator, or
 * an admin.
 */
async function pressTogether(groupId, weekNumber, { by = FACILITATOR[groupId] } = {}) {
  const before = await readAsEveryone(groupId);
  const line = before.ending.pushEmails[key(weekNumber)];
  assert.ok(line, `the register's GET says nothing about what pressing week ${weekNumber}'s register emails`);
  const confirm = drawnConfirm(before, key(weekNumber));
  assert.equal(confirm.first, pushEmailSentence(before.group.name, line), "the confirm does not say the GET's answer");

  // The lead reads the register, and may not push it.
  const mailBefore = world.mail.length;
  const refused = await call(LEAD, push.POST, { groupId }, { body: { weekNumber, occurrence: 1 } });
  assert.equal(refused.status, 403, `the lead pushed a register: ${JSON.stringify(refused.body)}`);
  assert.equal(world.mail.length, mailBefore, "the lead's refused press emailed somebody");
  assert.ok(!read(registerPath(groupId, weekNumber))?.pushedAt, "the lead's refused press locked the register");

  const pressed = await call(by, push.POST, { groupId }, { body: { weekNumber, occurrence: 1 } });
  const sent = world.mail.slice(mailBefore);
  return { before, line, confirm, pressed, sent };
}

/** The number the confirm gave is the number the push sent, to the people it named. */
function assertCounted({ line, pressed, sent }, reached) {
  assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
  assert.equal(line.kind, "sends");
  assert.equal(pressed.body.sent, line.emails, "the push sent another number than the confirm gave");
  assert.equal(sent.length, line.emails, "the door was handed another number of emails than the confirm gave");
  assert.deepEqual(sent.map((message) => message.to).sort(), reached.map(address).sort(), "the email went to other people");
  assert.equal(pressed.body.reason, null);
}

/** Nobody emailed, and the push says why in its own words. */
function assertNobody({ pressed, sent }, reason) {
  assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
  assert.equal(pressed.body.sent, 0, "the push emailed somebody");
  assert.equal(sent.length, 0, "the door was handed an email");
  assert.equal(pressed.body.reason, reason);
}

beforeEach(() => {
  at(AT.week1Evening);
  reset(seedWorld());
});

// ===========================================================================
// 1. The ordinary week, and what a change to next week's session makes true
// ===========================================================================

describe("this week's register, while the push sends next week's email", () => {
  test("next week published: the group, counted, and the session it is about; the push sends exactly that", async () => {
    await markAll(GROUP.b, 1);
    const payload = await readAsEveryone(GROUP.b);
    assert.deepEqual(payload.ending.pushEmails, {
      w01: { kind: "sends", weekNumber: 2, day: "Tue 27 Oct", cancelled: false, emails: 3, people: 3 },
    });
    // The foot says the board's words for a press that emails the group.
    assert.deepEqual(drawnFoot(payload), {
      effect: "Locks the register, shows everyone their mark and emails Group B about next week.",
      notes: ["If nobody pushes, nobody gets next week’s email.", "After 60 hours Claudia and admins get a task."],
    });

    const pressedTogether = await pressTogether(GROUP.b, 1);
    assert.equal(pressedTogether.confirm.title, "Push week 1?");
    assert.equal(pressedTogether.confirm.first, "Everyone in Group B gets one email about week 2 on Tue 27 Oct: 3 people.");
    assertCounted(pressedTogether, ["amara", "chloe", "farah"]);
    const text = await emailText(pressedTogether.sent[0]);
    assert.match(text, /Your group meets Tue 27 Oct, 6pm to 8pm, Room C20\./);

    // Pushed: nothing left to press on the page, and the foot says so.
    const after = await readAsEveryone(GROUP.b);
    assert.deepEqual(after.ending.pushEmails, {});
    assert.deepEqual(drawnFoot(after), { effect: null, notes: ["This register is pushed. Everyone can see their mark."] });
  });

  test("an admin's press reaches the same people the confirm counted", async () => {
    await markAll(GROUP.b, 1);
    const pressed = await pressTogether(GROUP.b, 1, { by: ADMIN });
    assert.equal(pressed.confirm.first, "Everyone in Group B gets one email about week 2 on Tue 27 Oct: 3 people.");
    assertCounted(pressed, ["amara", "chloe", "farah"]);
  });

  test("an empty room: the push's own rule drops the sentence and sends, and the confirm counts that send", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, { "session.location": "" });
    await markAll(GROUP.b, 1);
    const pressed = await pressTogether(GROUP.b, 1);
    assert.equal(pressed.confirm.first, "Everyone in Group B gets one email about week 2 on Tue 27 Oct: 3 people.");
    assertCounted(pressed, ["amara", "chloe", "farah"]);
    assert.match(await emailText(pressed.sent[0]), /Your group meets Tue 27 Oct, 6pm to 8pm\./);
  });

  test("a group of one says one person", async () => {
    await markAll(GROUP.a, 1);
    const pressed = await pressTogether(GROUP.a, 1);
    assert.deepEqual(pressed.line, { kind: "sends", weekNumber: 2, day: "Mon 26 Oct", cancelled: false, emails: 1, people: 1 });
    assert.equal(pressed.confirm.first, "Everyone in Group A gets one email about week 2 on Mon 26 Oct: 1 person.");
    assertCounted(pressed, ["ana"]);
  });

  test("next week moved: the new day, and the email says the new day, time and room", async () => {
    at("2026-10-20T12:00:00Z");
    const moved = await call("rahul", change.POST, { groupId: GROUP.b }, {
      body: {
        week: 2,
        dateKey: "2026-10-27",
        kind: "move",
        move: { dateKey: "2026-10-28", time: "7pm", room: "Room D1" },
        reason: "The usual room is booked.",
        tell: false,
      },
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    at(AT.week1Evening);
    await markAll(GROUP.b, 1);
    const pressed = await pressTogether(GROUP.b, 1);
    assert.deepEqual(pressed.line, { kind: "sends", weekNumber: 2, day: "Wed 28 Oct", cancelled: false, emails: 3, people: 3 });
    assert.equal(pressed.confirm.first, "Everyone in Group B gets one email about week 2 on Wed 28 Oct: 3 people.");
    assertCounted(pressed, ["amara", "chloe", "farah"]);
    const text = await emailText(pressed.sent[0]);
    assert.match(text, /Your group meets Wed 28 Oct, 7pm to 9pm, Room D1\./);
  });

  test("next week held online: the same day, and the email says Online, never the link", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, { "session.meetingUrl": "https://meet.example.com/abc-defg-hij" });
    at("2026-10-20T12:00:00Z");
    const online = await call("rahul", change.POST, { groupId: GROUP.b }, {
      body: { week: 2, dateKey: "2026-10-27", kind: "online", reason: "Rahul and Sofia are both away.", tell: false },
    });
    assert.equal(online.status, 200, JSON.stringify(online.body));
    at(AT.week1Evening);
    await markAll(GROUP.b, 1);
    const pressed = await pressTogether(GROUP.b, 1);
    assert.equal(pressed.confirm.first, "Everyone in Group B gets one email about week 2 on Tue 27 Oct: 3 people.");
    assertCounted(pressed, ["amara", "chloe", "farah"]);
    assert.match(await emailText(pressed.sent[0]), /Your group meets Tue 27 Oct, 6pm to 8pm, Online\./);
    assert.ok(!JSON.stringify(pressed.sent).includes("meet.example.com"), "the link is in an email");
  });

  test("next week cancelled: not a session to remind them about, and the email tells them it is off", async () => {
    at("2026-10-20T12:00:00Z");
    const cancelled = await call("rahul", change.POST, { groupId: GROUP.b }, {
      body: { week: 2, dateKey: "2026-10-27", kind: "cancel", reason: "Rahul and Sofia are both away.", tell: false },
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    at(AT.week1Evening);
    await markAll(GROUP.b, 1);
    const payload = await readAsEveryone(GROUP.b);
    // The foot: the press still emails the group about next week.
    assert.equal(drawnFoot(payload).effect, "Locks the register, shows everyone their mark and emails Group B about next week.");
    const pressed = await pressTogether(GROUP.b, 1);
    assert.deepEqual(pressed.line, { kind: "sends", weekNumber: 2, day: "Tue 27 Oct", cancelled: true, emails: 3, people: 3 });
    assert.equal(pressed.confirm.first, "Everyone in Group B gets one email saying Tue 27 Oct’s session is cancelled: 3 people.");
    assertCounted(pressed, ["amara", "chloe", "farah"]);
    const text = await emailText(pressed.sent[0]);
    assert.match(text, /Tue 27 Oct is cancelled\. Rahul and Sofia are both away\./);
    assert.doesNotMatch(text, /Your group meets/);
  });
});

// ===========================================================================
// 2. Nobody emailed, and why, before and after the press
// ===========================================================================

describe("a press that emails nobody says so, and why, before it", () => {
  test("next week not published: nobody, before and after, in the foot, the confirm and the push's answer", async () => {
    at("2026-10-27T19:58:00Z");
    await markAll(GROUP.b, 2);
    const payload = await readAsEveryone(GROUP.b);
    assert.deepEqual(payload.ending.focus?.sessionKey, "w02");
    assert.deepEqual(payload.ending.pushEmails.w02, { kind: "held", why: "unpublished", weekNumber: 3 });
    assert.deepEqual(drawnFoot(payload), {
      effect: "Locks the register and shows everyone their mark. Week 3 isn’t published yet, so nobody’s emailed.",
      notes: ["After 60 hours Claudia and admins get a task."],
    });
    const pressed = await pressTogether(GROUP.b, 2);
    assert.equal(pressed.confirm.title, "Push week 2?");
    assert.equal(pressed.confirm.first, "Nobody is emailed: week 3 isn’t published yet, so the group won’t be sent a reminder.");
    // The push's answer: what happened, then who marks the week ready, to the facilitator who pressed (only
    // the programme's lead and admins can, so a facilitator is never told to).
    assertNobody(pressed, "Week 3 isn’t published yet, so nobody was emailed. Claudia marks it ready.");
    assert.ok(read(registerPath(GROUP.b, 2))?.pushedAt, "the register did not lock");
  });

  test("published once the page was read: the push sends, and the next read says so", async () => {
    at("2026-10-27T19:58:00Z");
    await markAll(GROUP.b, 2);
    assert.equal((await readAsEveryone(GROUP.b)).ending.pushEmails.w02.why, "unpublished");
    world.db.poke(`courseRuns/${RUN}/weeks/w03`, { published: true });
    const pressed = await pressTogether(GROUP.b, 2);
    assert.deepEqual(pressed.line, { kind: "sends", weekNumber: 3, day: "Tue 3 Nov", cancelled: false, emails: 3, people: 3 });
    assertCounted(pressed, ["amara", "chloe", "farah"]);
  });

  test("the group's last session: the words it always had, and nothing sent", async () => {
    at("2026-11-24T19:58:00Z");
    await markAll(GROUP.b, 6);
    const payload = await readAsEveryone(GROUP.b);
    assert.equal(payload.ending.focus?.sessionKey, "w06");
    assert.equal(payload.ending.hasNext, false);
    assert.deepEqual(payload.ending.pushEmails.w06, { kind: "last" });
    // Every earlier register still on the page says what its own press does.
    assert.deepEqual(payload.ending.pushEmails.w05, { kind: "held", why: "unpublished", weekNumber: 6 });
    assert.deepEqual(drawnFoot(payload), {
      effect: "Locks the register and shows everyone their mark. It’s the group’s last session, so nobody’s emailed.",
      notes: ["After 60 hours Claudia and admins get a task."],
    });
    const pressed = await pressTogether(GROUP.b, 6);
    assert.equal(
      pressed.confirm.first,
      "Nobody is emailed: this is the group’s last session, so there is nothing to remind them about.",
    );
    assertNobody(pressed, "That was the group's last session, so there's nothing to remind them about.");
  });

  test("a register whose own session was cancelled: the press is refused, and the confirm says nobody", async () => {
    at("2026-10-21T09:00:00Z");
    const cancelled = await call("rahul", change.POST, { groupId: GROUP.b }, {
      body: { week: 2, dateKey: "2026-10-27", kind: "cancel", reason: "Rahul and Sofia are both away.", tell: false },
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    at("2026-10-27T19:58:00Z");
    const payload = await readAsEveryone(GROUP.b);
    assert.deepEqual(payload.ending.pushEmails.w02, { kind: "not-held" });
    assert.equal(drawnConfirm(payload, "w02").first, "Nobody is emailed: this session didn’t happen, so its register needs nothing.");
    const before = world.mail.length;
    for (const who of ["rahul", ADMIN]) {
      const refused = await call(who, push.POST, { groupId: GROUP.b }, { body: { weekNumber: 2, occurrence: 1 } });
      assert.equal(refused.status, 409, JSON.stringify(refused.body));
    }
    assert.equal(world.mail.length, before, "a refused press emailed somebody");
  });

  test("the email has already gone: nobody again, and the push says the group has had it", async () => {
    world.db.seed(`courseNudges/gnudge__${RUN}__${GROUP.b}__2026-10-22`, {
      kind: "group-week-nudge",
      runId: RUN,
      groupId: GROUP.b,
      slotStartKey: "2026-10-22",
      sessionKey: "w02",
      weekNumber: 2,
      via: "schedule",
      sentAt: new Date("2026-10-20T09:00:00Z"),
    });
    await markAll(GROUP.b, 1);
    const pressed = await pressTogether(GROUP.b, 1);
    assert.deepEqual(pressed.line, { kind: "held", why: "claimed", weekNumber: 2 });
    assert.equal(pressed.confirm.first, "Nobody is emailed: Group B has already had its email about week 2.");
    assertNobody(pressed, "This group has already had the reminder for its next session.");
    assert.equal(
      drawnFoot(pressed.before).effect,
      "Locks the register and shows everyone their mark. Group B has already had its email about week 2, so nobody’s emailed.",
    );
  });

  test("nobody in the group can be emailed: nobody, and the push says so", async () => {
    for (const uid of ["amara", "chloe", "farah"]) {
      world.db.poke(`users/${uid}`, { "profile.notifications": { categories: { courses: false } } });
    }
    await markAll(GROUP.b, 1);
    const pressed = await pressTogether(GROUP.b, 1);
    assert.deepEqual(pressed.line, { kind: "held", why: "nobody", weekNumber: 2 });
    assert.equal(pressed.confirm.first, "Nobody is emailed: nobody in Group B is set up to receive email.");
    assertNobody(pressed, "Nobody in this group is set up to receive email, so none was sent.");
  });

  test("a run with no dates: nobody, and the push says so", async () => {
    world.db.poke(`courseRuns/${RUN}`, { startDate: "" });
    await markAll(GROUP.b, 1);
    const pressed = await pressTogether(GROUP.b, 1);
    assert.deepEqual(pressed.line, { kind: "held", why: "no-date", weekNumber: 2 });
    assert.equal(pressed.confirm.first, "Nobody is emailed: Group B has no dates set, so no reminder can be sent.");
    assertNobody(pressed, "This group has no dates set, so no reminder could be sent.");
  });
});

// ===========================================================================
// 3. How many: the people the email reaches, out of the people in the group
// ===========================================================================

describe("how many the confirm counts is how many the push emails", () => {
  test("a switched-off course row and a suppressed address leave the email short, and the confirm says so", async () => {
    world.db.poke("users/chloe", { "profile.notifications": { categories: { courses: false } } });
    world.db.seed("suppressedEmails/farah@example.com", { email: "farah@example.com" });
    await markAll(GROUP.b, 1);
    const pressed = await pressTogether(GROUP.b, 1);
    assert.deepEqual(pressed.line, { kind: "sends", weekNumber: 2, day: "Tue 27 Oct", cancelled: false, emails: 1, people: 3 });
    assert.equal(pressed.confirm.first, "1 of the 3 people in Group B gets one email about week 2 on Tue 27 Oct.");
    assertCounted(pressed, ["amara"]);
  });

  test("two of three, in the plural", async () => {
    world.db.poke("users/chloe", { "profile.notifications": { categories: { courses: false } } });
    await markAll(GROUP.b, 1);
    const pressed = await pressTogether(GROUP.b, 1);
    assert.equal(pressed.confirm.first, "2 of the 3 people in Group B get one email about week 2 on Tue 27 Oct.");
    assertCounted(pressed, ["amara", "farah"]);
  });

  test("somebody placed and not told yet is in nobody's count, whoever reads the register", async () => {
    // Nell is placed in Group B and on the run's list, and Publish has not told her.
    world.db.seed(`courseEnrolments/${RUN}__nell`, {
      ...read(`courseEnrolments/${RUN}__amara`),
      uid: "nell",
      allocatedEmailAt: null,
    });
    world.db.seed(`subscriptions/sub_nell__cohort-${RUN}`, {
      ...read(`subscriptions/sub_amara__cohort-${RUN}`),
      email: address("nell"),
      audienceId: "nell",
    });
    await markAll(GROUP.b, 1);
    // An admin's register lists her; the facilitator's does not. The answer is the same.
    const asAdmin = await call(ADMIN, register.GET, { groupId: GROUP.b });
    assert.ok(asAdmin.body.members.some((member) => member.uid === "nell"), "the admin's register does not list her");
    const pressed = await pressTogether(GROUP.b, 1);
    assert.ok(!pressed.before.members.some((member) => member.uid === "nell"), "the facilitator's register lists her");
    assert.equal(pressed.confirm.first, "Everyone in Group B gets one email about week 2 on Tue 27 Oct: 3 people.");
    assertCounted(pressed, ["amara", "chloe", "farah"]);
  });
});

// ===========================================================================
// 4. Every register on the page answers for its own press
// ===========================================================================

describe("each register's own button", () => {
  test("a register for an earlier week pushed late emails about the session after it, as its confirm says", async () => {
    // Week 2's evening: week 1's register was never pushed, and week 2's is
    // the one the foot is about.
    at("2026-10-27T19:58:00Z");
    await markAll(GROUP.b, 1);
    await markAll(GROUP.b, 2);
    const payload = await readAsEveryone(GROUP.b);
    assert.equal(payload.ending.focus?.sessionKey, "w02");
    assert.deepEqual(payload.ending.pushEmails, {
      w01: { kind: "sends", weekNumber: 2, day: "Tue 27 Oct", cancelled: false, emails: 3, people: 3 },
      w02: { kind: "held", why: "unpublished", weekNumber: 3 },
    });
    // The foot is about week 2; week 1's column has its own button and its own confirm.
    assert.equal(
      drawnFoot(payload).effect,
      "Locks the register and shows everyone their mark. Week 3 isn’t published yet, so nobody’s emailed.",
    );
    const pressed = await pressTogether(GROUP.b, 1);
    assert.equal(pressed.confirm.first, "Everyone in Group B gets one email about week 2 on Tue 27 Oct: 3 people.");
    assertCounted(pressed, ["amara", "chloe", "farah"]);
    // Week 2's email has gone with it, so week 1 is off the page and week 2's answer is unchanged.
    const after = await readAsEveryone(GROUP.b);
    assert.deepEqual(after.ending.pushEmails, { w02: { kind: "held", why: "unpublished", weekNumber: 3 } });
  });
});

// ===========================================================================
// 5. The finished ending is unchanged
// ===========================================================================

describe("while next week's email is on its schedule", () => {
  beforeEach(() => reset(seedWorld({ scheduled: true })));

  test("finishing emails nobody, and every place says so as it did", async () => {
    await markAll(GROUP.b, 1);
    const payload = await readAsEveryone(GROUP.b);
    assert.deepEqual(payload.ending.pushEmails, { w01: { kind: "scheduled" } });
    assert.equal(drawnFoot(payload).effect, "Locks it and shows everyone their mark. Nobody’s emailed.");
    const pressed = await pressTogether(GROUP.b, 1);
    assert.equal(pressed.confirm.title, "Finish the week 1 register?");
    assert.equal(
      pressed.confirm.first,
      "Nobody’s emailed. Next week’s email goes on its own schedule, whatever happens here.",
    );
    assertNobody(pressed, "Next week’s email goes on its schedule, so finishing the register emailed nobody.");
  });
});

// ===========================================================================
// 6. The words, every state
// ===========================================================================

describe("the confirm's line, for every answer the route can give", () => {
  const sends = (over) => ({ kind: "sends", weekNumber: 4, day: "Fri 30 Oct", cancelled: false, emails: 7, people: 7, ...over });
  const cases = [
    [{ kind: "scheduled" }, "Nobody’s emailed. Next week’s email goes on its own schedule, whatever happens here."],
    [{ kind: "not-held" }, "Nobody is emailed: this session didn’t happen, so its register needs nothing."],
    [{ kind: "last" }, "Nobody is emailed: this is the group’s last session, so there is nothing to remind them about."],
    [sends(), "Everyone in Group A gets one email about week 4 on Fri 30 Oct: 7 people."],
    [sends({ emails: 6 }), "6 of the 7 people in Group A get one email about week 4 on Fri 30 Oct."],
    [sends({ day: "" }), "Everyone in Group A gets one email about week 4: 7 people."],
    [sends({ cancelled: true }), "Everyone in Group A gets one email saying Fri 30 Oct’s session is cancelled: 7 people."],
    [sends({ cancelled: true, emails: 1 }), "1 of the 7 people in Group A gets one email saying Fri 30 Oct’s session is cancelled."],
    [{ kind: "held", why: "unpublished", weekNumber: 4 }, "Nobody is emailed: week 4 isn’t published yet, so the group won’t be sent a reminder."],
    [{ kind: "held", why: "claimed", weekNumber: 4 }, "Nobody is emailed: Group A has already had its email about week 4."],
    [{ kind: "held", why: "nobody", weekNumber: 4 }, "Nobody is emailed: nobody in Group A is set up to receive email."],
    [{ kind: "held", why: "no-date", weekNumber: 4 }, "Nobody is emailed: Group A has no dates set, so no reminder can be sent."],
    [{ kind: "held", why: "refused", weekNumber: 4 }, "Nobody is emailed: there are too many people in Group A for one email."],
  ];
  for (const [line, words] of cases) {
    test(`${line.kind}${line.why ? ` (${line.why})` : ""}${line.cancelled ? " (cancelled)" : ""}: ${words}`, () => {
      assert.equal(pushEmailSentence("Group A", line), words);
      assert.doesNotMatch(words, /[\u2013\u2014]/, "a dash in the words");
    });
  }

  test("a group with no name is this group", () => {
    assert.equal(pushEmailSentence("  ", sends()), "Everyone in this group gets one email about week 4 on Fri 30 Oct: 7 people.");
  });

  test("a payload with no answer for the register is worded as it always was, and the confirm guesses nothing", () => {
    const ending = {
      scheduled: false,
      groupName: "Group A",
      focus: { sessionKey: "w03", weekNumber: 3, occurrence: 1, line: "Fri 23 Oct · 6pm · Room E1", finished: false },
      hasNext: true,
      nextEmail: null,
      reminder: null,
      task: null,
    };
    assert.equal(registerEndingWords(ending).effect, "Locks the register, shows everyone their mark and emails Group A about next week.");
    const html = renderToStaticMarkup(
      createElement(PushConfirm, {
        open: true,
        onClose: () => {},
        onConfirm: () => {},
        busy: false,
        session: { weekNumber: 3, occurrence: 1, sessionKey: "w03", weekId: "w03", title: "", dateKey: "2026-10-23", held: true, notes: "", pushedAt: null },
        groupName: "Group A",
        eligible: 2,
        unmarked: 0,
        email: null,
        scheduled: false,
      }),
    );
    const points = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1]));
    assert.equal(points.length, 2, "the confirm said something about email with no answer to say it from");
    assert.ok(points.every((point) => !/email/i.test(point)), points.join(" | "));
  });
});

// ===========================================================================
// 7. The tree: one answer, asked everywhere it is said or acted on
// ===========================================================================

/** A file's code: comments gone, strings kept or emptied. */
function codeOf(file, keepStrings = false) {
  const source = readFileSync(file, "utf8");
  const code = stripSource(source, { keepStrings });
  assertReadable(source, code, inSrc(file), assert);
  return code;
}

/**
 * A sessions list indexed one past another: `sessions[index + 1]`. The shape
 * of the session after a register's, which is worked out in one place.
 */
const SESSION_AFTER_BY_HAND = /\b[A-Za-z_$]*[sS]essions\s*\[[^\]]*\+\s*1\s*\]/;

/** The one place the session after a register's is indexed, and why. */
const SESSION_AFTER = {
  "lib/courses/pushEmail.ts": "sessionAfter: the session a push of a register emails the group about",
};

/** Who asks the one answer, and why each must. Checked in both directions. */
const ASKS = {
  sessionAfter: {
    "lib/courses/pushEmail.ts": "declares it, and asks it for every register the page can press",
    "app/api/courses/groups/[groupId]/attendance/push/route.ts": "the push: the session its email is about",
    "lib/courses/registerEnding.ts": "the foot: whether the session it is about has one after it",
  },
  previewNextWeekEmails: {
    "lib/courses/nextWeekEmail.ts": "declares it",
    "lib/courses/pushEmail.ts": "the register's answer: the send's own decision, asked without sending",
  },
  readPushEmails: {
    "lib/courses/pushEmail.ts": "declares it",
    "lib/courses/registerEnding.ts": "the register's GET carries the answer for every register on the page",
  },
};

/** Every file under `src` that renders the push's confirm, with what it hands it. */
const CONFIRM_DRAWN_BY = {
  "features/courses/AttendanceGrid.tsx": "ending?.pushEmails?.[pushSession.sessionKey]",
};

describe("one answer, in the tree", () => {
  const files = [...walkSource(SRC)];

  test("the walk found the tree", () => {
    assert.ok(files.length > 500, `only ${files.length} files under src`);
  });

  test("the session after a register's is indexed in one place", () => {
    const indexing = files.filter((file) => SESSION_AFTER_BY_HAND.test(codeOf(file))).map(inSrc);
    assert.deepEqual(
      indexing.filter((file) => !(file in SESSION_AFTER)),
      [],
      "a file works out the session after a register's by itself. Ask `sessionAfter` " +
        "(src/lib/courses/pushEmail.ts): the next column of a register is not the next session, because the " +
        "columns are only the sessions that have started",
    );
    assert.deepEqual(Object.keys(SESSION_AFTER).filter((file) => !indexing.includes(file)), [], "a listed file no longer indexes it");
  });

  for (const [name, allowed] of Object.entries(ASKS)) {
    test(`exactly the listed files name ${name}`, () => {
      const pattern = new RegExp(`\\b${name}\\b`);
      const naming = files.filter((file) => pattern.test(codeOf(file))).map(inSrc);
      assert.deepEqual(naming.filter((file) => !(file in allowed)), [], `a file names ${name} and is not listed: say why`);
      assert.deepEqual(Object.keys(allowed).filter((file) => !naming.includes(file)), [], `a listed file no longer names ${name}`);
      for (const [file, why] of Object.entries(allowed)) assert.ok(why.length > 10, file);
    });
  }

  test("the send and the preview make one decision", () => {
    const scanned = scanModule(join(SRC, "lib", "courses", "nextWeekEmail.ts"));
    for (const name of ["sendNextWeekEmail", "previewNextWeekEmails"]) {
      const reach = reachOf(scanned, name).map((fn) => fn.name);
      assert.ok(reach.includes("prepareNextWeekEmail"), `${name} decides without prepareNextWeekEmail`);
    }
    const prepare = scanned.functions.get("prepareNextWeekEmail");
    assert.ok(prepare && !prepare.exported, "the decision is exported: a third caller could word it its own way");
    assert.doesNotMatch(prepare.body, /\.create\(|\.set\(|\.update\(|sendCourseWeekNudgeEmail/, "the decision writes or sends");
  });

  test("the push and the register's GET ask it with the group's whole schedule", () => {
    const route = codeOf(join(SRC, "app", "api", "courses", "groups", "[groupId]", "attendance", "push", "route.ts"));
    assert.match(route, /sessionAfter\(sessions, session\.sessionKey\)/);
    assert.match(route, /const sessions = resolveSessions\(run, group\);/);
    const ending = codeOf(join(SRC, "lib", "courses", "registerEnding.ts"));
    assert.match(ending, /sessionAfter\(sessions, session\.sessionKey\)/);
    assert.match(ending, /readPushEmails\(db, \{[\s\S]*?sessions,[\s\S]*?\}\)/);
    const getRoute = codeOf(join(SRC, "app", "api", "courses", "groups", "[groupId]", "attendance", "route.ts"));
    assert.match(getRoute, /const sessions = resolveSessions\(run, group\);[\s\S]*?readRegisterEnding\(db, \{[\s\S]*?sessions,/);
  });

  test("the confirm is drawn by the listed pages only, each handing it the route's answer", () => {
    const drawing = files.filter((file) => /<PushConfirm\b/.test(codeOf(file))).map(inSrc);
    assert.deepEqual(drawing.sort(), Object.keys(CONFIRM_DRAWN_BY).sort(), "a page draws the push's confirm and is not listed");
    for (const [file, answer] of Object.entries(CONFIRM_DRAWN_BY)) {
      const code = codeOf(join(SRC, file));
      assert.ok(code.includes(answer), `${file} does not take the confirm's answer from the route: ${answer}`);
      assert.match(code, /<PushConfirm[\s\S]*?email=\{pushEmail\}/, `${file} does not hand the confirm the answer`);
    }
    const confirm = codeOf(join(SRC, "features", "courses", "PushConfirm.tsx"));
    assert.match(confirm, /email: PushEmailLine \| null;/);
    assert.match(confirm, /pushEmailSentence\(groupName, email\)/);
    assert.doesNotMatch(confirm, /nextLabel|sessions\b/, "the confirm works out what the press emails by itself");
  });
});
