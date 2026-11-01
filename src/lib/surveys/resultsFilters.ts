import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { enrolmentHasLeft, normalizeCourseEnrolment, placementIsTold } from "@/lib/firestore/courseEnrolments";
import { compareGroupsByMeeting, normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { isCheckIn, isEventSurvey, type SurveyDoc } from "@/lib/firestore/surveys";
import type { FilterChoice } from "./charts";
import { eventAnswersOf } from "./events/store";
import { answersOf } from "./repo";
import { CHART_WORDS, everyoneWhoAnsweredWords, groupChoiceWords } from "./words";

/**
 * WHAT A SURVEY'S RESULTS COUNT, AS AN ADMIN CHOSE (the Results' filters):
 * every answer, or on a programme's survey one group's ("Who"), or on a
 * survey after an event the members' or the guests' ("Came as"). Admins only:
 * a programme's lead reads every answer together and is offered no filter, so
 * nothing is ever shown to the lead by group.
 *
 * One reading of the choice for the Results page, its "See who", and the file
 * of one question, so the three always count the same answers. A value the
 * survey does not offer (a group that holds no answer, a word from an old
 * address) reads as everybody.
 *
 * A group is the one the person has been told on the programme's run, as one
 * person's answers name it (`toldGroupOf`): a seat that has left, or a
 * placement Publish has not told, is in no group. Names that have come off
 * leave no way to tell anybody's group or whether they came as a guest, so
 * then no filter is offered.
 */

export type ResultsChoice = {
  /** Before-survey answers sent after someone's first session are left out. */
  beforeFirstSession: boolean;
  /** A group's id, `NO_GROUP`, or null for everybody. */
  who: string | null;
  as: "members" | "guests" | null;
};

/** The Who filter's value for the answers of people in no group. */
export const NO_GROUP = "none";

export type ResultsFilters = {
  /** A programme's survey with answers in a group: everybody, each group, then nobody's group. Null when not offered. */
  who: FilterChoice[] | null;
  /** A survey after an event: members and guests, members, guests. Null when not offered. */
  as: FilterChoice[] | null;
  /** What each filter holds now: "" for everybody. */
  chosen: { who: string; as: string };
  /** Who the results count when narrowed ("Group A", "members"), or "" for everybody. */
  narrowed: string;
};

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** A choice read from the page's address or a route's body: anything else reads as everybody. */
export function readChoice(raw: { who?: unknown; as?: unknown; beforeFirstSession?: unknown }): ResultsChoice {
  const who = typeof raw.who === "string" && ID.test(raw.who) ? raw.who : null;
  const as = raw.as === "members" || raw.as === "guests" ? raw.as : null;
  return { beforeFirstSession: raw.beforeFirstSession === true, who, as };
}

export type ChosenAnswers = {
  choice: ResultsChoice;
  filters: ResultsFilters;
  /** Whether an answer, by its id, is among those the results count; null for every answer. */
  only: ((answer: { id: string }) => boolean) | null;
};

const EVERYBODY: ResultsFilters = { who: null, as: null, chosen: { who: "", as: "" }, narrowed: "" };

/**
 * Each answer's group, by the answer's id: the group its person has been told
 * on the run, or null; and the run's groups' names, in the one order a run's
 * groups are listed in (`compareGroupsByMeeting`: the day each meets, Monday
 * first, then its time, then its name). Read for the Who filter and for the
 * Answers tab's Group column.
 */
export async function groupsOfAnswers(
  db: Firestore,
  survey: SurveyDoc,
): Promise<{ groups: Map<string, string>; groupOf: Map<string, string | null> }> {
  const answers = await answersOf(db, survey);
  const groups = new Map<string, string>();
  const groupOf = new Map<string, string | null>();
  const runId = survey.runId;
  if (!runId || runId.includes("/")) {
    for (const answer of answers) groupOf.set(answer.id, null);
    return { groups, groupOf };
  }
  const [seatSnap, groupSnap] = await Promise.all([
    db.collection("courseEnrolments").where("runId", "==", runId).get(),
    db.collection("courseGroups").where("runId", "==", runId).get(),
  ]);
  const runGroups = groupSnap.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .filter((group) => group.runId === runId && !group.archived)
    .sort(compareGroupsByMeeting);
  for (const group of runGroups) groups.set(group.id, group.name);
  const toldGroup = new Map<string, string>();
  for (const doc of seatSnap.docs) {
    const seat = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
    if (seat.runId !== runId || seat.role !== "learner" || enrolmentHasLeft(seat.status)) continue;
    if (!seat.groupId || !placementIsTold(seat) || !groups.has(seat.groupId)) continue;
    toldGroup.set(seat.uid, seat.groupId);
  }
  for (const answer of answers) groupOf.set(answer.id, answer.respondent ? (toldGroup.get(answer.respondent.uid) ?? null) : null);
  return { groups, groupOf };
}

/**
 * The filters a survey offers, the choice read against them, and which
 * answers the results count under it. Reads the answers' people, never a
 * name: a group's id and name, or whether an answer is an account's or a
 * guest's.
 */
export async function chosenAnswers(db: Firestore, survey: SurveyDoc, asked: ResultsChoice): Promise<ChosenAnswers> {
  const everybody: ChosenAnswers = { choice: { ...asked, who: null, as: null }, filters: EVERYBODY, only: null };
  if (survey.namesOffAt !== null || isCheckIn(survey)) return everybody;

  if (isEventSurvey(survey)) {
    const as: FilterChoice[] = [
      { value: "", label: CHART_WORDS.membersAndGuests },
      { value: "members", label: CHART_WORDS.members },
      { value: "guests", label: CHART_WORDS.guests },
    ];
    const filters: ResultsFilters = { who: null, as, chosen: { who: "", as: asked.as ?? "" }, narrowed: asked.as ?? "" };
    if (!asked.as) return { choice: { ...asked, who: null }, filters, only: null };
    // Whether each answer is an account's or a guest's, read only when the results are narrowed by it.
    const kindOf = new Map((await eventAnswersOf(db, survey)).map((answer) => [answer.id, answer.respondent?.kind ?? null]));
    const wanted = asked.as === "members" ? "account" : "guest";
    return { choice: { ...asked, who: null }, filters, only: (answer) => kindOf.get(answer.id) === wanted };
  }

  const { groups, groupOf } = await groupsOfAnswers(db, survey);
  const counts = new Map<string, number>();
  for (const group of groupOf.values()) counts.set(group ?? NO_GROUP, (counts.get(group ?? NO_GROUP) ?? 0) + 1);
  // The groups that hold an answer, in the order `groups` keeps them: the one order of a run's groups.
  const inGroups = [...groups.keys()].filter((id) => counts.has(id));
  // Nobody who answered is in a group (the survey about leaving, whose people have all left): no filter.
  if (inGroups.length === 0) return everybody;
  const who: FilterChoice[] = [
    { value: "", label: everyoneWhoAnsweredWords(groupOf.size) },
    ...inGroups.map((id) => ({ value: id, label: groupChoiceWords(groups.get(id) ?? "", counts.get(id) ?? 0) })),
    ...(counts.has(NO_GROUP) ? [{ value: NO_GROUP, label: groupChoiceWords(CHART_WORDS.noGroup, counts.get(NO_GROUP) ?? 0) }] : []),
  ];
  const target = asked.who && who.some((choice) => choice.value === asked.who) ? asked.who : null;
  const filters: ResultsFilters = {
    who,
    as: null,
    chosen: { who: target ?? "", as: "" },
    narrowed: target === null ? "" : target === NO_GROUP ? CHART_WORDS.noGroupPeople : (groups.get(target) ?? ""),
  };
  if (target === null) return { choice: { ...asked, who: null, as: null }, filters, only: null };
  const wanted = target === NO_GROUP ? null : target;
  return { choice: { ...asked, who: target, as: null }, filters, only: (answer) => (groupOf.get(answer.id) ?? null) === wanted };
}
