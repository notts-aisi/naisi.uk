/**
 * The course hub's browser spec for a group's sessions and a week's work:
 * "Can't make it" and "Joining online", the box that asks a group's
 * facilitators for a meeting link, the register's session report and its in
 * the room or online, and the week you submit.
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at its week's work point ("week-three-work"): three weeks into a running
 * run, Publish having told Ada and Ben their place in Group A and Cleo hers
 * in Group B, every register so far finished but Group A's week 3, which
 * nobody has opened, and weeks 1 to 4 published, written as blocks, each with
 * reflections, two sources and a written answer. Group A's week 4 session is
 * days ahead.
 *
 * The spec (`tests/e2e/course-hub-sessions-and-work.spec.mjs`) is Ada and
 * Fern, Group A's facilitator, in that week. Ada opens Can't make it on
 * her next session's ticket (a request an admin decides) and closes it
 * having sent nothing, then answers "Can you make this time most weeks?"
 * with "Most weeks, not all", ticking weeks 4 and 5 in her first answer,
 * and Fern's register says so. Fern's register
 * leads to week 3's session report before it is finished; Fern marks it,
 * puts Ada down as having joined it online, finishes it, follows its link to
 * the session report and sends one. Ada can make week 4 after all and
 * unticks it, which is all her answer takes now that she has given it; week
 * 6 is asked about on Can't make it instead (the request offers it; nothing
 * is sent). Then she says she is joining week 4 online, one thing at a time
 * on her ticket, and the email log holds the one email that tells Fern so; the
 * box at the top of Fern's group page asks for a meeting link for week 4
 * (Group A has none at this point), Fern adds one, and the box and the
 * register say Ada is joining online; Ada's ticket, on Ada's programme page
 * and on Home, carries the link for anybody joining online. Ada
 * writes week 4's written answer and sends it with its own Send (the week
 * stays open: nothing locks at a send or at the session), then changes it
 * before the session, and Fern's review page still shows it as sent, never
 * the change. Then the programme's lead opens the Surveys tab from the
 * programme's head and follows the Overview's link to the programme's
 * session reports, where Fern's report is, with names, and the lead's
 * Attendance tab says Ada came to one of three sessions online. Last, Group
 * A's week 4 session starts (`startGroupSession`, below): Ada's page says the
 * group met, and what she adds and changes now says how late; Fern's pages
 * say "Late" with how late and show the answer as it stood at the session;
 * and Ben, another fellow of the group, reads none of it.
 *
 * ## Every grant is made on a real page, by the admin the harness is given
 *
 * The fixture makes waiting accounts and nothing above them. The admin
 * approves Ada and Fern on Approvals (and Ben, later, for the last step),
 * names the running run on the programme's Settings tab, and appoints Fern
 * to Group A on the Groups tab's Facilitators view.
 *
 * ## The session starts, by the clock the term's points move
 *
 * The term is read at a point by choosing when its run began, never by
 * waiting (`./worlds/course-hub-term.mjs`). So when the journey needs Group
 * A's week 4 session to have started, `startGroupSession` moves Group A's
 * own calendar, its pace start, so that week 4's slot begins today, and sets
 * week 4's session to a few minutes ago: the two fields a facilitator's own
 * pace and "Move it" write. It writes only Group A's own record, which the
 * term's teardown deletes, and adds no row. The lead's pages are read before
 * it, so the registers they read are the term's as seeded. The programme's lead is the admin, as at every course
 * hub spec: a lead must be SU-recognised committee, which the harness never
 * makes.
 *
 * ## It reads no mail
 *
 * Nothing it checks is in an email: of the mail, it reads only the email
 * log's row for the email that tells Fern Ada is joining online, by its kind
 * and its subject. That email, the approvals and the week 4 email the
 * finished register may send go to fixture addresses, suppressed first
 * wherever the mail is not caught, so it runs wherever the harness runs.
 */
import { fixtureDoc } from "./core.mjs";
import { countTerm, londonDateKey, londonWallClockToInstant, seedTerm, shiftDateKey, teardownTerm, weekDocId, weekdayOf } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const SESSIONS_AND_WORK_STEPS = [
  "the admin approves the facilitator and the member of the group who signs in",
  "the admin names the running course run on the programme's Settings tab",
  "the admin appoints the facilitator to the group whose register nobody has marked",
  "the member's next session's ticket offers Can't make it as a request an admin decides, joining online beside what it asks them to confirm, never the instant button, and opening it writes nothing",
  "the member answers Can you make this time most weeks? with Most weeks, not all, ticking the next session and a later one, and their registers record them as excused",
  "the facilitator's register says who can't make next week's session, leads to this week's session report before it is finished, and the facilitator marks this week's, puts the member down as having joined it online, and finishes it",
  "the facilitator follows the finished register's link to the session report and sends one",
  "the member can make next week's session after all and unticks it, all an answer takes once given, asks about another week on Can't make it instead, and says they are joining online, one thing at a time, and the group's facilitator is emailed that they are",
  "the box at the top of the facilitator's group page asks for a link for the week the member is joining online, the facilitator adds one, and the box and the register say who is joining online",
  "the member's ticket carries the week's link for anybody joining online, beside Add to calendar, on the programme page and on Home",
  "the member writes the week's written answer and sends it with its own Send, and the week stays open, saying when it was sent",
  "the member changes the answer before the session, and the page says the people who read it still see the version sent",
  "the facilitator's review page shows the answer as it was sent, never the change",
  "the programme's lead follows the Surveys tab's link to the session reports and reads the facilitator's report, with names",
  "the programme's lead reads on the Attendance tab how many sessions the member came to in the room and online",
  "once the group's session has started, the member's page says the group met, and what the member adds, changes and sends now says how late",
  "the facilitator's pages say late with how late, and show the answer as it stood at the session",
  "another fellow of the group reads none of the member's work",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the people, Fern or the admin drive
 * takes a token.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-sessions-and-work",
  specFile: "tests/e2e/course-hub-sessions-and-work.spec.mjs",
  steps: SESSIONS_AND_WORK_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, the Settings tab, the Facilitators view and the lead's pages
  // are an admin's here. The account is one the harness is given; it can
  // never make one.
  needs: { admin: true },
  /**
   * What a green run drives, as src/app keys. Two are reached and
   * deliberately absent: `/api/courses/runs/[runId]/sync-tasks`, which a
   * member's programme page calls on its own and nothing here reads, and the
   * Surveys tab's Overview, which the lead passes through on the way to the
   * session reports and reads only its reports from: the programme surveys
   * spec reads the rest of it.
   */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/courses/runs/[runId]/facilitators",
      "/api/courses/groups/[groupId]/facilitators",
      "/api/courses/runs/[runId]/time-answer",
      "/api/courses/groups/[groupId]/joining-online",
      "/api/courses/groups/[groupId]/meeting-link",
      "/api/courses/groups/[groupId]/attendance",
      "/api/courses/groups/[groupId]/attendance/push",
      "/api/courses/groups/[groupId]/session-report",
      "/api/courses/runs/[runId]/overview",
      "/api/courses/runs/[runId]/written-answers/[answerId]",
      "/api/courses/runs/[runId]/written-answers/[answerId]/send",
      "/api/courses/runs/[runId]/reflections/[promptId]",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/learn/[runId]",
      "/(app)/learn/[runId]/group/[groupId]",
      "/(app)/learn/[runId]/group/[groupId]/register",
      "/(app)/learn/[runId]/group/[groupId]/report",
      "/(app)/learn/[runId]/group/[groupId]/written",
      "/(app)/learn/[runId]/group/[groupId]/reflections/names",
      "/(app)/learn/[runId]/weeks/[n]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/reports",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/attendance",
      "/(app)/dashboard",
    ],
  },
  /**
   * VERIFIED on 2026-11-02, on dev b457d82c: twice against the harness's
   * loopback server on a laptop (a fresh build, then the same build again),
   * all ten steps each time. 53 rows existed before teardown (the form and
   * its question set, 3 applications and 3 decisions, the course, the run and
   * its 4 published weeks, 2 groups, 4 enrolments, 1 audit row, 3 cohort
   * subscriptions, 7 registers, 1 update, the week 4 email's marker and the
   * push's counter, 1 written answer, 1 week's work row and 4 log rows, 1
   * session report, 4 sends, 4 accounts and their documents), and the
   * manifest read zero afterwards. Verified again on 2026-11-02 at a3f512eb
   * (on dev's 3992a724), once the lead reaches the session reports by the
   * Surveys tab's Overview: all ten steps, the same 53 rows before teardown,
   * and zero after. Verified again on 2026-11-05 at f2865f3b (on dev's
   * a788b495, whose register leads to the session report from the session's
   * start), once Ada also answers "Most weeks, not all" and ticks week 5: all
   * eleven steps, 54 rows before teardown (week 5's register the one more),
   * and zero after.
   * Verified again on 2026-11-05 at 8134783e (on 1b6a3f08, over
   * dev's f516daa5), once the journey carries Joining online, the box's
   * meeting link, the register's in the room or online and the Attendance
   * tab, with Group A given no meeting link at its point: all fourteen steps
   * against the loopback server on a laptop, 53 rows before teardown, and
   * zero after.
   * Verified again on 2026-11-06 at 7163b840 (on dev's 67cb9896), the first
   * run with both "Most weeks, not all" and Joining online in the journey:
   * all fifteen steps against the loopback server on a laptop, 54 rows
   * before teardown, and zero after.
   * Verified again on 2026-11-12, once the week stays open: the member sends
   * with the answer's own Send and changes it before the session, the
   * fixture starts the group's session, and the member's late work is read
   * on the member's and the facilitator's pages, with another fellow reading
   * none of it. All eighteen steps against the loopback server on a laptop,
   * the fixture manifest at zero after teardown.
   * Verified again on 2026-11-13, on dev's 6311e935, once saying Joining
   * online emails the group's facilitator: the email log holds the one email
   * to Fern, by its kind and its subject, and the box still asks for the
   * link. All eighteen steps against the loopback server on a laptop, 58
   * rows before teardown (6 sends), and zero after.
   */
  status: "verified",
  seed: ({ runId, suppress, onState }) => seedTerm({ runId, suppress, onState, point: "week-three-work" }),
  countRows: countTerm,
  teardown: teardownTerm,
};

/** London's wall clock, "HH:MM", of an instant. */
function londonClock(at) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.hour}:${parts.minute}`;
}

/**
 * THE SESSION STARTS. Moves `group`'s week `weekNumber` session to start at
 * the first whole London minute after `after` (the last change the journey
 * made before it, so that change stays before the session), on today's date,
 * and waits until that minute has come: the group's own pace start becomes
 * the day that puts week `weekNumber`'s slot on today (the run's plan has no
 * break), and that week's session moves to today's weekday at that minute.
 * The two fields the group's own pace and a one-week "Move it" write, on the
 * group's own record, which the term's teardown deletes; nothing else is
 * written and no row is added. Its other weeks move with the pace start, all
 * of them before week `weekNumber` still in the past. Returns when the
 * session now starts, as the pages tell late against it.
 */
export async function startGroupSession(group, weekNumber, { after }) {
  const minute = 60_000;
  let startsAt = new Date(Math.floor(after.getTime() / minute) * minute + minute);
  const todayKey = londonDateKey(new Date());
  // A change made on an earlier London day: the session starts at today's first minute.
  if (londonDateKey(startsAt) !== todayKey) startsAt = londonWallClockToInstant(todayKey, "00:00");
  const startTimeLocal = londonClock(startsAt);
  const weekId = weekDocId(weekNumber);
  await fixtureDoc("courseGroups", group.id).update({
    paceStartDate: shiftDateKey(todayKey, -7 * (weekNumber - 1)),
    [`sessionOverrides.${weekId}.weekday`]: weekdayOf(todayKey),
    [`sessionOverrides.${weekId}.startTimeLocal`]: startTimeLocal,
    updatedAt: new Date(),
  });
  // Until that minute has come, the session has not started: wait for it, never more than a minute and
  // a margin, so a save's time stamped by the database's clock is after it whatever this machine's says.
  const wait = startsAt.getTime() - Date.now() + 10_000;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  return { dateKey: todayKey, startsAt };
}
