/**
 * A programme's Overview before any of its groups has met ("Get ready for
 * week 1", boards st-overview and st-overview-phone) and Publish's own page
 * (board st-publish): its readiness check and the two emails as each person
 * will get them.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. WHO. The programme's lead and admins open both pages; a reviewer is
 *     told they are the lead's; another programme's lead is told there is no
 *     programme here; the run's track lead, a facilitator, a member and
 *     somebody signed out are sent away. The route behind the emails is
 *     Publish's own gate. Nobody's opening writes anything.
 *  2. EACH STEP'S STATE FROM RECORDS: to do, in progress and done, for every
 *     step, with its line in the boards' words, from the hand-over's own
 *     record, the groups' slots and rooms, the asks, the People tab's rows,
 *     the run's own list and week 1.
 *  3. THE COUNTS ARE ONE FUNCTION: who is in a group and who is still to place
 *     agree with the allocation board's own count (`placingCounts`,
 *     `boardTally`) and with whom Publish itself waits for.
 *  4. THE READINESS CHECK: what Publish refuses for is "Needed to publish",
 *     and Publish does refuse; what it does not refuse for only warns, and a
 *     press goes through with it.
 *  5. THE EMAILS SHOWN ARE THE SAME BYTES THE SEND USES: the page's email of
 *     each kind is, byte for byte, the email the press then hands the mail
 *     door for that person, and its names are the press's recipients.
 *  6. THE WORDS: no dash and no gendered pronoun, and the lines whose words
 *     follow a count.
 *  7. REMIND, on the card of who has not said when they are free: it says how
 *     many it emails, a press emails exactly them and refuses another count,
 *     nobody twice in a day, nobody Publish has told, a failed send given
 *     back, the body before the gate, and view-as before anything.
 *
 * Real: the two pages, the preview route, the reader and the model, the
 * People tab's and the Facilitators view's own models, the hand-over, the
 * allocate route and Publish with its test. Faked: see
 * `tests/lib/peopleWorld.mjs` (the session, the Admin SDK handle, the mail
 * door that writes down what it is handed, the clock).
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { A, AGI, B, C, MONDAY, ROUND, RUN, makePeopleWorld, termSeed } from "./lib/peopleWorld.mjs";
import { applicationPath } from "./lib/applicationsSmallTerm.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

mock.timers.enable({ apis: ["Date"], now: MONDAY });

const w = await makePeopleWorld("__getReadySuite");
const { world, at, reset, draw, call, loadTs } = w;
const join_ = w.join;

const TABS = ["app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)"];
const overviewPage = (await loadTs(join(...TABS, "overview", "page.tsx"))).default;
const publishPage = (await loadTs(join(...TABS, "groups", "publish", "page.tsx"))).default;
const previewRoute = await loadTs(join("app", "api", "courses", "runs", "[runId]", "allocation", "publish", "preview", "route.ts"));
const model = await loadTs(join("lib", "courses", "getReady", "model.ts"));
const words = await loadTs(join("lib", "courses", "getReady", "words.ts"));
const { readGetReady } = await loadTs(join("lib", "courses", "getReady", "read.ts"));
const { readRunRecords } = await loadTs(join("lib", "courses", "programmeAttendance.ts"));
const { placingCounts, boardTally } = await loadTs(join("features", "courses", "allocationTally.ts"));

const PARAMS = { roundId: ROUND, programmeId: AGI };
const PROGRAMME_PATH = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;
const W01 = `courseRuns/${RUN.agi}/weeks/w01`;

/** Every element below `element` whose component is called `name`. */
function find(element, name, out = []) {
  if (!element || typeof element !== "object") return out;
  if (Array.isArray(element)) {
    for (const child of element) find(child, name, out);
    return out;
  }
  if (typeof element.type === "function" && element.type.name === name) out.push(element);
  const children = element.props?.children;
  if (children !== undefined) find(children, name, out);
  return out;
}

/** The Overview's element tree, with the component the page hands "Get ready" to. */
async function overview(who) {
  const drawn = await draw(overviewPage, who, PARAMS);
  const [frame] = drawn.element ? find(drawn.element, "ProgrammeOverview") : [];
  return { ...drawn, getReady: frame?.props.getReady ?? null };
}

/** Publish's own page as `who`. */
async function publishView(who) {
  const drawn = await draw(publishPage, who, PARAMS);
  const [readiness] = drawn.element ? find(drawn.element, "PublishReadiness") : [];
  const [groups] = drawn.element ? find(drawn.element, "PublishGroups") : [];
  return { ...drawn, readiness: readiness?.props.model ?? null, groups: groups?.props ?? null };
}

/** The facts and both models, read as `who` through the one reader. */
async function facts(who = "claudia") {
  const records = await readRunRecords(world.courseDb, RUN.agi);
  world.user = w.sessionFor(who);
  world.course = true;
  try {
    const read = await readGetReady(world.courseDb, w.sessionFor(who), ROUND, AGI, records, new Date());
    return { read, checklist: model.buildGetReady(read.facts), readiness: model.buildReadiness(read.facts) };
  } finally {
    world.course = false;
  }
}

/** One step of the checklist, by its key. */
const stepOf = (checklist, key) => checklist.steps.find((step) => step.key === key);

/** The preview route's answer as `who`. */
const preview = (who) => call(who, previewRoute.GET, { runId: RUN.agi }, { course: true });

/** Everybody holding an AGI Strategy place in the term. */
const HOLDERS = ["amara", "bea", "callum", "dev", "kofi", "sam", "tariq", "zach"];

beforeEach(() => {
  reset(termSeed());
  at(MONDAY);
});

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe("1. who opens the Overview's checklist, Publish's page and the emails", () => {
  /** Where each kind of caller ends up, in words. */
  function said(drawn, drawnWhen) {
    if (drawn.to) return `sent to ${drawn.to}`;
    if (drawnWhen(drawn)) return "drawn";
    if (/Only the programme’s lead and admins can open (Overview|Groups)/.test(drawn.text)) return "told it is the lead's";
    if (drawn.text.startsWith("There is no programme here")) return "no programme here";
    return drawn.text;
  }
  const EXPECTED = {
    zach: "drawn",
    claudia: "drawn",
    lloyd: "told it is the lead's",
    tess: "no programme here",
    yusuf: "sent to /dashboard",
    rahul: "sent to /dashboard",
    amara: "sent to /dashboard",
    nobody: "sent to /dashboard",
    "signed out": "sent to /dashboard",
  };

  test("the Overview before the start: Get ready for week 1 for the lead and admins, and nobody else", async () => {
    const seen = {};
    for (const who of ["zach", "claudia", "lloyd", "tess", "yusuf", "rahul", "amara", "nobody", null]) {
      const drawn = await overview(who);
      assert.equal(drawn.wrote, false, `opening the Overview as ${who} wrote something`);
      seen[who ?? "signed out"] = said(drawn, (d) => d.getReady !== null && d.text.startsWith("Get ready for week 1"));
    }
    assert.deepEqual(seen, EXPECTED);
  });

  test("Publish's page: the readiness check and Publish for the lead and admins, and nobody else", async () => {
    const seen = {};
    for (const who of ["zach", "claudia", "lloyd", "tess", "yusuf", "rahul", "amara", "nobody", null]) {
      const drawn = await publishView(who);
      assert.equal(drawn.wrote, false, `opening Publish's page as ${who} wrote something`);
      seen[who ?? "signed out"] = said(drawn, (d) => d.readiness !== null && d.groups !== null);
    }
    assert.deepEqual(seen, EXPECTED);
  });

  test("the emails are Publish's own: the lead and admins, a track lead only on a run the form does not fill, and nobody else", async () => {
    const before = w.everything();
    const status = {};
    for (const who of ["zach", "claudia", "lloyd", "tess", "yusuf", "rahul", "amara", "nobody", null]) {
      status[who ?? "signed out"] = (await preview(who)).status;
    }
    assert.deepEqual(status, {
      zach: 200,
      claudia: 200,
      lloyd: 403,
      tess: 403,
      // Nobody from the form is on the run's list yet, so the track lead does the run's work.
      yusuf: 200,
      rahul: 403,
      amara: 403,
      nobody: 403,
      "signed out": 401,
    });
    // Once the form's people are on it, the run is the programme's lead's and an admin's.
    await join_.press("zach");
    const handedOver = w.everything();
    assert.deepEqual([(await preview("yusuf")).status, (await preview("claudia")).status, (await preview("zach")).status], [403, 200, 200]);
    assert.equal(w.everything(), handedOver, "reading the emails wrote something");
    assert.notEqual(before, handedOver);
  });

  test("a page draws no address, for the lead or for an admin", async () => {
    await join_.press("zach");
    await join_.place("zach", [{ uid: "amara", groupId: B }]);
    for (const who of ["claudia", "zach"]) {
      for (const drawn of [await overview(who), await publishView(who)]) {
        assert.ok(!drawn.html.includes("@"), `an address reached ${who}'s page`);
      }
      const answer = await preview(who);
      const said = JSON.stringify({ ...answer.body, people: { ...answer.body.people, email: null }, facilitators: { ...answer.body.facilitators, email: null } });
      assert.ok(!said.includes("@example.com"), `an address reached ${who} from the emails' route`);
    }
  });
});

// ---------------------------------------------------------------------------
// The term in three states, through the real routes where a route writes it
// ---------------------------------------------------------------------------

/** A week of the run with one reading of 75 minutes. */
function weekDoc(n, { published = true, ready = false } = {}) {
  return {
    weekNumber: n,
    title: `Week ${n}`,
    summary: "",
    materials: [{ id: `m${n}`, type: "reading", title: `Reading ${n}`, url: `https://example.com/reading-${n}`, estimatedMinutes: 75, required: true }],
    exercises: [],
    checklist: [],
    published,
    ...(ready ? { ready: true, readyAt: MONDAY, readyByUid: "claudia" } : {}),
  };
}

/** A group's weekly slot with nothing set: no day's time and no room. */
const NO_SLOT = { weekday: 2, startTimeLocal: "", durationMinutes: 120, location: "", meetingUrl: null, notes: "" };

/** An ask to facilitate, as the ask route writes one. */
function ask(id, uid, name, groupId, { answer = null } = {}) {
  return {
    kind: "ask",
    runId: RUN.agi,
    roundId: ROUND,
    programmeId: AGI,
    groupId,
    uid,
    seat: id,
    askedByUid: "claudia",
    askedAt: new Date("2026-10-26T09:00:00Z"),
    replyBy: { dateKey: "2026-10-28", time: "12:00" },
    answer,
    answeredAt: answer ? new Date("2026-10-26T10:12:00Z") : null,
    remindedAt: null,
    reminders: 0,
    delivery: "sent",
    email: {
      subject: "Would you facilitate a group on AGI Strategy?",
      greeting: `Hi ${name.split(" ")[0]},`,
      paragraphs: ["You said you’d like to facilitate."],
      button: { label: "Say yes or no", href: `https://naisi.invalid/learn/facilitate/${id}` },
      signOff: { name: "Claudia", role: "AGI Strategy lead, NAISI" },
    },
    toName: name,
    firstName: name.split(" ")[0],
    leadName: "Claudia",
  };
}

/** Every step to do: nobody handed over, no group with a time, a room or a facilitator, no week 1. */
function nothingYet() {
  for (const id of [A, B, C]) world.db.poke(`courseGroups/${id}`, { session: NO_SLOT, facilitatorUids: [] });
}

/** Part done: handed over, five placed, Group C with no room and its facilitator asked and not answered, week 1 written. */
async function partDone() {
  world.db.poke(`courseGroups/${C}`, {
    session: { weekday: 3, startTimeLocal: "13:00", durationMinutes: 120, location: "", meetingUrl: null, notes: "" },
    facilitatorUids: [],
  });
  // Rahul and Sofia said yes to Group B; Nadia has not answered about Group C.
  world.db.seed("courseFacilitating/ask-rahul", ask("ask-rahul", "rahul", "Rahul Mehta", B, { answer: "yes" }));
  world.db.seed("courseFacilitating/ask-sofia", ask("ask-sofia", "sofia", "Sofia Rossi", B, { answer: "yes" }));
  world.db.seed("courseFacilitating/ask-nadia", ask("ask-nadia", "nadia", "Nadia Hassan", C));
  world.db.seed(W01, weekDoc(1));
  assert.equal((await join_.press("zach")).status, 200);
  const placed = await join_.place("zach", [
    { uid: "amara", groupId: B },
    { uid: "dev", groupId: C },
    { uid: "zach", groupId: A },
    { uid: "callum", groupId: B },
    { uid: "sam", groupId: B },
  ]);
  assert.equal(placed.status, 200);
}

/** All done: everybody placed, every group with a time, a room and a facilitator, weeks 1 to 3 ready, published. */
async function allDone() {
  world.db.seed(W01, weekDoc(1, { ready: true }));
  world.db.seed(`courseRuns/${RUN.agi}/weeks/w02`, weekDoc(2, { ready: true }));
  world.db.seed(`courseRuns/${RUN.agi}/weeks/w03`, weekDoc(3, { ready: true }));
  assert.equal((await join_.press("zach")).status, 200);
  const placed = await join_.place("zach", [
    { uid: "amara", groupId: B },
    { uid: "bea", groupId: A },
    { uid: "callum", groupId: B },
    { uid: "dev", groupId: C },
    { uid: "kofi", groupId: B },
    { uid: "sam", groupId: B },
    { uid: "tariq", groupId: A },
    { uid: "zach", groupId: B },
  ]);
  assert.equal(placed.status, 200);
  assert.equal((await join_.publish("zach")).status, 200);
}

/** A step as the boards draw it: its state, its line, and where it leads. */
const said = (step) => [step.state, step.line, step.link ? `${step.link.label} (${step.link.look})` : null];

// ---------------------------------------------------------------------------
// 2. Each step's state from records
// ---------------------------------------------------------------------------

describe("2. each step of Get ready for week 1, from records", () => {
  test("every step to do, as the lead reads it", async () => {
    nothingYet();
    const { checklist } = await facts("claudia");
    assert.deepEqual(
      checklist.steps.map((step) => [step.title, ...said(step)]),
      [
        [
          "Hand over the people holding a place",
          "todo",
          "8 people holding a place aren’t on the run’s list yet, so they can’t be placed. An admin hands them over on the Settings tab.",
          null,
        ],
        ["Choose group times", "todo", "0 of 3. Groups A, B and C have no time yet.", "Times (button)"],
        ["Ask facilitators", "todo", "No group has a facilitator yet.", "Facilitators (button)"],
        // Rooms are set in the run editor, an admin's: the lead is offered nowhere to go.
        ["Set rooms", "todo", "0 of 3. Groups A, B and C have no room yet.", null],
        ["Put people in groups", "todo", "0 of 8 placed. 8 to place, 1 of them hasn’t said when they’re free.", "Groups (button)"],
        ["Write week 1", "todo", "Week 1 has no page yet. Paste its Markdown on the Weeks tab, then mark it ready.", "Open week 1 (button)"],
        ["Publish groups", "todo", "Emails each person their group, day and room, and each facilitator their group.", "Publish groups… (button)"],
      ],
    );
    assert.equal(stepOf(checklist, "publish").note, "Needs a day and a time for every group.");
    assert.equal(stepOf(checklist, "week-one").markReady, null);
    assert.equal(checklist.lede, "Week 1 starts Thu 29 Oct.");
  });

  test("an admin is offered the hand-over on Settings and the rooms in the run editor", async () => {
    nothingYet();
    const { checklist } = await facts("zach");
    assert.deepEqual(said(stepOf(checklist, "hand-over")), [
      "todo",
      "8 people holding a place aren’t on the run’s list yet, so they can’t be placed. Hand them over on the Settings tab.",
      "Settings (button)",
    ]);
    assert.deepEqual(stepOf(checklist, "hand-over").link.to, "settings");
    assert.deepEqual(stepOf(checklist, "rooms").link, { to: "run-editor", label: "Set rooms", look: "button" });
  });

  test("part done: the hand-over's own record, some placed, a room and an answer still to come, week 1 written", async () => {
    await partDone();
    const { checklist } = await facts("claudia");
    assert.deepEqual(
      checklist.steps.map((step) => [step.key, ...said(step)]),
      [
        ["hand-over", "done", "Done by Zach · Mon 26 Oct, 12pm", null],
        ["times", "done", "3 groups: Tue 6pm, Wed 1pm, Thu 6pm", "Times (text)"],
        ["facilitators", "doing", "2 of 3 said yes. Nadia hasn’t replied about Group C.", "Facilitators (button)"],
        ["rooms", "doing", "2 of 3. Group C has no room yet.", null],
        ["people", "doing", "5 of 8 placed. 3 to place, 1 of them hasn’t said when they’re free.", "Groups (button)"],
        ["week-one", "doing", "Everyone holding a place can open week 1 once it’s marked ready.", null],
        ["publish", "todo", "Emails each person their group, day and room, and each facilitator their group.", "Publish groups… (button)"],
      ],
    );
    assert.deepEqual(stepOf(checklist, "week-one").markReady, { runId: RUN.agi, weekId: "w01" });
    // Tariq sits in Group A, outside the times he gave, with nothing chosen
    // for him yet: since 29 October 2026 Publish waits for that too.
    assert.equal(
      stepOf(checklist, "publish").note,
      "Needs everyone holding a place in a group, and a note, or none chosen, for everyone placed outside the times they gave.",
    );
  });

  test("answers still to come about two groups name their people in the order the line names the groups", async () => {
    await partDone();
    // Group C meets on Wednesdays and Group A on Thursdays, so the page lists C first; the sentence names A first.
    world.db.seed("courseFacilitating/ask-tom", ask("ask-tom", "tom", "Tom Fletcher", A));
    assert.deepEqual(said(stepOf((await facts("claudia")).checklist, "facilitators")), [
      "doing",
      "2 of 4 said yes. Tom and Nadia haven’t replied about Groups A and C.",
      "Facilitators (button)",
    ]);
  });

  test("the hand-over's own record names who pressed it, whatever else the course log holds", async () => {
    await partDone();
    // A later line of another kind, by somebody else, is not the hand-over.
    world.db.seed("courseAudit/later-line", {
      kind: "enrol-mode-change",
      runId: RUN.agi,
      roundId: null,
      groupId: null,
      subjectUid: null,
      actorUid: "claudia",
      actorName: "Claudia Reyes",
      targetLabel: "Autumn 2026",
      detail: "A later line.",
      at: new Date("2026-10-26T12:30:00Z"),
    });
    assert.deepEqual(said(stepOf((await facts("claudia")).checklist, "hand-over")), ["done", "Done by Zach · Mon 26 Oct, 12pm", null]);
  });

  test("of those still to place, only the ones who have not said when they are free are counted as not having said", async () => {
    await partDone();
    // Bea, who painted nothing, is placed; Kofi and Tariq, who painted their weeks, are still to place.
    assert.equal((await join_.place("zach", [{ uid: "bea", groupId: A }])).status, 200);
    assert.deepEqual(said(stepOf((await facts("claudia")).checklist, "people")), [
      "doing",
      "6 of 8 placed. 2 to place.",
      "Groups (button)",
    ]);
  });

  test("all done: everyone placed, every group with a time, a room and a facilitator, week 1 ready, published", async () => {
    await allDone();
    const { checklist } = await facts("claudia");
    assert.deepEqual(
      checklist.steps.map((step) => [step.key, ...said(step)]),
      [
        ["hand-over", "done", "Done by Zach · Mon 26 Oct, 12pm", null],
        ["times", "done", "3 groups: Tue 6pm, Wed 1pm, Thu 6pm", "Times (text)"],
        // Facilitators added by hand, not asked: no "said yes" is claimed for them.
        ["facilitators", "done", "Every group has a facilitator.", "Facilitators (text)"],
        ["rooms", "done", "Every group has a room.", null],
        ["people", "done", "8 of 8 placed.", "Groups (text)"],
        ["week-one", "done", "Ready. Weeks 2 and 3 are ready too; 4 to 6 aren’t yet.", "Weeks (text)"],
        ["publish", "done", "Published Mon 26 Oct, 12pm.", "Publish groups… (text)"],
      ],
    );
    assert.equal(stepOf(checklist, "publish").note, null);
  });

  test("week 1 not published and with nothing in it: the Overview's own line, Mark ready and the way to its page", async () => {
    world.db.seed(W01, weekDoc(1, { published: false }));
    let step = stepOf((await facts("claudia")).checklist, "week-one");
    assert.deepEqual(said(step), [
      "doing",
      "Week 1 isn’t published yet: marking it ready publishes it, and everyone holding a place can open it.",
      null,
    ]);
    assert.deepEqual(step.markReady, { runId: RUN.agi, weekId: "w01" });
    world.db.seed(W01, { ...weekDoc(1, { published: false }), materials: [] });
    step = stepOf((await facts("claudia")).checklist, "week-one");
    assert.deepEqual(said(step), [
      "todo",
      "Week 1 has nothing in it yet. Paste its Markdown on the Weeks tab, then mark it ready.",
      "Open week 1 (button)",
    ]);
    assert.equal(step.markReady, null);
  });

  test("the cards: who has not said when they are free, the places, the freed places and the facilitators", async () => {
    await partDone();
    world.db.poke(`courseRuns/${RUN.agi}`, { groupsGoOutOn: "2026-10-28" });
    world.db.seed(`courseFacilitating/${RUN.agi}__training`, {
      kind: "training",
      runId: RUN.agi,
      dateKey: "2026-10-28",
      time: "18:00",
      room: "Room B5",
      setByUid: "claudia",
      setAt: MONDAY,
    });
    const { checklist } = await facts("claudia");
    assert.equal(checklist.lede, "Groups go out on Wed 28 Oct. Week 1 starts Thu 29 Oct.");
    assert.deepEqual(checklist.notSaid, {
      names: ["Bea Lindqvist"],
      text: "1 person holding a place hasn’t painted their week: Bea Lindqvist. They can add it on their application until groups go out.",
      open: true,
      remind: {
        count: 1,
        label: "Remind 1 person",
        countLine: "Emails 1 person",
        confirm: "Remind Bea to say when they’re free? This emails 1 person.",
      },
      reminded: null,
    });
    const { places, facilitators } = checklist;
    assert.deepEqual(
      [places.held, places.of, places.heldWords, places.coming, places.haventSaid, places.gaveBack],
      [8, 3, "of 3 places held", 4, 4, 1],
    );
    assert.deepEqual(places.gaveBackRows.map((row) => [row.name, row.line]), [["Nina Petrova", "The times don’t work for me · Fri 23 Oct"]]);
    assert.deepEqual(places.freed, { title: "1 freed place", text: "Ruth Adler was invited on Tue 27 Oct and has until Thu 29 Oct." });
    assert.equal(places.window, "Freed places can be offered until Wed 4 Nov, the end of week 1.");
    assert.deepEqual(
      facilitators.rows.map((row) => [row.name, row.groupName, row.chip?.words ?? null]),
      [
        ["Rahul Mehta", "Group B", "Said yes"],
        ["Sofia Rossi", "Group B", "Said yes"],
        ["Nadia Hassan", "Group C", "No reply yet"],
        // Added to Group A by hand: no answer to show.
        ["Sofia Rossi", "Group A", null],
      ],
    );
    assert.equal(facilitators.training, "Training · Wed 28 Oct · 6pm · Room B5");
  });

  test("the page draws each step's words, its mark and its way on, and the board's cards", async () => {
    await partDone();
    const drawn = await overview("claudia");
    assert.match(drawn.text, /^Get ready for week 1 Week 1 starts Thu 29 Oct\. Hand over the people holding a place Done by Zach · Mon 26 Oct, 12pm Choose group times/);
    for (const [label, count] of [["Done", 2], ["In progress", 4], ["To do", 1]]) {
      assert.equal([...drawn.html.matchAll(new RegExp(`role="img" aria-label="${label}"`, "g"))].length, count, label);
    }
    assert.match(drawn.html, new RegExp(`href="${PROGRAMME_PATH}/groups/times"[^>]*><span>Times</span>`));
    assert.match(drawn.html, new RegExp(`href="${PROGRAMME_PATH}/groups/facilitators"[^>]*><span>Facilitators</span>`));
    assert.match(drawn.html, new RegExp(`href="${PROGRAMME_PATH}/groups"[^>]*><span>Groups</span>`));
    assert.match(drawn.html, new RegExp(`href="${PROGRAMME_PATH}/groups/publish"[^>]*><span>Publish groups…</span>`));
    assert.match(drawn.html, new RegExp(`href="${PROGRAMME_PATH}/applications/freed-places"[^>]*><span>See freed places</span>`));
    assert.ok(!drawn.html.includes("/admin/courses/"), "the lead was sent to the run editor, which is an admin's");
    assert.match(drawn.text, /Mark ready/);
    for (const heading of ["Not said when they’re free", "Places", "Facilitators"]) {
      assert.ok(drawn.text.includes(heading), heading);
    }
    // What a running Overview draws is not drawn before the start.
    for (const running of ["Sessions this week", "Needs attention", "Attendance by week"]) {
      assert.ok(!drawn.text.includes(running), running);
    }
  });

  test("once a group has met, the Overview is the week the run is in again", async () => {
    await allDone();
    // Thu 29 Oct, 8pm: Group A has met.
    at(new Date("2026-10-29T20:00:00Z"));
    const drawn = await overview("claudia");
    assert.equal(drawn.getReady, null);
    assert.ok(drawn.text.includes("Sessions this week"));
    assert.ok(!drawn.text.includes("Get ready for week 1"));
  });
});

// ---------------------------------------------------------------------------
// 3. The counts are one function
// ---------------------------------------------------------------------------

describe("3. the counts agree with the board and with Publish, as one function", () => {
  test("in a group and to place are the board's own count, over the board's own cards", async () => {
    await partDone();
    const { read } = await facts("claudia");
    const board = (await join_.board("claudia")).body;
    const live = new Set(board.groups.map((group) => group.id));
    const inPool = (row) => !row.groupId || !live.has(row.groupId);
    const counted = placingCounts(board.people, inPool, { holders: HOLDERS, invited: 0 });
    assert.deepEqual(
      [read.facts.placing.holding, read.facts.placing.inAGroup, read.facts.placing.notOnTheRun],
      [counted.holding, counted.inAGroup, counted.notOnTheRun],
    );
    assert.deepEqual([counted.holding, counted.inAGroup, counted.toPlace], [8, 5, 3]);
    // Who is still to place, by the board's own tally, is who the checklist and Publish wait for.
    const tally = boardTally(board.people, inPool);
    const waitedFor = read.facts.placing.toPlaceOnList.map((person) => person.uid).sort();
    assert.deepEqual(tally.toPlace.map((row) => row.uid).sort(), waitedFor);
    assert.deepEqual(waitedFor, ["bea", "kofi", "tariq"]);
  });

  test("Publish waits for exactly the people the readiness check names", async () => {
    await partDone();
    const { readiness } = await facts("claudia");
    const placed = readiness.needed.find((item) => item.key === "placed");
    assert.deepEqual([placed.state, placed.title, placed.detail], [
      "blocks",
      "Everyone holding a place is in a group",
      "5 of 8. Bea, Kofi and Tariq have no group yet.",
    ]);
    const pressed = await join_.publish("claudia");
    assert.equal(pressed.status, 409);
    assert.deepEqual([...pressed.body.unplaced].sort(), ["Bea Lindqvist", "Kofi Asante", "Tariq Mensah"]);
  });

  test("a facilitator who holds a place is counted where the board and Publish count them", async () => {
    await partDone();
    // Rahul holds a place too, and is placed in the group Rahul facilitates.
    world.db.seed(applicationPath("rahul"), { ...world.db.read(applicationPath("tariq")), uid: "rahul", displayName: "Rahul Mehta", email: "rahul@example.com" });
    world.db.seed(`admissionDecisions/${ROUND}__rahul`, { ...world.db.read(`admissionDecisions/${ROUND}__tariq`), uid: "rahul" });
    assert.equal((await join_.press("zach")).status, 200);
    assert.equal((await join_.place("zach", [{ uid: "rahul", groupId: B }])).status, 200);
    const { read } = await facts("claudia");
    const board = (await join_.board("claudia")).body;
    const live = new Set(board.groups.map((group) => group.id));
    const counted = placingCounts(board.people, (row) => !row.groupId || !live.has(row.groupId), {
      holders: [...HOLDERS, "rahul"],
      invited: 0,
    });
    assert.deepEqual([read.facts.placing.holding, read.facts.placing.inAGroup], [counted.holding, counted.inAGroup]);
    assert.deepEqual([counted.holding, counted.inAGroup], [9, 6]);
  });
});

// ---------------------------------------------------------------------------
// 4. The readiness check: what blocks, and what only warns
// ---------------------------------------------------------------------------

describe("4. Publish's readiness check: what Publish refuses for is needed, the rest only warns", () => {
  const item = (readiness, key) => [...readiness.needed, ...readiness.worth].find((entry) => entry.key === key) ?? null;

  test("all done: the board's one needed item, and nothing in the way", async () => {
    await allDone();
    const { readiness } = await facts("claudia");
    assert.equal(readiness.ready, true);
    assert.deepEqual(
      readiness.needed.map((entry) => [entry.state, entry.title, entry.detail]),
      [["done", "Every group has a day, a time and a room", "3 groups: Tue 6pm, Wed 1pm, Thu 6pm"]],
    );
    assert.deepEqual(
      readiness.worth.slice(0, 3).map((entry) => [entry.state, entry.title, entry.detail]),
      [
        // No detail that says the title again.
        ["done", "Every group has a facilitator", null],
        ["done", "Everyone holding a place is in a group", "8 of 8."],
        ["done", "Week 1 is written", "Its reading takes about 75 minutes."],
      ],
    );
  });

  test("somebody placed at a time they said they are not free: worth checking, with the way to move them", async () => {
    await allDone();
    const { readiness } = await facts("claudia");
    const fit = item(readiness, "fit-tariq");
    assert.deepEqual([fit.state, fit.title, fit.detail, fit.link], [
      "check",
      "Tariq Mensah is in Group A on Thursdays at 6pm, but said they’re not free then.",
      "Publish anyway, or move Tariq first.",
      { to: "groups", label: "Move Tariq…" },
    ]);
    // Nobody placed where their week fits is named.
    assert.deepEqual(readiness.worth.filter((entry) => entry.key.startsWith("fit-")).map((entry) => entry.key), ["fit-tariq"]);
    const drawn = await publishView("claudia");
    assert.match(drawn.html, new RegExp(`<a href="${PROGRAMME_PATH}/groups" class="itemButton">Move Tariq…</a>`));
  });

  test("a group with no room only warns, and Publish sends without it", async () => {
    await partDone();
    await join_.place("zach", [
      { uid: "bea", groupId: A },
      { uid: "kofi", groupId: B },
      { uid: "tariq", groupId: B },
    ]);
    // Somebody placed outside the times they gave needs a choice before
    // Publish goes (held on its own in tests/course-publish-outside-notes.test.mjs).
    assert.deepEqual(await join_.withoutNotes("claudia"), ["Zach"]);
    const { readiness } = await facts("claudia");
    assert.equal(readiness.ready, true);
    assert.deepEqual(item(readiness, "rooms"), {
      key: "rooms",
      state: "check",
      title: "Every group has a room",
      detail: "Group C has no room yet. The email leaves the room out until it has one.",
      markReady: null,
      link: null,
    });
    assert.deepEqual(readiness.needed.map((entry) => [entry.key, entry.state, entry.title]), [
      ["times", "done", "Every group has a day and a time"],
      ["notes", "done", "Everyone outside the times they gave has a note, or none chosen"],
    ]);
    assert.equal((await join_.publish("claudia")).status, 200);
  });

  test("a group with no day and time is needed, and Publish refuses it", async () => {
    await partDone();
    await join_.place("zach", [
      { uid: "bea", groupId: A },
      { uid: "kofi", groupId: B },
      { uid: "tariq", groupId: B },
    ]);
    world.db.poke(`courseGroups/${C}`, { session: NO_SLOT });
    const { readiness } = await facts("claudia");
    assert.equal(readiness.ready, false);
    assert.deepEqual(item(readiness, "times"), {
      key: "times",
      state: "blocks",
      title: "Every group has a day and a time",
      detail: "Group C has no day and time yet.",
      markReady: null,
      link: null,
    });
    const pressed = await join_.publish("claudia");
    assert.equal(pressed.status, 409);
  });

  test("an answer still to come and week 1 not ready only warn", async () => {
    await partDone();
    const { readiness } = await facts("claudia");
    assert.deepEqual(item(readiness, "facilitators"), {
      key: "facilitators",
      state: "check",
      title: "Every group has a facilitator who said yes",
      detail: "2 of 3 said yes. Nadia hasn’t replied about Group C.",
      markReady: null,
      link: null,
    });
    assert.deepEqual(item(readiness, "week-one"), {
      key: "week-one",
      state: "check",
      title: "Week 1 is written",
      detail: "Everyone holding a place can open week 1 once it’s marked ready.",
      markReady: { runId: RUN.agi, weekId: "w01" },
      link: null,
    });
    assert.ok(readiness.worth.some((entry) => entry.key === "facilitators") && readiness.worth.some((entry) => entry.key === "week-one"));
  });

  test("the page draws the check: Ready? with its chip, the two lists and their words", async () => {
    await allDone();
    const drawn = await publishView("claudia");
    // `allDone` presses Publish, so the card says when, in the Overview's
    // checklist's words, and what a later move emails, in place of "Ready to
    // publish" (walk 4b, L7); the next test draws the card before the press.
    assert.match(
      drawn.text,
      /^People in groups Publish AGI Strategy’s groups Ready\? Published Published Mon 26 Oct, 12pm\. Someone you move now sees nothing of their new group until you publish again, which emails only the people who haven’t been told\. Needed to publish Every group has a day, a time and a room 3 groups: Tue 6pm, Wed 1pm, Thu 6pm Worth checking These don’t stop you publishing\. Every group has a facilitator/,
    );
    assert.match(drawn.html, new RegExp(`<a href="${PROGRAMME_PATH}/groups" class="back">`));
    // What can follow by itself is read on the server from the scheduler's
    // switches (all as they ship here: off) and handed down; the lead gets
    // no link to Site status.
    assert.deepEqual(drawn.groups, {
      runId: RUN.agi,
      admin: false,
      follows: {
        paused: false,
        nextWeekEmail: { on: false, waitsForRoom: [] },
        registerReminders: { on: false },
        placeConfirmations: null,
      },
    });
  });

  test("before the press the chip says Ready to publish; after it, the card says when the Overview does and what a later move emails", async () => {
    // Everything `allDone` does but the press.
    world.db.seed(W01, weekDoc(1, { ready: true }));
    world.db.seed(`courseRuns/${RUN.agi}/weeks/w02`, weekDoc(2, { ready: true }));
    world.db.seed(`courseRuns/${RUN.agi}/weeks/w03`, weekDoc(3, { ready: true }));
    assert.equal((await join_.press("zach")).status, 200);
    const placed = await join_.place("zach", [
      { uid: "amara", groupId: B },
      { uid: "bea", groupId: A },
      { uid: "callum", groupId: B },
      { uid: "dev", groupId: C },
      { uid: "kofi", groupId: B },
      { uid: "sam", groupId: B },
      { uid: "tariq", groupId: A },
      { uid: "zach", groupId: B },
    ]);
    assert.equal(placed.status, 200);
    // A choice for everybody placed outside the times they gave, which Publish needs.
    await join_.withoutNotes("claudia");
    const before = await publishView("claudia");
    assert.match(before.text, /^People in groups Publish AGI Strategy’s groups Ready\? Ready to publish Needed to publish /);
    assert.equal(before.readiness.published, null);
    assert.equal((await join_.publish("claudia")).status, 200);
    for (const who of ["claudia", "zach"]) {
      const after = await publishView(who);
      const step = (await facts(who)).checklist.steps.find((each) => each.key === "publish");
      assert.deepEqual(after.readiness.published, {
        when: step.line,
        later: "Someone you move now sees nothing of their new group until you publish again, which emails only the people who haven’t been told.",
      }, who);
      assert.equal(step.line, "Published Mon 26 Oct, 12pm.");
      assert.match(after.text, /Ready\? Published Published Mon 26 Oct, 12pm\. Someone you move now /, who);
      assert.ok(!after.text.includes("Ready to publish"), who);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. The emails shown are the same bytes the send uses
// ---------------------------------------------------------------------------

describe("5. the two emails, as each person will get them", () => {
  /** Everybody placed, nobody told: what a press is about to send. */
  async function readyToPress() {
    world.db.seed(W01, weekDoc(1, { ready: true }));
    assert.equal((await join_.press("zach")).status, 200);
    const placed = await join_.place("zach", [
      { uid: "amara", groupId: B },
      { uid: "bea", groupId: A },
      { uid: "callum", groupId: B },
      { uid: "dev", groupId: C },
      { uid: "kofi", groupId: B },
      { uid: "sam", groupId: B },
      { uid: "tariq", groupId: A },
      { uid: "zach", groupId: B },
    ]);
    assert.equal(placed.status, 200);
  }

  test("each kind's count and names are a press's, and the first email of each is the email the press sends, byte for byte", async () => {
    await readyToPress();
    const shown = await preview("claudia");
    assert.equal(shown.status, 200);
    const { people, facilitators } = shown.body;
    const summary = (await join_.board("claudia")).body.publish;
    assert.deepEqual([people.emails, facilitators.emails], [summary.people, summary.facilitators]);
    assert.deepEqual([people.emails, facilitators.emails], [8, 4]);

    world.mail.length = 0;
    assert.equal((await join_.publish("claudia")).status, 200);
    const real = world.mail.filter((mail) => !mail.subject.startsWith("[TEST]"));
    // The names are the people the press sent to, in the order it sent them,
    // by the names on their accounts.
    const uidOf = (address) => address.split("@")[0];
    const facilitating = (mail) => mail.subject.startsWith("You’re facilitating");
    assert.deepEqual(
      people.names.map((person) => person.uid),
      real.filter((mail) => !facilitating(mail)).map((mail) => uidOf(mail.to)),
    );
    assert.deepEqual(
      facilitators.names.map((person) => person.uid),
      [...new Set(real.filter(facilitating).map((mail) => uidOf(mail.to)))],
    );
    assert.deepEqual(people.names.slice(0, 2), [
      { uid: "amara", name: "Amara Okafor" },
      { uid: "bea", name: "Bea Lindqvist" },
    ]);

    for (const [kind, email] of [["people", people.email], ["facilitators", facilitators.email]]) {
      const named = (kind === "people" ? people : facilitators).names.find((person) => person.name === email.to);
      const theirs = real.find((mail) => uidOf(mail.to) === named?.uid && mail.subject === email.subject);
      assert.ok(theirs, `no email went to ${email.to} with the subject the page showed (${kind})`);
      // The very element the mail door was handed, drawn: the page's bytes are the email's.
      assert.equal(email.html, await render(theirs.react), `the ${kind} email shown is not the email that was sent`);
    }
    assert.equal(people.email.to, "Amara Okafor");
    assert.equal(people.email.subject, "Your AGI Strategy group: Tuesdays at 6pm");
    assert.equal(people.email.from, "NAISI");
    // The test of the same wording, which the press needed first, is the same email marked as a test.
    assert.ok(world.mail.some((mail) => mail.subject === `[TEST] ${people.email.subject}`));
  });

  test("once everybody has been told, nobody is waiting for either email", async () => {
    await readyToPress();
    assert.equal((await join_.publish("zach")).status, 200);
    const shown = (await preview("claudia")).body;
    assert.deepEqual([shown.people.emails, shown.people.email, shown.facilitators.emails, shown.facilitators.email], [0, null, 0, null]);
  });

  test("somebody who gave their place back is never shown, as Publish never writes to them", async () => {
    await readyToPress();
    // Callum gives the place back after being placed: the card says so, and the press leaves Callum out.
    const reply = await join_.reply("callum", { reply: "cant-make-it", reason: { kind: "times", other: "" } });
    assert.equal(reply.status, 200);
    const shown = (await preview("claudia")).body;
    assert.ok(!shown.people.names.some((person) => person.uid === "callum"));
    assert.equal(shown.people.emails, (await join_.board("claudia")).body.publish.people);
  });
});

// ---------------------------------------------------------------------------
// 6. The words
// ---------------------------------------------------------------------------

describe("6. the words", () => {
  test("no dash of either kind, and no gendered pronoun, in what the pages say", () => {
    for (const file of [
      join(SRC, "lib", "courses", "getReady", "words.ts"),
      join(SRC, "lib", "courses", "weekOneLine.ts"),
      join(SRC, "features", "applications", "overview", "GetReady.tsx"),
      join(SRC, "features", "applications", "groups", "PublishGroups.tsx"),
      join(SRC, "features", "applications", "groups", "PublishReadiness.tsx"),
    ]) {
      const code = readFileSync(file, "utf8");
      assert.ok(!/[\u2013\u2014]/.test(code), `${file} has a dash`);
      const strings = [...code.matchAll(/["`]([^"`\n]*)["`]/g)].map((match) => match[1]).join(" ");
      assert.ok(!/\b(he|she|him|her|his|hers)\b/i.test(strings), `${file} says a gendered pronoun`);
    }
  });

  test("the placed line, the weeks line and the lede say what each count says", () => {
    assert.equal(words.placedWords(26, 30, 3), "26 of 30 placed. 4 to place, 3 of them haven’t said when they’re free.");
    assert.equal(words.placedWords(29, 30, 1), "29 of 30 placed. 1 to place, who hasn’t said when they’re free.");
    assert.equal(words.placedWords(26, 30, 0), "26 of 30 placed. 4 to place.");
    assert.equal(words.placedWords(26, 30, 4), "26 of 30 placed. 4 to place, and none of them has said when they’re free.");
    assert.equal(words.weekOneReadyWords([2, 3], [4, 5, 6]), "Ready. Weeks 2 and 3 are ready too; 4 to 6 aren’t yet.");
    assert.equal(words.weekOneReadyWords([], [2, 3, 4, 5, 6]), "Ready. Weeks 2 to 6 aren’t ready yet.");
    assert.equal(words.weekOneReadyWords([2], [3]), "Ready. Week 2 is ready too; 3 isn’t yet.");
    assert.equal(words.weekOneReadyWords([], []), "Ready.");
    assert.equal(words.getReadyLede("Wed 28 Oct", "Thu 29 Oct"), "Groups go out on Wed 28 Oct. Week 1 starts Thu 29 Oct.");
    assert.equal(words.getReadyLede(null, null), null);
    assert.equal(words.notRepliedWords(["Grace"], "Group D"), "Grace hasn’t replied about Group D.");
    // Who can still add when they are free: everybody, some (named), or nobody once Publish has told them all.
    const three = ["Dev Patel", "Ben Hartley", "Rory Webb"];
    const painted = "3 people holding a place haven’t painted their week: Dev Patel, Ben Hartley and Rory Webb.";
    assert.equal(words.notSaidFreeWords(three, three), `${painted} They can add it on their application until groups go out.`);
    assert.equal(
      words.notSaidFreeWords(three, ["Dev Patel"]),
      `${painted} Dev Patel can still add it on their application until groups go out.`,
    );
    assert.equal(words.notSaidFreeWords(three, []), painted);
    assert.equal(words.someWithoutWords(3, 4, "Group C", 1, "room"), "3 of 4. Group C has no room yet.");
    assert.equal(
      words.invitedWords(
        [
          { name: "Hannah Brooks", on: "Mon 26 Oct", until: "Thu 29 Oct" },
          { name: "Nina Petrova", on: "Mon 26 Oct", until: "Thu 29 Oct" },
        ],
        "Mon 26 Oct",
      ),
      "Hannah Brooks and Nina Petrova were invited today. They have until Thu 29 Oct.",
    );
  });
});

// ---------------------------------------------------------------------------
// 7. "Remind 3 people", on the card of who has not said when they are free
// ---------------------------------------------------------------------------

const remindRoute = await loadTs(
  join("app", "api", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "when-free", "remind", "route.ts"),
);
const { freeReminderMarkerId } = await loadTs(join("lib", "courses", "getReady", "remind.ts"));

describe("7. Remind on the card of who has not said when they are free", () => {
  const remind = (who, body, options = {}) => call(who, remindRoute.POST, PARAMS, { body, ...options });
  const MARKER = (uid) => `courseNudges/${freeReminderMarkerId(RUN.agi, uid, "2026-10-26")}`;
  const reminders = () => world.mail.filter((mail) => mail.subject === "Tell us when you’re free for AGI Strategy");

  test("the card says how many it emails, and the press emails exactly them, once a day", async () => {
    const drawn = await overview("claudia");
    assert.deepEqual(drawn.getReady.model.notSaid.remind, {
      count: 1,
      label: "Remind 1 person",
      countLine: "Emails 1 person",
      confirm: "Remind Bea to say when they’re free? This emails 1 person.",
    });
    assert.match(drawn.text, /Not said when they’re free 1 person holding a place hasn’t painted their week: Bea Lindqvist\. They can add it on their application until groups go out\. Remind 1 person Emails 1 person/);

    // A number that is not the card's is refused, and nobody is emailed.
    const wrong = await remind("claudia", { emails: 2 });
    assert.equal(wrong.status, 409);
    assert.deepEqual(reminders(), []);

    const pressed = await remind("claudia", { emails: 1 });
    assert.deepEqual([pressed.status, pressed.body], [200, { emailed: 1, failed: 0, names: ["Bea"] }]);
    const [mail] = reminders();
    assert.equal(mail.to, "bea@example.com");
    assert.equal(mail.replyTo, "ai-safety@uonsu.com");
    assert.equal(mail.kind, "course-application");
    const html = await render(mail.react);
    for (const said of [
      "Hi Bea,",
      "You hold a place on AGI Strategy, and you haven’t told us when you’re free yet. We use it to put you in a group.",
      "You can add it on your application until we email your group.",
      "Say when you’re free",
    ]) {
      assert.ok(html.includes(said), `the reminder does not say: ${said}`);
    }
    assert.ok(html.includes(`https://naisi.invalid/applications/${ROUND}/free`), "the reminder does not open the page where the week is added");
    assert.equal(world.db.read(MARKER("bea"))?.state, "sent");

    // Once today: the card names who was reminded, and offers nothing more.
    const again = await overview("claudia");
    assert.equal(again.getReady.model.notSaid.remind, null);
    assert.equal(again.getReady.model.notSaid.reminded, "Bea was reminded today.");
    assert.equal((await remind("claudia", { emails: 1 })).status, 409);
    assert.equal(reminders().length, 1);
  });

  test("the reminder names the day groups go out, and is signed by the programme's lead", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { groupsGoOutOn: "2026-10-28" });
    assert.equal((await remind("zach", { emails: 1 })).status, 200);
    const html = await render(reminders()[0].react);
    assert.ok(html.includes("You can add it on your application until we email your group on Wed 28 Oct."));
    assert.ok(html.includes("Claudia") && html.includes("AGI Strategy lead, NAISI"));
  });

  test("somebody Publish has told is not reminded: their week is their group's now", async () => {
    await allDone();
    const drawn = await overview("claudia");
    assert.equal(drawn.getReady.model.notSaid.remind, null);
    assert.equal(drawn.getReady.model.notSaid.reminded, null);
    // Nor told they can still add it: their page to say when they are free has shut.
    assert.equal(drawn.getReady.model.notSaid.text, "1 person holding a place hasn’t painted their week: Bea Lindqvist.");
    assert.equal(drawn.getReady.model.notSaid.open, false);
    assert.equal((await remind("claudia", { emails: 1 })).status, 409);
    assert.deepEqual(reminders(), []);
  });

  test("a failed send gives its marker back, so the next press tries again", async () => {
    world.mailFate = () => "fail";
    const failed = await remind("claudia", { emails: 1 });
    assert.equal(failed.status, 502);
    assert.equal(world.db.read(MARKER("bea")), undefined);
    world.mailFate = null;
    assert.equal((await remind("claudia", { emails: 1 })).status, 200);
  });

  test("who: the body first, then the programme's lead and admins, and nobody else; a view-as session before anything", async () => {
    const before = w.everything();
    const empty = {};
    for (const who of ["zach", "claudia", "lloyd", "tess", "yusuf", "rahul", "amara", "nobody", null]) {
      empty[who ?? "signed out"] = (await remind(who, {})).status;
    }
    assert.deepEqual(empty, { zach: 400, claudia: 400, lloyd: 400, tess: 400, yusuf: 400, rahul: 400, amara: 400, nobody: 400, "signed out": 401 });
    const pressed = {};
    for (const who of ["lloyd", "tess", "yusuf", "rahul", "amara", "nobody"]) {
      pressed[who] = (await remind(who, { emails: 1 })).status;
    }
    assert.deepEqual(pressed, { lloyd: 403, tess: 404, yusuf: 404, rahul: 404, amara: 404, nobody: 404 });
    assert.equal((await remind("claudia", { emails: 1 }, { viewAs: true })).status, 403);
    assert.equal(w.everything(), before, "a refused press wrote something");
    assert.deepEqual(reminders(), []);
  });
});
