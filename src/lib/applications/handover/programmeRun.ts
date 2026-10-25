import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { namesInWords, weeklySlotWords } from "@/lib/courses/facilitatingEmail";
import { readPitchingWeek } from "@/lib/courses/pitching/week";
import { displayNameOf } from "@/lib/courses/registerAccess";
import type { SessionUser } from "@/lib/firebase/session";
import { compareGroupsByMeeting, normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { opensProgrammeGroups, roleOnProgramme } from "../access";
import { own } from "../keys";
import { isId } from "../normalise";
import { loadForm } from "../repo";
import { RUNS_COLLECTION, readRun } from "./run";

/**
 * THE COURSE RUN A PROGRAMME NAMES, for the tabs of its page that act on it:
 * Groups (who is in which group, who facilitates them) and Attendance (every
 * register of the run).
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`opensProgrammeGroups`), decided
 * from the form's own settings before the run is read. A reviewer is
 * answered `not-yours`, and anybody with no role on the programme as for a
 * programme that is not there.
 *
 * WHAT IS READ: the form, the run its programme names, and whether one of
 * the run's weeks is its pitching week (the Groups tab then offers that
 * week's Pitches). Nothing about anybody: the tabs' own views read the run's
 * people through the course routes, which ask again who the caller is on the
 * run (`runStaffingOf`).
 */

export type ProgrammeRunView = {
  roundId: string;
  programmeId: string;
  /** The programme in a sentence: "AGI Strategy". */
  programmeName: string;
  /** Who is looking. A lead is not offered what only an admin can do (naming the run, the run editor). */
  viewer: "admin" | "lead";
  /** The run the programme names, while it is on the site. */
  run: { id: string; courseId: string } | null;
  /** Why there is no run: none named yet, or the one named is no longer on the site. Null when there is one. */
  blank: "no-run" | "run-gone" | null;
  /** The run's pitching week, when one of its weeks is ticked as one; null otherwise. */
  pitchingWeek: number | null;
};

export type ProgrammeRunOutcome =
  | { status: "ok"; view: ProgrammeRunView }
  /** No form here, no such programme on it, or no role on it. */
  | { status: "none" }
  /** A role on the programme that is neither an admin's nor its lead's. The run was not read. */
  | { status: "not-yours" };

export async function loadProgrammeRun(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
): Promise<ProgrammeRunOutcome> {
  if (!isId(roundId) || !isId(programmeId)) return { status: "none" };
  const form = await loadForm(db, roundId);
  if (!form) return { status: "none" };
  const programme = own(form.programmes, programmeId);
  if (!programme) return { status: "none" };
  const role = roleOnProgramme(actor, form, programmeId);
  if (role === null) return { status: "none" };
  if (!opensProgrammeGroups(role)) return { status: "not-yours" };

  const view: ProgrammeRunView = {
    roundId: form.round.id,
    programmeId: programme.id,
    programmeName: programme.shortName,
    viewer: role === "admin" ? "admin" : "lead",
    run: null,
    blank: "no-run",
    pitchingWeek: null,
  };
  if (programme.runId === null) return { status: "ok", view };
  const snap = await db.collection(RUNS_COLLECTION).doc(programme.runId).get();
  const read = snap.exists ? readRun(snap.id, snap.data()) : null;
  // A run being destroyed is gone already for everybody it served.
  if (!read || read.destroying) return { status: "ok", view: { ...view, blank: "run-gone" } };
  const pitchingWeek = (await readPitchingWeek(db, read.run.id))?.weekNumber ?? null;
  return {
    status: "ok",
    view: { ...view, run: { id: read.run.id, courseId: read.run.courseId }, blank: null, pitchingWeek },
  };
}

/** One group of the run, as a tab heads it: names and its weekly time only. */
export type RunGroupHeading = {
  id: string;
  name: string;
  /** "Tuesdays at 6pm", or null while the group has no day and time. */
  when: string | null;
  /** Who facilitates it, in a sentence ("Rahul and Sofia"), or "" for nobody. */
  facilitators: string;
};

/**
 * The run's groups that still meet, Monday first, as the allocation board
 * orders its columns (`compareGroupsByMeeting`): names, the weekly time and
 * who facilitates. Nobody's address, and nothing about the people in them.
 */
export async function loadRunGroupHeadings(db: Firestore, runId: string): Promise<RunGroupHeading[]> {
  // One equality on one field, so no declared index, as the times picture reads them.
  const snap = await db.collection("courseGroups").where("runId", "==", runId).get();
  const groups = snap.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .filter((group) => !group.archived)
    .sort(compareGroupsByMeeting);
  const uids = [...new Set(groups.flatMap((group) => group.facilitatorUids))];
  const accounts = uids.length ? await db.getAll(...uids.map((uid) => db.collection("users").doc(uid))) : [];
  const nameOf = new Map(accounts.filter((doc) => doc.exists).map((doc) => [doc.id, displayNameOf(doc.data() ?? {})] as const));
  return groups.map((group) => ({
    id: group.id,
    name: group.name.trim() || "Untitled group",
    when: weeklySlotWords(group.session),
    facilitators: namesInWords(group.facilitatorUids.map((uid) => nameOf.get(uid) ?? "NAISI member")),
  }));
}
