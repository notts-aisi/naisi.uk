import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser, fullNameOfUser } from "@/lib/courses/programmeLead";
import { openSurveyAnswersRecorded, surveyAnswersOpeningsOf, type OpeningSubject } from "@/lib/firestore/recordOpenings";
import {
  isEventSurvey,
  isProgrammeAudience,
  programmeOf,
  type SurveyDoc,
  type SurveyKind,
} from "@/lib/firestore/surveys";
import { readEventAudience, respondentKey } from "./events/audience";
import { eventPersonOn } from "./events/store";
import { eventMeta } from "./events/words";
import { personTables, type PersonSurvey, type PersonView } from "./onePersonLayout";
import { toldGroupOf } from "./personFacts";
import { listSurveys, personOnSurveys } from "./repo";
import {
  PERSON_WORDS,
  answeredSummaryWords,
  nameComesOffWords,
  nothingToOpenWords,
  openingLineWords,
  personNoticeWords,
  programmeLine,
  surveyComesOffWords,
} from "./words";

/**
 * ONE PERSON'S ANSWERS, OPENED BY AN ADMIN (sv-person): to every survey of the
 * programme the survey belongs to, or to a survey after an event. Usually for
 * a request to see or delete them.
 *
 * THE OPENING IS RECORDED BEFORE ANYTHING OF THE ANSWERS IS READ
 * (`openSurveyAnswersRecorded`, `src/lib/firestore/recordOpenings.ts`): who
 * opened them, whose they were, the survey they were opened from, every survey
 * shown, and when. Before that, only the surveys' own records are read (their
 * questions and who they are for, never anybody's row or answer). When the
 * row cannot be written, nothing of the person is read and the page shows
 * nothing of them.
 *
 * Admins only: the one caller is the route that opens them, which refuses a
 * view-as session and everybody but an admin before it reads anything.
 *
 * Every value handed back is built here, field by field: never a stored
 * document.
 */

/** The order a programme's surveys are shown in, start to finish. */
const STAGE_ORDER: readonly SurveyKind[] = ["before", "after", "followUp6", "followUp12", "leaving", "event"];

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Who `who` names on `survey`: an account by its uid, or on a survey after an
 * event a guest as `g_<signupId>` (the sign-up, or the check-in that brought
 * them). Null for anything else.
 */
export function subjectOf(survey: SurveyDoc, who: string): OpeningSubject | null {
  if (typeof who !== "string" || !ID.test(who)) return null;
  if (isEventSurvey(survey) && who.startsWith("g_")) {
    const signupId = who.slice(2);
    return ID.test(signupId) ? { kind: "guest", signupId } : null;
  }
  return { kind: "account", uid: who };
}

/**
 * The surveys the page shows: a survey after an event alone; for a programme's
 * survey, every survey of the same programme that has been sent or opened
 * (the four stages and leaving), in the order of a programme, read from the
 * whole surveys collection (a handful a term). Survey records only.
 */
export async function surveysShownWith(db: Firestore, survey: SurveyDoc): Promise<SurveyDoc[]> {
  if (isEventSurvey(survey)) return [survey];
  const { roundId, programmeId } = programmeOf(survey.audience);
  if (!roundId || !programmeId) return [survey];
  const all = await listSurveys(db);
  return all
    .filter((each) => !isEventSurvey(each) && isProgrammeAudience(each.audience, roundId, programmeId))
    .filter((each) => each.id === survey.id || each.firstSentAt !== null)
    .sort(
      (a, b) =>
        STAGE_ORDER.indexOf(a.kind) - STAGE_ORDER.indexOf(b.kind) ||
        (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
        a.id.localeCompare(b.id),
    );
}

export type PersonOpening =
  /** `who` names nobody this survey could hold. Nothing was recorded or read. */
  | { kind: "nobody" }
  /** Every survey shown has had its names taken off: nobody's answers can be opened. Nothing was recorded or read. */
  | { kind: "names-off" }
  /** The opening could not be recorded, so nothing of the person was read. */
  | { kind: "not-recorded" }
  | { kind: "open"; view: PersonView };

type Actor = { uid: string; displayName?: string | null };

/** What was read, once the opening was recorded. */
type Read = {
  name: string | null;
  firstName: string;
  group: string;
  surveys: PersonSurvey[];
};

/** The person's name: their account's, or the name a guest gave the event. Null when the account or the guest is gone. */
async function nameOf(db: Firestore, survey: SurveyDoc, subject: OpeningSubject): Promise<{ name: string | null; firstName: string }> {
  if (subject.kind === "account") {
    const snap = await db.collection("users").doc(subject.uid).get();
    if (!snap.exists) return { name: null, firstName: "" };
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    return { name: fullNameOfUser(data), firstName: firstNameOfUser(data) };
  }
  if (!isEventSurvey(survey)) return { name: null, firstName: "" };
  const read = await readEventAudience(db, survey.audience.eventId);
  const member = read?.people.find((each) => each.key === respondentKey(subject)) ?? null;
  return member ? { name: member.name, firstName: member.name.trim().split(/\s+/)[0] ?? "" } : { name: null, firstName: "" };
}

/** Everything of the person on the surveys shown: called only once the opening is recorded. */
async function readPerson(db: Firestore, opened: SurveyDoc, shown: readonly SurveyDoc[], subject: OpeningSubject): Promise<Read> {
  const { name, firstName } = await nameOf(db, opened, subject);
  const surveys: PersonSurvey[] = [];
  let group = "";
  if (isEventSurvey(opened)) {
    const { row, answer } = await eventPersonOn(db, opened, subject);
    surveys.push({
      id: opened.id,
      kind: opened.kind,
      title: opened.title,
      name: opened.name,
      items: opened.items,
      answers: answer ? answer.answers : null,
      sentAt: answer?.sentAt ?? null,
      sentToThemAt: row?.sentAt ?? null,
      onIt: row !== null || answer !== null,
    });
  } else if (subject.kind === "account") {
    const [{ rows, answers }, told] = await Promise.all([
      personOnSurveys(db, shown, subject.uid),
      toldGroupOf(db, opened.runId, subject.uid),
    ]);
    group = told?.group.name ?? "";
    for (const survey of shown) {
      const row = rows.get(survey.id) ?? null;
      const answer = answers.get(survey.id) ?? null;
      surveys.push({
        id: survey.id,
        kind: survey.kind,
        title: survey.title,
        name: survey.name,
        items: survey.items,
        answers: answer ? answer.answers : null,
        sentAt: answer?.sentAt ?? null,
        sentToThemAt: row?.sentAt ?? null,
        onIt: row !== null || answer !== null,
      });
    }
  }
  return { name, firstName, group, surveys };
}

/** "Amara’s name comes off on Sat 9 Dec 2028." and the totals line, or one line per survey when their days differ. */
function namesOffLines(shown: readonly SurveyDoc[], surveys: readonly PersonSurvey[], firstName: string): string[] {
  const days = shown.flatMap((survey) =>
    surveys.some((each) => each.id === survey.id && (each.onIt || each.answers !== null)) && survey.namesOffOn ? [{ name: survey.name, day: survey.namesOffOn }] : [],
  );
  const distinct = [...new Set(days.map((each) => each.day))];
  if (distinct.length === 0) return [];
  if (distinct.length === 1 && firstName) return [`${nameComesOffWords(firstName, distinct[0])} ${PERSON_WORDS.stayInTotals}`];
  return [...days.map((each) => surveyComesOffWords(each.name, each.day)), PERSON_WORDS.stayInTotals];
}

/**
 * Open one person's answers: the opening recorded first, then everything of
 * them read and laid out. `now` stands in for the opening's own time until
 * its row is read back.
 */
export async function openPersonAnswers(
  db: Firestore,
  actor: Actor,
  survey: SurveyDoc,
  who: string,
  now: Date,
): Promise<PersonOpening> {
  const subject = subjectOf(survey, who);
  if (!subject) return { kind: "nobody" };
  const shown = await surveysShownWith(db, survey);
  if (shown.every((each) => each.namesOffAt !== null)) return { kind: "names-off" };

  const opened = await openSurveyAnswersRecorded(
    db,
    {
      actorUid: actor.uid,
      actorName: (actor.displayName ?? "").trim() || "An admin",
      subject,
      surveyId: survey.id,
      surveyIds: shown.map((each) => each.id),
    },
    () => readPerson(db, survey, shown, subject),
  );
  if (!opened.ok) return { kind: "not-recorded" };
  const read = opened.value;

  const ids = new Set(shown.map((each) => each.id));
  const openings = (await surveyAnswersOpeningsOf(db, subject)).filter((row) => row.surveyIds.some((id) => ids.has(id)));
  const thisOne = openings.find((row) => row.id === opened.openingId)?.at ?? now;

  const name = read.name ?? (subject.kind === "account" ? PERSON_WORDS.accountGone : PERSON_WORDS.guestGone);
  const on = read.surveys.filter((each) => each.onIt || each.answers !== null);
  const answered = on.filter((each) => each.answers !== null).length;
  const meta = [
    isEventSurvey(survey) ? eventMeta(survey.event.title, survey.event.startAt) : programmeLine(survey.programmeKind, survey.programmeName),
    ...(read.group ? [read.group] : []),
    ...(on.length > 0 ? [answeredSummaryWords(answered, on.length)] : []),
  ];
  const tables = personTables(read.surveys);
  const nothing =
    on.length > 0 ? "" : subject.kind === "account" && read.name === null ? PERSON_WORDS.deleted : nothingToOpenWords(name);
  return {
    kind: "open",
    view: {
      name,
      key: subject.kind === "account" ? subject.uid : respondentKey(subject),
      meta,
      notice: personNoticeWords(thisOne),
      nothing,
      change: nothing ? null : tables.change,
      rest: nothing ? [] : tables.rest,
      namesOff: nothing ? [] : namesOffLines(shown, read.surveys, read.firstName),
      openings: openings.map((row) => ({
        name: row.actorName || "An admin",
        key: row.actorUid || row.id,
        line: openingLineWords(row.actorName || "An admin", row.at),
      })),
    },
  };
}
