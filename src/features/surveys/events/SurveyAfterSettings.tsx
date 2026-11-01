"use client";

import { useId, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import { Input, Textarea } from "@/components/ui/Input";
import OptionRow from "@/components/ui/OptionRow";
import Switch from "@/components/ui/Switch";
import { SURVEY_AFTER_HOURS, newSurveyAfter, type StoredSurveyAfter } from "@/lib/events/surveyAfter";
import { isQuestionRequired, newSurveyId, surveyQuestionsOf, type SurveyChoiceQuestion, type SurveyItem, type SurveyQuestion } from "@/lib/surveys/items";
import { questionTypeWords } from "@/lib/surveys/words";
import {
  ADDABLE_TYPES,
  STEP_WORDS,
  goesAtWords,
  hoursLineWords,
  isStandardQuestion,
  minutesFor,
  problemsByQuestion,
  questionProblems,
  settingsOf,
  timesOf,
  type AddableType,
} from "@/lib/surveys/events/after";
import { EVENT_EMAIL_BUTTON, eventIntro, eventSurveyEmailWords, eventSurveyTitle } from "@/lib/surveys/events/words";
import styles from "./surveyAfter.module.css";

/**
 * THE SURVEY AFTER AN EVENT, ITS SETTING: "Ask people how it
 * went", its questions, who gets it and when it goes. One form, drawn in two
 * places: the event editor's Survey after step before the event is published
 * (saved with the rest of the event), and the event's Survey after tab after
 * (saved by the tab, where some of it is fixed once it opens or goes).
 *
 * Controlled: it holds what is being edited and nothing else, and hands every
 * change up whole. The questions start as the standard set (`items: null`),
 * which the page hands in (`standard`: the question set an admin keeps on
 * Run NAISI › Surveys, else the code's); the first change to any of them
 * copies the set into the setting. A standard question is reworded, moved or
 * removed, never retyped; one added here is any of five kinds.
 *
 * Every control is at least 44px (docs/touch-targets.md), the text-like
 * buttons too.
 */

type EventFacts = { title: string; startAt: Date | null; endAt: Date | null; noSignup: boolean };

type Props = {
  /** The setting, or null for an event that has none (every event made before the step). */
  value: StoredSurveyAfter | null;
  onChange: (next: StoredSurveyAfter) => void;
  disabled: boolean;
  event: EventFacts;
  /** Whether the `event-surveys` job is switched on here: while it is off, nothing goes by itself. */
  jobOn: boolean;
  /** Where the form is, for the line about sending it sooner. */
  where: "editor" | "tab";
  /** What can no longer change, each with its line; absent where everything can. */
  locks?: { questions?: string | null; send?: string | null; reminder?: string | null; off?: string | null };
  /** The last line, under the two cards: what publishing sets up. */
  summary?: ReactNode;
  /** The standard questions as they stand, read on the server. */
  standard: SurveyItem[];
};

/** A fresh question of one of the five kinds the step adds; the question set's page adds them too. */
export function newQuestion(type: AddableType): SurveyQuestion {
  const base = { kind: "question" as const, id: newSurveyId("q"), title: "", body: [], required: false, optional: false };
  switch (type) {
    case "singleChoice":
    case "multipleChoice":
      return {
        ...base,
        type,
        options: [
          { id: newSurveyId("o"), label: "" },
          { id: newSurveyId("o"), label: "" },
        ],
      } as SurveyQuestion;
    case "rating":
      return { ...base, type, rating: { max: 5, minLabel: "", maxLabel: "" } } as SurveyQuestion;
    case "shortText":
      return { ...base, type, limit: { unit: "characters", max: 200 } } as SurveyQuestion;
    default:
      return { ...base, type: "longText", limit: { unit: "characters", max: 2000 } } as SurveyQuestion;
  }
}

/** "Long answer · optional", "Choose one · added for this event". */
function kindLine(question: SurveyQuestion, standard: readonly SurveyItem[]): string {
  return [
    questionTypeWords(question),
    isQuestionRequired(question) ? null : STEP_WORDS.optional,
    isStandardQuestion(question.id, standard) ? null : STEP_WORDS.added,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function SurveyAfterSettings({ value, onChange, disabled, event, jobOn, where, locks = {}, summary, standard }: Props) {
  const id = useId();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const setting = value ?? { ...newSurveyAfter(), on: false };
  const settings = settingsOf(setting, standard);
  const questions = surveyQuestionsOf(settings.items);
  const problems = problemsByQuestion(settings.items, standard);
  const general = questionProblems(settings.items, standard).filter((problem) => !/^Question \d+/.test(problem));
  const change = (patch: Partial<StoredSurveyAfter>) => onChange({ ...setting, ...patch });
  const setItems = (items: SurveyItem[]) => change({ items });
  const questionsFixed = disabled || Boolean(locks.questions);
  const sendFixed = disabled || Boolean(locks.send);

  function setQuestion(next: SurveyQuestion) {
    setItems(settings.items.map((item) => (item.id === next.id ? next : item)));
  }
  function move(at: number, by: -1 | 1) {
    const list = [...questions];
    const there = at + by;
    if (there < 0 || there >= list.length) return;
    [list[at], list[there]] = [list[there], list[at]];
    setItems(list);
  }
  function remove(questionId: string) {
    if (editing === questionId) setEditing(null);
    setItems(questions.filter((question) => question.id !== questionId));
  }
  function add(type: AddableType) {
    const question = newQuestion(type);
    setItems([...questions, question]);
    setAdding(false);
    setEditing(question.id);
  }

  const times = timesOf(event, { when: "standard", hours: SURVEY_AFTER_HOURS.standard });
  const after = timesOf(event, { when: "after", hours: setting.hours });
  const title = event.title.trim() || "Untitled event";
  // The email, as it will read: shown once the event has its date, which its
  // words name.
  const email =
    event.startAt && times.closesAt
      ? eventSurveyEmailWords({
          title: eventSurveyTitle(title),
          intro: eventIntro(event.startAt, questions.length, minutesFor(questions.length)),
          questions: questions.length,
          minutes: minutesFor(questions.length),
          eventTitle: title,
          closesAt: times.closesAt,
          signer: "",
        })
      : null;

  return (
    <div className={styles.settings}>
      <section className={styles.card} aria-labelledby={`${id}-on`}>
        <div className={styles.onRow}>
          <Switch
            id={`${id}-on`}
            checked={setting.on}
            onChange={(on) => change({ on })}
            disabled={disabled || (Boolean(locks.off) && setting.on)}
            label={STEP_WORDS.on}
            description={setting.on ? STEP_WORDS.onHint : STEP_WORDS.offHint}
          />
        </div>
        {locks.off && setting.on && <p className={styles.lock}>{locks.off}</p>}

        {setting.on && (
          <>
            <h3 className={styles.cardTitle}>{STEP_WORDS.questions}</h3>
            {locks.questions && <p className={styles.lock}>{locks.questions}</p>}
            <ol className={styles.questions}>
              {questions.map((question, at) => {
                const own = problems.get(question.id) ?? [];
                const open = editing === question.id && !questionsFixed;
                return (
                  <li key={question.id} className={styles.question}>
                    <div className={styles.questionHead}>
                      <span className={styles.number} aria-hidden="true">
                        {at + 1}
                      </span>
                      <div className={styles.questionWords}>
                        <span className={styles.questionTitle}>
                          {question.title.trim() || <span className={styles.empty}>No words yet</span>}
                          {!isStandardQuestion(question.id, standard) && (
                            <Chip tone="accent" className={styles.newChip}>
                              {STEP_WORDS.newChip}
                            </Chip>
                          )}
                        </span>
                        <span className={styles.kind}>{kindLine(question, standard)}</span>
                      </div>
                      {!questionsFixed && (
                        <div className={styles.actions}>
                          <Button
                            variant="ghost"
                            className={styles.action}
                            aria-expanded={open}
                            aria-label={open ? `Done with question ${at + 1}` : `Edit question ${at + 1}`}
                            onClick={() => setEditing(open ? null : question.id)}
                          >
                            {open ? STEP_WORDS.done : STEP_WORDS.edit}
                          </Button>
                          <Button variant="ghost" className={styles.action} aria-label={`Move question ${at + 1} up`} disabled={at === 0} onClick={() => move(at, -1)}>
                            {STEP_WORDS.up}
                          </Button>
                          <Button
                            variant="ghost"
                            className={styles.action}
                            aria-label={`Move question ${at + 1} down`}
                            disabled={at === questions.length - 1}
                            onClick={() => move(at, 1)}
                          >
                            {STEP_WORDS.down}
                          </Button>
                          <Button variant="ghost" className={styles.action} aria-label={`Remove question ${at + 1}`} onClick={() => remove(question.id)}>
                            {STEP_WORDS.remove}
                          </Button>
                        </div>
                      )}
                    </div>
                    {own.length > 0 && (
                      <p className={styles.problem} role="note">
                        {own.join(" ")}
                      </p>
                    )}
                    {open && <QuestionEditor question={question} number={at + 1} onChange={setQuestion} />}
                  </li>
                );
              })}
            </ol>
            {general.map((problem) => (
              <p key={problem} className={styles.problem} role="note">
                {problem}
              </p>
            ))}
            {!questionsFixed && (
              <div className={styles.addRow}>
                {adding ? (
                  <div className={styles.addMenu} role="group" aria-label="The kind of question to add">
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
                {!settings.standard && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditing(null);
                      change({ items: null });
                    }}
                  >
                    {STEP_WORDS.standard}
                  </Button>
                )}
              </div>
            )}
            {email && (
              <details className={styles.email}>
                <summary className={styles.emailSummary}>{STEP_WORDS.email}</summary>
                <div className={styles.emailBody}>
                  <p className={styles.emailSubject}>{email.subject}</p>
                  {email.paragraphs.filter(Boolean).map((line) => (
                    <p key={line} className={styles.emailLine}>
                      {line}
                    </p>
                  ))}
                  <p className={styles.emailButton}>{EVENT_EMAIL_BUTTON}</p>
                  <p className={styles.kind}>{STEP_WORDS.emailNote}</p>
                </div>
              </details>
            )}
          </>
        )}
      </section>

      {setting.on && (
        <div className={styles.pair}>
          <fieldset className={styles.card} disabled={sendFixed}>
            <legend className={styles.legend}>{STEP_WORDS.who}</legend>
            {locks.send && <p className={styles.lock}>{locks.send}</p>}
            {event.noSignup ? (
              <p className={styles.note}>{STEP_WORDS.noSignup}</p>
            ) : (
              <div className={styles.choices}>
                <OptionRow
                  type="radio"
                  name={`${id}-who`}
                  checked={setting.who === "came"}
                  onChange={() => change({ who: "came" })}
                  description={STEP_WORDS.cameHint}
                >
                  {STEP_WORDS.came}
                </OptionRow>
                <OptionRow type="radio" name={`${id}-who`} checked={setting.who === "signups"} onChange={() => change({ who: "signups" })}>
                  {STEP_WORDS.signups}
                </OptionRow>
              </div>
            )}
            {!event.noSignup && setting.who === "came" && (
              <OptionRow plain checked={setting.missed} onChange={(e) => change({ missed: e.target.checked })} description={STEP_WORDS.missedHint}>
                {STEP_WORDS.missed}
              </OptionRow>
            )}
          </fieldset>

          <fieldset className={styles.card} disabled={disabled}>
            <legend className={styles.legend}>{STEP_WORDS.when}</legend>
            <div className={styles.choices}>
              <OptionRow
                type="radio"
                name={`${id}-when`}
                checked={setting.when === "standard"}
                disabled={sendFixed}
                onChange={() => change({ when: "standard" })}
                description={times.sendAt ? `${goesAtWords(times.sendAt)}.${jobOn ? ` ${STEP_WORDS.nobodyPresses}` : ""}` : STEP_WORDS.undated}
              >
                {STEP_WORDS.standardWhen}
              </OptionRow>
              <OptionRow
                type="radio"
                name={`${id}-when`}
                checked={setting.when === "after"}
                disabled={sendFixed}
                onChange={() => change({ when: "after" })}
              >
                {STEP_WORDS.afterWhen}
              </OptionRow>
              {setting.when === "after" && (
                <div className={styles.hours}>
                  <label className={styles.hoursLabel} htmlFor={`${id}-hours`}>
                    {STEP_WORDS.hoursLabel}
                  </label>
                  <Input
                    id={`${id}-hours`}
                    className={styles.hoursInput}
                    type="number"
                    inputMode="numeric"
                    min={SURVEY_AFTER_HOURS.min}
                    max={SURVEY_AFTER_HOURS.max}
                    step={1}
                    value={setting.hours}
                    disabled={sendFixed}
                    onChange={(e) => {
                      const hours = Math.round(Number(e.target.value));
                      if (Number.isFinite(hours)) change({ hours: Math.min(SURVEY_AFTER_HOURS.max, Math.max(SURVEY_AFTER_HOURS.min, hours)) });
                    }}
                  />
                  <span className={styles.kind}>{hoursLineWords(after.sendAt, setting.hours)}</span>
                </div>
              )}
              <OptionRow
                type="radio"
                name={`${id}-when`}
                checked={setting.when === "hand"}
                disabled={sendFixed}
                onChange={() => change({ when: "hand" })}
              >
                {STEP_WORDS.handWhen}
              </OptionRow>
            </div>
            {locks.send && <p className={styles.lock}>{locks.send}</p>}
            <p className={styles.note}>{where === "editor" ? STEP_WORDS.sooner : STEP_WORDS.soonerHere}</p>
            {!jobOn && setting.when !== "hand" && <p className={styles.note}>{where === "editor" ? STEP_WORDS.jobOff : STEP_WORDS.jobOffHere}</p>}
            <OptionRow
              plain
              checked={setting.reminder}
              disabled={disabled || Boolean(locks.reminder)}
              onChange={(e) => change({ reminder: e.target.checked })}
            >
              {STEP_WORDS.reminder}
            </OptionRow>
            {locks.reminder && <p className={styles.lock}>{locks.reminder}</p>}
            <OptionRow plain checked={setting.showCode} onChange={(e) => change({ showCode: e.target.checked })} description={STEP_WORDS.showCodeHint}>
              {STEP_WORDS.showCode}
            </OptionRow>
          </fieldset>
        </div>
      )}

      {summary}
    </div>
  );
}

/**
 * One question's words, opened by Edit: its wording, its answers or the words
 * at each end, and whether it needs an answer. The question set's page for
 * the survey after an event draws it too.
 */
export function QuestionEditor({ question, number, onChange }: { question: SurveyQuestion; number: number; onChange: (next: SurveyQuestion) => void }) {
  const id = useId();
  const change = (patch: Partial<SurveyQuestion>) => onChange({ ...question, ...patch } as SurveyQuestion);
  const choice = question.type === "singleChoice" || question.type === "multipleChoice" ? (question as SurveyChoiceQuestion) : null;
  const options = choice?.options ?? [];
  const rating = question.type === "rating" ? (question as SurveyChoiceQuestion).rating : undefined;
  return (
    <div className={styles.editor}>
      <label className={styles.fieldLabel} htmlFor={`${id}-title`}>
        {STEP_WORDS.wording}
      </label>
      <Textarea
        id={`${id}-title`}
        value={question.title}
        rows={2}
        maxLength={200}
        onChange={(e) => change({ title: e.target.value })}
      />
      {choice && (
        <div className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>{STEP_WORDS.answers}</span>
          {options.map((option, at) => (
            <div key={option.id} className={styles.optionRow}>
              <Input
                aria-label={`Question ${number}, answer ${at + 1}`}
                value={option.label}
                maxLength={120}
                onChange={(e) =>
                  change({ options: options.map((each) => (each.id === option.id ? { ...each, label: e.target.value } : each)) } as Partial<SurveyQuestion>)
                }
              />
              <Button
                variant="ghost"
                disabled={options.length <= 2}
                aria-label={`Take out answer ${at + 1} of question ${number}`}
                onClick={() => change({ options: options.filter((each) => each.id !== option.id) } as Partial<SurveyQuestion>)}
              >
                {STEP_WORDS.takeOut}
              </Button>
            </div>
          ))}
          <div>
            <Button
              variant="secondary"
              disabled={options.length >= 20}
              onClick={() => change({ options: [...options, { id: newSurveyId("o"), label: "" }] } as Partial<SurveyQuestion>)}
            >
              {STEP_WORDS.addAnswer}
            </Button>
          </div>
        </div>
      )}
      {rating && (
        <div className={styles.ends}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor={`${id}-low`}>
              {STEP_WORDS.lowEnd}
            </label>
            <Input
              id={`${id}-low`}
              value={rating.minLabel ?? ""}
              maxLength={40}
              onChange={(e) => change({ rating: { ...rating, minLabel: e.target.value } } as Partial<SurveyQuestion>)}
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor={`${id}-high`}>
              {STEP_WORDS.highEnd}
            </label>
            <Input
              id={`${id}-high`}
              value={rating.maxLabel ?? ""}
              maxLength={40}
              onChange={(e) => change({ rating: { ...rating, maxLabel: e.target.value } } as Partial<SurveyQuestion>)}
            />
          </div>
        </div>
      )}
      <Switch
        checked={isQuestionRequired(question)}
        onChange={(on) => change({ optional: !on } as Partial<SurveyQuestion>)}
        label={STEP_WORDS.required}
        description={isQuestionRequired(question) ? STEP_WORDS.requiredOn : STEP_WORDS.requiredOff}
      />
    </div>
  );
}

