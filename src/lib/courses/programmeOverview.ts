import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { freedPlaceWindow, lastDayLabel } from "@/lib/applications/freedPlaces/rules";
import { namesInWords } from "@/lib/courses/facilitatingEmail";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { londonClockLabel, londonDayAndClock, londonDayLabel } from "@/lib/courses/londonLabels";
import {
  buildRunAttendance,
  dayLabel,
  groupsInWords,
  hasLeft,
  listGroups,
  programmeWeekNow,
  weeksOf,
  type GroupSessionFacts,
  type ListedGroup,
  type RunAttendance,
  type RunRecords,
} from "@/lib/courses/programmeAttendance";
import { firstNameOfUser, readRunLead, type RunLead } from "@/lib/courses/programmeLead";
import { emailsCountLine, readReminderState, remindLabel, type ReminderState } from "@/lib/courses/registerRemind";
import { followUpDueAt } from "@/lib/courses/unmarkedRegisters";
import { addDaysToKey, isValidDateKey, londonDateKey } from "@/lib/courses/weekPlan";
import { courseNudgeSessionWhere } from "@/lib/email/courseNudgeEmail";
import { readCoursesConfig, type CoursesConfig } from "@/lib/firestore/config";
import { sessionModeForWeek } from "@/lib/firestore/courseGroups";
import { weekDocId } from "@/lib/firestore/courses";

/**
 * A PROGRAMME'S OVERVIEW (board wk-overview), for its lead and admins: the
 * week the run is in, each group's session this week and its register, what
 * needs attention, who came by week, and how many are taking part. Every
 * value from a record, worded here on the server so the page only draws it.
 *
 * WHAT "NEEDS ATTENTION" CAN SAY, and each item goes away with the record
 * that put it there:
 *  - somebody marked absent at `ABSENT_IN_A_ROW` sessions in a row with no
 *    excuse (it goes when a later session marks them anything else);
 *  - a week not published that a group has reached, its previous session
 *    over (Published stands in for Ready, as the register's next-week email
 *    does; it goes when the week is published);
 *  - a register not finished once its session has ended, with the
 *    reminder's and the task's real times from the settings their jobs read
 *    (it goes when the register is finished, or marked as not held);
 *  - somebody who left (it goes if they are put back).
 *
 * NOT BUILT, and so not drawn: the board's "Email Freya" (a lead writing to
 * one person through the site is new, and its email is not drawn: C21), the
 * week's readiness detail ("2 of 3 readings and the guide are missing": a
 * week has no Ready checklist yet), "Kofi can't make it" (Can't make it is
 * not built) and the Updates card (the Updates job).
 */

export type OverviewRailWeek = {
  weekNumber: number;
  /** "Week 3". */
  label: string;
  /** "Thu 12 Nov": the day the run's week starts. */
  date: string;
  state: "done" | "current" | "to-come";
  /** "done", "this week", "to come": what the rail's colour says, in words. */
  stateWord: string;
};

export type OverviewWeek = {
  /** "This week", "Before the start", "Finished". */
  label: string;
  /** "Week 3 of 6", or a break's own name. */
  title: string;
  /** "Thu 12 to Wed 18 Nov". */
  span: string;
  /** The week's own title, as written on it, or null. */
  theme: string | null;
  /** "Open week 3", for an admin, to the week's editor; null for anybody else. */
  open: { href: string; label: string } | null;
  rail: OverviewRailWeek[];
};

export type OverviewSession = {
  groupId: string;
  groupName: string;
  /** "Thu 12 Nov · 6pm", "Today · 6pm", "Tomorrow · 1pm". */
  when: string;
  today: boolean;
  /** The room, "Online", or "" when there is nothing to print. */
  where: string;
  facilitators: { uid: string; name: string }[];
  state: "finished" | "not-finished" | "today" | "tomorrow" | "later" | "not-held";
  /** "Register finished", "Register not finished", "Today, 6pm", "Tomorrow", "Wed 18 Nov", "Not held". */
  pill: string;
  /** "7 of 8 came", "Saved, not finished. 6 of 8 so far.", "7 in the group", or null. */
  line: string | null;
  /** The group's row on the Attendance tab, for a finished register. */
  seeIt: string | null;
  /** The press that emails the group's facilitators now, when there is anybody to email. */
  remind: {
    sessionKey: string;
    label: string;
    count: number;
    countLine: string;
    confirm: string;
  } | null;
  /** "Grace was reminded on Wed 18 Nov at 8am.", or null. */
  reminded: string | null;
};

export type OverviewAttention = {
  kind: "absent" | "week" | "register" | "left";
  title: string;
  detail: string;
  link: { href: string; label: string } | null;
};

export type OverviewChart = {
  weeks: { weekNumber: number; label: string; percent: number | null; soFar: boolean }[];
  /** "Who came, by week: week 1 94%, ... Weeks 4 to 6 not yet." for assistive technology. */
  description: string;
  /** "Week 3 is from Groups A and D so far.", or null. */
  from: string | null;
};

export type OverviewModel = {
  /** Null while the run has no start date or no taught weeks. */
  week: OverviewWeek | null;
  sessions: OverviewSession[];
  attention: OverviewAttention[];
  chart: OverviewChart;
  people: { takingPart: number; left: number; line: string };
  /** The register's own word for finishing it: "finished" or "pushed". */
  ending: "finished" | "pushed";
};

export type OverviewViewer = { isAdmin: boolean; uid: string };

/** Where the programme's own tabs are, and the run, for the links. */
export type OverviewPlace = {
  /** "/admin/admissions/forms/<round>/programmes/<programme>", no trailing slash. */
  programmePath: string;
  courseId: string;
  /** When decision day's emails went, for the freed places line. */
  decisionsSentAt: Date | null;
};

const DAY_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
});

function parts(dateKey: string): { weekday: string; day: string; month: string } {
  const found = DAY_PARTS.formatToParts(new Date(`${dateKey}T12:00:00Z`));
  const get = (type: string) => found.find((part) => part.type === type)?.value ?? "";
  return { weekday: get("weekday"), day: get("day"), month: get("month") };
}

/** "Thu 12 to Wed 18 Nov", or "Thu 26 Nov to Wed 2 Dec" across a month's end. */
export function weekSpanLabel(startKey: string): string {
  if (!isValidDateKey(startKey)) return "";
  const endKey = addDaysToKey(startKey, 6);
  const start = parts(startKey);
  const end = parts(endKey);
  return start.month === end.month
    ? `${start.weekday} ${start.day} to ${end.weekday} ${end.day} ${end.month}`
    : `${start.weekday} ${start.day} ${start.month} to ${end.weekday} ${end.day} ${end.month}`;
}

/** The run's taught weeks, each with the day its slot starts. */
function taughtSlots(records: RunRecords): { weekNumber: number; index: number; startKey: string }[] {
  const { startDate, weekPlan } = records.run;
  if (!isValidDateKey(startDate)) return [];
  const out: { weekNumber: number; index: number; startKey: string }[] = [];
  weekPlan.forEach((entry, index) => {
    if (entry.kind !== "week") return;
    out.push({ weekNumber: entry.weekNumber, index, startKey: addDaysToKey(startDate, index * 7) });
  });
  return out;
}

/** The week the card is about, and the days it spans: the current slot, week 1 before the start, the last after the end. */
function cardWeek(
  records: RunRecords,
  now: Date,
): { phase: "before" | "running" | "after"; index: number; startKey: string; weekNumber: number | null; breakLabel: string | null } | null {
  const slots = taughtSlots(records);
  const current = slots.length > 0 ? programmeWeekNow(records.run, now) : null;
  if (!current) return null;
  if (current.phase === "before") {
    return { phase: "before", index: slots[0].index, startKey: slots[0].startKey, weekNumber: slots[0].weekNumber, breakLabel: null };
  }
  if (current.phase === "after") {
    const last = slots[slots.length - 1];
    return { phase: "after", index: last.index, startKey: last.startKey, weekNumber: last.weekNumber, breakLabel: null };
  }
  return {
    phase: "running",
    index: current.planIndex ?? 0,
    startKey: current.slotStartKey,
    weekNumber: current.weekNumber,
    breakLabel: current.breakLabel,
  };
}

function weekCard(
  records: RunRecords,
  card: NonNullable<ReturnType<typeof cardWeek>>,
  theme: string | null,
  viewer: OverviewViewer,
  courseId: string,
): OverviewWeek {
  const slots = taughtSlots(records);
  const total = slots.length;
  const label = card.phase === "before" ? "Before the start" : card.phase === "after" ? "Finished" : "This week";
  const title =
    card.weekNumber !== null ? `Week ${card.weekNumber} of ${total}` : (card.breakLabel?.trim() || "A week off");
  const open =
    viewer.isAdmin && card.weekNumber !== null && courseId
      ? {
          href: `/admin/courses/${encodeURIComponent(courseId)}/runs/${encodeURIComponent(records.run.id)}/weeks/${weekDocId(card.weekNumber)}`,
          label: `Open week ${card.weekNumber}`,
        }
      : null;
  const rail = slots.map((slot): OverviewRailWeek => {
    const state: OverviewRailWeek["state"] =
      card.phase === "before"
        ? "to-come"
        : card.phase === "after"
          ? "done"
          : slot.index < card.index
            ? "done"
            : slot.index === card.index
              ? "current"
              : "to-come";
    return {
      weekNumber: slot.weekNumber,
      label: `Week ${slot.weekNumber}`,
      date: dayLabel(slot.startKey),
      state,
      stateWord: state === "done" ? "done" : state === "current" ? "this week" : "to come",
    };
  });
  return {
    label,
    title,
    span: weekSpanLabel(card.startKey),
    theme: card.weekNumber !== null ? theme : null,
    open,
    rail,
  };
}

/** The people on a group's register for one week: everybody listed whose cell is not before or after them. */
function onRegister(listed: ListedGroup, weekNumber: number): { came: number; marked: number; of: number } {
  let came = 0;
  let marked = 0;
  let of = 0;
  for (const { row } of listed.people) {
    const cell = row.cells.find((c) => c.weekNumber === weekNumber);
    if (!cell || cell.state === "before" || cell.state === "after" || cell.state === "none") continue;
    of += 1;
    if (cell.state === "mark" && cell.mark) {
      marked += 1;
      if (cell.mark === "present" || cell.mark === "late" || cell.mark === "left-early") came += 1;
    }
  }
  return { came, marked, of };
}

/** "you and admins", "Claudia and admins", "admins": who gets the unfinished register's task. */
function taskPeople(lead: RunLead | null, viewer: OverviewViewer): string {
  if (lead && lead.uid === viewer.uid) return "you and admins";
  if (lead && lead.firstName) return `${lead.firstName} and admins`;
  return "admins";
}

const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);

/** "Grace was reminded on Wed 18 Nov at 8am.", for the latest reminder. */
function remindedLine(state: ReminderState): string | null {
  if (state.reminded.length === 0) return null;
  const names = namesInWords(state.reminded.map((person) => person.firstName || "Their facilitator"));
  const latest = state.reminded.reduce((a, b) => (a.at.getTime() >= b.at.getTime() ? a : b));
  return `${names} ${state.reminded.length === 1 ? "was" : "were"} reminded on ${londonDayAndClock(latest.at)}.`;
}

/**
 * THE OVERVIEW. Reads the week docs it needs, the reminder markers of the
 * registers not finished and the settings the chase reads; everything else
 * comes from the records the Attendance tab reads.
 */
export async function buildProgrammeOverview(
  db: Firestore,
  records: RunRecords,
  viewer: OverviewViewer,
  place: OverviewPlace,
  now: Date,
): Promise<OverviewModel> {
  const attendance: RunAttendance = buildRunAttendance(records, viewer, now);
  const listed = listGroups(records, viewer, now, weeksOf(records));
  const ending = attendance.ending;
  const [config, lead] = await Promise.all([readCoursesConfig(db), readRunLead(db, records.run.id)]);
  const todayKey = londonDateKey(now);
  const tomorrowKey = addDaysToKey(todayKey, 1);
  const attendanceHref = (groupId?: string) =>
    `${place.programmePath}/attendance${groupId ? `?group=${encodeURIComponent(groupId)}` : ""}`;

  // ── The week ─────────────────────────────────────────────────────────────
  const card = cardWeek(records, now);
  let week: OverviewWeek | null = null;
  if (card) {
    const theme =
      card.weekNumber !== null
        ? ((await resolveWeekDoc(db, records.run.id, null, weekDocId(card.weekNumber))).week?.title.trim() || null)
        : null;
    week = weekCard(records, card, theme, viewer, place.courseId);
  }

  // ── Reminders: every register not finished, read once ───────────────────
  const reminderStates = new Map<string, ReminderState>();
  for (const entry of listed) {
    for (const facts of entry.sessions.values()) {
      if (facts.tag !== "not-finished") continue;
      reminderStates.set(
        `${entry.group.id}__${facts.session.sessionKey}`,
        await readReminderState(db, entry.group, facts.session.sessionKey, now),
      );
    }
  }

  // ── Sessions this week ───────────────────────────────────────────────────
  const sessions: OverviewSession[] = [];
  if (card) {
    const endKey = addDaysToKey(card.startKey, 6);
    const inWeek: { entry: ListedGroup; facts: GroupSessionFacts }[] = [];
    for (const entry of listed) {
      for (const facts of entry.sessions.values()) {
        const key = facts.session.dateKey;
        if (key && key >= card.startKey && key <= endKey) inWeek.push({ entry, facts });
      }
    }
    inWeek.sort(
      (a, b) =>
        (a.facts.startsAt?.getTime() ?? Infinity) - (b.facts.startsAt?.getTime() ?? Infinity) ||
        a.entry.group.name.localeCompare(b.entry.group.name, "en-GB", { numeric: true }),
    );
    for (const { entry, facts } of inWeek) {
      const { group } = entry;
      const isToday = facts.session.dateKey === todayKey;
      const isTomorrow = facts.session.dateKey === tomorrowKey;
      const clock = facts.startsAt ? londonClockLabel(facts.startsAt) : "";
      const day = isToday ? "Today" : isTomorrow ? "Tomorrow" : facts.startsAt ? londonDayLabel(facts.startsAt) : dayLabel(facts.session.dateKey);
      const counts = onRegister(entry, facts.session.weekNumber);
      const base = {
        groupId: group.id,
        groupName: group.name,
        when: clock ? `${day} · ${clock}` : day,
        today: isToday,
        where: courseNudgeSessionWhere(facts.session.session, sessionModeForWeek(group, facts.session.weekId)),
        facilitators: entry.facilitators.map((person) => ({ uid: person.uid, name: person.name })),
        seeIt: null,
        remind: null,
        reminded: null,
      };
      if (!facts.held) {
        sessions.push({ ...base, state: "not-held", pill: "Not held", line: null });
      } else if (facts.finished) {
        sessions.push({
          ...base,
          state: "finished",
          pill: `Register ${ending}`,
          line: `${counts.came} of ${counts.of} came`,
          seeIt: attendanceHref(group.id),
        });
      } else if (facts.ended) {
        const reminder = reminderStates.get(`${group.id}__${facts.session.sessionKey}`) ?? { sendable: [], reminded: [] };
        const count = reminder.sendable.length;
        const sessionDay = dayLabel(facts.session.dateKey);
        sessions.push({
          ...base,
          state: "not-finished",
          pill: `Register not ${ending}`,
          line:
            counts.marked > 0
              ? `Saved, not ${ending}. ${counts.came} of ${counts.of} so far.`
              : "Nothing’s saved yet.",
          remind:
            count > 0 && facts.startsAt
              ? {
                  sessionKey: facts.session.sessionKey,
                  label: remindLabel(reminder.sendable),
                  count,
                  countLine: emailsCountLine(count),
                  confirm:
                    `${remindLabel(reminder.sendable)} to ${ending === "finished" ? "finish" : "push"} ` +
                    `${group.name}’s register for ${sessionDay}? This emails ${count} ${count === 1 ? "person" : "people"}.`,
                }
              : null,
          reminded: remindedLine(reminder),
        });
      } else if (isToday) {
        sessions.push({
          ...base,
          state: "today",
          pill: clock ? `Today, ${clock}` : "Today",
          line: `${counts.of} in the group`,
        });
      } else if (isTomorrow) {
        sessions.push({ ...base, state: "tomorrow", pill: "Tomorrow", line: null });
      } else {
        sessions.push({ ...base, state: "later", pill: dayLabel(facts.session.dateKey), line: null });
      }
    }
  }

  // ── Needs attention ──────────────────────────────────────────────────────
  const attention: OverviewAttention[] = [];

  // Somebody absent at sessions in a row, with no excuse.
  for (const entry of listed) {
    for (const { row } of entry.people) {
      if (row.absentInARow === 0) continue;
      attention.push({
        kind: "absent",
        title: `${row.name} has missed ${row.absentInARow} sessions in a row without saying`,
        detail: `${entry.group.name} · weeks ${namesInWords(row.absentWeeks.map(String))}`,
        link: null,
      });
    }
  }

  // A week not published that a group has reached: its previous session is
  // over and its next is still to come.
  const reached = new Map<number, { names: string[]; lastKey: string; nextKey: string }>();
  for (const entry of listed) {
    const ordered = [...entry.sessions.values()]
      .filter((facts) => facts.startsAt !== null)
      .sort((a, b) => (a.startsAt as Date).getTime() - (b.startsAt as Date).getTime());
    const nextAt = ordered.findIndex((facts) => !facts.started);
    if (nextAt <= 0) continue;
    const previous = ordered[nextAt - 1];
    const next = ordered[nextAt];
    if (!previous.ended) continue;
    const resolved = await resolveWeekDoc(db, records.run.id, entry.group.id, next.session.weekId);
    if (resolved.week?.published) continue;
    const found = reached.get(next.session.weekNumber) ?? { names: [], lastKey: "", nextKey: "" };
    found.names.push(entry.group.name);
    if (!found.lastKey || previous.session.dateKey < found.lastKey) found.lastKey = previous.session.dateKey;
    if (!found.nextKey || next.session.dateKey < found.nextKey) found.nextKey = next.session.dateKey;
    reached.set(next.session.weekNumber, found);
  }
  for (const [weekNumber, found] of [...reached].sort((a, b) => a[0] - b[0])) {
    const who = groupsInWords(found.names);
    const one = found.names.length === 1;
    attention.push({
      kind: "week",
      title: `Week ${weekNumber} isn’t ready, and ${who} ${one ? "has" : "have"} reached it`,
      detail: one
        ? `${who} met on ${dayLabel(found.lastKey)} and meets again on ${dayLabel(found.nextKey)}. Week ${weekNumber} isn’t published, so people in the group can’t open it yet.`
        : `${who} meet again from ${dayLabel(found.nextKey)}. Week ${weekNumber} isn’t published, so people in these groups can’t open it yet.`,
      link: viewer.isAdmin && place.courseId
        ? {
            href: `/admin/courses/${encodeURIComponent(place.courseId)}/runs/${encodeURIComponent(records.run.id)}/weeks/${weekDocId(weekNumber)}`,
            label: `Open week ${weekNumber}`,
          }
        : null,
    });
  }

  // A register not finished once its session has ended.
  for (const entry of listed) {
    const unfinished = [...entry.sessions.values()]
      .filter((facts) => facts.tag === "not-finished")
      .sort((a, b) => a.session.weekNumber - b.session.weekNumber);
    for (const facts of unfinished) {
      const state = reminderStates.get(`${entry.group.id}__${facts.session.sessionKey}`) ?? { sendable: [], reminded: [] };
      attention.push({
        kind: "register",
        title: `${entry.group.name}’s register for ${dayLabel(facts.session.dateKey)} isn’t ${ending}`,
        detail: chaseDetail(entry, facts, state, records, config, lead, viewer, now, ending),
        link: { href: attendanceHref(entry.group.id), label: "See it" },
      });
    }
  }

  // Somebody who left, the most recent first.
  const leavers: { entry: ListedGroup; enrolmentIndex: number }[] = [];
  for (const entry of listed) {
    entry.people.forEach((person, index) => {
      if (hasLeft(person.enrolment)) leavers.push({ entry, enrolmentIndex: index });
    });
  }
  leavers.sort((a, b) => {
    const left = (x: typeof a) => x.entry.people[x.enrolmentIndex].row.leftDateKey ?? "";
    return left(b).localeCompare(left(a));
  });
  for (const { entry, enrolmentIndex } of leavers) {
    const { enrolment, row } = entry.people[enrolmentIndex];
    const first = firstNameOfUser(records.accounts.get(enrolment.uid) ?? {}) || row.name;
    const sentences: string[] = [];
    if (enrolment.status === "withdrawn" && enrolment.dropOutReason) {
      sentences.push(`${first} said: “${enrolment.dropOutReason}”`);
    }
    if (row.leftDateKey && enrolment.droppedOutAt) {
      const leftAt = enrolment.droppedOutAt.getTime();
      const firstWeekGone = [...entry.sessions.values()]
        .filter((facts) => facts.startsAt !== null && (facts.startsAt as Date).getTime() >= leftAt)
        .sort((a, b) => a.session.weekNumber - b.session.weekNumber)[0];
      if (firstWeekGone) {
        sentences.push(`${first}’s off ${entry.group.name}’s register from week ${firstWeekGone.session.weekNumber}.`);
      }
    } else {
      sentences.push(`${first}’s off ${entry.group.name}’s register.`);
    }
    attention.push({
      kind: "left",
      title: row.leftDateKey ? `${row.name} left on ${dayLabel(row.leftDateKey)}` : `${row.name} left`,
      detail: sentences.join(" "),
      link: null,
    });
  }

  // ── Attendance by week ───────────────────────────────────────────────────
  const withData = attendance.totals.filter((total) => total.percent !== null);
  const without = attendance.totals.filter((total) => total.percent === null).map((total) => total.weekNumber);
  const described = withData.map((total) => `week ${total.weekNumber} ${total.percent}%${total.soFar ? " so far" : ""}`);
  let notYet = "";
  if (without.length === 1) notYet = ` Week ${without[0]} not yet.`;
  else if (without.length > 1) {
    const contiguous = without.every((n, at) => at === 0 || n === without[at - 1] + 1);
    notYet = contiguous
      ? ` Weeks ${without[0]} to ${without[without.length - 1]} not yet.`
      : ` Weeks ${namesInWords(without.map(String))} not yet.`;
  }
  const latestSoFar = [...withData].reverse().find((total) => total.soFar) ?? null;
  const chart: OverviewChart = {
    weeks: attendance.totals.map((total) => ({
      weekNumber: total.weekNumber,
      label: `W${total.weekNumber}`,
      percent: total.percent,
      soFar: total.soFar,
    })),
    description: described.length
      ? `Who came, by week: ${described.join(", ")}.${notYet}`
      : `Who came, by week: nobody’s marked yet.`,
    from:
      latestSoFar && latestSoFar.from.length > 0
        ? `Week ${latestSoFar.weekNumber} is from ${groupsInWords(latestSoFar.from)} so far.`
        : null,
  };

  // ── People ───────────────────────────────────────────────────────────────
  let takingPart = 0;
  let left = 0;
  for (const entry of listed) {
    for (const { enrolment } of entry.people) {
      if (hasLeft(enrolment)) left += 1;
      else takingPart += 1;
    }
  }
  const window = freedPlaceWindow(place.decisionsSentAt, records.run, now);
  const placesLine =
    window.state === "open"
      ? `Freed places can be offered until ${lastDayLabel(window)}, the end of week 1.`
      : window.state === "closed"
        ? "Places can’t be offered after week 1."
        : null;
  const peopleLine = [left > 0 ? `${left} left.` : "Nobody has left.", placesLine].filter(Boolean).join(" ");

  return {
    week,
    sessions,
    attention,
    chart,
    people: { takingPart, left, line: peopleLine },
    ending,
  };
}

/**
 * What happens next to a register not finished, from the jobs' own switches
 * and the hours in Course settings, counted from the session's end as the
 * jobs count: "We’ll remind Grace on Wed 18 Nov at 8am. If it’s still not
 * finished on Thu 19 Nov at 8am, you and admins get a task." A part whose job
 * is switched off is left out, as the register's own page leaves it out.
 */
function chaseDetail(
  entry: ListedGroup,
  facts: GroupSessionFacts,
  state: ReminderState,
  records: RunRecords,
  config: CoursesConfig,
  lead: RunLead | null,
  viewer: OverviewViewer,
  now: Date,
  ending: "finished" | "pushed",
): string {
  const sentences: string[] = [];
  const endsAt = facts.endsAt;
  const reminded = remindedLine(state);
  if (reminded) {
    sentences.push(reminded);
  } else if (records.switches.remindersOn && endsAt && entry.facilitators.length > 0) {
    const at = followUpDueAt(endsAt, config.unmarkedRegisterGraceHours);
    if (at.getTime() > now.getTime()) {
      sentences.push(
        `We’ll remind ${namesInWords(entry.facilitators.map((person) => person.firstName))} on ${londonDayAndClock(at)}.`,
      );
    }
  }
  if (records.switches.tasksOn && endsAt) {
    const at = followUpDueAt(endsAt, config.registerTaskHours);
    const who = taskPeople(lead, viewer);
    sentences.push(
      at.getTime() > now.getTime()
        ? `If it’s still not ${ending} on ${londonDayAndClock(at)}, ${who} get a task.`
        : `${capitalise(who)} have a task for it.`,
    );
  }
  return sentences.join(" ");
}
