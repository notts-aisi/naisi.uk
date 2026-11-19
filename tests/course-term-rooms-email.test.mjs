/**
 * THE ROOMS FOR THE REST OF TERM, IN ONE EMAIL PER GROUP, SENT ONLY BY HAND
 * from the term's rooms page.
 *
 *   POST /api/courses/groups/[groupId]/rooms-email
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE WORDS, character for character over rendered emails: the approved
 *     subject, opening line, one line a session still to come, the closing
 *     line and the button, for a week moved for that week only, a week with
 *     its own room, a room to be confirmed, a week held online, a session
 *     called off (left out) and a room holding a link (to be confirmed).
 *     Never a meeting address in any rendering.
 *  2. WHO: the group's told people with a session still to come in it and
 *     its facilitators, never the presser; not somebody placed and not yet
 *     told, not somebody who left, not somebody only visiting; somebody
 *     moving out from a later week gets the weeks before it, somebody moving
 *     in the weeks from it. No email for an incubator, a group with no name,
 *     or a group with no session still to come.
 *  3. THE PRESS: the count worked out again (a difference refuses it, nothing
 *     sent); a double press sends once; the limits per group and per
 *     presser, claimed before anything goes, the preview saying so first; a
 *     send that fails is reported and History says what went; a receipt per
 *     send, `kind: "notice"`.
 *  4. THE GATE: an admin and the programme's lead; a lead of another
 *     programme, the run's track lead, a facilitator, a member and somebody
 *     signed out refused; view-as refused first.
 *  5. THE PAGE: the term's rooms page shows each group's button and when it
 *     was last emailed and by whom, and saving the grid still emails nobody.
 *
 * Real: the route, the audience, the caps, the notice door, the templates,
 * the term's rooms page and its loader. Faked: the session, the Admin SDK
 * handle, the mail door, `next/link`, `next/navigation` and the stylesheets.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render } from "@react-email/render";
import { walkSource } from "./lib/functionScan.mjs";
import { A, AGI, B, C, NOW, ROUND, RUN, makeSessionsWorld, updatesSeed } from "./lib/sessionsWorld.mjs";
import { TAIS, formPath } from "./lib/leadWorld.mjs";

const ui = { h: createElement };
globalThis.__termRoomsEmailUi = ui;
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const STYLESHEETS = new Set();
for (const file of walkSource(SRC)) {
  for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) STYLESHEETS.add(specifier);
}

const w = await makeSessionsWorld("__termRoomsEmail", [
  [
    "next/navigation",
    "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
      "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }",
  ],
  [
    "next/link",
    "export default ({ href, className, children, ...rest }) =>\n" +
      "  globalThis.__termRoomsEmailUi.h('a', { href, className, 'aria-current': rest['aria-current'] }, children);",
  ],
  ["./session", "export async function getCurrentUser() { return globalThis.__termRoomsEmail.user; }"],
  ...[...STYLESHEETS].map((path) => [path, CLASS_NAMES]),
]);
const { world, loadTs, call } = w;

const route = await w.courseRoute("groups", "[groupId]", "rooms-email");
const words = await loadTs(join("lib", "courses", "termRoomsEmail", "words.ts"));
const model = await loadTs(join("lib", "courses", "termRoomsEmail", "model.ts"));
const limits = await loadTs(join("lib", "courses", "termRoomsEmail", "limits.ts"));
const { normalizeCourseGroup } = await loadTs(join("lib", "firestore", "courseGroups.ts"));
const { normalizeCourseRun } = await loadTs(join("lib", "firestore", "courses.ts"));
const FORM = join("app", "(app)", "admin", "admissions", "forms", "[roundId]");
const { default: TermRoomsPage } = await loadTs(join(FORM, "rooms", "term", "page.tsx"));

const read = (path) => world.db.read(path);
const DAY_MS = 24 * 60 * 60 * 1000;

/** The approved email, for Group C, with its sessions moved to Wednesdays at 3pm for two hours in Portland A21. */
const SUBJECT = "Where Group C meets for the rest of term";
const INTRO = "Here is where each of Group C’s sessions is:";
const LATEST = "The latest is always on your programme page.";
const BUTTON = "Open your programme page";
const PROGRAMME_URL = `https://naisi.invalid/learn/${encodeURIComponent(RUN.agi)}`;
const MARKER =
  "Sent as an important notice You are getting this because you are in this course group, so it reaches you whatever your notification settings say, and it is never marketing.";

/** Group C as the suite starts it: Wednesdays, 3pm to 5pm, Portland A21 on University Park, Tom facilitating, Tariq (who goes by Daniel) in it. */
function seed(over = {}) {
  const base = updatesSeed();
  base[`courseGroups/${C}`] = {
    ...base[`courseGroups/${C}`],
    campus: "university-park",
    session: { ...base[`courseGroups/${C}`].session, weekday: 3, startTimeLocal: "15:00", durationMinutes: 120, location: "Portland A21" },
  };
  base["users/tariq"] = { ...base["users/tariq"], profile: { ...(base["users/tariq"].profile ?? {}), preferredName: "Daniel" } };
  return { ...base, ...over };
}

beforeEach(() => {
  w.reset(seed());
  for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
});

const ask = (who, groupId, body, options = {}) => call(who, route.POST, { groupId }, { body, course: true, ...options });
const preview = (who, groupId = C) => ask(who, groupId, { preview: true });
let keys = 0;
const newKey = () => `press-key-${String((keys += 1)).padStart(4, "0")}`;
/** A press made the way the dialog makes one: the preview's count, and a key of the dialog's own. */
async function press(who, groupId = C, pressKey = newKey()) {
  const shown = await preview(who, groupId);
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  return ask(who, groupId, { emailCount: shown.body.preview.emails, pressKey });
}

/** Every email sent, as its reader sees it. */
async function mailRead() {
  return Promise.all(
    world.mail.map(async (message) => ({
      to: message.to,
      subject: message.subject,
      kind: message.kind,
      surface: message.surface,
      html: await render(message.react),
      text: (await render(message.react, { plainText: true })).replace(/\s+/g, " ").trim(),
    })),
  );
}

/**
 * The email as its reader reads it, from its heading (the subject, which the
 * plain-text rendering sets in capitals) to the button's link, as one line.
 */
function bodyOf(text) {
  const start = text.indexOf(SUBJECT.toUpperCase());
  const end = text.indexOf(PROGRAMME_URL);
  assert.ok(start >= 0 && end > start, text);
  return text.slice(start, end).trim();
}

const auditRows = (kind) =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseAudit/"))
    .map((path) => read(path))
    .filter((row) => row.kind === kind);

// ---------------------------------------------------------------------------
// 1. The words
// ---------------------------------------------------------------------------

describe("1. the words, character for character", () => {
  test("the approved email: subject, greeting, the notice line, a line a session still to come, the closing line and the button", async () => {
    world.db.poke(`courseGroups/${C}`, { sessionOverrides: { w05: { location: "" } } });
    const pressed = await press("claudia");
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    const mail = await mailRead();
    const daniel = mail.find((each) => each.to === "tariq@example.com");
    assert.ok(daniel, "Daniel is emailed");
    assert.equal(daniel.subject, SUBJECT);
    assert.equal(daniel.kind, "notice");
    assert.equal(daniel.surface, "course-group");
    assert.equal(
      bodyOf(daniel.text),
      [
        SUBJECT.toUpperCase(),
        "Hi Daniel,",
        MARKER,
        INTRO,
        "Week 4 · Wed 25 Nov, 3pm to 5pm · Portland A21 (University Park)",
        "Week 5 · Wed 2 Dec, 3pm to 5pm · room to be confirmed",
        "Week 6 · Wed 9 Dec, 3pm to 5pm · Portland A21 (University Park)",
        LATEST,
        `${BUTTON}`,
      ].join(" "),
    );
  });
});

describe("1. each kind of week, read through the one session resolver", () => {
  test("a week moved for that week only shows its new day and time; a week with its own room shows it; online says online; a session called off is left out", async () => {
    world.db.poke(`courseGroups/${C}`, {
      sessionOverrides: {
        w04: { weekday: 2, startTimeLocal: "17:00", location: "Portland A21" },
        w06: { location: "George Green B06" },
      },
      sessionChanges: { w04: { kind: "moved", reason: "Exams", dateKey: "2026-11-24", byUid: "claudia", at: null } },
      sessionModes: { w05: "virtual" },
    });
    const pressed = await press("claudia");
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    const [daniel] = (await mailRead()).filter((each) => each.to === "tariq@example.com");
    const body = bodyOf(daniel.text);
    assert.ok(body.includes("Week 4 · Tue 24 Nov, 5pm to 7pm · Portland A21 (University Park)"), body);
    assert.ok(body.includes("Week 5 · Wed 2 Dec, 3pm to 5pm · online"), body);
    assert.ok(body.includes("Week 6 · Wed 9 Dec, 3pm to 5pm · George Green B06 (University Park)"), body);

    world.mail.length = 0;
    w.at(new Date(NOW.getTime() + 2 * DAY_MS));
    world.db.poke(`courseGroups/${C}`, {
      sessionChanges: { w05: { kind: "cancelled", reason: "Away", dateKey: "2026-12-02", byUid: "claudia", at: null } },
      sessionModes: {},
    });
    const again = await press("zach");
    assert.equal(again.status, 200, JSON.stringify(again.body));
    const [later] = (await mailRead()).filter((each) => each.to === "tariq@example.com");
    const lines = bodyOf(later.text);
    assert.ok(!lines.includes("Week 5"), lines);
    assert.ok(lines.includes("Week 6 · Wed 9 Dec"), lines);
  });

  test("a room holding a link is room to be confirmed, and no rendering ever carries a meeting address", async () => {
    world.db.poke(`courseGroups/${C}`, {
      session: { ...read(`courseGroups/${C}`).session, meetingUrl: "https://meet.example/group-c-standing" },
      sessionOverrides: { w05: { location: "https://meet.example/typed-as-a-room", meetingUrl: "https://meet.example/w05" } },
    });
    const shown = await preview("claudia");
    assert.equal(shown.status, 200);
    assert.ok(!shown.body.preview.sample.html.includes("meet.example"));
    const pressed = await press("claudia");
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    const mail = await mailRead();
    assert.ok(mail.length > 0);
    for (const each of mail) {
      assert.ok(!each.html.includes("meet.example"), each.to);
      assert.ok(!each.text.includes("meet.example"), each.to);
    }
    const [daniel] = mail.filter((each) => each.to === "tariq@example.com");
    assert.ok(bodyOf(daniel.text).includes("Week 5 · Wed 2 Dec, 3pm to 5pm · room to be confirmed"));
  });

  test("a session that has started is no longer to come: at Wed 25 Nov 4pm the email starts at week 5", async () => {
    w.at(new Date("2026-11-25T16:00:00Z"));
    await press("claudia");
    const [daniel] = (await mailRead()).filter((each) => each.to === "tariq@example.com");
    const body = bodyOf(daniel.text);
    assert.ok(!body.includes("Week 4"), body);
    assert.ok(body.includes("Week 5 · Wed 2 Dec"), body);
  });

  test("the words are the approved words, from one place", () => {
    const W = words.TERM_ROOMS_EMAIL_WORDS;
    assert.equal(W.subject("Group C"), SUBJECT);
    assert.equal(W.intro("Group C"), INTRO);
    assert.equal(W.latest, LATEST);
    assert.equal(W.button, BUTTON);
    assert.equal(
      words.termRoomsLine({ weekNumber: 4, dateKey: "2026-11-25", hhmm: "15:00", minutes: 120, place: { kind: "room", room: "Portland A21", campus: "University Park" } }),
      "Week 4 · Wed 25 Nov, 3pm to 5pm · Portland A21 (University Park)",
    );
    assert.equal(
      words.termRoomsLine({ weekNumber: 5, dateKey: "2026-12-02", hhmm: "15:00", minutes: 120, place: { kind: "to-be-confirmed" } }),
      "Week 5 · Wed 2 Dec, 3pm to 5pm · room to be confirmed",
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Who
// ---------------------------------------------------------------------------

describe("2. who it goes to", () => {
  test("Group B: its told people and its facilitators, never somebody not yet told, who left or on the do-not-email list", async () => {
    const shown = await preview("zach", B);
    assert.equal(shown.status, 200);
    assert.equal(shown.body.preview.emails, 4);
    await press("zach", B);
    assert.deepEqual(world.mail.map((each) => each.to).sort(), ["amara@example.com", "ines@example.com", "rahul@example.com", "sofia@example.com"].sort());
    // One message per address.
    for (const each of world.mail) assert.equal(typeof each.to, "string");
  });

  test("never the presser: the lead who also facilitates the group is not emailed", async () => {
    world.db.poke(`courseGroups/${C}`, { facilitatorUids: ["tom", "claudia"] });
    await press("claudia");
    assert.deepEqual(world.mail.map((each) => each.to).sort(), ["tariq@example.com", "tom@example.com"]);
  });

  test("moving out from a later week: the weeks before it; moving in from a later week: the weeks from it", async () => {
    world.db.poke(`courseEnrolments/${RUN.agi}__tariq`, { groupId: A, groupsByWeek: [{ groupId: C, fromWeek: 1 }, { groupId: A, fromWeek: 6 }] });
    world.db.poke(`courseEnrolments/${RUN.agi}__bea`, { groupId: C, groupsByWeek: [{ groupId: A, fromWeek: 1 }, { groupId: C, fromWeek: 5 }] });
    const shown = await preview("claudia");
    assert.equal(shown.body.preview.emails, 3);
    assert.equal(shown.body.preview.fewer, 2);
    await press("claudia");
    const mail = await mailRead();
    const tariq = bodyOf(mail.find((each) => each.to === "tariq@example.com").text);
    assert.ok(tariq.includes("Week 4") && tariq.includes("Week 5") && !tariq.includes("Week 6"), tariq);
    const bea = bodyOf(mail.find((each) => each.to === "bea@example.com").text);
    assert.ok(!bea.includes("Week 4") && bea.includes("Week 5") && bea.includes("Week 6"), bea);
    const tom = bodyOf(mail.find((each) => each.to === "tom@example.com").text);
    assert.ok(tom.includes("Week 4") && tom.includes("Week 5") && tom.includes("Week 6"), tom);
  });

  test("somebody in the group only for weeks that have passed gets nothing", async () => {
    world.db.poke(`courseEnrolments/${RUN.agi}__tariq`, { groupId: A, groupsByWeek: [{ groupId: C, fromWeek: 1 }, { groupId: A, fromWeek: 4 }] });
    await press("claudia");
    assert.deepEqual(world.mail.map((each) => each.to), ["tom@example.com"]);
  });

  test("a one-week visitor to the group is not in it; a member visiting another group that week keeps the line", async () => {
    world.db.poke(`courseEnrolments/${RUN.agi}__bea`, { visits: [{ weekNumber: 5, groupId: C, arrangedByUid: "claudia", arrangedAt: NOW }] });
    world.db.poke(`courseEnrolments/${RUN.agi}__tariq`, { visits: [{ weekNumber: 5, groupId: A, arrangedByUid: "claudia", arrangedAt: NOW }] });
    await press("claudia");
    const mail = await mailRead();
    assert.deepEqual(mail.map((each) => each.to).sort(), ["tariq@example.com", "tom@example.com"]);
    assert.ok(bodyOf(mail.find((each) => each.to === "tariq@example.com").text).includes("Week 5 · Wed 2 Dec"));
  });

  test("no email for an incubator, a group with no name, or a group with no session still to come: the preview says why, the press is refused", async () => {
    const cases = [
      [
        "an incubator",
        () => {
          const form = read(formPath);
          form.programmes[AGI].kind = "incubator";
          world.db.seed(formPath, form);
        },
        words.NO_EMAIL.incubator,
      ],
      ["a group with no name", () => world.db.poke(`courseGroups/${C}`, { name: "  " }), words.NO_EMAIL.unnamed],
      ["no session still to come", () => w.at(new Date("2026-12-09T16:00:00Z")), words.NO_EMAIL.noSessions],
    ];
    for (const [what, make, sentence] of cases) {
      w.reset(seed());
      world.db.poke("users/claudia", { admissionsReviewer: true });
      make();
      const shown = await preview("claudia");
      assert.equal(shown.status, 200, what);
      assert.equal(shown.body.preview.emails, 0, what);
      assert.equal(shown.body.preview.none, sentence, what);
      assert.equal(shown.body.preview.sample, null, what);
      const pressed = await ask("claudia", C, { emailCount: 2, pressKey: newKey() });
      assert.equal(pressed.status, 409, what);
      assert.equal(pressed.body.error, sentence, what);
      assert.equal(world.mail.length, 0, what);
      assert.equal(auditRows("rooms-emailed").length, 0, what);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The press
// ---------------------------------------------------------------------------

describe("3. the press", () => {
  test("the count is worked out again at the press: a difference refuses it, sends nothing and writes nothing", async () => {
    const before = w.everything();
    const pressed = await ask("claudia", C, { emailCount: 3, pressKey: newKey() });
    assert.equal(pressed.status, 409);
    assert.equal(pressed.body.emails, 2);
    assert.equal(pressed.body.error, words.countChangedWords(2));
    assert.equal(world.mail.length, 0);
    assert.equal(w.everything(), before);
  });

  test("a press sends once, writes one History row and the group's record, and a second press of the same dialog sends nothing", async () => {
    const key = newKey();
    const first = await press("claudia", C, key);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.deepEqual(first.body.emailed, { planned: 2, sent: 2, held: 0, suppressed: 0, failed: 0 });
    assert.equal(first.body.said, "Emailed 2 people.");
    assert.equal(world.mail.length, 2);
    const [row] = auditRows("rooms-emailed");
    assert.equal(row.groupId, C);
    assert.equal(row.actorUid, "claudia");
    assert.equal(row.emailed, 2);
    assert.equal(row.detail, "Emailed Group C where each of its 3 sessions still to come is, to 2 people.");
    const record = read(`courseNudges/termrooms__${C}`);
    assert.equal(record.kind, "term-rooms-emailed");
    assert.equal(record.runId, RUN.agi);
    assert.equal(record.pressKey, key);
    assert.equal(record.sent, 2);
    assert.equal(JSON.stringify(record).includes("claudia"), false, "the record names nobody");

    const second = await ask("claudia", C, { emailCount: 2, pressKey: key });
    assert.equal(second.status, 200);
    assert.equal(second.body.already, true);
    assert.equal(second.body.said, words.ALREADY_SENT);
    assert.equal(world.mail.length, 2);
    assert.equal(auditRows("rooms-emailed").length, 1);
  });

  test("two presses of one dialog at once send once", async () => {
    const key = newKey();
    const [a, b] = await Promise.all([ask("claudia", C, { emailCount: 2, pressKey: key }), ask("claudia", C, { emailCount: 2, pressKey: key })]);
    assert.deepEqual([a.status, b.status], [200, 200]);
    assert.equal([a.body.already, b.body.already].filter(Boolean).length, 1);
    assert.equal(world.mail.length, 2);
  });

  test("the limit per group: three a day, the preview says so first, the fourth press is refused with nothing written, and a day later there is room", async () => {
    for (let i = 0; i < limits.TERM_ROOMS_LIMITS.perGroupDay; i += 1) assert.equal((await press(i === 1 ? "zach" : "claudia")).status, 200);
    world.mail.length = 0;
    const sentence = limits.TERM_ROOMS_LIMIT_WORDS.groupDay("Group C", 3);
    assert.equal(sentence, "Group C has been emailed its rooms 3 times in the last day, so nobody was emailed: try again tomorrow.");
    const shown = await preview("zach");
    assert.equal(shown.body.preview.limit, sentence);
    const before = w.everything();
    const refused = await ask("zach", C, { emailCount: 2, pressKey: newKey() });
    assert.equal(refused.status, 429);
    assert.equal(refused.body.error, sentence);
    assert.equal(world.mail.length, 0);
    assert.equal(w.everything(), before);
    w.at(new Date(NOW.getTime() + DAY_MS + 60_000));
    assert.equal((await preview("zach")).body.preview.limit, null);
    assert.equal((await press("zach")).status, 200);
  });

  test("the limit per presser: sixty a day across every group", async () => {
    const key = "termroomsby__claudia";
    world.db.seed(`courseNudges/emailrate__${key}`, { kind: "staff-email-throttle", key, windowStartAt: new Date(Date.now() - 60_000), count: 60, updatedAt: new Date() });
    const sentence = limits.TERM_ROOMS_LIMIT_WORDS.presserDay(60);
    assert.equal(sentence, "You’ve emailed groups their rooms 60 times in the last day, so nobody was emailed: try again tomorrow.");
    assert.equal((await preview("claudia")).body.preview.limit, sentence);
    const refused = await ask("claudia", C, { emailCount: 2, pressKey: newKey() });
    assert.equal(refused.status, 429);
    assert.equal(refused.body.error, sentence);
    assert.equal(world.mail.length, 0);
    assert.equal(auditRows("rooms-emailed").length, 0);
    assert.equal(read(`courseNudges/termrooms__${C}`), undefined);
    // Another presser has room.
    assert.equal((await press("zach")).status, 200);
  });

  test("a send that fails is reported, never retried, and History says what went", async () => {
    world.mailFate = (args) => (args.to === "tom@example.com" ? "fail" : "sent");
    const pressed = await press("claudia");
    assert.equal(pressed.status, 200);
    assert.deepEqual(pressed.body.emailed, { planned: 2, sent: 1, held: 0, suppressed: 0, failed: 1 });
    assert.equal(pressed.body.said, words.sentWords({ sent: 1, held: 0, suppressed: 0, failed: 1 }));
    assert.match(pressed.body.said, /^Emailed 1 person\. 1 email didn’t go\. Nothing is sent again by itself/);
    assert.equal(world.mail.length, 1);
    const [row] = auditRows("rooms-emailed");
    assert.equal(row.emailed, 1);
    assert.equal(row.detail, "Emailed Group C where each of its 3 sessions still to come is, to 1 person.");
    assert.equal(read(`courseNudges/termrooms__${C}`).sent, 1);
  });

  test("a body that is neither a preview nor a press is refused before anything is read", async () => {
    for (const body of [{}, { emailCount: 2 }, { pressKey: "press-key-0001" }, { emailCount: 0, pressKey: "press-key-0001" }, { emailCount: 2, pressKey: "x" }, { emailCount: 2, pressKey: "../../x/y/z" }]) {
      const answer = await ask("claudia", C, body);
      assert.equal(answer.status, 400, JSON.stringify(body));
      assert.equal(answer.body.error, words.REFUSAL.body);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. The gate
// ---------------------------------------------------------------------------

describe("4. who may press: an admin and the programme's lead, never in a view-as session", () => {
  const WHO = [
    ["zach", "an admin", 200],
    ["claudia", "the lead of the programme that names the run", 200],
    ["tess", "the lead of another programme", 403],
    ["lloyd", "the programme's reviewer", 403],
    ["yusuf", "the run's track lead", 403],
    ["tom", "a facilitator of the group", 403],
    ["sofia", "a facilitator of another group", 403],
    ["tariq", "a member of the group", 403],
    ["nobody", "a member who is on nothing", 403],
    [null, "somebody signed out", 401],
  ];
  for (const [who, name, status] of WHO) {
    test(`${name}: ${status}, for a preview and for a press`, async () => {
      const shown = await preview(who);
      assert.equal(shown.status, status, JSON.stringify(shown.body));
      if (status === 200) assert.deepEqual(Object.keys(shown.body).sort(), ["ok", "preview"]);
      const before = w.everything();
      const pressed = await ask(who, C, { emailCount: 2, pressKey: newKey() });
      assert.equal(pressed.status, status, JSON.stringify(pressed.body));
      if (status === 200) assert.deepEqual(Object.keys(pressed.body).sort(), ["already", "emailed", "ok", "said"]);
      else {
        assert.equal(world.mail.length, 0);
        assert.equal(w.everything(), before);
      }
    });
  }

  test("a missing group and an archived one say nothing to anybody but an admin", async () => {
    assert.equal((await preview("claudia", "agi-strategy-autumn-2026__grp99999")).status, 403);
    assert.equal((await preview("zach", "agi-strategy-autumn-2026__grp99999")).status, 404);
    world.db.poke(`courseGroups/${C}`, { archived: true });
    assert.equal((await preview("claudia")).status, 403);
    assert.equal((await preview("zach")).status, 400);
  });

  test("a view-as session is refused first, for a preview and a press, with nothing sent or written", async () => {
    const before = w.everything();
    for (const body of [{ preview: true }, { emailCount: 2, pressKey: newKey() }]) {
      const answer = await ask("zach", C, body, { viewAs: true });
      assert.equal(answer.status, 403);
    }
    assert.equal(world.mail.length, 0);
    assert.equal(w.everything(), before);
  });

  test("the route asks the view-as guard before anything else, and nothing but this route sends the email", () => {
    const source = readFileSync(join(SRC, "app", "api", "courses", "groups", "[groupId]", "rooms-email", "route.ts"), "utf8");
    const body = source.slice(source.indexOf("export async function POST"));
    assert.ok(body.indexOf("assertNotImpersonating()") < body.indexOf("getCurrentUser()"));
    const callers = [...walkSource(SRC)].filter((file) => /\bpressTermRoomsEmail\s*\(/.test(readFileSync(file, "utf8")));
    assert.deepEqual(
      callers.map((file) => file.slice(SRC.length + 1)).sort(),
      [join("app", "api", "courses", "groups", "[groupId]", "rooms-email", "route.ts"), join("lib", "courses", "termRoomsEmail", "send.ts")].sort(),
    );
  });
});
