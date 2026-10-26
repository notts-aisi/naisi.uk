import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { hasBeenTold, isInTerm } from "@/lib/applications/decisions";
import { holdsPlaceOn } from "@/lib/applications/handover/holders";
import { listForms, readRun, runStanding } from "@/lib/applications/handover/run";
import { own } from "@/lib/applications/keys";
import type { ProgrammeKind } from "@/lib/applications/model";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { loadApplication, loadDecision } from "@/lib/applications/staffRepo";
import { firstWeekOf } from "@/lib/courses/groupsGoOut";
import { namingProgrammeIn } from "@/lib/courses/programmeLead";
import { weekIsReady } from "@/lib/courses/weekReady";
import { holdsStanding, isNamedWithStanding } from "@/lib/firebase/eligibility";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";
import type { SessionUser } from "@/lib/firebase/session";
import {
  courseEnrolmentId,
  enrolmentHasLeft,
  normalizeCourseEnrolment,
  placementIsTold,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseWeek, weekDocId } from "@/lib/firestore/courses";

/**
 * WEEK 1'S DOOR FOR SOMEBODY HOLDING A PLACE (Q35 B): may this person open
 * this run's week 1 before their group has been told to them, and if not,
 * why not. THE ONE ANSWER: every page and route that opens anything to
 * somebody holding a place before groups go out asks this function and
 * nothing else (week 1's page and its data, its ticks and reflection boxes,
 * Home's and My programmes' "Week 1 is open", and the course's Start here
 * and Glossary pages, which open to exactly the people week 1 opens to).
 *
 * ## Who it is for
 *
 * Somebody who holds a place on the programme that names this run and has
 * not been told a group on it. That is everybody from decision day until
 * Publish has told them: before the hand-over (their place is on the form
 * alone), after it and before placement (a row on the run's list), and
 * placed but not told (a seat Publish has not emailed). Holding a place is
 * decided by the test the hand-over and Publish already share
 * (`holdsPlaceOn`, `src/lib/applications/handover/holders.ts`), never a
 * second rule, so somebody who gave the place back, or who left (leaving
 * gives it back), holds none. A seat that has left the run shuts the door
 * whatever the form says: somebody who left keeps nothing.
 *
 * Somebody taking part (a seat Publish has told them about), a facilitator
 * of one of the run's groups, and admins come in through the run's own gate
 * (`getRunAccess`'s `canLearn`), which this does not repeat: for them it
 * answers `in-the-run`. A facilitator who also holds a place is the run's
 * facilitator from the moment they are appointed (they see their group at
 * once), and somebody holding a place until then.
 *
 * ## What it opens
 *
 * Week 1 of THIS run, the run their programme names, once week 1 is ready
 * (`weekIsReady`: published and marked ready by the lead), and nothing else
 * of the run: no group, no session, no other week. Due dates and the group
 * wait for Publish.
 *
 * ## What it is not
 *
 * Not read in an admin's view-as session. Whether somebody holds a place is
 * worked out from their application, which is its owner's to read, so while
 * an admin is viewing the site as them the answer is `view-as`, shut, and
 * nothing is fetched: the run reads as it did before Q35, as Home does.
 *
 * ## The answer
 *
 * `open` with the place's facts (for the pages' words), or shut with why.
 * `not-ready` alone carries the place too: the person holds a place and has
 * not been told, so Home still says their group is on its way.
 *
 * Reads, for a person in standing: the forms (or the ones handed in), their
 * application on the form that names the run, the run, their own seat on it,
 * the run's groups (one equality on the run) and the run's week 1; and their
 * decision only once decision day has told them (never one unpublished to
 * them). Nothing of anybody else's.
 */

export type PlaceBeforeGroups = {
  runId: string;
  /** The form and the programme on it that name the run. */
  roundId: string;
  programmeId: string;
  kind: ProgrammeKind;
  /** "AGI Strategy". */
  shortName: string;
  /** The run's planned day groups go out, "YYYY-MM-DD", or null when none is set. */
  groupsGoOutOn: string | null;
  /** The run's first taught week, its first and last day, or null on an undated run. */
  firstWeek: { from: string; to: string } | null;
};

export type WeekOneShut =
  /** An admin viewing the site as this person: nothing is read. */
  | "view-as"
  /** The account does not stand (pending, rejected): it holds no seat on any run. */
  | "no-standing"
  /** No programme, or more than one, names this run. */
  | "no-programme"
  /** The run is gone, being destroyed, archived, over, or not a run a form places people on. */
  | "run-shut"
  /** Their seat on the run has left it, by themselves or taken off. */
  | "left"
  /** They come in through the run's own gate: told their group, or a facilitator of one of its groups. */
  | "in-the-run"
  /** They hold no place on the programme that names the run. */
  | "no-place"
  /** They hold a place and week 1 is not ready (or not published, or not written). */
  | "not-ready";

export type WeekOneDoor =
  | { open: true; place: PlaceBeforeGroups }
  | { open: false; why: "not-ready"; place: PlaceBeforeGroups }
  | { open: false; why: Exclude<WeekOneShut, "not-ready">; place: null };

/** The run's groups read for who facilitates: the run gate's own bound. */
const MAX_GROUPS = 50;

const shut = (why: Exclude<WeekOneShut, "not-ready">): WeekOneDoor => ({ open: false, why, place: null });

/**
 * May `person` open week 1 of `runId` before groups go out, and why not.
 * `forms` is every application form, when the caller has read them already
 * (a page asking about several runs at once); otherwise they are read here.
 */
export async function weekOneDoorFor(
  db: Firestore,
  person: SessionUser,
  runId: string,
  options: { forms?: readonly ApplicationForm[] } = {},
): Promise<WeekOneDoor> {
  if (markerIsLive(await getImpersonator(), person.uid)) return shut("view-as");
  // A place on a run is a seat for an account in standing, as an enrolment is.
  if (!person.uid || !holdsStanding(person, "courseEnrolments.uid")) return shut("no-standing");
  if (!runId || runId.includes("/")) return shut("no-programme");

  const forms = options.forms ?? (await listForms(db));
  const naming = namingProgrammeIn(forms, runId);
  const form = naming ? forms.find((candidate) => candidate.round.id === naming.roundId) : undefined;
  const programme = naming && form ? own(form.programmes, naming.programmeId) : undefined;
  if (!naming || !form || !programme) return shut("no-programme");

  const runRef = db.collection("courseRuns").doc(runId);
  const [runSnap, seatSnap, groupSnap, application, weekSnap] = await Promise.all([
    runRef.get(),
    db.collection("courseEnrolments").doc(courseEnrolmentId(runId, person.uid)).get(),
    db.collection("courseGroups").where("runId", "==", runId).limit(MAX_GROUPS).get(),
    loadApplication(db, form, person.uid),
    runRef.collection("weeks").doc(weekDocId(1)).get(),
  ]);

  // The run the programme names, as the hand-over itself would take it.
  const read = runSnap.exists ? readRun(runSnap.id, runSnap.data()) : null;
  if (!read || !runStanding(read, programme.courseId).ok) return shut("run-shut");
  const run = read.run;

  // Their own seat: one that has left shuts the door; one they have been told
  // about, or a facilitator's, is the run's own gate's.
  const seat = seatSnap.exists ? normalizeCourseEnrolment(seatSnap.id, seatSnap.data() ?? {}) : null;
  if (seat && seat.uid === person.uid) {
    if (enrolmentHasLeft(seat.status)) return shut("left");
    if (placementIsTold(seat)) return shut("in-the-run");
  }
  const facilitates = groupSnap.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .some((group) => !group.archived && isNamedWithStanding(person, "courseGroups.facilitatorUids", group.facilitatorUids));
  if (facilitates) return shut("in-the-run");

  // The one test the hand-over and Publish share. Their decision is read
  // only once decision day has told them, so a decision nobody has
  // published to them is never read here: `holdsPlaceOn` answers no for an
  // application that is not sent, in the term and told, before it looks at one.
  if (!application?.sent || !isInTerm(application) || !hasBeenTold(application)) return shut("no-place");
  const decision = await loadDecision(db, form.round.id, person.uid);
  if (!holdsPlaceOn(form, naming.programmeId, application, decision)) return shut("no-place");

  const place: PlaceBeforeGroups = {
    runId: run.id,
    roundId: form.round.id,
    programmeId: naming.programmeId,
    kind: programme.kind,
    shortName: programme.shortName.trim() || programme.name.trim(),
    groupsGoOutOn: run.groupsGoOutOn,
    firstWeek: firstWeekOf(run),
  };
  const weekOne = weekSnap.exists ? normalizeCourseWeek(weekSnap.id, weekSnap.data() ?? {}) : null;
  if (!weekIsReady(weekOne)) return { open: false, why: "not-ready", place };
  return { open: true, place };
}
