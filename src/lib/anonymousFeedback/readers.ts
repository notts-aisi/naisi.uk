import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { dayOf, formClosedOn, isFormOpen, normaliseAnswer, QUESTION_KEYS, ANONYMOUS_ANSWERS_COLLECTION, ANONYMOUS_WAITING_COLLECTION, answersInOrder, type AnonymousAnswer, type QuestionKey } from "./model";
import { formOfProgramme, formPath } from "./forms";
import { READER_QUESTION_WORDS, READER_WORDS } from "./words";

/**
 * WHAT THE PROGRAMME'S LEAD AND NAISI'S ADMINS READ of the anonymous form:
 * the answers, a question at a time, and how many forms were sent. The page
 * that calls this has already decided the caller is one of the two
 * (`loadProgrammeRun`), and hands over the `viewer` that decision returned.
 *
 * NOTHING HERE SAYS WHEN AN ANSWER CAME IN. Only answers from a day that is
 * over are shown, a whole day's together, so watching the page tells nobody
 * when one arrived; each question's answers are in alphabetical order; and no
 * day, time or id of any answer is handed to the page. The answers waiting
 * for the night's move are read too, from a day that is over only, so the
 * page shows the same whether or not the move has run yet.
 */

export type ReaderQuestion = { key: QuestionKey; heading: string; answers: string[] };

export type ReaderForm =
  | { state: "open"; path: string; line: string }
  | { state: "closed"; path: string; line: string };

export type AnonymousAnswersView = {
  /** "12 answers": how many forms were sent, from a day that is over. */
  count: number;
  questions: ReaderQuestion[];
  /** The form's link and where it stands, or null before the survey at the end is first sent. */
  form: ReaderForm | null;
};

export async function readAnonymousAnswers(
  db: Firestore,
  reader: { viewer: "admin" | "lead"; roundId: string; programmeId: string },
  now: Date,
): Promise<AnonymousAnswersView> {
  const today = dayOf(now);
  const ofProgramme = (raw: Record<string, unknown>): AnonymousAnswer | null => {
    const answer = normaliseAnswer(raw);
    return answer && answer.programmeId === reader.programmeId && answer.day < today ? answer : null;
  };
  // One equality each, on the form the programme is on, filtered in memory.
  const [kept, waiting, form] = await Promise.all([
    db.collection(ANONYMOUS_ANSWERS_COLLECTION).where("roundId", "==", reader.roundId).get(),
    db.collection(ANONYMOUS_WAITING_COLLECTION).where("roundId", "==", reader.roundId).get(),
    formOfProgramme(db, reader.roundId, reader.programmeId),
  ]);
  const answers = [...kept.docs, ...waiting.docs]
    .map((doc) => ofProgramme((doc.data() ?? {}) as Record<string, unknown>))
    .filter((answer): answer is AnonymousAnswer => answer !== null);
  const questions = QUESTION_KEYS.map((key) => ({ key, heading: READER_QUESTION_WORDS[key], answers: answersInOrder(answers, key) }));
  let shown: ReaderForm | null = null;
  if (form) {
    const closedOn = formClosedOn(form, now);
    shown =
      isFormOpen(form, now) && form.closesAt
        ? { state: "open", path: formPath(form), line: READER_WORDS.open(form.closesAt) }
        : { state: "closed", path: formPath(form), line: closedOn ? READER_WORDS.closed(closedOn) : READER_WORDS.notYet };
  }
  return { count: answers.length, questions, form: shown };
}
