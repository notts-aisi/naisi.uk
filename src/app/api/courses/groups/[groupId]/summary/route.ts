import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import {
  loadFacilitatorGroup,
  readNextEmailForHome,
  type GroupLeftRecently,
} from "@/lib/courses/facilitatorGroup";
import type { NextEmailLine } from "@/lib/courses/registerEnding";
import { updateAudienceCounts } from "@/lib/courses/updates/audience";
import { loadRunGroups } from "@/lib/courses/updates/readers";
import {
  firstSessionDayOf,
  isBeforeFirstSessionDay,
  readWhosComing,
  type WhosComingPerson,
} from "@/lib/courses/whosComing";
import { loadWrittenQueue } from "@/lib/courses/writtenAnswers/queue";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * WHAT A FACILITATOR'S HOME SAYS ABOUT THEIR GROUP (boards wk-fac-home-phone
 * and, before the group's first session, st-fac-before-phone), beside what
 * the run's overview already says: how many are expected at the next session,
 * how many exercises wait for a review, when next week's email goes while it
 * is on its schedule, who left the group recently, the group's other
 * facilitators by first name, who has said they are coming, and how many an
 * update to the group reaches.
 *
 * WHO'S COMING (Q14) is handed only to a facilitator of the group, only on a
 * day before the group's first session, and only about the people Publish has
 * told their group: each one's first name, and whether they have said they
 * are coming (`readWhosComing`). Never a reason, never anything else from an
 * application. An admin reads the group everywhere else, and is handed none
 * of it here: no admin's Home draws it.
 *
 *   GET  ->  FacilitatorSummary
 *
 * WHO READS IT: a live facilitator of the group, and admins: the group
 * page's own gate. Everybody else, and a group that is not there, is one 403;
 * an admin is told the group is missing. A GET writes nothing.
 *
 * Every value is worked out by the module the group page draws from
 * (`src/lib/courses/facilitatorGroup.ts`), so Home and the group page never
 * disagree. Names only, never an address, and the answer is built field by
 * field.
 */

/** Next week's email, as Home says it: the states a session still to come can be in. */
export type HomeNextEmail = Exclude<NextEmailLine, { state: "missed" }>;

export type FacilitatorSummary = {
  groupId: string;
  /** The people taking part in the group: who is expected at the next session. */
  expected: number;
  /** Somebody placed in the group has not been told it yet. Never for an admin. */
  notYetTold: boolean;
  /** Rows of exercises waiting for a review, as the group page lists them. */
  toReview: number;
  /**
   * Written answers waiting for the caller's feedback, as the group page's
   * review queue lists them. Present only on a run whose weeks are written
   * as blocks; a run of the summer's weeks answers without it.
   */
  writtenToGive?: number;
  /** The oldest of them, for Home's Give feedback: its week and whose it is. Present only when one waits. */
  writtenNext?: { weekNumber: number; uid: string };
  /** Null while next week's email is not on its schedule, or no email is left to go. */
  nextEmail: HomeNextEmail | null;
  /** Who left recently, by name, and the register they are off from. */
  leftRecently: GroupLeftRecently[];
  /** The group's other facilitators who stand behind the role, by first name, in the group's order. */
  coFacilitators: string[];
  /**
   * Before the group's first session's day, for a facilitator of the group:
   * each person Publish has told, by first name, and whether they have said
   * they are coming, the reader left out (a facilitator who holds a place is
   * one of the group's people). Null after that day, and for an admin.
   */
  whosComing: WhosComingPerson[] | null;
  /**
   * "Write to Group B (8)": who an update to the group is to and how many it
   * emails, counted as the group page's button counts, for Home's Say hello
   * before the group's first session's day. Null from that day, and for an
   * archived group: the group page has the button every week.
   */
  write: { people: number; emails: number; notYetTold: number } | null;
};

export async function GET(_req: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  const group = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
  const isAdmin = actor.role === "admin";
  const facilitates = Boolean(
    group && !group.archived && isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids),
  );
  if (!isAdmin && !facilitates) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!group || !isAddressableId(group.runId)) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const runSnap = await db.collection("courseRuns").doc(group.runId).get();
  if (!runSnap.exists || (runSnap.data() ?? {}).destroying === true) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const now = new Date();
  const model = await loadFacilitatorGroup(db, run, group, { isAdmin, actor }, now);
  const [line, writtenQueue] = await Promise.all([
    readNextEmailForHome(db, run, group, model.scheduled, now),
    loadWrittenQueue(db, actor, run, group),
  ]);
  // Who's coming: a facilitator's, before the first session's day, about the
  // people the facilitator's own view of the group lists (told, taking part),
  // the reader left out: a facilitator who holds a place is one of the
  // group's people, and is not told whether they themselves have said so.
  const whosComing =
    !isAdmin && isBeforeFirstSessionDay(firstSessionDayOf(run, group, now), now)
      ? await readWhosComing(
          db,
          run.id,
          model.people
            .filter((person) => person.uid !== actor.uid)
            .map((person) => ({ uid: person.uid, firstName: person.firstName })),
        )
      : null;
  // The way to write to the group, for Home's Say hello, counted as the group
  // page counts it: only while Home draws it, before the first session's day.
  const [count] =
    !group.archived && isBeforeFirstSessionDay(firstSessionDayOf(run, group, now), now)
      ? await updateAudienceCounts(db, run, await loadRunGroups(db, run.id), { groupIds: [group.id] }, actor.uid)
      : [];

  const answer: FacilitatorSummary = {
    groupId: group.id,
    expected: model.expected,
    notYetTold: model.notYetTold,
    toReview: model.toReview.length,
    ...(writtenQueue !== null ? { writtenToGive: writtenQueue.length } : {}),
    ...(writtenQueue && writtenQueue[0] ? { writtenNext: { weekNumber: writtenQueue[0].weekNumber, uid: writtenQueue[0].uid } } : {}),
    nextEmail: line && line.state !== "missed" ? line : null,
    leftRecently: model.leftRecently.map((person) => ({
      uid: person.uid,
      name: person.name,
      firstName: person.firstName,
      leftDateKey: person.leftDateKey,
      from: person.from,
    })),
    coFacilitators: model.facilitators.filter((person) => person.uid !== actor.uid).map((person) => person.firstName),
    whosComing: whosComing
      ? whosComing.map((person) => ({ firstName: person.firstName, coming: person.coming }))
      : null,
    write: count ? { people: count.people, emails: count.emails, notYetTold: count.notYetTold } : null,
  };
  return NextResponse.json(answer);
}
