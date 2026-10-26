import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { lengthOptions } from "@/lib/applications/handover/times";
import { weeklySlotWords } from "@/lib/courses/facilitatingEmail";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { slugId } from "@/lib/firestore/slugId";
import {
  MAX_GROUPS_PER_RUN,
  placesProblem,
  sameName,
  sameSlot,
  type ChangeTime,
  type NewGroup,
} from "./rules";
import { readsIn, toldGroupIds } from "./told";
import { REFUSAL, addedWords, changedWords, nameTakenWords, toldWords } from "./words";

/**
 * THE TWO WRITES OF THE TIMES PICTURE: a group's day and start, and a new
 * group. Each is one transaction that reads what it decides on and writes
 * only when it still holds, so two presses at once, or a press of Publish
 * between the read and the write, make it read again.
 *
 * WHO MAY is decided by the route before anything here runs (the
 * programme's lead or an admin, `loadProgrammeRun`). What is decided here is
 * whether the run and the group allow it.
 *
 * NOBODY IS EMAILED by either. Publish tells people their group's time.
 */

export type ActRefusal = { ok: false; status: 400 | 404 | 409; error: string };

const refuse = (status: ActRefusal["status"], error: string): ActRefusal => ({ ok: false, status, error });

/** "Tuesdays at 7pm", or the group's name alone when it has no time. */
const meetsOf = (group: Pick<CourseGroupDoc, "session">): string => weeklySlotWords(group.session) ?? "";

export type TimeChanged = {
  ok: true;
  /** False when the group already met then: nothing was written. */
  changed: boolean;
  groupId: string;
  groupName: string;
  /** "Tuesdays at 7pm". */
  meets: string;
  /** The sentence the page shows. */
  message: string;
};

/**
 * Change one group's weekly day and start. Its length, room, link and
 * facilitators stay as they are, and so does every week a session change
 * has moved on its own.
 */
export async function changeGroupTime(
  db: Firestore,
  runId: string,
  groupId: string,
  change: ChangeTime,
): Promise<TimeChanged | ActRefusal> {
  const ref = db.collection("courseGroups").doc(groupId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return refuse(404, REFUSAL.noGroup);
    const group = normalizeCourseGroup(snap.id, snap.data() ?? {});
    if (group.runId !== runId) return refuse(404, REFUSAL.noGroup);
    if (group.archived) return refuse(409, REFUSAL.archived);
    const name = group.name.trim() || "This group";
    const stored = { weekday: group.session.weekday, startTimeLocal: group.session.startTimeLocal.trim() };
    if (!sameSlot(stored, change.from)) return refuse(409, REFUSAL.stale);

    const told = await toldGroupIds(db, readsIn(tx), runId, [group]);
    if (told.has(group.id)) return refuse(409, toldWords(name));

    if (sameSlot(stored, change.to)) {
      const meets = meetsOf(group);
      return { ok: true, changed: false, groupId: group.id, groupName: name, meets, message: changedWords(name, meets) };
    }
    tx.update(ref, {
      "session.weekday": change.to.weekday,
      "session.startTimeLocal": change.to.startTimeLocal,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const meets = meetsOf({ session: { ...group.session, ...change.to } });
    return { ok: true, changed: true, groupId: group.id, groupName: name, meets, message: changedWords(name, meets) };
  });
}

export type GroupAdded = {
  ok: true;
  groupId: string;
  groupName: string;
  meets: string;
  message: string;
};

/**
 * Add a group to the run, at a day and start, lasting one of the lengths a
 * new group may last (`lengthOptions`: the group editor's, and any a group
 * of the run already has), with its places or no limit. It starts as the
 * run editor starts one: nobody in it, no facilitator, no room and no link.
 */
export async function addGroup(db: Firestore, runId: string, wanted: NewGroup): Promise<GroupAdded | ActRefusal> {
  const runRef = db.collection("courseRuns").doc(runId);
  const groupsQuery = db.collection("courseGroups").where("runId", "==", runId);
  return db.runTransaction(async (tx) => {
    const [runSnap, groupSnap] = await Promise.all([tx.get(runRef), tx.get(groupsQuery)]);
    if (!runSnap.exists) return refuse(409, REFUSAL.runGone);
    const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
    const groups = groupSnap.docs
      .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
      .filter((group) => group.runId === runId);
    const live = groups.filter((group) => !group.archived);

    if (!lengthOptions(live.map((group) => ({ id: group.id, name: group.name, session: group.session }))).includes(wanted.minutes)) {
      return refuse(400, REFUSAL.length);
    }
    const places = placesProblem(wanted.places, run.enrolMode);
    if (places) return refuse(400, places);
    if (live.some((group) => sameName(group.name, wanted.name))) return refuse(409, nameTakenWords(wanted.name));
    if (groups.length >= MAX_GROUPS_PER_RUN) return refuse(409, REFUSAL.tooMany);

    const ref = db.collection("courseGroups").doc(slugId(`${run.label} ${wanted.name}`));
    // The run editor's own shape for a new group (`createGroup`), so the
    // editor, the board and the rules read it as one of theirs.
    tx.create(ref, {
      runId,
      courseId: run.courseId,
      name: wanted.name,
      facilitatorUids: [] as string[],
      capacity: wanted.places,
      memberCount: 0,
      session: {
        weekday: wanted.slot.weekday,
        startTimeLocal: wanted.slot.startTimeLocal,
        durationMinutes: wanted.minutes,
        location: "",
        meetingUrl: null,
        notes: "",
      },
      sessionOverrides: {},
      archived: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const meets = weeklySlotWords(wanted.slot) ?? "";
    return { ok: true, groupId: ref.id, groupName: wanted.name, meets, message: addedWords(wanted.name, meets) };
  });
}
