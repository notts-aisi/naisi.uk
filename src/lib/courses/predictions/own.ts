import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";
import type { SessionUser } from "@/lib/firebase/session";
import {
  COURSE_PREDICTIONS_COLLECTION,
  normalizeCoursePredictions,
  predictionsRecordId,
  type CoursePredictionsDoc,
} from "@/lib/firestore/coursePredictions";
import { normalizeCourse, type CourseRunDoc } from "@/lib/firestore/courses";
import { questionsOf, type PredictionCard } from "./model";
import { predictionsTakerOf, weekOpenTo, type PredictionsTaker } from "./taker";
import type { PredictionsView } from "./wire";

/**
 * A PERSON'S OWN PREDICTIONS CARD, AS THEIR WEEK PAGE SHOWS IT: the one place
 * that decides what of their card they may read and change at a moment, for
 * the page (`ownPredictionsView`) and for every answer the predictions route
 * gives (`viewFor`).
 *
 * THE RULES IT HOLDS, for the person themselves and nobody else:
 *  - In the week the course's card is sealed in, the first card is theirs to
 *    fill in, saving as they type, until they seal it. Sealed, its answers
 *    are never handed back, until the week it opens in has opened to their
 *    group and they have opened it there.
 *  - Once that week has opened, a first card that was never sealed can no
 *    longer change or be sealed; its answers are still theirs to read, on the
 *    week it was filled in on.
 *  - In the week it opens in, the same questions are asked again, saving as
 *    they type until they open the sealed card. Opening it hands back the
 *    sealed answers beside the new ones, and from then neither changes.
 *
 * NOTHING IN A VIEW-AS SESSION. An admin viewing the site as somebody is
 * shown no card at all: a card is opened by an admin only through the route
 * that records the opening first.
 */

/** The run's course's card, or null for a run with no course or a course with none. */
export async function courseCardOf(db: Firestore, run: CourseRunDoc): Promise<PredictionCard | null> {
  if (!run.courseId) return null;
  const snap = await db.collection("courses").doc(run.courseId).get();
  if (!snap.exists) return null;
  return normalizeCourse(snap.id, snap.data() ?? {}).predictionCard;
}

/** The person's own record on the run, or null before their first answer. */
export async function ownRecordOf(db: Firestore, runId: string, uid: string): Promise<CoursePredictionsDoc | null> {
  const snap = await db.collection(COURSE_PREDICTIONS_COLLECTION).doc(predictionsRecordId(runId, uid)).get();
  return snap.exists ? normalizeCoursePredictions(snap.id, snap.data() ?? {}) : null;
}

/**
 * Which card a week holds for one person, or null for a week that holds
 * neither: the course's week it is sealed in, and the week their card opens
 * in, which for a sealed card is the week it was sealed to open in.
 */
export function stageOf(card: PredictionCard, record: CoursePredictionsDoc | null, weekNumber: number): PredictionsView["stage"] | null {
  if (weekNumber === card.sealWeek) return "seal";
  const openWeek = record?.start.sealedAt ? (record.start.opensInWeek ?? card.openWeek) : card.openWeek;
  if (weekNumber === openWeek) return "open";
  return null;
}

const iso = (at: Date | null | undefined): string | null => (at ? at.toISOString() : null);

/** What `taker` may read and change of their own card on `stage`'s week, at `now`. */
export async function viewFor(
  db: Firestore,
  taker: PredictionsTaker,
  card: PredictionCard,
  record: CoursePredictionsDoc | null,
  stage: PredictionsView["stage"],
  now: Date,
): Promise<PredictionsView> {
  const questions = record?.card ?? questionsOf(card);
  const sealedAt = record?.start.sealedAt ?? null;
  // A sealed card opens in the week it was sealed to open in.
  const openWeek = sealedAt ? (record?.start.opensInWeek ?? card.openWeek) : card.openWeek;
  const [opening, sealOpening] = await Promise.all([
    weekOpenTo(db, taker, openWeek, now),
    stage === "seal" ? weekOpenTo(db, taker, card.sealWeek, now) : Promise.resolve(null),
  ]);
  const startAnswers = record?.start.answers ?? {};
  const started = Object.keys(startAnswers).length > 0;
  const state: PredictionsView["start"]["state"] = sealedAt
    ? "sealed"
    : opening.open
      ? started
        ? "closed"
        : "none"
      : started
        ? "draft"
        : "none";
  const openedAt = record?.now.openedAt ?? null;

  if (stage === "seal") {
    return {
      stage,
      weekNumber: card.sealWeek,
      sealWeek: card.sealWeek,
      openWeek,
      card: questions,
      canWrite: !sealedAt && !opening.open && sealOpening?.open === true,
      opensNow: opening.open,
      opensAfter: opening.after,
      start: {
        state,
        // A sealed card's answers never travel on the week it was sealed in.
        answers: state === "draft" || state === "closed" ? startAnswers : {},
        sealedAt: iso(sealedAt),
      },
      now: null,
      opened: null,
      openedAt: iso(openedAt),
    };
  }
  return {
    stage,
    weekNumber: openWeek,
    sealWeek: card.sealWeek,
    openWeek,
    card: questions,
    canWrite: opening.open && !openedAt,
    opensNow: opening.open,
    opensAfter: opening.after,
    // On the week it opens in, the first card says only whether it was sealed.
    start: { state: state === "closed" ? "none" : state, answers: {}, sealedAt: iso(sealedAt) },
    now: { answers: record?.now.answers ?? {}, openedAt: iso(openedAt) },
    opened:
      sealedAt && openedAt && opening.open
        ? { answers: startAnswers, sealedAt: sealedAt.toISOString(), openedAt: openedAt.toISOString() }
        : null,
    openedAt: iso(openedAt),
  };
}

/**
 * The caller's own card on week `weekNumber` of the run, or null when that
 * week holds no card for them: no card on the course, a week that is neither
 * of its two, somebody with no card on the run, or a view-as session.
 */
export async function ownPredictionsView(
  db: Firestore,
  actor: SessionUser,
  runId: string,
  weekNumber: number,
  now: Date,
): Promise<PredictionsView | null> {
  if (!actor.uid || markerIsLive(await getImpersonator(), actor.uid)) return null;
  const answer = await predictionsTakerOf(db, actor, runId);
  if (!answer.ok) return null;
  const card = await courseCardOf(db, answer.taker.run);
  if (!card) return null;
  const record = await ownRecordOf(db, runId, actor.uid);
  const stage = stageOf(card, record, weekNumber);
  if (!stage) return null;
  return viewFor(db, answer.taker, card, record, stage, now);
}
