"use client";

import { useId } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Select from "@/components/ui/Select";
import {
  APPLICATION_LIMITS,
  QUESTION_TYPES,
  type QuestionType,
} from "@/lib/applications/model";
import { QUESTION_TYPE_LABEL, questionChips } from "@/lib/applications/editor/sets";
import { LINKS_HINT } from "@/lib/applications/linkedText";
import { Chip, MoreMenu, Tick } from "./controls";
import { CloseIcon, GripIcon, PlusIcon } from "./Icons";
import { canBeScored, takesOptions, takesWordLimit, type LocalQuestion } from "./questionModel";
import shared from "./editor.module.css";
import styles from "./FormEditor.module.css";

/**
 * One question in a set: a row in the list, or the same row opened for
 * editing.
 *
 * BOTH ways to reorder, on purpose. The handle drags with a pointer and moves
 * with the keyboard once it has focus (space, then the arrow keys). The More
 * menu on an open question has Move up and Move down as plain buttons, for a
 * touch screen where a drag competes with the page's own scroll and for
 * anybody who would rather press than aim.
 */

type Props = {
  question: LocalQuestion;
  /** 1 for the first question in its set. */
  position: number;
  count: number;
  setLabel: string;
  /** True when this question is the one open for editing. */
  open: boolean;
  /** The questions are locked: nothing here can change. */
  locked: boolean;
  /** The set's Scored switch is on. A ranking in such a set says that it is not scored. */
  inScoredSet: boolean;
  onOpen: () => void;
  onDone: () => void;
  onChange: (patch: Partial<LocalQuestion>) => void;
  onMove: (by: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** False once the set holds as many questions as it may. */
  canDuplicate: boolean;
};

const L = APPLICATION_LIMITS;

export default function QuestionCard(props: Props) {
  const { question, position, setLabel, open, locked } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.key,
    disabled: locked,
  });
  const style = { transform: CSS.Translate.toString(transform), transition };

  const handle = locked ? null : (
    <button
      type="button"
      className={styles.grip}
      {...attributes}
      {...listeners}
      aria-label={`Drag to reorder question ${position} in ${setLabel}`}
    >
      <GripIcon size={20} />
    </button>
  );

  if (open && !locked) {
    return (
      <li
        ref={setNodeRef}
        style={style}
        className={`${styles.question} ${styles.questionOpen} ${isDragging ? styles.questionLifted : ""}`}
      >
        <div className={styles.questionRail}>
          {handle}
          <span className={styles.number}>{position}</span>
        </div>
        <QuestionFields {...props} />
      </li>
    );
  }

  const chips = questionChips({ ...question, id: question.id ?? "" });
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`${styles.question} ${locked ? styles.questionLocked : ""} ${isDragging ? styles.questionLifted : ""}`}
    >
      {handle}
      <span className={styles.number}>{position}</span>
      <div className={styles.questionBody}>
        <div className={`${styles.questionText} ${question.text.trim() ? "" : styles.questionTextEmpty}`}>
          {question.text.trim() || "A question with no text yet"}
        </div>
        <div className={styles.questionChips}>
          {chips.map((chip) => (
            <Chip key={chip}>{chip}</Chip>
          ))}
          {question.required ? <Chip tone="accent">Required</Chip> : <Chip>Optional</Chip>}
          {/* In a set whose answers are scored, the one kind of question that is not says so. */}
          {props.inScoredSet && !canBeScored(question.type) ? <Chip>Not scored</Chip> : null}
        </div>
      </div>
      {!locked && (
        <button
          type="button"
          className={`${shared.btn} ${shared.btnSm} ${shared.btnQuiet} ${styles.questionEdit}`}
          aria-label={`Edit question ${position}`}
          onClick={props.onOpen}
        >
          Edit
        </button>
      )}
    </li>
  );
}

function QuestionFields({
  question,
  position,
  count,
  onChange,
  onDone,
  onMove,
  onDuplicate,
  onDelete,
  canDuplicate,
}: Props) {
  const ids = useId();
  const withOptions = takesOptions(question.type);
  const fromRanking = question.type === "choice" && question.optionsFromRanking;
  // Always at least two boxes to type in: a choice of one is not a choice.
  const options = question.options.length >= 2 ? question.options : [...question.options, "", ""].slice(0, 2);

  const setOption = (at: number, value: string) => {
    const next = [...options];
    next[at] = value;
    onChange({ options: next });
  };

  const changeType = (type: QuestionType) => {
    onChange({
      type,
      optionsFromRanking: type === "choice" ? question.optionsFromRanking : false,
    });
  };

  return (
    <div className={styles.questionFields}>
      <div className={shared.field}>
        <label htmlFor={`${ids}-text`} className={shared.label}>
          Question
        </label>
        <textarea
          id={`${ids}-text`}
          rows={2}
          className={shared.textarea}
          value={question.text}
          maxLength={L.questionText}
          // Opening a question is a press on its own Edit button, so focus
          // lands where that press was pointing.
          autoFocus
          onChange={(event) => onChange({ text: event.target.value })}
        />
      </div>

      <div className={shared.field}>
        <label htmlFor={`${ids}-help`} className={shared.label}>
          Help text <span className={shared.optional}>(optional)</span>
        </label>
        <input
          id={`${ids}-help`}
          type="text"
          className={shared.input}
          placeholder="Shown under the question"
          value={question.help}
          maxLength={L.questionHelp}
          aria-describedby={`${ids}-help-links`}
          onChange={(event) => onChange({ help: event.target.value })}
        />
        <p id={`${ids}-help-links`} className={shared.hint}>
          {LINKS_HINT}
        </p>
      </div>

      <div className={styles.questionRow}>
        <div className={`${shared.field} ${styles.questionType}`}>
          <label htmlFor={`${ids}-type`} className={shared.label}>
            Answer type
          </label>
          <Select
            id={`${ids}-type`}
            className={shared.select}
            value={question.type}
            onChange={(event) => changeType(event.target.value as QuestionType)}
          >
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {QUESTION_TYPE_LABEL[type]}
              </option>
            ))}
          </Select>
        </div>
        {takesWordLimit(question.type) && (
          <div className={`${shared.field} ${styles.questionLimit}`}>
            <label htmlFor={`${ids}-limit`} className={shared.label}>
              Word limit
            </label>
            <input
              id={`${ids}-limit`}
              type="text"
              inputMode="numeric"
              className={shared.input}
              value={question.wordLimit === null ? "" : String(question.wordLimit)}
              maxLength={4}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "");
                onChange({ wordLimit: digits ? Number(digits) : null });
              }}
            />
          </div>
        )}
        <div className={styles.questionRequired}>
          <Tick
            label="Required"
            checked={question.required}
            onChange={(required) => onChange({ required })}
          />
        </div>
      </div>

      {withOptions && (
        <fieldset className={shared.fieldset}>
          <legend className={shared.label}>
            {question.type === "scale"
              ? "Points on the scale, lowest first"
              : question.type === "rank"
                ? "Options to put in order"
                : "Options"}
          </legend>
          {question.type === "rank" && (
            <p className={shared.hint}>
              People tick the ones they’d like and put them in order, and can leave some out. A ranking isn’t
              scored.
            </p>
          )}
          {question.type === "choice" && (
            <Tick
              label="Use the programmes they ranked, plus Either"
              checked={question.optionsFromRanking}
              onChange={(optionsFromRanking) => onChange({ optionsFromRanking })}
            />
          )}
          {!fromRanking && (
            <>
              <ol className={styles.options}>
                {options.map((option, at) => (
                  <li key={at} className={styles.option}>
                    <input
                      type="text"
                      className={shared.input}
                      aria-label={`Option ${at + 1}`}
                      value={option}
                      maxLength={L.optionText}
                      onChange={(event) => setOption(at, event.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.optionRemove}
                      aria-label={`Remove option ${at + 1}`}
                      disabled={options.length <= 2}
                      onClick={() => onChange({ options: options.filter((_, index) => index !== at) })}
                    >
                      <CloseIcon size={16} />
                    </button>
                  </li>
                ))}
              </ol>
              <div className={styles.optionsFoot}>
                <button
                  type="button"
                  className={`${shared.btn} ${shared.btnSm} ${shared.btnQuiet}`}
                  disabled={options.length >= L.maxOptions}
                  onClick={() => onChange({ options: [...options, ""] })}
                >
                  <PlusIcon />
                  Add an option
                </button>
              </div>
            </>
          )}
        </fieldset>
      )}

      <div className={styles.questionFoot}>
        <button type="button" className={`${shared.btn} ${shared.btnSm}`} onClick={onDone}>
          Done
        </button>
        <MoreMenu
          label={`More for question ${position}`}
          actions={[
            { label: "Move up", onSelect: () => onMove(-1), disabled: position === 1 },
            { label: "Move down", onSelect: () => onMove(1), disabled: position === count },
            { label: "Duplicate", onSelect: onDuplicate, disabled: !canDuplicate },
            { label: "Delete question", onSelect: onDelete, careful: true },
          ]}
        />
      </div>
    </div>
  );
}
