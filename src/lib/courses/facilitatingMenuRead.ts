import "server-only";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { facilitatingRowOf, runCountsForMenu, type FacilitatingGroup } from "./facilitatingMenu";

/**
 * WHICH GROUPS THE MENU'S FACILITATING PART LISTS, read for one person on the
 * server (the rule and the shape: `./facilitatingMenu.ts`).
 *
 * Reads: the person's own groups, by one `array-contains` on their uid (the
 * query `GET /api/messages` already makes for a member or committee
 * account), then each live group's run, by its address, unless the caller
 * has it already: `GET /api/messages` hands on every run the term's read
 * fetched, so a facilitator of a run the term's form names costs no read
 * more. Nothing else: no course, no enrolment, nobody else's account.
 */

type Data = Record<string, unknown>;

/** The query on the person's own groups: the one shape every caller asks. */
export function ownGroupsQuery(db: Firestore, uid: string) {
  return db.collection("courseGroups").where("facilitatorUids", "array-contains", uid);
}

/**
 * The groups this person facilitates that the menu lists, in the order they
 * meet. `groups` is the answer to `ownGroupsQuery` when the caller made it;
 * `runs` holds run documents the caller read already, by id (null for one
 * that is not there).
 */
export async function facilitatingGroupsOf(
  db: Firestore,
  user: SessionUser,
  known: { groups?: readonly QueryDocumentSnapshot[]; runs?: ReadonlyMap<string, Data | null> } = {},
): Promise<FacilitatingGroup[]> {
  const docs = known.groups ?? (await ownGroupsQuery(db, user.uid).get()).docs;
  const live: CourseGroupDoc[] = [];
  for (const doc of docs) {
    const group = normalizeCourseGroup(doc.id, doc.data() ?? {});
    if (group.archived || !isPlainId(group.runId)) continue;
    if (!isNamedWithStanding(user, "courseGroups.facilitatorUids", group.facilitatorUids)) continue;
    live.push(group);
  }
  if (live.length === 0) return [];

  const runs = new Map<string, Data | null>();
  const wanted: string[] = [];
  for (const runId of new Set(live.map((group) => group.runId))) {
    if (known.runs?.has(runId)) runs.set(runId, known.runs.get(runId) ?? null);
    else wanted.push(runId);
  }
  if (wanted.length > 0) {
    const snaps = await db.getAll(...wanted.map((runId) => db.collection("courseRuns").doc(runId)));
    for (const snap of snaps) runs.set(snap.id, snap.exists ? ((snap.data() ?? {}) as Data) : null);
  }

  const rows: { group: CourseGroupDoc; row: FacilitatingGroup }[] = [];
  for (const group of live) {
    const raw = runs.get(group.runId);
    if (!raw) continue;
    const run = normalizeCourseRun(group.runId, raw);
    if (!runCountsForMenu({ status: run.status, archived: run.archived, destroying: raw.destroying === true, courseId: run.courseId })) continue;
    rows.push({ group, row: facilitatingRowOf(group, run) });
  }
  return rows.sort((a, b) => compareGroupsByMeeting(a.group, b.group)).map(({ row }) => row);
}

const isPlainId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200 && !value.includes("/") && value !== "." && value !== "..";
