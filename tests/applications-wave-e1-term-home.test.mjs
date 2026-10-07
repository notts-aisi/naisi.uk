/**
 * The parts of the term page that lead to the other screens: "Needs you",
 * each programme card's numbers, and "Also this term".
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * The term page shows numbers and links to the screens they come from. Two
 * things can go wrong, and each is a layer of its own:
 *
 *  1. THE NUMBER ON THE PAGE IS NOT THE NUMBER BEHIND THE LINK. A button that
 *     says "Review 23" has to open a list that walks 23 applications, and
 *     "16 pooled applicants need an outcome" has to be what the pooled
 *     applicants screen says. So the page's loader (`loadTermNumbers`) is run
 *     beside the loaders those two screens use, on the same stored term, as
 *     an admin, a lead and a reviewer, and the numbers are compared.
 *  2. SOMEBODY IS SHOWN A NUMBER ABOUT A PROGRAMME THEY HAVE NO ROLE ON. The
 *     loader is asked what it hands each kind of person, and the builder is
 *     handed numbers it should not have been and has to leave them out.
 *
 * The words of each row are checked against the design's own
 * (`m-programmes`).
 *
 * ## What is real and what is stubbed
 *
 * Real: `loadTermNumbers`, the review list's loader and builder, the pooled
 * applicants screen's builder, `access.ts`, and the contract's arithmetic
 * under all of them. Stubbed: `server-only` and the one value
 * `firebase-admin/firestore` supplies. The database is in memory.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", "export const FieldValue = { serverTimestamp: () => new Date() }; export class Timestamp {}"],
  ]),
});
const lib = (...parts) => join("lib", "applications", ...parts);

const termHome = await loadTs(lib("lifecycle", "termHome.ts"));
const numbers = await loadTs(lib("lifecycle", "loadTermHome.ts"));
const reviewLoad = await loadTs(lib("review", "load.ts"));
const poolScreen = await loadTs(lib("decisionDay", "pool.ts"));
const normalise = await loadTs(lib("normalise.ts"));

// ---------------------------------------------------------------------------
// 1. The rows, in the design's words
// ---------------------------------------------------------------------------

const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INC = "research-incubator";
const ROUND = "autumn-2026__k3f9a2b1";
const HOME = `/admin/admissions/forms/${ROUND}`;

const counts = (toReview, accepted = 0, pooled = 0, declined = 0) => ({
  all: toReview + accepted + pooled + declined,
  toReview,
  accepted,
  pooled,
  declined,
});

/** The term as the board draws it, on the Wednesday before decision day. */
const BOARD_PROGRAMMES = (viewer) => [
  {
    id: AGI,
    kind: "fellowship",
    shortName: "AGI Strategy",
    role: viewer === "zach" ? "admin" : viewer === "claudia" ? "lead" : viewer === "lloyd" ? "reviewer" : null,
    lead: { name: "Claudia", you: viewer === "claudia" },
  },
  {
    id: TAIS,
    kind: "fellowship",
    shortName: "Technical AI Safety",
    role: viewer === "zach" ? "admin" : null,
    lead: { name: "Zach", you: viewer === "zach" },
  },
  {
    id: INC,
    kind: "incubator",
    shortName: "Research incubator",
    role: viewer === "zach" ? "admin" : null,
    lead: { name: "Zach", you: viewer === "zach" },
  },
];
const BOARD_WORK = {
  [AGI]: { counts: counts(23, 26, 7, 1), waiting: 23 },
  [TAIS]: { counts: counts(19, 20, 3, 0), waiting: 19 },
  [INC]: { counts: counts(5, 12, 6, 0), waiting: 5 },
};

const home = (over = {}) =>
  termHome.buildTermHome({
    stage: "deciding",
    canRunTerm: true,
    home: HOME,
    decisionsDay: "Fri 23 Oct",
    programmes: BOARD_PROGRAMMES("zach"),
    work: BOARD_WORK,
    pool: { pooled: 16, needsOutcome: 16 },
    ...over,
  });

const words = (row) => row.parts.map((part) => part.text).join("");
const tones = (row) => row.parts.map((part) => part.tone);

describe("Needs you, for an admin, in the design's words", () => {
  test("their own programmes, then everybody else's, then the pooled applicants and the send", () => {
    const { needsYou } = home();
    assert.equal(needsYou.empty, null);
    assert.deepEqual(needsYou.rows.map((row) => row.key), [
      `programme:${TAIS}`,
      `programme:${INC}`,
      `programme:${AGI}`,
      "pool",
      "send",
    ]);
    assert.deepEqual(needsYou.rows.map(words), [
      "19 Technical AI Safety applications to review (you)",
      "5 incubator applications to review (you)",
      "23 AGI Strategy applications to review · Claudia",
      "16 pooled applicants need an outcome before Fri 23 Oct",
      "You send every decision at once on Fri 23 Oct.",
    ]);
  });

  test("what is counted is strong, whose it is is muted, and the day of the send is strong", () => {
    const [own, , others, pool, send] = home().needsYou.rows;
    assert.deepEqual(tones(own), ["strong", "plain", "muted"]);
    assert.deepEqual([own.parts[0].text, own.parts[2].text], ["19 Technical AI Safety applications", "(you)"]);
    assert.equal(others.parts[2].text, "· Claudia");
    assert.deepEqual(tones(pool), ["strong", "plain"]);
    assert.equal(pool.parts[0].text, "16 pooled applicants");
    assert.deepEqual(tones(send), ["plain", "strong", "plain"]);
    assert.equal(send.parts[1].text, "Fri 23 Oct");
  });

  test("each row leads to the screen its number comes from, and one of their own is the main thing to do", () => {
    const rows = home().needsYou.rows;
    assert.deepEqual(rows.map((row) => row.link), [
      { label: "Review 19", href: `${HOME}/programmes/${TAIS}/applications`, primary: true },
      { label: "Review 5", href: `${HOME}/programmes/${INC}/applications`, primary: false },
      { label: "Open", href: `${HOME}/programmes/${AGI}/applications`, primary: false },
      { label: "Open", href: `${HOME}/pool`, primary: false },
      { label: "Open", href: `${HOME}/send`, primary: false },
    ]);
    assert.deepEqual(rows.map((row) => row.chip), [null, null, null, null, "Nothing sent yet"]);
  });

  test("one of anything is said as one", () => {
    const one = home({
      work: { ...BOARD_WORK, [INC]: { counts: counts(1), waiting: 1 }, [AGI]: { counts: counts(1), waiting: 1 } },
      pool: { pooled: 4, needsOutcome: 1 },
    });
    const rows = Object.fromEntries(one.needsYou.rows.map((row) => [row.key, row]));
    assert.equal(words(rows[`programme:${INC}`]), "1 incubator application to review (you)");
    assert.equal(rows[`programme:${INC}`].link.label, "Review 1");
    assert.equal(words(rows[`programme:${AGI}`]), "1 AGI Strategy application to review · Claudia");
    assert.equal(words(rows.pool), "1 pooled applicant needs an outcome before Fri 23 Oct");
  });

  test("a row with nothing waiting is left out, and the main thing to do moves to the next of their own", () => {
    const rows = home({ work: { ...BOARD_WORK, [TAIS]: { counts: counts(0, 20, 3), waiting: 0 } } }).needsYou.rows;
    assert.deepEqual(rows.map((row) => row.key), [`programme:${INC}`, `programme:${AGI}`, "pool", "send"]);
    assert.equal(rows[0].link.primary, true);
    const none = home({ pool: { pooled: 16, needsOutcome: 0 } }).needsYou.rows;
    assert.ok(!none.some((row) => row.key === "pool"), "every pooled applicant has an outcome: nothing to pick");
  });

  test("a programme nobody leads says so, and a form with no day set does not invent one", () => {
    const programmes = BOARD_PROGRAMMES("zach").map((each) => (each.id === AGI ? { ...each, lead: null } : each));
    const rows = home({ programmes, decisionsDay: null }).needsYou.rows;
    assert.equal(words(rows[2]), "23 AGI Strategy applications to review · no lead yet");
    assert.equal(words(rows[3]), "16 pooled applicants need an outcome before decision day");
    assert.equal(words(rows[4]), "You send every decision at once.");
  });

  test("the incubator is called the incubator only while the form has one", () => {
    const programmes = [
      ...BOARD_PROGRAMMES("zach"),
      { id: "governance-incubator", kind: "incubator", shortName: "Governance incubator", role: "admin", lead: null },
    ];
    const rows = home({
      programmes,
      work: { ...BOARD_WORK, "governance-incubator": { counts: counts(2), waiting: 2 } },
    }).needsYou.rows;
    const texts = rows.map(words);
    assert.ok(texts.includes("5 Research incubator applications to review (you)"));
    assert.ok(texts.includes("2 Governance incubator applications to review · no lead yet"));
  });
});

describe("Needs you, for a lead and for a reviewer", () => {
  const forLead = (over = {}) =>
    home({ canRunTerm: false, programmes: BOARD_PROGRAMMES("claudia"), work: { [AGI]: BOARD_WORK[AGI] }, pool: null, ...over });

  test("a lead has their own programme and nothing an admin does", () => {
    const view = forLead();
    assert.deepEqual(view.needsYou.rows.map(words), ["23 AGI Strategy applications to review (you)"]);
    assert.deepEqual(view.needsYou.rows[0].link, {
      label: "Review 23",
      href: `${HOME}/programmes/${AGI}/applications`,
      primary: true,
    });
    assert.equal(view.pooled, null);
    assert.deepEqual(Object.keys(view.cards), [AGI]);
  });

  test("a reviewer's row is what they have left to score", () => {
    const view = home({
      canRunTerm: false,
      programmes: BOARD_PROGRAMMES("lloyd"),
      work: { [AGI]: { counts: counts(23, 26, 7, 1), waiting: 9 } },
      pool: null,
    });
    assert.deepEqual(view.needsYou.rows.map(words), ["9 AGI Strategy applications to review (you)"]);
    assert.equal(view.cards[AGI].action.label, "Review 9");
    assert.equal(view.cards[AGI].counts.toReview, 23, "the card still shows where the programme stands");
  });

  test("with nothing waiting they are told so while the term is in session, and shown no card outside it", () => {
    const idle = { [AGI]: { counts: counts(0, 30, 2), waiting: 0 } };
    for (const stage of ["open", "deciding"]) {
      assert.deepEqual(forLead({ stage, work: idle }).needsYou, { rows: [], empty: "Nothing needs you right now." }, stage);
    }
    for (const stage of ["draft", "opens-later", "decided", "settled", "cancelled", "archived"]) {
      assert.equal(forLead({ stage, work: idle }).needsYou, null, stage);
    }
  });
});

describe("nobody is shown a number about a programme they have no role on", () => {
  test("numbers handed in for a programme the caller has no role on are left out, rows and cards both", () => {
    // Claudia leads AGI Strategy only. The other two are handed in by mistake.
    const view = home({ canRunTerm: false, programmes: BOARD_PROGRAMMES("claudia"), work: BOARD_WORK, pool: null });
    assert.deepEqual(view.needsYou.rows.map((row) => row.key), [`programme:${AGI}`]);
    assert.deepEqual(Object.keys(view.cards), [AGI]);
    const everything = JSON.stringify(view);
    for (const leak of ["19", "Technical AI Safety", "incubator", "pooled applicant"]) {
      assert.ok(!everything.includes(leak), `${leak} reached somebody with no role on it`);
    }
  });

  test("the pooled numbers and the send are for somebody who runs the term", () => {
    // Handed the pooled numbers by mistake, with `canRunTerm` false.
    const view = home({ canRunTerm: false, programmes: BOARD_PROGRAMMES("claudia"), work: { [AGI]: BOARD_WORK[AGI] } });
    assert.ok(!view.needsYou.rows.some((row) => row.key === "pool" || row.key === "send"));
    assert.equal(view.pooled, null);
    assert.ok(!JSON.stringify(view).includes("/pool"));
    assert.ok(!JSON.stringify(view).includes("/send"));
  });

  test("somebody with a role and no numbers gets no card, and a name every object carries finds none", () => {
    const view = home({ work: { constructor: BOARD_WORK[AGI] } });
    assert.deepEqual(Object.keys(view.cards), []);
    const odd = home({
      programmes: [{ id: "constructor", kind: "fellowship", shortName: "Stray", role: "admin", lead: null }],
      work: {},
    });
    assert.deepEqual(Object.keys(odd.cards), []);
    assert.deepEqual(odd.needsYou.rows.map((row) => row.key), ["pool", "send"]);
  });
});

describe("each programme card's one button", () => {
  test("review what is waiting on their own, see the list on anybody else's", () => {
    const { cards } = home();
    assert.deepEqual(cards[TAIS].action, { label: "Review 19", href: `${HOME}/programmes/${TAIS}/applications` });
    assert.deepEqual(cards[INC].action, { label: "Review 5", href: `${HOME}/programmes/${INC}/applications` });
    assert.deepEqual(cards[AGI].action, { label: "See applications", href: `${HOME}/programmes/${AGI}/applications` });
    assert.deepEqual(cards[AGI].counts, counts(23, 26, 7, 1));
    const idle = home({ work: { ...BOARD_WORK, [TAIS]: { counts: counts(0, 24), waiting: 0 } } });
    assert.equal(idle.cards[TAIS].action.label, "See applications");
  });
});

describe("Also this term", () => {
  test("the pooled applicants, in the design's words, while the term is in session", () => {
    assert.deepEqual(home().pooled, {
      chip: "16 so far",
      line: "Nobody hears anything until Fri 23 Oct. Pick each person’s outcome before then.",
      link: { label: "See pooled applicants", href: `${HOME}/pool` },
    });
    assert.match(home({ decisionsDay: null }).pooled.line, /^Nobody hears anything until decision day\./);
  });

  test("once decisions are sent it says so, and before anybody can apply it is not there", () => {
    for (const stage of ["decided", "settled"]) {
      const { pooled, needsYou } = home({ stage, work: {}, pool: { pooled: 55, needsOutcome: 0 } });
      assert.equal(pooled.chip, "55 this term", stage);
      assert.equal(pooled.line, "Everybody has been told. What each person heard is on their row.", stage);
      assert.equal(needsYou, null, "nothing is waiting and the send is behind them");
    }
    for (const stage of ["draft", "opens-later", "cancelled", "archived"]) {
      assert.equal(home({ stage, work: {}, pool: { pooled: 0, needsOutcome: 0 } }).pooled, null, stage);
    }
  });

  test("the send row is there only while the send is still ahead", () => {
    for (const stage of ["open", "deciding"]) {
      assert.ok(home({ stage }).needsYou.rows.some((row) => row.key === "send"), stage);
    }
    for (const stage of ["draft", "opens-later", "decided", "settled"]) {
      const view = home({ stage });
      assert.ok(!(view.needsYou?.rows ?? []).some((row) => row.key === "send"), stage);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The numbers, beside the screens they link to
// ---------------------------------------------------------------------------

const NOW = new Date("2026-10-21T10:00:00Z");
const SENT_AT = new Date("2026-10-12T10:00:00Z");
const GRID = { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 };

const PERMISSIONS = {
  draftNewsletter: false,
  approveNewsletter: false,
  draftEvent: false,
  approveEvent: false,
  draftCourse: false,
  approveCourse: false,
  manageMembership: false,
  circulateWorksheet: false,
};
const session = (uid, role, suRecognised = false) => ({
  uid,
  email: `${uid}@example.com`,
  displayName: uid[0].toUpperCase() + uid.slice(1),
  role,
  suRecognised,
  permissions: PERMISSIONS,
});
const CAST = {
  zach: session("zach", "admin"),
  claudia: session("claudia", "committee", true),
  lloyd: session("lloyd", "committee", true),
  /** SU-recognised committee, named nowhere on the form. */
  yusuf: session("yusuf", "committee", true),
  priya: session("priya", "member"),
};

/** Documents by path, with the reads the three loaders make. Nothing here writes. */
function makeDb(seed) {
  const docs = new Map(Object.entries(seed).map(([path, data]) => [path, structuredClone(data)]));
  const reads = [];
  const last = (path) => path.split("/").pop();
  const snap = (path) => ({
    id: last(path),
    exists: docs.has(path),
    data: () => (docs.has(path) ? structuredClone(docs.get(path)) : undefined),
  });
  const childrenOf = (collectionPath) =>
    [...docs.keys()].filter(
      (path) => path.startsWith(`${collectionPath}/`) && !path.slice(collectionPath.length + 1).includes("/"),
    );
  const query = (path, filters) => ({
    where: (field, op, value) => {
      assert.equal(op, "==", "these loaders only ever ask one equality at a time");
      return query(path, [...filters, [field, value]]);
    },
    get: async () => {
      reads.push(path);
      return {
        docs: childrenOf(path)
          .filter((child) => filters.every(([field, value]) => docs.get(child)[field] === value))
          .map(snap),
      };
    },
  });
  const docRef = (path) => ({
    id: last(path),
    path,
    get: async () => {
      reads.push(path);
      return snap(path);
    },
    collection: (name) => collection(`${path}/${name}`),
  });
  const collection = (path) => ({ ...query(path, []), doc: (id) => docRef(`${path}/${id}`) });
  return {
    reads,
    collection,
    getAll: async (...refs) =>
      refs.map((ref) => {
        reads.push(ref.path);
        return snap(ref.path);
      }),
    put: (path, data) => docs.set(path, structuredClone(data)),
  };
}

const programme = (over) => ({
  kind: "fellowship",
  pitch: "",
  facts: "",
  starts: "w/c 26 Oct",
  places: 4,
  groupCount: 1,
  groupSize: "Up to 8",
  leadUid: null,
  reviewerUids: [],
  useScores: true,
  closed: false,
  runId: null,
  emailWording: {},
  ...over,
});
const question = (id, over = {}) => ({
  id,
  text: `Question ${id}`,
  help: "",
  type: "long",
  options: [],
  optionsFromRanking: false,
  wordLimit: 300,
  required: true,
  scored: false,
  ...over,
});

const ROUND_DOC = {
  formVersion: 2,
  kind: "enrolment",
  label: "Autumn 2026",
  slug: "autumn-2026",
  status: "deciding",
  opensAt: new Date("2026-10-06T08:00:00Z"),
  closesAt: new Date("2026-10-18T22:59:00Z"),
  decisionsByDate: "2026-10-23",
  invitationReplyBy: "2026-10-25",
  stageIds: [],
  availabilityGrid: GRID,
  reviewerUids: ["zach", "claudia", "lloyd"],
  finalDeciderUid: null,
  archived: false,
  authorUid: "zach",
  programmeIds: [AGI, TAIS, INC],
  programmes: {
    [AGI]: programme({ name: "AGI Strategy Fellowship", shortName: "AGI Strategy", leadUid: "claudia", reviewerUids: ["lloyd"] }),
    [TAIS]: programme({ name: "Technical AI Safety Fellowship", shortName: "Technical AI Safety", leadUid: "zach" }),
    [INC]: programme({ kind: "incubator", name: "Research Incubator", shortName: "Research incubator", leadUid: "zach", useScores: false }),
  },
  questionSetIds: ["fellowships", AGI, TAIS, "incubator"],
  asksFacilitating: false,
  revealOtherReviews: false,
  noOfferWording: null,
  decisionsSentAt: null,
  decisionsSentByUid: null,
};

/** [uid, name, ranking, status] */
const APPLICANTS = [
  ["amara", "Amara Okafor", [AGI, TAIS], "submitted"],
  ["ben", "Ben Hartley", [AGI], "submitted"],
  ["dev", "Dev Patel", [AGI, INC], "submitted"],
  ["wen", "Wen Zhao", [TAIS, AGI], "submitted"],
  ["sam", "Sam Whitfield", [TAIS], "submitted"],
  ["nina", "Nina Kowalski", [INC], "submitted"],
  ["rosa", "Rosa García", [AGI], "submitted"],
  ["oliver", "Oliver Grant", [INC, TAIS], "submitted"],
  // Somebody who sent and then withdrew: listed on the programme's list, and
  // in none of its numbers (`isInTerm`).
  ["george", "George Mills", [AGI], "withdrawn"],
  // The lead of AGI Strategy applied to it as well.
  ["claudia", "Claudia Reyes", [AGI, TAIS], "submitted"],
];

function applicationDoc([uid, name, ranked, status]) {
  const answers = { fellowships: { why: `${name} wants to understand it.` } };
  if (ranked.includes(AGI)) answers[AGI] = { event: "A new law came into force.", law: "It changes who is liable." };
  if (ranked.includes(TAIS)) answers[TAIS] = { built: "A small classifier." };
  if (ranked.includes(INC)) answers.incubator = { idea: "Measure it." };
  const content = {
    aboutYou: {
      preferredName: name.split(" ")[0],
      universityEmail: `${uid}@students.example.com`,
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "",
      subject: "BA Philosophy",
      expectedGraduation: "2028-07",
      motivation: "I want to know which arguments hold up.",
      interests: "Governance",
    },
    rankedProgrammeIds: ranked,
    wantsToFacilitate: null,
    answers,
    availability: { ...GRID, days: ["", "000000000fff", "", "", "", "", ""] },
    suMembership: "yes",
  };
  return {
    formVersion: 2,
    roundId: ROUND,
    uid,
    email: `${uid}@example.com`,
    displayName: name,
    draft: content,
    sent: content,
    status,
    submittedAt: SENT_AT,
    sentAt: SENT_AT,
    withdrawnAt: status === "withdrawn" ? NOW : null,
    result: null,
    invitation: null,
    attendance: null,
    createdAt: SENT_AT,
    updatedAt: SENT_AT,
  };
}

const decided = (decision, by) => ({
  decision,
  poolReason: null,
  couldSuitProgrammeId: null,
  decidedByUid: by,
  decidedAt: NOW,
});
const decisionDoc = (uid, programmes, pooledOutcome = null) => ({ roundId: ROUND, uid, programmes, pooledOutcome, exception: null });

const set = (data) => ({ roundId: ROUND, intro: "", ...data });

function seed() {
  const out = {
    [`admissionRounds/${ROUND}`]: ROUND_DOC,
    [`admissionRounds/${ROUND}/questionSets/fellowships`]: set({
      role: "general",
      scope: { type: "kind", kind: "fellowship" },
      label: "Fellowships",
      questions: [question("why")],
    }),
    [`admissionRounds/${ROUND}/questionSets/${AGI}`]: set({
      role: "stream",
      scope: { type: "programme", programmeId: AGI },
      label: "AGI Strategy",
      questions: [question("event", { scored: true }), question("law", { scored: true })],
    }),
    [`admissionRounds/${ROUND}/questionSets/${TAIS}`]: set({
      role: "stream",
      scope: { type: "programme", programmeId: TAIS },
      label: "Technical AI Safety",
      questions: [question("built", { scored: true })],
    }),
    [`admissionRounds/${ROUND}/questionSets/incubator`]: set({
      role: "general",
      scope: { type: "kind", kind: "incubator" },
      label: "Research incubator",
      questions: [question("idea")],
    }),
    // Ben is accepted by AGI Strategy. Dev is pooled by both he ranked and has
    // nothing picked. Rosa is pooled and has no offer picked. Wen is accepted by
    // her first choice, so AGI Strategy owes her nothing. Sam is declined.
    [`admissionDecisions/${ROUND}__ben`]: decisionDoc("ben", { [AGI]: decided("accept", "claudia") }),
    [`admissionDecisions/${ROUND}__dev`]: decisionDoc("dev", { [AGI]: decided("pool", "claudia"), [INC]: decided("pool", "zach") }),
    [`admissionDecisions/${ROUND}__rosa`]: decisionDoc(
      "rosa",
      { [AGI]: decided("pool", "claudia") },
      { kind: "no-offer", setByUid: "zach", setAt: NOW },
    ),
    [`admissionDecisions/${ROUND}__wen`]: decisionDoc("wen", { [TAIS]: decided("accept", "zach") }),
    [`admissionDecisions/${ROUND}__sam`]: decisionDoc("sam", { [TAIS]: decided("decline", "zach") }),
    // Lloyd has scored both of Amara's AGI Strategy answers, and one of Claudia's.
    [`admissionReviews/${ROUND}__amara__lloyd`]: {
      roundId: ROUND,
      applicantUid: "amara",
      reviewerUid: "lloyd",
      scores: { [`${AGI}.event`]: 4, [`${AGI}.law`]: 3 },
      comments: [],
      overallComment: "",
    },
    [`admissionReviews/${ROUND}__claudia__lloyd`]: {
      roundId: ROUND,
      applicantUid: "claudia",
      reviewerUid: "lloyd",
      scores: { [`${AGI}.event`]: 5 },
      comments: [],
      overallComment: "",
    },
  };
  for (const applicant of APPLICANTS) out[`admissionApplications/${ROUND}__${applicant[0]}`] = applicationDoc(applicant);
  for (const [uid, user] of Object.entries(CAST)) {
    out[`users/${uid}`] = {
      role: user.role,
      suRecognised: user.suRecognised,
      displayName: user.displayName,
      email: user.email,
      profile: { preferredName: user.displayName, motivation: "" },
    };
  }
  for (const [uid, name] of APPLICANTS) {
    out[`users/${uid}`] ??= { role: "member", displayName: name, email: `${uid}@example.com`, profile: { preferredName: name.split(" ")[0] } };
  }
  return out;
}

/** The form as a page would hold it once it has loaded the round. */
const formOf = () => normalise.normaliseForm(ROUND, ROUND_DOC);

describe("a programme's numbers are the ones its own list works out", () => {
  for (const who of ["zach", "claudia", "lloyd"]) {
    test(`as ${who}: the counts on each card and the number on each button are the list's`, async () => {
      const db = makeDb(seed());
      const form = formOf(db);
      const mine = await numbers.loadTermNumbers(db, CAST[who], form);
      const expected = who === "zach" ? [AGI, TAIS, INC] : [AGI];
      assert.deepEqual(Object.keys(mine.work), expected);
      for (const programmeId of expected) {
        const list = await reviewLoad.loadProgrammeBoard(db, CAST[who], ROUND, programmeId);
        assert.equal(list.ok, true);
        assert.deepEqual(mine.work[programmeId].counts, list.board.counts, programmeId);
        assert.equal(mine.work[programmeId].waiting, list.board.queue.length, programmeId);
        // The places line is the head of that list, number for number.
        assert.deepEqual(
          mine.work[programmeId].places,
          {
            placed: list.board.progress.placed,
            invited: list.board.progress.invited,
            left: list.board.progress.placesLeft,
          },
          programmeId,
        );
        // And it is the number of rows that list would walk.
        assert.ok(list.board.queue.every((uid) => list.board.rows.some((row) => row.uid === uid)));
      }
    });
  }

  test("the numbers themselves, so a wrong answer agreed on by both would still be seen", async () => {
    const db = makeDb(seed());
    const form = formOf(db);
    const admin = await numbers.loadTermNumbers(db, CAST.zach, form);
    // AGI Strategy: amara, ben, dev, wen, rosa and claudia ranked it and are
    // in the term. George ranked it too and has withdrawn, so he is counted
    // nowhere. Ben accepted; dev and rosa pooled; wen has a place at her first
    // choice; amara and claudia are still owed a decision.
    assert.deepEqual(admin.work[AGI].counts, { all: 6, toReview: 2, accepted: 1, pooled: 2, declined: 0 });
    assert.equal(admin.work[AGI].waiting, 2);
    assert.deepEqual(Object.keys(admin.work[AGI]).sort(), ["counts", "places", "waiting"]);
    // Places: Ben holds one of AGI Strategy's four, Wen one of Technical AI
    // Safety's, and nobody holds one on the incubator.
    assert.deepEqual(admin.work[AGI].places, { placed: 1, invited: 0, left: 3 });
    assert.deepEqual(admin.work[TAIS].places, { placed: 1, invited: 0, left: 3 });
    assert.deepEqual(admin.work[INC].places, { placed: 0, invited: 0, left: 4 });
    assert.deepEqual(admin.work[TAIS].counts, { all: 5, toReview: 3, accepted: 1, pooled: 0, declined: 1 });
    assert.deepEqual(admin.work[INC].counts, { all: 3, toReview: 2, accepted: 0, pooled: 1, declined: 0 });
  });

  test("a lead's own application is left out before anything is counted", async () => {
    const db = makeDb(seed());
    const form = formOf(db);
    const lead = await numbers.loadTermNumbers(db, CAST.claudia, form);
    const admin = await numbers.loadTermNumbers(db, CAST.zach, form);
    assert.equal(lead.work[AGI].counts.all, admin.work[AGI].counts.all - 1);
    assert.equal(lead.work[AGI].counts.toReview, 1);
    assert.equal(lead.work[AGI].waiting, 1);
  });

  test("a reviewer's number is what they have not finished scoring, and falls as they score", async () => {
    const db = makeDb(seed());
    const form = formOf(db);
    const before = await numbers.loadTermNumbers(db, CAST.lloyd, form);
    // Owed a decision: amara and claudia. Lloyd has finished amara.
    assert.equal(before.work[AGI].counts.toReview, 2);
    assert.equal(before.work[AGI].waiting, 1);
    db.put(`admissionReviews/${ROUND}__claudia__lloyd`, {
      roundId: ROUND,
      applicantUid: "claudia",
      reviewerUid: "lloyd",
      scores: { [`${AGI}.event`]: 5, [`${AGI}.law`]: 4 },
      comments: [],
      overallComment: "",
    });
    const after = await numbers.loadTermNumbers(db, CAST.lloyd, form);
    assert.equal(after.work[AGI].waiting, 0);
    assert.equal(after.work[AGI].counts.toReview, 2, "scoring decides nothing");
  });
});

describe("the pooled numbers are the ones the pooled applicants screen shows", () => {
  test("for an admin they match that screen's own, and say what they should", async () => {
    const db = makeDb(seed());
    const form = formOf(db);
    const mine = await numbers.loadTermNumbers(db, CAST.zach, form);
    const screen = await poolScreen.buildPoolBoard(db, form, NOW);
    assert.deepEqual(mine.pool, { pooled: screen.counts.pooled, needsOutcome: screen.counts.needsOutcome });
    // Dev (nothing picked) and Rosa (no offer picked) are pooled.
    assert.deepEqual(mine.pool, { pooled: 2, needsOutcome: 1 });
  });

  test("nobody else is handed them", async () => {
    const db = makeDb(seed());
    const form = formOf(db);
    for (const who of ["claudia", "lloyd", "yusuf", "priya"]) {
      assert.equal((await numbers.loadTermNumbers(db, CAST[who], form)).pool, null, who);
    }
  });
});

describe("who is handed what", () => {
  test("somebody on no programme is handed nothing at all", async () => {
    const db = makeDb(seed());
    const form = formOf(db);
    for (const who of ["yusuf", "priya"]) {
      assert.deepEqual(await numbers.loadTermNumbers(db, CAST[who], form), { work: {}, pool: null }, who);
    }
  });

  test("a lead who loses their standing is handed nothing, though the form still names them", async () => {
    const db = makeDb(seed());
    const form = formOf(db);
    const fallen = { ...CAST.claudia, suRecognised: false };
    assert.deepEqual(await numbers.loadTermNumbers(db, fallen, form), { work: {}, pool: null });
  });

  test("what leaves the loader is numbers, and nothing about any applicant", async () => {
    const db = makeDb(seed());
    const form = formOf(db);
    for (const who of Object.keys(CAST)) {
      const text = JSON.stringify(await numbers.loadTermNumbers(db, CAST[who], form));
      for (const [uid, name] of APPLICANTS) {
        assert.ok(!text.includes(name.split(" ")[0]) && !text.includes(`"${uid}"`), `${name} reached ${who}`);
      }
      assert.doesNotMatch(text, /@|example\.com/);
    }
  });

  test("reviews and question sets are read only for somebody whose number depends on them", async () => {
    const reading = async (who) => {
      const db = makeDb(seed());
      await numbers.loadTermNumbers(db, CAST[who], formOf(db));
      return db.reads;
    };
    for (const who of ["zach", "claudia"]) {
      const reads = await reading(who);
      assert.deepEqual([...reads].sort(), ["admissionApplications", "admissionDecisions"], who);
    }
    assert.deepEqual(
      [...(await reading("lloyd"))].sort(),
      ["admissionApplications", "admissionDecisions", "admissionReviews", `admissionRounds/${ROUND}/questionSets`],
    );
  });
});
