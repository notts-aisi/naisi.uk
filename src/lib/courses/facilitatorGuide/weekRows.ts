import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { listForms } from "@/lib/applications/handover/run";
import { resolveWeekDocs } from "@/lib/courses/groupResolve";
import { namingProgrammeIn, readRunLead } from "@/lib/courses/programmeLead";
import { sanitizeWeekPlan } from "@/lib/firestore/courses";
import type { SessionUser } from "@/lib/firebase/session";
import { ownGroupsOnCourse, type GuideReader } from "./access";
import { guideWeekCount } from "./model";
import type { GuideGroup } from "./nextSession";
import { memberWeekTheme } from "./words";

/**
 * WHAT THE GUIDE'S PAGES SAY ABOUT WHAT IS NOT LOADED YET, for a reader of
 * the guide: the weeks of the course with nothing in it, each with its theme
 * as the reader's group's members read it, and whether a programme's lead
 * stands to load it.
 *
 * Each takes the gate's proof, so it is asked only once a caller has been let
 * in. Nothing here reads the guide's own collection, and nothing is written.
 */

/**
 * The reader's own live groups on the course: what the facilitators' door
 * handed back, at no read of its own; for an admin, whom the gate lets in
 * before it reads any group, the same question asked once (one query of the
 * course's groups and a read of each run they name), so an admin who
 * facilitates is drawn their card too; for a lead who facilitates nothing,
 * none. A read that fails draws no card, never a refusal.
 */
export async function groupsOfReader(db: Firestore, user: SessionUser, reader: GuideReader): Promise<readonly GuideGroup[]> {
  if (reader.as === "facilitator") return reader.groups ?? [];
  if (reader.as === "admin") return ownGroupsOnCourse(db, user, reader.courseId).catch(() => []);
  return [];
}

/** A week of the course with nothing in the guide yet, and its theme as its members read it ("" when unknown). */
export type UnloadedWeek = { weekNumber: number; theme: string };

/**
 * The course's weeks that have nothing in the guide, in order.
 *
 * HOW MANY WEEKS: for a reader handed their own groups, the longest of
 * those groups' own calendars, which the gate already read (no read here);
 * for anybody else, the longest week plan of the course's runs, by one
 * equality on `courseId` with the plans alone (one query), as the printables
 * count their sessions. Never fewer than a week already loaded.
 *
 * THEIR THEMES: each week's title as the members of the reader's group read
 * it, and only while it is open to them. The week is resolved the way their
 * own pages resolve it, by the one overlay every week reader uses
 * (`resolveWeekDocs`: the group's own copy of a week where it has one, else
 * the run's), and a title is taken only from a week that copy has published,
 * since every published week is open to everybody the run is open to and an
 * unpublished one is shut. That reader is two queries, the run's weeks and
 * the group's own copies, asked only when some week is missing and the
 * reader has a group. An admin or a lead who facilitates nothing is given
 * the week's number alone, which costs nothing more.
 */
export async function readUnloadedWeeks(
  db: Firestore,
  reader: GuideReader,
  args: { loadedWeeks: readonly number[]; groups: readonly GuideGroup[]; themeGroup: Pick<GuideGroup, "runId" | "groupId"> | null },
): Promise<UnloadedWeek[]> {
  const { loadedWeeks, groups, themeGroup } = args;
  let runWeeks: number[];
  if (groups.length > 0) {
    runWeeks = groups.map((group) => group.weekCount);
  } else {
    const runs = await db.collection("courseRuns").where("courseId", "==", reader.courseId).select("weekPlan", "destroying").get();
    runWeeks = runs.docs
      .filter((doc) => (doc.data() ?? {}).destroying !== true)
      .map((doc) => sanitizeWeekPlan((doc.data() ?? {}).weekPlan).filter((entry) => entry.kind === "week").length);
  }
  const count = guideWeekCount(runWeeks, loadedWeeks);
  const loaded = new Set(loadedWeeks);
  const missing: number[] = [];
  for (let weekNumber = 1; weekNumber <= count; weekNumber += 1) if (!loaded.has(weekNumber)) missing.push(weekNumber);
  if (missing.length === 0) return [];

  let themes = new Map<number, string>();
  // Only one of the reader's own groups, which the gate read to let them in.
  if (themeGroup && groups.some((group) => group.groupId === themeGroup.groupId && group.runId === themeGroup.runId)) {
    const weeks = await resolveWeekDocs(db, themeGroup.runId, themeGroup.groupId);
    themes = new Map(
      weeks.flatMap(({ week }): [number, string][] => {
        // A title its members read: a week published to them, in the copy they read.
        if (!week.published) return [];
        const theme = memberWeekTheme(week.title, week.weekNumber);
        return theme ? [[week.weekNumber, theme]] : [];
      }),
    );
  }
  return missing.map((weekNumber) => ({ weekNumber, theme: themes.get(weekNumber) ?? "" }));
}

/**
 * Whether a lead stands to load this course's guide: the lead of a programme
 * that names a live run of the course, while they still stand as one, the
 * very people the loader's gate admits besides admins
 * (`facilitatorGuideWriter`). Asked only where a sentence says who loads it.
 *
 * Reads: the course's runs by one equality (whether each is being
 * destroyed, alone), every form once, and each named lead's own account,
 * stopping at the first who stands. A read that fails says nothing of a
 * lead, so the sentence names admins, who can always load it.
 */
export async function aLeadLoadsGuide(db: Firestore, reader: GuideReader): Promise<boolean> {
  try {
    const runs = await db.collection("courseRuns").where("courseId", "==", reader.courseId).select("destroying").get();
    const live = runs.docs.filter((doc) => (doc.data() ?? {}).destroying !== true).map((doc) => doc.id);
    if (live.length === 0) return false;
    const forms = await listForms(db);
    for (const runId of live) {
      const naming = namingProgrammeIn(forms, runId);
      if (naming && (await readRunLead(db, runId, naming))) return true;
    }
    return false;
  } catch {
    return false;
  }
}
