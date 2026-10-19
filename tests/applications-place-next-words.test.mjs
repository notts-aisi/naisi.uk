/**
 * What somebody with a place is told comes next, for each kind of programme:
 * in the "You're in" email, on their own page, and on the steps before it.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * A fellowship is a small group with a facilitator, on campus, and its people
 * are emailed their group and when it meets. An incubator is not run that
 * way, and its people are told only that an email about the first week is
 * coming. The sentence is written once for each kind (`placeNextWords` in
 * `src/lib/applications/decisionDay/emailCopy.ts`), and seven things have to
 * hold:
 *
 *  1. THE WORDS OF EACH KIND. A fellowship's are pinned in the three places
 *     they are said. An incubator's are one sentence, the same in all three.
 *  2. THE STANDARD EMAIL AND THE PAGE SAY THE SAME THING, FOR EACH KIND. One
 *     stored form is composed into the email and drawn as the person's own
 *     page, for somebody placed on a fellowship and on an incubator, by their
 *     own ranking and by an invitation they accepted. Each carries what its
 *     kind is told and nothing the other kind is told.
 *  3. AN INCUBATOR'S PEOPLE ARE PROMISED NO GROUP: nothing about a small
 *     group, a facilitator, a campus or a group that meets, in the email, on
 *     the page or on the steps.
 *  4. A PROGRAMME'S OWN WORDING STILL WINS, part by part, whatever its kind.
 *  5. THE LAST OF THE THREE STEPS is "Meet your group" only for somebody who
 *     can end up nowhere but a fellowship.
 *  6. THE PAGE TYPES NONE OF IT. It draws the view's own words, and the view
 *     takes them from the email's table.
 *  7. THE SENTENCES ARE TYPED IN ONE FILE. Every source file is read for
 *     them, so a new screen or a new email cannot come to say its own.
 *
 * The send, the preview before it, the test an admin sends and a programme's
 * own test all compose through `composeDecisionEmail`:
 * `tests/applications-decision-day-send.test.mjs` runs each of them, an
 * incubator's test among them.
 *
 * Stubbed: `server-only`, `next/link` (an anchor), the router the reply
 * buttons ask for, and the two stylesheets (each class is its own name).
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

globalThis.__placeNext = { h: createElement };

const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["next/link", "export default ({ href, className, children }) => globalThis.__placeNext.h('a', { href, className }, children);"],
    ["next/navigation", "export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });"],
    ["@/features/applications/kit/kit.module.css", CLASS_NAMES],
    ["./status.module.css", CLASS_NAMES],
  ]),
});

const copy = await loadTs(join("lib", "applications", "decisionDay", "emailCopy.ts"));
const view = await loadTs(join("lib", "applications", "status", "view.ts"));
const model = await loadTs(join("lib", "applications", "model.ts"));
const normalise = await loadTs(join("lib", "applications", "normalise.ts"));
const project = await loadTs(join("lib", "applications", "applicant", "project.ts"));
const { default: StatusPage } = await loadTs(join("features", "applications", "status", "StatusPage.tsx"));

// ---------------------------------------------------------------------------
// One stored form, with a programme of each kind
// ---------------------------------------------------------------------------

const ROUND = "autumn-2026__pl4c3n3xt";
const FELLOWSHIP = "agi-strategy";
const INCUBATOR = "research-incubator";
const KINDS = ["fellowship", "incubator"];
const ID_OF = { fellowship: FELLOWSHIP, incubator: INCUBATOR };
const NAME_OF = { fellowship: "AGI Strategy Fellowship", incubator: "Research Incubator" };

const programme = (kind, name, shortName, facts, over = {}) => ({
  kind,
  name,
  shortName,
  pitch: "",
  facts,
  starts: "w/c 26 Oct",
  places: 12,
  leadUid: "lead",
  reviewerUids: [],
  useScores: true,
  ...over,
});

function formWith(over = {}) {
  return normalise.normaliseForm(ROUND, {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    status: "deciding",
    opensAt: new Date("2026-10-06T08:00:00Z"),
    closesAt: new Date("2026-10-18T22:59:00Z"),
    decisionsByDate: "2026-10-23",
    programmeIds: [FELLOWSHIP, INCUBATOR],
    programmes: {
      [FELLOWSHIP]: programme("fellowship", NAME_OF.fellowship, "AGI Strategy", "6 WEEKS · ~5 HRS A WEEK", over[FELLOWSHIP]),
      [INCUBATOR]: programme("incubator", NAME_OF.incubator, "Research incubator", "10 WEEKS · SELECTIVE", over[INCUBATOR]),
    },
    questionSetIds: [],
  });
}

const FORM = formWith();
/** After the close and after decision day, so the form reads as it does when a result is out. */
const NOW = new Date("2026-10-23T12:00:00+01:00");
const TODAY = "2026-10-23";

/** The standard "You're in" email for a place on a programme of this form. */
function emailFor(programmeId, form = FORM) {
  return copy.composeDecisionEmail({
    outcome: { kind: "accepted", programmeId },
    firstName: "Chloe",
    form,
    ranked: [programmeId],
    leadNames: { [FELLOWSHIP]: "Claudia", [INCUBATOR]: "Tess" },
    replyBy: "Sun 25 Oct",
    links: { application: `https://staging.example.com/applications/${ROUND}`, events: "https://staging.example.com/events" },
  });
}

/** Somebody's own application once decision day has published a result onto it. */
function applicationWith(state, ranked) {
  const content = {
    aboutYou: { preferredName: "Chloe" },
    rankedProgrammeIds: ranked,
    wantsToFacilitate: null,
    answers: {},
  };
  return {
    id: `${ROUND}__chloe`,
    roundId: ROUND,
    draft: content,
    sent: content,
    createdAt: null,
    updatedAt: null,
    submittedAt: "2026-10-17T10:00:00.000Z",
    sentAt: "2026-10-17T10:00:00.000Z",
    sentLabel: "Sat 17 Oct",
    ...state,
  };
}

const placedByRanking = (programmeId) =>
  applicationWith(
    {
      status: "accepted",
      result: { kind: "accepted", programmeId, publishedAt: "2026-10-23T11:00:00.000Z" },
      invitation: null,
      attendance: null,
    },
    [programmeId],
  );

/** Ranked the other programme, was invited to this one, and accepted. */
const placedByInvitation = (programmeId) =>
  applicationWith(
    {
      status: "accepted",
      result: { kind: "invited", programmeId, publishedAt: "2026-10-23T11:00:00.000Z" },
      invitation: { programmeId, replyBy: "2026-10-25", response: "accepted", respondedAt: "2026-10-23T12:00:00.000Z" },
      attendance: null,
    },
    [programmeId === FELLOWSHIP ? INCUBATOR : FELLOWSHIP],
  );

const viewOf = (application, form = FORM) =>
  view.statusViewFor(project.projectFormForApplicant(form, NOW), [], application, TODAY);

const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** The person's own page, drawn as the route draws it. */
const pageOf = (application, form = FORM) =>
  textOf(renderToStaticMarkup(createElement(StatusPage, { roundId: ROUND, view: viewOf(application, form), viewingAs: false })));

// ---------------------------------------------------------------------------
// What each kind is told, as phrases a sentence either carries or does not
// ---------------------------------------------------------------------------

const FELLOWSHIP_EMAIL =
  "You’ll be in a small group with a facilitator, on campus, and we’ll email you your group and when it meets before you start.";
const FELLOWSHIP_PAGE =
  "You’ll be in a small group with a facilitator, on campus. Before you start, we’ll email you your group and when it meets.";
const FELLOWSHIP_CARD = "You’ll be in a small group with a facilitator, on campus.";
const INCUBATOR_SENTENCE = "We’ll email you before you start with how the first week works.";

/** What a place of each kind is told: every phrase is in the email and on the page of that kind. */
const TOLD = {
  fellowship: ["a small group with a facilitator, on campus", "your group and when it meets"],
  incubator: [INCUBATOR_SENTENCE],
};

/** What an incubator's people are never told, wherever they read it. */
const NOT_AN_INCUBATOR = /small group|facilitator|campus|your group|when it meets/i;

// ---------------------------------------------------------------------------
// 1. The words of each kind
// ---------------------------------------------------------------------------

describe("what somebody with a place is told comes next", () => {
  test("a fellowship's words, in each of the three places they are said", () => {
    assert.deepEqual(copy.placeNextWords("fellowship"), {
      email: FELLOWSHIP_EMAIL,
      page: FELLOWSHIP_PAGE,
      card: FELLOWSHIP_CARD,
    });
  });

  test("an incubator's are one sentence, the same in all three", () => {
    assert.deepEqual(copy.placeNextWords("incubator"), {
      email: INCUBATOR_SENTENCE,
      page: INCUBATOR_SENTENCE,
      card: INCUBATOR_SENTENCE,
    });
  });

  test("every kind of programme has words, and they are sentences", () => {
    // The model's own list of kinds: a kind added there is run here, or this fails.
    assert.ok(model.PROGRAMME_KINDS.length >= 2);
    assert.deepEqual([...model.PROGRAMME_KINDS].sort(), [...KINDS].sort(), "a kind of programme is not run in this suite");
    for (const kind of KINDS) {
      for (const [where, sentence] of Object.entries(copy.placeNextWords(kind))) {
        assert.match(sentence, /^[A-Z].*\.$/, `${kind}, ${where}`);
      }
    }
  });

  test("a place on a programme the form no longer carries reads as a fellowship's, and so does a name no kind has", () => {
    assert.deepEqual(copy.placeNextWords(null), copy.placeNextWords("fellowship"));
    for (const name of ["constructor", "toString", "__proto__", ""]) {
      assert.deepEqual(copy.placeNextWords(name), copy.placeNextWords("fellowship"), JSON.stringify(name));
    }
  });
});

// ---------------------------------------------------------------------------
// 2 and 3. The email and the page, from one form
// ---------------------------------------------------------------------------

describe("the standard email and the person's own page say the same thing, for each kind", () => {
  for (const kind of KINDS) {
    const other = kind === "fellowship" ? "incubator" : "fellowship";
    const id = ID_OF[kind];

    test(`${kind}: the email's first paragraph ends on the words of its kind`, () => {
      const email = emailFor(id);
      assert.equal(email.subject, kind === "fellowship" ? "You’re in AGI Strategy" : "You’re in Research incubator");
      assert.equal(
        email.paragraphs[0],
        `You’re in the ${NAME_OF[kind]}. It starts w/c 26 Oct. ${copy.placeNextWords(kind).email}`,
      );
      // The second paragraph and the buttons are the same for every kind.
      assert.equal(email.paragraphs.length, 2);
      assert.deepEqual(email.buttons.map((button) => button.label), ["I’m coming", "I can’t make it"]);
    });

    test(`${kind}: the page of somebody their ranking placed says what the email says`, () => {
      const shown = viewOf(placedByRanking(id));
      assert.equal(shown.kind, "place");
      assert.equal(shown.via, "ranking");
      assert.equal(shown.next, copy.placeNextWords(kind).page);

      const page = pageOf(placedByRanking(id));
      const email = emailFor(id).paragraphs.join(" ");
      assert.ok(page.includes(copy.placeNextWords(kind).page), `the page does not print its sentence: ${page}`);
      for (const phrase of TOLD[kind]) {
        assert.ok(email.includes(phrase), `the email does not say "${phrase}"`);
        assert.ok(page.includes(phrase), `the page does not say "${phrase}"`);
      }
      for (const phrase of TOLD[other]) {
        assert.ok(!email.includes(phrase), `the email says what a place on the other kind is told: "${phrase}"`);
        assert.ok(!page.includes(phrase), `the page says what a place on the other kind is told: "${phrase}"`);
      }
    });

    test(`${kind}: the card of somebody who accepted an invitation says its kind's line`, () => {
      const shown = viewOf(placedByInvitation(id));
      assert.equal(shown.kind, "place");
      assert.equal(shown.via, "invitation");
      assert.equal(shown.next, copy.placeNextWords(kind).card);
      const page = pageOf(placedByInvitation(id));
      assert.ok(page.includes(copy.placeNextWords(kind).card), page);
      for (const phrase of TOLD[other]) assert.ok(!page.includes(phrase), `the card says "${phrase}"`);
    });
  }

  test("a fellowship's page and card read as they always have", () => {
    assert.ok(pageOf(placedByRanking(FELLOWSHIP)).includes(`6 WEEKS · ~5 HRS A WEEK · starts w/c 26 Oct ${FELLOWSHIP_PAGE} I’m coming`));
    assert.ok(pageOf(placedByInvitation(FELLOWSHIP)).includes(`6 WEEKS · starts w/c 26 Oct ${FELLOWSHIP_CARD}`));
  });

  test("an incubator's people are promised no group, in the email, on the page or on the card", () => {
    const email = emailFor(INCUBATOR);
    assert.equal(
      email.paragraphs[0],
      `You’re in the Research Incubator. It starts w/c 26 Oct. ${INCUBATOR_SENTENCE}`,
    );
    // The whole email and the whole page, the reply buttons and their notes included.
    assert.doesNotMatch([email.subject, email.greeting, ...email.paragraphs].join(" "), NOT_AN_INCUBATOR);
    for (const application of [placedByRanking(INCUBATOR), placedByInvitation(INCUBATOR)]) {
      assert.equal(viewOf(application).next, INCUBATOR_SENTENCE);
      const page = pageOf(application);
      assert.ok(page.includes(INCUBATOR_SENTENCE), page);
      assert.doesNotMatch(page, NOT_AN_INCUBATOR, page);
    }
  });

  test("the scanner for what an incubator is never told sees a fellowship's words", () => {
    for (const sentence of [FELLOWSHIP_EMAIL, FELLOWSHIP_PAGE, FELLOWSHIP_CARD]) assert.match(sentence, NOT_AN_INCUBATOR);
    assert.doesNotMatch(INCUBATOR_SENTENCE, NOT_AN_INCUBATOR);
  });

  test("an incubator with no start written down still says only its own sentence", () => {
    const form = formWith({ [INCUBATOR]: { starts: "" } });
    assert.equal(emailFor(INCUBATOR, form).paragraphs[0], `You’re in the Research Incubator. ${INCUBATOR_SENTENCE}`);
  });

  test("a place on a programme the form no longer carries is still said, in the words it always had", () => {
    const gone = viewOf(placedByRanking("left-the-form"));
    assert.equal(gone.kind, "place");
    assert.equal(gone.programme, null);
    assert.equal(gone.next, FELLOWSHIP_PAGE);
    assert.equal(emailFor("left-the-form"), null, "an email is composed for a programme the form does not carry");
  });
});

// ---------------------------------------------------------------------------
// 4. A programme's own wording
// ---------------------------------------------------------------------------

describe("a programme's own wording still wins, whatever its kind", () => {
  test("an incubator's own body replaces the standard paragraphs, and its own subject the standard one", () => {
    const form = formWith({
      [INCUBATOR]: { emailWording: { accepted: { subject: "Welcome aboard", body: "First line.\n\nSecond line." } } },
    });
    const email = emailFor(INCUBATOR, form);
    assert.equal(email.subject, "Welcome aboard");
    assert.deepEqual(email.paragraphs, ["First line.", "Second line."]);
  });

  test("a box left empty keeps the standard wording of that programme's own kind", () => {
    const subjectOnly = formWith({ [INCUBATOR]: { emailWording: { accepted: { subject: "Welcome aboard", body: "" } } } });
    const email = emailFor(INCUBATOR, subjectOnly);
    assert.equal(email.subject, "Welcome aboard");
    assert.equal(email.paragraphs[0], `You’re in the Research Incubator. It starts w/c 26 Oct. ${INCUBATOR_SENTENCE}`);

    const bodyOnly = formWith({ [FELLOWSHIP]: { emailWording: { accepted: { subject: "", body: "Our own words." } } } });
    assert.equal(emailFor(FELLOWSHIP, bodyOnly).subject, "You’re in AGI Strategy");
    assert.deepEqual(emailFor(FELLOWSHIP, bodyOnly).paragraphs, ["Our own words."]);
  });

  test("one programme's wording changes nothing for the other", () => {
    const form = formWith({ [FELLOWSHIP]: { emailWording: { accepted: { subject: "", body: "Our own words." } } } });
    assert.deepEqual(emailFor(INCUBATOR, form), emailFor(INCUBATOR));
  });
});

// ---------------------------------------------------------------------------
// 5. The last of the three steps
// ---------------------------------------------------------------------------

describe("the last of the three steps while everybody waits", () => {
  const applicantForm = project.projectFormForApplicant(FORM, NOW);
  const last = (ranked) =>
    view.waitingSteps(applicantForm, { sent: { rankedProgrammeIds: ranked }, sentLabel: "Sat 17 Oct" })[2];

  test("somebody who ranked only fellowships reads Meet your group", () => {
    assert.deepEqual(last([FELLOWSHIP]), { name: "Meet your group", when: "w/c 26 Oct", state: "next" });
    assert.equal(view.lastStepName(["fellowship", "fellowship"]), "Meet your group");
  });

  test("somebody with an incubator among their choices reads Start, wherever it is in their order", () => {
    assert.deepEqual(last([INCUBATOR]), { name: "Start", when: "w/c 26 Oct", state: "next" });
    assert.equal(last([FELLOWSHIP, INCUBATOR]).name, "Start");
    assert.equal(last([INCUBATOR, FELLOWSHIP]).name, "Start");
    assert.equal(view.lastStepName(["incubator"]), "Start");
    assert.doesNotMatch(view.lastStepName(["incubator", "fellowship"]), /group/i);
  });

  test("a choice the form no longer carries is no reason to promise a group or to take the promise away", () => {
    assert.equal(last(["left-the-form"]).name, "Meet your group");
    assert.equal(last(["left-the-form", INCUBATOR]).name, "Start");
    assert.equal(view.lastStepName([]), "Meet your group");
  });

  test("the first two steps are the same for everybody", () => {
    for (const ranked of [[FELLOWSHIP], [INCUBATOR], [FELLOWSHIP, INCUBATOR]]) {
      const steps = view.waitingSteps(applicantForm, { sent: { rankedProgrammeIds: ranked }, sentLabel: "Sat 17 Oct" });
      assert.deepEqual(steps.slice(0, 2), [
        { name: "Sent", when: "Sat 17 Oct", state: "done" },
        { name: "Hear back", when: "Fri 23 Oct", state: "now" },
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The page types none of it
// ---------------------------------------------------------------------------

const codeOf = (...parts) => stripSource(readFileSync(join(SRC, ...parts), "utf8"), { keepStrings: true }).replace(/\s+/g, " ");

describe("the page draws the view's words, and the view takes them from the email's table", () => {
  test("both places on the page print the view's `next`", () => {
    const page = codeOf("features", "applications", "status", "StatusPage.tsx");
    assert.ok(page.includes("<p className={styles.offerText}>{view.next}</p>"), "the page of a place by ranking");
    assert.ok(page.includes("<div className={styles.body}> <p>{view.next}</p> </div>"), "the card of an accepted invitation");
    assert.equal(page.split("{view.next}").length - 1, 2);
  });

  test("the view asks the email's own function, with the kind of the programme the place is on", () => {
    const code = codeOf("lib", "applications", "status", "view.ts");
    assert.ok(code.includes('import { placeNextWords } from "../decisionDay/emailCopy";'));
    assert.ok(code.includes("const next = placeNextWords(placedOn?.kind ?? null);"));
    assert.ok(code.includes('next: standing.via === "ranking" ? next.page : next.card,'));
  });

  test("the email asks the same function, with the kind of the programme it is about", () => {
    const code = codeOf("lib", "applications", "decisionDay", "emailCopy.ts");
    assert.ok(code.includes("placeNextWords(programme.kind).email,"));
  });
});

// ---------------------------------------------------------------------------
// 7. The sentences are typed in one file
// ---------------------------------------------------------------------------

const TABLE = "src/lib/applications/decisionDay/emailCopy.ts";
const TABLE_REASON = "the one table of what somebody with a place is told, a row to each kind of programme";

/**
 * Each phrase, and every file that may type it, with the reason. A phrase
 * typed anywhere else is a second copy that can come to say something else.
 */
const TYPED_IN = {
  "small group with a facilitator": { [TABLE]: TABLE_REASON },
  "your group and when it meets": { [TABLE]: TABLE_REASON },
  "how the first week works": { [TABLE]: TABLE_REASON },
  "Meet your group": {
    "src/lib/applications/status/view.ts":
      "`lastStepName`, which says it only to somebody who ranked nothing but fellowships",
    "src/app/(public)/courses/page.tsx":
      "the fellowships page's own third step, on a page that is about fellowships and nothing else",
  },
};

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(entry.name)) yield path;
  }
}

describe("the sentences are typed in one file", () => {
  /** `phrase -> [files that type it]`, read from the tree once. */
  const found = Object.fromEntries(Object.keys(TYPED_IN).map((phrase) => [phrase, []]));
  let read = 0;
  for (const file of sourceFiles(SRC)) {
    read += 1;
    const code = stripSource(readFileSync(file, "utf8"), { keepStrings: true }).replace(/\s+/g, " ");
    for (const phrase of Object.keys(TYPED_IN)) {
      if (code.includes(phrase)) found[phrase].push(relative(REPO_ROOT, file).split(sep).join("/"));
    }
  }

  test("the walk read the tree, and sees a phrase across a line break", () => {
    assert.ok(read > 500, `only ${read} source files were read`);
    const broken = stripSource('const said = (\n  <p>\n    we’ll email you your\n    group and when it meets.\n  </p>\n);', { keepStrings: true });
    assert.ok(broken.replace(/\s+/g, " ").includes("your group and when it meets"));
    // A comment about a sentence is not the sentence.
    assert.ok(!stripSource("// Meet your group\nconst x = 1;", { keepStrings: true }).includes("Meet your group"));
  });

  for (const [phrase, allowed] of Object.entries(TYPED_IN)) {
    test(`"${phrase}" is typed only where it is registered, both directions`, () => {
      const unregistered = found[phrase].filter((file) => !(file in allowed));
      assert.deepEqual(
        unregistered,
        [],
        `"${phrase}" is typed in a file that is not registered. Take the words from placeNextWords or lastStepName, ` +
          "or register the file with the reason its copy cannot come to disagree.",
      );
      const stale = Object.keys(allowed).filter((file) => !found[phrase].includes(file));
      assert.deepEqual(stale, [], `"${phrase}" is no longer typed in these registered files: remove them.`);
      for (const [file, reason] of Object.entries(allowed)) {
        assert.ok(String(reason).trim().length >= 40, `${file}: the reason is a placeholder.`);
      }
    });
  }
});
