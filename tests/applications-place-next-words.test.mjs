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
 * `src/lib/applications/decisionDay/emailCopy.ts`), and so is the one that
 * says why pressing "I'm coming" helps (`comingHelps`): for a fellowship it
 * helps us plan groups, and an incubator's people are told only that it helps
 * us plan (the owner's decision of 24 October 2026). Nine things have to
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
 *     the page or on the steps. And they never read the word "group" at all
 *     about a place or an invitation on an incubator: the standard emails and
 *     every state of their own page are drawn for real and scanned for the
 *     word itself, the line under "I'm coming" included, because a sentence
 *     can name a group in words no list of phrases foresees.
 *  4. A PROGRAMME'S OWN WORDING STILL WINS, part by part, whatever its kind.
 *  5. THE LAST OF THE THREE STEPS is "Meet your group" only for somebody who
 *     can end up nowhere but a fellowship.
 *  6. THE PAGE TYPES NONE OF IT. It draws the view's own words, and the view
 *     takes them from the email's table.
 *  7. THE SENTENCES ARE TYPED IN ONE FILE. Every source file is read for
 *     them, so a new screen or a new email cannot come to say its own.
 *  8. WHY "I'M COMING" HELPS, FOR EACH KIND. Each kind's sentence is pinned.
 *     The real email builder and the real page are run for somebody holding
 *     a place of each kind: the email's paragraph about replying and the line
 *     under the button say that kind's sentence and not the other's. A
 *     programme's own "You're in" body still replaces the email's paragraph
 *     with the rest, and the page, which has no programme wording, keeps its
 *     kind's line.
 *  9. THE EMAIL PUBLISH SENDS THEM NAMES NO GROUP EITHER. When groups go out,
 *     the people of a run an incubator names are sent "Placed on an
 *     incubator" (`src/lib/courses/incubatorStartEmail.ts`) in place of
 *     "Placed in a group" (the walk of stage one, October 2026). Its seed copy
 *     is composed for real, with every value a run can lack and every way a
 *     place can be said, and scanned for the word and for everything else an
 *     incubator's people are never told. No token it fills can carry a
 *     group's name or who facilitates one, and wording that asks for one is
 *     refused. Publish chooses it by the programme's kind, and the push that
 *     mirrors it names no group.
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
// The email an incubator's people are sent when Publish goes out, and its seed copy.
const incubatorStart = await loadTs(join("lib", "courses", "incubatorStartEmail.ts"));
const courseEmails = await loadTs(join("lib", "firestore", "courseEmails.ts"));

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

/** Placed by their own ranking, and has pressed "I’m coming". */
const saidComing = (programmeId) =>
  applicationWith(
    {
      status: "accepted",
      result: { kind: "accepted", programmeId, publishedAt: "2026-10-23T11:00:00.000Z" },
      invitation: null,
      attendance: { answer: "coming", answeredAt: "2026-10-23T12:00:00.000Z" },
    },
    [programmeId],
  );

/** Ranked the other programme and was invited to this one, with no answer yet. */
const invitedTo = (programmeId) =>
  applicationWith(
    {
      status: "invited",
      result: { kind: "invited", programmeId, publishedAt: "2026-10-23T11:00:00.000Z" },
      invitation: { programmeId, replyBy: "2026-10-25", response: null, respondedAt: null },
      attendance: null,
    },
    [programmeId === FELLOWSHIP ? INCUBATOR : FELLOWSHIP],
  );

/** Placed by their own ranking, and gave the place back. */
const gaveBack = (programmeId) =>
  applicationWith(
    {
      status: "withdrawn",
      result: { kind: "accepted", programmeId, publishedAt: "2026-10-23T11:00:00.000Z" },
      invitation: null,
      attendance: { answer: "cant-make-it", answeredAt: "2026-10-23T12:00:00.000Z" },
    },
    [programmeId],
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

/**
 * The word itself, in any form. An incubator has no groups, so nothing its
 * people read about a place or an invitation on one says it, whatever the
 * sentence around it.
 */
const A_GROUP = /group/i;

/** Why saying "I’m coming" helps, for each kind: said after "Optional." under the button. */
const COMING_LINE = {
  fellowship: "It helps us plan groups.",
  incubator: "It helps us plan.",
};

/** The standard "You're in" email's paragraph about replying, around one kind's line. */
const replyParagraph = (line) =>
  `You don’t need to reply. If you’re coming, tap the button. ${line} ` +
  "If you can’t make it, tell us and we’ll give your place to someone else.";

/** The standard invitation to a programme, for somebody who ranked the other one. */
function invitationFor(programmeId) {
  return copy.composeDecisionEmail({
    outcome: { kind: "invited", programmeId },
    firstName: "Chloe",
    form: FORM,
    ranked: [programmeId === FELLOWSHIP ? INCUBATOR : FELLOWSHIP],
    leadNames: { [FELLOWSHIP]: "Claudia", [INCUBATOR]: "Tess" },
    replyBy: "Sun 25 Oct",
    links: { application: `https://staging.example.com/applications/${ROUND}`, events: "https://staging.example.com/events" },
  });
}

/** Every word of one composed email a person reads. */
const wordsOf = (email) =>
  [email.subject, email.greeting, ...email.paragraphs, ...email.buttons.map((button) => button.label), email.signOff.role].join(" ");

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

  test("an incubator's people never read the word group, in any standard email or on any state of their page", () => {
    const emails = {
      "You're in": emailFor(INCUBATOR),
      "the invitation": invitationFor(INCUBATOR),
      "the invitation's reminder": copy.composeInvitationReminder(
        {
          outcome: { kind: "invited", programmeId: INCUBATOR },
          firstName: "Chloe",
          form: FORM,
          ranked: [FELLOWSHIP],
          leadNames: { [FELLOWSHIP]: "Claudia", [INCUBATOR]: "Tess" },
          replyBy: "Sun 25 Oct",
          links: { application: `https://staging.example.com/applications/${ROUND}`, events: "https://staging.example.com/events" },
        },
        { replyBy: "Sun 25 Oct", lastDay: false },
      ),
    };
    for (const [name, email] of Object.entries(emails)) {
      assert.ok(email, `${name}: no email was composed`);
      assert.doesNotMatch(wordsOf(email), A_GROUP, `${name}: ${wordsOf(email)}`);
    }
    const pages = {
      "placed, nothing said": placedByRanking(INCUBATOR),
      "placed, said coming": saidComing(INCUBATOR),
      "placed by an invitation they accepted": placedByInvitation(INCUBATOR),
      "invited, not answered": invitedTo(INCUBATOR),
      "gave the place back": gaveBack(INCUBATOR),
    };
    for (const [name, application] of Object.entries(pages)) {
      const page = pageOf(application);
      assert.doesNotMatch(page, A_GROUP, `${name}: ${page}`);
    }
    // The state that draws the line under "I’m coming" was drawn with it.
    assert.ok(pageOf(placedByRanking(INCUBATOR)).includes(`I’m coming Optional. ${COMING_LINE.incubator} I can’t make it`));
  });

  test("the scanner for the word sees it in a fellowship's line under I’m coming, on the page and in the email", () => {
    // So the scan above reads the line under the button and the paragraph
    // about replying: the same scan, run on a fellowship, finds the word there.
    const page = pageOf(placedByRanking(FELLOWSHIP));
    const line = page.slice(page.indexOf("I’m coming"), page.indexOf("I can’t make it"));
    assert.equal(line, `I’m coming Optional. ${COMING_LINE.fellowship} `);
    assert.match(line, A_GROUP);
    assert.match(emailFor(FELLOWSHIP).paragraphs[1], A_GROUP);
    assert.doesNotMatch(COMING_LINE.incubator, A_GROUP);
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
    // Both of the email's functions, from the one module: what comes next,
    // and why "I’m coming" helps (the line under the button).
    assert.ok(code.includes('import { comingHelps, placeNextWords } from "../decisionDay/emailCopy";'));
    assert.ok(code.includes("const next = placeNextWords(placedOn?.kind ?? null);"));
    assert.ok(code.includes('next: standing.via === "ranking" ? next.page : next.card,'));
  });

  test("the email asks the same function, with the kind of the programme it is about", () => {
    const code = codeOf("lib", "applications", "decisionDay", "emailCopy.ts");
    assert.ok(code.includes("placeNextWords(programme.kind).email,"));
  });

  test("the line under I’m coming is the view's, and the view and the email ask comingHelps with the place's kind", () => {
    // The view asks with the very kind it asks placeNextWords with.
    const shown = codeOf("lib", "applications", "status", "view.ts");
    assert.ok(shown.includes("comingHelps: comingHelps(placedOn?.kind ?? null),"));
    // The page hands the view's line to both places a place is drawn, and the
    // buttons print what they are handed after "Optional.".
    const page = codeOf("features", "applications", "status", "StatusPage.tsx");
    assert.equal(page.split("helps={view.comingHelps}").length - 1, 2);
    const buttons = codeOf("features", "applications", "status", "ReplyButtons.tsx");
    assert.ok(buttons.includes("<p className={styles.note}>Optional. {helps}</p>"));
    assert.equal(buttons.split("{helps}").length - 1, 1);
    // The email's paragraph about replying asks with the kind of the programme it is about.
    const email = codeOf("lib", "applications", "decisionDay", "emailCopy.ts");
    assert.ok(email.includes("acceptedReply(programme.kind),"));
    assert.ok(email.includes("`You don’t need to reply. If you’re coming, tap the button. ${comingHelps(kind)} ` +"));
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
  "your group and when it meets": {
    [TABLE]: TABLE_REASON,
    "src/lib/courses/groupsGoOut.ts":
      "st-week1-phone's line for week 1 before groups go out, said only for a fellowship's place (an incubator's is its first sentence alone), with the run's planned day",
  },
  "how the first week works": { [TABLE]: TABLE_REASON },
  // Both kinds' line under "I’m coming" carry it, so one entry holds both.
  "helps us plan": {
    [TABLE]: "`comingHelps`, the one table of why saying I’m coming helps, a row to each kind of programme",
  },
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
        `"${phrase}" is typed in a file that is not registered. Take the words from placeNextWords, comingHelps or lastStepName, ` +
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

// ---------------------------------------------------------------------------
// 8. Why saying "I'm coming" helps, for each kind
// ---------------------------------------------------------------------------

describe("why saying I’m coming helps, in the words of each kind", () => {
  test("a fellowship's line and an incubator's, word for word", () => {
    // A fellowship's people are put into groups, so theirs is the line the
    // page and the email always had. An incubator has none, so its line says
    // only that it helps us plan (the owner's decision of 24 October 2026).
    assert.equal(copy.comingHelps("fellowship"), "It helps us plan groups.");
    assert.equal(copy.comingHelps("incubator"), "It helps us plan.");
    for (const kind of KINDS) assert.equal(copy.comingHelps(kind), COMING_LINE[kind]);
  });

  test("every kind of programme has a line, and it is a sentence", () => {
    assert.deepEqual([...model.PROGRAMME_KINDS].sort(), Object.keys(COMING_LINE).sort(), "a kind of programme has no line here");
    for (const kind of model.PROGRAMME_KINDS) assert.match(copy.comingHelps(kind), /^[A-Z].*\.$/, kind);
  });

  test("a place on a programme the form no longer carries reads a fellowship's line, and so does a name no kind has", () => {
    assert.equal(copy.comingHelps(null), COMING_LINE.fellowship);
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty", ""]) {
      assert.equal(copy.comingHelps(name), COMING_LINE.fellowship, JSON.stringify(name));
    }
    assert.equal(viewOf(placedByRanking("left-the-form")).comingHelps, COMING_LINE.fellowship);
  });

  for (const kind of KINDS) {
    const other = kind === "fellowship" ? "incubator" : "fellowship";
    const id = ID_OF[kind];

    test(`${kind}: the email's paragraph about replying and the line under the button say its line`, () => {
      // The real email builder, for somebody holding a place of this kind.
      const email = emailFor(id);
      assert.equal(email.paragraphs[1], replyParagraph(COMING_LINE[kind]));
      assert.ok(!wordsOf(email).includes(COMING_LINE[other]), `the email says the other kind's line: ${wordsOf(email)}`);

      // The real page, drawn for the same person before they have answered.
      assert.equal(viewOf(placedByRanking(id)).comingHelps, COMING_LINE[kind]);
      const page = pageOf(placedByRanking(id));
      assert.ok(
        page.includes(`I’m coming Optional. ${COMING_LINE[kind]} I can’t make it This frees your place for someone else.`),
        page,
      );
      assert.ok(!page.includes(COMING_LINE[other]), `the page says the other kind's line: ${page}`);
    });

    test(`${kind}: the line is drawn only while there is an "I’m coming" to press`, () => {
      // Once they have said so, and on the card of an accepted invitation,
      // the button is gone and so is the line. The view carries it all the same.
      for (const application of [saidComing(id), placedByInvitation(id)]) {
        assert.equal(viewOf(application).comingHelps, COMING_LINE[kind]);
        const page = pageOf(application);
        assert.ok(!page.includes("Optional."), page);
        assert.ok(!page.includes(COMING_LINE[kind]), page);
      }
    });

    test(`${kind}: a programme's own body replaces the paragraph about replying, and the page keeps its kind's line`, () => {
      // A body a lead wrote replaces BOTH standard paragraphs, this line with
      // the rest, exactly as before. The page has no programme wording.
      const form = formWith({ [id]: { emailWording: { accepted: { subject: "", body: "Our own words.\n\nSee you there." } } } });
      const email = emailFor(id, form);
      assert.deepEqual(email.paragraphs, ["Our own words.", "See you there."]);
      assert.ok(!wordsOf(email).includes("helps us plan"), wordsOf(email));
      assert.deepEqual(email.buttons.map((button) => button.label), ["I’m coming", "I can’t make it"]);
      const page = pageOf(placedByRanking(id), form);
      assert.ok(page.includes(`I’m coming Optional. ${COMING_LINE[kind]} I can’t make it`), page);
    });

    test(`${kind}: a programme's own subject alone keeps the standard body, with its kind's line`, () => {
      const form = formWith({ [id]: { emailWording: { accepted: { subject: "Welcome aboard", body: "" } } } });
      const email = emailFor(id, form);
      assert.equal(email.subject, "Welcome aboard");
      assert.equal(email.paragraphs[1], replyParagraph(COMING_LINE[kind]));
    });
  }

  test("one programme's own wording changes neither line of the other", () => {
    const form = formWith({ [FELLOWSHIP]: { emailWording: { accepted: { subject: "", body: "Our own words." } } } });
    assert.equal(emailFor(INCUBATOR, form).paragraphs[1], replyParagraph(COMING_LINE.incubator));
    assert.ok(pageOf(placedByRanking(INCUBATOR), form).includes(`Optional. ${COMING_LINE.incubator}`));
  });
});

// ---------------------------------------------------------------------------
// 9. The email Publish sends an incubator's people
// ---------------------------------------------------------------------------

describe("the email Publish sends an incubator's people names no group either", () => {
  const SEED = courseEmails.courseTemplateDefaults["course-allocated-incubator"];
  /** A person on an incubator's run, as Publish's plan tells the email about them. */
  const FACTS = {
    name: "Chloe Martin",
    courseTitle: "Research Incubator",
    runLabel: "Autumn 2026",
    programmeName: "Research incubator",
    weeklySlot: "Mondays at 5pm",
    firstSession: "Mon 2 Nov",
    where: { kind: "room", room: "Room B5" },
    leadName: "Tess",
    programmeUrl: "https://staging.example.com/learn/research-incubator-autumn-2026",
  };
  /** Every way the email can say where the session is, and saying nothing. */
  const WHERE = [
    { kind: "room", room: "Room B5" },
    { kind: "online", linkOnPage: true },
    { kind: "online", linkOnPage: false },
    { kind: "on-page" },
    { kind: "room", room: "https://meet.example/j/8675309?pwd=opensesame" },
    null,
  ];
  /** Every word of one composed email a person reads: its subject, then its text. */
  const wordsOfEmail = (email) => `${email.subject} ${textOf(email.blocks.map((block) => block.html ?? block.text ?? "").join(" "))}`;

  test("its seed copy, with every value a run can lack and every way a place is said: never the word, and nothing only a fellowship is told", () => {
    let read = 0;
    for (const where of WHERE) {
      for (const leadName of ["Tess", null]) {
        const email = incubatorStart.composeIncubatorStartEmail(SEED, { ...FACTS, where, leadName });
        assert.equal(email.ok, true, JSON.stringify({ where, leadName }));
        const words = wordsOfEmail(email);
        assert.doesNotMatch(words, A_GROUP, words);
        assert.doesNotMatch(words, NOT_AN_INCUBATOR, words);
        read += 1;
      }
    }
    assert.equal(read, WHERE.length * 2);
  });

  test("it says what an incubator's people are owed: the weekly session, the day it starts, who runs it, and their programme's page", () => {
    const email = incubatorStart.composeIncubatorStartEmail(SEED, FACTS);
    assert.equal(email.subject, "Your Research incubator sessions: Mondays at 5pm");
    assert.equal(
      textOf(email.blocks.map((block) => block.html).join(" ")),
      "Hi Chloe, You’ll meet on Mondays at 5pm, starting Mon 2 Nov. Where: Room B5 Tess runs the sessions. " +
        "Week 1 is on your programme’s page. Open your programme Tess Research incubator lead, NAISI",
    );
  });

  test("no token it fills can carry a group's name or who facilitates one, and wording that asks for one is refused", () => {
    for (const token of incubatorStart.INCUBATOR_START_TOKENS) assert.doesNotMatch(token, /group|facilitat/i, token);
    for (const token of ["groupName", "facilitatorNames", "coFacilitators", "groupSize", "groupUrl"]) {
      const asking = { subject: "Your sessions", blocks: [{ id: "b", type: "richText", html: `<p>{${token}}</p>` }] };
      assert.deepEqual(
        incubatorStart.composeIncubatorStartEmail(asking, FACTS),
        { ok: false, problems: [{ kind: "unknown-token", tokens: [token] }] },
        token,
      );
    }
  });

  test("the scanners find the word in what a fellowship's people are sent at Publish", () => {
    // So the scan above reads the email: the same scan, run on the seed copy
    // of "Placed in a group", finds the word.
    const fellowship = courseEmails.courseTemplateDefaults["course-allocated"];
    const words = `${fellowship.subject} ${textOf(fellowship.blocks.map((block) => block.html ?? block.text ?? "").join(" "))}`;
    assert.match(words, A_GROUP);
  });

  test("Publish chooses it by the kind of the programme that names the run, and its push names no group", () => {
    const plan = codeOf("lib", "courses", "allocationPublish.ts");
    assert.ok(plan.includes('const incubator = naming.kind === "incubator";'), "the plan no longer asks the kind");
    assert.ok(plan.includes("const templates = { allocated: incubator ? onAnIncubator : inAGroup, facilitating };"));
    // The placement email is written for its reader (`row.uid`), so it names
    // the group's facilitators other than them (a facilitator who holds a
    // place is in the group they facilitate); the choice between the two
    // emails is still made here, by the kind alone.
    assert.ok(plan.includes("email: incubator ? writeIncubatorStart(group, name) : writePlacement(group, name, row.uid),"));
    const route = codeOf("app", "api", "courses", "runs", "[runId]", "allocation", "publish", "route.ts");
    assert.ok(route.includes("body: plan.incubator ? `${run.courseTitle}: the details are in your email.` :"), "the push to an incubator's people");
  });
});
