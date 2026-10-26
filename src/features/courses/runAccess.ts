import "server-only";

import { cache } from "react";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { getCurrentUser, type SessionUser } from "@/lib/firebase/session";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";

/**
 * The learning space's server-side gate: who is asking, which run, and what
 * they may see of it.
 *
 * `cache()`-wrapped so the `[runId]` layout and the page inside it share ONE
 * set of Firestore reads per request. Next.js layouts cannot pass data to
 * their children, so the page has to ask again; `cache` is what makes asking
 * again free (it is per-request memoisation, not a cross-request cache — there
 * is no staleness window for a role change to slip through).
 *
 * ── WHAT `null` MEANS ───────────────────────────────────────────────────────
 * "There is nothing here for you": no session, Admin SDK unconfigured, or no
 * such run. Callers redirect rather than render, and a missing run is
 * DELIBERATELY indistinguishable from a run you hold no role on — a member
 * guessing run ids learns nothing about which ones exist. When a caller needs
 * to tell "signed out" from "no such run" (the layout does, to choose between
 * /login and /learn) it calls `getSessionUser()` below, which is already
 * memoised by then and costs nothing.
 *
 * A caller with NO role at all still gets a non-null `RunAccess` — every flag
 * false. Deciding what that means is the caller's job, because the answer
 * differs per route (the run home bounces, admissions narrows to its own
 * predicate).
 *
 * ── THIS IS A UI GATE, NOT THE BOUNDARY ─────────────────────────────────────
 * Every courses API route re-derives its own access from the same documents,
 * and firestore.rules gates the one client-direct write. Nothing here is
 * trusted by anything that returns data; it exists so members do not get
 * shown doors that open onto a 403.
 */

export type RunAccess = {
  user: SessionUser;
  run: CourseRunDoc;
  /**
   * The caller's enrolment doc AS STORED — a `withdrawn` or `removed` row
   * still appears here so a caller can say so in copy. The flags below are
   * computed from a LIVE enrolment only (active or completed), so read them
   * rather than re-deriving from this field.
   *
   * `status === "active"` is also the write gate: the courseProgress rules
   * require an active enrolment, so a `completed` run is read-only by
   * construction. Check-off UI keys off that, not off `isEnrolled`.
   *
   * NULL FOR A PLACEMENT PUBLISH HAS NOT TOLD ITS OWNER ABOUT
   * (`placementIsShownTo`): until then the run reads to them exactly as it did
   * before they were placed, which is with no row at all.
   */
  enrolment: CourseEnrolmentDoc | null;
  isAdmin: boolean;
  /** A live LEARNER enrolment on this run. */
  isEnrolled: boolean;
  isFacilitator: boolean;
  isReviewer: boolean;
  isTrackLead: boolean;
  /** May see cohort surfaces: the run home, weeks, progress. */
  canLearn: boolean;
  /**
   * LEFT THE RUN THEMSELVES, after it was theirs to see: their own learner
   * row, withdrawn, shown to them (`placementIsShownTo`: leaving keeps
   * Publish's stamp), on an account that still stands. They are shown one
   * thing here: the page that says they left, and when. Nothing else of the
   * run opens to them: not their marks, notes or reflections, not the
   * reading list, not the group's people, its updates, its sessions or its
   * registers. Somebody staff removed is not this: the run closes to them as
   * it always has.
   */
  hasLeft: boolean;
  /**
   * The run's groups that are not archived, as the gate read them (one
   * equality on `runId`). A page that has to know when a member's own week
   * opens reads their group's calendar from here rather than reading again.
   */
  groups: CourseGroupDoc[];
};

/**
 * `getCurrentUser`, memoised for the request. Exported so a caller that gets
 * `null` from `getRunAccess` can tell "no session" from "no such run" without
 * paying a second session-cookie verify plus users-doc read.
 */
export const getSessionUser = cache(getCurrentUser);

export const getRunAccess = cache(
  async (runId: string): Promise<RunAccess | null> => {
    // Dynamic segments arrive URL-DECODED, so a `%2F` reaches us as a real
    // path separator and `doc()` would throw — a 500 out of a gate whose whole
    // job is to redirect. Reject anything that is not one path segment.
    if (!runId || runId.includes("/") || runId === "." || runId === "..") return null;

    const user = await getSessionUser();
    if (!user) return null;

    const db = getAdminDb();
    if (!db) return null;

    // The enrolment is ADDRESSED, never queried: `courseEnrolmentId` binds
    // (run, uid), so there is no way to spell another member's row.
    //
    // The group query is the third read because group-level facilitation
    // CANNOT be read off the enrolment: the facilitators route deliberately
    // leaves an existing learner enrolment alone (flipping its role would
    // discard the placement and the learner history), so someone who learns on
    // a run and also facilitates a group of it keeps `role: "learner"`. Same
    // shape the overview route uses — one runId equality, filtered in memory,
    // no new index — so the gate and the payload it gates agree on who
    // facilitates.
    const [runSnap, enrolSnap, groupSnap] = await Promise.all([
      db.collection("courseRuns").doc(runId).get(),
      db.collection("courseEnrolments").doc(courseEnrolmentId(runId, user.uid)).get(),
      db.collection("courseGroups").where("runId", "==", runId).limit(50).get(),
    ]);

    if (!runSnap.exists) return null;
    const runRaw = runSnap.data() ?? {};

    // A run mid-DESTROY is refused to EVERYONE, enrolled members and admins
    // alike, and it is refused here so that every surface under
    // /learn/[runId] fails closed at once rather than each one remembering.
    //
    // This is the gate half of the destroy protocol's "unreachable the moment
    // the cascade starts" claim: `archived` (set in the same opening write)
    // takes the run off the discovery surfaces, but discovery is not access —
    // anyone holding the URL still walks in. And what they would walk into is
    // a cohort being emptied out one page at a time: weeks that answer, then
    // don't; a group card whose group has just gone; progress writes landing
    // on rows the next pass deletes. Fused with "no such run" like every other
    // null from this function, so the layout redirects to /learn.
    //
    // ARCHIVED alone is deliberately NOT refused: archive keeps member history
    // readable, which is the whole difference between the two paths.
    if (runRaw.destroying === true) return null;

    const run = normalizeCourseRun(runSnap.id, runRaw);
    const isAdmin = user.role === "admin";

    const stored: CourseEnrolmentDoc | null = enrolSnap.exists
      ? normalizeCourseEnrolment(enrolSnap.id, enrolSnap.data() ?? {})
      : null;
    // A placement nobody has told its owner about is not there for them: the
    // run stays shut and every page under it redirects, as it did before an
    // admin placed them. Publish's email is what opens it.
    const enrolment =
      stored && placementIsShownTo(stored, { isAdmin }) ? stored : null;
    // Withdrawn / removed enrolments lose access the moment they are written,
    // whatever the member's open tab still shows. `completed` keeps reading:
    // a finished cohort is the member's own history, and the overview route
    // serves it on the same terms.
    // ... and so does an account that is no longer on the roster: the row is
    // an authority the allocation and facilitators routes wrote for an
    // approved account, and nothing rewrites it when that stops being true.
    const live =
      enrolment &&
      (enrolment.status === "active" || enrolment.status === "completed") &&
      isNamedWithStanding(user, "courseEnrolments.uid", enrolment.uid)
        ? enrolment
        : null;

    // Archived groups no longer staff anyone — same filter the overview route
    // applies before it resolves its group card.
    const groups = groupSnap.docs
      .map((d) => normalizeCourseGroup(d.id, d.data() ?? {}))
      .filter((g) => !g.archived);
    const facilitatesGroup = groups.some((g) =>
      isNamedWithStanding(user, "courseGroups.facilitatorUids", g.facilitatorUids),
    );

    const isEnrolled = live?.role === "learner";
    const hasLeft = Boolean(
      enrolment &&
        enrolment.role === "learner" &&
        enrolment.status === "withdrawn" &&
        isNamedWithStanding(user, "courseEnrolments.uid", enrolment.uid),
    );
    // Three routes to facilitation, matching the overview route: a facilitator
    // enrolment, named on the run itself, or holding a group. The one
    // deliberate difference is that a `completed` facilitator enrolment still
    // counts here — a finished cohort stays readable (see `enrolment` above),
    // and the overview route serves that same person off their live enrolment
    // anyway, so the breadth opens no door that route would then refuse.
    const isFacilitator =
      live?.role === "facilitator" ||
      isNamedWithStanding(user, "courseRuns.runFacilitatorUids", run.runFacilitatorUids) ||
      facilitatesGroup;
    // Admissions is a SEPARATE LANE from the cohort (locked decision): neither
    // of these grants sight of the learning space, which is why `canLearn`
    // ignores them both.
    const isReviewer = isNamedWithStanding(
      user,
      "courseRuns.admissionsReviewerUids",
      run.admissionsReviewerUids,
    );
    const isTrackLead = isNamedWithStanding(
      user,
      "courseRuns.trackLeadUids",
      run.trackLeadUids,
    );

    return {
      user,
      run,
      enrolment,
      isAdmin,
      isEnrolled,
      isFacilitator,
      isReviewer,
      isTrackLead,
      canLearn: isEnrolled || isFacilitator || isAdmin,
      hasLeft,
      groups,
    };
  },
);

/** The most of a person's own course rows the list of runs they left reads. */
const MAX_OWN_ENROLMENTS = 50;

/**
 * THE RUNS THE CALLER LEFT THEMSELVES, for the card on My programmes that
 * says so. One equality on the caller's own rows; then, for each withdrawn
 * learner row, the gate above, so a run is listed exactly where its own page
 * says the caller left it (`hasLeft`), and never for a seat staff removed, a
 * placement nobody told them about, or a run being destroyed. Empty with no
 * session.
 */
export const getLeftRuns = cache(async (): Promise<RunAccess[]> => {
  const user = await getSessionUser();
  if (!user) return [];
  const db = getAdminDb();
  if (!db) return [];
  const snap = await db
    .collection("courseEnrolments")
    .where("uid", "==", user.uid)
    .limit(MAX_OWN_ENROLMENTS)
    .get();
  const runIds = new Set<string>();
  for (const doc of snap.docs) {
    const row = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
    if (row.uid === user.uid && row.role === "learner" && row.status === "withdrawn" && row.runId) {
      runIds.add(row.runId);
    }
  }
  const accesses = await Promise.all([...runIds].map((runId) => getRunAccess(runId)));
  return accesses.filter((access): access is RunAccess => access !== null && access.hasLeft);
});
