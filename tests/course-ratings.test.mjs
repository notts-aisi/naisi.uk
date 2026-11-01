/**
 * RATINGS AT A PROGRAMME'S END, THROUGH THEIR REAL ROUTE AND PAGES
 * (src/lib/ratings/): the facilitator rating (F1 read from the register, F2
 * to F5), who rates whom, who reads what, never the person rated, and the
 * ratings gone two years after the programme and with an account.
 *
 * Callers: a group's facilitator rating their fellows, refused on themselves
 * and on a co-facilitator; a facilitator who is a fellow, rated by the
 * programme's lead; the lead of another programme; an admin; a fellow; a
 * member with no place; somebody signed out; a view-as session.
 *
 * The world is `tests/lib/ratingsWorld.mjs` (AGI Strategy once its run is
 * over, facilitators who are fellows). Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { A, AFTER, AGI, B, DURING, RUN, formPath, makeRatingsWorld, ratingsSeed } from "./lib/ratingsWorld.mjs";
import { walkSource } from "./lib/functionScan.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const w = await makeRatingsWorld("__courseRatings");
const { RATING_REFUSAL, RATINGS_WORDS } = w.words;

/** The clock, set to `at` for one test: Date only. */
function clock(t, at = AFTER) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

const short = (response) => [response.status, response.body?.error ?? null];
const FULL = { f2: 4, f3: 5, f4: 3, f5: "strongYes" };

/** The names of the people a page draws a rating card or a row for, in order. */
function namesOn(page) {
  return [...page.html.matchAll(/<h3[^>]*class="name"[^>]*>([^<]+)<\/h3>/g)].map((match) => match[1]);
}

/** The value of the radio named `name` that starts checked, or null. */
function checkedValue(html, name) {
  for (const [input] of html.matchAll(/<input[^>]*type="radio"[^>]*>/g)) {
    if (input.includes(`name="${name}"`) && input.includes('checked=""')) return /value="([^"]*)"/.exec(input)?.[1] ?? null;
  }
  return null;
}

/** Whether a page draws a rating form for `uid`: a card that posts, named by their heading. */
const formFor = (page, uid) => page.html.includes(`aria-labelledby="rate-${uid}"`);

// ---------------------------------------------------------------------------
// Who rates whom
// ---------------------------------------------------------------------------

describe("who rates whom", () => {
  test("a group's facilitator rates the fellows of their group, and is refused on themselves and on a co-facilitator", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    const amara = await w.rate("rahul", B, "amara", FULL);
    assert.equal(amara.status, 200, JSON.stringify(amara.body));
    assert.deepEqual(amara.body, { ok: true, answers: FULL });
    const kept = w.stored("rahul", "amara");
    assert.deepEqual(
      { kind: kept.kind, runId: kept.runId, groupId: kept.groupId, raterUid: kept.raterUid, ratedUid: kept.ratedUid, answers: kept.answers },
      { kind: "rating", runId: RUN.agi, groupId: B, raterUid: "rahul", ratedUid: "amara", answers: FULL },
    );
    assert.ok(kept.savedAt);
    assert.equal(Object.hasOwn(kept.answers, "f1"), false, "F1 is the register's and is never stored");
    const before = w.everything();
    assert.deepEqual(short(await w.rate("rahul", B, "rahul", FULL)), [403, RATING_REFUSAL.self]);
    assert.deepEqual(short(await w.rate("rahul", B, "sofia", FULL)), [403, RATING_REFUSAL.coFacilitator]);
    assert.deepEqual(short(await w.rate("sofia", B, "rahul", FULL)), [403, RATING_REFUSAL.coFacilitator]);
    assert.equal(w.everything(), before, "a refused rating changed something");
  });

  test("a facilitator who is a fellow is rated by the programme's lead and by an admin", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    assert.equal((await w.rate("claudia", B, "rahul", { f5: "yes" })).status, 200);
    assert.equal((await w.rate("zach", B, "sofia", { f2: 5 })).status, 200);
    assert.deepEqual(w.stored("claudia", "rahul").answers, { f5: "yes" });
    assert.deepEqual(w.stored("zach", "sofia").answers, { f2: 5 });
    // The lead and admins may rate any fellow, for a group whose facilitators cannot.
    assert.equal((await w.rate("claudia", A, "bea", { f3: 2 })).status, 200);
  });

  test("a facilitator of one group cannot rate a fellow of another, nor anybody in a group they do not run", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    assert.deepEqual(short(await w.rate("tom", B, "amara", FULL)), [403, RATING_REFUSAL.forbidden]);
    assert.deepEqual(short(await w.rate("rahul", A, "bea", FULL)), [403, RATING_REFUSAL.forbidden]);
    // Sofia runs A and B, so rates A's fellows.
    assert.equal((await w.rate("sofia", A, "bea", FULL)).status, 200);
    // Somebody not taking part in the group is nobody to rate there.
    assert.deepEqual(short(await w.rate("sofia", A, "amara", FULL)), [409, RATING_REFUSAL.notInGroup]);
  });

  test("everybody else is refused before anything is read, and nothing is kept", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    const before = w.everything();
    for (const [who, why] of [
      ["tess", "the lead of another programme"],
      ["lloyd", "the programme's reviewer"],
      ["yusuf", "the run's track lead"],
      ["amara", "a fellow"],
      ["nobody", "a member who holds no place"],
    ]) {
      assert.deepEqual(short(await w.rate(who, B, "amara", FULL)), [403, RATING_REFUSAL.forbidden], why);
    }
    assert.deepEqual(short(await w.rate(null, B, "amara", FULL)), [401, RATING_REFUSAL.notSignedIn]);
    assert.equal((await w.rate("zach", B, "amara", FULL, { viewAs: true })).status, 403, "a view-as session rates nothing");
    assert.deepEqual(short(await w.rate("rahul", "no-such-group", "amara", FULL)), [403, RATING_REFUSAL.forbidden]);
    assert.equal(w.everything(), before);
    // Refused before anything of the run is read: the group, and the forms to
    // ask whether they lead it, and no register, no enrolment, no rating.
    for (const who of ["tess", "amara"]) {
      const reads = w.world.db.stats.reads;
      await w.rate(who, B, "amara", FULL);
      assert.ok(w.world.db.stats.reads - reads <= 3, `${who}'s refused rating read ${w.world.db.stats.reads - reads} times: the run was read before the gate`);
    }
  });

  test("a facilitator rates only while they stand behind the role", () => {
    const named = { facilitatorUids: ["rahul"], standingFacilitatorUids: [] };
    assert.deepEqual(w.lib.ratingRules.mayRate({ uid: "rahul", isAdmin: false, leads: false }, named, "amara"), { ok: false, reason: "not-yours" });
    assert.deepEqual(w.lib.ratingRules.mayRate({ uid: "rahul", isAdmin: false, leads: false }, { ...named, standingFacilitatorUids: ["rahul"] }, "amara"), { ok: true });
  });

  test("before the run's last session is over, nobody rates anybody", async (t) => {
    clock(t, DURING);
    w.reset(ratingsSeed());
    assert.deepEqual(short(await w.rate("rahul", B, "amara", FULL)), [409, RATING_REFUSAL.notYet("Wed 9 Dec")]);
    assert.deepEqual(short(await w.rate("zach", B, "rahul", FULL)), [409, RATING_REFUSAL.notYet("Wed 9 Dec")]);
  });

  test("the answers are held to their questions; a blank one is left out, and clearing them all deletes the rating", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    assert.equal((await w.rate("rahul", B, "amara", { f2: 6 })).status, 400, "F2 is 1 to 5");
    assert.equal((await w.rate("rahul", B, "amara", { f2: 2.5 })).status, 400);
    assert.equal((await w.rate("rahul", B, "amara", { f5: "definitely" })).status, 400);
    assert.equal((await w.rate("rahul", B, "amara", { f1: 6 })).status, 400, "F1 is the register's: it cannot be sent");
    assert.equal((await w.rate("rahul", B, "amara", { m1: 9 })).status, 400, "a fellowship asks no mentor rating");
    assert.equal((await w.rate("rahul", B, "amara", "four")).status, 400);
    assert.equal(w.stored("rahul", "amara"), undefined);
    assert.equal((await w.rate("rahul", B, "amara", { f2: 3, f3: null })).status, 200);
    assert.deepEqual(w.stored("rahul", "amara").answers, { f2: 3 });
    assert.equal((await w.rate("rahul", B, "amara", {})).status, 200);
    assert.equal(w.stored("rahul", "amara"), undefined, "a rating with nothing in it is deleted");
  });

  test("the run's first rating writes its sheet: the day of its last session, from which the two years run", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    await w.rate("rahul", B, "amara", FULL);
    assert.deepEqual(w.world.db.read(`programmeRatings/${RUN.agi}`), { kind: "sheet", runId: RUN.agi, lastSessionOn: "2026-12-09" });
  });
});

// ---------------------------------------------------------------------------
// The pages
// ---------------------------------------------------------------------------

describe("the facilitator's page", () => {
  test("a card per fellow they may rate, with the sessions they came to from the register, and never themselves or a co-facilitator", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    const rahul = await w.groupView("rahul", B);
    assert.equal(rahul.to, null, rahul.to);
    assert.ok(rahul.text.includes(RATINGS_WORDS.title("Group B")));
    assert.ok(rahul.text.includes(RATINGS_WORDS.intro));
    assert.match(
      RATINGS_WORDS.intro,
      /Unless the person rated has said no, their ratings go to Kairos, one of our funders, with their name and never yours\./,
      "a rater is told where the ratings go, and that the rater's name never does",
    );
    // Each by the name they go by (`fullNameOfUser`): facilitators read this page.
    assert.deepEqual(namesOn(rahul), ["Amara"], "Rahul rates Amara alone: not Rahul, not Sofia");
    assert.ok(rahul.text.includes("Came to 6 of 6 sessions, from the register"));
    assert.ok(!rahul.text.includes(RATINGS_WORDS.others), "a facilitator reads nobody else's ratings");
    for (const question of w.model.FACILITATOR_QUESTIONS) assert.ok(rahul.text.includes(question.title), question.title);
    assert.ok(!rahul.text.includes(w.model.MENTOR_QUESTIONS[0].title), "a fellowship's form asks no mentor rating");
    assert.match(rahul.html, /<button type="submit"[^>]*disabled=""[^>]*>Save<\/button>/, "Save waits for the page's script");
    const sofiaA = await w.groupView("sofia", A);
    assert.deepEqual(namesOn(sofiaA), ["Bea", "Dev"], "Sofia rates Group A's two fellows");
    assert.ok(sofiaA.text.includes("Came to 2 of 6 sessions, from the register"), "Dev came to two");
  });

  test("what a rater saved is where their form starts, and nobody else's is shown to them", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    await w.rate("rahul", B, "amara", { f2: 4, f5: "maybe" });
    await w.rate("sofia", B, "amara", { f2: 2 });
    const rahul = await w.groupView("rahul", B);
    assert.equal(checkedValue(rahul.html, "f2"), "4");
    assert.equal(checkedValue(rahul.html, "f5"), "maybe");
    assert.equal(checkedValue(rahul.html, "f3"), null, "a question Rahul left blank starts blank");
    const sofia = await w.groupView("sofia", B);
    assert.equal(checkedValue(sofia.html, "f2"), "2", "Sofia's form starts on Sofia's own rating, not Rahul's");
    assert.ok(!sofia.text.includes(RATINGS_WORDS.others), "a facilitator reads nobody else's ratings");
  });

  test("before the end it says when ratings open; a fellow and another group's facilitator are sent away", async (t) => {
    clock(t, DURING);
    w.reset(ratingsSeed());
    const early = await w.groupView("rahul", B);
    assert.ok(early.text.includes(RATINGS_WORDS.notYet("Group B", "Wed 9 Dec")));
    assert.deepEqual(namesOn(early), []);
    t.mock.timers.setTime(AFTER.getTime());
    const home = `/learn/${encodeURIComponent(RUN.agi)}`;
    assert.equal((await w.groupView("amara", B)).to, home, "a fellow");
    assert.equal((await w.groupView("tom", B)).to, home, "another group's facilitator");
    // The lead rates and reads on the programme's own page; the run's layout
    // sends somebody with no role on the run away first. The page's own gate
    // is the route's, which admits the lead.
    const lead = await w.groupView("claudia", B);
    assert.equal(lead.to, null);
    assert.ok(lead.text.includes(RATINGS_WORDS.readerIntro), "the lead reads every rating, as on the programme's page");
    assert.equal((await w.groupView(null, B)).to, "/login");
  });

  test("the group page links to it once the run is over, and not before", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    const groupPage = (await w.loadTs(join("app", "(app)", "learn", "[runId]", "group", "[groupId]", "page.tsx"))).default;
    const render = async (who) => {
      w.world.course = true;
      try {
        return await w.page(groupPage, { params: Promise.resolve({ runId: RUN.agi, groupId: B }) }, who);
      } finally {
        w.world.course = false;
      }
    };
    const after = await render("rahul");
    assert.ok(after.html.includes(`/learn/${RUN.agi}/group/${B}/ratings`), "no way to the ratings once the run is over");
    t.mock.timers.setTime(DURING.getTime());
    const during = await render("rahul");
    assert.ok(!during.html.includes("/ratings"), "the way to the ratings is shown before they open");
  });
});

describe("the programme's Ratings page, for its lead and admins", () => {
  test("every group, the facilitators first with the reader's own form, and what everybody said with the rater named", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    await w.rate("rahul", B, "amara", FULL);
    await w.rate("sofia", A, "bea", { f3: 2 });
    await w.rate("zach", B, "rahul", { f5: "no" });
    const lead = await w.programmeView("claudia");
    assert.ok(lead.text.includes(RATINGS_WORDS.readerIntro));
    assert.match(
      RATINGS_WORDS.readerIntro,
      /Unless the person rated has said no, their ratings go to Kairos, one of our funders, with their name and never the rater’s\./,
      "the lead, who rates too, is told where the ratings go",
    );
    for (const group of ["Group A", "Group B", "Group C"]) assert.ok(lead.text.includes(group), group);
    const names = namesOn(lead);
    assert.ok(names.includes("Rahul") && names.indexOf("Rahul") < names.indexOf("Amara"), "a facilitator is listed before the fellows");
    assert.ok(formFor(lead, "rahul") && formFor(lead, "sofia"), "the lead rates the facilitators");
    assert.ok(formFor(lead, "amara"), "the lead may rate any fellow");
    assert.ok(lead.text.includes("Rahul: engagement 4, grasp 5, drive 3, next step Strong yes"));
    assert.ok(lead.text.includes("Sofia: grasp 2"));
    assert.ok(lead.text.includes("Zach: next step No"), "the lead reads what an admin said about a facilitator");
  });

  test("a reviewer is told it is the lead's and an admin's; the lead of another programme reads nothing of it", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    await w.rate("rahul", B, "amara", FULL);
    const lloyd = await w.programmeView("lloyd");
    assert.ok(lloyd.text.includes("Only the programme’s lead and admins can open Ratings"));
    assert.ok(!/\bAmara\b/.test(lloyd.text));
    const tess = await w.programmeView("tess");
    assert.ok(!/\bAmara\b/.test(tess.text), "another programme's lead reads this programme's ratings");
  });

  test("before the end, one line saying when", async (t) => {
    clock(t, DURING);
    w.reset(ratingsSeed());
    const lead = await w.programmeView("claudia");
    assert.ok(lead.text.includes(RATINGS_WORDS.runNotYet("Wed 9 Dec")));
  });
});

describe("nobody is shown what was said about them", () => {
  test("a facilitator who is a fellow never sees their own rating, and nor does an admin who is one", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    await w.rate("claudia", B, "rahul", { f5: "strongYes" });
    const rahul = await w.groupView("rahul", B);
    assert.ok(!namesOn(rahul).includes("Rahul"), "Rahul is one of the rows on Rahul's own page");
    assert.ok(!/\bClaudia\b/.test(rahul.text), "Rahul is shown who rated Rahul");
    assert.ok(!formFor(rahul, "rahul"));
    const sofia = await w.groupView("sofia", B);
    assert.ok(!namesOn(sofia).includes("Rahul"), "a co-facilitator is shown Rahul's row");
    assert.ok(!/\bClaudia\b/.test(sofia.text), "a co-facilitator is shown what the lead said about Rahul");
    // An admin who is a fellow of a group is not one of its rows either.
    w.world.db.seed(`courseEnrolments/${RUN.agi}__zach`, { ...w.world.db.read(`courseEnrolments/${RUN.agi}__amara`), uid: "zach" });
    await w.rate("claudia", B, "zach", { f2: 1 });
    const zach = await w.programmeView("zach");
    assert.ok(!namesOn(zach).includes("Zach"), "an admin is shown their own row");
    assert.ok(!zach.text.includes("Claudia: engagement 1"), "an admin is shown what was said about them");
    assert.ok(zach.text.includes("Claudia: next step Strong yes"), "the admin still reads what the lead said about Rahul");
  });
});

// ---------------------------------------------------------------------------
// Two years, and with the account
// ---------------------------------------------------------------------------

describe("the ratings go two years after the programme, and with an account", () => {
  const ctx = (now) => ({ now, log() {}, maxPerTick: 5, maxLateHours: 0, budget: { remainingMs: () => 60000, expired: () => false }, policy: {} });

  test("the names-off job deletes a run's ratings and its sheet two years after its last session, and not a day before", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    await w.rate("rahul", B, "amara", FULL);
    await w.rate("claudia", B, "rahul", FULL);
    const job = w.lib.job.surveyNamesOffJob;
    const early = await job.handler(ctx(new Date("2028-12-08T12:00:00Z")));
    assert.equal(early.processed, 0);
    assert.ok(w.stored("rahul", "amara"), "a rating went before its day");
    const due = await job.handler(ctx(new Date("2028-12-09T00:30:00Z")));
    assert.equal(due.processed, 1);
    assert.equal(w.stored("rahul", "amara"), undefined);
    assert.equal(w.stored("claudia", "rahul"), undefined);
    assert.equal(w.world.db.read(`programmeRatings/${RUN.agi}`), undefined, "the run's sheet stays after its ratings");
    const again = await job.handler(ctx(new Date("2028-12-10T00:30:00Z")));
    assert.equal(again.processed, 0, "a run is visited once");
  });

  test("deleting an account deletes every rating it gave or was given, and nobody else's", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    await w.rate("rahul", B, "amara", FULL);
    await w.rate("claudia", B, "rahul", FULL);
    await w.rate("sofia", A, "bea", FULL);
    const { deleteRatingsForAccount } = await w.loadTs(join("lib", "ratings", "store.ts"));
    assert.equal(await deleteRatingsForAccount(w.world.db, "rahul"), 2, "the one Rahul gave and the one Rahul was given");
    assert.equal(w.stored("rahul", "amara"), undefined);
    assert.equal(w.stored("claudia", "rahul"), undefined);
    assert.ok(w.stored("sofia", "bea"), "somebody else's rating went");
    const source = readFileSync(join(REPO_ROOT, "src", "lib", "firestore", "accountDeletion.ts"), "utf8");
    assert.match(source, /summary\.programmeRatingsDeleted = await deleteRatingsForAccount\(db, uid\);/, "account deletion no longer deletes the account's ratings");
  });
});

describe("a run that is destroyed takes its ratings", () => {
  /** The store, with `count()` on every query it hands out, answered by counting what the query returns. */
  function counting(target) {
    return new Proxy(target, {
      get(object, property) {
        const value = object[property];
        if (property === "count" && object.isQuery) {
          return () => ({
            get: async () => {
              const snap = await object.get();
              return { data: () => ({ count: snap.docs.length }) };
            },
          });
        }
        if (typeof value === "function" && ["collection", "doc", "where", "limit", "select"].includes(property)) {
          return (...args) => counting(value.apply(object, args));
        }
        return typeof value === "function" ? value.bind(object) : value;
      },
    });
  }

  test("its manifest counts every rating and the sheet, the destroy deletes them, and no other run's", async (t) => {
    clock(t);
    w.reset(ratingsSeed({ "programmeRatings/another-run__tess__kai": { kind: "rating", runId: "another-run", groupId: "g", raterUid: "tess", ratedUid: "kai", answers: { f2: 3 }, savedAt: AFTER } }));
    await w.rate("rahul", B, "amara", FULL);
    await w.rate("claudia", B, "rahul", FULL);
    w.world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    const courseDeletion = await w.loadTs(join("lib", "firestore", "courseDeletion.ts"));
    const { normalizeCourseRun } = await w.loadTs(join("lib", "firestore", "courses.ts"));
    const db = counting(w.world.courseDb);
    const counts = await courseDeletion.countRunDestroyTargets(db, normalizeCourseRun(RUN.agi, w.world.db.read(`courseRuns/${RUN.agi}`)));
    assert.equal(counts.ratings, 3, "two ratings and the run's sheet");
    const result = await courseDeletion.destroyRunCascade(db, null, RUN.agi, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(result.deleted.ratings, 3);
    assert.deepEqual(w.world.db.paths().filter((path) => path.startsWith("programmeRatings/")), ["programmeRatings/another-run__tess__kai"]);
  });

  test("a run being destroyed takes no rating", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    w.world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    const before = w.everything();
    assert.equal((await w.rate("rahul", B, "amara", FULL)).status, 403);
    assert.equal(w.everything(), before);
  });
});

// ---------------------------------------------------------------------------
// Never on a page or in an email a participant can reach
// ---------------------------------------------------------------------------

describe("ratings reach no page or email a participant can reach", () => {
  const files = [...walkSource(join(REPO_ROOT, "src"))].map((file) => file.slice(REPO_ROOT.length + 1));
  const code = (file) =>
    readFileSync(join(REPO_ROOT, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const naming = (pattern) => files.filter((file) => pattern.test(code(file))).sort();

  test("only the record's own module, its store and a run's destroy name the collection", () => {
    assert.deepEqual(naming(/\bRATINGS_COLLECTION\b|["'`]programmeRatings["'`]/), [
      "src/lib/firestore/courseDeletion.ts",
      "src/lib/ratings/model.ts",
      "src/lib/ratings/store.ts",
    ]);
  });

  test("every file outside the ratings code that reaches it is named, with why it may", () => {
    const REACHES = /(?:\bfrom\s*|\bimport\s*\(\s*)"(?:@\/(?:lib|features)\/ratings|(?:\.{1,2}\/)+(?:[\w-]+\/)*ratings)[/"]/;
    const inside = (file) => file.startsWith("src/lib/ratings/") || file.startsWith("src/features/ratings/");
    const expected = new Map([
      ["src/app/(app)/learn/[runId]/group/[groupId]/ratings/page.tsx", "a group's ratings, for its live facilitators and admins, gated by loadRatingsView"],
      ["src/app/(app)/learn/[runId]/group/[groupId]/page.tsx", "the facilitators' group page: the link to the ratings once the run is over, words only"],
      ["src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/ratings/page.tsx", "the programme's ratings, for its lead and admins, gated by loadProgrammeRun"],
      ["src/app/api/courses/groups/[groupId]/ratings/route.ts", "the one writer of a rating, gated before anything of the run is read"],
      ["src/lib/firestore/accountDeletion.ts", "deleting an account deletes the ratings it gave and was given"],
      ["src/lib/scheduler/jobs/surveyNamesOff.ts", "the job that deletes a run's ratings two years after its last session"],
      ["src/lib/kairos/file.ts", "the Kairos file, an admin's download: each person's ratings, never who gave them"],
      ["src/lib/kairos/fileTable.ts", "the Kairos file's layout: a column per rating question"],
      ["src/lib/surveys/kairosReport.ts", "the Kairos report, an admin's page of totals: how many were rated among the strongest"],
      ["src/lib/surveys/kairosReportLoad.ts", "the Kairos report's reads: the run's ratings, counted and never named"],
      ["src/lib/firestore/courseDeletion.ts", "a run's destroy, which counts and deletes the run's ratings with it"],
    ]);
    const found = naming(REACHES).filter((file) => !inside(file));
    assert.deepEqual(found.filter((file) => !expected.has(file)), [], "this file reaches the ratings: add it here with why it may, or stop it");
    assert.deepEqual([...expected.keys()].filter((file) => !found.includes(file)), [], "these no longer reach the ratings: take them off the list");
    assert.ok(!found.some((file) => file.startsWith("src/emails/")), "an email reaches the ratings");
  });
});

// ---------------------------------------------------------------------------
// An incubator: the mentor rating, by its facilitators
// ---------------------------------------------------------------------------

describe("an incubator's form adds the mentor rating, given by its facilitators", () => {
  /** AGI Strategy as an incubator, with Amara and Rahul in one team in Group B. */
  function incubatorSeed() {
    const seed = ratingsSeed();
    seed[formPath].programmes[AGI].kind = "incubator";
    seed["courseTeams/team-refusal"] = {
      runId: RUN.agi,
      courseId: seed[`courseRuns/${RUN.agi}`].courseId,
      groupId: B,
      name: "Refusal directions",
      project: "",
      source: { kind: "hand" },
      memberUids: ["amara", "rahul"],
      toldAs: [],
      createdAt: new Date("2026-11-10T09:00:00Z"),
      updatedAt: new Date("2026-11-10T09:00:00Z"),
    };
    return seed;
  }

  test("after F2 to F5, M1 to M3 under their own heading, with each fellow's team beside them", async (t) => {
    clock(t);
    w.reset(incubatorSeed());
    const rahul = await w.groupView("rahul", B);
    for (const question of [...w.model.FACILITATOR_QUESTIONS, ...w.model.MENTOR_QUESTIONS]) {
      assert.ok(rahul.text.includes(question.title), question.title);
    }
    assert.ok(rahul.text.indexOf(w.model.FACILITATOR_QUESTIONS[3].title) < rahul.text.indexOf(RATINGS_WORDS.mentorHeading), "the mentor rating comes after the facilitator rating");
    assert.ok(rahul.text.includes("1 Fine if it stops · 5 On the fence · 10 Very disappointed if it stopped"));
    assert.ok(rahul.text.includes("Team: Refusal directions"), "Amara's team is not beside Amara");
    assert.equal((rahul.html.match(/name="m1"/g) ?? []).length, 10, "M1 runs 1 to 10");
  });

  test("the route takes M1 to M3 from 1 to 10 from a facilitator, and nothing out of range", async (t) => {
    clock(t);
    w.reset(incubatorSeed());
    const saved = await w.rate("rahul", B, "amara", { f5: "yes", m1: 9, m2: 6, m3: 10 });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(w.stored("rahul", "amara").answers, { f5: "yes", m1: 9, m2: 6, m3: 10 });
    assert.equal((await w.rate("rahul", B, "amara", { m1: 11 })).status, 400);
    assert.equal((await w.rate("rahul", B, "amara", { m2: 0 })).status, 400);
    // The same rules: Rahul and Sofia run the group together and never rate each other.
    assert.deepEqual(short(await w.rate("rahul", B, "sofia", { m1: 5 })), [403, RATING_REFUSAL.coFacilitator]);
    const lead = await w.programmeView("claudia");
    assert.ok(lead.text.includes("Rahul: next step Yes, support for the research 9, skill 6, independence 10"));
  });

  test("nobody is modelled as a team's mentor, so the mentor rating is the facilitators'", () => {
    // The day a team gets a mentor, the mentor rating should be theirs: this
    // fails then, so who gives M1 to M3 is decided again in the open.
    const teams = readFileSync(join(REPO_ROOT, "src", "lib", "courses", "teams", "model.ts"), "utf8");
    assert.ok(!/mentor/i.test(teams), "a team now names a mentor: give the mentor rating to them (src/lib/ratings/rules.ts)");
  });
});
