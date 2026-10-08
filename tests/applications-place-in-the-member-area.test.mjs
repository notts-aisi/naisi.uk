/**
 * A place somebody holds, said in the member area while they are on no run:
 * on Home and on the list of their programmes (`/learn`).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * Both pages say "not on a programme yet" to a member with no run. Decision
 * day gives somebody a place, and they have no run until they are put on
 * one. So both pages ask what the person's own application page says, and
 * say that. Six things have to hold:
 *
 *  1. A PLACE IS SAID ONLY ONCE IT IS PUBLISHED, AND UNTIL IT IS GIVEN BACK.
 *     Every way an application can stand is run through the page's own
 *     reader, and `placeWordsFor` answers for a held place and for nothing
 *     else: not for a stored status with no result behind it, not for an
 *     invitation nobody has answered, not for a place given back.
 *  2. THE WORDS ARE THE PERSON'S OWN PAGE'S: its title and its sentence about
 *     what comes next, so an incubator's people are promised no group here
 *     either.
 *  3. THE CARD draws those words and a link to that page, and nothing else.
 *  4. HOME: with a place and no run, the place stands where "You’re not on a
 *     programme yet." would. With no place it reads as it always has. When
 *     the places could not be read, the claim is not made.
 *  5. THE LIST OF PROGRAMMES: with a place and no live run, the place stands
 *     where the empty state would, or above the archived runs. With no place
 *     it reads as it always has. When the places could not be read, the way
 *     to the member's applications stands there and no claim is made. On a
 *     live run, the run's own card speaks.
 *  6. NOTHING IN THESE PAGES READS AN APPLICATION ITSELF. They hand the
 *     session's own uid to one function, which asks the reader behind "Your
 *     application". And nowhere in the tree is somebody told they are on
 *     nothing by a file that has not asked about a place first.
 *
 * Who is shown a place and who is not (the member, an admin viewing the site
 * as them, another member), and that an unpublished decision is never read,
 * is run against a stored term in
 * `tests/applications-view-as-own-application.test.mjs`.
 *
 * Stubbed: the hook that lists a member's runs (it returns what a test
 * sets), the two Home forms for somebody on a run, the task and course
 * summary cards, a run's card, `next/link`, the page's entrance wrapper and
 * the stylesheets.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./lib/tsLoader.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

const world = { h: createElement, runs: { runs: [], loading: false, error: null } };
globalThis.__memberArea = world;

const h = "globalThis.__memberArea.h";
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
/** A piece of the page that is not about a place: it draws a mark with its name. */
const MARK = (name) => `export default function ${name}() { return ${h}("div", null, "[${name}]"); }`;
/** One of Home's forms for somebody on a run: its name, and what it is handed about applications. */
const RUN_FORM = (name) =>
  `export default function ${name}({ applications, more }) { return ${h}("div", null, "[${name}]", applications, more); }`;

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["next/link", `export default ({ href, className, children }) => ${h}("a", { href, className }, children);`],
    ["@/features/courses/useMyRuns", "export const useMyRuns = () => globalThis.__memberArea.runs;"],
    ["./useSyncTasks", "export const SyncTasksTrigger = () => null;"],
    ["@/features/tasks/components/MyWorkSummary", MARK("MyWorkSummary")],
    ["./HomeFacilitator", RUN_FORM("HomeFacilitator")],
    ["./HomeProgramme", RUN_FORM("HomeProgramme")],
    ["@/features/courses/RunCard", `export default ({ entry }) => ${h}("div", null, "[run " + entry.runId + "]");`],
    ["@/components/motion/PageEnter", `export default ({ children }) => ${h}("div", null, children);`],
    ["./home.module.css", CLASS_NAMES],
    ["./page.module.css", CLASS_NAMES],
    ["./MyCoursesSummary.module.css", CLASS_NAMES],
    ["./YourPlace.module.css", CLASS_NAMES],
    ["./YourApplications.module.css", CLASS_NAMES],
    ["./PageHead.module.css", CLASS_NAMES],
    ["./Skeleton.module.css", CLASS_NAMES],
    ["./EmptyState.module.css", CLASS_NAMES],
    ["./Card.module.css", CLASS_NAMES],
    ["./Chip.module.css", CLASS_NAMES],
  ]),
});

const view = await loadTs(join("lib", "applications", "status", "view.ts"));
const words = await loadTs(join("lib", "applications", "status", "words.ts"));
const copy = await loadTs(join("lib", "applications", "decisionDay", "emailCopy.ts"));
const { default: YourPlace } = await loadTs(join("features", "applications", "home", "YourPlace.tsx"));
const { default: YourApplications } = await loadTs(join("features", "applications", "home", "YourApplications.tsx"));
const { default: HomeMember } = await loadTs(join("app", "(app)", "dashboard", "HomeMember.tsx"));
const { default: LearnHub } = await loadTs(join("app", "(app)", "learn", "LearnHub.tsx"));

const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const hrefsOf = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

// ---------------------------------------------------------------------------
// One form, as an applicant is told about it, and every way an application can stand
// ---------------------------------------------------------------------------

const ROUND = "autumn-2026__m3mb3r4r3a";
const FELLOWSHIP = "agi-strategy";
const INCUBATOR = "research-incubator";
const TODAY = "2026-10-23";

const programme = (id, kind, name, shortName) => ({ id, kind, name, shortName, pitch: "", facts: "6 WEEKS", starts: "w/c 26 Oct", closed: false });
const FORM = {
  id: ROUND,
  label: "Autumn 2026",
  windowState: "closed",
  opensLabel: "Tue 6 Oct",
  closesLabel: "Sun 18 Oct, 23:59",
  decisionsLabel: "Fri 23 Oct",
  programmes: [
    programme(FELLOWSHIP, "fellowship", "AGI Strategy Fellowship", "AGI Strategy"),
    programme(INCUBATOR, "incubator", "Research Incubator", "Research incubator"),
  ],
  questionSetIds: [],
  asksFacilitating: false,
  availabilityGrid: { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 },
};

/** Somebody's own application, in the state given. `sent: null` is a draft nobody has sent. */
function application(state, { sent = true } = {}) {
  const content = {
    aboutYou: {
      preferredName: "Chloe",
      universityEmail: "ada@nottingham.ac.uk",
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "",
      subject: "BA Philosophy",
      expectedGraduation: "2028-07",
      motivation: "",
      interests: "",
    },
    rankedProgrammeIds: [FELLOWSHIP],
    wantsToFacilitate: null,
    answers: {},
    availability: { ...FORM.availabilityGrid, days: [] },
    suMembership: "yes",
  };
  return {
    id: `${ROUND}__chloe`,
    roundId: ROUND,
    draft: content,
    sent: sent ? content : null,
    createdAt: null,
    updatedAt: null,
    submittedAt: null,
    sentAt: null,
    sentLabel: sent ? "Sat 17 Oct" : null,
    status: "submitted",
    result: null,
    invitation: null,
    attendance: null,
    ...state,
  };
}

const published = (result) => ({ ...result, publishedAt: "2026-10-23T11:00:00.000Z" });
const invitedTo = (programmeId, response) => ({
  result: published({ kind: "invited", programmeId }),
  invitation: { programmeId, replyBy: "2026-10-25", response, respondedAt: null },
});

/** Every status an application can be stored under. None of them is a result. */
const STATUSES = [
  "draft",
  "submitted",
  "accepted",
  "fellowship-offered",
  "waitlisted",
  "rejected",
  "withdrawn",
  "appointed",
  "invited",
  "no-offer",
  "declined",
];

/** Every way a published application can stand, and whether it is a held place. */
const PUBLISHED = {
  "placed by their own ranking": { held: true, state: { status: "accepted", result: published({ kind: "accepted", programmeId: FELLOWSHIP }) } },
  "placed, and said they are coming": {
    held: true,
    state: { status: "accepted", result: published({ kind: "accepted", programmeId: FELLOWSHIP }), attendance: { answer: "coming", answeredAt: null } },
  },
  "placed, then said they can’t make it": {
    held: false,
    state: { status: "withdrawn", result: published({ kind: "accepted", programmeId: FELLOWSHIP }), attendance: { answer: "cant-make-it", answeredAt: null } },
  },
  "placed, then withdrawn by somebody else": { held: false, state: { status: "withdrawn", result: published({ kind: "accepted", programmeId: FELLOWSHIP }) } },
  "invited, not answered": { held: false, state: { status: "invited", ...invitedTo(FELLOWSHIP, null) } },
  "invited, and accepted": { held: true, state: { status: "accepted", ...invitedTo(FELLOWSHIP, "accepted") } },
  "invited, and said no thanks": { held: false, state: { status: "withdrawn", ...invitedTo(FELLOWSHIP, "declined") } },
  "invited, accepted, then can’t make it": {
    held: false,
    state: { status: "withdrawn", ...invitedTo(FELLOWSHIP, "accepted"), attendance: { answer: "cant-make-it", answeredAt: null } },
  },
  "invited, with no invitation beside it": { held: false, state: { status: "invited", result: published({ kind: "invited", programmeId: FELLOWSHIP }) } },
  "no offer": { held: false, state: { status: "no-offer", result: published({ kind: "no-offer", programmeId: null }) } },
  "every programme declined": { held: false, state: { status: "declined", result: published({ kind: "declined", programmeId: null }) } },
};

const viewOf = (app) => view.statusViewFor(FORM, [], app, TODAY);
const placeOf = (app) => words.placeWordsFor(viewOf(app));

const FELLOWSHIP_PAGE =
  "You’ll be in a small group with a facilitator, on campus. Before you start, we’ll email you your group and when it meets.";
const FELLOWSHIP_CARD = "You’ll be in a small group with a facilitator, on campus.";
const INCUBATOR_SENTENCE = "We’ll email you before you start with how the first week works.";

// ---------------------------------------------------------------------------
// 1 and 2. Who holds a place, and the words for it
// ---------------------------------------------------------------------------

describe("a place is said once it is published, and until it is given back", () => {
  test("nobody who has not applied, and nobody with a draft, holds one", () => {
    assert.equal(placeOf(null), null);
    assert.equal(placeOf(application({ status: "draft" }, { sent: false })), null);
  });

  test("no stored status is a place while nothing is published onto the application", () => {
    for (const status of STATUSES) {
      assert.equal(placeOf(application({ status })), null, `status ${status} with no result reads as a place`);
    }
  });

  test("of every way a published application can stand, only a place somebody holds is one", () => {
    for (const [name, { held, state }] of Object.entries(PUBLISHED)) {
      assert.equal(placeOf(application(state)) !== null, held, name);
    }
    // The table runs both answers, and more than one of each.
    const answers = Object.values(PUBLISHED).map((row) => row.held);
    assert.ok(answers.filter(Boolean).length >= 3 && answers.filter((held) => !held).length >= 6);
  });

  test("it is exactly the applications whose own page is the place page", () => {
    for (const [name, { state }] of Object.entries(PUBLISHED)) {
      const shown = viewOf(application(state));
      assert.equal(placeOf(application(state)) !== null, shown.kind === "place", name);
    }
  });
});

describe("the words are the person's own page's", () => {
  test("a place by their own ranking: the page's title and its whole sentence", () => {
    const shown = viewOf(application(PUBLISHED["placed by their own ranking"].state));
    assert.deepEqual(words.placeWordsFor(shown), { title: "You’re in AGI Strategy.", next: FELLOWSHIP_PAGE });
    assert.equal(words.placeWordsFor(shown).title, words.outcomeWords(shown).title);
    assert.equal(words.placeWordsFor(shown).title, `${copy.standardSubject("accepted", "AGI Strategy")}.`);
    assert.equal(words.placeWordsFor(shown).next, shown.next);
  });

  test("an invitation they accepted: the page's title and the card's line", () => {
    const shown = viewOf(application(PUBLISHED["invited, and accepted"].state));
    assert.deepEqual(words.placeWordsFor(shown), { title: "You’re in AGI Strategy.", next: FELLOWSHIP_CARD });
  });

  test("a place on an incubator promises no group here either", () => {
    const state = { status: "accepted", result: published({ kind: "accepted", programmeId: INCUBATOR }) };
    const said = placeOf(application(state));
    assert.deepEqual(said, { title: "You’re in Research incubator.", next: INCUBATOR_SENTENCE });
    assert.doesNotMatch(`${said.title} ${said.next}`, /small group|facilitator|campus|your group|when it meets/i);
  });

  test("a place on a programme the form no longer carries is still said, as its page says it", () => {
    const state = { status: "accepted", result: published({ kind: "accepted", programmeId: "left-the-form" }) };
    assert.deepEqual(placeOf(application(state)), { title: "You’re in.", next: FELLOWSHIP_PAGE });
  });

  test("the words hold nothing but a title and a sentence", () => {
    const said = placeOf(application(PUBLISHED["placed by their own ranking"].state));
    assert.deepEqual(Object.keys(said).sort(), ["next", "title"]);
  });
});

// ---------------------------------------------------------------------------
// 3. The card
// ---------------------------------------------------------------------------

const PLACE = { roundId: ROUND, title: "You’re in AGI Strategy.", next: FELLOWSHIP_PAGE };
const CARD_TEXT = `You’re in AGI Strategy. ${FELLOWSHIP_PAGE} See your application →`;
const card = (places) => renderToStaticMarkup(createElement(YourPlace, { places }));

describe("the card", () => {
  test("it says the title and the sentence it is handed, and links to the person's own page", () => {
    const html = card([PLACE]);
    assert.equal(textOf(html), CARD_TEXT);
    assert.deepEqual(hrefsOf(html), [`/applications/${ROUND}`]);
    assert.match(html, /<h2 class="title">You’re in AGI Strategy\.<\/h2>/);
  });

  test("with no place it draws nothing", () => {
    assert.equal(card([]), "");
  });

  test("an id is escaped into its address, and never trusted to be a tidy one", () => {
    assert.deepEqual(hrefsOf(card([{ ...PLACE, roundId: "a round/with?odd#parts" }])), ["/applications/a%20round%2Fwith%3Fodd%23parts"]);
  });

  test("two places are two cards, each with its own link", () => {
    const html = card([PLACE, { roundId: "spring-2027__0th3r", title: "You’re in Research incubator.", next: INCUBATOR_SENTENCE }]);
    assert.deepEqual(hrefsOf(html), [`/applications/${ROUND}`, "/applications/spring-2027__0th3r"]);
    assert.ok(textOf(html).includes(`You’re in Research incubator. ${INCUBATOR_SENTENCE} See your application →`));
  });
});

// ---------------------------------------------------------------------------
// 4. Home
// ---------------------------------------------------------------------------

const run = (runId, over = {}) => ({
  runId,
  courseId: "course-1",
  courseTitle: `Course of ${runId}`,
  label: "Autumn 2026",
  academicYear: "2026/27",
  status: "running",
  roles: ["learner"],
  membership: "enrolled",
  archived: false,
  currentWeek: null,
  groupName: null,
  ...over,
});
const runsAre = (runs, more = {}) => {
  world.runs = { runs, loading: false, error: null, ...more };
};

const NOT_ON_A_PROGRAMME = "You’re not on a programme yet.";
const slot = (name) => createElement("div", null, `[${name}]`);

function home({ place = null, placesRead = true } = {}) {
  return textOf(
    renderToStaticMarkup(
      createElement(HomeMember, {
        given: "Chloe",
        invite: slot("invite"),
        termCard: slot("term"),
        comingUpRows: slot("events"),
        comingUpCards: slot("event cards"),
        applications: slot("applications"),
        nothingYet: null,
        place,
        placesRead,
        finishProfile: slot("profile"),
      }),
    ),
  );
}
const placeCard = createElement(YourPlace, { places: [PLACE] });

describe("Home, for a member on no run", () => {
  test("with no place it reads as it always has", () => {
    runsAre([]);
    assert.equal(
      home(),
      `Hi Chloe. ${NOT_ON_A_PROGRAMME} [invite] [term] [events] [applications] [profile] [MyWorkSummary]`,
    );
  });

  test("with a place, the place stands where the claim would, above the term", () => {
    runsAre([]);
    assert.equal(
      home({ place: placeCard }),
      `Hi Chloe. [invite] ${CARD_TEXT} [term] [events] [applications] [profile] [MyWorkSummary]`,
    );
  });

  test("somebody holding a place is never told they are on no programme", () => {
    for (const runs of [[], [run("old", { archived: true })], [run("offer", { roles: [], membership: "offered" })]]) {
      runsAre(runs);
      const text = home({ place: placeCard });
      assert.ok(!text.includes(NOT_ON_A_PROGRAMME), JSON.stringify(runs.map((entry) => entry.runId)));
      assert.ok(text.includes(CARD_TEXT));
    }
  });

  test("when the places could not be read, the claim is not made and no place is drawn", () => {
    runsAre([]);
    assert.equal(home({ placesRead: false }), "Hi Chloe. [invite] [term] [events] [applications] [profile] [MyWorkSummary]");
  });

  test("the claim still waits for the runs, and is still left out when they could not be read or the member is involved", () => {
    runsAre([], { loading: true });
    assert.ok(!home().includes(NOT_ON_A_PROGRAMME), "said while the runs are loading");
    runsAre([], { error: new Error("could not load") });
    assert.ok(!home().includes(NOT_ON_A_PROGRAMME), "said when the runs could not be read");
    runsAre([run("led", { roles: ["lead"], membership: "none" })]);
    assert.ok(!home().includes(NOT_ON_A_PROGRAMME), "said to somebody who leads a programme");
  });
});

describe("Home, for a member on a live run", () => {
  test("the run's own Home is drawn, and the place card is not", () => {
    runsAre([run("live")]);
    const learner = home({ place: placeCard });
    assert.ok(learner.startsWith("[HomeProgramme]"), learner);
    assert.ok(!learner.includes("You’re in AGI Strategy."));
    runsAre([run("led", { roles: ["facilitator"] })]);
    const facilitator = home({ place: placeCard });
    assert.ok(facilitator.startsWith("[HomeFacilitator]"), facilitator);
    assert.ok(!facilitator.includes("You’re in AGI Strategy."));
  });
});

// ---------------------------------------------------------------------------
// 5. The list of programmes
// ---------------------------------------------------------------------------

const HUB_HEAD =
  "Courses Your courses Every fellowship and reading group you're on: the week your cohort is on, the materials for it, " +
  "and the exercises you owe. A place you've been offered shows here too, until your group is confirmed.";
const HUB_EMPTY =
  "You're not on a course yet NAISI runs fellowships and reading groups each term. The catalogue lists what's open and what's coming. Browse courses";
const hub = (instead = null) => textOf(renderToStaticMarkup(createElement(LearnHub, { instead })));
/** What the page hands the hub when the member's places could not be read. */
const unreadCard = createElement(YourApplications, { rows: null });
const UNREAD_TEXT = "Your applications View all → Everything you have applied to, and where each one has got to.";

describe("the list of programmes", () => {
  test("with no run and no place it reads as it always has", () => {
    runsAre([]);
    assert.equal(hub(), `${HUB_HEAD} ${HUB_EMPTY}`);
  });

  test("with no run and a place, the place stands where the empty state would", () => {
    runsAre([]);
    assert.equal(hub(placeCard), `${HUB_HEAD} ${CARD_TEXT}`);
  });

  test("with only archived runs and a place, the place is above them", () => {
    runsAre([run("old", { archived: true })]);
    const text = hub(placeCard);
    assert.ok(text.startsWith(`${HUB_HEAD} ${CARD_TEXT} Archived `), text);
    assert.ok(text.endsWith("[run old]"));
    assert.ok(!text.includes("not on a course yet"));
  });

  test("with only archived runs and no place it reads as it always has", () => {
    runsAre([run("old", { archived: true })]);
    const text = hub();
    assert.ok(text.startsWith(`${HUB_HEAD} Archived `), text);
    assert.ok(text.endsWith("[run old]"));
  });

  test("when the places could not be read, the way to the applications stands there and no claim is made", () => {
    runsAre([]);
    assert.equal(hub(unreadCard), `${HUB_HEAD} ${UNREAD_TEXT}`);
    runsAre([run("old", { archived: true })]);
    const text = hub(unreadCard);
    assert.ok(text.startsWith(`${HUB_HEAD} ${UNREAD_TEXT} Archived `), text);
    assert.ok(!text.includes("not on a course yet"));
  });

  test("on a live run the run's own card speaks, and the place card is not drawn", () => {
    runsAre([run("live"), run("old", { archived: true })]);
    const text = hub(placeCard);
    assert.ok(text.startsWith(`${HUB_HEAD} [run live] Archived `), text);
    assert.ok(!text.includes("You’re in AGI Strategy."));
  });

  test("while the runs are loading, or could not be read, nothing is said about a place or about being on nothing", () => {
    for (const state of [{ loading: true }, { error: new Error("Your account is still pending.") }]) {
      runsAre([], state);
      const text = hub(placeCard);
      assert.ok(!text.includes("not on a course yet") && !text.includes("You’re in AGI Strategy."), text);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Nothing in these pages reads an application itself
// ---------------------------------------------------------------------------

const codeOf = (...parts) => stripSource(readFileSync(join(SRC, ...parts), "utf8"), { keepStrings: true }).replace(/\s+/g, " ");

describe("the pages ask one function, and it asks the reader behind the person's own page", () => {
  const DASHBOARD = codeOf("app", "(app)", "dashboard", "page.tsx");
  const LEARN = codeOf("app", "(app)", "learn", "page.tsx");
  const PLACES = codeOf("features", "applications", "home", "places.ts");
  const LOAD = codeOf("lib", "applications", "status", "load.ts");
  const WORDS = codeOf("lib", "applications", "status", "words.ts");

  test("neither page looks at what became of an application", () => {
    for (const [name, page] of [["the dashboard", DASHBOARD], ["the list of programmes", LEARN]]) {
      assert.ok(!/row\.application\b|\.status\b|\.result\b|\.invitation\b|\.attendance\b|standingOf|statusViewFor/.test(page), `${name} reads an application itself`);
      assert.ok(!/admissionDecisions|staffRepo|decisionDay/.test(page), `${name} reaches a decision`);
    }
  });

  test("each hands on a card only when there is a place, so an empty card is never mistaken for one", () => {
    assert.ok(DASHBOARD.includes("place={places && places.length > 0 ? <YourPlace places={places} /> : null}"));
    assert.ok(DASHBOARD.includes("placesRead={places !== null}"));
    assert.ok(
      LEARN.includes(
        "const instead = places === null ? <YourApplications rows={null} /> : places.length > 0 ? <YourPlace places={places} /> : null; return <LearnHub instead={instead} />;",
      ),
    );
  });

  test("the one function reads the list of applications and the page's own read, and nothing else", () => {
    assert.ok(PLACES.includes("const roundIds = appliedTo ?? (await loadStatusRows(db, uid, now)).map((row) => row.round.id);"));
    assert.ok(PLACES.includes("const words = await loadPlaceWords(db, uid, roundIds, now);"));
    assert.ok(!/\.collection\(|\.doc\(|\.where\(|admissionDecisions|staffRepo|standingOf|\.result\b|\.status\b/.test(PLACES));
    // What it cannot read is "could not be read", never "holds no place".
    assert.ok(PLACES.includes("if (!db) return null;"));
    assert.match(PLACES, /catch \(err\) \{ console\.warn\([^)]*\); return null; \}/);
  });

  test("the loader goes through the page's own read, and the words through the page's own title", () => {
    assert.ok(LOAD.includes("const loaded = await loadStatus(db, roundId, uid, now); const words = loaded ? placeWordsFor(loaded.view) : null;"));
    assert.ok(WORDS.includes('if (view.kind !== "place") return null; const words = outcomeWords(view); return words ? { title: words.title, next: view.next } : null;'));
  });
});

/**
 * Each sentence that tells a member they are on nothing, the file that types
 * it, and the test of a held place that file makes before it says so.
 */
const ON_NOTHING = {
  "not on a programme yet": {
    "src/app/(app)/dashboard/HomeMember.tsx": {
      asks: "const onNothing = !error && !involved && placesRead && !place;",
      why: "Home says it only when the member's places were read and there are none",
    },
  },
  "not on a course yet": {
    "src/app/(app)/learn/LearnHub.tsx": {
      asks: "instead ? ( instead ) : ( <EmptyState",
      why: "the list of programmes draws a held place, or the way to the applications it could not read, in the stead of the empty state",
    },
  },
};

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(entry.name)) yield path;
  }
}

describe("nobody is told they are on nothing by a file that has not asked about a place", () => {
  const found = Object.fromEntries(Object.keys(ON_NOTHING).map((phrase) => [phrase, []]));
  let read = 0;
  for (const file of sourceFiles(SRC)) {
    read += 1;
    const code = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
    for (const phrase of Object.keys(ON_NOTHING)) {
      if (code.includes(phrase)) found[phrase].push(relative(REPO_ROOT, file).split(sep).join("/"));
    }
  }

  test("the walk read the tree", () => {
    assert.ok(read > 500, `only ${read} source files were read`);
    // A comment about the sentence is not the sentence.
    assert.ok(!stripSource('// "You\'re not on a course yet"\nconst x = 1;', { keepStrings: true }).includes("not on a course yet"));
  });

  for (const [phrase, files] of Object.entries(ON_NOTHING)) {
    test(`"${phrase}" is said only where it is registered, both directions, and only after a place is asked about`, () => {
      const unregistered = found[phrase].filter((file) => !(file in files));
      assert.deepEqual(
        unregistered,
        [],
        `A file tells a member they are "${phrase}" and is not registered. Somebody decision day gave a place has no run yet: ` +
          "ask about a held place first (placesHeldBy on the server, a slot handed to the browser), then register the file.",
      );
      assert.deepEqual(Object.keys(files).filter((file) => !found[phrase].includes(file)), [], "a registered file no longer says it: remove it");
      for (const [file, entry] of Object.entries(files)) {
        const code = stripSource(readFileSync(join(REPO_ROOT, ...file.split("/")), "utf8"), { keepStrings: true }).replace(/\s+/g, " ");
        assert.ok(code.includes(entry.asks), `${file} no longer asks about a place before it says so: ${entry.asks}`);
        assert.ok(code.indexOf(entry.asks) < code.indexOf(phrase), `${file} says it before it has asked`);
        assert.ok(String(entry.why).trim().length >= 40, `${file}: the reason is a placeholder.`);
      }
    });
  }
});
