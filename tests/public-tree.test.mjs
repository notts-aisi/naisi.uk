/**
 * What the tracked tree does not carry, now that anybody can read it (run via
 * `npm test`, Node's built-in test runner, no dependencies).
 *
 * WHY. This repository is public, and its code is meant to be read. Four kinds
 * of text are not meant to be in it, and each is easy to let in by accident:
 *
 *  1. AN IDENTIFIER OF A LIVE ENVIRONMENT THAT NO FILE NEEDS. A path on
 *     somebody's machine, a service account's address, a numbered cloud
 *     resource, a billing or organisation id. The few that configuration has
 *     to name are listed in ALLOWED, with a reason each.
 *  2. ANYTHING SHAPED LIKE A CREDENTIAL. Secrets are resolved by name where
 *     the site is deployed, and are never written down here.
 *  3. AN ADDRESS THAT MIGHT BE SOMEBODY'S. A fixture uses a reserved domain
 *     (`example.com`, or anything ending `.invalid` or `.test`). Where the
 *     code under test needs a real domain, the address is listed in
 *     KNOWN_ADDRESSES with what it is.
 *  4. THE WORKING LABELS OF A REVIEW. A comment says what the code beside it
 *     does and the rule a maintainer has to keep. Which review found what,
 *     and what is still to do, are kept in the maintainers' own notes. This
 *     check trips on a handful of labels. It does not read prose, so the rule
 *     itself is for whoever writes the comment.
 *
 * A fifth check holds the shape of the tree: nothing git is told to ignore is
 * tracked anyway, and the root holds no document or tool folder beyond the
 * ones listed.
 *
 * Every list is checked in both directions: an entry that excuses nothing any
 * more fails, so a list cannot outlive what it was written for. The walk is
 * over every tracked file, so a new file is held to the same rules without
 * anyone remembering this one exists.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** This file states the patterns and the lists, so it is not searched for them. */
const SELF = "tests/public-tree.test.mjs";

/** Read as bytes by whatever uses them. Nothing in these is searched. */
const BINARY = /\.(?:png|jpe?g|gif|ico|webp|avif|woff2?|ttf|otf|pdf|mp4|zip)$/i;

/**
 * Written by the package manager: hashes and registry addresses, which a
 * shape scan could only misread.
 */
const GENERATED = /(?:^|\/)package-lock\.json$/;

function git(args) {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    // A failed look is a failure, never a pass.
    throw new Error(
      `could not ask git (git ${args.join(" ")}): ${err.message}. This guard reads the tracked tree, so it needs a git checkout.`,
    );
  }
}

const TRACKED = git(["ls-files", "-z"]).split("\0").filter(Boolean);
const SEARCHED = TRACKED.filter((file) => !BINARY.test(file) && !GENERATED.test(file) && file !== SELF);
const TEXT = new Map(SEARCHED.map((file) => [file, readFileSync(join(REPO_ROOT, file), "utf8")]));

/** Every match of a pattern in the searched tree, with where it is. */
function find(pattern) {
  assert.ok(pattern.global, `${pattern} must be a global pattern`);
  const found = [];
  for (const [file, body] of TEXT) {
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      for (const match of lines[i].matchAll(pattern)) {
        found.push({ file, line: i + 1, text: match[0], groups: match });
      }
    }
  }
  return found;
}

const where = (hit) => `${hit.file}:${hit.line}`;

// ---------------------------------------------------------------------------
// 1 and 2. Identifiers and credential shapes
// ---------------------------------------------------------------------------

const IDENTIFIERS = {
  "a path on somebody's machine": /(?:\/Users\/|\/home\/(?!runner\/)|[A-Z]:\\Users\\)[A-Za-z0-9._-]+[/\\]/g,
  "a service account's address": /[A-Za-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com/g,
  "a cloud project by its number": /\bprojects\/\d{6,}\b/g,
  "a Google sign-in client's id": /\b\d{9,}-[0-9a-z]{32}\.apps\.googleusercontent\.com\b/g,
  "a Firebase app id": /\b1:\d{9,}:(?:web|android|ios):[0-9a-f]{6,}\b/g,
  "a messaging sender id": /SENDER_ID["']?\s*[=:]\s*["']?\d{9,}/g,
  "a billing account id": /\b[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}\b/g,
  "an organisation or folder id": /\b(?:organizations|folders)\/\d{6,}\b/g,
  "a repository connection or app installation id": /\bapphosting-github-conn-[a-z0-9]+\b|\binstallations\/\d{5,}\b/g,
  "an identity pool's resource name": /\bworkloadIdentityPools\/[a-z][a-z0-9-]*/g,
};

const CREDENTIALS = {
  "a Google API key": /\bAIza[0-9A-Za-z_-]{35}\b/g,
  "a private key": /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  "a GitHub token": /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})/g,
  "a mail provider key": /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/g,
  "a webhook signing secret": /\bwhsec_[A-Za-z0-9+/=]{20,}/g,
  "a Google sign-in token": /\bya29\.[\w-]{20,}|\b1\/\/0[\w-]{20,}/g,
  "a reCAPTCHA key": /\b6L[0-9A-Za-z_-]{38}\b/g,
};

/**
 * The places where one of the shapes above is meant to be. An entry excuses
 * one kind of thing in one file, whatever its value: the value is
 * configuration and changes without this list having to.
 */
const ALLOWED = [
  {
    file: "apphosting.yaml",
    kind: "a Google sign-in client's id",
    why: "The production site's Google client id. It is inlined into every page's script, so it is public by design.",
  },
  {
    file: ".github/workflows/e2e.yml",
    kind: "a Firebase app id",
    why: "The staging project's public web config, which the loopback build inlines exactly as the deployed site does.",
  },
  {
    file: ".github/workflows/e2e.yml",
    kind: "a messaging sender id",
    why: "The same public web config.",
  },
  {
    file: "scripts/e2e/run.mjs",
    kind: "a reCAPTCHA key",
    why: "Google's published test secret, which accepts every token. It is in Google's own documentation and protects nothing.",
  },
];

const SHAPES = { ...IDENTIFIERS, ...CREDENTIALS };

test("the walk reads the tree", () => {
  assert.ok(SEARCHED.length >= 1000, `only ${SEARCHED.length} files were searched, so the walk is not looking at the tree`);
  assert.ok(TRACKED.includes(SELF), `${SELF} is not where this guard thinks it is`);
  for (const entry of ALLOWED) {
    assert.ok(entry.kind in SHAPES, `ALLOWED names "${entry.kind}", which is not one of the shapes`);
    assert.ok(entry.why.length > 20, `the ALLOWED entry for ${entry.file} needs a reason`);
  }
});

test("each pattern still recognises the thing it is named for", () => {
  // Built here and never written out, so no sample sits in the tree looking
  // like the real thing. A pattern that stopped matching would otherwise pass
  // every file in silence.
  const digits = (n) => "1234567890".repeat(4).slice(0, n);
  const letters = (n) => "abcdefghijklmnopqrstuvwxyz0123456789".repeat(3).slice(0, n);
  const samples = {
    "a path on somebody's machine": ["", "Users", "someone", "code"].join("/") + "/",
    "a service account's address": `builder@some-project.iam.${"gserviceaccount"}.com`,
    "a cloud project by its number": `projects/${digits(12)}`,
    "a Google sign-in client's id": `${digits(12)}-${letters(32)}.apps.${"googleusercontent"}.com`,
    "a Firebase app id": `1:${digits(12)}:web:${"abcdef0123456789".slice(0, 12)}`,
    "a messaging sender id": `SENDER_ID=${digits(12)}`,
    "a billing account id": ["01ABCD", "23EF45", "6789AB"].join("-"),
    "an organisation or folder id": `organizations/${digits(12)}`,
    "a repository connection or app installation id": `apphosting-github-conn-${letters(6)}`,
    "an identity pool's resource name": "workloadIdentityPools/" + "some-pool",
    "a Google API key": "AI" + "za" + letters(35),
    "a private key": ["-----BEGIN", "PRIVATE KEY-----"].join(" "),
    "a GitHub token": "gh" + "p_" + letters(36),
    "a mail provider key": "re" + "_" + letters(8) + "_" + letters(20),
    "a webhook signing secret": "wh" + "sec_" + letters(24),
    "a Google sign-in token": "ya" + "29." + letters(30),
    "a reCAPTCHA key": "6" + "L" + letters(38),
  };
  for (const [kind, pattern] of Object.entries(SHAPES)) {
    assert.ok(kind in samples, `no sample for "${kind}"`);
    assert.ok(new RegExp(pattern.source, pattern.flags).test(samples[kind]), `the pattern for "${kind}" no longer matches its own sample`);
  }
});

test("no identifier of a live environment, and nothing shaped like a credential, outside the listed places", () => {
  const offenders = [];
  const used = new Set();
  for (const [kind, pattern] of Object.entries(SHAPES)) {
    for (const hit of find(pattern)) {
      const entry = ALLOWED.find((a) => a.file === hit.file && a.kind === kind);
      if (entry) used.add(entry);
      // The match itself is not printed: if it is a credential, the test log
      // is one more place it would then be.
      else offenders.push(`${where(hit)} holds ${kind}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "A public file names something of a live environment, or carries something shaped like a credential. " +
      "Take it out. If configuration really has to name it, add the file to ALLOWED with the reason.",
  );
  const unused = ALLOWED.filter((entry) => !used.has(entry)).map((entry) => `${entry.file}: ${entry.kind}`);
  assert.deepEqual(unused, [], "ALLOWED excuses something that is no longer there. Remove the entry.");
});

// ---------------------------------------------------------------------------
// 3. Addresses
// ---------------------------------------------------------------------------

const ADDRESS = /[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})/g;

/** Domains nobody can hold: RFC 2606 and RFC 6761, and any name with an `example` label. */
const reserved = (domain) => /(?:^|\.)example(?:\.|$)/.test(domain) || /\.(?:invalid|test|localhost)$/.test(domain);

/** `icon@2x.png` has the shape of an address and is a file name. */
const fileName = (domain) => /\.(?:png|jpe?g|gif|svg|webp|avif|css|js|mjs|ts|tsx|json|md)$/.test(domain);

/**
 * Every address in the tree that is not on a reserved domain, with what it
 * is. A new fixture should use a reserved domain, or one of these.
 */
const KNOWN_ADDRESSES = [
  {
    why: "Addresses the society publishes or sends from.",
    addresses: ["ai-safety@uonsu.com", "newsletter@naisi.uk", "accounts@naisi.uk"],
  },
  {
    why: "Placeholders and examples in a form, its help text or a comment.",
    addresses: ["you@gmail.com", "you@nottingham.ac.uk", "n@gmail.com", "foo@bar.edu.com"],
  },
  {
    why:
      "Fixtures made up for a test, on a real domain because the code under test tells one domain from another " +
      "(a university address from any other, a sender's own domain, a look-alike domain).",
    addresses: [
      "a@nottingham.ac.uk",
      "ab@nottingham.ac.uk",
      "ada@nottingham.ac.uk",
      "ada.lovelace@nottingham.ac.uk",
      "b@nottingham.ac.uk",
      "fresh@nottingham.ac.uk",
      "owned@nottingham.ac.uk",
      "rae@nottingham.ac.uk",
      "reviewer@nottingham.ac.uk",
      "sam@nottingham.ac.uk",
      "seq@nottingham.ac.uk",
      "someone@nottingham.ac.uk",
      "victim@nottingham.ac.uk",
      "x@nottingham.ac.uk",
      "someone@evil-nottingham.ac.uk",
      "someone@notnottingham.ac.uk.co",
      "ada.personal@gmail.com",
      "e2e-lab@gmail.com",
      "someone@gmail.com",
      "a@b.co",
      "b@c.co",
      "bob@x.com",
      "different@elsewhere.com",
      "committee@naisi.uk",
      "hello@naisi.uk",
    ],
  },
  {
    why: "Not addresses: text with the shape of one (a message id, a calendar entry's id, a URL with a user part).",
    addresses: ["test@naisi.uk", "abc123@naisi.uk", "someone@naisi.uk", "dev.naisi.uk@naisi.uk"],
  },
];

test("every address is on a reserved domain or is listed with what it is", () => {
  const known = new Map();
  for (const group of KNOWN_ADDRESSES) {
    assert.ok(group.why.length > 20, "a KNOWN_ADDRESSES group needs a reason");
    for (const address of group.addresses) {
      assert.equal(address, address.toLowerCase(), `${address} must be listed in lower case`);
      assert.ok(!known.has(address), `${address} is listed twice`);
      assert.ok(!reserved(address.split("@")[1]), `${address} is on a reserved domain and needs no entry`);
      known.set(address, 0);
    }
  }
  const offenders = [];
  for (const hit of find(ADDRESS)) {
    const address = hit.text.toLowerCase();
    const domain = hit.groups[1].toLowerCase();
    if (reserved(domain) || fileName(domain)) continue;
    if (known.has(address)) known.set(address, known.get(address) + 1);
    else offenders.push(`${where(hit)} ${address}`);
  }
  assert.deepEqual(
    offenders,
    [],
    "An address that is not on a reserved domain and is not listed. If it could be a real person's, take it out. " +
      "A fixture should use example.com or a domain ending .invalid; if the code under test needs a real domain, " +
      "reuse a listed address or add this one to KNOWN_ADDRESSES with what it is.",
  );
  const unused = [...known].filter(([, count]) => count === 0).map(([address]) => address);
  assert.deepEqual(unused, [], "KNOWN_ADDRESSES lists an address that is no longer in the tree. Remove it.");
});

// ---------------------------------------------------------------------------
// 4. Review labels
// ---------------------------------------------------------------------------

const REVIEW_LABELS = {
  "a numbered finding": /\bFINDING\s+\d+\b/gi,
  "a finding marked as fixed": /\(FIXED\)/g,
  "a gap marked as proven": /\bPROVEN\s+GAP\b/gi,
  "a note that something is recorded and not approved": /\bRECORDED,?\s+NOT\s+BLESSED\b/gi,
  "a known gap or hole": /\bknown\s+(?:gap|hole)s?\b/gi,
  "a pointer to a queue of work on protections": /\bhardening\s+queue\b/gi,
  "what a red team found": /\bred[- ]team(?:ed|ing)?\s+(?:found|caught|showed|reported)\b/gi,
  "what an audit found": /\baudit\s+(?:found|caught|showed|reported)\b|\bthe\s+audit's\s/gi,
  "what a review found": /\b(?:security|adversarial)\s+(?:review|pass)\s+(?:found|caught|showed|reported)\b/gi,
  "an open finding by severity": /\bopen\s+(?:low|medium|high|critical)\s+finding\b/gi,
  "a risk marked as accepted": /\baccepted\s+risk\b/gi,
};

test("no comment or document carries the working labels of a review", () => {
  const offenders = [];
  for (const [kind, pattern] of Object.entries(REVIEW_LABELS)) {
    for (const hit of find(pattern)) offenders.push(`${where(hit)} reads as ${kind}: "${hit.text}"`);
  }
  assert.deepEqual(
    offenders,
    [],
    "Say what the code does and the rule a maintainer has to keep, in plain words. " +
      "Which review found what, and what is still to do, belong in the maintainers' own notes, not in a public file.",
  );
});

test("each review label still matches the wording it is named for", () => {
  const samples = {
    "a numbered finding": ["FINDING", "2"].join(" "),
    "a finding marked as fixed": "(" + "FIXED" + ")",
    "a gap marked as proven": ["proven", "gap"].join(" "),
    "a note that something is recorded and not approved": ["Recorded,", "not", "blessed"].join(" "),
    "a known gap or hole": ["known", "holes"].join(" "),
    "a pointer to a queue of work on protections": ["hardening", "queue"].join(" "),
    "what a red team found": ["red", "team", "found"].join(" "),
    "what an audit found": ["the", "audit's", "low"].join(" "),
    "what a review found": ["adversarial", "pass", "caught"].join(" "),
    "an open finding by severity": ["open", "low", "finding"].join(" "),
    "a risk marked as accepted": ["accepted", "risk"].join(" "),
  };
  for (const [kind, pattern] of Object.entries(REVIEW_LABELS)) {
    assert.ok(kind in samples, `no sample for "${kind}"`);
    assert.ok(new RegExp(pattern.source, pattern.flags).test(samples[kind]), `the pattern for "${kind}" no longer matches its own sample`);
  }
});

// ---------------------------------------------------------------------------
// 5. The shape of the tree
// ---------------------------------------------------------------------------

/** The documents the root holds. A working note does not belong in the tree. */
const ROOT_DOCUMENTS = {
  "README.md": "What the project is and how to run it.",
  "SECURITY.md": "How to report a problem. security.txt points at it.",
  LICENSE: "The licence the code is offered under.",
};

/** The folders at the root whose name starts with a dot. */
const ROOT_DOT_FOLDERS = {
  ".github": "Workflows, the code scanning config and the dependency update config.",
};

test("nothing git is told to ignore is tracked anyway", () => {
  // The repository's own ignore files only, so the answer is the same on
  // every machine whatever its owner ignores for themselves.
  const both = git(["ls-files", "-z", "-ci", "--exclude-per-directory=.gitignore"]).split("\0").filter(Boolean);
  assert.deepEqual(both, [], "These files are ignored and tracked at once. Untrack them: `git rm --cached <file>`.");
});

test("the root holds only the listed documents and dot folders", () => {
  const atRoot = TRACKED.filter((file) => !file.includes("/"));
  const documents = atRoot.filter((file) => /\.(?:md|markdown|txt|rst)$/i.test(file) || /^[A-Z][A-Z_-]*$/.test(file));
  assert.deepEqual(
    documents.filter((file) => !(file in ROOT_DOCUMENTS)),
    [],
    "A document at the root that is not listed. A note for whoever is working on the code stays out of the tree; " +
      "a document for readers goes under docs/, or is added to ROOT_DOCUMENTS with what it is.",
  );
  assert.deepEqual(Object.keys(ROOT_DOCUMENTS).filter((file) => !atRoot.includes(file)), [], "ROOT_DOCUMENTS lists a file that is gone.");

  const dotFolders = [...new Set(TRACKED.filter((file) => file.startsWith(".") && file.includes("/")).map((file) => file.split("/")[0]))];
  assert.deepEqual(
    dotFolders.filter((folder) => !(folder in ROOT_DOT_FOLDERS)),
    [],
    "A tool's own folder is tracked at the root. Settings for one person's tools stay on their machine; " +
      "if the repository itself needs the folder, add it to ROOT_DOT_FOLDERS with what it is for.",
  );
  assert.deepEqual(Object.keys(ROOT_DOT_FOLDERS).filter((folder) => !dotFolders.includes(folder)), [], "ROOT_DOT_FOLDERS lists a folder that is gone.");
});
