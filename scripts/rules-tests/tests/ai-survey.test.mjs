/**
 * The AI at Nottingham survey's five collections: LOCKED TO EVERYBODY.
 *
 * The survey is anonymous, with a University-email check in front of it. It
 * tells students that nobody can tell which answers are theirs, and that only
 * one person opens individual answers. Those two sentences are kept by the
 * server (src/lib/aiSurvey/store.ts), and they would be undone by a single
 * rule that let a browser read either half:
 *
 *  - `aiSurveyAnswers` holds every answer set. An admin-role read would hand
 *    them to every admin's browser, and the survey says one person.
 *  - `aiSurveyUsedEmails` holds a keyed hash of every address that answered.
 *    Readable beside the answers, it puts both halves in one place.
 *  - `aiSurveyState` holds the key that signs a browser's pass. Readable, it
 *    lets anybody write a pass and skip the email check. Writable, it lets
 *    anybody open the survey, close it, or put themselves on its allowlist.
 *  - `aiSurveyCodes` and `aiSurveyCodeLimits` are the email check's own
 *    working records. Writable, a pending code could be planted for any
 *    address.
 *
 * So there is no persona below that succeeds at anything, the admin included.
 * Every read and write goes through a route, with the Admin SDK.
 */
import { after, afterEach, before, describe, it } from "node:test";
import {
  asAnon,
  asUser,
  assertFails,
  cleanup,
  clearData,
  getTestEnv,
  seed,
  seedUser,
} from "../lib/harness.mjs";

before(async () => {
  await getTestEnv("ai-survey");
});
after(cleanup);
afterEach(clearData);

/** One context per role, so "every role" is not a euphemism for "a member". */
async function everyRole() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("su1", { role: "committee", suRecognised: true });
  await seedUser("committee1", { role: "committee" });
  await seedUser("member1", { role: "member" });
  await seedUser("pending1", { role: "pending" });
  return [
    ["anonymous", await asAnon()],
    ["pending", await asUser("pending1")],
    ["member", await asUser("member1")],
    ["non-SU committee", await asUser("committee1")],
    ["SU committee", await asUser("su1")],
    ["admin", await asUser("admin1")],
  ];
}

/** Each collection with a document shaped the way the server writes one. */
const COLLECTIONS = [
  ["aiSurveyState", "main", { stage: "open", epoch: "abc123", passKey: "c2VjcmV0", adminUids: ["admin1"] }],
  ["aiSurveyAnswers", "abc123-000", { sets: { someKey: { v: 1, o: ["d1"], p: { about1: { A1: "ug" } } } }, beat: 1 }],
  ["aiSurveyUsedEmails", "abc123-a", { h: { a1b2c3: true }, beat: 1 }],
  ["aiSurveyCodes", "0f0f0f", { code: "9e9e9e", tries: 0 }],
  ["aiSurveyCodeLimits", "1a1a1a", { day: "2026-11-17", sent: 1 }],
];

async function seedAll() {
  await seed(async (db) => {
    for (const [collection, id, data] of COLLECTIONS) await db.collection(collection).doc(id).set(data);
  });
}

describe("the AI at Nottingham survey's collections", () => {
  it("cannot be read, listed or queried by anyone, at any role", async () => {
    await seedAll();
    for (const [label, db] of await everyRole()) {
      for (const [collection, id] of COLLECTIONS) {
        await assertFails(db.collection(collection).doc(id).get(), `${label} must not read ${collection}`);
        await assertFails(db.collection(collection).get(), `${label} must not list ${collection}`);
        await assertFails(
          db.collection(collection).where("beat", ">=", 0).get(),
          `${label} must not query ${collection}`,
        );
      }
    }
  });

  it("cannot be created by anyone, at any role", async () => {
    for (const [label, db] of await everyRole()) {
      for (const [collection, , data] of COLLECTIONS) {
        const id = `made-by-${label.replace(/\W+/g, "-")}`;
        await assertFails(db.collection(collection).doc(id).set(data), `${label} must not create in ${collection}`);
        await assertFails(db.collection(collection).add(data), `${label} must not append to ${collection}`);
      }
    }
  });

  it("cannot be updated or deleted by anyone, at any role", async () => {
    await seedAll();
    for (const [label, db] of await everyRole()) {
      for (const [collection, id] of COLLECTIONS) {
        await assertFails(
          db.collection(collection).doc(id).set({ beat: 2 }, { merge: true }),
          `${label} must not update ${collection}`,
        );
        await assertFails(db.collection(collection).doc(id).delete(), `${label} must not delete from ${collection}`);
      }
    }
  });

  it("THE ALLOWLIST: an admin cannot put an account on the survey's list from a browser", async () => {
    // The list is what decides who downloads every answer. It is changed by
    // the server alone, so the admin role is not a way onto it.
    await seedAll();
    await seedUser("admin1", { role: "admin" });
    const db = await asUser("admin1");
    await assertFails(db.collection("aiSurveyState").doc("main").set({ adminUids: ["admin1", "friend"] }, { merge: true }));
    await assertFails(db.collection("aiSurveyState").doc("main").set({ stage: "closed" }, { merge: true }));
  });

  it("A PLANTED CODE: nobody can write a pending code for an address", async () => {
    // A pending code that a browser could write is a code its writer knows.
    for (const [label, db] of await everyRole()) {
      await assertFails(
        db.collection("aiSurveyCodes").doc("planted").set({ code: "known", tries: 0 }),
        `${label} must not plant a code`,
      );
    }
  });
});
