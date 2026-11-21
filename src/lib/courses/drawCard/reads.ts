import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { resolveGroupCalendar } from "@/lib/courses/groupResolve";
import { readDrawWeeks, readGroupWeek, type DrawPerson } from "@/lib/courses/packsAndCases/readers";
import type { WeekDraw } from "@/lib/courses/packsAndCases/model";
import { resolveSessions } from "@/lib/courses/sessions";
import { isAddressableId } from "@/lib/addressableId";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { guideSlipsOf, mayBeHandOutNight, slipsTonightOf, type SlipsTonight } from "./model";

/**
 * THE SLIPS BEING HANDED OUT TONIGHT, for the register's row and Home's card
 * (`slipsTonightOf`), read as cheaply as the answer allows: every week of the
 * course as the group reads it (two queries, through `readDrawWeeks` with
 * nobody in it, so no draw is read), and only on a hand-out evening the
 * group's people (`people`, which the caller reads its own way) and the draw
 * of at most the two weeks the rule asks about. The caller has asked the
 * draw's gate, or is the group's facilitator.
 */
export async function readSlipsTonight(
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc; now: Date; people: () => Promise<readonly DrawPerson[] | null> },
): Promise<SlipsTonight | null> {
  const { run, group, now } = input;
  if (group.archived) return null;
  const dates = await readDrawWeeks(db, { run, group, people: [], now });
  if (!mayBeHandOutNight(dates)) return null;
  const people = await input.people();
  if (!people || people.length === 0) return null;
  const course = await readDrawWeeks(db, { run, group, people, now });
  return slipsTonightOf({ course, people, now });
}

/**
 * THE GUIDE'S CARD ON A WEEK'S PAGE, for each of the reader's own groups on
 * the course: the week after the page's, when it gives something out and
 * tonight is the evening its slips are handed out at this week's session
 * (`guideSlipsOf`). For each group: the group and its run again (the guide's
 * gate hands back named fields, never the documents, so the one session
 * resolver needs them read), and that one week's blocks as the group reads
 * it (two reads). No draw is read. A group whose reads fail draws no card.
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
        const [groupSnap, runSnap, next] = await Promise.all([
          db.collection("courseGroups").doc(groupId).get(),
          db.collection("courseRuns").doc(runId).get(),
          readGroupWeek(db, runId, groupId, pageWeek + 1),
        ]);
        if (!groupSnap.exists || !runSnap.exists || (runSnap.data() ?? {}).destroying === true) return null;
        const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
        if (group.archived || group.runId !== runId) return null;
        const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
        const sessions = resolveSessions(run, group, resolveGroupCalendar(run, group, now).calendar);
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
