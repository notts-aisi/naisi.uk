import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { openSurveyNamesRecorded, type OpeningSubject } from "@/lib/firestore/recordOpenings";
import { isEventSurvey, type EventRespondent, type SurveyDoc } from "@/lib/firestore/surveys";
import type { NameViewer } from "@/lib/names/staffName";
import { keptAnswers } from "./adminView";
import { behindBar, commentsWithKeys, isBarKey } from "./charts";
import { readEventAudience, respondentKey } from "./events/audience";
import { eventAnswersOf } from "./events/store";
import { surveyQuestionsOf, type SurveyAnswer } from "./items";
import { namesOf } from "./names";
import { answersOf } from "./repo";
import { chosenAnswers, readChoice, type ResultsChoice } from "./resultsFilters";
import { PERSON_WORDS, openedByWords } from "./words";

/**
 * "SEE WHO (7)" BEHIND A BAR, AND "WHOSE IS THIS?" BESIDE A COMMENT, on a
 * survey's results: the names of the people behind one bar, or
 * of the person who wrote one comment, for an admin. Names, never addresses:
 * an account's as the admin opening them is shown it (the names rule,
 * `nameForViewer`: in full), a guest's as they gave it to the event.
 *
 * THE OPENING IS RECORDED BEFORE ANY NAME IS READ
 * (`openSurveyNamesRecorded`, `src/lib/firestore/recordOpenings.ts`): who
 * opened them, whose answers they were (account ids, or a guest's sign-up),
 * the survey and when; never which bar or which comment, which beside the
 * people would be what they answered. Before the row, only the survey, its
 * answers' ids and the people they belong to are read (and for a group's
 * results, the run's seats and groups, which hold no name). When the row
 * cannot be written, nobody is named.
 *
 * THE BAR IS THE ONE ON THE ADMIN'S SCREEN. The press carries the bar's count;
 * the people behind it are counted again, by the same counting
 * (`behindBar`), under the same filters, and when the two differ (an answer
 * came in since the page was drawn) nothing is recorded or named: the page is
 * reloaded first. A comment is found by the answer it came from, never by its
 * place in the list.
 *
 * The name shows only to the admin who opened it, in that view: the answer is
 * the names and the line that stays once they are hidden ("Opened by Zach,
 * Sat 21 Nov"), and nothing is kept on any page for another admin to read.
 *
 * Admins only: the one caller is the route, which refuses a view-as session
 * and everybody but an admin before it reads anything.
 */

/** What a press asks for: one bar (with the count on its button) or one comment, under the filters on the screen. */
export type WhoAsked = {
  question: string;
  bar: string | null;
  comment: string | null;
  /** The count on the bar's button. */
  count: number;
  choice: ResultsChoice;
};

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** The press's body, read; null for anything else. */
export function readWhoAsked(body: unknown): WhoAsked | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  if (typeof raw.question !== "string" || !ID.test(raw.question)) return null;
  const bar = isBarKey(raw.bar) ? raw.bar : null;
  const comment = typeof raw.comment === "string" && ID.test(raw.comment) ? raw.comment : null;
  if ((bar === null) === (comment === null)) return null;
  const count = bar ? raw.count : 1;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 100_000) return null;
  return {
    question: raw.question,
    bar,
    comment,
    count,
    choice: readChoice({ who: raw.who, as: raw.as, beforeFirstSession: raw.beforeFirstSession }),
  };
}

export type WhoView = {
  /** Their names, in the order of their words, so the order says nothing of when they answered. */
  names: string[];
  /** Answers behind it whose names have come off: counted, and named by nobody. */
  namesOff: number;
  /** "Opened by Zach, Sat 21 Nov": the line that stays once the names are hidden. */
  opened: string;
};

export type WhoOpening =
  /** The survey asks no such question. Nothing was recorded or read. */
  | { kind: "no-question" }
  /** No answer counted here holds that comment. Nothing was recorded. */
  | { kind: "no-comment" }
  /** Names have come off: nobody can be named. Nothing was recorded. */
  | { kind: "names-off" }
  /** The bar no longer holds what its button says. Nothing was recorded. */
  | { kind: "changed" }
  /** The opening could not be recorded, so nobody was named. */
  | { kind: "not-recorded" }
  | { kind: "open"; view: WhoView };

/** The admin opening the names: who is recorded, and their role, for the name each person is shown by (`nameForViewer`). */
type Actor = { uid: string; displayName?: string | null; role?: string | null };

/** An answer as the opening counts it: its id, its answers and its person, while the name is on it. */
type Counted = { id: string; answers: Record<string, SurveyAnswer>; respondent: EventRespondent | null };

/** The answers the results count under `choice`, each with its person: the same answers the bars were drawn from. */
async function countedAnswers(db: Firestore, survey: SurveyDoc, choice: ResultsChoice): Promise<Counted[]> {
  const { only } = await chosenAnswers(db, survey, choice);
  const answers: Counted[] = isEventSurvey(survey)
    ? await eventAnswersOf(db, survey)
    : keptAnswers(await answersOf(db, survey), survey.kind, choice.beforeFirstSession);
  return only ? answers.filter(only) : answers;
}

/** The first word of a name: "Zach" of "Zach Levin". */
function firstWordOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/**
 * Each subject's name: an account's, as `viewer` is shown it, or the name a
 * guest gave the event. Read once the opening is recorded.
 */
async function namesOfSubjects(db: Firestore, survey: SurveyDoc, subjects: readonly OpeningSubject[], viewer: NameViewer): Promise<string[]> {
  const uids = subjects.flatMap((subject) => (subject.kind === "account" ? [subject.uid] : []));
  const accounts = await namesOf(db, uids, viewer);
  const guests = new Map<string, string>();
  if (isEventSurvey(survey) && subjects.some((subject) => subject.kind === "guest")) {
    const read = await readEventAudience(db, survey.audience.eventId, viewer);
    for (const member of read?.people ?? []) guests.set(member.key, member.name);
  }
  return subjects
    .map((subject) =>
      subject.kind === "account"
        ? (accounts.get(subject.uid) ?? PERSON_WORDS.accountGone)
        : (guests.get(respondentKey(subject)) ?? PERSON_WORDS.guestGone),
    )
    .sort((a, b) => a.localeCompare(b, "en-GB"));
}

/**
 * Open the names behind one bar, or one comment's writer: the opening
 * recorded first, then the names read.
 */
export async function openWhoBehind(db: Firestore, actor: Actor, survey: SurveyDoc, asked: WhoAsked, now: Date): Promise<WhoOpening> {
  const question = surveyQuestionsOf(survey.items).find((each) => each.id === asked.question);
  if (!question) return { kind: "no-question" };
  if (survey.namesOffAt !== null) return { kind: "names-off" };

  const counted = await countedAnswers(db, survey, asked.choice);
  let behind: Counted[];
  if (asked.bar) {
    behind = behindBar(question, counted, asked.bar);
    if (behind.length !== asked.count) return { kind: "changed" };
  } else {
    const answer = counted.find((each) => each.id === asked.comment);
    if (!answer || commentsWithKeys(question, [answer]).length === 0) return { kind: "no-comment" };
    behind = [answer];
  }
  const subjects: OpeningSubject[] = behind.flatMap((answer) => (answer.respondent ? [answer.respondent] : []));
  if (subjects.length === 0) return { kind: "names-off" };

  const actorName = (actor.displayName ?? "").trim() || "An admin";
  const opened = await openSurveyNamesRecorded(
    db,
    { kind: asked.bar ? "survey-bar" : "survey-comment", actorUid: actor.uid, actorName, surveyId: survey.id, subjects },
    () => namesOfSubjects(db, survey, subjects, actor),
  );
  if (!opened.ok) return { kind: "not-recorded" };
  return {
    kind: "open",
    view: { names: opened.value, namesOff: behind.length - subjects.length, opened: openedByWords(firstWordOf(actorName) || actorName, now) },
  };
}
