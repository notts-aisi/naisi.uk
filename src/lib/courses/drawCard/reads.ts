import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { resolveGroupCalendar } from "@/lib/courses/groupResolve";
import { readDrawState, readDrawWeeks, readGroupWeek, type DrawPerson, type DrawState, type DrawWeeks } from "@/lib/courses/packsAndCases/readers";
import type { WeekDraw } from "@/lib/courses/packsAndCases/model";
import { resolveSessions } from "@/lib/courses/sessions";
import { isAddressableId } from "@/lib/addressableId";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { guideSlipsOf, mayBeHandOutNight, slipsTonightOf, weekAfter, withDraws, type SlipsTonight } from "./model";

/**
 * THE SLIPS BEING HANDED OUT TONIGHT, for the register's row and Home's card
 * (`slipsTonightOf`), read in two halves so the cheap half can decide
 * whether the dear one is needed at all:
 *
 *  1. `readHandOutDates`: every week of the course as the group reads it (two
 *     queries, through `readDrawWeeks` with nobody in the draw, so no draw is
 *     read), and whether tonight can be a hand-out evening at all, from the
 *     rule's facts. Null on every other evening and on a course that gives
 *     nothing out.
 *  2. `slipsTonightFrom`: on such an evening, the draw of at most the two
 *     weeks the rule asks about, for the group's people the caller read
 *     (one read by id per person and block), and the rule asked again with
 *     whether everybody has theirs (`withDraws`). The week queries are not
 *     made again.
 *
 * The caller has asked the draw's gate, or is the group's facilitator.
 */
export async function readHandOutDates(db: Firestore, input: { run: CourseRunDoc; group: CourseGroupDoc; now: Date }): Promise<DrawWeeks | null> {
  const { run, group, now } = input;
  if (group.archived) return null;
  const dates = await readDrawWeeks(db, { run, group, people: [], now });
  return mayBeHandOutNight(dates) ? dates : null;
}

export async function slipsTonightFrom(
  db: Firestore,
  input: { runId: string; dates: DrawWeeks; people: readonly DrawPerson[]; now: Date },
): Promise<SlipsTonight | null> {
  const { runId, dates, people, now } = input;
  if (people.length === 0) return null;
  const read = await Promise.all(
    dates.rule.toRead.map(async (n) => {
      const week = dates.weeks.get(n);
      return week ? ([n, await readDrawState(db, runId, week, people)] as const) : null;
    }),
  );
  const states = new Map<number, DrawState>(read.filter((entry): entry is readonly [number, DrawState] => entry !== null));
  return slipsTonightOf({ course: withDraws(dates, states, people, now), people, now });
}

/** Both halves at once, for a caller that has the group's people to hand (the group summary, for Home). */
export async function readSlipsTonight(
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc; now: Date; people: () => Promise<readonly DrawPerson[] | null> },
): Promise<SlipsTonight | null> {
  const { run, group, now } = input;
  const dates = await readHandOutDates(db, { run, group, now });
  if (!dates) return null;
  const people = await input.people();
  return people ? slipsTonightFrom(db, { runId: run.id, dates, people, now }) : null;
}

/**
 * THE GUIDE'S CARD ON A WEEK'S PAGE, for each of the reader's own groups on
 * the course, all at once: the week after the page's in the group's plan
 * (`weekAfter`), when it gives something out and tonight is the evening its
 * slips are handed out at this week's session (`guideSlipsOf`). For each
 * group: the group and its run again (the guide's gate hands back named
 * fields, never the documents, so the one session resolver needs them read),
 * then that one week's blocks as the group reads it (two reads). No draw is
 * read. A group whose reads fail draws no card.
 */
export async function readGuideSlips(
  db: Firestore,
  input: { groups: ReadonlyArray<{ groupId: string; runId: string; name: string }>; pageWeek: number; now: Date },
): Promise<Array<{ groupId: string; name: string; weekNumber: number; draw: WeekDraw; sessionNumber: number }>> {
  const { pageWeek, now } = input;
  const found = await Promise.all(
    input.groups.map(async ({ groupId, runId, name }) => {
      if (!isAddressableId(groupId) || !isAddressableId(runId)) return null;
      try {
        const [groupSnap, runSnap] = await Promise.all([db.collection("courseGroups").doc(groupId).get(), db.collection("courseRuns").doc(runId).get()]);
        if (!groupSnap.exists || !runSnap.exists || (runSnap.data() ?? {}).destroying === true) return null;
        const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
        if (group.archived || group.runId !== runId) return null;
        const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
        const sessions = resolveSessions(run, group, resolveGroupCalendar(run, group, now).calendar);
        const after = weekAfter(sessions, pageWeek);
        if (after === null) return null;
        const next = await readGroupWeek(db, runId, groupId, after);
        const slips = guideSlipsOf({ sessions, next, pageWeek, now });
        return slips ? { groupId, name, ...slips } : null;
      } catch (err) {
        console.error("[facilitator guide] the slips read failed", groupId, err);
        return null;
      }
    }),
  );
  return found.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}
