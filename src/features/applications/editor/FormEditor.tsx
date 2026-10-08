"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import Select from "@/components/ui/Select";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import kit from "@/features/applications/kit/kit.module.css";
import { APPLICATION_LIMITS, type QuestionSetScope } from "@/lib/applications/model";
import { lockedSentence } from "@/lib/applications/editor/lock";
import { own } from "@/lib/applications/editor/own";
import {
  SET_ROLE_LABEL,
  fixedSectionsBefore,
  questionCountLabel,
  scoredRefusal,
  type FixedSection,
} from "@/lib/applications/editor/sets";
import type { FormStaffView, QuestionSetView } from "@/lib/applications/editor/views";
import { Chip, DialogFrame, MoreMenu, SavedStatus, Toggle, type SaveState } from "./controls";
import {
  EditorApiError,
  createSet,
  deleteSet,
  patchForm,
  patchSet,
  type EditorPayload,
} from "./editorClient";
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  InfoIcon,
  LockIcon,
  PlusIcon,
} from "./Icons";
import QuestionCard from "./QuestionCard";
import {
  blankQuestion,
  canBeScored,
  duplicateQuestion,
  firstProblem,
  moved,
  toLocalSet,
  toPatch,
  type LocalQuestion,
  type LocalSet,
} from "./questionModel";
import shared from "./editor.module.css";
import styles from "./FormEditor.module.css";

/**
 * The application form's editor: the sections in order on the left, one
 * question set open on the right. Admins only; the page decides that before
 * this renders.
 *
 * SAVING. There is no Save button. A change is kept on screen at once and
 * sent a moment after the last keystroke, a whole set at a time, and the line
 * at the top says which of the two is true: "Saved", "Saving…", or what is
 * stopping it. A reorder, a delete and the Scored switch are sent straight
 * away. A set that cannot be saved yet (a question with no text) is held back
 * with the reason rather than sent to be refused.
 *
 * LOCKED. Once anybody has sent an application the questions cannot change,
 * and the routes refuse it. This screen then shows every question and offers
 * no way to edit one, and says why in one line.
 */

type Props = {
  form: FormStaffView;
  sets: QuestionSetView[];
  /** The built-in sections asked after the question sets. */
  fixedAfter: FixedSection[];
  /** The set to open first, when the address names one. */
  initialSetId: string | null;
  /** Where the term's programmes are. */
  homeHref: string;
  /**
   * Where the term is, as the chip beside the title: the same word the term's
   * own page and each programme's header draw, worked out by the page.
   */
  stage: { title: string; live: boolean; soon: boolean };
};

const SAVE_DELAY_MS = 700;
const L = APPLICATION_LIMITS;

/** Local sets, with the server's view of everything but the questions being typed. */
function mergeSets(local: readonly LocalSet[], stored: readonly QuestionSetView[]): LocalSet[] {
  return stored.map((set) => {
    const mine = local.find((other) => other.id === set.id);
    return mine ? { ...toLocalSet(set), questions: mine.questions } : toLocalSet(set);
  });
}

export default function FormEditor({
  form: initialForm,
  sets: initialSets,
  fixedAfter,
  initialSetId,
  homeHref,
  stage,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [sets, setSets] = useState<LocalSet[]>(() => initialSets.map(toLocalSet));
  const [selectedId, setSelectedId] = useState<string | null>(
    () => initialSets.find((set) => set.id === initialSetId)?.id ?? initialSets[0]?.id ?? null,
  );
  const [editingKey, setEditingKey] = useState<string | null>(null);
  /** The Scored switch on a stream set that has no questions to carry it yet. */
  const [scoredWhenEmpty, setScoredWhenEmpty] = useState<Record<string, boolean>>({});

  // What has changed, and what the server has. A set is unsaved while its
  // version is ahead of the version last stored.
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [storedVersions, setStoredVersions] = useState<Record<string, number>>({});
  /** A version the server refused, so it is not sent again until it changes. */
  const [refused, setRefused] = useState<Record<string, number>>({});
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());
  const urgent = useRef(false);

  const [dialog, setDialog] = useState<
    | { kind: "term" }
    | { kind: "new-set" }
    | { kind: "rename"; setId: string }
    | { kind: "delete"; setId: string }
    | null
  >(null);

  const locked = form.locked;
  const selected = sets.find((set) => set.id === selectedId) ?? sets[0] ?? null;
  const fixedBefore = useMemo(() => fixedSectionsBefore(form), [form]);

  const unsaved = (set: LocalSet) => unsavedAt(set.id, versions, storedVersions);
  const heldBack = sets
    .filter(unsaved)
    .map((set) => firstProblem(set.questions))
    .find((problem) => problem !== null);
  const saveState: SaveState = heldBack
    ? "waiting"
    : serverProblem
      ? "problem"
      : sets.some(unsaved)
        ? "saving"
        : "saved";
  const statusText = heldBack ? `Not saved yet. ${heldBack}` : serverProblem;

  // -------------------------------------------------------------------------
  // Saving
  // -------------------------------------------------------------------------

  useEffect(() => {
    const due = sets.filter(
      (set) =>
        unsavedAt(set.id, versions, storedVersions) &&
        own(refused, set.id) !== own(versions, set.id) &&
        firstProblem(set.questions) === null,
    );
    if (due.length === 0) return;
    const delay = urgent.current ? 0 : SAVE_DELAY_MS;
    urgent.current = false;
    const timer = setTimeout(() => {
      for (const set of due) {
        if (inFlight.current.has(set.id)) continue;
        const version = own(versions, set.id) ?? 0;
        const sentKeys = set.questions.map((question) => question.key);
        inFlight.current.add(set.id);
        patchSet(form.id, set.id, { questions: set.questions.map(toPatch) })
          .then(({ set: stored }) => {
            // Only the ids are taken from the answer: the text on screen may
            // already be ahead of what was sent.
            setSets((current) =>
              current.map((other) =>
                other.id !== set.id
                  ? other
                  : {
                      ...other,
                      questions: other.questions.map((question) => {
                        const at = sentKeys.indexOf(question.key);
                        const id = at === -1 ? undefined : stored.questions[at]?.id;
                        return id ? { ...question, id } : question;
                      }),
                    },
              ),
            );
            setServerProblem(null);
            setStoredVersions((current) => ({ ...current, [set.id]: version }));
          })
          .catch((err: unknown) => {
            setServerProblem(err instanceof Error ? err.message : "That did not save.");
            setRefused((current) => ({ ...current, [set.id]: version }));
            // The questions locked while this page was open.
            if (err instanceof EditorApiError && err.status === 409) {
              setForm((current) => ({ ...current, locked: true, sent: Math.max(1, current.sent) }));
            }
          })
          .finally(() => {
            inFlight.current.delete(set.id);
          });
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [sets, versions, storedVersions, refused, form.id]);

  // Leaving the page with something typed and not yet sent would lose it, so
  // the browser is asked to check first.
  const hasUnsaved = sets.some(unsaved);
  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsaved]);

  /** Change one set's questions on screen and mark it to be sent. */
  const change = (setId: string, update: (questions: LocalQuestion[]) => LocalQuestion[], now = false) => {
    if (locked) return;
    if (now) urgent.current = true;
    setSets((current) =>
      current.map((set) => (set.id === setId ? { ...set, questions: update(set.questions) } : set)),
    );
    setVersions((current) => ({ ...current, [setId]: (own(current, setId) ?? 0) + 1 }));
  };

  // The switch is read off the questions that CAN be scored. A set with none
  // (no questions yet, or only rankings, which never are) has nothing to read
  // it off, so what was last pressed is kept here for the next question.
  const scoredFor = (set: LocalSet) => {
    if (set.role !== "stream") return false;
    const scorable = set.questions.filter((question) => canBeScored(question.type));
    return scorable.length > 0
      ? scorable.some((question) => question.scored)
      : (own(scoredWhenEmpty, set.id) ?? true);
  };

  const setScored = (set: LocalSet, scored: boolean) => {
    setScoredWhenEmpty((current) => ({ ...current, [set.id]: scored }));
    if (set.questions.length === 0) return;
    change(set.id, (questions) => questions.map((question) => ({ ...question, scored })), true);
  };

  const addQuestion = (set: LocalSet) => {
    const question = blankQuestion(scoredFor(set));
    change(set.id, (questions) => [...questions, question]);
    setEditingKey(question.key);
  };

  const select = (setId: string) => {
    setSelectedId(setId);
    setEditingKey(null);
  };

  /** Take the server's view of the form and its sets after a change to the list of sets. */
  const adopt = (payload: EditorPayload) => {
    setForm(payload.form);
    setSets((current) => mergeSets(current, payload.sets));
  };

  // -------------------------------------------------------------------------
  // The page
  // -------------------------------------------------------------------------

  const family = selected
    ? selected.family === "unplaced"
      ? [selected]
      : sets.filter((set) => set.family === selected.family)
    : [];
  const parent = selected?.role === "stream" ? family.find((set) => set.role === "general") : undefined;
  const trail = selected ? (parent ? `${parent.label} › ${selected.label}` : selected.label) : "";

  return (
    <ApplicationsRoot className={shared.page}>
      <nav className={shared.crumb} aria-label="Breadcrumb">
        <Link href={homeHref}>Programmes</Link>
      </nav>

      <header className={shared.head}>
        <div className={shared.headMain}>
          <div className={shared.titleRow}>
            <h1 className={shared.title}>Application form · {form.label}</h1>
            <div className={shared.chips}>
              <Chip tone={stage.soon || stage.live ? "live" : "neutral"} dot={stage.live}>
                {stage.title}
              </Chip>
            </div>
          </div>
          <p className={shared.lede}>
            One form for the whole term. A section only shows to people it applies to.
          </p>
          <p className={styles.term}>
            <TermLine form={form} />{" "}
            <button type="button" className={styles.termChange} onClick={() => setDialog({ kind: "term" })}>
              Change the name and dates
            </button>
          </p>
        </div>
        <div className={shared.headActions}>
          <SavedStatus state={saveState} problem={statusText} />
          <a
            className={shared.btn}
            href={`/apply/${encodeURIComponent(form.id)}`}
            target="_blank"
            rel="noreferrer"
          >
            <ArrowUpRightIcon />
            <span>Preview as an applicant</span>
          </a>
        </div>
      </header>

      <div className={styles.columns}>
        <nav className={styles.sections} aria-label="Sections of the form">
          <div className={styles.sectionsCard}>
            <div className={`${kit.mono} ${styles.sectionsHead}`}>Sections, in order</div>
            <ol className={styles.sectionList}>
              {fixedBefore.map((section) => (
                <FixedRow key={section.id} section={section} />
              ))}
              {sets.map((set) => (
                <li
                  key={set.id}
                  className={`${styles.sectionItem} ${set.role === "stream" ? styles.sectionItemNested : ""}`}
                >
                  <button
                    type="button"
                    className={`${styles.section} ${styles.sectionButton} ${set.role === "stream" ? styles.sectionNested : ""} ${selected?.id === set.id ? styles.sectionCurrent : ""}`}
                    aria-current={selected?.id === set.id ? "true" : undefined}
                    onClick={() => select(set.id)}
                  >
                    <span className={styles.sectionMark} aria-hidden="true" />
                    <span className={styles.sectionText}>
                      <span className={styles.sectionName}>
                        {set.label}
                        {scoredFor(set) && (
                          <span className={styles.sectionChip}>
                            <Chip tone="accent">Scored</Chip>
                          </span>
                        )}
                      </span>
                      <span className={styles.sectionDetail}>
                        {questionCountLabel(set.questions.length)} · {set.audience}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {fixedAfter.map((section) => (
                <FixedRow key={section.id} section={section} />
              ))}
            </ol>
            {!locked && (
              <div className={styles.sectionsAdd}>
                <button
                  type="button"
                  className={`${shared.btn} ${shared.btnSm} ${shared.btnQuiet}`}
                  disabled={sets.length >= L.maxQuestionSets}
                  onClick={() => setDialog({ kind: "new-set" })}
                >
                  <PlusIcon />
                  Add a question set
                </button>
              </div>
            )}
            <div className={styles.sectionsFoot}>
              <LockIcon size={14} />
              Built in. You can’t change these here.
            </div>
          </div>
        </nav>

        <div className={styles.detail}>
          {locked && (
            <div role="status" className={shared.notice}>
              <span className={shared.noticeIcon}>
                <InfoIcon />
              </span>
              <div className={shared.noticeBody}>{lockedSentence(form.sent)}</div>
            </div>
          )}

          {selected ? (
            <>
              <div className={kit.mono}>{trail}</div>
              {family.map((set) =>
                set.id === selected.id || set.role === "general" ? (
                  <SetCard
                    key={set.id}
                    set={set}
                    current={set.id === selected.id}
                    locked={locked}
                    scored={scoredFor(set)}
                    editingKey={editingKey}
                    onScored={(scored) => setScored(set, scored)}
                    onEdit={setEditingKey}
                    onChange={(key, patch) => {
                      // A question whose type changes takes its set's switch,
                      // so one that stops being a ranking is scored as the
                      // questions beside it are.
                      const carried = patch.type === undefined ? patch : { ...patch, scored: scoredFor(set) };
                      change(set.id, (questions) =>
                        questions.map((question) => (question.key === key ? { ...question, ...carried } : question)),
                      );
                    }}
                    onReorder={(from, to) => change(set.id, (questions) => moved(questions, from, to), true)}
                    onDuplicate={(key) => {
                      const source = set.questions.find((question) => question.key === key);
                      if (!source) return;
                      const copy = duplicateQuestion(source);
                      change(
                        set.id,
                        (questions) => {
                          const at = questions.findIndex((question) => question.key === key);
                          return [...questions.slice(0, at + 1), copy, ...questions.slice(at + 1)];
                        },
                        true,
                      );
                      setEditingKey(copy.key);
                    }}
                    onDelete={(key) => {
                      change(set.id, (questions) => questions.filter((question) => question.key !== key), true);
                      setEditingKey(null);
                    }}
                    onAdd={() => addQuestion(set)}
                    onRename={() => setDialog({ kind: "rename", setId: set.id })}
                    onRemove={() => setDialog({ kind: "delete", setId: set.id })}
                  />
                ) : (
                  <section key={set.id} className={`${styles.set} ${styles.setClosed}`}>
                    <div className={styles.setClosedRow}>
                      <div className={styles.setTitleRow}>
                        <h2 className={`${styles.setTitle} ${styles.setClosedTitle}`}>{set.label}</h2>
                        <Chip>{SET_ROLE_LABEL[set.role]}</Chip>
                        {scoredFor(set) && <Chip tone="accent">Scored</Chip>}
                      </div>
                      <div className={styles.setClosedSide}>
                        <span>{questionCountLabel(set.questions.length)}</span>
                        <button
                          type="button"
                          className={`${shared.btn} ${shared.btnSm}`}
                          aria-label={`Open ${set.label}`}
                          onClick={() => select(set.id)}
                        >
                          <span>Open</span>
                          <ChevronDownIcon />
                        </button>
                      </div>
                    </div>
                  </section>
                ),
              )}
            </>
          ) : (
            <section className={`${shared.card} ${shared.empty}`}>
              <h2 className={shared.cardTitle}>No question sets yet</h2>
              <p className={shared.cardNote}>
                Add a programme and its question sets appear here, ready for their questions.
              </p>
              <div className={shared.emptyActions}>
                <Link href={homeHref} className={shared.btn}>
                  Go to Programmes
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>

      {dialog?.kind === "term" && (
        <TermDialog
          form={form}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setForm(saved);
            setDialog(null);
            // New dates can move the term on (or back), and the chip is the page's to work out.
            router.refresh();
          }}
        />
      )}
      {dialog?.kind === "new-set" && (
        <NewSetDialog
          form={form}
          hasEverybody={sets.some((set) => set.scope.type === "everybody")}
          onClose={() => setDialog(null)}
          onSaved={(payload, id) => {
            adopt(payload);
            select(id);
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "rename" && (
        <RenameSetDialog
          roundId={form.id}
          set={sets.find((set) => set.id === dialog.setId) ?? null}
          onClose={() => setDialog(null)}
          onSaved={(stored) => {
            setSets((current) =>
              current.map((set) =>
                set.id === stored.id
                  ? { ...set, label: stored.label, intro: stored.intro, audience: stored.audience, description: stored.description }
                  : set,
              ),
            );
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "delete" && (
        <DeleteSetDialog
          roundId={form.id}
          set={sets.find((set) => set.id === dialog.setId) ?? null}
          onClose={() => setDialog(null)}
          onDeleted={(payload) => {
            adopt(payload);
            setSelectedId(payload.sets[0]?.id ?? null);
            setEditingKey(null);
            setDialog(null);
          }}
        />
      )}
    </ApplicationsRoot>
  );
}

function unsavedAt(
  setId: string,
  versions: Record<string, number>,
  stored: Record<string, number>,
): boolean {
  return (own(versions, setId) ?? 0) !== (own(stored, setId) ?? 0);
}

/** The form's own dates, in one sentence. The same for every programme. */
function TermLine({ form }: { form: FormStaffView }) {
  if (!form.opens && !form.closes && !form.decisions) return <>No dates yet.</>;
  return (
    <>
      {form.opens && form.closes ? (
        <>
          Applications open <strong>{form.opens.day}</strong> and close{" "}
          <strong>{form.closes.dayAndTime}</strong>.
        </>
      ) : form.opens ? (
        <>
          Applications open <strong>{form.opens.day}</strong>. No close yet.
        </>
      ) : form.closes ? (
        <>
          Applications close <strong>{form.closes.dayAndTime}</strong>. No opening yet.
        </>
      ) : null}
      {form.decisions && (
        <>
          {" "}
          Everyone hears on <strong>{form.decisions.day}</strong>.
        </>
      )}
    </>
  );
}

function FixedRow({ section }: { section: FixedSection }) {
  return (
    <li className={styles.sectionItem}>
      <div className={styles.section}>
        <span className={styles.sectionMark}>
          <LockIcon size={15} />
        </span>
        <span className={styles.sectionText}>
          <span className={`${styles.sectionName} ${styles.sectionNameFixed}`}>{section.label}</span>
          <span className={styles.sectionDetail}>{section.detail}</span>
        </span>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// One open set
// ---------------------------------------------------------------------------

function SetCard({
  set,
  current,
  locked,
  scored,
  editingKey,
  onScored,
  onEdit,
  onChange,
  onReorder,
  onDuplicate,
  onDelete,
  onAdd,
  onRename,
  onRemove,
}: {
  set: LocalSet;
  /** The set chosen in the list: the one that can be added to. */
  current: boolean;
  locked: boolean;
  scored: boolean;
  editingKey: string | null;
  onScored: (scored: boolean) => void;
  onEdit: (key: string | null) => void;
  onChange: (key: string, patch: Partial<LocalQuestion>) => void;
  onReorder: (from: number, to: number) => void;
  onDuplicate: (key: string) => void;
  onDelete: (key: string) => void;
  onAdd: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const cannotScore = scoredRefusal(set.role);
  const keys = set.questions.map((question) => question.key);
  const full = set.questions.length >= L.maxQuestionsPerSet;

  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const from = keys.indexOf(String(event.active.id));
    const to = keys.indexOf(String(event.over.id));
    if (from !== -1 && to !== -1) onReorder(from, to);
  };

  return (
    <section className={`${styles.set} ${current ? styles.setCurrent : ""}`} aria-label={set.label}>
      <div className={styles.setHead}>
        <div className={styles.setHeadMain}>
          <div className={styles.setTitleRow}>
            <h2 className={styles.setTitle}>{set.label}</h2>
            <Chip>{SET_ROLE_LABEL[set.role]}</Chip>
          </div>
          <p className={styles.setNote}>{set.description}</p>
        </div>
        <div className={styles.setScored}>
          <Toggle
            label="Scored"
            note={cannotScore ?? "Reviewers give each scored answer 1 to 5."}
            checked={scored}
            disabled={locked || cannotScore !== null}
            onChange={onScored}
          />
        </div>
      </div>

      {set.questions.length === 0 ? (
        <p className={styles.noQuestions}>
          {locked ? "This set has no questions." : "No questions yet. An empty set asks nobody anything."}
        </p>
      ) : (
        <DndContext
          id={`questions-${set.id}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={keys} strategy={verticalListSortingStrategy}>
            <ol className={styles.questions}>
              {set.questions.map((question, at) => (
                <QuestionCard
                  key={question.key}
                  question={question}
                  position={at + 1}
                  count={set.questions.length}
                  setLabel={set.label}
                  open={editingKey === question.key}
                  locked={locked}
                  inScoredSet={scored}
                  onOpen={() => onEdit(question.key)}
                  onDone={() => onEdit(null)}
                  onChange={(patch) => onChange(question.key, patch)}
                  onMove={(by) => onReorder(at, at + by)}
                  onDuplicate={() => onDuplicate(question.key)}
                  onDelete={() => onDelete(question.key)}
                  canDuplicate={!full}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {current && !locked && (
        <div className={styles.setFoot}>
          <button
            type="button"
            className={`${shared.btn} ${shared.btnDashed}`}
            disabled={full}
            title={full ? `A set takes at most ${L.maxQuestionsPerSet} questions.` : undefined}
            onClick={onAdd}
          >
            <PlusIcon />
            <span>Add a question</span>
          </button>
          <MoreMenu
            label={`More for ${set.label}`}
            actions={[
              { label: "Rename", onSelect: onRename },
              { label: "Delete this set", onSelect: onRemove, careful: true },
            ]}
          />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function useSaving() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await action();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, problem, run };
}

/** The form's own name and dates, and whether it asks about facilitating. */
function TermDialog({
  form,
  onClose,
  onSaved,
}: {
  form: FormStaffView;
  onClose: () => void;
  onSaved: (form: FormStaffView) => void;
}) {
  const ids = useId();
  const [label, setLabel] = useState(form.label);
  const [opensDate, setOpensDate] = useState(form.opens?.date ?? "");
  const [opensTime, setOpensTime] = useState(form.opens?.time ?? "09:00");
  const [closesDate, setClosesDate] = useState(form.closes?.date ?? "");
  const [closesTime, setClosesTime] = useState(form.closes?.time ?? "23:59");
  const [decisions, setDecisions] = useState(form.decisions?.date ?? "");
  const [replyBy, setReplyBy] = useState(form.replyBy?.date ?? "");
  const [asksFacilitating, setAsksFacilitating] = useState(form.asksFacilitating);
  const { busy, problem, run } = useSaving();

  const save = () =>
    run(async () => {
      const saved = await patchForm(form.id, {
        label,
        opens: opensDate ? { date: opensDate, time: opensTime || "09:00" } : null,
        closes: closesDate ? { date: closesDate, time: closesTime || "23:59" } : null,
        decisions: decisions || null,
        replyBy: replyBy || null,
        ...(asksFacilitating !== form.asksFacilitating ? { asksFacilitating } : {}),
      });
      onSaved(saved.form);
    });

  return (
    <DialogFrame
      open
      title="Name and dates"
      onClose={onClose}
      actions={
        <>
          <button type="button" className={shared.btn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={kit.primary} disabled={busy || !label.trim()} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <p className={shared.dialogText}>
        These are the same for every programme. Times are UK time.
      </p>
      <div className={shared.dialogFields}>
        <div className={shared.field}>
          <label htmlFor={`${ids}-label`} className={shared.label}>
            Name
          </label>
          <input
            id={`${ids}-label`}
            type="text"
            className={shared.input}
            value={label}
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <fieldset className={shared.fieldset}>
          <legend className={shared.label}>Applications open</legend>
          <div className={shared.dialogPair}>
            <input
              type="date"
              className={shared.input}
              aria-label="Applications open, date"
              value={opensDate}
              onChange={(event) => setOpensDate(event.target.value)}
            />
            <input
              type="time"
              className={shared.input}
              aria-label="Applications open, time"
              value={opensTime}
              onChange={(event) => setOpensTime(event.target.value)}
            />
          </div>
        </fieldset>
        <fieldset className={shared.fieldset}>
          <legend className={shared.label}>Applications close</legend>
          <div className={shared.dialogPair}>
            <input
              type="date"
              className={shared.input}
              aria-label="Applications close, date"
              value={closesDate}
              onChange={(event) => setClosesDate(event.target.value)}
            />
            <input
              type="time"
              className={shared.input}
              aria-label="Applications close, time"
              value={closesTime}
              onChange={(event) => setClosesTime(event.target.value)}
            />
          </div>
        </fieldset>
        <div className={shared.dialogPair}>
          <div className={shared.field}>
            <label htmlFor={`${ids}-decisions`} className={shared.label}>
              Everyone hears on
            </label>
            <input
              id={`${ids}-decisions`}
              type="date"
              className={shared.input}
              value={decisions}
              onChange={(event) => setDecisions(event.target.value)}
            />
          </div>
          <div className={shared.field}>
            <label htmlFor={`${ids}-reply`} className={shared.label}>
              Invitations accepted by
            </label>
            <input
              id={`${ids}-reply`}
              type="date"
              className={shared.input}
              value={replyBy}
              onChange={(event) => setReplyBy(event.target.value)}
            />
          </div>
        </div>
        <Toggle
          label="Ask “Would you like to facilitate a group?”"
          note={
            form.locked
              ? lockedSentence(form.sent)
              : "Its own page in the form, then the facilitator questions for people who say yes."
          }
          checked={asksFacilitating}
          disabled={form.locked}
          onChange={setAsksFacilitating}
        />
        {problem && (
          <p role="alert" className={shared.problem}>
            {problem}
          </p>
        )}
      </div>
    </DialogFrame>
  );
}

/**
 * A new, empty question set: its name and who it is for.
 *
 * A form has at most one set for everyone, so that choice is offered only
 * while the form has none. The route refuses a second whatever is sent.
 */
function NewSetDialog({
  form,
  hasEverybody,
  onClose,
  onSaved,
}: {
  form: FormStaffView;
  /** The form already has its set for everyone. */
  hasEverybody: boolean;
  onClose: () => void;
  onSaved: (payload: EditorPayload, id: string) => void;
}) {
  const ids = useId();
  const choices = useMemo(() => {
    const out: { value: string; label: string; scope: QuestionSetScope }[] = [];
    for (const programme of form.programmes) {
      out.push({
        value: `programme:${programme.id}`,
        label: `People who tick ${programme.shortName}`,
        scope: { type: "programme", programmeId: programme.id },
      });
    }
    out.push({
      value: "kind:fellowship",
      label: "Anyone who ticks a fellowship",
      scope: { type: "kind", kind: "fellowship" },
    });
    out.push({
      value: "kind:incubator",
      label: "Anyone who ticks the incubator",
      scope: { type: "kind", kind: "incubator" },
    });
    if (!hasEverybody) {
      out.push({
        value: "everybody",
        label: "Everyone, whatever they tick",
        scope: { type: "everybody" },
      });
    }
    out.push({
      value: "facilitating",
      label: "People who say yes to facilitating",
      scope: { type: "facilitating" },
    });
    return out;
  }, [form.programmes, hasEverybody]);
  const [label, setLabel] = useState("");
  const [choice, setChoice] = useState(choices[0]?.value ?? "facilitating");
  const { busy, problem, run } = useSaving();

  const save = () =>
    run(async () => {
      const scope = choices.find((option) => option.value === choice)?.scope;
      if (!scope) return;
      const created = await createSet(form.id, { label, scope });
      onSaved(created, created.id);
    });

  return (
    <DialogFrame
      open
      title="Add a question set"
      onClose={onClose}
      actions={
        <>
          <button type="button" className={shared.btn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={kit.primary} disabled={busy || !label.trim()} onClick={save}>
            {busy ? "Adding…" : "Add the set"}
          </button>
        </>
      }
    >
      <p className={shared.dialogText}>
        A set starts empty. A set for one programme is a stream, and only a stream’s questions can be scored.
        {hasEverybody
          ? " This form already has its set for everyone."
          : " A set for everyone is asked once, before the others, and a form has one."}
      </p>
      <div className={shared.dialogFields}>
        <div className={shared.field}>
          <label htmlFor={`${ids}-label`} className={shared.label}>
            Name
          </label>
          <input
            id={`${ids}-label`}
            type="text"
            className={shared.input}
            value={label}
            maxLength={L.setLabel}
            onChange={(event) => setLabel(event.target.value)}
          />
          <p className={shared.hint}>Applicants see it as the heading over these questions.</p>
        </div>
        <div className={shared.field}>
          <label htmlFor={`${ids}-who`} className={shared.label}>
            Who sees it
          </label>
          <Select
            id={`${ids}-who`}
            className={shared.select}
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            {choices.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        {problem && (
          <p role="alert" className={shared.problem}>
            {problem}
          </p>
        )}
      </div>
    </DialogFrame>
  );
}

function RenameSetDialog({
  roundId,
  set,
  onClose,
  onSaved,
}: {
  roundId: string;
  set: LocalSet | null;
  onClose: () => void;
  onSaved: (set: QuestionSetView) => void;
}) {
  const ids = useId();
  const [label, setLabel] = useState(set?.label ?? "");
  const [intro, setIntro] = useState(set?.intro ?? "");
  const { busy, problem, run } = useSaving();
  if (!set) return null;

  const save = () =>
    run(async () => {
      const saved = await patchSet(roundId, set.id, { label, intro });
      onSaved(saved.set);
    });

  return (
    <DialogFrame
      open
      title={`Rename ${set.label}`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className={shared.btn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={kit.primary} disabled={busy || !label.trim()} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className={shared.dialogFields}>
        <div className={shared.field}>
          <label htmlFor={`${ids}-label`} className={shared.label}>
            Name
          </label>
          <input
            id={`${ids}-label`}
            type="text"
            className={shared.input}
            value={label}
            maxLength={L.setLabel}
            onChange={(event) => setLabel(event.target.value)}
          />
          <p className={shared.hint}>Applicants see it as the heading over these questions.</p>
        </div>
        <div className={shared.field}>
          <label htmlFor={`${ids}-intro`} className={shared.label}>
            Note for admins <span className={shared.optional}>(optional)</span>
          </label>
          <input
            id={`${ids}-intro`}
            type="text"
            className={shared.input}
            value={intro}
            maxLength={L.setIntro}
            onChange={(event) => setIntro(event.target.value)}
          />
          <p className={shared.hint}>
            Kept with the set for whoever edits this form next. Applicants never see it.
          </p>
        </div>
        {problem && (
          <p role="alert" className={shared.problem}>
            {problem}
          </p>
        )}
      </div>
    </DialogFrame>
  );
}

/**
 * Deleting a set cannot be undone, so it asks, and it says what goes and what
 * stays before the button that does it.
 */
function DeleteSetDialog({
  roundId,
  set,
  onClose,
  onDeleted,
}: {
  roundId: string;
  set: LocalSet | null;
  onClose: () => void;
  onDeleted: (payload: EditorPayload) => void;
}) {
  const { busy, problem, run } = useSaving();
  if (!set) return null;
  const count = set.questions.length;

  return (
    <DialogFrame
      open
      width="sm"
      title={`Delete ${set.label}?`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className={shared.btn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${shared.btn} ${shared.btnCareful}`}
            disabled={busy}
            onClick={() => run(async () => onDeleted(await deleteSet(roundId, set.id)))}
          >
            {busy ? "Deleting…" : "Delete this set"}
          </button>
        </>
      }
    >
      <p className={shared.dialogText}>
        {count === 0
          ? "The set goes for good. It has no questions in it."
          : `The set and its ${questionCountLabel(count)} go for good.`}{" "}
        The programmes and the other sets stay as they are.
      </p>
      {problem && (
        <p role="alert" className={shared.problem}>
          {problem}
        </p>
      )}
    </DialogFrame>
  );
}
