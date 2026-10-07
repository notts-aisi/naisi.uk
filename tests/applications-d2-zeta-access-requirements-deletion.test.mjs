/**
 * AN ACCESS-REQUIREMENTS ANSWER GOES WHEN ITS APPLICATION GOES, on an
 * application form as on an older round.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this proves
 *
 * The answer is the most sensitive thing an applicant can write, and it is
 * kept in a collection of its own that holds nothing else: no uid and no
 * round to query on. The only way back to a row is the id it shares with its
 * application, `{roundId}__{uid}`. So two things have to be true of the box
 * on the application form, and neither is taken on trust here:
 *
 *  1. THE WRITER PUTS THE ROW AT THE APPLICATION'S OWN ID, and only where
 *     there is an application. It is run, and what it wrote is read.
 *  2. BOTH THINGS THAT DELETE AN APPLICATION TAKE THE ROW WITH IT, in the
 *     same batch: deleting the account, and destroying the form. Each is the
 *     real cascade, run over documents the real writer wrote, on a store that
 *     records every committed batch.
 *
 * And one thing more, which only a run can show: once a form is destroyed
 * the answer is NOWHERE. The record the committee keeps is written by that
 * same destroy, so the store is searched afterwards for the words that were
 * in the box.
 *
 * Real: the applicant's writer, the form's loader, the round destroy, the
 * member-record sync and the account cascade. Faked: `server-only`,
 * `next/server`, the sentinels `firebase-admin/firestore` supplies, and the
 * Admin SDK handle, session and view-as guard, none of which is called. The
 * database is `tests/lib/cascadeStore.mjs`. Nothing here can reach a project.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  AGI,
  CAST,
  ROUND,
  applicationDoc,
  applicationPath,
  privatePath,
  seedTerm,
  stringsIn,
} from "./lib/applicationsSmallTerm.mjs";
import { CASCADE_FIRESTORE_STUB, makeCascadeDb } from "./lib/cascadeStore.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", CASCADE_FIRESTORE_STUB],
    [
      "next/server",
      "export class NextResponse {\n" +
        "  constructor(body, init) { this.body = body; this.status = (init && init.status) || 200; }\n" +
        "  static json(body, init) { return new NextResponse(body, init); }\n" +
        "}",
    ],
    [
      "@/lib/firebase/admin",
      "export function getAdminDb() { throw new Error('not used here'); }\n" +
        "export function getAdminStorage() { return null; }",
    ],
    ["@/lib/firebase/session", "export async function getCurrentUser() { return null; }"],
    ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() { return null; }"],
  ]),
});

const access = await loadTs(join("lib", "applications", "applicant", "accessRequirements.ts"));
const store = await loadTs(join("lib", "applications", "applicant", "store.ts"));
const repo = await loadTs(join("lib", "applications", "repo.ts"));
const { destroyRoundCascade } = await loadTs(join("lib", "admissions", "destroy.ts"));
const { deleteAccountCascade } = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
const { normalizeAdmissionRound } = await loadTs(join("lib", "firestore", "admissionRounds.ts"));
const { admissionApplicationId, admissionApplicationPrivateId } = await loadTs(
  join("lib", "firestore", "admissionApplications.ts"),
);
const { applicationId } = await loadTs(join("lib", "applications", "model.ts"));

/** Words no other string in the term contains, so finding them means the answer leaked. */
const AMARA_WROTE = "Zeta-marker-one: a step-free room, please.";
const NINA_WROTE = "Zeta-marker-two: I lip-read, so a seat near the front.";
const MARKER = /Zeta-marker/;

/**
 * A form four people have applied to. Three sent; Nina started and never did.
 * Amara and Nina each wrote in the box, through the real writer.
 */
async function termWithAnswers() {
  const db = makeCascadeDb(
    seedTerm({
      over: { [applicationPath("nina")]: applicationDoc("nina", [AGI], { sent: false }) },
    }),
  );
  const form = await repo.loadForm(db, ROUND);
  assert.ok(form, "the seeded round is an application form");
  await access.saveOwnAccessRequirements(db, form, "amara", AMARA_WROTE);
  await access.saveOwnAccessRequirements(db, form, "nina", NINA_WROTE);
  return { db, form };
}

const auth = {
  async deleteUser() {},
  async revokeRefreshTokens() {},
};

const everyString = (db) => db.paths().flatMap((path) => stringsIn(db.read(path)));

describe("where the writer puts an answer", () => {
  test("three ways of spelling the id agree", () => {
    // The form's own id for an application, the older rounds' id for one and
    // the id of the row beside it are one string. The cascades address the
    // row by the application's id, so these must never come apart.
    const made = applicationId(ROUND, "amara");
    assert.equal(made, `${ROUND}__amara`);
    assert.equal(admissionApplicationId(ROUND, "amara"), made);
    assert.equal(admissionApplicationPrivateId(ROUND, "amara"), made);
  });

  test("at the application's own id, holding the answer and nothing else", async () => {
    const { db } = await termWithAnswers();
    assert.deepEqual(db.paths("admissionApplicationPrivate/").sort(), [privatePath("amara"), privatePath("nina")].sort());
    assert.deepEqual(db.read(privatePath("amara")), { accessRequirements: AMARA_WROTE });
    assert.deepEqual(db.read(privatePath("nina")), { accessRequirements: NINA_WROTE });
    for (const uid of ["amara", "nina"]) {
      assert.ok(db.has(applicationPath(uid)), "each row sits beside an application");
      assert.equal(privatePath(uid).split("/")[1], applicationPath(uid).split("/")[1]);
    }
  });

  test("the application itself holds none of it", async () => {
    const { db } = await termWithAnswers();
    for (const path of db.paths("admissionApplications/")) {
      assert.ok(!stringsIn(db.read(path)).some((text) => MARKER.test(text)), `${path} holds the answer`);
      assert.ok(!("accessRequirements" in db.read(path)), `${path} has gained the field`);
    }
  });

  test("no row is written where there is no application", async () => {
    const { db, form } = await termWithAnswers();
    await assert.rejects(
      () => access.saveOwnAccessRequirements(db, form, "yusuf", "Written by somebody who never applied."),
      (err) => err instanceof store.ApplicantError && err.status === 409 && err.extra.retry === true,
    );
    assert.equal(db.has(privatePath("yusuf")), false, "a row with no application could never be found again");
  });
});

describe("deleting an account", () => {
  test("takes the answer in the same batch as the application", async () => {
    const { db } = await termWithAnswers();
    const summary = await deleteAccountCascade(auth, db, "amara");

    assert.equal(summary.admissionApplicationsDeleted, 1);
    assert.equal(summary.admissionApplicationPrivateDeleted, 1);
    assert.equal(db.has(applicationPath("amara")), false);
    assert.equal(db.has(privatePath("amara")), false, "the answer outlived the account");

    const together = db.batches.find((paths) => paths.includes(applicationPath("amara")));
    assert.ok(together, "the application was deleted in a batch");
    assert.ok(
      together.includes(privatePath("amara")),
      "the answer was not deleted in its application's batch, so a failure between the two " +
        "would strand it where nothing can find it",
    );
  });

  test("leaves nobody else's answer, and leaves that person's words nowhere", async () => {
    const { db } = await termWithAnswers();
    await deleteAccountCascade(auth, db, "amara");

    assert.deepEqual(db.read(privatePath("nina")), { accessRequirements: NINA_WROTE });
    assert.ok(
      !everyString(db).some((text) => text.includes("Zeta-marker-one")),
      "something in the database still holds what the deleted person wrote in the box",
    );
  });

  test("an application that was never sent takes its answer with it too", async () => {
    const { db } = await termWithAnswers();
    const summary = await deleteAccountCascade(auth, db, "nina");
    assert.equal(summary.admissionApplicationPrivateDeleted, 1);
    assert.equal(db.has(privatePath("nina")), false);
  });
});

describe("destroying the form", () => {
  const ACTOR = { actorUid: CAST.zach.uid, actorName: CAST.zach.displayName };

  /** Close the form (an open one is refused) and run the destroy until it says it has finished. */
  async function destroyed() {
    const { db } = await termWithAnswers();
    db.poke(`admissionRounds/${ROUND}`, { status: "closed" });
    const round = normalizeAdmissionRound(ROUND, db.read(`admissionRounds/${ROUND}`));
    let result = null;
    for (let pass = 0; pass < 10; pass += 1) {
      result = await destroyRoundCascade(db, ROUND, round, ACTOR);
      if (result.complete) return { db, result };
    }
    throw new Error("the destroy never reported complete");
  }

  test("takes every answer, each in the same batch as its application", async () => {
    const { db, result } = await destroyed();

    assert.deepEqual(db.paths("admissionApplicationPrivate/"), [], "an answer outlived its form");
    assert.deepEqual(db.paths("admissionApplications/"), []);
    assert.equal(result.deleted.applications, 4);
    assert.equal(result.deleted.applicationPrivateRows, 2, "the receipt counts the answers it removed");

    for (const uid of ["amara", "nina"]) {
      const together = db.batches.find((paths) => paths.includes(applicationPath(uid)));
      assert.ok(together, `${uid}'s application was deleted in a batch`);
      assert.ok(together.includes(privatePath(uid)), `${uid}'s answer was not in their application's batch`);
    }
  });

  test("the record the committee keeps is written, and holds none of it", async () => {
    const { db } = await destroyed();

    // The destroy writes each person's record before it deletes anything.
    for (const uid of ["amara", "nina"]) {
      const record = db.read(`memberRecords/${uid}/applications/${ROUND}`);
      assert.ok(record, `${uid} has no record of this application`);
      assert.ok(!("accessRequirements" in record));
    }
    // And after it, the words that were in the box are nowhere at all.
    const left = everyString(db).filter((text) => MARKER.test(text));
    assert.deepEqual(left, [], "something the destroy kept or wrote holds an access-requirements answer");
  });
});
