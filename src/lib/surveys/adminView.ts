import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SurveyDoc, SurveyPersonDoc } from "@/lib/firestore/surveys";
import { emailWordsFor, siteAddress } from "./emails";
import { surveyQuestionsOf } from "./items";
import { namesOf } from "./names";
import { answersOf, closedOn, peopleOf, readSurvey, surveyState } from "./repo";
import { surveyResults, type QuestionResult } from "./results";
import { readSendPlan, signerOf, testStateFor } from "./sending";
import {
  LIST_WORDS,
  SURVEY_FROM_NAME,
  SURVEY_REPLY_TO,
  answeredOf,
  audienceKindOf,
  audienceWords,
  closesWords,
  dayAndClockWords,
  deadlineWords,
  firstSentWords,
  joinedSentWords,
  namesOffWords,
  nobodyNewWords,
  notAnsweredWords,
  peopleWords,
  programmeLine,
  progressWords,
  remindLeadWords,
  remindedWords,
  sizeWords,
  testSentWords,
  SEND_WORDS,
  type AudienceKind,
  type SurveyEmailWords,
} from "./words";

/**
 * WHAT THE ADMINS' SURVEY PAGES ARE HANDED, built on the server: plain
 * values in the boards' words, never a stored document. Admins only: the
 * pages that call these sit in the (admin-only) tree.
 */

export type SurveyState = "draft" | "open" | "closed";

export type ListRow = {
  id: string;
  name: string;
  programme: string;
  state: SurveyState;
  /** "20 of 32", or "Not sent yet". */
  answers: string;
  /** Share of the bar, 0 to 1, or null for a draft. */
  share: number | null;
  /** "Closes Wed 4 Nov", "Closed Wed 4 Nov", or "" for a draft. */
  closes: string;
  /** "12 haven’t answered", while open and somebody hasn't. */
  unanswered: string;
};

export type ListView = { open: ListRow[]; drafts: ListRow[]; closed: ListRow[] };

function rowOf(survey: SurveyDoc, people: readonly SurveyPersonDoc[], now: Date): ListRow {
  const state = surveyState(survey, now);
  const sent = people.filter((person) => person.sentAt !== null).length;
  const answered = people.filter((person) => person.answered).length;
  const ends = closedOn(survey);
  return {
    id: survey.id,
    name: survey.name,
    programme: programmeLine(survey.programmeKind, survey.programmeName),
    state,
    answers: state === "draft" ? LIST_WORDS.notSent : answeredOf(answered, sent),
    share: state === "draft" ? null : sent > 0 ? answered / sent : 0,
    closes: state === "draft" || !ends ? "" : closesWords(ends, state === "closed"),
    unanswered: state === "open" && sent > answered ? notAnsweredWords(sent - answered) : "",
  };
}

export async function listView(db: Firestore, surveys: readonly SurveyDoc[], now: Date): Promise<ListView> {
  const rows = await Promise.all(surveys.map(async (survey) => rowOf(survey, await peopleOf(db, survey.id), now)));
  return {
    open: rows.filter((row) => row.state === "open"),
    drafts: rows.filter((row) => row.state === "draft"),
    closed: rows.filter((row) => row.state === "closed"),
  };
}

export type HeadView = {
  id: string;
  name: string;
  state: SurveyState;
  programme: string;
  /** "Closes Wed 4 Nov", "Closed Wed 4 Nov". */
  closes: string;
  answered: number;
};

export function headView(survey: SurveyDoc, people: readonly SurveyPersonDoc[], now: Date): HeadView {
  const state = surveyState(survey, now);
  const ends = closedOn(survey);
  return {
    id: survey.id,
    name: survey.name,
    state,
    programme: programmeLine(survey.programmeKind, survey.programmeName),
    closes: ends ? closesWords(ends, state === "closed") : "",
    answered: people.filter((person) => person.answered).length,
  };
}

/** An email as the Send tab shows it: its envelope and its words. */
export type EmailPreview = {
  subject: string;
  from: string;
  replyTo: string;
  to: string;
  /** "Thu 29 Oct, 9am" once sent. */
  sent: string;
  paragraphs: string[];
  button: string;
  signOff: string[];
};

function preview(words: SurveyEmailWords, to: number, sent: Date | null): EmailPreview {
  return {
    subject: words.subject,
    from: `${SURVEY_FROM_NAME} <${fromAddress()}>`,
    replyTo: SURVEY_REPLY_TO,
    to: peopleWords(to),
    sent: sent ? dayAndClockWords(sent) : "",
    paragraphs: words.paragraphs,
    button: words.button,
    signOff: words.signOff,
  };
}

/** The address the site sends from, as the email's envelope shows it. */
function fromAddress(): string {
  return (process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? "").trim() || "the site’s own address";
}

export type TestView = { fresh: boolean; line: string };

export type SendView = {
  state: SurveyState;
  /** Who it reaches: holding a place at the start, still holding one at the end, or said yes to follow-ups. */
  audienceKind: AudienceKind;
  /** The form or its programme has gone: nothing can be sent. */
  gone: boolean;
  /** The site cannot write a link: nothing can be sent. */
  noAddress: boolean;
  /** Before the first send: the email, its test and the button. */
  first: { email: EmailPreview | null; test: TestView; emails: number } | null;
  /** After it: what went, who joined since, and the reminder. */
  log: { at: string; line: string; email: EmailPreview | null }[];
  progress: string;
  share: number;
  /** `nobody` is the board's sentence for when nobody has joined since. */
  joined: { heading: string; emails: number; names: string[]; nobody: string } | null;
  remind: { lead: string; email: EmailPreview | null; test: TestView; emails: number } | null;
  /** `labelled`: whether answers are labelled by the person's first session, which only a before survey does. */
  summary: { name: string; size: string; who: string; closes: string; namesOff: string; labelled: boolean };
};

function testView(fresh: "none" | "stale" | "fresh", at: Date | null, now: Date): TestView {
  return { fresh: fresh === "fresh", line: fresh === "fresh" && at ? testSentWords(at, now) : "" };
}

export async function sendView(db: Firestore, survey: SurveyDoc, presserUid: string, now: Date): Promise<SendView> {
  const [plan, signer] = await Promise.all([readSendPlan(db, survey), signerOf(db, presserUid)]);
  const state = surveyState(survey, now);
  const surveyWords = emailWordsFor(survey, "survey", signer);
  const reminderWords = emailWordsFor(survey, "reminder", signer);
  const questions = surveyQuestionsOf(survey.items).length;
  const ends = closedOn(survey);
  const audienceKind = audienceKindOf(survey.audience, survey.kind);
  const summary = {
    name: survey.name,
    size: sizeWords(questions, survey.minutes),
    who: audienceWords(survey.programmeName, plan.holders.length, audienceKind),
    closes: survey.closesAt ? deadlineWords(survey.closesAt) : "",
    namesOff: survey.namesOffOn ? namesOffWords(survey.namesOffOn) : "",
    labelled: survey.kind === "before",
  };

  if (state === "draft") {
    return {
      state,
      audienceKind,
      gone: plan.gone,
      noAddress: !siteAddress(),
      first: {
        email: surveyWords ? preview(surveyWords, plan.owed.length, null) : null,
        test: testView(testStateFor(survey, "survey", signer), survey.tests.survey?.at ?? null, now),
        emails: plan.owed.length,
      },
      log: [],
      progress: "",
      share: 0,
      joined: null,
      remind: null,
      summary,
    };
  }

  // What went, in order, each in the board's words.
  const joinedNames = new Map<string, string[]>();
  const joinedRows = plan.people.filter((person) => person.sentAt !== null);
  const names = await namesOf(db, joinedRows.map((person) => person.respondent.uid));
  for (const person of joinedRows) {
    const list = joinedNames.get(person.pressId) ?? [];
    list.push(names.get(person.respondent.uid) ?? "");
    joinedNames.set(person.pressId, list);
  }
  const log = survey.presses.map((press) => {
    const at = press.at ? dayAndClockWords(press.at) : "";
    if (press.kind === "first") {
      return { at, line: firstSentWords(press.count, audienceKind), email: surveyWords ? preview(surveyWords, press.count, press.at) : null };
    }
    if (press.kind === "joined") {
      const pressNames = (joinedNames.get(press.id) ?? []).filter(Boolean).sort((a, b) => a.localeCompare(b, "en"));
      return { at, line: joinedSentWords(pressNames, press.count, audienceKind), email: null };
    }
    return { at, line: remindedWords(press.count), email: null };
  });

  const ownedNames = await namesOf(db, plan.owed.map((holder) => holder.uid));
  const lastSent = [...survey.presses].reverse().find((press) => press.kind !== "remind")?.at ?? survey.firstSentAt ?? now;
  const open = state === "open";
  return {
    state,
    audienceKind,
    gone: plan.gone,
    noAddress: !siteAddress(),
    first: null,
    log,
    progress: ends ? progressWords(plan.answered, plan.sent, ends, !open) : "",
    share: plan.sent > 0 ? plan.answered / plan.sent : 0,
    joined: open
      ? {
          heading: audienceKind === "followUps" ? SEND_WORDS.saidYesSince : SEND_WORDS.joinedSince,
          emails: plan.owed.length,
          names: plan.owed.map((holder) => ownedNames.get(holder.uid) ?? holder.name),
          nobody: nobodyNewWords(lastSent, audienceKind),
        }
      : null,
    remind: open
      ? {
          lead: remindLeadWords(plan.unanswered.length),
          email: reminderWords ? preview(reminderWords, plan.unanswered.length, null) : null,
          test: testView(testStateFor(survey, "reminder", signer), survey.tests.reminder?.at ?? null, now),
          emails: plan.unanswered.length,
        }
      : null,
    summary,
  };
}

export type AnsweredRow = {
  name: string;
  /** "Thu 29 Oct, 9am": when it was sent to them. */
  sent: string;
  /** "Thu 29 Oct, 7:41pm", or "" while they haven't answered. */
  answered: string;
  how: string;
  /** "After their first session", or "". */
  label: string;
  reminded: string;
};

export async function answeredView(db: Firestore, survey: SurveyDoc): Promise<{ rows: AnsweredRow[]; answered: number; sent: number }> {
  const [people, answers] = await Promise.all([peopleOf(db, survey.id), answersOf(db, survey)]);
  const byUid = new Map(answers.flatMap((answer) => (answer.respondent ? [[answer.respondent.uid, answer] as const] : [])));
  const sent = people.filter((person) => person.sentAt !== null);
  const names = await namesOf(db, sent.map((person) => person.respondent.uid));
  const rows = sent
    .map((person) => {
      const answer = byUid.get(person.respondent.uid);
      return {
        name: names.get(person.respondent.uid) ?? "Somebody whose account has gone",
        sent: person.sentAt ? dayAndClockWords(person.sentAt) : "",
        answered: answer?.sentAt ? dayAndClockWords(answer.sentAt) : person.answered ? "Answered" : "",
        how: answer ? (answer.via === "signed-in" ? "Signed in" : "Personal link") : "",
        label: answer?.afterFirstSession ? "After their first session" : "",
        reminded: person.reminders > 0 ? `Reminded ${person.reminders === 1 ? "once" : `${person.reminders} times`}` : "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  return { rows, answered: people.filter((person) => person.answered).length, sent: sent.length };
}

export type ResultsView = {
  answers: number;
  /** Answers left out because they came after the person's first session. */
  leftOut: number;
  questions: QuestionResult[];
};

/** Totals and comments, made here; `beforeFirstSession` leaves out answers sent after it. */
export async function resultsView(db: Firestore, survey: SurveyDoc, beforeFirstSession: boolean): Promise<ResultsView> {
  const answers = await answersOf(db, survey);
  const kept = beforeFirstSession ? answers.filter((answer) => !answer.afterFirstSession) : answers;
  return {
    answers: kept.length,
    leftOut: answers.length - kept.length,
    questions: surveyResults(survey.items, kept),
  };
}

/** One survey's page: the survey, its people and its head, or null when there is no such survey. */
export async function surveyPage(
  db: Firestore,
  surveyId: string,
  now: Date,
): Promise<{ survey: SurveyDoc; people: SurveyPersonDoc[]; head: HeadView } | null> {
  const survey = await readSurvey(db, surveyId);
  if (!survey) return null;
  const people = await peopleOf(db, survey.id);
  return { survey, people, head: headView(survey, people, now) };
}
