/**
 * WEEK 6 OF AGI STRATEGY'S RUN, WRITTEN AS BLOCKS, for the suite about week
 * 6's own pieces (board wk-week6-phone): fill-in boxes, the checklist in
 * blocks, and a section of routes and deadlines read from the course's
 * record.
 *
 * Built on `tests/lib/weekBlocksPageWorld.mjs` (and so on the attendance
 * world: Chloe, Farah and Kofi in Group B, told; Amara in Group A; Una placed
 * in Group C and not told; Sam, who left; Omar, taken off; Nobody, on
 * nothing; Rahul facilitates Group B, Sofia Groups A and B; Claudia leads
 * the programme; Tess leads another; Zach is an admin). On top of it:
 *
 *  - WEEK 6 in the fellow guide's week 6 shape, every word made up: This
 *    week's four tasks over four parts; part 1 a source, a choice of one
 *    guide picked by each person, and a reflection stop; part 2 a checklist
 *    of three steps; part 3 a fill-in card of six numbered headings and
 *    twelve boxes; part 4 a two-minute pitch; then a section of routes and
 *    deadlines (two tables whose first column is Route, under a "Checked
 *    on" line, and a line about funding), and Go further. LOADED AS A LEAD
 *    LOADS ONE: written out as the guide's Markdown and pasted back through
 *    the loader's own reading, so its ids and This week's covers are the
 *    paste's.
 *  - THE CLOCK, `NOW6`, is Fri 4 Dec 2026 at noon in London: Group B met for
 *    week 5 on Tue 1 Dec and Group A on Thu 3 Dec, so week 6 is open to
 *    both; Group B meets for week 6 on Tue 8 Dec.
 *
 * Every word in the week is made up, and every address is on example.com or
 * example.org. Real: what the week page world runs, and the fill-in boxes'
 * two routes.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./functionScan.mjs";
import { makeWorld } from "./handoverWorld.mjs";
import { makeWeekBlocksPageWorld, textOf, B, RUN } from "./weekBlocksPageWorld.mjs";
import { COURSE } from "./hubAttendanceWorld.mjs";

/** The source tree, for a suite that reads a file's own words. */
export const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

export { B, COURSE, RUN, textOf };

/** Fri 4 Dec 2026 at noon in London (GMT). */
export const NOW6 = new Date("2026-12-04T12:00:00Z");

const run = (text, marks = {}) => ({ text, ...marks });
const p = (...runs) => ({ type: "p", runs });
const cell = (...runs) => ({ runs });
const link = (text, href) => run(text, { href });

/** The fill-in card's twelve boxes, as `k-fb1` to `k-fb12`, under six numbered headings. */
export const fillInBoxIds = (k) => Array.from({ length: 12 }, (_, i) => `${k}-fb${i + 1}`);

/** The checklist's three steps. */
export const checkItemIds = (k) => [`${k}-ci1`, `${k}-ci2`, `${k}-ci3`];

/** A week in week 6's shape, its ids prefixed with `k`. Every word is made up. */
export function weekSixBlocks(k) {
  const box = (n, label = "") => ({ id: `${k}-fb${n}`, label });
  return [
    {
      id: `${k}-tw`,
      type: "thisWeek",
      rows: [
        { type: "task", what: "Part 1: a short read and one keeper's guide", time: "About 25 to 45 minutes", when: "before", whenText: "Before session 6", covers: [] },
        { type: "task", what: "Part 2: go deep on one lighthouse", time: "About 30 minutes", when: "before", whenText: "Before session 6", covers: [] },
        { type: "task", what: "Part 3: draft your keeper's plan", time: "About 30 minutes", when: "before", whenText: "Bring it to session 6", covers: [] },
        { type: "task", what: "Part 4: prepare your 2-minute pitch", time: "About 15 minutes", when: "atSession", whenText: "At session 6", covers: [] },
      ],
      total: "About 1¾ to 2 hours",
      note: [],
    },
    {
      id: `${k}-why`,
      type: "text",
      role: "why",
      heading: "Why this week",
      time: "",
      body: [p(run("Knowing how lamps work only matters if it changes which lamp you tend next."))],
    },
    { id: `${k}-oc`, type: "outcomes", heading: "After this week you can", items: ["Name the lamp you will tend next.", "Say who will check on you."] },
    {
      id: `${k}-before`,
      type: "text",
      role: "before",
      heading: "Before the session",
      time: "About 1¾ to 2 hours, plan and pitch included",
      body: [p(run("Part 1 is short, part 2 is your own looking, and parts 3 and 4 turn it into a plan and a pitch."))],
    },
    {
      id: `${k}-p1`,
      type: "part",
      title: "Choose a lighthouse",
      time: "About 25 to 45 minutes",
      framing: [p(run("You need one next step you will take."))],
      blocks: [
        {
          id: `${k}-s1`,
          type: "source",
          kind: "read",
          lead: "",
          title: "Become a keeper who does things",
          url: "https://example.com/does-things",
          by: "Ada Example",
          date: "",
          time: "4 minutes",
          compute: "",
          note: [run("Doing before you feel ready.")],
        },
        {
          id: `${k}-co`,
          type: "chooseOne",
          form: "list",
          title: "one keeper's guide that fits you",
          givenBy: "fellow",
          kind: "read",
          time: "15 to 35 minutes",
          noteHeading: "",
          questions: [],
          packs: [
            { id: `${k}-pk1`, name: "Lamp repair", time: "", note: [run("if you like tools")], read: [link("Lamp repair", "https://example.com/repair")] },
            { id: `${k}-pk2`, name: "Lamp history", time: "", note: [run("if you like archives")], read: [link("Lamp history", "https://example.org/history")] },
          ],
        },
        {
          id: `${k}-rs1`,
          type: "reflection",
          prompts: [{ id: `${k}-rp1`, text: "Which lighthouse fits you best right now?" }],
        },
      ],
    },
    {
      id: `${k}-p2`,
      type: "part",
      title: "Go deep on one lighthouse",
      time: "About 30 minutes",
      framing: [p(run("Spend half an hour finding out what tending it involves."))],
      blocks: [
        {
          id: `${k}-ck`,
          type: "checklist",
          items: [
            { id: `${k}-ci1`, title: "Find two keepers doing it now.", mirrorToMyWork: false },
            { id: `${k}-ci2`, title: "Find one way in that is open to you this year.", mirrorToMyWork: false },
            { id: `${k}-ci3`, title: "Note the biggest thing you still don't know.", mirrorToMyWork: false },
          ],
        },
      ],
    },
    {
      id: `${k}-p3`,
      type: "part",
      title: "Your keeper's plan",
      time: "About 30 minutes",
      framing: [p(run("Bring a draft plan to the session."))],
      blocks: [
        {
          id: `${k}-fi`,
          type: "fillIn",
          title: "My keeper's plan",
          groups: [
            { heading: "What I'll tend (one or two sentences)", boxes: [box(1)] },
            { heading: "Why this lamp, and why me", boxes: [box(2, "The danger it helps with"), box(3, "What I bring to it")] },
            {
              heading: "How it works",
              boxes: [
                box(4, "First I…"),
                box(5, "Then… will happen"),
                box(6, "Which means…"),
                box(7, "Assuming… (the two or three things that must hold)"),
                box(8, "I'll check the shakiest part by…"),
              ],
            },
            { heading: "What I need to learn, and from whom", boxes: [box(9, "Three things to read or do"), box(10, "Two keepers to talk to")] },
            { heading: "My next three steps, with dates", boxes: [box(11)] },
            { heading: "Check-in partner and date", boxes: [box(12)] },
          ],
        },
      ],
    },
    {
      id: `${k}-p4`,
      type: "part",
      title: "Your 2-minute pitch",
      time: "About 15 minutes",
      framing: [p(run("Everyone gives a 2-minute pitch of the lamp they will tend."))],
      blocks: [
        {
          id: `${k}-cs`,
          type: "cases",
          heading: "",
          intro: [],
          talk: { minutes: 2, name: "pitch" },
          prepare: [],
          givenBy: "fellow",
          groupLabel: "",
          startLabel: "Start here",
          groups: [],
          note: [],
        },
      ],
    },
    {
      id: `${k}-next`,
      type: "text",
      role: "section",
      heading: "Where to go next",
      time: "",
      body: [
        p(run("Checked on 1 November 2026. Dates change, so check each lighthouse's own page before you apply.")),
        p(run("Part-time, alongside a degree", { bold: true })),
        {
          type: "table",
          header: [cell(run("Route")), cell(run("What it is")), cell(run("Next round"))],
          rows: [
            { cells: [cell(link("The night school", "https://example.com/night")), cell(run("Evening classes on lamps.")), cell(run("Applications close on 20 November 2026"))] },
            { cells: [cell(link("The open workshop", "https://example.org/workshop")), cell(run("Mend a lamp with others, online.")), cell(run("Rolling"))] },
          ],
        },
        p(run("Full-time, for a summer", { bold: true })),
        {
          type: "table",
          header: [cell(run("Route")), cell(run("What it is")), cell(run("Next round"))],
          rows: [{ cells: [cell(link("The summer tower", "https://example.com/tower")), cell(run("Ten weeks on a real lighthouse.")), cell(run("Not announced yet"))] }],
        },
        p(run("Funding:", { bold: true }), run(" "), link("The lamp fund", "https://example.org/fund"), run(" gives small grants, on a rolling basis.")),
      ],
    },
    {
      id: `${k}-gf`,
      type: "goFurther",
      heading: "Go further (optional)",
      intro: [p(run("More for anyone who wants it."))],
      items: [{ kind: "read", lead: "", title: "A keeper's year", url: "https://example.com/year", by: "Example Press", date: "2025", time: "16 minutes", compute: "", why: [run("A year of lamps.")] }],
    },
  ];
}

/**
 * The world: the week page world's, with week 6 pasted in as above and
 * published, and the fill-in boxes' routes beside its own.
 */
export async function makeWeekSixWorld(key = "__weekSix") {
  const w = await makeWeekBlocksPageWorld(key);
  const routes = {
    ...w.routes,
    fillInWrite: await w.courseRoute("runs", "[runId]", "fill-in-boxes", "[boxId]"),
    fillInRead: await w.courseRoute("runs", "[runId]", "fill-in-boxes"),
    submit: await w.courseRoute("runs", "[runId]", "exercises", "[exerciseId]", "submit"),
  };
  // The readers of answers a suite drives without a page: who finished's
  // tally and the group page's To review card, and what they read with.
  const lib = {
    ...w.lib,
    attendance: await w.loadTs(join("lib", "courses", "programmeAttendance.ts")),
    finishing: await w.loadTs(join("lib", "courses", "finishing", "whoFinished.ts")),
    groups: await w.loadTs(join("lib", "firestore", "courseGroups.ts")),
    facilitatorGroup: await w.loadTs(join("lib", "courses", "facilitatorGroup.ts")),
  };

  /** Week 6, as the loader stores it after a paste of the blocks above. */
  const weekSix = () => w.pastedWeekDoc(6, "Your next lamp", weekSixBlocks("k6"));

  function reset() {
    w.reset();
    w.world.db.seed(`courseRuns/${RUN.agi}/weeks/w06`, weekSix());
  }

  /** `who` writes in one of their own fill-in boxes. */
  const writeFillIn = (who, boxId, weekId, text, options = {}) =>
    w.call(who, routes.fillInWrite.PUT, { runId: RUN.agi, boxId }, { course: true, body: { weekId, text }, ...options });

  /** `who` asks for `uid`'s fill-in boxes in week `n`, through the one reader. */
  function readFillIns(who, uid, n) {
    w.world.user = w.sessionOf(who);
    w.world.course = true;
    const query = new URLSearchParams();
    if (uid !== undefined) query.set("uid", uid);
    if (n !== undefined) query.set("week", String(n));
    return (async () => {
      try {
        const response = await routes.fillInRead.GET(new Request(`https://naisi.invalid/api?${query}`), {
          params: Promise.resolve({ runId: RUN.agi }),
        });
        return { status: response.status, body: structuredClone(response.body) };
      } finally {
        w.world.course = false;
      }
    })();
  }

  /** The stored week 6, as the page reads it. */
  const storedWeekSix = () => w.lib.courses.normalizeCourseWeek("w06", w.world.db.read(`courseRuns/${RUN.agi}/weeks/w06`));

  return { ...w, routes, lib, reset, weekSix, storedWeekSix, writeFillIn, readFillIns };
}

/** A stylesheet, as its own class names. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

/**
 * The course editor's routes card, rendered to HTML as an admin or anybody
 * else (the card asks the session's role, as the rubric card beside it does).
 */
export async function makeRoutesCardRenderer(key = "__weekSixCard") {
  const handle = `globalThis[${JSON.stringify(key)}]`;
  const sheets = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) sheets.add(specifier);
  }
  const made = makeWorld(key, [
    ["@/auth/AuthProvider", `export function useAuth() { return { user: null, role: ${handle}.role ?? null, loading: false }; }`],
    ...[...sheets].map((specifier) => [specifier, CLASS_NAMES]),
  ]);
  const Card = (await made.loadTs(join("features", "courses", "CourseRoutesCard.tsx"))).default;
  return (role, props) => {
    made.world.role = role;
    const html = renderToStaticMarkup(createElement(Card, props));
    return { html, text: textOf(html) };
  };
}
