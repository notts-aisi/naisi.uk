import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { runsCheckIn } from "@/lib/events/checkInAccess";
import { NO_NAMES_OFF } from "@/lib/events/checkInView";
import type { EventAudience, EventSurveyDoc } from "@/lib/firestore/surveys";
import type { NameViewer } from "@/lib/names/staffName";
import { shortLinkAddress } from "@/lib/qr/shortLinkCode";
import { preview, testView, type EmailPreview, type SurveyState, type TestView } from "../adminView";
import { blanksOf, blanksRowOf, type BlanksRow } from "../blanks";
import { emailWordsFor, siteAddress } from "../emails";
import { surveyQuestionsOf } from "../items";
import { whoOf } from "../onePersonLayout";
import { namesOf } from "../names";
import { closedOn, isOpen, surveyState } from "../repo";
import { signerOf, testStateFor } from "../sending";
import {
  dayAndClockWords,
  dayWords,
  namesInWords,
  peopleWords,
  progressWords,
  remindLeadWords,
  remindedWords,
  sizeWords,
  summaryClosesWords,
} from "../words";
import { respondentKey, type EventAudienceMember } from "./audience";
import { findSurveyCode } from "./code";
import { readEventSendPlan, type EventSendPlan } from "./sending";
import { eventAnswersOf } from "./store";
import { AUDIENCE_WORDS, eventLine, eventNamesOffWords, joinedSentHead } from "./words";

/**
 * WHAT THE ADMINS' PAGES ABOUT A SURVEY AFTER AN EVENT ARE HANDED, built on
 * the server in the boards' words (sv-send, sv-list, sv-results), never a
 * stored document. Admins only: every page that calls these sits in the
 * (admin-only) tree or asks `canRunSurveys` first.
 */

/** "4:30pm on Sun 1 Nov" and the like, for when the code went up. */
const since = (at: Date) => dayAndClockWords(at);

/** The organiser's first name, and whether they see who came (the check-in bar), for the summary's line about results. */
async function organiserOf(db: Firestore, authorUid: string | null): Promise<{ name: string; seesWhoCame: boolean } | null> {
  if (!authorUid || authorUid.includes("/")) return null;
  const snap = await db.collection("users").doc(authorUid).get();
  if (!snap.exists) return null;
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    name: firstNameOfUser(data),
    seesWhoCame: runsCheckIn({ role: typeof data.role === "string" ? data.role : null, suRecognised: data.suRecognised === true }),
  };
}

/** "Admins only. Iris, the organiser, sees who came, not the results." (Q42) */
export function resultsWhoWords(organiser: { name: string; seesWhoCame: boolean } | null): string {
  if (!organiser || !organiser.name) return "Admins only. The event’s organisers see that it went, not the results.";
  return `Admins only. ${organiser.name}, the organiser, sees ${organiser.seesWhoCame ? "who came" : "how many came"}, not the results.`;
}

/** Who reads a survey after an event's results, as its Results tab says (Q42): admins, and not the organiser. */
export async function resultsWhoFor(db: Firestore, survey: EventSurveyDoc): Promise<string> {
  const snap = await db.collection("events").doc(survey.audience.eventId).get();
  const authorUid = snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>).authorUid : null;
  const organiser = await organiserOf(db, typeof authorUid === "string" ? authorUid : null);
  const who = resultsWhoWords(organiser);
  return organiser?.name ? `${who.replace(/\.$/, "")}: send ${organiser.name} the summary.` : who;
}

/** One audience as the Send tab's choice draws it, before the first email. */
export type AudienceChoice = {
  kind: EventAudience["kind"];
  /** "Everyone who came, with an email". */
  label: string;
  /** How many it holds that the email can reach. */
  total: number;
  /** "15 who signed up and checked in, and 2 walk-ins who left an email", or "". */
  detail: string;
  /** Of those, how many answered at the event already. */
  answered: number;
  /** Who its email would reach now. */
  emails: number;
};

export type EventSendView = {
  state: SurveyState;
  /** The event is gone: nothing more can be sent. */
  gone: boolean;
  /** The site cannot write a link: nothing can be sent. */
  noAddress: boolean;
  /** "VR games night · Sun 1 Nov". */
  eventLine: string;
  /** The audience it holds now; fixed once the email has gone. */
  audience: EventAudience["kind"];
  /** Nobody signs up for the event: its email goes only to the people who came. */
  noSignup: boolean;
  /** Before the first email: the two audiences to pick from. */
  choices: AudienceChoice[] | null;
  /** The QR code: its address, whether it is switched on, and since when it takes answers. */
  code: { slug: string; address: string; active: boolean } | null;
  /** "Sun 1 Nov, 4:30pm", once it takes answers. */
  openSince: string;
  /** Answers sent signed in with the QR code. */
  qrAnswers: number;
  /** The email, before it goes. */
  email: EmailPreview | null;
  test: TestView;
  /** After it: what went, the progress of the people it went to, who came since and the reminder. */
  log: { at: string; line: string; email: EmailPreview | null }[];
  progress: string;
  share: number;
  joined: { emails: number; names: string[]; nobody: string } | null;
  remind: { lead: string; email: EmailPreview | null; test: TestView; emails: number } | null;
  /** `closes`: "Closes" and its deadline, or once it has closed, "Closed" and the day (`summaryClosesWords`). */
  summary: { name: string; size: string; atEvent: string; byEmail: string; closes: { label: string; value: string } | null; results: string; namesOff: string };
};

/**
 * "15 who signed up and checked in, and 2 walk-ins who left an email": the
 * board's words. Somebody with an account who came without a sign-up (they
 * checked themselves in with the door code) left no email: the survey goes
 * to their account's address, so they are said apart, "1 who came without
 * signing up" (not drawn: listed in the build notes for the boards'
 * designers to confirm).
 */
export function cameDetail(members: readonly EventAudienceMember[]): string {
  const withEmail = members.filter((member) => member.address !== null);
  const bySignup = withEmail.filter((member) => member.cameBySignup).length;
  const accounts = withEmail.filter((member) => !member.cameBySignup && member.respondent.kind === "account").length;
  const walkIns = withEmail.length - bySignup - accounts;
  const parts = [`${bySignup} who signed up and checked in`];
  if (accounts > 0) parts.push(`${accounts} who came without signing up`);
  if (walkIns > 0) parts.push(`${walkIns} ${walkIns === 1 ? "walk-in" : "walk-ins"} who left an email`);
  return parts.length < 2 ? parts[0] : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/** "Emailed the 14 people who came, with an email". */
function firstWords(n: number, kind: EventAudience["kind"]): string {
  return `Emailed the ${peopleWords(n)} ${kind === "event-came" ? "who came, with an email" : "who signed up"}`;
}

/** The Send tab of a survey after an event, for the admin who would press (`presserUid`), named as `viewer` is shown people. */
export async function eventSendView(db: Firestore, survey: EventSurveyDoc, presserUid: string, now: Date, viewer: NameViewer): Promise<EventSendView> {
  const [plan, signer, code] = await Promise.all([
    readEventSendPlan(db, survey, viewer),
    signerOf(db, presserUid),
    findSurveyCode(db, survey.audience.eventId),
  ]);
  const state = surveyState(survey, now);
  const surveyWords = emailWordsFor(survey, "survey", signer);
  const reminderWords = emailWordsFor(survey, "reminder", signer);
  const answers = await eventAnswersOf(db, survey);
  const qrAnswers = answers.filter((answer) => answer.via === "signed-in").length;
  const organiser = await organiserOf(db, plan.read?.event.authorUid ?? null);
  const noSignup = plan.read?.event.noSignup === true;
  const owed = plan.audiences[survey.audience.kind].owed;
  const ends = closedOn(survey);

  const summary = {
    name: survey.name,
    size: sizeWords(surveyQuestionsOf(survey.items).length, survey.minutes),
    atEvent: survey.firstSentAt
      ? `The QR code, up since ${since(survey.firstSentAt)}. ${qrAnswers} ${qrAnswers === 1 ? "answer" : "answers"} so far.`
      : "The QR code takes answers once you open it.",
    byEmail: plan.firstEmailed
      ? `${peopleWords(plan.emailed)}, each with their own link.`
      : `${peopleWords(owed.length)}, each with their own link, once you send it.`,
    closes: summaryClosesWords(survey, state === "closed"),
    results: resultsWhoWords(organiser),
    namesOff: survey.namesOffOn ? eventNamesOffWords(survey.namesOffOn) : "",
  };
  const base = {
    state,
    gone: plan.gone,
    noAddress: !siteAddress(),
    eventLine: eventLine(survey.event.title, survey.event.startAt),
    audience: survey.audience.kind,
    noSignup,
    code: code ? { slug: code.slug, address: shortLinkAddress(code.slug), active: code.active } : null,
    openSince: survey.firstSentAt ? since(survey.firstSentAt) : "",
    qrAnswers,
    summary,
  };

  if (!plan.firstEmailed) {
    const answeredKeys = new Set(plan.rows.filter((row) => row.answered).map((row) => respondentKey(row.respondent)));
    const choices: AudienceChoice[] = (["event-came", "event-signups"] as const)
      .filter((kind) => kind === "event-came" || !noSignup)
      .map((kind) => {
        const members = plan.audiences[kind].members.filter((member) => member.address !== null);
        return {
          kind,
          label: AUDIENCE_WORDS[kind],
          total: members.length,
          detail: kind === "event-came" ? cameDetail(plan.audiences[kind].members) : "",
          answered: members.filter((member) => answeredKeys.has(member.key)).length,
          emails: plan.audiences[kind].owed.length,
        };
      });
    return {
      ...base,
      choices,
      email: surveyWords ? preview(surveyWords, owed.length, null) : null,
      test: testView(testStateFor(survey, "survey", signer), survey.tests.survey?.at ?? null, now),
      log: [],
      progress: "",
      share: 0,
      joined: null,
      remind: null,
    };
  }

  const names = new Map((plan.read?.people ?? []).map((member) => [member.key, member.name]));
  const byPress = new Map<string, string[]>();
  for (const row of plan.rows.filter((each) => each.sentAt !== null)) {
    const list = byPress.get(row.pressId) ?? [];
    list.push(names.get(respondentKey(row.respondent)) ?? "");
    byPress.set(row.pressId, list);
  }
  const log = survey.presses.map((press) => {
    const at = press.at ? dayAndClockWords(press.at) : "";
    if (press.kind === "first") return { at, line: firstWords(press.count, survey.audience.kind), email: surveyWords ? preview(surveyWords, press.count, press.at) : null };
    if (press.kind === "joined") {
      const pressNames = (byPress.get(press.id) ?? []).filter(Boolean).sort((a, b) => a.localeCompare(b, "en"));
      const head = joinedSentHead(survey.audience.kind, press.count);
      return { at, line: pressNames.length > 0 ? `${head}: ${namesInWords(pressNames)}` : head, email: null };
    }
    return { at, line: remindedWords(press.count), email: null };
  });
  const open = state === "open";
  const lastSent = [...survey.presses].reverse().find((press) => press.kind !== "remind")?.at ?? now;
  return {
    ...base,
    choices: null,
    email: null,
    test: testView("none", null, now),
    log,
    progress: ends ? progressWords(plan.answeredEmail, plan.emailed, ends, !open) : "",
    share: plan.emailed > 0 ? plan.answeredEmail / plan.emailed : 0,
    joined: open
      ? {
          emails: owed.length,
          names: owed.map((member) => member.name),
          nobody: `Nobody new since ${dayWords(lastSent)}. When someone is added as having come, or their sign-up is confirmed, a button here sends it to them.`,
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
  };
}

/** Who answered, for admins (`viewer`, who is shown names by the names rule): name, when it was emailed, when and how they answered. */
export async function eventAnsweredView(
  db: Firestore,
  survey: EventSurveyDoc,
  viewer: NameViewer,
  plan?: EventSendPlan,
  now: Date = new Date(),
): Promise<{
  rows: { name: string; who: string; sent: string; answered: string; how: string; label: string; reminded: string; blanks: BlanksRow | null }[];
  answered: number;
  sent: number;
  heading: string;
}> {
  const read = plan ?? (await readEventSendPlan(db, survey, viewer));
  const answers = await eventAnswersOf(db, survey);
  const names = new Map((read.read?.people ?? []).map((member) => [member.key, member.name]));
  const byKey = new Map(answers.flatMap((answer) => (answer.respondent ? [[respondentKey(answer.respondent), answer] as const] : [])));
  const pressers = await namesOf(db, read.rows.flatMap((row) => row.blanksPresses.map((press) => press.byUid)), viewer);
  const open = isOpen(survey, now);
  const rows = read.rows
    .filter((row) => row.sentAt !== null || row.answered)
    .map((row) => {
      const key = respondentKey(row.respondent);
      const answer = byKey.get(key);
      const blanks = answer
        ? blanksRowOf({
            count: blanksOf(survey.items, answer.answers).length,
            open,
            link: row.blanks,
            presses: row.blanksPresses,
            nameOf: (uid) => pressers.get(uid) ?? "",
          })
        : null;
      return {
        name: names.get(key) ?? (row.respondent.kind === "guest" ? "A guest no longer on the list" : "Somebody whose account has gone"),
        who: whoOf(row.respondent),
        sent: row.sentAt ? dayAndClockWords(row.sentAt) : "",
        answered: answer?.sentAt ? dayAndClockWords(answer.sentAt) : row.answered ? "Answered" : "",
        how: answer ? (answer.via === "signed-in" ? "With the QR code, signed in" : "Personal link") : "",
        label: "",
        reminded: row.reminders > 0 ? `Reminded ${row.reminders === 1 ? "once" : `${row.reminders} times`}` : "",
        blanks,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  const answered = read.rows.filter((row) => row.answered).length;
  const atEvent = read.answeredAtEvent;
  return {
    rows,
    answered,
    sent: read.emailed,
    heading: `${answered} ${answered === 1 ? "has" : "have"} answered: ${atEvent} with the QR code before any email, and ${read.answeredEmail} of the ${read.emailed} it was emailed to`,
  };
}

/** The numbers above a survey after an event's results (sv-results): answers, who came, and the email's rate. */
export type EventResultsHead = {
  answers: number;
  /** "7 with the QR code, 8 by email". */
  answersLine: string;
  came: number;
  /** "15 who signed up, 3 walk-ins". */
  cameLine: string;
  /** "8 of 14", or "" before the email. */
  emailRate: string;
  /** "Sent Mon 2 Nov, 10am", or "". */
  emailLine: string;
};

export async function eventResultsHead(db: Firestore, survey: EventSurveyDoc): Promise<EventResultsHead> {
  const [plan, answers] = await Promise.all([readEventSendPlan(db, survey), eventAnswersOf(db, survey)]);
  const qr = answers.filter((answer) => answer.via === "signed-in").length;
  const came = plan.audiences["event-came"].members;
  // Somebody whose name has come off reaches nobody and still came, as the
  // event's Check-in tab counts them.
  const namesOff = plan.read?.namesOff ?? NO_NAMES_OFF;
  const bySignup = came.filter((member) => member.cameBySignup).length + namesOff.signups;
  const total = came.length + namesOff.signups + namesOff.walkIns;
  const first = survey.presses.find((press) => press.kind === "first");
  return {
    answers: answers.length,
    answersLine: `${qr} with the QR code, ${answers.length - qr} by email`,
    came: total,
    cameLine: `${bySignup} who signed up, ${total - bySignup} ${total - bySignup === 1 ? "walk-in" : "walk-ins"}`,
    emailRate: plan.firstEmailed ? `${plan.answeredEmail} of ${plan.emailed}` : "",
    emailLine: first?.at ? `Sent ${dayAndClockWords(first.at)}` : "",
  };
}
