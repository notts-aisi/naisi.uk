import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { londonDayLabel } from "@/lib/courses/londonLabels";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import { COURSE_MEMBER_PLACEHOLDER, memberNameOf } from "@/lib/email/courseFacilitatorEmails";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import {
  COURSE_UPDATES_COLLECTION,
  normalizeCourseUpdate,
  type CourseUpdateDoc,
  type CourseUpdateEmail,
  type CourseUpdateTo,
} from "@/lib/firestore/courseUpdates";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { UNNAMED_GROUP, UPDATE_WRITER_GONE } from "./words";

/**
 * WHO READS WHICH UPDATES ON A RUN. The one answer, for the route a member's
 * programme page reads and for the two staff pages that read on the server.
 * Nothing else reads `courseUpdates` (`tests/course-hub-updates-guard.test.mjs`
 * walks the tree for a reader that is not this file).
 *
 *  - EVERY UPDATE: an admin, the run's track leads and the lead of the
 *    programme that names the run. One gate decides it, the one every route a
 *    track lead passes asks (`runStaffingOf`, then `doesTrackLeadWork`).
 *  - A FACILITATOR OF ONE OF THE RUN'S LIVE GROUPS: the updates to everyone,
 *    to the facilitators, and to each group they facilitate. Archiving a group
 *    unstaffs it, as everywhere else on a run.
 *  - SOMEBODY ON THE RUN: the updates to everyone and to their own group,
 *    while their place is live (active, or the run completed) and only once
 *    Publish has told them their group (`placementIsShownTo`). Until then the
 *    run reads to them as it did before they were placed, which is not at
 *    all. Somebody who has left or been removed reads nothing.
 *  - Anybody else, a programme's reviewer included, reads nothing.
 *
 * An update to one group is never shown to another group's people: an update
 * is to one audience, and a reader is shown it only when that audience is one
 * of theirs.
 */

export type UpdateReading = {
  /** Every update on the run. */
  all: boolean;
  /** The updates to everyone on the run. */
  everyone: boolean;
  /** The updates to the facilitators. */
  facilitators: boolean;
  /** The updates to these groups. */
  groupIds: ReadonlySet<string>;
};

export const READS_NOTHING: UpdateReading = {
  all: false,
  everyone: false,
  facilitators: false,
  groupIds: new Set(),
};

export function readsAny(reading: UpdateReading): boolean {
  return reading.all || reading.everyone || reading.facilitators || reading.groupIds.size > 0;
}

/** Whether this reader is shown this update. */
export function readsUpdate(reading: UpdateReading, update: Pick<CourseUpdateDoc, "to" | "groupId">): boolean {
  if (reading.all) return true;
  if (update.to === "everyone") return reading.everyone;
  if (update.to === "facilitators") return reading.facilitators;
  return update.groupId !== null && reading.groupIds.has(update.groupId);
}

/**
 * What a reader is shown on ONE GROUP'S PAGE: of what they read, the updates
 * to everyone, to the facilitators and to that group, and never another
 * group's, even one they also facilitate or, as an admin, read anyway.
 */
export function narrowToGroup(reading: UpdateReading, groupId: string): UpdateReading {
  return {
    all: false,
    everyone: reading.all || reading.everyone,
    facilitators: reading.all || reading.facilitators,
    groupIds: reading.all || reading.groupIds.has(groupId) ? new Set([groupId]) : new Set(),
  };
}

/**
 * Every group of the run, archived ones included, as stored. One equality on
 * one field, so no declared index.
 */
export async function loadRunGroups(db: Firestore, runId: string): Promise<CourseGroupDoc[]> {
  const snap = await db.collection("courseGroups").where("runId", "==", runId).get();
  return snap.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .filter((group) => group.runId === runId);
}

/**
 * What the caller reads on this run, worked out from their live session.
 * `groups` is every group of the run (`loadRunGroups`).
 */
export async function updateReadingOf(
  db: Firestore,
  actor: SessionUser,
  run: CourseRunDoc,
  groups: readonly CourseGroupDoc[],
): Promise<UpdateReading> {
  const staffing = await runStaffingOf(db, actor, run);
  if (doesTrackLeadWork(staffing)) {
    return { all: true, everyone: true, facilitators: true, groupIds: new Set() };
  }

  const groupIds = new Set<string>();
  let everyone = false;
  let facilitators = false;
  for (const group of groups) {
    if (group.runId !== run.id || group.archived) continue;
    if (isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids)) {
      groupIds.add(group.id);
      everyone = true;
      facilitators = true;
    }
  }

  // The caller's own place, ADDRESSED and never queried: there is no way to
  // spell somebody else's row.
  const isAdmin = actor.role === "admin";
  const own = await db.collection("courseEnrolments").doc(courseEnrolmentId(run.id, actor.uid)).get();
  if (own.exists) {
    const enrolment = normalizeCourseEnrolment(own.id, own.data() ?? {});
    const live =
      enrolment.runId === run.id &&
      (enrolment.status === "active" || enrolment.status === "completed") &&
      placementIsShownTo(enrolment, { isAdmin }) &&
      isNamedWithStanding(actor, "courseEnrolments.uid", enrolment.uid);
    if (live) {
      everyone = true;
      if (enrolment.groupId) groupIds.add(enrolment.groupId);
    }
  }

  return { all: false, everyone, facilitators, groupIds };
}

/** One update as a page shows it. Built field by field; no stored document is passed on. */
export type UpdateView = {
  id: string;
  title: string;
  /** Plain text with its line breaks. Shown as text, never as markup. */
  message: string;
  to: CourseUpdateTo;
  groupId: string | null;
  /** The group's name, for an update to one group. */
  groupName: string | null;
  authorUid: string;
  /** The writer's name as the run's pages name people, worked out now. */
  authorName: string;
  /** Its first word: "Rahul". */
  authorFirst: string;
  postedAt: Date | null;
  /** "Mon 16 Nov", in London; "" when the time is not known. */
  postedOn: string;
  email: CourseUpdateEmail | null;
};

export type LoadedUpdates = {
  /** "AGI Strategy": the programme that names the run, or the run's own course title. */
  programmeName: string;
  /** Newest first. */
  updates: UpdateView[];
};

/**
 * The programme's short name for "Everyone on AGI Strategy", from the
 * programme that names the run, else the run's course title.
 */
export async function programmeNameOf(db: Firestore, run: CourseRunDoc): Promise<string> {
  const naming = await readNamingProgramme(db, run.id);
  return naming?.shortName || run.courseTitle.trim() || "this programme";
}

/**
 * The updates this reader is shown, newest first. Reads the run's updates
 * (one equality on one field), then the writers' accounts for their names.
 */
export async function loadUpdatesFor(
  db: Firestore,
  run: CourseRunDoc,
  reading: UpdateReading,
  groups: readonly CourseGroupDoc[],
  programmeName?: string,
): Promise<LoadedUpdates> {
  const name = programmeName ?? (await programmeNameOf(db, run));
  if (!readsAny(reading)) return { programmeName: name, updates: [] };

  const snap = await db.collection(COURSE_UPDATES_COLLECTION).where("runId", "==", run.id).get();
  const shown = snap.docs
    .map((doc) => normalizeCourseUpdate(doc.id, doc.data() ?? {}))
    .filter((update): update is CourseUpdateDoc => update !== null && update.runId === run.id)
    .filter((update) => readsUpdate(reading, update))
    .sort((a, b) => (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0) || a.id.localeCompare(b.id));

  const authorUids = [...new Set(shown.map((update) => update.authorUid).filter(Boolean))];
  const accounts = authorUids.length
    ? await db.getAll(...authorUids.map((uid) => db.collection("users").doc(uid)))
    : [];
  const nameOf = new Map<string, string>();
  for (const account of accounts) {
    if (!account.exists) continue;
    nameOf.set(account.id, memberNameOf(account.data() ?? {}) || COURSE_MEMBER_PLACEHOLDER);
  }
  const groupNameOf = new Map(groups.map((group) => [group.id, group.name.trim() || UNNAMED_GROUP] as const));

  return {
    programmeName: name,
    updates: shown.map((update) => {
      // A writer whose account is gone is named for the society.
      const authorName = nameOf.get(update.authorUid) ?? UPDATE_WRITER_GONE;
      return {
        id: update.id,
        title: update.title,
        message: update.message,
        to: update.to,
        groupId: update.groupId,
        groupName: update.to === "group" ? (groupNameOf.get(update.groupId ?? "") ?? UNNAMED_GROUP) : null,
        authorUid: update.authorUid,
        authorName,
        authorFirst: authorName.trim().split(/\s+/)[0] ?? authorName,
        postedAt: update.postedAt,
        postedOn: update.postedAt ? londonDayLabel(update.postedAt) : "",
        email: update.email,
      };
    }),
  };
}
