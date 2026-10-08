/**
 * No placement email carries an unfilled token, and every other email that
 * fills `{tokens}` is held to what it is known to do with one it has no value
 * for.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * An email template is copy with `{tokens}` in it, and a token with no value
 * can reach a person as the characters an admin typed. Publishing an
 * allocation emails each placed person their group, its facilitators and its
 * first session, from data a group formed in a hurry may not have yet. Five
 * things have to hold:
 *
 *  1. THE PLACEMENT EMAIL IS WRITTEN WHOLE OR NOT AT ALL. Its composer
 *     (`src/lib/courses/placementEmail.ts`) is run over the seed copy and over
 *     wording an admin could save, for every combination of values a group
 *     can lack: what it returns for a send never has a token in it, and what
 *     it cannot write it refuses, with the reason.
 *  2. EACH TOKEN HAS ITS RULE. The group's name and its first session are
 *     what the email is for: without one, publishing is refused. The
 *     facilitators and the room can be missing: their paragraph is left out.
 *     A value is text, whoever typed it. AND A MEETING LINK IS NEVER IN IT:
 *     an online group is told it is online and where its people find the
 *     link, because an email can be forwarded. Nor is a link that somebody
 *     typed into the group's room: a room with anything in it that a reader
 *     could follow is not printed, and its people are told where to find
 *     it. The composer is run over every arrangement of wording this file
 *     generates, and the handler against stored groups, for a link in its
 *     own field and for one typed into the room, and none of it is in what
 *     comes back.
 *  3. THE ROUTE REFUSES BEFORE IT DOES ANYTHING. The real handler is run
 *     against a stored run: a refusal stamps nothing and emails nobody, the
 *     sentence says what to set, and what does go out names the room, or
 *     says the group is online, and carries no token.
 *  4. AN ADMIN PROOFING THE WORDING SEES WHAT A PLACED PERSON WOULD, and the
 *     designer offers exactly the tokens the composer fills.
 *  5. THE CLASS. Every function in the tree that fills tokens is found and
 *     registered, both directions. A path that sends to people is run here on
 *     its own seed copy with every optional value absent, and the tokens it
 *     then leaves are compared with what is written beside it: none, for the
 *     placement email and the paths that already leave a sentence out; and,
 *     for the paths that follow the older convention of sending a token as
 *     typed so that the admin who wrote it notices, exactly the list recorded
 *     here. That list is measured on every run, so it cannot grow unseen.
 *
 * ## What it cannot see
 *
 * Wording an admin has saved on a live site: only the placement email is
 * proved against any wording at all. And a route that fills tokens in copy
 * its own admin wrote and sent (the member-application emails, a newsletter)
 * is registered with its reason, not run.
 *
 * Stubbed: `server-only`, `next/server`, the Admin SDK handle (a small store
 * of documents by path), the session, the view-as guard, the standing check,
 * the subscription and push doors, the suppression list and the mail door
 * (it records what it is handed).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import { calls, scanModule, walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const inSrc = (file) => relative(SRC, file).split(sep).join("/");

const world = { db: null, user: null, sent: [], subscribed: [], pushed: [], refuseMail: null };
globalThis.__placement = world;

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "next/server",
      "export class NextResponse {\n" +
        "  constructor(body, init) { this.body = body; this.status = (init && init.status) || 200; }\n" +
        "  static json(body, init) { return new NextResponse(body, init); }\n" +
        "}",
    ],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__placement.db; }"],
    ["@/lib/firebase/session", "export async function getCurrentUser() { return globalThis.__placement.user; }"],
    ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() { return null; }"],
    ["@/lib/firebase/eligibility", "export function isNamedWithStanding() { return false; }"],
    ["@/lib/firestore/suppression", "export async function isSuppressed() { return false; }"],
    [
      "@/lib/firestore/subscriptions",
      "export async function subscribe(db, args) { globalThis.__placement.subscribed.push(args.audienceId); return {}; }",
    ],
    [
      "@/lib/push/courseNotifications",
      "export async function mirrorCourseDecisionToPush(uid) { globalThis.__placement.pushed.push(uid); }",
    ],
    [
      "./send",
      "export async function sendEmail(args) {\n" +
        "  const w = globalThis.__placement;\n" +
        "  if (w.refuseMail && w.refuseMail(args)) throw new Error('the mail door refused');\n" +
        "  w.sent.push(args);\n" +
        "}",
    ],
  ]),
});

const placement = await loadTs(join("lib", "courses", "placementEmail.ts"));
const links = await loadTs(join("lib", "courses", "followable.ts"));
const seeds = await loadTs(join("lib", "firestore", "courseEmails.ts"));
const samples = await loadTs(join("features", "admin", "emailDesigns", "courseEmailSamples.ts"));
const courseMail = await loadTs(join("lib", "email", "courseApplicationEmails.ts"));
const enrolmentMail = await loadTs(join("lib", "email", "courseEnrolmentEmails.ts"));
const admissionMail = await loadTs(join("lib", "email", "admissionEmails.ts"));
const nudgeMail = await loadTs(join("lib", "email", "courseNudgeEmail.ts"));
const publish = await loadTs(join("app", "api", "courses", "runs", "[runId]", "allocation", "publish", "route.ts"));

const SEED = seeds.courseTemplateDefaults["course-allocated"];
const TOKEN = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;
/** The names of the `{tokens}` in a text. */
const tokensIn = (text) => [...new Set([...text.matchAll(TOKEN)].map((match) => match[1]))];

/** Every piece of text an email's blocks print. */
const printed = (blocks) =>
  blocks
    .map((block) =>
      block.type === "heading"
        ? block.text
        : block.type === "richText"
          ? block.html
          : `${block.alt ?? ""}\n${block.caption ?? ""}`,
    )
    .join("\n");
const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
/** A composed email as one reader would read it: the subject, then the words. */
const read = (email) => `${email.subject} | ${textOf(printed(email.blocks))}`;

/**
 * A way into a call, typed into a group's ROOM in the shapes people type
 * one. None of it may reach an email. Each holds the same three parts, which
 * is what the tests look for in what was written.
 */
const ROOMS_WITH_A_LINK = [
  "https://meet.example/j/8675309?pwd=opensesame",
  "Teams: https://meet.example/j/8675309?pwd=opensesame",
  "Hallward B12 or meet.example/j/8675309?pwd=opensesame",
  "www.meet.example/j/8675309 (pwd opensesame)",
  "msteams://meet.example/j/8675309?pwd=opensesame",
  "HTTPS://MEET.EXAMPLE/J/8675309?PWD=OPENSESAME",
  "Hallward B12 (or join: meet.example, id 8675309, opensesame)",
];
/** What to look for, in lower case: the host, the meeting's id and its password. */
const WAY_IN = ["meet.example", "8675309", "opensesame"];
/** What an email says in the stead of a room it will not print. */
const ON_THE_PAGE = "You'll find where it meets on your programme's page in the learning space.";

// ---------------------------------------------------------------------------
// The composer
// ---------------------------------------------------------------------------

const FACTS = {
  name: "Amara Okafor",
  courseTitle: "AI Safety Fundamentals",
  runLabel: "Autumn 2026",
  startDate: "Monday 26 October",
  groupName: "Group A",
  facilitatorNames: "Priya and Sam",
  firstSessionWhen: "Tuesday 27 October, 18:00",
  firstSessionWhere: { kind: "room", room: "Hallward B12" },
};
const OPTIONAL = ["facilitatorNames", "firstSessionWhere", "startDate"];
const ESSENTIAL = ["groupName", "firstSessionWhen"];

/** Every subset of a list. */
function subsets(list) {
  return list.reduce((all, item) => [...all, ...all.map((subset) => [...subset, item])], [[]]);
}
const without = (facts, absent) => Object.fromEntries(Object.entries(facts).map(([key, value]) => [key, absent.includes(key) ? null : value]));

const heading = (text) => ({ id: `h-${text.length}`, type: "heading", text, level: 2 });
const rich = (html) => ({ id: `r-${html.length}`, type: "richText", html });

const FULL =
  "Your AI Safety Fundamentals group: first session Tuesday 27 October, 18:00 | You've been placed, Amara " +
  "You're in Group A for AI Safety Fundamentals (Autumn 2026). Your group is facilitated by Priya and Sam. " +
  "Your first session is Tuesday 27 October, 18:00 . Where: Hallward B12 " +
  "Everything you need is in the learning space on the website: the week's reading, your group's details and your progress. " +
  "Do the first week's reading before you come; the sessions work best when everyone arrives with opinions.";

describe("each token has its rule", () => {
  test("the list is the email's whole token set, and the seed copy uses nothing outside it", () => {
    assert.deepEqual(placement.PLACEMENT_TOKEN_RULES, {
      firstName: "always",
      preferredName: "always",
      courseTitle: "always",
      runLabel: "always",
      groupName: "essential",
      firstSessionWhen: "essential",
      startDate: "optional",
      facilitatorNames: "optional",
      firstSessionWhere: "optional",
    });
    const used = tokensIn(`${SEED.subject}\n${printed(SEED.blocks)}`);
    assert.deepEqual(used.filter((token) => !(token in placement.PLACEMENT_TOKEN_RULES)), []);
    for (const token of [...ESSENTIAL, "facilitatorNames", "firstSessionWhere"]) {
      assert.ok(used.includes(token), `the seed copy no longer says {${token}}`);
    }
  });

  test("with everything known, the seed copy reads in full", () => {
    const email = placement.composePlacementEmail(SEED, FACTS);
    assert.equal(email.ok, true);
    assert.equal(read(email), FULL);
  });

  test("a group with no facilitator yet: that paragraph is left out, and nothing else", () => {
    const email = placement.composePlacementEmail(SEED, without(FACTS, ["facilitatorNames"]));
    assert.equal(email.ok, true);
    assert.equal(read(email), FULL.replace(" Your group is facilitated by Priya and Sam.", ""));
  });

  test("a group with no room or link: the line about where is left out, and nothing else", () => {
    const email = placement.composePlacementEmail(SEED, without(FACTS, ["firstSessionWhere"]));
    assert.equal(email.ok, true);
    assert.equal(read(email), FULL.replace(" Where: Hallward B12", ""));
  });

  test("a group with no first session cannot be told when it meets: the email is refused", () => {
    const email = placement.composePlacementEmail(SEED, without(FACTS, ["firstSessionWhen"]));
    assert.deepEqual(email, { ok: false, problems: [{ kind: "no-first-session" }] });
  });

  test("a group with no name cannot be told which group it is: the email is refused", () => {
    const email = placement.composePlacementEmail(SEED, without(FACTS, ["groupName"]));
    assert.deepEqual(email, { ok: false, problems: [{ kind: "no-group-name" }] });
    assert.equal(placement.composePlacementEmail(SEED, { ...FACTS, groupName: "   " }).ok, false);
  });

  test("an online group is told it is online, and where its people find the link to join", () => {
    const email = placement.composePlacementEmail(SEED, { ...FACTS, firstSessionWhere: { kind: "online", linkOnPage: true } });
    assert.equal(email.ok, true);
    assert.equal(
      read(email),
      FULL.replace("Where: Hallward B12", "Where: Online. The link to join is on your programme's page in the learning space."),
    );
  });

  test("an online group with no link yet is told it is online, and is promised no link", () => {
    const email = placement.composePlacementEmail(SEED, { ...FACTS, firstSessionWhere: { kind: "online", linkOnPage: false } });
    assert.equal(email.ok, true);
    assert.equal(read(email), FULL.replace("Where: Hallward B12", "Where: Online"));
  });
});

describe("the placement email is written whole or not at all", () => {
  /** What every answer must be: finished with no token in it, or refused with a reason. */
  function wholeOrNot(template, facts, label) {
    const email = placement.composePlacementEmail(template, facts);
    if (email.ok) {
      assert.deepEqual(tokensIn(`${email.subject}\n${printed(email.blocks)}`), [], `${label}: a token was returned`);
      assert.ok(email.subject.length > 0, `${label}: no subject`);
    } else {
      assert.ok(email.problems.length > 0, `${label}: refused with no reason`);
      assert.equal("subject" in email, false, `${label}: a refusal carries an email`);
    }
    return email;
  }

  test("the seed copy, for every combination of values a group can lack", () => {
    let written = 0;
    for (const absent of subsets([...OPTIONAL, ...ESSENTIAL])) {
      const email = wholeOrNot(SEED, without(FACTS, absent), absent.join("+") || "nothing absent");
      const refused = absent.some((token) => ESSENTIAL.includes(token));
      assert.equal(email.ok, !refused, `absent: ${absent.join(", ")}`);
      if (email.ok) written += 1;
    }
    assert.equal(written, 8, "every combination of the three optional values is an email");
  });

  /** Wording an admin could save: every token, known or not, in every place it can sit. */
  const PIECES = [
    "{firstName}",
    "{preferredName}",
    "{courseTitle}",
    "{runLabel}",
    "{groupName}",
    "{firstSessionWhen}",
    "{startDate}",
    "{facilitatorNames}",
    "{firstSessionWhere}",
    "{facilitatorName}",
    "{sessionWhen}",
    "plain words",
    "<strong>{groupName}</strong> with {facilitatorNames}",
    '<a href="{firstSessionWhere}">here</a>',
  ];

  test("wording an admin could save, in every place a token can sit, for every combination", () => {
    // A small generator with a fixed seed, so a failure is the same failure every run.
    let state = 20261023;
    const next = (n) => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state % n;
    };
    const pick = () => PIECES[next(PIECES.length)];
    let cases = 0;
    const seen = { ok: 0, refused: 0 };
    for (let i = 0; i < 400; i += 1) {
      const template = {
        subject: `About ${pick()} and ${next(2) ? pick() : "your group"}`,
        blocks: [
          heading(`Hello ${pick()}`),
          rich(`<p>${pick()} then ${pick()}.</p><p>${pick()}</p><ul><li>${pick()}</li></ul>`),
          { id: "i", type: "image", url: "https://example.com/a.png", alt: `Picture of ${pick()}`, caption: next(2) ? pick() : undefined },
          { id: "d", type: "divider" },
          rich(`<p>Ends with ${pick()}</p>`),
        ],
      };
      for (const absent of subsets([...OPTIONAL, ...ESSENTIAL])) {
        const email = wholeOrNot(template, without(FACTS, absent), `case ${i}, absent ${absent.join("+")}`);
        seen[email.ok ? "ok" : "refused"] += 1;
        cases += 1;
      }
    }
    assert.equal(cases, 400 * 32);
    // Both answers are really reached, so neither branch of the check above is idle.
    assert.ok(seen.ok > 200 && seen.refused > 200, JSON.stringify(seen));
  });

  test("no arrangement of wording carries a way into the group's call, wherever it was typed and whatever the week is set to", () => {
    // The same generator, the same four hundred arrangements. Each is written
    // for a group whose stored session has a link, in its own field or typed
    // into the room, in every way a week can be set, through the function
    // that reads that session for the email.
    const LINK = "https://meet.example/j/8675309?pwd=opensesame";
    const stored = [
      { location: "", meetingUrl: LINK },
      { location: "Hallward B12", meetingUrl: LINK },
      ...ROOMS_WITH_A_LINK.map((location) => ({ location, meetingUrl: null })),
      { location: ROOMS_WITH_A_LINK[0], meetingUrl: LINK },
    ];
    let state = 20261023;
    const next = (n) => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state % n;
    };
    const pick = () => PIECES[next(PIECES.length)];
    let written = 0;
    const kinds = { online: 0, "on-page": 0, room: 0 };
    for (let i = 0; i < 400; i += 1) {
      const template = {
        subject: `About ${pick()} and ${next(2) ? pick() : "your group"}`,
        blocks: [
          heading(`Hello ${pick()}`),
          rich(`<p>${pick()} then ${pick()}.</p><p>${pick()}</p><ul><li>${pick()}</li></ul>`),
          { id: "i", type: "image", url: "https://example.com/a.png", alt: `Picture of ${pick()}`, caption: next(2) ? pick() : undefined },
          rich(`<p>Ends with ${pick()}</p><p>Where: {firstSessionWhere}</p>`),
        ],
      };
      for (const session of stored) {
        for (const mode of [null, "virtual", "in-person"]) {
          const where = placement.placementWhere(session, mode);
          if (where) kinds[where.kind] += 1;
          for (const proof of [false, true]) {
            const email = placement.composePlacementEmail(template, { ...FACTS, firstSessionWhere: where }, { proof });
            if (!email.ok) continue;
            written += 1;
            const all = `${email.subject}\n${printed(email.blocks)}`.toLowerCase();
            for (const part of WAY_IN) {
              assert.ok(!all.includes(part), `case ${i}, mode ${mode}, room ${JSON.stringify(session.location)}: the email carries ${part}`);
            }
          }
        }
      }
    }
    assert.ok(written > 5000 && kinds.online > 1500 && kinds["on-page"] > 1500 && kinds.room > 500, JSON.stringify({ written, kinds }));
  });

  test("a token the email does not fill is refused by name, wherever it sits", () => {
    const places = {
      subject: { ...SEED, subject: "Your {facilitatorName} group" },
      heading: { ...SEED, blocks: [heading("Hi {sessionWhen}"), ...SEED.blocks] },
      paragraph: { ...SEED, blocks: [...SEED.blocks, rich("<p>See {weekUrl}</p>")] },
      caption: { ...SEED, blocks: [...SEED.blocks, { id: "i", type: "image", url: "https://example.com/a.png", alt: "", caption: "{nope}" }] },
    };
    for (const [where, template] of Object.entries(places)) {
      const email = placement.composePlacementEmail(template, FACTS);
      assert.equal(email.ok, false, where);
      assert.ok(email.problems.some((problem) => problem.kind === "unknown-token" && problem.tokens.length === 1), where);
    }
  });

  test("a value that can be missing cannot go where it cannot be left out", () => {
    const inSubject = { ...SEED, subject: "Your group with {facilitatorNames}" };
    assert.equal(placement.composePlacementEmail(inSubject, FACTS).ok, true, "fine for a group that has one");
    assert.deepEqual(placement.composePlacementEmail(inSubject, without(FACTS, ["facilitatorNames"])), {
      ok: false,
      problems: [{ kind: "cannot-leave-out", tokens: ["facilitatorNames"], where: "subject" }],
    });

    // The shape the copy had before: the facilitators in the group's own sentence.
    const together = {
      subject: SEED.subject,
      blocks: [rich("<p>You're in <strong>{groupName}</strong> for {courseTitle} ({runLabel}), facilitated by {facilitatorNames}.</p>")],
    };
    const known = placement.composePlacementEmail(together, FACTS);
    assert.equal(known.ok, true);
    assert.ok(read(known).endsWith("You're in Group A for AI Safety Fundamentals (Autumn 2026), facilitated by Priya and Sam."));
    assert.deepEqual(placement.composePlacementEmail(together, without(FACTS, ["facilitatorNames"])), {
      ok: false,
      problems: [{ kind: "cannot-leave-out", tokens: ["facilitatorNames"], where: "paragraph" }],
    });
  });

  test("a heading whose value is missing is left out with it", () => {
    const template = { subject: SEED.subject, blocks: [heading("Led by {facilitatorNames}"), ...SEED.blocks] };
    assert.ok(read(placement.composePlacementEmail(template, FACTS)).includes("| Led by Priya and Sam You've been placed"));
    const email = placement.composePlacementEmail(template, without(FACTS, ["facilitatorNames"]));
    assert.equal(email.ok, true);
    assert.ok(!read(email).includes("Led by"));
  });
});

describe("a value is text, whoever typed it", () => {
  const typed = {
    ...FACTS,
    name: "Dr <b>Ada</b>",
    groupName: 'Group <script>alert("x")</script> & Co',
    facilitatorNames: "Sam <img src=x onerror=1> and O'Neil",
    firstSessionWhere: { kind: "room", room: 'Room "B12" <i>upstairs</i>\nsecond line' },
  };

  test("nothing typed becomes markup in a rich-text block, and nothing becomes a second line", () => {
    const email = placement.composePlacementEmail(SEED, typed);
    assert.equal(email.ok, true);
    const html = printed(email.blocks.filter((block) => block.type === "richText"));
    assert.ok(!/<script|<img|<i>|<b>/.test(html), html);
    assert.ok(html.includes("Group &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co"));
    assert.ok(html.includes("Sam &lt;img src=x onerror=1&gt; and O&#39;Neil"));
    assert.ok(html.includes("Where: Room &quot;B12&quot; &lt;i&gt;upstairs&lt;/i&gt; second line"));
    // What a reader sees is what was typed.
    assert.ok(read(email).includes('Group <script>alert("x")</script> & Co'));
  });

  test("a name with curly brackets in it is not a token, and cannot stop an email being written", () => {
    const email = placement.composePlacementEmail(SEED, { ...FACTS, name: "{groupName} {nope}", groupName: "Group {B}" });
    assert.equal(email.ok, true);
    assert.deepEqual(tokensIn(`${email.subject}\n${printed(email.blocks)}`), []);
    assert.ok(read(email).includes("You've been placed, (groupName) You're in Group (B) for"));
  });
});

describe("where the first session is", () => {
  const session = (location, meetingUrl) => ({ location, meetingUrl });
  const LINK = "https://meet.example/abc";

  const ONLINE_WITH_LINK = { kind: "online", linkOnPage: true };

  test("a room, or online for a group that only has a link, and a room first when it has both", () => {
    assert.deepEqual(placement.placementWhere(session("Hallward B12", null), null), { kind: "room", room: "Hallward B12" });
    assert.deepEqual(placement.placementWhere(session("", LINK), null), ONLINE_WITH_LINK);
    assert.deepEqual(placement.placementWhere(session("Hallward B12", LINK), null), { kind: "room", room: "Hallward B12" });
    assert.equal(placement.placementWhere(session("  ", null), null), null);
  });

  test("the week's own switch decides which is live", () => {
    assert.deepEqual(placement.placementWhere(session("Hallward B12", LINK), "virtual"), ONLINE_WITH_LINK);
    assert.deepEqual(placement.placementWhere(session("Hallward B12", LINK), "in-person"), { kind: "room", room: "Hallward B12" });
    assert.deepEqual(
      placement.placementWhere(session("Hallward B12", null), "virtual"),
      { kind: "online", linkOnPage: false },
      "a week that is online is still online when nobody has added its link",
    );
    assert.equal(placement.placementWhere(session("", LINK), "in-person"), null, "a week in a room is said to be online");
  });

  test("the link is said to be on the page only when the page would draw it", () => {
    for (const bad of ["javascript:alert(1)", "meet.example/abc", "https://user:pw@meet.example/abc", "ftp://meet.example/abc"]) {
      assert.equal(placement.placementWhere(session("", bad), null), null, bad);
      assert.deepEqual(placement.placementWhere(session("", bad), "virtual"), { kind: "online", linkOnPage: false }, bad);
    }
  });

  test("what it answers has no room for an address", () => {
    const rooms = ["", "Hallward B12", ...ROOMS_WITH_A_LINK];
    for (const mode of [null, "virtual", "in-person"]) {
      for (const stored of rooms.flatMap((room) => [session(room, LINK), session(room, null)])) {
        const where = placement.placementWhere(stored, mode);
        if (!where) continue;
        assert.ok(Object.keys(where).every((key) => ["kind", "room", "linkOnPage"].includes(key)), JSON.stringify(where));
        assert.ok(!JSON.stringify(where).toLowerCase().includes("meet.example"), JSON.stringify(where));
      }
    }
  });

  test("a room with a way into a call typed into it is not a room to print", () => {
    for (const room of ROOMS_WITH_A_LINK) {
      assert.equal(links.couldBeFollowed(room), true, room);
      assert.deepEqual(placement.placementWhere(session(room, null), null), { kind: "on-page" }, room);
      assert.deepEqual(placement.placementWhere(session(room, null), "in-person"), { kind: "on-page" }, room);
      // A week that is online is online, whatever was typed into the room.
      assert.deepEqual(placement.placementWhere(session(room, null), "virtual"), { kind: "online", linkOnPage: false }, room);
    }
  });

  test("the email then says where to find it, in words true of a room and of a call, and prints none of what was typed", () => {
    for (const room of ROOMS_WITH_A_LINK) {
      const email = placement.composePlacementEmail(SEED, { ...FACTS, firstSessionWhere: placement.placementWhere(session(room, null), null) });
      assert.equal(email.ok, true, room);
      assert.equal(read(email), FULL.replace("Where: Hallward B12", `Where: ${ON_THE_PAGE}`), room);
    }
  });

  test("the composer asks again where it prints, whatever it was handed", () => {
    for (const room of ROOMS_WITH_A_LINK) {
      for (const proof of [false, true]) {
        const email = placement.composePlacementEmail(SEED, { ...FACTS, firstSessionWhere: { kind: "room", room } }, { proof });
        assert.equal(email.ok, true, room);
        const all = `${email.subject}\n${printed(email.blocks)}`.toLowerCase();
        for (const part of WAY_IN) assert.ok(!all.includes(part), `${room}: the email carries ${part}`);
        assert.ok(read(email).includes(`Where: ${ON_THE_PAGE}`), room);
      }
      // The designer's sample goes the same way.
      const proofed = placement.composePlacementEmail(SEED, placement.placementFactsFromSample({ ...samples.courseSampleTokens("course-allocated", "Alex Taylor"), firstSessionWhere: room }), { proof: true });
      assert.ok(!printed(proofed.blocks).toLowerCase().includes("meet.example"), room);
    }
  });

  test("anything a reader could follow counts: an address, a host name, a long number", () => {
    for (const followable of [
      "http://meet.example",
      "zoommtg://meet.example/join?confno=1",
      // Each of the next six is caught by one shape and by no other.
      "webex://join/abc",
      "skype:roomname?call",
      "www.meet-example",
      "meet.example",
      "192.0.2.10/call",
      "Meeting id 867 5309 1234",
      "mailto:room@example.com",
      "tel:+441154960000",
      "ask room@example.com",
      "see teams.example/l/abc",
      "bit.example/x",
      "Dial in on 0115 496 0000",
      "(0115) 496-0000",
    ]) {
      assert.equal(links.couldBeFollowed(followable), true, followable);
      assert.deepEqual(placement.placementWhere(session(followable, null), null), { kind: "on-page" }, followable);
    }
  });

  test("an ordinary room is printed as it was typed", () => {
    for (const room of [
      "Hallward B12",
      "Hallward Library, B12",
      "Portland Building C.11",
      "Room 3.14, second floor",
      "No.5 Lecture Theatre",
      "Trent Building LG11 (ring the bell)",
      "George Green Library, Room A.1",
      "B12, 6pm to 7.30pm",
      "B12 on 27 October, 18:00",
      "Rooms 101, 102 and 103",
      "Coates Road Auditorium, e.g. the foyer",
      "Hotel: Room 4",
      "Café Aspire",
    ]) {
      assert.equal(links.couldBeFollowed(room), false, room);
      assert.deepEqual(placement.placementWhere(session(room, null), null), { kind: "room", room }, room);
    }
    for (const nothing of ["", "   ", null, undefined]) assert.equal(links.couldBeFollowed(nothing), false);
  });

  test("it errs towards not printing: a room that only looks like a host name is found on the page", () => {
    // The email still tells the person where to find their room, so this is the safe way to be wrong.
    for (const room of ["St.Peters Church hall", "Dr.Smith's office"]) {
      assert.equal(links.couldBeFollowed(room), true, room);
    }
  });
});

describe("what an admin is told when publishing is refused", () => {
  const said = (groups) => placement.placementRefusal(groups);
  const noSession = (name, why) => ({ name, problems: [{ kind: "no-first-session" }], noFirstSession: why });

  test("one sentence to each problem, each saying what to set", () => {
    assert.deepEqual(said([noSession("Group A", "no-session-time")]), [
      "Group A has no session time, so its people cannot be told when they first meet. Set its day and time, then publish again.",
    ]);
    assert.deepEqual(said([noSession("Group A", "no-session-time"), noSession("Group C", "no-session-time")]), [
      "2 groups have no session time, so their people cannot be told when they first meet: Group A and Group C. Set a day and time for each, then publish again.",
    ]);
    assert.deepEqual(said([noSession("Group A", "no-start-date"), noSession("Group B", "no-start-date")]), [
      "This run has no start date, so nobody can be told when their first session is. Set the start date on the run, then publish again.",
    ]);
    assert.deepEqual(said([noSession("Group A", "no-taught-week")]), [
      "This run’s plan has no taught week, so there is no first session to tell anybody about. Add a week to the run’s plan, then publish again.",
    ]);
    assert.deepEqual(said([{ name: "", problems: [{ kind: "no-group-name" }] }]), [
      "A group with people placed in it has no name, so they cannot be told which group they are in. Name the group, then publish again.",
    ]);
    assert.deepEqual(said([{ name: "Group A", problems: [{ kind: "unknown-token", tokens: ["facilitatorName", "weekUrl"] }] }]), [
      "The “Placed in a group” email uses {facilitatorName} and {weekUrl}, which this email cannot fill. Correct its wording in Email designs, then publish again.",
    ]);
    assert.deepEqual(
      said([{ name: "Group B", problems: [{ kind: "cannot-leave-out", tokens: ["facilitatorNames"], where: "paragraph" }] }]),
      [
        "Group B has no facilitator yet, and the “Placed in a group” email uses {facilitatorNames} in the same paragraph as the group or its first session, where it cannot be left out. " +
          "Fill it in for that group, or give {facilitatorNames} a paragraph of its own in Email designs, then publish again.",
      ],
    );
    assert.deepEqual(
      said([{ name: "Group B", problems: [{ kind: "cannot-leave-out", tokens: ["firstSessionWhere"], where: "subject" }] }]),
      [
        "Group B has no room or meeting link for its first session, and the “Placed in a group” email uses {firstSessionWhere} in its subject, where it cannot be left out. " +
          "Fill it in for that group, or take {firstSessionWhere} out of the subject in Email designs, then publish again.",
      ],
    );
  });

  test("every refusal the composer can make has a sentence, and none has a token-shaped hole in it", () => {
    assert.deepEqual(said([]), []);
    for (const problems of [
      [{ kind: "no-first-session" }],
      [{ kind: "no-group-name" }],
      [{ kind: "unknown-token", tokens: ["x"] }],
      [{ kind: "cannot-leave-out", tokens: ["startDate"], where: "paragraph" }],
      [{ kind: "cannot-leave-out", tokens: [], where: "subject" }],
    ]) {
      const sentences = said([{ name: "Group A", problems }]);
      assert.ok(sentences.length >= 1, JSON.stringify(problems));
      for (const sentence of sentences) assert.match(sentence, /then publish again\.$/, sentence);
    }
  });
});

describe("neither email prints something a reader could follow from a room", () => {
  const base = { weekday: 2, startTimeLocal: "18:00", durationMinutes: 90, notes: "" };
  const LINK = "https://meet.example/j/8675309?pwd=opensesame";
  const nudgeSeed = seeds.courseTemplateDefaults["course-week-nudge"];
  /** The weekly reminder on its seed copy, for a group whose session is stored this way. */
  const reminder = (session, mode) => {
    const rendered = nudgeMail.renderCourseNudge(
      { subject: nudgeSeed.subject, blocks: nudgeSeed.blocks },
      nudgeMail.buildCourseNudgeTokens({
        recipientName: "Amara Okafor",
        courseTitle: "AI Safety Fundamentals",
        weekNumber: 1,
        weekTitle: "What is at stake",
        sessionWhen: nudgeMail.courseNudgeSessionWhen(session, "2026-10-27"),
        sessionWhere: nudgeMail.courseNudgeSessionWhere(session, mode),
      }),
    );
    return { all: `${rendered.subject}\n${printed(rendered.blocks)}`, text: textOf(printed(rendered.blocks)) };
  };

  test("the weekly reminder says nothing of a room with a way into a call typed into it", () => {
    for (const location of ROOMS_WITH_A_LINK) {
      for (const meetingUrl of [null, LINK]) {
        const session = { ...base, location, meetingUrl };
        for (const mode of [undefined, null, "in-person"]) {
          assert.equal(nudgeMail.courseNudgeSessionWhere(session, mode), "", `${location}, mode ${mode}`);
        }
        // A week that is online is online, whatever was typed into the room.
        assert.equal(nudgeMail.courseNudgeSessionWhere(session, "virtual"), "Online", location);
      }
    }
  });

  test("and the reminder that goes out carries none of it, and closes its sentence up", () => {
    for (const location of ROOMS_WITH_A_LINK) {
      for (const mode of [null, "virtual", "in-person"]) {
        const mail = reminder({ ...base, location, meetingUrl: LINK }, mode);
        for (const part of WAY_IN) assert.ok(!mail.all.toLowerCase().includes(part), `${location}, mode ${mode}: the reminder carries ${part}`);
        assert.deepEqual(tokensIn(mail.all), [], location);
        assert.ok(
          mail.text.includes(mode === "virtual" ? "Your group meets Tuesday 27 October, 18:00–19:30, Online." : "Your group meets Tuesday 27 October, 18:00–19:30."),
          mail.text,
        );
      }
    }
  });

  test("an ordinary room is still in the reminder, as it was typed", () => {
    for (const location of ["Hallward B12", "Portland Building C.11", "Room 3.14, second floor"]) {
      const session = { ...base, location, meetingUrl: null };
      assert.equal(nudgeMail.courseNudgeSessionWhere(session), location);
      assert.equal(nudgeMail.courseNudgeSessionWhere(session, "in-person"), location);
      assert.ok(reminder(session, null).text.includes(`Your group meets Tuesday 27 October, 18:00–19:30, ${location}.`));
    }
  });

  test("a room that holds a link is never turned into Online: it may still be a room", () => {
    const session = { ...base, location: `Hallward B12 or ${LINK}`, meetingUrl: LINK };
    assert.equal(nudgeMail.courseNudgeSessionWhere(session), "");
    assert.equal(nudgeMail.courseNudgeSessionWhere(session, "in-person"), "");
    assert.deepEqual(placement.placementWhere(session, null), { kind: "on-page" });
  });

  test("the two emails agree on every room: what one will not print, the other will not either", () => {
    const rooms = [
      ...ROOMS_WITH_A_LINK,
      "Hallward B12",
      "Portland Building C.11",
      "St.Peters Church hall",
      "Dial in on 0115 496 0000",
      "Café Aspire",
      "",
    ];
    for (const location of rooms) {
      const session = { ...base, location, meetingUrl: null };
      for (const mode of [null, "in-person"]) {
        const placed = placement.placementWhere(session, mode);
        const weekly = nudgeMail.courseNudgeSessionWhere(session, mode);
        assert.equal(placed?.kind === "room", weekly !== "", `${JSON.stringify(location)}, mode ${mode}`);
        if (placed?.kind === "room") assert.equal(weekly, placed.room);
      }
    }
  });

  test("both ask the one function, and it is declared once", () => {
    const placementCode = codeOf("lib", "courses", "placementEmail.ts");
    const nudgeCode = codeOf("lib", "email", "courseNudgeEmail.ts");
    assert.ok(placementCode.includes('import { couldBeFollowed } from "./followable";'));
    assert.ok(nudgeCode.includes('import { couldBeFollowed } from "@/lib/courses/followable";'));
    assert.ok(nudgeCode.includes('const room = couldBeFollowed(location) ? "" : location;'));
    assert.ok(nudgeCode.includes('if (mode === "in-person") return room; if (location) return room;'), "the reminder prints the room as typed somewhere");
    const declared = [...walkSource(SRC)].filter((file) => /function couldBeFollowed\b/.test(readFileSync(file, "utf8")));
    assert.deepEqual(declared.map(inSrc), ["lib/courses/followable.ts"]);
  });
});

// ---------------------------------------------------------------------------
// The route, run against a stored run
// ---------------------------------------------------------------------------

const RUN = "run-1";
const ADMIN = { uid: "zach", email: "zach@example.com", role: "admin", displayName: "Zach Levin" };

const slot = (over = {}) => ({ weekday: 2, startTimeLocal: "18:00", durationMinutes: 90, location: "Hallward B12", meetingUrl: null, notes: "", ...over });
const group = (name, over = {}) => ({ runId: RUN, courseId: "course-1", name, facilitatorUids: ["priya", "sam"], session: slot(), ...over });

/**
 * A run with people placed in its groups. `groups` is `{ id: group }`, and
 * `people` is `{ uid: group id }`. Mon 26 Oct 2026 is the run's first day, so
 * a Tuesday group first meets on Tuesday 27 October.
 */
function stage({ run = {}, groups = { a: group("Group A") }, people = { amara: "a" }, template = null, told = [] } = {}) {
  const docs = {
    [`courseRuns/${RUN}`]: {
      courseId: "course-1",
      courseTitle: "AI Safety Fundamentals",
      label: "Autumn 2026",
      status: "applications-closed",
      startDate: "2026-10-26",
      weekPlan: [
        { kind: "week", weekNumber: 1, weekId: "w01" },
        { kind: "week", weekNumber: 2, weekId: "w02" },
      ],
      trackLeadUids: [],
      ...run,
    },
    "users/priya": { email: "priya@example.com", displayName: "Priya Shah", profile: { preferredName: "Priya" } },
    "users/sam": { email: "sam@example.com", displayName: "Sam Reed", profile: { preferredName: "Sam" } },
  };
  for (const [id, doc] of Object.entries(groups)) docs[`courseGroups/${id}`] = doc;
  for (const [uid, groupId] of Object.entries(people)) {
    const name = `${uid.charAt(0).toUpperCase()}${uid.slice(1)} Example`;
    docs[`users/${uid}`] = { email: `${uid}@example.com`, displayName: name, profile: { preferredName: name.split(" ")[0] } };
    docs[`courseApplications/${RUN}__${uid}`] = { runId: RUN, courseId: "course-1", uid, email: `${uid}@example.com`, displayName: name, status: "accepted" };
    docs[`courseEnrolments/${RUN}__${uid}`] = {
      runId: RUN,
      courseId: "course-1",
      uid,
      groupId,
      status: "active",
      role: "learner",
      ...(told.includes(uid) ? { allocatedEmailAt: new Date("2026-10-24T10:00:00Z") } : {}),
    };
  }
  if (template) docs["courseEmailTemplates/course-allocated"] = { templateId: "course-allocated", ...template };

  const db = makeDb(docs, { now: new Date("2026-10-24T12:00:00Z") });
  // The route caps each of its two queries, which the store has no word for.
  const withLimit = (query) => ({ ...query, where: (...filter) => withLimit(query.where(...filter)), limit: () => withLimit(query) });
  const collection = db.collection;
  db.collection = (name) => withLimit(collection(name));
  Object.assign(world, { db, user: ADMIN, sent: [], subscribed: [], pushed: [], refuseMail: null });
  return db;
}

const press = () => publish.POST(new Request("http://naisi.invalid/api", { method: "POST" }), { params: Promise.resolve({ runId: RUN }) });
const stored = async (path) => {
  const [collection, id] = path.split("/");
  return (await world.db.collection(collection).doc(id).get()).data();
};
/** One sent email as its reader gets it: the subject, the words, and the HTML they came from. */
async function opened(mail) {
  const html = await render(mail.react);
  return { to: mail.to, subject: mail.subject, html, text: textOf(html.replace(/<head[\s\S]*?<\/head>/i, "")) };
}

describe("publishing an allocation", { concurrency: false }, () => {
  test("everybody is emailed their group, its facilitators, and when and where it first meets", async () => {
    stage({ people: { amara: "a", ben: "a" } });
    const response = await press();
    assert.deepEqual([response.status, response.body.emailed, response.body.skipped], [200, 2, 0]);
    assert.deepEqual(world.sent.map((mail) => mail.to), ["amara@example.com", "ben@example.com"]);
    const mail = await opened(world.sent[0]);
    assert.equal(mail.subject, "Your AI Safety Fundamentals group: first session Tuesday 27 October, 18:00");
    for (const said of [
      "You've been placed, Amara",
      "You're in Group A for AI Safety Fundamentals (Autumn 2026).",
      "Your group is facilitated by Priya and Sam.",
      "Your first session is Tuesday 27 October, 18:00",
      "Where: Hallward B12",
    ]) {
      assert.ok(mail.text.includes(said), `missing: ${said}`);
    }
    assert.ok((await stored(`courseEnrolments/${RUN}__amara`)).allocatedEmailAt, "the person told is not stamped");
    assert.ok((await stored(`courseRuns/${RUN}`)).allocationPublishedAt);
    assert.deepEqual(world.pushed, ["amara", "ben"]);
  });

  test("no email from the route carries a token, whatever its groups lack", async () => {
    stage({
      groups: {
        a: group("Group A"),
        b: group("Group B", { facilitatorUids: [] }),
        c: group("Group C", { session: slot({ location: "" }) }),
        d: group("Group D", { facilitatorUids: [], session: slot({ location: "", meetingUrl: "https://meet.example/d" }) }),
      },
      people: { amara: "a", ben: "b", chloe: "c", dev: "d" },
    });
    const response = await press();
    assert.deepEqual([response.status, response.body.emailed], [200, 4]);
    const mails = await Promise.all(world.sent.map(opened));
    for (const mail of mails) assert.deepEqual(tokensIn(`${mail.subject}\n${mail.html}`), [], mail.to);
    const of = (uid) => mails.find((mail) => mail.to === `${uid}@example.com`).text;
    assert.ok(of("amara").includes("facilitated by Priya and Sam") && of("amara").includes("Where: Hallward B12"));
    // No facilitator yet: the email goes, without that sentence.
    assert.ok(!of("ben").includes("facilitated") && of("ben").includes("You're in Group B") && of("ben").includes("Where: Hallward B12"));
    // No room: the email goes, without a line about where.
    assert.ok(!of("chloe").includes("Where:") && of("chloe").includes("facilitated by Priya and Sam"));
    // Online: it says so, and where the link is. The link itself is not in the email.
    assert.ok(
      of("dev").includes("Where: Online. The link to join is on your programme's page in the learning space.") &&
        !of("dev").includes("facilitated"),
      of("dev"),
    );
    for (const mail of mails) assert.ok(!mail.html.includes("meet.example"), `${mail.to} was emailed a meeting link`);
  });

  test("no email from the route carries a link typed into a group's room, and its people are told where to look", async () => {
    stage({
      groups: Object.fromEntries(ROOMS_WITH_A_LINK.map((location, index) => [`g${index}`, group(`Group ${index + 1}`, { session: slot({ location }) })])),
      people: Object.fromEntries(ROOMS_WITH_A_LINK.map((_, index) => [`person${index}`, `g${index}`])),
    });
    const response = await press();
    assert.deepEqual([response.status, response.body.emailed], [200, ROOMS_WITH_A_LINK.length], JSON.stringify(response.body));
    for (const mail of await Promise.all(world.sent.map(opened))) {
      const all = `${mail.subject}\n${mail.html}`.toLowerCase();
      for (const part of WAY_IN) assert.ok(!all.includes(part), `${mail.to}: the email carries ${part}`);
      assert.ok(mail.text.includes(`Where: ${ON_THE_PAGE}`), mail.text);
    }
    assert.ok(!JSON.stringify(response.body).toLowerCase().includes("meet.example"));
  });

  test("no email from the route carries a group's meeting link, however the wording and the week are set", async () => {
    const LINK = "https://meet.example/j/8675309?pwd=opensesame";
    const wordings = [
      null,
      { subject: "Your group: {firstSessionWhen}", blocks: [rich("<p>{groupName}</p><p>{firstSessionWhere}</p>")] },
      { subject: "Your group", blocks: [heading("Where: {firstSessionWhere}"), rich('<p>{groupName}, {firstSessionWhen}</p><p><a href="{firstSessionWhere}">Join</a></p>')] },
    ];
    let sent = 0;
    for (const template of wordings) {
      for (const sessionModes of [undefined, { w01: "virtual" }, { w01: "in-person" }]) {
        stage({
          template,
          groups: {
            a: group("Group A", { session: slot({ location: "", meetingUrl: LINK }), ...(sessionModes ? { sessionModes } : {}) }),
            b: group("Group B", { session: slot({ meetingUrl: LINK }), ...(sessionModes ? { sessionModes } : {}) }),
          },
          people: { amara: "a", ben: "b" },
        });
        const response = await press();
        assert.equal(response.status, 200, JSON.stringify(response.body));
        for (const mail of await Promise.all(world.sent.map(opened))) {
          sent += 1;
          for (const part of [LINK, "meet.example", "8675309", "opensesame"]) {
            assert.ok(!`${mail.subject}\n${mail.html}`.includes(part), `${mail.to}: the email carries ${part}`);
          }
        }
        // A refusal's sentence is read by an admin, and has no reason to carry it either.
        assert.ok(!JSON.stringify(response.body).includes("meet.example"));
      }
    }
    assert.equal(sent, 18);
  });

  test("a group with no session time: refused with what to set, and nothing at all is done", async () => {
    stage({
      groups: { a: group("Group A"), b: group("Group B", { session: slot({ startTimeLocal: "" }) }) },
      people: { amara: "a", ben: "b" },
    });
    const response = await press();
    assert.equal(response.status, 409);
    assert.equal(
      response.body.error,
      "Nothing was published and nobody was emailed. Group B has no session time, so its people cannot be told when they first meet. Set its day and time, then publish again.",
    );
    assert.deepEqual(response.body.unplaced, [], "the board reads this list for people with no group");
    // Not even the people whose own group is ready.
    assert.deepEqual(world.sent, []);
    assert.deepEqual(world.subscribed, []);
    assert.deepEqual(world.pushed, []);
    assert.equal((await stored(`courseRuns/${RUN}`)).allocationPublishedAt, undefined, "the run was stamped as published");
    for (const uid of ["amara", "ben"]) {
      assert.equal((await stored(`courseEnrolments/${RUN}__${uid}`)).allocatedEmailAt, undefined, uid);
    }
  });

  test("a run with no start date, or no taught week, is refused with what to set on the run", async () => {
    stage({ run: { startDate: "" } });
    const undated = await press();
    assert.equal(undated.status, 409);
    assert.ok(undated.body.error.includes("This run has no start date, so nobody can be told when their first session is."));
    stage({ run: { weekPlan: [{ kind: "break", label: "Reading week" }] } });
    const untaught = await press();
    assert.equal(untaught.status, 409);
    assert.ok(untaught.body.error.includes("This run’s plan has no taught week"));
    assert.deepEqual(world.sent, []);
  });

  test("wording with a token the email cannot fill is refused by name, and nobody is emailed it", async () => {
    stage({ template: { subject: "Your group, {firstName}", blocks: [rich("<p>You're in {groupName}, led by {facilitatorName}.</p>")] } });
    const response = await press();
    assert.equal(response.status, 409);
    assert.ok(response.body.error.includes("The “Placed in a group” email uses {facilitatorName}, which this email cannot fill."), response.body.error);
    assert.deepEqual(world.sent, []);
  });

  test("an admin's own wording is what is sent, and a group that lacks what it needs is refused", async () => {
    const before = {
      subject: "Your {courseTitle} group, {firstName}",
      blocks: [rich("<p>You're in <strong>{groupName}</strong>, facilitated by {facilitatorNames}.</p><p>First session: {firstSessionWhen}.</p>")],
    };
    stage({ template: before });
    const sent = await press();
    assert.equal(sent.status, 200);
    const mail = await opened(world.sent[0]);
    assert.equal(mail.subject, "Your AI Safety Fundamentals group, Amara");
    assert.ok(mail.text.includes("You're in Group A , facilitated by Priya and Sam. First session: Tuesday 27 October, 18:00."), mail.text);

    stage({ template: before, groups: { a: group("Group A", { facilitatorUids: [] }) } });
    const refused = await press();
    assert.equal(refused.status, 409);
    assert.ok(refused.body.error.includes("Group A has no facilitator yet, and the “Placed in a group” email uses {facilitatorNames} in the same paragraph"));
    assert.deepEqual(world.sent, []);
  });

  test("somebody already told is not written to again, and their group is not asked about", async () => {
    // Amara was told last time. Her group has since lost its session time, which is nobody's email today.
    stage({
      groups: { a: group("Group A", { session: slot({ startTimeLocal: "" }) }), b: group("Group B") },
      people: { amara: "a", ben: "b" },
      told: ["amara"],
    });
    const response = await press();
    assert.deepEqual([response.status, response.body.emailed], [200, 1]);
    assert.deepEqual(world.sent.map((mail) => mail.to), ["ben@example.com"]);
  });

  test("the people who are still unplaced are refused first, as before", async () => {
    stage({ people: { amara: "a", ben: null } });
    const response = await press();
    assert.equal(response.status, 409);
    assert.deepEqual(response.body.unplaced, ["Ben Example"]);
    assert.deepEqual(world.sent, []);
  });

  test("the mail door is handed a placement email only as it was written, and refuses one with a token in it", async () => {
    stage();
    const blocks = [rich("<p>You're in {groupName}.</p>")];
    await assert.rejects(
      courseMail.sendCourseApplicationEmail({ kind: "allocated", to: "amara@example.com", composed: { subject: "Your group", blocks }, uid: "amara", runId: RUN }),
      /placement email not sent: unfilled \{groupName\}/,
    );
    await assert.rejects(
      courseMail.sendCourseApplicationEmail({ kind: "allocated", to: "amara@example.com", composed: { subject: "{firstName}", blocks: [] }, uid: "amara", runId: RUN }),
      /unfilled \{firstName\}/,
    );
    assert.deepEqual(world.sent, []);
  });
});

// ---------------------------------------------------------------------------
// An admin proofing the wording
// ---------------------------------------------------------------------------

const codeOf = (...parts) => readFileSync(join(SRC, ...parts), "utf8").replace(/\s+/g, " ");

describe("the designer offers what the composer fills, and proofs through it", () => {
  const EDITOR = codeOf("features", "admin", "emailDesigns", "CourseEmailDesignEditor.tsx");

  test("the tokens the designer lists for this email are the composer's own", () => {
    const listed = (name) => {
      const block = new RegExp(`const ${name}: TokenHelp\\[\\] = \\[(.*?)\\];`).exec(EDITOR);
      assert.ok(block, `${name} is no longer where this test can find it`);
      return [...block[1].matchAll(/token: "([a-zA-Z]+)"/g)].map((match) => match[1]);
    };
    assert.deepEqual([...listed("ALWAYS_TOKENS"), ...listed("GROUP_TOKENS")].sort(), [...placement.PLACEMENT_TOKENS].sort());
  });

  test("the sample values fill every one of them, so the preview shows the longest email", () => {
    const sample = samples.courseSampleTokens("course-allocated", "Alex Taylor");
    assert.deepEqual(Object.keys(sample).sort(), [...placement.PLACEMENT_TOKENS].sort());
    const proof = placement.composePlacementEmail(SEED, placement.placementFactsFromSample(sample), { proof: true });
    assert.equal(proof.ok, true);
    assert.deepEqual(tokensIn(`${proof.subject}\n${printed(proof.blocks)}`), []);
    assert.ok(read(proof).includes("Where: Hallward Library, B12"));
  });

  test("a proof leaves a paragraph out as a send would, and leaves a token it cannot fill as typed", () => {
    const sample = { ...samples.courseSampleTokens("course-allocated", "Alex Taylor"), facilitatorNames: "" };
    const template = { subject: "Your group", blocks: [...SEED.blocks, rich("<p>Typed wrongly: {facilitatorName}</p>")] };
    const proof = placement.composePlacementEmail(template, placement.placementFactsFromSample(sample), { proof: true });
    assert.equal(proof.ok, true);
    assert.ok(!read(proof).includes("facilitated by"));
    assert.ok(read(proof).includes("Typed wrongly: {facilitatorName}"), "the admin can no longer see the token they mistyped");
    // The same wording, for a send, is refused.
    assert.equal(placement.composePlacementEmail(template, FACTS).ok, false);
  });

  test("the preview and the test send are the only places a proof is asked for", () => {
    const asked = [];
    for (const file of walkSource(SRC)) {
      // Code only: a comment that explains the switch is not a use of it.
      if (/proof:\s*true/.test(stripSource(readFileSync(file, "utf8"), { keepStrings: true }))) asked.push(inSrc(file));
    }
    assert.deepEqual(asked.sort(), [
      "app/api/admin/course-emails/[templateId]/send-test/route.ts",
      "app/api/admin/course-emails/preview/route.ts",
    ]);
    const route = codeOf("app", "api", "courses", "runs", "[runId]", "allocation", "publish", "route.ts");
    assert.equal(route.split("composePlacementEmail(").length - 1, 2, "the route writes the email for each group, then for each person");
    assert.ok(!route.includes("proof"));
  });
});

// ---------------------------------------------------------------------------
// The class: every function in the tree that fills tokens
// ---------------------------------------------------------------------------

/** The functions that fill `{tokens}`, by the module that declares each. */
const FILLERS = {
  personaliseString: "lib/firestore/newsletterBlocks.ts",
  personaliseBlocks: "lib/firestore/newsletterBlocks.ts",
  renderCourseNudge: "lib/email/courseNudgeEmail.ts",
  composePlacementEmail: "lib/courses/placementEmail.ts",
};

/**
 * EVERY FUNCTION THAT CALLS ONE, and what it does with a token it has no
 * value for.
 *
 *  - `whole`: it sends what the placement composer returned, which is never
 *    a token.
 *  - `leaves-out`: it leaves the sentence out. Proved below on its seed copy.
 *  - `as-typed`: it follows the older convention, written beside each sender:
 *    a token with no value is sent as typed, so the admin who wrote the copy
 *    notices. `leaves` is what its SEED copy then leaves when every optional
 *    value is absent, by template, measured below on every run.
 *  - `proof`: a preview, or a test send to whoever asked. The token as typed
 *    is what that admin is there to see.
 *  - `own-copy`: a route that fills tokens in copy its own admin wrote, or
 *    chose, and sent with one press. Registered, not run: see the header.
 *  - `helper`: a function of a filler's own module, which sends nothing.
 */
const CALLERS = {
  "app/api/courses/runs/[runId]/allocation/publish/route.ts#POST": {
    how: "whole",
    why: "the placement email: written for every group before anything is sent, and refused when it cannot be",
  },
  "lib/email/courseNudgeEmail.ts#sendCourseWeekNudgeEmail": {
    how: "leaves-out",
    why: "the weekly reminder, whose renderer drops a sentence whose values are all empty",
  },
  "lib/email/courseApplicationEmails.ts#filledFromTemplate": {
    how: "as-typed",
    leaves: {
      "course-application-submitted": ["startDate"],
      "course-application-accepted": ["startDate"],
      "course-application-waitlisted": [],
      "course-application-rejected": [],
    },
    why: "the four emails about an application to one run, sent before the run has to have a start date",
  },
  "lib/email/courseEnrolmentEmails.ts#sendCourseDroppedOutEmail": {
    how: "as-typed",
    leaves: { "course-dropped-out": [] },
    why: "the email to somebody who has left a course, whose seed copy uses only what every send has",
  },
  "lib/email/admissionEmails.ts#sendAdmissionEmail": {
    how: "as-typed",
    leaves: {
      "admissions-submitted": ["deadline", "decisionsBy"],
      "admissions-reinstated": ["deadline"],
      "admissions-deadline-reminder": ["deadline"],
      "admissions-stage-released": ["stageLabel"],
      "admissions-appointed": [],
      "admissions-declined": [],
    },
    why: "the emails about an application to a round, for a round with no deadline, no decisions day or one stage",
  },
  "app/api/admin/application-emails/send/route.ts#POST": {
    how: "own-copy",
    why: "a member-application email an admin picks and sends to one applicant, from the wording saved in the designer",
  },
  "app/api/newsletter/[id]/send/route.ts#POST": {
    how: "own-copy",
    why: "a newsletter its author wrote and an approver read, whose one token is the reader's name",
  },
  "app/api/courses/runs/[runId]/nudge/route.ts#GET": {
    how: "proof",
    why: "the weekly reminder, shown to whoever is about to send it, through the renderer the send uses",
  },
  "app/api/admin/course-emails/preview/route.ts#renderCourseTemplatePreview": { how: "proof", why: "the course email designer's preview" },
  "app/api/admin/course-emails/preview/route.ts#renderNudgePreview": { how: "proof", why: "the designer's preview of the weekly reminder" },
  "app/api/admin/course-emails/preview/route.ts#renderPlacementPreview": { how: "proof", why: "the designer's preview of the placement email" },
  "app/api/admin/course-emails/[templateId]/send-test/route.ts#POST": { how: "proof", why: "a test send of a course email to the admin who asked" },
  "app/api/admin/application-emails/preview/route.ts#POST": { how: "proof", why: "the application email designer's preview" },
  "app/api/admin/application-emails/[templateId]/send-test/route.ts#POST": { how: "proof", why: "a test send of an application email to the admin who asked" },
  "app/api/newsletter/[id]/send-test/route.ts#POST": { how: "proof", why: "a test send of a newsletter draft to its author" },
  "lib/firestore/newsletterBlocks.ts#personaliseBlocks": { how: "helper", why: "the shared filler's own pass over a list of blocks" },
};

describe("every function that fills tokens is known, and held to what it does with an empty one", { concurrency: false }, () => {
  const found = new Map();
  for (const file of walkSource(SRC)) {
    const mod = scanModule(file);
    const here = inSrc(file);
    for (const fn of mod.functions.values()) {
      for (const [name, declaredIn] of Object.entries(FILLERS)) {
        const imported = mod.imports.get(name) === `@/${declaredIn.replace(/\.ts$/, "")}`;
        const own = here === declaredIn && fn.name !== name;
        if ((imported || own) && calls(fn.body, name)) found.set(`${here}#${fn.name}`, name);
      }
    }
  }

  test("the fillers are declared where this file says", () => {
    for (const [name, declaredIn] of Object.entries(FILLERS)) {
      assert.ok(scanModule(join(SRC, declaredIn)).functions.get(name)?.exported, `${name} is not an exported function of ${declaredIn}`);
    }
  });

  test("the list is the tree: nothing missing from it, and nothing on it that has gone", () => {
    assert.deepEqual(
      [...found.keys()].filter((key) => !Object.hasOwn(CALLERS, key)).sort(),
      [],
      "a function fills email tokens and is not on the list. Say what it does with a token it has no value for: " +
        "write the email with composePlacementEmail's rules, or register it with its reason.",
    );
    assert.deepEqual(Object.keys(CALLERS).filter((key) => !found.has(key)), [], "a registered function no longer fills tokens: remove it");
    for (const [key, entry] of Object.entries(CALLERS)) {
      assert.ok(["whole", "leaves-out", "as-typed", "proof", "own-copy", "helper"].includes(entry.how), key);
      assert.ok(String(entry.why).trim().length >= 25, `${key} needs its reason written down`);
    }
  });

  test("every seed template of a course email is sent by a path that is run here", () => {
    const run = new Set(["course-allocated", "course-week-nudge"]);
    for (const entry of Object.values(CALLERS)) for (const id of Object.keys(entry.leaves ?? {})) run.add(id);
    assert.deepEqual([...seeds.COURSE_TEMPLATE_IDS].filter((id) => !run.has(id)), [], "a template has no sender run in this file");
  });

  /** What a sender handed the mail door, as the tokens a reader would see. */
  async function leftBy(send) {
    Object.assign(world, { db: null, sent: [], refuseMail: null });
    await send();
    assert.equal(world.sent.length, 1, "the sender did not hand over exactly one email");
    const [mail] = world.sent;
    return tokensIn(`${mail.subject}\n${await render(mail.react)}`).sort();
  }
  const WHO = { to: "ada@example.com", name: "Ada Lovelace", uid: "ada" };

  test("the weekly reminder leaves a sentence out, and no token, when it knows nothing but the week's number", () => {
    const seed = seeds.courseTemplateDefaults["course-week-nudge"];
    const rendered = nudgeMail.renderCourseNudge({ subject: seed.subject, blocks: seed.blocks }, nudgeMail.buildCourseNudgeTokens({ weekNumber: 1 }));
    assert.deepEqual(tokensIn(`${rendered.subject}\n${printed(rendered.blocks)}`), []);
  });

  for (const [templateId, kind] of [
    ["course-application-submitted", "submitted"],
    ["course-application-accepted", "accepted"],
    ["course-application-waitlisted", "waitlisted"],
    ["course-application-rejected", "rejected"],
  ]) {
    test(`${templateId}: what its seed copy leaves is what is written beside it`, async () => {
      const left = await leftBy(() => courseMail.sendCourseApplicationEmail({ kind, ...WHO, courseTitle: "AI Safety Fundamentals", runLabel: "Autumn 2026", runId: RUN }));
      assert.deepEqual(left, CALLERS["lib/email/courseApplicationEmails.ts#filledFromTemplate"].leaves[templateId]);
    });
  }

  test("course-dropped-out: what its seed copy leaves is what is written beside it", async () => {
    const left = await leftBy(() => enrolmentMail.sendCourseDroppedOutEmail({ ...WHO, courseTitle: "AI Safety Fundamentals", runLabel: "Autumn 2026", runId: RUN }));
    assert.deepEqual(left, CALLERS["lib/email/courseEnrolmentEmails.ts#sendCourseDroppedOutEmail"].leaves["course-dropped-out"]);
  });

  for (const kind of ["submitted", "reinstated", "deadline-reminder", "stage-released", "appointed", "declined"]) {
    test(`admissions-${kind}: what its seed copy leaves is what is written beside it`, async () => {
      const left = await leftBy(() =>
        admissionMail.sendAdmissionEmail({ kind, ...WHO, roundLabel: "Autumn 2026 intake", applicationUrl: "https://naisi.invalid/applications/r", roundId: "r" }),
      );
      assert.deepEqual(left, CALLERS["lib/email/admissionEmails.ts#sendAdmissionEmail"].leaves[`admissions-${kind}`]);
    });
  }
});
