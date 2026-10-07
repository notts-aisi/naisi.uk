/**
 * The list of somebody's applications says what their own page says.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * `/applications` is older than application forms. It words each row from the
 * stored status, and for an application made on a form the status does not
 * say enough: a place given back and an invitation turned down are both
 * stored as `withdrawn`, so the list told both "You withdrew this
 * application"; and a declined application read "Declined" there while its
 * own page, on purpose, says exactly what somebody with no offer reads.
 *
 * The words for an outcome are now in one pure function, `outcomeWords`
 * (`src/lib/applications/status/words.ts`), read with the view the person's
 * own page is drawn from. This file holds three things:
 *
 *  1. THE WORDS, for every way an application can stand: the nine rows the
 *     walk-through wrote down, and the states with nothing to state.
 *  2. THE PAGE SAYS THE SAME. `StatusPage.tsx` draws each outcome's chip and
 *     title itself, so its source is held to the words this function gives:
 *     change one and this fails until the other is changed with it.
 *  3. THE LIST ASKS. The older page takes a form application's chip and
 *     sentence from here and keeps its own words for everything else.
 *
 * The journey (`applications-journey`) runs the same nine rows through the
 * real loader, against applications the real routes wrote.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const flat = (...parts) => readFileSync(join(SRC, ...parts), "utf8").replace(/\s+/g, " ");

const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const words = await loadTs(join("lib", "applications", "status", "words.ts"));
const emailCopy = await loadTs(join("lib", "applications", "decisionDay", "emailCopy.ts"));

// ---------------------------------------------------------------------------
// 1. The words
// ---------------------------------------------------------------------------

const AGI = { id: "agi-strategy", name: "AGI Strategy Fellowship", shortName: "AGI Strategy", shortFacts: "" };
const INC = { id: "research-incubator", name: "Research Incubator", shortName: "Research incubator", shortFacts: "" };
const LABEL = "Autumn 2026";

/** One view per row of the table, as the status page's own builder shapes them. */
const VIEWS = {
  "started, not sent": { kind: "draft", label: LABEL, open: true, closesLabel: "Sun 18 Oct" },
  "sent, waiting": { kind: "sent", label: LABEL },
  accepted: { kind: "place", label: LABEL, via: "ranking", programme: AGI, saidComing: false },
  "invited, not answered": { kind: "invitation", label: LABEL, programme: INC, replyByLabel: "Sun 25 Oct", late: false, canAccept: true },
  "invitation accepted": { kind: "place", label: LABEL, via: "invitation", programme: INC, saidComing: true },
  "invitation turned down": { kind: "released", label: LABEL, via: "invitation", how: "no-thanks", programme: AGI },
  "gave the place back": { kind: "released", label: LABEL, via: "ranking", how: "cant-make-it", programme: AGI },
  "no offer": { kind: "no-place", label: LABEL, appliedFor: "the AGI Strategy Fellowship", firstName: "Hannah" },
  // The page's view does not say which of the two kinds of no it was.
  "every programme declined": { kind: "no-place", label: LABEL, appliedFor: "the AGI Strategy Fellowship", firstName: "Priya" },
};

describe("the chip and the sentence for every way an application can stand", () => {
  test("the nine rows", () => {
    const row = (name) => {
      const said = words.listWordsFor(VIEWS[name]);
      return said ? [said.chip, said.sentence] : null;
    };
    assert.deepEqual(Object.fromEntries(Object.keys(VIEWS).map((name) => [name, row(name)])), {
      // Nothing to state yet: the list keeps "Draft" and "Submitted" and their sentences.
      "started, not sent": null,
      "sent, waiting": null,
      accepted: ["Accepted", "You’re in AGI Strategy."],
      "invited, not answered": ["Invitation", "You’re invited to Research incubator."],
      "invitation accepted": ["Accepted", "You’re in Research incubator."],
      "invitation turned down": ["Invitation turned down", "You said no thanks to AGI Strategy."],
      "gave the place back": ["Place given back", "You’ve told us you can’t make it."],
      "no offer": ["No place this term", "We can’t offer you a place this term."],
      "every programme declined": ["No place this term", "We can’t offer you a place this term."],
    });
  });

  test("somebody every programme declined reads exactly what somebody with no offer reads", () => {
    assert.deepEqual(words.listWordsFor(VIEWS["every programme declined"]), words.listWordsFor(VIEWS["no offer"]));
  });

  test("nobody is told they withdrew an application they did not withdraw, and nobody reads Declined", () => {
    for (const [name, view] of Object.entries(VIEWS)) {
      const said = words.listWordsFor(view);
      if (!said) continue;
      assert.doesNotMatch(`${said.chip} ${said.sentence}`, /withdr[ae]w|declined/i, name);
    }
  });

  test("the list's chip is drawn in the tone the page draws it in", () => {
    assert.deepEqual(
      Object.fromEntries(Object.entries(VIEWS).map(([name, view]) => [name, words.listWordsFor(view)?.tone ?? null])),
      {
        "started, not sent": null,
        "sent, waiting": null,
        accepted: "success",
        "invited, not answered": "accent",
        "invitation accepted": "success",
        "invitation turned down": "neutral",
        "gave the place back": "neutral",
        "no offer": "neutral",
        "every programme declined": "neutral",
      },
    );
    assert.deepEqual(
      [words.outcomeWords(VIEWS.accepted).tone, words.outcomeWords(VIEWS["invited, not answered"]).tone, words.outcomeWords(VIEWS["no offer"]).tone],
      ["ok", "accent", "neutral"],
    );
  });

  test("a programme that has left the form still leaves a sentence that is true", () => {
    const gone = (name) => words.listWordsFor({ ...VIEWS[name], programme: null }).sentence;
    assert.equal(gone("accepted"), "You’re in.");
    assert.equal(gone("invited, not answered"), "You’re invited to another programme.");
    assert.equal(gone("invitation turned down"), "You said no thanks to your invitation.");
    assert.equal(gone("gave the place back"), "You’ve told us you can’t make it.");
  });

  test("with no outcome to state there are no words, so the list keeps its own", () => {
    for (const view of [
      { kind: "none", label: LABEL, window: "open", opensLabel: null, closesLabel: null },
      { kind: "draft", label: LABEL, open: false, closesLabel: null },
      { kind: "sent", label: LABEL },
      { kind: "withdrawn", label: LABEL },
      { kind: "unclear", label: LABEL },
    ]) {
      assert.equal(words.outcomeWords(view), null, view.kind);
      assert.equal(words.listWordsFor(view), null, view.kind);
    }
  });

  test("the accepted title is the decision email's standard subject, with a full stop", () => {
    assert.equal(words.outcomeWords(VIEWS.accepted).title, `${emailCopy.standardSubject("accepted", "AGI Strategy")}.`);
  });
});

// ---------------------------------------------------------------------------
// 2. The page says the same
// ---------------------------------------------------------------------------

describe("the person's own page draws the same chip and title", () => {
  const page = flat("features", "applications", "status", "StatusPage.tsx");
  const source = flat("lib", "applications", "status", "words.ts");

  /** Each outcome: how the page spells its chip and its title, and how the function does. */
  const SAME = [
    [
      "a place",
      ['<Chip tone="ok">Accepted</Chip>', 'return programme ? `${standardSubject("accepted", programme.shortName)}.` : "You’re in.";'],
      ['chip: "Accepted", tone: "ok",', 'title: view.programme ? `${standardSubject("accepted", view.programme.shortName)}.` : "You’re in.",'],
    ],
    [
      "an invitation",
      ['<Chip tone="accent">Invitation</Chip>', '{programme ? `You’re invited to ${programme.shortName}.` : "You’re invited to another programme."}'],
      ['chip: "Invitation", tone: "accent",', '? `You’re invited to ${view.programme.shortName}.` : "You’re invited to another programme.",'],
    ],
    [
      "a place or an invitation given back",
      [
        '<Chip>{view.how === "no-thanks" ? "Invitation turned down" : "Place given back"}</Chip>',
        '{view.how === "no-thanks" ? name ? `You said no thanks to ${name}.` : "You said no thanks to your invitation." : "You’ve told us you can’t make it."}',
      ],
      [
        'chip: "Invitation turned down", tone: "neutral", title: name ? `You said no thanks to ${name}.` : "You said no thanks to your invitation.",',
        'return { chip: "Place given back", tone: "neutral", title: "You’ve told us you can’t make it." };',
      ],
    ],
    [
      "no place",
      ["<Chip>No place this term</Chip>", "<h2 className={styles.cardTitle}>We can’t offer you a place this term.</h2>"],
      ['return { chip: "No place this term", tone: "neutral", title: "We can’t offer you a place this term." };'],
    ],
  ];

  for (const [name, onThePage, inTheFunction] of SAME) {
    test(`${name}: the page and the function spell it the same way`, () => {
      for (const text of onThePage) assert.ok(page.includes(text), `the page no longer says: ${text}`);
      for (const text of inTheFunction) assert.ok(source.includes(text), `the function no longer says: ${text}`);
    });
  }

  test("the page's two accepted headings are both that one sentence", () => {
    assert.equal((page.match(/\{youAreIn\(programme\)\}/g) ?? []).length, 2);
  });
});

// ---------------------------------------------------------------------------
// 3. The list asks
// ---------------------------------------------------------------------------

describe("the list of applications takes a form application's words from there", () => {
  const list = flat("app", "(public)", "applications", "page.tsx");
  const load = flat("lib", "applications", "status", "load.ts");

  test("one read for the rows it has, through the page's own loader", () => {
    assert.match(
      list,
      /const formWords = await loadListWords\(db, user\.uid, rows\.map\(\(row\) => row\.round\.id\), new Date\(\)\);/,
    );
    assert.match(load, /const loaded = await loadStatus\(db, roundId, uid, now\); const words = loaded \? listWordsFor\(loaded\.view\) : null;/);
  });

  test("the chip, its tone and the sentence are the form's when there are any, and the list's own otherwise", () => {
    assert.match(list, /const said = formWords\.get\(row\.round\.id\);/);
    assert.match(list, /<Badge tone=\{said\?\.tone \?\? APPLICATION_STATUS_TONE\[row\.application\.status\]\}>/);
    assert.match(list, /\{said\?\.chip \?\? ADMISSION_APPLICATION_STATUS_LABEL\[row\.application\.status\]\}/);
    assert.match(list, /\{said\?\.sentence \?\? applicationStatusBlurb\( row\.application\.status, row\.round\.windowState, row\.round\.kind, \)\}/);
  });

  test("nothing else on the row is worded from the status", () => {
    assert.equal((list.match(/ADMISSION_APPLICATION_STATUS_LABEL\[/g) ?? []).length, 1);
    assert.equal((list.match(/applicationStatusBlurb\(/g) ?? []).length, 1);
    assert.equal((list.match(/APPLICATION_STATUS_TONE\[/g) ?? []).length, 1);
  });
});
