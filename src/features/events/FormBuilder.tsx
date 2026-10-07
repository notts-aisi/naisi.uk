"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import OptionRow from "@/components/ui/OptionRow";
import ResponsiveSelect from "@/components/ui/ResponsiveSelect";
import {
  DEFAULT_ANSWER_MAX_LENGTH,
  emptyQuestion,
  QUESTION_HELP_TEXT_MAX,
  QUESTION_MAX_LENGTH_MAX,
  QUESTION_MAX_LENGTH_MIN,
  type FormQuestion,
  type FormQuestionType,
} from "@/lib/firestore/events";
import { FORM_PRESETS } from "./formPresets";
import styles from "./FormBuilder.module.css";

type Props = {
  questions: FormQuestion[];
  onChange: (next: FormQuestion[]) => void;
  disabled?: boolean;
  /**
   * Hide the events preset picker and the food/dietary question type.
   * Course application forms reuse this builder, where burger presets and
   * an allergies checklist make no sense.
   */
  showPresets?: boolean;
  hiddenTypes?: FormQuestionType[];
  /** Replaces the events-flavoured empty-state copy. */
  emptyStateHint?: string;
  /**
   * The words on the button that adds a question, drawn with a plus beside
   * them. Left out, the button reads "+ Add question", which is what the
   * forms of a course run and of an older application round show.
   */
  addLabel?: string;
  /**
   * Draw each question as one row (its words, its kind, whether it has to be
   * answered) that opens to be edited, instead of every question open at
   * once. A question that has just been added opens by itself. Off unless a
   * caller asks: the other forms that use this builder keep every question
   * open.
   */
  collapsible?: boolean;
};

const TYPE_LABEL: Record<FormQuestionType, string> = {
  shortText: "Short text",
  longText: "Long text",
  singleSelect: "Single choice",
  multiSelect: "Multiple choice",
  yesNo: "Yes or no",
  dietaryAllergies: "Allergies checklist",
};

/**
 * Whether this question can receive free text at all, and so whether a
 * character limit means anything for it. Short and long text are the answer
 * itself; the other two are "Other" boxes, which `validateAnswers` caps with
 * the same number.
 */
function acceptsFreeText(q: FormQuestion): boolean {
  return (
    q.type === "shortText" ||
    q.type === "longText" ||
    q.type === "dietaryAllergies" ||
    (q.type === "multiSelect" && Boolean(q.allowOther))
  );
}

/**
 * Read a typed character limit. Blank clears it back to the default, and
 * anything unparseable is treated as blank rather than as zero. The range is
 * NOT clamped here: every save path that takes this builder's output (both
 * event paths and the run editor) refuses an out-of-range number and names the
 * question, and the hint below the input says so before they get there.
 */
function parseLimit(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  return Math.floor(n);
}

const ADD_MENU: Array<{ type: FormQuestionType; hint: string }> = [
  { type: "shortText", hint: "One-line answer" },
  { type: "longText", hint: "Multi-line text" },
  { type: "singleSelect", hint: "Pick one option" },
  { type: "multiSelect", hint: "Pick any number" },
  { type: "yesNo", hint: "A yes or a no" },
  { type: "dietaryAllergies", hint: "Checkbox list of common allergies" },
];

export default function FormBuilder({
  questions,
  onChange,
  disabled,
  showPresets = true,
  hiddenTypes = [],
  emptyStateHint,
  addLabel,
  collapsible = false,
}: Props) {
  const addMenu = ADD_MENU.filter((item) => !hiddenTypes.includes(item.type));
  const [adding, setAdding] = useState(false);
  // Which question is open to be edited, when questions are drawn as rows.
  const [openId, setOpenId] = useState<string | null>(null);
  const [presetWarning, setPresetWarning] = useState<string | null>(null);

  function patch(index: number, fields: Partial<FormQuestion>) {
    const next = questions.slice();
    next[index] = { ...next[index], ...fields } as FormQuestion;
    onChange(next);
  }

  function addQuestion(type: FormQuestionType) {
    const added = emptyQuestion(type);
    onChange([...questions, added]);
    setOpenId(added.id);
    setAdding(false);
  }

  function removeQuestion(index: number) {
    const next = questions.slice();
    next.splice(index, 1);
    onChange(next);
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= questions.length) return;
    const next = questions.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function applyPreset(presetId: string) {
    if (!presetId) return;
    const preset = FORM_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (questions.length > 0) {
      if (!window.confirm(`Replace the current form with the "${preset.label}" preset? Your existing questions will be lost.`)) {
        return;
      }
    }
    onChange(preset.build());
    setPresetWarning(null);
  }

  // Where the preset picker sits depends on the shape: first for the forms
  // that keep every question open, and under the add button where questions
  // are rows, which is where the redesign puts its shortcuts.
  const presets = showPresets ? (
    <div className={styles.preset}>
      <div className={styles.presetWords}>
        <strong>Start from a preset</strong>
        <span>Pick a set of questions, then change them. You can always add or remove one.</span>
      </div>
      <ResponsiveSelect
        value=""
        onChange={(next) => {
          if (next) applyPreset(next);
        }}
        options={[
          { value: "", label: "Choose a preset…", disabled: true },
          ...FORM_PRESETS.map((p) => ({
            value: p.id,
            label: `${p.label}: ${p.description}`,
          })),
        ]}
        disabled={disabled}
        ariaLabel="Form preset"
      />
      {presetWarning && <p className={styles.warn}>{presetWarning}</p>}
    </div>
  ) : null;

  return (
    <div className={styles.wrap}>
      {!collapsible && presets}

      {questions.length === 0 && (
        <p className={styles.none}>
          {emptyStateHint ??
            "No questions yet. Everyone is asked their name and email, so you only need questions for anything else."}
        </p>
      )}

      {questions.map((q, i) =>
        collapsible && q.id !== openId ? (
          <div key={q.id} className={styles.row}>
            <div className={styles.rowWords}>
              <div className={q.label.trim() ? styles.rowLabel : styles.rowLabelEmpty}>
                {q.label.trim() || "No question written yet"}
              </div>
              <div className={styles.rowKind}>{kindLine(q)}</div>
            </div>
            <div className={styles.rowEnd}>
              <Chip tone="neutral">{q.required ? "Required" : "Optional"}</Chip>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpenId(q.id)}
                aria-label={`${disabled ? "View" : "Edit"} “${q.label.trim() || "question"}”`}
              >
                {disabled ? "View" : "Edit"}
              </Button>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => removeQuestion(i)}
                disabled={disabled}
                aria-label={`Remove “${q.label.trim() || "question"}”`}
                title="Remove"
              >
                <CloseIcon />
              </button>
            </div>
          </div>
        ) : (
        <div key={q.id} className={styles.question}>
          <div className={styles.qHeader}>
            <span className={`meta ${styles.qType}`}>{TYPE_LABEL[q.type]}</span>
            <div className={styles.qControls}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => moveQuestion(i, -1)}
                disabled={disabled || i === 0}
                aria-label="Move up"
                title="Move up"
              >
                <ArrowIcon up />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => moveQuestion(i, 1)}
                disabled={disabled || i === questions.length - 1}
                aria-label="Move down"
                title="Move down"
              >
                <ArrowIcon />
              </button>
              <Button type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeQuestion(i)}
                disabled={disabled}
              >
                Remove
              </Button>
              {collapsible && (
                <Button type="button" variant="secondary" size="sm" onClick={() => setOpenId(null)}>
                  Done
                </Button>
              )}
            </div>
          </div>

          <div className={styles.qBody}>
            <label className={styles.fieldLabel}>
              <span>Question</span>
              <Input
                type="text"
                value={q.label}
                onChange={(e) => patch(i, { label: e.target.value } as Partial<FormQuestion>)}
                disabled={disabled}
                placeholder="e.g. Any food allergies?"
              />
            </label>

            {(q.type === "shortText" || q.type === "longText") && (
              <label className={styles.fieldLabel}>
                <span>Placeholder (optional)</span>
                <Input
                  type="text"
                  value={q.placeholder ?? ""}
                  onChange={(e) =>
                    patch(i, { placeholder: e.target.value } as Partial<FormQuestion>)
                  }
                  disabled={disabled}
                  placeholder="e.g. vegan, halal, nut allergy"
                />
              </label>
            )}

            {(q.type === "singleSelect" || q.type === "multiSelect") && (
              <OptionsEditor
                options={q.options}
                onChange={(options) =>
                  patch(i, { options } as Partial<FormQuestion>)
                }
                disabled={disabled}
              />
            )}

            {q.type === "multiSelect" && (
              <>
                <OptionRow
                  plain
                  checked={Boolean(q.allowOther)}
                  onChange={(e) =>
                    patch(i, { allowOther: e.target.checked } as Partial<FormQuestion>)
                  }
                  disabled={disabled}
                >
                  Include an “Other” box people can type into
                </OptionRow>
                <label className={styles.fieldLabel}>
                  <span>“None of these” option (optional)</span>
                  <Input
                    type="text"
                    value={q.noneOption ?? ""}
                    onChange={(e) =>
                      patch(i, {
                        noneOption: e.target.value || undefined,
                      } as Partial<FormQuestion>)
                    }
                    disabled={disabled}
                    placeholder="e.g. No, I'm happy with any toppings"
                  />
                </label>
              </>
            )}

            {q.type === "dietaryAllergies" && (
              <p className={styles.helper}>
                People see a checklist of common allergies and dietary
                requirements (vegetarian, vegan and the major allergens), a
                “no requirements” option, and a box to type anything else.
              </p>
            )}

            <label className={styles.fieldLabel}>
              <span>Help text (optional)</span>
              <Input
                type="text"
                value={q.helpText ?? ""}
                onChange={(e) =>
                  patch(i, {
                    helpText: e.target.value || undefined,
                  } as Partial<FormQuestion>)
                }
                disabled={disabled}
                maxLength={QUESTION_HELP_TEXT_MAX}
                placeholder="e.g. Two or three sentences is plenty"
              />
              <span className={styles.helper}>
                Shown under the question, before the answer box.
              </span>
            </label>

            {acceptsFreeText(q) && (
              <label className={styles.fieldLabel}>
                <span>Character limit (optional)</span>
                <Input
                  type="number"
                  className={styles.narrow}
                  value={q.maxLength ?? ""}
                  min={QUESTION_MAX_LENGTH_MIN}
                  max={QUESTION_MAX_LENGTH_MAX}
                  step={1}
                  onChange={(e) =>
                    patch(i, {
                      maxLength: parseLimit(e.target.value),
                    } as Partial<FormQuestion>)
                  }
                  disabled={disabled}
                  placeholder={String(DEFAULT_ANSWER_MAX_LENGTH)}
                />
                {q.maxLength === undefined ? (
                  <span className={styles.helper}>
                    Blank means the default of {DEFAULT_ANSWER_MAX_LENGTH}{" "}
                    characters.
                  </span>
                ) : q.maxLength < QUESTION_MAX_LENGTH_MIN ||
                  q.maxLength > QUESTION_MAX_LENGTH_MAX ? (
                  <span className={styles.warn}>
                    Must be between {QUESTION_MAX_LENGTH_MIN} and{" "}
                    {QUESTION_MAX_LENGTH_MAX}. Saving is refused until this is
                    fixed, and answers are capped at {QUESTION_MAX_LENGTH_MAX}{" "}
                    however the form is stored.
                  </span>
                ) : (
                  <span className={styles.helper}>
                    Answers stop at {q.maxLength} characters, with a live
                    counter on long text.
                  </span>
                )}
              </label>
            )}

            <OptionRow
              plain
              checked={q.required}
              onChange={(e) =>
                patch(i, { required: e.target.checked } as Partial<FormQuestion>)
              }
              disabled={disabled}
            >
              Required
            </OptionRow>
          </div>
        </div>
        ),
      )}

      {adding ? (
        <div className={styles.addMenu}>
          <div className={styles.addMenuHeader}>
            <strong>What kind of question?</strong>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
          <div className={styles.addMenuGrid}>
            {addMenu.map((item) => (
              <button
                key={item.type}
                type="button"
                className={styles.addMenuItem}
                onClick={() => addQuestion(item.type)}
              >
                <strong>{TYPE_LABEL[item.type]}</strong>
                <span>{item.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          {addLabel ? (
            <Button
              type="button"
              variant="secondary"
              leading={<PlusIcon />}
              onClick={() => setAdding(true)}
              disabled={disabled}
            >
              {addLabel}
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={() => setAdding(true)} disabled={disabled}>
              + Add question
            </Button>
          )}
        </div>
      )}

      {collapsible && presets}
    </div>
  );
}

/**
 * A question's kind in words, with the choices of a choice question after it:
 * "Single choice · None, Vegetarian, Vegan".
 */
function kindLine(q: FormQuestion): string {
  const kind = TYPE_LABEL[q.type];
  if (q.type !== "singleSelect" && q.type !== "multiSelect") return kind;
  const options = q.options.map((o) => o.trim()).filter(Boolean);
  return options.length > 0 ? `${kind} · ${options.join(", ")}` : kind;
}

function PlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** An arrow for moving a question: down, or up. */
function ArrowIcon({ up = false }: { up?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={up ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6"} />
    </svg>
  );
}

function OptionsEditor({
  options,
  onChange,
  disabled,
}: {
  options: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  function patch(i: number, v: string) {
    const next = options.slice();
    next[i] = v;
    onChange(next);
  }
  function add() {
    onChange([...options, ""]);
  }
  function remove(i: number) {
    const next = options.slice();
    next.splice(i, 1);
    onChange(next.length === 0 ? [""] : next);
  }
  return (
    <div className={styles.optionsWrap}>
      <span className={styles.fieldLabel}>
        <span>Options</span>
      </span>
      {options.map((opt, i) => (
        <div key={i} className={styles.optionRow}>
          <Input
            type="text"
            value={opt}
            onChange={(e) => patch(i, e.target.value)}
            disabled={disabled}
            placeholder={`Option ${i + 1}`}
            aria-label={`Option ${i + 1}`}
          />
          <Button type="button"
            variant="ghost"
            size="sm"
            onClick={() => remove(i)}
            disabled={disabled || options.length <= 1}
            aria-label={`Remove option ${i + 1}`}
          >
            Remove
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="ghost" size="sm" onClick={add} disabled={disabled}>
          + Add option
        </Button>
      </div>
    </div>
  );
}
