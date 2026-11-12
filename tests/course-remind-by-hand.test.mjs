/**
 * REMIND, BY HAND, AND WHO HAS DONE THE WEEK: the real Remind route and the
 * group's page's reader, driven against a run in its fourth week whose weeks
 * are written as blocks (`tests/lib/remindWorld.mjs`).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST /api/courses/groups/[groupId]/remind
 *
 * ## What this guards
 *
 *  1. WHO MAY: the group's facilitators (a co-facilitator too), the
 *     programme's lead, the run's track lead and admins; nobody else, nobody
 *     signed out, and nobody in a view-as session. The body is checked before
 *     anything is read.
 *  2. WHO IT REACHES: told people whose week is not done; never a facilitator
 *     of the group (holding a place or not), never the presser, never
 *     somebody not told, never somebody suppressed, never somebody who joined
 *     after the session, never somebody done; one named person or everybody.
 *  3. THE PREVIEW writes nothing and sends nothing: the names, each one's last
 *     reminder, whether in the last day, the email word for word, the count.
 *  4. THE PRESS: the count it carries, refused with a 409 and the new count
 *     when it changed; then one notice per person (surface
 *     `course-week-reminder`, no meeting link, no unsubscribe), each
 *     recorded, and one row in the group's history naming nobody.
 *  5. A RETRY OF THE SAME PRESS sends nothing more; a later press goes, and
 *     the warning says who was reminded in the last day.
 *  6. THE CAPS: three an hour per presser and audience, ten a day per group.
 *  7. ANY WEEK whose work is open, before its session (the "before" words) or
 *     after it (the "after" words); not an unpublished week, not one off the
 *     plan, nothing once the programme has closed.
 *  8. THE CARD: the group's fellows only, a facilitator's own week to the
 *     lead and admins alone, the count on the button the press's own, and
 *     "Last reminded" from the automatic markers and the hand records.
 *  9. ACCOUNT DELETION takes a person's hand records and nothing else.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { B, BEFORE_WEEK3, LINK, RUN, makeRemindWorld, remindSeed, tickRow, weekDone } from "./lib/remindWorld.mjs";

const w = await makeRemindWorld("__remindByHand");
const { world, ask, preview, press, page, mailTo, historyRows, at, everything } = w;
const accountDeletion = await w.loadTs("lib/firestore/accountDeletion.ts");

beforeEach(() => w.reset());

const recordPath = (uid, week) => `courseNudges/handremind__${RUN.agi}__${uid}__w${String(week).padStart(2, "0")}`;
const peopleOf = (response) => (response.body?.preview?.people ?? []).map((person) => person.uid);

/** An email as its reader sees it. */
async function textOf(message) {
  return (await render(message.react, { plainText: true })).replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------

describe("1. who may remind", () => {
  test("the group's facilitators, a co-facilitator, the lead, the run's track lead and admins", async () => {
    for (const who of ["rahul", "sofia", "claudia", "yusuf", "zach"]) {
      const response = await preview(who, 3);
      assert.equal(response.status, 200, `${who}: ${JSON.stringify(response.body)}`);
    }
  });

  test("nobody else: another group's facilitator, the group's own people, another programme's lead, a reviewer", async () => {
    for (const who of ["tom", "amara", "ines", "bea", "tess", "lloyd", "nobody"]) {
      const response = await preview(who, 3);
      assert.equal(response.status, 403, `${who}: ${JSON.stringify(response.body)}`);
    }
    assert.equal((await preview(null, 3)).status, 401);
  });

  test("a view-as session is refused first, and an empty body before anything is read", async () => {
    const before = everything();
    assert.equal((await ask("zach", { week: 3, preview: true }, { viewAs: true })).status, 403);
    for (const who of ["zach", "rahul", "amara", "nobody"]) {
      const response = await ask(who, {});
      assert.equal(response.status, 400, who);
    }
    assert.equal((await ask("rahul", { week: 3 })).status, 400, "a press with no count");
    assert.equal(everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("a missing group is a 403 for everybody but an admin, and an archived one is refused", async () => {
    assert.equal((await ask("rahul", { week: 3, preview: true }, { groupId: "no-such-group" })).status, 403);
    assert.equal((await ask("zach", { week: 3, preview: true }, { groupId: "no-such-group" })).status, 404);
    world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.equal((await preview("rahul", 3)).status, 403, "an archived group's facilitator is nobody");
    assert.equal((await preview("zach", 3)).status, 400);
  });
});

describe("2. who it reaches", () => {
  test("told people whose week isn't done: never a facilitator holding a place, the presser, somebody not told or suppressed, or somebody done", async () => {
    for (const who of ["rahul", "sofia", "claudia", "zach"]) {
      assert.deepEqual(peopleOf(await preview(who, 3)), ["ines"], who);
    }
  });

  test("a co-facilitator's press never reaches the facilitator holding a place, whatever is left of their week", async () => {
    const shown = await preview("sofia", 3);
    assert.equal(shown.body.preview.count, 1);
    assert.doesNotMatch(JSON.stringify(shown.body), /rahul|Rahul Mehta/);
  });

  test("one named person, or a refusal for somebody Remind does not reach", async () => {
    assert.deepEqual(peopleOf(await preview("rahul", 3, "ines")), ["ines"]);
    for (const uid of ["amara", "rahul", "sofia", "dev", "omar", "nina", "bea"]) {
      const response = await preview("zach", 3, uid);
      assert.equal(response.status, 409, uid);
      assert.equal(response.body.count, 0);
    }
  });

  test("somebody told their group after the week's session is never reminded about it, and is about a later week", async () => {
    world.db.poke(`courseEnrolments/${RUN.agi}__ines`, { allocatedEmailAt: new Date("2026-11-18T09:00:00Z") });
    assert.deepEqual(peopleOf(await preview("rahul", 3)), []);
    assert.deepEqual(peopleOf(await preview("rahul", 4)).sort(), ["amara", "ines"]);
  });

  test("somebody who finishes the week drops out", async () => {
    for (const [path, doc] of Object.entries(weekDone("ines", 3, "r3", new Date()))) world.db.seed(path, doc);
    const shown = await preview("rahul", 3);
    assert.equal(shown.body.preview.count, 0);
    assert.equal(shown.body.preview.email, null);
    const pressed = await ask("rahul", { week: 3, count: 1 });
    assert.equal(pressed.status, 409);
    assert.equal(pressed.body.count, 0);
    assert.equal(world.mail.length, 0);
  });
});

describe("3. the preview", () => {
  test("writes nothing and sends nothing: names, last reminded, the email word for word, the count", async () => {
    const before = everything();
    const shown = await preview("rahul", 3);
    assert.equal(everything(), before);
    assert.equal(world.mail.length, 0);
    assert.deepEqual(shown.body.preview.people, [{ uid: "ines", name: "Ines", lastReminded: null, recent: false }]);
    assert.deepEqual(shown.body.preview.email, {
      from: "Rahul and the AGI Strategy team",
      subject: "Week 3 isn’t done yet",
      greeting: "Hi Ines,",
      paragraphs: [
        "Group B met for week 3 on Tue 17 Nov, and week 3 is still open. Still to do: two readings, your reflection and your written answer.",
        "Anything you add now shows as late, with how late, to the people who read your work.",
      ],
      button: "Finish week 3",
    });
    assert.deepEqual(Object.keys(shown.body).sort(), ["ok", "preview"]);
    assert.deepEqual(Object.keys(shown.body.preview).sort(), ["at", "count", "email", "people", "weekNumber"]);
    assert.doesNotMatch(JSON.stringify(shown.body), /@example\.com/, "never an address");
  });

  test("before the week's session, the before words", async () => {
    const shown = await preview("rahul", 4);
    assert.deepEqual(peopleOf(shown).sort(), ["amara", "ines"]);
    assert.match(shown.body.preview.email.paragraphs[0], /^Rahul asked us to remind you: your session is Tue 24 Nov, 6pm\. Still to do: two readings, your reflection and your written answer\.$/);
    assert.equal(shown.body.preview.email.paragraphs.length, 1, "nothing is late before the session");
  });
});

describe("4. the press", () => {
  test("a count that changed is refused with the new count, and nothing is sent or written", async () => {
    const before = everything();
    const response = await ask("rahul", { week: 4, count: 1 });
    assert.equal(response.status, 409);
    assert.equal(response.body.count, 2);
    assert.match(response.body.error, /it would now email 2 people/);
    assert.equal(everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("one notice to each, never a meeting link, recorded, and one row in the group's history naming nobody", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.meetingUrl": LINK });
    const response = await press("rahul", 3);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(response.body.sent, { sent: 1, justReminded: 0, suppressed: 0, held: 0, failed: 0 });
    assert.equal(response.body.said, "Emailed 1 person.");
    assert.equal(world.mail.length, 1);
    const [message] = mailTo("ines");
    assert.equal(message.subject, "Week 3 isn’t done yet");
    assert.equal(message.kind, "notice");
    assert.equal(message.surface, "course-week-reminder");
    assert.equal(message.actorUid, "rahul");
    assert.equal(message.listUnsubscribe, undefined);
    const html = await render(message.react);
    assert.doesNotMatch(html, new RegExp(LINK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "never the meeting link");
    const text = await textOf(message);
    assert.match(text, /Hi Ines, .*Group B met for week 3 on Tue 17 Nov, and week 3 is still open\. Still to do: two readings, your reflection and your written answer\./);
    assert.match(text, /Rahul and the AGI Strategy team/);
    assert.doesNotMatch(text, /unsubscribe/i);
    for (const uid of ["amara", "rahul", "sofia", "dev", "omar", "nina"]) assert.equal(mailTo(uid).length, 0, uid);

    const record = world.db.read(recordPath("ines", 3));
    assert.equal(record.kind, "week-remind-by-hand");
    assert.equal(record.uid, "ines");
    assert.equal(record.byUid, "rahul");
    assert.equal(record.groupId, B);
    assert.equal(record.count, 1);
    assert.equal(new Date(record.at).toISOString(), "2026-11-19T10:00:00.000Z");
    const rows = historyRows("week-reminded");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].detail, "Reminded 1 person about week 3. Emailed 1.");
    assert.equal(rows[0].emailed, 1);
    assert.equal(rows[0].weekId, "w03");
    assert.equal(rows[0].subjectUid, null, "the row names nobody");
  });

  test("a suppressed address the audience let through is not recorded as reminded", async () => {
    world.mailFate = () => "suppressed";
    const response = await press("rahul", 3);
    assert.deepEqual(response.body.sent, { sent: 0, justReminded: 0, suppressed: 1, held: 0, failed: 0 });
    assert.equal(world.db.read(recordPath("ines", 3)).at, undefined, "no reminder went");
    assert.equal(world.db.read(recordPath("ines", 3)).claimedAt, null, "and the claim is let go");
  });
});

describe("5. the same press twice", () => {
  test("a retry straight after sends nothing more; a later press goes, after the warning", async () => {
    const first = await press("rahul", 3);
    assert.equal(first.body.sent.sent, 1);
    const retry = await ask("rahul", { week: 3, count: 1 });
    assert.equal(retry.status, 200);
    assert.deepEqual(retry.body.sent, { sent: 0, justReminded: 1, suppressed: 0, held: 0, failed: 0 });
    assert.equal(retry.body.said, "1 person was reminded a moment ago, so not emailed again.");
    assert.equal(mailTo("ines").length, 1);
    assert.equal(historyRows("week-reminded").length, 1, "a retry writes no second row");
    // A co-facilitator's press a minute later is the same press too.
    at(new Date("2026-11-19T10:01:00Z"));
    assert.equal((await ask("sofia", { week: 3, count: 1 })).body.sent.justReminded, 1);

    at(new Date("2026-11-19T10:05:00Z"));
    const shown = await preview("sofia", 3);
    assert.deepEqual(shown.body.preview.people[0].lastReminded, { at: "2026-11-19T10:00:00.000Z", how: "hand", byName: "Rahul" });
    assert.equal(shown.body.preview.people[0].recent, true, "the panel warns");
    const again = await ask("sofia", { week: 3, count: 1 });
    assert.equal(again.body.sent.sent, 1);
    assert.equal(mailTo("ines").length, 2);
    assert.equal(world.db.read(recordPath("ines", 3)).byUid, "sofia");
    assert.equal(historyRows("week-reminded").length, 2);
  });

  test("an automatic reminder that went is a last reminder too; one stamped as skipped is not", async () => {
    world.db.seed(`schedulerMarkers/weekremind__${B}__w03__ines__1`, { sentAt: new Date("2026-11-16T09:00:00Z") });
    world.db.seed(`schedulerMarkers/weekremind__${B}__w03__ines__3`, { skippedReason: "done", sentAt: null });
    const shown = await preview("rahul", 3);
    assert.deepEqual(shown.body.preview.people[0].lastReminded, { at: "2026-11-16T09:00:00.000Z", how: "1-day", byName: null });
    assert.equal(shown.body.preview.people[0].recent, false);
  });
});

describe("6. the caps", () => {
  test("three an hour per presser and audience", async (t) => {
    t.mock.method(console, "log", () => {});
    for (let n = 0; n < 3; n += 1) {
      at(new Date(Date.UTC(2026, 10, 19, 10, 3 * n)));
      assert.equal((await press("rahul", 3)).status, 200, `press ${n + 1}`);
    }
    at(new Date("2026-11-19T10:12:00Z"));
    const fourth = await press("rahul", 3);
    assert.equal(fourth.status, 429);
    assert.match(fourth.body.error, /already had 3 reminders in the last hour/);
    assert.equal(mailTo("ines").length, 3);
    assert.equal((await press("sofia", 3)).status, 200, "another presser is another audience");
  });

  test("ten a day per group", async () => {
    world.db.seed(`courseNudges/emailrate__weekremindday__${B}`, {
      kind: "staff-email-throttle",
      key: `weekremindday__${B}`,
      windowStartAt: new Date("2026-11-19T08:00:00Z"),
      count: 10,
    });
    const response = await press("zach", 3);
    assert.equal(response.status, 429);
    assert.equal(world.mail.length, 0);
  });
});

describe("7. which weeks", () => {
  test("not an unpublished week, not one off the plan", async () => {
    assert.equal((await preview("rahul", 5)).status, 400);
    assert.equal((await preview("rahul", 9)).status, 400);
  });

  test("nothing once the programme has closed", async () => {
    // The run's last session is Group C's, Wed 9 Dec; it closes at the end of Wed 23 Dec.
    at(new Date("2026-12-23T23:30:00Z"));
    assert.equal((await preview("rahul", 3)).status, 200, "open to the last minute of the day");
    at(new Date("2026-12-24T00:00:00Z"));
    const response = await preview("rahul", 3);
    assert.equal(response.status, 400);
    assert.match(response.body.error, /The programme has closed/);
  });
});

describe("8. the week's card on the group's page", () => {
  test("for a facilitator: the group's fellows only, no facilitator's own week, and the press's own count", async () => {
    const view = await page("facilitator", "rahul", 3);
    assert.equal(view.workWeek, 3);
    assert.deepEqual(view.work.rows.map((row) => row.uid), ["amara", "ines", "omar"]);
    assert.equal(view.work.own, null);
    assert.equal(view.work.remind.count, (await preview("rahul", 3)).body.preview.count);
    assert.deepEqual(view.work.rows.map((row) => [row.uid, row.week.text, row.remindable]), [
      ["amara", "Done on time", false],
      ["ines", "Not started", true],
      ["omar", "Not started", false],
    ]);
    assert.doesNotMatch(JSON.stringify(view.work), /rahul|sofia/i);
  });

  test("for the lead and admins: the facilitators' own weeks, apart, and counted in no number", async () => {
    world.db.seed(...tickRow("rahul", 3, "r3-s2", BEFORE_WEEK3));
    const view = await page("lead", "claudia", 3);
    assert.deepEqual(view.work.rows.map((row) => row.uid), ["amara", "dev", "ines", "omar"], "every place, told or not, never a facilitator");
    assert.deepEqual(view.work.own.map((row) => row.uid).sort(), ["rahul", "sofia"]);
    assert.match(view.work.own.find((row) => row.uid === "rahul").line, /^Rahul’s own week 3: .*\. Claudia and admins only\.$/);
  });

  test("late in the week, and last reminded", async () => {
    for (const [path, doc] of Object.entries(weekDone("ines", 3, "r3", new Date("2026-11-18T18:00:00Z")))) world.db.seed(path, doc);
    await press("rahul", 4);
    const view = await page("admin", "zach", 3);
    const ines = view.work.rows.find((row) => row.uid === "ines");
    assert.equal(ines.week.text, "Done late");
    assert.equal(ines.week.detail, "Late: 1 day after the session");
    assert.deepEqual(ines.late, { line: "Readings, reflection and written answer done Wed 18 Nov, 6pm", detail: "Late: 1 day after the session" });
    const four = await page("admin", "zach", 4);
    assert.deepEqual(four.work.rows.find((row) => row.uid === "amara").lastReminded, { at: "2026-11-19T10:00:00.000Z", how: "hand", byName: "Rahul" });
  });

  test("a week asked for that is not one of the plan's opens the week the page opens on", async () => {
    const view = await page("facilitator", "rahul", 42);
    assert.equal(view.workWeek, view.openWeek);
  });
});

describe("8b. the card, drawn", () => {
  const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

  test("for the lead and admins: the count, the bars, the chips, the table with Last reminded and a Remind each, late and the facilitators' own", async () => {
    for (const [path, doc] of Object.entries(weekDone("ines", 3, "r3", new Date("2026-11-18T18:00:00Z")))) world.db.seed(path, doc);
    world.db.seed(`schedulerMarkers/weekremind__${B}__w03__omar__1`, { sentAt: new Date("2026-11-16T09:00:00Z") });
    const view = await page("admin", "zach", 3);
    const said = new Map(view.weeks.find((week) => week.weekNumber === 3).people.map((person) => [person.uid, person.said]));
    const html = renderToStaticMarkup(
      createElement(w.parts.WeekWorkCard, { groupName: view.groupName, work: view.work, said, facilitatorsApart: [], onRemind: () => {} }),
    );
    const text = textOf(html);
    assert.match(text, /2 of 4 have done week 3/);
    assert.match(text, /Done means every reading ticked, the reflection written and the written answer sent\./);
    assert.match(text, /Everyone 4 .*Week not done 2 .*Readings not done 2 .*Reflection not done 2 .*Written answer not done 2 .*Late 1/);
    assert.match(text, /Ines .*2 of 2 .*Written Wed 18 Nov .*Late: 1 day after the session .*Sent Wed 18 Nov, 6pm .*Done late/);
    assert.match(text, /Omar .*Not started .*Mon 16 Nov, 9am · 1-day, automatic/);
    assert.match(text, /Late in week 3 Ines Readings, reflection and written answer done Wed 18 Nov, 6pm Late: 1 day after the session/);
    assert.match(text, /Facilitators’ own work/);
    // Omar's address is suppressed and Dev is not told: neither has a Remind of their own; nobody done has one either.
    assert.equal((html.match(/>Remind [A-Z]/g) ?? []).length, 0, "nobody here can be reminded: Ines is done");
    assert.doesNotMatch(text, /Remind \d+ (person|people)/);
  });

  test("for a facilitator: the count and Remind, and never a facilitator's own week", async () => {
    const view = await page("facilitator", "rahul", 3);
    const text = textOf(renderToStaticMarkup(createElement(w.parts.FacilitatorWeekWork, { groupId: B, work: view.work })));
    assert.match(text, /^1 of 3 have done week 3 Week 3 Done on time 1 Not started 2 Remind 1 person whose week isn’t done /);
    assert.doesNotMatch(text, /Rahul|Sofia|own/);
    const meets = textOf(renderToStaticMarkup(createElement(w.parts.FacilitatorMeets, { view, eyebrow: "AGI Strategy · Group B", path: "/learn/run/group/b" })));
    assert.match(meets, /Week 3/);
    const links = renderToStaticMarkup(createElement(w.parts.FacilitatorMeets, { view, eyebrow: "", path: "/learn/run/group/b" }));
    assert.match(links, /href="\/learn\/run\/group\/b\?week=3"[^>]*aria-current="true"/);
  });
});

describe("9. account deletion", () => {
  test("takes a person's hand records and nothing else in the collection", async () => {
    await press("rahul", 3);
    world.db.seed("courseNudges/facilitating__someone", { kind: "facilitating", uid: "ines" });
    const removed = await accountDeletion.deleteCourseHandReminders(world.courseDb, "ines");
    assert.equal(removed, 1);
    assert.equal(world.db.read(recordPath("ines", 3)), undefined);
    assert.ok(world.db.read("courseNudges/facilitating__someone"), "another kind's record stays");
  });
});

// Keep the seed's own description true.
test("the seed: Amara did week 3 before the session, and nobody else did all of it", () => {
  const seed = remindSeed();
  assert.ok(seed[`courseExerciseResponses/${RUN.agi}__amara__w03__r3-wa`].firstSentAt < new Date("2026-11-17T18:00:00Z"));
  assert.equal(seed[`courseExerciseResponses/${RUN.agi}__ines__w03__r3-wa`], undefined);
});
