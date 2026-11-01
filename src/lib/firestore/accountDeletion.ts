import "server-only";
import type { Auth } from "firebase-admin/auth";
import {
  FieldPath,
  FieldValue,
  type Firestore,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from "firebase-admin/firestore";
import { deleteCalendarLink } from "@/lib/courses/calendarLink";
import { deleteKairosChoice } from "@/lib/kairos/choice";
import { deleteRatingsForAccount } from "@/lib/ratings/store";
import { takeCheckInNamesOffForAccount } from "@/lib/events/checkIns";
import { takeNamesOffForAccount } from "@/lib/surveys/namesOff";
import { FACILITATING_COLLECTION } from "@/lib/courses/facilitatorAsks/model";
import { CERTIFICATES_COLLECTION } from "@/lib/courses/certificates/model";
import {
  CERTIFICATE_MARKERS,
  CERTIFICATES_PRESS_KIND,
  CERTIFICATES_TEST_KIND,
} from "@/lib/courses/certificates/markers";
import { FINISHING_COLLECTION } from "@/lib/courses/finishing/model";
import { PITCHES_COLLECTION } from "@/lib/courses/pitching/model";
import { TEAM_ENTRIES_COLLECTION } from "@/lib/courses/teamPage/model";
import { TEAMS_COLLECTION } from "@/lib/courses/teams/model";
import { TEAMS_MARKERS, TEAMS_TEST_KIND } from "@/lib/courses/teams/told";
import { ASSESSMENTS_COLLECTION } from "./admissionAssessments";
import { EXCUSED_IN_ADVANCE } from "./courseAttendance";
import { normalizeCourseEnrolment } from "./courseEnrolments";
import { COURSE_GROUP_NOTES_COLLECTION } from "./courseGroupNotes";
import { COURSE_GROUP_SHARED_NOTES_COLLECTION } from "./courseGroupSharedNotes";
import { COURSE_PACKS_AND_CASES_COLLECTION } from "./coursePacksAndCases";
import { COURSE_WEEK_WORK_COLLECTION } from "./courseWeekWork";
import { COURSE_WORK_LOG_COLLECTION } from "./courseWorkLog";
import { COURSE_FEEDBACK_COLLECTION, COURSE_FEEDBACK_SENDS_COLLECTION } from "./courseFeedback";
import { COURSE_WORK_RATINGS_COLLECTION } from "./courseWorkRatings";
import { COURSE_PREDICTIONS_COLLECTION } from "./coursePredictions";
import { COURSE_PAIRS_COLLECTION } from "./coursePairs";
import {
  COURSE_SESSION_REPORTS_COLLECTION,
  aboutUidsOf,
  answersWithout,
  normalizeReportAnswers,
} from "./courseSessionReports";
import { PLACEMENT_NOTES_COLLECTION } from "@/lib/courses/placementNotes/model";
import { MEMBER_NOTES_COLLECTION } from "@/lib/memberNotes/model";
import { BEST_ANSWERS_COLLECTION, PANGRAM_CHECKS_COLLECTION } from "@/lib/courses/coursework/collections";
import {
  MEMBER_RECORDS_COLLECTION,
  MEMBER_RECORD_APPLICATIONS,
} from "./memberRecords";
import {
  MEMBERSHIPS_COLLECTION,
  MEMBERSHIP_PERIODS_COLLECTION,
  isMembershipTier,
  type MembershipTier,
} from "./memberships";
import {
  MEMBERSHIP_IMPORTS_COLLECTION,
  MEMBERSHIP_IMPORT_ROWS_SUBCOLLECTION,
} from "./membershipImports";
import { REGISTRATIONS_COLLECTION } from "./registrations";
import { deleteEventsForSubscriptions } from "./subscriptions";

export type AccountDeletionSummary = {
  subscriptionsDeleted: number;
  /**
   * Web push subscription rows for this account's devices, one per endpoint
   * (`src/lib/push/store.ts` owns the collection). Deleted rather than
   * retained: the row is a live channel to a device's lock screen, and the
   * tasks this cascade keeps still name the uid, so a survivor would go on
   * buzzing a phone for somebody who no longer has an account here.
   */
  pushSubscriptionsDeleted: number;
  /**
   * The account's calendar link (`calendarLinks/{uid}`, Add to calendar):
   * the secret a calendar app fetches their sessions with. Deleted, so the
   * link answers as one that never was, and a calendar still holding it
   * empties on its next fetch.
   */
  calendarLinkDeleted: boolean;
  /**
   * The account's rows on surveys (`surveyPeople`): who a survey was sent to,
   * the secret in their personal link, whether they answered. Deleted, so a
   * link they were sent opens nothing.
   */
  surveyPeopleDeleted: number;
  /**
   * Survey answers the account sent (`surveyAnswers`), taken off them: the
   * person comes off at once and the answers stay in the totals, as the
   * survey's own box tells them. Counted once per answer.
   */
  surveyAnswersNamesTakenOff: number;
  /**
   * The account's Kairos choice (`kairosChoices/{uid}`): whether its name and
   * programme record may go to Kairos. Deleted, since with the account gone
   * there is nothing of theirs left to share.
   */
  kairosChoiceDeleted: boolean;
  /**
   * Ratings given at a programme's end (`programmeRatings`) that the account
   * gave or was given: what a facilitator, the lead or an admin said about a
   * fellow. Deleted either way, since a rating is only ever about one named
   * person, by one named person.
   */
  programmeRatingsDeleted: number;
  /**
   * The events the account came to (`eventCheckIns`), taken off them: what
   * is left counts that one person came and names nobody, as a year on does.
   */
  eventCheckInsNamesTakenOff: number;
  registrationDeleted: boolean;
  collaboratorDeleted: boolean;
  userDocDeleted: boolean;
  emailVerificationsDeleted: number;
  courseApplicationsDeleted: number;
  courseEnrolmentsDeleted: number;
  courseProgressDeleted: number;
  courseExerciseResponsesDeleted: number;
  /** Scheduler markers naming this uid (deadline reminders, and anything a
   *  later job keys on a person). Deleted rather than kept: the audience row
   *  they suppress a send to is gone in the same cascade, so the marker can
   *  only ever be a dangling reference to a person who no longer exists. */
  schedulerMarkersDeleted: number;
  /**
   * Registers this member was removed FROM, never whole registers deleted.
   * Counts a document once even when it carried both an attendance mark and a
   * participant note about them (both keys go, in one batch).
   */
  courseAttendanceMarksCleared: number;
  /**
   * Pitches in an incubator's pitching week (`coursePitches`) this account was
   * taken off: a pitch only they pitched is deleted, one they pitched with a
   * partner stays the partner's without them, and their name comes off every
   * pitch's list of people who would join it. Counted once per pitch.
   */
  coursePitchesCleared: number;
  /**
   * An incubator's teams (`courseTeams`) this account was taken off: their uid
   * comes off the team's people and off its record of who was told, and the
   * team stays with whoever else is in it. Counted once per team. The markers
   * of tests of the team email they sent themselves go too.
   */
  courseTeamsCleared: number;
  /**
   * What this account saved last on an incubator team's page
   * (`courseTeamEntries`: a week's check-in, a link, the hand-in): their uid
   * comes off each, and the words stay with the team, as a register keeps
   * its marks. Counted once per entry.
   */
  courseTeamEntriesCleared: number;
  /**
   * Who finished (`courseFinishing`): the programme lead's decisions about
   * this account are deleted, and on decisions this account made about other
   * people as a lead or an admin, who made them is cleared and the decision
   * stays. Counted once per document.
   */
  courseFinishingCleared: number;
  /**
   * Asking people to facilitate (`courseFacilitating`): every ask sent to
   * this account, with its answer, is deleted; where this account asked
   * somebody, set a run's training or sent a test of the ask's email, who
   * did it is cleared and the record stays. Counted once per document.
   */
  courseFacilitatingCleared: number;
  /**
   * The notes this account wrote as one of a group's facilitators for the
   * others (`courseGroupNotes`, C30). Deleted: a note is its writer's words,
   * and it goes with their account.
   */
  courseGroupNotesDeleted: number;
  /**
   * The notes this account shared with a group it was in or facilitated
   * (`courseGroupSharedNotes`, C29). Deleted: a note is its writer's words,
   * and it goes with their account.
   */
  courseGroupSharedNotesDeleted: number;
  /**
   * What was chosen for this account when it was placed outside the times it
   * gave (`coursePlacementNotes`): a note written to it, or "Send without a
   * note". Deleted: each record is about this account alone. Claude's drafts
   * of those notes go with the application's assessment document.
   */
  coursePlacementNotesDeleted: number;
  /**
   * What this account had in each week's packs and talks
   * (`coursePacksAndCases`): the pack it picked or was given, the case it was
   * given and its own "Ready for my talk". Deleted: each record is about
   * this account alone.
   */
  coursePacksAndCasesDeleted: number;
  /**
   * Where each of this account's weeks stands (`courseWeekWork`: when it
   * submitted a week, when somebody reopened it) and the log of what it did
   * to its weeks and when (`courseWorkLog`). Deleted: each record is about
   * this account alone.
   */
  courseWeekWorkDeleted: number;
  courseWorkLogDeleted: number;
  /**
   * Feedback (`courseFeedback`): every piece on this account's work, and
   * every piece it wrote on somebody else's, deleted (a piece is shown signed
   * with its writer's name, and the name has gone). Its press of the batch
   * email (`emailedByUid` on a piece, `byUid` on the batch's own record,
   * `courseFeedbackSends`) is cleared from what stays, which is about
   * somebody else's feedback or about the run.
   */
  courseFeedbackDeleted: number;
  courseFeedbackCleared: number;
  /**
   * Ratings for the team (`courseWorkRatings`, privacy v15): every rating of
   * this account's written work, and every rating it gave of somebody
   * else's. Deleted either way, as the policy says ("the notes and ratings
   * about you, the ratings you gave"): a rating is about one named person, by
   * one named person. Counted once per document.
   */
  courseWorkRatingsDeleted: number;
  /**
   * This account's place in each session's pairs (`coursePairs`): which pair
   * it was in and whether it was bringing a laptop. Deleted: each record is
   * about this account alone, and a pair is the people sharing a number, so
   * its partners' records name nothing of it.
   */
  coursePairsDeleted: number;
  /**
   * Certificates this account owned whose link was off (`courseCertificates`):
   * deleted, since only their owner could open them. With them go the
   * markers of tests of the certificate email this account sent itself.
   */
  courseCertificatesDeleted: number;
  /**
   * Certificates this account owned whose link was on: KEPT, as the privacy
   * policy says, for the people the owner gave the link to. Each loses its
   * owner and shows what it was issued with.
   */
  courseCertificatesKept: number;
  /**
   * This account's sealed predictions (`coursePredictions`), on every run:
   * both cards, sealed or not. Deleted: each is about this account alone.
   * The record of each time an admin opened one (`recordOpenings`) is kept,
   * as the log of course actions is: it names this account by an id that no
   * longer resolves, and nothing the card said.
   */
  coursePredictionsDeleted: number;
  /**
   * Session reports (`courseSessionReports`): this account is taken out of
   * every report that picks it (who engaged well and why, who seemed not to
   * have done the readings, who might need a hand and the word about them),
   * and every report it wrote stays with no writer at all, as a register
   * keeps the notes on it. Counted once per document.
   */
  courseSessionReportsCleared: number;
  /** Admission applications (drafts included) written by this account. */
  admissionApplicationsDeleted: number;
  /** Their access-requirements rows, deleted in the SAME batch. See below. */
  admissionApplicationPrivateDeleted: number;
  /**
   * The decision documents kept beside their applications to an application
   * form: what each lead decided about them, the outcome picked if they were
   * pooled, and any exception. Deleted in the SAME batch as the application
   * they are about, at the id the two share. See below.
   */
  admissionDecisionsDeleted: number;
  /**
   * What Claude and Pangram made of their applications, kept at each
   * application's id. Deleted in the SAME batch as the application.
   */
  admissionAssessmentsDeleted: number;
  /** Review rows written ABOUT this account. */
  admissionReviewsDeleted: number;
  /** Review rows written BY this account about other people. */
  admissionReviewsAuthoredDeleted: number;
  /**
   * Rounds this account was taken off: as a reviewer, as the final decider, or
   * as the lead or a reviewer of one of an application form's programmes.
   */
  admissionRoundRolesCleared: number;
  /**
   * Membership rows keyed on this uid, one per period. The PERIODS themselves
   * are not per-user and are never touched here: `membershipPeriods/2026-27`
   * describes a year of the society, not a person.
   */
  membershipsDeleted: number;
  /**
   * Rows on an SU import batch that named this account. The BATCHES survive:
   * a batch is the provenance behind every membership it wrote, and an
   * unmatched row names somebody with no account here, so it is a line from a
   * file the society received rather than a record about a member. See
   * `deleteMembershipImportRows`.
   */
  membershipImportRowsDeleted: number;
  /**
   * Worksheet responses this cascade KEPT, counted through the member's
   * worksheet tasks (one task per recipient, written beside the response). A
   * retention, not a deletion: the answers a member gave, and the staff notes
   * on them, stay. See the retention paragraph below and
   * `countRetainedMemberWork`.
   *
   * A FLOOR RATHER THAN A CENSUS, and the name says "responses" while the
   * count is of tasks for one honest reason: the task is the only handle this
   * file has on a response, and somebody who deletes a worksheet task off the
   * board takes it away without touching the answers. So the number can read
   * low and never high. `countRetainedMemberWork` has the full reasoning.
   */
  worksheetResponsesRetained: number;
  /**
   * Entries on this person's member record (`memberRecords/{uid}/applications`)
   * that the cascade KEPT: one per round they applied to. Also a retention.
   */
  memberRecordApplicationsRetained: number;
  conductFlagDeleted: boolean;
  /**
   * The notes admins kept about this account (`memberNotes`, privacy v13).
   * Deleted: each is about this account alone. A note this account WROTE
   * about somebody else stays with that person, and no longer names its
   * author, because the name is looked up when the note is read.
   */
  memberNotesDeleted: number;
  /**
   * Pangram's readings of this account's coursework (`coursePangramChecks`,
   * privacy v13), one record per run. Deleted: each is about this account
   * alone.
   */
  coursePangramChecksDeleted: number;
  /**
   * Claude's best answers (`courseBestAnswers`, privacy v13) that picked or
   * numbered this account: each is a week of a run, about everybody on it,
   * so it stays, and this account is taken out of it (its picks, its label
   * and its account id). Counted once per document.
   */
  courseBestAnswersCleared: number;
  authDeleted: boolean;
  /** Set when the teardown was not fully clean (a best-effort step failed, or the
   *  Auth account could not be deleted). Routes return 207 when this is present. */
  warning?: string;
};

// ---------------------------------------------------------------------------
// Course cascade helpers
// ---------------------------------------------------------------------------

/**
 * Rows per page for the course deletes. A learner accumulates one
 * `courseProgress` row per check-offable item per run (weeks × materials, so
 * hundreds across a couple of runs) and one `courseExerciseResponses` row per
 * exercise — comfortably past what one `.get()` + 500-write batch should carry,
 * which is why these two are paged rather than read whole.
 */
const COURSE_PAGE_SIZE = 300;

/**
 * Loop ceiling for the paged scans — 60 × 300 rows, far beyond any real
 * account. In `deleteOwnedCourseRows` it is only reachable if pages stop
 * shrinking (a write that reports success without deleting), so hitting it
 * THROWS rather than returning quietly: a silent stop would report a clean
 * teardown over rows that are still there, and the caller's best-effort catch
 * turns the throw into the 207 that keeps the tracker row for a retry.
 */
const COURSE_MAX_PAGES = 60;

/**
 * Rows per page for the admissions sweep, and deliberately NOT
 * `COURSE_PAGE_SIZE`.
 *
 * `deleteAdmissionApplications` commits up to FOUR deletes per row in ONE
 * batch (the application, its `admissionApplicationPrivate` twin, the
 * decision document an application form keeps at the same id, and the
 * assessment Claude and Pangram left there), and that single batch is
 * load-bearing rather than incidental: see that function for why the rows
 * cannot be torn down by separate sweeps. A 300-row page would ask one batch
 * for up to 1,200 writes, past Firestore's 500-write cap, so the page is the
 * cap divided by four. 125 × 4 = 500, and no real account comes near even
 * one page.
 */
const ADMISSION_PAGE_SIZE = 125;

/**
 * Delete every row a member owns in one `uid`-keyed collection, a page at a
 * time. (Named for the course collections it was written for; it is generic,
 * and the scheduler markers and the push subscription rows use it too.)
 *
 * No cursor: the rows are deleted as they are read, so the next query's first
 * page IS the next unprocessed page. That also makes a mid-way failure
 * resumable — a re-run picks up the smaller remainder — which is the property
 * the tracker row's keep-on-failure rule depends on.
 */
async function deleteOwnedCourseRows(
  db: Firestore,
  collection: string,
  uid: string,
  /**
   * The field naming the owner. Defaults to `uid`, which is what every
   * course collection uses. `admissionReviews` is the exception: it names the
   * account twice, once as `applicantUid` and once as `reviewerUid`, and both
   * sweeps are this same function with a different field.
   */
  field: string = "uid",
): Promise<number> {
  let deleted = 0;
  for (let page = 0; page < COURSE_MAX_PAGES; page += 1) {
    const snap = await db
      .collection(collection)
      .where(field, "==", uid)
      .limit(COURSE_PAGE_SIZE)
      .get();
    if (snap.empty) return deleted;
    const batch = db.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
    deleted += snap.size;
    if (snap.size < COURSE_PAGE_SIZE) return deleted;
  }
  throw new Error(`${collection} did not drain after ${COURSE_MAX_PAGES} pages`);
}

/**
 * How much to give each period back, worked out from the membership rows a
 * sweep deleted. Pure, so the arithmetic is testable without a Firestore.
 *
 * Keyed period id then tier, because a member holds at most one row per period
 * but a teardown can cross several periods at several tiers. A row with no
 * readable period id, or a tier the module does not know, is COUNTED NOWHERE:
 * the period's totals only ever moved for a recognised tier on the way in (see
 * the grant route), so moving them for an unrecognised one on the way out
 * would invent a decrement that no increment matches.
 */
export function membershipTotalsGivenBack(
  rows: readonly { periodId?: unknown; tier?: unknown }[],
): Map<string, Partial<Record<MembershipTier, number>>> {
  const back = new Map<string, Partial<Record<MembershipTier, number>>>();
  for (const row of rows) {
    const periodId = typeof row.periodId === "string" ? row.periodId : "";
    if (periodId === "" || !isMembershipTier(row.tier)) continue;
    const tiers = back.get(periodId) ?? {};
    tiers[row.tier] = (tiers[row.tier] ?? 0) + 1;
    back.set(periodId, tiers);
  }
  return back;
}

/**
 * Delete every membership row this account holds, and take each one back off
 * its period's cached per-tier totals.
 *
 * The PERIODS themselves are not swept and must not be:
 * `membershipPeriods/{periodId}` describes a year of the society and outlives
 * every account under it. Its `totals` map, though, is a cache the console
 * renders as a count of people, so leaving it holding rows that no longer
 * exist would have the membership page reporting a number an admin cannot
 * reconcile against anything. The grant route maintains those totals with
 * `increment(+1)` and `increment(-1)`; this is the same arithmetic for a row
 * that leaves without anybody pressing revoke.
 *
 * The deletes go first and the totals follow, one update per period rather
 * than one per row. A totals update that fails is LOGGED and does not fail the
 * teardown: the rows are already gone, which is the part that matters for the
 * person being deleted, and a count that is out by one is not a reason to keep
 * the account's registration row open for a retry.
 */
export async function deleteMembershipsAndAdjustTotals(
  db: Firestore,
  uid: string,
): Promise<number> {
  const deletedRows: { periodId?: unknown; tier?: unknown }[] = [];

  // Same no-cursor paging as `deleteOwnedCourseRows`: the rows are deleted as
  // they are read, so the next query's first page is the next unprocessed one.
  for (let page = 0; page < COURSE_MAX_PAGES; page += 1) {
    const snap = await db
      .collection(MEMBERSHIPS_COLLECTION)
      .where("uid", "==", uid)
      .limit(COURSE_PAGE_SIZE)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const d of snap.docs) {
      const data = d.data() ?? {};
      deletedRows.push({ periodId: data.periodId, tier: data.tier });
      batch.delete(d.ref);
    }
    await batch.commit();
    if (snap.size < COURSE_PAGE_SIZE) break;
    if (page === COURSE_MAX_PAGES - 1) {
      throw new Error(
        `${MEMBERSHIPS_COLLECTION} did not drain after ${COURSE_MAX_PAGES} pages`,
      );
    }
  }

  for (const [periodId, tiers] of membershipTotalsGivenBack(deletedRows)) {
    const update: Record<string, FirebaseFirestore.FieldValue> = {};
    for (const [tier, count] of Object.entries(tiers)) {
      update[`totals.${tier}`] = FieldValue.increment(-count);
    }
    try {
      await db.collection(MEMBERSHIP_PERIODS_COLLECTION).doc(periodId).update(update);
    } catch (err) {
      console.error("[deleteAccount] membership totals adjust failed:", periodId, err);
    }
  }

  return deletedRows.length;
}

/**
 * Delete every SU import ROW that names this account, across every batch.
 *
 * ## What goes and what stays
 *
 * A row carries the name and address the Students' Union had for a person and
 * the uid the match landed on, so a row whose `matchedUid` is this account is
 * a record ABOUT them and goes with them, in the same cascade that deletes
 * the membership it wrote.
 *
 * The BATCH documents stay, and so do rows that were never matched to an
 * account. A batch is the provenance behind every membership row it wrote, and
 * deleting it would leave those memberships claiming a source with nothing
 * behind it. An unmatched row names somebody who has no account here at all,
 * so this deletion is not theirs to trigger: it is a line from a file the
 * society received, kept with the file. The batch's counters are NOT adjusted
 * for the same reason the period totals are: they describe what the file did
 * when it was committed, which is still true.
 *
 * ## Why a collection-group query, and the check that comes with it
 *
 * The rows live in a subcollection under an unbounded number of batches, so
 * addressing them would mean reading every batch first. `rows` is a short and
 * generic collection-group name, so each document is re-checked to be under
 * `membershipImports` before it is deleted: a `rows` subcollection added
 * anywhere else in the future must not be swept by this.
 *
 * A collection group gets NO automatic single-field index, so this query only
 * runs at all because `firestore.indexes.json` declares a COLLECTION_GROUP
 * override on `rows.matchedUid`. That override has to be deployed before the
 * first import writes a row, or the sweep fails FAILED_PRECONDITION.
 */
export async function deleteMembershipImportRows(
  db: Firestore,
  uid: string,
): Promise<number> {
  let deleted = 0;
  let cursor: QueryDocumentSnapshot | null = null;
  let drained = false;
  // Paged on a cursor, NOT on "delete as you read". Most rows on a page are
  // deleted, but the foreign-`rows` guard below can leave some behind, and a
  // re-query from the top would hand back the same survivors forever. A page
  // that is entirely survivors does not end the sweep: the cursor moves on
  // past it.
  for (let page = 0; page < COURSE_MAX_PAGES; page += 1) {
    let query = db
      .collectionGroup(MEMBERSHIP_IMPORT_ROWS_SUBCOLLECTION)
      .where("matchedUid", "==", uid)
      // Equality + `__name__` over a collection group: served by the
      // COLLECTION_GROUP-scoped single-field index on `matchedUid` that
      // `firestore.indexes.json` declares under `fieldOverrides`. Collection
      // groups get no automatic single-field index, so without that override
      // this query fails FAILED_PRECONDITION and no row is ever swept.
      .orderBy(FieldPath.documentId())
      .limit(COURSE_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) {
      drained = true;
      break;
    }
    cursor = snap.docs[snap.docs.length - 1];
    const batch = db.batch();
    let queued = 0;
    for (const doc of snap.docs) {
      if (doc.ref.parent.parent?.parent.id !== MEMBERSHIP_IMPORTS_COLLECTION) continue;
      batch.delete(doc.ref);
      queued += 1;
    }
    if (queued > 0) {
      await batch.commit();
      deleted += queued;
    }
    if (snap.size < COURSE_PAGE_SIZE) {
      drained = true;
      break;
    }
  }
  // Same reason as the sweeps around it: a quiet stop would report success and
  // let the caller move on, leaving rows that still name a deleted person.
  if (!drained) {
    throw new Error(
      `${MEMBERSHIP_IMPORT_ROWS_SUBCOLLECTION} did not drain after ${COURSE_MAX_PAGES} pages`,
    );
  }
  return deleted;
}

/**
 * Take one account off pitching week (`coursePitches`, described in
 * `src/lib/courses/pitching/model.ts`).
 *
 * A pitch names its people in two arrays, `pitcherUids` (one or two people,
 * the first having sent it) and `wouldJoinUids` (the picks), so each is
 * found by a single-field `array-contains`, served by the automatic indexes:
 *
 *  - a pitch only this account pitched is DELETED: its words are theirs;
 *  - a pitch they pitched with a partner stays, the partner's alone, so the
 *    partner keeps the pitch they also wrote;
 *  - every pitch they said they would join loses their name from that list.
 *
 * A person is on one pitch a week and picks a handful, so one batch is
 * plenty; it is written in batches of 400 all the same.
 */
export async function clearCoursePitches(db: Firestore, uid: string): Promise<number> {
  const pitches = db.collection(PITCHES_COLLECTION);
  const [pitched, picked] = await Promise.all([
    pitches.where("pitcherUids", "array-contains", uid).get(),
    pitches.where("wouldJoinUids", "array-contains", uid).get(),
  ]);
  const writes: Array<(batch: ReturnType<Firestore["batch"]>) => void> = [];
  const touched = new Set<string>();
  for (const doc of pitched.docs) {
    touched.add(doc.id);
    const pitchers = (doc.data()?.pitcherUids as unknown[] | undefined) ?? [];
    const others = pitchers.filter((other) => typeof other === "string" && other !== uid);
    if (others.length === 0) {
      writes.push((batch) => batch.delete(doc.ref));
    } else {
      writes.push((batch) =>
        batch.update(doc.ref, { pitcherUids: others, wouldJoinUids: FieldValue.arrayRemove(uid) }),
      );
    }
  }
  for (const doc of picked.docs) {
    if (touched.has(doc.id)) continue;
    touched.add(doc.id);
    writes.push((batch) => batch.update(doc.ref, { wouldJoinUids: FieldValue.arrayRemove(uid) }));
  }
  for (let at = 0; at < writes.length; at += 400) {
    const batch = db.batch();
    for (const write of writes.slice(at, at + 400)) write(batch);
    await batch.commit();
  }
  return touched.size;
}

/**
 * Take one account off an incubator's teams (`courseTeams`, described in
 * `src/lib/courses/teams/model.ts`).
 *
 * A team names its people in `memberUids`, found by a single-field
 * `array-contains` served by the automatic indexes, and what each of them was
 * last told in `toldAs`, whose entries are always its members'. The person
 * comes off both, and the team stays, with whoever else is in it: it is the
 * lead's, not theirs. A test of the team email somebody sent themselves is a
 * marker in `courseNudges` that names them (kind `teams-test`, with `byUid`),
 * found by that one equality and deleted; the other markers there that carry
 * a `byUid` are not this sweep's. Counted once per team.
 */
export async function clearCourseTeams(db: Firestore, uid: string): Promise<number> {
  const [teams, markers] = await Promise.all([
    db.collection(TEAMS_COLLECTION).where("memberUids", "array-contains", uid).get(),
    db.collection(TEAMS_MARKERS).where("byUid", "==", uid).get(),
  ]);
  const writes: Array<(batch: ReturnType<Firestore["batch"]>) => void> = [];
  for (const doc of teams.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const people = Array.isArray(data.memberUids) ? data.memberUids.filter((other) => other !== uid) : [];
    const told = Array.isArray(data.toldAs)
      ? data.toldAs.filter((entry) => !(entry && typeof entry === "object" && (entry as { uid?: unknown }).uid === uid))
      : [];
    writes.push((batch) => batch.update(doc.ref, { memberUids: people, toldAs: told }));
  }
  for (const doc of markers.docs) {
    if ((doc.data() ?? {}).kind !== TEAMS_TEST_KIND) continue;
    writes.push((batch) => batch.delete(doc.ref));
  }
  for (let at = 0; at < writes.length; at += 400) {
    const batch = db.batch();
    for (const write of writes.slice(at, at + 400)) write(batch);
    await batch.commit();
  }
  return teams.docs.length;
}

/**
 * Take one account's name off what it saved on incubator teams' pages
 * (`courseTeamEntries`, described in `src/lib/courses/teamPage/model.ts`).
 *
 * Everything on a team's page is the team's: anybody in the team may change
 * a check-in, remove a link or change the hand-in, so an entry has a last
 * writer and no owner. The entries this account saved last are found by
 * that one equality (`byUid`) and keep their words for the rest of the team,
 * with nobody's name on them; nothing else names the account. Counted once
 * per entry.
 */
export async function clearCourseTeamEntries(db: Firestore, uid: string): Promise<number> {
  const snap = await db.collection(TEAM_ENTRIES_COLLECTION).where("byUid", "==", uid).get();
  for (let at = 0; at < snap.docs.length; at += 400) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(at, at + 400)) batch.update(doc.ref, { byUid: null });
    await batch.commit();
  }
  return snap.docs.length;
}

/**
 * Take one account out of who finished (`courseFinishing`, described in
 * `src/lib/courses/finishing/model.ts`).
 *
 * A decision about a person carries their `uid`, found by that one equality
 * and deleted: it is about them, and nothing else reads it. A decision this
 * account made about somebody else carries it as `byUid`, found by that one
 * equality, and keeps its finished or not with `byUid` cleared: it is about
 * the other person, and their record must not change because whoever pressed
 * the switch has gone. The run's rule names nobody. Counted once per document.
 */
export async function clearCourseFinishing(db: Firestore, uid: string): Promise<number> {
  const rows = db.collection(FINISHING_COLLECTION);
  const [about, made] = await Promise.all([
    rows.where("uid", "==", uid).get(),
    rows.where("byUid", "==", uid).get(),
  ]);
  const writes: Array<(batch: ReturnType<Firestore["batch"]>) => void> = [];
  const touched = new Set<string>();
  for (const doc of about.docs) {
    touched.add(doc.id);
    writes.push((batch) => batch.delete(doc.ref));
  }
  for (const doc of made.docs) {
    if (touched.has(doc.id)) continue;
    touched.add(doc.id);
    writes.push((batch) => batch.update(doc.ref, { byUid: null }));
  }
  for (let at = 0; at < writes.length; at += 400) {
    const batch = db.batch();
    for (const write of writes.slice(at, at + 400)) write(batch);
    await batch.commit();
  }
  return touched.size;
}

/**
 * Take one account out of asking people to facilitate (`courseFacilitating`,
 * described in `src/lib/courses/facilitatorAsks/model.ts`).
 *
 * An ask sent to this account carries their `uid`, found by that one
 * equality and deleted: it is about them, and their answer goes with it. An
 * ask this account sent carries it as `askedByUid`, a run's training as
 * `setByUid`, and a test record as `byUid`: each is found by its one
 * equality and keeps everything but who did it, which is cleared, because it
 * is about somebody else or about the run. Counted once per document.
 */
export async function clearFacilitatorAsks(db: Firestore, uid: string): Promise<number> {
  const rows = db.collection(FACILITATING_COLLECTION);
  const [about, asked, trained, tested] = await Promise.all([
    rows.where("uid", "==", uid).get(),
    rows.where("askedByUid", "==", uid).get(),
    rows.where("setByUid", "==", uid).get(),
    rows.where("byUid", "==", uid).get(),
  ]);
  const writes: Array<(batch: ReturnType<Firestore["batch"]>) => void> = [];
  const touched = new Set<string>();
  for (const doc of about.docs) {
    touched.add(doc.id);
    writes.push((batch) => batch.delete(doc.ref));
  }
  for (const [snap, field] of [
    [asked, "askedByUid"],
    [trained, "setByUid"],
    [tested, "byUid"],
  ] as const) {
    for (const doc of snap.docs) {
      if (touched.has(doc.id)) continue;
      touched.add(doc.id);
      writes.push((batch) => batch.update(doc.ref, { [field]: "" }));
    }
  }
  for (let at = 0; at < writes.length; at += 400) {
    const batch = db.batch();
    for (const write of writes.slice(at, at + 400)) write(batch);
    await batch.commit();
  }
  return touched.size;
}

/**
 * Delete every note this account wrote for the other facilitators of a group
 * (`courseGroupNotes`, C30), on every run, a page at a time. A note is its
 * writer's own words, found by the one equality on `authorUid` and deleted;
 * nobody else's note is touched, whatever group it is on.
 */
export async function deleteCourseGroupNotes(db: Firestore, uid: string): Promise<number> {
  return deleteOwnedCourseRows(db, COURSE_GROUP_NOTES_COLLECTION, uid, "authorUid");
}

/**
 * Delete every note this account shared with a group (`courseGroupSharedNotes`,
 * C29), on every run, a page at a time. A note is its writer's own words,
 * found by the one equality on `authorUid` and deleted; nobody else's note is
 * touched, whatever group it is in.
 */
export async function deleteCourseGroupSharedNotes(db: Firestore, uid: string): Promise<number> {
  return deleteOwnedCourseRows(db, COURSE_GROUP_SHARED_NOTES_COLLECTION, uid, "authorUid");
}

/**
 * Delete every note admins kept about this account (`memberNotes`, privacy
 * v13), a page at a time. Found by the one equality on `uid`, the person a
 * note is about; a note this account wrote about somebody else names it only
 * as `authorUid` and is not touched.
 */
export async function deleteMemberNotes(db: Firestore, uid: string): Promise<number> {
  return deleteOwnedCourseRows(db, MEMBER_NOTES_COLLECTION, uid);
}

/**
 * Take this account out of every week of Claude's best answers that numbered
 * it (`courseBestAnswers`, privacy v13): its picks, its label and its account
 * id, found by the one `array-contains` on `uids`. The rest of each week
 * stays for everybody else on the run; a reason that named this account's
 * label then reads "a fellow" on the screen.
 */
export async function clearBestAnswerPicks(db: Firestore, uid: string): Promise<number> {
  const snap = await db.collection(BEST_ANSWERS_COLLECTION).where("uids", "array-contains", uid).get();
  let cleared = 0;
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const questions = Array.isArray(data.questions) ? (data.questions as Array<Record<string, unknown>>) : [];
    const labels = data.labels && typeof data.labels === "object" ? (data.labels as Record<string, unknown>) : {};
    await doc.ref.update({
      questions: questions.map((question) => ({
        ...question,
        picks: (Array.isArray(question.picks) ? (question.picks as Array<Record<string, unknown>>) : []).filter((pick) => pick.uid !== uid),
      })),
      labels: Object.fromEntries(Object.entries(labels).filter(([, value]) => value !== uid)),
      uids: FieldValue.arrayRemove(uid),
    });
    cleared += 1;
  }
  return cleared;
}

/**
 * Delete what was chosen for this account each time it was placed outside the
 * times it gave (`coursePlacementNotes`), on every run, a page at a time: a
 * note written to it, or "Send without a note". Found by the one equality on
 * `uid`; nobody else's record is touched.
 */
export async function deleteCoursePlacementNotes(db: Firestore, uid: string): Promise<number> {
  return deleteOwnedCourseRows(db, PLACEMENT_NOTES_COLLECTION, uid);
}

/**
 * Delete every record of what this account had in a week's packs and talks
 * (`coursePacksAndCases`), on every run, a page at a time: the pack it picked
 * or was given, the case it was given and its own "Ready for my talk". Found
 * by the one equality on `uid`; nobody else's record is touched.
 */
export async function deleteCoursePacksAndCases(db: Firestore, uid: string): Promise<number> {
  return deleteOwnedCourseRows(db, COURSE_PACKS_AND_CASES_COLLECTION, uid);
}

/**
 * Delete where each of this account's weeks stands (`courseWeekWork`) and its
 * log of what it did to them (`courseWorkLog`), on every run, a page at a
 * time. Found by the one equality on `uid`; nobody else's record is touched:
 * a reopen's row names who reopened it, and is about the person whose week it is.
 */
export async function deleteCourseWeekWork(db: Firestore, uid: string): Promise<{ weeks: number; log: number }> {
  return {
    weeks: await deleteOwnedCourseRows(db, COURSE_WEEK_WORK_COLLECTION, uid),
    log: await deleteOwnedCourseRows(db, COURSE_WORK_LOG_COLLECTION, uid),
  };
}

/**
 * Take one account out of feedback (`courseFeedback` and the batch's own
 * record, `courseFeedbackSends`, described in `courseFeedback.ts`).
 *
 * A piece about this account's work carries its `uid`, and a piece it wrote
 * carries it as `byUid`: each found by its one equality and deleted, the
 * first because it is part of their work, the second because a piece is
 * shown signed with its writer's name. A piece whose email this account's
 * press sent carries it as `emailedByUid`, and a press or a test of the batch
 * carries it as `byUid`: each found by its one equality and kept, with who
 * pressed cleared, because it is about somebody else's feedback or about the
 * run. Counted once per document.
 */
export async function clearCourseFeedback(db: Firestore, uid: string): Promise<{ deleted: number; cleared: number }> {
  const pieces = db.collection(COURSE_FEEDBACK_COLLECTION);
  const [about, wrote, emailed, pressed] = await Promise.all([
    pieces.where("uid", "==", uid).get(),
    pieces.where("byUid", "==", uid).get(),
    pieces.where("emailedByUid", "==", uid).get(),
    db.collection(COURSE_FEEDBACK_SENDS_COLLECTION).where("byUid", "==", uid).get(),
  ]);
  const writes: Array<(batch: ReturnType<Firestore["batch"]>) => void> = [];
  const touched = new Set<string>();
  let deleted = 0;
  let cleared = 0;
  for (const doc of [...about.docs, ...wrote.docs]) {
    if (touched.has(doc.ref.path)) continue;
    touched.add(doc.ref.path);
    deleted += 1;
    writes.push((batch) => batch.delete(doc.ref));
  }
  for (const [snap, field] of [
    [emailed, "emailedByUid"],
    [pressed, "byUid"],
  ] as const) {
    for (const doc of snap.docs) {
      if (touched.has(doc.ref.path)) continue;
      touched.add(doc.ref.path);
      cleared += 1;
      writes.push((batch) => batch.update(doc.ref, { [field]: "" }));
    }
  }
  for (let at = 0; at < writes.length; at += 400) {
    const batch = db.batch();
    for (const write of writes.slice(at, at + 400)) write(batch);
    await batch.commit();
  }
  return { deleted, cleared };
}

/**
 * Delete every rating for the team about this account's written work, and
 * every one it gave (`courseWorkRatings`, privacy v15), on every run, a page
 * at a time: found by the one equality on `uid` (whose work), then by the one
 * on `raterUid` (who rated). Nothing else names an account. Counted once per
 * document: the second sweep runs after the first has deleted what it found.
 */
export async function deleteCourseWorkRatings(db: Firestore, uid: string): Promise<number> {
  const about = await deleteOwnedCourseRows(db, COURSE_WORK_RATINGS_COLLECTION, uid);
  const gave = await deleteOwnedCourseRows(db, COURSE_WORK_RATINGS_COLLECTION, uid, "raterUid");
  return about + gave;
}

/**
 * Delete every record of this account's place in a session's pairs
 * (`coursePairs`), on every run and in every group, a page at a time: which
 * pair it was in and whether it was bringing a laptop. Found by the one
 * equality on `uid`; nobody else's record is touched, and none names it.
 */
export async function deleteCoursePairs(db: Firestore, uid: string): Promise<number> {
  return deleteOwnedCourseRows(db, COURSE_PAIRS_COLLECTION, uid);
}

/**
 * This account's certificates (`courseCertificates`, described in
 * `src/lib/courses/certificates/model.ts`), found by the one equality on
 * `uid`.
 *
 * A certificate whose link is off is deleted: only its owner could open it.
 * One whose link is on stays, because it exists for the people its owner gave
 * the link to: its owner is cleared and its page goes on showing what it was
 * issued with, until somebody asks for it to be withdrawn. The privacy policy
 * says both (Retention). The link decides, read as stored: anything but `true`
 * is off.
 *
 * The markers this account left in `courseNudges` for the certificate send
 * (a test it sent itself, a press it was making), found by the one equality
 * on `byUid` and told apart by their kind, go too; the other markers there
 * that carry a `byUid` are not this sweep's.
 */
export async function clearCourseCertificates(
  db: Firestore,
  uid: string,
): Promise<{ deleted: number; kept: number }> {
  const [owned, markers] = await Promise.all([
    db.collection(CERTIFICATES_COLLECTION).where("uid", "==", uid).get(),
    db.collection(CERTIFICATE_MARKERS).where("byUid", "==", uid).get(),
  ]);
  const writes: Array<(batch: ReturnType<Firestore["batch"]>) => void> = [];
  let deleted = 0;
  let kept = 0;
  for (const doc of owned.docs) {
    if ((doc.data() ?? {}).linkOn === true) {
      kept += 1;
      writes.push((batch) => batch.update(doc.ref, { uid: null, ownerGoneAt: FieldValue.serverTimestamp() }));
    } else {
      deleted += 1;
      writes.push((batch) => batch.delete(doc.ref));
    }
  }
  for (const doc of markers.docs) {
    const kind = (doc.data() ?? {}).kind;
    if (kind !== CERTIFICATES_TEST_KIND && kind !== CERTIFICATES_PRESS_KIND) continue;
    writes.push((batch) => batch.delete(doc.ref));
  }
  for (let at = 0; at < writes.length; at += 400) {
    const batch = db.batch();
    for (const write of writes.slice(at, at + 400)) write(batch);
    await batch.commit();
  }
  return { deleted, kept };
}

/**
 * Delete this account's sealed predictions (`coursePredictions`), on every
 * run, a page at a time: both cards, sealed or not. Found by the one equality
 * on `uid`; nobody else's card is touched, and the record of each time an
 * admin opened one (`recordOpenings`) is left, as the log of course actions
 * is (see `src/lib/firestore/recordOpenings.ts`).
 */
export async function deleteCoursePredictions(db: Firestore, uid: string): Promise<number> {
  return deleteOwnedCourseRows(db, COURSE_PREDICTIONS_COLLECTION, uid);
}

/**
 * Take one account out of every session report (`courseSessionReports`,
 * described in `src/lib/firestore/courseSessionReports.ts`).
 *
 * A report picks people by account. The reports that pick this one are found
 * by the one `array-contains` on `aboutUids`, and its entries come out of
 * each (its line, why it stood out, the word about it): the report stays for
 * the rest of the group. The reports this account WROTE are found by the one
 * equality on `writerUid` and stay for the programme's lead and admins with
 * no writer at all, as a register keeps the notes on it, which record no
 * writer: each moves to an automatic id, because its own id names its writer,
 * and `writerUid` is cleared. Names typed into a report's own words cannot be
 * found, and stay. One transaction per report; counted once per document.
 */
export async function clearSessionReports(db: Firestore, uid: string): Promise<number> {
  const rows = db.collection(COURSE_SESSION_REPORTS_COLLECTION);
  const touched = new Set<string>();
  const about = await rows.where("aboutUids", "array-contains", uid).get();
  for (const doc of about.docs) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      if (!snap.exists) return;
      const answers = answersWithout(normalizeReportAnswers((snap.data() ?? {}).answers), uid);
      tx.update(doc.ref, { answers, aboutUids: aboutUidsOf(answers) });
    });
    touched.add(doc.id);
  }
  const written = await rows.where("writerUid", "==", uid).get();
  for (const doc of written.docs) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      if (!snap.exists) return;
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const answers = answersWithout(normalizeReportAnswers(data.answers), uid);
      tx.create(rows.doc(), { ...data, writerUid: null, answers, aboutUids: aboutUidsOf(answers) });
      tx.delete(doc.ref);
    });
    touched.add(doc.id);
  }
  return touched.size;
}

/**
 * Remove a member from every attendance register on the given runs.
 *
 * A register is SHARED — one doc per (group, week), with the uid as a MAP KEY
 * inside `records` — so this deletes the key with `FieldPath`, never the doc.
 * Deleting the doc would erase the whole group's marks for that session, and a
 * dotted `"records.<uid>"` string would be reinterpreted as a nested path.
 *
 * `records` is not queryable by key, so the scan is per run (bounded by the
 * runs the member was actually enrolled on) and pages on doc id — nothing is
 * deleted here, so unlike `deleteOwnedCourseRows` this one needs a real cursor.
 *
 * `updatedAt` is deliberately untouched: it records when a facilitator last
 * marked the register, and a deletion elsewhere is not a marking.
 */
export async function clearCourseAttendanceMarks(
  db: Firestore,
  runIds: string[],
  uid: string,
): Promise<number> {
  let cleared = 0;
  for (const runId of runIds) {
    let cursor: QueryDocumentSnapshot | null = null;
    let drained = false;
    for (let page = 0; page < COURSE_MAX_PAGES; page += 1) {
      let query = db
        .collection("courseAttendance")
        .where("runId", "==", runId)
        // Equality + `__name__` is served by the automatic single-field index;
        // no composite index is needed for this scan.
        .orderBy(FieldPath.documentId())
        .limit(COURSE_PAGE_SIZE);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      if (snap.empty) break;
      cursor = snap.docs[snap.docs.length - 1];

      // THREE map keys per register, not one. `participantNotes` (V3 W1 PR5)
      // is post-session prose ABOUT this member, written by their facilitator,
      // and it is personal data of exactly the kind an account deletion has to
      // take with it; `excusedInAdvance` is when they told us they could not
      // make the session ("Can't make it"). Every key is cleared by FieldPath
      // on the SAME document, in the same batch, for the same reason
      // `records` always was: the register is shared, so deleting the doc
      // would erase the whole group's session.
      //
      // A register can carry a note without a mark and a mark without a note
      // (a facilitator writes notes for the people they have something to say
      // about), so each key is tested separately and a document qualifies if
      // it holds any of them.
      const holds = (d: QueryDocumentSnapshot, field: string): boolean => {
        const map = (d.data() as Record<string, unknown>)[field];
        // `in` throws on a non-object, and a hand-edited register could carry
        // anything: a malformed map simply has no key to clear.
        return typeof map === "object" && map !== null && uid in map;
      };
      const marked = snap.docs.filter(
        (d) => holds(d, "records") || holds(d, "participantNotes") || holds(d, EXCUSED_IN_ADVANCE),
      );
      if (marked.length > 0) {
        const batch = db.batch();
        for (const d of marked) {
          if (holds(d, "records")) {
            batch.update(d.ref, new FieldPath("records", uid), FieldValue.delete());
          }
          if (holds(d, "participantNotes")) {
            batch.update(
              d.ref,
              new FieldPath("participantNotes", uid),
              FieldValue.delete(),
            );
          }
          if (holds(d, EXCUSED_IN_ADVANCE)) {
            batch.update(d.ref, new FieldPath(EXCUSED_IN_ADVANCE, uid), FieldValue.delete());
          }
        }
        await batch.commit();
        cleared += marked.length;
      }
      if (snap.size < COURSE_PAGE_SIZE) {
        drained = true;
        break;
      }
    }
    // Throw rather than stop quietly, matching deleteOwnedCourseRows: a silent
    // stop would report the sweep as successful, and the caller uses that to
    // decide it may delete the enrolments — the only uid -> runIds index — and
    // then the tracker row. Marks left in a `if false` collection with nothing
    // naming the uid are unreachable.
    if (!drained) {
      throw new Error(`courseAttendance did not drain after ${COURSE_MAX_PAGES} pages`);
    }
  }
  return cleared;
}

/**
 * Delete this account's admission applications AND the two documents that
 * share each one's id, a page at a time: its access-requirements row, and the
 * decision document an application form keeps beside it.
 *
 * ## Why the application and its private row cannot be separate sweeps
 *
 * `admissionApplicationPrivate` holds the answer to "is there anything we
 * should know about access requirements?", which in practice means disability
 * and health information. It deliberately carries NOTHING but that answer
 * (no `uid`, no `roundId`), because the collection's whole design is that no
 * reader can join it by accident. The price of that is that it has no field
 * to query on: the ONLY handle back to a private row is the application id it
 * shares, `${roundId}__${uid}`.
 *
 * So a private sweep that ran after the applications were gone would have
 * nothing left to address, and the rows would sit in an
 * `allow read, write: if false` collection that nothing on the site could
 * name: the most sensitive text in the whole intake, permanently
 * unreachable and undeletable. The `clearCourseAttendanceMarks` ordering
 * lesson in its sharpest form.
 *
 * The answer is not "order them carefully": it is ONE BATCH. Each page
 * deletes the private rows and the applications that name them together, so
 * a failure leaves both, and a retry (re-reading the smaller remainder) is
 * the same operation again.
 *
 * That is also why the page size is `ADMISSION_PAGE_SIZE` (125) and not the
 * 300 the other course sweeps use: up to four deletes per row against
 * Firestore's 500-write batch cap.
 *
 * ## The decision document goes in the same batch, for a different reason
 *
 * An application form (`src/lib/applications/`) keeps a document beside each
 * application, at the application's own id: each lead's decision about this
 * person, the outcome picked for them if they were pooled, and any exception
 * an admin made. It is the committee's judgement about a named applicant, held
 * where no applicant can read it, so it has no business outliving the
 * application it judges.
 *
 * It does carry a `uid`, so unlike the private row it could be swept by a
 * query of its own. It is deleted by address instead, in the application's
 * batch, for two reasons. The pairing is then atomic: there is no failed
 * request after which the application has gone and the judgement about it has
 * not. And it does not rest on what the document says about itself: the one
 * at an application's id is that applicant's, whatever its fields hold.
 *
 * This is one half of a rule the round destroy keeps the other half of:
 * WHATEVER DELETES AN APPLICATION DELETES THE DECISION AT ITS ID IN THE SAME
 * BATCH. `tests/application-decision-lifetime.test.mjs` walks the tree for
 * anything that deletes an application without doing so.
 *
 * ## So does the assessment
 *
 * `admissionAssessments` holds what Claude and Pangram made of the
 * application, at the same id: a reading of it, and the committee's reviews
 * in Claude's words. It is derived from the application and is worth nothing
 * without it, so it leaves in the same batch, read first so the count is
 * honest.
 *
 * ## The counters are deliberately left alone
 *
 * Deleting an application does NOT move `admissionRounds.applicationCounts`.
 * That matches what this function already does for `courseApplications` and
 * `courseRuns.applicationCounts`, and the reason is the same: the counter is
 * moved inside the apply / submit / decide transactions, and an out-of-band
 * decrement here would be a second writer of a number those transactions
 * treat as theirs. Account deletion during a live intake is rare and
 * out-of-band by nature, and the round's recount route is the repair.
 * (Group `memberCount` IS decremented below, because a seat left held blocks
 * a real person from taking it.)
 */
async function deleteAdmissionApplications(
  db: Firestore,
  uid: string,
): Promise<{ applications: number; privateRows: number; decisions: number; assessments: number }> {
  let applications = 0;
  let privateRows = 0;
  let decisions = 0;
  let assessments = 0;
  for (let page = 0; page < COURSE_MAX_PAGES; page += 1) {
    const snap = await db
      .collection("admissionApplications")
      .where("uid", "==", uid)
      .limit(ADMISSION_PAGE_SIZE)
      .get();
    if (snap.empty) return { applications, privateRows, decisions, assessments };

    // Read the private rows before the batch only so the count is HONEST: a
    // `batch.delete` on a missing document succeeds silently, so counting the
    // refs rather than the documents would report rows that never existed.
    const privateRefs = snap.docs.map((d) =>
      db.collection("admissionApplicationPrivate").doc(d.id),
    );
    const livePrivate = (await db.getAll(...privateRefs)).filter((d) => d.exists);

    // The decision documents, the same way and for the same reason: addressed
    // at the id each shares with its application, and read first so the
    // summary counts documents that existed.
    const decisionRefs = snap.docs.map((d) =>
      db.collection("admissionDecisions").doc(d.id),
    );
    const liveDecisions = (await db.getAll(...decisionRefs)).filter((d) => d.exists);

    // The assessments, the same way: addressed at the shared id, read first.
    const assessmentRefs = snap.docs.map((d) =>
      db.collection(ASSESSMENTS_COLLECTION).doc(d.id),
    );
    const liveAssessments = (await db.getAll(...assessmentRefs)).filter((d) => d.exists);

    const batch = db.batch();
    for (const d of livePrivate) batch.delete(d.ref);
    for (const d of liveDecisions) batch.delete(d.ref);
    for (const d of liveAssessments) batch.delete(d.ref);
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();

    applications += snap.size;
    privateRows += livePrivate.length;
    decisions += liveDecisions.length;
    assessments += liveAssessments.length;
    if (snap.size < ADMISSION_PAGE_SIZE) return { applications, privateRows, decisions, assessments };
  }
  throw new Error(
    `admissionApplications did not drain after ${COURSE_MAX_PAGES} pages`,
  );
}

/**
 * Take a deleted account off every admission round that names it: out of
 * `reviewerUids`, out of `finalDeciderUid` where it was the decider, and out
 * of every programme of an application form that names it as its lead or as
 * one of its reviewers.
 *
 * ## Why this is not "tidying"
 *
 * A round outlives the accounts named on it, and until this ran, a deleted
 * reviewer left a uid on the round that nothing could resolve. The roles route
 * refuses a list naming an account that no longer exists, so the section
 * wedged: the admin could not see who the problem was (the picker draws names
 * from the member list, which no longer has them) and could not save a list
 * with them taken off either, because the same save has to clear
 * `users.admissionsReviewer` on everyone it removes and an update to a missing
 * user document rejects the whole batch. Both halves of that are fixed in the
 * route; this is the half that stops the state from arising at all.
 *
 * Both queries are single-field, so no composite index. Rounds are counted in
 * tens, so one batch is enough, and a round appearing in both queries takes
 * one update carrying both fields.
 *
 * ## The programmes of an application form
 *
 * A form names people a second way: each entry in its `programmes` map has a
 * `leadUid` and its own `reviewerUids`, and the round's top-level
 * `reviewerUids` is kept as their union (`src/lib/applications/roles.ts`).
 * Clearing the union alone would leave the account as a programme's lead with
 * nothing saying so anywhere a query can see, and the next save of that
 * programme's roles would put it straight back into the union.
 *
 * A name inside a map cannot be queried for without knowing the map's keys,
 * so every round is read once, projected down to `programmes`, and the names
 * are looked for in what comes back. That finds the account wherever a
 * programme names it, including on a round whose union has drifted and no
 * longer mentions them, which a search of the union alone would miss.
 *
 * Each programme field is addressed by PATH rather than as a dotted string,
 * so a programme id is never read as part of a path. On every round where a
 * programme named them the union is cleared in the same update, whether or
 * not the first query found it there, so the two lists cannot be left
 * disagreeing about somebody who has gone.
 */
export async function clearAdmissionRoundRoles(
  db: Firestore,
  uid: string,
): Promise<number> {
  const rounds = db.collection("admissionRounds");
  const [asReviewer, asDecider, withProgrammes] = await Promise.all([
    rounds.where("reviewerUids", "array-contains", uid).get(),
    rounds.where("finalDeciderUid", "==", uid).get(),
    rounds.select("programmes").get(),
  ]);

  const updates = new Map<string, Record<string, unknown>>();
  for (const doc of asReviewer.docs) {
    updates.set(doc.id, {
      ...(updates.get(doc.id) ?? {}),
      reviewerUids: FieldValue.arrayRemove(uid),
    });
  }
  for (const doc of asDecider.docs) {
    updates.set(doc.id, { ...(updates.get(doc.id) ?? {}), finalDeciderUid: null });
  }

  // Per round, the fields inside single programmes that name this account.
  const programmeEdits = new Map<string, [FieldPath, unknown][]>();
  for (const doc of withProgrammes.docs) {
    const programmes = (doc.data() ?? {}).programmes;
    if (!programmes || typeof programmes !== "object" || Array.isArray(programmes)) continue;
    const edits: [FieldPath, unknown][] = [];
    for (const [programmeId, entry] of Object.entries(programmes as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const programme = entry as Record<string, unknown>;
      if (programme.leadUid === uid) {
        edits.push([new FieldPath("programmes", programmeId, "leadUid"), null]);
      }
      if (Array.isArray(programme.reviewerUids) && programme.reviewerUids.includes(uid)) {
        edits.push([
          new FieldPath("programmes", programmeId, "reviewerUids"),
          FieldValue.arrayRemove(uid),
        ]);
      }
    }
    if (edits.length === 0) continue;
    programmeEdits.set(doc.id, edits);
    updates.set(doc.id, {
      ...(updates.get(doc.id) ?? {}),
      reviewerUids: FieldValue.arrayRemove(uid),
    });
  }
  if (updates.size === 0) return 0;

  const batch = db.batch();
  for (const [roundId, fields] of updates) {
    const ref = rounds.doc(roundId);
    const topLevel = { ...fields, updatedAt: FieldValue.serverTimestamp() };
    const nested = programmeEdits.get(roundId);
    if (!nested) {
      batch.update(ref, topLevel);
      continue;
    }
    // One update for the round, with every field given as a path: the
    // top-level ones and the ones inside its programmes together.
    const [first, ...rest] = [
      ...Object.entries(topLevel).map(
        ([field, value]): [FieldPath, unknown] => [new FieldPath(field), value],
      ),
      ...nested,
    ];
    batch.update(ref, first[0], first[1], ...rest.flat());
  }
  await batch.commit();
  return updates.size;
}

/**
 * Count what this cascade KEEPS: the member's worksheet work, and their member
 * record. Nothing here deletes anything, and nothing here may be made to.
 *
 * ## Why the responses are counted through the tasks
 *
 * A response lives at `circulations/{circulationId}/responses/{uid}`, filed
 * under the act of sending rather than under the person, so there is no
 * uid-keyed query to run: the only handle back to one is a circulation id.
 * Reaching them all by hand would mean listing every circulation the society
 * has ever sent, and reaching them in one query would mean a collection-group
 * index that nothing else here needs.
 *
 * The circulate route writes ONE TASK per recipient beside each response
 * (`src/lib/worksheets/mint.ts`): `source: "worksheet"`, the recipient as the
 * sole completer. Those tasks are retained by the same policy that retains
 * every other task, so the member's worksheet tasks ARE the addressable index
 * of their responses, they outlive this cascade, and the number stays
 * re-derivable long after the summary that reported it was read.
 *
 * THE ONE WAY THAT INDEX DIVERGES, said out loud because a silent
 * under-report is worse than a stated limit: `deleteTask`
 * (`src/features/tasks/taskMutations.ts`) removes a task without touching the
 * response it was minted beside, so a committee member who tidies a worksheet
 * task off the board takes a row off this count while the answers themselves
 * stay exactly where they were. The number is therefore a floor, not a census,
 * and a low count is the safe direction: it never claims data is held that is
 * not.
 *
 * ## What is NOT counted, said out loud
 *
 * Reviews this member wrote as STAFF about other people live at
 * `circulations/{id}/reviews/{theOtherPersonsUid}`: under somebody else's
 * document id, in a subcollection nothing indexes across circulations, with
 * the author recorded only as `updatedByUid` inside it. Counting them needs a
 * collection-group query and therefore a declared collection-group index,
 * which is a schema change and a deploy for one number on a summary. So they
 * are not counted, and this summary does not imply that they were. The reviews
 * written ABOUT this member ride with the response they assess: retained, and
 * inside the responses count above.
 *
 * Both reads are aggregations, so a member with years of worksheets costs two
 * counts rather than pages of documents.
 */
export async function countRetainedMemberWork(
  db: Firestore,
  uid: string,
): Promise<{ worksheetResponses: number; memberRecordApplications: number }> {
  const [tasks, records] = await Promise.all([
    // An equality filter plus an array-contains, with no orderBy. Array
    // filters take part in Firestore's index merging (written down in
    // `tests/firestore-indexes.test.mjs`), so this needs no composite index.
    db
      .collection("tasks")
      .where("completerUids", "array-contains", uid)
      .where("source", "==", "worksheet")
      .count()
      .get(),
    db
      .collection(MEMBER_RECORDS_COLLECTION)
      .doc(uid)
      .collection(MEMBER_RECORD_APPLICATIONS)
      .count()
      .get(),
  ]);
  return {
    worksheetResponses: tasks.data().count,
    memberRecordApplications: records.data().count,
  };
}

/**
 * Cascade-delete an account by uid — the single source of truth for "delete this
 * account," reused by the admin Members delete, the collaborator delete, the
 * admin registrations-tracker delete, and the self-service unfinished-account
 * delete. Centralising this is what fixes the ghost-row bug: every deletion path
 * now tears down the `registrations` tracker doc instead of leaving it dangling.
 *
 * Ordering rationale:
 *  - Subscription ROWS go first and are FATAL on failure — a surviving row would
 *    keep mailing a deleted user. Their append-only event log is best-effort
 *    (the rows are already gone, so a stale audit line is acceptable degradation,
 *    mirroring safeRecordEvent) and must NOT abort the rest of the teardown.
 *    The PUSH subscription rows follow them, as the account's other delivery
 *    channel, but best-effort rather than fatal: step 1c argues why a device
 *    endpoint is not the same kind of survivor as a mailing row.
 *  - COURSE data goes before Auth for the same reason as everything else in the
 *    best-effort block: a failure there must not cost the caller the Auth
 *    deletion. Within it, attendance is cleared BEFORE the enrolments are
 *    deleted — the enrolments are what name the runs to scan — and the enrolment
 *    delete is SKIPPED OUTRIGHT when that sweep fails. Ordering alone is not
 *    enough, because the two steps are separately best-effort: the enrolment
 *    rows are the ONLY uid→runIds index in the data model, and `courseAttendance`
 *    is `allow read, write: if false`, so nothing (client or admin surface) can
 *    scan it for a uid once they are gone. Worse, the retry the 207 asks for
 *    would then read an EMPTY enrolment snapshot, sweep zero runs, report zero
 *    marks cleared WITHOUT failing, and clear the tracker row — a clean-looking
 *    200 over marks that are now unreachable and unnameable. So the dependency
 *    is enforced in code, not merely implied by the order of the two blocks.
 *  - The Auth user is deleted near-LAST so a late failure leaves at worst a
 *    benign Auth orphan, never a half-account with dangling profile docs. If Auth
 *    deletion fails the account survives, so its refresh tokens are revoked
 *    (best-effort) — otherwise a "deleted" account keeps live sessions elsewhere.
 *  - The `registrations` tracker row is deleted ONLY AFTER a FULLY CLEAN teardown
 *    (Auth gone AND no best-effort step failed). If anything was left behind, the
 *    row is intentionally kept so the orphan stays visible in the tracker for a
 *    retry — clearing it would strand untracked residue (e.g. PII-bearing
 *    emailVerifications tokens) invisible to the very tool built to surface it.
 *    A re-run is idempotent (auth/user-not-found counts as success) and clears
 *    the row once the failed step succeeds.
 *
 * SCOPE: deletes registration-stage + identity data — subscriptions (+ their
 * event log), the push subscription rows for this account's devices, the
 * registrations row, the collaborators doc, the users doc, the account's
 * email-verification token docs, and the Auth user. It deliberately
 * does NOT delete a member's substantive content (tasks, comments, attachments,
 * events, RSVPs, bookings), which is retained.
 *
 * COURSE DATA IS THE ONE EXCEPTION, and deliberately so. Every course row is
 * keyed to the uid rather than owned by a doc anyone can still administer:
 * `courseApplications` carries the applicant's EMAIL and a denormalised name,
 * `courseProgress` carries public comments the whole cohort reads,
 * `courseExerciseResponses` carries member-authored text a facilitator queue
 * serves, and `courseAttendance` carries participation marks. With the users
 * doc gone every one of those renders as an anonymous ghost row ("NAISI
 * member") that no admin surface can find or clear — so they go with the
 * account.
 *
 * ADMISSIONS DATA GOES FOR THE SAME REASON, and one part of it goes for a
 * stronger one. `admissionApplications` carries the essays and the email;
 * `admissionReviews` carries other people's written assessments of this
 * person, and this person's written assessments of others;
 * `admissionDecisions` carries what each programme's lead decided about them;
 * `memberConductFlags` carries a free-text allegation. All are keyed to the
 * uid alone. And `admissionApplicationPrivate` holds the access-requirements
 * answer, which will in practice contain disability and health information
 * and which has NO field to query on by design; see
 * `deleteAdmissionApplications` for why that makes it the one row that must
 * die in the same batch as its application rather than in a sweep of its own.
 * The reviewer-authored retention decision is argued at its call site rather
 * than left silent.
 *
 * MIRRORED MY WORK TASKS ARE RETAINED. The week-mirror writes `tasks/{id}` docs
 * (courseTasks.ts) which look like course data but are ordinary task rows — the
 * member is creator and sole completer, `assignees-only`, dismissible like any
 * quick-add. They belong to the tasks collection, which this function leaves
 * alone end to end; carving one `source: "fellowship-reminder"` slice out
 * of it here would leave the member's other tasks behind while breaking the
 * blocks/comments/activity a task carries, and would put this function in the
 * business of deleting content the retention rule above says to keep.
 *
 * THE UNMARKED-REGISTER FOLLOW-UP IS RETAINED TOO, and for a second reason on
 * top of that one. `tasks` carrying `source: "course-register"` name every
 * admin as a completer, so an admin closing their account is named on every
 * card the scheduler has ever raised. They are not that admin's content: the
 * card is the committee's record that a cohort was chased, its subject is a
 * group's register rather than a person, and it carries no PII beyond a uid
 * list. Sweeping them on a completer uid would erase the chase history of
 * every live cohort because one admin left. The uid itself goes stale on the
 * card exactly as it does on any other committee task; the run's own destroy
 * takes these rows in full (courseDeletion.ts, the `registerTasks` stage).
 *
 * WORKSHEET WORK AND THE MEMBER RECORD ARE RETAINED, AND COUNTED. A deleted
 * account's worksheet responses and the staff reviews of them STAY, exactly as
 * its tasks do, and the deletion summary states how many, so the policy can be
 * changed knowingly rather than discovered by somebody hunting for data that
 * has gone. The reasoning is the tasks reasoning with one addition: a response is
 * substantive content the committee holds (the answers to a document the
 * committee sent, and the notes it wrote about them), and it hangs off the
 * circulation rather than off the person, so it is not a ghost row the way an
 * unowned `courseApplications` row is. The member record
 * (`memberRecords/{uid}/applications`: when they applied, what for, the
 * outcome, how they scored, what the reviewers wrote) is kept for the same
 * reason `dataExports` rows are, and it is the rule the whole deletion wave is
 * built around: a destroy never deletes what the committee wants to remember
 * about a person, and neither does an account deletion. Both are COUNTED and
 * neither is touched; `countRetainedMemberWork` has the how, and names the one
 * thing it deliberately does not count.
 */
export async function deleteAccountCascade(
  auth: Auth,
  db: Firestore,
  uid: string,
): Promise<AccountDeletionSummary> {
  const summary: AccountDeletionSummary = {
    subscriptionsDeleted: 0,
    pushSubscriptionsDeleted: 0,
    calendarLinkDeleted: false,
    surveyPeopleDeleted: 0,
    surveyAnswersNamesTakenOff: 0,
    kairosChoiceDeleted: false,
    programmeRatingsDeleted: 0,
    eventCheckInsNamesTakenOff: 0,
    registrationDeleted: false,
    collaboratorDeleted: false,
    userDocDeleted: false,
    emailVerificationsDeleted: 0,
    courseApplicationsDeleted: 0,
    courseEnrolmentsDeleted: 0,
    courseProgressDeleted: 0,
    courseExerciseResponsesDeleted: 0,
    schedulerMarkersDeleted: 0,
    courseAttendanceMarksCleared: 0,
    coursePitchesCleared: 0,
    courseTeamsCleared: 0,
    courseTeamEntriesCleared: 0,
    courseFinishingCleared: 0,
    courseFacilitatingCleared: 0,
    courseGroupNotesDeleted: 0,
    courseGroupSharedNotesDeleted: 0,
    coursePlacementNotesDeleted: 0,
    coursePacksAndCasesDeleted: 0,
    courseWeekWorkDeleted: 0,
    courseWorkLogDeleted: 0,
    courseFeedbackDeleted: 0,
    courseFeedbackCleared: 0,
    courseWorkRatingsDeleted: 0,
    coursePairsDeleted: 0,
    courseCertificatesDeleted: 0,
    courseCertificatesKept: 0,
    coursePredictionsDeleted: 0,
    courseSessionReportsCleared: 0,
    admissionApplicationsDeleted: 0,
    admissionApplicationPrivateDeleted: 0,
    admissionDecisionsDeleted: 0,
    admissionAssessmentsDeleted: 0,
    admissionReviewsDeleted: 0,
    admissionReviewsAuthoredDeleted: 0,
    admissionRoundRolesCleared: 0,
    membershipsDeleted: 0,
    membershipImportRowsDeleted: 0,
    worksheetResponsesRetained: 0,
    memberRecordApplicationsRetained: 0,
    conductFlagDeleted: false,
    memberNotesDeleted: 0,
    coursePangramChecksDeleted: 0,
    courseBestAnswersCleared: 0,
    authDeleted: false,
  };
  // Tracks whether any best-effort step (2-5) failed after attempting, so we can
  // surface it (207) and keep the tracker row for re-cleanup.
  let partialFailure = false;

  // 1. Subscription ROWS (audience=user, audienceId=uid). FATAL on failure —
  //    abort before deleting anything else so we never strand a row that would
  //    keep mailing a deleted user.
  let ownedSubIds: string[] = [];
  try {
    const snap = await db.collection("subscriptions").where("audienceId", "==", uid).get();
    const owned = snap.docs.filter(
      (d) => (d.data() as { audience?: string }).audience === "user",
    );
    if (owned.length > 0) {
      const batch = db.batch();
      for (const d of owned) batch.delete(d.ref);
      await batch.commit();
      summary.subscriptionsDeleted = owned.length;
      ownedSubIds = owned.map((d) => d.id);
    }
  } catch (err) {
    console.error("[deleteAccount] subscription row delete failed:", uid, err);
    throw new Error("Failed to delete the account's subscription rows; nothing else was removed.");
  }

  // 1b. Their append-only event log. BEST-EFFORT: the rows (the mailing source)
  //     are already gone, so a failure here is acceptable degradation and must
  //     not abort the cascade.
  if (ownedSubIds.length > 0) {
    try {
      await deleteEventsForSubscriptions(db, ownedSubIds);
    } catch (err) {
      console.error("[deleteAccount] subscriptionEvents cleanup failed (best-effort):", uid, err);
    }
  }

  // 1c. PUSH subscription rows, the account's other delivery channel: one row
  //     per device endpoint. The collection is owned by `src/lib/push/store.ts`;
  //     the `uid` on a row is whoever last claimed that device (it is rewritten
  //     on every subscribe), so this sweeps the devices still recorded as
  //     theirs and leaves a device that has since changed hands alone.
  //
  //     Deleted rather than left to expire, because the tasks this cascade
  //     RETAINS still name the uid: the task mirror reads the subscriptions for
  //     a uid at send time, so a stranded row is a lock-screen notification for
  //     a person who no longer has an account here.
  //
  //     BEST-EFFORT, unlike step 1, and the difference is bounded survival. A
  //     stranded mailing row keeps mailing until somebody notices; a stranded
  //     push endpoint is pruned by the sender the first time the push service
  //     answers 404/410 (`pruneSubscription`), and the 207 this failure produces
  //     keeps the registration row so the sweep is retried. Aborting the whole
  //     teardown over it would leave the account itself intact, which is worse.
  //
  //     Paged by `deleteOwnedCourseRows` on its default `uid` field: one
  //     equality filter and no orderBy, which Firestore's automatic
  //     single-field index serves, so no composite index is declared for it.
  try {
    summary.pushSubscriptionsDeleted = await deleteOwnedCourseRows(
      db,
      "pushSubscriptions",
      uid,
    );
  } catch (err) {
    console.error("[deleteAccount] pushSubscriptions delete failed:", uid, err);
    partialFailure = true;
  }

  // 1d. The CALENDAR LINK, the account's third channel to a device: the
  //     secret a calendar app fetches their sessions with
  //     (`src/lib/firestore/calendarLinks.ts`), one document at their uid,
  //     deleted by `deleteCalendarLink`.
  //     Deleted, so the link answers as one that never was and a calendar
  //     still holding it empties on its next fetch.
  //
  //     BEST-EFFORT, as the push rows are, and for the same bounded reason: a
  //     link that survives a failure here opens nothing once the account is
  //     gone (the feed asks the account's standing and finds no account), and
  //     the 207 keeps the registration row so the sweep is retried. The error
  //     is logged without its message, which can carry the document it read.
  try {
    summary.calendarLinkDeleted = await deleteCalendarLink(db, uid);
  } catch (err) {
    console.error("[deleteAccount] calendar link delete failed:", uid, (err as { code?: unknown } | null)?.code ?? "unknown");
    partialFailure = true;
  }

  // 1e. SURVEYS. The account's name comes off its survey answers at once and
  //     the answers stay in the totals; its rows on surveys (who a survey was
  //     sent to, the secret in their link, whether they answered) are deleted
  //     (`takeNamesOffForAccount`, `src/lib/surveys/namesOff.ts`). One
  //     equality on `respondent.uid` in each collection. The record of each
  //     time an admin opened this account's answers, and of each time this
  //     account, as an admin, opened somebody's, stays (`recordOpenings`,
  //     kind `survey-answers`), as the record of downloads does: it names the
  //     account by an id that no longer resolves, and nothing the answers said.
  //
  //     BEST-EFFORT, with the 207 keeping the registration row so the sweep
  //     is retried: a failure here leaves a name on answers only admins read,
  //     which the retry takes off.
  try {
    const off = await takeNamesOffForAccount(db, uid);
    summary.surveyPeopleDeleted = off.people;
    summary.surveyAnswersNamesTakenOff = off.answers;
  } catch (err) {
    console.error("[deleteAccount] survey names-off failed:", uid, (err as { code?: unknown } | null)?.code ?? "unknown");
    partialFailure = true;
  }

  // 1f. THE KAIROS CHOICE. Whether the account's name and programme record
  //     may go to Kairos (`kairosChoices/{uid}`, `src/lib/kairos/choice.ts`):
  //     one document at the uid, deleted. BEST-EFFORT like 1e, with the 207
  //     keeping the registration row so the sweep is retried.
  try {
    summary.kairosChoiceDeleted = await deleteKairosChoice(db, uid);
  } catch (err) {
    console.error("[deleteAccount] Kairos choice delete failed:", uid, (err as { code?: unknown } | null)?.code ?? "unknown");
    partialFailure = true;
  }

  // 1g. RATINGS. Every rating given at a programme's end that the account gave
  //     or was given (`programmeRatings`, `src/lib/ratings/store.ts`): one
  //     equality on `raterUid` and one on `ratedUid`, deleted. BEST-EFFORT like
  //     1e, with the 207 keeping the registration row so the sweep is retried.
  try {
    summary.programmeRatingsDeleted = await deleteRatingsForAccount(db, uid);
  } catch (err) {
    console.error("[deleteAccount] ratings delete failed:", uid, (err as { code?: unknown } | null)?.code ?? "unknown");
    partialFailure = true;
  }

  // 1h. CHECK-INS. The account's name comes off every event it came to at
  //     once (`takeCheckInNamesOffForAccount`, `src/lib/events/checkIns.ts`):
  //     the records stay as counts, as they do a year after an event. One
  //     equality on `uid`.
  //
  //     BEST-EFFORT, with the 207 keeping the registration row so the sweep
  //     is retried: a failure here leaves a name only the people who run
  //     check-in see, which the retry takes off.
  try {
    summary.eventCheckInsNamesTakenOff = await takeCheckInNamesOffForAccount(db, uid);
  } catch (err) {
    console.error("[deleteAccount] check-in names-off failed:", uid, (err as { code?: unknown } | null)?.code ?? "unknown");
    partialFailure = true;
  }

  // 2. collaborators doc (id is name-slug__uid, so query the uid field).
  try {
    const snap = await db.collection("collaborators").where("uid", "==", uid).limit(1).get();
    if (!snap.empty) {
      await snap.docs[0].ref.delete();
      summary.collaboratorDeleted = true;
    }
  } catch (err) {
    console.error("[deleteAccount] collaborator delete failed:", uid, err);
    partialFailure = true;
  }

  // 3. users/{uid} doc.
  try {
    const userRef = db.collection("users").doc(uid);
    if ((await userRef.get()).exists) {
      await userRef.delete();
      summary.userDocDeleted = true;
    }
  } catch (err) {
    console.error("[deleteAccount] user doc delete failed:", uid, err);
    partialFailure = true;
  }

  // 4. emailVerifications token docs (login-email + uni-email both carry authUid).
  //    These hold the account's email PII and, for unfinished accounts, an
  //    unverified login-email token a same-email re-registration could match.
  try {
    const snap = await db.collection("emailVerifications").where("authUid", "==", uid).get();
    if (!snap.empty) {
      const batch = db.batch();
      for (const d of snap.docs) batch.delete(d.ref);
      await batch.commit();
      summary.emailVerificationsDeleted = snap.size;
    }
  } catch (err) {
    console.error("[deleteAccount] emailVerifications delete failed:", uid, err);
    partialFailure = true;
  }

  // 5. Course data (see the SCOPE note). Each collection is its own try so one
  //    failure doesn't cost the others, and all of it is BEST-EFFORT: the rows
  //    are content, not a mailing source, and a 207 keeps the tracker row so the
  //    remainder can be re-run.
  //
  //    Read once, up front: these rows name the runs the attendance scan needs
  //    AND the group seats the counter decrement has to release, so 5a and 5b
  //    work off the same snapshot. 5c does not need it and runs regardless.
  let enrolSnap: QuerySnapshot | null = null;
  try {
    enrolSnap = await db.collection("courseEnrolments").where("uid", "==", uid).get();
  } catch (err) {
    console.error("[deleteAccount] courseEnrolments read failed:", uid, err);
    partialFailure = true;
  }

  if (enrolSnap) {
    const enrolments = enrolSnap.docs.map((d) =>
      normalizeCourseEnrolment(d.id, d.data() ?? {}),
    );

    // 5a. Attendance marks — BEFORE the enrolments go, since they are what name
    //     the runs to scan (see the ordering rationale).
    let attendanceSwept = false;
    try {
      const runIds = [...new Set(enrolments.map((e) => e.runId).filter(Boolean))];
      summary.courseAttendanceMarksCleared = await clearCourseAttendanceMarks(
        db,
        runIds,
        uid,
      );
      attendanceSwept = true;
    } catch (err) {
      console.error("[deleteAccount] courseAttendance clear failed:", uid, err);
      partialFailure = true;
    }

    // 5b. Enrolments — ONLY once 5a has actually succeeded. These rows are the
    //     uid→runIds index the attendance sweep runs off, so deleting them after
    //     a failed sweep would strand marks in a collection nothing can scan by
    //     uid AND make the retry report a clean teardown (see the ordering
    //     rationale). Keeping them costs a 207 and a re-run; dropping them is
    //     unrecoverable, so the failed step keeps its own input alive.
    //
    //     The group `memberCount` decrement rides in the SAME batch so the
    //     counter can never drift from the rows it summarises. A seat is held
    //     only by an enrolment that is both active AND grouped — the
    //     allocate/remove routes' definition — so a withdrawn row releases
    //     nothing here; its seat went when it left "active".
    //
    //     The run's `enrolledCount` rides along too, and its condition is
    //     NARROWER: `selfEnrolled` as well as active. That field is moved only
    //     by the open-enrol route, which increments it when somebody takes a
    //     seat themselves and decrements it when they leave. Decrementing it
    //     for an allocated admissions learner, whose row nothing ever counted,
    //     would drive it negative and then wedge the enrol-mode route, which
    //     reads it as "is anybody on this run". Rows the counter never counted
    //     are rows it must not uncount.
    if (!attendanceSwept) {
      console.error(
        "[deleteAccount] courseEnrolments delete SKIPPED — the attendance sweep failed and these rows are the only index back to the runs to re-scan:",
        uid,
      );
    } else {
      try {
        const seats = new Map<string, number>();
        const selfEnrolledByRun = new Map<string, number>();
        for (const e of enrolments) {
          if (e.status !== "active") continue;
          if (e.groupId) {
            seats.set(e.groupId, (seats.get(e.groupId) ?? 0) + 1);
          }
          if (e.selfEnrolled && e.runId) {
            selfEnrolledByRun.set(
              e.runId,
              (selfEnrolledByRun.get(e.runId) ?? 0) + 1,
            );
          }
        }
        // A group doc that has since been deleted would make `batch.update`
        // reject the WHOLE batch and strand the enrolments, so absent groups are
        // skipped rather than assumed. At most one group per run — a trivial read.
        const groupIds = [...seats.keys()];
        const groupDocs = groupIds.length
          ? await db.getAll(...groupIds.map((id) => db.collection("courseGroups").doc(id)))
          : [];
        const liveGroupIds = new Set(groupDocs.filter((d) => d.exists).map((d) => d.id));

        // Same absent-doc rule as the groups above: a run deleted since the
        // enrolment was written must not make `batch.update` reject the whole
        // batch and strand every row in it.
        const runIds = [...selfEnrolledByRun.keys()];
        const runDocs = runIds.length
          ? await db.getAll(...runIds.map((id) => db.collection("courseRuns").doc(id)))
          : [];
        const liveRunIds = new Set(runDocs.filter((d) => d.exists).map((d) => d.id));

        if (enrolSnap.size > 0) {
          const batch = db.batch();
          for (const d of enrolSnap.docs) batch.delete(d.ref);
          for (const [groupId, count] of seats) {
            if (!liveGroupIds.has(groupId)) continue;
            batch.update(db.collection("courseGroups").doc(groupId), {
              memberCount: FieldValue.increment(-count),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          for (const [runId, count] of selfEnrolledByRun) {
            if (!liveRunIds.has(runId)) continue;
            batch.update(db.collection("courseRuns").doc(runId), {
              enrolledCount: FieldValue.increment(-count),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          await batch.commit();
          summary.courseEnrolmentsDeleted = enrolSnap.size;
        }
      } catch (err) {
        console.error("[deleteAccount] courseEnrolments delete failed:", uid, err);
        partialFailure = true;
      }
    }
  }

  // 5c. Applications (email + denormalised name), progress rows (public
  //     comments and private notes), exercise responses (member-authored
  //     answers). All addressed by their own `uid` field, so these run whether
  //     or not the enrolment read above succeeded. The last two are paged — a
  //     learner accrues one row per check-offable item and per exercise, per run.
  //
  //     `schedulerMarkers` rides the same loop: markers store every component
  //     of their id as a field, so the person-keyed families (today the
  //     admissions deadline reminder, `remind__{roundId}__{uid}__{dueAtKey}`)
  //     are addressable by `uid` exactly like the rows above. They are
  //     deleted rather than retained because a marker's only job is to
  //     suppress a send to an audience row this cascade has already removed.
  for (const [collection, key] of [
    ["courseApplications", "courseApplicationsDeleted"],
    ["courseProgress", "courseProgressDeleted"],
    ["courseExerciseResponses", "courseExerciseResponsesDeleted"],
    ["schedulerMarkers", "schedulerMarkersDeleted"],
  ] as const) {
    try {
      summary[key] = await deleteOwnedCourseRows(db, collection, uid);
    } catch (err) {
      console.error(`[deleteAccount] ${collection} delete failed:`, uid, err);
      partialFailure = true;
    }
  }

  // 5c'. PITCHING WEEK. A pitch holds who pitched it and who would join it as
  //      two arrays of uids, so this account is taken off both rather than a
  //      row of its own being deleted (see clearCoursePitches).
  try {
    summary.coursePitchesCleared = await clearCoursePitches(db, uid);
  } catch (err) {
    console.error("[deleteAccount] coursePitches clear failed:", uid, err);
    partialFailure = true;
  }

  // 5c''. TEAMS. A team holds its people, and who of them was told, as uids,
  //      so this account is taken off it rather than a row of its own being
  //      deleted (see clearCourseTeams).
  try {
    summary.courseTeamsCleared = await clearCourseTeams(db, uid);
  } catch (err) {
    console.error("[deleteAccount] courseTeams clear failed:", uid, err);
    partialFailure = true;
  }

  // 5c''+. TEAM PAGES. What this account saved last on a team's page stays
  //      with the team, and their uid comes off it (see clearCourseTeamEntries).
  try {
    summary.courseTeamEntriesCleared = await clearCourseTeamEntries(db, uid);
  } catch (err) {
    console.error("[deleteAccount] courseTeamEntries clear failed:", uid, err);
    partialFailure = true;
  }

  // 5c'''. WHO FINISHED. The lead's decisions about this account go; on the
  //      ones this account made about other people, who made them is cleared
  //      (see clearCourseFinishing).
  try {
    summary.courseFinishingCleared = await clearCourseFinishing(db, uid);
  } catch (err) {
    console.error("[deleteAccount] courseFinishing clear failed:", uid, err);
    partialFailure = true;
  }

  // 5c''''-. ASKED TO FACILITATE. Every ask sent to this account goes, with
  //      its answer; where this account asked, set the training or sent a
  //      test, who did it is cleared (see clearFacilitatorAsks).
  try {
    summary.courseFacilitatingCleared = await clearFacilitatorAsks(db, uid);
  } catch (err) {
    console.error("[deleteAccount] courseFacilitating clear failed:", uid, err);
    partialFailure = true;
  }

  // 5c''''. FACILITATORS' NOTES. The notes this account wrote for the other
  //      facilitators of a group are their own words, addressed by the
  //      writer's uid, and go with the account (see courseGroupNotes.ts).
  try {
    summary.courseGroupNotesDeleted = await deleteCourseGroupNotes(db, uid);
  } catch (err) {
    console.error("[deleteAccount] courseGroupNotes delete failed:", uid, err);
    partialFailure = true;
  }

  // 5c'''''. NOTES SHARED WITH A GROUP. The notes this account shared with a
  //      group it was in, or facilitated, are their own words, addressed by
  //      the writer's uid, and go with the account (see
  //      courseGroupSharedNotes.ts).
  try {
    summary.courseGroupSharedNotesDeleted = await deleteCourseGroupSharedNotes(db, uid);
  } catch (err) {
    console.error("[deleteAccount] courseGroupSharedNotes delete failed:", uid, err);
    partialFailure = true;
  }

  // 5c. NOTES FOR A PLACE OUTSIDE ITS TIMES. What was chosen for this
  //      account when Publish was to tell it a group that meets outside the
  //      times it gave (a note written to it, or none) is about this account
  //      alone, addressed by its uid, and goes with it (see
  //      src/lib/courses/placementNotes/store.ts).
  try {
    summary.coursePlacementNotesDeleted = await deleteCoursePlacementNotes(db, uid);
  } catch (err) {
    console.error("[deleteAccount] coursePlacementNotes delete failed:", uid, err);
    partialFailure = true;
  }

  // 5c. PACKS AND CASES. What this account had in each week's packs and
  //      talks (the pack picked or given, the case given, its own ready
  //      mark) is about this account alone, addressed by its uid, and goes
  //      with it (see coursePacksAndCases.ts).
  try {
    summary.coursePacksAndCasesDeleted = await deleteCoursePacksAndCases(db, uid);
  } catch (err) {
    console.error("[deleteAccount] coursePacksAndCases delete failed:", uid, err);
    partialFailure = true;
  }

  // 5c. THE WEEK YOU SUBMIT. Where each of this account's weeks stands and
  //      the log of what it did to them are about this account alone,
  //      addressed by its uid, and go with it (see courseWeekWork.ts and
  //      courseWorkLog.ts).
  try {
    const removed = await deleteCourseWeekWork(db, uid);
    summary.courseWeekWorkDeleted = removed.weeks;
    summary.courseWorkLogDeleted = removed.log;
  } catch (err) {
    console.error("[deleteAccount] courseWeekWork delete failed:", uid, err);
    partialFailure = true;
  }

  // 5c. FEEDBACK. The feedback on this account's work, and the feedback it
  //      wrote, go with it; its presses of the batch email stay, about
  //      somebody else or the run, without its name (see courseFeedback.ts).
  try {
    const feedback = await clearCourseFeedback(db, uid);
    summary.courseFeedbackDeleted = feedback.deleted;
    summary.courseFeedbackCleared = feedback.cleared;
  } catch (err) {
    console.error("[deleteAccount] courseFeedback delete failed:", uid, err);
    partialFailure = true;
  }

  // 5c. RATINGS FOR THE TEAM. The ratings of this account's written work,
  //      and the ratings it gave, go with it, both found by the one equality
  //      on each field (privacy v15: "the notes and ratings about you, the
  //      ratings you gave"; see courseWorkRatings.ts).
  try {
    summary.courseWorkRatingsDeleted = await deleteCourseWorkRatings(db, uid);
  } catch (err) {
    console.error("[deleteAccount] courseWorkRatings delete failed:", uid, err);
    partialFailure = true;
  }

  // 5c. PAIRS. This account's place in each session's pairs (which pair, and
  //      whether it was bringing a laptop) is about this account alone,
  //      addressed by its uid, and goes with it; a partner's record names
  //      nothing of it (see coursePairs.ts).
  try {
    summary.coursePairsDeleted = await deleteCoursePairs(db, uid);
  } catch (err) {
    console.error("[deleteAccount] coursePairs delete failed:", uid, err);
    partialFailure = true;
  }

  // 5c''''''. CERTIFICATES. One whose link is off goes; one whose link is on
  //      stays without its owner, for the people the owner gave the link to
  //      (see clearCourseCertificates).
  try {
    const certificates = await clearCourseCertificates(db, uid);
    summary.courseCertificatesDeleted = certificates.deleted;
    summary.courseCertificatesKept = certificates.kept;
  } catch (err) {
    console.error("[deleteAccount] courseCertificates clear failed:", uid, err);
    partialFailure = true;
  }

  // 5c. SEALED PREDICTIONS. This account's predictions cards, sealed or not,
  //      are about this account alone, addressed by its uid, and go with it
  //      (see coursePredictions.ts). The record of each time an admin opened
  //      one stays, as the log of course actions does (see recordOpenings.ts).
  try {
    summary.coursePredictionsDeleted = await deleteCoursePredictions(db, uid);
  } catch (err) {
    console.error("[deleteAccount] coursePredictions delete failed:", uid, err);
    partialFailure = true;
  }

  // 5c. SESSION REPORTS. This account comes out of every report that picks
  //      it, found by `aboutUids`; a report it wrote stays with no writer, as
  //      a register keeps the notes on it (see clearSessionReports).
  try {
    summary.courseSessionReportsCleared = await clearSessionReports(db, uid);
  } catch (err) {
    console.error("[deleteAccount] courseSessionReports clear failed:", uid, err);
    partialFailure = true;
  }

  // 5c. NOTES ADMINS KEEP, AND CLAUDE AND PANGRAM ON COURSEWORK (privacy
  //      v13). The notes about this account are about it alone, found by the
  //      one equality on `uid`; a note it WROTE about somebody else is that
  //      person's and stays, no longer naming its author. Pangram's readings
  //      of its coursework are about it alone, one record per run, and go.
  //      Claude's best answers to a week are about everybody on the run, so
  //      they stay without this account in them (its picks, label and id).
  try {
    summary.memberNotesDeleted = await deleteMemberNotes(db, uid);
  } catch (err) {
    console.error("[deleteAccount] memberNotes delete failed:", uid, err);
    partialFailure = true;
  }
  try {
    summary.coursePangramChecksDeleted = await deleteOwnedCourseRows(db, PANGRAM_CHECKS_COLLECTION, uid);
  } catch (err) {
    console.error("[deleteAccount] coursePangramChecks delete failed:", uid, err);
    partialFailure = true;
  }
  try {
    summary.courseBestAnswersCleared = await clearBestAnswerPicks(db, uid);
  } catch (err) {
    console.error("[deleteAccount] courseBestAnswers clear failed:", uid, err);
    partialFailure = true;
  }

  // 5d. ADMISSIONS. Same tier as the course rows above and for the same
  //     reason: every one of these is keyed to the uid rather than owned by
  //     a document somebody can still administer, so with the users doc gone
  //     they are ghost rows no admin surface could find. Each is its own try
  //     so one failure does not cost the others.
  //
  //     The first of them is four collections in one step, on purpose: an
  //     application, its access-requirements row, the decision document and
  //     the assessment kept beside it share one id and leave in one batch. See
  //     `deleteAdmissionApplications`.
  try {
    const { applications, privateRows, decisions, assessments } = await deleteAdmissionApplications(
      db,
      uid,
    );
    summary.admissionApplicationsDeleted = applications;
    summary.admissionApplicationPrivateDeleted = privateRows;
    summary.admissionDecisionsDeleted = decisions;
    summary.admissionAssessmentsDeleted = assessments;
  } catch (err) {
    console.error("[deleteAccount] admissionApplications delete failed:", uid, err);
    partialFailure = true;
  }

  // Review rows ABOUT this account: scores and free-text notes describing a
  // person who no longer has an account. They go with the applications they
  // assess.
  try {
    summary.admissionReviewsDeleted = await deleteOwnedCourseRows(
      db,
      "admissionReviews",
      uid,
      "applicantUid",
    );
  } catch (err) {
    console.error("[deleteAccount] admissionReviews (applicant) failed:", uid, err);
    partialFailure = true;
  }

  // Review rows written BY this account about OTHER people.
  //
  // RETENTION DECISION, stated rather than left to inference: these are
  // DELETED too. The argument for keeping them is that they are somebody
  // else's decision record. The argument that wins is that the row is
  // personal data about the REVIEWER as well as the applicant (it is their
  // named judgement, their free text, and the queue attributes it to them by
  // uid), and that with the reviewer's account gone it attributes itself to
  // an id nothing can resolve. Keeping it would mean an anonymous score of
  // unknown provenance sitting in a decision aggregate, which is worse for
  // the applicant than one fewer review: the coverage filter would count a
  // reviewer who no longer exists as having covered them.
  //
  // Reviews are scored during a round and decided at the end of it, so the
  // realistic case is an account deleted long after the round settled, where
  // the decision has already been made and mailed. A reviewer who deletes
  // their account MID-round leaves an application short of coverage, which
  // the queue's coverage filter surfaces as work to redo: visible, and the
  // right answer.
  try {
    summary.admissionReviewsAuthoredDeleted = await deleteOwnedCourseRows(
      db,
      "admissionReviews",
      uid,
      "reviewerUid",
    );
  } catch (err) {
    console.error("[deleteAccount] admissionReviews (reviewer) failed:", uid, err);
    partialFailure = true;
  }

  // The rounds that NAME this account: its reviewer lists and its final
  // decider. Unlike everything else in this block these are not rows the
  // account owns, they are references to it on documents that outlive it, and
  // a reference nothing can resolve is what wedged the roles section.
  try {
    summary.admissionRoundRolesCleared = await clearAdmissionRoundRoles(db, uid);
  } catch (err) {
    console.error("[deleteAccount] admissionRounds role clear failed:", uid, err);
    partialFailure = true;
  }

  // The conduct flag. Addressed at the uid, so no query and no index. It
  // carries a free-text allegation about a named person, which has no reason
  // to outlive the account it describes.
  try {
    const flagRef = db.collection("memberConductFlags").doc(uid);
    if ((await flagRef.get()).exists) {
      await flagRef.delete();
      summary.conductFlagDeleted = true;
    }
  } catch (err) {
    console.error("[deleteAccount] memberConductFlags delete failed:", uid, err);
    partialFailure = true;
  }

  // 5e. MEMBERSHIP rows: one per period this account was recorded a member for.
  //     Paged on the `uid` field like the course sweeps above, because a long
  //     membership history is several rows rather than one addressed document.
  //
  //     Each row also comes back off its period's cached per-tier totals,
  //     which the console renders as a headcount. The periods themselves are
  //     left alone: they describe a year of the society and outlive every
  //     account under them. See `deleteMembershipsAndAdjustTotals`.
  //
  //     `users.paidMembershipYears` needs no step of its own: the whole user
  //     document goes in step 3.
  try {
    summary.membershipsDeleted = await deleteMembershipsAndAdjustTotals(db, uid);
  } catch (err) {
    console.error("[deleteAccount] memberships delete failed:", uid, err);
    partialFailure = true;
  }

  // 5f. SU IMPORT ROWS naming this account, across every batch. The batches
  //     themselves are provenance and survive, along with rows for people who
  //     never had an account here. See `deleteMembershipImportRows`.
  try {
    summary.membershipImportRowsDeleted = await deleteMembershipImportRows(db, uid);
  } catch (err) {
    console.error("[deleteAccount] membership import rows delete failed:", uid, err);
    partialFailure = true;
  }

  // 5g. THE TWO RETENTION COUNTS. Reads only, and they are the last thing this
  //     function does before Auth precisely so nothing after them can be
  //     mistaken for a sweep of what they counted.
  //
  //     A failure here costs the summary two honest numbers and nothing else,
  //     so it does NOT set `partialFailure`: holding the tracker row open would
  //     resurface the account as an orphan in the registrations tracker over a
  //     count of data that nobody lost, which is the ghost row this function
  //     exists to stop. It DOES earn a sentence in the warning, because the
  //     alternative is a summary reporting zero retained rows, and zero is
  //     exactly what somebody revisiting this retention policy would read as
  //     "there was nothing to keep".
  //
  //     A LOCAL FLAG rather than a write straight to `summary.warning`, and
  //     this is the whole reason the flag exists: a count is a Firestore call
  //     in the same request as every best-effort step above, so it fails for
  //     the same transient causes they do (deadline exceeded, unavailable,
  //     quota) and the two failures arrive together. A warning written here
  //     would then occupy the field the residue sentence needs, the
  //     `partialFailure` block at the end would find it already set and stay
  //     quiet, and the admin would read a note about a missing telemetry number
  //     while the registration row was deliberately kept for a re-run. Both
  //     sentences are composed below instead, residue first.
  let countsUnavailable = false;
  try {
    const kept = await countRetainedMemberWork(db, uid);
    summary.worksheetResponsesRetained = kept.worksheetResponses;
    summary.memberRecordApplicationsRetained = kept.memberRecordApplications;
  } catch (err) {
    console.error("[deleteAccount] retained-work counts failed:", uid, err);
    countsUnavailable = true;
  }

  // 6. Firebase Auth user. Already-gone counts as success.
  try {
    await auth.deleteUser(uid);
    summary.authDeleted = true;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/user-not-found") {
      summary.authDeleted = true;
    } else {
      console.error("[deleteAccount] Auth delete failed:", uid, err);
      summary.warning = "Account data removed, but the Auth account could not be deleted.";
      // The account survives, so its sessions/refresh tokens are still live on
      // every device. Best-effort revoke so a "deleted" account can't keep
      // authenticating elsewhere until a retry actually removes it.
      try {
        await auth.revokeRefreshTokens(uid);
      } catch (revokeErr) {
        console.error("[deleteAccount] revokeRefreshTokens failed:", uid, revokeErr);
      }
    }
  }

  // 7. registrations/{uid} tracker row — ONLY on a fully clean teardown (Auth gone
  //    AND no best-effort step failed). Otherwise keep the row so the orphan stays
  //    surfaced in the tracker; a re-run (idempotent) retries the failed step and
  //    then clears it.
  if (summary.authDeleted && !partialFailure) {
    try {
      await db.collection(REGISTRATIONS_COLLECTION).doc(uid).delete();
      summary.registrationDeleted = true;
    } catch (err) {
      console.error("[deleteAccount] registrations delete failed:", uid, err);
      partialFailure = true;
    }
  }

  // The warning, composed rather than assigned. Three different things can want
  // to say something here (residue left behind, an Auth account that survived,
  // and a retention count that could not be read), they are not mutually
  // exclusive, and only the first two mean "retry this". So each contributes a
  // SENTENCE and the residue one goes first: it is the one that changes what
  // the admin has to do next, and the one that used to be lost whenever
  // anything else had already written to the field.
  const notices: string[] = [];
  if (partialFailure) {
    // A swallowed best-effort failure is still a non-clean delete, so it is
    // surfaced as a warning (which the routes turn into a 207) rather than
    // letting a caller report a clean success.
    notices.push(
      "Some account data couldn't be removed; the registration row was kept so the deletion can be retried.",
    );
  }
  // Set in step 6, and phrased there as its own sentence.
  if (summary.warning) notices.push(summary.warning);
  if (countsUnavailable) {
    notices.push(
      "The counts of the worksheet work and the member record kept with this account could not be read, so both are reported as zero. That is a reporting gap and not a deletion: nothing counted there is ever removed by a deletion.",
    );
  }
  if (notices.length > 0) summary.warning = notices.join(" ");

  return summary;
}
