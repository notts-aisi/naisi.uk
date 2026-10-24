/**
 * What a visitor may be told about this term: the question the homepage, the
 * programme pages and the signed-in home ask before they say whether
 * applications are open, closed or over.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * `src/lib/applications/lifecycle/publicTerm.ts` reads application forms on
 * the Admin SDK and hands a page any visitor can load what it found. A form
 * carries who leads and reviews each programme, the live counts of
 * applications, each programme's places and when decision day was sent, so
 * six things have to hold and each is asked here by running the code:
 *
 *  1. THE STAGE IS THE FORM'S OWN. Every stage is reached from a stored form
 *     in every state, and the answer is `termStageFor`'s said again for a
 *     visitor. `open` is never said of a form the apply routes would refuse.
 *  2. A DRAFT IS NOBODY'S BUSINESS. A draft, an archived form, a cancelled
 *     one and a form with nothing left on the site read exactly as no form.
 *  3. ONE RULE CHOOSES BETWEEN FORMS. Taking applications, then the latest
 *     to close, then opening later, and the same answer whichever order the
 *     database returns them in.
 *  4. A FORM THAT OPENS LATER DOES NOT TAKE OVER. While a term is under way
 *     it is told as the next intake, and it becomes this term the moment it
 *     takes applications. `running` does not end when the term is settled,
 *     and no clock of its own ends it.
 *  5. WHAT LEAVES IS LISTED FIELD BY FIELD. The keys are compared with a
 *     list in every stage, and a form stuffed with things no visitor may
 *     know is searched for in what comes back.
 *  6. A PUBLIC PAGE MAY IMPORT IT. Its imports are walked, and none arrives
 *     at a module that reads reviews or decisions, or that says who has a
 *     role. It makes no read of its own: the one read is `readForms`, which
 *     nothing else may import.
 *
 * Then the three components a page draws the term with
 * (`src/features/term/`): the words of each stage, the dates in London's
 * time whatever zone the server is in, and the link that is only there
 * while the form is open.
 *
 * Stubbed: `server-only`, the Admin SDK handle (a small database that
 * records what it is asked), `next/link` (an anchor) and the stylesheets.
 */

// Before anything reads the clock. `node --test` runs each file in its own
// process, so this reaches no other suite. A zone far from London is the
// point: the date tests below would pass on a London laptop with a formatter
// that named no zone.
process.env.TZ = "America/Los_Angeles";

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

globalThis.__publicTerm = { db: null, h: createElement };

/** A stylesheet as its own class names, so `styles.line` renders as `class="line"`. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__publicTerm.db ?? undefined; }"],
    [
      "next/link",
      "export default ({ href, className, children }) => globalThis.__publicTerm.h('a', { href, className }, children);",
    ],
    ["./TermStatusLine.module.css", CLASS_NAMES],
    ["./TermDates.module.css", CLASS_NAMES],
    ["./TermApplyLink.module.css", CLASS_NAMES],
  ]),
});

const publicTerm = await loadTs(join("lib", "applications", "lifecycle", "publicTerm.ts"));
const openForm = await loadTs(join("lib", "applications", "lifecycle", "openForm.ts"));
const lifecycle = await loadTs(join("lib", "applications", "lifecycle", "status.ts"));
const roundWindow = await loadTs(join("lib", "admissions", "window.ts"));
const words = await loadTs(join("features", "term", "termWords.ts"));
const { fetchPublicTerm } = await loadTs(join("features", "term", "fetchPublicTerm.ts"));
const { default: TermStatusLine } = await loadTs(join("features", "term", "TermStatusLine.tsx"));
const { default: TermDates } = await loadTs(join("features", "term", "TermDates.tsx"));
const { default: TermApplyLink } = await loadTs(join("features", "term", "TermApplyLink.tsx"));

// ---------------------------------------------------------------------------
// A database that records what it is asked
// ---------------------------------------------------------------------------

function makeDb(rounds) {
  const asked = [];
  return {
    asked,
    collection(name) {
      const query = (filters) => ({
        where: (field, op, value) => query([...filters, [field, op, value]]),
        orderBy: () => {
          throw new Error("this read may not sort on the server");
        },
        get: async () => {
          asked.push({ collection: name, filters });
          const docs = Object.entries(rounds)
            .filter(([, data]) => filters.every(([field, , value]) => data[field] === value))
            .map(([id, data]) => ({ id, data: () => structuredClone(data) }));
          return { docs };
        },
      });
      return query([]);
    },
  };
}

const OPENS = new Date("2026-11-30T09:00:00Z");
const CLOSES = new Date("2026-12-13T23:59:00Z");
/** A millisecond before applications open, the middle of the window, and a millisecond after the close. */
const BEFORE = new Date(OPENS.getTime() - 1);
const DURING = new Date("2026-12-05T12:00:00Z");
const AFTER = new Date(CLOSES.getTime() + 1);
/** When decision day was sent. Nothing a visitor is handed may carry it. */
const SENT_AT = new Date("2026-12-17T10:30:00Z");

const FORM_ID = "spring-2027__a1b2c3d4";
const AGI_COURSE = "agi-strategy-fellowship__a1b2c3d4";

const programme = (over) => ({
  kind: "fellowship",
  name: "AGI Strategy Fellowship",
  shortName: "AGI Strategy",
  pitch: "Six weeks on where this is going.",
  facts: "6 WEEKS · ~5 HRS A WEEK",
  starts: "w/c 18 Jan",
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

/** A form that is open at DURING, carrying everything a visitor must not be told. */
const form = (over = {}) => ({
  formVersion: 2,
  kind: "enrolment",
  label: "Spring 2027",
  slug: "spring-2027",
  status: "open",
  opensAt: OPENS,
  closesAt: CLOSES,
  decisionsByDate: "2026-12-18",
  invitationReplyBy: "2026-12-20",
  stageIds: [],
  reviewerUids: ["claudia-lead-uid", "lloyd-reviewer-uid"],
  finalDeciderUid: "zach-admin-uid",
  authorUid: "zach-admin-uid",
  applicationCounts: { draft: 3, submitted: 41 },
  archived: false,
  programmeIds: ["agi-strategy", "research-incubator", "old-stream"],
  programmes: {
    "agi-strategy": programme({ runId: "run-agi-spring", courseId: AGI_COURSE }),
    "research-incubator": programme({
      kind: "incubator",
      name: "Research Incubator",
      shortName: "Research incubator",
      pitch: "Replicate a paper with a small team.",
      facts: "7 WEEKS · SELECTIVE",
      starts: "w/c 25 Jan",
      leadUid: "zach-admin-uid",
      reviewerUids: [],
    }),
    "old-stream": programme({
      name: "Closed Fellowship",
      shortName: "Closed",
      pitch: "A stream that was taken off the site.",
      closed: true,
      runId: "run-closed",
      courseId: "closed-course__c3d4e5f6",
    }),
  },
  questionSetIds: ["fellowships"],
  asksFacilitating: true,
  revealOtherReviews: true,
  noOfferWording: { subject: "No offer this time", body: "Private wording for the no offer email." },
  decisionsSentAt: null,
  decisionsSentByUid: null,
  ...over,
});

/** Decision day has been sent: the two fields the send stamps. */
const sent = { decisionsSentAt: SENT_AT, decisionsSentByUid: "zach-admin-uid" };

const find = (rounds, now = DURING) => publicTerm.findPublicTerm(makeDb(rounds), now);
const stageOf = async (over, now = DURING) => (await find({ [FORM_ID]: form(over) }, now)).stage;

const NO_TERM = {
  stage: "none",
  label: null,
  opensAt: null,
  closesAt: null,
  decisionsByDate: null,
  applyPath: null,
  next: null,
  programmes: [],
};

// ---------------------------------------------------------------------------
// 1. The stage is the form's own
// ---------------------------------------------------------------------------

describe("where the term is, from the form's own state and dates", () => {
  test("with no form at all there is no term, and every fact is null", async () => {
    assert.deepEqual(await find({}), NO_TERM);
  });

  test("a form an admin has opened, with its opening still ahead, is `before`", async () => {
    assert.equal(await stageOf({}, BEFORE), "before");
    assert.equal(await stageOf({}, new Date("2026-01-01T00:00:00Z")), "before");
  });

  test("a form inside its dates is `open`: both ends are in, and a millisecond outside either is out", async () => {
    assert.equal(await stageOf({}, OPENS), "open");
    assert.equal(await stageOf({}, DURING), "open");
    assert.equal(await stageOf({}, CLOSES), "open");
    assert.equal(await stageOf({}, new Date(OPENS.getTime() - 1)), "before");
    assert.equal(await stageOf({}, new Date(CLOSES.getTime() + 1)), "closed");
  });

  test("applications closed and decisions not yet out is `closed`, by the clock or by an admin", async () => {
    assert.equal(await stageOf({}, AFTER), "closed", "the close passed and nobody moved the status");
    assert.equal(await stageOf({ status: "closed" }, DURING), "closed", "closed by hand in the middle of its window");
    assert.equal(await stageOf({ status: "closed" }, BEFORE), "closed", "closed by hand before it ever opened");
    assert.equal(await stageOf({ status: "deciding" }, AFTER), "closed");
  });

  test("once decision day has been sent it is `running`, whichever status the form was left in", async () => {
    for (const status of ["open", "closed", "deciding", "settled"]) {
      assert.equal(await stageOf({ status, ...sent }, new Date("2026-12-18T09:00:00Z")), "running", status);
    }
  });

  test("it is the stage the committee's own term page reads, said again for a visitor", async () => {
    const TOLD = {
      draft: "none",
      archived: "none",
      cancelled: "none",
      "opens-later": "before",
      open: "open",
      deciding: "closed",
      decided: "running",
      settled: "running",
    };
    const seen = { theirs: new Set(), ours: new Set() };
    for (const status of ["draft", "open", "closed", "deciding", "settled", "cancelled"]) {
      for (const archived of [false, true]) {
        for (const decisionsSentAt of [null, SENT_AT]) {
          for (const now of [BEFORE, OPENS, DURING, CLOSES, AFTER]) {
            const theirs = lifecycle.termStageFor(
              { status, archived, opensAt: OPENS, closesAt: CLOSES, decisionsSentAt },
              now,
            );
            const ours = await stageOf({ status, archived, decisionsSentAt }, now);
            assert.equal(ours, TOLD[theirs], `${status}, archived ${archived}, sent ${Boolean(decisionsSentAt)}: ${theirs}`);
            seen.theirs.add(theirs);
            seen.ours.add(ours);
          }
        }
      }
    }
    assert.deepEqual([...seen.theirs].sort(), Object.keys(TOLD).sort(), "the grid did not reach every stage a form can be at");
    assert.deepEqual([...seen.ours].sort(), ["before", "closed", "none", "open", "running"]);
  });

  test("`open` is never said of a form the apply routes would refuse, and the address is the form's own", async () => {
    for (const status of ["draft", "open", "closed", "deciding", "settled", "cancelled"]) {
      for (const archived of [false, true]) {
        for (const decisionsSentAt of [null, SENT_AT]) {
          for (const now of [BEFORE, OPENS, DURING, CLOSES, AFTER]) {
            const stored = form({ status, archived, decisionsSentAt });
            const term = await find({ [FORM_ID]: stored }, now);
            const offered = await openForm.findOpenForm(makeDb({ [FORM_ID]: stored }), now);
            const takes = roundWindow.roundWindowState({ status, archived, opensAt: OPENS, closesAt: CLOSES }, now).state;
            const where = `${status}, archived ${archived}, sent ${Boolean(decisionsSentAt)}`;
            if (term.stage === "open") {
              assert.equal(takes, "open", `${where}: called open, and the form would refuse an application`);
              assert.equal(term.applyPath, offered.applyPath, where);
              assert.equal(term.applyPath, `/apply/${FORM_ID}`);
            } else {
              assert.equal(term.applyPath, null, `${where}: an address was handed over for a form that is not open`);
            }
            // The other way, for every form decision day has not touched: a
            // form the routes would take an application for is called open.
            if (decisionsSentAt === null && takes === "open") assert.equal(term.stage, "open", where);
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. A draft is nobody's business
// ---------------------------------------------------------------------------

describe("a form a visitor is told nothing about", () => {
  const silent = {
    "a draft": { status: "draft" },
    "a draft with decision day somehow stamped": { status: "draft", ...sent },
    "a form with a status this site does not know": { status: "paused" },
    "archived while open": { archived: true },
    "archived after it was settled": { archived: true, status: "settled", ...sent },
    cancelled: { status: "cancelled" },
    "with every programme closed": { programmeIds: ["old-stream"] },
    "with every programme closed, after decisions": { programmeIds: ["old-stream"], status: "settled", ...sent },
    "with no programmes": { programmeIds: [], programmes: {} },
  };

  for (const [name, over] of Object.entries(silent)) {
    test(`${name} reads exactly as no form, before, during and after its dates`, async () => {
      for (const now of [BEFORE, DURING, AFTER]) {
        const term = await find({ [FORM_ID]: form(over) }, now);
        assert.deepEqual(term, NO_TERM);
        assert.equal(JSON.stringify(term), JSON.stringify(NO_TERM), `something about ${name} reached a page`);
      }
    });
  }

  test("an older round is never a form, however open it is", async () => {
    const older = form();
    delete older.formVersion;
    assert.deepEqual(await find({ "autumn-intake": older, "another-version": { ...form(), formVersion: 1 } }), NO_TERM);
  });

  test("the answer for no term is a new object each time", () => {
    const first = publicTerm.noPublicTerm();
    first.programmes.push({ id: "left-behind" });
    assert.deepEqual(publicTerm.noPublicTerm(), NO_TERM);
  });
});

// ---------------------------------------------------------------------------
// 3. One rule chooses between forms
// ---------------------------------------------------------------------------

/** Forms in each standing at DURING, told apart by their label. */
const taking = (label, closesAt = CLOSES, over = {}) => form({ label, closesAt, ...over });
const opening = (label, opensAt, closesAt, over = {}) => form({ label, opensAt, closesAt, ...over });
const FORTNIGHT = 14 * 24 * 60 * 60 * 1000;
/** A form whose close has passed, opened a fortnight before it. With no close, one an admin closes by hand. */
const awaited = (label, closesAt, over = {}) =>
  form({
    label,
    opensAt: closesAt ? new Date(closesAt.getTime() - FORTNIGHT) : new Date("2026-01-05T09:00:00Z"),
    closesAt,
    ...over,
  });
const decided = (label, closesAt, over = {}) => awaited(label, closesAt, { status: "settled", ...sent, ...over });

const JAN = new Date("2027-01-11T09:00:00Z");
const JAN_CLOSE = new Date("2027-01-24T23:59:00Z");
const APR = new Date("2027-04-05T08:00:00Z");
const APR_CLOSE = new Date("2027-04-18T22:59:00Z");
const LAST_OCT = new Date("2026-10-18T22:59:00Z");
const LAST_YEAR = new Date("2025-10-19T22:59:00Z");

/** Every order the entries can be stored in. */
function orders(entries) {
  if (entries.length <= 1) return [entries];
  return entries.flatMap((entry, at) =>
    orders([...entries.slice(0, at), ...entries.slice(at + 1)]).map((rest) => [entry, ...rest]),
  );
}

/** The label of this term, asked once for every order the database could return the forms in. */
async function thisTerm(...entries) {
  const answers = new Set();
  let last = null;
  for (const order of orders(entries)) {
    last = await find(Object.fromEntries(order));
    answers.add(JSON.stringify(last));
  }
  assert.equal(answers.size, 1, "the answer changed with the order the forms came back in");
  return last;
}

describe("which form is this term, when a visitor could be told about more than one", () => {
  const open = ["now__00000001", taking("Taking applications")];
  const soon = ["soon__00000002", opening("Opens in January", JAN, JAN_CLOSE)];
  const waiting = ["waiting__00000003", awaited("Closed in October", LAST_OCT)];
  const ran = ["ran__00000004", decided("Decided last year", LAST_YEAR)];

  test("a form taking applications, then a term whose applications have closed, then a form that opens later", async () => {
    assert.equal((await thisTerm(open, soon, waiting, ran)).label, "Taking applications");
    // A form that opens later does not take over from a term that is under way.
    assert.equal((await thisTerm(soon, waiting, ran)).label, "Closed in October");
    assert.equal((await thisTerm(soon, ran)).label, "Decided last year");
    assert.equal((await thisTerm(waiting, ran)).label, "Closed in October");
    assert.equal((await thisTerm(ran)).label, "Decided last year");
    // With no term under way, the form that opens later is this term.
    assert.equal((await thisTerm(soon)).label, "Opens in January");
    assert.deepEqual(
      [
        (await thisTerm(open, soon, ran)).stage,
        (await thisTerm(soon, waiting)).stage,
        (await thisTerm(soon, ran)).stage,
        (await thisTerm(soon)).stage,
      ],
      ["open", "closed", "running", "before"],
    );
  });

  test("among forms whose applications have closed, the latest to close, decided or not", async () => {
    const older = ["older__00000005", decided("Decided the year before", LAST_YEAR)];
    const newer = ["newer__00000006", decided("Decided this autumn", LAST_OCT)];
    assert.equal((await thisTerm(older, newer)).label, "Decided this autumn");
    // A term still waiting for its decisions is not ranked above or below one
    // that has them: only how recently each closed is asked.
    const stillWaiting = ["waiting__00000007", awaited("Waiting, closed last year", LAST_YEAR)];
    assert.equal((await thisTerm(stillWaiting, newer)).label, "Decided this autumn");
    assert.equal((await thisTerm(waiting, older)).label, "Closed in October");
  });

  test("a form an admin closed ahead of its written close is placed by a time that has come", async () => {
    const lastTerm = ["last__00000009", decided("Decided this autumn", LAST_OCT)];
    // Closed by hand in the middle of its window. The close written on it is
    // still ahead, so it is placed by its opening: it is this term, and last
    // term's form does not take its place.
    const early = ["early__00000008", form({ label: "Closed early this term", status: "closed" })];
    assert.equal((await thisTerm(early, lastTerm)).label, "Closed early this term");
    // Closed by hand before it ever opened. It never took an application, so
    // it does not take over from a term that did, and it is not an intake.
    const neverOpened = ["never__00000010", opening("Closed before it opened", JAN, JAN_CLOSE, { status: "closed" })];
    const beside = await thisTerm(neverOpened, lastTerm);
    assert.deepEqual([beside.label, beside.stage, beside.next], ["Decided this autumn", "running", null]);
    // Alone, it is still the only form there is to tell of.
    const alone = await thisTerm(neverOpened);
    assert.deepEqual(
      [alone.label, alone.stage, alone.opensAt, alone.closesAt],
      ["Closed before it opened", "closed", null, null],
    );
    // A form with no close written on it at all is placed by its opening too.
    const undated = ["undated__00000011", awaited("Closed by hand, no date", null, { status: "closed" })];
    const yearBefore = ["older__00000005", decided("Decided the year before", LAST_YEAR)];
    assert.equal((await thisTerm(undated, yearBefore)).label, "Closed by hand, no date");
    assert.equal((await thisTerm(undated, lastTerm)).label, "Decided this autumn");
  });

  test("a form that was closed before it ever opened is no term under way: one that opens later comes before it", async () => {
    const neverOpened = ["never__00000010", opening("Closed before it opened", JAN, JAN_CLOSE, { status: "closed" })];
    const spring = ["spring__00000001", opening("Opens in April", APR, APR_CLOSE)];
    const term = await thisTerm(neverOpened, spring);
    assert.deepEqual([term.label, term.stage, term.next], ["Opens in April", "before", null]);
    // Whichever of the two would have opened first.
    const lateNever = ["never__00000011", opening("Closed before it opened, in April", APR, APR_CLOSE, { status: "closed" })];
    assert.equal((await thisTerm(lateNever, soon)).label, "Opens in January");
    // And a term that did take applications comes before both.
    const under = await thisTerm(neverOpened, spring, ran);
    assert.deepEqual([under.label, under.stage, under.next], ["Decided last year", "running", { label: "Opens in April", opensAt: APR }]);
  });

  test("with two taking applications, the one that closes first", async () => {
    const later = ["later__00000001", taking("Closes later", new Date("2026-12-20T23:59:00Z"))];
    const sooner = ["sooner__00000002", taking("Closes sooner", new Date("2026-12-10T23:59:00Z"))];
    const never = ["never__00000003", taking("Never closes", null)];
    assert.equal((await thisTerm(later, sooner, never)).label, "Closes sooner");
    assert.equal((await thisTerm(later, never)).label, "Closes later");
  });

  test("with two that open later and no term under way, the one that opens next, then the one that closes first", async () => {
    const spring = ["spring__00000001", opening("Opens in April", APR, APR_CLOSE)];
    assert.equal((await thisTerm(spring, soon)).label, "Opens in January");
    const together = ["together__00000002", opening("Opens in January, closes sooner", JAN, new Date("2027-01-17T23:59:00Z"))];
    assert.equal((await thisTerm(soon, together)).label, "Opens in January, closes sooner");
  });

  test("the id settles what the dates leave, so every read agrees", async () => {
    for (const make of [
      (label) => taking(label),
      (label) => opening(label, JAN, JAN_CLOSE),
      (label) => awaited(label, LAST_OCT),
      (label) => decided(label, LAST_OCT),
      (label) => opening(label, JAN, JAN_CLOSE, { status: "closed" }),
    ]) {
      assert.equal((await thisTerm(["b__00000002", make("Second by id")], ["a__00000001", make("First by id")])).label, "First by id");
    }
  });

  test("a form told to nobody is never this term and changes nothing", async () => {
    const hidden = [
      ["draft__00000010", opening("A draft for next term", JAN, JAN_CLOSE, { status: "draft" })],
      ["draft-open__00000011", taking("A draft inside its dates", CLOSES, { status: "draft" })],
      ["archived__00000012", taking("Archived while open", CLOSES, { archived: true })],
      ["cancelled__00000013", taking("Cancelled", CLOSES, { status: "cancelled" })],
      ["empty__00000014", taking("Nothing left to tick", CLOSES, { programmeIds: ["old-stream"] })],
    ];
    for (const shown of [open, soon, waiting, ran]) {
      const alone = await find(Object.fromEntries([shown]));
      const among = await find(Object.fromEntries([...hidden, shown]));
      assert.deepEqual(among, alone, shown[1].label);
    }
    assert.deepEqual(await find(Object.fromEntries(hidden)), NO_TERM);
  });
});

describe("the next intake, beside this term", () => {
  const open = ["now__00000001", taking("Taking applications")];
  const january = ["january__00000002", opening("Spring 2027", JAN, JAN_CLOSE)];
  const april = ["april__00000003", opening("Summer 2027", APR, APR_CLOSE)];
  const running = ["autumn__00000004", decided("Autumn 2026", LAST_OCT)];
  const waiting = ["autumn__00000005", awaited("Autumn 2026", LAST_OCT)];
  const SPRING = { label: "Spring 2027", opensAt: JAN };

  test("beside a term that is running, the form that opens later", async () => {
    const term = await thisTerm(running, january);
    assert.deepEqual([term.label, term.stage, term.next], ["Autumn 2026", "running", SPRING]);
    assert.equal((await thisTerm(running)).next, null);
  });

  test("beside a term whose decisions are still awaited, the form that opens later", async () => {
    const term = await thisTerm(waiting, january);
    assert.deepEqual([term.label, term.stage, term.next], ["Autumn 2026", "closed", SPRING]);
    assert.equal((await thisTerm(waiting)).next, null);
  });

  test("beside a term that is taking applications, the same", async () => {
    const term = await thisTerm(open, january);
    assert.deepEqual([term.label, term.stage, term.next], ["Taking applications", "open", SPRING]);
    assert.equal((await thisTerm(open)).next, null);
  });

  test("with more than one form that opens later, the soonest to open", async () => {
    for (const earlier of [running, waiting, open]) {
      assert.deepEqual((await thisTerm(earlier, april, january)).next, SPRING, earlier[1].label);
    }
    const together = ["together__00000006", opening("Opens the same morning, closes sooner", JAN, new Date("2027-01-17T23:59:00Z"))];
    assert.equal((await thisTerm(running, january, together)).next.label, "Opens the same morning, closes sooner");
  });

  test("beside a term whose own opening is ahead there is none: it is the next intake itself", async () => {
    const term = await thisTerm(january, april);
    assert.deepEqual([term.label, term.stage, term.next], ["Spring 2027", "before", null]);
  });

  test("a later form that is a draft is not the next intake, and neither is any form a visitor is told nothing about", async () => {
    const hidden = {
      "a draft": { status: "draft" },
      archived: { archived: true },
      cancelled: { status: "cancelled" },
      "with nothing on it": { programmeIds: ["old-stream"] },
      "closed before it opened": { status: "closed" },
    };
    for (const earlier of [running, waiting, open]) {
      const alone = await find(Object.fromEntries([earlier]));
      for (const [name, over] of Object.entries(hidden)) {
        const later = ["spring__00000010", opening("Spring 2027", JAN, JAN_CLOSE, over)];
        const term = await thisTerm(earlier, later);
        assert.equal(term.next, null, `${name}, beside ${earlier[1].label}`);
        assert.deepEqual(term, alone, `${name} changed what is told beside ${earlier[1].label}`);
      }
    }
  });

  test("it is a label and a date and nothing else", async () => {
    for (const earlier of [running, waiting, open]) {
      assert.deepEqual(Object.keys((await thisTerm(earlier, january)).next).sort(), ["label", "opensAt"]);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. When `running` ends
// ---------------------------------------------------------------------------

describe("when a term stops being this term", () => {
  const autumn = (over = {}) => decided("Autumn 2026", LAST_OCT, { status: "deciding", ...over });
  const spring = (over = {}) => opening("Spring 2027", JAN, JAN_CLOSE, over);
  const at = async (rounds, now) => {
    const term = await find(rounds, now);
    return [term.label, term.stage, term.next];
  };
  const NOVEMBER = new Date("2026-11-10T12:00:00Z");
  const SPRING = { label: "Spring 2027", opensAt: JAN };

  test("it does not end when the term is settled", async () => {
    assert.deepEqual(await at({ "autumn__00000001": autumn() }, NOVEMBER), ["Autumn 2026", "running", null]);
    assert.deepEqual(await at({ "autumn__00000001": autumn({ status: "settled" }) }, NOVEMBER), ["Autumn 2026", "running", null]);
  });

  test("no clock of its own ends it: with nothing else stored it is still running years on", async () => {
    const rounds = { "autumn__00000001": autumn({ status: "settled" }) };
    assert.deepEqual(await at(rounds, new Date("2030-06-01T12:00:00Z")), ["Autumn 2026", "running", null]);
  });

  test("a draft for next term changes nothing", async () => {
    const drafted = { "autumn__00000001": autumn({ status: "settled" }), "spring__00000002": spring({ status: "draft" }) };
    assert.deepEqual(await at(drafted, NOVEMBER), ["Autumn 2026", "running", null]);
    assert.deepEqual(await at(drafted, JAN), ["Autumn 2026", "running", null], "a draft inside its dates takes no applications");
  });

  test("next term's form, once an admin opens it, is the next intake and does not take over", async () => {
    const opened = { "autumn__00000001": autumn({ status: "settled" }), "spring__00000002": spring() };
    assert.deepEqual(await at(opened, NOVEMBER), ["Autumn 2026", "running", SPRING]);
    // The same while this term's decisions are still awaited.
    const awaiting = { "autumn__00000001": awaited("Autumn 2026", LAST_OCT), "spring__00000002": spring() };
    assert.deepEqual(await at(awaiting, NOVEMBER), ["Autumn 2026", "closed", SPRING]);
  });

  test("the moment that form takes applications, it is this term", async () => {
    const opened = { "autumn__00000001": autumn({ status: "settled" }), "spring__00000002": spring() };
    assert.deepEqual(await at(opened, new Date(JAN.getTime() - 1)), ["Autumn 2026", "running", SPRING]);
    assert.deepEqual(await at(opened, JAN), ["Spring 2027", "open", null]);
    assert.deepEqual(await at(opened, JAN_CLOSE), ["Spring 2027", "open", null]);
    // Once it has closed in its turn it is the latest to close, so it stays.
    assert.deepEqual(await at(opened, new Date(JAN_CLOSE.getTime() + 1)), ["Spring 2027", "closed", null]);
    // A term still waiting for its decisions gives way at the same moment.
    const awaiting = { "autumn__00000001": awaited("Autumn 2026", LAST_OCT), "spring__00000002": spring() };
    assert.deepEqual(await at(awaiting, new Date(JAN.getTime() - 1)), ["Autumn 2026", "closed", SPRING]);
    assert.deepEqual(await at(awaiting, JAN), ["Spring 2027", "open", null]);
  });

  test("archiving the form ends it, and so does closing the last programme on it", async () => {
    const settled = autumn({ status: "settled" });
    assert.deepEqual(await find({ "autumn__00000001": { ...settled, archived: true } }, NOVEMBER), NO_TERM);
    const oneLeft = { ...settled, programmeIds: ["agi-strategy", "old-stream"] };
    assert.equal((await find({ "autumn__00000001": oneLeft }, NOVEMBER)).stage, "running");
    const noneLeft = structuredClone(oneLeft);
    noneLeft.programmes["agi-strategy"].closed = true;
    assert.deepEqual(await find({ "autumn__00000001": noneLeft }, NOVEMBER), NO_TERM);
    // With next term's form already opened, that form is then this term,
    // and there is no intake after it to name.
    for (const gone of [{ ...settled, archived: true }, noneLeft]) {
      const rounds = { "autumn__00000001": gone, "spring__00000002": spring() };
      assert.deepEqual(await at(rounds, NOVEMBER), ["Spring 2027", "before", null]);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. What leaves
// ---------------------------------------------------------------------------

/** One stored form at each stage a visitor is told about, with the moment it is asked at. */
const AT_EACH_STAGE = {
  before: [form(), BEFORE],
  open: [form(), DURING],
  closed: [form(), AFTER],
  running: [form({ status: "settled", ...sent }), new Date("2026-12-18T09:00:00Z")],
};

const TERM_KEYS = ["applyPath", "closesAt", "decisionsByDate", "label", "next", "opensAt", "programmes", "stage"];

describe("what a visitor's page is handed", () => {
  test("the term is these fields and no others, in every stage", async () => {
    for (const [stage, [stored, now]] of Object.entries(AT_EACH_STAGE)) {
      const term = await find({ [FORM_ID]: stored }, now);
      assert.equal(term.stage, stage);
      assert.deepEqual(Object.keys(term).sort(), TERM_KEYS, stage);
      for (const each of term.programmes) {
        assert.deepEqual(
          Object.keys(each).sort(),
          ["courseId", "facts", "id", "kind", "name", "pitch", "runId", "shortName", "starts"],
          stage,
        );
      }
    }
    // With no term the same fields are there, so a page reads them without asking first.
    assert.deepEqual(Object.keys(await find({})).sort(), TERM_KEYS);
  });

  test("the term's own label and dates, under the round's own names", async () => {
    const term = await find({ [FORM_ID]: form() });
    assert.deepEqual(
      [term.label, term.opensAt, term.closesAt, term.decisionsByDate],
      ["Spring 2027", OPENS, CLOSES, "2026-12-18"],
    );
  });

  test("the programmes on the site, in the form's order, without the closed one", async () => {
    const agi = {
      id: "agi-strategy",
      kind: "fellowship",
      name: "AGI Strategy Fellowship",
      shortName: "AGI Strategy",
      pitch: "Six weeks on where this is going.",
      facts: "6 WEEKS · ~5 HRS A WEEK",
      starts: "w/c 18 Jan",
      courseId: AGI_COURSE,
      runId: "run-agi-spring",
    };
    const incubator = {
      id: "research-incubator",
      kind: "incubator",
      name: "Research Incubator",
      shortName: "Research incubator",
      pitch: "Replicate a paper with a small team.",
      facts: "7 WEEKS · SELECTIVE",
      starts: "w/c 25 Jan",
      courseId: null,
      runId: null,
    };
    for (const [stage, [stored, now]] of Object.entries(AT_EACH_STAGE)) {
      assert.deepEqual((await find({ [FORM_ID]: stored }, now)).programmes, [agi, incubator], stage);
    }
    const reordered = form({ programmeIds: ["old-stream", "research-incubator", "agi-strategy"] });
    assert.deepEqual((await find({ [FORM_ID]: reordered })).programmes, [incubator, agi]);
  });

  test("a stored course or run id that could not be one is no tie", async () => {
    for (const bad of ["courses/agi", "a.b", "constructor", "__proto__", "", 7, ["x"], { id: AGI_COURSE }]) {
      const stored = form();
      stored.programmes["agi-strategy"].courseId = bad;
      stored.programmes["agi-strategy"].runId = bad;
      const [first] = (await find({ [FORM_ID]: stored })).programmes;
      assert.deepEqual([first.courseId, first.runId], [null, null], JSON.stringify(bad));
    }
  });

  test("where the form is served is handed over only while it is open", async () => {
    for (const [stage, [stored, now]] of Object.entries(AT_EACH_STAGE)) {
      const term = await find({ [FORM_ID]: stored }, now);
      if (stage === "open") {
        assert.equal(term.applyPath, openForm.applyPathFor(FORM_ID));
      } else {
        assert.equal(term.applyPath, null, stage);
        assert.ok(!JSON.stringify(term).includes(FORM_ID), `the form's id reached a page while it was ${stage}`);
      }
    }
  });

  test("once applications have closed, only the times that have passed are handed over", async () => {
    const times = async (over, now) => {
      const term = await find({ [FORM_ID]: form(over) }, now);
      return [term.stage, term.opensAt, term.closesAt];
    };
    // Closed by hand in the middle of its window: it did open, and the time
    // written on it for the close has not come.
    assert.deepEqual(await times({ status: "closed" }, DURING), ["closed", OPENS, null]);
    // Closed by hand before it ever opened: neither time has come.
    assert.deepEqual(await times({ status: "closed" }, BEFORE), ["closed", null, null]);
    // Decisions sent after an early close: the same rule while it runs.
    assert.deepEqual(await times({ status: "deciding", ...sent }, DURING), ["running", OPENS, null]);
    // Closed by the clock: both have passed, at the instant itself too.
    assert.deepEqual(await times({ status: "deciding" }, CLOSES), ["closed", OPENS, CLOSES]);
    assert.deepEqual(await times({ status: "settled", ...sent }, AFTER), ["running", OPENS, CLOSES]);
    // A form that is taking applications, or will, keeps both: they are what a page prints.
    assert.deepEqual(await times({}, BEFORE), ["before", OPENS, CLOSES]);
    assert.deepEqual(await times({}, DURING), ["open", OPENS, CLOSES]);
  });

  test("nothing a visitor may not know is anywhere in it, in any stage", async () => {
    const secrets = [
      "claudia-lead-uid",
      "lloyd-reviewer-uid",
      "zach-admin-uid",
      "leadUid",
      "reviewerUids",
      "finalDeciderUid",
      "authorUid",
      "applicationCounts",
      "submitted",
      "41",
      "places",
      "32",
      "groupCount",
      "groupSize",
      "Up to 8",
      "useScores",
      "emailWording",
      "Private wording",
      "noOfferWording",
      "revealOtherReviews",
      "invitationReplyBy",
      "2026-12-20",
      "decisionsSentAt",
      "decisionsSentByUid",
      SENT_AT.toISOString(),
      "questionSetIds",
      "asksFacilitating",
      "closed",
      "Closed Fellowship",
      "A stream that was taken off the site",
      "run-closed",
      "closed-course__c3d4e5f6",
      "old-stream",
    ];
    const next = ["april__00000003", opening("Summer 2027", APR, APR_CLOSE)];
    for (const [stage, [stored, now]] of Object.entries(AT_EACH_STAGE)) {
      for (const rounds of [{ [FORM_ID]: stored }, Object.fromEntries([[FORM_ID, stored], next])]) {
        const text = JSON.stringify(await find(rounds, now));
        // The stage's own name is the one place the word "closed" belongs.
        const searched = stage === "closed" ? text.replace('"stage":"closed"', "") : text;
        for (const secret of secrets) assert.ok(!searched.includes(secret), `${secret} reached a visitor's page (${stage})`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The read, and the imports
// ---------------------------------------------------------------------------

describe("the read needs no declared index", () => {
  test("one query, one equality on one field, nothing sorted on the server, however many forms there are", async () => {
    const db = makeDb({
      [FORM_ID]: form(),
      "autumn-2026__00000002": decided("Autumn 2026", LAST_OCT),
      "summer-2027__00000004": opening("Summer 2027", APR, APR_CLOSE, { status: "draft" }),
    });
    await publicTerm.findPublicTerm(db, DURING);
    assert.deepEqual(db.asked, [{ collection: "admissionRounds", filters: [["formVersion", "==", 2]] }]);
  });
});

/** Source with its comments gone, so a rule written in prose is not a use. */
function codeOf(file) {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** A local specifier as a file, or null for a package. */
function resolveLocal(specifier, fromFile) {
  const base = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? join(dirname(fromFile), specifier)
      : null;
  if (!base) return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx"), base]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every file a module reaches through its value imports. A type carries no data. */
function reachableFrom(root) {
  const seen = new Set([root]);
  const queue = [root];
  while (queue.length > 0) {
    const file = queue.pop();
    const source = codeOf(file);
    const imports = [
      ...source.matchAll(/^\s*import\s+(?!type\b)[^;]*?\sfrom\s+["']([^"']+)["']/gm),
      ...source.matchAll(/^\s*export\s+(?!type\b)[^;]*?\sfrom\s+["']([^"']+)["']/gm),
      ...source.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
    ];
    for (const [, specifier] of imports) {
      const target = resolveLocal(specifier, file);
      if (target && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return [...seen].map((file) => relative(REPO_ROOT, file).split("\\").join("/"));
}

function sourceFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

const rel = (file) => relative(REPO_ROOT, file).split("\\").join("/");

const LOOKUP = "src/lib/applications/lifecycle/publicTerm.ts";
const READER = "src/lib/applications/lifecycle/openForm.ts";

describe("a page any visitor can load may import it", () => {
  const ROOT = join(REPO_ROOT, ...LOOKUP.split("/"));
  const reached = reachableFrom(ROOT);

  test("the walk went somewhere", () => {
    for (const expected of [
      LOOKUP,
      // The one read, shared with the two lookups there.
      READER,
      // Where a form is in its term: the function the committee's own term
      // page reads, so a visitor's page and theirs cannot disagree.
      "src/lib/applications/lifecycle/status.ts",
      "src/lib/admissions/roundStatus.ts",
      "src/lib/admissions/window.ts",
      "src/lib/applications/normalise.ts",
      "src/lib/applications/sections.ts",
      "src/lib/firestore/admissionRounds.ts",
    ]) {
      assert.ok(reached.includes(expected), `${expected} was not reached: the walk is not reading imports`);
    }
  });

  test("it reaches nothing that reads a review or a decision, or says who has a role", () => {
    const NAMES_COMMITTEE_DATA = /["'`]admissionReviews["'`]|admissionDecisions|DECISIONS_COLLECTION/;
    // `lifecycle/status.ts` is reached on purpose and is not on this list: it
    // is the pure half of the lifecycle. The test below holds it to that.
    const STAFF = [
      /^src\/lib\/applications\/staffRepo\.ts$/,
      /^src\/lib\/applications\/access\.ts$/,
      /^src\/lib\/applications\/roles\.ts$/,
      /^src\/lib\/applications\/(review|decisionDay|editor)\//,
      /^src\/lib\/applications\/lifecycle\/(move|load|loadTermHome|view|termHome|readiness)\.ts$/,
      /^src\/lib\/firebase\/(session|eligibility|admin)\.ts$/,
      /^src\/lib\/admissions\/memberRecordSync\.ts$/,
    ];
    for (const file of reached) {
      assert.ok(!STAFF.some((pattern) => pattern.test(file)), `${file} is reached from the term lookup`);
      assert.doesNotMatch(
        codeOf(join(REPO_ROOT, ...file.split("/"))),
        NAMES_COMMITTEE_DATA,
        `${file} names the reviews or the decisions and is reached from the term lookup`,
      );
    }
  });

  test("the one read is the shared one: nothing else it reaches asks a database anything", () => {
    const ASKS_A_DATABASE = /\.(?:collection|collectionGroup|doc|getAll|runTransaction|batch)\s*\(|\bgetAdminDb\b|\bgetDocs?\s*\(/;
    const asking = reached.filter((file) => ASKS_A_DATABASE.test(codeOf(join(REPO_ROOT, ...file.split("/")))));
    assert.deepEqual(asking, [READER]);
    assert.doesNotMatch(codeOf(ROOT), /\.(?:where|get|select|limit|orderBy)\s*\(/, "the lookup has grown a read of its own");
  });

  test("it is a server module, and it takes its database from its caller", () => {
    const source = readFileSync(ROOT, "utf8");
    assert.match(source, /^import "server-only";/);
    assert.doesNotMatch(codeOf(ROOT), /getAdminDb|getCurrentUser|requireApplicant/);
    assert.deepEqual(Object.keys(publicTerm).sort(), ["findPublicTerm", "noPublicTerm"]);
  });

  test("whole forms are handed to this lookup and to nothing else", () => {
    // `readForms` returns forms with their leads, reviewers and counts. It is
    // exported so the two files share one read, and for no other reason.
    const users = sourceFiles(SRC)
      .filter((file) => /\breadForms\b/.test(codeOf(file)))
      .map(rel)
      .sort();
    assert.deepEqual(users, [READER, LOOKUP].sort());
    // And the module it comes from still exports what it did, with that one
    // more, and one lookup that answers a yes or a no about a course run
    // (`runTakesPeopleFromForm`) and hands nothing of a form to anybody.
    assert.deepEqual(Object.keys(openForm).sort(), [
      "applyPathFor",
      "findFormsByCourse",
      "findOpenForm",
      "openFormSpeaksFor",
      "readForms",
      "runTakesPeopleFromForm",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 7. The fetcher a page calls
// ---------------------------------------------------------------------------

describe("the term, as a Server Component asks for it", () => {
  test("with no database to ask, there is no term", async () => {
    globalThis.__publicTerm.db = null;
    assert.deepEqual(await fetchPublicTerm(DURING), NO_TERM);
  });

  test("with one, it is the lookup's own answer", async () => {
    const rounds = { [FORM_ID]: form() };
    globalThis.__publicTerm.db = makeDb(rounds);
    assert.deepEqual(await fetchPublicTerm(DURING), await find(rounds, DURING));
    assert.equal((await fetchPublicTerm(DURING)).stage, "open");
    globalThis.__publicTerm.db = null;
  });

  test("a read that does not come back draws the page with no term, and is logged", async (t) => {
    // A page built ahead of time is built where there may be no database
    // behind the handle, and a page that threw there would stop the build.
    const logged = t.mock.method(console, "error", () => {});
    globalThis.__publicTerm.db = {
      collection: () => ({
        where: () => ({
          get: async () => {
            throw new Error("the database did not answer");
          },
        }),
      }),
    };
    assert.deepEqual(await fetchPublicTerm(DURING), NO_TERM);
    assert.equal(logged.mock.callCount(), 1);
    assert.match(String(logged.mock.calls[0].arguments[0]), /fetchPublicTerm failed/);
    assert.match(String(logged.mock.calls[0].arguments[1]), /did not answer/);
    globalThis.__publicTerm.db = null;
  });

  test("the lookup itself still throws, so only the page's fetcher decides what a failure looks like", async () => {
    const failing = { collection: () => ({ where: () => ({ get: async () => Promise.reject(new Error("no answer")) }) }) };
    await assert.rejects(() => publicTerm.findPublicTerm(failing, DURING), /no answer/);
  });
});

// ---------------------------------------------------------------------------
// 8. The words and the dates
// ---------------------------------------------------------------------------

/** 23:59 on Sunday 18 October in London, while the clocks are forward. */
const SUMMER_CLOSE = new Date("2026-10-18T22:59:00Z");
/** 09:00 on Monday 5 October in London. */
const SUMMER_OPEN = new Date("2026-10-05T08:00:00Z");
/** 00:30 on Monday 11 January in London: still Sunday in the zone this process runs in. */
const WINTER_OPEN = new Date("2027-01-11T00:30:00Z");

describe("a date is London's, whatever zone the server is in", () => {
  test("the process is not in London, so a formatter that named no zone would fail here", () => {
    assert.equal(new Date("2026-10-18T22:59:00Z").getHours(), 15);
  });

  test("a day, a time and a deadline", () => {
    assert.equal(words.termDay(SUMMER_CLOSE), "Sun 18 Oct");
    assert.equal(words.termTime(SUMMER_CLOSE), "23:59");
    assert.equal(words.termDeadline(SUMMER_CLOSE), "Sun 18 Oct, 23:59");
    assert.equal(words.termDay(WINTER_OPEN), "Mon 11 Jan");
    assert.equal(words.termTime(WINTER_OPEN), "00:30");
  });

  test("they are the strings the form's own pages print for the same instant", () => {
    for (const at of [SUMMER_OPEN, SUMMER_CLOSE, WINTER_OPEN, CLOSES]) {
      assert.equal(words.termDay(at), roundWindow.formatRoundDate(at));
      assert.equal(words.termDeadline(at), roundWindow.formatRoundDeadline(at));
    }
  });

  test("the day everybody hears is a civil date, and anything else is no day", () => {
    assert.equal(words.termCivilDay("2026-10-23"), "Fri 23 Oct");
    assert.equal(words.termCivilDay("2027-01-01"), "Fri 1 Jan");
    for (const bad of ["", "soon", "23/10/2026", "2026-13-40"]) assert.equal(words.termCivilDay(bad), null, bad);
  });
});

describe("the status line's words, for each stage", () => {
  const facts = (over) => ({
    stage: "open",
    opensAt: SUMMER_OPEN,
    closesAt: SUMMER_CLOSE,
    decisionsByDate: "2026-10-23",
    nextLabel: null,
    nextOpensAt: null,
    ...over,
  });

  test("before, open, closed and running", () => {
    assert.deepEqual(words.statusLineParts(facts({ stage: "before" })), ["Applications open Mon 5 Oct", "Close Sun 18 Oct"]);
    assert.deepEqual(words.statusLineParts(facts({ stage: "open" })), ["Applications open now", "Close Sun 18 Oct, 23:59"]);
    assert.deepEqual(words.statusLineParts(facts({ stage: "closed" })), ["Applications closed", "Decisions by Fri 23 Oct"]);
    assert.deepEqual(words.statusLineParts(facts({ stage: "running" })), ["Running now"]);
    assert.deepEqual(words.statusLineParts(facts({ stage: "none" })), []);
  });

  test("a running term names the next intake only when it is handed one", () => {
    const next = (nextLabel) => words.statusLineParts(facts({ stage: "running", nextLabel, nextOpensAt: WINTER_OPEN }));
    assert.deepEqual(next("Spring 2027"), ["Running now", "Spring intake Mon 11 Jan"]);
    assert.deepEqual(next("autumn 2027"), ["Running now", "Autumn intake Mon 11 Jan"]);
    assert.deepEqual(next("2027 fellowships"), ["Running now", "Next intake Mon 11 Jan"]);
    assert.deepEqual(next(null), ["Running now", "Next intake Mon 11 Jan"]);
    // A label with no date to go with it is not an intake anybody can be told of.
    assert.deepEqual(words.statusLineParts(facts({ stage: "running", nextLabel: "Spring 2027" })), ["Running now"]);
  });

  test("a part whose date is missing is left out, never printed without it", () => {
    assert.deepEqual(words.statusLineParts(facts({ stage: "before", closesAt: null })), ["Applications open Mon 5 Oct"]);
    assert.deepEqual(words.statusLineParts(facts({ stage: "before", opensAt: null })), ["Applications open soon", "Close Sun 18 Oct"]);
    assert.deepEqual(words.statusLineParts(facts({ stage: "open", closesAt: null })), ["Applications open now"]);
    assert.deepEqual(words.statusLineParts(facts({ stage: "closed", decisionsByDate: null })), ["Applications closed"]);
    assert.deepEqual(words.statusLineParts(facts({ stage: "closed", decisionsByDate: "soon" })), ["Applications closed"]);
  });

  test("the season a label opens with, and none where it opens with anything else", () => {
    assert.deepEqual(
      ["Spring 2027", "  summer term", "AUTUMN 2026", "Winter", "2027 Spring", "Springboard 2027", ""].map(words.seasonOf),
      ["spring", "summer", "autumn", "winter", null, null, null],
    );
  });

  test("the start every programme shares, or none", () => {
    const starts = (...labels) => words.sharedStart(labels.map((label) => ({ starts: label })));
    assert.equal(starts("w/c 26 Oct", "w/c 26 Oct", " W/C 26 Oct "), "w/c 26 Oct");
    assert.equal(starts("w/c 26 Oct"), "w/c 26 Oct");
    assert.equal(starts("w/c 26 Oct", "w/c 2 Nov"), null, "two programmes that start on different weeks share no start");
    assert.equal(starts("w/c 26 Oct", ""), null, "a programme that does not say is not spoken for by another");
    assert.equal(starts(), null);
  });
});

describe("the strip's dates, for each stage", () => {
  const facts = (over) => ({
    stage: "open",
    showOpening: false,
    opensAt: SUMMER_OPEN,
    closesAt: SUMMER_CLOSE,
    decisionsByDate: "2026-10-23",
    starts: "w/c 26 Oct",
    ...over,
  });
  const rows = (over) => words.termDateCells(facts(over)).map((cell) => [cell.label, cell.value, cell.note]);
  const CLOSE = ["Applications close", "Sun 18 Oct", "23:59"];
  const DECISIONS = ["Decisions by", "Fri 23 Oct", "by email"];
  const START = ["Programmes start", "w/c 26 Oct", "in person, on campus"];

  test("the three dates the homepage draws, and the close in the past once it has been", () => {
    assert.deepEqual(rows({ stage: "before" }), [CLOSE, DECISIONS, START]);
    assert.deepEqual(rows({ stage: "open" }), [CLOSE, DECISIONS, START]);
    const CLOSED = ["Applications closed", "Sun 18 Oct", "23:59"];
    assert.deepEqual(rows({ stage: "closed" }), [CLOSED, DECISIONS, START]);
    assert.deepEqual(rows({ stage: "running" }), [CLOSED, DECISIONS, START]);
    assert.deepEqual(rows({ stage: "none" }), []);
  });

  test("the opening comes first where a page asks for it, while there is something to say", () => {
    assert.deepEqual(rows({ stage: "before", showOpening: true })[0], ["Applications open", "Mon 5 Oct", "09:00"]);
    assert.deepEqual(rows({ stage: "open", showOpening: true })[0], ["Applications", "Open now", "since Mon 5 Oct"]);
    assert.deepEqual(rows({ stage: "open", showOpening: true, opensAt: null })[0], ["Applications", "Open now", null]);
    assert.equal(rows({ stage: "before", showOpening: true }).length, 4);
    // Once applications have closed there is no opening to tell of.
    assert.equal(rows({ stage: "closed", showOpening: true }).length, 3);
    assert.equal(rows({ stage: "running", showOpening: true }).length, 3);
    assert.deepEqual(rows({ stage: "before", showOpening: true, opensAt: null }), [CLOSE, DECISIONS, START]);
  });

  test("a date that is missing has no cell", () => {
    assert.deepEqual(rows({ closesAt: null }), [DECISIONS, START]);
    assert.deepEqual(rows({ decisionsByDate: null }), [CLOSE, START]);
    assert.deepEqual(rows({ decisionsByDate: "soon" }), [CLOSE, START]);
    assert.deepEqual(rows({ starts: null }), [CLOSE, DECISIONS]);
    assert.deepEqual(rows({ starts: "  " }), [CLOSE, DECISIONS]);
    assert.deepEqual(rows({ closesAt: null, decisionsByDate: null, starts: null }), []);
  });

  test("a date carries the instant or the day a `time` element is given, and a label carries none", () => {
    const cells = words.termDateCells(facts({ stage: "before", showOpening: true }));
    assert.deepEqual(
      cells.map((cell) => [cell.key, cell.dateTime]),
      [
        ["opening", SUMMER_OPEN.toISOString()],
        ["close", SUMMER_CLOSE.toISOString()],
        ["decisions", "2026-10-23"],
        ["start", null],
      ],
    );
  });
});

// ---------------------------------------------------------------------------
// 9. The three components
// ---------------------------------------------------------------------------

const html = (component, props, ...children) => renderToStaticMarkup(createElement(component, props, ...children));
/** The no-break space each part of the line is tied together with. */
const tied = (text) => text.replace(/ /g, "\u00a0");

describe("the status line, drawn", () => {
  const props = { stage: "open", opensAt: SUMMER_OPEN, closesAt: SUMMER_CLOSE, decisionsByDate: "2026-10-23" };

  test("one paragraph, each part tied together so the line breaks only at the dot", () => {
    assert.equal(
      html(TermStatusLine, props),
      `<p class="line">${tied("Applications open now")} · ${tied("Close Sun 18 Oct, 23:59")}</p>`,
    );
    assert.equal(
      html(TermStatusLine, { ...props, stage: "closed", className: "hero" }),
      `<p class="line hero">${tied("Applications closed")} · ${tied("Decisions by Fri 23 Oct")}</p>`,
    );
    assert.equal(
      html(TermStatusLine, { ...props, stage: "running", nextLabel: "Spring 2027", nextOpensAt: WINTER_OPEN }),
      `<p class="line">${tied("Running now")} · ${tied("Spring intake Mon 11 Jan")}</p>`,
    );
  });

  test("with no term there is no line at all", () => {
    assert.equal(html(TermStatusLine, { stage: "none", opensAt: null, closesAt: null, decisionsByDate: null }), "");
  });
});

describe("the strip of dates, drawn", () => {
  const props = { stage: "open", closesAt: SUMMER_CLOSE, decisionsByDate: "2026-10-23", starts: "w/c 26 Oct" };

  test("a list of labelled dates, each date in a `time` element", () => {
    assert.equal(
      html(TermDates, props),
      '<dl class="strip">' +
        '<div class="cell"><dt class="label">Applications close</dt>' +
        `<dd class="value"><time dateTime="${SUMMER_CLOSE.toISOString()}">Sun 18 Oct</time></dd>` +
        '<dd class="note">23:59</dd></div>' +
        '<div class="cell"><dt class="label">Decisions by</dt>' +
        '<dd class="value"><time dateTime="2026-10-23">Fri 23 Oct</time></dd>' +
        '<dd class="note">by email</dd></div>' +
        '<div class="cell"><dt class="label">Programmes start</dt>' +
        '<dd class="value">w/c 26 Oct</dd>' +
        '<dd class="note">in person, on campus</dd></div>' +
        "</dl>",
    );
  });

  test("the opening is drawn only where the page asks, and a strip with nothing in it is not drawn", () => {
    assert.ok(!html(TermDates, { ...props, opensAt: SUMMER_OPEN }).includes("Open now"));
    const withOpening = html(TermDates, { ...props, opensAt: SUMMER_OPEN, showOpening: true, className: "wide" });
    assert.ok(withOpening.startsWith('<dl class="strip wide"><div class="cell"><dt class="label">Applications</dt><dd class="value">Open now</dd><dd class="note">since Mon 5 Oct</dd></div>'));
    assert.equal(html(TermDates, { stage: "none", closesAt: null, decisionsByDate: null, starts: null }), "");
    assert.equal(html(TermDates, { stage: "running", closesAt: null, decisionsByDate: null, starts: null }), "");
  });
});

describe("the link to the form, drawn", () => {
  const PATH = `/apply/${FORM_ID}`;

  test("a link while the form is open, with the page's own look and words", () => {
    assert.equal(html(TermApplyLink, { stage: "open", applyPath: PATH }), `<a href="${PATH}" class="link">Apply</a>`);
    assert.equal(
      html(TermApplyLink, { stage: "open", applyPath: PATH, className: "button" }, "Apply by Sun 18 Oct"),
      `<a href="${PATH}" class="link button">Apply by Sun 18 Oct</a>`,
    );
  });

  test("nothing at all in any other stage, even when it is handed an address", () => {
    for (const stage of ["none", "before", "closed", "running"]) {
      assert.equal(html(TermApplyLink, { stage, applyPath: PATH }, "Apply"), "", stage);
    }
    assert.equal(html(TermApplyLink, { stage: "open", applyPath: null }, "Apply"), "");
  });
});

describe("from a stored form to the words on the page", () => {
  /** What a page does: read the term, and hand each component the fields it prints. */
  async function drawn(rounds, now) {
    const term = await find(rounds, now);
    const { stage, opensAt, closesAt, decisionsByDate, applyPath, next } = term;
    return {
      line: html(TermStatusLine, { stage, opensAt, closesAt, decisionsByDate, nextLabel: next?.label, nextOpensAt: next?.opensAt })
        .replace(/<[^>]+>/g, "")
        .replace(/\u00a0/g, " "),
      dates: words
        .termDateCells({ stage, showOpening: false, opensAt, closesAt, decisionsByDate, starts: words.sharedStart(term.programmes) })
        .map((cell) => `${cell.label} ${cell.value}`),
      link: html(TermApplyLink, { stage, applyPath }),
    };
  }
  const stored = form({ opensAt: SUMMER_OPEN, closesAt: SUMMER_CLOSE, decisionsByDate: "2026-10-23" });
  const rounds = { [FORM_ID]: stored };

  test("before applications open", async () => {
    const page = await drawn(rounds, new Date("2026-10-01T12:00:00Z"));
    assert.equal(page.line, "Applications open Mon 5 Oct · Close Sun 18 Oct");
    assert.deepEqual(page.dates, ["Applications close Sun 18 Oct", "Decisions by Fri 23 Oct"]);
    assert.equal(page.link, "");
  });

  test("while they are open", async () => {
    const page = await drawn(rounds, new Date("2026-10-10T12:00:00Z"));
    assert.equal(page.line, "Applications open now · Close Sun 18 Oct, 23:59");
    assert.equal(page.link, `<a href="/apply/${FORM_ID}" class="link">Apply</a>`);
  });

  test("between the close and decision day", async () => {
    const page = await drawn(rounds, new Date("2026-10-20T12:00:00Z"));
    assert.equal(page.line, "Applications closed · Decisions by Fri 23 Oct");
    assert.deepEqual(page.dates, ["Applications closed Sun 18 Oct", "Decisions by Fri 23 Oct"]);
    assert.equal(page.link, "");
  });

  test("once decisions are out, and with the programmes agreeing on a start", async () => {
    const running = structuredClone({ ...stored, status: "settled", decisionsSentAt: new Date("2026-10-23T09:00:00Z") });
    running.programmes["research-incubator"].starts = "w/c 18 Jan";
    const page = await drawn({ [FORM_ID]: running }, new Date("2026-11-10T12:00:00Z"));
    assert.equal(page.line, "Running now");
    assert.deepEqual(page.dates, ["Applications closed Sun 18 Oct", "Decisions by Fri 23 Oct", "Programmes start w/c 18 Jan"]);
    assert.equal(page.link, "");
  });

  test("while the term runs and next term's form has been opened", async () => {
    const running = structuredClone({ ...stored, status: "settled", decisionsSentAt: new Date("2026-10-23T09:00:00Z") });
    const spring = form({ label: "Spring 2027", opensAt: WINTER_OPEN, closesAt: new Date("2027-01-24T23:59:00Z") });
    const rounds = { [FORM_ID]: running, "spring-2027__b2c3d4e5": spring };
    const page = await drawn(rounds, new Date("2026-11-10T12:00:00Z"));
    assert.equal(page.line, "Running now · Spring intake Mon 11 Jan");
    assert.equal(page.dates[0], "Applications closed Sun 18 Oct", "the strip is still this term's");
    assert.equal(page.link, "");
    // And the morning that form opens, the page is about it.
    const opened = await drawn(rounds, WINTER_OPEN);
    assert.equal(opened.line, "Applications open now · Close Sun 24 Jan, 23:59");
    assert.equal(opened.link, '<a href="/apply/spring-2027__b2c3d4e5" class="link">Apply</a>');
  });

  test("with no form, nothing is drawn", async () => {
    assert.deepEqual(await drawn({}, DURING), { line: "", dates: [], link: "" });
  });
});

// ---------------------------------------------------------------------------
// 10. How the components are written
// ---------------------------------------------------------------------------

describe("the components take the fields they print, and their stylesheets follow the house rules", () => {
  // The folder is read, not listed: a component added to it later is held to
  // the same rules from the commit that adds it.
  const TERM = join(SRC, "features", "term");
  const files = readdirSync(TERM).sort();
  const components = files.filter((name) => name.endsWith(".tsx"));
  const sheets = files.filter((name) => name.endsWith(".module.css"));

  test("the walk found the three components, and each has a stylesheet of its own", () => {
    for (const name of ["TermApplyLink", "TermDates", "TermStatusLine"]) {
      assert.ok(components.includes(`${name}.tsx`), `${name}.tsx was not found: the walk is not reading the folder`);
    }
    assert.deepEqual(
      sheets,
      components.map((name) => name.replace(/\.tsx$/, ".module.css")),
      "a component with no stylesheet of its own, or a stylesheet with no component",
    );
  });

  for (const name of components) {
    test(`${name} is a Server Component handed named fields, never the term`, () => {
      const file = join(TERM, name);
      const code = codeOf(file);
      // The dates are formatted on the server and reach the browser as text.
      assert.doesNotMatch(readFileSync(file, "utf8"), /^\s*["']use client["']/m);
      // The stage's type is all it takes from the lookup, and a type carries no data.
      assert.doesNotMatch(code, /\bPublicTerm\b/, "it is typed to take the whole term");
      assert.doesNotMatch(code, /fetchPublicTerm|findPublicTerm/, "it reads the term itself");
      for (const [statement] of code.matchAll(/^\s*import\s[^;]*publicTerm["'];?/gm)) {
        assert.match(statement, /^\s*import\s+type\b/, "a value import from the lookup");
      }
      // No formatter of its own: a date is formatted where the zone is named.
      assert.doesNotMatch(code, /toLocale(?:Date|Time)?String\(|Intl\.DateTimeFormat\(/);
    });
  }

  for (const name of sheets) {
    test(`${name} ends with one block for phones`, () => {
      const css = readFileSync(join(TERM, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      const media = [...css.matchAll(/@media\s*([^{]+)\{/g)].map(([, condition]) => condition.trim());
      assert.deepEqual(media, ["(max-width: 48rem)"]);
      assert.match(
        css.trimEnd(),
        /@media \(max-width: 48rem\) \{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}$/,
        "the phone block is not the last thing in the file",
      );
      assert.doesNotMatch(css, /break-word/);
      for (const [, value, unit] of css.matchAll(/(?:^|[\s;{])(?:min-|max-)?width\s*:\s*([\d.]+)(rem|px)/g)) {
        assert.ok(Number(value) <= (unit === "rem" ? 20 : 320), `a fixed width of ${value}${unit}`);
      }
    });
  }
});
