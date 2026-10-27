import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { listForms } from "@/lib/applications/handover/run";
import { own } from "@/lib/applications/keys";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { headcountOf } from "@/lib/courses/finishing/headcount";
import { readFinishing } from "@/lib/courses/finishing/record";
import { readRunRecords } from "@/lib/courses/programmeAttendance";
import { lastTaughtWeek } from "@/lib/courses/weekPlan";
import { runsCheckIn } from "@/lib/events/checkInAccess";
import { loadEventAtTheDoor } from "@/lib/events/checkInLoad";
import { doorRows } from "@/lib/events/checkInView";
import { anyCheckInBefore, doorListSignups, eventEnds } from "@/lib/events/checkIns";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeEvent, type EventDoc } from "@/lib/firestore/events";
import { isProgrammeAudience, type SurveyAnswerDoc, type SurveyDoc } from "@/lib/firestore/surveys";
import { resultsView } from "../adminView";
import type { PairedAnswers } from "../change";
import { eventSurveyOf } from "../events/records";
import { answersOf, canRunSurveys, closedOn, listSurveys, sentCountOf, surveyState } from "../repo";
import { closesWords } from "../words";
import { chooseTerm } from "./choose";
import { buildTermView, type CountedCheckIn, type TermEvent, type TermProgramme, type TermView } from "./model";
import { monthWords } from "./words";

/**
 * WHAT THIS TERM IN NUMBERS IS COUNTED FROM, read once on the server and
 * handed to `buildTermView`, which counts. Every number comes through the
 * reader the page it belongs to already uses, so the two can never disagree:
 *
 *  - CAME: each event's Check-in tab's own rows, `doorRows` over the event's
 *    sign-ups and check-ins as `loadEventAtTheDoor` reads them for the tab
 *    and the door list: every row with a check-in, and every check-in whose
 *    names have come off, which is what the tab's "came" counts
 *    (`doorCounts` with `namesOffOf`).
 *  - DIFFERENT PEOPLE, AND WHO CAME TO TWO OR MORE: the same counted
 *    check-ins, told apart by account, and by the address on a sign-up made
 *    without one (each account's own address joins the two). A walk-in with
 *    no account is never matched: the address a walk-in leaves is for that
 *    event's survey and nothing else. Nor is a check-in whose names have come
 *    off: it is one more person nobody can match.
 *  - SURVEY ANSWERS AND "HOW WAS IT?": the event's survey (`eventSurveyOf`)
 *    through its Results tab's own reader (`resultsView`).
 *  - STARTED AND FINISHED: the Kairos report's count (`headcountOf`).
 *  - ANSWERED BOTH, AND C1 AT EACH END: the change view's pairing (`bothOf`,
 *    in the model) over the programme's before survey and its survey at the
 *    end (the oldest of each, as the Kairos report takes them); C1 counted
 *    over the people who answered it in both, with that number beside it, as
 *    public numbers, the Kairos report and Results count it.
 *  - THE AFTER SURVEY'S ANSWERS OF HOW MANY: every answer it holds, of the
 *    people its sends reached (`sentCountOf`), as its Results tab counts them.
 *
 * ADMINS ONLY. The page and the file's route decide that first, and it is
 * asked again here before anything is read: the bar for surveys
 * (`canRunSurveys`) and, since the check-ins read here name people, the bar
 * for who came (`runsCheckIn`), which every admin passes.
 *
 * Every read is one document, one equality on one field, or one range on one
 * field, so none needs a declared index.
 */

/** The term the page is about: its form's name, and the time its events are counted from. */
export type TermOf = { roundId: string; label: string; opensAt: Date };

export type LoadedTerm = { term: TermOf; view: TermView };

/** The template's "How was it?": the same id on every survey after an event (`events/template.ts`). */
const HOW_WAS_IT = "q_ev_how";
/** The column says "out of 5": an average is shown only for a question on five points. */
const POINTS = 5;

/** An address as the sign-up route stores one, so an account's and a sign-up's compare. */
const addressKey = (raw: string) => `address:${raw.trim().toLowerCase()}`;
const accountKey = (uid: string) => `account:${uid}`;
const isPlainId = (value: string) => value.length > 0 && !value.includes("/");

/** The answers that still carry their person, as the change view pairs them. */
function paired(answers: readonly SurveyAnswerDoc[]): PairedAnswers[] {
  return answers.flatMap((answer) => (answer.respondent ? [{ uid: answer.respondent.uid, answers: answer.answers }] : []));
}

type ReadEvent = { input: TermEvent; uids: string[]; firstCheckIn: Date | null };

/** One event: who its Check-in tab counts as having come, and its survey. */
async function readEvent(db: Firestore, event: EventDoc, startAt: Date): Promise<ReadEvent | null> {
  const atTheDoor = await loadEventAtTheDoor(db, event.id);
  if (!atTheDoor) return null;
  const { signups, checkIns } = atTheDoor;
  const rows = doorRows(doorListSignups(signups), checkIns);
  const recordOf = new Map(checkIns.map((checkIn) => [checkIn.id, checkIn]));
  const signupOf = new Map(signups.map((signup) => [signup.id, signup]));

  const counted: CountedCheckIn[] = [];
  const uids: string[] = [];
  for (const row of rows) {
    if (!row.checkIn) continue;
    const record = recordOf.get(row.checkIn.id);
    const signup = row.rsvpId ? signupOf.get(row.rsvpId) : undefined;
    const uid = record?.uid ?? signup?.uid ?? null;
    const keys: string[] = [];
    if (uid) {
      keys.push(accountKey(uid));
      uids.push(uid);
    }
    if (signup && signup.email.trim()) keys.push(addressKey(signup.email));
    counted.push({ how: row.checkIn.how, keys });
  }
  // A check-in whose names have come off has no row, and the tab counts it:
  // one more person who came, whom nothing can match.
  for (const checkIn of checkIns) if (checkIn.namesOff) counted.push({ how: checkIn.how, keys: [], namesOff: true });
  const first = checkIns.reduce<Date | null>((at, checkIn) => (checkIn.at && (!at || checkIn.at < at) ? checkIn.at : at), null);

  const survey = await eventSurveyOf(db, event.id);
  let surveyInput: TermEvent["survey"] = null;
  if (survey) {
    if (!survey.firstSentAt) {
      surveyInput = { sent: false, answers: 0, average: null };
    } else {
      const results = await resultsView(db, survey, false);
      const how = results.questions.find((question) => question.id === HOW_WAS_IT);
      const row = how && how.kind === "scale" && how.rows.length === 1 ? how.rows[0] : null;
      surveyInput = { sent: true, answers: results.answers, average: row && row.counts.length === POINTS ? row.mean : null };
    }
  }

  return {
    input: {
      title: event.title.trim() || "Untitled event",
      startAt,
      endsAt: eventEnds(event) ?? startAt,
      noSignup: event.noSignup === true,
      counted,
      survey: surveyInput,
    },
    uids,
    firstCheckIn: first,
  };
}

/**
 * Each account's own address, so a sign-up made without an account and one
 * made with it are one person. Addressed reads of the uids the check-ins
 * name, never a query over `users`.
 */
async function joinAccountAddresses(db: Firestore, events: ReadEvent[]): Promise<void> {
  const uids = [...new Set(events.flatMap((event) => event.uids))].filter(isPlainId);
  const addresses = new Map<string, string>();
  for (let at = 0; at < uids.length; at += 300) {
    const snaps = await db.getAll(...uids.slice(at, at + 300).map((uid) => db.collection("users").doc(uid)));
    for (const snap of snaps) {
      const email = snap.exists ? (snap.data() ?? {}).email : null;
      if (typeof email === "string" && email.trim()) addresses.set(snap.id, addressKey(email));
    }
  }
  for (const event of events) {
    for (const checkIn of event.input.counted) {
      const account = checkIn.keys.find((key) => key.startsWith("account:"));
      const address = account ? addresses.get(account.slice("account:".length)) : undefined;
      if (address && !checkIn.keys.includes(address)) checkIn.keys.push(address);
    }
  }
}

/** The term's published events that have started, oldest first: one range on `startAt` from the form's opening. */
async function termEvents(db: Firestore, opensAt: Date, now: Date): Promise<{ event: EventDoc; startAt: Date }[]> {
  const snap = await db.collection("events").where("startAt", ">=", opensAt).get();
  return snap.docs
    .map((doc) => normalizeEvent(doc.id, doc.data() ?? {}))
    .flatMap((event) => (event.status === "published" && event.startAt && event.startAt.getTime() <= now.getTime() ? [{ event, startAt: event.startAt }] : []))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || a.event.id.localeCompare(b.event.id));
}

/** One programme of the term's form, when it names a run that is there. */
async function readProgramme(
  db: Firestore,
  form: ApplicationForm,
  programmeId: string,
  surveys: readonly SurveyDoc[],
  now: Date,
): Promise<TermProgramme | null> {
  const settings = own(form.programmes, programmeId);
  if (!settings?.runId || !isPlainId(settings.runId)) return null;
  const records = await readRunRecords(db, settings.runId);
  if (!records) return null;
  const finishing = await readFinishing(db, settings.runId);
  const count = headcountOf(records, finishing, now);

  // One survey of each stage, the oldest should there be two, as the Kairos report takes them.
  const stage = (kind: "before" | "after") =>
    surveys
      .filter((survey) => survey.kind === kind && isProgrammeAudience(survey.audience, form.round.id, programmeId))
      .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.id.localeCompare(b.id))[0] ?? null;
  const beforeSurvey = stage("before");
  const afterSurvey = stage("after");
  const before = beforeSurvey && beforeSurvey.firstSentAt ? { items: beforeSurvey.items, answers: paired(await answersOf(db, beforeSurvey)) } : null;
  let after: TermProgramme["after"] = null;
  if (afterSurvey) {
    const state = surveyState(afterSurvey, now);
    const answers = state === "draft" ? [] : await answersOf(db, afterSurvey);
    const ends = closedOn(afterSurvey);
    after = {
      items: afterSurvey.items,
      answers: paired(answers),
      state,
      closes: ends && state !== "draft" ? closesWords(ends, state === "closed") : "",
      answered: answers.length,
      sent: sentCountOf(afterSurvey),
    };
  }
  return {
    name: settings.name.trim() || settings.shortName.trim() || "Programme",
    started: count.started.length,
    finished: count.finished,
    before,
    after,
    comes: { month: monthWords(count.end.lastDateKey), lastWeek: lastTaughtWeek(records.run.weekPlan) },
  };
}

/**
 * This term's numbers, for `viewer` at `now`; null when the viewer may not
 * have them, and a term of null when no form has opened yet.
 */
export async function loadTermNumbers(db: Firestore, viewer: SessionUser, now: Date): Promise<LoadedTerm | { term: null } | null> {
  if (!canRunSurveys(viewer) || !runsCheckIn(viewer)) return null;
  const form = chooseTerm(await listForms(db), now);
  const opensAt = form?.round.opensAt ?? null;
  if (!form || !opensAt) return { term: null };

  const found = await termEvents(db, opensAt, now);
  const read = (await Promise.all(found.map(({ event, startAt }) => readEvent(db, event, startAt)))).filter((each): each is ReadEvent => each !== null);
  await joinAccountAddresses(db, read);

  // When check-in was first used: a check-in from before the term means it
  // was there for every event of it; otherwise the first its events hold.
  const firsts = read.flatMap((event) => (event.firstCheckIn ? [event.firstCheckIn] : []));
  const checkInSince = (await anyCheckInBefore(db, opensAt)) ? opensAt : firsts.length > 0 ? new Date(Math.min(...firsts.map((at) => at.getTime()))) : null;

  const surveys = await listSurveys(db);
  const programmes: TermProgramme[] = [];
  for (const programmeId of form.programmeIds) {
    const programme = await readProgramme(db, form, programmeId, surveys, now);
    if (programme) programmes.push(programme);
  }

  const label = form.round.label.trim();
  return {
    term: { roundId: form.round.id, label, opensAt },
    view: buildTermView({ label, events: read.map((event) => event.input), checkInSince, programmes }),
  };
}
