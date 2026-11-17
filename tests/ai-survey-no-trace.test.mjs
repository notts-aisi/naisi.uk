/**
 * NOTHING IN THE AI AT NOTTINGHAM SURVEY CAN SAY WHOSE ANSWERS ARE WHOSE.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * WHY. The survey's start screen tells every student "we can't tell which
 * answers are yours", and its notice says answers are stored with no name,
 * email, account or IP address, and with no date or time. A sentence like
 * that is broken by one line added later: a session read "to say hello", a
 * header logged while debugging, a row in the send log, a timestamp beside an
 * answer, the short link somebody arrived by. So this guard WALKS THE TREE,
 * every file of the survey, and fails on any of them:
 *
 *  1. NOBODY IS ASKED WHO THEY ARE. No file a student's request passes
 *     through reads a session, a cookie, a header or an IP address, or the
 *     address bar's query. There is no limit by IP address: a room of
 *     students shares a few.
 *  2. NOTHING IS LOGGED but that something happened. No log line takes a
 *     value.
 *  3. AN ADDRESS NEVER MEETS AN ANSWER. The site's send log is never written
 *     for the code email; one function sends it, from one file. The file that
 *     checks a code never names the answers.
 *  4. AN ANSWER SET HOLDS FOUR THINGS: the survey's version, the order of the
 *     proposal pages, its pages, and that it is finished. No time is written
 *     anywhere but on the survey's own state.
 *  5. THE BROWSER sends no cookie and no referrer with a save, keeps one key
 *     and no answer, and loads one outside script, on the email step alone.
 *  6. THE PAGES are kept out of search, and the page a printed code lands on
 *     never answers with an empty body.
 *
 * `tests/ai-survey.test.mjs` runs the survey's own code.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (file) => relative(REPO_ROOT, file).split("\\").join("/");
const read = (path) => readFileSync(join(REPO_ROOT, path), "utf8");
/** Code with its strings, comments gone. */
const codeOf = (path) => stripSource(read(path), { keepStrings: true });

/** Every tree the survey owns. A file added to any of them is walked from the commit that adds it. */
const OWN_ROOTS = ["src/lib/aiSurvey", "src/features/aiSurvey", "src/app/ai-survey", "src/app/api/ai-survey", "src/content/aiSurvey"];

function walk(dir, into = []) {
  if (!existsSync(dir)) return into;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, into);
    else if (/\.(ts|tsx)$/.test(name)) into.push(rel(full));
  }
  return into;
}

const OWN = OWN_ROOTS.flatMap((root) => walk(join(REPO_ROOT, root))).sort();

/**
 * The survey's admin side: the one account that may open it, and the routes
 * only that account reaches. These read a session, because they must. They
 * are listed by PATH PREFIX, so a new admin file is covered and a new public
 * file is not let off by accident. Everything else in `OWN` is a file a
 * student's request can pass through.
 */
const ADMIN_SIDE = ["src/app/ai-survey/admin/", "src/app/api/ai-survey/admin/", "src/lib/aiSurvey/admin", "src/features/aiSurvey/admin/"];
const isAdminSide = (file) => ADMIN_SIDE.some((prefix) => file.startsWith(prefix));
const PUBLIC_SIDE = OWN.filter((file) => !isAdminSide(file));

describe("the walk", () => {
  test("it found the survey's code", () => {
    assert.ok(OWN.length >= 20, `only ${OWN.length} files found: the walk has lost the survey`);
    for (const must of [
      "src/lib/aiSurvey/store.ts",
      "src/lib/aiSurvey/emailCheck.ts",
      "src/lib/aiSurvey/saving.ts",
      "src/app/api/ai-survey/code/route.ts",
      "src/app/api/ai-survey/code/check/route.ts",
      "src/app/api/ai-survey/save/route.ts",
      "src/app/api/ai-survey/session/route.ts",
      "src/app/ai-survey/page.tsx",
      "src/features/aiSurvey/SurveyFlow.tsx",
    ]) {
      assert.ok(PUBLIC_SIDE.includes(must), `${must} is not among the files a student's request passes through`);
    }
  });
});

// ---------------------------------------------------------------------------
// 1 and 2. Nobody is asked who they are, and nothing is logged
// ---------------------------------------------------------------------------

/** What a file a student's request passes through must never contain, with what it would mean. */
const NEVER = [
  [/\bgetCurrentUser\b|\bgetSessionUid\b|\buseAuth\b|\bSESSION_COOKIE\b/, "reads who is signed in"],
  [/\bassertNotImpersonating\b/, "calls the view-as guard, which reads a cookie"],
  [/\bcookies\s*\(|\.cookies\b|document\.cookie/, "reads a cookie"],
  [/\bheaders\s*\(\s*\)|\.headers\b(?!\s*:)/, "reads a request's headers"],
  [/\bclientIp\b|x-forwarded-for|\bremoteAddress\b|\.ip\b/i, "reads an IP address"],
  [/\brateLimit\s*\(/, "limits by this server's memory, which the site keys by IP address"],
  [/\buser-?agent\b|navigator\.userAgent/i, "reads the browser's description of itself"],
  [/\bsearchParams\b|location\.search|URLSearchParams/, "reads the address bar's query, where a short link's name sits"],
  [/document\.referrer/, "reads where the person came from"],
  [/\buid\b|\bactorUid\b/, "names an account"],
  [/\bsessionStorage\b|\bindexedDB\b/, "keeps something in the browser other than the one pass"],
  [/\bconsole\.(log|info|debug|warn|trace)\s*\(/, "logs"],
];

describe("1. nobody is asked who they are, and nothing is logged", () => {
  for (const file of PUBLIC_SIDE) {
    test(`${file}`, () => {
      const code = codeOf(file);
      for (const [pattern, meaning] of NEVER) {
        const hit = pattern.exec(code);
        assert.equal(hit, null, `${file} ${meaning}: ${hit?.[0]}`);
      }
      // The one log line allowed says THAT something happened, in fixed words.
      for (const call of code.matchAll(/console\.error\s*\(([^;]*)\)\s*;/g)) {
        assert.match(call[1].trim(), /^"[^"$]*"$/, `${file} logs something other than a fixed sentence: ${call[1].slice(0, 80)}`);
      }
    });
  }

  test("the allowlist in the survey's state is read nowhere near an answer", () => {
    // `store.ts` is on the public side, and the survey's state, which it
    // reads, carries the list of accounts that may open the admin page. It
    // only carries it: the lines that name it touch nothing else.
    const code = codeOf("src/lib/aiSurvey/store.ts");
    const lines = code.split("\n").filter((line) => /adminUids/.test(line));
    assert.ok(lines.length > 0);
    for (const line of lines) assert.doesNotMatch(line, /sets|answers|pages\b|USED|hash/i, line.trim());
  });

  test("every public route is a POST and nothing else, so nothing a person sends is ever in an address", () => {
    const routes = PUBLIC_SIDE.filter((file) => file.endsWith("/route.ts"));
    assert.equal(routes.length, 4);
    for (const route of routes) {
      const exported = [...codeOf(route).matchAll(/export\s+(?:async\s+)?function\s+(\w+)|export\s+const\s+(\w+)/g)].map((m) => m[1] ?? m[2]);
      assert.deepEqual(exported, ["POST"], `${route} exports ${exported.join(", ")}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. An address never meets an answer
// ---------------------------------------------------------------------------

describe("3. an address never meets an answer", () => {
  test("no file a student's request passes through names the site's send log, or sends through the door that writes it", () => {
    for (const file of PUBLIC_SIDE) {
      assert.doesNotMatch(codeOf(file), /\bemailSends\b|\blogEmailSend\b|\blogHeldSend\b|\blogSuppressedSend\b|\bsendEmail\s*\(|\bsendNotice\s*\(/, file);
    }
  });

  test("the one logged email of the survey goes to the accounts that run it, and is handed no address but theirs", () => {
    // The alert when the hourly ceiling is reached. It is ordinary mail to an
    // account on the survey's own list, so it leaves its row like any other.
    // What it must never be handed is anything of a student's.
    const senders = OWN.filter((file) => /\bsendEmail\s*\(/.test(codeOf(file)));
    assert.deepEqual(senders, ["src/lib/aiSurvey/adminAlert.ts"]);
    const alert = codeOf("src/lib/aiSurvey/adminAlert.ts");
    assert.match(alert, /export async function alertCeilingReached\(db: Firestore, state: SurveyState, now: number\)/, "the alert is now handed something more than the survey's state and the time");
    assert.match(alert, /auth\.getUsers\(state\.adminUids\.map\(/, "the alert's recipients are no longer the survey's own list");
    assert.doesNotMatch(alert, /hashAddress|\baddress\b|answers|readAllSets|pending|limit/i, "the alert touches an address or an answer");
  });

  test("the code email leaves through the door that writes no row, from one file", () => {
    const callers = [];
    const walkSrc = walk(join(REPO_ROOT, "src"));
    for (const file of walkSrc) {
      if (file === "src/lib/email/send.ts") continue;
      if (/\bsendUnloggedText\s*\(/.test(codeOf(file))) callers.push(file);
    }
    assert.deepEqual(callers, ["src/lib/aiSurvey/emailCheck.ts"], "a message that leaves no row is the survey's code email and nothing else");
  });

  test("that door writes no row, sends no HTML part and still asks the suppression list and the audience", () => {
    const send = codeOf("src/lib/email/send.ts");
    const from = send.indexOf("export async function sendUnloggedText");
    assert.ok(from > 0, "src/lib/email/send.ts no longer has the door the code email leaves by");
    const body = send.slice(from);
    assert.doesNotMatch(body, /logEmailSend|logHeldSend|logSuppressedSend/, "the code email now leaves a row in the send log");
    assert.doesNotMatch(body, /\bhtml\b|render\s*\(|attachments/, "the code email now has an HTML part or an attachment");
    assert.match(body, /filterSuppressed\(db, \[address\]\)/);
    assert.match(body, /splitByAudience\(\[address\], audience\)/);
    assert.ok(body.indexOf("filterSuppressed(") < body.indexOf("sendMail("), "the suppression list is asked after the send");
    assert.ok(body.indexOf("splitByAudience(") < body.indexOf("sendMail("), "the audience is asked after the send");
  });

  test("the step that sees an address writes nothing to the answers", () => {
    const code = codeOf("src/lib/aiSurvey/emailCheck.ts");
    assert.doesNotMatch(code, /writePage|readProgress|readAllSets|answersRef|ANSWERS_COLLECTION|answerSetKey/, "the email check now touches an answer");
    // And the step that saves an answer never sees an address or a hash of one.
    const saving = codeOf("src/lib/aiSurvey/saving.ts");
    assert.doesNotMatch(saving, /hashAddress|emailKey|normaliseUniversityAddress|acceptCode|usedRef|\baddress\b|\bemail\b/i, "saving a page now touches an address");
  });

  test("no function hands an answer back for a pass", () => {
    // Coming back says WHICH pages are saved. On a shared computer the next
    // person must never see the last person's answers.
    const saving = codeOf("src/lib/aiSurvey/saving.ts");
    assert.doesNotMatch(saving, /readAllSets/);
    const session = codeOf("src/app/api/ai-survey/session/route.ts");
    assert.doesNotMatch(session, /answers|pages\b(?!:)/, "the coming-back route now returns answers");
    const progress = /export async function readProgress[\s\S]*?\n}\n/.exec(codeOf("src/lib/aiSurvey/store.ts"))?.[0] ?? "";
    assert.match(progress, /savedPages: Object\.keys\(set\.pages\)/);
    assert.doesNotMatch(progress, /return \{[^}]*\bpages\b\s*[,}]/, "readProgress now returns the pages themselves");
    // Every answer set at once is for the allowlisted account's routes alone.
    for (const file of PUBLIC_SIDE) {
      if (file === "src/lib/aiSurvey/store.ts") continue;
      assert.doesNotMatch(codeOf(file), /\breadAllSets\b/, `${file} can read every answer set`);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. What an answer set holds
// ---------------------------------------------------------------------------

describe("4. an answer set holds four things, and no time", () => {
  const store = codeOf("src/lib/aiSurvey/store.ts");
  const writePage = /export async function writePage[\s\S]*?\n}\n/.exec(store)?.[0] ?? "";

  test("a save writes the version, the page order, the page and, when finishing, that it is finished", () => {
    assert.ok(writePage.length > 0, "store.ts no longer has writePage");
    const fields = [...new Set([...writePage.matchAll(/\bat\(\s*"(\w+)"/g)].map((m) => m[1]))].sort();
    assert.deepEqual(fields, ["f", "o", "p", "v"], "a save now writes another field of an answer set");
  });

  test("no time is written to an answer document or to the used-email list", () => {
    assert.doesNotMatch(writePage.replace(/batch\.update\(stateRef\(db\), \{ lastLevel: FieldValue\.serverTimestamp\(\) \}\);/, ""), /serverTimestamp|Timestamp\.|new Date|Date\.now/);
    // Every time the store writes is on the survey's own state, or is a
    // pending code's or a limit's, which are not answers and not the list.
    for (const line of store.split("\n")) {
      if (!/serverTimestamp\(\)|Timestamp\.fromMillis\(/.test(line)) continue;
      assert.match(
        line,
        /lastLevel|closedEarly|usedListDeleted|limitRef|pendingRef|LIMITS_COLLECTION|CODES_COLLECTION|where\("runsOut"/,
        `a time is written or compared somewhere unexpected: ${line.trim()}`,
      );
    }
    const accept = /export async function acceptCode[\s\S]*?\n}\n/.exec(store)?.[0] ?? "";
    assert.match(accept, /tx\.update\(listRef, entry, true/);
    assert.doesNotMatch(accept, /serverTimestamp|Timestamp\.(now|fromMillis|fromDate)/, "the used-email list now stores a time");
  });

  test("an answer set is a field of a shared document, never a document of its own", () => {
    // A document has a create time and an update time. The only documents in
    // the answers collection are the shared ones, named by a number.
    const answerRefs = store.split("\n").filter((line) => line.includes("collection(ANSWERS_COLLECTION)"));
    assert.equal(answerRefs.length, 1, "the answers collection is addressed in more than one way");
    assert.ok(answerRefs[0].includes('.doc(`${epoch}-${String(shard).padStart(3, "0")}`)'), answerRefs[0]);
    const usedRefs = store.split("\n").filter((line) => line.includes("collection(USED_COLLECTION)"));
    assert.equal(usedRefs.length, 1, "the used-email list is addressed in more than one way");
    assert.ok(usedRefs[0].includes(".doc(`${epoch}-${hash[0]}`)"), usedRefs[0]);
  });
});

// ---------------------------------------------------------------------------
// 5. The browser
// ---------------------------------------------------------------------------

describe("5. the browser sends nothing of the person, and keeps one key", () => {
  test("every request to the survey goes without cookies and without a referrer", () => {
    const api = codeOf("src/features/aiSurvey/api.ts");
    assert.match(api, /credentials: "omit"/);
    assert.match(api, /referrerPolicy: "no-referrer"/);
    assert.match(api, /method: "POST"/);
    // One place calls the network, so one place has to be right.
    for (const file of PUBLIC_SIDE.filter((f) => f.startsWith("src/features/") || f.startsWith("src/app/ai-survey"))) {
      if (file === "src/features/aiSurvey/api.ts") continue;
      assert.doesNotMatch(codeOf(file), /\bfetch\s*\(|XMLHttpRequest|sendBeacon/, `${file} calls the network itself`);
    }
  });

  test("one key is kept, it is the pass, and no answer goes into storage", () => {
    const keepers = OWN.filter((file) => /\blocalStorage\b/.test(codeOf(file)));
    assert.deepEqual(keepers, ["src/features/aiSurvey/keptPass.ts"]);
    const kept = codeOf("src/features/aiSurvey/keptPass.ts");
    assert.deepEqual([...kept.matchAll(/"(naisi\.[\w.]+)"/g)].map((m) => m[1]), ["naisi.aiSurvey.pass"]);
    assert.equal([...kept.matchAll(/setItem\(/g)].length, 1);
    const flow = codeOf("src/features/aiSurvey/SurveyFlow.tsx");
    for (const call of flow.matchAll(/keepPass\(([^)]*)\)/g)) assert.match(call[1], /^reply\.pass$/, `something other than the pass is kept: ${call[1]}`);
    // Finishing, "that wasn't me", and a pass that no longer works all remove it.
    assert.ok([...flow.matchAll(/forgetPass\(\)/g)].length >= 4);
  });

  test("the one outside script is the bot check, mounted on the email step and nowhere else", () => {
    const mounts = OWN.filter((file) => /<RecaptchaInvisible\b/.test(codeOf(file)));
    assert.deepEqual(mounts, ["src/features/aiSurvey/SurveyFlow.tsx"]);
    const flow = codeOf("src/features/aiSurvey/SurveyFlow.tsx");
    assert.equal([...flow.matchAll(/<RecaptchaInvisible\b/g)].length, 1);
    const at = flow.indexOf("<RecaptchaInvisible");
    const branch = flow.lastIndexOf("if (step.at ===", at);
    assert.match(flow.slice(branch, branch + 90), /step\.at === "address" \|\| step\.at === "code" \|\| step\.at === "already"/, "the bot check is now mounted outside the email step");
    for (const file of OWN) {
      assert.doesNotMatch(codeOf(file), /<script\b|next\/script|gtag|analytics|posthog|hotjar|sentry/i, `${file} loads or names something that watches`);
    }
  });

  test("the questions are answered on a fresh page, after the bot check's script has gone", () => {
    // A page cannot unload a script. So when the code is accepted and the
    // pass is kept, the page reloads itself once, and the questions run in a
    // document the bot check was never loaded into.
    const flow = codeOf("src/features/aiSurvey/SurveyFlow.tsx");
    const accepted = flow.slice(flow.indexOf("if (keepPass(reply.pass)) {"));
    assert.ok(accepted.length > 0 && flow.includes("if (keepPass(reply.pass)) {"), "the page no longer reloads when the pass is kept");
    assert.match(accepted.slice(0, 700), /window\.location\.hash = JUST_IN;\s*window\.location\.reload\(\);\s*return;/);
    // The mark it leaves on its own address is a fragment, which is never sent to a server.
    assert.match(flow, /const JUST_IN = "#in";/);
    // The address typed for the email check is dropped before that.
    assert.ok(flow.indexOf('setAddress("");', flow.indexOf("if (reply.ok) {", flow.indexOf("const onCode"))) < flow.indexOf("if (keepPass(reply.pass)) {"));
  });

  test("the newsletter link opens in a new tab and says nothing about where the person came from", () => {
    const flow = codeOf("src/features/aiSurvey/SurveyFlow.tsx");
    assert.match(flow, /href=\{survey\.end\.newsletterHref\} target="_blank" rel="noopener noreferrer"/);
    assert.doesNotMatch(flow, /<form[^>]*newsletter|SubscribeForm/, "a sign-up form is on the survey's own pages");
    assert.doesNotMatch(codeOf("src/features/aiSurvey/projectSurvey.ts"), /newsletterHref:[^\n]*[?#]/, "the newsletter link carries a query or a source");
  });
});

// ---------------------------------------------------------------------------
// 6. The pages
// ---------------------------------------------------------------------------

describe("6. the pages", () => {
  const pages = OWN.filter((file) => file.startsWith("src/app/ai-survey/") && file.endsWith("/page.tsx"));

  test("each is kept out of search", () => {
    assert.ok(pages.length >= 3);
    for (const page of pages) assert.match(codeOf(page), /robots: \{ index: false, follow: false \}/, page);
  });

  test("none answers a missing thing with an empty body", () => {
    // A printed code lands here on a lecture theatre's signal.
    for (const page of pages) assert.doesNotMatch(codeOf(page), /\bnotFound\s*\(/, page);
    for (const dir of new Set(pages.map((p) => dirname(p)))) assert.ok(!existsSync(join(REPO_ROOT, dir, "not-found.tsx")), `${dir} has a not-found page`);
  });

  test("the survey's frame carries no link out of the survey", () => {
    const frame = codeOf("src/features/aiSurvey/SurveyFrame.tsx");
    assert.doesNotMatch(frame, /<a\b|<Link\b|PublicHeader|PublicFooter/, "the survey's bar now links somewhere");
  });

  test("the proxy does not stand in front of the survey", () => {
    const proxy = read("src/proxy.ts");
    assert.doesNotMatch(/const PROTECTED_PREFIXES = \[[^\]]*\]/.exec(proxy)?.[0] ?? "", /ai-survey/);
  });
});

// ---------------------------------------------------------------------------
// The scanner reads what it says it reads
// ---------------------------------------------------------------------------

describe("the scanner reads what it says it reads", () => {
  const breaches = (snippet) => NEVER.filter(([pattern]) => pattern.test(stripSource(snippet, { keepStrings: true }))).map(([, meaning]) => meaning);

  test("a session, a cookie, a header, an address, a query, an account and a log line are each caught", () => {
    assert.equal(breaches("const user = await getCurrentUser();").length, 1);
    assert.equal(breaches("const jar = await cookies();").length, 1);
    assert.equal(breaches('const ip = req.headers.get("x-forwarded-for");').length, 2);
    assert.equal(breaches("const limit = rateLimit(`a:${clientIp(req)}`, 5, 1000);").length, 2);
    assert.equal(breaches("const q = searchParams.get('q');").length, 1);
    assert.equal(breaches("await ref.set({ uid, answers });").length, 1);
    assert.equal(breaches("console.log(body);").length, 1);
  });

  test("a word in a comment, and the survey's own request options, are not breaches", () => {
    assert.deepEqual(breaches("// it reads no cookie, no session and no header\nconst a = 1;"), []);
    assert.deepEqual(breaches('fetch(url, { headers: { "content-type": "application/json" }, credentials: "omit" });'), []);
    assert.deepEqual(breaches("return NextResponse.json({ error }, { status, headers: NO_STORE });"), []);
  });
});
