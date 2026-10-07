/**
 * "Your application": what somebody sees from the moment they send until
 * decision day.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * ## The rules this guards
 *
 *  - NOBODY HEARS ANYTHING EARLY. What the page shows is worked out from the
 *    person's own application and nothing else, and until decision day has
 *    written a result onto that document the page is the same for everybody
 *    who sent the same answers. Executed: one application is put through
 *    every status the document could carry, and through every reply field
 *    being set with no result beside it, and the view never changes.
 *  - WHOSE. The read is addressed by the caller's own uid. Executed against
 *    an in-memory store holding somebody else's application, a decision and
 *    a review, each carrying a marker: no marker reaches the caller, and the
 *    only documents read are the form, its question sets and the caller's own
 *    application.
 *  - WHICH FORM. A form that is a draft or archived answers a caller with no
 *    application on it exactly as an id that addresses nothing does. Somebody
 *    who applied on it still gets their page.
 *  - THE WORDS are the boards', and the page's own calm states never use a
 *    word the committee keeps to itself.
 *  - ONE CALL. The older page hands a round to this screen in one place,
 *    before it reads anything of its own, and this screen never answers with
 *    a not-found of its own.
 *
 * ## What is real and what is faked
 *
 * Real: everything under `src/lib/applications/`, the date helpers, and the
 * component sources, which are read as text. Faked: `server-only`, the
 * sentinels `firebase-admin/firestore` supplies, and the Admin SDK handle,
 * which is an in-memory store that records every path it is asked for.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCREEN_DIR = join(REPO_ROOT, "src", "features", "applications", "status");
const RULES_DIR = join(REPO_ROOT, "src", "lib", "applications", "status");

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "firebase-admin/firestore",
      "export const FieldValue = {\n" +
        "  serverTimestamp: () => ({ __op: 'serverTimestamp' }),\n" +
        "  increment: (by) => ({ __op: 'increment', by }),\n" +
        "};",
    ],
  ]),
});
const at = (file) => join("lib", "applications", "status", file);

const view = await loadTs(at("view.ts"));
const standing = await loadTs(at("standing.ts"));
const load = await loadTs(at("load.ts"));
const shape = await loadTs(join("lib", "applications", "applicant", "shape.ts"));
const validate = await loadTs(join("lib", "applications", "validate.ts"));
const words = await loadTs(join("lib", "applications", "words.ts"));
const stored = await loadTs(join("lib", "firestore", "admissionApplications.ts"));

// ---------------------------------------------------------------------------
// The sample term, as an applicant is sent it
// ---------------------------------------------------------------------------

const ROUND = "autumn-2026__k3f9a2b1";
const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INCUBATOR = "research-incubator";
const GRID = { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 };
const TODAY = "2026-10-17";

const programme = (id, kind, name, shortName, facts, starts = "w/c 26 Oct") => ({
  id,
  kind,
  name,
  shortName,
  pitch: "",
  facts,
  starts,
  closed: false,
});

const FORM = {
  id: ROUND,
  label: "Autumn 2026",
  windowState: "open",
  opensLabel: "Tue 6 Oct",
  closesLabel: "Sun 18 Oct, 23:59",
  decisionsLabel: "Fri 23 Oct",
  programmes: [
    programme(TAIS, "fellowship", "Technical AI Safety Fellowship", "Technical AI Safety", "6 WEEKS · ~5 HRS A WEEK"),
    programme(AGI, "fellowship", "AGI Strategy Fellowship", "AGI Strategy", "6 WEEKS · ~5 HRS A WEEK"),
    programme(INCUBATOR, "incubator", "Research incubator", "Research incubator", "10 WEEKS · SELECTIVE"),
  ],
  questionSetIds: ["fellowships", "facilitator"],
  asksFacilitating: true,
  availabilityGrid: GRID,
};

const q = (id, type = "long", more = {}) => ({
  id,
  text: `Question ${id}`,
  help: "",
  type,
  options: [],
  optionsFromRanking: false,
  wordLimit: null,
  required: true,
  ...more,
});

const SETS = [
  { id: "fellowships", role: "general", scope: { type: "kind", kind: "fellowship" }, label: "Fellowships", questions: [q("why")] },
  {
    id: "facilitator",
    role: "facilitator",
    scope: { type: "facilitating" },
    label: "Facilitator questions",
    questions: [q("led"), q("which", "choice", { optionsFromRanking: true }), q("training", "choice", { options: ["Yes", "No"] })],
  },
];

const ABOUT = {
  preferredName: "Amara",
  universityEmail: "ada@nottingham.ac.uk",
  universityEmailVerified: true,
  status: "undergraduate",
  statusOther: "",
  subject: "BA Philosophy",
  expectedGraduation: "2028-07",
  motivation: "Philosophy got me into it.",
  interests: "",
};

/** What Amara wrote: AGI Strategy 1st, Technical AI Safety 2nd, yes to facilitating either. */
const content = (overrides = {}) => ({
  aboutYou: ABOUT,
  rankedProgrammeIds: [AGI, TAIS],
  wantsToFacilitate: true,
  answers: {
    fellowships: { why: "I want to understand the strategic picture properly." },
    facilitator: { led: "I ran a reading group.", which: "Either", training: "Yes" },
  },
  availability: { ...GRID, days: [] },
  suMembership: "yes",
  ...overrides,
});

/** The copy of record a send would make of a draft, so a fixture's two copies agree the way real ones do. */
const sentOf = (draft, form = FORM) =>
  validate.contentForSend(shape.formShapeOf(form), shape.questionSetsOf(form, SETS), draft);

function application(overrides = {}) {
  const draft = overrides.draft ?? content();
  return {
    id: `${ROUND}__amara`,
    roundId: ROUND,
    status: "submitted",
    draft,
    sent: sentOf(draft),
    createdAt: "2026-10-08T18:00:00.000Z",
    updatedAt: "2026-10-17T13:20:00.000Z",
    submittedAt: "2026-10-17T13:20:00.000Z",
    sentAt: "2026-10-17T13:20:00.000Z",
    sentLabel: "Sat 17 Oct",
    result: null,
    invitation: null,
    attendance: null,
    ...overrides,
  };
}

const viewOf = (app, form = FORM, today = TODAY) => view.statusViewFor(form, SETS, app, today);

// ---------------------------------------------------------------------------
// 1. The board, from the sample term
// ---------------------------------------------------------------------------

describe("ap-status, as Amara sees it", () => {
  test("her order, her facilitating answer, the three steps and the way back into the form", () => {
    assert.deepEqual(viewOf(application()), {
      kind: "sent",
      label: "Autumn 2026",
      sentLabel: "Sat 17 Oct",
      order: ["AGI Strategy", "Technical AI Safety"],
      facilitating: "Yes, either programme",
      steps: [
        { name: "Sent", when: "Sat 17 Oct", state: "done" },
        { name: "Hear back", when: "Fri 23 Oct", state: "now" },
        { name: "Meet your group", when: "w/c 26 Oct", state: "next" },
      ],
      canChange: true,
      closesLabel: "Sun 18 Oct, 23:59",
      unsentChanges: false,
    });
  });

  test("once the form has closed the answers cannot be changed, and the page says so instead of offering to", () => {
    const closed = viewOf(application(), { ...FORM, windowState: "closed" });
    assert.equal(closed.kind, "sent");
    assert.equal(closed.canChange, false);
    assert.equal(closed.closesLabel, "Sun 18 Oct, 23:59");
  });

  test("the order is what was SENT, in their order, and only programmes the form still carries", () => {
    const draft = content({ rankedProgrammeIds: [TAIS, "left-the-form", AGI, TAIS] });
    const app = application({ draft, sent: { ...content(), rankedProgrammeIds: [TAIS, "left-the-form", AGI, TAIS] } });
    assert.deepEqual(viewOf(app).order, ["Technical AI Safety", "AGI Strategy"]);
    // A change saved after the send and not sent again is not what the committee has.
    const changed = application({ draft: content({ rankedProgrammeIds: [INCUBATOR] }), sent: sentOf(content()) });
    assert.deepEqual(viewOf(changed).order, ["AGI Strategy", "Technical AI Safety"]);
  });

  test("a change saved since the send is said, because Saved is not Sent", () => {
    const draft = content({ answers: { ...content().answers, fellowships: { why: "A better answer." } } });
    const changed = viewOf(application({ draft, sent: sentOf(content()) }));
    assert.equal(changed.unsentChanges, true);
    assert.equal(viewOf(application()).unsentChanges, false);
    // An answer to a set that no longer applies to them is not a change to what was sent.
    const stray = content({ answers: { ...content().answers, incubator: { project: "left over" } } });
    assert.equal(viewOf(application({ draft: stray, sent: sentOf(content()) })).unsentChanges, false);
  });
});

describe("the facilitating line", () => {
  const line = (overrides, form = FORM) => view.facilitatingLine(form, SETS, content(overrides));

  test("yes, with the programme they would rather facilitate", () => {
    assert.equal(line({}), "Yes, either programme");
    assert.equal(line({ answers: { facilitator: { which: "AGI Strategy" } } }), "Yes, AGI Strategy");
    assert.equal(line({ rankedProgrammeIds: [AGI], answers: { facilitator: { which: "AGI Strategy" } } }), "Yes, AGI Strategy");
  });

  test("a plain yes when they did not say which, or said something that is not one of their programmes", () => {
    assert.equal(line({ answers: {} }), "Yes");
    assert.equal(line({ answers: { facilitator: { which: "Research incubator" } } }), "Yes");
    assert.equal(line({ answers: { facilitator: { which: 2 } } }), "Yes");
    // "Either" means nothing with one programme ticked.
    assert.equal(line({ rankedProgrammeIds: [AGI], answers: { facilitator: { which: "Either" } } }), "Yes");
    // Read by the set's own keys: an answer map that only inherits the set says nothing.
    assert.equal(line({ answers: Object.create({ facilitator: { which: "Either" } }) }), "Yes");
  });

  test("no, and not asked", () => {
    assert.equal(line({ wantsToFacilitate: false }), "Not this time");
    assert.equal(line({ wantsToFacilitate: null }), null);
    assert.equal(line({}, { ...FORM, asksFacilitating: false }), null);
  });
});

describe("the three steps while everybody waits", () => {
  const steps = (form, app = application()) => view.waitingSteps(form, app);

  test("Meet your group carries when their programmes start", () => {
    assert.equal(steps(FORM)[2].when, "w/c 26 Oct");
  });

  test("two starts are both said, in their order, because nobody knows yet which it will be", () => {
    const form = {
      ...FORM,
      programmes: [FORM.programmes[0], { ...FORM.programmes[1], starts: "w/c 2 Nov" }, FORM.programmes[2]],
    };
    assert.equal(steps(form)[2].when, "w/c 2 Nov or w/c 26 Oct");
  });

  test("a date nobody has written down is left off, not invented", () => {
    const form = { ...FORM, decisionsLabel: null, programmes: FORM.programmes.map((each) => ({ ...each, starts: " " })) };
    assert.deepEqual(
      steps(form, application({ sentLabel: null })).map((step) => step.when),
      [null, null, null],
    );
    assert.deepEqual(steps(form).map((step) => step.state), ["done", "now", "next"]);
  });
});

// ---------------------------------------------------------------------------
// 2. Nobody hears anything early
// ---------------------------------------------------------------------------

describe("until decision day has written a result, the page is the same for everybody", () => {
  const waiting = viewOf(application());

  test("whatever status the document carries", () => {
    for (const status of stored.ADMISSION_APPLICATION_STATUSES) {
      if (status === "withdrawn") continue;
      assert.deepEqual(viewOf(application({ status })), waiting, `status ${status} changed the page`);
    }
  });

  test("whatever reply fields are on it with no result beside them", () => {
    const strays = [
      { invitation: { programmeId: TAIS, replyBy: "2026-10-25", response: null, respondedAt: null } },
      { invitation: { programmeId: TAIS, replyBy: "2026-10-25", response: "accepted", respondedAt: "2026-10-24T09:00:00.000Z" } },
      { attendance: { answer: "coming", answeredAt: "2026-10-24T09:00:00.000Z" } },
      { attendance: { answer: "cant-make-it", answeredAt: "2026-10-24T09:00:00.000Z" } },
    ];
    for (const stray of strays) {
      for (const status of ["submitted", "accepted", "invited", "no-offer", "declined"]) {
        assert.deepEqual(viewOf(application({ status, ...stray })), waiting, JSON.stringify({ status, ...stray }));
      }
    }
  });

  test("and the standing behind it is `waiting`, which is the only thing a missing result can be", () => {
    for (const status of stored.ADMISSION_APPLICATION_STATUSES) {
      const kind = standing.standingOf({ status, result: null, invitation: null, attendance: null }).kind;
      assert.equal(kind, status === "withdrawn" ? "withdrawn" : "waiting", status);
    }
  });

  test("the waiting page has no field a decision could change", () => {
    assert.deepEqual(Object.keys(waiting).sort(), [
      "canChange",
      "closesLabel",
      "facilitating",
      "kind",
      "label",
      "order",
      "sentLabel",
      "steps",
      "unsentChanges",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 3. The calm states
// ---------------------------------------------------------------------------

describe("somebody with nothing sent on this form", () => {
  test("no application at all: the page says so, and offers the form only while it is open", () => {
    assert.deepEqual(viewOf(null), {
      kind: "none",
      label: "Autumn 2026",
      window: "open",
      opensLabel: "Tue 6 Oct",
      closesLabel: "Sun 18 Oct, 23:59",
    });
    assert.equal(viewOf(null, { ...FORM, windowState: "closed" }).window, "closed");
    assert.equal(viewOf(null, { ...FORM, windowState: "not-yet" }).window, "not-yet");
  });

  test("a draft never sent is a draft, open or closed, and never reads as sent", () => {
    const draftOnly = application({ status: "draft", sent: null, submittedAt: null, sentAt: null, sentLabel: null });
    assert.deepEqual(viewOf(draftOnly), { kind: "draft", label: "Autumn 2026", open: true, closesLabel: "Sun 18 Oct, 23:59" });
    assert.equal(viewOf(draftOnly, { ...FORM, windowState: "closed" }).open, false);
  });

  test("a withdrawn application says only that", () => {
    assert.deepEqual(viewOf(application({ status: "withdrawn" })), { kind: "withdrawn", label: "Autumn 2026" });
  });
});

// ---------------------------------------------------------------------------
// 4. The read: whose, and which form
// ---------------------------------------------------------------------------

function clone(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, each] of Object.entries(value)) out[key] = clone(each);
    return out;
  }
  return value;
}

/** An Admin SDK handle that holds documents by path and records every path it is asked for. */
class FakeDb {
  constructor() {
    this.docs = new Map();
    this.reads = [];
  }

  seed(path, data) {
    this.docs.set(path, clone(data));
  }

  ref(path) {
    return {
      path,
      id: path.split("/").pop(),
      get: async () => {
        this.reads.push(path);
        const held = this.docs.get(path);
        return { id: path.split("/").pop(), exists: held !== undefined, data: () => (held ? clone(held) : undefined) };
      },
      collection: (name) => this.collection(`${path}/${name}`),
    };
  }

  collection(path) {
    return {
      doc: (id) => this.ref(`${path}/${id}`),
      get: async () => {
        this.reads.push(`${path}/*`);
        const docs = [];
        for (const [key, held] of this.docs) {
          if (!key.startsWith(`${path}/`) || key.slice(path.length + 1).includes("/")) continue;
          docs.push({ id: key.split("/").pop(), exists: true, data: () => clone(held) });
        }
        return { docs };
      },
    };
  }
}

const ROUND_PATH = `admissionRounds/${ROUND}`;
const appPath = (uid, round = ROUND) => `admissionApplications/${round}__${uid}`;
const MARK = "MARKER-not-for-an-applicant";

function storedProgramme(name, shortName, more = {}) {
  return {
    kind: "fellowship",
    name,
    shortName,
    pitch: "",
    facts: "6 WEEKS · ~5 HRS A WEEK",
    starts: "w/c 26 Oct",
    places: 24,
    groupCount: 3,
    groupSize: "Up to 8",
    leadUid: `${MARK}-lead`,
    reviewerUids: [`${MARK}-reviewer`],
    useScores: true,
    closed: false,
    runId: null,
    emailWording: { accepted: { subject: `${MARK}-subject`, body: `${MARK}-body` } },
    ...more,
  };
}

function storedRound(overrides = {}) {
  return {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    slug: "autumn-2026",
    academicYear: "2026/27",
    status: "open",
    archived: false,
    opensAt: new Date("2020-01-01T00:00:00Z"),
    closesAt: new Date("2099-01-01T00:00:00Z"),
    decisionsByDate: "2026-10-23",
    availabilityGrid: GRID,
    reviewerUids: [`${MARK}-reviewer`],
    applicationCounts: { draft: 0, submitted: 2 },
    programmeIds: [TAIS, AGI],
    programmes: {
      [TAIS]: storedProgramme("Technical AI Safety Fellowship", "Technical AI Safety"),
      [AGI]: storedProgramme("AGI Strategy Fellowship", "AGI Strategy"),
    },
    questionSetIds: ["fellowships"],
    asksFacilitating: false,
    ...overrides,
  };
}

function storedApplication(uid, overrides = {}) {
  const written = {
    aboutYou: { ...ABOUT, preferredName: uid },
    rankedProgrammeIds: [AGI],
    wantsToFacilitate: null,
    answers: { fellowships: { why: `${uid} wrote this.` } },
    availability: { ...GRID, days: [] },
    suMembership: "yes",
  };
  return {
    formVersion: 2,
    roundId: ROUND,
    uid,
    email: `${uid}@example.com`,
    displayName: `${uid} Example`,
    draft: written,
    sent: written,
    status: "submitted",
    submittedAt: new Date("2026-10-17T13:20:00Z"),
    sentAt: new Date("2026-10-17T13:20:00Z"),
    withdrawnAt: null,
    result: null,
    invitation: null,
    attendance: null,
    createdAt: new Date("2026-10-08T18:00:00Z"),
    updatedAt: new Date("2026-10-17T13:20:00Z"),
    ...overrides,
  };
}

function seededDb(round = storedRound()) {
  const db = new FakeDb();
  db.seed(ROUND_PATH, round);
  db.seed(`${ROUND_PATH}/questionSets/fellowships`, {
    roundId: ROUND,
    role: "general",
    scope: { type: "kind", kind: "fellowship" },
    label: "Fellowships",
    intro: `${MARK}-intro`,
    questions: [{ ...q("why"), scored: true }],
  });
  db.seed(appPath("amara"), storedApplication("amara"));
  // Somebody else, already told, with the committee's work beside their application.
  db.seed(
    appPath("ben"),
    storedApplication("ben", {
      status: "accepted",
      result: { kind: "accepted", programmeId: AGI, publishedAt: new Date("2026-10-23T11:00:00Z") },
      draft: { ...storedApplication("ben").draft, answers: { fellowships: { why: `${MARK}-somebody-else` } } },
    }),
  );
  db.seed(`admissionDecisions/${ROUND}__amara`, {
    roundId: ROUND,
    uid: "amara",
    programmes: { [AGI]: { decision: "accept", decidedByUid: `${MARK}-lead` } },
    pooledOutcome: null,
  });
  db.seed(`admissionReviews/${ROUND}__amara__lloyd`, { roundId: ROUND, applicantUid: "amara", reviewerUid: "lloyd", overallComment: `${MARK}-comment` });
  return db;
}

const NOW = new Date("2026-10-17T15:00:00Z");

describe("the read is the caller's own", () => {
  test("it asks for the form, its question sets and the caller's own application, and nothing else", async () => {
    const db = seededDb();
    const loaded = await load.loadStatus(db, ROUND, "amara", NOW);
    assert.equal(loaded.roundId, ROUND);
    assert.equal(loaded.view.kind, "sent");
    assert.deepEqual([...db.reads].sort(), [appPath("amara"), ROUND_PATH, `${ROUND_PATH}/questionSets/*`].sort());
  });

  test("a decision already made about them is nowhere in what comes back, and nor is anybody else", async () => {
    const db = seededDb();
    const loaded = await load.loadStatus(db, ROUND, "amara", NOW);
    assert.equal(JSON.stringify(loaded).includes(MARK), false);
    assert.equal(JSON.stringify(loaded).includes("ben"), false);
    assert.deepEqual(loaded.view.order, ["AGI Strategy"]);
  });

  test("somebody with no application gets the page that says so, built from the form alone", async () => {
    const db = seededDb();
    const loaded = await load.loadStatus(db, ROUND, "nobody-here", NOW);
    assert.equal(loaded.view.kind, "none");
    assert.equal(JSON.stringify(loaded).includes(MARK), false);
    assert.equal(db.reads.includes(appPath("ben")), false);
    assert.equal(db.reads.includes(appPath("amara")), false);
  });
});

describe("a form a stranger may not learn about", () => {
  const hidden = [
    ["a draft", storedRound({ status: "draft" })],
    ["archived", storedRound({ archived: true })],
  ];

  for (const [name, round] of hidden) {
    test(`${name}: nothing for a caller with no application on it, their page for one who applied`, async () => {
      const db = seededDb(round);
      assert.equal(await load.loadStatus(db, ROUND, "nobody-here", NOW), null);
      const theirs = await load.loadStatus(db, ROUND, "amara", NOW);
      assert.equal(theirs.view.kind, "sent");
      // The form is not taking answers, whatever its dates say.
      assert.equal(theirs.view.canChange, false);
      assert.equal(await load.formIsThere(db, ROUND, NOW), false);
    });
  }

  test("the same nothing as an id that addresses nothing, a round of the older kind, and an id that is not one", async () => {
    const db = seededDb();
    db.seed("admissionRounds/older__00000001", { kind: "enrolment", label: "An older round", status: "open" });
    for (const id of ["nothing-here__00000000", "older__00000001", "constructor", "__proto__", "a/b", "a.b", ""]) {
      assert.equal(await load.loadStatus(db, id, "amara", NOW), null, id);
      assert.equal(await load.formIsThere(db, id, NOW), false, id);
    }
    // An id that is not one is refused before anything is read.
    const fresh = seededDb();
    for (const id of ["constructor", "__proto__", "a/b", "a.b", ""]) await load.loadStatus(fresh, id, "amara", NOW);
    assert.deepEqual(fresh.reads, []);
  });

  test("an open form is there to be told about", async () => {
    assert.equal(await load.formIsThere(seededDb(), ROUND, NOW), true);
  });
});

// ---------------------------------------------------------------------------
// 5. The screens, read as text
// ---------------------------------------------------------------------------

const screenFiles = readdirSync(SCREEN_DIR).sort();
const ruleFiles = readdirSync(RULES_DIR).sort();
const sourceOf = (dir, file) => readFileSync(join(dir, file), "utf8");
/** Comments out, so a rule written in prose is not a use. */
const codeOf = (dir, file) =>
  sourceOf(dir, file).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const flat = (text) => text.replace(/\s+/g, " ");

describe("what an applicant reads", () => {
  test("the walk found the screens and the rules", () => {
    for (const file of ["SentScreen.tsx", "StatusPage.tsx", "Steps.tsx", "renderApplicationStatus.tsx", "status.module.css"]) {
      assert.ok(screenFiles.includes(file), `${file} is missing`);
    }
    for (const file of ["load.ts", "standing.ts", "view.ts"]) assert.ok(ruleFiles.includes(file), `${file} is missing`);
  });

  test("ap-sent, word for word", () => {
    const sent = flat(sourceOf(SCREEN_DIR, "SentScreen.tsx"));
    for (const words of [
      "Application sent.",
      "We’ll email you on <strong className={styles.together}>{decisionsLabel}</strong>.",
      "You can change your answers until <span className={styles.together}>{closesLabel}</span>.",
      "See your application",
      "Back to home",
    ]) {
      assert.ok(sent.includes(words), `missing: ${words}`);
    }
    assert.match(sent, /href=\{`\/applications\/\$\{encodeURIComponent\(roundId\)\}`\}/, "See your application goes to the page that keeps showing it");
  });

  test("ap-status, word for word", () => {
    const page = flat(sourceOf(SCREEN_DIR, "StatusPage.tsx"));
    for (const words of [
      "Your application",
      "<Chip tone=\"ok\">Sent</Chip>",
      "Your order",
      "Facilitating",
      "<span>Change my answers</span>",
      "You can change them until <span className={styles.together}>{view.closesLabel}</span>.",
    ]) {
      assert.ok(page.includes(words), `missing: ${words}`);
    }
    // The three steps are said as well as drawn.
    const steps = flat(sourceOf(SCREEN_DIR, "Steps.tsx"));
    assert.match(steps, /const SAID: Record<StepState, string> = \{ done: "done", now: "now", next: "next" \};/);
    assert.match(steps, /aria-current=\{step\.state === "now" \? "step" : undefined\}/);
    // "Change my answers" goes back into the form, and is only offered while it can be used.
    assert.match(page, /const applyHref = `\/apply\/\$\{encodeURIComponent\(roundId\)\}`;/);
    assert.match(page, /\{view\.canChange \? \( <div className=\{styles\.actions\} data-gap="tight"> <Link href=\{applyHref\} className=\{styles\.secondary\}>/);
  });

  test("never one of the committee's words for a decision", () => {
    const files = [
      ...screenFiles.filter((name) => /\.tsx?$/.test(name)).map((name) => [SCREEN_DIR, name]),
      ...ruleFiles.filter((name) => /\.ts$/.test(name)).map((name) => [RULES_DIR, name]),
    ];
    assert.ok(files.length >= 6);
    for (const [dir, file] of files) {
      // The one place the code COMPARES an account's role to the site's own
      // value for a refused account is a value it reads, never a word shown.
      const lower = codeOf(dir, file).replace(/role === "rejected"/g, "").toLowerCase();
      for (const word of words.WORDS_APPLICANTS_NEVER_SEE) {
        assert.equal(lower.includes(word), false, `${file} uses "${word}"`);
      }
      assert.equal(/\bpooled\b/.test(lower), false, `${file} uses the committee's word for somebody nothing took`);
    }
  });

  test("no long dashes anywhere in these files", () => {
    // Built from their code points, so this file does not carry one itself.
    const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    const testsDir = dirname(fileURLToPath(import.meta.url));
    const paths = [
      ...screenFiles.map((file) => join(SCREEN_DIR, file)),
      ...ruleFiles.map((file) => join(RULES_DIR, file)),
      join(REPO_ROOT, "src", "app", "api", "admissions", "forms", "[roundId]", "application", "reply", "route.ts"),
      // Every suite of this lane, this one included.
      ...readdirSync(testsDir)
        .filter((file) => /^applications-wave-f-.*\.test\.mjs$/.test(file))
        .map((file) => join(testsDir, file)),
    ];
    assert.ok(paths.length >= 12, "the walk did not find the lane's files");
    for (const path of paths) {
      assert.equal(LONG_DASH.test(readFileSync(path, "utf8")), false, `${path} carries an en or em dash`);
    }
  });

  test("the form hands over to the sent screen, and no longer says it for itself", () => {
    const form = sourceOf(join(REPO_ROOT, "src", "features", "applications", "apply"), "ApplicationForm.tsx");
    assert.match(form, /if \(justSent\) \{\s+return \(\s+<SentScreen/);
    assert.equal(form.includes("Application sent."), false);
  });
});

// ---------------------------------------------------------------------------
// 6. The older page, and the files
// ---------------------------------------------------------------------------

describe("the older page hands an application form to this screen in one place", () => {
  const page = codeOf(join(REPO_ROOT, "src", "app", "(public)", "applications", "[roundId]"), "page.tsx");

  test("one call, after the signed-out visitor has been sent to sign in and before anything of the older page's is read", () => {
    assert.equal((page.match(/renderApplicationStatus\(/g) ?? []).length, 1);
    const call = page.indexOf("renderApplicationStatus(");
    const signIn = page.indexOf("redirect(`/login?next=");
    const olderRead = page.indexOf("loadStatusRowForRound(");
    assert.ok(signIn !== -1 && olderRead !== -1);
    assert.ok(signIn < call && call < olderRead, "the call is not between the sign-in redirect and the older read");
    assert.match(page, /const formStatus = await renderApplicationStatus\(\{ roundId, user \}\);\s+if \(formStatus\) return formStatus;/);
  });

  test("this screen answers a round it has nothing to say about with null, never a not-found of its own", () => {
    for (const file of screenFiles.filter((name) => /\.tsx$/.test(name))) {
      const code = codeOf(SCREEN_DIR, file);
      assert.equal(/\bnotFound\(|\bredirect\(|next\/navigation"\s*;[^]*\bnotFound\b/.test(code), false, `${file} answers with a not-found or a redirect`);
    }
    const entry = codeOf(SCREEN_DIR, "renderApplicationStatus.tsx");
    assert.match(entry, /if \(!loaded\) return null;/);
    assert.match(entry, /if \(!\(await formIsThere\(db, roundId, now\)\)\) return null;/);
    // A refused account is told so before anything of its own is read.
    assert.ok(entry.indexOf('user.role === "rejected"') < entry.indexOf("loadStatus("));
  });

  test("the read goes through the applicant-safe half of the data layer", () => {
    for (const file of ruleFiles) {
      const code = codeOf(RULES_DIR, file);
      assert.equal(/staffRepo|admissionDecisions|admissionReviews/.test(code), false, `${file} names the committee's side`);
    }
    assert.match(codeOf(RULES_DIR, "load.ts"), /from "\.\.\/repo";/);
  });
});

function topLevelBlocks(css) {
  const blocks = [];
  let depth = 0;
  let start = 0;
  let preludeStart = 0;
  for (let i = 0; i < css.length; i += 1) {
    if (css[i] === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        blocks.push({ prelude: css.slice(preludeStart, start).trim(), body: css.slice(start + 1, i) });
        preludeStart = i + 1;
      }
    }
  }
  return blocks;
}

describe("the stylesheet keeps the house mobile rules", () => {
  const css = sourceOf(SCREEN_DIR, "status.module.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = topLevelBlocks(css);
  const media = blocks.filter((block) => block.prelude.startsWith("@media"));

  test("it ends on its 48rem adapt block, with no custom property in a media condition", () => {
    assert.ok(media.length > 0, "no media block at all");
    assert.ok(media.at(-1).prelude.replace(/\s+/g, " ").includes("max-width: 48rem"), `ends on "${media.at(-1).prelude}"`);
    assert.equal(blocks.at(-1), media.at(-1), "something follows the adapt block");
    for (const block of media) assert.equal(block.prelude.includes("var("), false, block.prelude);
  });

  test("no width over 20rem outside a media block, and never break-word", () => {
    for (const block of blocks) {
      assert.equal(/overflow-wrap\s*:\s*break-word/.test(block.body), false, `${block.prelude} uses break-word`);
      if (block.prelude.startsWith("@")) continue;
      for (const declaration of block.body.split(";")) {
        const colon = declaration.indexOf(":");
        if (colon === -1) continue;
        const property = declaration.slice(0, colon).trim().toLowerCase();
        const value = declaration.slice(colon + 1).trim();
        if (!["width", "min-width", "flex-basis"].includes(property)) continue;
        const rem = /^([\d.]+)rem$/.exec(value);
        const px = /^([\d.]+)px$/.exec(value);
        if (rem) assert.ok(Number(rem[1]) <= 20, `${block.prelude} sets ${property}: ${value}`);
        if (px) assert.ok(Number(px[1]) <= 320, `${block.prelude} sets ${property}: ${value}`);
      }
    }
  });

  test("everything a finger presses declares at least 44px in its own rule", () => {
    const floors = { secondary: 52, outline: 52, primary: 52, outlineSmall: 44, quiet: 44, back: 44 };
    for (const [name, least] of Object.entries(floors)) {
      const rules = blocks.filter((block) => new RegExp(`\\.${name}(?![\\w-])`).test(block.prelude));
      const heights = rules
        .map((block) => /min-height:\s*([\d.]+)(px|rem)/.exec(block.body))
        .filter(Boolean)
        .map((found) => Number(found[1]) * (found[2] === "rem" ? 16 : 1));
      assert.ok(heights.length > 0, `.${name} declares no min-height`);
      assert.ok(Math.min(...heights) >= least, `.${name} declares ${Math.min(...heights)}px`);
    }
  });

  test("a button resets the browser's own look and takes its colours from a class", () => {
    for (const name of ["secondary", "outline", "outlineSmall", "quiet"]) {
      const rule = blocks.find((block) => new RegExp(`\\.${name}(?![\\w-])`).test(block.prelude) && /appearance:\s*none/.test(block.body));
      assert.ok(rule, `.${name} does not reset appearance`);
      assert.match(rule.body, /-webkit-appearance:\s*none/);
    }
  });
});

describe("the components keep to the house rules", () => {
  const components = screenFiles.filter((file) => file.endsWith(".tsx"));

  test("no test ids, no raw select, no framework image, internal links through the framework", () => {
    for (const file of components) {
      const code = codeOf(SCREEN_DIR, file);
      assert.equal(/data-testid/.test(code), false, `${file} carries a test id`);
      assert.equal(/<select\b/.test(code), false, `${file} uses a raw <select>`);
      assert.equal(/next\/image/.test(code), false, `${file} imports next/image`);
      assert.equal(/<a\s[^>]*href=["{`]\/(?!\/)/.test(code), false, `${file} links inside the site with a plain anchor`);
    }
  });

  test("a client file imports nothing that only runs on the server", () => {
    for (const file of components.filter((name) => sourceOf(SCREEN_DIR, name).startsWith('"use client"'))) {
      const code = codeOf(SCREEN_DIR, file);
      assert.equal(/server-only|firebase-admin|@\/lib\/firebase\/|\/load"|\/record"|renderApplicationStatus/.test(code), false, `${file} reaches a server module`);
      for (const found of code.matchAll(/import\s+(type\s+)?[^;]*?from\s+"(@\/lib\/[^"]+)"/g)) {
        if (found[1]) continue;
        assert.ok(
          ["@/lib/applications/status/view"].includes(found[2]),
          `${file} imports ${found[2]} by value: say here why that module is safe in a browser`,
        );
      }
    }
  });
});
