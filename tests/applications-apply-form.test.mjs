/**
 * What the form says, and the rules its files keep.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * Three things are held here.
 *
 *  1. THE WORDS ARE WORKED OUT, NOT TYPED PER TERM. The name of each step, the
 *     times on an availability block, the total ("Free 14 hours across 5
 *     days"), the lines on the last step and the typed route into the grid
 *     are all pure functions in `src/features/applications/apply/`. They are
 *     run here against the sample term the boards were drawn from, and have
 *     to produce the boards' own words.
 *  2. COPY. An applicant never reads the words the committee keeps to itself
 *     (`WORDS_APPLICANTS_NEVER_SEE`), the form says in words who reads an
 *     application and says nothing about names, and it does not show the
 *     older notice, which says names are hidden. Every file in the form's
 *     folder is read, so a new step is held to the same rule the day it is
 *     added.
 *  3. THE STYLESHEETS keep the house mobile rules, and the components keep to
 *     real controls: the shared Select, no test ids, no framework image.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FORM_DIR = join(REPO_ROOT, "src", "features", "applications", "apply");
const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const at = (file) => join("features", "applications", "apply", file);

const steps = await loadTs(at("steps.ts"));
const text = await loadTs(at("availabilityText.ts"));
const check = await loadTs(at("checkText.ts"));
const shape = await loadTs(join("lib", "applications", "applicant", "shape.ts"));
const sections = await loadTs(join("lib", "applications", "sections.ts"));
const validate = await loadTs(join("lib", "applications", "validate.ts"));
const words = await loadTs(join("lib", "applications", "words.ts"));
const policies = await loadTs(join("lib", "legal", "policies.ts"));
const roundWindow = await loadTs(join("lib", "admissions", "window.ts"));
const model = await loadTs(join("features", "admissions", "availabilityModel.ts"));

// ---------------------------------------------------------------------------
// The sample term, as an applicant is sent it
// ---------------------------------------------------------------------------

const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INCUBATOR = "research-incubator";
const GRID = { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 };

const programme = (id, kind, shortName, closed = false) => ({
  id,
  kind,
  name: shortName,
  shortName,
  pitch: "",
  facts: "6 WEEKS · ~5 HRS A WEEK",
  starts: "w/c 26 Oct",
  closed,
});

const FORM = {
  id: "autumn-2026__k3f9a2b1",
  label: "Autumn 2026",
  windowState: "open",
  opensLabel: "Tue 6 Oct",
  closesLabel: "Sun 18 Oct, 23:59",
  decisionsLabel: "Fri 23 Oct",
  programmes: [
    programme(TAIS, "fellowship", "Technical AI Safety"),
    programme(AGI, "fellowship", "AGI Strategy"),
    programme(INCUBATOR, "incubator", "Research incubator"),
  ],
  questionSetIds: ["fellowships", TAIS, AGI, "incubator", "incubator-technical", "facilitator"],
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
  { id: "fellowships", role: "general", scope: { type: "kind", kind: "fellowship" }, label: "Fellowships", questions: [q("why"), q("read")] },
  { id: TAIS, role: "stream", scope: { type: "programme", programmeId: TAIS }, label: "Technical AI Safety", questions: [q("python", "scale", { options: ["Never tried", "Can follow it", "Write it often"] }), q("built")] },
  { id: AGI, role: "stream", scope: { type: "programme", programmeId: AGI }, label: "AGI Strategy", questions: [q("event")] },
  { id: "incubator", role: "general", scope: { type: "kind", kind: "incubator" }, label: "Research incubator", questions: [q("project")] },
  { id: "incubator-technical", role: "stream", scope: { type: "programme", programmeId: INCUBATOR }, label: "Technical stream", questions: [q("areas", "multi", { options: ["Interpretability", "Evals"] })] },
  { id: "facilitator", role: "facilitator", scope: { type: "facilitating" }, label: "Facilitator questions", questions: [q("led"), q("which", "choice", { optionsFromRanking: true }), q("training", "choice", { options: ["Yes", "No"] })] },
];

const shapeForm = shape.formShapeOf(FORM);
const shapeSets = shape.questionSetsOf(FORM, SETS);
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
const content = (overrides = {}) => ({
  aboutYou: ABOUT,
  rankedProgrammeIds: [AGI, TAIS],
  wantsToFacilitate: true,
  answers: {},
  availability: { ...GRID, days: [] },
  suMembership: null,
  ...overrides,
});
const labelsFor = (each) =>
  sections.stepsFor(shapeForm, shapeSets, each).map((step, index, all) =>
    steps.progressLine(index, all.length, steps.stepLabel(step, shapeSets)),
  );

// ---------------------------------------------------------------------------
// 1. The words
// ---------------------------------------------------------------------------

describe("the steps are named the way the boards name them", () => {
  test("Amara's ten steps", () => {
    assert.deepEqual(labelsFor(content()), [
      "Step 1 of 10 · About you",
      "Step 2 of 10 · Choose",
      "Step 3 of 10 · Rank",
      "Step 4 of 10 · Facilitating",
      "Step 5 of 10 · Fellowship questions",
      "Step 6 of 10 · AGI Strategy questions",
      "Step 7 of 10 · Technical AI Safety questions",
      "Step 8 of 10 · Facilitator questions",
      "Step 9 of 10 · Availability",
      "Step 10 of 10 · Check and send",
    ]);
  });

  test("Oliver, who ticked only the incubator and said no to facilitating", () => {
    assert.deepEqual(labelsFor(content({ rankedProgrammeIds: [INCUBATOR], wantsToFacilitate: false })), [
      "Step 1 of 7 · About you",
      "Step 2 of 7 · Choose",
      "Step 3 of 7 · Facilitating",
      "Step 4 of 7 · Incubator questions",
      "Step 5 of 7 · Technical stream questions",
      "Step 6 of 7 · Availability",
      "Step 7 of 7 · Check and send",
    ]);
  });

  test("the headings over each step", () => {
    const all = sections.stepsFor(shapeForm, shapeSets, content({ rankedProgrammeIds: [AGI, TAIS, INCUBATOR] }));
    assert.deepEqual(
      all.map((step) => steps.stepHeading(step, shapeSets)),
      [
        "About you",
        "What would you like to do?",
        "Put them in order",
        "Would you like to facilitate a group?",
        "Fellowships",
        "AGI Strategy",
        "Technical AI Safety",
        "Research incubator",
        "Technical stream",
        "Facilitating",
        "When are you free?",
        "Check and send",
      ],
    );
  });

  test("the words of each Change link on the last step", () => {
    assert.deepEqual(
      shapeSets.map((set) => `Change your ${steps.setChangeLabel(set)}`),
      [
        "Change your fellowship answers",
        "Change your Technical AI Safety answers",
        "Change your AGI Strategy answers",
        "Change your incubator answers",
        "Change your Technical stream answers",
        "Change your facilitator answers",
      ],
    );
  });

  test("a set already called '... questions' is not called '... questions questions'", () => {
    const set = { id: "x", role: "stream", scope: { type: "programme", programmeId: AGI }, label: "Extra questions" };
    assert.equal(steps.setStepLabel(set), "Extra questions");
  });

  test("the chip beside a set's heading", () => {
    const chipOf = (id, programmes = FORM.programmes) => steps.setChip(shapeSets.find((set) => set.id === id), programmes);
    assert.deepEqual(chipOf("fellowships"), { text: "For both fellowships", tone: "accent" });
    assert.deepEqual(chipOf("incubator-technical"), { text: "This term’s stream", tone: "neutral" });
    assert.equal(chipOf(AGI), null);
    assert.equal(chipOf("incubator"), null);
    assert.equal(chipOf("facilitator"), null);
    // One fellowship open: there is no "both" to speak of.
    assert.equal(chipOf("fellowships", [programme(AGI, "fellowship", "AGI Strategy")]), null);
    assert.equal(chipOf("fellowships", [programme(AGI, "fellowship", "A"), programme(TAIS, "fellowship", "B", true)]), null);
  });

  test("only something shaped like a step id is taken from an address", () => {
    for (const good of ["about", "choose", "rank", "facilitating", "availability", "check", "set:fellowships", `set:${AGI}`]) {
      assert.equal(steps.isStepId(good), true, good);
    }
    for (const bad of ["", "set:", "set:a.b", "set:a/b", "About", "check ", "<script>", "set:<b>", 7, null, undefined, ["about"]]) {
      assert.equal(steps.isStepId(bad), false, String(bad));
    }
  });

  test("where somebody coming back lands", () => {
    const all = sections.stepsFor(shapeForm, shapeSets, content());
    const land = (issues, state) => all[steps.landingStepIndex(all, issues, state)].id;
    const none = [];
    assert.equal(land(none, { started: false, sent: false, hasAvailability: false }), "about", "a new application starts at the start");
    assert.equal(land(none, { started: true, sent: true, hasAvailability: false }), "check", "one already sent opens on the last step");
    assert.equal(land([{ step: "set:fellowships" }, { step: "check" }], { started: true, sent: false, hasAvailability: true }), "set:fellowships");
    assert.equal(land([{ step: "check" }], { started: true, sent: false, hasAvailability: false }), "availability", "an empty grid still wants a visit");
    assert.equal(land([{ step: "check" }], { started: true, sent: false, hasAvailability: true }), "check");
    assert.equal(land(none, { started: true, sent: false, hasAvailability: true }), "check");
  });
});

describe("availability, in words", () => {
  /** Amara's week as the boards draw it, as stored columns (Sunday first). */
  const blank = () => model.emptyColumns(GRID);
  const paint = (columns, day, from, to) => model.setRange(columns, day, (from - 540) / 15, (to - 540) / 15 - 1, true);
  let amara = blank();
  for (const day of [1, 2, 4]) amara = paint(amara, day, 18 * 60, 21 * 60);
  amara = paint(amara, 3, 10 * 60, 12 * 60);
  amara = paint(amara, 6, 10 * 60, 13 * 60);

  test("a clock time in the house style", () => {
    assert.deepEqual(
      [540, 600, 720, 750, 780, 1080, 1170, 1260, 0, 45].map(text.clockLabel),
      ["9am", "10am", "12pm", "12:30pm", "1pm", "6pm", "7:30pm", "9pm", "12am", "12:45am"],
    );
  });

  test("a painted run is one block with its times", () => {
    const runs = text.runsOf(amara[3]);
    assert.deepEqual(runs, [{ from: 4, to: 12 }]);
    assert.equal(text.runLabel(runs[0], GRID), "10am to 12pm");
    assert.deepEqual(text.runsOf([true, true, false, true]), [{ from: 0, to: 2 }, { from: 3, to: 4 }]);
    assert.deepEqual(text.runsOf(undefined), []);
  });

  test("the total, the day buttons and the nothing-yet case", () => {
    assert.deepEqual(text.totalFree(amara, GRID), { hours: "14 hours", days: "5 days" });
    assert.equal(text.totalFree(blank(), GRID), null);
    assert.deepEqual(text.totalFree(paint(blank(), 1, 600, 660), GRID), { hours: "1 hour", days: "1 day" });
    assert.deepEqual(text.totalFree(paint(blank(), 1, 600, 705), GRID), { hours: "1 hour 45 minutes", days: "1 day" });
    assert.equal(text.dayChipLabel(amara, 1, GRID), "Monday, 3 hours free");
    assert.equal(text.dayChipLabel(amara, 3, GRID), "Wednesday, 2 hours free");
    assert.equal(text.dayChipLabel(amara, 5, GRID), "Friday, no time painted");
  });

  test("the lines on the last step group the days that share their times", () => {
    const withEvening = paint(amara, 3, 18 * 60, 19 * 60 + 30);
    assert.deepEqual(text.summaryLines(withEvening, GRID), [
      "Mon, Tue and Thu, 6pm to 9pm",
      "Wed, 10am to 12pm and 6pm to 7:30pm",
      "Sat, 10am to 1pm",
    ]);
    assert.deepEqual(text.summaryLines(blank(), GRID), []);
    assert.equal(text.joinList(["a"]), "a");
    assert.equal(text.joinList(["a", "b"]), "a and b");
    assert.equal(text.joinList(["a", "b", "c"]), "a, b and c");
  });

  test("copying a day to every weekday leaves the weekend alone", () => {
    const copied = text.copyToWeekdays(amara, 3);
    for (const day of [1, 2, 3, 4, 5]) assert.deepEqual(copied[day], amara[3]);
    assert.deepEqual(copied[6], amara[6]);
    assert.deepEqual(copied[0], amara[0]);
    assert.notEqual(copied[1], copied[2], "each weekday gets its own copy");
  });

  test("a typed time is read the way people type one", () => {
    const read = (typed, after = null) => text.parseTypedTime(typed, GRID, after);
    for (const [typed, minutes] of [
      ["6pm", 1080],
      ["6 pm", 1080],
      ["6:30pm", 1110],
      ["6.30 pm", 1110],
      ["6 p.m.", 1080],
      ["18:00", 1080],
      ["1830", 1110],
      ["9am", 540],
      ["12pm", 720],
      ["12am", 0],
      ["6", 1080],
      ["9", 540],
      ["12", 720],
    ]) {
      assert.equal(read(typed), minutes, typed);
    }
    assert.equal(read("9", 1080), 1260, "9 as the end of a run that starts at 6pm is 9pm");
    for (const junk of ["", "soon", "25", "6:75pm", "13pm", "6pm to 9pm", "6-9", "x".repeat(40)]) {
      assert.equal(read(junk), null, junk);
    }
  });

  test("a typed run becomes whole slots, brought inward, or a sentence saying why not", () => {
    assert.deepEqual(text.typedRun("6pm", "9pm", GRID), { ok: true, from: 36, to: 48 });
    assert.deepEqual(text.typedRun("6", "9", GRID), { ok: true, from: 36, to: 48 });
    assert.deepEqual(text.typedRun("6:20pm", "7:10pm", GRID), { ok: true, from: 38, to: 40 }, "6:30pm to 7pm: never more than was offered");
    for (const [from, to, error] of [
      ["soon", "9pm", "We could not read the start time. Type a time between 9am and 9pm, like 6pm or 18:30."],
      ["6pm", "later", "We could not read the end time. Type a time between 9am and 9pm, like 6pm or 18:30."],
      ["7am", "9am", "Times run from 9am to 9pm."],
      ["6pm", "10pm", "Times run from 9am to 9pm."],
      ["6pm", "5pm", "The end time has to be after the start time."],
      ["6:05pm", "6:10pm", "That is less than 15 minutes. Times are kept in quarter hours."],
    ]) {
      assert.deepEqual(text.typedRun(from, to, GRID), { ok: false, error }, `${from} to ${to}`);
    }
  });

  test("painting and clearing a run round-trip through the stored mask", () => {
    const painted = text.paintRun(blank(), 5, { from: 36, to: 48 });
    assert.deepEqual(text.runsOf(painted[5]), [{ from: 36, to: 48 }]);
    const mask = model.columnsToMask(painted, GRID);
    assert.equal(mask.days[5], "000000000fff");
    assert.deepEqual(model.maskToColumns(mask, GRID), painted);
    assert.deepEqual(text.clearRun(painted, 5, { from: 36, to: 48 }), blank());
  });
});

describe("the lines on the last step", () => {
  test("About you", () => {
    assert.equal(check.aboutHeadline(ABOUT), "Amara · BA Philosophy");
    assert.equal(check.aboutDetail(ABOUT), "Undergraduate, graduating July 2028");
    assert.equal(check.aboutDetail({ ...ABOUT, status: "employee" }), "Employee at the university");
    assert.equal(check.aboutDetail({ ...ABOUT, status: "other", statusOther: "Visiting researcher" }), "Visiting researcher");
    assert.equal(check.aboutDetail({ ...ABOUT, status: "constructor" }), "Graduating July 2028".replace("Graduating July 2028", ""), "an unknown status is no status");
    assert.equal(check.aboutHeadline({ ...ABOUT, preferredName: "", subject: "" }), "");
    assert.equal(check.monthYearLabel("2028-07"), "July 2028");
    assert.equal(check.monthYearLabel("2028-13"), "");
    assert.equal(check.monthYearLabel("soon"), "");
  });

  test("the graduation list runs from this year, and keeps a date already chosen", () => {
    const years = check.graduationOptions(2026, "");
    assert.equal(years[0].year, 2026);
    assert.equal(years.at(-1).year, 2034);
    assert.deepEqual(years[2].months[6], { value: "2028-07", label: "July 2028" });
    assert.equal(check.graduationOptions(2026, "2024-07")[0].year, 2024);
  });

  test("one line of the person's own answers, in the order they were asked", () => {
    const tais = shapeSets.find((set) => set.id === TAIS);
    const optionsOf = (id) => tais.questions.find((question) => question.id === id).options;
    const answered = { answers: { [TAIS]: { python: 1, built: "My second-year logic module.\n  I liked it" } } };
    assert.equal(check.answersPreview(tais, answered, optionsOf), "Can follow it. My second-year logic module. I liked it.");
    assert.equal(check.answersPreview(tais, { answers: {} }, optionsOf), "");
    const hostile = { answers: JSON.parse('{"__proto__":{"python":2}}') };
    assert.equal(check.answersPreview(tais, hostile, optionsOf), "");
  });
});

describe("what is on the screen against what was sent", () => {
  test("the same content is the same, and each kind of change is seen", () => {
    const base = content({ answers: { [AGI]: { event: "Open weights.", tags: ["a", "b"], point: 1 } }, availability: { ...GRID, days: ["0", "f"] } });
    const copy = JSON.parse(JSON.stringify(base));
    assert.equal(shape.sameContent(base, copy), true);
    for (const change of [
      (c) => (c.aboutYou.preferredName = "Amy"),
      (c) => c.rankedProgrammeIds.reverse(),
      (c) => (c.wantsToFacilitate = false),
      (c) => (c.suMembership = "yes"),
      (c) => (c.answers[AGI].event = "Something else."),
      (c) => c.answers[AGI].tags.push("c"),
      (c) => (c.answers[AGI].point = 2),
      (c) => (c.answers[TAIS] = { built: "new" }),
      (c) => (c.availability.days[1] = "0"),
    ]) {
      const changed = JSON.parse(JSON.stringify(base));
      change(changed);
      assert.equal(shape.sameContent(base, changed), false, change.toString());
    }
  });

  test("an answer to a set that no longer applies is not a change once both sides are what a send would keep", () => {
    const sent = validate.contentForSend(shapeForm, shapeSets, content({ rankedProgrammeIds: [AGI], wantsToFacilitate: false, answers: { [AGI]: { event: "x" } } }));
    const draft = content({ rankedProgrammeIds: [AGI], wantsToFacilitate: false, answers: { [AGI]: { event: "x" }, [TAIS]: { built: "left behind" } } });
    assert.equal(shape.sameContent(validate.contentForSend(shapeForm, shapeSets, draft), sent), true);
  });
});

// ---------------------------------------------------------------------------
// 2. Copy
// ---------------------------------------------------------------------------

const formFiles = readdirSync(FORM_DIR).sort();
const sourceOf = (file) => readFileSync(join(FORM_DIR, file), "utf8");
/** Comments out, so a rule written in prose is not a use. */
const codeOf = (file) => sourceOf(file).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("what an applicant reads", () => {
  test("the walk found the form", () => {
    assert.ok(formFiles.filter((file) => file.endsWith(".tsx")).length >= 10, "the form's components were not found");
    assert.ok(formFiles.filter((file) => file.endsWith(".module.css")).length >= 4);
  });

  test("never one of the committee's words for a decision", () => {
    for (const file of formFiles.filter((name) => /\.tsx?$/.test(name))) {
      // Comments out, and the one place the code COMPARES an account's role to
      // the site's own value for a refused account. That is a value the code
      // reads, never a word on the screen; the screen says "can’t apply".
      const lower = codeOf(file).replace(/role === "rejected"/g, "").toLowerCase();
      for (const word of words.WORDS_APPLICANTS_NEVER_SEE) {
        assert.equal(lower.includes(word), false, `${file} uses "${word}"`);
      }
      assert.equal(/\bpooled\b|\bpool\b/.test(lower), false, `${file} names the pool, which is the committee's word`);
    }
  });

  test("no long dashes anywhere in the lane", () => {
    const lane = [
      ...formFiles.map((file) => join(FORM_DIR, file)),
      ...readdirSync(join(REPO_ROOT, "src", "lib", "applications", "applicant")).map((file) => join(REPO_ROOT, "src", "lib", "applications", "applicant", file)),
      join(REPO_ROOT, "src", "app", "api", "admissions", "forms", "[roundId]", "application", "route.ts"),
      join(REPO_ROOT, "src", "app", "api", "admissions", "forms", "[roundId]", "application", "send", "route.ts"),
    ];
    for (const path of lane) {
      assert.equal(/[\u2013\u2014]/.test(readFileSync(path, "utf8")), false, `${path} carries an en or em dash`);
    }
  });

  test("the form says who reads an application, in one sentence, word for word", () => {
    const checkStep = sourceOf("CheckStep.tsx");
    assert.ok(
      checkStep.includes(
        "Your application is read by the lead and the reviewers of each programme you pick, and by NAISI\u2019s admins.",
      ),
    );
    assert.match(checkStep, /const PRIVACY_HREF = "\/privacy#courses";/);
    assert.ok(checkStep.includes("How we use your application"));
  });

  // The owner's decision of 7 October 2026. Somebody who already has an
  // account is asked to accept a new privacy policy only inside the member
  // area, which an applicant may never open before they apply. So the step
  // says, under who reads the application, that sending is agreeing to the
  // policy, and when it was last updated. THE DATE IS THE POLICY'S OWN: it is
  // read from the list the privacy page is drawn from and typed nowhere.
  test("sending is agreeing to the privacy policy: the line's words, its link, and the policy's own date", () => {
    const stored = policies.currentPolicy("privacy").lastUpdated;
    const line = check.privacyAgreement();
    assert.deepEqual(
      [line.before, line.link, line.href],
      ["By sending, you agree to our ", "privacy policy", "/privacy"],
    );
    assert.equal(line.href, policies.POLICIES.privacy.href, "the link is the policy's own address");
    const day = check.policyDateLabel(stored);
    assert.ok(day, `the policy's date, ${stored}, could not be read`);
    assert.equal(line.after, `, updated ${day}.`);
    assert.equal(`${line.before}${line.link}${line.after}`, `By sending, you agree to our privacy policy, updated ${day}.`);
  });

  test("change the policy's stored date and the line changes with it", async () => {
    const CASES = [
      ["7 October 2026", "By sending, you agree to our privacy policy, updated 7 Oct."],
      ["23 September 2026", "By sending, you agree to our privacy policy, updated 23 Sept."],
      ["1 January 2027", "By sending, you agree to our privacy policy, updated 1 Jan."],
    ];
    for (const [lastUpdated, sentence] of CASES) {
      // The same text module, with a policy list that carries another date.
      const { loadTs: loadWith } = createLoader({
        stubs: new Map([
          ["server-only", "export {};"],
          [
            "@/lib/legal/policies",
            `export const POLICIES = { privacy: { label: "Privacy Policy", href: "/privacy", versions: [{ version: 99, lastUpdated: ${JSON.stringify(lastUpdated)} }] } };\n` +
              "export function currentPolicy(key) { return POLICIES[key].versions[0]; }",
          ],
        ]),
      });
      const changed = (await loadWith(at("checkText.ts"))).privacyAgreement();
      assert.equal(`${changed.before}${changed.link}${changed.after}`, sentence, lastUpdated);
    }
    // And the real list was not what any of those read.
    assert.ok(policies.POLICIES.privacy.versions[0].version < 99);
  });

  test("the day is written the way the site's own formatter writes one, for every month", () => {
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    MONTHS.forEach((month, at) => {
      // "Thu 15 Oct" from the formatter the rest of the form's dates come from.
      const [, day, short] = roundWindow.formatRoundDate(new Date(Date.UTC(2026, at, 15, 12))).split(" ");
      assert.equal(check.policyDateLabel(`15 ${month} 2026`), `${day} ${short}`, month);
    });
    assert.equal(check.policyDateLabel("7 October 2026"), "7 Oct");
    assert.equal(check.policyDateLabel(" 7 october 2026 "), "7 Oct");
  });

  test("a date nobody can read is left out of the line, never guessed", async () => {
    for (const unreadable of ["", "October 2026", "2026-10-07", "7 Octember 2026", "0 October 2026", "32 October 2026", "7 Oct", "soon"]) {
      assert.equal(check.policyDateLabel(unreadable), null, unreadable);
    }
    const { loadTs: loadWith } = createLoader({
      stubs: new Map([
        ["server-only", "export {};"],
        [
          "@/lib/legal/policies",
          'export const POLICIES = { privacy: { href: "/privacy", versions: [{ version: 99, lastUpdated: "soon" }] } };\n' +
            "export function currentPolicy(key) { return POLICIES[key].versions[0]; }",
        ],
      ]),
    });
    const line = (await loadWith(at("checkText.ts"))).privacyAgreement();
    assert.equal(`${line.before}${line.link}${line.after}`, "By sending, you agree to our privacy policy.");
  });

  test("the step draws that line under who reads the application, with the policy as a link, and types no date", () => {
    const checkStep = sourceOf("CheckStep.tsx").replace(/\s+/g, " ");
    const readers = checkStep.indexOf("and by NAISI\u2019s admins.");
    const agreed = checkStep.indexOf("{agreement.before}");
    const howWeUse = checkStep.indexOf("How we use your application");
    assert.ok(readers > -1 && agreed > readers && howWeUse > agreed, "who reads it, then the agreement, then the board's own link");
    assert.ok(checkStep.includes("const agreement = privacyAgreement();"));
    assert.ok(
      checkStep.includes(
        "<p className={styles.readers}> {agreement.before} <Link href={agreement.href} className={form.inlineLink}> {agreement.link} </Link> {agreement.after} </p>",
      ),
    );
    // No date is typed on the step or in the text it is drawn from: the only
    // month names there are the lists every date is written from.
    const TYPED_DATE = /\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\b(?! \d{4}")/;
    assert.equal(TYPED_DATE.test(codeOf("CheckStep.tsx")), false, "CheckStep.tsx types a date");
    assert.equal(TYPED_DATE.test(codeOf("checkText.ts")), false, "checkText.ts types a date");
    assert.match(codeOf("checkText.ts"), /policyDateLabel\(currentPolicy\("privacy"\)\.lastUpdated\)/);
    assert.match(codeOf("checkText.ts"), /import \{ POLICIES, currentPolicy \} from "@\/lib\/legal\/policies";/);
  });

  // The owner's decision of 7 October 2026: the form says who reads an
  // application and does not mention that they see the person's name. Every
  // file in the form's folder is read, comments included, so the sentence
  // cannot come back on another step either.
  test("no step says anybody sees the applicant's name", () => {
    const SEES_A_NAME =
      /\b(see|sees|shown|show|read|reads)\b[^.\n]{0,60}\b(your|their|the applicant[\u2019']s)\s+name\b|\b(your|their)\s+name\b[^.\n]{0,60}\b(seen|shown|visible)\b/i;
    for (const file of formFiles.filter((name) => /\.tsx?$/.test(name))) {
      assert.equal(SEES_A_NAME.test(sourceOf(file)), false, `${file} says somebody sees the applicant's name`);
    }
    // The pattern is not vacuous: it catches the sentence the form used to carry.
    assert.equal(SEES_A_NAME.test("They see your name."), true);
    assert.equal(SEES_A_NAME.test("reviewers see the applicant\u2019s name"), true);
  });

  test("the older notice, which says names are hidden, is not shown by the new form", () => {
    for (const file of formFiles.filter((name) => /\.tsx?$/.test(name))) {
      assert.equal(/ApplicationPrivacyNotice/.test(codeOf(file)), false, `${file} renders the older privacy notice`);
      assert.equal(/without your name/i.test(sourceOf(file)), false, file);
    }
  });

  test("the boards' fixed sentences are in the form word for word", () => {
    const all = formFiles.filter((name) => name.endsWith(".tsx")).map(sourceOf).join("\n").replace(/\s+/g, " ");
    for (const sentence of [
      "From your account. Change anything that’s out of date.",
      "Programmes you’re interested in",
      "You’ll get a place on one at most, and we start from your 1st choice.",
      "We train you and give you the resources. You don’t need any experience.",
      "Add times by typing instead",
      "Copy to every weekday",
      "Clear this day",
      "Do you have SU membership?",
      "We’d like everyone who takes part to get SU membership (£6 a year). It won’t affect your application.",
      "Get it on the SU site",
      "Finish later",
      "Send application",
      // ap-1-about-new, the first step for somebody with no account.
      "You don’t have an account yet, so this step is your join request too. You can keep applying while the committee checks it. If you get a place, that approves your account.",
      "We’ll email you a link to check it’s yours.",
      "This site is protected by reCAPTCHA. Google’s",
    ]) {
      assert.ok(all.includes(sentence), `missing: ${sentence}`);
    }
    assert.match(all, /Tick any that interest you\.\{openCount > 1 \? " You’ll put them in order next\." : ""\}/);
    assert.match(all, /We’ll ask you \{moreQuestions\} more \{moreQuestions === 1 \? "question" : "questions"\}\./);
  });

  test("somebody with no join request is drawn the first step, and nothing else of the form", () => {
    // The first step asks the join request's questions, and for somebody with
    // no join request it IS their join request (`JoinStep.tsx`). An
    // application cannot be saved for them yet, so no programme and no
    // question of it is read for them: each branch that draws the step hands
    // it the form's id, its name, the two dates an open form shows and
    // whether there is a session (and, for one, whether the address carries
    // the mark of a return from an emailed link), and nothing else.
    const screen = codeOf("ApplyScreen.tsx");
    const signedOutBranch = screen.slice(screen.indexOf("if (!user) {"), screen.indexOf('if (user.role === "rejected")'));
    assert.ok(signedOutBranch.includes("<JoinStep"), "the signed-out branch was not found");
    assert.equal(
      /<ApplicationForm\b|<AboutStep\b|loadApplicantView|\bsets\b|\.programmes\b/.test(signedOutBranch),
      false,
      "a signed-out visitor is drawn, or handed, part of the form",
    );
    const drawn = [...screen.matchAll(/<JoinStep\s([\s\S]*?)\/>/g)].map((match) => match[1].replace(/\s+/g, " ").trim());
    assert.deepEqual(drawn, [
      "roundId={form.id} label={form.label} closesLabel={form.closesLabel} decisionsLabel={form.decisionsLabel} signedIn={false} signedInAs={null} fromLink={false}",
      "roundId={view.form.id} label={view.form.label} closesLabel={view.form.closesLabel} decisionsLabel={view.form.decisionsLabel} signedIn signedInAs={user.email ?? null} fromLink={fromJoinLink}",
    ]);
    // The second is an account with no join request. That is asked of the
    // account's document: a session reads a missing document as an account
    // that is waiting, so the role cannot say.
    assert.match(screen, /if \(!view\.joined && view\.form\.windowState === "open"\) \{/);
    // The step takes those seven things and no others.
    const step = codeOf("JoinStep.tsx");
    const from = step.indexOf("type Props = {");
    const props = step.slice(from, step.indexOf("\n};", from));
    assert.deepEqual(
      [...props.matchAll(/^\s{2}(\w+)\??:/gm)].map((match) => match[1]),
      ["roundId", "label", "closesLabel", "decisionsLabel", "signedIn", "signedInAs", "fromLink"],
    );
    assert.equal(formFiles.includes("JoinFirst.tsx"), false, "the panel that sent visitors away to join is back");
    assert.equal(formFiles.includes("SignedOutAbout.tsx"), false);
  });

  test("the ways out of the join step carry this form's address and nothing else", async () => {
    const step = codeOf("JoinStep.tsx");
    assert.match(step, /const formUrl = `\/apply\/\$\{encodeURIComponent\(roundId\)\}`;/);
    assert.match(step, /const signInHref = `\/login\?next=\$\{encodeURIComponent\(formUrl\)\}`;/);
    // Every place the step sends anybody: home, the society's address and the
    // two policies the reCAPTCHA line has to link. Its second half adds one:
    // the sign-in page, with this form as the place to come back to.
    const hrefs = (file) => (codeOf(file).match(/href=(?:"[^"]*"|\{[^}]*\})/g) ?? []).sort();
    assert.deepEqual(hrefs("JoinStep.tsx"), [
      'href="/"',
      'href="https://policies.google.com/privacy"',
      'href="https://policies.google.com/terms"',
      'href="mailto:ai-safety@uonsu.com"',
    ]);
    assert.deepEqual([...new Set(hrefs("JoinAccount.tsx"))], ["href={signInHref}"]);
    assert.match(step, /<JoinAccount\s+signInHref=\{signInHref\}/);
    // Nothing on the step leads to the register page: the step is where
    // somebody joins.
    for (const file of ["JoinStep.tsx", "JoinAccount.tsx"]) {
      assert.equal(/\/register\b(?!\/resend)/.test(codeOf(file)), false, `${file} sends somebody to the register page`);
    }
    // The address is one the registration flow hands people back to. If the
    // form ever moves, or that list is narrowed, a visitor would finish
    // signing in and be left somewhere else.
    const { safeFunnelReturn } = await loadTs(join("lib", "authReturn.ts"));
    assert.equal(safeFunnelReturn(`/apply/${FORM.id}`), `/apply/${FORM.id}`);
  });

  test("the step says it is a join request, and that is true of the file that says it", () => {
    const step = sourceOf("JoinStep.tsx").replace(/\s+/g, " ");
    for (const sentence of [
      "Step 1 · About you",
      "About you",
      "You don’t have an account yet, so this step is your join request too. You can keep applying while the committee checks it. If you get a place, that approves your account.",
      "This site is protected by reCAPTCHA. Google’s",
      "Privacy Policy",
      "Terms of Service",
      "Continue",
    ]) {
      assert.ok(step.includes(sentence), `missing: ${sentence}`);
    }
    assert.ok(sourceOf("AboutStep.tsx").includes("We’ll email you a link to check it’s yours."));
    assert.ok(sourceOf("JoinAccount.tsx").replace(/\s+/g, " ").includes("Already have an account?"));

    // A file may say a step is a join request only if it sends one, and may
    // say the page is protected by reCAPTCHA only if the check is on it.
    for (const file of formFiles.filter((name) => /\.tsx?$/.test(name))) {
      const said = codeOf(file).replace(/\s+/g, " ").toLowerCase();
      if (/this step is your join request/.test(said)) {
        assert.equal(file, "JoinStep.tsx", `${file} says a step is a join request`);
        assert.match(codeOf(file), /await completeRegistration\(joinRequestFrom\(answers\)\)/);
      }
      if (/protected by recaptcha/.test(said)) {
        assert.equal(file, "JoinStep.tsx", `${file} says the page runs a check`);
        assert.match(codeOf(file), /RECAPTCHA_ENABLED && !signedIn \? /);
      }
    }
    assert.match(codeOf("JoinAccount.tsx"), /\{RECAPTCHA_ENABLED \? <RecaptchaInvisible ref=\{recaptcha\} \/> : null\}/);

    // Nothing here says Saved: until the join request has gone there is no
    // application to save into.
    for (const file of ["JoinStep.tsx", "JoinAccount.tsx"]) {
      assert.equal(/\bSaved\b|SaveStatus/.test(codeOf(file)), false, `${file} says something is saved`);
    }
    // And no exclamation marks in what a visitor reads.
    for (const file of ["JoinStep.tsx", "JoinAccount.tsx", "UniversityCheck.tsx"]) {
      assert.equal(/[A-Za-z.’]!(?!=)/.test(codeOf(file)), false, `${file} has an exclamation mark`);
    }
  });

  test("a university address that is not checked is said on About you and on the last step, with the link again", () => {
    const form = codeOf("ApplicationForm.tsx");
    // The form asks the same rule the send route applies.
    assert.match(form, /required: mustVerifyBeforeSending\(pending \? "pending" : "member"\) && !viewingAs,/);
    assert.match(form, /check: check\.held \? <UniversityCheckNote check=\{check\} \/> : null,/);
    assert.match(form, /hold=\{check\.held \? <UniversityCheckHold check=\{check\} noticeRef=\{holdRef\} \/> : null\}/);
    // A press of Send asks the server again before it gives up, and never
    // sends while the hold stands.
    const send = form.slice(form.indexOf("async function send()"), form.indexOf("const back = index > 0"));
    assert.ok(send.indexOf("if (check.held) {") !== -1);
    assert.ok(send.indexOf("await check.refresh()") < send.indexOf("await sendApplication(form.id)"));
    assert.match(send, /if \(!verified\) \{[\s\S]*?return;\s*\}/);
    const notices = sourceOf("UniversityCheck.tsx").replace(/\s+/g, " ");
    for (const sentence of [
      "Check your university email before you send.",
      "Open it, then come back to this page and send.",
      "Not checked yet. We emailed a link to this address: open it to check it’s yours.",
      "Send the link again",
    ]) {
      assert.ok(notices.includes(sentence), `missing: ${sentence}`);
    }
    // The last step draws the hold first, above everything else on it.
    const checkStep = codeOf("CheckStep.tsx");
    assert.match(checkStep, /<div className=\{form\.body\}>\s*\{hold\}/);
  });
});

// ---------------------------------------------------------------------------
// 3. The files
// ---------------------------------------------------------------------------

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

describe("the form's stylesheets keep the house mobile rules", () => {
  const sheets = formFiles.filter((file) => file.endsWith(".module.css"));

  for (const file of sheets) {
    const blocks = topLevelBlocks(sourceOf(file).replace(/\/\*[\s\S]*?\*\//g, ""));
    const media = blocks.filter((block) => block.prelude.startsWith("@media"));

    test(`${file} ends on its 48rem adapt block`, () => {
      assert.ok(media.length > 0, "no media block at all");
      assert.ok(media.at(-1).prelude.replace(/\s+/g, " ").includes("max-width: 48rem"), `ends on "${media.at(-1).prelude}"`);
    });

    test(`${file} puts no custom property in a media condition`, () => {
      for (const block of media) assert.equal(block.prelude.includes("var("), false, block.prelude);
    });

    test(`${file} fixes no width over 20rem outside a media block, and never wraps with break-word`, () => {
      for (const block of blocks) {
        assert.equal(/overflow-wrap\s*:\s*break-word/.test(block.body), false, `${block.prelude} uses break-word`);
        if (block.prelude.startsWith("@")) continue;
        for (const declaration of block.body.split(";")) {
          const colon = declaration.indexOf(":");
          if (colon === -1) continue;
          const property = declaration.slice(0, colon).trim().toLowerCase();
          const value = declaration.slice(colon + 1).trim();
          const rems = [];
          if (["width", "min-width", "flex-basis"].includes(property)) {
            const match = /^([\d.]+)rem$/.exec(value);
            if (match) rems.push(Number(match[1]));
          }
          if (property === "flex") {
            const match = /(?:^|\s)([\d.]+)rem(?:\s|$)/.exec(value);
            if (match) rems.push(Number(match[1]));
          }
          if (property === "grid-template-columns") {
            for (const match of value.matchAll(/minmax\(\s*([\d.]+)rem/g)) rems.push(Number(match[1]));
          }
          for (const rem of rems) assert.ok(rem <= 20, `${block.prelude} sets ${property}: ${value}`);
        }
      }
    });
  }

  test("every control a finger presses declares the 44px floor in its own rule", () => {
    const expected = {
      "form.module.css": ["sectionLink", "input", "twoOption", "chipOption", "textLink", "quietLink", "secondary", "iconButton", "finishLater"],
      "rank.module.css": ["handle", "move"],
      "check.module.css": ["change"],
      "availability.module.css": ["typedAdd", "remove"],
      "join.module.css": ["leave", "asideLink", "resendLink", "resend", "google"],
    };
    for (const [file, classes] of Object.entries(expected)) {
      const css = sourceOf(file).replace(/\/\*[\s\S]*?\*\//g, "");
      for (const name of classes) {
        const rule = new RegExp(`\\.${name}(?:,[^{]*)?\\s*\\{[^}]*min-height:\\s*2\\.75rem`);
        const grouped = new RegExp(`\\.${name}\\b[^{]*\\{[^}]*min-height:\\s*2\\.75rem`);
        assert.ok(rule.test(css) || grouped.test(css), `${file}: .${name} does not declare min-height: 2.75rem`);
      }
    }
  });
});

describe("the components keep to real controls", () => {
  const components = formFiles.filter((file) => file.endsWith(".tsx"));

  test("no test ids, no raw select, no framework image", () => {
    for (const file of components) {
      const code = codeOf(file);
      assert.equal(/data-testid/.test(code), false, `${file} carries a test id`);
      assert.equal(/<select\b/.test(code), false, `${file} uses a raw <select>; use the shared Select`);
      assert.equal(/next\/image/.test(code), false, `${file} imports next/image`);
    }
  });

  test("every drag has a route that is not a drag", () => {
    const rank = codeOf("RankStep.tsx");
    assert.match(rank, /aria-label=\{`Move \$\{programme\.shortName\} up`\}/);
    assert.match(rank, /aria-label=\{`Move \$\{programme\.shortName\} down`\}/);
    assert.match(rank, /KeyboardSensor/);
    const when = codeOf("AvailabilityStep.tsx");
    assert.ok(when.includes("Add times by typing instead"));
    assert.match(when, /typedRun\(fromText, toText, grid\)/);
    assert.match(when, /event\.key === "Delete" \|\| event\.key === "Backspace"/);
  });

  test("a client file in the form imports nothing that only runs on the server", () => {
    for (const file of components.filter((name) => sourceOf(name).startsWith('"use client"'))) {
      const code = codeOf(file);
      assert.equal(/applicant\/(store|project|requests)"/.test(code.replace(/import type[^;]*;/g, "")), false, `${file} imports a server module by value`);
      assert.equal(/firebase-admin|server-only/.test(code), false, file);
    }
  });
});
