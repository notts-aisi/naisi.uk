/**
 * One way to change a group's time, end to end, in a real browser: a group's
 * page under the programme's Groups tab, driven by the admin.
 *
 * The term T2 stands on, three weeks after its run began
 * (scripts/e2e-fixtures/worlds/course-hub-term.mjs, point "week-three")
 * -> the admin names the running run on the programme's Settings tab and
 * hands its people over -> opens Group A's page from the Groups tab: how it
 * meets, every week with its date and state, its people -> moves week 4 by
 * an hour, reading What will happen first, the button naming the move and how
 * many it emails -> Ada's and Ben's mail carries the move's subject and no
 * meeting link -> puts week 4 back as usual, the group told again -> changes
 * the group's regular day from week 5, and week 4 keeps the date it had,
 * with the met weeks unmoved -> the History tab lists the three changes,
 * newest first, under Time and room.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-group-time
 *
 * It declares `requiresCaughtMail`, so the runner skips it anywhere but a
 * server it started with its mail forced into Mailpit: each change's email is
 * read out of the group's people's mailboxes.
 *
 * ## Every expected word comes from the seed's clock and the world's plan
 *
 * Dates, times and counts are worked out here from the state file and the
 * world's helpers, never written as a calendar date. Group A has no
 * facilitator on this journey, so who a change tells is the group's two
 * people.
 *
 * CHROMIUM ONLY: a green run is a regression net, never a substitute for the
 * manual Safari pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTarget, hasAdminCredentials, loadSecrets } from "../../scripts/e2e/lib/env.mjs";
import {
  createStepRecorder,
  openBrowser,
  signInWithPassword,
  stubRecaptchaOnLoopback,
} from "../../scripts/e2e/lib/browser.mjs";
import { getMessage, waitForMessagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
import {
  ARTIFACTS_DIR,
  RECAPTCHA_SKIP_REASON,
  fixtureDoc,
  mailIsCaught,
  markerPath,
  readState,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-group-time.mjs";
import {
  clockWords,
  dayLabel,
  londonDateKey,
  sessionOf,
  shiftDateKey,
  weekdayOf,
} from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/** The week moved for one week, then put back; and the week a new regular time starts from. */
const MOVED_WEEK = 4;
const FROM_WEEK = 5;

/** The reasons the group reads. */
const MOVE_REASON = "The usual room is booked for an exam that evening.";
const BACK_REASON = "The exam moved, so the room is free again.";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

let skipReasonFor = () => null;
const DEPLOYED_TARGET_SKIP = RECAPTCHA_SKIP_REASON;

function loadState() {
  return readState(SPEC.name, RUN_STATE_DIR);
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

function baseUrl() {
  return assertTarget(process.env.E2E_TARGET ?? "https://dev.naisi.uk");
}

const state = loadState();
const playwright = await loadPlaywright();

const skipReason = !playwright
  ? "Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium"
  : !state
    ? `No course hub term at ${STATE_PATH}. Run: npm run e2e:browser -- --local --spec ${SPEC.name}.`
    : !hasAdminCredentials()
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Every grant on this journey is an admin's."
      : state.suppress !== false || !mailIsCaught({ origin: baseUrl() })
        ? "This journey reads its own mail, so it runs only against the server the harness starts with its mail caught by Mailpit."
        : null;

/** Every space, newline and tab run as one space. */
const flat = (text) => text.replace(/\s+/g, " ").trim();
const textOf = async (locator) => flat((await locator.textContent()) ?? "");
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "1 person", "2 people". */
const peopleWords = (n) => (n === 1 ? "1 person" : `${n} people`);

/** A stored "HH:MM" moved by `minutes` on the wall clock, inside the day. */
function shiftClock(hhmm, minutes) {
  const [hour, minute] = hhmm.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** One email, read out of Mailpit whole. */
async function readEmail(summary) {
  const message = await getMessage(summary.ID);
  return { subject: message.Subject ?? summary.Subject ?? "", html: message.HTML ?? "", text: message.Text ?? "" };
}

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: one way to change a group's time, from its page under the Groups tab",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;

    const group = state.groups.find((each) => each.key === "A");
    assert.ok(group, "the term has no Group A");
    assert.ok(group.meetingUrl, "Group A has no meeting link, so 'never in an email' would prove nothing");
    const people = state.people.filter((person) => person.groupKey === group.key);
    assert.equal(people.length, 2, `Group A holds ${people.length} people, and this journey reads two mailboxes`);

    // The run's week, by its own calendar: the world promises week 3.
    const elapsedDays = Math.round(
      (Date.parse(`${londonDateKey(new Date())}T00:00:00Z`) - Date.parse(`${state.startDate}T00:00:00Z`)) / 86_400_000,
    );
    const thisWeek = Math.floor(elapsedDays / 7) + 1;
    assert.equal(thisWeek, 3, `the term is in week ${thisWeek}, not week 3`);

    // Week 4 by the group's usual slot, and the hour it moves to.
    const moved = sessionOf(group, MOVED_WEEK);
    const movedStart = group.startTimeLocal <= "21:00" ? shiftClock(group.startTimeLocal, 60) : shiftClock(group.startTimeLocal, -60);

    // The new regular day from week 5: two days after the usual one, and
    // week 5's date on it, inside week 5's own seven days.
    const newWeekday = (group.weekday + 2) % 7;
    const slotStart = (weekNumber) => shiftDateKey(state.startDate, 7 * (weekNumber - 1));
    const onNewDay = (weekNumber) => {
      for (let day = 0; day < 7; day += 1) {
        const key = shiftDateKey(slotStart(weekNumber), day);
        if (weekdayOf(key) === newWeekday) return key;
      }
      throw new Error("no day of the week has that weekday");
    };

    const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const groupsUrl = `${formBase}/groups`;
    const groupPagePath = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}/groups/${enc(group.id)}`;

    const { browser, context, page } = await openBrowser();
    const recorder = createStepRecorder({
      t,
      page,
      markerPath: MARKER,
      artifactsDir: ARTIFACTS_DIR,
      skipReasonFor: (name) => skipReasonFor(name),
    });
    const step = (name, fn) => recorder.step(name, fn);

    if (!(await stubRecaptchaOnLoopback(page, origin))) {
      skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? DEPLOYED_TARGET_SKIP : null);
    }

    /** The answer to the next request whose path ends `suffix`, by `method`. */
    const responseTo = (suffix, method) =>
      page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, {
        timeout: WAIT_MS,
      });

    async function okBody(response, what) {
      const body = await response.json().catch(() => null);
      assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
      return body;
    }

    /** The panel a change is made in, by its name. */
    const panel = () => page.getByRole("dialog", { name: `Change ${group.name}’s time or room`, exact: true });

    /** "What will happen", once the route's preview has answered: its lines as [label, sentence]. */
    async function readPreview() {
      const lines = panel().locator("dl > div");
      await lines.first().waitFor({ timeout: WAIT_MS });
      const out = [];
      for (let i = 0; i < (await lines.count()); i += 1) {
        out.push([await textOf(lines.nth(i).locator("dt")), await textOf(lines.nth(i).locator("dd"))]);
      }
      return out;
    }

    /** The weeks' pills, as their accessible names. */
    async function readPills() {
      const pills = page.getByRole("group", { name: "Weeks", exact: true }).getByRole("button");
      await pills.first().waitFor({ timeout: WAIT_MS });
      const out = [];
      for (let i = 0; i < (await pills.count()); i += 1) out.push((await pills.nth(i).getAttribute("aria-label")) ?? "");
      return out;
    }

    /** Waits for `count` messages to each of the group's people, and reads the newest. */
    async function newestTo(count) {
      const out = [];
      for (const person of people) {
        const summaries = await waitForMessagesTo(person.email, { count, timeoutMs: WAIT_MS });
        assert.equal(summaries.length, count, `${person.first} has ${summaries.length} emails, not ${count}`);
        out.push({ person, email: await readEmail(summaries[0]) });
      }
      return out;
    }

    function assertNoMeetingLink(email, who) {
      for (const [part, body] of [
        ["HTML", email.html],
        ["text", email.text],
      ]) {
        assert.ok(
          !body.includes(group.meetingUrl) && !body.includes(new URL(group.meetingUrl).host),
          `${who}'s ${part} part carries the meeting link. A link to join lives on the site only.`,
        );
      }
    }

    try {
      await step(
        "the admin names the running course run on the programme's Settings tab and hands its people over",
        async () => {
          await signInWithPassword(page, origin, { email: secrets.adminEmail, password: secrets.adminPassword }, { timeout: WAIT_MS });
          await page.goto(`${formBase}/setup`, { waitUntil: "domcontentloaded" });
          const region = page.getByRole("region", { name: "Course run" });
          await region.waitFor({ timeout: WAIT_MS });
          const runBox = region.getByLabel("Run", { exact: true });
          await runBox.waitFor({ timeout: WAIT_MS });
          const [named] = await Promise.all([
            responseTo(`/programmes/${state.programmeId}/run`, "PUT"),
            runBox.selectOption({ label: `${state.runLabel} · Running` }),
          ]);
          const body = await okBody(named, "Naming the run");
          assert.equal(body.panel?.runId, state.runId, "the panel names another run");
          const holding = state.people.length;
          const [handOver] = await Promise.all([
            responseTo("/run/hand-over", "POST"),
            region.getByRole("button", { name: `Hand over ${holding} people`, exact: true }).click(),
          ]);
          await okBody(handOver, "Handing over");
          await region.getByRole("status").filter({ hasText: `${holding} people handed over.` }).waitFor({ timeout: WAIT_MS });
        },
      );

      await step(
        "the admin opens a group's page from the Groups tab: how it meets, every week with its state, and its people",
        async () => {
          await page.goto(groupsUrl, { waitUntil: "domcontentloaded" });
          const link = page.getByRole("link", { name: group.name, exact: true }).first();
          await link.waitFor({ timeout: WAIT_MS });
          assert.equal(await link.getAttribute("href"), groupPagePath, "Group A's name does not lead to its page");
          await link.click();
          await page.waitForURL((url) => url.pathname === groupPagePath, { timeout: WAIT_MS });
          await page.getByRole("heading", { name: group.name, level: 1, exact: true }).waitFor({ timeout: WAIT_MS });
          await page.getByRole("heading", { name: `How ${group.name} meets`, exact: true }).waitFor({ timeout: WAIT_MS });
          const meets = await textOf(page.getByRole("region", { name: `How ${group.name} meets` }));
          const end = shiftClock(group.startTimeLocal, group.durationMinutes);
          assert.ok(
            meets.includes(`${WEEKDAYS[group.weekday]}s, ${clockWords(group.startTimeLocal)} to ${clockWords(end)}`),
            `How Group A meets does not say its day and time: ${meets}`,
          );
          assert.ok(meets.includes(group.room), `How Group A meets does not name its room: ${meets}`);
          // Every week of the plan, past ones too: the three that met, then the rest by date.
          const pills = await readPills();
          assert.equal(pills.length, state.weekCount, "the row of weeks is not every week of the plan");
          for (let n = 1; n <= state.weekCount; n += 1) {
            const dateKey = sessionOf(group, n).dateKey;
            const expected = n < thisWeek + 0 && n <= 3 ? `Week ${n}, ${dayLabel(dateKey)} · met` : `Week ${n}, ${dayLabel(dateKey)}`;
            assert.equal(pills[n - 1], expected, `week ${n}'s pill`);
          }
          // The group's people for the week shown: names only, each with what they said.
          const peopleTable = page.getByRole("region", { name: `${group.name}’s people for week ${MOVED_WEEK}` });
          await peopleTable.waitFor({ timeout: WAIT_MS });
          const listed = await textOf(peopleTable);
          for (const person of people) assert.ok(listed.includes(person.displayName) || listed.includes(person.first), `${person.first} is not listed`);
          assert.ok(!listed.includes("@"), "the group's people carry an address");
          assert.ok(!(await page.content()).includes(group.meetingUrl), "the group's page carries its meeting link");
        },
      );

      await step("the admin moves one week with what will happen read first, and the button says how many it emails", async () => {
        await page.getByRole("button", { name: `Week ${MOVED_WEEK}, ${dayLabel(moved.dateKey)}`, exact: true }).click();
        await page.getByRole("button", { name: "Change this week", exact: true }).click();
        await panel().waitFor({ timeout: WAIT_MS });
        await panel().getByRole("radio", { name: /^Move it/ }).check();
        await panel().getByLabel("Starts", { exact: true }).selectOption(movedStart);
        await panel().getByLabel("Reason, shown to the group (needed)", { exact: true }).fill(MOVE_REASON);
        const lines = await readPreview();
        const session = lines.find(([label]) => label === "Session");
        assert.ok(session, `What will happen has no Session line: ${JSON.stringify(lines)}`);
        assert.ok(
          session[1].startsWith(`Week ${MOVED_WEEK} moves from ${dayLabel(moved.dateKey)}, ${clockWords(group.startTimeLocal)}`),
          `the Session line: ${session[1]}`,
        );
        const told = lines.find(([label]) => label === "Told");
        assert.ok(told?.[1].startsWith(`${peopleWords(people.length)} by email`), `the Told line: ${told?.[1]}`);
        const button = panel().getByRole("button", { name: `Move week ${MOVED_WEEK} and email ${peopleWords(people.length)}`, exact: true });
        await button.waitFor({ timeout: WAIT_MS });
        const [changed] = await Promise.all([responseTo(`/groups/${group.id}/session/change`, "POST"), button.click()]);
        const body = await okBody(changed, "The move");
        assert.equal(body.update?.withFacilitators, true, "the move's update does not reach the group's facilitators too");
        const [posted] = await Promise.all([responseTo(`/runs/${state.runId}/updates`, "POST")]).catch(() => [null]);
        if (posted) await okBody(posted, "Telling the group");
        await page.getByRole("status").filter({ hasText: "session has moved" }).waitFor({ timeout: WAIT_MS });
        const group4 = (await fixtureDoc("courseGroups", group.id).get()).data();
        assert.equal(group4?.sessionChanges?.[`w0${MOVED_WEEK}`]?.kind, "moved", "week 4 carries no move");
      });

      await step("the move's email reaches the group's people with its subject, and none carries the meeting link", async () => {
        for (const { person, email } of await newestTo(1)) {
          assert.equal(email.subject, `Week ${MOVED_WEEK} moves to ${dayLabel(moved.dateKey)}, ${clockWords(movedStart)}`, `${person.first}'s subject`);
          assertNoMeetingLink(email, person.first);
        }
      });

      await step("the admin puts the week back as usual, and the group is told", async () => {
        await page.getByRole("button", { name: "Put it back as usual", exact: true }).click();
        await panel().waitFor({ timeout: WAIT_MS });
        await panel().getByRole("radio", { name: /^Put it back as usual/ }).check();
        await panel().getByLabel("Reason, shown to the group (needed)", { exact: true }).fill(BACK_REASON);
        await readPreview();
        const button = panel().getByRole("button", { name: `Put week ${MOVED_WEEK} back and email ${peopleWords(people.length)}`, exact: true });
        await button.waitFor({ timeout: WAIT_MS });
        const [changed] = await Promise.all([responseTo(`/groups/${group.id}/session/change`, "POST"), button.click()]);
        await okBody(changed, "Putting it back");
        await page.getByRole("status").filter({ hasText: "back to usual" }).waitFor({ timeout: WAIT_MS });
        for (const { person, email } of await newestTo(2)) {
          assert.equal(email.subject, `Week ${MOVED_WEEK} is back to its usual time`, `${person.first}'s subject`);
          assertNoMeetingLink(email, person.first);
        }
      });

      await step(
        "the admin changes the group's regular time from a later week, and an earlier week keeps the date it had",
        async () => {
          await page.getByRole("button", { name: "Change: Day and time", exact: true }).click();
          await panel().waitFor({ timeout: WAIT_MS });
          await panel().getByRole("radio", { name: /^From a week onwards/ }).waitFor({ timeout: WAIT_MS });
          assert.equal(await panel().getByRole("radio", { name: /^From a week onwards/ }).isChecked(), true);
          await panel().getByLabel("From which week?", { exact: true }).selectOption(String(FROM_WEEK));
          await panel().getByLabel("Day", { exact: true }).selectOption(String(newWeekday));
          const lines = await readPreview();
          const sessions = lines.find(([label]) => label === "Sessions");
          assert.ok(
            sessions?.[1].startsWith(`Weeks ${FROM_WEEK} to ${state.weekCount} move to ${WEEKDAYS[newWeekday]}s`) ||
              sessions?.[1].startsWith(`Week ${FROM_WEEK} move`),
            `the Sessions line: ${sessions?.[1]}`,
          );
          const kept = lines.find(([label]) => label === "Kept");
          assert.ok(kept?.[1].startsWith(`Weeks 1 to ${FROM_WEEK - 1} keep their dates`), `the Kept line: ${kept?.[1]}`);
          const button = panel().getByRole("button", {
            name: `Change ${group.name}’s time and email ${peopleWords(people.length)}`,
            exact: true,
          });
          await button.waitFor({ timeout: WAIT_MS });
          const [changed] = await Promise.all([responseTo(`/groups/${group.id}/session/regular`, "POST"), button.click()]);
          const body = await okBody(changed, "The new regular time");
          assert.deepEqual(body.change?.movedWeeks, Array.from({ length: state.weekCount - FROM_WEEK + 1 }, (_, i) => FROM_WEEK + i));
          assert.equal(body.email?.sent ?? 0, people.length, "the notice did not reach the group's people");
          await page.getByRole("status").filter({ hasText: `${group.name} now meets on ${WEEKDAYS[newWeekday]}s` }).waitFor({ timeout: WAIT_MS });

          // An earlier week keeps the date it had; the met weeks are unmoved; week 5 is on the new day.
          await page.waitForFunction(
            (label) => [...document.querySelectorAll("button[aria-label]")].some((each) => each.getAttribute("aria-label") === label),
            `Week ${FROM_WEEK}, ${dayLabel(onNewDay(FROM_WEEK))}`,
            { timeout: WAIT_MS },
          );
          const pills = await readPills();
          assert.equal(pills[MOVED_WEEK - 1], `Week ${MOVED_WEEK}, ${dayLabel(moved.dateKey)}`, "week 4 lost the date it had");
          for (let n = 1; n <= 3; n += 1) assert.equal(pills[n - 1], `Week ${n}, ${dayLabel(sessionOf(group, n).dateKey)} · met`);
          assert.equal(pills[FROM_WEEK - 1], `Week ${FROM_WEEK}, ${dayLabel(onNewDay(FROM_WEEK))}`, "week 5 is not on the new day");

          for (const { person, email } of await newestTo(3)) {
            assert.equal(email.subject, `${group.name} now meets on ${WEEKDAYS[newWeekday]}s, ${clockWords(group.startTimeLocal)}`, `${person.first}'s subject`);
            assertNoMeetingLink(email, person.first);
          }
        },
      );

      await step("the group's history lists each change, newest first, under Time and room", async () => {
        await page.getByRole("tab", { name: "History", exact: true }).click();
        await page.getByRole("button", { name: "Time and room", exact: true }).click();
        const rows = page.getByRole("region", { name: "Who changed what" }).getByRole("listitem");
        await rows.first().waitFor({ timeout: WAIT_MS });
        const said = [];
        for (let i = 0; i < (await rows.count()); i += 1) said.push(await textOf(rows.nth(i)));
        assert.equal(said.length, 3, `Time and room lists ${said.length} rows: ${JSON.stringify(said)}`);
        assert.match(said[0], new RegExp(`Changed the regular time to ${escapeRegExp(WEEKDAYS[newWeekday])}s, .* from week ${FROM_WEEK}\\.`));
        assert.match(said[0], new RegExp(`Emailed ${people.length}\\.`));
        assert.match(said[1], new RegExp(`Put week ${MOVED_WEEK} back as usual: ${escapeRegExp(dayLabel(moved.dateKey))}`));
        assert.match(said[1], new RegExp(`Reason: ${escapeRegExp(BACK_REASON)}`));
        assert.match(said[2], new RegExp(`Moved week ${MOVED_WEEK} to ${escapeRegExp(dayLabel(moved.dateKey))}, ${escapeRegExp(clockWords(movedStart))}`));
        assert.match(said[2], new RegExp(`Reason: ${escapeRegExp(MOVE_REASON)}`));
      });
    } finally {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
