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
