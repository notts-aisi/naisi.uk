import "server-only";
import { checkPageAnswers } from "./answers";
import { AI_SURVEY, isProposalOrder, pageSequence } from "./definition";
import { answerSetKey, openPass, renewPass, sealPass, type AiSurveyPass } from "./pass";
import { readProgress, readState, stageAt, surveyDb, writePage, type SurveyState } from "./store";
import type { AiSurveyStage } from "./types";

/**
 * Saving a page of the AI at Nottingham survey, and coming back to one.
 *
 * Both take the pass a browser holds and nothing else that could say who is
 * asking. Neither reads a cookie, a session or an address, and neither logs.
 *
 * The answers travel ONE WAY. A page is stored when Next is pressed, and no
 * function here hands an answer back: on a shared computer the next person
 * must never see the last person's, so the most a browser is ever told is
 * WHICH pages are saved.
 */

export type SessionView =
  | { ok: true; stage: AiSurveyStage; order: string[]; savedPages: string[]; finished: boolean; pass: string }
  | { ok: false; error: "gone" | "closed" };

type Opened = { state: SurveyState; pass: AiSurveyPass; passKey: Buffer };

async function open(token: unknown, now: number): Promise<{ db: FirebaseFirestore.Firestore; opened: Opened } | null> {
  const db = surveyDb();
  if (!db) return null;
  const state = await readState(db);
  const passKey = Buffer.from(state.passKey, "base64");
  const pass = openPass(token, passKey, now);
  // A pass from storage that has since been cleared, or one whose page order
  // is not this survey's, is no pass.
  if (!pass || pass.epoch !== state.epoch || !isProposalOrder(pass.order)) return null;
  if (pass.shard >= state.shardDocs) return null;
  return { db, opened: { state, pass, passKey } };
}

/** For a browser coming back to an unfinished survey: which pages are saved. */
export async function viewSession(token: unknown, now: number = Date.now()): Promise<SessionView> {
  const found = await open(token, now);
  if (!found) return { ok: false, error: "gone" };
  const { db, opened } = found;
  const stage = stageAt(opened.state, now);
  if (!stage.takesSaves) return { ok: false, error: "closed" };
  const progress = await readProgress(db, opened.state.epoch, opened.pass.shard, answerSetKey(opened.pass));
  if (!progress) return { ok: false, error: "gone" };
  if (progress.finished) return { ok: false, error: "gone" };
  return {
    ok: true,
    stage: stage.stage,
    order: opened.pass.order,
    savedPages: progress.savedPages,
    finished: false,
    // The same pass, unrenewed: looking is not saving.
    pass: sealPass(opened.pass, opened.passKey),
  };
}

export type SaveResult =
  | { ok: true; pass: string; finished: boolean }
  | { ok: false; error: "gone" | "closed" | "refused" | "failed" };

/**
 * Store one page. `finish` is honoured only on the last page of this person's
 * order, marks the set finished, and from then on every save against it is
 * refused.
 */
export async function savePage(
  token: unknown,
  pageId: unknown,
  answers: unknown,
  finish: unknown,
  now: number = Date.now(),
): Promise<SaveResult> {
  const found = await open(token, now);
  if (!found) return { ok: false, error: "gone" };
  const { db, opened } = found;
  if (!stageAt(opened.state, now).takesSaves) return { ok: false, error: "closed" };

  const checked = checkPageAnswers(pageId, answers);
  if (!checked.ok) return { ok: false, error: "refused" };
  const sequence = pageSequence(opened.pass.order);
  const page = pageId as string;
  const finishing = finish === true;
  if (finishing && page !== sequence[sequence.length - 1]) return { ok: false, error: "refused" };

  const setKey = answerSetKey(opened.pass);
  const progress = await readProgress(db, opened.state.epoch, opened.pass.shard, setKey);
  if (!progress) return { ok: false, error: "gone" };
  // Finished is locked. The browser cleared its pass when it finished, so
  // this is a copy of the pass being used after the fact.
  if (progress.finished) return { ok: false, error: "gone" };

  try {
    await writePage(
      db,
      opened.state,
      { shard: opened.pass.shard, setKey, order: opened.pass.order },
      page,
      checked.answers,
      finishing,
      now,
      AI_SURVEY,
    );
  } catch {
    // The document is gone (pilot data cleared under this save) or the write
    // failed. The page keeps its answers and offers "Try again".
    return { ok: false, error: "failed" };
  }
  return { ok: true, finished: finishing, pass: sealPass(renewPass(opened.pass, now), opened.passKey) };
}
