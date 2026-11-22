import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { CAMPUS_LABEL } from "@/lib/courses/campusWords";
import { dayAndTimeWords, roomLine } from "@/lib/courses/groupPage/words";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { NameViewer } from "@/lib/names/staffName";
import { restorePlan } from "./plan";
import { readGroupArchiveFacts } from "./read";
import { restoreQuestionBody, sitsElsewhereWords } from "./words";

/**
 * WHAT THE RESTORE QUESTION SAYS before an archived group is restored, read
 * on the server for each page that asks it (the archived group's own page,
 * and the archived groups at the foot of the Groups tab's All groups view,
 * one group at a time):
 * how the group comes back (`restoreQuestionBody`, from how it met), and who
 * it comes back without, by the route's own rule (`restorePlan` on
 * `readGroupArchiveFacts`, each name as `viewer` may see it). Read only, so
 * a read that fails asks the question without the facilitators' line. The
 * archived group's page reads it as it draws; All groups asks the archive
 * route's GET for one group as its Restore is pressed.
 */

/** "Fridays, 11am to 1pm", or "" for a group that never had a time. */
export function archivedWhenWords(group: CourseGroupDoc): string {
  return group.session.startTimeLocal ? dayAndTimeWords(group.session.weekday, group.session.startTimeLocal, group.session.durationMinutes) : "";
}

export async function readRestoreQuestion(
  db: Firestore,
  input: {
    group: CourseGroupDoc;
    viewer: NameViewer;
    now: Date;
  },
): Promise<{ body: string; note: string }> {
  const { group, viewer, now } = input;
  const facts = await readGroupArchiveFacts(db, group.id, now, undefined, viewer).catch(() => null);
  const plan = facts ? restorePlan(facts, now) : null;
  // The groups a facilitator now sits in, named from the run's groups the reader already read.
  const groupNames = new Map((facts?.runGroups ?? []).map((each) => [each.id, each.name] as const));
  const note =
    facts && plan?.ok
      ? sitsElsewhereWords(
          group.name,
          plan.dropping.map((each) => ({
            name: facts.names.get(each.uid)?.name ?? "",
            // "" says no group.
            groupName: each.groupId ? (groupNames.get(each.groupId) ?? "another group") : "",
          })),
          plan.staying.map((uid) => facts.names.get(uid)?.name ?? "").filter(Boolean),
        )
      : "";
  const room = group.session.location.trim() ? roomLine(group.session.location, group.campus ? CAMPUS_LABEL[group.campus] : "") : "";
  return { body: restoreQuestionBody(group.name, archivedWhenWords(group), room), note };
}
