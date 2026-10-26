import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SurveyDoc, SurveyPersonDoc } from "@/lib/firestore/surveys";
import { changeBetween, lookBackBetween, type ChangeResult, type PairedAnswers } from "./change";
import { emailWordsFor, siteAddress, surveyLinkPath } from "./emails";
import { consentItemsOf, surveyQuestionsOf } from "./items";
import { namesOf } from "./names";
import { answersOf, chainOf, closedOn, peopleOf, readSurvey, surveyState } from "./repo";
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
  leaversWords,
  namesOffWords,
  nobodyNewWords,
  notAnsweredWords,
  openSinceWords,
  peopleWords,
  programmeLine,
  progressWords,
  reachedWords,
  remindLeadWords,
  remindedWords,
  sizeWords,
  testSentWords,
  SEND_WORDS,
  type AudienceKind,
  type ReachWord,
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

/** "Closes Wed 4 Nov", "Closed Wed 4 Nov", or a leaving survey's "No closing date" while it is open. */
function closesFor(survey: SurveyDoc, state: SurveyState): string {
  const ends = closedOn(survey);
  if (state === "draft") return "";
  if (!ends) return survey.kind === "leaving" ? LIST_WORDS.neverCloses : "";
  return closesWords(ends, state === "closed");
}

function rowOf(survey: SurveyDoc, people: readonly SurveyPersonDoc[], now: Date): ListRow {
  const state = surveyState(survey, now);
  const sent = people.filter((person) => person.sentAt !== null).length;
  const answered = people.filter((person) => person.answered).length;
  return {
    id: survey.id,
    name: survey.name,
    programme: programmeLine(survey.programmeKind, survey.programmeName),
    state,
    answers: state === "draft" ? LIST_WORDS.notSent : answeredOf(answered, sent),
    share: state === "draft" ? null : sent > 0 ? answered / sent : 0,
    closes: closesFor(survey, state),
    // Nobody is reminded of a leaving survey: it reaches each person as they leave.
    unanswered: state === "open" && sent > answered && survey.kind !== "leaving" ? notAnsweredWords(sent - answered) : "",
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
  /** "Closes Wed 4 Nov", "Closed Wed 4 Nov", "No closing date". */
  closes: string;
  answered: number;
  /** A leaving survey: opened rather than sent, so its fourth tab is Open. */
  leaving: boolean;
};

export function headView(survey: SurveyDoc, people: readonly SurveyPersonDoc[], now: Date): HeadView {
  const state = surveyState(survey, now);
  const ends = closedOn(survey);
  return {
    id: survey.id,
    name: survey.name,
    state,
    programme: programmeLine(survey.programmeKind, survey.programmeName),
    closes: ends ? closesWords(ends, state === "closed") : survey.kind === "leaving" ? LIST_WORDS.neverCloses : "",
    answered: people.filter((person) => person.answered).length,
    leaving: survey.kind === "leaving",
  };
}

/**
 * A leaving survey's Open tab (Q46): what opening it does, the way to see it
 * as people will, and once open, since when and how many it has reached.
 */
export type OpenView = {
  state: SurveyState;
  /** The survey's test link, which keeps nothing: "/survey/<its test secret>". */
  testHref: string | null;
  /** "Open since Thu 29 Oct.", once open. */
  since: string;
  /** "3 people have left since it opened, and 1 has answered.", once open. */
  reached: string;
  summary: { name: string; size: string; who: string; namesOff: string };
};

export function openView(survey: SurveyDoc, people: readonly SurveyPersonDoc[], now: Date): OpenView {
  const state = surveyState(survey, now);
  const answered = people.filter((person) => person.answered).length;
  return {
    state,
    testHref: survey.testToken ? surveyLinkPath(survey.testToken) : null,
    since: survey.firstSentAt ? openSinceWords(survey.firstSentAt) : "",
    reached: survey.firstSentAt ? reachedWords(survey.reached, answered) : "",
    summary: {
      name: survey.name,
      size: sizeWords(surveyQuestionsOf(survey.items).length, survey.minutes),
      who: leaversWords(survey.programmeName),
      namesOff: survey.namesOffOn ? namesOffWords(survey.namesOffOn) : "",
    },
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

/** One question's totals, with what it is compared against. */
export type ResultRow = QuestionResult & {
  /** How it changed since an earlier survey of the programme, for people who answered both. */
  change: ChangeResult | null;
  /** Beside it: this question against the one in this survey that looks back on it. */
  lookBack: ChangeResult | null;
};

export type ResultsView = {
  /** Answers counted. */
  answers: number;
  /**
   * People it was sent to, by its record of each send: every response rate is
   * of these. For a leaving survey, which nobody sends, the people it reached
   * as they left (`reached`).
   */
  sent: number;
  /** How those people came to it, as the page says it. */
  reach: ReachWord;
  /** Answers left out because they came after the person's first session. */
  leftOut: number;
  /** Whether the before-first-session switch means anything here: a before survey, or one paired with one. */
  offersFirstSession: boolean;
  /** The earlier surveys compared with, and how many answered each. */
  pairedWith: { name: string; answers: number }[];
  /** True once names have come off: answers no longer pair by person. */
  namesOff: boolean;
  questions: ResultRow[];
  /** What the consent boxes say now, of the people it was sent to. */
  consents: { label: string; yes: number; of: number }[];
};

function paired(answers: readonly { respondent: { uid: string } | null; answers: PairedAnswers["answers"] }[]): PairedAnswers[] {
  return answers.flatMap((answer) => (answer.respondent ? [{ uid: answer.respondent.uid, answers: answer.answers }] : []));
}

/**
 * Totals and comments, made here, with n and the response rate beside them;
 * for a survey that pairs with an earlier one, how each shared question
 * changed for the people who answered both, and the look-back beside it.
 * `beforeFirstSession` leaves out before-survey answers sent after the
 * person's first session: this survey's own when it is the before survey,
 * the earlier side's when it pairs with one.
 *
 * `commentsInOrder: "words"` lists each question's comments by their words,
 * not in the order they came in: the programme's lead's reading, so the order
 * of the comments says nothing of when, or after whom, each was written.
 */
export async function resultsView(
  db: Firestore,
  survey: SurveyDoc,
  beforeFirstSession: boolean,
  options: { commentsInOrder?: "arrival" | "words" } = {},
): Promise<ResultsView> {
  const [answers, people, chain] = await Promise.all([answersOf(db, survey), peopleOf(db, survey.id), chainOf(db, survey)]);
  const leaveOut = (list: Awaited<ReturnType<typeof answersOf>>, kind: SurveyDoc["kind"]) =>
    beforeFirstSession && kind === "before" ? list.filter((answer) => !answer.afterFirstSession) : list;
  const kept = leaveOut(answers, survey.kind);
  let leftOut = answers.length - kept.length;
  const earlier = await Promise.all(
    chain.map(async (each) => {
      const all = await answersOf(db, each);
      const counted = leaveOut(all, each.kind);
      leftOut += all.length - counted.length;
      return { survey: each, answers: counted };
    }),
  );
  // Who it was sent to, as the survey's own record of each send says: it
  // outlives the people rows, which go when names come off. A leaving survey
  // is sent to nobody: its own count of the people it reached as they left.
  const leaving = survey.kind === "leaving";
  const sent = leaving ? survey.reached : survey.presses.filter((press) => press.kind !== "remind").reduce((sum, press) => sum + press.count, 0);
  const rows = people.filter((person) => person.sentAt !== null);
  const mine = paired(kept);
  const questions = surveyQuestionsOf(survey.items);
  const inWords = (result: QuestionResult): QuestionResult =>
    options.commentsInOrder === "words" && result.kind === "comments"
      ? { ...result, comments: [...result.comments].sort((a, b) => a.localeCompare(b, "en-GB")) }
      : result;
  const results = surveyResults(survey.items, kept).map(inWords).map((result): ResultRow => {
    const question = questions.find((each) => each.id === result.id)!;
    // The earliest survey of the pairs that asks the same question, the same way.
    const source = earlier.find((each) => surveyQuestionsOf(each.survey.items).some((asked) => asked.id === question.id && asked.type === question.type));
    const asked = source ? surveyQuestionsOf(source.survey.items).find((each) => each.id === question.id)! : null;
    const back = questions.find((each) => each.lookBackOf === question.id) ?? null;
    return {
      ...result,
      change: source && asked ? changeBetween(source.survey.name, asked, question, paired(source.answers), mine) : null,
      lookBack: back ? lookBackBetween(question, back, mine, back.title) : null,
    };
  });
  const consents = consentItemsOf(survey.items).flatMap((item) =>
    item.boxes.map((box) => ({
      label: box.label,
      yes: rows.filter((person) => person.consents[box.purpose] === true).length,
      of: rows.length,
    })),
  );
  return {
    answers: kept.length,
    sent,
    reach: leaving ? "it reached" : "it was sent to",
    leftOut,
    offersFirstSession: survey.kind === "before" || chain.some((each) => each.kind === "before"),
    pairedWith: earlier.map((each) => ({ name: each.survey.name, answers: each.answers.length })),
    namesOff: survey.namesOffAt !== null || earlier.some((each) => each.survey.namesOffAt !== null),
    questions: results,
    consents,
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
