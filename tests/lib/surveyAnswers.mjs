/**
 * EVERY REQUIRED QUESTION ANSWERED, for a suite about something else (Zach,
 * 30 Oct 2026: every survey question is required unless it is marked
 * optional, and both answer routes refuse a send with one left blank).
 *
 * A suite answers the questions it is about, in the words it checks, and
 * `withEveryRequired` answers each REQUIRED question it left out (absent from
 * what it sends; an explicit null stays blank, so a suite that means a blank
 * still sends one) plainly and the same way every time: the first option,
 * the scale's lowest point, every line at 1, 0 for a share or a number, and
 * "Nothing to add." in words. What a suite sends for a question is never
 * changed. The rule itself is the library's (`isQuestionRequired`, handed in
 * as `items`), never a copy of it, and the suites that drive the rule are
 * tests/surveys-required.test.mjs and the answer routes' own.
 */

/** A plain answer to one question, in the shape the answer routes read. */
export function plainAnswer(question) {
  switch (question.type) {
    case "singleChoice":
      return { type: "choice", optionId: question.options[0].id };
    case "multipleChoice":
      return { type: "choices", optionIds: [question.options[0].id] };
    case "rating":
      return { type: "rating", value: 1 };
    case "scale":
      return { type: "scale", value: question.min };
    case "percent":
    case "number":
      return { type: question.type, value: 0 };
    case "lines":
      return { type: "lines", values: Object.fromEntries(question.lines.map((line) => [line.id, 1])) };
    case "shortText":
    case "longText":
      return { type: "text", text: "Nothing to add." };
    default:
      throw new Error(`No plain answer for a ${question.type} question.`);
  }
}

/**
 * `given`, with a plain answer to every required question of `surveyItems`
 * it leaves out. `items` is the loaded `src/lib/surveys/items.ts`.
 */
export function withEveryRequired(items, surveyItems, given) {
  if (given === null || typeof given !== "object" || Array.isArray(given)) return given;
  const out = { ...given };
  for (const question of items.requiredQuestionsOf(items.sanitizeSurveyItems(surveyItems))) {
    if (!(question.id in out)) out[question.id] = plainAnswer(question);
  }
  return out;
}
