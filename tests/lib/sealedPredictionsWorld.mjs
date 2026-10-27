/**
 * SEALED PREDICTIONS ON AGI STRATEGY'S RUN, for the suite about a course's
 * credence card: the card as the course's record, each person's two cards on
 * the week it is sealed in and the week it opens in, an admin opening one
 * with the opening recorded first, and what deletion and the run's destroy
 * take.
 *
 * Built on `tests/lib/weekBlocksPageWorld.mjs` (and so on the attendance
 * world: Chloe, Farah and Kofi in Group B, told; Amara in Group A; Una placed
 * in Group C and not told; Sam, who left; Omar, taken off; Nobody, on
 * nothing; Rahul facilitates Group B, Sofia Groups A and B, Grace Group D;
 * Claudia leads the programme; Tess leads another; Yusuf is the run's track
 * lead; Zach is an admin). On top of it:
 *
 *  - FARAH FACILITATES GROUP B TOO, from a place in it: a facilitator who
 *    holds a place in the group they run (Zach, Mon 26 Oct 2026).
 *  - THE COURSE'S CARD, typed as an admin pastes it (`CARD_TEXT`), sealed in
 *    week 1 and opened in week 6: a percentage, a number on a scale from 0 to
 *    10, another percentage and a sentence. Every word on it is made up for
 *    these tests.
 *  - WEEK 6, published, in week 6's shape (`weekSixBlocks`), which has no In
 *    the session: the card goes before Go further. Week 1 is week 1's shape,
 *    with In the session.
 *
 * THE CLOCK is the suite's (`mock.timers`): Tue 17 Nov 2026 at noon in
 * London, in week 3, unless a test moves it. Group B meets on Tuesdays at
 * 6pm for two hours, so week 6 opens to it after its week 5 session.
 *
 * Every address is on example.com or example.org. Real: what the week page
 * world runs, the predictions routes, the course's card route, the account
 * sweep and the run's destroy, and every library under them.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB } from "./applicationsStore.mjs";
import { walkSource } from "./functionScan.mjs";
import { makeWorld } from "./handoverWorld.mjs";
import { COURSE } from "./hubAttendanceWorld.mjs";
import { B, RUN, makeWeekBlocksPageWorld, textOf } from "./weekBlocksPageWorld.mjs";
import { weekSixBlocks } from "./weekSixWorld.mjs";

export { B, COURSE, RUN, textOf };

/** A credence card as an admin pastes it. Every word is made up. */
export const CARD_TEXT = [
  "```text",
  "MY LAMP CARD (sealed until week 6)",
  "",
  "Name: ____________________",
  "",
  "Put a number on each, from 0% to 100%.",
  "",
  "1. By 2035, most lighthouses will run with no keeper on the",
  "   island.                                                   ____%",
  "",
  "2. How hard is it to keep a lamp lit through a winter storm?",
  "   (0 = calm work, 10 = hopeless)                            ____",
  "",
  "3. Somebody like me could keep a lamp lit for a whole year.  ____%",
  "",
  "The lamp I'd most like to tend, if I chose today:",
  "```",
].join("\n");

/** The card as the route stores it, for a seed. */
export const STORED_CARD = {
  title: "MY LAMP CARD (sealed until week 6)",
  intro: "Put a number on each, from 0% to 100%.",
  sealWeek: 1,
  openWeek: 6,
  questions: [
    { number: "1", kind: "percent", statement: "By 2035, most lighthouses will run with no keeper on the island.", max: 100, lowLabel: "", highLabel: "" },
    { number: "2", kind: "scale", statement: "How hard is it to keep a lamp lit through a winter storm?", max: 10, lowLabel: "calm work", highLabel: "hopeless" },
    { number: "3", kind: "percent", statement: "Somebody like me could keep a lamp lit for a whole year.", max: 100, lowLabel: "", highLabel: "" },
    { number: "", kind: "sentence", statement: "The lamp I'd most like to tend, if I chose today:", max: 0, lowLabel: "", highLabel: "" },
  ],
};

/**
 * The Firestore module as the account sweep and the run's destroy import it,
 * with the `FieldPath` the account sweep names: those two are loaded by a
 * loader of their own and handed this world's database.
 */
const FIRESTORE_WITH_FIELD_PATH = FIELD_VALUE_STUB.replace(
  "export class Timestamp {}",
  "export class Timestamp {" +
    " static now() { return new Date(); }" +
    " static fromDate(date) { return date; }" +
    " static fromMillis(ms) { return new Date(ms); }" +
    " }" +
    " export class FieldPath { constructor(...parts) { this.parts = parts; } static documentId() { return '__name__'; } }",
);

/** The record's path for `uid` on the run. */
export const recordPath = (uid) => `coursePredictions/${RUN.agi}__${uid}`;

/**
 * The world: the week page world's, with the course's card, week 6 pasted in
 * and published, Farah facilitating the group Farah is placed in, and the predictions
 * routes beside its own.
 */
export async function makeSealedWorld(key = "__sealedPredictions") {
  const w = await makeWeekBlocksPageWorld(key);
  const routes = {
    ...w.routes,
    predictions: await w.courseRoute("runs", "[runId]", "predictions"),
    people: await w.courseRoute("runs", "[runId]", "predictions", "people"),
    openCard: await w.courseRoute("runs", "[runId]", "predictions", "people", "[uid]"),
    courseCard: await w.courseRoute("[courseId]", "predictions"),
  };
  const lib = {
    ...w.lib,
    model: await w.loadTs(join("lib", "courses", "predictions", "model.ts")),
    cardText: await w.loadTs(join("lib", "courses", "predictions", "cardText.ts")),
    words: await w.loadTs(join("lib", "courses", "predictions", "words.ts")),
    store: await w.loadTs(join("lib", "firestore", "coursePredictions.ts")),
    own: await w.loadTs(join("lib", "courses", "predictions", "own.ts")),
  };
  // The account sweep and the run's destroy, through a loader whose Firestore
  // module has `FieldPath`; each is handed this world's database.
  const deletion = makeWorld(`${key}Deletion`, [["firebase-admin/firestore", FIRESTORE_WITH_FIELD_PATH]]);
  lib.accountDeletion = await deletion.loadTs(join("lib", "firestore", "accountDeletion.ts"));
  lib.courseDeletion = await deletion.loadTs(join("lib", "firestore", "courseDeletion.ts"));
  const components = {
    ...w.components,
    PredictionsCard: (await w.loadTs(join("features", "courses", "weekBlocks", "PredictionsCard.tsx"))).default,
    Panel: (await w.loadTs(join("features", "courses", "SealedPredictionsPanel.tsx"))).default,
  };

  /** Week 6, as the loader stores it after a paste of week 6's shape. */
  const weekSix = () => w.pastedWeekDoc(6, "Your next lamp", weekSixBlocks("k6"));

  function reset({ card = true } = {}) {
    w.reset();
    w.world.db.seed(`courseRuns/${RUN.agi}/weeks/w06`, weekSix());
    if (card) w.world.db.poke(`courses/${COURSE.agi}`, { predictionCard: structuredClone(STORED_CARD) });
    // Farah takes part in Group B and facilitates it too.
    const group = w.world.db.read(`courseGroups/${B}`);
    w.world.db.poke(`courseGroups/${B}`, { facilitatorUids: [...group.facilitatorUids, "farah"] });
  }

  /** `who` saves one answer on their own card. */
  const answer = (who, stage, questionId, value, options = {}) =>
    w.call(who, routes.predictions.PUT, { runId: RUN.agi }, { course: true, body: { stage, questionId, value }, ...options });
  /** `who` seals their first card, or opens it. */
  const act = (who, action, options = {}) =>
    w.call(who, routes.predictions.POST, { runId: RUN.agi }, { course: true, body: { action }, ...options });
  /** `who` asks for the run's list of cards. */
  const people = (who, runId = RUN.agi) => w.call(who, routes.people.GET, { runId }, { course: true });
  /** `who` opens `uid`'s card, as an admin would. */
  const openCard = (who, uid, options = {}) =>
    w.call(who, routes.openCard.POST, { runId: RUN.agi, uid }, { course: true, ...options });
  /** `who` reads or saves the course's card. */
  const readCard = (who, body) => w.call(who, routes.courseCard.POST, { courseId: COURSE.agi }, { course: true, body });
  const saveCard = (who, body) => w.call(who, routes.courseCard.PUT, { courseId: COURSE.agi }, { course: true, body });

  /** The stored record of `uid`'s cards, or undefined. */
  const record = (uid) => w.world.db.read(recordPath(uid));
  /** Every recorded opening, oldest first. */
  const openings = () =>
    w.world.db
      .paths()
      .filter((path) => path.startsWith("recordOpenings/"))
      .map((path) => w.world.db.read(path));

  /** The card's view as the page shell hands it to `who` on week `n` (null for none), and the page's words. */
  async function weekCard(who, n, { viewAs = false } = {}) {
    w.world.viewAs = viewAs;
    try {
      const page = await w.weekPage(who, n);
      return { view: page.shell.props?.predictions ?? null, html: page.html, text: page.text, shell: page.shell };
    } finally {
      w.world.viewAs = false;
    }
  }

  /** The card component drawn alone from a view. */
  const drawCard = (view) => {
    const html = renderToStaticMarkup(createElement(components.PredictionsCard, { runId: RUN.agi, view }));
    return { html, text: textOf(html) };
  };

  return {
    ...w,
    routes,
    lib,
    components,
    reset,
    answer,
    act,
    people,
    openCard,
    readCard,
    saveCard,
    record,
    openings,
    weekCard,
    drawCard,
  };
}

/** A stylesheet, as its own class names. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/**
 * The course editor's predictions card, rendered to HTML as an admin or
 * anybody else (the card asks the session's role, as the routes card beside
 * it does).
 */
export async function makeCardEditorRenderer(key = "__sealedCardEditor") {
  const handle = `globalThis[${JSON.stringify(key)}]`;
  const sheets = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) sheets.add(specifier);
  }
  const made = makeWorld(key, [
    ["@/auth/AuthProvider", `export function useAuth() { return { user: null, role: ${handle}.role ?? null, loading: false }; }`],
    ...[...sheets].map((specifier) => [specifier, CLASS_NAMES]),
  ]);
  const Card = (await made.loadTs(join("features", "courses", "CoursePredictionsCard.tsx"))).default;
  return (role, props) => {
    made.world.role = role;
    const html = renderToStaticMarkup(createElement(Card, props));
    return { html, text: textOf(html) };
  };
}
