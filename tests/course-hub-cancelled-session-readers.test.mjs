/**
 * Every reader of a register's `held` also asks whether the session was
 * cancelled through "Change a session".
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards
 *
 * A register (`courseAttendance`) says whether its session happened through
 * `held`, and a session nobody has opened a register for reads as held. A
 * session a facilitator cancels through "Change a session" is recorded on the
 * group (`sessionChanges`), never on a register: `resolveSessions` answers it
 * as `cancelled`, and it usually has no register at all. So a reader that
 * asks the register alone whether a session happened reads a cancelled
 * session as one that did, and chases it, counts it or shows it. The walk of
 * stage three found three: the lead's tabs (fixed in the walk), the
 * facilitators' register and Home's attendance strip.
 *
 * ## How it is held
 *
 * THE TREE. Every file under `src` whose code reads a `held` property and
 * names a register (its collection, its document's type, its id, or one of
 * the shapes a register is projected into) is listed below with what it does
 * about a cancelled session, and each entry's claim is read out of the
 * source. A new reader fails this file until somebody decides.
 *
 *  - `asks`: it reads a register's `held` and asks, in the same file, whether
 *    the session was cancelled. `proof` is where.
 *  - `told`: it reads `held` only off an answer that one of the `asks`
 *    readers built (`from`), so a cancelled session already reads as not held
 *    when it arrives. Every `held` it reads is read off one of `via`, and
 *    `proof` is how it is handed that answer.
 *  - `defines`: the register's own module, which parses the stored switch
 *    and knows no session. Exactly one.
 *  - `sends`: it carries somebody's own press of the switch to the register's
 *    route, and every `held` it reads is off `via`.
 *
 * The two readers the walk named and the one it fixed are `asks`, and a test
 * here says so by name.
 *
 * WHAT THE READERS THEN DO is executed in
 * `tests/course-hub-stage-three-journey.test.mjs` (section 2: the lead's
 * tabs, the facilitators' register and every press of it, and the members'
 * Home after the end) and `tests/course-hub-sessions-routes.test.mjs` (a
 * cancelled session on the register, as every kind of caller).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { assertReadable, stripSource } from "./lib/stripSource.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const inSrc = (file) => relative(SRC, file).split(sep).join("/");

/** A file's code with its comments gone; `keepStrings` keeps what is between the quotes. */
function codeOf(file, keepStrings) {
  const source = readFileSync(file, "utf8");
  const code = stripSource(source, { keepStrings });
  assertReadable(source, code, inSrc(file), assert);
  return code;
}

/** A read of a `held` property, as `x.held` or `x?.held`, with what it is read off. */
const HELD_READ = /([A-Za-z_$][\w$]*)\s*\??\.held\b/g;
/** Any read of a `held` property at all. */
const READS_HELD = /\.held\b/;

/**
 * A file NAMES A REGISTER when its code says the collection or its document's
 * type (`courseAttendance`, `CourseAttendanceDoc`, `normalizeCourseAttendance`),
 * builds a register's id (`attendanceDocId`), or reads one of the shapes a
 * register is projected into: the facilitators' columns (`AttendanceSession`),
 * a member's own marks (`ownAttendance`, `OwnAttendanceSession`), the lead's
 * session facts (`GroupSessionFacts`, `groupSessions`), the rollup's facts
 * (`RegisterFact`) and the jobs' state (`RegisterState`).
 */
const NAMES_A_REGISTER =
  /\bcourseAttendance\b|CourseAttendance|\battendanceDocId\b|ownAttendance|OwnAttendance|\bAttendanceSession\b|GroupSessionFacts|\bgroupSessions\b|\bRegisterFact\b|\bRegisterState\b/;

/** Asking whether the session was cancelled: the resolved session's flag, or the run's record of the change. */
const ASKS_CANCELLED = /\.cancelled\b|\bcancelledIn\(/;

/**
 * What each reader does about a session cancelled through "Change a session".
 * Paths are under `src`.
 */
const READERS = {
  // ── The two readers the walk named, and the one it fixed ─────────────────
  "app/api/courses/groups/[groupId]/attendance/route.ts": {
    kind: "asks",
    proof: ["held: !c.cancelled && (state?.held ?? true)", "if (!ctx.session.cancelled) return null;"],
    why:
      "the facilitators' register: a cancelled session's column reads as not held whatever its register says, and " +
      "a mark, the switch, a note or a correction to its register is refused in the register's words for a session " +
      "that did not happen",
  },
  "app/(app)/dashboard/HomeProgramme.tsx": {
    kind: "asks",
    proof: ["const cancelled = group !== null && cancelledIn(group, n) !== null;"],
    why:
      "Home's attendance strip: a week whose session was cancelled reads as no session, from the run's own record of " +
      "the change, since a cancelled session has no register to say so",
  },
  "lib/courses/programmeAttendance.ts": {
    kind: "asks",
    proof: ["const held = !session.cancelled && (register ? register.held : true);"],
    why:
      "the lead's tabs (the Overview, the Attendance grid and its CSV, who finished): one fact per session, read once, " +
      "a cancelled session not held",
  },

  // ── Every other reader of a stored register's switch ─────────────────────
  "app/api/courses/groups/[groupId]/attendance/push/route.ts": {
    kind: "asks",
    proof: ["if (session.cancelled) {"],
    why:
      "finishing a register: a cancelled session's press is refused before its register is read, so the switch it " +
      "reads after that is a session that met; nothing is locked, mirrored or sent for a cancelled one",
  },
  "lib/courses/attendanceMirror.ts": {
    kind: "asks",
    proof: ["held: !session.cancelled && (override?.held ?? stored?.held ?? true),"],
    why: "every member's stored rollup, rebuilt from the group's registers: a cancelled session counts for nobody",
  },
  "lib/courses/ownAttendance.ts": {
    kind: "asks",
    proof: ["held: !session.cancelled && raw.held !== false,"],
    why:
      "a member's own marks, projected out of their group's registers for the run home, Home and the page somebody " +
      "reads once they have left: a cancelled session was never held",
  },
  "lib/courses/finishing/whoFinished.ts": {
    kind: "asks",
    proof: ["if (session.cancelled || register?.held === false)"],
    why: "the note under who finished: how many times a group met, a cancelled session and a register that says not held both left out",
  },
  "lib/scheduler/jobs/registerReminders.ts": {
    kind: "asks",
    proof: [".filter((session) => !session.cancelled)"],
    why: "the facilitators' reminder: a cancelled session is left out before its register is read",
  },
  "lib/scheduler/jobs/unmarkedRegisters.ts": {
    kind: "asks",
    proof: ["!session.cancelled &&"],
    why: "the task for the lead and admins: a cancelled session is left out before its register is read",
  },

  // ── Readers handed an answer one of those built ──────────────────────────
  "app/api/admissions/forms/[roundId]/programmes/[programmeId]/registers/remind/route.ts": {
    kind: "told",
    from: ["lib/courses/programmeAttendance.ts"],
    via: ["facts"],
    proof: ["groupSessions(records, group, now)"],
    why: "Remind on the Overview reads a session's facts as the lead's tabs read them, and refuses one that did not happen",
  },
  "lib/courses/programmeOverview.ts": {
    kind: "told",
    from: ["lib/courses/programmeAttendance.ts"],
    via: ["facts"],
    proof: ["listGroups(records, viewer, now, weeksOf(records))"],
    why: "the Overview's sessions this week and Needs attention: each group's session facts, as the lead's tabs read them",
  },
  "features/courses/AttendanceGrid.tsx": {
    kind: "told",
    from: ["app/api/courses/groups/[groupId]/attendance/route.ts"],
    via: ["session"],
    proof: ["AttendanceSession"],
    why: "the register's grid draws the register route's own columns",
  },
  "features/courses/PushConfirm.tsx": {
    kind: "told",
    from: ["app/api/courses/groups/[groupId]/attendance/route.ts"],
    via: ["session"],
    proof: ["AttendanceSession"],
    why: "the push's confirmation names a column of the register route's own answer",
  },
  "features/courses/RunHome.tsx": {
    kind: "told",
    from: ["lib/courses/ownAttendance.ts"],
    via: ["session"],
    proof: ["ownAttendance?.sessions"],
    why: "the run home's marks are the member's own projection, as the overview route carries it",
  },
  "lib/courses/leftView.ts": {
    kind: "told",
    from: ["lib/courses/ownAttendance.ts"],
    via: ["row"],
    proof: ["ownAttendanceSessions(enrolment.uid, sessions, registers)"],
    why: "the marks on the page somebody reads once they have left: their own projection, the registers handed to it unread",
  },
  "lib/courses/attendanceRollup.ts": {
    kind: "told",
    from: ["lib/courses/attendanceMirror.ts"],
    via: ["r"],
    proof: ["RegisterFact"],
    why: "the rollup's arithmetic, handed its facts by the mirror, which says a cancelled session was not held",
  },
  "lib/courses/unmarkedRegisters.ts": {
    kind: "told",
    from: ["lib/scheduler/jobs/unmarkedRegisters.ts", "lib/scheduler/jobs/registerReminders.ts"],
    via: ["state"],
    proof: ["export function isRegisterUnmarked(state: RegisterState)"],
    why: "the one predicate of a register to chase, handed its state by the two jobs, which leave a cancelled session out first",
  },

  // ── The register's own module ────────────────────────────────────────────
  "lib/firestore/courseAttendance.ts": {
    kind: "defines",
    via: ["data"],
    proof: ["held: data.held !== false"],
    why: "the one parser of the stored switch: it is handed a document and no session, and every reader of what it returns is listed here",
  },

  // ── A carrier of somebody's own press ────────────────────────────────────
  "features/courses/useAttendance.ts": {
    kind: "sends",
    via: ["patch"],
    proof: ["held: patch.held"],
    why: "carries a facilitator's press of the switch to the register's route, and reloads the columns from the route rather than reading a switch",
  },
};

const KINDS = new Set(["asks", "told", "defines", "sends"]);

/** Every file under `src` that reads a `held` property and names a register. */
function readersInTree() {
  const files = [...walkSource(SRC)];
  assert.ok(files.length > 500, `the walk found only ${files.length} files: it is not reading the tree`);
  const found = new Set();
  for (const file of files) {
    if (!READS_HELD.test(codeOf(file, false))) continue;
    if (!NAMES_A_REGISTER.test(codeOf(file, true))) continue;
    found.add(inSrc(file));
  }
  return found;
}

/** What each `held` in a file is read off: `{ identifier: count }`. */
function heldReadsOf(code) {
  const out = {};
  for (const [, owner] of code.matchAll(HELD_READ)) out[owner] = (out[owner] ?? 0) + 1;
  return out;
}

describe("a register's held, and a session cancelled through Change a session", () => {
  test("the tree: every reader of a register's held is listed, and every listed file is one", () => {
    const found = readersInTree();
    const listed = new Set(Object.keys(READERS));
    const unlisted = [...found].filter((file) => !listed.has(file));
    assert.deepEqual(
      unlisted,
      [],
      "a file reads a register's held and is not listed: say what it does about a session cancelled through " +
        "Change a session (ask `session.cancelled` or `cancelledIn`, or read an answer that already asks)",
    );
    const gone = [...listed].filter((file) => !found.has(file));
    assert.deepEqual(gone, [], "a listed file no longer reads a register's held, or is gone: take it off the list");
  });

  test("every entry says what it is, why, and how that is shown", () => {
    for (const [file, entry] of Object.entries(READERS)) {
      assert.ok(KINDS.has(entry.kind), `${file}: unknown kind ${entry.kind}`);
      assert.ok(typeof entry.why === "string" && entry.why.length > 30, `${file}: say why`);
      assert.ok(Array.isArray(entry.proof) && entry.proof.length > 0, `${file}: no proof`);
      assert.ok(existsSync(join(SRC, file)), `${file}: not there`);
    }
    const defines = Object.entries(READERS).filter(([, entry]) => entry.kind === "defines");
    assert.deepEqual(defines.map(([file]) => file), ["lib/firestore/courseAttendance.ts"]);
  });

  test("a reader that asks says so in its code, where its entry says", () => {
    for (const [file, entry] of Object.entries(READERS)) {
      if (entry.kind !== "asks") continue;
      const code = codeOf(join(SRC, file), true);
      assert.match(code, ASKS_CANCELLED, `${file} reads a register's held and never asks whether the session was cancelled`);
      for (const proof of entry.proof) assert.ok(code.includes(proof), `${file}: "${proof}" is not in its code any more`);
    }
  });

  test("a reader that is told reads held only off the answer it is handed, from a reader that asks", () => {
    for (const [file, entry] of Object.entries(READERS)) {
      if (entry.kind !== "told") continue;
      assert.ok(entry.from.length > 0, `${file}: told by nobody`);
      for (const source of entry.from) {
        assert.equal(READERS[source]?.kind, "asks", `${file} is told by ${source}, which is not a reader that asks`);
      }
      const code = codeOf(join(SRC, file), true);
      for (const proof of entry.proof) assert.ok(code.includes(proof), `${file}: "${proof}" is not in its code any more`);
      const owners = Object.keys(heldReadsOf(codeOf(join(SRC, file), false)));
      assert.ok(owners.length > 0, `${file}: reads no held off anything`);
      for (const owner of owners) {
        assert.ok(
          entry.via.includes(owner),
          `${file} reads held off \`${owner}\`, which is not the answer it is told by: a register's own switch read ` +
            "here has to ask whether the session was cancelled",
        );
      }
    }
  });

  test("the register's own module parses the switch and knows no session; a carrier of a press reads no switch", () => {
    for (const [file, entry] of Object.entries(READERS)) {
      if (entry.kind !== "defines" && entry.kind !== "sends") continue;
      const kept = codeOf(join(SRC, file), true);
      for (const proof of entry.proof) assert.ok(kept.includes(proof), `${file}: "${proof}" is not in its code any more`);
      for (const owner of Object.keys(heldReadsOf(codeOf(join(SRC, file), false)))) {
        assert.ok(entry.via.includes(owner), `${file} reads held off \`${owner}\` as well`);
      }
      if (entry.kind === "defines") assert.doesNotMatch(kept, /\bresolveSessions\(/, `${file} resolves sessions: it is a reader, not the parser`);
    }
  });

  test("the two readers the walk of stage three named, and the one it fixed, ask", () => {
    for (const file of [
      "app/api/courses/groups/[groupId]/attendance/route.ts",
      "app/(app)/dashboard/HomeProgramme.tsx",
      "lib/courses/programmeAttendance.ts",
    ]) {
      assert.equal(READERS[file]?.kind, "asks", file);
    }
  });
});
