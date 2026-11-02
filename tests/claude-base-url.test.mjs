/**
 * THE SITE ONLY EVER SENDS ITS CLAUDE KEY TO ANTHROPIC, or to this machine.
 *
 * The SDK on its own reads `ANTHROPIC_BASE_URL` and sends the backend's key
 * wherever that names. `src/lib/ai/claude.ts` always gives the client an
 * address: Anthropic's, unless the variable names a loopback address, which
 * is how the end-to-end harness points its local server at the fake Claude
 * (`scripts/e2e/lib/fakeClaude.mjs`). Nothing on a deployed backend's loopback
 * answers as Claude, so the worst a stray value can do there is make Claude
 * unreachable; it can never send the key or anybody's words elsewhere.
 *
 * What is held:
 *  1. `claudeBaseUrl` honours plain http to 127.0.0.1 or [::1] and nothing
 *     else, by execution.
 *  2. `claude.ts` is the only file under src that reaches the SDK, and its
 *     one client is built with `baseURL: claudeBaseUrl(...)`.
 *  3. No `apphosting*.yaml` names `ANTHROPIC_BASE_URL`, and no workflow
 *     names it or holds a Claude key: CI's local mode is the fake's.
 *  4. Local mode forces both variables: the key to the fake's non-key and
 *     the address to the fake on loopback.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(REPO_ROOT, path), "utf8");

const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const claude = await loadTs("lib/ai/claude.ts");

test("only plain http to a loopback address is honoured; everything else is Anthropic's API", () => {
  const { claudeBaseUrl, ANTHROPIC_API_URL } = claude;
  assert.equal(ANTHROPIC_API_URL, "https://api.anthropic.com");
  const honoured = [
    ["http://127.0.0.1:3102", "http://127.0.0.1:3102"],
    ["http://127.0.0.1:3102/", "http://127.0.0.1:3102"],
    ["http://[::1]:3102", "http://[::1]:3102"],
  ];
  for (const [value, expected] of honoured) assert.equal(claudeBaseUrl(value), expected, value);
  const ignored = [
    undefined,
    "",
    "not a url",
    "https://api.anthropic.com",
    "https://claude-proxy.example.com",
    "http://claude-proxy.example.com",
    "http://localhost:3102",
    "https://127.0.0.1:3102",
    "http://127.0.0.2:3102",
    "http://10.0.0.1:3102",
    "http://0.0.0.0:3102",
    "http://127.0.0.1.example.com:3102",
    "http://user:pass@127.0.0.1:3102",
    "http://evil.example.com#@127.0.0.1",
    "ftp://127.0.0.1",
  ];
  for (const value of ignored) assert.equal(claudeBaseUrl(value), ANTHROPIC_API_URL, String(value));
});

/** Every file under a directory, recursively. */
function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else out.push(path);
  }
  return out;
}

test("claude.ts is the one door to the SDK, and its client is always given the checked address", () => {
  const reaching = filesUnder(join(REPO_ROOT, "src"))
    .filter((file) => /\.(ts|tsx|js|mjs)$/.test(file))
    .filter((file) => /@anthropic-ai\/sdk|new Anthropic\b/.test(readFileSync(file, "utf8")))
    .map((file) => relative(REPO_ROOT, file));
  assert.deepEqual(reaching, ["src/lib/ai/claude.ts"], "another file reaches the Anthropic SDK");
  const source = read("src/lib/ai/claude.ts");
  const constructions = [...source.matchAll(/new Anthropic\(\{([^}]*)\}\)/g)];
  assert.equal(constructions.length, 1, "claude.ts builds more than one client, or builds it some other way");
  assert.match(constructions[0][1], /\bbaseURL\b/, "the client is built without an address, so the SDK would read ANTHROPIC_BASE_URL itself");
  assert.match(source, /const baseURL = claudeBaseUrl\(/, "the address the client is given is not claudeBaseUrl's");
});

test("no apphosting yaml names ANTHROPIC_BASE_URL, and no workflow names it or holds a Claude key", () => {
  const yamls = readdirSync(REPO_ROOT).filter((name) => /^apphosting(\..+)?\.ya?ml$/.test(name));
  assert.ok(yamls.includes("apphosting.yaml"), "apphosting.yaml is not where this test looks");
  for (const name of yamls) {
    assert.doesNotMatch(read(name), /ANTHROPIC_BASE_URL/, `${name} names ANTHROPIC_BASE_URL`);
  }
  const workflows = join(REPO_ROOT, ".github", "workflows");
  for (const name of readdirSync(workflows).filter((file) => /\.ya?ml$/.test(file))) {
    const text = readFileSync(join(workflows, name), "utf8");
    assert.doesNotMatch(text, /ANTHROPIC_(BASE_URL|API_KEY|AUTH_TOKEN)/, `${name} names a Claude variable: local mode's Claude is the fake`);
  }
});

test("local mode forces the fake's key and a loopback address on the server it starts", async () => {
  const run = read("scripts/e2e/run.mjs");
  assert.match(run, /ANTHROPIC_API_KEY: FAKE_CLAUDE_KEY,/, "run.mjs does not force the fake's key");
  assert.match(run, /ANTHROPIC_BASE_URL: FAKE_CLAUDE_URL,/, "run.mjs does not force the fake's address");
  assert.match(run, /const FAKE_CLAUDE_URL = `http:\/\/\$\{HOST\}:\$\{FAKE_CLAUDE_PORT\}`;/);
  assert.match(run, /const HOST = "127\.0\.0\.1";/);
  const { FAKE_CLAUDE_KEY, FAKE_CLAUDE_PORT } = await import("../scripts/e2e/lib/fakeClaude.mjs");
  assert.doesNotMatch(FAKE_CLAUDE_KEY, /^sk-ant-/, "the fake's key looks like a real one");
  assert.equal(claude.claudeBaseUrl(`http://127.0.0.1:${FAKE_CLAUDE_PORT}`), `http://127.0.0.1:${FAKE_CLAUDE_PORT}`);
});
