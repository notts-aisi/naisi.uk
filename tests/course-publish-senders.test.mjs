/**
 * EVERY WAY A PERSON IS TOLD THEIR GROUP, FOUND IN THE SOURCE, NOT NAMED.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Only an admin publishes: Publish emails everybody on a run their group, so
 * its press and its test are an admin's alone
 * (tests/course-publish-admins-only.test.mjs). This walks every `.ts` and
 * `.tsx` file under `src` for anything that does what Publish does, so the
 * next way to tell somebody their group is caught without anybody
 * remembering it:
 *
 *  - SENDS a "your group" email: `sendCourseApplicationEmail` with a kind
 *    Publish writes (`allocated`, `moved`, `facilitating`, `joined`, `left`,
 *    or a kind the source does not fix to one of the application's own
 *    four), and `sendMoveEmail`;
 *  - WRITES one: a call of any of the group emails' composers, outside the
 *    composers' own files;
 *  - STAMPS a seat or a run as told: `allocatedEmailAt`,
 *    `allocationPublishedAt` or `toldGroupId` written with anything but
 *    `FieldValue.delete()` (an object handed to `update`, `set` or `create`,
 *    or a property assigned on a patch);
 *  - or CALLS a library function listed below as one that does any of those.
 *
 * Every file that does is in `SENDERS` with what it does and why it is or is
 * not Publish, and every file in `SENDERS` still does it: both directions.
 * The two publishing routes are held to their admin-only refusal; the other
 * admin-only routes to theirs.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** The four application emails `sendCourseApplicationEmail` also sends, none of which names a group. */
const APPLICATION_KINDS = new Set(["submitted", "accepted", "waitlisted", "rejected"]);
/** The composers of the emails Publish sends, and the files they live in. */
const COMPOSERS = new Set([
  "composePlacementEmail",
  "composeWholeEmail",
  "composeFacilitatingEmail",
  "composeIncubatorStartEmail",
  "composeJoinedEmail",
  "composeLeftEmail",
  "composeMovedEmail",
]);
const STAMPS = new Set(["allocatedEmailAt", "allocationPublishedAt", "toldGroupId"]);
const WRITES = new Set(["update", "set", "create"]);
/** A write's receiver is a transaction, a batch or a document reference, never a Map. */
const FIRESTORE_RECEIVER = /(\btx|\btransaction|\bbatch|Ref|\.doc\([^)]*\))$/;

const ADMIN_ONLY_PUBLISH = /if \(!staffing\.isAdmin\)/;
const ADMIN_ROLE = /role !== "admin"/;

/**
 * EVERY FILE THAT SENDS, WRITES OR STAMPS, with why. `does` is what the walk
 * finds there; `via` names the functions a library file exports that do it,
 * whose every importer must be here too; `gate` is a pattern the file must
 * hold.
 */
const SENDERS = {
  // ── Publish ────────────────────────────────────────────────────────────────
  "app/api/courses/runs/[runId]/allocation/publish/route.ts": {
    does: ["sends", "stamps"],
    gate: ADMIN_ONLY_PUBLISH,
    why: "PUBLISH: emails each person placed their group (or that they have moved), each facilitator theirs, and stamps each seat told and the run published. Admin only: the programme's lead and the run's track lead are refused in one sentence.",
  },
  "app/api/courses/runs/[runId]/allocation/publish/test/route.ts": {
    does: ["sends"],
    gate: ADMIN_ONLY_PUBLISH,
    why: "PUBLISH's test: the first email of each kind a press would send, to the caller's own address only, and it unlocks the press. Admin only, as Publish.",
  },
  "lib/courses/allocationPublish.ts": {
    does: ["writes"],
    why: "Not a sender: the plan Publish, its test, its preview and the board's count read. It composes every email a press would send and sends none.",
  },
  // ── Email designs (admins) ─────────────────────────────────────────────────
  "app/api/admin/course-emails/[templateId]/send-test/route.ts": {
    does: ["writes"],
    gate: ADMIN_ROLE,
    why: "Not Publish: an admin's test of a template in Email designs, written from sample facts and sent to that admin's own address. Admin only.",
  },
  "app/api/admin/course-emails/preview/route.ts": {
    does: ["writes"],
    gate: ADMIN_ROLE,
    why: "Not Publish: draws a template in Email designs from sample facts and sends nothing. Admin only.",
  },
  // ── The composers, sharing one writer ─────────────────────────────────────
  "lib/courses/facilitatingEmail.ts": {
    does: ["writes"],
    why: "A composer itself: the facilitators' email, built on the people's email's whole-email writer. Sends nothing.",
  },
  "lib/courses/incubatorStartEmail.ts": {
    does: ["writes"],
    why: "A composer itself: an incubator's email, built on the people's email's whole-email writer. Sends nothing.",
  },
  // ── Found by the walk, and not a write ───────────────────────────────────
  "lib/firestore/courseEnrolments.ts": {
    does: ["stamps"],
    why: "Not a sender and not a write: the seat's normaliser sets `allocatedEmailAt` on the object it hands back from what is stored. Listed because the walk cannot tell that object from a patch.",
  },
  // ── Moving one person for good ─────────────────────────────────────────────
  "lib/courses/moveFromWeek.ts": {
    does: ["stamps"],
    via: ["moveFromWeek"],
    why: "Not Publish: the one writer of a move from a week on. A staff move keeps a told seat told (the group they join becomes the one they were told about, `toldGroupId`); a board move told before its group was kept records the group it leaves. Never writes `allocatedEmailAt` and sends nothing.",
  },
  "lib/courses/staffMove/save.ts": {
    does: ["sends", "calls"],
    via: ["saveMove"],
    why: "Not Publish, MOVING: a move for good of one person already told their group, which emails that one person and both groups' facilitators. Kept with the programme's lead by the owner (November 2026), with limits on how often it emails.",
  },
  "lib/courses/staffMove/board.ts": {
    does: ["calls"],
    via: ["saveBoardMove"],
    why: "Not Publish: a move made mid-term on the allocation board, through the move writer, which emails nobody (the next Publish tells them).",
  },
  "app/api/courses/runs/[runId]/allocate/route.ts": {
    does: ["calls", "stamps"],
    why: "Not Publish, PLACING: the board's placements, the programme's lead's as much as an admin's. It emails nobody and never stamps a seat told: for a seat told before the group it was told about was kept, a move records that group (`toldGroupId`), and the next Publish, an admin's, tells them.",
  },
  "app/api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/move/route.ts": {
    does: ["calls"],
    why: "Not Publish, MOVING: the press of a move for good from a person's page. The programme's lead and admins; it emails that one person and both groups' facilitators.",
  },
  "lib/courses/moveRequest/decide.ts": {
    does: ["calls"],
    via: ["approveMoveRequest"],
    why: "Not Publish: approving a person's own request to change group for good, made through the staff move's writer and its emails.",
  },
  "app/api/courses/requests/[requestId]/move/approve/route.ts": {
    does: ["calls"],
    why: "Not Publish: the press that approves a request to change group. Admins only; it emails that one person and both groups' facilitators.",
  },
};

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

function sourceFiles(dir = SRC) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [relative(SRC, path).split("\\").join("/")] : [];
  });
}

/** The file a module specifier names, from `src`, without its extension. */
function resolved(file, specifier) {
  if (specifier.startsWith("@/")) return specifier.slice(2);
  if (specifier.startsWith(".")) return join(dirname(file), specifier).split("\\").join("/");
  return null;
}
const withoutExtension = (file) => file.replace(/\.tsx?$/, "");

const callee = (call) =>
  ts.isIdentifier(call.expression) ? call.expression.text : ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : null;
const keyOf = (name) => (ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null);
const isDelete = (node) => /^FieldValue\.delete\(\)$/.test(node.getText().replace(/\s+/g, ""));

/** The literal values an expression can only ever be, or null when it can be anything. */
function literalsOf(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isParenthesizedExpression(node)) return literalsOf(node.expression);
  if (ts.isConditionalExpression(node)) {
    const a = literalsOf(node.whenTrue);
    const b = literalsOf(node.whenFalse);
    return a && b ? [...a, ...b] : null;
  }
  return null;
}

/** What one file does, of the four, and the wrappers it calls (as `{ from, name }`). */
function readFile(file) {
  const text = readFileSync(join(SRC, file), "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const does = new Set();
  const imported = new Map();
  const calls = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const from = resolved(file, node.moduleSpecifier.text);
      for (const element of node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) ? node.importClause.namedBindings.elements : []) {
        if (from) imported.set(element.name.text, { from: withoutExtension(from), name: (element.propertyName ?? element.name).text });
      }
    }
    if (ts.isCallExpression(node)) {
      const name = callee(node);
      if (name === "sendMoveEmail") does.add("sends");
      if (name === "sendCourseApplicationEmail") {
        const options = node.arguments[0];
        const kind = options && ts.isObjectLiteralExpression(options)
          ? options.properties.find((p) => ts.isPropertyAssignment(p) && keyOf(p.name) === "kind")
          : null;
        const values = kind ? literalsOf(kind.initializer) : null;
        if (!values || values.some((value) => !APPLICATION_KINDS.has(value))) does.add("sends");
      }
      if (name && COMPOSERS.has(name)) does.add("writes");
      if (name && WRITES.has(name) && ts.isPropertyAccessExpression(node.expression) && FIRESTORE_RECEIVER.test(node.expression.expression.getText())) {
        for (const argument of node.arguments) {
          if (!ts.isObjectLiteralExpression(argument)) continue;
          for (const property of argument.properties) {
            if (ts.isPropertyAssignment(property) && STAMPS.has(keyOf(property.name)) && !isDelete(property.initializer)) does.add("stamps");
          }
        }
      }
      if (ts.isIdentifier(node.expression)) calls.push(node.expression.text);
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left)) &&
      STAMPS.has(ts.isPropertyAccessExpression(node.left) ? node.left.name.text : keyOf(node.left.argumentExpression) ?? "") &&
      !isDelete(node.right)
    ) {
      does.add("stamps");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { text, does, wrappersCalled: calls.map((name) => imported.get(name)).filter(Boolean) };
}

const FILES = sourceFiles();
const WRAPPERS = new Map(
  Object.entries(SENDERS).flatMap(([file, entry]) => (entry.via ?? []).map((name) => [`${withoutExtension(file)}#${name}`, file])),
);
const COMPOSER_FILES = new Set(["lib/courses/placementEmail.ts", "lib/courses/joinedEmail.ts", "lib/courses/leftEmail.ts", "lib/courses/movedEmail.ts"]);

/** Every file the walk finds sending, writing, stamping or calling a sender, with what it does. */
const FOUND = new Map();
for (const file of FILES) {
  const read = readFile(file);
  const does = new Set(read.does);
  // A composer's own file writes its own email: it is the thing looked for, not a caller of it.
  if (COMPOSER_FILES.has(file)) does.delete("writes");
  if (read.wrappersCalled.some((call) => WRAPPERS.has(`${call.from}#${call.name}`))) does.add("calls");
  if (does.size > 0) FOUND.set(file, { does: [...does].sort(), text: read.text });
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

describe("every file that tells somebody their group, or stamps them told, is listed with why", () => {
  test("the walk finds the two publishing routes, so it is reading the tree", () => {
    for (const file of ["app/api/courses/runs/[runId]/allocation/publish/route.ts", "app/api/courses/runs/[runId]/allocation/publish/test/route.ts"]) {
      assert.ok(FOUND.has(file), `the walk did not find ${file}`);
    }
    assert.ok(FOUND.size >= 10, `only ${FOUND.size} files found`);
  });

  test("every file the walk finds is listed (a new one says here what it is, and whether it is Publish)", () => {
    const unlisted = [...FOUND.keys()].filter((file) => !(file in SENDERS));
    assert.deepEqual(unlisted.map((file) => `${file}: ${FOUND.get(file).does.join(", ")}`), []);
  });

  test("every listed file still does what it is listed for, and nothing more", () => {
    for (const [file, entry] of Object.entries(SENDERS)) {
      assert.ok(FOUND.has(file), `${file} is listed and the walk finds nothing there: take it off`);
      assert.deepEqual(FOUND.get(file).does, [...entry.does].sort(), `${file} does something other than it is listed for`);
      assert.ok(entry.why.length > 40, `${file} says too little about why`);
    }
  });

  test("each wrapper a library file is listed for is still exported there", () => {
    for (const [file, entry] of Object.entries(SENDERS)) {
      for (const name of entry.via ?? []) {
        assert.match(FOUND.get(file)?.text ?? "", new RegExp(`export (async )?function ${name}\\b`), `${file} no longer exports ${name}`);
      }
    }
  });

  test("only Publish and its test are Publish, and both refuse everybody but an admin; the other admin routes hold their gate", () => {
    const publishing = Object.entries(SENDERS).filter(([, entry]) => entry.why.startsWith("PUBLISH"));
    assert.deepEqual(publishing.map(([file]) => file).sort(), [
      "app/api/courses/runs/[runId]/allocation/publish/route.ts",
      "app/api/courses/runs/[runId]/allocation/publish/test/route.ts",
    ]);
    for (const [file, entry] of Object.entries(SENDERS)) {
      if (entry.gate) assert.match(FOUND.get(file)?.text ?? "", entry.gate, `${file} lost its gate`);
    }
    // The refusal comes before the press is held and before any row about the people is read.
    const publish = FOUND.get("app/api/courses/runs/[runId]/allocation/publish/route.ts").text;
    const refusal = publish.search(ADMIN_ONLY_PUBLISH);
    assert.ok(refusal > 0 && refusal < publish.indexOf("takePressLock(db") && refusal < publish.indexOf('collection("courseApplications")'));
    const tested = FOUND.get("app/api/courses/runs/[runId]/allocation/publish/test/route.ts").text;
    assert.ok(tested.search(ADMIN_ONLY_PUBLISH) < tested.indexOf('collection("courseApplications")'));
  });
});
