"use client";

import { APPLICATION_LIMITS, type AnswerValue, type QuestionSetDoc } from "@/lib/applications/model";
import { answerProblem } from "@/lib/applications/validate";
import { own } from "@/lib/applications/applicant/keys";
import { ChipChoices, ChoicePair, ChoiceRows, LongText, ScalePoints, TextField } from "./fields";
import styles from "./form.module.css";

/**
 * One question set: every question it asks, each drawn as the kind of control
 * its type calls for.
 *
 *   short   a one-line box
 *   long    a tall box with a word count against its limit
 *   choice  one of several: two short options sit side by side, more take a
 *           row each
 *   multi   as many as apply, as chips
 *   scale   labelled points, lowest first
 *
 * Every question says when it is optional and shows its limit. What is wrong
 * with an answer (`answerProblem`, the same check the send runs) is shown
 * under it once the person has tried to send; a count that has gone over its
 * limit turns colour as they type, without waiting for that.
 */

/** Two options this short read as a pair of buttons, not as a list. */
const PAIR_MAX_CHARS = 12;

export default function QuestionsStep({
  set,
  answers,
  optionsOf,
  onAnswer,
  showProblems,
}: {
  set: QuestionSetDoc;
  answers: Record<string, AnswerValue>;
  /** The options one question offers this person (`optionsFor`). */
  optionsOf: (questionId: string) => string[];
  onAnswer: (questionId: string, value: AnswerValue) => void;
  showProblems: boolean;
}) {
  return (
    <div className={styles.body}>
      {set.questions.map((question) => {
        const options = optionsOf(question.id);
        const value = own(answers, question.id);
        const problem = showProblems ? answerProblem(question, value, options) : null;
        const optional = !question.required;
        const help = question.help || undefined;

        if (question.type === "short") {
          return (
            <TextField
              key={question.id}
              label={question.text}
              optional={optional}
              first={typeof value === "string" ? value : ""}
              onChange={(next) => onAnswer(question.id, next)}
              maxLength={APPLICATION_LIMITS.shortAnswerChars}
              wordLimit={question.wordLimit}
              help={help}
              error={problem}
            />
          );
        }
        if (question.type === "long") {
          return (
            <LongText
              key={question.id}
              label={question.text}
              optional={optional}
              help={help}
              first={typeof value === "string" ? value : ""}
              onChange={(next) => onAnswer(question.id, next)}
              wordLimit={question.wordLimit}
              maxLength={APPLICATION_LIMITS.longAnswerChars}
              error={problem}
            />
          );
        }
        if (question.type === "choice") {
          const chosen = typeof value === "string" && options.includes(value) ? value : null;
          const pair = options.length === 2 && options.every((option) => option.length <= PAIR_MAX_CHARS);
          const Choice = pair ? ChoicePair : ChoiceRows;
          return (
            <Choice
              key={question.id}
              legend={question.text}
              optional={optional}
              help={help}
              options={options}
              value={chosen}
              onChange={(next) => onAnswer(question.id, next)}
              error={problem}
            />
          );
        }
        if (question.type === "multi") {
          return (
            <ChipChoices
              key={question.id}
              legend={question.text}
              optional={optional}
              help={help ?? "Pick as many as you like."}
              options={options}
              value={Array.isArray(value) ? value : []}
              onChange={(next) => onAnswer(question.id, next)}
              error={problem}
            />
          );
        }
        return (
          <ScalePoints
            key={question.id}
            legend={question.text}
            optional={optional}
            help={help}
            options={options}
            value={typeof value === "number" && value >= 0 && value < options.length ? value : null}
            onChange={(next) => onAnswer(question.id, next)}
            error={problem}
          />
        );
      })}
    </div>
  );
}
