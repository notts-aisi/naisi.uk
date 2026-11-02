"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { QuestionEditor, newQuestion } from "@/features/surveys/events/SurveyAfterSettings";
import step from "@/features/surveys/events/surveyAfter.module.css";
import { useHydrated } from "@/hooks/useHydrated";
import { ADDABLE_TYPES, STEP_WORDS, problemsByQuestion, questionProblems, type AddableType } from "@/lib/surveys/events/after";
import { isQuestionRequired, surveyQuestionsOf, type SurveyChoiceQuestion, type SurveyItem, type SurveyQuestion } from "@/lib/surveys/items";
import { HOW_WAS_IT_ID, QUESTION_SET_WORDS } from "@/lib/surveys/questionSets";
import { questionTypeWords } from "@/lib/surveys/words";
import styles from "./questionSets.module.css";

/**
 * THE SURVEY AFTER AN EVENT'S QUESTION SET, edited whole: the questions the
 * event editor's Survey after step and New survey's After a social start
 * from. Edit, Up, Down and Remove on each, Add a question (the step's five
 * kinds), and a question's kind changed in its editor.
 *
 * A QUESTION WHOSE KIND CHANGES IS A NEW QUESTION, with a new id, so its
 * answers never sit beside another kind's under one id ("How was it?" is read
 * by its id for This term in numbers). Changed back to the kind it had, it
 * takes its own id again.
 *
 * "Back to the original questions" puts the code's set back in the form for
 * Save to keep, which the route keeps as no set at all. The route checks
 * everything this page does, and more. Every control is at least 44px.
 */

type Props = {
  /** The set as it stands: the stored set, else the code's. */
  initial: SurveyItem[];
  /** The code's own set, for "Back to the original questions". */
  original: SurveyItem[];
  /** "Last changed Mon 2 Nov by Zach.", or that nobody has. */
  changed: string;
};

/** Where a question came from: the id and kind it had when the page opened. */
type Origin = { id: string; type: string };

/**
 * A question of another kind: its words and Required switch kept, its
 * answers kept between the two choice kinds, everything else fresh.
 */
function retyped(question: SurveyQuestion, type: AddableType, id: string): SurveyQuestion {
  const fresh = newQuestion(type);
  const keep = { id, title: question.title, optional: !isQuestionRequired(question) };
  const options = (question as SurveyChoiceQuestion).options;
  if ((type === "singleChoice" || type === "multipleChoice") && options && options.length > 0) {
    return { ...fresh, ...keep, options } as SurveyQuestion;
  }
  return { ...fresh, ...keep } as SurveyQuestion;
}

export default function EventQuestionSet({ initial, original, changed }: Props) {
  const router = useRouter();
  const hydrated = useHydrated();
  const id = useId();
  const [questions, setQuestions] = useState<SurveyQuestion[]>(() => surveyQuestionsOf(initial));
  const [origins, setOrigins] = useState<Record<string, Origin>>(() =>
    Object.fromEntries(surveyQuestionsOf(initial).map((question) => [question.id, { id: question.id, type: question.type }])),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");

  // Only the code's kinds are held here: the set is the standard, so none of it is "added".
  const problems = problemsByQuestion(questions, []);
  const general = questionProblems(questions, []).filter((problem) => !/^Question \d+/.test(problem));

  const change = (next: SurveyQuestion[]) => {
    setQuestions(next);
    setSaid("");
  };
  const setQuestion = (next: SurveyQuestion) => change(questions.map((question) => (question.id === next.id ? next : question)));

  function move(at: number, by: -1 | 1) {
    const there = at + by;
    if (there < 0 || there >= questions.length) return;
    const list = [...questions];
    [list[at], list[there]] = [list[there], list[at]];
    change(list);
  }
  function remove(questionId: string) {
    if (editing === questionId) setEditing(null);
    change(questions.filter((question) => question.id !== questionId));
  }
  function add(type: AddableType) {
    const question = newQuestion(type);
    change([...questions, question]);
    setAdding(false);
    setEditing(question.id);
  }
  function setKind(question: SurveyQuestion, type: AddableType) {
    if (type === question.type) return;
    const origin = origins[question.id] ?? { id: question.id, type: question.type };
    // Back to the kind it had: its own id again. Any other kind: a new question.
    const nextId = type === origin.type ? origin.id : newQuestion(type).id;
    const next = retyped(question, type, nextId);
    setOrigins((current) => ({ ...current, [nextId]: origin }));
    change(questions.map((each) => (each.id === question.id ? next : each)));
    setEditing(nextId);
  }
  function back() {
    setQuestions(surveyQuestionsOf(original));
    setOrigins(Object.fromEntries(surveyQuestionsOf(original).map((question) => [question.id, { id: question.id, type: question.type }])));
    setEditing(null);
    setAdding(false);
    setError("");
    setSaid(QUESTION_SET_WORDS.backNote);
  }

  async function save() {
    const problem = questionProblems(questions, [])[0];
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    setSaid("");
    try {
      const response = await fetch("/api/surveys/question-sets/event", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: questions }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? QUESTION_SET_WORDS.failed);
      } else {
        setSaid(QUESTION_SET_WORDS.saved);
        router.refresh();
      }
    } catch {
      setError(QUESTION_SET_WORDS.offline);
    } finally {
      setBusy(false);
    }
  }

  const same = JSON.stringify(questions) === JSON.stringify(surveyQuestionsOf(original));
  return (
    <fieldset className={styles.plain} disabled={!hydrated || busy}>
      <ol className={step.questions}>
        {questions.map((question, at) => {
          const own = problems.get(question.id) ?? [];
          const open = editing === question.id;
          const origin = origins[question.id];
          const renewed = origin !== undefined && origin.id !== question.id;
          return (
            <li key={question.id} className={step.question}>
              <div className={step.questionHead}>
                <span className={step.number} aria-hidden="true">
                  {at + 1}
                </span>
                <div className={step.questionWords}>
                  <span className={step.questionTitle}>{question.title.trim() || <span className={step.empty}>No words yet</span>}</span>
                  <span className={step.kind}>{[questionTypeWords(question), isQuestionRequired(question) ? null : STEP_WORDS.optional].filter(Boolean).join(" · ")}</span>
                </div>
                <div className={step.actions}>
                  <Button
                    variant="ghost"
                    className={step.action}
                    aria-expanded={open}
                    aria-label={open ? `Done with question ${at + 1}` : `Edit question ${at + 1}`}
                    onClick={() => setEditing(open ? null : question.id)}
                  >
                    {open ? STEP_WORDS.done : STEP_WORDS.edit}
                  </Button>
                  <Button variant="ghost" className={step.action} aria-label={`Move question ${at + 1} up`} disabled={at === 0} onClick={() => move(at, -1)}>
                    {STEP_WORDS.up}
                  </Button>
                  <Button
                    variant="ghost"
                    className={step.action}
                    aria-label={`Move question ${at + 1} down`}
                    disabled={at === questions.length - 1}
                    onClick={() => move(at, 1)}
                  >
                    {STEP_WORDS.down}
                  </Button>
                  <Button variant="ghost" className={step.action} aria-label={`Remove question ${at + 1}`} onClick={() => remove(question.id)}>
                    {STEP_WORDS.remove}
                  </Button>
                </div>
              </div>
              {own.length > 0 && (
                <p className={step.problem} role="note">
                  {own.join(" ")}
                </p>
              )}
              {open && (
                <div className={styles.kindRow}>
                  <label className={step.fieldLabel} htmlFor={`${id}-${question.id}-kind`}>
                    {QUESTION_SET_WORDS.kind}
                  </label>
                  <Select
                    id={`${id}-${question.id}-kind`}
                    className={styles.kindSelect}
                    value={question.type}
                    onChange={(event) => setKind(question, event.target.value as AddableType)}
                  >
                    {ADDABLE_TYPES.map((choice) => (
                      <option key={choice.type} value={choice.type}>
                        {choice.label}
                      </option>
                    ))}
                  </Select>
                  {renewed && <p className={step.note}>{QUESTION_SET_WORDS.newQuestion}</p>}
                  {(origin?.id ?? question.id) === HOW_WAS_IT_ID && <p className={step.note}>{QUESTION_SET_WORDS.howWasIt}</p>}
                </div>
              )}
              {open && <QuestionEditor question={question} number={at + 1} onChange={setQuestion} />}
            </li>
          );
        })}
      </ol>
      {general.map((problem) => (
        <p key={problem} className={step.problem} role="note">
          {problem}
        </p>
      ))}
      <div className={step.addRow}>
        {adding ? (
          <div className={step.addMenu} role="group" aria-label="The kind of question to add">
            {ADDABLE_TYPES.map((choice) => (
              <Button key={choice.type} variant="secondary" onClick={() => add(choice.type)}>
                {choice.label}
              </Button>
            ))}
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            {STEP_WORDS.add}
          </Button>
        )}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p className={styles.status} role="status">
        {said || changed}
      </p>
      <div className={styles.buttons}>
        <Button variant="ghost" onClick={back} disabled={same}>
          {QUESTION_SET_WORDS.backQuestions}
        </Button>
        <Button onClick={save}>{busy ? QUESTION_SET_WORDS.saving : QUESTION_SET_WORDS.save}</Button>
      </div>
    </fieldset>
  );
}
