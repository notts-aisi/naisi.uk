import type { WorksheetOption } from "@/lib/firestore/worksheets";
import { WORKSHEET_LIMITS } from "@/lib/firestore/worksheets";
import { markNotForEverybody, type SurveyChoiceQuestion, type SurveyItem } from "../items";

/**
 * THE CHECK-IN'S QUESTIONS: six at most, one page, about two minutes, at the
 * end of one session of one group. Asked of the group's own copy of the week
 * the session is about, so "Was anything unclear?" lists that week's parts as
 * the group's members read them.
 *
 *  - `q_ci_useful`: how useful the session was, 1 to 5, "Not at all" to "Very".
 *  - `q_ci_most`: the most useful thing, a short answer.
 *  - `q_ci_better`: what could have gone better, a short answer, optional.
 *  - `q_ci_unclear`: what was unclear, pick any: the week's parts, each by its
 *    own id (a part's id survives a group's copy of the week, so answers count
 *    by part across groups), "Something else", and "Nothing was unclear",
 *    which means none of the others (`noneIds`). Required, so the totals tell
 *    somebody who found nothing unclear from somebody who skipped it.
 *  - `q_ci_reading`: how much of the week's reading they did before the
 *    session, None, Some, Most or All. Asked only when the week has something
 *    on its path to read, watch or listen to.
 *  - `q_ci_confident`: how confident they feel about the week's topic now, 1
 *    to 5, "Lost" to "Could explain it".
 *
 * THE IDS ARE FIXED STRINGS, the same in every check-in, so answers compare
 * across weeks, groups and programmes. Every question is required but
 * `q_ci_better`, a catch-all, which is on `NOT_FOR_EVERYBODY` in `../items`
 * and written optional (`markNotForEverybody`), as every template's are. No
 * consent box, no quote tick and no Kairos box: a check-in asks nothing of
 * the person's permission.
 *
 * Pure: words and shapes only. The week is the caller's to read.
 */

export const CHECK_IN_QUESTION_IDS = {
  useful: "q_ci_useful",
  most: "q_ci_most",
  better: "q_ci_better",
  unclear: "q_ci_unclear",
  reading: "q_ci_reading",
  confident: "q_ci_confident",
} as const;

/** "Something else" and "Nothing was unclear", after the week's parts. */
export const UNCLEAR_ELSE = "o_ci_else";
export const UNCLEAR_NOTHING = "o_ci_nothing";

/** The reading question's options, in order. */
export const READING_OPTIONS = {
  none: "o_ci_read_none",
  some: "o_ci_read_some",
  most: "o_ci_read_most",
  all: "o_ci_read_all",
} as const;

/** About how long a check-in takes, as its page and its email say. */
export const CHECK_IN_MINUTES = 2;

/** A part of the week, as the question lists it: its own id and its title. */
export type CheckInPart = { id: string; title: string };

/** What the questions are made from: the week's parts, in order, and whether it has anything to read. */
export type CheckInWeek = { parts: readonly CheckInPart[]; hasReading: boolean };

const option = (id: string, label: string): WorksheetOption => ({ id, label });

function base(id: string, title: string): Pick<SurveyChoiceQuestion, "kind" | "id" | "title" | "body" | "required"> {
  return { kind: "question", id, title, body: [], required: false };
}

/** A part's title as an option's words: one line, no longer than an option may be. */
function partLabel(title: string): string {
  const line = title.replace(/\s+/g, " ").trim();
  return line.length > WORKSHEET_LIMITS.optionLabel ? `${line.slice(0, WORKSHEET_LIMITS.optionLabel - 1)}…` : line;
}

/** An option id the worksheet model keeps, and that no fixed option of this question already holds. */
function isPartOptionId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id) && id !== UNCLEAR_ELSE && id !== UNCLEAR_NOTHING;
}

/**
 * The check-in's questions for one week, fresh each time. A week with no
 * parts asks "Was anything unclear?" with only "Something else" and "Nothing
 * was unclear"; a week with nothing to read is not asked about reading.
 */
export function checkInItems(week: CheckInWeek): SurveyItem[] {
  const seen = new Set<string>();
  const parts: WorksheetOption[] = [];
  for (const part of week.parts) {
    const label = partLabel(part.title);
    if (!label || !isPartOptionId(part.id) || seen.has(part.id)) continue;
    // Room for "Something else" and "Nothing was unclear" under the model's limit.
    if (parts.length >= WORKSHEET_LIMITS.maxOptions - 2) break;
    seen.add(part.id);
    parts.push(option(part.id, label));
  }
  const items: SurveyChoiceQuestion[] = [
    {
      ...base(CHECK_IN_QUESTION_IDS.useful, "How useful was today’s session?"),
      type: "rating",
      rating: { max: 5, minLabel: "Not at all", maxLabel: "Very" },
    },
    {
      ...base(CHECK_IN_QUESTION_IDS.most, "What was the most useful thing?"),
      type: "shortText",
      limit: { unit: "characters", max: 500 },
    },
    {
      ...base(CHECK_IN_QUESTION_IDS.better, "What could have gone better?"),
      type: "shortText",
      limit: { unit: "characters", max: 500 },
    },
    {
      ...base(CHECK_IN_QUESTION_IDS.unclear, "Was anything unclear?"),
      type: "multipleChoice",
      options: [...parts, option(UNCLEAR_ELSE, "Something else"), option(UNCLEAR_NOTHING, "Nothing was unclear")],
      noneIds: [UNCLEAR_NOTHING],
    },
  ];
  if (week.hasReading) {
    items.push({
      ...base(CHECK_IN_QUESTION_IDS.reading, "How much of this week’s reading did you do before the session?"),
      type: "singleChoice",
      options: [
        option(READING_OPTIONS.none, "None"),
        option(READING_OPTIONS.some, "Some"),
        option(READING_OPTIONS.most, "Most"),
        option(READING_OPTIONS.all, "All"),
      ],
    });
  }
  items.push({
    ...base(CHECK_IN_QUESTION_IDS.confident, "How confident do you feel about this week’s topic now?"),
    type: "rating",
    rating: { max: 5, minLabel: "Lost", maxLabel: "Could explain it" },
  });
  return markNotForEverybody(structuredClone<SurveyItem[]>(items));
}
