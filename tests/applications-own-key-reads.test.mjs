/**
 * A map kept by an id is read by its own keys, in every file under `src`.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule
 *
 * The application system keeps several things in plain objects keyed by an
 * id: a form's `programmes`, an application's `answers`, a review's `scores`,
 * a decision's `programmes`, and the tallies worked out from them. The id a
 * map is read by has usually come from somewhere else: a ranking somebody
 * typed, a programme id in an address, a question id off the form.
 *
 * A plain object answers such a read from more than its own keys. It also
 * answers to every name its prototype carries, so `programmes["constructor"]`
 * is a function and not a missing programme, and the code that asked carries
 * on as though the programme were there. `own(map, key)` in
 * `src/lib/applications/keys.ts` answers from the map's own keys only, and
 * `docs/applications.md` makes it the one way such a map is read.
 *
 * `tests/applications-own-keys.test.mjs` holds the contract's own functions
 * to that, one by one, by running them. It cannot see a read written
 * somewhere else: in a route, a loader, a component, or a file another
 * feature owns. This file walks the tree for those.
 *
 * ## What is walked, and for which names
 *
 * Every `.ts` and `.tsx` under `src` is parsed (`tests/lib/ownKeyScan.mjs`
 * says how an expression is recognised as a map, an alias of one, a read, or
 * a write). Two sets of names:
 *
 *  1. `EVERYWHERE`: the maps the contract defines or hands out, looked for in
 *     every file under `src`. Other features keep maps under the same names
 *     (an event's sign-up `answers`, a worksheet response's `answers`). A
 *     walk cannot tell those from an application's, and the same thing is
 *     true of them, so they are read the same way.
 *  2. Whatever else the application system DECLARES as a map from any string
 *     to something (`Record<string, X>`): a field of one of its types is
 *     held in every file of the system, and a variable, a parameter or a
 *     piece of state in the file that declares it. Nobody keeps that list. It
 *     is read out of the source each run, so a new map is held to the rule
 *     from the commit that declares it.
 *
 * ## Where such a map is read
 *
 * A computed read fails in every file under `src`. No tree is let off.
 *
 * `HELD` says where these maps ARE read by a key, with what each place
 * reads: the application system's own trees, and each file or tree outside
 * them that reads a map of one of these names, whether the map is the
 * system's (the member record) or another feature's under the same name (an
 * RSVP's sign-up answers, a worksheet response's, the older apply flow's, a
 * course application's). The walk keeps that list true both ways. A file
 * that calls the accessor and is under no entry fails until its tree is
 * listed with what it reads, and an entry under which no file calls the
 * accessor is stale. So a tree that starts to keep or read such a map is
 * written down from the change that starts it.
 *
 * ## What it reports
 *
 * A computed READ: `map[key]`, `map?.[key]`, `key in map`, and
 * `const { [key]: value } = map`. A string or number written out is not a
 * computed key. An assignment target, `delete` and `++` are not reads: a
 * write names the key it creates, and what may be an id is `isId`'s rule.
 *
 * ## A read whose key is the map's own
 *
 * `KEY_IS_THE_MAPS_OWN` is for a read whose key provably came from the same
 * map's own keys (`Object.keys(map).filter((key) => map[key] === null)`).
 * That is safe and cannot be proved by a pattern, so each such read is
 * listed with the text that proves it and a reason. Everything else is
 * FIXED IN THE CODE, by writing the read through `own`. A read keyed by
 * another list, however trusted (`form.programmeIds`, the keys a server
 * sent), does not belong in the registry: two lists agree until one changes.
 *
 * ## There is one accessor
 *
 * A read through `own` is only as good as what `own` is. So the last section
 * holds that exactly one module defines it, that the few modules handing it
 * on under their own import path hand on that one, and that every file
 * calling it took it from one of those.
 *
 * ## What this cannot see
 *
 * It reads syntax, not types. A map with an inferred type, under a name that
 * is in neither set of names, is not found; nor is one handed to a function
 * whose parameter has another name and no written type. The names are the
 * net, which is why the second set is read from the declarations and not
 * kept by hand. In another feature's tree it finds only the maps that share
 * one of the six names: a map kept there under any other name is not held.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { accessorUse, declaredStringMaps, scanForComputedReads } from "./lib/ownKeyScan.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

/** The accessor's own module, as files import it and as it sits on disk. */
const ACCESSOR = "own";
const ACCESSOR_HOME = "src/lib/applications/keys";
const ACCESSOR_FILE = `${ACCESSOR_HOME}.ts`;

// ---------------------------------------------------------------------------
// 1. The maps
// ---------------------------------------------------------------------------

/**
 * The maps looked for in every file under `src`: the ones the contract
 * defines and the ones it hands to other code. Each names where it is
 * declared, as text that file must still contain, so a map that is renamed
 * or removed fails here instead of leaving a name that guards nothing.
 *
 *  - `nested`: the map's values are maps too, so the value one level in is
 *    held to the same rule.
 *  - `type`: a named type that IS the map, so a parameter declared with it is
 *    followed under whatever name it is given.
 */
const EVERYWHERE = new Map([
  [
    "programmes",
    {
      declared: [
        ["src/lib/applications/model.ts", "programmes: Record<string, ProgrammeSettings>;"],
        ["src/lib/applications/model.ts", "programmes: Record<string, ProgrammeDecision>;"],
        ["src/lib/applications/decisions.ts", "programmes: Record<string, ProgrammeTally>;"],
      ],
      why: "a form's programmes, a decision document's decisions and the term's tally, each keyed by a programme id that usually arrives in an address or in a ranking",
    },
  ],
  [
    "answers",
    {
      declared: [["src/lib/applications/model.ts", "export type Answers = Record<string, Record<string, AnswerValue>>;"]],
      nested: true,
      type: "Answers",
      why: "what an applicant wrote, keyed by a question set's id and then by a question's id, both read off the form and not off the answers",
    },
  ],
  [
    "scores",
    {
      declared: [["src/lib/applications/model.ts", "scores: Record<string, number>;"]],
      why: "one reviewer's scores, keyed by a question key that the form or the reviewer's own request supplies",
    },
  ],
  [
    "toReview",
    {
      declared: [["src/lib/applications/decisions.ts", "toReview: Record<string, number>;"]],
      why: "how many decisions each programme still owes, handed out by readinessFor and read by a programme id from the form",
    },
  ],
  [
    "elsewhere",
    {
      declared: [["src/lib/applications/decisions.ts", "elsewhere: Record<string, number | null>;"]],
      why: "an applicant's section score on each other programme they ranked, read by a programme id",
    },
  ],
  [
    "byCriterion",
    {
      declared: [["src/lib/firestore/memberRecords.ts", "byCriterion: Record<string, number | null>;"]],
      why: "a member record's score summary, keyed by a criterion on an older round and by a programme id on an application form",
    },
  ],
]);

/**
 * Where these maps are read by a key, and what each place reads: the
 * application system's own trees, and each file or tree outside them that
 * reads a map of one of these names. An entry ending in `/` is a tree, any
 * other is one file, and no entry lies inside another.
 *
 *  - `system: true`: a tree the system owns. Every name a file there
 *    declares as a map from any string to something is held as well: see the
 *    header, "What is walked", 2.
 *  - otherwise: code outside the system that reads such a map by a key. The
 *    walk finds these itself, both ways: a file that calls the accessor and
 *    is under no entry fails, and an entry under which no file calls the
 *    accessor is stale.
 */
const HELD = new Map([
  [
    "src/lib/applications/",
    {
      system: true,
      why: "the contract and every module built on it: the maps are declared here, and the loaders, the scoring, the decisions and the send read them by ids that come from a request or from the form",
    },
  ],
  [
    "src/features/applications/",
    {
      system: true,
      why: "the screens: the form editor, the applicant's form, review, pooled applicants and decision day, which read the maps a route hands them by ids taken off the form",
    },
  ],
  [
    "src/app/api/admissions/forms/",
    {
      system: true,
      why: "the routes: an id in an address or a request body arrives here first, which is where a name every object carries would come from",
    },
  ],
  [
    "src/app/(app)/admin/admissions/forms/",
    {
      system: true,
      why: "the staff pages, which read what a loader worked out for each programme by the programme's id",
    },
  ],
  [
    "src/lib/firestore/memberRecords.ts",
    {
      why: "builds the kept member record: it reads a form's programmes by a programme id off the application, and a review's scores by a criterion id off the round",
    },
  ],
  [
    "src/features/events/",
    {
      why: "an RSVP's sign-up answers, read by a question id taken from the event's sign-up form: the form itself, the attendee dashboard and the pizza helper",
    },
  ],
  [
    "src/lib/events/",
    {
      why: "the RSVP email lists the same sign-up answers by the event's question ids",
    },
  ],
  [
    "src/features/worksheets/",
    {
      why: "a worksheet response's answers, read by a question id taken from the worksheet's own questions: the respond page, the response view, the copy editor and the aggregate views",
    },
  ],
  [
    "src/lib/firestore/worksheets.ts",
    {
      why: "the progress count and the submission check read a worksheet response's answers by the worksheet's question ids",
    },
  ],
  [
    "src/app/api/worksheets/",
    {
      why: "the poll results route reads the caller's own worksheet response by the question id in the request",
    },
  ],
  [
    "src/features/admissions/",
    {
      why: "the older apply flow keeps its answers by stage and then by question, and reads both by ids taken from the round",
    },
  ],
  [
    "src/app/(public)/applications/[roundId]/page.tsx",
    {
      why: "the status page's older half lists an older application's answers by the round's question ids (an application form's status is drawn inside the system's trees)",
    },
  ],
  [
    "src/features/courses/",
    {
      why: "a course application's answers: the apply form reads them by the run's question ids, and the admissions queue by the answers' own keys",
    },
  ],
]);

/**
 * A read whose key provably came from the same map's own keys. Keyed by
 * `<file> :: <the read>`. `times` is how often the file holds that read,
 * `proof` is text the file must contain that shows where the key came from,
 * and `why` says it in words. Checked both ways.
 */
const KEY_IS_THE_MAPS_OWN = new Map([
  [
    "src/lib/applications/review/saveReview.ts :: givenScores[key]",
    {
      times: 1,
      proof: "Object.keys(givenScores).filter((key) => givenScores[key] === null)",
      why: "picks out the scores a reviewer cleared: the key is one of the request's own keys, taken from the map on the same line, so it can only be a name the map holds",
    },
  ],
]);

/**
 * The modules that hand the accessor on under their own import path, so a
 * folder's files import it from beside them. Each must hand on the
 * contract's and define none of its own. Checked both ways.
 */
const PASSES_ON = new Map([
  [
    "src/lib/applications/applicant/keys",
    "the applicant's side: its files import the accessor from beside the two key checks that module adds",
  ],
  [
    "src/lib/applications/editor/own",
    "the form editor: its files and its client component import the accessor from the editor's own folder",
  ],
  [
    "src/lib/applications/review/own",
    "the review screens: the accessor sits beside programmeOn, which checks an id and then reads through it",
  ],
]);

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

const inRepo = (path) => relative(REPO_ROOT, path).split(sep).join("/");
const FILES = sourceFiles(SRC).sort();
const TEXT = new Map(FILES.map((path) => [path, readFileSync(path, "utf8")]));

/** True when `entry` covers `file`: a tree covers every file under it, a file covers itself. */
const covers = (entry, file) => (entry.endsWith("/") ? file.startsWith(entry) : file === entry);

/**
 * The entry of `HELD` a file is under, or null. No entry lies inside another
 * (section 3 holds that), so at most one covers any file.
 */
function heldUnder(file, held = HELD) {
  for (const entry of held.keys()) if (covers(entry, file)) return entry;
  return null;
}

/** The trees the application system owns, out of `HELD`. */
const THE_SYSTEM = [...HELD].filter(([, entry]) => entry.system).map(([tree]) => tree);
const inTheSystem = (path) => THE_SYSTEM.some((tree) => covers(tree, inRepo(path)));

/** What the scanner is told about the maps it looks for. */
function mapsNamed(names) {
  return {
    names,
    nested: [...EVERYWHERE].filter(([, map]) => map.nested).map(([name]) => name),
    typeNames: [...EVERYWHERE].filter(([, map]) => map.type).map(([name, map]) => [map.type, name]),
    accessor: ACCESSOR,
  };
}

/** Field names the system's types declare as maps, and each file's own local ones. */
const SYSTEM_FIELDS = new Set();
const LOCALS = new Map();
for (const path of FILES.filter(inTheSystem)) {
  for (const declared of declaredStringMaps(path, TEXT.get(path))) {
    if (declared.where === "field") SYSTEM_FIELDS.add(declared.name);
    else LOCALS.set(path, [...(LOCALS.get(path) ?? []), declared.name]);
  }
}

/** Every computed read in the tree, each with the file it is in. */
const SITES = [];
for (const path of FILES) {
  const names = inTheSystem(path)
    ? [...EVERYWHERE.keys(), ...SYSTEM_FIELDS, ...(LOCALS.get(path) ?? [])]
    : [...EVERYWHERE.keys()];
  for (const site of scanForComputedReads(path, TEXT.get(path), mapsNamed(names))) {
    SITES.push({ ...site, file: inRepo(path) });
  }
}

/** How every file comes by the accessor, and how often it calls it. */
const USES = new Map(
  FILES.map((path) => [inRepo(path), accessorUse(path, TEXT.get(path), { repoRoot: REPO_ROOT, exported: ACCESSOR })]),
);

describe("the maps this file holds", () => {
  test("each map looked for everywhere is still declared where it says", () => {
    for (const [name, map] of EVERYWHERE) {
      assert.ok(map.declared.length > 0, `${name}: names no declaration`);
      for (const [file, literal] of map.declared) {
        const path = join(REPO_ROOT, file);
        assert.ok(existsSync(path), `${name}: ${file} is gone`);
        assert.ok(
          readFileSync(path, "utf8").includes(literal),
          `${name}: ${file} no longer declares \`${literal}\`. If the map was renamed, rename it here; ` +
            "if it is gone, delete the entry.",
        );
      }
      assert.ok(map.why.length >= 40, `${name}: a reason is missing or too short to be one`);
    }
  });

  test("the application system's trees are there, and declare maps of their own", () => {
    for (const tree of THE_SYSTEM) {
      assert.ok(
        FILES.some((path) => inRepo(path).startsWith(tree)),
        `${tree} holds no source file. If the tree moved, move it here: a tree that is not walked is not held.`,
      );
    }
    // The walk is only worth its result if it read the tree. These are what
    // it must have found on the way: the accessor's own module, and names
    // the system is known to declare.
    assert.ok(FILES.length > 500, `only ${FILES.length} files were read under src`);
    assert.ok(TEXT.has(join(REPO_ROOT, ACCESSOR_FILE)), `${ACCESSOR_FILE} was not read`);
    for (const name of ["programmes", "scores", "toReview", "elsewhere"]) {
      assert.ok(SYSTEM_FIELDS.has(name), `the declarations read from the system's trees do not include \`${name}\``);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. No computed read outside the accessor
// ---------------------------------------------------------------------------

const keyOf = (site) => `${site.file} :: ${site.text}`;

describe("a map kept by an id is read through the accessor", () => {
  test("no file under src reads one with a computed key", () => {
    const offenders = SITES.filter((site) => site.file !== ACCESSOR_FILE && !KEY_IS_THE_MAPS_OWN.has(keyOf(site))).map(
      (site) =>
        `  ${site.file}:${site.line}  ${site.text}` +
        (site.fix ? `\n      write: ${site.fix}` : "\n      read the one value through own(map, key)"),
    );
    assert.deepEqual(
      offenders,
      [],
      "these read a map kept by an id with a key worked out when the code runs. A plain object also " +
        "answers to `constructor`, `toString` and every other name it inherits, so read it through " +
        "`own` (src/lib/applications/keys.ts), which answers from the map's own keys only. Fix the " +
        "read. KEY_IS_THE_MAPS_OWN is only for a key that provably came from the same map's own keys.\n" +
        offenders.join("\n"),
    );
  });

  test("the accessor's own module holds the one read it is there to make", () => {
    const inside = SITES.filter((site) => site.file === ACCESSOR_FILE).map((site) => site.text);
    assert.deepEqual(inside, ["map[key]"], "the accessor reads its map once, after asking whether the key is its own");
  });

  test("the registry lists reads that are there, as often as it says, each with its proof", () => {
    for (const [key, entry] of KEY_IS_THE_MAPS_OWN) {
      const [file] = key.split(" :: ");
      const found = SITES.filter((site) => keyOf(site) === key).length;
      assert.equal(
        found,
        entry.times,
        `${key}: listed ${entry.times} time(s) and found ${found}. Delete the entry if the read has gone, ` +
          "and write a new read through own rather than raising the count.",
      );
      assert.ok(
        TEXT.get(join(REPO_ROOT, file))?.includes(entry.proof),
        `${key}: the file no longer contains the text that shows the key is the map's own: ${entry.proof}`,
      );
      assert.ok(entry.why.length >= 40, `${key}: a reason is missing or too short to be one`);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Where these maps are read
// ---------------------------------------------------------------------------

describe("where these maps are read by a key", () => {
  test("each entry covers source that is there, once, with a reason", () => {
    for (const [entry, held] of HELD) {
      assert.match(
        entry,
        /^src\/.+(\/|\.tsx?)$/,
        `${entry}: an entry is a tree under src ending in a slash, or one .ts or .tsx file`,
      );
      assert.ok(
        FILES.some((path) => covers(entry, inRepo(path))),
        `${entry} covers no source file. If it moved, move the entry: a list of where the maps are read ` +
          "is only worth keeping while it is true.",
      );
      const inside = [...HELD.keys()].filter((other) => other !== entry && covers(other, entry));
      assert.deepEqual(
        inside,
        [],
        `${entry} lies inside ${inside.join(", ")}. A tree is listed once, whole, so what a file is held ` +
          "to can be read from one entry.",
      );
      assert.ok(
        typeof held.why === "string" && held.why.length >= 40,
        `${entry}: a reason is missing or too short to be one`,
      );
    }
  });

  test("the system's own trees are listed, and each other entry reads a map through the accessor", () => {
    assert.ok(THE_SYSTEM.length > 0, "HELD names no tree the application system owns");
    assert.ok(
      THE_SYSTEM.some((tree) => covers(tree, ACCESSOR_FILE)),
      `${ACCESSOR_FILE} is in none of the system's own trees`,
    );
    for (const [entry, held] of HELD) {
      if (held.system) {
        assert.ok(entry.endsWith("/"), `${entry}: what the system owns is listed as a tree`);
        continue;
      }
      const callers = [...USES].filter(([file, use]) => covers(entry, file) && use.calls > 0);
      assert.ok(
        callers.length > 0,
        `${entry} is listed as code that reads one of these maps by a key, and no file under it calls ` +
          `\`${ACCESSOR}\`. Delete the entry if it reads none any more.`,
      );
    }
  });

  test("every file that reads a map through the accessor is under an entry", () => {
    const unlisted = [...USES]
      .filter(([file, use]) => use.calls > 0 && heldUnder(file) === null)
      .map(([file, use]) => `  ${file} calls \`${ACCESSOR}\` ${use.calls} time(s)`);
    assert.deepEqual(
      unlisted,
      [],
      "these read a map through the accessor and are under no entry of HELD. That is the right way to " +
        "read one: list the file, or its tree, in HELD with what it reads, so the list of where these " +
        "maps are read stays true.\n" +
        unlisted.join("\n"),
    );
  });
});

// ---------------------------------------------------------------------------
// 4. One accessor
// ---------------------------------------------------------------------------

const withoutExtension = (file) => file.replace(/\.tsx?$/, "");

describe("there is one accessor", () => {
  test("only the contract's module defines it", () => {
    const defining = [...USES].filter(([, use]) => use.defines).map(([file]) => file);
    assert.deepEqual(
      defining,
      [ACCESSOR_FILE],
      `a function named \`${ACCESSOR}\` is defined outside ${ACCESSOR_FILE}. Two accessors are two places for ` +
        "the rule to drift: import the contract's, or hand it on with `export { own } from`.",
    );
  });

  test("a module that hands it on is listed, and hands on the contract's", () => {
    const handingOn = [...USES].filter(([, use]) => use.passesOn.length > 0);
    assert.deepEqual(
      handingOn.map(([file]) => withoutExtension(file)).sort(),
      [...PASSES_ON.keys()].sort(),
      "the modules that hand the accessor on and PASSES_ON disagree. List a new one with the reason its " +
        "folder imports the accessor from there, or delete the entry for one that no longer does.",
    );
    for (const [file, use] of handingOn) {
      assert.deepEqual(use.passesOn, [ACCESSOR_HOME], `${file} hands on an accessor that is not the contract's`);
    }
    for (const [module, why] of PASSES_ON) {
      assert.ok(why.length >= 40, `${module}: a reason is missing or too short to be one`);
    }
  });

  test("every file that calls it took it from the contract, or from a module that hands it on", () => {
    const homes = new Set([ACCESSOR_HOME, ...PASSES_ON.keys()]);
    const strays = [];
    let callers = 0;
    for (const [file, use] of USES) {
      if (file === ACCESSOR_FILE) continue;
      for (const taken of use.imports) {
        if (!homes.has(taken.from)) strays.push(`${file} takes \`${ACCESSOR}\` from ${taken.from}`);
      }
      if (use.calls > 0) {
        if (THE_SYSTEM.some((tree) => covers(tree, file))) callers += 1;
        if (use.imports.length === 0) strays.push(`${file} calls \`${ACCESSOR}\` and imports it from nowhere`);
      }
    }
    assert.deepEqual(strays, [], `these do not use the contract's accessor:\n  ${strays.join("\n  ")}`);
    // The reads above pass trivially in a tree where nothing reads a map at
    // all, so the walk has to have met the accessor in use. The floor counts
    // the system's own trees, which read these maps whatever else is listed:
    // 37 of their files called it when this was written.
    assert.ok(
      callers >= 30,
      `only ${callers} files in the system's own trees call the accessor, which is too few for the walk to be believed`,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. The scanner, on code written to be wrong
// ---------------------------------------------------------------------------

const scan = (source, file = "fixture.ts", names = [...EVERYWHERE.keys()]) =>
  scanForComputedReads(file, source, mapsNamed(names)).map((site) => `${site.kind} ${site.map}: ${site.text}`);

describe("the scanner, on code written to be wrong", () => {
  test("a computed read of a map is caught, however it is spelled", () => {
    const CAUGHT = [
      ["const p = form.programmes[id];", ["read programmes: form.programmes[id]"]],
      ["const p = form.programmes?.[id];", ["read programmes: form.programmes?.[id]"]],
      ["const p = form?.programmes[id];", ["read programmes: form?.programmes[id]"]],
      ["const p = programmes[id];", ["read programmes: programmes[id]"]],
      ['const p = form["programmes"][id];', ['read programmes: form["programmes"][id]']],
      ["const p = (form.programmes ?? {})[id];", ["read programmes: (form.programmes ?? {})[id]"]],
      ["const p = (form.programmes as Loose)[id]!;", ["read programmes: (form.programmes as Loose)[id]"]],
      ["const n = readiness.toReview[programmeId] ?? 0;", ["read toReview: readiness.toReview[programmeId]"]],
      // The key is computed even when it is a template or a call.
      ["const s = review.scores[`${setId}.${questionId}`];", ["read scores: review.scores[`${setId}.${questionId}`]"]],
      ["const s = review.scores[questionKey(setId, questionId)];", ["read scores: review.scores[questionKey(setId, questionId)]"]],
      // A read that goes on to write to what it found is still a read of the map.
      ["form.programmes[id].places = 3;", ["read programmes: form.programmes[id]"]],
      ["decision.programmes[id].reasons.push(reason);", ["read programmes: decision.programmes[id]"]],
      // Inside a template, where a reader of the text alone would not look.
      ["const line = `${form.programmes[id].name} is full`;", ["read programmes: form.programmes[id]"]],
      // An alias, by a binding, a renaming pattern, a later assignment or a declared type.
      ["const byId = form.programmes; const p = byId[id];", ["read programmes: byId[id]"]],
      ["const { programmes: byId } = form; const p = byId[id];", ["read programmes: byId[id]"]],
      ["let byId; byId = form.programmes; const p = byId[id];", ["read programmes: byId[id]"]],
      ["const a = form.programmes; const b = a; const p = b[id];", ["read programmes: b[id]"]],
      ["function f(given: Answers, setId: string) { return given[setId]; }", ["read answers: given[setId]"]],
      ["function f(byId: ApplicationForm[\"programmes\"], id: string) { return byId[id]; }", ["read programmes: byId[id]"]],
      ["type Props = { given: Answers }; function f(props: Props, id: string) { return props.given[id]; }", ["read answers: props.given[id]"]],
      // A map of maps: the value one level in is a map as well, by a bracket or through the accessor.
      [
        "const a = sent.answers[setId][questionId];",
        ["read answers: sent.answers[setId][questionId]", "read answers: sent.answers[setId]"],
      ],
      ["const a = own(sent.answers, setId)?.[questionId];", ["read answers: own(sent.answers, setId)?.[questionId]"]],
      ["const set = own(sent.answers, setId) ?? {}; const a = set[questionId];", ["read answers: set[questionId]"]],
      // The other two ways to ask a map about a key.
      ["if (id in form.programmes) go();", ["in programmes: id in form.programmes"]],
      ["const { [id]: programme } = form.programmes;", ["destructure programmes: { [id]: programme } = form.programmes"]],
    ];
    for (const [source, expected] of CAUGHT) assert.deepEqual(scan(source), expected, source);
  });

  test("a read in JSX is caught, and so is a ref's map", () => {
    assert.deepEqual(scan("const row = <td>{scores[key]}</td>;", "fixture.tsx"), ["read scores: scores[key]"]);
    assert.deepEqual(
      scan("const latest = useRef<Record<string, number>>({}); const n = latest.current[key];", "fixture.tsx", [
        ...EVERYWHERE.keys(),
        "latest",
      ]),
      ["read latest: latest.current[key]"],
    );
  });

  test("the accessor imported under another name is still followed", () => {
    assert.deepEqual(
      scan('import { own as ownKey } from "@/lib/applications/keys"; const a = ownKey(sent.answers, setId)?.[questionId];'),
      ["read answers: ownKey(sent.answers, setId)?.[questionId]"],
    );
  });

  test("what is not a computed read is let by", () => {
    const LET_BY = [
      // Through the accessor, which is the point.
      "const p = own(form.programmes, id);",
      "const a = own(own(sent.answers, setId), questionId);",
      // A key written out.
      'const p = form.programmes["agi-strategy"];',
      "const first = programmes[0];",
      "const last = programmes[-1];",
      // A write names the key it creates. What may be an id is another rule's.
      "scores[key] = 3;",
      "scores[key] += 1;",
      "scores[key]++;",
      "delete scores[key];",
      "(form.programmes)[id] = settings;",
      // The whole map, which asks it about no key.
      "for (const [id, programme] of Object.entries(form.programmes)) use(id, programme);",
      "const ids = Object.keys(form.programmes);",
      "const copy = { ...review.scores };",
      // Not a map: a name that is on no list, and the value two levels into the answers.
      "const n = counts[status];",
      "const letter = own(own(sent.answers, setId), questionId)[index];",
      // Prose and strings are not code.
      "// form.programmes[id] is how it used to be read",
      "/* form.programmes[id] */ const x = 1;",
      'const said = "form.programmes[id]";',
    ];
    for (const source of LET_BY) assert.deepEqual(scan(source), [], source);
  });

  test("the entry a file is under is read off the list as written", () => {
    const held = new Map([
      ["src/a/", {}],
      ["src/b/one.ts", {}],
    ]);
    const under = (file) => heldUnder(file, held);
    assert.equal(under("src/a/deep/x.tsx"), "src/a/");
    assert.equal(under("src/b/one.ts"), "src/b/one.ts");
    // A tree ends at its slash and a file entry covers that one file, so a
    // neighbour with a longer name is not swept in with either.
    assert.equal(under("src/ab/x.ts"), null);
    assert.equal(under("src/b/one.tsx"), null);
    assert.equal(under("src/b/two.ts"), null);
  });

  test("a file that does not parse is an error, not a clean file", () => {
    assert.throws(() => scan("const p = form.programmes[id"), /does not parse, so it cannot be scanned/);
  });

  test("the declarations that add to the names are read as written", () => {
    const declared = (source, file = "fixture.tsx") =>
      declaredStringMaps(file, source).map((found) => `${found.where} ${found.name}`);
    assert.deepEqual(
      declared(
        [
          "type Term = { cards: Record<string, Card>; work: Readonly<Record<string, Work>>; note?: Record<string, string> | null };",
          "function f(roles: Readonly<Record<string, Role>>) {}",
          "const out: Record<string, number> = {};",
          "const [versions, setVersions] = useState<Record<string, number>>({});",
          "const latest = useRef<Record<string, number>>({});",
        ].join("\n"),
      ),
      ["field cards", "field work", "field note", "local roles", "local out", "local versions", "local latest"],
    );
    // A stored document is read by field names the code spells, and other
    // shapes are not maps from any string.
    assert.deepEqual(
      declared(
        [
          "type Raw = { data: Record<string, unknown> };",
          'const labels: Record<"a" | "b", string> = { a: "", b: "" };',
          "const list: string[] = [];",
          "const [open, setOpen] = useState<boolean>(false);",
        ].join("\n"),
      ),
      [],
    );
  });

  test("how a file comes by the accessor is read as written", () => {
    const use = (source, file = join(REPO_ROOT, "src", "lib", "applications", "review", "x.ts")) =>
      accessorUse(file, source, { repoRoot: REPO_ROOT, exported: ACCESSOR });
    assert.deepEqual(use('import { own } from "../keys"; own(a, b); own(c, d);'), {
      imports: [{ local: "own", from: ACCESSOR_HOME }],
      passesOn: [],
      defines: false,
      calls: 2,
    });
    assert.deepEqual(use('import { own as ownKey } from "@/lib/applications/keys"; ownKey(a, b);').imports, [
      { local: "ownKey", from: ACCESSOR_HOME },
    ]);
    assert.deepEqual(use('import * as keys from "../keys"; const { own } = keys; own(a, b);').imports, [
      { local: "own", from: ACCESSOR_HOME },
    ]);
    assert.deepEqual(use('export { own } from "../keys";').passesOn, [ACCESSOR_HOME]);
    assert.deepEqual(use('import { own } from "../keys"; export { own };').passesOn, [ACCESSOR_HOME]);
    assert.equal(use("export function own(map, key) { return map[key]; }").defines, true);
    assert.equal(use("export const own = (map, key) => map[key];").defines, true);
    // A second accessor from somewhere else is seen for what it is.
    assert.deepEqual(use('import { own } from "./mine"; own(a, b);').imports, [
      { local: "own", from: "src/lib/applications/review/mine" },
    ]);
    // A thing called `own` that is not a function, and is not called, is nobody's accessor.
    assert.deepEqual(use("const own = rows.find(isMine); use(own.answers);"), {
      imports: [],
      passesOn: [],
      defines: false,
      calls: 0,
    });
  });
});
