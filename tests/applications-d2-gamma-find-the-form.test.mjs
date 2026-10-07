/**
 * Finding the application form, and finding your way back to what you sent.
 *
 * A course's public page and the form: what the Apply button says and where
 * it leads, from a stored form to the words on the page. And the dashboard's
 * one link back to "Your applications".
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * There is one application form a term, for every programme, and each
 * programme on it is tied to the course it is for. That course's public page
 * offers the form. The page is server-rendered for anybody, from a round that
 * is closed to every browser, so each of these is asked by running the code
 * the page runs, against a database that records what it is asked:
 *
 *  1. THE BUTTON, STATE BY STATE. No form; tied and open; tied and not yet
 *     open; tied and closed; not tied; and a form that is still a draft. The
 *     button leads to the form only while the form is taking applications,
 *     and every other state says what is true from the form's own dates and
 *     offers no address that would refuse.
 *  2. A DRAFT IS INVISIBLE. A course tied to a programme on a draft form
 *     renders byte for byte what it renders with no form at all, and nothing
 *     of the draft is in what the page is handed.
 *  3. A COURSE TIED TO NOTHING IS UNTOUCHED. With no tie the page is handed
 *     the very object the older lookup returned, and a round of the older
 *     kind is worded and linked exactly as it was.
 *  4. ONE FORM, WHICHEVER BUTTON. Two courses tied to two programmes lead to
 *     one address, and it is the address the form's own code builds.
 *  5. THE CATALOGUE SAYS THE SAME, course by course, from the same lookup.
 *  6. THE WAY BACK IS THERE FOR SOMEBODY WHO APPLIED, AND SAYS NOTHING ELSE.
 *     The dashboard's card is drawn for a member with an application and
 *     not for one without, it is still drawn when the applications could not
 *     be read, and it names an application and never what became of it.
 *
 * ## What is real and what is stubbed
 *
 * Real: the form lookup, the older round lookup, the catalogue's fetcher,
 * the one precedence rule, the flattener that turns a round into the call to
 * action's strings, and the call to action itself, rendered to HTML.
 * Stubbed: `server-only`, the Admin SDK handle (a small in-memory database),
 * the signed-in state the call to action asks for, `next/link` (an anchor),
 * the session picker (which an application never draws) and the stylesheet.
 *
 * A page's own few lines of glue cannot be imported, because a page file
 * exports a page. Sections 6 and 7 pin them to the calls this suite makes,
 * so the chain run here is the chain each page runs.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./lib/tsLoader.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

globalThis.__coursePage = { db: null, auth: { user: null, loading: false }, h: createElement };

const h = "globalThis.__coursePage.h";
/** A stylesheet as its own class names, so `styles.button` renders as `class="button"`. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__coursePage.db; }"],
    ["@/auth/AuthProvider", "export const useAuth = () => globalThis.__coursePage.auth;"],
    ["next/link", `export default ({ href, className, children }) => ${h}("a", { href, className }, children);`],
    ["./GroupPicker", "export default () => null;"],
    ["./CourseCTA.module.css", CLASS_NAMES],
    ["./Card.module.css", CLASS_NAMES],
    ["./YourApplications.module.css", CLASS_NAMES],
  ]),
});

const formRound = await loadTs(join("features", "courses", "fetchFormRound.ts"));
const liveRound = await loadTs(join("features", "courses", "fetchLiveRound.ts"));
const courses = await loadTs(join("features", "courses", "fetchCourses.ts"));
const { toCTARound } = await loadTs(join("features", "courses", "ctaRound.ts"));
const { default: CourseCTA } = await loadTs(join("features", "courses", "CourseCTA.tsx"));
const { default: YourApplications } = await loadTs(join("features", "applications", "home", "YourApplications.tsx"));

// ---------------------------------------------------------------------------
// A database that records what it is asked
// ---------------------------------------------------------------------------

/**
 * Collections by name, documents by id. It answers the reads the public
 * course pages make and no others: an equality, the one `array-contains-any`
 * the older round lookup uses, a limit, a document by id and `getAll`.
 * Sorting on the server is refused, because a read that sorts needs an index.
 */
function makeDb(collections) {
  const asked = [];
  const snap = (name, id) => {
    const data = collections[name]?.[id];
    return {
      id,
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : structuredClone(data)),
    };
  };
  const matches = (data, [field, op, value]) => {
    if (op === "==") return data[field] === value;
    if (op === "array-contains-any") {
      return Array.isArray(data[field]) && data[field].some((entry) => value.includes(entry));
    }
    throw new Error(`the test database does not know the operator ${op}`);
  };
  const query = (name, filters) => ({
    where: (field, op, value) => query(name, [...filters, [field, op, value]]),
    limit: () => query(name, filters),
    orderBy: () => {
      throw new Error("this read may not sort on the server");
    },
    get: async () => {
      asked.push({ collection: name, filters });
      const docs = Object.entries(collections[name] ?? {})
        .filter(([, data]) => filters.every((filter) => matches(data, filter)))
        .map(([id]) => snap(name, id));
      return { docs, empty: docs.length === 0 };
    },
  });
  return {
    asked,
    collection: (name) => ({
      ...query(name, []),
      doc: (id) => ({ id, path: `${name}/${id}`, get: async () => snap(name, id) }),
    }),
    getAll: async (...refs) => refs.map((ref) => snap(...ref.path.split("/"))),
  };
}

// ---------------------------------------------------------------------------
// The autumn term, as the design draws it
// ---------------------------------------------------------------------------

/** Tue 6 Oct 2026, 09:00 in London. */
const OPENS = new Date("2026-10-06T08:00:00Z");
/** Sun 18 Oct 2026, 23:59 in London. */
const CLOSES = new Date("2026-10-18T22:59:00Z");
const BEFORE = new Date("2026-10-01T12:00:00Z");
const DURING = new Date("2026-10-10T12:00:00Z");
const AFTER = new Date("2026-10-20T12:00:00Z");

const FORM_ID = "autumn-2026__k3f9a2b1";
const AGI_COURSE = "agi-strategy-fellowship__a1b2c3d4";
const TAIS_COURSE = "technical-ai-safety__b2c3d4e5";
const UNTIED_COURSE = "reading-group__c3d4e5f6";
const TITLE = "AGI Strategy Fellowship";

const programme = (over) => ({
  kind: "fellowship",
  name: "AGI Strategy Fellowship",
  shortName: "AGI Strategy",
  pitch: "Where AI is heading and what could go wrong.",
  facts: "6 WEEKS · ~5 HRS A WEEK",
  starts: "w/c 26 Oct",
  places: 32,
  groupCount: 4,
  groupSize: "Up to 8",
  leadUid: "claudia-lead-uid",
  reviewerUids: ["lloyd-reviewer-uid"],
  useScores: true,
  closed: false,
  runId: null,
  courseId: null,
  emailWording: { accepted: { subject: "You are in", body: "Private wording for the accepted email." } },
  ...over,
});

/** The term's form, open on the autumn dates, carrying everything a visitor must not be told. */
const form = (over = {}, programmes = {}) => ({
  formVersion: 2,
  kind: "enrolment",
  label: "Autumn 2026 intake, do not announce",
  slug: "autumn-2026",
  status: "open",
  opensAt: OPENS,
  closesAt: CLOSES,
  decisionsByDate: "2026-10-23",
  invitationReplyBy: "2026-10-25",
  stageIds: [],
  outcomeRunIds: [],
  reviewerUids: ["claudia-lead-uid", "lloyd-reviewer-uid"],
  finalDeciderUid: "zach-admin-uid",
  authorUid: "zach-admin-uid",
  applicationCounts: { draft: 3, submitted: 57 },
  archived: false,
  programmeIds: ["technical-ai-safety", "agi-strategy"],
  programmes: {
    "technical-ai-safety": programme({
      name: "Technical AI Safety Fellowship",
      shortName: "Technical AI Safety",
      courseId: TAIS_COURSE,
      ...programmes["technical-ai-safety"],
    }),
    "agi-strategy": programme({ courseId: AGI_COURSE, ...programmes["agi-strategy"] }),
  },
  questionSetIds: ["fellowships"],
  asksFacilitating: true,
  revealOtherReviews: false,
  noOfferWording: { subject: "No offer this time", body: "Private wording for the no offer email." },
  decisionsSentAt: null,
  decisionsSentByUid: null,
  ...over,
});

/** A round of the older kind that names one of a course's runs. */
const olderRound = (over = {}) => ({
  kind: "enrolment",
  label: "Older intake",
  status: "open",
  opensAt: OPENS,
  closesAt: CLOSES,
  decisionsByDate: "2026-10-23",
  outcomeRunIds: ["run-agi-autumn"],
  reviewerUids: [],
  finalDeciderUid: null,
  archived: false,
  ...over,
});

const stage = (collections) => {
  const db = makeDb(collections);
  globalThis.__coursePage.db = db;
  return db;
};
const signedOut = { user: null, loading: false };
const signedIn = { user: { uid: "amara" }, loading: false };
const resolving = { user: null, loading: true };

/**
 * The round the course's page speaks about, by the calls the page makes, in
 * the page's order. Section 6 holds the page to these same calls.
 */
async function pageRound(courseId, now, { runIds = [], runsById = new Map(), enrolMode = null } = {}) {
  const [older, formAsRound] = await Promise.all([
    liveRound.fetchLiveRoundForRuns(runIds, now),
    formRound.fetchFormRoundForCourse(courseId, now),
  ]);
  const round = formRound.speakingRoundFor(formAsRound, older);
  const speakingRound = courses.roundOwnsDates(round, enrolMode) ? round : null;
  const targetRun = courses.roundTargetRun(speakingRound, runsById, courseId);
  return { older, formAsRound, round, speakingRound, cta: toCTARound(speakingRound, targetRun) };
}

/** The call to action as the page renders it: no public run, the round it was handed. */
function render(ctaRound, auth = signedOut, placement = "hero") {
  globalThis.__coursePage.auth = auth;
  return renderToStaticMarkup(
    createElement(CourseCTA, { courseId: AGI_COURSE, courseTitle: TITLE, run: null, round: ctaRound, placement }),
  );
}

const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const EVERYBODY = [signedOut, signedIn, resolving];

/** What the page says with no form and no round at all. */
stage({});
const NOTHING = Object.fromEntries(
  [signedOut, signedIn, resolving].map((auth) => [JSON.stringify(auth), render(null, auth)]),
);
const nothingFor = (auth) => NOTHING[JSON.stringify(auth)];

// ---------------------------------------------------------------------------
// 1. The button, state by state
// ---------------------------------------------------------------------------

describe("no form at all", () => {
  test("the page says the course is not taking people, and offers no way to apply", async () => {
    stage({});
    const { round, cta } = await pageRound(AGI_COURSE, DURING);
    assert.equal(round, null);
    assert.equal(cta, null);
    const html = render(cta);
    assert.match(text(html), /^This course isn't taking new people right now\. Subscribe for updates/);
    assert.deepEqual(hrefs(html), ["/#stay-in-touch"]);
  });
});

describe("tied, and the form is open", () => {
  test("the button says Apply and leads to the form, with the day to apply by in the design's words", async () => {
    stage({ admissionRounds: { [FORM_ID]: form() } });
    const { cta } = await pageRound(AGI_COURSE, DURING);
    const html = render(cta);
    assert.ok(html.includes(`<a href="/apply/${FORM_ID}" class="button">Apply</a>`), html);
    assert.equal(text(html), "Apply by Sun 18 Oct. Applications close at 23:59. We’ll email you on Fri 23 Oct. Apply");
    assert.deepEqual(hrefs(html), [`/apply/${FORM_ID}`], "the one link on it is the form");
  });

  test("it is the same button for everybody: signed out, signed in, and before the page knows which", async () => {
    stage({ admissionRounds: { [FORM_ID]: form() } });
    const { cta } = await pageRound(AGI_COURSE, DURING);
    const drawn = EVERYBODY.map((auth) => render(cta, auth));
    assert.equal(new Set(drawn).size, 1, "the button differs by who is looking");
    // Nobody is sent to sign in first: the form's own page decides what somebody with no account sees.
    assert.ok(!drawn[0].includes("/login"), drawn[0]);
    assert.ok(!drawn[0].includes("Sign in to apply"));
    // The foot of the page closes with the same sentence and the same button.
    assert.equal(text(render(cta, signedOut, "foot")), text(drawn[0]));
  });

  test("the address is the one the form's own code builds", async () => {
    stage({ admissionRounds: { [FORM_ID]: form() } });
    const { formAsRound, cta } = await pageRound(AGI_COURSE, DURING);
    const openForm = await loadTs(join("lib", "applications", "lifecycle", "openForm.ts"));
    assert.equal(formAsRound.form.applyPath, openForm.applyPathFor(FORM_ID));
    assert.equal(cta.form.applyPath, openForm.applyPathFor(FORM_ID));
  });

  test("it is one form whichever course's button somebody presses", async () => {
    stage({ admissionRounds: { [FORM_ID]: form() } });
    const agi = await pageRound(AGI_COURSE, DURING);
    const tais = await pageRound(TAIS_COURSE, DURING);
    assert.deepEqual(hrefs(render(agi.cta)), hrefs(render(tais.cta)));
    assert.equal(agi.round.id, tais.round.id);
  });

  test("the start is the tied programme's own, as its lead wrote it, until the form names a run", async () => {
    stage({ admissionRounds: { [FORM_ID]: form() } });
    const unlinked = await pageRound(AGI_COURSE, DURING);
    assert.equal(unlinked.cta.startsOn, "w/c 26 Oct");
    assert.equal(unlinked.cta.cohortLabel, "", "no run, so no cohort chip is borrowed from another");

    // Once the programme places people on a run of THIS course, the run's own date and cohort speak.
    const run = {
      id: "run-agi-autumn",
      courseId: AGI_COURSE,
      startDate: "2026-10-26",
      cohort: { term: "autumn", year: 2026, number: 1 },
    };
    stage({ admissionRounds: { [FORM_ID]: form({}, { "agi-strategy": { runId: "run-agi-autumn" } }) } });
    const linked = await pageRound(AGI_COURSE, DURING, { runsById: new Map([[run.id, run]]) });
    assert.equal(linked.cta.startsOn, "Mon 26 Oct");
    // A run of some other course is never this course's start date.
    const elsewhere = await pageRound(AGI_COURSE, DURING, {
      runsById: new Map([[run.id, { ...run, courseId: TAIS_COURSE }]]),
    });
    assert.equal(elsewhere.cta.startsOn, "w/c 26 Oct");
  });
});

describe("tied, and the form is not open yet", () => {
  test("the page says the day it opens, from the form's own dates, and offers nothing to press", async () => {
    stage({ admissionRounds: { [FORM_ID]: form() } });
    const { cta } = await pageRound(AGI_COURSE, BEFORE);
    assert.equal(cta.state, "not-yet");
    for (const auth of [signedOut, signedIn]) {
      const html = render(cta, auth);
      assert.match(text(html), /^Applications for AGI Strategy Fellowship open on Tue 6 Oct\./);
      assert.match(text(html), /Applications close Sun 18 Oct, 23:59 · Decisions by Fri 23 Oct · Starts w\/c 26 Oct/);
      assert.deepEqual(hrefs(html), ["/#stay-in-touch"], "a form that is not open was linked to");
      assert.ok(!html.includes("class=\"button\""), "a button was drawn for a form that is not open");
      // Nobody can have applied to a form that has not opened.
      assert.ok(!html.includes("Already applied?"));
    }
  });
});

describe("tied, and the form has closed", () => {
  test("closed by the clock: the page says the day it closed and offers nothing to press", async () => {
    stage({ admissionRounds: { [FORM_ID]: form() } });
    const { cta } = await pageRound(AGI_COURSE, AFTER);
    assert.equal(cta.state, "closed");
    const html = render(cta);
    // A day that has passed carries its year, in the words a closed round has always used.
    assert.match(text(html), /^Applications for AGI Strategy Fellowship closed on Sun, 18 Oct 2026\./);
    assert.match(text(html), /Decisions by Fri 23 Oct/);
    assert.deepEqual(hrefs(html), ["/#stay-in-touch"]);
    assert.ok(!html.includes("class=\"button\""));
    assert.ok(!html.includes("Apply by"), "a deadline that has passed was offered as one to apply by");
    assert.deepEqual([cta.form.applyBy, cta.form.closesAtTime], [null, null]);
  });

  test("somebody signed in is shown the way back to their applications, and nobody else is", async () => {
    stage({ admissionRounds: { [FORM_ID]: form() } });
    const { cta } = await pageRound(AGI_COURSE, AFTER);
    const mine = render(cta, signedIn);
    assert.ok(mine.includes('Already applied? <a href="/applications" class="inlineLink">See your applications</a>.'), mine);
    assert.deepEqual(hrefs(mine), ["/#stay-in-touch", "/applications"]);
    assert.ok(!render(cta, signedOut).includes("/applications"));
  });

  test("every status a form moves on to says the same, from the same dates", async () => {
    for (const status of ["closed", "deciding", "settled"]) {
      stage({ admissionRounds: { [FORM_ID]: form({ status }) } });
      const { cta } = await pageRound(AGI_COURSE, AFTER);
      assert.match(text(render(cta)), /^Applications for AGI Strategy Fellowship closed on Sun, 18 Oct 2026\./, status);
    }
  });

  test("closed by hand before its time: the page names no day, because the day has not come", async () => {
    stage({ admissionRounds: { [FORM_ID]: form({ status: "closed" }) } });
    const { cta } = await pageRound(AGI_COURSE, DURING);
    assert.equal(cta.state, "closed");
    assert.equal(cta.closesOn, null);
    const html = render(cta);
    assert.match(text(html), /^Applications for AGI Strategy Fellowship have closed\./);
    assert.ok(!text(html).includes("18 Oct"), "a page said applications closed on a day that is still ahead");
    assert.deepEqual(hrefs(html), ["/#stay-in-touch"]);
  });
});

describe("not tied", () => {
  test("a course no programme is tied to is handed nothing, whatever state the form is in", async () => {
    const states = [{}, { status: "closed" }, { status: "settled" }, { status: "draft" }];
    for (const over of states) {
      for (const now of [BEFORE, DURING, AFTER]) {
        stage({ admissionRounds: { [FORM_ID]: form(over) } });
        const { round, cta } = await pageRound(UNTIED_COURSE, now);
        assert.equal(round, null);
        assert.equal(cta, null);
        for (const auth of EVERYBODY) assert.equal(render(cta, auth), nothingFor(auth));
      }
    }
  });

  test("a programme set to No course page takes its course off the form", async () => {
    stage({ admissionRounds: { [FORM_ID]: form({}, { "agi-strategy": { courseId: null } }) } });
    const agi = await pageRound(AGI_COURSE, DURING);
    assert.equal(agi.cta, null);
    assert.equal(render(agi.cta), nothingFor(signedOut));
    // The other programme's course is still on it.
    assert.equal((await pageRound(TAIS_COURSE, DURING)).cta.state, "open");
  });

  test("a programme that has been closed takes its course off the form too", async () => {
    stage({ admissionRounds: { [FORM_ID]: form({}, { "agi-strategy": { closed: true } }) } });
    const { cta } = await pageRound(AGI_COURSE, DURING);
    assert.equal(cta, null);
    assert.equal(render(cta), nothingFor(signedOut));
  });
});

// ---------------------------------------------------------------------------
// 2. A draft is invisible
// ---------------------------------------------------------------------------

describe("a form that is still a draft", () => {
  const drafts = {
    "a draft": { status: "draft" },
    "a draft with no dates yet": { status: "draft", opensAt: null, closesAt: null, decisionsByDate: null },
    "an archived form": { archived: true },
    "a cancelled form": { status: "cancelled" },
  };

  test("its course's page is byte for byte the page with no form at all", async () => {
    for (const [name, over] of Object.entries(drafts)) {
      for (const now of [BEFORE, DURING, AFTER]) {
        stage({ admissionRounds: { [FORM_ID]: form(over) } });
        const { formAsRound, round, cta } = await pageRound(AGI_COURSE, now);
        assert.equal(formAsRound, null, name);
        assert.equal(round, null, name);
        assert.equal(cta, null, name);
        for (const auth of EVERYBODY) {
          assert.equal(render(cta, auth), nothingFor(auth), `${name} changed what the page says`);
        }
      }
    }
  });

  test("nothing about it is in what any course's page is handed", async () => {
    for (const [name, over] of Object.entries(drafts)) {
      stage({ admissionRounds: { [FORM_ID]: form(over) } });
      const handed = JSON.stringify([...(await formRound.fetchFormRoundsByCourse(DURING))]);
      assert.equal(handed, "[]", `${name}: ${handed}`);
    }
  });

  test("a draft for next term never takes the page from the form that is open now", async () => {
    stage({
      admissionRounds: {
        [FORM_ID]: form(),
        "spring-2027__00000002": form({ status: "draft", label: "Spring 2027", closesAt: new Date("2027-02-01T23:59:00Z") }),
      },
    });
    const { cta } = await pageRound(AGI_COURSE, DURING);
    assert.deepEqual(hrefs(render(cta)), [`/apply/${FORM_ID}`]);
  });
});

// ---------------------------------------------------------------------------
// 3. What the page is handed
// ---------------------------------------------------------------------------

describe("what the page is handed", () => {
  test("the round, field by field", async () => {
    stage({ admissionRounds: { [FORM_ID]: form() } });
    const { formAsRound } = await pageRound(AGI_COURSE, DURING);
    assert.deepEqual(formAsRound, {
      id: FORM_ID,
      state: "open",
      opensAt: OPENS,
      closesAt: CLOSES,
      decisionsByDate: "2026-10-23",
      outcomeRunIds: [],
      form: { applyPath: `/apply/${FORM_ID}`, starts: "w/c 26 Oct" },
    });
  });

  test("the call to action's props are strings the page prints, and no others", async () => {
    stage({ admissionRounds: { [FORM_ID]: form() } });
    const { cta } = await pageRound(AGI_COURSE, DURING);
    assert.deepEqual(cta, {
      id: FORM_ID,
      state: "open",
      opensOn: "Tue 6 Oct",
      closesOn: "Sun 18 Oct, 23:59",
      decisionsOn: "Fri 23 Oct",
      cohortLabel: "",
      startsOn: "w/c 26 Oct",
      form: { applyPath: `/apply/${FORM_ID}`, applyBy: "Sun 18 Oct", closesAtTime: "23:59" },
    });
  });

  test("nothing a visitor may not know is in it, in any state", async () => {
    const secrets = [
      "claudia-lead-uid",
      "lloyd-reviewer-uid",
      "zach-admin-uid",
      "leadUid",
      "reviewerUids",
      "finalDeciderUid",
      "authorUid",
      "applicationCounts",
      "57",
      "places",
      "32",
      "groupSize",
      "Up to 8",
      "emailWording",
      "Private wording",
      "noOfferWording",
      "invitationReplyBy",
      "2026-10-25",
      // The form's label is the committee's handle for it, and a programme's
      // own name and pitch are the form's to show, not this page's.
      "do not announce",
      "Autumn 2026 intake",
      "Where AI is heading",
      "Technical AI Safety Fellowship",
    ];
    for (const now of [BEFORE, DURING, AFTER]) {
      stage({ admissionRounds: { [FORM_ID]: form() } });
      const { formAsRound, cta } = await pageRound(AGI_COURSE, now);
      const handed = JSON.stringify([formAsRound, cta]) + render(cta, signedIn) + render(cta, signedOut);
      for (const secret of secrets) assert.ok(!handed.includes(secret), `${secret} reached the course's page`);
    }
  });

  test("the form is found with one equality on one field, and the older lookup is asked as before", async () => {
    const db = stage({ admissionRounds: { [FORM_ID]: form() } });
    await pageRound(AGI_COURSE, DURING, { runIds: ["run-agi-autumn"] });
    assert.deepEqual(
      db.asked.map((read) => JSON.stringify(read)).sort(),
      [
        { collection: "admissionRounds", filters: [["formVersion", "==", 2]] },
        { collection: "admissionRounds", filters: [["outcomeRunIds", "array-contains-any", ["run-agi-autumn"]]] },
      ]
        .map((read) => JSON.stringify(read))
        .sort(),
    );
  });

  test("with no database there is nothing to offer, and nothing breaks", async () => {
    globalThis.__coursePage.db = null;
    assert.equal(await formRound.fetchFormRoundForCourse(AGI_COURSE, DURING), null);
    assert.equal((await formRound.fetchFormRoundsByCourse(DURING)).size, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. A round of the older kind, and which of the two speaks
// ---------------------------------------------------------------------------

describe("a course with a round of the older kind", () => {
  const runs = { runIds: ["run-agi-autumn"] };

  test("with no tie the page is handed the older lookup's own answer, worded and linked as it always was", async () => {
    stage({ admissionRounds: { "older-intake": olderRound() } });
    const { older, round, cta } = await pageRound(AGI_COURSE, DURING, runs);
    assert.equal(round, older, "the very object the older lookup returned");
    assert.equal(cta.form, null);
    const out = render(cta, signedOut);
    assert.match(text(out), /^Applications are open for AGI Strategy Fellowship\. Applications close Sun 18 Oct, 23:59/);
    assert.ok(out.includes('<a href="/login?next=%2Fapply%2Folder-intake" class="button">Sign in to apply</a>'), out);
    assert.ok(render(cta, signedIn).includes('<a href="/apply/older-intake" class="button">Start your application</a>'));
    // Until the page knows who is looking, a round's button is not drawn at all. That is unchanged.
    assert.ok(!render(cta, resolving).includes("class=\"button\""));
  });

  test("a draft form tied to the same course changes none of that", async () => {
    stage({ admissionRounds: { "older-intake": olderRound() } });
    const without = await pageRound(AGI_COURSE, DURING, runs);
    stage({ admissionRounds: { "older-intake": olderRound(), [FORM_ID]: form({ status: "draft" }) } });
    const withDraft = await pageRound(AGI_COURSE, DURING, runs);
    assert.deepEqual(withDraft.cta, without.cta);
    for (const auth of EVERYBODY) assert.equal(render(withDraft.cta, auth), render(without.cta, auth));
  });

  test("with both open, the button opens the form", async () => {
    stage({ admissionRounds: { "older-intake": olderRound(), [FORM_ID]: form() } });
    const { round, cta } = await pageRound(AGI_COURSE, DURING, runs);
    assert.equal(round.id, FORM_ID);
    assert.deepEqual(hrefs(render(cta)), [`/apply/${FORM_ID}`]);
  });

  test("a form that has closed, or has not opened, never hides a round that is taking applications", async () => {
    for (const over of [{ status: "settled" }, { opensAt: new Date("2026-10-15T08:00:00Z") }]) {
      stage({ admissionRounds: { "older-intake": olderRound(), [FORM_ID]: form(over) } });
      const { round, cta } = await pageRound(AGI_COURSE, DURING, runs);
      assert.equal(round.id, "older-intake");
      assert.equal(cta.form, null);
      assert.ok(render(cta, signedIn).includes('href="/apply/older-intake"'));
    }
  });

  test("the one rule, case by case", () => {
    const at = (state, isForm) => ({ id: `${isForm ? "form" : "older"}-${state}`, state, form: isForm ? { applyPath: "/apply/x", starts: "" } : null });
    const speaks = (formState, olderState) =>
      formRound.speakingRoundFor(formState ? at(formState, true) : null, olderState ? at(olderState, false) : null)?.id ?? null;
    assert.equal(speaks(null, null), null);
    assert.equal(speaks(null, "open"), "older-open");
    assert.equal(speaks("open", null), "form-open");
    // At equal standing the form speaks: somebody tied the programme to the course on purpose.
    for (const state of ["open", "not-yet", "closed"]) assert.equal(speaks(state, state), `form-${state}`);
    // Otherwise whichever is further along: taking applications, then opening soon, then closed.
    assert.equal(speaks("open", "not-yet"), "form-open");
    assert.equal(speaks("open", "closed"), "form-open");
    assert.equal(speaks("not-yet", "closed"), "form-not-yet");
    assert.equal(speaks("not-yet", "open"), "older-open");
    assert.equal(speaks("closed", "open"), "older-open");
    assert.equal(speaks("closed", "not-yet"), "older-not-yet");
  });

  test("an open-enrolment course keeps its own sign-up window, whatever it is tied to", async () => {
    // The page's one precedence rule, unchanged: a pre-course admits everybody from its session picker.
    stage({ admissionRounds: { [FORM_ID]: form() } });
    const { round, speakingRound, cta } = await pageRound(AGI_COURSE, DURING, { enrolMode: "open" });
    assert.equal(round.id, FORM_ID);
    assert.equal(speakingRound, null);
    assert.equal(cta, null);
  });
});

// ---------------------------------------------------------------------------
// 5. The catalogue
// ---------------------------------------------------------------------------

describe("the catalogue says the same, course by course", () => {
  const published = (title) => ({ title, status: "published", track: "general", tagline: "", level: "" });
  const site = (rounds) => ({
    courses: {
      [AGI_COURSE]: published("AGI Strategy Fellowship"),
      [TAIS_COURSE]: published("Technical AI Safety Fellowship"),
      [UNTIED_COURSE]: published("Reading Group"),
    },
    admissionRounds: rounds,
  });
  const rows = async () =>
    Object.fromEntries((await courses.listPublishedCourses()).map((entry) => [entry.course.id, entry.liveRound]));
  /** The catalogue reads the real clock, so each term is laid out around today. */
  const DAY = 86_400_000;
  const around = (opensIn, closesIn) => ({
    opensAt: new Date(Date.now() + opensIn * DAY),
    closesAt: new Date(Date.now() + closesIn * DAY),
  });

  test("each tied course carries the form, in the state it is in, and an untied one carries nothing", async () => {
    const cases = [
      ["open", around(-3, 9)],
      ["not-yet", around(3, 15)],
      ["closed", around(-15, -3)],
    ];
    for (const [state, dates] of cases) {
      stage(site({ [FORM_ID]: form(dates) }));
      const found = await rows();
      for (const courseId of [AGI_COURSE, TAIS_COURSE]) {
        assert.equal(found[courseId]?.id, FORM_ID, `${state}: ${courseId}`);
        assert.equal(found[courseId].state, state);
        assert.deepEqual(found[courseId].form, { applyPath: `/apply/${FORM_ID}`, starts: "w/c 26 Oct" });
      }
      assert.equal(found[UNTIED_COURSE], null, state);
    }
  });

  test("a draft form puts nothing on any card", async () => {
    for (const over of [{ status: "draft" }, { archived: true }, { status: "cancelled" }]) {
      stage(site({ [FORM_ID]: form({ ...around(-3, 9), ...over }) }));
      assert.deepEqual(await rows(), { [AGI_COURSE]: null, [TAIS_COURSE]: null, [UNTIED_COURSE]: null });
    }
  });

  test("a course on an open form sorts ahead of one that is taking nobody", async () => {
    stage(site({ [FORM_ID]: form({ ...around(-3, 9) }, { "technical-ai-safety": { courseId: null } }) }));
    const order = (await courses.listPublishedCourses()).map((entry) => entry.course.id);
    assert.equal(order[0], AGI_COURSE);
  });

  test("the form is read once for the whole catalogue", async () => {
    const db = stage(site({ [FORM_ID]: form(around(-3, 9)) }));
    await courses.listPublishedCourses();
    const formReads = db.asked.filter((read) => JSON.stringify(read.filters) === JSON.stringify([["formVersion", "==", 2]]));
    assert.equal(formReads.length, 1);
  });
});

/** Source with its comments gone, so a sentence about a call is not a call. */
function codeOf(...parts) {
  return readFileSync(join(SRC, ...parts), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// 6. The way back to your applications
// ---------------------------------------------------------------------------

describe("the dashboard's way back to your applications", () => {
  const card = (rows) => renderToStaticMarkup(createElement(YourApplications, { rows }));
  const one = [{ roundId: FORM_ID, label: "Autumn 2026" }];

  test("somebody who has not applied to anything is shown nothing", () => {
    assert.equal(card([]), "");
  });

  test("somebody who has applied gets one link to the list, and one to each application", () => {
    const html = card(one);
    assert.match(html, /<h3 class="title">Your applications<\/h3>/);
    assert.deepEqual(hrefs(html), ["/applications", `/applications/${FORM_ID}`]);
    assert.equal(text(html), "Your applications View all → Autumn 2026 Open");
  });

  test("an id is escaped into its address, and never trusted to be a tidy one", () => {
    const html = card([{ roundId: "a round/with?odd#parts", label: "Odd" }]);
    assert.deepEqual(hrefs(html), ["/applications", "/applications/a%20round%2Fwith%3Fodd%23parts"]);
  });

  test("three applications are named, and the rest are one click away", () => {
    const many = ["Autumn 2026", "Spring 2027", "Summer 2027", "Autumn 2027", "Spring 2028"].map((label, i) => ({
      roundId: `round-${i}`,
      label,
    }));
    const html = card(many);
    assert.deepEqual(hrefs(html), ["/applications", "/applications/round-0", "/applications/round-1", "/applications/round-2"]);
    assert.ok(!html.includes("Autumn 2027"));
  });

  test("when the applications could not be read, the way back is offered all the same", () => {
    const html = card(null);
    assert.deepEqual(hrefs(html), ["/applications"]);
    assert.equal(
      text(html),
      "Your applications View all → Everything you have applied to, and where each one has got to.",
    );
  });

  test("it names an application and never says what became of it", async () => {
    // The card is handed two fields and prints those. What somebody was told
    // is said on their own page and on the list, in one set of words.
    const words = await loadTs(join("lib", "applications", "words.ts"));
    const html = card(one).toLowerCase();
    for (const word of [
      ...words.WORDS_APPLICANTS_NEVER_SEE,
      "accepted",
      "declined",
      "no offer",
      "invitation",
      "invited",
      "pooled",
      "submitted",
      "draft",
      "sent",
      "decision",
    ]) {
      assert.ok(!html.includes(word), `the card says "${word}"`);
    }
  });

  const DASHBOARD = codeOf("app", "(app)", "dashboard", "page.tsx");

  test("the dashboard reads with the list's own loader, by the session's own uid", () => {
    assert.ok(DASHBOARD.includes('import { loadStatusRows } from "@/lib/admissions/statusHubData";'));
    assert.ok(DASHBOARD.includes("const rows = await loadStatusRows(db, uid, new Date());"));
    // And not at all while an admin is viewing the site as this member: the
    // answer is then "could not be read", decided before the loader is called.
    assert.ok(DASHBOARD.includes("const viewingAs = markerIsLive(await getImpersonator(), user?.uid ?? null);"));
    assert.ok(DASHBOARD.includes("const applications = user ? await applicationsOf(user.uid, viewingAs) : [];"));
    assert.ok(DASHBOARD.indexOf("if (viewingAs) return null;") < DASHBOARD.indexOf("const rows = await loadStatusRows("));
    assert.ok(DASHBOARD.includes("if (viewingAs) return null;"));
    // Nothing a request could carry names whose applications are read.
    assert.ok(!/searchParams|params\b|cookies\(|headers\(/.test(DASHBOARD), "the dashboard reads something off the request");
  });

  test("two fields of each row leave it, and they are the two the card prints", () => {
    assert.ok(DASHBOARD.includes("return rows.map((row) => ({ roundId: row.round.id, label: row.round.label }));"));
    assert.ok(DASHBOARD.includes("<YourApplications rows={applications} />"));
    assert.ok(!/row\.application\b|\.status\b|\.result\b/.test(DASHBOARD), "the dashboard reads what became of an application");
  });

  test("a read that fails is not the same as having applied to nothing", () => {
    // Null draws the card with the link; an empty list draws nothing.
    assert.ok(DASHBOARD.includes("if (!db) return null;"));
    assert.match(DASHBOARD, /catch \(err\) \{ console\.warn\([^)]*\); return null; \}/);
  });

  test("the dashboard is the one place this lane added the link, and the shell is untouched", () => {
    // The sidebar and the admin tabs are pinned elsewhere. This holds that the
    // card is a card on the page and reaches into neither.
    const component = codeOf("features", "applications", "home", "YourApplications.tsx");
    for (const source of [DASHBOARD, component]) {
      assert.ok(!/AppShell|AdminTabs/.test(source));
    }
  });
});

// ---------------------------------------------------------------------------
// 7. The course pages' own glue
// ---------------------------------------------------------------------------

describe("the pages make the calls this suite makes", () => {
  const PAGE = codeOf("app", "(public)", "courses", "[courseId]", "page.tsx");
  const CATALOGUE = codeOf("app", "(public)", "courses", "page.tsx");
  const FETCH_COURSES = codeOf("features", "courses", "fetchCourses.ts");

  test("the course page asks both lookups, lets the one rule choose, and flattens what it chose", () => {
    assert.ok(
      PAGE.includes(
        "const [olderRound, formRound] = await Promise.all([ fetchLiveRoundForRuns(runSet.runIds), fetchFormRoundForCourse(course.id), ]);",
      ),
    );
    assert.ok(PAGE.includes("const round = speakingRoundFor(formRound, olderRound);"));
    assert.ok(PAGE.includes("const speakingRound = roundOwnsDates( round, applicationRun?.run.enrolMode ?? null, ) ? round : null;"));
    assert.ok(PAGE.includes("const targetRun = roundTargetRun(speakingRound, runSet.runsById, course.id);"));
    assert.ok(PAGE.includes("const ctaRound = toCTARound(speakingRound, targetRun);"));
    // Both placements are handed the flattened round and nothing else about it.
    assert.equal(PAGE.split("round={ctaRound}").length - 1, 2);
    assert.ok(!/round=\{(round|formRound|olderRound|speakingRound)\}/.test(PAGE), "a whole round was handed to the client");
  });

  test("the facts rail takes its start from the form only when no run gives one", () => {
    assert.ok(PAGE.includes('startDateOf(viaRound ? targetRun : (run?.run ?? null)) || (round?.form?.starts ?? "")'));
  });

  test("the catalogue asks the same lookup and the same rule", () => {
    assert.ok(FETCH_COURSES.includes("fetchFormRoundsByCourse(now),"));
    assert.ok(
      FETCH_COURSES.includes(
        "const liveRound = speakingRoundFor( formRounds.get(course.id) ?? null, roundPass.rounds.get(course.id) ?? null, );",
      ),
    );
  });

  test("a card for a course on the form gives the day to apply by, in the page's own words", () => {
    assert.ok(CATALOGUE.includes("const viaForm = viaRound && Boolean(round?.form);"));
    assert.ok(CATALOGUE.includes("viaForm ? `Apply by ${formatWindowDate(closesAt)}` : `${noun} close ${formatWindowDate(closesAt)}`"));
  });

  test("neither page reads a round's window for itself", () => {
    // The form's state is decided once, by the form's own lookup, on the one
    // predicate its apply routes refuse on. A page that asked again could
    // offer a button the form's page would then refuse.
    for (const [name, source] of [["the course page", PAGE], ["the catalogue", CATALOGUE]]) {
      assert.ok(!source.includes("roundWindowState("), `${name} decides a round's window itself`);
      assert.ok(!source.includes("isApplicationForm("), `${name} decides what is a form itself`);
    }
  });
});
