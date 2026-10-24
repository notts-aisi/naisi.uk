/**
 * The week nudge's preview, for a member of the run's staff who is also
 * placed in one of its groups, before and after Publish has told them it.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * The nudge's preview and test send are written as the SENDER's own copy:
 * their group picks the week and the session line ("Mondays at ... · Room
 * B12"). A sender placed in a group Publish has not told them about must not
 * learn it there, so the preview reads their own placement through
 * `placementIsShownTo` and, untold, picks no group at all, as for a sender in
 * none. The audience the preview counts is the cohort the lanes reach, which
 * leaves out anybody untold (`course-hub-group-published-mail.test.mjs`).
 *
 * `yusuf` is the AGI run's track lead (so he may open the nudge) and, here,
 * has applied to the run himself and is placed in the Monday group.
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { GROUP, RUN, groupSeed, makeGroupWorld } from "./lib/groupPublishedWorld.mjs";

const made = await makeGroupWorld("__groupPublishedNudge");
const { reset, call, routes, steps } = made;

/** A London date key `days` before today. */
function daysAgo(days) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(
    new Date(Date.now() - days * 86_400_000),
  );
}

beforeEach(() => {
  const seed = groupSeed();
  // The run started three days ago, so week one is the week the nudge is about.
  seed[`courseRuns/${RUN.agi}`].status = "running";
  seed[`courseRuns/${RUN.agi}`].startDate = daysAgo(3);
  seed[`courseApplications/${RUN.agi}__yusuf`] = {
    runId: RUN.agi,
    courseId: seed[`courseRuns/${RUN.agi}`].courseId,
    uid: "yusuf",
    displayName: "Yusuf Demir",
    status: "accepted",
    availability: "",
  };
  reset(seed);
});

const preview = () => call("yusuf", routes.nudge.GET, { runId: RUN.agi });

test("placed and not told, the sender's preview names no group; told, it names theirs", async () => {
  await steps.placed();
  const placed = await steps.place([{ uid: "yusuf", groupId: GROUP.monday }]);
  assert.equal(placed.body.placed, 1, JSON.stringify(placed.body));

  const before = await preview();
  assert.equal(before.status, 200, JSON.stringify(before.body));
  assert.equal(before.body.week?.weekNumber, 1, JSON.stringify(before.body));
  assert.equal(before.body.sessionLine, null, "the preview names the group of a sender nobody has told");
  assert.ok(!JSON.stringify(before.body).includes("Room B12"), "the preview names the room of their group");
  assert.equal(before.body.recipients, 0, "the preview counts people nobody has told");

  await steps.publishes();
  const after = await preview();
  assert.equal(after.status, 200, JSON.stringify(after.body));
  assert.match(after.body.sessionLine ?? "", /Room B12/);
  assert.equal(after.body.recipients, 5, "the cohort Publish told: four holders and the sender");
});
