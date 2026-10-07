/**
 * No GET route handler under `src/app/api` performs a state mutation.
 *
 * WHY. A GET is fetched by things that are not the recipient: mail clients,
 * antivirus scanners and inbox preview bots fetch the links in an email to scan
 * them, browsers prefetch, proxies cache. A GET that writes therefore fires on
 * a machine's scan, not a person's decision. A link in an email that confirms
 * or commits something is therefore a GET that shows a preview and a POST that
 * makes the change, as the unsubscribe route does. This guard keeps every GET
 * read-only and catches the next one that is not:
 *
 *  - it walks EVERY `route.ts` under `src/app/api`, isolates each GET handler's
 *    own body (up to the next handler or the end of file), and fails on a
 *    Firestore write in that body — a write on a `ref`/`batch`/`.doc(...)`/
 *    `.collection(...)` receiver — or a call to a known server-side mutation
 *    helper (`MUTATION_HELPERS`), whose own write lives in another file;
 *  - in-memory `Map.set` / `Set.add` are NOT writes and must not trip it, so the
 *    detector keys on the receiver, and a synthetic fixture proves both halves;
 *  - `ALLOWLIST` is a GET that mutates on purpose, with the reason it is safe to
 *    run on a prefetch. It is empty: a confirming or committing GET is the bug
 *    this guard exists for. Both directions, so a stale entry fails too.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = join(REPO_ROOT, "src", "app", "api");

/**
 * Server-side helpers whose whole job is a state mutation. A GET handler must
 * not call one: the primitive write is in the helper's file, so the
 * receiver-based scan below cannot see it in the GET body. Each carries the
 * reason it mutates; the list is checked in both directions against `src` so a
 * rename of one surfaces here rather than silently disarming the check.
 */
const MUTATION_HELPERS = {
  confirmAllForEmail: "flips subscription rows to confirmed and reactivates queued re-subscribes",
  claimGuestSubscriptions: "reassigns guest subscription rows to a member",
  unsubscribeAll: "flips every subscription row for an address to unsubscribed",
  deleteAccountCascade: "tears down an account and everything under it",
  stampVerifiedUniEmailForUser: "stamps the trusted uni-email-verified flag on a user doc",
  markRegistrationPasswordSet: "flips a registration-tracker row",
  markRegistrationProfileComplete: "flips a registration-tracker row",
  // The scan counter for printed QR codes. A count taken on a GET would count
  // link previews and mail scanners, which fetch a URL without running its
  // page: the counting POST is fired by the landing page for exactly that
  // reason, and the short link's own GET must never grow a call to this.
  recordScan: "increments a printed code's scan counter for the day",
  // Not a Firestore write, but a side effect a prefetch/scanner must not
  // trigger: a GET that mails a NAISI-signed message from the sending domain on
  // a machine's fetch is the same hazard class as a GET that writes.
  sendEmail: "sends email from the NAISI domain, a side effect a prefetch must not fire",
  // The application form's editor. Four of its route files hold a GET beside
  // the handler that writes, and every write is made by a helper in
  // `src/lib/applications/editor/write.ts` or by the roles writer, so the scan
  // of a GET's own body would see nothing if one of them were called there.
  createForm: "makes an application form and its first question set",
  changeForm: "changes an application form's name, dates and programme order, and adds a programme",
  createSet: "adds a question set to an application form",
  changeSet: "rewrites the questions in one question set",
  deleteSet: "deletes a question set and takes it out of the form's order",
  changeProgramme: "changes one programme's settings and the wording of its emails",
  setProgrammeRoles: "names a programme's lead and reviewers, which grants access to applications",
  // The applicant's side of the same form. The route that saves a draft holds
  // the GET that reads the application back, and both writes are made in
  // `src/lib/applications/applicant/store.ts`.
  saveDraft: "saves an applicant's draft, and creates the application and moves the round's counters on the first save",
  sendApplication: "makes an applicant's draft the application of record and moves the round's counters",
  // The review screens. The route that lists a programme's applications holds
  // the GET beside the bulk decision, and every write is made in
  // `src/lib/applications/review/`.
  decideMany: "records a programme's decision on several applications at once and logs each one",
  decideApplication: "records a programme's decision on one application and logs it",
  revokeAcceptance: "takes an acceptance back, with the reason, and logs it",
  saveReview: "writes a reviewer's scores and internal comments about an applicant",
  setRevealOtherReviews: "switches what every reviewer on a form is shown on a first review",
  // Pooled applicants and decision day. The pool route and the send route each
  // hold a GET beside the handler that writes, and the writes and the mail are
  // made in `src/lib/applications/decisionDay/`.
  setPooledOutcome: "picks what a pooled applicant hears on decision day, and logs it",
  runDecisionDay: "publishes every applicant's outcome onto their own application and emails them",
  sendTestEmail: "mails one decision-day email to the admin who asked for it",
  sendDecisionEmail: "sends a decision-day email, a side effect a prefetch must not fire",
  // The form's lifecycle. The status route holds no GET today, and the write
  // and the member records are made in `src/lib/applications/lifecycle/move.ts`,
  // so a GET added beside it later could call this and show nothing in its body.
  moveFormStatus: "opens, closes, reopens or settles an application form, and on settling writes every applicant's member record",
};

/**
 * A bare `subscribe(` / `unsubscribe(` would collide with unrelated words, so
 * those two subscription mutators are matched with their call shape instead of
 * living in MUTATION_HELPERS. Kept here so the reason is written down.
 */
const CALL_SHAPE_MUTATORS = [
  // `subscribe(db, {` and `unsubscribe(db, {` — the junction-table mutators.
  /\b(?:un)?subscribe\(\s*db\b/,
];

/**
 * A Firestore write in a handler's OWN body: a write method on a `ref`/`batch`
 * receiver, a `Ref`-suffixed variable, or a `.doc(...)`/`.collection(...)`
 * chain. This deliberately does NOT match `nameByUid.set(...)` or `uids.add(...)`
 * (in-memory Map / Set), because the receiver is neither a ref nor a batch nor a
 * doc/collection chain.
 */
const FIRESTORE_WRITE = [
  /\b(?:ref|batch|[A-Za-z]\w*Ref)\.(?:set|update|delete|add|create|commit)\(/,
  /\.doc\([^)]*\)\.(?:set|update|delete|create)\(/,
  /\.collection\([^)]*\)\.add\(/,
  // Transaction writes: the receiver is the transaction handle, not a ref.
  /\b(?:tx|transaction|trx)\.(?:set|update|delete|create)\(/,
];

const HANDLER = new RegExp(
  "export\\s+(?:async\\s+)?(?:function\\s+(GET|POST|PUT|PATCH|DELETE)\\s*\\(" +
    "|const\\s+(GET|POST|PUT|PATCH|DELETE)\\s*[:=])",
  "g",
);

/** A GET handler that mutates on purpose. Empty by design — see the header. */
const ALLOWLIST = [];

function codeOf(file) {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (entry === "route.ts") yield full;
  }
}

/** The body text of the GET handler in `source`, or null if there is none. */
function getBody(source) {
  HANDLER.lastIndex = 0;
  const marks = [...source.matchAll(HANDLER)].map((m) => ({
    method: m[1] || m[2],
    at: m.index,
  }));
  for (let i = 0; i < marks.length; i += 1) {
    if (marks[i].method !== "GET") continue;
    const end = i + 1 < marks.length ? marks[i + 1].at : source.length;
    return source.slice(marks[i].at, end);
  }
  return null;
}

/** Every reason this GET body counts as a mutation (empty array if read-only). */
function mutationsIn(body) {
  const hits = [];
  for (const re of FIRESTORE_WRITE) {
    const m = body.match(re);
    if (m) hits.push(`Firestore write: ${m[0]}`);
  }
  for (const [name, why] of Object.entries(MUTATION_HELPERS)) {
    if (new RegExp(`\\b${name}\\(`).test(body)) hits.push(`${name}() — ${why}`);
  }
  for (const re of CALL_SHAPE_MUTATORS) {
    const m = body.match(re);
    if (m) hits.push(`mutator call: ${m[0]}`);
  }
  return hits;
}

test("the detector sees a Firestore write and ignores an in-memory Map/Set", () => {
  const writes = [
    "export async function GET() { await ref.set({ a: 1 }); }",
    "export async function GET() { await userRef.update({ a: 1 }); }",
    "export async function GET() { batch.commit(); }",
    'export async function GET() { await db.collection("x").doc(id).set({}); }',
    'export async function GET() { await db.collection("x").add({}); }',
    "export async function GET() { await confirmAllForEmail(db, e, a); }",
    "export async function GET() { await subscribe(db, { email }); }",
    "export async function GET() { await db.runTransaction(async (tx) => { tx.update(ref, {}); }); }",
    "export async function GET() { await sendEmail({ to, subject }); }",
  ];
  for (const src of writes) {
    assert.ok(mutationsIn(getBody(src)).length > 0, `should flag a write: ${src}`);
  }
  const reads = [
    "export async function GET() { const m = new Map(); m.set(uid, name); return m; }",
    "export async function GET() { const s = new Set(); s.add(uid); nameByUid.set(id, x); }",
    "export async function GET() { const uids = new Set(); uids.add(app.uid); }",
    'export async function GET() { const snap = await ref.get(); return snap.data(); }',
    "export async function GET() { runById.set(doc.id, normalize(doc)); }",
  ];
  for (const src of reads) {
    assert.deepEqual(
      mutationsIn(getBody(src)),
      [],
      `must NOT flag an in-memory Map/Set or a read: ${src}`,
    );
  }
});

function collectTs(dir) {
  let out = "";
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out += collectTs(full);
    else if (/\.tsx?$/.test(entry)) out += "\n" + readFileSync(full, "utf8");
  }
  return out;
}

test("every mutation helper still exists in src, so a rename cannot disarm the scan", () => {
  const allSrc = collectTs(join(REPO_ROOT, "src"));
  for (const name of Object.keys(MUTATION_HELPERS)) {
    assert.ok(
      new RegExp(`\\b${name}\\s*[(=]|\\bfunction\\s+${name}\\b`).test(allSrc),
      `MUTATION_HELPERS names ${name}, which no longer appears in src. If it was ` +
        "renamed, rename it here too, or the scan is checking for a dead symbol.",
    );
  }
});

test("no GET handler under /api mutates state", () => {
  const offenders = [];
  const exempt = new Set(ALLOWLIST.map(([p]) => p));
  const seen = new Set();
  for (const file of walk(API_DIR)) {
    const path = relative(REPO_ROOT, file).split("\\").join("/");
    const body = getBody(codeOf(file));
    if (body === null) continue;
    const hits = mutationsIn(body);
    if (hits.length === 0) continue;
    seen.add(path);
    if (!exempt.has(path)) offenders.push(`${path}: ${hits.join("; ")}`);
  }
  assert.deepEqual(
    offenders,
    [],
    "These GET handlers mutate state. A GET is fetched by prefetchers and " +
      "scanners, so the write fires without a person's decision. Move the " +
      "mutation to POST (a GET preview, a POST commit — see the unsubscribe and " +
      "subscriptions/confirm routes), or add the route to ALLOWLIST with the " +
      "reason it is safe on a prefetch.",
  );
  const stale = [...exempt].filter((p) => !seen.has(p));
  assert.deepEqual(
    stale,
    [],
    "These ALLOWLIST routes no longer have a mutating GET: remove them.",
  );
});
