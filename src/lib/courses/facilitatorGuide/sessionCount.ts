import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { sanitizeWeekPlan } from "@/lib/firestore/courses";
import type { GuideReader } from "./access";
import { guideWeekCount } from "./model";

/**
 * HOW MANY SESSIONS A COURSE'S PRINTABLES ARE SPLIT INTO, for a reader of
 * its guide: the guide's own week count (`guideWeekCount`), which the admin's
 * place picker offers too: the longest week plan of the course's runs, and
 * never fewer than a week already loaded (`loadedWeeks`, from the guide's
 * index). Nothing about a term is written here, so an incubator or a shorter
 * course gets its own number.
 *
 * Reads the course's runs by one equality on `courseId`, their week plans
 * alone; no query needs a composite index. Takes the gate's proof, so it is
 * asked only once a caller has been let in.
 */
export async function readSessionCount(db: Firestore, reader: GuideReader, loadedWeeks: readonly number[]): Promise<number> {
  const runs = await db.collection("courseRuns").where("courseId", "==", reader.courseId).select("weekPlan").get();
  const runWeeks = runs.docs.map((doc) => sanitizeWeekPlan((doc.data() ?? {}).weekPlan).filter((entry) => entry.kind === "week").length);
  return guideWeekCount(runWeeks, loadedWeeks);
}
