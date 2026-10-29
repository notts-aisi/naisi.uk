import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { claudeConfigured } from "@/lib/ai/claude";
import type { SessionUser } from "@/lib/firebase/session";
import { compareGroupsByMeeting } from "@/lib/firestore/courseGroups";
import { opensProgrammeGroups, roleOnProgramme } from "../access";
import { loadFirstNames } from "../decisionDay/people";
import { RUNS_COLLECTION, readRun } from "../handover/run";
import { defaultLength, hasSessionTime, lengthFromGroups, lengthOptions, pickLength } from "../handover/times";
import { groupsOf, type LiveGroup } from "../handover/timesLoad";
import { own } from "../keys";
import { isId } from "../normalise";
import { loadForm } from "../repo";
import { notesFor, ringPeopleOf } from "./advise";
import { DEFAULT_GROUP_SIZE, loadArranging } from "./load";
import { canMake } from "./plan";
import type { CircleGroup, CirclesView } from "./view";

/**
 * CIRCLES: A PROGRAMME'S GROUPS AS THEY ARE, for an admin.
 *
 * One ring for each of the run's live groups, with who sits in it now and
 * who facilitates it; who is on the run's list and sits in no group; and who
 * holds a place but is not on that list, so nobody can place them yet. Read
 * through `loadArranging` (`./load.ts`), the reading every arrangement starts
 * from, so the rings and a suggestion drawn over them cannot disagree about
 * who is where.
 *
 * AN ADMIN'S ALONE, decided from the form before anybody is read: it shows
 * each person's marked week and Claude's earlier read of their application,
 * which are an admin's. The programme's lead works from People in groups,
 * and a reviewer is told the tab is the lead's and an admin's.
 *
 * NOTHING IS ASKED OF CLAUDE AND NOTHING IS WRITTEN. Every change the screen
 * makes goes through the site's own routes, which ask every question they
 * always ask, and the screen then reads this again.
 *
 * Before decision day the run's groups are drawn with nobody in them: nobody
 * is on the run yet, and a suggestion is a preview.
 */

export type CirclesOutcome =
  | { status: "ok"; view: CirclesView }
  /** No form here, no such programme on it, or no role on it. */
  | { status: "none" }
  /** A reviewer of the programme: the Groups tab is the lead's and an admin's. Only the form was read. */
  | { status: "not-yours" }
  /** The programme's lead: Circles is an admin's. Only the form was read. */
  | { status: "admins-only" };

/** The run's groups as Circles draws them, Monday first, from the live groups and whoever sits in each. */
function ringsOf(
  live: readonly LiveGroup[],
  members: (groupId: string) => string[],
  canMakeOf: (group: LiveGroup) => string[],
  toldGroups: ReadonlySet<string>,
  names: ReadonlyMap<string, string>,
): CircleGroup[] {
  return [...live].sort(compareGroupsByMeeting).map((group) => {
    const memberUids = members(group.id);
    return {
      id: group.id,
      name: group.name,
      session: hasSessionTime(group.session) ? { ...group.session } : null,
      room: group.capacity,
      memberUids,
      facilitators: group.facilitatorUids.map((uid) => ({
        uid,
        name: names.get(uid) || "A facilitator",
        member: memberUids.includes(uid),
      })),
      told: toldGroups.has(group.id),
      slot: { weekday: group.session.weekday, start: group.session.startTimeLocal },
      canMake: canMakeOf(group),
      campus: group.campus,
      location: group.location,
    };
  });
}

export async function loadCircles(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  wanted: { minutes?: unknown } = {},
): Promise<CirclesOutcome> {
  if (!isId(roundId) || !isId(programmeId)) return { status: "none" };
  const form = await loadForm(db, roundId);
  if (!form) return { status: "none" };
  const programme = own(form.programmes, programmeId);
  if (!programme) return { status: "none" };
  const role = roleOnProgramme(user, form, programmeId);
  if (role === null) return { status: "none" };
  if (!opensProgrammeGroups(role)) return { status: "not-yours" };
  if (role !== "admin") return { status: "admins-only" };

  const view: CirclesView = {
    roundId: form.round.id,
    programmeId: programme.id,
    runId: null,
    sent: form.decisionsSentAt !== null,
    published: false,
    programmeName: programme.name,
    programmeShortName: programme.shortName,
    grid: { startMinute: form.round.availabilityGrid.startMinute, endMinute: form.round.availabilityGrid.endMinute },
    minutes: 0,
    lengths: [],
    size: DEFAULT_GROUP_SIZE,
    people: {},
    groups: [],
    notOnList: [],
    claudeConfigured: claudeConfigured(),
  };

  if (programme.runId !== null) {
    const snap = await db.collection(RUNS_COLLECTION).doc(programme.runId).get();
    const read = snap.exists ? readRun(snap.id, snap.data()) : null;
    if (read && !read.destroying) view.runId = read.run.id;
  }
  if (view.runId === null) return { status: "ok", view };

  if (!view.sent) {
    // Nobody is on the run yet: its groups, with nobody in them.
    const live = await groupsOf(db, view.runId);
    const lengths = lengthOptions(live);
    view.lengths = lengths;
    view.minutes = pickLength(wanted.minutes, lengths, defaultLength(lengthFromGroups(live), programme.kind));
    const names = await loadFirstNames(db, [...new Set(live.flatMap((group) => group.facilitatorUids))]);
    view.groups = ringsOf(live, () => [], () => [], new Set(), names);
    return { status: "ok", view };
  }

  const loaded = await loadArranging(db, user, roundId, programmeId, wanted);
  if (!loaded.ok) return { status: "ok", view };
  const { arranging } = loaded;
  const live = [...arranging.groups.values()];
  const [notes, names] = await Promise.all([
    notesFor(db, roundId, programmeId, [...arranging.people.keys()]),
    loadFirstNames(db, [...new Set(live.flatMap((group) => group.facilitatorUids))]),
  ]);
  const everybody = [...arranging.people.values()];
  const byName = (a: string, b: string) =>
    (arranging.people.get(a)?.name ?? "").localeCompare(arranging.people.get(b)?.name ?? "", "en") || a.localeCompare(b);

  return {
    status: "ok",
    view: {
      ...view,
      published: arranging.published,
      minutes: arranging.minutes,
      lengths: arranging.lengths,
      size: arranging.size,
      people: ringPeopleOf(arranging, notes, roundId, programmeId),
      groups: ringsOf(
        live,
        (groupId) => everybody.filter((person) => person.groupId === groupId).map((person) => person.uid).sort(byName),
        (group) =>
          hasSessionTime(group.session)
            ? everybody.filter((person) => canMake(person, group.session)).map((person) => person.uid).sort()
            : [],
        arranging.toldGroups,
        names,
      ),
      notOnList: arranging.notOnList.map((holder) => ({ uid: holder.uid, name: holder.name })),
    },
  };
}
