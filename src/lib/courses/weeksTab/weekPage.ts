import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { facilitatorGuidePath, slotKey, slotLabel, type GuideSlot } from "@/lib/courses/facilitatorGuide/model";
import { weeklySlotWords } from "@/lib/courses/facilitatingEmail";
import { groupWeekRef } from "@/lib/courses/groupResolve";
import { dayBeforeWords } from "@/lib/courses/weekBlocks/markdownWrite";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { weekIsReady } from "@/lib/courses/weekReady";
import { normalizeGroupWeek, sessionModeForWeek } from "@/lib/firestore/courseGroups";
import { normalizeCourse, normalizeCourseWeek, type CourseWeekDoc } from "@/lib/firestore/courses";
import type { WeekOwner, WeeksTab, WeeksTabWeek } from "./load";

/**
 * ONE WEEK'S PAGE ON A PROGRAMME'S WEEKS TAB (board pr-weeks, option B),
 * worked out on the server for the programme's lead or an admin, after the
 * tab's gate (`loadProgrammeRun`) has admitted them.
 *
 * What it reads: the run's week (its title, whether it is published, written
 * as blocks and ready, asked of `weekIsReady`), the course's day-before time
 * for the due line, and each of the run's groups that still meet: its name,
 * its weekly time, how it meets that week, and whether it has its own copy of
 * the week. The week's two places in the course's facilitator guide are read
 * by the page itself, behind the guide's own gates (`weekGuideBox`).
 *
 * Nothing about anybody but names reaches the page.
 */

export type WeekGuideSlot = { key: string; label: string; loaded: string | null };

export type WeekPageGroup = {
  id: string;
  name: string;
  /** "Tuesdays at 6pm", or null while it has no day and time. */
  when: string | null;
  /** Its session that week is held online (`sessionModes`). */
  online: boolean;
  /** The group's own copy of the week, or null while it reads the run's. */
  copy: { since: Date | null; blockWeek: boolean } | null;
};

export type WeekPage = {
  week: WeeksTabWeek;
  /** The week's own title, or "". */
  title: string;
  hasPage: boolean;
  published: boolean;
  blockWeek: boolean;
  ready: boolean;
  /** The course's rule for work due the day before, in words ("by the end of the day before"). */
  due: string;
  /** The stored owner, or null for the programme's lead. */
  ownerUid: string | null;
  owners: WeekOwner[];
  /**
   * The facilitator guide box: the week's two places with what is loaded in
   * each, and the week's page of the guide. Null when the caller may not load
   * the guide; `href` alone when they may read it and not load it.
   */
  guide: { slots: WeekGuideSlot[] | null; href: string } | null;
  groups: WeekPageGroup[];
  courseId: string;
};

/** The week's two places in the facilitator guide: its session plan, then its notes. */
function weekSlots(weekNumber: number): GuideSlot[] {
  return [
    { kind: "week", weekNumber, part: "plan" },
    { kind: "week", weekNumber, part: "notes" },
  ];
}

/**
 * The facilitator guide box for one week, from what the page read behind the
 * guide's gates: null when the caller may not read the guide; the week's page
 * of it alone when they may read and not load it; and otherwise the week's two
 * places, each with the title loaded there.
 */
export function weekGuideBox(
  courseId: string,
  weekNumber: number,
  access: { reads: boolean; loads: boolean },
  loadedWeeks: ReadonlyArray<{ weekNumber: number; plan: string | null; notes: string | null }>,
): WeekPage["guide"] {
  if (!access.reads) return null;
  const href = facilitatorGuidePath(courseId, { kind: "week", weekNumber });
  if (!access.loads) return { href, slots: null };
  const loaded = loadedWeeks.find((entry) => entry.weekNumber === weekNumber) ?? null;
  return {
    href,
    slots: weekSlots(weekNumber).map((slot) => ({
      key: slotKey(slot),
      label: slotLabel(slot),
      loaded: slot.kind === "week" ? (loaded?.[slot.part] ?? null) : null,
    })),
  };
}

export async function loadWeekPage(db: Firestore, tab: WeeksTab, week: WeeksTabWeek, guide: WeekPage["guide"]): Promise<WeekPage> {
  const [weekSnap, courseSnap] = await Promise.all([
    db.collection("courseRuns").doc(tab.runId).collection("weeks").doc(week.weekId).get(),
    tab.courseId ? db.collection("courses").doc(tab.courseId).get() : Promise.resolve(null),
  ]);
  const doc: CourseWeekDoc | null = weekSnap.exists ? normalizeCourseWeek(weekSnap.id, weekSnap.data() ?? {}) : null;
  const course = courseSnap?.exists ? normalizeCourse(courseSnap.id, courseSnap.data() ?? {}) : null;

  const copies = await Promise.all(tab.groups.map((group) => groupWeekRef(db, group.id, week.weekId).get()));
  const groups: WeekPageGroup[] = tab.groups.map((group, at) => {
    const copySnap = copies[at];
    const copy = copySnap.exists ? normalizeGroupWeek(copySnap.id, copySnap.data() ?? {}) : null;
    return {
      id: group.id,
      name: group.name.trim() || "Untitled group",
      when: weeklySlotWords(group.session),
      online: sessionModeForWeek(group, week.weekId) === "virtual",
      copy: copy ? { since: copy.forkedAt, blockWeek: isBlockWeek(copy) } : null,
    };
  });

  return {
    week,
    title: doc?.title.trim() ?? "",
    hasPage: doc !== null,
    published: doc?.published === true,
    blockWeek: doc !== null && isBlockWeek(doc),
    ready: weekIsReady(doc),
    due: dayBeforeWords(course?.dayBeforeDueTime ?? null),
    ownerUid: doc?.ownerUid ?? null,
    owners: tab.owners,
    guide,
    groups,
    courseId: tab.courseId,
  };
}
