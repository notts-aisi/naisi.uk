/**
 * AGI Strategy's run in week 3 with a SESSION IN PAIRS, for the suite about
 * pairs and laptops (Technical AI Safety's hands-on night, built for any
 * course whose week says so): the record, the route that types it, the pairs
 * page, the group page's card, and what each person's week page says before
 * they come.
 *
 * Built on `tests/lib/packsAndCasesWorld.mjs` (Group B on Tuesdays at 6pm
 * with Chloe, Farah and Kofi, Rahul and Sofia facilitating, FARAH
 * FACILITATING TOO from a place in it; Group A with Amara, Dev, Bea and
 * Tariq, Sofia facilitating, and Sam, who left; Group C with Hamza and Una,
 * not told, Tom facilitating; Claudia leads the programme, Tess another;
 * Yusuf is the run's track lead; Lloyd a reviewer; Zach an admin), on the
 * hand-over world's real handlers. On top of it:
 *
 *  - WEEK 3 ASKS FOR PAIRS WITH LAPTOPS: its In the session block's "Before
 *    you come" says people are paired, with a laptop in every pair. The
 *    clock is Tue 17 Nov 2026 at noon: Group B meets tonight, in week 3, so
 *    the group page draws week 3's pairs.
 *  - WEEK 2 ASKS FOR PAIRS AND NOTHING ABOUT LAPTOPS.
 *  - Week 1 asks for no pairs: its In the session body says "in pairs" and
 *    it has nothing to do before you come, which is not a session the
 *    facilitators pair people for.
 *
 * Every word in the weeks is made up for these tests, none of it the fellow
 * guide's, and every address is on example.com or example.org.
 */
import { join } from "node:path";
import {
  A,
  B,
  C,
  D,
  NOW,
  RUN,
  W2,
  W3,
  blockWeekDoc,
  makePacksAndCasesWorld,
  packsSeed,
  textOf,
  weekBlocksFor,
} from "./packsAndCasesWorld.mjs";

export { A, B, C, D, NOW, RUN, W2, W3, textOf };

const run = (text, marks = {}) => ({ text, ...marks });
const p = (...runs) => ({ type: "p", runs });

/** Week 3's In the session block: its id, as the synthetic week names it. */
export const W3_SESSION = "w3-is-1";
/** Week 2's. */
export const W2_SESSION = "w2-is-1";

/** "Before you come" for a session in pairs with laptops. Made up. */
export const PAIRS_WITH_LAPTOPS = [
  p(
    run("Before you come (about 5 minutes).", { bold: true }),
    run(" Your facilitators pair you up before the evening, and every pair has a laptop between them. If you’re bringing one, charge it and check that "),
    run("the example notebook", { href: "https://example.com/notebook" }),
    run(" opens."),
  ),
];

/** "Before you come" for a session in pairs that asks nothing about laptops. Made up. */
export const PAIRS_ONLY = [p(run("Before you come (about 5 minutes).", { bold: true }), run(" You’ll work in pairs: bring your number on a slip of paper."))];

/** A week's blocks with its In the session block's "Before you come" replaced. */
export function withBeforeYouCome(blocks, beforeYouCome) {
  return blocks.map((block) => (block.type === "inTheSession" ? { ...block, beforeYouCome } : block));
}

/** The world every suite starts from: packs and cases' world, with weeks 2 and 3 asking for pairs. */
export function pairsSeed(over = {}) {
  const seed = packsSeed();
  seed[`courseRuns/${RUN.agi}/weeks/w02`] = blockWeekDoc(2, "How sure are you?", withBeforeYouCome(weekBlocksFor("w2"), PAIRS_ONLY));
  seed[`courseRuns/${RUN.agi}/weeks/w03`] = blockWeekDoc(
    3,
    "How sure are you, again?",
    withBeforeYouCome(weekBlocksFor("w3"), PAIRS_WITH_LAPTOPS),
  );
  return { ...seed, ...over };
}

export async function makePairsWorld(key = "__pairs") {
  const w = await makePacksAndCasesWorld(key);
  const routes = { ...w.routes, pairs: await w.courseRoute("groups", "[groupId]", "pairs") };
  const pages = {
    ...w.pages,
    pairs: (await w.loadTs(join("app", "(app)", "learn", "pairs", "[groupId]", "page.tsx"))).default,
  };
  const lib = {
    ...w.lib,
    pairRecord: await w.loadTs(join("lib", "firestore", "coursePairs.ts")),
    pairsModel: await w.loadTs(join("lib", "courses", "pairs", "model.ts")),
    pairsWords: await w.loadTs(join("lib", "courses", "pairs", "words.ts")),
    pairsReaders: await w.loadTs(join("lib", "courses", "pairs", "readers.ts")),
  };

  function reset(seed = pairsSeed()) {
    w.reset(seed);
  }

  /** The pairs page as `who`, for `week` (or the group's next session's week). */
  const pairsPage = (who, groupId = B, week = undefined) =>
    w.draw(pages.pairs, who, { groupId }, week === undefined ? {} : { week: String(week) });

  /** `who` saves pairs: `entries` as `[uid, pair, laptop]`. */
  const savePairs = (who, entries, { groupId = B, weekId = "w03", blockId = W3_SESSION, ...options } = {}) =>
    w.call(who, routes.pairs.PUT, { groupId }, {
      course: true,
      body: { weekId, blockId, entries: entries.map(([uid, pair, laptop]) => ({ uid, pair, laptop })) },
      ...options,
    });

  /** A record's path. */
  const pairPath = (uid, { groupId = B, blockId = W3_SESSION } = {}) => `coursePairs/${RUN.agi}__${groupId}__${uid}__${blockId}`;
  /** A record as stored, or null. */
  const recordOf = (uid, where = {}) => w.world.db.read(pairPath(uid, where)) ?? null;
  /** Every record's path, sorted. */
  const records = () => w.world.db.paths().filter((path) => path.startsWith("coursePairs/")).sort();

  /** A record as the route writes one, put straight into the store. */
  function seedPair(uid, pair, laptop = false, { groupId = B, blockId = W3_SESSION, weekNumber = 3, runId = RUN.agi } = {}) {
    w.world.db.seed(`coursePairs/${runId}__${groupId}__${uid}__${blockId}`, {
      runId,
      groupId,
      uid,
      weekId: `w0${weekNumber}`,
      weekNumber,
      blockId,
      pair,
      laptop,
      updatedAt: NOW,
    });
  }

  /**
   * Group B paired as Rahul would leave it: Chloe and Kofi (Kofi's laptop);
   * Farah, Rahul and Sofia, a three with the group's facilitators in it
   * (Rahul's laptop).
   */
  function seedGroupB() {
    seedPair("chloe", 1, false);
    seedPair("kofi", 1, true);
    seedPair("farah", 2, false);
    seedPair("rahul", 2, true);
    seedPair("sofia", 2, false);
  }

  return { ...w, routes, pages, lib, reset, pairsPage, savePairs, pairPath, recordOf, records, seedPair, seedGroupB };
}
