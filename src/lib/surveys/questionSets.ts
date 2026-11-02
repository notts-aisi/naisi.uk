import { own } from "@/lib/applications/keys";
import { REPORT_QUESTION_WORDS, forLeadLabel, type ReportQuestionWords } from "@/lib/courses/sessionReports/words";
import { SESSION_REPORT_QUESTIONS, SOMETHING_ELSE } from "@/lib/firestore/courseSessionReports";
import {
  QUESTION_SET_KINDS,
  type QuestionSetKind,
  type SurveyQuestionSetDoc,
} from "@/lib/firestore/surveyQuestionSets";
import { WORKSHEET_LIMITS, type WorksheetOption } from "@/lib/firestore/worksheets";
import { CHECK_IN_MINUTES, CHECK_IN_QUESTION_IDS, checkInItems } from "./checkIns/template";
import { ADDABLE_TYPES, minutesFor } from "./events/after";
import { eventTemplateItems } from "./events/template";
import {
  SURVEY_ITEM_LIMITS,
  isQuestionRequired,
  sanitizeSurveyItems,
  surveyQuestionsOf,
  validateSurveyItems,
  type SurveyChoiceQuestion,
  type SurveyConsentItem,
  type SurveyItem,
  type SurveyLinesQuestion,
  type SurveyPercentQuestion,
  type SurveyQuestion,
  type SurveyScaleQuestion,
} from "./items";
import { STRAND_WORDS, templateItems, templateMinutes, type SurveyTemplate } from "./templates";
import { dayWords, minutesWords, questionTypeWords, questionsWords } from "./words";

/**
 * THE QUESTION SETS: the questions each kind of survey starts with, which an
 * admin changes on Run NAISI › Surveys › Question sets ("Change them here, or
 * per survey"), stored in `surveyQuestionSets` (`src/lib/firestore/surveyQuestionSets.ts`)
 * and read over the code's own.
 *
 * Rules a maintainer keeps:
 *
 *  - WORDS ONLY, BUT FOR THE SURVEY AFTER AN EVENT. Before a programme, its
 *    end, leaving it, the weekly check-in and the facilitator's session
 *    report change their words and nothing else: every question keeps its
 *    id, its kind, its answers and its place, because a programme's stages
 *    pair answers by question id and check-ins and reports are read by id
 *    (the facilitators' totals, the lead's weeks, the Surveys tab). Their
 *    sets store only the words an admin changed (`checkWordsChange`), and
 *    the reader takes only words that have a place in the code's set
 *    (`withSetWords`), so no stored word can add, take out or retype a
 *    question whatever is stored.
 *  - THE SURVEY AFTER AN EVENT IS EDITED WHOLE: questions added, removed,
 *    reworded and retyped, of the five kinds the event editor's step adds
 *    (`checkWholeChange`). An id keeps one kind for good: a code question
 *    never changes its kind, and the page gives a question whose kind it
 *    changes a new id, so its answers never sit beside another kind's under
 *    one id ("How was it?" is read by its id for This term in numbers).
 *  - A CHANGE REACHES SURVEYS MADE AFTER IT, NEVER ONE ALREADY MADE. Every
 *    survey copies its questions when it is made, through the readers in
 *    `./questionSetsStore.ts`, and nothing reads a set again for a survey
 *    that exists.
 *  - SOME WORDS STAY THE CODE'S, each shown on the set's page with why: an
 *    incubator's first skills line is worded for its research when its
 *    survey is made (`FIXED`), a check-in lists the week's parts as each
 *    group's copy names them (`NOTES`), and a session report's last question
 *    names the programme's lead (its entry's `fixed`).
 *
 * Pure, with no server import: the editor in the browser, the route and the
 * readers all ask the same functions.
 */

export type { QuestionSetKind } from "@/lib/firestore/surveyQuestionSets";

/** The kinds whose words alone change. */
export type WordsOnlyKind = Exclude<QuestionSetKind, "event">;

/** The words-only kinds made of survey questions (the session report is not a survey). */
type SurveyWordsKind = Exclude<WordsOnlyKind, "session-report">;

/** Whether a set's questions may be added, removed and retyped: the survey after an event's alone. */
export function editsWhole(kind: QuestionSetKind): kind is "event" {
  return kind === "event";
}

/** The set a programme survey's template starts from; null for a follow-up, which keeps the code's words. */
export function setOfTemplate(stage: SurveyTemplate): "before" | "after" | "leaving" | null {
  return stage === "before" || stage === "after" || stage === "leaving" ? stage : null;
}

// ---------------------------------------------------------------------------
// The words of the page
// ---------------------------------------------------------------------------

/** Each set's name, as the board names it, and what it is for, under the page's title. */
export const QUESTION_SETS: Record<QuestionSetKind, { name: string; about: string }> = {
  event: {
    name: "After an event",
    about: "What every survey after an event starts with: the event editor’s Survey after step, and After a social on New survey.",
  },
  "check-in": {
    name: "Weekly check-in",
    about: "What everybody at a session is asked at its end, when a facilitator opens the check-in from the register.",
  },
  "session-report": {
    name: "Facilitator’s session report",
    about: "What each facilitator answers after a session, straight after the register.",
  },
  before: { name: "Before a programme", about: "The survey each programme sends in its first week." },
  after: { name: "End of a programme", about: "The survey each programme sends at its last session." },
  leaving: { name: "Leaving", about: "The survey that reaches somebody as they leave a programme." },
};

export const QUESTION_SET_WORDS = {
  /** The tab on Run NAISI › Surveys, and its card's heading. */
  title: "Question sets",
  /** The card's line, as the board words it. */
  line: "The questions each kind starts with. Change them here, or per survey.",
  edit: "Edit",
  /** On a words-only set's page. */
  wordsOnly: "Only the words change here. Each question keeps its kind, its answers and its place, so answers still compare.",
  /** On the survey after an event's page. */
  whole: "Change, move, remove or add any of them. A question whose kind you change becomes a new question, so its answers aren’t compared with the old one’s.",
  reaches: "A change reaches surveys made after it, never one already made.",
  /** The session report keeps its answers by question, so its form asks in the words of the day. */
  reachesReport: "A change shows on the form from then on. Reports already sent keep their answers, which are kept by question, not by its words.",
  save: "Save",
  saving: "Saving…",
  saved: "Saved. Surveys made from now on start with these.",
  savedReport: "Saved. The form asks these from now on.",
  backWords: "Back to the original words",
  backQuestions: "Back to the original questions",
  /** Under either Back button once pressed: nothing is kept until Save. */
  backNote: "The original is back in the form. Save to keep it.",
  unchanged: "Nobody has changed these yet.",
  incubatorsOnly: "Incubators only",
  /** A slot whose words stay the code's: the line before why. */
  stays: "Stays as it is",
  original: "The original:",
  noSet: "There’s no question set by that name.",
  backToSets: "Back to the question sets",
  failed: "That couldn’t be saved. Try again in a minute.",
  offline: "That didn’t reach the site. Check your connection and try again.",
  kind: "Kind",
  /** Beside the kind, once it differs from what the question was. */
  newQuestion: "A new question: its answers won’t be compared with the old one’s.",
  /** Under "How was it?" on the survey after an event. */
  howWasIt: "This term in numbers averages the answers to this question. Remove it or change its kind, and events made afterwards have no average there.",
} as const;

/** "Last changed Mon 2 Nov by Zach.", or "Last changed Mon 2 Nov." when the admin's name can't be read. */
export function changedWords(at: Date | null, by: string | null): string {
  if (!at) return QUESTION_SET_WORDS.unchanged;
  return by ? `Last changed ${dayWords(at)} by ${by}.` : `Last changed ${dayWords(at)}.`;
}

/** "How was it?", which This term in numbers reads by its id (`src/lib/surveys/term/load.ts`): the set's page says so beside it. */
export const HOW_WAS_IT_ID = "q_ev_how";

/** The address of a set's page. */
export function questionSetHref(kind: QuestionSetKind): string {
  return `/admin/surveys/question-sets/${kind}`;
}

// ---------------------------------------------------------------------------
// Where each word lives
// ---------------------------------------------------------------------------

/** One word a set holds: where it lives (`q_c1:title`), what it is called, its words, its limit. */
export type WordSlot = {
  key: string;
  /** What the field is called: "The question", "Answer 2", "Words at 1". */
  label: string;
  /** The code's words. */
  original: string;
  /** The words now: the set's, where an admin changed them, else the code's. */
  words: string;
  max: number;
  /** A box of several lines. */
  long: boolean;
  /** May be left empty: the line under a question, words at the ends of a scale. */
  optional: boolean;
};

/**
 * Words that stay the code's, shown with why, where they sit among the
 * question's words: before the slot `before` names, or after them all.
 */
export type FixedWords = { label: string; words: string; why: string; before: string | null };

/** One thing a words-only set's page draws, in the form's order. */
export type SetEntry =
  | { kind: "section"; id: string; only: string | null; slots: WordSlot[] }
  | { kind: "consent"; id: string; only: string | null; slots: WordSlot[] }
  | {
      kind: "question";
      id: string;
      /** Its number, as people see it. */
      number: number;
      /** Its kind, in words: "Choose one", "1 to 5". */
      type: string;
      /** "Incubators only", or null. */
      only: string | null;
      slots: WordSlot[];
      fixed: FixedWords[];
      /** Lines about it, under its words. */
      notes: string[];
    };

/** A word's place, how it reads and writes on an item, and its limit. */
type Accessor = {
  slot: string;
  label: string;
  max: number;
  long: boolean;
  optional: boolean;
  read: (item: SurveyItem) => string;
  write: (item: SurveyItem, words: string) => SurveyItem;
};

const asQuestion = <T extends SurveyQuestion>(item: SurveyItem) => item as T;

/** A map with one entry replaced, or taken out when the words are empty. */
function withOptional<T extends object, K extends keyof T>(value: T, key: K, words: string): T {
  const next = { ...value };
  if (words) (next as Record<K, unknown>)[key] = words;
  else delete next[key];
  return next;
}

function accessorsOf(item: SurveyItem): Accessor[] {
  if (item.kind === "pageBreak") return [];
  if (item.kind === "section") {
    return [
      {
        slot: "heading",
        label: "Section heading",
        max: WORKSHEET_LIMITS.sectionHeading,
        long: false,
        optional: false,
        read: (each) => (each.kind === "section" ? each.heading : ""),
        write: (each, words) => (each.kind === "section" ? { ...each, heading: words } : each),
      },
    ];
  }
  if (item.kind === "consent") {
    const consent = (each: SurveyItem) => each as SurveyConsentItem;
    return [
      {
        slot: "statement",
        label: "The statement",
        max: SURVEY_ITEM_LIMITS.statement,
        long: true,
        optional: false,
        read: (each) => consent(each).statement,
        write: (each, words) => ({ ...consent(each), statement: words }),
      },
      ...item.boxes.map(
        (box, at): Accessor => ({
          slot: `box:${box.purpose}`,
          label: `Box ${at + 1}`,
          max: SURVEY_ITEM_LIMITS.boxLabel,
          long: false,
          optional: false,
          read: (each) => consent(each).boxes.find((one) => one.purpose === box.purpose)?.label ?? "",
          write: (each, words) => ({
            ...consent(each),
            boxes: consent(each).boxes.map((one) => (one.purpose === box.purpose ? { ...one, label: words } : one)),
          }),
        }),
      ),
    ];
  }

  const out: Accessor[] = [
    {
      slot: "title",
      label: "The question",
      max: WORKSHEET_LIMITS.questionTitle,
      long: true,
      optional: false,
      read: (each) => asQuestion(each).title,
      write: (each, words) => ({ ...asQuestion(each), title: words }) as SurveyItem,
    },
    {
      slot: "hint",
      label: "The line under it",
      max: SURVEY_ITEM_LIMITS.hint,
      long: false,
      optional: true,
      read: (each) => asQuestion(each).hint ?? "",
      write: (each, words) => withOptional(asQuestion(each), "hint", words) as SurveyItem,
    },
  ];
  const question = item;
  if (question.type === "singleChoice" || question.type === "multipleChoice") {
    const choice = (each: SurveyItem) => asQuestion<SurveyChoiceQuestion>(each);
    (question.options ?? []).forEach((option, at) =>
      out.push({
        slot: `option:${option.id}`,
        label: `Answer ${at + 1}`,
        max: WORKSHEET_LIMITS.optionLabel,
        long: false,
        optional: false,
        read: (each) => choice(each).options?.find((one) => one.id === option.id)?.label ?? "",
        write: (each, words) => ({
          ...choice(each),
          options: (choice(each).options ?? []).map((one: WorksheetOption) => (one.id === option.id ? { ...one, label: words } : one)),
        }),
      }),
    );
    if ((question as SurveyChoiceQuestion).most !== undefined) {
      out.push({
        slot: "most",
        label: "Its second part",
        max: WORKSHEET_LIMITS.questionTitle,
        long: false,
        optional: false,
        read: (each) => choice(each).most ?? "",
        write: (each, words) => ({ ...choice(each), most: words }),
      });
    }
  } else if (question.type === "rating") {
    const rated = (each: SurveyItem) => asQuestion<SurveyChoiceQuestion>(each);
    const top = question.rating?.max ?? WORKSHEET_LIMITS.defaultRatingMax;
    for (const [slot, label, field] of [
      ["low", "Words at 1", "minLabel"],
      ["high", `Words at ${top}`, "maxLabel"],
    ] as const) {
      out.push({
        slot,
        label,
        max: SURVEY_ITEM_LIMITS.scaleLabel,
        long: false,
        optional: true,
        read: (each) => rated(each).rating?.[field] ?? "",
        write: (each, words) => {
          const rating = rated(each).rating ?? { max: top };
          return { ...rated(each), rating: withOptional(rating, field, words) };
        },
      });
    }
  } else if (question.type === "lines") {
    const grid = (each: SurveyItem) => asQuestion<SurveyLinesQuestion>(each);
    question.lines.forEach((line, at) =>
      out.push({
        slot: `line:${line.id}`,
        label: `Line ${at + 1}`,
        max: SURVEY_ITEM_LIMITS.lineLabel,
        long: false,
        optional: false,
        read: (each) => grid(each).lines.find((one) => one.id === line.id)?.label ?? "",
        write: (each, words) => ({ ...grid(each), lines: grid(each).lines.map((one) => (one.id === line.id ? { ...one, label: words } : one)) }),
      }),
    );
    const points = question.scale.points;
    if (points) {
      points.forEach((_, at) =>
        out.push({
          slot: `point:${at + 1}`,
          label: `Words at ${at + 1}`,
          max: SURVEY_ITEM_LIMITS.scaleLabel,
          long: false,
          optional: false,
          read: (each) => grid(each).scale.points?.[at] ?? "",
          write: (each, words) => {
            const scale = grid(each).scale;
            return { ...grid(each), scale: { ...scale, points: (scale.points ?? []).map((point, i) => (i === at ? words : point)) } };
          },
        }),
      );
    } else {
      for (const [slot, label, field] of [
        ["low", "Words at 1", "minLabel"],
        ["high", `Words at ${question.scale.max}`, "maxLabel"],
      ] as const) {
        out.push({
          slot,
          label,
          max: SURVEY_ITEM_LIMITS.scaleLabel,
          long: false,
          optional: true,
          read: (each) => grid(each).scale[field],
          write: (each, words) => ({ ...grid(each), scale: { ...grid(each).scale, [field]: words } }),
        });
      }
    }
  } else if (question.type === "scale") {
    const scale = (each: SurveyItem) => asQuestion<SurveyScaleQuestion>(each);
    for (const anchor of question.anchors) {
      out.push({
        slot: `anchor:${anchor.at}`,
        label: `Words at ${anchor.at}`,
        max: SURVEY_ITEM_LIMITS.anchorLabel,
        long: false,
        optional: false,
        read: (each) => scale(each).anchors.find((one) => one.at === anchor.at)?.label ?? "",
        write: (each, words) => ({ ...scale(each), anchors: scale(each).anchors.map((one) => (one.at === anchor.at ? { ...one, label: words } : one)) }),
      });
    }
  } else if (question.type === "percent") {
    const share = (each: SurveyItem) => asQuestion<SurveyPercentQuestion>(each);
    for (const [slot, label, field] of [
      ["low", "Words at 0%", "min"],
      ["high", "Words at 100%", "max"],
    ] as const) {
      out.push({
        slot,
        label,
        max: SURVEY_ITEM_LIMITS.anchorLabel,
        long: false,
        optional: true,
        read: (each) => share(each).ends[field],
        write: (each, words) => ({ ...share(each), ends: { ...share(each).ends, [field]: words } }),
      });
    }
  }
  if (question.pipe) {
    out.push({
      slot: "pipe",
      label: "The words before their earlier answer",
      max: SURVEY_ITEM_LIMITS.pipeWords,
      long: false,
      optional: false,
      read: (each) => asQuestion(each).pipe?.words ?? "",
      write: (each, words) => {
        const current = asQuestion(each);
        return (current.pipe ? { ...current, pipe: { ...current.pipe, words } } : current) as SurveyItem;
      },
    });
  }
  return out;
}

const keyOf = (id: string, slot: string) => `${id}:${slot}`;

// ---------------------------------------------------------------------------
// The code's sets
// ---------------------------------------------------------------------------

/** "Worded for the incubator's research", the why of an incubator's first skills line. */
const STRAND_WHY = "Worded for the incubator’s research when its survey is made.";

/** The words that stay the code's in each words-only survey set, by their place, with why. */
const FIXED: Record<SurveyWordsKind, Readonly<Record<string, string>>> = {
  before: { "q_i2:line:l_a": STRAND_WHY },
  after: { "q_i2:line:l_a": STRAND_WHY, "q_i2_back:line:l_a": STRAND_WHY },
  leaving: {},
  "check-in": {},
};

/** Lines under a question of a set, by its id: what the set cannot say for it. */
const NOTES: Record<SurveyWordsKind, Readonly<Record<string, string>>> = {
  before: {},
  after: {},
  leaving: {},
  "check-in": {
    [CHECK_IN_QUESTION_IDS.unclear]: "The week’s parts come first, as each group’s copy of the week names them.",
    [CHECK_IN_QUESTION_IDS.reading]: "Asked only in a week with something to read, watch or listen to.",
  },
};

/**
 * Each words-only survey set as the code writes it, whole: an incubator's
 * (its research the alignment strand's), which holds every question a
 * fellowship asks and the incubator's own; and a check-in for a week with
 * something to read, with no parts of its own.
 */
function codeItemsOf(kind: SurveyWordsKind): SurveyItem[] {
  switch (kind) {
    case "check-in":
      return checkInItems({ parts: [], hasReading: true });
    case "leaving":
      return templateItems("leaving", "fellowship", null);
    default:
      return templateItems(kind, "incubator", "alignment");
  }
}

/** The ids a fellowship's survey of a stage asks, to tell which are an incubator's alone. */
function fellowshipIds(kind: SurveyWordsKind): Set<string> | null {
  return kind === "before" || kind === "after" ? new Set(templateItems(kind, "fellowship", null).map((item) => item.id)) : null;
}

const keysMemo = new Map<SurveyWordsKind, Set<string>>();

/** The places a set's words may be changed: every word of its code's set but those that stay. */
function editableKeys(kind: SurveyWordsKind): Set<string> {
  let keys = keysMemo.get(kind);
  if (!keys) {
    keys = new Set<string>();
    for (const item of codeItemsOf(kind)) {
      for (const accessor of accessorsOf(item)) {
        const key = keyOf(item.id, accessor.slot);
        if (own(FIXED[kind], key) === undefined) keys.add(key);
      }
    }
    keysMemo.set(kind, keys);
  }
  return keys;
}

/** Words as they are kept: one line, its ends trimmed. */
function oneLine(words: string): string {
  return words.replace(/\s+/g, " ").trim();
}

/**
 * A survey's questions with a words-only set's words over the code's: only
 * where the set has words for a place its code's set holds and may change,
 * and only words that would pass a save (not empty where they need words,
 * within their limit). Ids, kinds, options, lines, scores and order are the
 * code's whatever is stored.
 */
export function withSetWords(kind: SurveyWordsKind, items: readonly SurveyItem[], words: Readonly<Record<string, string>> | null | undefined): SurveyItem[] {
  const copy = structuredClone([...items]) as SurveyItem[];
  if (!words) return copy;
  const editable = editableKeys(kind);
  return copy.map((item) => {
    let next = item;
    for (const accessor of accessorsOf(item)) {
      const key = keyOf(item.id, accessor.slot);
      const stored = own(words, key);
      if (typeof stored !== "string" || !editable.has(key)) continue;
      const text = oneLine(stored);
      if ((!text && !accessor.optional) || text.length > accessor.max) continue;
      next = accessor.write(next, text);
    }
    return next;
  });
}

// ---------------------------------------------------------------------------
// The facilitator's session report: not a survey, so its questions are named
// here, in the form's order, by the record's own ids
// ---------------------------------------------------------------------------

type ReportSlot = { slot: string; label: string; field: keyof ReportQuestionWords; optional?: boolean; max: number };

const REPORT_ENTRIES: { id: string; type: string; slots: ReportSlot[]; fixed?: FixedWords[]; notes?: string[] }[] = [
  {
    id: "how",
    type: "1 to 5",
    slots: [
      { slot: "title", label: "The question", field: "how", max: WORKSHEET_LIMITS.questionTitle },
      { slot: "low", label: "Words at 1", field: "howLow", max: SURVEY_ITEM_LIMITS.scaleLabel },
      { slot: "high", label: "Words at 5", field: "howHigh", max: SURVEY_ITEM_LIMITS.scaleLabel },
    ],
  },
  { id: "wentWell", type: "Long answer · optional", slots: [{ slot: "title", label: "The question", field: "wentWell", max: WORKSHEET_LIMITS.questionTitle }] },
  { id: "didnt", type: "Long answer · optional", slots: [{ slot: "title", label: "The question", field: "didnt", max: WORKSHEET_LIMITS.questionTitle }] },
  {
    id: "unclear",
    type: "Pick any of the week’s parts · optional",
    slots: [
      { slot: "title", label: "The question", field: "unclear", max: WORKSHEET_LIMITS.questionTitle },
      { slot: `option:${SOMETHING_ELSE}`, label: "The last answer", field: "somethingElse", max: WORKSHEET_LIMITS.optionLabel },
    ],
    notes: ["The week’s parts come first, as each group’s copy of the week names them."],
  },
  {
    id: "engaged",
    type: "Pick people who were there, with a line about each · optional",
    slots: [{ slot: "title", label: "The question", field: "engaged", max: WORKSHEET_LIMITS.questionTitle }],
  },
  {
    id: "notRead",
    type: "Pick people who were there · optional",
    slots: [{ slot: "title", label: "The question", field: "notRead", max: WORKSHEET_LIMITS.questionTitle }],
  },
  {
    id: "needsHand",
    type: "Pick anybody in the group, with a line about each · optional",
    slots: [{ slot: "title", label: "The question", field: "needsHand", max: WORKSHEET_LIMITS.questionTitle }],
  },
  {
    id: "forLead",
    type: "Long answer · optional",
    slots: [],
    fixed: [
      {
        label: "The question",
        words: forLeadLabel(""),
        why: "It names the programme’s lead first when there is one, so its words stay as they are.",
        before: null,
      },
    ],
  },
];

/** The report's questions' words with a set's over the code's, where the set has words for a place the form asks. */
export function sessionReportWordsWith(words: Readonly<Record<string, string>> | null | undefined): ReportQuestionWords {
  const out: ReportQuestionWords = { ...REPORT_QUESTION_WORDS };
  if (!words) return out;
  for (const entry of REPORT_ENTRIES) {
    for (const slot of entry.slots) {
      const stored = own(words, keyOf(entry.id, slot.slot));
      if (typeof stored !== "string") continue;
      const text = oneLine(stored);
      if ((!text && !slot.optional) || text.length > slot.max) continue;
      out[slot.field] = text;
    }
  }
  return out;
}

/** The session report's places, as the page and the route name them. */
function reportEntries(words: Readonly<Record<string, string>>): SetEntry[] {
  const now = sessionReportWordsWith(words);
  return REPORT_ENTRIES.map((entry, at) => ({
    kind: "question",
    id: entry.id,
    number: at + 1,
    type: entry.type,
    only: null,
    slots: entry.slots.map((slot) => ({
      key: keyOf(entry.id, slot.slot),
      label: slot.label,
      original: REPORT_QUESTION_WORDS[slot.field],
      words: now[slot.field],
      max: slot.max,
      long: slot.slot === "title",
      optional: slot.optional === true,
    })),
    fixed: entry.fixed ?? [],
    notes: entry.notes ?? [],
  }));
}

/** The session report's question ids, in the form's order: the record's own (`SESSION_REPORT_QUESTIONS`). */
export const REPORT_ENTRY_IDS: readonly string[] = REPORT_ENTRIES.map((entry) => entry.id);

// ---------------------------------------------------------------------------
// A words-only set's page, and a save of it
// ---------------------------------------------------------------------------

/** Every word of a words-only set, in the form's order, with its words now. */
export function setEntries(kind: WordsOnlyKind, words: Readonly<Record<string, string>>): SetEntry[] {
  if (kind === "session-report") return reportEntries(words);
  const code = codeItemsOf(kind);
  const now = withSetWords(kind, code, words);
  const fellowship = fellowshipIds(kind);
  const onlyFor = (id: string) => (fellowship && !fellowship.has(id) ? QUESTION_SET_WORDS.incubatorsOnly : null);
  const nowOf = new Map(now.map((item) => [item.id, item]));
  const out: SetEntry[] = [];
  let number = 0;
  for (const item of code) {
    if (item.kind === "pageBreak") continue;
    const current = nowOf.get(item.id) ?? item;
    const slots: WordSlot[] = [];
    const fixed: FixedWords[] = [];
    // A word that stays is drawn in its own place: before the next word that changes.
    let waiting: FixedWords[] = [];
    for (const accessor of accessorsOf(item)) {
      const key = keyOf(item.id, accessor.slot);
      const why = own(FIXED[kind], key);
      if (why !== undefined) {
        const stays: FixedWords = { label: accessor.label, words: why === STRAND_WHY ? strandLineWords() : accessor.read(item), why, before: null };
        fixed.push(stays);
        waiting.push(stays);
        continue;
      }
      for (const stays of waiting) stays.before = key;
      waiting = [];
      slots.push({
        key,
        label: accessor.label,
        original: accessor.read(item),
        words: accessor.read(current),
        max: accessor.max,
        long: accessor.long,
        optional: accessor.optional,
      });
    }
    if (item.kind === "question") {
      number += 1;
      out.push({ kind: "question", id: item.id, number, type: questionTypeWords(item), only: onlyFor(item.id), slots, fixed, notes: NOTES[kind][item.id] ? [NOTES[kind][item.id]] : [] });
    } else {
      out.push({ kind: item.kind, id: item.id, only: onlyFor(item.id), slots });
    }
  }
  return out;
}

/** An incubator's first skills line in each research's words: "Alignment: I could …; Governance: I could …". */
function strandLineWords(): string {
  return `${STRAND_WORDS.alignment.name}: ${STRAND_WORDS.alignment.line}. ${STRAND_WORDS.governance.name}: ${STRAND_WORDS.governance.line}.`;
}

/** Why a save is refused, in a sentence an admin can act on. */
export const QUESTION_SET_REFUSAL = {
  body: "That couldn’t be read. Reload the page and save again.",
  noSet: QUESTION_SET_WORDS.noSet,
  wordsOnly: "Only the words of these questions can change: each keeps its kind, its answers and its place, so answers still compare.",
  kinds: "A question here is choose one, pick any, 1 to 5, a short answer or a long answer.",
  rating: "A 1 to 5 question runs from 1 to 5.",
} as const;

type Refused = { ok: false; error: string };

const isMap = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Where a word is, for a refusal: "Question 3, answer 2", "Section 2's heading". */
function placeWords(entry: SetEntry, slot: WordSlot): string {
  if (entry.kind === "question") return slot.label === "The question" ? `Question ${entry.number}` : `Question ${entry.number}, ${lowerFirst(slot.label)}`;
  if (entry.kind === "consent") return slot.label === "The statement" ? "The consent’s statement" : `The consent’s ${lowerFirst(slot.label)}`;
  return "A section’s heading";
}

function lowerFirst(words: string): string {
  return words ? `${words.charAt(0).toLowerCase()}${words.slice(1)}` : words;
}

/**
 * A save of a words-only set, checked before anything is read: `{ words }`
 * and nothing else, every key a place of the set whose words may change, and
 * every value words that fit it. Answers the words that differ from the
 * code's, which are all the set keeps; a place the save leaves out reads as
 * the code's. A save that tries to add, take out or retype a question, or to
 * change an answer's id, is refused whole: it can only name a place the set
 * does not have.
 */
export function checkWordsChange(kind: WordsOnlyKind, raw: unknown): { ok: true; words: Record<string, string> } | Refused {
  if (!isMap(raw)) return { ok: false, error: QUESTION_SET_REFUSAL.body };
  if (Object.keys(raw).some((key) => key !== "words") || !isMap(raw.words)) return { ok: false, error: QUESTION_SET_REFUSAL.wordsOnly };
  const given = raw.words;
  const entries = setEntries(kind, {});
  const places = new Map<string, { entry: SetEntry; slot: WordSlot }>();
  for (const entry of entries) for (const slot of entry.slots) places.set(slot.key, { entry, slot });
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(given)) {
    const place = places.get(key);
    if (!place) return { ok: false, error: QUESTION_SET_REFUSAL.wordsOnly };
    if (typeof value !== "string") return { ok: false, error: QUESTION_SET_REFUSAL.body };
    const text = oneLine(value);
    const where = placeWords(place.entry, place.slot);
    if (!text && !place.slot.optional) return { ok: false, error: `${where} needs its words.` };
    if (text.length > place.slot.max) return { ok: false, error: `${where} is over the ${place.slot.max}-character limit.` };
    if (text !== place.slot.original) out[key] = text;
  }
  return { ok: true, words: out };
}

// ---------------------------------------------------------------------------
// The survey after an event, edited whole
// ---------------------------------------------------------------------------

const ADDABLE: readonly string[] = ADDABLE_TYPES.map((choice) => choice.type);

/** An id the set keeps: letters and digits first, then letters, digits, `_` and `-`. */
const isSetId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);

/** The kind each of the code's questions after an event keeps for good. */
function codeEventTypes(): Map<string, string> {
  return new Map(surveyQuestionsOf(eventTemplateItems()).map((question) => [question.id, question.type]));
}

/**
 * One question of the set as it is kept: only what the editor makes. Its
 * words, its Required switch written out, a choice's answers, a rating's
 * words at its ends on 1 to 5, a text answer's limit.
 */
function keptQuestion(question: SurveyChoiceQuestion): SurveyChoiceQuestion {
  const out: SurveyChoiceQuestion = {
    kind: "question",
    id: question.id,
    type: question.type,
    title: oneLine(question.title),
    body: [],
    required: false,
    optional: !isQuestionRequired(question),
  };
  if (question.type === "singleChoice" || question.type === "multipleChoice") {
    out.options = (question.options ?? []).map((option) => ({ id: option.id, label: oneLine(option.label) }));
  } else if (question.type === "rating") {
    const rating: NonNullable<SurveyChoiceQuestion["rating"]> = { max: question.rating?.max ?? 5 };
    out.rating = withOptional(withOptional(rating, "minLabel", oneLine(question.rating?.minLabel ?? "")), "maxLabel", oneLine(question.rating?.maxLabel ?? ""));
  } else {
    out.limit = question.limit ?? { unit: "characters", max: question.type === "shortText" ? 200 : 2000 };
  }
  return out;
}

/**
 * A save of the survey after an event's set, checked before anything is
 * read: `{ items }` and nothing else, every item a question of the five
 * kinds the event editor's step adds, a question the code asks keeping its
 * kind, a 1 to 5 running from 1 to 5, and the whole passing the survey
 * validator. Answers the questions as they are kept.
 */
export function checkWholeChange(raw: unknown): { ok: true; items: SurveyItem[] } | Refused {
  if (!isMap(raw) || Object.keys(raw).some((key) => key !== "items") || !Array.isArray(raw.items)) {
    return { ok: false, error: QUESTION_SET_REFUSAL.body };
  }
  for (const entry of raw.items) {
    if (!isMap(entry) || entry.kind !== "question" || !isSetId(entry.id)) return { ok: false, error: QUESTION_SET_REFUSAL.body };
    if (!ADDABLE.includes(String(entry.type))) return { ok: false, error: QUESTION_SET_REFUSAL.kinds };
    if (isMap(entry.options) || (Array.isArray(entry.options) && entry.options.some((option) => !isMap(option) || !isSetId(option.id)))) {
      return { ok: false, error: QUESTION_SET_REFUSAL.body };
    }
  }
  const read = sanitizeSurveyItems(raw.items, { clampLimits: false });
  if (read.length !== raw.items.length) return { ok: false, error: QUESTION_SET_REFUSAL.body };
  const questions = read.map((item) => keptQuestion(item as SurveyChoiceQuestion));
  const code = codeEventTypes();
  for (const [at, question] of questions.entries()) {
    const type = code.get(question.id);
    if (type !== undefined && type !== question.type) return { ok: false, error: `Question ${at + 1} can’t change its kind.` };
    if (question.type === "rating" && question.rating?.max !== 5) return { ok: false, error: QUESTION_SET_REFUSAL.rating };
  }
  const items: SurveyItem[] = questions;
  const problems = validateSurveyItems(items);
  if (problems.length > 0) {
    const number = new Map(questions.map((question, at) => [question.id, at + 1])).get(problems[0].itemId);
    return { ok: false, error: number ? `Question ${number}: ${problems[0].message}` : problems[0].message };
  }
  return { ok: true, items };
}

/** The set as the code writes it, as it would be kept: what a saved set is told apart from. */
function codeEventSet(): SurveyItem[] {
  const kept = checkWholeChange({ items: eventTemplateItems() });
  return kept.ok ? kept.items : eventTemplateItems();
}

/** Whether a kept set is the code's own, so nothing needs keeping. */
export function isCodeEventSet(items: readonly SurveyItem[]): boolean {
  return JSON.stringify(items) === JSON.stringify(codeEventSet());
}

/**
 * The questions every survey after an event starts with: the stored set,
 * read as a save would keep it, else the code's. A stored set that would not
 * pass a save now is not used: the code's are asked instead.
 */
export function eventSetItems(stored: Pick<SurveyQuestionSetDoc, "items"> | null): SurveyItem[] {
  if (stored?.items) {
    const kept = checkWholeChange({ items: stored.items });
    if (kept.ok) return kept.items;
  }
  return eventTemplateItems();
}

// ---------------------------------------------------------------------------
// Run NAISI › Surveys › Question sets
// ---------------------------------------------------------------------------

/** About how long a session report takes, as its form's eyebrow says. */
const REPORT_MINUTES = 2;

/** How big a set is: its questions (and an incubator's, where they differ) and its minutes. */
export function setSizeWords(kind: QuestionSetKind, stored: SurveyQuestionSetDoc | null): string {
  if (kind === "event") {
    const questions = surveyQuestionsOf(eventSetItems(stored)).length;
    return `${questionsWords(questions)}, ${minutesWords(minutesFor(questions))}`;
  }
  if (kind === "check-in") return `${questionsWords(surveyQuestionsOf(codeItemsOf("check-in")).length)}, ${minutesWords(CHECK_IN_MINUTES)}`;
  if (kind === "session-report") return `${questionsWords(SESSION_REPORT_QUESTIONS.length)}, ${minutesWords(REPORT_MINUTES)}`;
  const fellowship = surveyQuestionsOf(templateItems(kind, "fellowship", null)).length;
  const incubator = surveyQuestionsOf(templateItems(kind, "incubator", "alignment")).length;
  const questions = fellowship === incubator ? questionsWords(fellowship) : `${questionsWords(fellowship)}, ${incubator} for an incubator`;
  return `${questions}, ${minutesWords(templateMinutes(kind))}`;
}

/** One row of the Question sets card. */
export type QuestionSetRow = {
  kind: QuestionSetKind;
  name: string;
  /** "5 questions, about a minute · Changed Mon 2 Nov". */
  line: string;
  href: string;
  /** What Edit says to a screen reader. */
  aria: string;
};

/** The card's rows, in the board's order, each from its stored set or the code's. */
export function questionSetRows(stored: ReadonlyMap<QuestionSetKind, SurveyQuestionSetDoc>): QuestionSetRow[] {
  return QUESTION_SET_KINDS.map((kind) => {
    const set = stored.get(kind) ?? null;
    const name = QUESTION_SETS[kind].name;
    const changed = set?.updatedAt ? `Changed ${dayWords(set.updatedAt)}` : "";
    return {
      kind,
      name,
      line: [setSizeWords(kind, set), changed].filter(Boolean).join(" · "),
      href: questionSetHref(kind),
      aria: `${QUESTION_SET_WORDS.edit} the questions for ${name}`,
    };
  });
}
