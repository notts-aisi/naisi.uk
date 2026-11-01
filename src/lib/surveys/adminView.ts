import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isCheckIn, isEventSurvey, type SurveyAnswerDoc, type SurveyDoc, type SurveyPersonDoc } from "@/lib/firestore/surveys";
import type { NameViewer } from "@/lib/names/staffName";
import { eventPeopleOf } from "./events/store";
import { eventMeta } from "./events/words";
import { mergedAnswers } from "./blanks";
import { changeBetween, lookBackBetween, type ChangeResult, type PairedAnswers } from "./change";
import { byWords, commentsWithKeys } from "./charts";
import { emailWordsFor, siteAddress, surveyLinkPath } from "./emails";
import { consentItemsOf, surveyQuestionsOf } from "./items";
import { namesOf } from "./names";
import { answersOf, chainOf, closedOn, peopleOf, readSurvey, sentCountOf, surveyState } from "./repo";
import { surveyResults, type QuestionResult } from "./results";
import { readSendPlan, signerOf, testStateFor } from "./sending";
import {
  LIST_WORDS,
  SURVEY_FROM_NAME,
  SURVEY_REPLY_TO,
  audienceKindOf,
  audienceWords,
  closesWords,
  dayAndClockWords,
  firstSentWords,
  joinedSentWords,
  leaversWords,
  namesOffWords,
  nobodyNewWords,
  notReachedWords,
  openSinceWords,
  peopleWords,
  programmeLine,
  progressWords,
  reachedWords,
  remindLeadWords,
  remindedWords,
  sizeWords,
  summaryClosesWords,
  testSentWords,
  SEND_WORDS,
  type AudienceKind,
  type ReachWord,
  type SurveyEmailWords,
} from "./words";

/**
 * WHAT THE ADMINS' SURVEY PAGES ARE HANDED, built on the server: plain
 * values in the boards' words, never a stored document. Admins only: the
 * pages that call these sit in the (admin-only) tree. Run NAISI › Surveys
 * itself, every survey by what it is for, is `./hub/`.
 */

export type SurveyState = "draft" | "open" | "closed";

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
  /** A check-in: opened from a group's register, so its fourth tab is Opening. */
  checkIn: boolean;
  /** A survey after an event: the way back is to Surveys' Events tab. */
  event: boolean;
};

export function headView(survey: SurveyDoc, people: readonly { answered: boolean }[], now: Date): HeadView {
  const state = surveyState(survey, now);
  const ends = closedOn(survey);
  return {
    id: survey.id,
    name: survey.name,
    state,
    programme: isEventSurvey(survey)
      ? eventMeta(survey.event.title, survey.event.startAt)
      : isCheckIn(survey)
        ? `${programmeLine(survey.programmeKind, survey.programmeName)} · ${survey.checkIn.groupName}`
        : programmeLine(survey.programmeKind, survey.programmeName),
    closes: ends ? closesWords(ends, state === "closed") : survey.kind === "leaving" ? LIST_WORDS.neverCloses : "",
    answered: people.filter((person) => person.answered).length,
    leaving: survey.kind === "leaving",
    checkIn: isCheckIn(survey),
    event: isEventSurvey(survey),
  };
}

/**
 * A leaving survey's Open tab: what opening it does, the way to see it
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

export function preview(words: SurveyEmailWords, to: number, sent: Date | null): EmailPreview {
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
  /** `closes`: "Closes" and its deadline, or once it has closed, "Closed" and the day (`summaryClosesWords`). */
  summary: { name: string; size: string; who: string; closes: { label: string; value: string } | null; namesOff: string; labelled: boolean };
};

export function testView(fresh: "none" | "stale" | "fresh", at: Date | null, now: Date): TestView {
  return { fresh: fresh === "fresh", line: fresh === "fresh" && at ? testSentWords(at, now) : "" };
}

/** The Send tab, for the admin who would press (`presserUid`, who signs its email), named as `viewer` is shown people. */
export async function sendView(db: Firestore, survey: SurveyDoc, presserUid: string, now: Date, viewer: NameViewer): Promise<SendView> {
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
    closes: summaryClosesWords(survey, state === "closed"),
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
  const names = await namesOf(db, joinedRows.map((person) => person.respondent.uid), viewer);
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

  const ownedNames = await namesOf(db, plan.owed.map((holder) => holder.uid), viewer);
  const lastSent = [...survey.presses].reverse().find((press) => press.kind !== "remind")?.at ?? survey.firstSentAt ?? now;
  const open = state === "open";
  return {
    state,
    audienceKind,
    gone: plan.gone,
    noAddress: !siteAddress(),
    first: null,
    log,
    // While it is open, the people it no longer reaches are said beside who
    // answered, so "3 of 8 have answered" and "Remind 4" add up.
    progress: ends ? progressWords(plan.answered, plan.sent, ends, !open, open ? notReachedWords(plan.notReached, audienceKind) : "") : "",
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
  /**
   * FOR ADMINS ALONE, and only when asked for (`keys`): beside each comments
   * question, the id of the answer each of its comments came from, in the
   * order of `comments`, for "Whose is this?". Null when not asked: the lead's
   * pages never ask, so no key reaches them.
   */
  commentKeys: Record<string, string[]> | null;
};

function paired(answers: readonly { respondent: { uid: string } | null; answers: PairedAnswers["answers"] }[]): PairedAnswers[] {
  return answers.flatMap((answer) => (answer.respondent ? [{ uid: answer.respondent.uid, answers: answer.answers }] : []));
}

/**
 * The answers a survey's results count: every one, or with the switch on, a
 * before survey's without those sent after the person's first session. From
 * an answer sent before it, so is anything the person sent later, after it,
 * in the questions they had left blank (merged again without those sends).
 * One rule for the Results, "See who" and the file of one question.
 */
export function keptAnswers(list: readonly SurveyAnswerDoc[], kind: SurveyDoc["kind"], beforeFirstSession: boolean): SurveyAnswerDoc[] {
  if (!beforeFirstSession || kind !== "before") return [...list];
  return list
    .filter((answer) => !answer.afterFirstSession)
    .map((answer) =>
      answer.fills.some((fill) => fill.afterFirstSession)
        ? { ...answer, answers: mergedAnswers(answer.first, answer.fills.filter((fill) => !fill.afterFirstSession)) }
        : answer,
    );
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
 * of the comments says nothing of when, or after whom, each was written, and
 * the admins' too.
 *
 * `only` narrows this survey's answers to some of them, by an admin's filter
 * (`./resultsFilters.ts`), after the switch; a survey it pairs with is read
 * whole, so the change is of the narrowed people who answered both. `keys`
 * hands back each comment's answer id beside it (`commentKeys`), for admins.
 */
export async function resultsView(
  db: Firestore,
  survey: SurveyDoc,
  beforeFirstSession: boolean,
  options: { commentsInOrder?: "arrival" | "words"; only?: ((answer: { id: string }) => boolean) | null; keys?: boolean } = {},
): Promise<ResultsView> {
  const [answers, people, chain] = await Promise.all([answersOf(db, survey), peopleOf(db, survey.id), chainOf(db, survey)]);
  const only = options.only ?? null;
  const own = only ? answers.filter(only) : answers;
  const kept = keptAnswers(own, survey.kind, beforeFirstSession);
  let leftOut = own.length - kept.length;
  const earlier = await Promise.all(
    chain.map(async (each) => {
      const read = await answersOf(db, each);
      const counted = keptAnswers(read, each.kind, beforeFirstSession);
      leftOut += read.length - counted.length;
      return { survey: each, answers: counted };
    }),
  );
  // Who it was sent to, as the survey's own record of each send says: it
  // outlives the people rows, which go when names come off. A leaving survey
  // is sent to nobody: its own count of the people it reached as they left.
  const leaving = survey.kind === "leaving";
  const sent = leaving ? survey.reached : sentCountOf(survey);
  const rows = people.filter((person) => person.sentAt !== null);
  const mine = paired(kept);
  const questions = surveyQuestionsOf(survey.items);
  const commentKeys: Record<string, string[]> | null = options.keys ? {} : null;
  const inWords = (result: QuestionResult): QuestionResult => {
    if (result.kind !== "comments") return result;
    if (!commentKeys) {
      return options.commentsInOrder === "words" ? { ...result, comments: [...result.comments].sort(byWords) } : result;
    }
    // For admins: each comment with the answer it came from, the same comments
    // in the same order (`commentsWithKeys`), put in order together.
    const question = questions.find((each) => each.id === result.id)!;
    const keyed = commentsWithKeys(question, kept);
    const ordered = options.commentsInOrder === "words" ? [...keyed].sort((a, b) => byWords(a.text, b.text)) : keyed;
    commentKeys[result.id] = ordered.map((comment) => comment.key);
    return { ...result, comments: ordered.map((comment) => comment.text) };
  };
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
    commentKeys,
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
  // A survey after an event counts its guests' answers too (./events/store.ts).
  return { survey, people, head: headView(survey, isEventSurvey(survey) ? await eventPeopleOf(db, survey.id) : people, now) };
}
