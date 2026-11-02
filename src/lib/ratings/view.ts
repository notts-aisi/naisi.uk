import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { runEndOf, type RunEnd } from "@/lib/courses/finishing/runEnd";
import {
  facilitatorsOf,
  listGroups,
  readRunRecords,
  weeksOf,
  type RunRecords,
} from "@/lib/courses/programmeAttendance";
import { leadsNamingProgramme, readNamingProgramme } from "@/lib/courses/programmeLead";
import { standingTeams, teamOfEach, type Participant } from "@/lib/courses/teams/standing";
import { teamsOnRun } from "@/lib/applications/handover/teamsLoad";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { accountNamesOf, nameForViewer, type NameViewer } from "@/lib/names/staffName";
import { ratingQuestionsFor, type RatingAnswers, type RatingQuestion, type RatingsProgrammeKind } from "./model";
import { mayRate, opensGroupRatings, readsEveryRating, type RatedGroup, type Rater } from "./rules";
import { readRunRatings } from "./store";
import { RATINGS_WORDS, ratingLine } from "./words";

/**
 * WHAT THE RATINGS PAGES AND THEIR ROUTE WORK FROM, built on the server for
 * one person: the run's own records (the register's rows, so F1 is read from
 * the register and never typed), who is asking and what they may do, and
 * whether the run's last session is over.
 *
 * Two pages draw it:
 *
 *  - A GROUP'S FACILITATOR (`/learn/[runId]/group/[groupId]/ratings`): the
 *    fellows of their group they may rate, each with their own rating of
 *    them, and nothing anybody else said.
 *  - THE PROGRAMME'S LEAD AND ADMINS (the programme's Ratings page, and an
 *    admin on a group's page): every fellow of every group, what everybody
 *    said about them with the rater's name, and their own form for the
 *    people they may rate (the facilitators, chiefly).
 *
 * NOBODY IS SHOWN WHAT WAS SAID ABOUT THEM. A facilitator is a fellow, and a
 * lead or an admin could be one, so the person asking is never one of the
 * rows, on any page.
 *
 * NAMES BY THE NAMES RULE, for the person asking (`nameForViewer`): the
 * committee and admins see "Priya Shah (Pri)", a facilitator or lead who is
 * not on the committee the name people go by. The fellows and the raters
 * alike.
 */

/** One fellow, as the page draws them for this viewer. */
export type RatingsPerson = {
  uid: string;
  name: string;
  /** Named among the group's facilitators. */
  facilitator: boolean;
  /** F1: "Came to 5 of 6 sessions, from the register". */
  came: string;
  /** On an incubator, the team whose research the mentor rating is about: "Team: Refusal directions". Null otherwise. */
  team: string | null;
  /** The viewer's own form, starting on what they saved; null when they may not rate this person. */
  rate: { answers: RatingAnswers } | null;
  /** Why the viewer may not rate them, for a reader's row with no form; null otherwise. */
  cannot: string | null;
  /** What others said, for the lead and admins only: each rater's name and their rating in a line. */
  others: { rater: string; line: string }[];
};

export type RatingsGroup = { id: string; name: string; people: RatingsPerson[] };

export type RatingsView =
  | { state: "not-yet"; line: string }
  | {
      state: "open";
      kind: RatingsProgrammeKind;
      questions: RatingQuestion[];
      /** True for the lead and admins, who read every rating. */
      reader: boolean;
      groups: RatingsGroup[];
    };

/** A fellow of a group at the end: somebody taking part, from the register's rows. */
export type Fellow = { uid: string; name: string; came: number; of: number };

/** One live group, as the rules and the pages need it. */
export type GroupFacts = { group: CourseGroupDoc; rated: RatedGroup; fellows: Fellow[] };

export type RatingsContext = {
  records: RunRecords;
  rater: Rater;
  kind: RatingsProgrammeKind;
  end: RunEnd;
  groups: GroupFacts[];
};

/**
 * Everything one person's view of a run's ratings is decided from. Null for
 * a run that is not there. Who the person is decides nothing yet: the pages
 * and the route ask `./rules.ts` of what this holds.
 */
export async function ratingsContextFor(
  db: Firestore,
  actor: SessionUser,
  runId: string,
  now: Date,
): Promise<RatingsContext | null> {
  if (!runId || runId.includes("/")) return null;
  const [records, naming] = await Promise.all([readRunRecords(db, runId), readNamingProgramme(db, runId)]);
  if (!records) return null;
  const isAdmin = actor.role === "admin";
  const rater: Rater = { uid: actor.uid, isAdmin, leads: leadsNamingProgramme(actor, naming) };
  const listed = listGroups(records, { isAdmin, role: actor.role }, now, weeksOf(records));
  const groups: GroupFacts[] = listed.map((entry) => ({
    group: entry.group,
    rated: {
      facilitatorUids: [...new Set(entry.group.facilitatorUids)],
      standingFacilitatorUids: facilitatorsOf(records, entry.group).map((facilitator) => facilitator.uid),
    },
    fellows: entry.people
      .filter((person) => person.row.left === null)
      .map((person) => ({ uid: person.row.uid, name: person.row.name, came: person.row.came, of: person.row.of })),
  }));
  return {
    records,
    rater,
    kind: naming?.kind === "incubator" ? "incubator" : "fellowship",
    end: runEndOf(records.run, records.groups, now),
    groups,
  };
}

/**
 * The raters' names as `viewer` is shown them (`nameForViewer`), from the
 * run's accounts or, for a lead or an admin, their own.
 */
async function raterNames(
  db: Firestore,
  records: RunRecords,
  uids: readonly string[],
  viewer: NameViewer,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const missing: string[] = [];
  const nameOf = (data: Record<string, unknown>) => nameForViewer(viewer, accountNamesOf(data), "NAISI member");
  for (const uid of new Set(uids)) {
    const data = records.accounts.get(uid);
    if (data) out.set(uid, nameOf(data));
    else if (uid && !uid.includes("/")) missing.push(uid);
  }
  if (missing.length > 0) {
    const snaps = await db.getAll(...missing.map((uid) => db.collection("users").doc(uid)));
    for (const snap of snaps) {
      if (snap.exists) out.set(snap.id, nameOf((snap.data() ?? {}) as Record<string, unknown>));
    }
  }
  return out;
}

/**
 * On an incubator, each fellow's team name: the research the mentor rating is
 * about. A team's people are the ones still taking part in its own group
 * (`standingTeams`, the Teams tab's own rule). A fellowship reads nothing.
 */
async function teamsOfFellows(db: Firestore, ctx: RatingsContext): Promise<Map<string, string>> {
  if (ctx.kind !== "incubator") return new Map();
  const takingPart = new Map<string, Participant>();
  for (const facts of ctx.groups) {
    for (const fellow of facts.fellows) takingPart.set(fellow.uid, { uid: fellow.uid, name: fellow.name, groupId: facts.group.id });
  }
  const teams = await teamsOnRun(db, ctx.records.run.id);
  const names = new Map(teams.map((team) => [team.id, team.name.trim()]));
  const out = new Map<string, string>();
  for (const [uid, teamId] of teamOfEach(standingTeams(teams, takingPart))) {
    const name = names.get(teamId);
    if (name) out.set(uid, name);
  }
  return out;
}

/**
 * One person's view of a run's ratings: one group's (`groupId`), or every
 * group's for the lead and admins (`groupId` null). Null when they may not
 * open it, which the page answers by sending them away.
 */
export async function loadRatingsView(
  db: Firestore,
  actor: SessionUser,
  runId: string,
  groupId: string | null,
  now: Date,
): Promise<RatingsView | null> {
  const ctx = await ratingsContextFor(db, actor, runId, now);
  if (!ctx) return null;
  const reader = readsEveryRating(ctx.rater);
  let shown = ctx.groups;
  if (groupId !== null) {
    shown = ctx.groups.filter((facts) => facts.group.id === groupId);
    if (shown.length !== 1 || !opensGroupRatings(ctx.rater, shown[0].rated)) return null;
  } else if (!reader) {
    return null;
  }
  if (!ctx.end.over) {
    return {
      state: "not-yet",
      line: groupId !== null ? RATINGS_WORDS.notYet(shown[0].group.name, ctx.end.lastDay) : RATINGS_WORDS.runNotYet(ctx.end.lastDay),
    };
  }

  const [ratings, teamNames] = await Promise.all([readRunRatings(db, runId), teamsOfFellows(db, ctx)]);
  const names = reader ? await raterNames(db, ctx.records, ratings.map((rating) => rating.raterUid), actor) : new Map<string, string>();
  const groups: RatingsGroup[] = shown.map((facts) => {
    const people: RatingsPerson[] = [];
    for (const fellow of facts.fellows) {
      // Nobody is shown what was said about them.
      if (fellow.uid === actor.uid) continue;
      const can = mayRate(ctx.rater, facts.rated, fellow.uid);
      if (!reader && !can.ok) continue;
      const mine = ratings.find((rating) => rating.raterUid === actor.uid && rating.ratedUid === fellow.uid);
      const others = reader
        ? ratings
            .filter((rating) => rating.ratedUid === fellow.uid && rating.raterUid !== actor.uid)
            .map((rating) => ({ rater: names.get(rating.raterUid) ?? "", line: ratingLine(rating.answers) }))
            .filter((other) => other.rater !== "" && other.line !== "")
            .sort((a, b) => a.rater.localeCompare(b.rater, "en-GB"))
        : [];
      people.push({
        uid: fellow.uid,
        name: fellow.name,
        facilitator: facts.rated.facilitatorUids.includes(fellow.uid),
        came: RATINGS_WORDS.came(fellow.came, fellow.of),
        team: teamNames.has(fellow.uid) ? RATINGS_WORDS.team(teamNames.get(fellow.uid) ?? "") : null,
        rate: can.ok ? { answers: { ...(mine?.answers ?? {}) } } : null,
        cannot: can.ok ? null : RATINGS_WORDS.cannot[can.reason],
        others,
      });
    }
    // The lead and admins see the facilitators first: the people only they can rate.
    if (reader) people.sort((a, b) => Number(b.facilitator) - Number(a.facilitator));
    return { id: facts.group.id, name: facts.group.name, people };
  });
  return { state: "open", kind: ctx.kind, questions: [...ratingQuestionsFor(ctx.kind)], reader, groups };
}
