import type { SourceKind, When } from "../weekBlocks/model";

/**
 * EVERY SENTENCE THE PAGES OF THE IN-PLACE EDITOR SAY, beside the server's
 * own (`words.ts`, whose refusals the pages show as they come): the week's
 * line above its blocks, each block's count, the side panel's labels and
 * lines, the lock's notice, the tell dialog's buttons and what a send did,
 * the history's list, its comparison and its restore, and the paste's check.
 * One module, so a page and its browser test can never word one thing two
 * ways. British English, sentence case, no dashes.
 *
 * No imports but types: a client page reads these.
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// The week's line, above its blocks
// ---------------------------------------------------------------------------

export const WEEK_LINE = {
  live: "Live",
  notLive: "Not published",
  /** "Open for 4 of 11 groups and 21 people · 9 people have started it". */
  reach: (reading: number, groups: number, people: number, started: number) =>
    `${groups === 0 ? "No group meets yet" : `${reading === groups ? `Open for ${plural(groups, "group", "groups")}` : `Open for ${reading} of ${plural(groups, "group", "groups")}`} and ${plural(people, "person", "people")}`} · ${started === 1 ? "1 person has" : `${started} people have`} started it`,
  /** The same line for a week nobody reads yet. */
  notOpen: (groups: number) => (groups === 0 ? "No group meets yet. People read it once it’s marked ready." : `People in ${plural(groups, "group", "groups")} read it once it’s marked ready.`),
  paste: "Paste the week",
  history: "History",
  /** Under the blocks' heading: what the reader can do. */
  howTo: "Choose Change on a source, a text, a reflection or a written answer to change it where it stands. Anything else is changed by pasting the week.",
  /** The heading over the week's blocks. */
  blocksTitle: (weekNumber: number) => `Week ${weekNumber}, as it reads`,
  editing: "Editing",
} as const;

// ---------------------------------------------------------------------------
// Each block's count: numbers only, never names
// ---------------------------------------------------------------------------

export const COUNT_WORDS = {
  ticked: (n: number) => `${n} ticked`,
  answers: (n: number) => plural(n, "answer", "answers"),
  sent: (n: number) => `${n} sent`,
  /** A Choose one: people who ticked one of its packs. */
  packs: (n: number) => `${n} ticked`,
} as const;

// ---------------------------------------------------------------------------
// The side panel
// ---------------------------------------------------------------------------

export const PANEL_WORDS = {
  change: "Change",
  /** The edit button's name, told apart from its neighbours': "Change Part 1’s source: A field guide to base rates". */
  changeLabel: (place: string, label: string) => (label.trim() ? `Change ${place}: ${label.trim()}` : `Change ${place}`),
  close: "Close",
  cancel: "Cancel",
  saving: "Saving…",
  /** "Source · Part 1", "Written answer". */
  title: (kind: string, partNumber: number | null) => (partNumber ? `${kind} · Part ${partNumber}` : kind),
  // A source
  kind: "Kind",
  title_: "Title",
  link: "Link",
  by: "By",
  date: "Date",
  time: "Time",
  note: "Note",
  noteHint: "One line. Markdown: *italics*, **bold**, [a link](https://…).",
  /** Under a field whose words the editor has changed: "Was “…”." */
  was: (value: string) => (value.trim() ? `Was “${value}”.` : "Was empty."),
  ticksLine: (n: number) =>
    n === 0
      ? "Nobody has ticked it yet. Fixing a title, link or detail keeps any tick it gets."
      : `${n === 1 ? "1 person has" : `${n} people have`} ticked it. Fixing a title, link or detail keeps every tick.`,
  /** When the link changes: the only kind of new link this page saves. */
  sameReading: (ticks: number) =>
    `This is the same reading at a new address: it keeps ${ticks === 0 ? "any tick it gets" : ticks === 1 ? "its 1 tick" : `all ${ticks} ticks`}.`,
  differentReading: "To put a different reading here, paste the week.",
  // A text
  heading: "Heading",
  words: "The words",
  markdownHint: "Written in Markdown: **bold**, *italics*, [a link](https://…), a line starting “- ” for a list, a blank line between paragraphs.",
  noHeadingHere: "Text at the top of a week has no heading of its own.",
  // A reflection
  prompt: (n: number, of: number) => (of === 1 ? "The prompt" : `Prompt ${n}`),
  answersLine: (n: number) =>
    n === 0
      ? "Nobody has answered yet."
      : `${n === 1 ? "1 answer has" : `${n} answers have`} been written. Rewording keeps every answer with the person who wrote it, and the words it answered are kept in the week’s history.`,
  promptsFixed: "To add or take out a prompt, paste the week.",
  // A written answer
  answerHeading: "Heading",
  answerHeadingHint: "The title of its part.",
  question: "The question",
  guidance: "What a strong answer does",
  wordsAtLeast: "Words, at least",
  wordsAtMost: "Words, at most",
  wordsHint: "Leave both empty for no word range.",
  boxes: (labels: readonly string[]) => `Written in boxes: ${labels.join(", ")}. Its boxes are changed by pasting the week.`,
  due: "Due",
  /** Why the due rule cannot change: the route's own reason, with the count. */
  dueFixed: (sent: number) =>
    `${sent === 1 ? "1 person has" : `${sent} people have`} sent this answer already, so when it’s due stays as it is: it’s what ${sent === 1 ? "their answer was" : "their answers were"} sent against.`,
  /** What happens to answers already sent, in the design's words. */
  sentLine: (sent: number, range: string) =>
    sent === 0
      ? "Nobody has sent this answer yet."
      : `${sent === 1 ? "1 person has" : `${sent} people have`} sent ${sent === 1 ? "an answer" : "answers"}${range ? `, written to ${range}` : ""}. ${sent === 1 ? "It stays" : "Their answers stay"} as ${sent === 1 ? "it is" : "they are"}, and nothing is flagged for being outside a new range. Change the question’s words, and answers already sent keep the question as it was when they were written.`,
  followRange: (partNumber: number | null) =>
    partNumber ? `This week’s line for Part ${partNumber} updates to match a new word range.` : "This week’s line for the written answer updates to match a new word range.",
  // Who the save is for
  saveFor: "Save for",
  /** "Every group on AGI Strategy (11)". */
  everyGroup: (programme: string, groups: number) => `Every group on ${programme} (${groups})`,
  /** The line under it. */
  allRead: (groups: number) => (groups === 1 ? "The 1 group reads this." : `All ${groups} groups read this.`),
  /** Some group reads its own copy of this week. */
  exceptCopies: (names: readonly string[]) =>
    `${listWords(names)} ${names.length === 1 ? "reads its" : "read their"} own copy of this week, so this save doesn’t reach ${names.length === 1 ? "it" : "them"}.`,
  noGroups: "No group meets yet: this saves the run’s week, which every group will read.",
  save: "Save for every group",
  /** Under the save, for a live week. */
  liveLine: (weekNumber: number) =>
    `Week ${weekNumber} is live: people see the change straight away. You can tell them after saving.`,
  notLiveLine: (weekNumber: number) => `Week ${weekNumber} isn’t published yet: nobody reads it until it’s marked ready.`,
  nothingChanged: "Nothing changed, so nothing was saved.",
  /** After a save that put other lines right. */
  followed: (lines: readonly string[]) => `Also changed to match: ${listWords(lines)}.`,
  /** After a save. */
  saved: (summary: string) => `Saved: ${summary}.`,
  /** A refused save that needs the week read again. */
  openAgain: "Open it as it is now",
  /** The panel's lock lines. */
  lost: "Your hold on this week ended, so somebody else could start editing it. What you typed is still here: save it, or copy it before you close.",
} as const;

/** "Group K", "Group K and Group L", "Group J, Group K and Group L". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The due rules, as the panel's choices name them. */
export const DUE_CHOICE: Record<When, string> = {
  before: "Before the session",
  dayBefore: "By the end of the day before the session",
  atSession: "At the session",
};

/** The kinds of source, in the order the panel offers them. */
export const SOURCE_KIND_ORDER: readonly SourceKind[] = ["read", "watch", "listen", "watchOrListen", "watchOrRead", "explore", "notebook"];

// ---------------------------------------------------------------------------
// One editor at a time
// ---------------------------------------------------------------------------

export const LOCK_NOTICE = {
  /** "Claudia is editing week 3". */
  title: (name: string, weekNumber: number) => `${name} is editing week ${weekNumber}`,
  /** "Since 2:31pm. You can read it; editing opens when Claudia saves or leaves." */
  line: (name: string, since: string) => `Since ${since}. You can read it; editing opens when ${name} saves or leaves.`,
} as const;

// ---------------------------------------------------------------------------
// Telling people
// ---------------------------------------------------------------------------

export const TELL_PAGE = {
  titleAfterSave: "Saved. Tell people about it?",
  title: "Tell people about it?",
  whoToTell: "Who to tell",
  /** "The people who’ve started week 3 (9)". */
  choice: (label: string, count: number, audience: string) => (audience === "nobody" ? label : `${label} (${count})`),
  close: "Close",
  sending: "Sending…",
  /** After a send: how many were emailed, and what was held back. */
  sent: (told: { count: number; sent: number; held: number; suppressed: number; failed: number }) =>
    [
      `Emailed ${plural(told.sent, "person", "people")}.`,
      told.held > 0 ? `${plural(told.held, "email was", "emails were")} held back: this copy of the site doesn’t email ${told.held === 1 ? "that address" : "those addresses"}.` : "",
      told.suppressed > 0 ? `${plural(told.suppressed, "address", "addresses")} can’t be emailed.` : "",
      told.failed > 0 ? `${plural(told.failed, "email", "emails")} didn’t go.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  /** After "Send me a test first". */
  tested: (delivery: string, at: string) =>
    delivery === "sent"
      ? `A test went to you at ${at}. Read it, then choose who to tell.`
      : delivery === "held"
        ? "The test was held back: this copy of the site doesn’t email your address."
        : "Your address can’t be emailed, so the test didn’t go.",
  /** From the history, about a save already told. */
  alreadyTold: (told: string) => `People were told about this save: ${told}.`,
  nobodyChosen: "Nobody will be emailed.",
  reading: "Reading who could be told…",
  cannotTell: "This save can’t be told about now: only the newest save of a published week can.",
  tellFromHistory: "Tell people about it",
} as const;

// ---------------------------------------------------------------------------
// The history
// ---------------------------------------------------------------------------

export const HISTORY_PAGE = {
  title: "History",
  everySave: "Every save",
  tickTwo: "Tick two to compare, or one to compare with now.",
  /** A week never changed where history is kept. */
  none: (weekNumber: number) =>
    `Nothing is in week ${weekNumber}’s history yet. Its first change here, or its next paste, starts it with the week as it was.`,
  back: (weekNumber: number) => `Week ${weekNumber}`,
  /** The check box's name: "Compare Tue 10 Nov, 2:24pm". */
  tickLabel: (when: string, summary: string) => `Compare ${when}: ${summary}`,
  compareWithNow: "Compare with now",
  compareTwo: "Compare the two",
  /** "Comparing Mon 9 Nov, 6:40pm with now". */
  comparing: (before: string, after: string) => `Comparing ${before} with ${after}`,
  now: "now",
  nowLabel: "Now",
  current: "What the week says now",
  restoredFrom: (seq: number) => `Brought back save ${seq}`,
  /** "Restore the Mon 9 Nov version". */
  restore: (version: string) => `Restore the ${version} version`,
  restoring: "Restoring…",
  restoreLine:
    "Restoring brings back the version you choose, as a new save. Ticks and answers stay with people, and anything removed since comes back with its answers.",
  confirmTitle: "Restore it anyway?",
  confirm: (answers: number) => `Restore it and take out ${plural(answers, "answer", "answers")}`,
  restored: (summary: string) => `Saved: ${summary}.`,
  state: { changed: "Changed", added: "Added", removed: "Removed" } as const,
  /** A changed row's fields: "Its link and title changed." */
  fields: (fields: string) => `Its ${fields} changed.`,
  movedLine: (n: number) => `${plural(n, "block has", "blocks have")} moved within the week.`,
  titleRow: "The week’s title",
  loading: "Reading the two versions…",
  told: (count: number) => `told ${plural(count, "person", "people")}`,
} as const;

// ---------------------------------------------------------------------------
// Paste the week, then check it
// ---------------------------------------------------------------------------

export const PASTE_CHECK = {
  /** "What it found: 16 blocks". */
  found: (blocks: number) => `What it found: ${plural(blocks, "block", "blocks")}`,
  /** "Outcomes (4)", "Content note". */
  kind: (label: string, count: number) => (count > 1 ? `${label} (${count})` : label),
  compared: (weekNumber: number) => `Compared with week ${weekNumber} now`,
  same: "It says what the week says now.",
  keeps: (ticks: number, answers: number) =>
    [ticks > 0 ? `Keeps ${plural(ticks, "tick", "ticks")}` : "", answers > 0 ? `Keeps ${plural(answers, "answer", "answers")}` : ""].filter(Boolean).join(" · "),
  takesOut: (answers: number) => `${plural(answers, "answer", "answers")} kept with the people who wrote them`,
  /** "Replace week 3 for every group (11)". */
  replace: (weekNumber: number, reading: number, groups: number) =>
    groups === 0
      ? `Replace week ${weekNumber}`
      : reading === groups
        ? `Replace week ${weekNumber} for every group (${groups})`
        : `Replace week ${weekNumber} for ${reading} of ${plural(groups, "group", "groups")}`,
  /** The replace with answers to take out. */
  replaceTakingOut: (label: string, answers: number) => `${label} and take out ${plural(answers, "answer", "answers")}`,
  footnote: "The same protections as changing one block: ticks and answers stay attached, nothing is emailed, and it goes in the week’s history.",
  lockedOut: (name: string) => `${name} is editing this week: the paste opens when they save or leave.`,
} as const;

// ---------------------------------------------------------------------------
// The two older editors
// ---------------------------------------------------------------------------

export const OLDER_EDITORS = {
  /** The run's week editor in Courses, where the paste stood. */
  pasteMoved: (weekNumber: number) =>
    `Week ${weekNumber}’s blocks are changed on its programme’s Weeks page: one block at a time, or the whole week pasted, with a history of every save.`,
  pasteLink: (weekNumber: number) => `Open week ${weekNumber} on the Weeks page`,
  readyMoved: "Mark it ready on the Weeks page, where the week is checked and previewed first.",
  /** A group's own editor. */
  groupLine: "The programme’s weeks are edited by the programme’s lead.",
  groupCopyLine: (groupName: string) =>
    `${groupName} reads its own copy of this week. It’s shown here as the group reads it, and it can’t be changed from here.`,
} as const;
