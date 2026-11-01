import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SurveyAnswer } from "../items";
import { answersOf, checkInsOfRun } from "../repo";
import { CHECK_IN_QUESTION_IDS, READING_OPTIONS, UNCLEAR_ELSE, UNCLEAR_NOTHING } from "./template";

/**
 * ONE WEEK'S CHECK-INS, POOLED BY GROUP, FOR THE ADMINS' WEEK REVIEW (privacy
 * v15: admins may ask Claude to help review survey answers, and "only
 * NAISI's admins can see who said what"). What leaves this file is a list of
 * answers with the group each came from and NOTHING ABOUT WHO SENT IT: no
 * account, no answer id (an answer's id is its sender's), no time. The
 * review sends them to Claude for what people found hard, and for nothing
 * else (`src/lib/courses/weekReview/input.ts`).
 *
 * WHOSE ANSWERS: the caller decides, by the sender's account and when they
 * sent it (`decide`): "use" it, leave it out as "not yet" (sent before the
 * sender agreed to version 15, so counted as not included), or "never" (not
 * somebody the review is about). An answer whose name has come off has no
 * sender to ask about, and is left out as not yet: nothing can say it may go.
 *
 * WHICH CHECK-INS: the run's (`checkInsOfRun`, one equality on `runId`) that
 * were opened for this programme, of this week, read through `answersOf`, the
 * reader every count of a check-in uses. Open ones too: an admin reads what
 * has been sent so far. Who may ask is the caller's business: the week
 * review's door admits an admin alone before it calls this.
 */

/** One check-in's answers, with its group and nobody's name. */
export type PooledCheckIn = {
  groupId: string;
  useful: number | null;
  confident: number | null;
  /** "None", "Some", "Most" or "All", or null when not asked. */
  reading: string | null;
  /** The parts named unclear, by id; "Something else" as `ELSE_ID`. "Nothing was unclear" is no part. */
  unclear: string[];
  most: string;
  better: string;
};

/** "Something else", as a pooled answer names it. */
export const ELSE_ID = "__something_else__";

/** Whether an answer may be used, by its sender and every time they sent something to it. */
export type PoolDecision = "use" | "not-yet" | "never";

const READING_WORDS: Record<string, string> = {
  [READING_OPTIONS.none]: "None",
  [READING_OPTIONS.some]: "Some",
  [READING_OPTIONS.most]: "Most",
  [READING_OPTIONS.all]: "All",
};

function rating(answer: SurveyAnswer | undefined): number | null {
  return answer && answer.type === "rating" && Number.isFinite(answer.value) ? answer.value : null;
}

function text(answer: SurveyAnswer | undefined): string {
  return answer && answer.type === "text" && typeof answer.text === "string" ? answer.text.trim() : "";
}

function picked(answer: SurveyAnswer | undefined): string[] {
  if (!answer) return [];
  if (answer.type === "choices") return answer.optionIds;
  if (answer.type === "choice") return [answer.optionId];
  return [];
}

export async function poolWeekCheckIns(
  db: Firestore,
  input: {
    runId: string;
    roundId: string;
    programmeId: string;
    weekNumber: number;
    decide: (uid: string, sends: ReadonlyArray<Date | null>) => PoolDecision;
  },
): Promise<{ pooled: PooledCheckIn[]; notYet: number; parts: Array<{ id: string; title: string }> }> {
  const surveys = (await checkInsOfRun(db, input.runId)).filter(
    (survey) =>
      survey.audience.roundId === input.roundId &&
      survey.audience.programmeId === input.programmeId &&
      survey.audience.weekNumber === input.weekNumber,
  );
  const pooled: PooledCheckIn[] = [];
  const parts = new Map<string, string>();
  let notYet = 0;
  for (const survey of surveys) {
    // The week's parts, as this check-in offered them, by their own ids.
    for (const item of survey.items) {
      if (item.kind !== "question" || item.id !== CHECK_IN_QUESTION_IDS.unclear || !("options" in item) || !Array.isArray(item.options)) continue;
      for (const option of item.options) {
        if (option.id === UNCLEAR_ELSE || option.id === UNCLEAR_NOTHING || parts.has(option.id)) continue;
        parts.set(option.id, option.label);
      }
    }
    for (const answer of await answersOf(db, survey)) {
      const uid = answer.respondent?.uid ?? "";
      if (!uid) {
        notYet += 1;
        continue;
      }
      const decision = input.decide(uid, [answer.sentAt, ...answer.fills.map((fill) => fill.sentAt)]);
      if (decision === "never") continue;
      if (decision === "not-yet") {
        notYet += 1;
        continue;
      }
      const said = answer.answers;
      const reading = picked(said[CHECK_IN_QUESTION_IDS.reading])[0];
      pooled.push({
        groupId: survey.audience.groupId,
        useful: rating(said[CHECK_IN_QUESTION_IDS.useful]),
        confident: rating(said[CHECK_IN_QUESTION_IDS.confident]),
        reading: reading ? (READING_WORDS[reading] ?? null) : null,
        unclear: picked(said[CHECK_IN_QUESTION_IDS.unclear])
          .filter((id) => id !== UNCLEAR_NOTHING)
          .map((id) => (id === UNCLEAR_ELSE ? ELSE_ID : id)),
        most: text(said[CHECK_IN_QUESTION_IDS.most]),
        better: text(said[CHECK_IN_QUESTION_IDS.better]),
      });
    }
  }
  return { pooled, notYet, parts: [...parts].map(([id, title]) => ({ id, title })) };
}
