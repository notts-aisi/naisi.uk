import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import { resolveWeekDoc } from "../groupResolve";
import { resolveSessions } from "../sessions";
import { isOpenAt, weekOpening, type OpensAfter } from "../weekOpening";

/**
 * WHO HAS A PREDICTIONS CARD ON A RUN, AND WHEN EACH OF ITS WEEKS OPENS TO
 * THEM: the one gate every predictions route and the week page ask, for the
 * caller's own card and nobody else's.
 *
 * WHO. Somebody taking part: a learner enrolment on this run that is live
 * (active, or finished: the card stays theirs once the programme is over),
 * told its group by Publish, on an account that stands. And (Zach, Mon 26
 * Oct: facilitators are fellows) a facilitator of a live group of the run,
 * as themselves: a facilitator's card is theirs like anybody's, and their
 * co-facilitators never read it, because nobody but its owner and an admin
 * ever does. Somebody who left, was taken off, or holds a seat Publish has
 * not told them about has no card here. Archived groups staff nobody.
 *
 * WHEN A WEEK OPENS TO THEM, for the card. A week opens to the people taking
 * part in a group straight after the group's previous session
 * (`weekOpening`), and only once it is published (the run's week, or their
 * group's own copy of it). The card follows the same clock for EVERYBODY who
 * has one, facilitators included: a facilitator reads every published week
 * early, but their own card opens with their group. Their group is their
 * placement's; a facilitator with no place goes by the group they
 * facilitate, and by whichever of their groups gets there first when they
 * run several. Somebody with no group goes by the run's own calendar, which
 * waits on no session.
 *
 * Reads: the run, the caller's own enrolment (addressed, nobody else's), the
 * run's groups (one equality on the run), and for a week, its document as
 * the caller reads it.
 */

/** The run's groups read for who facilitates: the overview route's own bound. */
const MAX_GROUPS = 50;

export type PredictionsTaker = {
  actor: SessionUser;
  run: CourseRunDoc;
  /** Their own live learner row, when they hold a place. */
  enrolment: CourseEnrolmentDoc | null;
  /** The group whose copy of a week they read: their placement's, else the one group they facilitate. */
  ownGroup: CourseGroupDoc | null;
  /** The groups whose calendars decide when a week opens to them. Empty for somebody with no group. */
  calendarGroups: CourseGroupDoc[];
};

export type TakerAnswer =
  | { ok: true; taker: PredictionsTaker }
  | { ok: false; status: 403 | 404; reason: "no-run" | "not-taking-part" };

/**
 * The caller, as somebody with a card on this run, or why not. A run that
 * is not there, or is being destroyed, is "no-run" whoever asks.
 */
export async function predictionsTakerOf(db: Firestore, actor: SessionUser, runId: string): Promise<TakerAnswer> {
  const [runSnap, enrolSnap, groupSnap] = await Promise.all([
    db.collection("courseRuns").doc(runId).get(),
    db.collection("courseEnrolments").doc(courseEnrolmentId(runId, actor.uid)).get(),
    db.collection("courseGroups").where("runId", "==", runId).limit(MAX_GROUPS).get(),
  ]);
  if (!runSnap.exists || (runSnap.data() ?? {}).destroying === true) return { ok: false, status: 404, reason: "no-run" };
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});

  const row = enrolSnap.exists ? normalizeCourseEnrolment(enrolSnap.id, enrolSnap.data() ?? {}) : null;
  const enrolment =
    row !== null &&
    row.runId === runId &&
    row.role === "learner" &&
    (row.status === "active" || row.status === "completed") &&
    // The enrolment row is an authority written for an approved account, so
    // that account's standing is asked again here.
    isNamedWithStanding(actor, "courseEnrolments.uid", row.uid) &&
    // A placement Publish has not told its owner about opens nothing yet.
    placementIsShownTo(row, { isAdmin: actor.role === "admin" })
      ? row
      : null;

  // Archived groups staff nobody, as everywhere else.
  const liveGroups = groupSnap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => !group.archived);
  const facilitates = liveGroups.filter((group) => isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids));
  if (!enrolment && facilitates.length === 0) return { ok: false, status: 403, reason: "not-taking-part" };

  const placed = enrolment?.groupId ? (liveGroups.find((group) => group.id === enrolment.groupId) ?? null) : null;
  const ownGroup = placed ?? (facilitates.length === 1 ? facilitates[0] : null);
  const calendarGroups = placed ? [placed] : facilitates;
  return { ok: true, taker: { actor, run, enrolment, ownGroup, calendarGroups } };
}

export type WeekOpenTo = {
  /** The week is published, and its session has passed for them. */
  open: boolean;
  /** The session it waits on, while it is shut and has one. */
  after: { dateKey: string; startTimeLocal: string } | null;
};

/** Whether week `weekNumber` has opened to `taker` at `now`, for their card. */
export async function weekOpenTo(db: Firestore, taker: PredictionsTaker, weekNumber: number, now: Date): Promise<WeekOpenTo> {
  const resolved = await resolveWeekDoc(db, taker.run.id, taker.ownGroup?.id ?? null, weekDocId(weekNumber));
  if (!resolved.week?.published) return { open: false, after: null };
  const openings = (taker.calendarGroups.length > 0 ? taker.calendarGroups : [null]).map((group) =>
    weekOpening(resolveSessions(taker.run, group), weekNumber),
  );
  if (openings.some((opening) => isOpenAt(opening, now))) return { open: true, after: null };
  // Shut for every group: it opens after the first of their sessions to end.
  const waits = openings.map((opening) => opening.after).filter((after): after is OpensAfter => after !== null);
  waits.sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
  const first = waits[0] ?? null;
  return { open: false, after: first ? { dateKey: first.dateKey, startTimeLocal: first.startTimeLocal } : null };
}
