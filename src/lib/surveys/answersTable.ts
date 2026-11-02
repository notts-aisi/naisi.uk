import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { openSurveyNamesRecorded } from "@/lib/firestore/recordOpenings";
import { isCheckIn, isEventSurvey, type EventRespondent, type SurveyAnswerVia, type SurveyDoc } from "@/lib/firestore/surveys";
import type { NameViewer } from "@/lib/names/staffName";
import { blanksOf, blanksRowOf, type BlanksRow } from "./blanks";
import { readEventAudience, respondentKey } from "./events/audience";
import { eventAnswersOf, eventPeopleOf } from "./events/store";
import { NAME_TAKEN_OFF, answerColumns } from "./exportTable";
import type { SurveyAnswer } from "./items";
import { namesOf } from "./names";
import { whoOf } from "./onePersonLayout";
import { hiddenLinesForEach } from "./personFacts";
import { answersOf, isOpen, peopleOf } from "./repo";
import { groupsOfAnswers } from "./resultsFilters";
import { ANSWERS_WORDS, PERSON_WORDS, answersRecordedWords, notAnsweredLineWords, sentHowWords } from "./words";

/**
 * A SURVEY'S ANSWERS TAB, for admins: every answer in one table,
 * one person to a row, by name, with how they came (a member or a guest, after
 * an event) or their group (a programme's survey), one column for each
 * question as the spreadsheet with names lays it out (`answerColumns`, so the
 * tab is the download), and the questions they left blank with the button
 * that sends them; below it, who it was sent to and has not answered yet.
 * Names, never an address: an account's as the admin opening the tab is
 * shown it (the names rule, `nameForViewer`: in full), a guest's as they gave
 * it to the event.
 *
 * OPENING THE TAB IS RECORDED FIRST (`openSurveyNamesRecorded`, kind
 * `survey-table`), with everybody whose answers it shows, before any name is
 * read: until then only the survey, its answers and who it was sent to are
 * read, by id. When the row cannot be written, nothing of the tab is read and
 * the page shows nothing. Every opening is recorded, one with no answers yet
 * included. The page asks for this once it is open in the admin's browser,
 * so a prefetch of its address records and reads nothing.
 *
 * Admins only: the one caller is the route, which refuses a view-as session
 * and everybody but an admin before it reads anything.
 */

export type AnswersRow = {
  /** Their page's address segment (`whoOf`), or null for an answer whose name has come off. */
  who: string | null;
  name: string;
  /** "Member" or "Guest" after an event; their group on a programme's survey; "" on a check-in. */
  as: string;
  /** "After their first session", on a before survey, or "". */
  note: string;
  /** One value per column, as the spreadsheet writes it: "" for no answer. */
  cells: string[];
  /** "Sent Fri 20 Nov, 2:14pm, from their own link." */
  sent: string;
  /** The questions they left blank, and the button that sends them, or null. */
  blanks: BlanksRow | null;
};

export type AnswersView = {
  /** "You’re seeing names because you’re an admin. Opening this tab was recorded: Zach, Sat 21 Nov, 11:02am." */
  recorded: string;
  /** The heading of the column beside the name: "As", "Group", or "" for none. */
  asHeading: string;
  columns: string[];
  rows: AnswersRow[];
  notAnswered: { who: string; name: string; line: string }[];
};

export type AnswersOpening =
  /** Names have come off the survey's answers: there is nobody's to show. Nothing was recorded. */
  | { kind: "names-off" }
  /** The opening could not be recorded, so nothing of the tab was read. */
  | { kind: "not-recorded" }
  | { kind: "open"; view: AnswersView };

/** The admin opening the tab: who is recorded, and their role, for the name each person is shown by (`nameForViewer`). */
type Actor = { uid: string; displayName?: string | null; role?: string | null };

/** An answer as the tab lays it out. */
type Answer = {
  id: string;
  respondent: EventRespondent | null;
  answers: Record<string, SurveyAnswer>;
  sentAt: Date | null;
  via: SurveyAnswerVia;
  afterFirstSession: boolean;
};

/** Who it was sent to, as the tab reads them: their row's facts, never a name. */
type Row = {
  respondent: EventRespondent;
  sentAt: Date | null;
  answered: boolean;
  reminders: number;
  blanks: Parameters<typeof blanksRowOf>[0]["link"];
  blanksPresses: Parameters<typeof blanksRowOf>[0]["presses"];
};

const firstWordOf = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** Everything of the tab, named as `viewer` is shown people: called only once the opening is recorded. */
async function readTable(
  db: Firestore,
  survey: SurveyDoc,
  answers: readonly Answer[],
  rows: readonly Row[],
  recorded: string,
  now: Date,
  viewer: NameViewer,
): Promise<AnswersView> {
  const event = isEventSurvey(survey);
  const columns = answerColumns(survey.items);
  const unanswered = rows.filter((row) => row.sentAt !== null && !row.answered);
  const pressers = rows.flatMap((row) => row.blanksPresses.map((press) => press.byUid));

  // Names: an account's, as the admin looking is shown it, and after an event,
  // the name a guest gave it.
  const accounts = await namesOf(
    db,
    [
      ...answers.flatMap((answer) => (answer.respondent?.kind === "account" ? [answer.respondent.uid] : [])),
      ...unanswered.flatMap((row) => (row.respondent.kind === "account" ? [row.respondent.uid] : [])),
      ...pressers,
    ],
    viewer,
  );
  const guests = new Map<string, string>();
  if (isEventSurvey(survey)) {
    const read = await readEventAudience(db, survey.audience.eventId, viewer);
    for (const member of read?.people ?? []) guests.set(member.key, member.name);
  }
  const nameOf = (respondent: EventRespondent | null): string => {
    if (!respondent) return NAME_TAKEN_OFF;
    if (respondent.kind === "account") return accounts.get(respondent.uid) ?? PERSON_WORDS.accountGone;
    return guests.get(respondentKey(respondent)) ?? PERSON_WORDS.guestGone;
  };

  // How each came, or their group.
  const programme = !event && !isCheckIn(survey);
  const { groups, groupOf } = programme ? await groupsOfAnswers(db, survey) : { groups: new Map<string, string>(), groupOf: new Map<string, string | null>() };
  const asOf = (answer: Answer): string => {
    if (event) return answer.respondent ? (answer.respondent.kind === "account" ? ANSWERS_WORDS.member : ANSWERS_WORDS.guest) : "";
    if (!programme) return "";
    const group = groupOf.get(answer.id) ?? null;
    return group ? (groups.get(group) ?? ANSWERS_WORDS.noGroup) : ANSWERS_WORDS.noGroup;
  };

  // The questions each left blank, as one person's page counts them.
  const hidden = event
    ? new Map<string, string[]>()
    : await hiddenLinesForEach(db, survey, answers.flatMap((answer) => (answer.respondent?.kind === "account" ? [answer.respondent.uid] : [])));
  const rowOf = new Map(rows.map((row) => [respondentKey(row.respondent), row]));
  const open = isOpen(survey, now);
  const blanksOfAnswer = (answer: Answer): BlanksRow | null => {
    if (!answer.respondent) return null;
    const row = rowOf.get(respondentKey(answer.respondent));
    if (!row) return null;
    const lines = answer.respondent.kind === "account" ? (hidden.get(answer.respondent.uid) ?? []) : [];
    return blanksRowOf({
      count: blanksOf(survey.items, answer.answers, { hiddenLines: lines }).length,
      open,
      link: row.blanks,
      presses: row.blanksPresses,
      nameOf: (uid) => accounts.get(uid) ?? "",
    });
  };

  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "en-GB");
  return {
    recorded,
    asHeading: event ? ANSWERS_WORDS.as : programme ? ANSWERS_WORDS.group : "",
    columns: columns.map((column) => column.header),
    rows: answers
      .map((answer) => ({
        who: answer.respondent ? whoOf(answer.respondent) : null,
        name: nameOf(answer.respondent),
        as: asOf(answer),
        note: answer.afterFirstSession ? ANSWERS_WORDS.afterFirst : "",
        cells: columns.map((column) => column.cell(answer.answers)),
        sent: sentHowWords(answer.sentAt, answer.via, event),
        blanks: blanksOfAnswer(answer),
      }))
      // Names taken off last, then the order the spreadsheet keeps.
      .sort((a, b) => Number(a.who === null) - Number(b.who === null) || byName(a, b)),
    notAnswered: unanswered
      .map((row) => ({ who: whoOf(row.respondent), name: nameOf(row.respondent), line: notAnsweredLineWords(row.sentAt, row.reminders) }))
      .sort(byName),
  };
}

/** Open the Answers tab: the opening recorded first, then the table read. */
export async function openAnswersTable(db: Firestore, actor: Actor, survey: SurveyDoc, now: Date): Promise<AnswersOpening> {
  if (survey.namesOffAt !== null) return { kind: "names-off" };
  // Read before the opening: the answers and who it was sent to, by id. No name.
  const [answers, rows]: [Answer[], Row[]] = isEventSurvey(survey)
    ? await Promise.all([
        eventAnswersOf(db, survey).then((list) => list.map((answer) => ({ ...answer, afterFirstSession: false }))),
        eventPeopleOf(db, survey.id),
      ])
    : await Promise.all([answersOf(db, survey), peopleOf(db, survey.id)]);
  const subjects = answers.flatMap((answer) => (answer.respondent ? [answer.respondent] : []));
  const actorName = (actor.displayName ?? "").trim() || "An admin";
  const recorded = answersRecordedWords(firstWordOf(actorName) || actorName, now);
  const opened = await openSurveyNamesRecorded(
    db,
    { kind: "survey-table", actorUid: actor.uid, actorName, surveyId: survey.id, subjects },
    () => readTable(db, survey, answers, rows, recorded, now, actor),
  );
  if (!opened.ok) return { kind: "not-recorded" };
  return { kind: "open", view: opened.value };
}
