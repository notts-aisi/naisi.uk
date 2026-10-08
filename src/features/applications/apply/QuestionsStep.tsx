"use client";

import { Fragment, type ReactElement } from "react";
import {
  APPLICATION_LIMITS,
  type AnswerValue,
  type ApplicationQuestion,
  type QuestionSetDoc,
} from "@/lib/applications/model";
import { answerProblem } from "@/lib/applications/validate";
import { own } from "@/lib/applications/applicant/keys";
import { ChipChoices, ChoicePair, ChoiceRows, LongText, ScalePoints, TextField } from "./fields";
import RankQuestion from "./RankQuestion";
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
 *   rank    the options to tick, and the ticked ones as a list to put in
 *           order (`RankQuestion`)
 *   scale   labelled points, lowest first
 *
 * Every question says when it is optional and shows its limit. What is wrong
 * with an answer (`answerProblem`, the same check the send runs) is shown
 * under it once the person has tried to send; a count that has gone over its
 * limit turns colour as they type, without waiting for that.
 */

/** Two options this short read as a pair of buttons, not as a list. */
const PAIR_MAX_CHARS = 12;

/**
 * The control one question is answered with.
 *
 * EVERY TYPE IS NAMED. The switch has no default, so a type added to the
 * model fails the build here until it has a control of its own: no question
 * is ever drawn as another kind of question.
 */
function controlFor(
  question: ApplicationQuestion,
  value: AnswerValue | undefined,
  options: string[],
  problem: string | null,
  onAnswer: (value: AnswerValue) => void,
): ReactElement {
  const optional = !question.required;
  const help = question.help || undefined;
  switch (question.type) {
    case "short":
      return (
        <TextField
          label={question.text}
          optional={optional}
          first={typeof value === "string" ? value : ""}
          onChange={onAnswer}
          maxLength={APPLICATION_LIMITS.shortAnswerChars}
          wordLimit={question.wordLimit}
          help={help}
          error={problem}
        />
      );
    case "long":
      return (
        <LongText
          label={question.text}
          optional={optional}
          help={help}
          first={typeof value === "string" ? value : ""}
          onChange={onAnswer}
          wordLimit={question.wordLimit}
          maxLength={APPLICATION_LIMITS.longAnswerChars}
          error={problem}
        />
      );
    case "choice": {
      const chosen = typeof value === "string" && options.includes(value) ? value : null;
      const pair = options.length === 2 && options.every((option) => option.length <= PAIR_MAX_CHARS);
      const Choice = pair ? ChoicePair : ChoiceRows;
      return (
        <Choice
          legend={question.text}
          optional={optional}
          help={help}
          options={options}
          value={chosen}
          onChange={onAnswer}
          error={problem}
        />
      );
    }
    case "multi":
      return (
        <ChipChoices
          legend={question.text}
          optional={optional}
          help={help ?? "Pick as many as you like."}
          options={options}
          value={Array.isArray(value) ? value : []}
          onChange={onAnswer}
          error={problem}
        />
      );
    case "rank":
      return (
        <RankQuestion
          legend={question.text}
          optional={optional}
          help={help}
          options={options}
          value={Array.isArray(value) ? value : []}
          onChange={onAnswer}
          error={problem}
        />
      );
    case "scale":
      return (
        <ScalePoints
          legend={question.text}
          optional={optional}
          help={help}
          options={options}
          value={typeof value === "number" && value >= 0 && value < options.length ? value : null}
          onChange={onAnswer}
          error={problem}
        />
      );
  }
}

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
        return (
          <Fragment key={question.id}>
            {controlFor(question, value, options, problem, (next) => onAnswer(question.id, next))}
          </Fragment>
        );
      })}
    </div>
  );
}
