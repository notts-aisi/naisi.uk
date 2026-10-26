/**
 * WHAT A DELETION DOES TO SURVEYS (docs/surveys.md, "Deletion"), run on the
 * real cascades against the store they are tested with elsewhere.
 *
 *  - DELETING AN ACCOUNT takes the person's name off their survey answers at
 *    once (the answers stay, so the totals stay) and deletes their rows on
 *    surveys (who a survey was sent to, the secret in their link), each
 *    counted in the summary. Nobody else's answers or rows are touched.
 *  - DESTROYING A FORM leaves its surveys alone. A survey is the programme's,
 *    with its own retention (names off two years after the programme), as the
 *    course run the form fed outlives it; a survey stands without its form
 *    (`tests/surveys-routes.test.mjs`, "a survey outlives its form"). The
 *    destroy engine names no survey collection, which section 3 holds, so
 *    the day a destroy should take surveys is a decision made in the open.
 *
 * Run with `npm test`. Nothing here reaches a Firestore project.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAST, ROUND, seedTerm } from "./lib/applicationsSmallTerm.mjs";
import { CASCADE_FIRESTORE_STUB, makeCascadeDb } from "./lib/cascadeStore.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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
    ["@/lib/firebase/admin", "export function getAdminDb() { throw new Error('not used here'); }\nexport function getAdminStorage() { return null; }"],
    ["@/lib/firebase/session", "export async function getCurrentUser() { return null; }"],
    ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() { return null; }"],
  ]),
});

const { deleteAccountCascade } = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
const { destroyRoundCascade } = await loadTs(join("lib", "admissions", "destroy.ts"));
const { normalizeAdmissionRound } = await loadTs(join("lib", "firestore", "admissionRounds.ts"));

const auth = { async deleteUser() {}, async revokeRefreshTokens() {} };

const SURVEY = "survey00000000000001";
const token = (letter) => letter.repeat(43);
const answer = (uid) => ({
  surveyId: SURVEY,
  roundId: ROUND,
  respondent: { kind: "account", uid },
  answers: { q_catastrophe: { type: "choice", optionId: "o_notsure" } },
  sentAt: new Date("2026-10-29T19:00:00Z"),
  via: "link",
  afterFirstSession: false,
});
const person = (uid, letter) => ({
  surveyId: SURVEY,
  roundId: ROUND,
  respondent: { kind: "account", uid },
  token: token(letter),
  pressId: "p1",
  sentAt: new Date("2026-10-29T09:00:00Z"),
  delivery: "sent",
  remindedAt: null,
  reminders: 0,
  answered: true,
});

/** The small term, with a survey of its AGI Strategy that Amara and Dev answered. */
function withSurvey() {
  return makeCascadeDb(
    seedTerm({
      over: {
        [`surveys/${SURVEY}`]: { kind: "before", name: "AGI Strategy: before", roundId: ROUND, audience: { kind: "programme", roundId: ROUND, programmeId: "agi-strategy" } },
        [`surveyPeople/${SURVEY}__amara`]: person("amara", "a"),
        [`surveyPeople/${SURVEY}__dev`]: person("dev", "d"),
        "surveyAnswers/answer-amara": answer("amara"),
        "surveyAnswers/answer-dev": answer("dev"),
      },
    }),
  );
}

describe("deleting an account takes the name off its survey answers at once", () => {
  test("the person's rows go, their answers stay without them, and both are counted", async () => {
    const db = withSurvey();
    const summary = await deleteAccountCascade(auth, db, "amara");
    assert.equal(summary.surveyPeopleDeleted, 1);
    assert.equal(summary.surveyAnswersNamesTakenOff, 1);
    assert.equal(db.read(`surveyPeople/${SURVEY}__amara`), undefined, "their personal link opens nothing now");
    const kept = db.read("surveyAnswers/answer-amara");
    assert.equal(kept.respondent, null, "the answer no longer names them");
    assert.deepEqual(kept.answers, answer("amara").answers, "the answer itself stays in the totals");
    assert.equal(kept.surveyId, SURVEY);
  });

  test("nobody else's answers or rows are touched", async () => {
    const db = withSurvey();
    await deleteAccountCascade(auth, db, "amara");
    assert.deepEqual(db.read(`surveyPeople/${SURVEY}__dev`).respondent, { kind: "account", uid: "dev" });
    assert.deepEqual(db.read("surveyAnswers/answer-dev").respondent, { kind: "account", uid: "dev" });
    assert.ok(db.read(`surveys/${SURVEY}`), "the survey itself is the programme's, not the person's");
  });

  test("an account on no survey counts nothing", async () => {
    const db = withSurvey();
    const summary = await deleteAccountCascade(auth, db, CAST.lloyd.uid);
    assert.equal(summary.surveyPeopleDeleted, 0);
    assert.equal(summary.surveyAnswersNamesTakenOff, 0);
  });
});

describe("destroying a form leaves its surveys", () => {
  test("the survey, its people and its answers are all still there", async () => {
    const db = withSurvey();
    db.poke(`admissionRounds/${ROUND}`, { status: "closed" });
    const round = normalizeAdmissionRound(ROUND, db.read(`admissionRounds/${ROUND}`));
    let result = null;
    for (let pass = 0; pass < 10 && !result?.complete; pass += 1) {
      result = await destroyRoundCascade(db, ROUND, round, { actorUid: "zach", actorName: "Zach Levin" });
    }
    assert.equal(result.complete, true);
    assert.equal(db.read(`admissionRounds/${ROUND}`), undefined, "the form is gone");
    assert.ok(db.read(`surveys/${SURVEY}`));
    assert.ok(db.read(`surveyPeople/${SURVEY}__amara`));
    assert.ok(db.read("surveyAnswers/answer-amara"));
    assert.equal(Object.keys(result.deleted).some((key) => /survey/i.test(key)), false, "the receipt claims no survey");
  });

  test("the destroy engines name no survey collection", () => {
    for (const engine of ["src/lib/admissions/destroy.ts", "src/lib/firestore/courseDeletion.ts"]) {
      const code = readFileSync(join(REPO_ROOT, engine), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      assert.doesNotMatch(code, /surveyPeople|surveyAnswers|"surveys"|SURVEY_/, `${engine} reaches a survey collection: a destroy that takes surveys is a decision, written in docs/surveys.md first`);
    }
  });
});

describe("the cascade's step, at the source", () => {
  test("the summary carries both counts, and the step is best-effort with the 207", () => {
    const source = readFileSync(join(REPO_ROOT, "src", "lib", "firestore", "accountDeletion.ts"), "utf8");
    assert.match(source, /^\s*surveyPeopleDeleted: number;/m);
    assert.match(source, /^\s*surveyAnswersNamesTakenOff: number;/m);
    const step = /try \{\s*const off = await takeNamesOffForAccount\(db, uid\);[\s\S]*?\} catch \(err\) \{([\s\S]*?)\n {2}\}/.exec(source);
    assert.ok(step, "the survey step moved");
    assert.match(step[1], /partialFailure = true;/);
  });
});
