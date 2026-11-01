/**
 * THE WEEK REVIEW (privacy v15, "AI-assisted review"), driven through its real
 * page and routes on AGI Strategy's run in its third week.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is `tests/lib/facilitatorWeekWorld.mjs` (week 3 written as
 * blocks, its parts "Start with what you think", "Two keepers' views" and
 * "What would change your mind?"; Group A on Thursdays with Sofia, Group B on
 * Tuesdays with Rahul and Sofia, Group C on Wednesdays with Tom, Group D on
 * Mondays with Grace; Claudia leads the programme, Lloyd reviews it, Yusuf is
 * the run's track lead, Zach is an admin). On top of it:
 *
 *  - WHO HOLDS A PLACE, from the form: Amara, Bea, Dev and Tariq. Dev is
 *    moved to Group B (Rahul and Sofia); the others stay in Group A (Sofia).
 *    Chloe, Farah and Kofi sit in Group B with no place on the form, so
 *    nothing of theirs is reviewed, though their names are still scrubbed.
 *  - A WRITTEN ANSWER in week 3, and answers to it from Amara (her week
 *    submitted on Wed 11 Nov), Dev and Bea, each first written on Tue 10 Nov.
 *    Reflections: Amara's first prompt first written on Tue 10 Nov, Dev's on
 *    Tue 3 Nov; the world's other reflections carry no first-written time
 *    and never count.
 *  - AGREEMENTS. Amara, Dev, Tariq and Sofia agreed to version 15 on Thu 5
 *    Nov, Rahul not until Wed 18 Nov; Bea only ever to version 14, so nothing
 *    of hers goes.
 *  - CHECK-INS for week 3: Group A's (Amara and Bea answered) and Group B's
 *    (Dev, Chloe and Farah answered). Dev's comment names Claudia and Amara
 *    and types an address.
 *  - REPORTS for week 3: Sofia's on Group A (Amara engaged, Tariq had not
 *    done the readings, Bea might need a hand), and Rahul's on Group B, sent
 *    before his own moment, so it never goes (Dev might need a hand).
 *  - THE REGISTER the world already holds: Tariq absent at Group A's last two
 *    sessions without saying, Bea excused once.
 *
 * THE CLOCK is Wed 18 Nov 2026 at 10am unless a test says: Groups A, D and B
 * have met for week 3, Group C meets at 1pm.
 *
 * Claude is a stub that records each request and answers what a test says;
 * the mail door and the push mirror record and send nothing. Every name,
 * address and word is made up.
 *
 * What is held, by section:
 *  1. The three messages: labels for people and groups, a name typed into
 *     anybody's words swapped out (the people running the programme too), no
 *     address, check-ins pooled by group and never beside a person label, no
 *     check-in in the hands request, and the version 15 moment for work,
 *     check-ins and every line a report writes about somebody.
 *  2. The checkers: what Claude says is held to what it was sent.
 *  3. The site's own facts for Might need a hand, never sent.
 *  4. The page: an admin's alone; the lead is told it is for admins, and
 *     nothing of the week is read for them; what would be sent, before any
 *     press; the review drawn back with names, sources and out-of-date
 *     answers left out.
 *  5. The press: every caller, view-as, no key, a page that saw something
 *     else, nothing to send, one part failing, one part asked again.
 *  6. The follow-up: one task for the group's facilitators, fixed words, the
 *     grid email, once a week.
 *  7. Deletion: an account's entries come out of the review, and a
 *     follow-up about them goes.
 */
import { after, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { CASCADE_FIRESTORE_STUB, makeCascadeDb } from "./lib/cascadeStore.mjs";
import { makeFacilitatorPagesWorld } from "./lib/facilitatorPagesWorld.mjs";
import { A, AGI, B, NOW, ROUND, RUN, SAID, facilitatorWeekSeed, reflection } from "./lib/facilitatorWeekWorld.mjs";
import { applicationPath } from "./lib/handoverWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });
after(() => mock.timers.reset());

const CLAUDE_STUB = `
export const CLAUDE_MODEL = "claude-opus-5-5";
export function claudeConfigured() { return globalThis.__wrClaudeKey !== false; }
export async function askClaudeForJson(input) {
  globalThis.__wrClaudeAsked.push(input);
  return globalThis.__wrClaudeAnswer(input);
}`;
const PUSH_STUB = "export async function mirrorTaskEmailToPush(uid, note) { globalThis.__wr.pushes.push({ uid, ...note }); }";

const w = await makeFacilitatorPagesWorld("__wr", [
  ["@/lib/ai/claude", CLAUDE_STUB],
  ["@/lib/push/taskNotifications", PUSH_STUB],
]);
const PROGRAMME_API = ["admissions", "forms", "[roundId]", "programmes", "[programmeId]", "weeks", "[weekId]", "review"];
const routes = {
  review: await w.loadTs(join("app", "api", ...PROGRAMME_API, "route.ts")),
  followUp: await w.loadTs(join("app", "api", ...PROGRAMME_API, "follow-up", "route.ts")),
};
const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const reviewPage = (await w.loadTs(join(TABS, "weeks", "[weekId]", "review", "page.tsx"))).default;
const weeksTabPage = (await w.loadTs(join(TABS, "weeks", "page.tsx"))).default;
const input = await w.loadTs(join("lib", "courses", "weekReview", "input.ts"));
const check = await w.loadTs(join("lib", "courses", "weekReview", "check.ts"));
const facts = await w.loadTs(join("lib", "courses", "weekReview", "facts.ts"));
const claude = await w.loadTs(join("lib", "courses", "weekReview", "claude.ts"));
const words = await w.loadTs(join("lib", "courses", "weekReview", "words.ts"));
const record = await w.loadTs(join("lib", "firestore", "courseWeekReviews.ts"));
const checkInTemplate = await w.loadTs(join("lib", "surveys", "checkIns", "template.ts"));

const V13 = new Date("2026-11-01T09:00:00Z");
const V15 = new Date("2026-11-05T09:00:00Z");
const WRITTEN = new Date("2026-11-10T09:00:00Z");
const EARLY = new Date("2026-11-03T09:00:00Z");
/** Wed 18 Nov at 10am: Groups A, D and B have met for week 3. */
const WEDNESDAY = "2026-11-18T10:00:00Z";
const params = { roundId: ROUND, programmeId: AGI, weekId: "w03" };
const PATH = (...parts) => `courseExerciseResponses/${RUN.agi}__${parts.join("__")}`;

const ANSWERS = {
  amara: "Claudia was right that the keepers need the town. Dev Patel disagrees; write to amara.okafor@example.com.",
  dev: "Split it by tonnage. Rahul's point about the bell, and Chloe Nguyen's, settled it for me.",
  bea: "I am not sure who should pay. The reading lost me.",
};
const CHECK_IN_SAID = {
  dev: { most: "Claudia's story about the fog bell", better: "Ask Amara Okafor at amara@example.com to lead the debate next time" },
  chloe: { most: "Arguing about who pays for the oil", better: "" },
  farah: { most: "Nothing much at all", better: "Fewer slides" },
  amara: { most: "The diary extract", better: "Less time on the outcomes" },
  bea: { most: "Nothing much", better: "The reading was far too long for one week" },
};

/** Week 3 as the world writes it, with a written answer in a fourth part. */
function weekThree(seed) {
  const week = seed[`courseRuns/${RUN.agi}/weeks/w03`];
  const prompt = [{ type: "p", runs: [{ text: "Who should keep the lamps lit, and why?" }] }];
  return {
    ...week,
    blocks: [
      ...week.blocks,
      {
        id: "k3-p4",
        type: "part",
        title: "Your keeper's plan",
        time: "About 30 minutes",
        framing: [],
        blocks: [{ id: "k3-wa", type: "writtenAnswer", prompt, boxes: [], guidance: [], words: null, due: "dayBefore" }],
      },
    ],
  };
}

function writtenAnswer(uid, text, firstWrittenAt) {
  return {
    runId: RUN.agi,
    uid,
    weekId: "w03",
    weekNumber: 3,
    exerciseId: "k3-wa",
    responseType: "text",
    text,
    words: text.split(/\s+/).length,
    submittedAt: null,
    reviewStatus: "unreviewed",
    firstWrittenAt,
    updatedAt: firstWrittenAt,
  };
}

function checkInSurvey(id, groupId, groupName, startsAt) {
  const starts = new Date(startsAt);
  const ends = new Date(starts.getTime() + 2 * 60 * 60 * 1000);
  return {
    kind: "checkIn",
    name: `AGI Strategy: check-in, ${groupName}, week 3`,
    title: "How was week 3?",
    intro: "",
    items: checkInTemplate.checkInItems({
      parts: [
        { id: "k3-p1", title: "Start with what you think" },
        { id: "k3-p2", title: "Two keepers' views" },
        { id: "k3-p3", title: "What would change your mind?" },
      ],
      hasReading: true,
    }),
    audience: { kind: "checkIn", roundId: ROUND, programmeId: AGI, groupId, sessionKey: "w03", weekNumber: 3 },
    programmeName: "AGI Strategy",
    programmeKind: "fellowship",
    runId: RUN.agi,
    checkIn: { groupName, startsAt: starts, endsAt: ends },
    closesAt: new Date(ends.getTime() + 3 * 60 * 60 * 1000),
    firstSentAt: starts,
    presses: [{ id: "p1", kind: "first", at: starts, count: 3 }],
    createdAt: starts,
  };
}

function checkInAnswer(surveyId, uid, sentAt, said) {
  const answers = {
    q_ci_useful: { type: "rating", value: 4 },
    q_ci_most: { type: "text", text: said.most },
    q_ci_unclear: { type: "choices", optionIds: ["k3-p2"] },
    q_ci_reading: { type: "choice", optionId: "o_ci_read_some" },
    q_ci_confident: { type: "rating", value: 3 },
  };
  if (said.better) answers.q_ci_better = { type: "text", text: said.better };
  return {
    surveyId,
    roundId: ROUND,
    respondent: { kind: "account", uid },
    answers,
    fills: [],
    sentAt: new Date(sentAt),
    via: "link",
    afterFirstSession: true,
  };
}

function report(groupId, writerUid, at, answers) {
  return {
    runId: RUN.agi,
    groupId,
    sessionKey: "w03",
    weekNumber: 3,
    occurrence: 1,
    writerUid,
    answers: {
      how: 4,
      wentWell: "",
      didnt: "",
      unclear: [],
      engaged: [],
      notRead: [],
      needsHand: [],
      forLead: "",
      ...answers,
    },
    parts: [
      { id: "k3-p1", title: "Start with what you think" },
      { id: "k3-p2", title: "Two keepers' views" },
    ],
    sentAt: new Date(at),
    updatedAt: new Date(at),
  };
}

/** The world for every test here, with `over` laid on top. */
function seed(over = {}) {
  const s = facilitatorWeekSeed();
  s[`courseRuns/${RUN.agi}/weeks/w03`] = weekThree(s);
  const agree = (uid, at = V15) => {
    s[`users/${uid}`] = { ...s[`users/${uid}`], courseworkUseAgreedAt: V13, policyVersion: "terms.1+privacy.15", policyAgreedAt: at };
  };
  for (const uid of ["amara", "dev", "tariq", "sofia"]) agree(uid);
  agree("rahul", new Date("2026-11-18T00:00:00Z"));
  s["users/bea"] = { ...s["users/bea"], courseworkUseAgreedAt: V13, policyVersion: "terms.1+privacy.14", policyAgreedAt: V13 };
  // Dev reads Group B's week.
  s[`courseEnrolments/${RUN.agi}__dev`] = { ...s[`courseEnrolments/${RUN.agi}__dev`], groupId: B };

  for (const uid of ["amara", "dev", "bea"]) s[PATH(uid, "w03", "k3-wa")] = writtenAnswer(uid, ANSWERS[uid], WRITTEN);
  s[`courseWeekWork/${RUN.agi}__amara__w03`] = {
    runId: RUN.agi,
    uid: "amara",
    weekId: "w03",
    weekNumber: 3,
    submittedAt: new Date("2026-11-11T20:00:00Z"),
    firstSubmittedAt: new Date("2026-11-11T20:00:00Z"),
    submitCount: 1,
    updatedAt: new Date("2026-11-11T20:00:00Z"),
  };
  s[PATH("amara", "w03", "k3-rp1")] = { ...reflection("amara", "k3-rp1", SAID.amara["k3-rp1"]), firstWrittenAt: WRITTEN };
  s[PATH("dev", "w03", "k3-rp1")] = { ...reflection("dev", "k3-rp1", "About thirty, I would guess."), firstWrittenAt: EARLY };

  s["surveys/ci-a3"] = checkInSurvey("ci-a3", A, "Group A", "2026-11-12T18:00:00Z");
  s["surveys/ci-b3"] = checkInSurvey("ci-b3", B, "Group B", "2026-11-17T18:00:00Z");
  for (const uid of ["amara", "bea"]) s[`surveyAnswers/ci-a3__${uid}`] = checkInAnswer("ci-a3", uid, "2026-11-12T20:30:00Z", CHECK_IN_SAID[uid]);
  for (const uid of ["dev", "chloe", "farah"]) s[`surveyAnswers/ci-b3__${uid}`] = checkInAnswer("ci-b3", uid, "2026-11-17T20:30:00Z", CHECK_IN_SAID[uid]);

  s[`courseSessionReports/${RUN.agi}__${A}__w03__sofia`] = report(A, "sofia", "2026-11-12T21:00:00Z", {
    wentWell: "Amara Okafor asked the best question about the bell.",
    didnt: "Bea Lindqvist seemed lost, and Claudia's intro ran over.",
    unclear: ["k3-p2", "something-else"],
    engaged: [{ uid: "amara", note: "Strong on the bell" }],
    notRead: ["tariq"],
    needsHand: [{ uid: "bea", note: "Quiet all session" }],
    forLead: "Zach, the reading is long for one week.",
  });
  s[`courseSessionReports/${RUN.agi}__${B}__w03__rahul`] = report(B, "rahul", "2026-11-17T21:00:00Z", {
    wentWell: "Dev Patel led the debate.",
    needsHand: [{ uid: "dev", note: "Not seen for two weeks" }],
  });
  return { ...s, ...over };
}

/** Start again from the seed at Wednesday 10am, with `over` beside it. */
function reset(over = {}, when = WEDNESDAY) {
  w.reset(seed(over));
  w.at(when);
  w.world.pushes = [];
  globalThis.__wrClaudeKey = true;
  globalThis.__wrClaudeAsked = [];
  globalThis.__wrClaudeAnswer = () => ({ ok: false, reason: "No answer set." });
}

/** One request to a real handler as `who`. */
async function ask(who, handler, body, { viewAs = false, ctx = params } = {}) {
  w.world.user = who === null ? null : w.sessionOf(who);
  w.world.viewAs = viewAs;
  const init = { method: "POST", headers: { "Content-Type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  try {
    const response = await handler.POST(new Request("https://naisi.invalid/api", init), { params: Promise.resolve(ctx) });
    return { status: response.status, body: structuredClone(response.body) };
  } finally {
    w.world.viewAs = false;
  }
}

/** The review page as `who`. */
const page = (who, searchParams = {}) => w.draw(reviewPage, who, params, searchParams);

/** The hash the admin's page hands the press. */
async function seenNow() {
  const drawn = await page("zach");
  const presses = findProps(drawn.element, "ReviewPress");
  assert.ok(presses.length > 0, `no press on the page:\n${drawn.text}`);
  return presses[0].seen;
}

/** Every element below `element` whose component is called `name`, by its props. */
function findProps(element, name, out = []) {
  if (!element || typeof element !== "object") return out;
  if (Array.isArray(element)) {
    for (const child of element) findProps(child, name, out);
    return out;
  }
  if (typeof element.type === "function" && element.type.name === name) out.push(element.props);
  if (typeof element.type === "function" && !["ReviewPress", "FollowUpButton", "PangramWeek"].includes(element.type.name)) {
    try {
      findProps(element.type(element.props), name, out);
    } catch {
      // A component that needs a hook runs only in a browser.
    }
  }
  const children = element.props?.children;
  if (children !== undefined) findProps(children, name, out);
  return out;
}

/** What Claude answers each of the three requests, by which one it is. */
function answering({ grades, themes, hands }) {
  return (asked) => {
    if (asked.system === claude.WEEK_REVIEW_SYSTEMS.grades) return grades ?? { ok: false, reason: "No grades set." };
    if (asked.system === claude.WEEK_REVIEW_SYSTEMS.themes) return themes ?? { ok: false, reason: "No themes set." };
    return hands ?? { ok: false, reason: "No hands set." };
  };
}
const ok = (value) => ({ ok: true, value, model: "claude-opus-5-5", usage: { inputTokens: 1, outputTokens: 1 } });

/** Every message that went, by request. */
const asked = () => {
  const out = {};
  for (const each of globalThis.__wrClaudeAsked) {
    const which = Object.entries(claude.WEEK_REVIEW_SYSTEMS).find(([, system]) => system === each.system)?.[0];
    out[which] = each.message;
  }
  return out;
};

/** Everything a message must never carry: every name part, every account id, every address. */
const NEVER = [
  /Amara|Okafor|Chloe|Nguyen|Farah|Hussain|Kofi|Asante|Dev\b|Patel|Tariq|Mensah|Bea\b|Lindqvist/,
  /Claudia|Rahul|Sofia|Grace|Okoye|Zach|Levin|Yusuf|Lloyd|Tom\b/,
  /\bamara\b|\bchloe\b|\bfarah\b|\bkofi\b|\bdev\b|\brahul\b|\bsofia\b|\bzach\b|\bclaudia\b/,
  /@example\.com|@/,
  /Group [ABCD]\b/,
];
function assertClean(text, what) {
  for (const pattern of NEVER) assert.doesNotMatch(text, pattern, `${what} carries ${pattern}`);
}

// ---------------------------------------------------------------------------
// 1. The three messages
// ---------------------------------------------------------------------------

describe("1. what each of the three requests is sent", () => {
  test("no name, address, account id or group name, in any of the three; the people running the programme swapped out too", async () => {
    reset();
    globalThis.__wrClaudeAnswer = answering({ grades: ok({ grades: [] }), themes: ok({ themes: [] }), hands: ok({ hands: [] }) });
    const seen = await seenNow();
    const pressed = await ask("zach", routes.review, { seen });
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    const messages = asked();
    assert.deepEqual(Object.keys(messages).sort(), ["grades", "hands", "themes"]);
    for (const [which, message] of Object.entries(messages)) assertClean(message, `the ${which} request`);
    // Claudia leads the programme and Zach is an admin: each is "someone running the programme".
    assert.match(messages.grades, /someone running the programme was right/);
    assert.match(messages.themes, /someone running the programme's intro ran over/);
    assert.match(messages.grades, /\(an email address\)/);
  });

  test("draft grades: the written answers alone, each by an id, with no person and no group", async () => {
    reset();
    globalThis.__wrClaudeAnswer = answering({ grades: ok({ grades: [] }), themes: ok({ themes: [] }), hands: ok({ hands: [] }) });
    await ask("zach", routes.review, { seen: await seenNow() });
    const { grades } = asked();
    assert.doesNotMatch(grades, /Fellow \d|Group \d|check-in|Reflection/i);
    // Amara's and Dev's: Bea never agreed to version 15.
    assert.equal((grades.match(/^### A\d+$/gm) ?? []).length, 2);
    assert.ok(!grades.includes("not sure who should pay"), "Bea's answer went");
    // Chloe holds no place, and her name in Dev's answer is still swapped out.
    assert.match(grades, /and a fellow's, settled it/);
  });

  test("what people found hard: no label for any person anywhere, and the check-ins pooled by group", async () => {
    reset();
    globalThis.__wrClaudeAnswer = answering({ grades: ok({ grades: [] }), themes: ok({ themes: [] }), hands: ok({ hands: [] }) });
    await ask("zach", routes.review, { seen: await seenNow() });
    const { themes } = asked();
    assert.doesNotMatch(themes, /Fellow \d/, "a person's label reached the themes request");
    assert.match(themes, /## Check-ins, pooled by group/);
    // Dev's from Group B and Amara's from Group A: never Bea's (no version 15), nor
    // Chloe's or Farah's (no place on the programme).
    assert.equal((themes.match(/^C\d+\. /gm) ?? []).length, 2);
    assert.ok(!themes.includes("far too long for one week"), "Bea's check-in went");
    assert.ok(!themes.includes("Fewer slides"), "a check-in by somebody holding no place went");
    // Dev's comment, scrubbed: Claudia and Amara swapped out, the address gone.
    assert.match(themes, /Could have gone better: Ask a fellow at \(an email address\) to lead the debate next time/);
    // A report's words, never whom it picks.
    assert.match(themes, /### R1 · Group \d/);
    assert.doesNotMatch(themes, /Engaged well|Might need a hand|done the readings/);
    // Rahul's report was sent before he agreed to version 15.
    assert.equal((themes.match(/^### R\d+/gm) ?? []).length, 1);
    assert.ok(!themes.includes("led the debate"), "a report sent before its writer's moment went");
  });

  test("who might need a hand: fellows by label, the report's lines about somebody only from their moment, and never a check-in", async () => {
    reset();
    globalThis.__wrClaudeAnswer = answering({ grades: ok({ grades: [] }), themes: ok({ themes: [] }), hands: ok({ hands: [] }) });
    await ask("zach", routes.review, { seen: await seenNow() });
    const { hands } = asked();
    assert.doesNotMatch(hands, /check-in|C\d+\.|pooled/i, "the hands request carries a check-in");
    for (const said of Object.values(CHECK_IN_SAID)) {
      for (const text of [said.most, said.better].filter(Boolean)) assert.ok(!hands.includes(text.slice(0, 20)), `a check-in's words reached the hands request: ${text}`);
    }
    assert.match(hands, /### A\d+ · Fellow \d+ · Group \d+ · Q\d+/);
    // Amara engaged and Tariq had not done the readings: both agreed before the report.
    assert.match(hands, /Engaged well: Fellow 1 \(Strong on the bell\)/);
    assert.match(hands, /Seemed not to have done the readings: Fellow 3/);
    // Bea never agreed to version 15: her pick is gone, and her name in the report is nobody's label.
    assert.doesNotMatch(hands, /Might need a hand: /);
    assert.match(hands, /someone in the group seemed lost/);
    // Amara, Dev and Tariq agreed, in account order; Bea is nobody's label.
    assert.match(hands, /### A\d+ · Fellow 1 · Group 4 · Q7/);
    assert.match(hands, /### A\d+ · Fellow 2 · Group 2 · Q7/);
  });

  test("the builder on its own: a check-in is never beside a person label, and labels and groups come back as names", () => {
    const people = [
      { uid: "u-grace", name: "Grace Chen", role: "fellow" },
      { uid: "u-leo", name: "Leo Park", role: "fellow" },
      { uid: "u-rahul", name: "Rahul Shah", role: "facilitator" },
      { uid: "u-claudia", name: "Claudia Lead", role: "staff" },
    ];
    const built = input.reviewInputs({
      programme: "AGI Strategy",
      weekNumber: 3,
      weekTitle: "Power and incentives",
      questions: [{ key: "written:a1", kind: "written", text: "Who should pay?" }],
      parts: [{ id: "p1", title: "Compute" }],
      groupIds: ["g-c"],
      fellows: new Set(["u-grace", "u-leo"]),
      groupOf: new Map([["u-grace", "g-c"], ["u-leo", "g-c"]]),
      momentOf: new Map([["u-grace", V15], ["u-leo", V15], ["u-rahul", V15]]),
      work: [
        { rowId: "r1", uid: "u-grace", kind: "written", questionKey: "written:a1", text: "Leo Park and Claudia agree; grace.chen@example.com", counted: true, firstWrittenAt: WRITTEN },
        { rowId: "r2", uid: "u-leo", kind: "written", questionKey: "written:a1", text: "Grace said Rahul was right.", counted: true, firstWrittenAt: WRITTEN },
      ],
      checkIns: [{ groupId: "g-c", useful: 2, confident: 1, reading: "Some", unclear: ["p1"], most: "Grace Chen helped", better: "Claudia ran over" }],
      checkInsLeftOut: 0,
      reports: [],
      reportsLeftOut: 0,
      people,
    });
    const themes = built.themes.message;
    for (const line of themes.split("\n").filter((each) => /^C\d+\./.test(each))) {
      assert.doesNotMatch(line, /Fellow \d|u-|Grace|Claudia/, `a check-in sits beside a person: ${line}`);
    }
    assert.match(themes, /Most useful: a fellow helped/);
    assert.match(built.hands.message, /Fellow 2 and someone running the programme agree/);
    assert.equal(input.withNamesBack("Fellow 1 in Group 1, and Fellow 9.", { "Fellow 1": "Grace Chen" }, { "Group 1": "Group C" }), "Grace Chen in Group C, and a fellow.");
  });
});

// ---------------------------------------------------------------------------
// 2. The checkers
// ---------------------------------------------------------------------------

describe("2. what comes back is held to what was sent", () => {
  const items = new Map([
    ["A1", { uid: "u1", rowId: "r1", questionKey: "q", hash: "h1" }],
    ["A2", { uid: "u2", rowId: "r2", questionKey: "q", hash: "h2" }],
  ]);

  test("grades: whole numbers from 1 to 10, ids that were sent, one each", () => {
    const kept = check.readGrades(
      { grades: [{ answer: "A1", grade: 7 }, { answer: "A1", grade: 2 }, { answer: "A2", grade: 11 }, { answer: "A9", grade: 5 }, { answer: "A2", grade: 4.5 }] },
      { items },
    );
    assert.deepEqual(kept, [{ uid: "u1", rowId: "r1", questionKey: "q", grade: 7, hash: "h1" }]);
    assert.deepEqual(check.readGrades(null, { items }), []);
  });

  test("themes: only cited items that were sent, groups from what is cited, never a quotation of a check-in", () => {
    const sent = {
      answers: new Map([["A1", { uid: "u1", rowId: "r1", groupId: "g1" }]]),
      checkIns: new Map([["C1", "g2"], ["C2", "g2"]]),
      reports: new Map([["R1", "g3"]]),
      parts: new Map([["P1", "part-1"]]),
      groupLabels: { "Group 1": "g1", "Group 2": "g2", "Group 3": "g3" },
      checkInWords: ["the reading was far too long for one week of the course"],
    };
    const kept = check.readThemes(
      {
        themes: [
          { title: "Compute as a lever", part: "P1", answers: ["A1", "A7"], checkIns: ["C2"], reports: ["R1", "R9"], detail: "Several mixed up two arguments." },
          { title: "Nothing real", part: "", answers: ["A9"], checkIns: ["C9"], reports: [], detail: "" },
          { title: "Too much reading", part: "P7", answers: [], checkIns: ["C1"], reports: [], detail: "One said the reading was far too long for one week." },
        ],
      },
      sent,
    );
    assert.equal(kept.length, 2);
    assert.deepEqual(kept[0], {
      title: "Compute as a lever",
      partId: "part-1",
      groupIds: ["g1", "g2", "g3"],
      answers: [{ uid: "u1", rowId: "r1" }],
      checkIns: 1,
      reports: 1,
      detail: "Several mixed up two arguments.",
    });
    assert.equal(kept[1].partId, null);
    assert.equal(kept[1].detail, "", "a line quoting a check-in was kept");
  });

  test("hands: a label that was sent, their own answers or a report that names them, and never a check-in", () => {
    const sent = {
      labels: { "Fellow 1": "u1", "Fellow 2": "u2" },
      answers: new Map([["A1", "u1"], ["A2", "u2"]]),
      reports: new Map([["R1", "Might need a hand: Fellow 2 (quiet)"]]),
    };
    const kept = check.readHands(
      {
        hands: [
          { fellow: "Fellow 1", why: "Fellow 1 seems lost.", answers: ["A1"], reports: [] },
          { fellow: "Fellow 1", why: "Again.", answers: ["A1"], reports: [] },
          { fellow: "Fellow 2", why: "Their check-in says so.", answers: ["A2"], reports: [] },
          { fellow: "Fellow 2", why: "Quiet.", answers: [], reports: ["C3"] },
          { fellow: "Fellow 2", why: "Cites somebody else's answer.", answers: ["A1"], reports: [] },
          { fellow: "Fellow 9", why: "Never sent.", answers: ["A1"], reports: [] },
          { fellow: "Fellow 2", why: "The report says quiet.", answers: [], reports: ["R1"] },
        ],
      },
      sent,
    );
    assert.deepEqual(kept, [
      { uid: "u1", why: "Fellow 1 seems lost.", answers: 1, reports: 0 },
      { uid: "u2", why: "The report says quiet.", answers: 0, reports: 1 },
    ]);
  });

  test("every system prompt carries the fairness lines, and the three about check-ins where they bite", () => {
    for (const system of Object.values(claude.WEEK_REVIEW_SYSTEMS)) {
      assert.match(system, /Never mark anybody down for their English/);
      assert.match(system, /Never say or guess whether anything was written with AI/);
      assert.doesNotMatch(system, /[–—]/);
    }
    assert.match(claude.WEEK_REVIEW_SYSTEMS.themes, /Never quote a check-in/);
    assert.match(claude.WEEK_REVIEW_SYSTEMS.themes, /Never say or guess who wrote a check-in/);
    assert.match(claude.WEEK_REVIEW_SYSTEMS.hands, /only on the fellow's own answers and on what facilitators' reports say about them/);
    assert.doesNotMatch(claude.WEEK_REVIEW_SYSTEMS.hands, /check-in/i, "the hands request is told about check-ins");
  });
});

// ---------------------------------------------------------------------------
// 3. The site's own facts
// ---------------------------------------------------------------------------

describe("3. what the site already knows, never sent", () => {
  test("two absences in a row, a week not started or locked unsent, and a report's picks; nothing for somebody who is no fellow", () => {
    const found = facts.handFacts({
      weekNumber: 3,
      fellows: ["grace", "leo", "finn", "maya"],
      absentInARow: new Map([["finn", 2]]),
      weeks: new Map([
        ["grace", { started: false, state: "open", writes: true, groupMet: true }],
        ["leo", { started: true, state: "locked", writes: true, groupMet: true }],
        ["maya", { started: false, state: "open", writes: true, groupMet: false }],
      ]),
      reports: [{ needsHand: [{ uid: "grace", note: "Quiet" }, { uid: "rahul", note: "x" }], notRead: ["leo"] }],
    });
    assert.deepEqual(Object.fromEntries(found), {
      finn: [{ source: "register", text: "Missed the last 2 sessions without saying." }],
      grace: [
        { source: "week", text: "Week 3 not started when their group met." },
        { source: "report", text: "Might need a hand: “Quiet”" },
      ],
      leo: [
        { source: "week", text: "Week 3 not submitted before it locked." },
        { source: "report", text: "Hadn’t done the readings." },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// 4. The page
// ---------------------------------------------------------------------------

describe("4. the page: an admin's alone, saying what would be sent before any press", () => {
  test("an admin reads what would be sent, the groups that have met, and what is not included yet; nothing is sent or written", async () => {
    reset();
    const drawn = await page("zach");
    assert.equal(drawn.to, null);
    assert.equal(drawn.wrote, false, "drawing the review wrote something");
    assert.equal(globalThis.__wrClaudeAsked.length, 0, "drawing the review asked Claude");
    assert.match(drawn.text, /Week 3 review Admins only/);
    assert.match(drawn.text, /3 of 4 groups have met/);
    assert.match(drawn.text, /2 written answers · 1 reflection · 2 check-ins · 1 facilitator report/);
    // Bea's answer and check-in, Dev's early reflection, Amara's uncounted one and Rahul's report.
    assert.match(drawn.text, /5 not included yet: written before their writers agreed to version 15 of the privacy policy/);
    assert.match(drawn.text, /Review with Claude/);
    assert.match(drawn.text, /Check with Pangram/);
    // The site's own facts, with where each came from, before Claude is asked anything.
    assert.match(drawn.text, /Tariq Mensah · Group A Missed the last 2 sessions without saying\. · The register Week 3 not started when their group met\. · Their week Hadn’t done the readings\. · A facilitator’s report/);
    assert.match(drawn.text, /Dev Patel · Group B Week 3 not submitted before it locked\. · Their week Might need a hand: “Not seen for two weeks” · A facilitator’s report/);
    assert.match(drawn.text, /Bea Lindqvist · Group A Week 3 not submitted before it locked\. · Their week Might need a hand: “Quiet all session” · A facilitator’s report/);
    assert.ok(!/Bea Lindqvist · Group A Missed/.test(drawn.text), "an excused session counted as an absence");
    assert.ok(!/Amara Okafor · Group A/.test(drawn.text), "a submitted week was said not to be");
    // Somebody with no place on the programme is never a row.
    assert.ok(!/Chloe Nguyen|Farah Hussain/.test(drawn.text));
    // Never a check-in's words.
    for (const said of Object.values(CHECK_IN_SAID)) for (const text of [said.most, said.better].filter(Boolean)) assert.ok(!drawn.text.includes(text), `the page shows a check-in: ${text}`);
  });

  test("the programme's lead is told it is for admins, a reviewer that the tab is not theirs, and anybody else that there is no programme", async () => {
    reset();
    const lead = await page("claudia");
    assert.match(lead.text, /A week’s review is for admins/);
    assert.doesNotMatch(lead.text, /written answers|Tariq|Kofi|Review with Claude/);
    const reviewer = await page("lloyd");
    assert.doesNotMatch(reviewer.text, /Review with Claude|written answers/);
    for (const who of ["rahul", "chloe", "tess"]) {
      const drawn = await page(who);
      assert.doesNotMatch(drawn.text, /Review with Claude|written answers|Tariq/, `${who} reached the review`);
    }
  });

  test("before the week's first session, it says when it can be reviewed and draws nothing else", async () => {
    reset({}, "2026-11-11T10:00:00Z");
    const drawn = await page("zach");
    assert.match(drawn.text, /Week 3 can be reviewed once its first session has started/);
    assert.doesNotMatch(drawn.text, /Review with Claude|written answers/);
  });

  test("the Weeks tab offers Review for a week whose first session has started: to an admin a link, to the lead a word", async () => {
    reset();
    const admin = await w.draw(weeksTabPage, "zach", { roundId: ROUND, programmeId: AGI });
    assert.ok(admin.html.includes(`/weeks/w03/review"`), "no Review link for week 3");
    assert.ok(!admin.html.includes(`/weeks/w04/review"`), "a week not yet met offers its review");
    const lead = await w.draw(weeksTabPage, "claudia", { roundId: ROUND, programmeId: AGI });
    assert.ok(!lead.html.includes("/review\""), "the lead is offered the review");
    assert.match(lead.text, /Review: admins only/);
  });

  test("what came back is drawn with names, where each line came from, and an answer that changed since left out", async () => {
    reset();
    globalThis.__wrClaudeAnswer = (sent) => {
      if (sent.system === claude.WEEK_REVIEW_SYSTEMS.grades) {
        const ids = [...sent.message.matchAll(/^### (A\d+)$/gm)].map((m) => m[1]);
        return ok({ grades: ids.map((id, index) => ({ answer: id, grade: 9 - index * 3 })) });
      }
      if (sent.system === claude.WEEK_REVIEW_SYSTEMS.themes) {
        const group = /### R1 · (Group \d+)/.exec(sent.message)[1];
        const answer = /### (A\d+) · Q7 · Group 4/.exec(sent.message)[1];
        return ok({ themes: [{ title: `Who pays, in ${group}`, part: "P2", answers: [answer], checkIns: ["C1", "C2"], reports: ["R1"], detail: "Mixed up the two keepers." }] });
      }
      const fellow = /Engaged well: (Fellow \d+)/.exec(sent.message)[1];
      const answer = new RegExp(`### (A\\d+) · ${fellow} ·`).exec(sent.message)[1];
      return ok({ hands: [{ fellow, why: `${fellow} rushed the second part.`, answers: [answer], reports: ["R1"] }] });
    };
    const pressed = await ask("zach", routes.review, { seen: await seenNow() });
    assert.deepEqual(pressed.body, { asked: { grades: "ready", themes: "ready", hands: "ready" } });
    const stored = w.world.db.read(`courseWeekReviews/${RUN.agi}__w03`);
    assert.equal(stored.grades.items.length, 2);
    assert.deepEqual([...stored.uids].sort(), stored.uids);
    assert.ok(!JSON.stringify(stored).match(/Amara|Okafor|Dev Patel|Tariq|Mensah/), "a name was kept with what Claude said");

    let drawn = await page("zach");
    assert.match(drawn.text, /Drafted by Claude, Wed 18 Nov, 10am\. Kept until somebody asks again\./);
    assert.match(drawn.text, /Who pays, in Group A/);
    assert.match(drawn.text, /About Two keepers' views/);
    assert.match(drawn.text, /1 answer, 2 check-ins and 1 facilitator report, from Group B and Group A/);
    assert.match(drawn.text, /Amara Okafor · Group A Amara Okafor rushed the second part\. · Claude, from their answers and a facilitator’s report/);
    assert.match(drawn.text, /Read the strongest 2/);
    const strongest = await page("zach", { read: "strongest" });
    assert.match(strongest.text, /The strongest answers/);
    assert.match(strongest.html, /written\?week=3&amp;person=\w+&amp;group=/);

    // Dev changes his answer: his grade is out of date and leaves the chart.
    w.world.db.poke(PATH("dev", "w03", "k3-wa"), { text: "A new answer altogether, rewritten." });
    drawn = await page("zach");
    assert.match(drawn.text, /1 answer has changed since Claude graded it/);
    assert.match(drawn.text, /The week has changed since Claude read it/);

    // Amara gives her place back: everything about her is left out on reading.
    w.world.db.poke(applicationPath("amara"), { status: "withdrawn", withdrawnAt: new Date(WEDNESDAY) });
    drawn = await page("zach");
    assert.doesNotMatch(drawn.text, /Amara Okafor/);
  });
});

// ---------------------------------------------------------------------------
// 5. The press
// ---------------------------------------------------------------------------

describe("5. pressing Review with Claude", () => {
  test("only an admin, decided before anything is read; never in a view-as session", async () => {
    reset();
    const seen = "0".repeat(32);
    assert.equal((await ask(null, routes.review, { seen })).status, 401);
    for (const who of ["claudia", "lloyd", "rahul", "chloe", "yusuf", "tess"]) {
      const refused = await ask(who, routes.review, { seen });
      assert.equal(refused.status, 403, `${who}: ${JSON.stringify(refused.body)}`);
      assert.equal(refused.body.error, words.REVIEW_WORDS.onlyAdmins);
    }
    assert.equal((await ask("zach", routes.review, { seen }, { viewAs: true })).status, 403);
    assert.equal(globalThis.__wrClaudeAsked.length, 0);
  });

  test("a body that says nothing, a page that saw something else, no key, nothing to send, a week not yet met", async () => {
    reset();
    assert.equal((await ask("zach", routes.review, {})).status, 400);
    assert.equal((await ask("zach", routes.review, { seen: "0".repeat(32), part: "everything" })).status, 400);
    const moved = await ask("zach", routes.review, { seen: "0".repeat(32) });
    assert.equal(moved.status, 409);
    assert.equal(moved.body.error, words.REVIEW_WORDS.moved);
    const seen = await seenNow();
    globalThis.__wrClaudeKey = false;
    assert.deepEqual(await ask("zach", routes.review, { seen }), { status: 409, body: { error: words.REVIEW_WORDS.notSetUp } });
    reset({}, "2026-11-11T10:00:00Z");
    assert.equal((await ask("zach", routes.review, { seen })).status, 409);
    assert.equal(globalThis.__wrClaudeAsked.length, 0, "Claude was asked");
    assert.equal(w.world.db.read(`courseWeekReviews/${RUN.agi}__w03`), undefined);
  });

  test("a part that fails is kept as failed, with its reason, and the others are kept; one part can be asked for again", async () => {
    reset();
    globalThis.__wrClaudeAnswer = answering({ grades: { ok: false, reason: "Claude took too long to answer. Try again." }, themes: ok({ themes: [] }), hands: ok({ hands: [] }) });
    const seen = await seenNow();
    const pressed = await ask("zach", routes.review, { seen });
    assert.deepEqual(pressed.body, { asked: { grades: "failed", themes: "ready", hands: "ready" } });
    let drawn = await page("zach");
    assert.match(drawn.text, /This part didn’t come back: Claude took too long to answer\. Try again\./);
    globalThis.__wrClaudeAsked = [];
    globalThis.__wrClaudeAnswer = answering({ grades: ok({ grades: [{ answer: "A1", grade: 6 }] }) });
    const again = await ask("zach", routes.review, { seen: await seenNow(), part: "grades" });
    assert.deepEqual(again.body, { asked: { grades: "ready" } });
    assert.deepEqual(Object.keys(asked()), ["grades"]);
    const stored = w.world.db.read(`courseWeekReviews/${RUN.agi}__w03`);
    assert.equal(stored.grades.state, "ready");
    assert.equal(stored.themes.state, "ready", "asking for one part again lost another");
    drawn = await page("zach");
    assert.doesNotMatch(drawn.text, /didn’t come back/);
  });
});

// ---------------------------------------------------------------------------
// 6. The follow-up
// ---------------------------------------------------------------------------

describe("6. Ask the facilitators to have a word", () => {
  test("one task for the group's live facilitators, fixed words and no reason, the grid email, and once a week", async () => {
    reset();
    const drawn = await page("zach");
    const buttons = findProps(drawn.element, "FollowUpButton");
    const tariq = buttons.find((props) => props.uid === "tariq");
    assert.equal(tariq.label, "Ask Sofia to have a word with Tariq");
    const made = await ask("zach", routes.followUp, { uid: "tariq" });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    assert.deepEqual(Object.keys(made.body).sort(), ["emailed", "taskId"]);
    const task = w.world.db.read(`tasks/${made.body.taskId}`);
    assert.equal(task.source, "review-follow-up");
    assert.equal(task.visibility, "assignees-only");
    assert.deepEqual(task.completerUids, ["sofia"]);
    assert.equal(task.creatorUid, "zach");
    assert.deepEqual(task.sourceRef, { cohortId: RUN.agi, weekNumber: 3, groupId: A, aboutUid: "tariq" });
    assert.equal(task.title, "Have a word with Tariq Mensah (Group A)");
    assert.doesNotMatch(task.description, /absent|missed|report|Claude|check-in|register/i, "the task gives a reason");
    assert.ok(task.initialNotifyAt, "the task system would send its own email again");
    assert.equal(w.world.mail.length, 1);
    assert.equal(w.world.mail[0].kind, "task");
    // Asked again the same week: refused, and nothing more sent.
    const again = await ask("zach", routes.followUp, { uid: "tariq" });
    assert.equal(again.status, 409);
    assert.equal(w.world.mail.length, 1);
    assert.match((await page("zach")).text, /Asked /);
  });

  test("never about a facilitator or somebody holding no place; refused to everybody but an admin and in a view-as session", async () => {
    reset();
    assert.equal((await ask("zach", routes.followUp, { uid: "rahul" })).status, 404);
    assert.equal((await ask("zach", routes.followUp, { uid: "nobody" })).status, 404);
    assert.equal((await ask("zach", routes.followUp, {})).status, 400);
    for (const who of ["claudia", "sofia", "chloe"]) assert.equal((await ask(who, routes.followUp, { uid: "tariq" })).status, 403);
    assert.equal((await ask("zach", routes.followUp, { uid: "tariq" }, { viewAs: true })).status, 403);
    assert.equal(w.world.db.paths().filter((path) => path.startsWith("tasks/review-follow-up")).length, 0);
  });
});

// ---------------------------------------------------------------------------
// 7. Deletion
// ---------------------------------------------------------------------------

describe("7. an account's deletion takes it out of the review, and a follow-up about it goes", () => {
  const { loadTs } = createLoader({
    stubs: new Map([
      ["server-only", "export {};"],
      ["firebase-admin/firestore", CASCADE_FIRESTORE_STUB],
      ["next/server", "export class NextResponse { static json(body, init) { return { body, status: (init && init.status) || 200 }; } }"],
      ["@/lib/firebase/admin", "export function getAdminDb() { throw new Error('not used here'); }\nexport function getAdminStorage() { return null; }"],
      ["@/lib/firebase/session", "export async function getCurrentUser() { return null; }"],
      ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() { return null; }"],
    ]),
  });
  const auth = { async deleteUser() {}, async revokeRefreshTokens() {} };

  test("grades, a theme's answers, a hand and a label about the person go; everybody else's stay", async () => {
    const { deleteAccountCascade } = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
    const id = `${RUN.agi}__w03`;
    const db = makeCascadeDb({
      "users/farah": { uid: "farah", role: "member" },
      [`courseWeekReviews/${id}`]: {
        runId: RUN.agi,
        weekId: "w03",
        weekNumber: 3,
        grades: { state: "ready", items: [{ uid: "farah", rowId: "r1", grade: 7 }, { uid: "chloe", rowId: "r2", grade: 5 }] },
        themes: { state: "ready", list: [{ title: "T", answers: [{ uid: "farah", rowId: "r1" }, { uid: "chloe", rowId: "r2" }], checkIns: 2, reports: 1 }] },
        hands: { state: "ready", labels: { "Fellow 1": "chloe", "Fellow 2": "farah" }, list: [{ uid: "farah", why: "Fellow 2 rushed." }, { uid: "chloe", why: "Fellow 1." }] },
        uids: ["chloe", "farah"],
      },
      "tasks/review-follow-up__x__w03__farah": { source: "review-follow-up", sourceRef: { cohortId: RUN.agi, weekNumber: 3, aboutUid: "farah" }, completerUids: ["rahul"] },
      "tasks/review-follow-up__x__w03__chloe": { source: "review-follow-up", sourceRef: { cohortId: RUN.agi, weekNumber: 3, aboutUid: "chloe" }, completerUids: ["farah"] },
    });
    db.recursiveDelete = async (ref) => ref.delete();
    const summary = await deleteAccountCascade(auth, db, "farah");
    assert.equal(summary.courseWeekReviewsCleared, 1);
    assert.equal(summary.reviewFollowUpsDeleted, 1);
    const kept = db.read(`courseWeekReviews/${id}`);
    assert.ok(!JSON.stringify(kept).includes("farah"), "the review still names the deleted account");
    assert.deepEqual(kept.grades.items, [{ uid: "chloe", rowId: "r2", grade: 5 }]);
    assert.deepEqual(kept.themes.list[0].answers, [{ uid: "chloe", rowId: "r2" }]);
    assert.equal(kept.themes.list[0].checkIns, 2);
    assert.deepEqual(kept.hands.list, [{ uid: "chloe", why: "Fellow 1." }]);
    assert.deepEqual(kept.hands.labels, { "Fellow 1": "chloe" });
    assert.deepEqual(kept.uids, ["chloe"]);
    assert.equal(db.has("tasks/review-follow-up__x__w03__farah"), false);
    assert.equal(db.has("tasks/review-follow-up__x__w03__chloe"), true, "a task the account was on, about somebody else, went");
  });

  test("the record reads back what was kept, and a stored review names nobody but by account", () => {
    const read = record.normalizeWeekReview("r__w03", { runId: "r", weekId: "w03", weekNumber: 3, grades: { state: "ready", items: [{ uid: "u", rowId: "x", grade: 12 }] } });
    assert.deepEqual(read.grades.items, [], "a grade outside 1 to 10 was read back");
    assert.equal(record.normalizeWeekReview("x", { weekId: "w03" }), null);
  });
});
