import type { PredictionAnswers, PredictionQuestions } from "./model";

/**
 * WHAT A PERSON'S OWN PREDICTIONS CARD SAYS TO THEM ON ONE WEEK PAGE: built
 * on the server (`own.ts`) for the week the course's card is sealed in or the
 * week it opens in, handed to the week page, and answered again by every
 * write of the predictions route. It carries nothing the person may not read
 * at that moment: a sealed card's answers are absent until they have opened
 * it in the week it opens in.
 *
 * Pure types, so the page in the browser reads the shape.
 */
export type PredictionsView = {
  /** Which card this week holds: the first, sealed here, or the second, opened beside it. */
  stage: "seal" | "open";
  /** The week this page is. */
  weekNumber: number;
  /** The week the first card is filled in and sealed in. */
  sealWeek: number;
  /** The week this person's card opens in. */
  openWeek: number;
  /** The questions both cards ask: the person's own copy, or the course's card before they answer anything. */
  card: PredictionQuestions;
  /** This stage's answers take writing now. */
  canWrite: boolean;
  /** The week the card opens in has opened to them. */
  opensNow: boolean;
  /** While it is shut, the session the week it opens in waits on. */
  opensAfter: { dateKey: string; startTimeLocal: string } | null;
  /**
   * The first card. `draft`: theirs to change and seal; `sealed`: shut, its
   * answers absent; `closed`: never sealed, and the week it opens in has
   * opened, so it can no longer change or be sealed (its answers are still
   * theirs to read); `none`: nothing on it.
   */
  start: {
    state: "none" | "draft" | "sealed" | "closed";
    /** Their own answers while it is theirs to read: never a sealed card's. */
    answers: PredictionAnswers;
    /** When they sealed it, as an ISO instant. */
    sealedAt: string | null;
  };
  /** The second card, on the week it opens in; null on the week it is sealed in. */
  now: {
    answers: PredictionAnswers;
    /** When they opened their sealed card, as an ISO instant. */
    openedAt: string | null;
  } | null;
  /** Their sealed answers beside the second card: only once they have opened it. */
  opened: {
    answers: PredictionAnswers;
    sealedAt: string;
    openedAt: string;
  } | null;
  /** When they opened their sealed card, on either week; null before. */
  openedAt: string | null;
};

/** One person's card, as an admin opens it (the opening recorded first). */
export type AdminPredictionsCard = {
  uid: string;
  name: string;
  card: PredictionQuestions | null;
  sealWeek: number | null;
  openWeek: number | null;
  start: { answers: PredictionAnswers; sealedAt: string | null };
  now: { answers: PredictionAnswers; openedAt: string | null };
};

/** One row of the admin's list: whose card, and where it stands. Never an answer. */
export type AdminPredictionsRow = {
  uid: string;
  name: string;
  sealedAt: string | null;
  openedAt: string | null;
};
