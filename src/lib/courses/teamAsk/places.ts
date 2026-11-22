import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { listForms } from "@/lib/applications/handover/run";
import { namingProgrammeIn } from "@/lib/courses/programmeLead";
import { standingFacilitators } from "@/lib/courses/registerCover/view";
import { runVisitRefusal } from "@/lib/courses/visit/plan";
import { normalizeCourseEnrolment, placementIsShownTo } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * ONE PERSON'S PLACES THIS TERM, for Ask the team: each live learner's place
 * they hold, with the programme's name, the group's and the group's
 * facilitators'.
 *
 * A PLACE HERE is an active learner's place in a group, on a run that has not
 * ended, been archived or begun to be destroyed (`runVisitRefusal`, the rule a
 * visit and a move ask of a run). For the person themselves, only a place
 * Publish has told them (`placementIsShownTo`, the rule every member page
 * keeps); an admin is shown every place, as the allocation board shows them.
 *
 * READ BY ONE EQUALITY (`courseEnrolments.uid`), then each run and group by
 * id. Names by the names rule for the reader (`standingFacilitators`), only
 * when asked for: the member's own page needs no names.
 */

export type PlaceThisTerm = {
  runId: string;
  /** The programme's short name, or the run's course title. */
  programmeName: string;
  groupName: string;
  /** The group's facilitators with standing, named for the reader; empty unless asked for. */
  facilitatorNames: string[];
};

/** Most places read for one person. */
const MAX_PLACES = 50;

export async function placesThisTermOf(
  db: Firestore,
  uid: string,
  viewer: { isAdmin: boolean; role?: string | null },
  opts: { withFacilitators?: boolean } = {},
): Promise<PlaceThisTerm[]> {
  if (!uid || uid.includes("/")) return [];
  const snap = await db.collection("courseEnrolments").where("uid", "==", uid).limit(MAX_PLACES).get();
  const places = snap.docs
    .map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}))
    .filter(
      (place) =>
        place.uid === uid &&
        place.role === "learner" &&
        place.status === "active" &&
        Boolean(place.groupId) &&
        placementIsShownTo(place, viewer),
    );
  if (places.length === 0) return [];
  const runIds = [...new Set(places.map((place) => place.runId))].filter((id) => id && !id.includes("/"));
  const groupIds = [...new Set(places.map((place) => place.groupId ?? ""))].filter((id) => id && !id.includes("/"));
  const [runSnaps, groupSnaps, forms] = await Promise.all([
    runIds.length ? db.getAll(...runIds.map((id) => db.collection("courseRuns").doc(id))) : Promise.resolve([]),
    groupIds.length ? db.getAll(...groupIds.map((id) => db.collection("courseGroups").doc(id))) : Promise.resolve([]),
    listForms(db),
  ]);
  const runs = new Map(
    runSnaps
      .filter((each) => each.exists && runVisitRefusal(normalizeCourseRun(each.id, each.data() ?? {}), each.data()?.destroying === true) === null)
      .map((each) => [each.id, normalizeCourseRun(each.id, each.data() ?? {})]),
  );
  const groups = new Map(groupSnaps.filter((each) => each.exists).map((each) => [each.id, normalizeCourseGroup(each.id, each.data() ?? {})]));
  const out: PlaceThisTerm[] = [];
  for (const place of places) {
    const run = runs.get(place.runId);
    const group = groups.get(place.groupId ?? "");
    if (!run || !group || group.runId !== run.id) continue;
    const naming = namingProgrammeIn(forms, run.id);
    const facilitators = opts.withFacilitators ? await standingFacilitators(db, group, viewer) : [];
    out.push({
      runId: run.id,
      programmeName: (naming?.shortName ?? "").trim() || run.courseTitle || "",
      groupName: group.name.trim() || "Untitled group",
      facilitatorNames: facilitators.map((each) => each.name),
    });
  }
  return out.sort((a, b) => a.programmeName.localeCompare(b.programmeName) || a.runId.localeCompare(b.runId));
}
