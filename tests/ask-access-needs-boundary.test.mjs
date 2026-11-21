/**
 * WHO CAN READ WHAT A MEMBER WROTE IN AN ACCESS-NEEDS ASK, held as a property
 * of the tree.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards
 *
 * The access form tells a member: "Only admins read this: not your
 * facilitator, not the programme's lead. We record each time an admin opens
 * it." That is true only while ONE module reads the words
 * (`src/lib/courses/teamAsk/openAccessNeeds.ts`, which records each opening in
 * the transaction that reads them) and nothing else can. The words and the
 * tick sit on the request document itself (`change.words`,
 * `change.tellFacilitator`), in a collection many readers open, so this file
 * does not test a route: it walks the tree, the way
 * `tests/applications-d2-zeta-access-requirements-boundary.test.mjs` walks it
 * for an application's access requirements.
 *
 *  1. EVERY RAW READ OF THE REQUESTS COLLECTION IS FOLLOWED. Every file that
 *     reads the collection is listed, both ways, and in each one every
 *     `.data()`, and every name bound to one, is followed through the syntax
 *     tree: it may have a field other than `change` read by name, be tested,
 *     or be handed to a listed function (a normaliser, or a reader of another
 *     collection's documents). A spread, a return, a log, a `JSON.stringify`,
 *     a `change` read in any spelling, a computed name or a raw document kept
 *     in an object fails, unless a listed waiver says why it is another
 *     collection's. The review's four ways past the first version of this
 *     guard are its own test cases.
 *  1b. EVERY NORMALISER OF A REQUEST checks the kind before anything else,
 *     only the access normaliser and the one reader admit an access ask, and
 *     the one reader (`accessNeedsWordsOf`) is imported by the opening alone.
 *  2. THE ACCESS NORMALISER HOLDS NEITHER the words nor the tick.
 *  3. THE TICK IS NAMED IN LISTED PLACES, none of them an email, a list or a
 *     page a facilitator or a lead can open. Checked both ways.
 *  4. ONE ROUTE REACHES THE OPENING, by following imports from every route,
 *     page and layout, and it is a POST that names the record it makes. The
 *     opening refuses everybody but an admin before it reads, and queues the
 *     record on the one path that answers with the words.
 *  5. THE KIND IS NAMED IN LISTED PLACES, each with what it does with it.
 *
 * What every caller is actually sent, with the words planted as a marker, is
 * `tests/course-ask-access-needs.test.mjs`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const rel = (file) => relative(REPO_ROOT, file).split("\\").join("/");
const abs = (path) => join(REPO_ROOT, ...path.split("/"));

function sourceFiles(dir = SRC, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

/** Source with its comments gone, so a rule written in prose is not a use. */
function codeOf(file) {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function specifiers(code, { types }) {
  const out = [];
  const statement = /(?:^|\n)[ \t]*((?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["'])/g;
  for (const match of code.matchAll(statement)) {
    if (!types && /^(?:import|export)\s+type\b/.test(match[1])) continue;
    out.push(match[2]);
  }
  for (const match of code.matchAll(/(?:^|\n)[ \t]*import\s*["']([^"']+)["']/g)) out.push(match[1]);
  for (const match of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push(match[1]);
  return out;
}

function resolveLocal(specifier, fromFile) {
  let base;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = join(dirname(fromFile), specifier);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every `src` file reachable from `root` by imports that carry data, with the chain that got there. */
function reachableFrom(root, within = () => true) {
  const chains = new Map([[root, [root]]]);
  const queue = [root];
  while (queue.length > 0) {
    const file = queue.shift();
    for (const specifier of specifiers(codeOf(file), { types: false })) {
      const target = resolveLocal(specifier, file);
      if (!target || chains.has(target) || !within(target)) continue;
      chains.set(target, [...chains.get(file), target]);
      queue.push(target);
    }
  }
  return chains;
}

const ALL = sourceFiles();
const OPEN = "src/lib/courses/teamAsk/openAccessNeeds.ts";
const OPEN_ROUTE = "src/app/api/courses/requests/[requestId]/team/open/route.ts";
const NORMALISERS = "src/lib/firestore/courseTeamAsks.ts";

// ---------------------------------------------------------------------------
// 1. Every raw read of the requests collection
// ---------------------------------------------------------------------------

/**
 * WHERE A STORED REQUEST CAN BE HELD WHOLE. A file can only be handed a raw
 * `courseRequests` document if it reads the collection, so every file whose
 * code names it is listed here, both ways, with what it does there. In each
 * of them, every `.data()` and every name bound to one is followed through
 * the syntax tree (`rawReads` below), and may only:
 *
 *  - have a field other than `change` read off it by name (`data.kind`),
 *  - be tested (`!data`, `data ? ... : ...`, `===`), or
 *  - be handed to a function this file names in `HANDED_TO`, each with why
 *    that function cannot pass an access ask's words on (a normaliser that
 *    answers null for any kind but its own, or a reader of another
 *    collection's documents).
 *
 * Everything else fails: a spread of one, a return of one, a log or
 * `JSON.stringify` of one (neither is in `HANDED_TO`), its `change` read in
 * any spelling, a field read by a computed name, a raw document stored in an
 * object or a map. A file that does one of those to another collection's
 * documents says so in `WAIVED`, with why, and a waiver that no longer fires
 * fails too. So an access ask's words can reach code only through
 * `accessNeedsWordsOf`, which `openAccessNeeds.ts` alone may call.
 *
 * WHAT THIS CANNOT SEE: a function in `HANDED_TO` that changes what it does
 * with a request's document. Each one is a normaliser of this collection
 * (held by point 1b) or names, in its reason, the other collection it reads.
 */
const NAMES_THE_COLLECTION = /\bCOURSE_REQUESTS_COLLECTION\b|["'`]courseRequests["'`]/;

const READS_REQUESTS = new Map([
  ["src/lib/courses/excused/alert.ts", "the admins' alert counts a person's asks told today and reads admins' accounts; requests only through their kind"],
  ["src/lib/courses/excused/ask.ts", "asking to be excused reads the person's own requests of that kind through normalizeExcusedRequest"],
  ["src/lib/courses/excused/decide.ts", "deciding a request to be excused reads it through normalizeExcusedRequest, and the people it names from users"],
  ["src/lib/courses/excused/facts.ts", "how often a person has been excused, through normalizeExcusedRequest"],
  ["src/lib/courses/excused/page.ts", "a request to be excused as admins read it, through normalizeExcusedRequest"],
  ["src/lib/courses/excused/standing.ts", "which requests to be excused still stand, through normalizeExcusedRequest"],
  ["src/lib/courses/excused/tidy.ts", "closing requests to be excused whose weeks have passed, through normalizeExcusedRequest"],
  ["src/lib/courses/registerCorrection/view.ts", "a register's corrections asked for, through normalizeCourseRequest, which reads corrections alone"],
  ["src/lib/courses/requests/decide.ts", "deciding a register correction, through normalizeCourseRequest"],
  ["src/lib/courses/requests/home.ts", "Home's counts of what waits, through each kind's normaliser and the Requests page's loader"],
  ["src/lib/courses/requests/load.ts", "the Requests page, every row through its own kind's normaliser, an access ask's through normalizeAccessNeeds"],
  ["src/lib/courses/teamAsk/ask.ts", "sending to the team: writes the ask and counts the sender's asks today by their kind field alone"],
  ["src/lib/courses/teamAsk/decide.ts", "Take it and the reply, through normalizeTeamAsk, which never holds an access ask's words"],
  ["src/lib/courses/teamAsk/openAccessNeeds.ts", "THE ONE OPENING: an admin's press, recorded in the transaction that hands the document to accessNeedsWordsOf"],
  ["src/lib/courses/teamAsk/own.ts", "the member's own list, through normalizeTeamMessage and normalizeAccessNeeds"],
  ["src/lib/courses/teamAsk/page.ts", "a message's and an access ask's row and page for admins, through their normalisers"],
  ["src/lib/courses/moveRequest/ask.ts", "asking to change group writes the request; it reads the person's requests only through readChangeFacts, by their kinds' normalisers"],
  ["src/lib/courses/moveRequest/decide.ts", "deciding a request to change group reads it through normalizeMoveRequest, and the run, place and groups through their own"],
  ["src/lib/courses/moveRequest/facts.ts", "a person's requests on one run, through normalizeVisitRequest and normalizeMoveRequest, which answer null for an access ask"],
  ["src/lib/courses/moveRequest/page.ts", "a request to change group as admins read it, through normalizeMoveRequest"],
  ["src/lib/courses/moveRequest/standing.ts", "which requests to change group still stand, through normalizeMoveRequest, on one real run"],
  ["src/lib/courses/visit/plan.ts", "what approving a visit will do, reading requests through their kinds' normalisers"],
  ["src/lib/courses/visitRequest/ask.ts", "asking to go to another session writes the request; it reads none back whole"],
  ["src/lib/courses/visitRequest/decide.ts", "deciding a visit request, through normalizeVisitRequest handed in as `reader`"],
  ["src/lib/courses/visitRequest/page.ts", "a visit request as admins read it, through normalizeVisitRequest"],
  ["src/lib/courses/visitRequest/standing.ts", "which visit requests still stand, through normalizeVisitRequest"],
  ["src/lib/courses/weekRooms/load.ts", "a week's rooms count the visits into each session, through normalizeVisitRequest"],
  ["src/lib/firestore/accountDeletion.ts", "the account cascade deletes a person's requests by two equalities and reads none of them"],
  ["src/lib/firestore/courseDeletion.ts", "a run's destroy drains its requests by runId and counts them; it reads none of them"],
  ["src/lib/firestore/courseRequests.ts", "the collection's own module and the correction normaliser, which checks the kind first (point 1b)"],
]);

/** Every function a raw document may be handed to, by the name a file calls it by, and why it passes no words on. */
const KIND_FIRST = "a normaliser of one kind of request that answers null for any other (point 1b), or of another collection";
const HANDED_TO = new Map([
  ["normalizeCourseRequest", KIND_FIRST],
  ["normalizeExcusedRequest", KIND_FIRST],
  ["normalizeVisitRequest", KIND_FIRST],
  ["normalizeMoveRequest", KIND_FIRST],
  ["normalizeTeamMessage", KIND_FIRST],
  ["normalizeAccessNeeds", "the access normaliser, which has no field for the words or the tick (point 2)"],
  ["normalizeTeamAsk", "a message's or an access ask's normaliser, one after the other; neither holds an access ask's words"],
  ["accessNeedsWordsOf", "THE ONE READER of an access ask's words and tick, called by the opening alone (point 4)"],
  ["reader", "visitRequest/decide.ts hands each read to the kind's normaliser it was given, normalizeVisitRequest"],
  ["normalizeCourseGroup", "a group's document, from courseGroups"],
  ["normalizeCourseRun", "a run's document, from courseRuns"],
  ["normalizeCourse", "a course's document"],
  ["normalizeCourseEnrolment", "a place's document, from courseEnrolments"],
  ["normalizeCourseAttendance", "a register's document, from courseAttendance"],
  ["normalizeCourseAudit", "a history row, from courseAudit"],
  ["readRun", "a run's document, for the week's rooms"],
  ["readDestroyMarker", "a run's destroy marker"],
  ["assertPassLeaseFree", "a run's document, checked for a destroy pass in progress"],
  ["excuseLineOf", "a register's document, for one person's line"],
  ["onlineWordGone", "excused/decide.ts hands it a register's document, from courseAttendance, to take a joining-online word off"],
  ["notHeldIn", "a register's document, for whether a session was held"],
  ["accountNamesOf", "an account, from users, for a name"],
  ["firstNameOfUser", "an account, from users, for a first name"],
  ["displayNameOf", "an account, from users, for a name"],
  ["wantsRequestEmails", "an admin's account, for their email switches"],
  ["reviewWithout", "the account cascade: a review document without the deleted person"],
  ["noteDraftWithout", "the account cascade: a note draft without the deleted person"],
  ["Array.isArray", "a test of a field's shape"],
  ["Object.entries", "courseDeletion.ts walks a run's destroy marker, never a request"],
  ["out.set", "weekRooms/load.ts keeps registers by id, from courseAttendance"],
  ["accounts.set", "visit/plan.ts keeps accounts by id, from users"],
  ["registers.set", "visit/plan.ts keeps registers by id, from courseAttendance"],
]);

/** What a listed file does to another collection's raw documents that would fail here, and why. */
const WAIVED = new Map([
  ["src/lib/courses/excused/decide.ts", new Map([["a raw document stored in an object (ShorthandPropertyAssignment): data", "a person's account, from users, kept beside their name for the decision's emails"]])],
  [
    "src/lib/firestore/accountDeletion.ts",
    new Map([
      ["a raw document read by a computed name: (d.data() as Record<string, unknown>)[field]", "a register's maps, from courseAttendance, tested for the deleted person's key"],
      ["a spread of a raw document: ...data", "a session report, rewritten without its writer, from courseSessionReports"],
    ]),
  ],
]);

const PASS_THROUGH = new Set([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken]);
const COMPARE = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken]);

/** Up through what passes a value on unchanged: brackets, `as`, `!`, `??`, `||`, `&&` and either branch of `?:`. */
function climb(node) {
  let n = node;
  for (;;) {
    const p = n.parent;
    if (!p) return n;
    const wraps =
      ts.isParenthesizedExpression(p) ||
      ts.isAsExpression(p) ||
      ts.isNonNullExpression(p) ||
      ts.isTypeAssertionExpression(p) ||
      ts.isSatisfiesExpression(p) ||
      (ts.isBinaryExpression(p) && PASS_THROUGH.has(p.operatorToken.kind)) ||
      (ts.isConditionalExpression(p) && (p.whenTrue === n || p.whenFalse === n));
    if (!wraps) return n;
    n = p;
  }
}

function insideType(node) {
  for (let n = node.parent; n; n = n.parent) if (ts.isTypeNode(n) || ts.isPropertySignature(n)) return true;
  return false;
}

/**
 * Every place a raw document goes in one file's source: `findings` (what
 * fails outright) and `callees` (the functions it is handed to, by name).
 */
export function rawReads(code, fileName = "probe.ts") {
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings = [];
  const callees = [];
  const names = new Set();
  const say = (what, node) => findings.push(`${what}: ${node.getText(sf).replace(/\s+/g, " ").slice(0, 100)}`);
  function follow(raw) {
    const n = climb(raw);
    const p = n.parent;
    if (ts.isPropertyAccessExpression(p) && p.expression === n) {
      if (p.name.text === "change") say("a raw document's change read", p);
      return;
    }
    if (ts.isElementAccessExpression(p) && p.expression === n) {
      const key = p.argumentExpression;
      if (!(ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) || key.text === "change") say("a raw document read by a computed name", p);
      return;
    }
    if (ts.isCallExpression(p) && p.arguments.includes(n)) return void callees.push(p.expression.getText(sf));
    if (ts.isVariableDeclaration(p) && p.initializer === n) {
      if (ts.isIdentifier(p.name)) return void names.add(p.name.text);
      if (ts.isObjectBindingPattern(p.name)) {
        for (const el of p.name.elements) {
          if (el.dotDotDotToken) say("a spread of a raw document", p);
          else if ((el.propertyName ?? el.name).getText(sf) === "change") say("a raw document's change read", p);
        }
        return;
      }
      return say("a raw document bound some other way", p);
    }
    if (ts.isSpreadElement(p) || ts.isSpreadAssignment(p)) return say("a spread of a raw document", p);
    if (ts.isReturnStatement(p) || (ts.isArrowFunction(p) && p.body === n)) return say("a raw document returned", p);
    if (ts.isPrefixUnaryExpression(p) || ts.isTypeOfExpression(p)) return;
    if (ts.isBinaryExpression(p) && COMPARE.has(p.operatorToken.kind)) return;
    if (ts.isConditionalExpression(p) && p.condition === n) return;
    if ((ts.isIfStatement(p) || ts.isWhileStatement(p)) && p.expression === n) return;
    if (ts.isShorthandPropertyAssignment(p) || ts.isPropertyAssignment(p) || ts.isArrayLiteralExpression(p)) {
      return say(`a raw document stored in an object (${ts.SyntaxKind[p.kind]})`, p);
    }
    say(`a raw document going somewhere else (${ts.SyntaxKind[p.kind]})`, p);
  }
  const isDataCall = (node) =>
    ts.isCallExpression(node) && node.arguments.length === 0 && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "data";
  const visitCalls = (node) => {
    if (isDataCall(node)) follow(node);
    ts.forEachChild(node, visitCalls);
  };
  visitCalls(sf);
  const followed = new Set();
  for (let before = -1; names.size !== before; ) {
    before = names.size;
    const visitNames = (node) => {
      if (ts.isIdentifier(node) && names.has(node.text) && !followed.has(node) && !insideType(node)) {
        const p = node.parent;
        const declares = (ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p)) && p.name === node;
        const isFieldName = (ts.isPropertyAccessExpression(p) || ts.isPropertyAssignment(p)) && p.name === node;
        if (!declares && !isFieldName) {
          followed.add(node);
          follow(node);
        }
      }
      ts.forEachChild(node, visitNames);
    };
    visitNames(sf);
  }
  return { findings, callees };
}

/** What fails in one file: its findings beyond its waivers, and every function it hands a raw document to that is not listed. */
function violations(code, file) {
  const { findings, callees } = rawReads(code, file);
  const waived = WAIVED.get(file) ?? new Map();
  return [...findings.filter((each) => !waived.has(each)), ...callees.filter((callee) => !HANDED_TO.has(callee)).map((callee) => `a raw document handed to ${callee}`)];
}

describe("every raw read of the requests collection", () => {
  const readers = ALL.filter((each) => NAMES_THE_COLLECTION.test(codeOf(each)));

  test("is in a listed file, with what it does there", () => {
    assert.ok(readers.length >= 20, `only ${readers.length} files read the collection: the walk is broken`);
    assert.deepEqual(
      readers.map(rel).sort(),
      [...READS_REQUESTS.keys()].sort(),
      "the files that read the requests collection are not the ones listed in READS_REQUESTS. A new reader is " +
        "added with what it does; every raw document it reads must go to a normaliser.",
    );
    for (const [file, why] of READS_REQUESTS) assert.ok(why.length > 40, `${file} needs a written reason`);
  });

  test("goes nowhere but a field read by name, a test, or a listed function", () => {
    const failures = [];
    for (const file of readers) for (const each of violations(readFileSync(file, "utf8"), rel(file))) failures.push(`${rel(file)}: ${each}`);
    assert.deepEqual(
      failures,
      [],
      "a raw request document goes somewhere it could carry an access ask's words. Hand it to its kind's " +
        "normaliser instead; for another collection's document, add the function to HANDED_TO or the line to WAIVED, with why.",
    );
  });

  test("every listed function and waiver is still used, so neither list only grows", () => {
    const used = new Set();
    const fired = new Set();
    for (const file of readers) {
      const { findings, callees } = rawReads(readFileSync(file, "utf8"), rel(file));
      for (const callee of callees) used.add(callee);
      for (const each of findings) fired.add(`${rel(file)}#${each}`);
    }
    assert.deepEqual([...HANDED_TO.keys()].filter((callee) => !used.has(callee)), [], "HANDED_TO lists a function no reader hands a document to");
    for (const [file, waivers] of WAIVED) {
      for (const [finding, why] of waivers) {
        assert.ok(fired.has(`${file}#${finding}`), `${file} no longer does what WAIVED excuses: ${finding}`);
        assert.ok(why.length > 30, `${file} needs a written reason for ${finding}`);
      }
    }
    for (const [callee, why] of HANDED_TO) assert.ok(why.length > 15, `${callee} needs a written reason`);
  });

  test("catches every way the review got a reader past the first guard", () => {
    const caught = (code) => violations(code, "src/lib/courses/probeLeak.ts");
    // A renamed variable.
    assert.notDeepEqual(caught("export async function leak(ref) { const snap = await ref.get(); const stored = snap.data().change; return stored.words; }"), []);
    assert.notDeepEqual(caught("export async function leak(ref) { const snap = await ref.get(); const d = snap.data() ?? {}; const c = d.change; return c; }"), []);
    // The whole raw document returned, for a GET route to send.
    assert.notDeepEqual(caught("export async function leak(ref) { const snap = await ref.get(); return { ...snap.data() }; }"), []);
    assert.notDeepEqual(caught("export async function leak(ref) { const snap = await ref.get(); return snap.data(); }"), []);
    assert.notDeepEqual(caught("export async function leak(ref) { const snap = await ref.get(); const d = snap.data(); return NextResponse.json(d); }"), []);
    // A log of the whole document.
    assert.notDeepEqual(caught("const snap = await ref.get(); console.log(JSON.stringify(snap.data()));"), []);
    assert.notDeepEqual(caught("const snap = await ref.get(); const d = snap.data(); console.warn('read', d);"), []);
    // The field by a computed name, and by a destructure.
    assert.notDeepEqual(caught("const snap = await ref.get(); const v = snap.data().change[key];"), []);
    assert.notDeepEqual(caught("const snap = await ref.get(); const d = snap.data(); const v = d[key];"), []);
    assert.notDeepEqual(caught("const snap = await ref.get(); const { change: { words } } = snap.data();"), []);
    // Handed to a helper that is not listed, or kept in an object for later.
    assert.notDeepEqual(caught("const snap = await ref.get(); helper(snap.data());"), []);
    assert.notDeepEqual(caught("const snap = await ref.get(); const d = snap.data(); out.push({ d });"), []);
    // And what the readers do today passes.
    assert.deepEqual(caught("const snap = await ref.get(); const ask = snap.exists ? normalizeAccessNeeds(snap.id, snap.data() ?? {}) : null;"), []);
    assert.deepEqual(caught("const kind = doc.data()?.kind; if (!snap.data()) return;"), []);
  });
});

// ---------------------------------------------------------------------------
// 1b. The normalisers, and the one reader of the words
// ---------------------------------------------------------------------------

/** The modules whose functions are handed a request's raw data, and why each is safe. */
const REQUEST_NORMALISERS = new Map([
  ["src/lib/firestore/courseRequests.ts", "register corrections"],
  ["src/lib/firestore/courseExcusedRequests.ts", "requests to be excused"],
  ["src/lib/firestore/courseMemberRequests.ts", "requests to go to another session and to change group"],
  [NORMALISERS, "messages to the team and access asks (the access normaliser holds no words, point 2)"],
]);
const WORDS_READER = "src/lib/firestore/courseAccessNeedsWords.ts";

describe("the normalisers, and the one reader of the words", () => {
  test("every normaliser of a request answers null for any other kind first, or is built of ones that do", () => {
    for (const file of REQUEST_NORMALISERS.keys()) {
      const code = codeOf(abs(file));
      const normalisers = [...code.matchAll(/export function (normali[sz]e\w*)\(id: string, data: Raw\)[^{]*\{\s*([^\n]*)/g)];
      assert.ok(normalisers.length > 0, `${file} exports no normaliser this can read`);
      for (const [, name, first] of normalisers) {
        assert.ok(
          /^if \(data\.kind !== [A-Z_]+_KIND\) return null;$|^if \(!COURSE_REQUEST_KINDS\.includes\(data\.kind as CourseRequestKind\)\) return null;$|^return normalize\w+\(id, data\) \?\? normalize\w+\(id, data\);$/.test(first.trim()),
          `${file} ${name} does not check the kind before anything else: ${first}`,
        );
      }
    }
  });

  test("only the access normaliser and the one reader admit an access ask", () => {
    for (const file of REQUEST_NORMALISERS.keys()) {
      if (file === NORMALISERS) continue;
      assert.doesNotMatch(codeOf(abs(file)), /ACCESS_NEEDS_KIND|["'`]access-needs["'`]/, `${file} admits an access ask`);
    }
  });

  test("the one reader checks the kind first, and only the opening imports it", () => {
    const code = codeOf(abs(WORDS_READER));
    assert.match(code, /export function accessNeedsWordsOf\(data: Record<string, unknown>\): AccessNeedsWords \| null \{\s*if \(data\.kind !== ACCESS_NEEDS_KIND\) return null;/);
    assert.deepEqual(importersOf(WORDS_READER), [OPEN]);
    // And no reader or normaliser of a request reads `change.words` by that name but the message
    // normaliser, after its kind check (the one reader reads them as `stored.words`, after its own).
    const READS_THE_WORDS = /\bchange\??\.\s*words\b|\bchange\s*\[\s*["'`]words["'`]\s*\]|["'`]change\.words["'`]/;
    const handed = [...READS_REQUESTS.keys(), ...REQUEST_NORMALISERS.keys(), WORDS_READER];
    const spelled = handed.filter((file) => READS_THE_WORDS.test(codeOf(abs(file)))).sort();
    assert.deepEqual(spelled, [NORMALISERS], "only the message normaliser, after its kind check, reads change.words by that name");
    const body = codeOf(abs(NORMALISERS)).slice(codeOf(abs(NORMALISERS)).indexOf("export function normalizeTeamMessage("));
    assert.ok(body.indexOf("if (data.kind !== TEAM_MESSAGE_KIND) return null;") < body.search(READS_THE_WORDS));
  });
});

// ---------------------------------------------------------------------------
// 2. The access normaliser holds neither the words nor the tick
// ---------------------------------------------------------------------------

describe("the access normaliser", () => {
  test("never names the words or the tick, and the shape it returns has no field for them", () => {
    const code = codeOf(abs(NORMALISERS));
    const start = code.indexOf("export function normalizeAccessNeeds(");
    assert.ok(start !== -1);
    const body = code.slice(start, code.indexOf("\nexport ", start + 1));
    assert.doesNotMatch(body, /\bwords\b|tellFacilitator/, "normalizeAccessNeeds has started reading what was written");
    const typeStart = code.indexOf("export type AccessNeedsDoc = {");
    const type = code.slice(typeStart, code.indexOf("};", typeStart));
    assert.doesNotMatch(type, /\bwords\b|tellFacilitator/, "an AccessNeedsDoc has a field for what was written");
  });
});

// ---------------------------------------------------------------------------
// 3. Where the tick is named
// ---------------------------------------------------------------------------

/** The tick's own field name, and not the joining-online helpers whose names begin with the same words. */
const NAMES_THE_TICK = /\btellFacilitator\b/;

const NAMES_TICK = new Map([
  ["src/lib/courses/teamAsk/words.ts", "the sentence an admin reads about the tick, drawn only from the open route's answer"],
  ["src/lib/courses/teamAsk/model.ts", "the send route's body: the access form's tick, false unless a true"],
  ["src/lib/courses/teamAsk/ask.ts", "the send: stores the tick on the ask, and puts it in no email"],
  [WORDS_READER, "the one reader: takes the tick out of the stored ask, for the opening alone"],
  [OPEN, "the opening: returns the tick with the words, to the admin who opened it"],
  [OPEN_ROUTE, "the open route's answer, to that admin alone"],
  ["src/features/courses/requests/AccessNeedsPage.tsx", "an admin's page draws the tick once the open route has answered, from its own state"],
  ["src/features/teamAsk/AskTheTeam.tsx", "the member's own access form: the tick they set"],
  ["src/features/teamAsk/api.ts", "the member's press, sending their own tick"],
]);

describe("where the tick is named", () => {
  test("in the listed places, none of them an email, a list or a page a facilitator or a lead opens", () => {
    const found = ALL.filter((file) => NAMES_THE_TICK.test(codeOf(file))).map(rel).sort();
    assert.deepEqual(found, [...NAMES_TICK.keys()].sort(), "a new file names the access ask's tick: the site passes it to nobody but an admin who opened the ask");
    for (const file of found) {
      assert.doesNotMatch(file, /email|emails\/|facilitat|lead|export|csv/i, `${file} names the tick`);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. The way to the opening
// ---------------------------------------------------------------------------

/** Every file that imports `target`, types included. */
function importersOf(target) {
  const wanted = abs(target);
  return ALL.filter(
    (file) => file !== wanted && specifiers(codeOf(file), { types: true }).some((specifier) => resolveLocal(specifier, file) === wanted),
  )
    .map(rel)
    .sort();
}

const ENTRIES = ALL.filter((file) => /^src\/app\/.*\/(route|page|layout)\.tsx?$/.test(rel(file)));

describe("the way to the opening", () => {
  test("one module imports it: the open route", () => {
    assert.deepEqual(importersOf(OPEN), [OPEN_ROUTE]);
  });

  test("of every route, page and layout, only the open route can reach it", () => {
    assert.ok(ENTRIES.length > 150, `only ${ENTRIES.length} routes and pages were found: the walk is broken`);
    const reaching = ENTRIES.filter((entry) => reachableFrom(entry).has(abs(OPEN))).map(rel);
    assert.deepEqual(reaching, [OPEN_ROUTE]);
  });

  test("the open route is a POST, sends nothing, and names the record it makes", () => {
    const route = codeOf(abs(OPEN_ROUTE));
    assert.doesNotMatch(route, /export\s+(?:async\s+)?function\s+GET\b|export\s+const\s+GET\b/, "an opening writes its record, so it is not a GET");
    assert.match(route, /openAccessNeeds\(db, actor, requestId, "access-needs-read", new Date\(\)\)/);
    assert.match(route, /^[\s\S]*?export async function POST\([^)]*\) \{\s*const blocked = await assertNotImpersonating\(\);\s*if \(blocked\) return blocked;/);
    for (const specifier of specifiers(route, { types: true })) {
      assert.doesNotMatch(specifier, /email|push|audience/i, `the open route imports ${specifier}`);
    }
  });

  test("the opening refuses all but an admin before it reads, and queues the record before it answers with the words", () => {
    const code = codeOf(abs(OPEN));
    const gate = code.indexOf('if (actor.role !== "admin") return');
    const transaction = code.indexOf("db.runTransaction(");
    assert.ok(gate !== -1 && transaction !== -1 && gate < transaction, "the admin gate is no longer before the read");
    const inside = code.slice(transaction);
    const recorded = inside.indexOf("tx.create(db.collection(COURSE_AUDIT_COLLECTION).doc(), {");
    const history = inside.indexOf('withAccessEvent(ask.history, "opened", actor.uid, now)');
    const read = inside.indexOf("accessNeedsWordsOf(data)");
    const answered = inside.indexOf("return { ok: true, value: opened };");
    assert.ok(recorded !== -1 && history !== -1 && read !== -1 && answered !== -1, "the opening's shape changed: read it again against its rule");
    // The answer is the transaction's result, and runTransaction resolves only after the commit,
    // so what matters is that both writes are queued on every path that answers with the words.
    assert.ok(read < recorded && recorded < answered && history < answered, "the opening answers with the words before it queues its record");
    assert.equal((inside.match(/return \{ ok: true/g) ?? []).length, 1, "the opening has a second way to answer with the words");
    assert.match(inside, /kind: recordAs,/);
    assert.match(inside, /subjectUid: ask\.subjectUid,/);
    assert.match(inside, /requestId: ask\.id,/);
    assert.match(inside, /if \(ask\.askedByUid === actor\.uid\) return/);
  });
});

// ---------------------------------------------------------------------------
// 5. Where the kind is named
// ---------------------------------------------------------------------------

const NAMES_THE_KIND = /\bACCESS_NEEDS_KIND\b|["'`]access-needs["'`]/;

const NAMES_KIND = new Map([
  [NORMALISERS, "the kind and its normaliser, which holds no words"],
  [WORDS_READER, "the one reader of the words, which answers null for any other kind"],
  ["src/lib/courses/teamAsk/ask.ts", "the send writes an ask of this kind"],
  ["src/lib/courses/teamAsk/own.ts", "the member's own list, which titles each \"Access needs\" and reads no words"],
  ["src/lib/courses/teamAsk/page.ts", "an admin's row and an admin's page, neither with the words"],
  ["src/lib/courses/requests/load.ts", "the Requests page's rows, from the normaliser that holds no words"],
  ["src/lib/courses/requests/kinds.ts", "which section a row goes in and how Home counts it"],
  ["src/features/courses/requests/RequestsList.tsx", "an admin's section of rows that carry no words"],
]);

describe("where the kind is named", () => {
  test("in the listed places", () => {
    const found = ALL.filter((file) => NAMES_THE_KIND.test(codeOf(file))).map(rel).sort();
    assert.deepEqual(found, [...NAMES_KIND.keys()].sort(), "a new file names the access-needs kind: say what it does with it here, and keep the words out of it");
    for (const [file, why] of NAMES_KIND) assert.ok(why.length > 30, `${file} needs a written reason`);
  });
});
