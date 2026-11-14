/**
 * THE CEILING ON ONE SEND COUNTS THE PLACES IN SCOPE.
 *
 * A group's "Week N is open" email, and the count its register's button
 * shows, reach the people whose group for the session's week is the group
 * (`resolveNoticeAudience` with a `weekNumber`). That read is no longer
 * narrowed to the group, since a place in another group now can still hold a
 * week in this one, so the run's active places are read and judged. The
 * ceiling of one send (`MAX_NOTICE_ENROLMENT_ROWS`) counts the places in
 * scope, as it did when the read was the group's: a run with more active
 * places than one send carries still sends each group its own email.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 */
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { GROUP, RUN, makeWorld, seedWorld } from "./lib/registerWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-04T12:00:00Z") });

const made = makeWorld("__weekEmailCeiling");
const { world, reset, lib } = made;
const { normalizeCourseRun } = await lib("firestore", "courses.ts");
const { normalizeCourseGroup } = await lib("firestore", "courseGroups.ts");
const { readPushEmails } = await lib("courses", "pushEmail.ts");
const { sendNextWeekEmail } = await lib("courses", "nextWeekEmail.ts");
const { resolveSessions } = await lib("courses", "sessions.ts");
const { DEFAULT_COURSES_CONFIG } = await lib("firestore", "config.ts");
const { MAX_NOTICE_ENROLMENT_ROWS } = await lib("email", "courseFacilitatorEmails.ts");

/** The run with `extra` more active places, none of them in Group B in any week. */
function seedWith(extra, groupId = "elsewhere__grp9") {
  const seed = seedWorld();
  seed[`courseRuns/${RUN}/weeks/w04`] = { ...seed[`courseRuns/${RUN}/weeks/w04`], published: true };
  const template = seed[`courseEnrolments/${RUN}__amara`];
  for (let i = 0; i < extra; i += 1) {
    const uid = `extra${String(i).padStart(3, "0")}`;
    seed[`courseEnrolments/${RUN}__${uid}`] = { ...template, uid, groupId, role: "facilitator" };
  }
  return seed;
}

async function weekFour() {
  const run = normalizeCourseRun(RUN, world.db.read(`courseRuns/${RUN}`));
  const group = normalizeCourseGroup(GROUP.b, world.db.read(`courseGroups/${GROUP.b}`));
  const sessions = resolveSessions(run, group);
  const lines = await readPushEmails(world.db, {
    run,
    group,
    sessions,
    sessionKeys: ["w03"],
    scheduled: false,
    config: DEFAULT_COURSES_CONFIG,
    appUrl: "https://naisi.invalid",
  });
  const outcome = await sendNextWeekEmail({
    db: world.db,
    run,
    group,
    session: sessions.find((each) => each.sessionKey === "w04"),
    pushedSessionKey: "w03",
    by: { kind: "push", uid: "rahul" },
    force: false,
    whole: false,
    config: DEFAULT_COURSES_CONFIG,
    now: new Date(),
    appUrl: "https://naisi.invalid",
  });
  return { button: lines.w03, outcome };
}

test("a run with more active places than one send carries still sends a group its week email, counted on the group's people", async () => {
  reset(seedWith(0));
  const alone = await weekFour();
  const baseline = { emails: alone.button.emails, people: alone.button.people, sent: alone.outcome.sent, mailed: world.mail.length };
  assert.ok(baseline.sent > 0, "the group has people to tell");

  // The same group, with more places on the run than one send carries, in another group.
  reset(seedWith(MAX_NOTICE_ENROLMENT_ROWS));
  const crowded = await weekFour();
  assert.equal(crowded.outcome.held, null);
  assert.deepEqual(
    { emails: crowded.button.emails, people: crowded.button.people, sent: crowded.outcome.sent, mailed: world.mail.length },
    baseline,
    "the button and the send are the group's own, as before",
  );
});

test("the ceiling still refuses a group whose own people that week are more than one send carries", async () => {
  reset(seedWith(MAX_NOTICE_ENROLMENT_ROWS + 1, GROUP.b));
  const over = await weekFour();
  assert.deepEqual(over.button, { kind: "held", why: "refused", weekNumber: 4 });
  assert.equal(over.outcome.held, "refused");
  assert.equal(over.outcome.sent, 0);
  assert.equal(world.mail.length, 0);
});
