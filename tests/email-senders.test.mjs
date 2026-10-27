/**
 * Two addresses mail comes from: an issue of the newsletter comes from the
 * newsletter's own, and every other message the site sends from the default.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials, no
 * network).
 *
 * ## The rule this guards
 *
 * `sendEmail()` in `src/lib/email/send.ts` picks the address through
 * `fromAddressFor()`. A call that passes `sender: "newsletter"` comes from
 * `NEWSLETTER_FROM_EMAIL`, or from `SMTP_FROM_EMAIL` when that is unset or
 * blank; every other call comes from `SMTP_FROM_EMAIL`. Somebody who filters
 * their inbox on the newsletter's address has to get the newsletter and
 * nothing else, so the rule is held four ways:
 *
 *  1. by WALKING `src`: every call to `sendEmail` is read with the compiler's
 *     parser. Only the newsletter's own sends (`NEWSLETTER_SENDS` below) pass
 *     `sender`, every call in them does, a call whose kind can be
 *     "newsletter" does too, and no file but the send helper reads
 *     `NEWSLETTER_FROM_EMAIL` or names an address mail is sent from. A call
 *     the walk cannot read (its arguments in a variable or a spread, `sender`
 *     or `kind` without a value written out) fails here rather than being
 *     skipped;
 *  2. by EXECUTING the send helper with a fake transport: the From header and
 *     the `emailSends` row carry the address the rule picks, for both senders,
 *     for the fallback, and for a recipient held or suppressed;
 *  3. by EXECUTING the two newsletter routes: each hands the newsletter's
 *     sender to every message it sends;
 *  4. by READING `apphosting.yaml`, which both backends read: it declares the
 *     two addresses, apart, for the running server only.
 *
 * Faked for (2): `nodemailer`, `@react-email/render`, `server-only` and
 * `@/lib/firebase/admin`, as in `tests/email-suppression-chokepoint.test.mjs`.
 * Faked for (3): the session, the Admin SDK, the send helper itself (so the
 * suite records what each route hands it), the push leg, the signed tokens
 * and the two reads the send route makes around the mailing list. The
 * newsletter template and the preference read are the real ones. Nothing here
 * can reach a Firestore project or a mail server.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { walkSource } from "./lib/functionScan.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const rel = (file) => relative(REPO_ROOT, file).split(sep).join("/");

/** The send helper, and the one file in `src` that may read the newsletter's variable. */
const SEND = "src/lib/email/send.ts";

/**
 * The newsletter's own sends: each file, how many times it calls `sendEmail`,
 * and why it is here. Every one of those calls passes `sender: "newsletter"`,
 * and no call anywhere else does. A new send of an issue is added here, with
 * its reason, in the change that writes it.
 */
const NEWSLETTER_SENDS = new Map([
  [
    "src/app/api/newsletter/[id]/send/route.ts",
    { calls: 1, why: "the send of an approved issue to everybody on the newsletter's list" },
  ],
  [
    "src/app/api/newsletter/[id]/send-test/route.ts",
    { calls: 1, why: "the test send of an issue to its editor, which has to look as the issue will" },
  ],
]);

/** The addresses mail is sent from. Configuration, so no file in `src` names one. */
const SENDING_ADDRESSES = ["newsletter@naisi.uk", "notifications@naisi.uk"];

// ===========================================================================
// 1. The tree, read
// ===========================================================================

const parse = (file, text) =>
  ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

/** Every string a value is written as: a literal, or each literal inside an expression. */
function literalsIn(node) {
  const found = [];
  const visit = (child) => {
    if (ts.isStringLiteralLike(child)) found.push(child.text);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

/**
 * One call of `sendEmail(...)`, read: where it is, the sender it passes (null
 * for none), and the kinds it can log. A call this cannot read is returned
 * with `unread` saying why, never dropped.
 */
function readCall(file, tree, node) {
  const where = `${file}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}`;
  const [argument] = node.arguments;
  if (node.arguments.length !== 1 || !ts.isObjectLiteralExpression(argument)) {
    return { file, where, unread: "its arguments are not one object written out where it is called" };
  }
  let sender = null;
  let kinds = [];
  for (const property of argument.properties) {
    if (ts.isSpreadAssignment(property)) {
      return { file, where, unread: "it spreads another object into its arguments" };
    }
    const name =
      property.name && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))
        ? property.name.text
        : null;
    if (name === null) return { file, where, unread: "one of its properties has a computed name" };
    if (name !== "sender" && name !== "kind") continue;
    if (!ts.isPropertyAssignment(property)) {
      return { file, where, unread: `its \`${name}\` is handed on from a variable of the same name` };
    }
    if (name === "sender") {
      if (!ts.isStringLiteralLike(property.initializer)) {
        return { file, where, unread: "its `sender` is worked out rather than written" };
      }
      sender = property.initializer.text;
    } else {
      kinds = literalsIn(property.initializer);
      if (kinds.length === 0) {
        return { file, where, unread: "its `kind` is worked out from a variable, so the walk cannot tell what it logs" };
      }
    }
  }
  return { file, where, sender, kinds };
}

/** Every call of `sendEmail(...)` under `src`. The declaration in the helper is not a call. */
function sendCalls() {
  const calls = [];
  for (const path of walkSource(SRC)) {
    const text = readFileSync(path, "utf8");
    if (!text.includes("sendEmail")) continue;
    const file = rel(path);
    const tree = parse(file, text);
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "sendEmail") {
        calls.push(readCall(file, tree, node));
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  return calls;
}

/**
 * Every file whose CODE names `name`: as an identifier (`process.env.X`, a
 * destructured `{ X }`) or as a string (`env["X"]`). A comment is not code,
 * so a comment naming the variable is not a read of it.
 */
function filesNaming(name) {
  const found = [];
  for (const path of walkSource(SRC)) {
    const text = readFileSync(path, "utf8");
    if (!text.includes(name)) continue;
    const file = rel(path);
    let named = false;
    const visit = (node) => {
      if ((ts.isIdentifier(node) || ts.isStringLiteralLike(node)) && node.text === name) named = true;
      if (!named) ts.forEachChild(node, visit);
    };
    visit(parse(file, text));
    if (named) found.push(file);
  }
  return found;
}

const CALLS = sendCalls();

describe("the tree: only the newsletter's own sends choose its address", () => {
  test("the walk reads every call to sendEmail, and sees the ones it exists for", () => {
    const unread = CALLS.filter((call) => call.unread).map((call) => `${call.where}: ${call.unread}`);
    assert.deepEqual(
      unread,
      [],
      "a call to sendEmail this guard cannot read. Which address a message comes from has to be " +
        "visible where it is sent, so write the arguments out as one object, with `sender` and " +
        "`kind` given as values, rather than handing them on in a variable or a spread.",
    );
    assert.ok(CALLS.length > 30, `only ${CALLS.length} calls of sendEmail were found; the walk has stopped seeing them.`);
    for (const file of [
      ...NEWSLETTER_SENDS.keys(),
      // The course announcement renders the newsletter's template, and is the
      // send most easily mistaken for an issue. It must come from the default.
      "src/lib/email/courseFacilitatorEmails.ts",
      // The notice lane's one door, which every notice reaches the send through.
      "src/lib/email/notice.ts",
    ]) {
      assert.ok(CALLS.some((call) => call.file === file), `the walk did not see the sends in ${file}`);
    }
  });

  test("every listed newsletter send passes the newsletter's sender, on every call", () => {
    for (const [file, { calls, why }] of NEWSLETTER_SENDS) {
      assert.ok(why.length > 30, `${file} needs a written reason`);
      const inFile = CALLS.filter((call) => call.file === file);
      assert.equal(
        inFile.length,
        calls,
        `${file} calls sendEmail ${inFile.length} time(s), and this list says ${calls}. A send added to ` +
          "a newsletter route is a decision about which address it comes from: make it, then change the count.",
      );
      for (const call of inFile) {
        assert.equal(
          call.sender,
          "newsletter",
          `${call.where} sends for the newsletter without \`sender: "newsletter"\`, so the issue would ` +
            "come from the address every notification uses.",
        );
      }
    }
  });

  test("no other send passes a sender, so every other message comes from the default", () => {
    const strays = CALLS.filter((call) => !call.unread && call.sender !== null && !NEWSLETTER_SENDS.has(call.file)).map(
      (call) => `${call.where} passes sender "${call.sender}"`,
    );
    assert.deepEqual(
      strays,
      [],
      "a send that is not one of the newsletter's own chooses a sender. Everything but an issue of " +
        "the newsletter comes from SMTP_FROM_EMAIL: take `sender` out, or if this really sends an " +
        "issue, add its file to NEWSLETTER_SENDS with the reason.",
    );
  });

  test("a send that logs as the newsletter comes from the newsletter's address", () => {
    const unmatched = CALLS.filter(
      (call) => !call.unread && call.kinds.includes("newsletter") && call.sender !== "newsletter",
    ).map((call) => call.where);
    assert.deepEqual(
      unmatched,
      [],
      "a send whose kind can be \"newsletter\" does not pass `sender: \"newsletter\"`. The deliverability " +
        "tab would count it as an issue that came from the notifications address.",
    );
    assert.ok(
      CALLS.some((call) => !call.unread && call.kinds.includes("newsletter")),
      "no send logs as the newsletter any more; re-read this guard.",
    );
  });

  test("only the send helper reads the newsletter's variable", () => {
    assert.deepEqual(
      filesNaming("NEWSLETTER_FROM_EMAIL"),
      [SEND],
      "a file other than the send helper reads NEWSLETTER_FROM_EMAIL. One place decides which " +
        "address a message comes from; a second reader is a second rule, and a send that builds " +
        "its own From line around it is a way round the first.",
    );
  });

  test("no file in src names an address mail is sent from", () => {
    const offenders = [];
    for (const path of walkSource(SRC)) {
      const text = readFileSync(path, "utf8").toLowerCase();
      for (const address of SENDING_ADDRESSES) {
        if (text.includes(address)) offenders.push(`${rel(path)}: ${address}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "a file in src names an address mail is sent from, in code or in a comment. The addresses are " +
        "configuration (apphosting.yaml): code reads the variable, and a comment that names the " +
        "address goes stale the day the configuration changes it.",
    );
  });
});

// ===========================================================================
// 2. The send helper, executed
// ===========================================================================

const SEND_STUBS = new Map([
  ["server-only", "export {};"],
  [
    "nodemailer",
    "export default {\n" +
      "  createTransport: () => ({\n" +
      "    sendMail: async (message) => {\n" +
      "      globalThis.__sentMail.push(message);\n" +
      "      return { messageId: '<test@senders.invalid>', response: '250 Ok' };\n" +
      "    },\n" +
      "  }),\n" +
      "};",
  ],
  ["@react-email/render", "export const render = async () => 'rendered';"],
  ["@/lib/firebase/admin", "export const getAdminDb = () => globalThis.__db ?? null;"],
]);

const { sendEmail, fromAddressFor } = await createLoader({ stubs: SEND_STUBS }).loadTs(join(REPO_ROOT, SEND));

/** The two addresses, on a domain nobody can hold. */
const NOTIFY = "notify@senders.invalid";
const ISSUE = "issue@senders.invalid";

/** Doc-id reads of `suppressedEmails` and adds to `emailSends`: all the helper does. */
function makeSendDb(suppressedAddresses = []) {
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
      return refs.map((ref) => ({ exists: suppressed.has(ref.id), id: ref.id }));
    },
    rows,
  };
}

const ENV_NAMES = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM_EMAIL",
  "SMTP_FROM_NAME",
  "NEWSLETTER_FROM_EMAIL",
  "EMAIL_AUDIENCE",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
];

/**
 * Set exactly the environment a case names, over a mail server on this
 * machine (which the audience lets everything through to) and both addresses
 * set. A key given as undefined is removed.
 */
function arm(db, env = {}) {
  globalThis.__db = db;
  globalThis.__sentMail = [];
  const base = {
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "587",
    SMTP_USER: "harness@senders.invalid",
    SMTP_PASSWORD: "not-a-real-password",
    SMTP_FROM_EMAIL: NOTIFY,
    SMTP_FROM_NAME: "NAISI",
    NEWSLETTER_FROM_EMAIL: ISSUE,
  };
  const wanted = { ...base, ...env };
  for (const name of ENV_NAMES) {
    if (wanted[name] === undefined) delete process.env[name];
    else process.env[name] = wanted[name];
  }
}

const message = { subject: "What we did in October", react: {} };

describe("fromAddressFor: which address, from the environment", () => {
  test("the default is SMTP_FROM_EMAIL, and the newsletter's variable never reaches it", () => {
    assert.equal(fromAddressFor(undefined, { SMTP_FROM_EMAIL: NOTIFY, NEWSLETTER_FROM_EMAIL: ISSUE }), NOTIFY);
  });

  test("the newsletter comes from its own variable", () => {
    assert.equal(fromAddressFor("newsletter", { SMTP_FROM_EMAIL: NOTIFY, NEWSLETTER_FROM_EMAIL: ISSUE }), ISSUE);
  });

  test("with its variable unset or blank, the newsletter falls back to the default", () => {
    assert.equal(fromAddressFor("newsletter", { SMTP_FROM_EMAIL: NOTIFY }), NOTIFY);
    assert.equal(
      fromAddressFor("newsletter", { SMTP_FROM_EMAIL: NOTIFY, NEWSLETTER_FROM_EMAIL: "   " }),
      NOTIFY,
      "a setting left blank is a setting not made, not an address of nothing",
    );
  });

  test("with no sending address at all, both fall back to the mail account, as before", () => {
    assert.equal(fromAddressFor(undefined, { SMTP_USER: "account@senders.invalid" }), "account@senders.invalid");
    assert.equal(fromAddressFor("newsletter", { SMTP_USER: "account@senders.invalid" }), "account@senders.invalid");
    assert.equal(fromAddressFor(undefined, {}), undefined);
  });

  test("a newsletter address set with spaces around it is the address", () => {
    assert.equal(fromAddressFor("newsletter", { SMTP_FROM_EMAIL: NOTIFY, NEWSLETTER_FROM_EMAIL: ` ${ISSUE} ` }), ISSUE);
  });
});

describe("sendEmail: the From line and the log say the same address", () => {
  test("a message that chooses no sender comes from the default", async () => {
    const db = makeSendDb();
    arm(db);
    await sendEmail({ to: "member@e2e.invalid", ...message, kind: "task" });
    assert.equal(globalThis.__sentMail.length, 1);
    assert.equal(globalThis.__sentMail[0].from, `"NAISI" <${NOTIFY}>`);
    assert.equal(db.rows[0].fromEmail, NOTIFY);
  });

  test("an issue of the newsletter comes from the newsletter's address", async () => {
    const db = makeSendDb();
    arm(db);
    await sendEmail({ to: "reader@e2e.invalid", ...message, sender: "newsletter", kind: "newsletter" });
    assert.equal(globalThis.__sentMail[0].from, `"NAISI" <${ISSUE}>`);
    assert.equal(db.rows[0].fromEmail, ISSUE, "the deliverability tab has to show the address the issue really came from");
    assert.equal(db.rows[0].fromName, "NAISI", "the display name is the same for both addresses");
  });

  test("with the newsletter's variable unset, the issue comes from the default, as it did before", async () => {
    const db = makeSendDb();
    arm(db, { NEWSLETTER_FROM_EMAIL: undefined });
    await sendEmail({ to: "reader@e2e.invalid", ...message, sender: "newsletter", kind: "newsletter" });
    assert.equal(globalThis.__sentMail[0].from, `"NAISI" <${NOTIFY}>`);
    assert.equal(db.rows[0].fromEmail, NOTIFY);
  });

  test("a display name a call passes still applies to the newsletter's address", async () => {
    const db = makeSendDb();
    arm(db);
    await sendEmail({ to: "reader@e2e.invalid", ...message, sender: "newsletter", fromName: "NAISI Newsletter" });
    assert.equal(globalThis.__sentMail[0].from, `"NAISI Newsletter" <${ISSUE}>`);
  });

  test("a recipient held or suppressed is logged with the address the message would have come from", async () => {
    const db = makeSendDb(["bounced@e2e.invalid"]);
    // A real mail server's name (never contacted: the transport is faked), a
    // copy of the site that is not the live one, and one address it may write to.
    arm(db, {
      SMTP_HOST: "smtp.senders.invalid",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "a-staging-project",
      EMAIL_AUDIENCE: "kept@e2e.invalid",
    });
    const result = await sendEmail({
      to: ["kept@e2e.invalid", "held@e2e.invalid", "bounced@e2e.invalid"],
      ...message,
      sender: "newsletter",
      kind: "newsletter",
    });
    assert.deepEqual(result.delivered, ["kept@e2e.invalid"]);
    assert.deepEqual(result.held, ["held@e2e.invalid"]);
    assert.deepEqual(result.suppressed, ["bounced@e2e.invalid"]);
    assert.equal(globalThis.__sentMail[0].from, `"NAISI" <${ISSUE}>`);
    const fromBy = Object.fromEntries(db.rows.map((row) => [row.status, row.fromEmail]));
    assert.deepEqual(fromBy, { sent: ISSUE, held: ISSUE, suppressed: ISSUE });
  });
});

// ===========================================================================
// 3. The two newsletter routes, executed
// ===========================================================================

const FIRESTORE_STUB =
  "export const FieldValue = {\n" +
  "  serverTimestamp: () => ({ __op: 'serverTimestamp' }),\n" +
  "  delete: () => ({ __op: 'delete' }),\n" +
  "};";

const NEXT_RESPONSE_STUB =
  "export const NextResponse = {\n" +
  "  json(body, init) {\n" +
  "    return { status: (init && init.status) || 200, body };\n" +
  "  },\n};";

const routeLoader = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["next/server", NEXT_RESPONSE_STUB],
    ["firebase-admin/firestore", FIRESTORE_STUB],
    ["@/lib/firebase/admin", "export const getAdminDb = () => globalThis.__db ?? null;"],
    ["@/lib/firebase/session", "export const getCurrentUser = async () => globalThis.__user ?? null;"],
    [
      "@/lib/email/send",
      "export const sendEmail = async (args) => { (globalThis.__sent ||= []).push(args); return { delivered: [args.to] }; };",
    ],
    [
      "@/lib/firestore/suppression",
      "export const filterSuppressed = async (db, addrs) => ({ allowed: addrs, suppressed: [] });",
    ],
    [
      "@/lib/firestore/subscriptions",
      "export const findRecipientsForChannel = async () => globalThis.__channelRows ?? [];",
    ],
    ["@/lib/push/rowAudience", "export const sendPushToRowAudience = async () => ({ pushed: 0, refusal: null });"],
    ["@/lib/signedTokens", "export const signToken = (payload) => `tok:${JSON.stringify(payload)}`;"],
  ]),
});

const sendRoute = await routeLoader.loadTs("app/api/newsletter/[id]/send/route.ts");
const sendTestRoute = await routeLoader.loadTs("app/api/newsletter/[id]/send-test/route.ts");

/** Doc gets, `getAll`, `update` and a transaction: what the two routes use. */
function makeRouteDb(store) {
  const data = structuredClone(store);
  const snapOf = (collection, id) => ({
    id,
    exists: Object.hasOwn(data[collection] ?? {}, id),
    data: () => data[collection]?.[id],
  });
  const write = (ref, patch) => {
    const next = { ...(data[ref.collection]?.[ref.id] ?? {}), ...patch };
    for (const [key, value] of Object.entries(next)) if (value?.__op === "delete") delete next[key];
    (data[ref.collection] ??= {})[ref.id] = next;
  };
  const docRef = (collection, id) => {
    const ref = { collection, id };
    ref.get = async () => snapOf(collection, id);
    ref.update = async (patch) => write(ref, patch);
    return ref;
  };
  return {
    data,
    collection: (name) => ({ doc: (id) => docRef(name, id) }),
    getAll: async (...refs) => refs.map((ref) => snapOf(ref.collection, ref.id)),
    runTransaction: async (fn) =>
      fn({ get: async (ref) => snapOf(ref.collection, ref.id), update: (ref, patch) => write(ref, patch) }),
  };
}

const ctxFor = (id) => ({ params: Promise.resolve({ id }) });

function seedRoutes(status) {
  // The member's university address is only written to outside the mode that
  // keeps the newsletter to the address somebody signed in with.
  delete process.env.EMAIL_GMAIL_ONLY_MODE;
  globalThis.__sent = [];
  globalThis.__user = { uid: "approver-1", role: "admin", permissions: {}, email: "approver@e2e.invalid" };
  // One member who takes the newsletter at two addresses, and one guest.
  globalThis.__channelRows = [
    { email: "ada@e2e.invalid", audience: "user", audienceId: "member-1" },
    { email: "guest@e2e.invalid", audience: "guest", audienceId: "guest@e2e.invalid" },
  ];
  globalThis.__db = makeRouteDb({
    users: {
      "member-1": {
        email: "ada@e2e.invalid",
        profile: {
          preferredName: "Ada",
          universityEmail: "ada@nottingham.ac.uk",
          notifications: { channels: { gmail: true, uniEmail: true }, categories: { newsletter: true } },
        },
      },
      "approver-1": {
        email: "approver@e2e.invalid",
        profile: { preferredName: "Sam", universityEmail: "sam@nottingham.ac.uk" },
      },
    },
    newsletterDrafts: {
      "draft-1": {
        subject: "What we did in October",
        status,
        blocks: [{ id: "b1", type: "richText", html: "<p>Hello</p>" }],
      },
    },
  });
}

describe("the newsletter's two routes hand its sender to every message", () => {
  test("the send of an issue: every address, member and guest, gets it from the newsletter's address", async () => {
    seedRoutes("approved");
    const res = await sendRoute.POST({}, ctxFor("draft-1"));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(
      globalThis.__sent.map((args) => args.to).sort(),
      ["ada@e2e.invalid", "ada@nottingham.ac.uk", "guest@e2e.invalid"],
    );
    for (const args of globalThis.__sent) {
      assert.equal(args.sender, "newsletter", `the issue sent to ${args.to} would come from the default address`);
      assert.equal(args.kind, "newsletter");
    }
  });

  test("the test send: both of the editor's inboxes get it from the address the issue will", async () => {
    seedRoutes("draft");
    const res = await sendTestRoute.POST({}, ctxFor("draft-1"));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(globalThis.__sent.map((args) => args.to), ["approver@e2e.invalid", "sam@nottingham.ac.uk"]);
    for (const args of globalThis.__sent) {
      assert.equal(args.sender, "newsletter", `the rehearsal sent to ${args.to} would come from the default address`);
    }
  });
});

// ===========================================================================
// 4. The hosting file both backends read
// ===========================================================================

/** One `- variable:` entry of apphosting.yaml: its value and where it is available. */
function yamlEntry(yaml, name) {
  const block = new RegExp(
    `-\\s*variable:\\s*${name}\\s*\\n\\s*value:\\s*(\\S+)\\s*\\n\\s*availability:\\s*\\[([^\\]]*)\\]`,
  ).exec(yaml);
  assert.ok(block, `apphosting.yaml no longer sets ${name} as a value with an availability.`);
  return { value: block[1], availability: block[2].split(",").map((part) => part.trim()) };
}

describe("apphosting.yaml declares the two addresses, apart", () => {
  const yaml = readFileSync(join(REPO_ROOT, "apphosting.yaml"), "utf8");

  test("everything but the newsletter comes from notifications@, the newsletter from newsletter@", () => {
    const notifications = yamlEntry(yaml, "SMTP_FROM_EMAIL");
    const newsletter = yamlEntry(yaml, "NEWSLETTER_FROM_EMAIL");
    assert.equal(notifications.value, "notifications@naisi.uk");
    assert.equal(newsletter.value, "newsletter@naisi.uk");
    assert.notEqual(notifications.value, newsletter.value, "one address for both is the arrangement this replaced");
  });

  test("both are read by the running server only", () => {
    // Neither is a NEXT_PUBLIC_ value, so neither is needed while the site is
    // built, and the send helper reads both as it sends.
    assert.deepEqual(yamlEntry(yaml, "SMTP_FROM_EMAIL").availability, ["RUNTIME"]);
    assert.deepEqual(yamlEntry(yaml, "NEWSLETTER_FROM_EMAIL").availability, ["RUNTIME"]);
  });

  test("each is declared once", () => {
    for (const name of ["SMTP_FROM_EMAIL", "NEWSLETTER_FROM_EMAIL"]) {
      const count = yaml.split("\n").filter((line) => new RegExp(`^\\s*-\\s*variable:\\s*${name}\\s*$`).test(line)).length;
      assert.equal(count, 1, `apphosting.yaml declares ${name} ${count} times; the last one read would win silently.`);
    }
  });
});
