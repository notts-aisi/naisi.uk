import { isAddressableId } from "@/lib/addressableId";
import { questionHref, type FirstOfKind } from "./question";
import { READING_ANSWER_ANCHOR, readingHref } from "./reading";

/**
 * WHERE THE OLDER COURSEWORK PAGES' ADDRESSES GO NOW (Fri 13 Nov 2026): the
 * written answer's review page (on the programme's side and the group's), the
 * programme's reflections with names and the group's reflections with names
 * each forward to the reading view that replaced them. An address already
 * sent, in an email or a bookmark, keeps working.
 *
 * WORKED OUT FROM THE ADDRESS ALONE: nothing here reads a document or asks
 * who is asking, so a forward tells nobody whether a run, a group or a person
 * exists, and the page it leads to answers with its own gate, as it does for
 * anybody who typed its address. What the address carries is only checked to
 * be an id or a week number; anything else is left out, and the page opens
 * what it opens by default.
 *
 *  - A person's written answer (`written?...&person=`): the reading view of
 *    their week, at the written answer.
 *  - A group's written answers for a week (`written?group=&week=`): the page
 *    of one question across the group, at the week's written answer.
 *  - Reflections with names: the page of one question across the group, at
 *    the week's first reflection.
 */

type Query = Record<string, string | string[] | undefined>;

/** A week number from the address, as the older pages read one; null otherwise. */
export function weekFrom(value: unknown): number | null {
  return typeof value === "string" && /^\d{1,2}$/.test(value) ? Number(value) : null;
}

/** An id from the address, as the older pages read one; null otherwise. */
export function idFrom(value: unknown): string | null {
  return typeof value === "string" && isAddressableId(value) ? value : null;
}

/** The reading view of one person's week at the written answer: `base` is the door's path before a person (".../coursework"). */
export function readingAnswerHref(base: string, uid: string, weekNumber: number | null): string {
  const page = weekNumber === null ? `${base}/${encodeURIComponent(uid)}` : readingHref(base, uid, weekNumber);
  return `${page}#${READING_ANSWER_ANCHOR}`;
}

/** The page of one question at the week's first question of a kind: `base` carries what the door needs (`?group=` on the programme's side). */
export function firstQuestionHref(base: string, weekNumber: number | null, first: FirstOfKind): string {
  return questionHref(base, { weekNumber, questionId: null, first });
}

/** `.../programmes/[programmeId]/written?group=&week=&person=`, forwarded. `programmePath` is the programme's own path. */
export function programmeWrittenForward(programmePath: string, query: Query): string {
  const person = idFrom(query.person);
  const week = weekFrom(query.week);
  if (person) return readingAnswerHref(`${programmePath}/coursework`, person, week);
  return firstQuestionHref(questionBase(programmePath, query), week, "answer");
}

/** `/learn/[runId]/group/[groupId]/written?week=&person=`, forwarded. `groupPath` is the group's own path under /learn. */
export function groupWrittenForward(groupPath: string, query: Query): string {
  const person = idFrom(query.person);
  const week = weekFrom(query.week);
  if (person) return readingAnswerHref(`${groupPath}/coursework`, person, week);
  return firstQuestionHref(`${groupPath}/question`, week, "answer");
}

/** `.../programmes/[programmeId]/reflections?group=&week=`, forwarded. */
export function programmeReflectionsForward(programmePath: string, query: Query): string {
  return firstQuestionHref(questionBase(programmePath, query), weekFrom(query.week), "reflection");
}

/** `/learn/[runId]/group/[groupId]/reflections/names?week=`, forwarded. */
export function groupNamedReflectionsForward(groupPath: string, query: Query): string {
  return firstQuestionHref(`${groupPath}/question`, weekFrom(query.week), "reflection");
}

/** The programme's page of one question, with the group the address names, if it names one. */
function questionBase(programmePath: string, query: Query): string {
  const group = idFrom(query.group);
  return group ? `${programmePath}/question?group=${encodeURIComponent(group)}` : `${programmePath}/question`;
}
