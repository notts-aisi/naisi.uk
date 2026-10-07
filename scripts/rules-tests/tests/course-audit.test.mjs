/**
 * Rules tests for V3 W1 PR5's two new rules blocks: `courseAudit` and the
 * explicit `config/{doc}` deny.
 *
 * `courseAudit` is ONE append-only log for every course operational action
 * that has to stay answerable after the fact: a register pushed or edited
 * after the lock, a facilitator appointed or removed, a member dropping out,
 * a run settled, an enrolment mode changed, a week unlocked early, an
 * applicant's access-requirements answer read, and each decision made about
 * an application. It is the server's alone, and the two properties below are
 * the whole of it:
 *
 *  - READ is shut to every client, ADMINS INCLUDED. A row names an ACTOR
 *    and, for some kinds, a SUBJECT. A line about a decision on an
 *    application carries the applicant's account id, the programme and the
 *    outcome. The decision documents (`admissionDecisions`) are closed to
 *    every browser so that nobody reads what was decided about them before
 *    decision day, and an admin can have applied. This log holds a copy of
 *    the same facts, so it is closed the same way. Whatever shows a line to
 *    a person is a server page, which decides what that person may see.
 *    THE ADMIN CASES BELOW ASSERT A REFUSAL ON PURPOSE. An admin's `get` and
 *    an admin's list are the two reads a relaxed rule would hand back first,
 *    so they are the two this file tries first.
 *  - WRITE is shut to every client, ADMINS INCLUDED. An append-only log its
 *    own actor can amend is not an audit trail, and the actors here are
 *    admins. Every writer is an Admin SDK route.
 *
 * `config` has never had a match block: the collection was closed by
 * deny-by-default, which works right up until somebody adds a wildcard above
 * it. The block is documentation with teeth, and the tests here are what stop
 * it being deleted as redundant.
 */
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import {
  asAnon,
  asUser,
  assertFails,
  assertSucceeds,
  cleanup,
  clearData,
  getTestEnv,
  seed,
  seedUser,
} from "../lib/harness.mjs";

before(async () => {
  await getTestEnv("course-audit");
});
after(cleanup);
afterEach(clearData);

/**
 * The cast, one of each hat the courses rules distinguish, and the two the
 * roster rules add: committee the Students' Union does not recognise, and an
 * account still waiting to be approved.
 */
async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("drafter", { role: "member", permissions: { draftCourse: true } });
  await seedUser("approver", { role: "member", permissions: { approveCourse: true } });
  await seedUser("committee1", { role: "committee", suRecognised: true });
  await seedUser("nonsu1", { role: "committee" });
  await seedUser("learner", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

/** Everybody in the cast who is not an admin. */
const NOT_ADMINS = ["drafter", "approver", "committee1", "nonsu1", "learner", "pending1"];

/** The form and the programme the decision lines below are about. */
const FORM_ID = "autumn-2026__f0rm0001";
const PROGRAMME_ID = "agi-strategy";

function auditDoc(overrides = {}) {
  return {
    kind: "attendance-push",
    runId: "run1",
    groupId: "grp1",
    subjectUid: null,
    actorUid: "approver",
    actorName: "A Facilitator",
    targetLabel: "Week 3 register",
    detail: "Register pushed and locked.",
    at: new Date("2026-10-27T20:00:00Z"),
    ...overrides,
  };
}

/** Write a row the way an Admin SDK route would (rules bypassed). */
async function seedAudit(id, overrides = {}) {
  await seed(async (db) => {
    await db.collection("courseAudit").doc(id).set(auditDoc(overrides));
  });
}

/** A line as the decision routes write one: no run, the form, and the applicant by account id. */
function decisionLine(subjectUid, overrides = {}) {
  return {
    kind: "application-decision",
    runId: "",
    groupId: null,
    roundId: FORM_ID,
    programmeId: PROGRAMME_ID,
    subjectUid,
    actorUid: "approver",
    actorName: "A Lead",
    targetLabel: "Autumn 2026 · AGI Strategy",
    detail: "A accepted an applicant for AGI Strategy.",
    ...overrides,
  };
}

describe("courseAudit: read is shut to everyone", () => {
  it("refuses an admin a row and a list of the log", async () => {
    // THE TWO ASSERTIONS HERE SAY "REFUSED" ON PURPOSE. No client reads this
    // log, an admin's included: the page that shows a line is built on the
    // server for whoever is looking. A rule that let an admin's browser read
    // it would be the first thing these two notice.
    await seedCast();
    await seedAudit("a1");
    const db = await asUser("admin1");
    // The control. The row is there, and this session is an admin's: it is
    // served a read only an admin or the recognised committee is allowed. So
    // the refusals under it are this block's, and not a harness that refuses
    // everything.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("courseAudit").doc("a1").get()).exists, true);
    });
    await assertSucceeds(db.collection("users").doc("learner").get());

    await assertFails(db.collection("courseAudit").doc("a1").get());
    await assertFails(db.collection("courseAudit").where("runId", "==", "run1").get());
    // The whole log, asked for with no filter at all.
    await assertFails(db.collection("courseAudit").get());
  });

  it("refuses an admin the lines about a decision on their own application", async () => {
    // Anybody on the committee can apply, an admin included, and what is
    // decided about a person is not theirs to read before decision day. The
    // decision document is closed to every browser for that reason. Each
    // decision also appends a line here, with the applicant's account id, the
    // programme and the outcome, so the same has to hold for the line: asked
    // for by its id, by the applicant, by the form, by its kind, and as part
    // of the whole log.
    await seedCast();
    await seedAudit("d1", decisionLine("admin1"));
    await seedAudit("d2", decisionLine("admin1", {
      kind: "application-pooled-outcome",
      detail: "Picked no offer this time for a pooled applicant.",
    }));
    const log = (await asUser("admin1")).collection("courseAudit");
    await assertFails(log.doc("d1").get());
    await assertFails(log.doc("d2").get());
    await assertFails(log.where("subjectUid", "==", "admin1").get());
    await assertFails(log.where("roundId", "==", FORM_ID).get());
    await assertFails(log.where("kind", "==", "application-decision").get());
    await assertFails(log.where("programmeId", "==", PROGRAMME_ID).get());
    await assertFails(log.get());
  });

  it("refuses an admin a line about a decision on somebody else's application too", async () => {
    // The rule does not ask whose line it is. Who may be shown one is the
    // server's question, asked of the form and the programme, and a rule
    // cannot ask it.
    await seedCast();
    await seedAudit("d1", decisionLine("learner"));
    const log = (await asUser("admin1")).collection("courseAudit");
    await assertFails(log.doc("d1").get());
    await assertFails(log.where("subjectUid", "==", "learner").get());
  });

  it("refuses every other hat, including the course staff tier", async () => {
    await seedCast();
    await seedAudit("a1");
    await seedAudit("d1", decisionLine("learner"));
    // draftCourse / approveCourse read courseTemplates and courseMaterialNotes
    // freely. They do NOT read this: a row can name who looked at an
    // applicant's access requirements, and what a programme decided about
    // somebody.
    for (const uid of NOT_ADMINS) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseAudit").doc("a1").get());
      await assertFails(db.collection("courseAudit").where("runId", "==", "run1").get());
      await assertFails(db.collection("courseAudit").doc("d1").get());
      await assertFails(db.collection("courseAudit").where("roundId", "==", FORM_ID).get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("courseAudit").doc("a1").get());
    await assertFails(anon.collection("courseAudit").where("runId", "==", "run1").get());
  });

  it("refuses a row whose subject is the reader themselves", async () => {
    // The obvious "surely I can see my own" carve-out, deliberately absent.
    // The row is about an ACTION TAKEN ON somebody, written by staff, and the
    // `detail` sentence is staff prose about them. Own-row read here would
    // hand a dropped-out member the sentence a facilitator wrote about their
    // leaving.
    await seedCast();
    await seedAudit("a1", {
      kind: "enrolment-dropout",
      subjectUid: "learner",
      actorUid: "learner",
    });
    const db = await asUser("learner");
    await assertFails(db.collection("courseAudit").doc("a1").get());
  });
});

describe("courseAudit: write is shut to everyone", () => {
  it("refuses create, update and delete from every hat, admins included", async () => {
    await seedCast();
    await seedAudit("a1");
    for (const uid of ["admin1", "approver", "drafter", "committee1", "learner"]) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseAudit").doc("new").set(auditDoc()));
      await assertFails(
        db.collection("courseAudit").doc("a1").update({ detail: "Nothing happened." }),
      );
      await assertFails(db.collection("courseAudit").doc("a1").delete());
    }
  });

  it("refuses an admin rewriting the actor on a row that names them", async () => {
    // The specific attack the posture exists for: the only surviving record
    // of an admin action is a row that same admin could otherwise repoint at
    // somebody else.
    await seedCast();
    await seedAudit("a1", { kind: "access-requirements-read", actorUid: "admin1" });
    const db = await asUser("admin1");
    await assertFails(
      db.collection("courseAudit").doc("a1").update({ actorUid: "approver" }),
    );
  });
});

describe("config: the server-only collection is explicitly shut", () => {
  it("refuses reads and writes of every config doc, admins included", async () => {
    await seedCast();
    await seed(async (db) => {
      await db.collection("config").doc("courses").set({
        unmarkedRegisterGraceHours: 36,
        dropOutFeedbackUrl: "https://example.org/feedback",
        nextSessionMaxDays: 14,
        unmarkedScanBudgetMs: 20000,
        maxFollowUpTasksPerTick: 25,
      });
      await db.collection("config").doc("taskEmails").set({ enabled: true });
    });

    for (const uid of ["admin1", "approver", "committee1", "learner"]) {
      const db = await asUser(uid);
      for (const doc of ["courses", "taskEmails"]) {
        await assertFails(db.collection("config").doc(doc).get());
        await assertFails(db.collection("config").doc(doc).update({ enabled: false }));
      }
      await assertFails(db.collection("config").doc("newone").set({ a: 1 }));
      await assertFails(db.collection("config").get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("config").doc("courses").get());
  });
});
