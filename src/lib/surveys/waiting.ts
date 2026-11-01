import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { hasBeenTold, isInTerm } from "@/lib/applications/decisions";
import { holdsPlaceOn } from "@/lib/applications/handover/holders";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import { loadApplication, loadDecision } from "@/lib/applications/staffRepo";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";
import type { SessionUser } from "@/lib/firebase/session";
import { courseEnrolmentId, enrolmentHasLeft, normalizeCourseEnrolment, placementIsTold } from "@/lib/firestore/courseEnrolments";
import {
  SURVEY_PEOPLE_COLLECTION,
  isCheckIn,
  isEventAudience,
  normalizeSurveyPerson,
  programmeOf,
  type SurveyDoc,
  type SurveyKind,
  type SurveyPersonDoc,
} from "@/lib/firestore/surveys";
import { CHECK_IN_CARD_WORDS, checkInCardClosesWords } from "./checkIns/words";
import { surveyLinkPath } from "./emails";
import { surveyQuestionsOf } from "./items";
import { isOpen, ownAnswerOf, readSurvey } from "./repo";
import { CARD_WORDS, cardSizeWords, closesWords, dateKeyWords, dayWords } from "./words";

/**
 * A SURVEY WAITING FOR SOMEBODY: the one answer to "is there a survey for
 * this person to answer now?", which Home, My programmes and week 1's page
 * all ask (Q50 B), and nothing else decides. `docs/surveys.md`, "The cards".
 *
 * A survey waits for a person while all three hold:
 *
 *  - IT IS OPEN (`isOpen`): sent, not closed by hand, and before its closing
 *    time;
 *  - IT IS THEIRS: they have a row on it that was sent to them, and for a
 *    programme's survey before it or at its end, they still hold a place on
 *    the programme, by the one test the survey's own reminder asks
 *    (`holdsPlaceOn`, which `placeHoldersOn` asks for everybody), so somebody
 *    who gave their place back or left is not asked again. A follow-up is
 *    theirs once it was sent to them: it went because they said yes. A
 *    leaving survey is theirs while their seat on the run still says they
 *    left: their row was made as they left, and somebody put back on the
 *    programme is not asked why they left. A check-in at the end of a
 *    session is theirs while their seat on its run is live and told: their
 *    row was made because the register marked them there;
 *  - THEY HAVE NOT ANSWERED IT.
 *
 * What a card says is the survey's own record: its title, its programme, how
 * many questions and minutes, when it closes, and "Answer". NEVER HOW MANY
 * OTHERS HAVE ANSWERED: nothing of anybody else is read here, only the
 * person's own rows, their own application and their own decision.
 *
 * Each card links the person's own link (`/survey/<secret>`), the page their
 * email opens, so it opens their own row whatever the run's own gate says
 * about them that day. It is drawn only on the person's own pages.
 *
 * NOT READ IN A VIEW-AS SESSION, asked before anything is read: a person's
 * rows, their link and their application are their own, and an admin viewing
 * the site as them is shown no card.
 *
 * THE SURVEY AT THE END has a card of its own on its programme's pages
 * ("The survey at the end": Home in the last week, the programme page once it
 * is over), which asks this same answer for whether it waits (`endSurveyFor`)
 * and, once the person has sent it, says the day they did. Its card carries
 * the survey's own facts for those words (`atTheEnd`).
 *
 * Every read is one document by its id or one equality on one field (the
 * person's rows by `respondent.uid`), so nothing needs a declared index.
 */

export type SurveyCard = {
  surveyId: string;
  /** The run the survey's programme named: week 1's page asks for its own. */
  runId: string;
  kind: SurveyKind;
  /** "A survey for you". Upper case by CSS. */
  eyebrow: string;
  /** "Before you start", the survey's own title. */
  title: string;
  /** "AGI Strategy". */
  programme: string;
  /** "14 questions, about 5 minutes". */
  size: string;
  /** "Closes Wed 4 Nov". */
  closes: string;
  /** The person's own link: "/survey/<secret>". */
  href: string;
  /** "Answer". */
  answer: string;
  /**
   * A survey at a programme's end only (`kind` "after"): its own facts, for
   * the card its programme's pages draw ("The survey at the end": Home in the
   * last week, the programme page once it is over). Absent on every other
   * survey's card.
   */
  atTheEnd?: AtTheEnd;
};

/**
 * WHAT THE SURVEY AT THE END'S CARD SAYS OF IT, from its own record: how many
 * questions and minutes, how many of its questions its programme's survey
 * before it asked too ("the same 9 questions as week 1": the questions the
 * two share by id, the pairing `pairOf` fixed when it was made; 0 when it
 * pairs with none), and the day it closes ("Fri 18 Dec", null with none).
 */
export type AtTheEnd = {
  questions: number;
  minutes: number;
  sameAsStart: number;
  closesOn: string | null;
};

/**
 * THE SURVEY AT THE END, AS ITS RUN'S OWN PAGES SHOW IT TO ONE PERSON (Q48 B;
 * boards en-after-phone, en-after-nofinish-phone): either it is theirs to
 * answer, as `surveysWaitingFor` says (its card), or they have sent it (the
 * day they sent it, and the day their name comes off it, "Sat 9 Dec 2028",
 * null while that cannot be dated). Nothing of anybody else's.
 */
export type EndSurvey =
  | { state: "open"; card: SurveyCard }
  | { state: "sent"; surveyId: string; sentOn: string | null; keptUntil: string | null };

/** Whether the person still holds a place on the programme a survey is about: the reminder's own test, for one person. */
async function holdsPlaceNow(
  db: Firestore,
  survey: SurveyDoc,
  uid: string,
  forms: Map<string, ApplicationForm | null>,
): Promise<boolean> {
  const { roundId, programmeId } = programmeOf(survey.audience);
  if (!forms.has(roundId)) forms.set(roundId, await loadForm(db, roundId));
  const form = forms.get(roundId) ?? null;
  if (!form) return false;
  const application = await loadApplication(db, form, uid);
  // Their decision is read only once decision day has told them, as week 1's
  // door reads it: `holdsPlaceOn` answers no before then, and a decision
  // nobody has published to them is never read here.
  if (!application?.sent || !isInTerm(application) || !hasBeenTold(application)) return false;
  const decision = await loadDecision(db, form.round.id, uid);
  return holdsPlaceOn(form, programmeId, application, decision);
}

/**
 * Whether the person's own seat on a run says they left it. Their own seat
 * only, and nothing of it is shown. A seat Publish has not told them about is
 * no seat they left: leaving needs a seat they were told, and keeps the stamp.
 */
async function leftTheRun(db: Firestore, runId: string, uid: string): Promise<boolean> {
  if (!runId || runId.includes("/")) return false;
  const snap = await db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid)).get();
  if (!snap.exists) return false;
  const seat = normalizeCourseEnrolment(snap.id, snap.data() ?? {});
  return seat.uid === uid && seat.runId === runId && placementIsTold(seat) && enrolmentHasLeft(seat.status);
}

/**
 * Whether the person's own seat on a run is live: told by Publish and not
 * left. Their own seat only, and nothing of it is shown.
 */
async function onTheRun(db: Firestore, runId: string, uid: string): Promise<boolean> {
  if (!runId || runId.includes("/")) return false;
  const snap = await db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid)).get();
  if (!snap.exists) return false;
  const seat = normalizeCourseEnrolment(snap.id, snap.data() ?? {});
  return seat.uid === uid && seat.runId === runId && placementIsTold(seat) && !enrolmentHasLeft(seat.status);
}

/** Whether a survey sent to the person is still theirs to answer: see the note at the top. */
async function stillTheirs(
  db: Firestore,
  survey: SurveyDoc,
  uid: string,
  forms: Map<string, ApplicationForm | null>,
): Promise<boolean> {
  // A survey after an event reaches people by its email and its QR code, and has no card here.
  if (isEventAudience(survey.audience)) return false;
  if (survey.audience.kind === "followUps") return true;
  if (survey.audience.kind === "leaving") return leftTheRun(db, survey.runId, uid);
  // A check-in: the register marked them at its session, and their seat on the run is still live.
  if (survey.audience.kind === "checkIn") return isCheckIn(survey) && onTheRun(db, survey.runId, uid);
  return holdsPlaceNow(db, survey, uid, forms);
}

function cardOf(survey: SurveyDoc, person: SurveyPersonDoc, atTheEnd: AtTheEnd | null, now: Date): SurveyCard {
  const checkIn = isCheckIn(survey);
  return {
    surveyId: survey.id,
    runId: survey.runId,
    kind: survey.kind,
    eyebrow: checkIn ? CHECK_IN_CARD_WORDS.eyebrow : CARD_WORDS.eyebrow,
    title: survey.title,
    programme: survey.programmeName,
    size: cardSizeWords(surveyQuestionsOf(survey.items).length, survey.minutes),
    closes: survey.closesAt ? (checkIn ? checkInCardClosesWords(survey.closesAt, now) : closesWords(survey.closesAt, false)) : "",
    href: surveyLinkPath(person.token),
    answer: CARD_WORDS.answer,
    ...(atTheEnd ? { atTheEnd } : {}),
  };
}

/**
 * The survey at the end's own facts (`AtTheEnd`), for its card. The survey it
 * pairs with is read by its id (one document), and only for a survey at the
 * end. Null for every other kind.
 */
async function atTheEndOf(db: Firestore, survey: SurveyDoc): Promise<AtTheEnd | null> {
  if (survey.kind !== "after") return null;
  const questions = surveyQuestionsOf(survey.items);
  const before = survey.pairOf && !survey.pairOf.includes("/") ? await readSurvey(db, survey.pairOf) : null;
  const askedBefore = new Set(before ? surveyQuestionsOf(before.items).map((question) => question.id) : []);
  return {
    questions: questions.length,
    minutes: survey.minutes,
    sameAsStart: questions.filter((question) => askedBefore.has(question.id)).length,
    closesOn: survey.closesAt ? dayWords(survey.closesAt) : null,
  };
}

/**
 * Every survey waiting for `person` now, the one closing soonest first. None
 * in a view-as session, and none when anything about one cannot be read.
 */
export async function surveysWaitingFor(db: Firestore, person: Pick<SessionUser, "uid">, now: Date): Promise<SurveyCard[]> {
  const uid = person.uid;
  if (!uid || uid.includes("/")) return [];
  if (markerIsLive(await getImpersonator(), uid)) return [];

  const snap = await db.collection(SURVEY_PEOPLE_COLLECTION).where("respondent.uid", "==", uid).get();
  const rows: SurveyPersonDoc[] = [];
  for (const doc of snap.docs) {
    const row = normalizeSurveyPerson(doc.id, doc.data() ?? {});
    if (row && row.respondent.uid === uid && row.sentAt !== null && !row.answered) rows.push(row);
  }

  const forms = new Map<string, ApplicationForm | null>();
  const cards: { card: SurveyCard; closesAt: number }[] = [];
  // Every survey the rows name, read at once: a person keeps a row on each
  // check-in they were marked at, so there may be several.
  const read = await Promise.all(rows.map((row) => readSurvey(db, row.surveyId)));
  for (const [index, row] of rows.entries()) {
    const survey = read[index];
    if (!survey || !isOpen(survey, now)) continue;
    if (!(await stillTheirs(db, survey, uid, forms))) continue;
    cards.push({ card: cardOf(survey, row, await atTheEndOf(db, survey), now), closesAt: survey.closesAt?.getTime() ?? Number.POSITIVE_INFINITY });
  }
  return cards
    .sort((a, b) => a.closesAt - b.closesAt || a.card.title.localeCompare(b.card.title, "en") || a.card.surveyId.localeCompare(b.card.surveyId))
    .map((entry) => entry.card);
}

/**
 * Week 1's first card (Q50 B): the before survey of the run whose week 1 this
 * is, while it waits for the person, or null. The same answer as Home's.
 */
export async function beforeSurveyCardFor(
  db: Firestore,
  person: Pick<SessionUser, "uid">,
  runId: string,
  now: Date,
): Promise<SurveyCard | null> {
  const cards = await surveysWaitingFor(db, person, now);
  return cards.find((card) => card.kind === "before" && card.runId === runId) ?? null;
}

/**
 * The page that says somebody left (wk-left-phone): the leaving survey of the
 * run they left while it waits for them, or null. The same answer as Home's.
 */
export async function leavingSurveyCardFor(
  db: Firestore,
  person: Pick<SessionUser, "uid">,
  runId: string,
  now: Date,
): Promise<SurveyCard | null> {
  const cards = await surveysWaitingFor(db, person, now);
  return cards.find((card) => card.kind === "leaving" && card.runId === runId) ?? null;
}

/**
 * THE SURVEY AT THE END OF A RUN, FOR ONE PERSON (`EndSurvey`), or null: the
 * run's survey at the end while it waits for them, by `surveysWaitingFor`
 * (the same answer Home's and My programmes' cards ask), or, once they have
 * sent it, the day they sent it and the day their name comes off it. Null
 * when it is neither: not sent to them, closed before they answered, no
 * longer theirs, or a view-as session, asked first.
 *
 * The sent state reads only the person's own rows (one equality on
 * `respondent.uid`), the survey each names, and their own answer to it
 * (`ownAnswerOf`, by their own uid). Never how many others have answered.
 */
export async function endSurveyFor(
  db: Firestore,
  person: Pick<SessionUser, "uid">,
  runId: string,
  now: Date,
): Promise<EndSurvey | null> {
  const uid = person.uid;
  if (!uid || uid.includes("/") || !runId || runId.includes("/")) return null;
  if (markerIsLive(await getImpersonator(), uid)) return null;

  const open = (await surveysWaitingFor(db, person, now)).find((card) => card.kind === "after" && card.runId === runId);
  if (open) return { state: "open", card: open };

  const snap = await db.collection(SURVEY_PEOPLE_COLLECTION).where("respondent.uid", "==", uid).get();
  for (const doc of snap.docs) {
    const row = normalizeSurveyPerson(doc.id, doc.data() ?? {});
    if (!row || row.respondent.uid !== uid || row.sentAt === null || !row.answered) continue;
    const survey = await readSurvey(db, row.surveyId);
    if (!survey || survey.kind !== "after" || survey.runId !== runId || survey.audience.kind !== "programme") continue;
    const answer = await ownAnswerOf(db, survey, uid);
    return {
      state: "sent",
      surveyId: survey.id,
      sentOn: answer?.sentAt ? dayWords(answer.sentAt) : null,
      keptUntil: survey.namesOffOn ? dateKeyWords(survey.namesOffOn) || null : null,
    };
  }
  return null;
}
