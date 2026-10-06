/**
 * Only the live site can write to a stranger.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * ## The rule this guards
 *
 * The same code runs as the live site, as staging, on a laptop and inside the
 * test harness, and all of them can reach the real sender. `sendEmail()` in
 * `src/lib/email/send.ts` therefore asks `src/lib/email/audience.ts` who this
 * copy of the site may email, for every message:
 *
 *  - EVERYONE only when the environment carries `EMAIL_AUDIENCE=everyone` AND
 *    the project is the production one;
 *  - everything, when the mail server is this machine, because nothing handed
 *    to a loopback catcher can leave it;
 *  - otherwise only the addresses the setting lists, plus the harness's own
 *    reserved domain;
 *  - and NOBODY when the setting is missing. Never everyone.
 *
 * Like its neighbour `tests/email-suppression-chokepoint.test.mjs`, this file
 * guards the one door on three levels:
 *
 *  1. by SOURCE, that the audience is asked after the suppression list and
 *     before the message is rendered or handed over;
 *  2. by WALKING the tree, that nothing else reads the setting and that the
 *     hosting file both backends share never declares it;
 *  3. by EXECUTION, that a recipient outside the audience really is held,
 *     really leaves an `emailSends` row saying so, and that a send with nobody
 *     left never touches the provider at all.
 *
 * Faked for (3): `nodemailer`, `@react-email/render`, `server-only` and
 * `@/lib/firebase/admin`. The Firestore helpers and the audience module are
 * the REAL ones. Nothing here can reach a Firestore project or an SMTP server.
 * Every address is on a reserved domain, so none can be anybody's.
 */
import { test } from "node:test";
import { createLoader } from "./lib/tsLoader.mjs";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const SEND = join(SRC, "lib", "email", "send.ts");
const AUDIENCE = join(SRC, "lib", "email", "audience.ts");

const rel = (file) => relative(REPO_ROOT, file).split("\\").join("/");

/** Every .ts / .tsx file under src, so the walk cannot miss a new one. */
function sourceFiles(dir = SRC, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

/* -------------------------------------------------------------------------
 * 1. The door itself
 * ---------------------------------------------------------------------- */

test("sendEmail asks the audience after the suppression list and before anything is rendered or posted", () => {
  const source = readFileSync(SEND, "utf8");

  assert.match(
    source,
    /import\s*\{[^}]*\bresolveEmailAudience\b[^}]*\bsplitByAudience\b[^}]*\}\s*from\s*["']\.\/audience["']/,
    "src/lib/email/send.ts no longer imports resolveEmailAudience and splitByAudience from " +
      "./audience. It is the only place the audience is applied; without it every copy of " +
      "the site can write to anybody.",
  );

  const suppressionAt = source.indexOf("filterSuppressed(db,");
  const decidedAt = source.indexOf("resolveEmailAudience(process.env)");
  const appliedAt = source.indexOf("splitByAudience(");
  const renderAt = source.indexOf("render(react)");
  const sendAt = source.indexOf("transporter().sendMail(");
  assert.ok(decidedAt > 0, "sendEmail does not call resolveEmailAudience(process.env).");
  assert.ok(appliedAt > 0, "sendEmail does not call splitByAudience(...).");
  assert.ok(sendAt > 0, "sendEmail no longer calls transporter().sendMail(); re-read this file.");
  assert.ok(
    suppressionAt > 0 && suppressionAt < appliedAt,
    "the audience is applied before the suppression list is read. Suppression goes first: an " +
      "address the provider told us to stop writing to is suppressed on every copy of the " +
      "site, and its row has to say so wherever it was tried.",
  );
  assert.ok(
    appliedAt < sendAt,
    "sendEmail hands the message to the provider before it has applied the audience.",
  );
  assert.ok(
    renderAt === -1 || appliedAt < renderAt,
    "sendEmail renders the email before it has applied the audience.",
  );
  assert.match(
    source,
    /logHeldSend\(/,
    "a held recipient must leave an emailSends row at status `held`, or a rehearsal on " +
      "staging cannot be counted and a held message looks like one that was never tried.",
  );
});

test("the audience rule never consults NODE_ENV", () => {
  // Staging builds in production mode, so NODE_ENV cannot tell it from the
  // live site. The rule has to rest on a setting only the live backend has.
  for (const file of [AUDIENCE, SEND]) {
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.ok(
      !/NODE_ENV/.test(code),
      `${rel(file)} reads NODE_ENV. It is "production" on staging too, so a rule built on it ` +
        "lets staging write to everybody.",
    );
  }
});

/* -------------------------------------------------------------------------
 * 2. One reader, and no shared declaration
 * ---------------------------------------------------------------------- */

test("nothing but the audience module reads the setting", () => {
  const readers = [];
  for (const file of sourceFiles()) {
    if (/EMAIL_AUDIENCE\b(?!_ENV)/.test(readFileSync(file, "utf8"))) readers.push(rel(file));
  }
  assert.deepEqual(
    readers,
    ["src/lib/email/audience.ts"],
    "a file other than src/lib/email/audience.ts names the EMAIL_AUDIENCE setting. One " +
      "module decides the audience; a second reader is a second rule.",
  );
});

test("the hosting file both backends share does not declare the setting", () => {
  const yaml = readFileSync(join(REPO_ROOT, "apphosting.yaml"), "utf8");
  assert.ok(
    !/EMAIL_AUDIENCE/.test(yaml),
    "apphosting.yaml declares EMAIL_AUDIENCE. Both backends read that file, so a value " +
      "written there is a value staging inherits. The setting is added on each backend itself.",
  );
});

test("the production project the rule names is the one the hosting file names", async () => {
  const { loadTs } = createLoader({ stubs: new Map() });
  const { PRODUCTION_PROJECT_ID } = await loadTs(AUDIENCE);
  const yaml = readFileSync(join(REPO_ROOT, "apphosting.yaml"), "utf8");
  const named = /variable:\s*NEXT_PUBLIC_FIREBASE_PROJECT_ID\s*\n\s*value:\s*(\S+)/.exec(yaml);
  assert.ok(named, "apphosting.yaml no longer sets NEXT_PUBLIC_FIREBASE_PROJECT_ID as a value.");
  assert.equal(
    PRODUCTION_PROJECT_ID,
    named[1],
    "PRODUCTION_PROJECT_ID in src/lib/email/audience.ts is not the project apphosting.yaml " +
      "names. The live site would hold all of its own mail. Change them together.",
  );
});

test("the example environment names the setting and gives it no value", () => {
  const example = readFileSync(join(REPO_ROOT, ".env.example"), "utf8");
  assert.match(
    example,
    /^EMAIL_AUDIENCE=\s*$/m,
    ".env.example must carry `EMAIL_AUDIENCE=` with nothing after it: a copied example that " +
      "said everyone, or listed somebody's address, would be a default nobody chose.",
  );
});

/* -------------------------------------------------------------------------
 * 3. The rule, as a table
 * ---------------------------------------------------------------------- */

const { loadTs: loadPure } = createLoader({ stubs: new Map() });
const audienceModule = await loadPure(AUDIENCE);
const { resolveEmailAudience, splitByAudience, isMisconfiguredProduction } = audienceModule;

const LIVE = "naisi-uk";
const STAGING = "naisi-uk-dev";
const REAL_SMTP = "smtp.example.com";

/** [what it is, environment, expected mode, expected reason] */
const ENVIRONMENTS = [
  ["the live site with its setting", { EMAIL_AUDIENCE: "everyone", NEXT_PUBLIC_FIREBASE_PROJECT_ID: LIVE, SMTP_HOST: REAL_SMTP }, "everyone", "production"],
  ["the live site, setting in capitals and padded", { EMAIL_AUDIENCE: "  Everyone ", NEXT_PUBLIC_FIREBASE_PROJECT_ID: LIVE, SMTP_HOST: REAL_SMTP }, "everyone", "production"],
  ["the live site with the setting missing", { NEXT_PUBLIC_FIREBASE_PROJECT_ID: LIVE, SMTP_HOST: REAL_SMTP }, "listed", "not-everyone"],
  ["the live site with a list where everyone should be", { EMAIL_AUDIENCE: "listed@example.com", NEXT_PUBLIC_FIREBASE_PROJECT_ID: LIVE, SMTP_HOST: REAL_SMTP }, "listed", "not-everyone"],
  ["staging with a list", { EMAIL_AUDIENCE: "listed@example.com, second@example.com", NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING, SMTP_HOST: REAL_SMTP }, "listed", "listed"],
  ["staging with nothing set", { NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING, SMTP_HOST: REAL_SMTP }, "listed", "unset"],
  ["staging with an empty setting", { EMAIL_AUDIENCE: "   ", NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING, SMTP_HOST: REAL_SMTP }, "listed", "unset"],
  ["staging with a setting that is not an address", { EMAIL_AUDIENCE: "true", NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING, SMTP_HOST: REAL_SMTP }, "listed", "unset"],
  ["staging told everyone by mistake", { EMAIL_AUDIENCE: "everyone", NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING, SMTP_HOST: REAL_SMTP }, "listed", "not-production"],
  ["a laptop pointed at the real sender, nothing set", { SMTP_HOST: REAL_SMTP }, "listed", "unset"],
  ["a laptop told everyone, with no project at all", { EMAIL_AUDIENCE: "everyone", SMTP_HOST: REAL_SMTP }, "listed", "not-production"],
  ["a project whose name only starts like the live one", { EMAIL_AUDIENCE: "everyone", NEXT_PUBLIC_FIREBASE_PROJECT_ID: `${LIVE}-dev`, SMTP_HOST: REAL_SMTP }, "listed", "not-production"],
  ["the harness: mail server on this machine", { NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING, SMTP_HOST: "127.0.0.1" }, "everyone", "loopback"],
  ["the harness, by name", { SMTP_HOST: "localhost" }, "everyone", "loopback"],
  ["a mail server that only looks local", { NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING, SMTP_HOST: "127.0.0.1.example.com" }, "listed", "unset"],
  ["no environment at all", {}, "listed", "unset"],
];

for (const [what, env, mode, because] of ENVIRONMENTS) {
  test(`audience: ${what} -> ${mode} (${because})`, () => {
    const audience = resolveEmailAudience(env);
    assert.equal(audience.mode, mode);
    assert.equal(audience.because, because);
    if (audience.mode === "listed" && because !== "listed" && because !== "not-everyone") {
      assert.equal(audience.allow.size, 0, "an audience that is not a list must allow nobody.");
    }
  });
}

test("only the live site without its setting counts as a misconfigured live site", () => {
  const flagged = ENVIRONMENTS.filter(([, env]) => isMisconfiguredProduction(resolveEmailAudience(env)));
  assert.deepEqual(
    flagged.map(([what]) => what),
    ["the live site with the setting missing", "the live site with a list where everyone should be"],
  );
});

test("a list admits its own addresses in any spelling, the harness domain, and nobody else", () => {
  const audience = resolveEmailAudience({
    EMAIL_AUDIENCE: "Listed@Example.com;second@example.com not-an-address",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING,
    SMTP_HOST: REAL_SMTP,
  });
  assert.deepEqual(Array.from(audience.allow).sort(), ["listed@example.com", "second@example.com"]);

  const verdict = splitByAudience(
    [" LISTED@example.com", "stranger@example.com", "fixture@e2e.invalid", "second@example.com", "listed@example.com.attacker.example"],
    audience,
  );
  assert.deepEqual(verdict.allowed, [" LISTED@example.com", "fixture@e2e.invalid", "second@example.com"]);
  assert.deepEqual(verdict.held, ["stranger@example.com", "listed@example.com.attacker.example"]);
});

test("with nothing set, the harness domain is the only thing that gets through", () => {
  const audience = resolveEmailAudience({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING, SMTP_HOST: REAL_SMTP });
  const verdict = splitByAudience(
    ["member@example.com", "fixture@e2e.invalid", "fixture@not-e2e.invalid", "x@e2e.invalid.example.com"],
    audience,
  );
  assert.deepEqual(verdict.allowed, ["fixture@e2e.invalid"]);
  assert.deepEqual(verdict.held, ["member@example.com", "fixture@not-e2e.invalid", "x@e2e.invalid.example.com"]);
});

/* -------------------------------------------------------------------------
 * 4. The decision, executed
 * ---------------------------------------------------------------------- */

const STUBS = new Map([
  ["server-only", "export {};"],
  [
    "nodemailer",
    "export default {\n" +
      "  createTransport: () => ({\n" +
      "    sendMail: async (message) => {\n" +
      "      globalThis.__sentMail.push(message);\n" +
      "      return { messageId: '<test@naisi.uk>', response: '250 Ok' };\n" +
      "    },\n" +
      "  }),\n" +
      "};",
  ],
  ["@react-email/render", "export const render = async () => 'rendered';"],
  ["@/lib/firebase/admin", "export const getAdminDb = () => globalThis.__db ?? null;"],
]);

const { loadTs } = createLoader({ stubs: STUBS });
const { sendEmail } = await loadTs(SEND);

function makeDb(suppressedAddresses = []) {
  const docId = (email) => email.trim().toLowerCase().replace(/[^a-z0-9@._+-]/g, "_");
  const suppressed = new Set(suppressedAddresses.map(docId));
  const rows = [];
  return {
    collection(name) {
      return {
        doc: (id) => ({ collection: name, id }),
        async add(doc) {
          assert.equal(name, "emailSends", `unexpected write to ${name}`);
          rows.push({ ...doc });
          return { id: `row-${rows.length}` };
        },
      };
    },
    async getAll(...refs) {
      return refs.map((ref) => {
        assert.equal(ref.collection, "suppressedEmails", `unexpected read of ${ref.collection}`);
        return { exists: suppressed.has(ref.id), id: ref.id };
      });
    },
    rows,
  };
}

/** Arm the fakes and set exactly the environment a case names. */
function arm(db, env) {
  globalThis.__db = db;
  globalThis.__sentMail = [];
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "harness@test.invalid";
  process.env.SMTP_PASSWORD = "not-a-real-password";
  process.env.SMTP_FROM_EMAIL = "hello@naisi.uk";
  process.env.SMTP_FROM_NAME = "NAISI";
  for (const key of ["EMAIL_AUDIENCE", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "SMTP_HOST"]) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
}

const statusOf = (db, status) => db.rows.filter((r) => r.status === status).map((r) => r.to).sort();

test("staging with nothing set: a member's address is held, logged, and never reaches the provider", async () => {
  const db = makeDb();
  arm(db, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING, SMTP_HOST: REAL_SMTP });

  const result = await sendEmail({
    to: "member@example.com",
    subject: "You're in AGI Strategy",
    react: {},
    kind: "admissions",
    actorUid: "admin-1",
    referenceId: "round-7",
  });

  assert.deepEqual(globalThis.__sentMail, [], "a held address was handed to the provider.");
  assert.equal(result.messageId, "", "nothing was sent, so there is no provider id.");
  assert.deepEqual(result.delivered, []);
  assert.deepEqual(result.held, ["member@example.com"]);
  assert.deepEqual(result.suppressed, []);

  assert.equal(db.rows.length, 1, "the held message left no row, so the rehearsal cannot be counted.");
  const [row] = db.rows;
  assert.equal(row.status, "held");
  assert.equal(row.to, "member@example.com");
  assert.equal(row.subject, "You're in AGI Strategy");
  assert.equal(row.kind, "admissions", "the row carries the kind the send would have carried.");
  assert.equal(row.actorUid, "admin-1");
  assert.equal(row.referenceId, "round-7");
  assert.ok(row.statusReason, "a held row must say why it was held.");
  assert.ok(!("messageId" in row), "nothing was posted, so a provider id would be a fiction.");
});

test("staging with a list: the listed address gets the message, everyone else is held", async () => {
  const db = makeDb();
  arm(db, {
    EMAIL_AUDIENCE: "listed@example.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING,
    SMTP_HOST: REAL_SMTP,
  });

  const result = await sendEmail({
    to: ["member@example.com", "Listed@example.com", "other@example.com"],
    subject: "Send decisions rehearsal",
    react: {},
    kind: "admissions",
  });

  assert.equal(globalThis.__sentMail.length, 1, "one message, for the address that remained.");
  assert.equal(
    globalThis.__sentMail[0].to,
    "Listed@example.com",
    "a held address is still on the envelope, so the hold is cosmetic.",
  );
  assert.deepEqual(result.delivered, ["Listed@example.com"]);
  assert.deepEqual(result.held, ["member@example.com", "other@example.com"]);
  assert.deepEqual(statusOf(db, "sent"), ["Listed@example.com"]);
  assert.deepEqual(statusOf(db, "held"), ["member@example.com", "other@example.com"]);
});

test("staging told everyone by mistake still writes to nobody", async () => {
  const db = makeDb();
  arm(db, { EMAIL_AUDIENCE: "everyone", NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING, SMTP_HOST: REAL_SMTP });

  const result = await sendEmail({ to: "member@example.com", subject: "x", react: {} });

  assert.deepEqual(globalThis.__sentMail, []);
  assert.deepEqual(result.held, ["member@example.com"]);
  assert.deepEqual(statusOf(db, "held"), ["member@example.com"]);
});

test("the live site with its setting writes to everyone, and holds nothing", async () => {
  const db = makeDb();
  arm(db, { EMAIL_AUDIENCE: "everyone", NEXT_PUBLIC_FIREBASE_PROJECT_ID: LIVE, SMTP_HOST: REAL_SMTP });

  const result = await sendEmail({
    to: ["member@example.com", "other@example.com"],
    subject: "Week 3 is up",
    react: {},
    kind: "course-nudge",
  });

  assert.equal(globalThis.__sentMail.length, 1);
  assert.equal(globalThis.__sentMail[0].to, "member@example.com, other@example.com");
  assert.deepEqual(result.delivered, ["member@example.com", "other@example.com"]);
  assert.deepEqual(result.held, []);
  assert.deepEqual(statusOf(db, "held"), []);
  assert.deepEqual(statusOf(db, "sent"), ["member@example.com", "other@example.com"]);
});

test("the live site without its setting holds its mail and says so loudly", async () => {
  const db = makeDb();
  arm(db, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: LIVE, SMTP_HOST: REAL_SMTP });

  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  let result;
  try {
    result = await sendEmail({ to: "member@example.com", subject: "x", react: {} });
  } finally {
    console.error = original;
  }

  assert.deepEqual(globalThis.__sentMail, [], "a missing setting must mean nobody, never everyone.");
  assert.deepEqual(result.held, ["member@example.com"]);
  assert.equal(errors.length, 1, "the live site held its own mail without an error line.");
  assert.match(errors[0], /HELD 1 message/);
});

test("the harness's mail catcher on this machine takes everything", async () => {
  const db = makeDb();
  arm(db, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING, SMTP_HOST: "127.0.0.1" });

  const result = await sendEmail({ to: "fixture@example.com", subject: "x", react: {} });

  assert.equal(globalThis.__sentMail.length, 1);
  assert.deepEqual(result.delivered, ["fixture@example.com"]);
  assert.deepEqual(result.held, []);
});

test("a suppressed address is reported as suppressed wherever it was tried", async () => {
  const db = makeDb(["bounced@example.com"]);
  arm(db, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING, SMTP_HOST: REAL_SMTP });

  const result = await sendEmail({
    to: ["bounced@example.com", "member@example.com", "fixture@e2e.invalid"],
    subject: "x",
    react: {},
  });

  assert.deepEqual(result.suppressed, ["bounced@example.com"]);
  assert.deepEqual(result.held, ["member@example.com"]);
  assert.deepEqual(result.delivered, ["fixture@e2e.invalid"]);
  assert.deepEqual(statusOf(db, "suppressed"), ["bounced@example.com"]);
  assert.deepEqual(statusOf(db, "held"), ["member@example.com"]);
  assert.deepEqual(statusOf(db, "sent"), ["fixture@e2e.invalid"]);
});

test("a server with no database still cannot write to a stranger", async () => {
  arm(null, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING, SMTP_HOST: REAL_SMTP });
  const original = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = await sendEmail({ to: "member@example.com", subject: "x", react: {} });
  } finally {
    console.warn = original;
  }
  assert.deepEqual(globalThis.__sentMail, []);
  assert.deepEqual(result.held, ["member@example.com"]);
});

test("every walked source file is readable", () => {
  const files = sourceFiles();
  assert.ok(files.length > 500, `only ${files.length} source files were walked.`);
});
