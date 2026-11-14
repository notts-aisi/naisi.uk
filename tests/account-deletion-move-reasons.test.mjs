/**
 * The reason staff gave for moving somebody to another group mid-term, when
 * that person's account is deleted: `clearMoveReasons` in the account
 * deletion cascade, EXECUTED.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards
 *
 * A move writes one History row on each group (`courseAudit`, kind
 * `member-moved`, `subjectUid` the person moved), and the optional "Why" is
 * kept on both: in the row's `reason` field and at the end of its sentence
 * ("... from week 3. Reason: ..."). It is a note about that person. When their
 * account is deleted the rows stay, as every History row does, and the reason
 * comes off each, from both places; nothing else changes: not another kind of
 * row about them, and not a row about somebody else.
 *
 * Faked: `firebase-admin/firestore` (sentinels the cascade store can
 * interpret) and `server-only`. The cascade is the real one. Nothing here can
 * reach a Firestore project.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { CASCADE_FIRESTORE_STUB, makeCascadeDb } from "./lib/cascadeStore.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", CASCADE_FIRESTORE_STUB],
    ["next/server", "export class NextResponse { static json(body, init) { return { body, status: (init && init.status) || 200 }; } }"],
    ["@/lib/firebase/admin", "export function getAdminDb() { throw new Error('not used here'); }\nexport function getAdminStorage() { return null; }"],
    ["@/lib/firebase/session", "export async function getCurrentUser() { return null; }"],
    ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() { return null; }"],
  ]),
});
const { deleteAccountCascade } = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
const { movedInDetail, movedOutDetail, withoutMoveReason } = await loadTs(join("lib", "courses", "staffMove", "words.ts"));
const auth = { async deleteUser() {}, async revokeRefreshTokens() {} };

const AT = new Date("2026-11-18T09:00:00Z");
const REASON = "Has a lab on Mondays";

/** A History row as a move's save writes one. */
function movedRow(groupId, detail, over = {}) {
  return {
    runId: "run-1",
    groupId,
    kind: "member-moved",
    category: "people",
    detail,
    reason: REASON,
    weekId: "w03",
    emailed: 3,
    subjectUid: "leo",
    actorUid: "lead",
    actorName: "The lead",
    at: AT,
    ...over,
  };
}

function seed() {
  return {
    "users/leo": { uid: "leo", role: "member" },
    // Leo's move from Group C to Group F, one row on each group.
    "courseAudit/out": movedRow("group-c", movedOutDetail("Leo Park", "Group F", 3, REASON)),
    "courseAudit/in": movedRow("group-f", movedInDetail("Leo Park", "Group C", 3, REASON)),
    // A move of Leo's with no reason given.
    "courseAudit/plain": movedRow("group-c", movedOutDetail("Leo Park", "Group F", 5, ""), { reason: null }),
    // Another kind of row about Leo, with a reason of its own: not a move's.
    "courseAudit/other": { runId: "run-1", groupId: "group-c", kind: "attendance-edit", detail: "A line put right. Reason: Typed in the wrong column", reason: "Typed in the wrong column", subjectUid: "leo", at: AT },
    // Somebody else's move.
    "courseAudit/ana": movedRow("group-c", movedOutDetail("Ana Lee", "Group F", 3, REASON), { subjectUid: "ana" }),
  };
}

describe("deleting the account of somebody moved mid-term", () => {
  test("both History rows stay, and the reason comes off each, from its field and its sentence", async () => {
    const db = makeCascadeDb(seed());
    db.recursiveDelete = async (ref) => ref.delete();
    const before = seed();
    const summary = await deleteAccountCascade(auth, db, "leo");
    assert.equal(summary.courseMoveReasonsCleared, 2);
    const out = db.read("courseAudit/out");
    const into = db.read("courseAudit/in");
    assert.equal(out.detail, "Leo Park moved to Group F from week 3.");
    assert.equal(into.detail, "Leo Park moved here from Group C, from week 3.");
    for (const row of [out, into]) {
      assert.equal("reason" in row, false, "the reason's field is gone");
      assert.ok(!JSON.stringify(row).includes("lab on Mondays"));
      assert.equal(row.kind, "member-moved");
      assert.equal(row.subjectUid, "leo");
      assert.equal(row.emailed, 3);
    }
    // A move with no reason, another kind of row about Leo, and somebody else's move: untouched.
    assert.deepEqual(db.read("courseAudit/plain"), before["courseAudit/plain"]);
    assert.deepEqual(db.read("courseAudit/other"), before["courseAudit/other"]);
    assert.deepEqual(db.read("courseAudit/ana"), before["courseAudit/ana"]);
  });

  test("a sentence whose kept reason does not match its field still loses everything from its Reason", () => {
    assert.equal(withoutMoveReason("Leo Park moved to Group F from week 3. Reason: Has a  lab", "Something else"), "Leo Park moved to Group F from week 3.");
    assert.equal(withoutMoveReason("Leo Park moved to Group F from week 3. Reason: Has a lab", null), "Leo Park moved to Group F from week 3.");
    assert.equal(withoutMoveReason("Leo Park moved to Group F from week 3.", null), "Leo Park moved to Group F from week 3.");
  });
});
