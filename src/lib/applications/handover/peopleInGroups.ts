import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readPitchingWeek } from "@/lib/courses/pitching/week";
import type { SessionUser } from "@/lib/firebase/session";
import { opensProgrammeGroups, roleOnProgramme } from "../access";
import { own } from "../keys";
import { isId } from "../normalise";
import { readProgrammePeople } from "../people/load";
import { statusWords } from "../people/words";
import { loadForm } from "../repo";
import { RUNS_COLLECTION, readRun } from "./run";

/**
 * A PROGRAMME'S PEOPLE IN GROUPS (board st-groups), READ ON THE SERVER: what
 * the board says about people that the run's own list does not.
 *
 * The board itself is the run's allocation board: its columns, its cards and
 * every move come from the allocation route and the allocate route, which
 * ask again who the caller is on the run (`runStaffingOf`). This adds, from
 * the application form, the People tab's own answers about the same people
 * (`readProgrammePeople`, so the two tabs cannot disagree):
 *
 *  - who holds a place, for the line over the board (`placingCounts`);
 *  - each person's degree line, and whether they have said they are coming;
 *  - who is invited and has not answered, with the day they were invited and,
 *    for a freed place, the group its offer named (its card sits in that
 *    group's column), as the viewer may see them;
 *  - who gave their place back, with the reason they gave, for the list
 *    under the board.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`opensProgrammeGroups`), decided
 * from the form's own settings before the run or anybody is read. A
 * reviewer is answered `not-yours`, and anybody with no role on the
 * programme as for a programme that is not there.
 *
 * NOBODY IS READ UNTIL DECISIONS HAVE BEEN SENT, as on the People tab. No
 * address, no access requirement, no painted week and no answer leaves this
 * module: the view is built field by field.
 *
 * WHAT IS WRITTEN: nothing.
 */

export type PeopleInGroupsView = {
  roundId: string;
  programmeId: string;
  /** "AGI Strategy". */
  programmeName: string;
  viewer: "admin" | "lead";
  /** The run the programme names, while it is on the site. */
  run: { id: string; courseId: string } | null;
  /** Why there is no board: no run named yet, or the one named is gone. Null when there is one. */
  blank: "no-run" | "run-gone" | null;
  /** The run's pitching week, for the Groups tab's views; null otherwise. */
  pitchingWeek: number | null;
  /** Decisions have gone out. Until then nobody holds a place, and the line says so. */
  sent: boolean;
  /** The uids that hold a place on the programme: the People tab's answer. */
  holders: string[];
  /** What a card says of somebody that the run's list does not, by uid. */
  people: Record<string, { name: string; detail: string; coming: boolean }>;
  /** Invited and not answered yet, in the People tab's order. */
  invited: { uid: string; name: string; on: string | null; groupId: string | null; fits: string[] }[];
  /** Everybody who gave their place back, with the reason they gave or when they left the run. */
  gaveBack: { uid: string; name: string; line: string | null }[];
};

export type PeopleInGroupsOutcome =
  | { status: "ok"; view: PeopleInGroupsView }
  /** No form here, no such programme on it, or no role on it. */
  | { status: "none" }
  /** A role on the programme that is neither an admin's nor its lead's. Only the form was read. */
  | { status: "not-yours" };

export async function loadPeopleInGroups(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
): Promise<PeopleInGroupsOutcome> {
  if (!isId(roundId) || !isId(programmeId)) return { status: "none" };
  const form = await loadForm(db, roundId);
  if (!form) return { status: "none" };
  const programme = own(form.programmes, programmeId);
  if (!programme) return { status: "none" };
  // Who leads it, from the form's settings, asked at the point of use.
  const role = roleOnProgramme(actor, form, programmeId);
  if (role === null) return { status: "none" };
  if (!opensProgrammeGroups(role)) return { status: "not-yours" };

  const view: PeopleInGroupsView = {
    roundId: form.round.id,
    programmeId: programme.id,
    programmeName: programme.shortName.trim() || programme.name.trim(),
    viewer: role === "admin" ? "admin" : "lead",
    run: null,
    blank: "no-run",
    pitchingWeek: null,
    sent: form.decisionsSentAt !== null,
    holders: [],
    people: {},
    invited: [],
    gaveBack: [],
  };
  if (programme.runId === null) return { status: "ok", view };
  const snap = await db.collection(RUNS_COLLECTION).doc(programme.runId).get();
  const read = snap.exists ? readRun(snap.id, snap.data()) : null;
  // A run being destroyed is gone already for everybody it served.
  if (!read || read.destroying) return { status: "ok", view: { ...view, blank: "run-gone" } };
  view.run = { id: read.run.id, courseId: read.run.courseId };
  view.blank = null;
  view.pitchingWeek = (await readPitchingWeek(db, read.run.id))?.weekNumber ?? null;

  // Nobody holds a place, or is counted, until everybody has been told.
  if (form.decisionsSentAt === null) return { status: "ok", view };

  const people = await readProgrammePeople(db, actor, form, programme);
  if (!people) return { status: "ok", view };
  const { model, applications, groups } = people;
  const tagOf = new Map(groups.map((group) => [group.id, group.tag] as const));
  const offerOf = new Map(applications.map((application) => [application.uid, application.freedPlace?.groupId ?? null] as const));
  for (const row of model.rows) {
    view.people[row.uid] = { name: row.name, detail: row.detail, coming: row.coming.kind === "yes" };
    if (row.category === "holding") {
      view.holders.push(row.uid);
    } else if (row.category === "invited" && row.status.kind === "invited") {
      // A freed place names the group whose time its email gave: the card
      // sits in that group's column, and fits that group.
      const offered = offerOf.get(row.uid) ?? null;
      const groupId = offered !== null && tagOf.has(offered) ? offered : null;
      view.invited.push({
        uid: row.uid,
        name: row.name,
        on: row.status.on,
        groupId,
        fits: groupId !== null ? [tagOf.get(groupId) ?? ""] : row.free.kind === "fits" ? [...row.free.tags] : [],
      });
    } else if (row.category === "gave-back") {
      view.gaveBack.push({
        uid: row.uid,
        name: row.name,
        line:
          row.status.kind === "gave-back"
            ? row.status.reason
            : row.status.kind === "left"
              ? row.status.on
                ? `${statusWords(row.status)} on ${row.status.on}`
                : statusWords(row.status)
              : null,
      });
    }
  }
  return { status: "ok", view };
}
