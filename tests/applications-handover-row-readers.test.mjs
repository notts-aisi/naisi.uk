/**
 * Every reader of a course run's own applications list says what it does
 * about a row the application form put there.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards
 *
 * `courseApplications` is the course system's own list of who may be placed
 * on a run. It was built for people who applied to a run itself, and the
 * people a run names (its admissions reviewers and its track leads) read
 * those rows. An admin's hand-over now writes rows there for people who
 * applied on the term's application form (`fromForm`), where who may read an
 * application is decided programme by programme. Being named on a run gives
 * nobody that right.
 *
 * So A ROW FROM THE FORM IS SERVED TO AN ADMIN AND TO THE LEAD OF THE
 * PROGRAMME THAT NAMES THE RUN (the rows that programme's hand-over wrote),
 * on every staff route that reads or acts on rows, and to nobody else. One
 * function says it (`rowIsServedTo` in
 * `src/lib/firestore/courseApplications.ts`), and a route that forgot to ask
 * would hand a track lead the name of everybody a programme accepted.
 *
 * ## How it is held
 *
 * THE TREE. Every file under `src` that addresses the collection is listed
 * below with what it does about such a row, and each entry's claim is read
 * out of the source. A new reader fails this file until somebody decides. A
 * staff reader has to ask `rowIsServedTo` as many times as it reads rows, and
 * each time with the caller's whole standing on the run, worked out by
 * `runStaffingOf` (`src/lib/courses/runStaffing.ts`): whether they are an
 * admin, and the programme they lead that names the run.
 *
 * WHAT THE ROUTES THEN DO is executed in
 * `tests/applications-handover-board.test.mjs`, as an admin, a track lead and
 * the run's reviewer, and in `tests/course-hub-lead-rows.test.mjs` as the
 * lead of the programme that names the run, on every one of the staff routes
 * listed here.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const posix = (path) => path.split(sep).join("/");
const inSrc = (file) => posix(relative(SRC, file));

/** A file's code with its comments gone and its strings kept. */
const codeOf = (file) => stripSource(readFileSync(file, "utf8"), { keepStrings: true });

/**
 * A file ADDRESSES the collection when its code hands the name to a database
 * call, on the server or in a browser, or uses the one constant that holds
 * the name. A file that only says the word (the pause switch that shares it,
 * a label) addresses nothing and is not a reader.
 */
const ADDRESSES =
  /\.collection\(\s*["'`]courseApplications["'`]\s*\)|\b(?:collection|doc)\(\s*[^,()]+(?:\([^()]*\))?\s*,\s*["'`]courseApplications["'`]|\bRUN_APPLICATIONS_COLLECTION\b|\bbyRunId\(\s*["'`]courseApplications["'`]\s*\)|\[\s*["'`]courseApplications["'`]\s*,/;

/**
 * What each reader does about a row from the form.
 *
 *  - `staff`: it reads or acts on rows for the people a run names, so it asks
 *    `rowIsServedTo` before each, with the standing `runStaffingOf` worked
 *    out for the caller. `asks` is how many times.
 *  - `own`: it reads the caller's own row and nobody else's. `proof` is the
 *    text that makes that true.
 *  - `admin`: every caller is an admin before a row is read. `proof` is the
 *    gate.
 *  - `no-content`: it reads no row's content for anybody: it counts, deletes
 *    or takes one field that a row from the form does not carry.
 */
const READERS = {
  "app/api/courses/runs/[runId]/allocation/route.ts": {
    kind: "staff",
    asks: 1,
    why: "the allocation board's list of accepted people, for an admin, the run's track leads or the lead of the programme that names it",
  },
  "app/api/courses/runs/[runId]/allocate/route.ts": {
    kind: "staff",
    asks: 1,
    why:
      "a placement reads each person's row to see that they were accepted, and answers by uid; for a seat " +
      "that has left and is put back, it reads where the row came from (fromForm) to give that place on the " +
      "form back to them, only once the row is served to the caller",
  },
  "app/api/courses/runs/[runId]/allocation/publish/route.ts": {
    kind: "staff",
    asks: 1,
    why: "Publish lists accepted people, names the unplaced in a refusal and emails the rest, and is held for a caller the run holds a row they are not served",
  },
  "app/api/courses/runs/[runId]/allocation/publish/test/route.ts": {
    kind: "staff",
    asks: 1,
    why: "\"Send a test to me\" reads the run's accepted people to write the first person's real email, for an admin, the run's track leads or the lead of the programme that names it",
  },
  "app/api/courses/runs/[runId]/allocation/publish/preview/route.ts": {
    kind: "staff",
    asks: 1,
    why:
      "Publish's own page reads the run's accepted people to show who a press emails and the first email of each " +
      "kind, for the same callers as Publish: an admin, the run's track leads or the lead of the programme that names it",
  },
  "lib/courses/getReady/read.ts": {
    kind: "staff",
    asks: 1,
    why:
      "the Overview's Get ready for week 1 and Publish's readiness check read the run's accepted people as the board " +
      "serves them, to count who is in a group and name who Publish waits for, for the programme's lead and admins",
  },
  "app/api/courses/runs/[runId]/applications/route.ts": {
    kind: "staff",
    asks: 1,
    why: "the run's own queue, for an admin, its admissions reviewers, its track leads and the lead of the programme that names it",
  },
  "app/api/courses/runs/[runId]/applications/[uid]/decide/route.ts": {
    kind: "staff",
    asks: 1,
    why: "decides one row, for an admin or the run's admissions reviewers",
  },
  "app/api/courses/runs/[runId]/applications/[uid]/notes/route.ts": {
    kind: "staff",
    asks: 1,
    why: "writes a reviewer's notes onto one row, for an admin or the run's admissions reviewers",
  },
  "app/api/courses/groups/[groupId]/facilitators/route.ts": {
    kind: "staff",
    asks: 1,
    why:
      "staffing a group by hand reads the row of each person it adds, to place a facilitator who holds a place in " +
      "the group they facilitate, for an admin, the run's track leads or the lead of the programme that names it. " +
      "A row the caller is not served saves nothing, in a sentence that says only who may staff that person",
  },
  "app/api/courses/me/route.ts": {
    kind: "own",
    proof: ['.where("uid", "==", actor.uid)', "if (app.fromForm !== null) continue;"],
    why: "the caller's own rows, for their own member area. A row from the form is passed over there before its status is read: it is announced as nothing",
  },
  "app/api/courses/runs/[runId]/apply/route.ts": {
    kind: "own",
    proof: ["courseApplicationId(runId, user.uid)"],
    why: "the caller's own application to a run, at the one id that is theirs",
  },
  "lib/courses/leaving.ts": {
    kind: "own",
    proof: ["courseApplicationId(run.id, uid)", "row.uid !== uid"],
    why:
      "where one person's seat on a run came from: their own row, at the one id that is theirs, read for where it " +
      "came from (fromForm) and nothing else, and nothing of it handed back. Asked for the caller by the leave route " +
      "and the two pages that offer the way out, and for the person whose seat Remove takes off, behind Remove's own " +
      "gate, so their place on the form goes back as leaving gives it",
  },
  "lib/courses/facilitatorAsks/answer.ts": {
    kind: "own",
    proof: ["courseApplicationId(ask.runId, actor.uid)", "listedRow.uid === actor.uid"],
    why:
      "the yes of the person asked to facilitate reads their own row on the run's list, at the one id that is " +
      "theirs, only to see whether they are accepted, so a facilitator who holds a place is placed in the group " +
      "they facilitate. Nothing of it is handed back",
  },
  "features/courses/useMyApplication.ts": {
    kind: "own",
    proof: ["courseApplicationId(runId, uid)", "application?.uid === uid"],
    why: "the signed-in member's own row, read from the browser under the rule that allows an own row. Only the run's own apply form mounts it, and the apply page draws no form for a run the application form places people on (tests/applications-handover-older-way-in.test.mjs)",
  },
  "features/courses/useCourseApplicationCount.ts": {
    kind: "no-content",
    proof: ['where("status", "==", "pending")', "getCountFromServer("],
    why: "an admin's count of pending applications. A row from the form is never pending, and a count names nobody",
  },
  "app/api/courses/runs/[runId]/enrolments/[uid]/remove/route.ts": {
    kind: "no-content",
    proof: ["appSnap.data()?.email"],
    why:
      "takes the address off a row to drop a mailing-list entry when the account has gone. A row from the form " +
      "carries no address, and nothing of the row is sent back. Where the seat's place came from, to give it back on " +
      "the form, is leaving's own answer (lib/courses/leaving.ts, listed there)",
  },
  "lib/firestore/accountDeletion.ts": {
    kind: "no-content",
    proof: ['["courseApplications", "courseApplicationsDeleted"]'],
    why: "deletes every row of an account that is being deleted, wherever the row came from",
  },
  "lib/firestore/courseDeletion.ts": {
    kind: "no-content",
    proof: ['byRunId("courseApplications")'],
    why: "counts and deletes a run's rows when the run is destroyed, wherever they came from",
  },
  "lib/applications/handover/run.ts": {
    kind: "admin",
    proof: ["if (!canRunTerm(actor)) return refuse(403, NOT_AN_ADMIN);"],
    why: "the writer of a programme's run reads the run's rows to see that it has none of its own, and that nobody has been handed over",
  },
  "lib/applications/handover/handOver.ts": {
    kind: "admin",
    proof: ["if (!canRunTerm(actor)) return { ok: false, status: 403, error: ONLY_AN_ADMIN_HANDS_OVER };"],
    why: "the hand-over itself: it creates the rows, and reads only whether each is already there",
  },
  "lib/applications/handover/load.ts": {
    kind: "admin",
    proof: ['if (!canRunTerm(actor)) return { status: "not-admin" };'],
    why: "the panel beside the hand-over compares who holds a place with the run's rows",
  },
};

const KINDS = ["staff", "own", "admin", "no-content"];
const SERVED = /\browIsServedTo\s*\(/g;

describe("every reader of a run's own applications list says what it does about a row from the form", () => {
  const files = [...walkSource(SRC)];
  const readers = files.filter((file) => ADDRESSES.test(codeOf(file))).map(inSrc).sort();

  test("the scan is reading: it finds the readers this file knows by name", () => {
    assert.ok(readers.length >= 12, `only ${readers.length} readers were found`);
    for (const known of [
      "app/api/courses/runs/[runId]/allocation/route.ts",
      "features/courses/useMyApplication.ts",
      "lib/firestore/courseDeletion.ts",
      "lib/applications/handover/handOver.ts",
    ]) {
      assert.ok(readers.includes(known), `${known} addresses the collection and the scan did not see it`);
    }
  });

  test("each one is listed, and every entry is a file that still reads the list", () => {
    assert.deepEqual(
      readers.filter((file) => !Object.hasOwn(READERS, file)),
      [],
      "These read a run's own applications list and are not in READERS. A row an admin's " +
        "hand-over wrote is an admin's to read: decide what each does about one, and list it.",
    );
    assert.deepEqual(Object.keys(READERS).filter((file) => !readers.includes(file)), []);
  });

  for (const [file, entry] of Object.entries(READERS)) {
    test(`${file} does what its entry says`, () => {
      assert.ok(KINDS.includes(entry.kind), `\`${entry.kind}\` is not a kind`);
      assert.ok(typeof entry.why === "string" && entry.why.length >= 40, "a reason is missing or too short to be one");
      const code = codeOf(join(SRC, ...file.split("/")));
      const asked = [...code.matchAll(SERVED)].length;
      if (entry.kind === "staff") {
        assert.ok(Number.isInteger(entry.asks) && entry.asks > 0, "says how many times it asks");
        assert.equal(
          asked,
          entry.asks,
          "It does not ask rowIsServedTo the number of times its entry says. A staff route " +
            "that reads a row without asking hands a row from the form to whoever the run names.",
        );
        assert.match(
          code,
          /import\s*\{[^}]*\browIsServedTo\b[^}]*\}\s*from\s*"@\/lib\/firestore\/courseApplications"/,
          "it asks a question of its own instead of the collection's rowIsServedTo",
        );
        // Who is asking is the caller's own standing on the run, worked out
        // once in the route by the one function that knows it: whether they
        // are an admin, and the programme they lead that names the run.
        assert.equal(
          [...code.matchAll(/\browIsServedTo\s*\([\s\S]{0,160}?,\s*staffing\s*\)/g)].length,
          entry.asks,
          "each time it asks, it has to ask with the caller's own standing on the run",
        );
        assert.match(
          code,
          /const staffing = await runStaffingOf\(db, actor, /,
          "the standing it asks with is the caller's, from runStaffingOf",
        );
        assert.equal(
          [...code.matchAll(/\bconst staffing\b/g)].length,
          1,
          "the standing is worked out once, and is the only thing called that",
        );
        assert.match(
          code,
          /import\s*\{[^}]*\brunStaffingOf\b[^}]*\}\s*from\s*"@\/lib\/courses\/runStaffing"/,
          "it takes runStaffingOf from the one module that answers it",
        );
      } else {
        assert.equal(asked, 0, "it is not listed as a staff reader, and it asks who a row is served to");
        assert.ok(Array.isArray(entry.proof) && entry.proof.length > 0, "names what the file has to contain");
        for (const literal of entry.proof) {
          assert.ok(code.includes(literal), `its reason is about \`${literal}\`, which the file no longer contains`);
        }
      }
    });
  }

  test("nothing asks who a row is served to without being a reader of the list", () => {
    const asking = files
      .filter((file) => [...codeOf(file).matchAll(SERVED)].length > 0)
      .map(inSrc)
      .filter((file) => file !== "lib/firestore/courseApplications.ts")
      .sort();
    assert.deepEqual(
      asking,
      Object.entries(READERS)
        .filter(([, entry]) => entry.kind === "staff")
        .map(([file]) => file)
        .sort(),
    );
  });

  test("the rule is one function: a row from the form to an admin, and to the lead of the programme it came from", () => {
    const code = codeOf(join(SRC, "lib", "firestore", "courseApplications.ts"));
    assert.match(code, /export function rowIsServedTo\(/);
    // Its whole body. The lead's programme has to be the row's own, both ids.
    assert.match(
      code,
      /if \(row\.fromForm === null \|\| viewer\.isAdmin\) return true;\s*const lead = viewer\.leadOf;\s*return \(\s*lead !== null &&\s*row\.fromForm\.roundId === lead\.roundId &&\s*row\.fromForm\.programmeId === lead\.programmeId\s*\);\s*\}/,
    );
    // And the programme the lead leads is worked out in one place, from the
    // form, at the moment of asking (`programmeLedBy`), never stored.
    const staffing = codeOf(join(SRC, "lib", "courses", "runStaffing.ts"));
    assert.match(staffing, /leadOf: isAdmin \? null : await programmeLedBy\(db, actor, run\.id\),/);
  });
});
