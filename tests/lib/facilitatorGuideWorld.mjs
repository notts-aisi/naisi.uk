/**
 * A course's facilitator guide in week 3 of AGI Strategy's run, for the
 * guide's suites: the gate, the store, the loader's route and the admin's
 * page, the route a facilitator's Home asks, the guide's pages, the ticket on
 * a facilitator's group page and Home's link, and the course's destroy.
 *
 * Built on `tests/lib/facilitatorPagesWorld.mjs` (the run in its third week:
 * Group B on Tuesdays with Rahul and Sofia, Group A with Sofia, Group C with
 * Tom, Group D with Grace; Claudia leads AGI Strategy and Tess leads
 * Technical AI Safety; Lloyd reviews, Yusuf is the run's track lead; Amara
 * and Chloe hold places and were told, Una was placed and not told, Nell is
 * on nothing). On top of it:
 *
 *  - Technical AI Safety's run has a group of its own, facilitated by Ola,
 *    so "a facilitator of another programme" facilitates on a run of a
 *    different course.
 *  - The guide's documents are made up (`./facilitatorGuideFixture.mjs`) and
 *    loaded through the real route, as an admin, by `seedGuide`.
 *
 * Real: the gate, the store, the Markdown reader, both routes, the guide's
 * three pages, the group page and Home's facilitator form. Faked: what the
 * facilitator pages world fakes, and the hook Home reads the guide's weeks
 * through, which is handed the real route's own answer by the suite.
 */
import { join } from "node:path";
import { createElement } from "react";
import { CASCADE_FIRESTORE_STUB, makeCascadeDb } from "./cascadeStore.mjs";
import { createLoader } from "./tsLoader.mjs";
import { renderToStaticMarkup } from "react-dom/server";
import { COURSE } from "./handoverWorld.mjs";
import { account } from "./hubAttendanceWorld.mjs";
import { slot as weeklySlot } from "./leadWorld.mjs";
import { B, NOW, RUN, facilitatorSeed, find, makeFacilitatorPagesWorld, textOf } from "./facilitatorPagesWorld.mjs";
import { GUIDE_SEED } from "./facilitatorGuideFixture.mjs";

export { B, COURSE, NOW, RUN, find, textOf };

/** Technical AI Safety's group, Wednesdays at 6pm, facilitated by Ola. */
export const TAIS_GROUP = "tais-autumn-2026-weds__grp00009";

/** The world every guide suite starts from. */
export function guideSeed(over = {}) {
  const seed = facilitatorSeed();
  seed["users/ola"] = account("ola", "Ola Bello");
  seed[`courseGroups/${TAIS_GROUP}`] = {
    runId: RUN.tais,
    courseId: COURSE.tais,
    name: "Wednesday group",
    facilitatorUids: ["ola"],
    facilitatorAppointments: {},
    capacity: 8,
    memberCount: 0,
    archived: false,
    session: weeklySlot({ weekday: 3, location: "Room T1" }),
  };
  return { ...seed, ...over };
}

/**
 * The guide's pure modules alone (the model, the Markdown reader and writer,
 * the recogniser, the stored shape) and the week loader's paste, for the
 * suites that need no pages: nothing but the server-only marker is faked.
 */
export async function loadGuideModules() {
  const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
  return {
    model: await loadTs(join("lib", "courses", "facilitatorGuide", "model.ts")),
    markdown: await loadTs(join("lib", "courses", "facilitatorGuide", "markdown.ts")),
    recognise: await loadTs(join("lib", "courses", "facilitatorGuide", "recognise.ts")),
    record: await loadTs(join("lib", "firestore", "courseFacilitatorGuide.ts")),
    words: await loadTs(join("lib", "courses", "facilitatorGuide", "words.ts")),
    paste: await loadTs(join("lib", "courses", "weekBlocks", "paste.ts")),
  };
}

/**
 * The course destroy, on the store the deletion cascades are run on
 * (`./cascadeStore.mjs`, which records each committed batch): the engine
 * itself, with the server-only marker and the Admin SDK's sentinels faked.
 */
export async function loadCourseDestroy() {
  const { loadTs } = createLoader({
    stubs: new Map([
      ["server-only", "export {};"],
      ["firebase-admin/firestore", CASCADE_FIRESTORE_STUB],
    ]),
  });
  const engine = await loadTs(join("lib", "firestore", "courseDeletion.ts"));
  return { engine, makeCascadeDb };
}

export async function makeFacilitatorGuideWorld(key = "__facilitatorGuide") {
  const handle = `globalThis[${JSON.stringify(key)}].ui`;
  const base = await makeFacilitatorPagesWorld(key, [
    [
      "@/features/courses/facilitatorGuide/useFacilitatorGuide",
      `export function useFacilitatorGuide() { return ${handle}.guide ?? null; }\nexport default useFacilitatorGuide;`,
    ],
  ]);
  const { world, call, courseRoute, loadTs, draw, ui } = base;

  const GUIDE = join("app", "(app)", "learn", "facilitator-guide", "[courseId]");
  const routes = {
    ...base.routes,
    loader: await courseRoute("[courseId]", "facilitator-guide", "[slot]"),
    index: await courseRoute("[courseId]", "facilitator-guide"),
  };
  const pages = {
    ...base.pages,
    course: (await loadTs(join(GUIDE, "page.tsx"))).default,
    doc: (await loadTs(join(GUIDE, "[doc]", "page.tsx"))).default,
    admin: (await loadTs(join("app", "(app)", "admin", "courses", "[courseId]", "facilitator-guide", "page.tsx"))).default,
  };
  const guide = {
    model: await loadTs(join("lib", "courses", "facilitatorGuide", "model.ts")),
    markdown: await loadTs(join("lib", "courses", "facilitatorGuide", "markdown.ts")),
    recognise: await loadTs(join("lib", "courses", "facilitatorGuide", "recognise.ts")),
    access: await loadTs(join("lib", "courses", "facilitatorGuide", "access.ts")),
    store: await loadTs(join("lib", "courses", "facilitatorGuide", "store.ts")),
    record: await loadTs(join("lib", "firestore", "courseFacilitatorGuide.ts")),
    words: await loadTs(join("lib", "courses", "facilitatorGuide", "words.ts")),
    hook: await loadTs(join("features", "courses", "facilitatorGuide", "useFacilitatorGuide.ts")),
    paste: await loadTs(join("lib", "courses", "weekBlocks", "paste.ts")),
  };

  /** Start again from a seed, with nothing in either course's guide. */
  function reset(seed = guideSeed()) {
    base.reset(seed);
    ui.guide = null;
  }

  /** The loader's route, as `who`. */
  const load = (who, method, slot, { courseId = COURSE.agi, markdown, viewAs = false } = {}) =>
    call(who, routes.loader[method], { courseId, slot }, { body: markdown === undefined ? undefined : { markdown }, course: true, viewAs });

  /** Loads the made-up guide into a course, through the route, as an admin. */
  async function seedGuide(courseId = COURSE.agi, documents = GUIDE_SEED) {
    for (const [slot, markdown] of documents) {
      const answer = await load("zach", "PUT", slot, { courseId, markdown });
      if (answer.status !== 200) throw new Error(`seeding ${slot}: ${answer.status} ${JSON.stringify(answer.body)}`);
    }
  }

  /** The route a facilitator's Home asks, as `who`. */
  const index = (who, courseId = COURSE.agi) => call(who, routes.index.GET, { courseId }, { course: true });

  /** The guide's course page as `who`. */
  const coursePage = (who, courseId = COURSE.agi) => draw(pages.course, who, { courseId });

  /** One page of the guide as `who`: "week-3", "handbook". */
  const docPage = (who, doc, courseId = COURSE.agi) => draw(pages.doc, who, { courseId, doc });

  /** The admin's loader page as `who`. */
  const adminPage = (who, courseId = COURSE.agi) => draw(pages.admin, who, { courseId });

  /** The gate's answer for `who` on a course: the door that let them in, or null. */
  async function gate(who, courseId = COURSE.agi) {
    const reader = await guide.access.facilitatorGuideReader(world.courseDb, base.sessionFor(who), courseId);
    return reader ? reader.as : null;
  }

  /**
   * Home as `who` sees it, with the guide's weeks handed to Home's hook from
   * the real route's answer (`guideWeeksFrom`, the hook's own reading of it).
   */
  async function homeWithGuide(who, given = "Rahul") {
    const answer = await index(who);
    ui.guide = answer.status === 200 ? guide.hook.guideWeeksFrom(answer.body, COURSE.agi) : null;
    return base.home(who, given);
  }

  /** Every document in the guide's collection, by id. */
  const stored = () =>
    world.db
      .paths()
      .filter((path) => path.startsWith("courseFacilitatorGuide/"))
      .sort();

  return {
    ...base,
    routes,
    pages,
    guide,
    reset,
    load,
    seedGuide,
    index,
    coursePage,
    docPage,
    adminPage,
    gate,
    homeWithGuide,
    stored,
    renderToStaticMarkup,
    createElement,
  };
}
