import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { tagId, type Selection } from "@/lib/audience/tags";
import { UNNAMED_GROUP } from "@/lib/audience/words";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { COURSE_UPDATES_COLLECTION, type CourseUpdateTo } from "@/lib/firestore/courseUpdates";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import type { MessageTally } from "@/lib/firestore/messageSends";
import type { MessageWriter } from "./writers";

/**
 * "ALSO POST IT ON THE PROGRAMME'S PAGE": a message to one programme's people
 * kept on the programme's page as well, as an update
 * (`src/lib/firestore/courseUpdates.ts`), so the people it is to keep the
 * programme's list of updates whichever composer it was written in.
 *
 * ONE PROGRAMME'S PEOPLE, NOBODY LEFT OUT. A message can be posted when it is
 * to exactly one tag and leaves nobody out, and that tag is one an update can
 * be to on the run the programme names:
 *
 *   the programme's everyone, or its people holding a place  ->  everyone
 *   the programme's facilitators                             ->  the facilitators
 *   one of its groups                                        ->  that group
 *
 * Anything else (two tags, a tag left out, the term's own tags, an event, a
 * list) reaches people an update could not be to, or misses some it would
 * be, so it is not offered and the send refuses it.
 *
 * WHO MAY POST is the updates route's own gate, asked again of the run before
 * anything is written (`mayPostOn`): an admin, the run's track leads and the
 * programme's lead to anybody on it, and a facilitator of one of its live
 * groups to that group. The update records the writer by account and keeps
 * no address, as every update does, and what its email did beside it.
 */

export type PostTarget = {
  /** The picker's tag the message is to. */
  tagId: string;
  /** The programme's name, as the picker shows it. */
  programme: string;
  runId: string;
  to: CourseUpdateTo;
  groupId: string | null;
  /** The group's name, for an update to one group. */
  group: string | null;
};

/**
 * The tags this writer could also post on a programme's page, each with where
 * it would go. Read from what the writer runs (`loadTermRoles`), so a tag is
 * here only when the picker offers it to them.
 */
export function postTargetsOf(writer: MessageWriter): PostTarget[] {
  const { form, programmes, runs, leads, tagGroups } = writer.roles;
  if (!form) return [];
  const out: PostTarget[] = [];
  for (const programme of programmes) {
    const run = runs.find((each) => each.programmeId === programme.programmeId);
    if (!run) continue;
    if (writer.admin || leads.includes(programme.key)) {
      for (const part of ["everyone", "holding", "facilitating"] as const) {
        out.push({
          tagId: tagId({ kind: "programme", roundId: form.round.id, programmeId: programme.programmeId, part }),
          programme: programme.name,
          runId: run.runId,
          to: part === "facilitating" ? "facilitators" : "everyone",
          groupId: null,
          group: null,
        });
      }
    }
    if (!run.published) continue;
    for (const group of run.groups) {
      if (!writer.admin && !tagGroups.includes(group.id)) continue;
      out.push({
        tagId: tagId({ kind: "group", groupId: group.id }),
        programme: programme.name,
        runId: run.runId,
        to: "group",
        groupId: group.id,
        group: group.name.trim() || UNNAMED_GROUP,
      });
    }
  }
  return out;
}

/** Where a selection would be posted, or null when it cannot be: exactly one tag, nobody left out. */
export function postTargetFor(writer: MessageWriter, selection: Selection): PostTarget | null {
  if (selection.include.length !== 1 || selection.exclude.length > 0) return null;
  const [only] = selection.include;
  return postTargetsOf(writer).find((target) => target.tagId === only) ?? null;
}

/**
 * The updates route's gate, asked of the run as it stands now: may this
 * person post this update? The run must still be there and not being
 * destroyed, and a group must still be live.
 */
export async function mayPostOn(db: Firestore, actor: SessionUser, target: PostTarget): Promise<"yes" | "no-run" | "not-yours"> {
  const snap = await db.collection("courseRuns").doc(target.runId).get();
  if (!snap.exists || snap.data()?.destroying === true) return "no-run";
  const run = normalizeCourseRun(snap.id, snap.data() ?? {});
  if (actor.role === "admin" || doesTrackLeadWork(await runStaffingOf(db, actor, run))) return "yes";
  if (target.to !== "group" || !target.groupId) return "not-yours";
  const groupSnap = await db.collection("courseGroups").doc(target.groupId).get();
  if (!groupSnap.exists) return "no-run";
  const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
  if (group.runId !== run.id || group.archived) return "no-run";
  return isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids) ? "yes" : "not-yours";
}

/**
 * The update, written before the first email goes, with what its email is
 * meant for and not yet settled, exactly as the updates route writes one.
 * Returns its id.
 */
export async function postOnProgrammePage(
  db: Firestore,
  args: { target: PostTarget; authorUid: string; title: string; message: string; planned: number },
): Promise<string> {
  const ref = db.collection(COURSE_UPDATES_COLLECTION).doc();
  await ref.set({
    runId: args.target.runId,
    to: args.target.to,
    groupId: args.target.to === "group" ? args.target.groupId : null,
    title: args.title,
    message: args.message,
    authorUid: args.authorUid,
    postedAt: FieldValue.serverTimestamp(),
    email: { planned: args.planned, sent: 0, held: 0, suppressed: 0, failed: 0, settled: false },
  });
  return ref.id;
}

/** What the email beside a posted update did, once the last message has gone. */
export async function settlePostedEmail(db: Firestore, updateId: string, planned: number, tally: MessageTally): Promise<void> {
  await db.collection(COURSE_UPDATES_COLLECTION).doc(updateId).update({ email: { planned, ...tally, settled: true } });
}
