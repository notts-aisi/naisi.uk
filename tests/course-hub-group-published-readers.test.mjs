/**
 * Every reader of placements in `src` says what it does about a placement
 * Publish has not told its owner about.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards
 *
 * A placement is somebody's seat in a group: a `courseEnrolments` row. An
 * admin's placement on the allocation board makes the row at once, and the
 * row is the board's working copy until Publish emails its owner their group
 * (`allocatedEmailAt`; a move clears it). Until then nothing may show it:
 * not to its owner, not to the group's facilitators or its other members,
 * and no email or notification about the group may reach them. Admins are
 * shown everything placed. Two functions in
 * `src/lib/firestore/courseEnrolments.ts` say it:
 *
 *  - `placementIsTold(enrolment)`, the fact;
 *  - `placementIsShownTo(enrolment, { isAdmin })`, for a reader that shows
 *    one person's placement, or a name, to the session in front of it.
 *
 * The class of failure is "a reader shows a placement before the person was
 * told". A new route that reads enrolments and forgets the question would put
 * it back, on a page nobody thought to test.
 *
 * ## How it is held
 *
 * THE TREE. Every file under `src` that addresses the collection is listed
 * below with what it does about an untold placement, and each entry's claim
 * is read out of the source. A new reader fails this file until somebody
 * decides. A reader that shows placements has to ask the question as many
 * times as its entry says, and about the caller's own role.
 *
 * TWO HELPERS carry the question for the files that call them, and are held
 * here too: `loadRegisterMembers` (the register, its notes) is handed the
 * caller's role by every caller, and `resolveCohortAudience` (the register
 * push's reminder, the week nudge, the run email) asks `placementIsTold`.
 *
 * WHAT THE READERS THEN DO is executed in
 * `tests/course-hub-group-published-{member,facilitator,mail,nudge}.test.mjs`.
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
 * call, on the server (`.collection("courseEnrolments")`) or in a browser
 * (`doc(db, "courseEnrolments", …)`), or to one of the deletion sweeps'
 * helpers. A file that only says the word (the pause switch that shares it,
 * a standing check's label, a comment) addresses nothing.
 */
const ADDRESSES =
  /\.collection\(\s*["'`]courseEnrolments["'`]\s*\)|\b(?:collection|doc)\(\s*[^,()]+(?:\([^()]*\))?\s*,\s*["'`]courseEnrolments["'`]|\bbyRunId\(\s*["'`]courseEnrolments["'`]\s*\)|\[\s*["'`]courseEnrolments["'`]\s*,|\bdrainQuery\([^,]+,\s*["'`]courseEnrolments["'`]/;

/** The home of the rule. It defines the two functions and reads nothing. */
const RULE_HOME = "lib/firestore/courseEnrolments.ts";

/**
 * What each reader does about a placement Publish has not told.
 *
 *  - `shown`: it shows somebody's placement, or a name in a group, to the
 *    caller, or sends to the people it lists. It asks `placementIsShownTo`
 *    `asks` times, about the caller's own role.
 *  - `told`: it sends to a cohort, and leaves out every placement nobody has
 *    told, whoever sends. It asks `placementIsTold` `asks` times.
 *  - `board`: the allocation board and Publish. Their callers place people
 *    and tell them, so they read every placement, and they are this rule's
 *    source, not its readers. `proof` is the gate.
 *  - `staff`: a run's own staff tools that show no member a placement and
 *    name nobody to a facilitator. `proof` is the gate.
 *  - `writer`: it counts, rebuilds or deletes, and shows nobody anything.
 *    `proof` is what makes that true.
 */
const READERS = {
  "app/api/courses/me/route.ts": {
    kind: "shown",
    asks: 1,
    why: "the member hub: a seat nobody has told is passed over, and the offer it replaced still reads as an offer",
  },
  "features/courses/runAccess.ts": {
    kind: "shown",
    asks: 1,
    why: "the gate of every page under /learn/[runId]: an untold seat opens nothing, as no seat opened nothing",
  },
  "app/api/courses/runs/[runId]/overview/route.ts": {
    kind: "shown",
    asks: 1,
    why: "the run home's one read: an untold seat is answered as no seat, and its group card is not drawn from it",
  },
  "app/api/courses/groups/[groupId]/roster/route.ts": {
    kind: "shown",
    asks: 2,
    why: "the group's names: an untold member cannot open it, and an untold name is listed to nobody but an admin",
  },
  "lib/courses/pitching/people.ts": {
    kind: "shown",
    asks: 2,
    why: "pitching week's people: an untold seat cannot pitch or pick, is offered as nobody's partner, is named to nobody and is not counted on the lead's list",
  },
  "lib/courses/updates/readers.ts": {
    kind: "shown",
    asks: 1,
    why: "who reads a run's updates: an untold seat reads nothing, as no seat read nothing, so no update to its group is shown to it",
  },
  "lib/courses/weekOne/door.ts": {
    kind: "told",
    asks: 1,
    why: "week 1's door before groups go out (Q35 B): the caller's own seat only, never shown. A seat Publish has told them about is the run gate's, a seat that has left shuts the door, and an untold seat opens week 1 alone, by the place on the form, with nothing of its group",
  },
  "lib/courses/updates/audience.ts": {
    kind: "told",
    asks: 1,
    why: "who an update is to and who its email reaches: an untold seat counts as nobody, and the email goes through the cohort audience, which leaves it out",
  },
  "lib/courses/sharedNotes/readers.ts": {
    kind: "told",
    asks: 1,
    why: "who reads and writes a group's shared notes: the caller's own place counts only once Publish has told them, whoever asks, an admin's own untold place included, so an untold seat neither reads nor writes its group's notes",
  },
  "lib/courses/registerAccess.ts": {
    kind: "shown",
    asks: 1,
    why: "the register's rows for the register and its notes: an untold member is no row, so is neither named nor markable",
  },
  "lib/courses/programmeAttendance.ts": {
    kind: "shown",
    asks: 1,
    why:
      "a programme's attendance for its lead and admins (the Attendance grid, its CSV, the Overview and the line " +
      "under the programme's name): an untold placement is no row and no count for anybody but an admin, as on the " +
      "register; somebody who has left is listed only where a register marked them",
  },
  "app/api/courses/groups/[groupId]/exercises/route.ts": {
    kind: "shown",
    asks: 1,
    why: "the facilitator's review queue: an untold member's name and work are not a row for anybody but an admin",
  },
  "app/api/courses/exercise-responses/[responseId]/review/route.ts": {
    kind: "shown",
    asks: 1,
    why: "a facilitator acts on the work of somebody in their group; an untold owner is answered as an unplaced one",
  },
  "app/api/courses/groups/[groupId]/email/route.ts": {
    kind: "shown",
    asks: 1,
    why: "a group email reaches the sender's roster: a facilitator's reaches the people told, an admin's everybody placed",
  },
  "app/api/courses/groups/[groupId]/notice/route.ts": {
    kind: "shown",
    asks: 1,
    why: "a room notice reaches the sender's roster, for the group email's reason",
  },
  "app/api/courses/runs/[runId]/comments/route.ts": {
    kind: "shown",
    asks: 1,
    why: "the run's comments open to a member of the run: an untold seat does not make one",
  },
  "app/api/courses/runs/[runId]/my-exercises/route.ts": {
    kind: "shown",
    asks: 1,
    why: "a member's own answers on the run: an untold seat does not open the run",
  },
  "app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route.ts": {
    kind: "shown",
    asks: 1,
    why: "a member answers an exercise on the run: an untold seat does not open the run",
  },
  "app/api/courses/runs/[runId]/packs-and-cases/[blockId]/route.ts": {
    kind: "shown",
    asks: 1,
    why: "a member picks a pack or marks their talk ready on the run: an untold seat does not open the run (a group's facilitator acts as its facilitator, which is no seat)",
  },
  "app/api/courses/runs/[runId]/reflections/[promptId]/route.ts": {
    kind: "shown",
    asks: 1,
    why: "a member writes in their own reflection box on the run: an untold seat does not open the run (a group's facilitator writes as its facilitator, which is no seat)",
  },
  "app/api/courses/runs/[runId]/fill-in-boxes/[boxId]/route.ts": {
    kind: "shown",
    asks: 1,
    why: "a member writes in their own fill-in box on the run: an untold seat does not open the run (a group's facilitator writes as its facilitator, which is no seat)",
  },
  "lib/courses/fillInBoxes/access.ts": {
    kind: "shown",
    asks: 1,
    why: "who reads a fellow's fill-in boxes: the group's facilitators read them only once Publish has told the fellow their seat, so an untold seat's boxes are the lead's and admins' alone",
  },
  "app/api/courses/runs/[runId]/written-answers/[answerId]/route.ts": {
    kind: "shown",
    asks: 1,
    why: "a member writes and sends their own written answer: an untold seat does not open the run (a group's facilitator writes as its facilitator, which is no seat)",
  },
  "lib/courses/writtenAnswers/access.ts": {
    kind: "shown",
    asks: 1,
    why: "whose written answer a reviewer may read and give feedback on: an untold seat's answer is nobody's to review but an admin's",
  },
  "lib/courses/writtenAnswers/queue.ts": {
    kind: "shown",
    asks: 1,
    why: "the review queue's written answers half: an untold seat's answer waits in nobody's queue but an admin's",
  },
  "lib/courses/writtenAnswers/reviewPage.ts": {
    kind: "shown",
    asks: 1,
    why: "the review page's people: an untold seat is not a row for anybody but an admin",
  },
  "app/api/courses/runs/[runId]/sync-tasks/route.ts": {
    kind: "shown",
    asks: 1,
    why: "the weekly cards in a member's tasks name the run: an untold seat puts none there",
  },
  "app/api/courses/runs/[runId]/enrol/route.ts": {
    kind: "shown",
    asks: 1,
    why:
      "the caller's own row comes back on GET: an untold seat is reported as no row. Joining and changing session " +
      "refuse a run that is not open before they read a seat, and leaving is the one leave's (lib/courses/leaveRun.ts)",
  },
  "lib/courses/leaveRun.ts": {
    kind: "shown",
    asks: 1,
    why:
      "the one leave, for both doors (Leave the programme, and I can’t make it from somebody in a group): it asks of " +
      "the caller's own seat inside its transaction, so an untold seat is reported as no seat and cannot be left, and " +
      "it names and shows nobody",
  },
  "lib/courses/placeOnRun.ts": {
    kind: "told",
    asks: 1,
    why:
      "where a place on the form stands on the run its programme names, for the reply and for the person's own " +
      "application page: a seat Publish has not told its owner about reads as no group, to them and whoever they are, " +
      "so neither says anything of a placement before Publish has; a seat staff took off reads as taken off, and " +
      "when, which names no group either",
  },
  "app/api/courses/runs/[runId]/nudge/route.ts": {
    kind: "shown",
    asks: 1,
    why: "the sender's own group picks the week their preview and test show: an untold seat picks none",
  },
  "lib/email/courseFacilitatorEmails.ts": {
    kind: "told",
    asks: 1,
    why: "the cohort audience behind the register push's reminder, the week nudge and the run email leaves out untold seats; the unreachable count beside it is a number for the sender",
  },
  "lib/courses/pushEmail.ts": {
    kind: "told",
    asks: 1,
    why: "what pressing a register emails, said before the press: the people its count is out of are the group's placements Publish has told, the email itself goes through the cohort audience, which leaves an untold seat out, and it names nobody",
  },
  "lib/courses/calendarFeed.ts": {
    kind: "told",
    asks: 1,
    why:
      "a person's calendar link holds their own seats' sessions: a seat Publish has not told them about adds " +
      "nothing of its run to it, whoever they are, an admin included, and it names nobody",
  },
  "lib/surveys/personFacts.ts": {
    kind: "told",
    asks: 1,
    why:
      "a survey's confidential box names the facilitators of the person's own group, and whether that group has " +
      "met dates their answers: a seat Publish has not told them about is no group of theirs, so the box names " +
      "nobody's facilitators and the answers count as before their first session",
  },
  "lib/applications/people/load.ts": {
    kind: "staff",
    proof: ['if (!opensProgrammeGroups(role)) return { status: "not-yours" };'],
    why:
      "a programme's People tab, for its lead and admins, who place people: each person's group and whether they " +
      "left come from every seat on the run the programme names, as the allocation board shows them, and it shows " +
      "no member a placement and names nobody to a facilitator",
  },
  "app/api/courses/runs/[runId]/allocation/route.ts": {
    kind: "board",
    proof: ["if (!doesTrackLeadWork(staffing)) {"],
    why:
      "the allocation board itself, for an admin, the run's track leads or the lead of the programme that names the " +
      "run, who place people and see every seat",
  },
  "app/api/courses/runs/[runId]/allocate/route.ts": {
    kind: "board",
    proof: ["if (!doesTrackLeadWork(staffing)) {"],
    why: "the board's placements, the writer of every seat and of the move that clears Publish's stamp",
  },
  "app/api/courses/runs/[runId]/allocation/publish/route.ts": {
    kind: "board",
    proof: ["if (!doesTrackLeadWork(staffing)) {", "allocatedEmailAt: FieldValue.serverTimestamp()"],
    why: "Publish: it emails each untold seat its group and then stamps it told, which is the fact this rule reads",
  },
  "lib/courses/allocationPublish.ts": {
    kind: "board",
    proof: [
      "if (input.adminOnly) return { ...empty, adminOnly: true };",
      "!enrolmentByUid.get(row.uid)?.allocatedEmailAt",
      "const size = toldBefore + (writesIn.get(group.id) ?? 0);",
    ],
    why:
      "Publish's plan, read behind the board's gate by the board's count, \"Send a test to me\" and Publish, and an admin's " +
      "alone on a run the form fills: it reads each seat Publish has not told to write its owner's email, which a press " +
      "sends to them and a test, the first one only, to the presser alone; its facilitators' email counts only the " +
      "people in the group told by the end of the press, never an untold seat; and its answers name only the people it " +
      "cannot write to",
  },
  "lib/courses/groupFacilitators.ts": {
    kind: "writer",
    proof: ['role: "facilitator"', 'if (existing.role === "facilitator") {', 'role: "learner"', "allocatedEmailAt: FieldValue.delete()"],
    why:
      "the one place a group's facilitators change, by hand or by an answer to an ask: it writes and " +
      "retires facilitator rows, places a facilitator who holds a place and sits in no group in the group " +
      "they facilitate (a learner's row with no Publish stamp, so the next Publish tells them), never moves " +
      "anybody between groups, and shows nobody anything. Its callers name where somebody sits only to the " +
      "people who place people (the group facilitators route, and an ask by the programme's lead or an " +
      "admin); the person asked is told only about the group they were asked about",
  },
  "app/api/courses/runs/[runId]/enrolments/[uid]/remove/route.ts": {
    kind: "staff",
    proof: ["if (!doesTrackLeadWork(staffing)) {"],
    why:
      "takes somebody off a run, for an admin, the run's track leads or the lead of the programme that names the run; " +
      "it answers with counts and names nobody to anybody else",
  },
  "lib/applications/handover/load.ts": {
    kind: "staff",
    proof: ['if (!canRunTerm(actor)) return { status: "not-admin" };'],
    why:
      "the Course run panel on a programme's Settings tab, an admin's alone: of the people on the run's list who no " +
      "longer hold a place it reads each one's seat, by id, only for whether they left or were taken off, and shows " +
      "nobody a placement",
  },
  "app/api/courses/runs/[runId]/enrolments/[uid]/reinstate/route.ts": {
    kind: "staff",
    proof: ["if (!doesTrackLeadWork(staffing)) {", "if (!row.selfEnrolled) {"],
    why: "puts back somebody who left an open run, which is a seat they chose; an allocated seat is refused",
  },
  "app/api/courses/runs/[runId]/enrol-mode/route.ts": {
    kind: "writer",
    proof: ['if (actor.role !== "admin") {', ".count().get()"],
    why: "an admin's switch between open and allocated places counts the run's rows and names nobody",
  },
  "app/api/courses/runs/[runId]/retrospective/route.ts": {
    kind: "writer",
    proof: [".count()"],
    why: "a run's retrospective, for its authors and leads, counts the run's active rows and names nobody",
  },
  "app/api/courses/[courseId]/templates/route.ts": {
    kind: "writer",
    proof: ['if (actor.role !== "admin") {', ".count()"],
    why: "saving a run as a template counts its active rows into the snapshot and names nobody",
  },
  "app/api/courses/groups/[groupId]/pace/route.ts": {
    kind: "writer",
    proof: ["if (!isAdmin && !facilitatesLiveGroup) {", "lastTaskSyncedWeek"],
    why: "a group's own pacing resets each member's task mark, and sends back no member's name or row",
  },
  "lib/courses/attendanceMirror.ts": {
    kind: "writer",
    proof: ["db.collection(\"courseEnrolments\").doc(courseEnrolmentId(runId, m.uid))"],
    why: "a register push rebuilds each member's own attendance figures on their own row, and shows them to nobody",
  },
  "lib/firestore/accountDeletion.ts": {
    kind: "writer",
    proof: ['db.collection("courseEnrolments").where("uid", "==", uid)'],
    why: "deleting an account deletes its rows, wherever they came from",
  },
  "lib/firestore/courseDeletion.ts": {
    kind: "writer",
    proof: ['byRunId("courseEnrolments")'],
    why: "destroying a run counts and deletes its rows, wherever they came from",
  },
};

const KINDS = ["shown", "told", "board", "staff", "writer"];
const SHOWN = /\bplacementIsShownTo\s*\(/g;
const TOLD = /\bplacementIsTold\s*\(/g;

describe("every reader of placements says what it does about a placement Publish has not told", () => {
  const files = [...walkSource(SRC)];
  const readers = files.filter((file) => ADDRESSES.test(codeOf(file))).map(inSrc).sort();

  test("the scan is reading: it finds the readers this file knows by name", () => {
    assert.ok(readers.length >= 25, `only ${readers.length} readers were found`);
    for (const known of [
      "app/api/courses/me/route.ts",
      "features/courses/runAccess.ts",
      "lib/courses/registerAccess.ts",
      "lib/firestore/courseDeletion.ts",
    ]) {
      assert.ok(readers.includes(known), `${known} addresses the collection and the scan did not see it`);
    }
    assert.ok(!readers.includes(RULE_HOME), "the rule's own module reads a placement");
  });

  test("each one is listed, and every entry is a file that still reads placements", () => {
    assert.deepEqual(
      readers.filter((file) => !Object.hasOwn(READERS, file)),
      [],
      "These read placements and are not in READERS. A placement an admin made is shown to " +
        "nobody but an admin until Publish has told its owner: decide what each does about one, " +
        "ask placementIsShownTo or placementIsTold where it shows or sends, and list it.",
    );
    assert.deepEqual(Object.keys(READERS).filter((file) => !readers.includes(file)), []);
  });

  for (const [file, entry] of Object.entries(READERS)) {
    test(`${file} does what its entry says`, () => {
      assert.ok(KINDS.includes(entry.kind), `\`${entry.kind}\` is not a kind`);
      assert.ok(typeof entry.why === "string" && entry.why.length >= 40, "a reason is missing or too short to be one");
      const code = codeOf(join(SRC, ...file.split("/")));
      const shown = [...code.matchAll(SHOWN)].length;
      const told = [...code.matchAll(TOLD)].length;
      if (entry.kind === "shown" || entry.kind === "told") {
        const question = entry.kind === "shown" ? "placementIsShownTo" : "placementIsTold";
        assert.ok(Number.isInteger(entry.asks) && entry.asks > 0, "says how many times it asks");
        assert.equal(
          entry.kind === "shown" ? shown : told,
          entry.asks,
          `It does not ask ${question} the number of times its entry says. A reader that shows a ` +
            "placement without asking shows it before its owner was told.",
        );
        assert.equal(entry.kind === "shown" ? told : shown, 0, "it asks the other question as well");
        assert.match(
          code,
          new RegExp(`import\\s*\\{[^}]*\\b${question}\\b[^}]*\\}\\s*from\\s*"@/lib/firestore/courseEnrolments"`),
          "it asks a question of its own instead of the collection's",
        );
        if (entry.kind === "shown") {
          // Who is asking is the session's own role, worked out in the file.
          assert.equal(
            [...code.matchAll(/\bplacementIsShownTo\s*\(\s*[\w.]+\s*,\s*(?:\{\s*isAdmin(?:\s*:\s*[^}]+)?\s*\}|viewer)\s*\)/g)].length,
            entry.asks,
            "each time it asks, it has to ask about the caller's own role",
          );
        }
      } else {
        assert.equal(shown + told, 0, "it is not listed as a reader that shows, and it asks the question");
        assert.ok(Array.isArray(entry.proof) && entry.proof.length > 0, "names what the file has to contain");
        for (const literal of entry.proof) {
          assert.ok(code.includes(literal), `its reason is about \`${literal}\`, which the file no longer contains`);
        }
      }
    });
  }

  test("nothing asks the question without being a listed reader, or a caller of a helper that is one", () => {
    const asking = files
      .filter((file) => [...codeOf(file).matchAll(SHOWN)].length + [...codeOf(file).matchAll(TOLD)].length > 0)
      .map(inSrc)
      .filter((file) => file !== RULE_HOME)
      .sort();
    assert.deepEqual(
      asking,
      Object.entries(READERS)
        .filter(([, entry]) => entry.kind === "shown" || entry.kind === "told")
        .map(([file]) => file)
        .sort(),
    );
  });

  test("every caller of the register's loader hands it the caller's own role", () => {
    const callers = files
      .map((file) => [inSrc(file), codeOf(file)])
      .filter(([file, code]) => file !== "lib/courses/registerAccess.ts" && /\bloadRegisterMembers\s*\(/.test(code));
    assert.ok(callers.length >= 2, `only ${callers.length} callers of loadRegisterMembers were found`);
    for (const [file, code] of callers) {
      const calls = [...code.matchAll(/\bloadRegisterMembers\s*\(([^)]*)\)/g)];
      for (const [, args] of calls) {
        assert.match(args, /,\s*\{\s*isAdmin\s*:\s*gated\.isAdmin\s*\}\s*$/, `${file} calls it without the caller's role`);
      }
    }
  });

  test("the rule is two functions, and an admin is the only viewer shown an untold placement", () => {
    const code = codeOf(join(SRC, ...RULE_HOME.split("/")));
    assert.match(code, /export function placementIsTold\(/);
    assert.match(code, /export function placementIsShownTo\(/);
    assert.match(code, /if \(enrolment\.role !== "learner"\) return true;/);
    assert.match(code, /if \(enrolment\.selfEnrolled\) return true;/);
    assert.match(code, /return enrolment\.allocatedEmailAt instanceof Date;/);
    assert.match(code, /return viewer\.isAdmin \|\| placementIsTold\(enrolment\);/);
  });
});
