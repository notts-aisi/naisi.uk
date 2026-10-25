import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { pitchesOnRun, peopleNamed } from "@/lib/courses/pitching/load";
import type { StaffPitchRow } from "@/lib/courses/pitching/model";
import { seatsOn } from "@/lib/courses/pitching/people";
import { readPitchingWeek } from "@/lib/courses/pitching/week";
import { pitchedByWords } from "@/lib/courses/pitching/words";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { canRunTerm, opensProgrammeGroups, roleOnProgramme } from "../access";
import { own } from "../keys";
import { isId } from "../normalise";
import { loadForm } from "../repo";
import { RUNS_COLLECTION, readRun } from "./run";

/**
 * THE PITCHES FROM A PROGRAMME'S PITCHING WEEK, for its lead and for admins
 * (board in-teams, option C, its "Pitches from week 3" list).
 *
 * WHO: an admin, or the programme's lead while they meet the lead's bar
 * (`roleOnProgramme`). A reviewer has a role on the programme and is told the
 * list is not theirs; anybody else is told there is no programme here. Both
 * are decided from the form before the run is read.
 *
 * WHAT: each pitch of the run's pitching week, who pitched it, its twist, and
 * how many people would join it. A pick is counted while its owner is still
 * in the pitch's group, told by Publish (`seatsOn`), with an account that
 * stands, so somebody who left, moved or was refused stops counting. Who picked what is not on this list: that is for
 * making teams, which is not built yet. Read only: it writes nothing.
 *
 * Most would join first, then by title, as the board orders them.
 */
export type StaffPitchesView = {
  roundId: string;
  programmeId: string;
  /** "Alignment Research". */
  programmeName: string;
  run: { id: string; courseId: string } | null;
  /**
   * Why there is no list, or null when there is one:
   *  - `no-run`: the programme names no course run yet;
   *  - `run-gone`: the run it names is not on the site;
   *  - `no-week`: no week of the run is ticked as pitching week.
   */
  blank: "no-run" | "run-gone" | "no-week" | null;
  weekNumber: number | null;
  /** The pitching week is published: people can see it. */
  published: boolean;
  /** How many each person may pick is set: without it nobody can pick. */
  pickLimitSet: boolean;
  pitches: StaffPitchRow[];
  /** The run editor is this caller's to open (an admin). */
  canOpenRunEditor: boolean;
};

export type StaffPitchesOutcome =
  | { status: "ok"; view: StaffPitchesView }
  /** No form, no such programme, or no role on it. */
  | { status: "none" }
  /** A reviewer of the programme: the list is the lead's and admins'. */
  | { status: "not-yours" };

export async function loadProgrammePitches(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
): Promise<StaffPitchesOutcome> {
  if (!isId(roundId) || !isId(programmeId)) return { status: "none" };
  const form = await loadForm(db, roundId);
  if (!form) return { status: "none" };
  const programme = own(form.programmes, programmeId);
  if (!programme) return { status: "none" };
  const role = roleOnProgramme(user, form, programmeId);
  if (!role) return { status: "none" };
  if (!opensProgrammeGroups(role)) return { status: "not-yours" };

  const view: StaffPitchesView = {
    roundId: form.round.id,
    programmeId: programme.id,
    programmeName: programme.shortName,
    run: null,
    blank: "no-run",
    weekNumber: null,
    published: false,
    pickLimitSet: false,
    pitches: [],
    canOpenRunEditor: canRunTerm(user),
  };
  if (programme.runId === null) return { status: "ok", view };

  const snap = await db.collection(RUNS_COLLECTION).doc(programme.runId).get();
  const read = snap.exists ? readRun(snap.id, snap.data()) : null;
  if (!read || read.destroying) return { status: "ok", view: { ...view, blank: "run-gone" } };
  const run = read.run;
  view.run = { id: run.id, courseId: run.courseId };
  view.pickLimitSet = run.pitchSettings.pickLimit !== null;

  const week = await readPitchingWeek(db, run.id);
  if (!week) return { status: "ok", view: { ...view, blank: "no-week" } };
  view.blank = null;
  view.weekNumber = week.weekNumber;
  view.published = week.published;

  const [allPitches, seats, groupSnap] = await Promise.all([
    pitchesOnRun(db, run.id),
    seatsOn(db, run.id, { isAdmin: user.role === "admin" }),
    // One equality on one field, so no declared index.
    db.collection("courseGroups").where("runId", "==", run.id).get(),
  ]);
  const pitches = allPitches.filter((pitch) => pitch.weekId === week.weekId);
  const groupOf = new Map(seats.map((seat) => [seat.uid, seat.groupId] as const));
  const groupNames = new Map(
    groupSnap.docs.map((doc) => {
      const group = normalizeCourseGroup(doc.id, doc.data() ?? {});
      return [group.id, group.name.trim() || "Untitled group"] as const;
    }),
  );
  const severalGroups = new Set(pitches.map((pitch) => pitch.groupId)).size > 1;
  const named = await peopleNamed(
    db,
    pitches.flatMap((pitch) => [...pitch.pitcherUids, ...pitch.wouldJoinUids]),
  );
  // A pick counts while its owner is in the pitch's group, told, and their
  // account still stands: the people the pitching routes still answer.
  const counts = (uid: string, groupId: string) =>
    groupOf.get(uid) === groupId && named.get(uid)?.approved === true;

  view.pitches = pitches
    .map((pitch) => ({
      id: pitch.id,
      title: pitch.title,
      twist: pitch.twist,
      pitchedBy: pitchedByWords(
        pitch.pitcherUids.map((uid) => named.get(uid)?.name ?? "NAISI member"),
        undefined,
      ),
      wouldJoin: pitch.wouldJoinUids.filter((uid) => counts(uid, pitch.groupId)).length,
      groupName: severalGroups ? (groupNames.get(pitch.groupId) ?? null) : null,
    }))
    .sort((a, b) => b.wouldJoin - a.wouldJoin || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  return { status: "ok", view };
}
