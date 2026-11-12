import type { SourceKind, When, WordRange } from "../weekBlocks/model";

/**
 * EVERY SENTENCE THE IN-PLACE EDITOR'S SERVER SAYS: refusals, the history's
 * one-line summaries, the lock's words, the comparison's words and the
 * optional notice's email. One module, so a route and a page can never word
 * one thing two ways. British English, sentence case, no dashes.
 *
 * No imports but types: a page can read these as the server does.
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Refusals of a change to one block
// ---------------------------------------------------------------------------

export const EDIT_REFUSAL = {
  /** To a group's facilitator (an old tab) making or changing the group's own copy of a week. */
  groupCopyLeadOnly: "A group’s own copy of a week is made and changed by the programme’s lead or an admin, on the programme’s Weeks page.",
  body: "Send the change as JSON.",
  base: "Load the week again: the save doesn’t say which version of the block it changes.",
  fields: "Say what changes: the save has no fields.",
  nothing: "Nothing to save: no field changes.",
  unknownField: (key: string) => `This kind of block has no “${key}” that can be changed here.`,
  notText: (key: string) => `“${key}” has to be text.`,
  tooLongToRead: (key: string, max: number) => `“${key}” is more than ${max} characters.`,
  sourceKind: "A source is one of Read, Watch, Listen, Watch or listen, Watch or read, Explore or Notebook.",
  readingChoice: "Say whether it’s the same reading at a new address.",
  prompts: "Send the reflection’s prompts as a list of one or two, each with its id and its words.",
  wordsShape: "A word range is two whole numbers, at least and at most, or none.",
  due: "When it’s due is one of: before the session, by the end of the day before, or at the session.",
  kind: "Only a source, a text, a reflection or a written answer can be changed here. Paste the week to change anything else.",
  blockGone:
    "That block isn’t in the week any more: somebody has changed the week since you opened it. Load the week again.",
  blockChanged:
    "That block has changed since you opened it: somebody saved the week meanwhile. Load the week again to see what it says now.",
  sourceTitle: (where: string) => `${where} needs a title.`,
  sourceLink: (where: string) => `${where} needs an https link.`,
  sayWhichReading: "The link has changed. Say whether it’s the same reading at a new address, which keeps every tick.",
  differentReading:
    "Replacing a reading with a different one isn’t something this page can do yet. To put a different reading here, paste the week.",
  textNoHeading: "This text has no heading of its own.",
  textNoTime: "Only Before the session has a time.",
  textHeading: (where: string) => `${where} needs a heading.`,
  textEmpty: (where: string) => `${where} would be empty. To take it out, paste the week.`,
  samePrompts:
    "A reflection keeps its prompts here: change their words, not how many there are. To add or take out a prompt, paste the week.",
  emptyPrompt: (where: string) => `${where} has an empty prompt.`,
  noQuestion: (where: string) => `${where} needs a question.`,
  wordRange: (where: string, max: number) =>
    `${where}: the word range has to run from a smaller number to a larger one, at most ${max}.`,
  rangeInBoxes: (where: string) => `${where} is written in boxes, so it has no word range.`,
  answerNoPart: "This written answer isn’t in a part, so it has no heading to change.",
  answerHeading: (where: string) => `${where} needs a heading.`,
  wouldNotRead: (where: string) => `${where} can’t be stored as it’s written. Check its words and try again.`,
  linkNotHttps: (where: string, link: string) =>
    `${where}: “${link}” isn’t an https link, so it would be left as words. Use an address that starts https://.`,
  picture: (where: string) => `${where}: a picture can’t go in a week.`,
  html: (where: string) => `${where}: HTML can’t go in a week. Write it as Markdown.`,
  oneLine: (where: string) => `${where} is one line: no new paragraphs or lists.`,
  dueAfterSent: (sent: number) =>
    `${plural(sent, "person has", "people have")} sent this answer already, so when it’s due stays as it is: it’s what ${sent === 1 ? "their answer was" : "their answers were"} sent against.`,
  notBlocks: "This week isn’t written as blocks, so there’s nothing to change in place. Paste the week instead.",
  noPage: "This week has no page yet. Paste the week to make it.",
  /** The week as stored holds items its reader leaves out (over a cap, unreadable): an edit or restore would drop them. */
  unreadable:
    "Nothing was saved: this week as stored holds items the editor can’t read back, and saving here would drop them with their ticks and answers.",
  runGone: "This run isn’t on the site any more.",
} as const;

// ---------------------------------------------------------------------------
// The lock on one week
// ---------------------------------------------------------------------------

export const LOCK_WORDS = {
  /** "Claudia is editing week 3, since 2:31pm. You can read it; you can save once Claudia saves or leaves." */
  heldBy: (name: string, weekNumber: number, since: string) =>
    `${name} is editing week ${weekNumber}, since ${since}. You can read it; you can save once ${name} saves or leaves.`,
  /** The banner's own line when the reader holds it. */
  yours: (weekNumber: number) => `Only you are editing week ${weekNumber}.`,
  lost: "You aren’t editing this week any more: your hold on it ended while the page was away, or somebody else has it now. Open it again to carry on.",
  body: "Send the lock’s request as JSON.",
} as const;

// ---------------------------------------------------------------------------
// The history's one line per save
// ---------------------------------------------------------------------------

const KIND_NOUN: Record<SourceKind, string> = {
  read: "reading",
  watch: "video",
  listen: "recording",
  watchOrListen: "video",
  watchOrRead: "reading",
  explore: "source",
  notebook: "notebook",
};

/** "reading", "video": what a source is called in a sentence. */
export function sourceNoun(kind: SourceKind): string {
  return KIND_NOUN[kind];
}

/** "Ada Example’s reading", or "“A field guide …”" with nobody named. */
export function sourceOwnerWords(by: string, title: string, kind: SourceKind): string {
  const who = by.split(",")[0]?.trim() ?? "";
  return who ? `${who}’s ${sourceNoun(kind)}` : `“${title}”`;
}

const FIELD_WORDS: Record<string, string> = {
  kind: "kind",
  title: "title",
  url: "link",
  by: "author",
  date: "date",
  time: "time",
  note: "note",
  heading: "heading",
  body: "words",
  question: "question",
  guidance: "guidance",
  words: "word range",
  due: "due rule",
};

/** "link and title", "time, note and kind". */
export function fieldsWords(fields: readonly string[]): string {
  const named = fields.map((field) => FIELD_WORDS[field] ?? field);
  if (named.length <= 1) return named[0] ?? "";
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

/** The part a line is about: "Part 2: ", or "" at the top of a week. */
function partLead(partNumber: number | null): string {
  return partNumber ? `Part ${partNumber}: ` : "";
}

export const HISTORY_WORDS = {
  /** "Part 2: new link for Ada Example’s reading". */
  source: (partNumber: number | null, changed: readonly string[], owner: string) =>
    `${partLead(partNumber)}new ${fieldsWords(changed)} for ${owner}`,
  /** "Part 1: text reworded", "“Why this week”: heading changed". */
  text: (partNumber: number | null, heading: string, changed: readonly string[]) =>
    `${heading ? `“${heading}”: ` : partLead(partNumber)}${changed.length === 1 && changed[0] === "body" ? "text reworded" : `new ${fieldsWords(changed)}`}`,
  /** "Part 1: reflection reworded". */
  reflection: (partNumber: number | null) => `${partLead(partNumber)}reflection reworded`,
  /** "Part 4: written answer’s word range now 250 to 400", "Part 4: new question for the written answer". */
  writtenAnswer: (partNumber: number | null, changed: readonly string[], after: WordRange | null) =>
    changed.length === 1 && changed[0] === "words"
      ? `${partLead(partNumber)}written answer’s word range ${after ? `now ${after.min} to ${after.max}` : "taken off"}`
      : `${partLead(partNumber)}new ${fieldsWords(changed)} for the written answer`,
  /** "Pasted the week: 16 blocks". */
  pasted: (blockCount: number) => `Pasted the week: ${plural(blockCount, "block", "blocks")}`,
  /** "Restored the version from Mon 9 Nov, 6:40pm". */
  restored: (when: string) => `Restored the version from ${when}`,
  /** A week's first row: what it held before its first change here. */
  firstFound: "The week before its first change here",
  /** A week changed somewhere that keeps no history, found before the next save. */
  drifted: "The week as it stood, changed where no history is kept",
  /** "Every group", "Every group except Group K", "No group: every group has its own copy". */
  reaches: (groups: number, except: readonly string[]) =>
    except.length === 0
      ? groups === 0
        ? "Every group"
        : `Every group (${groups})`
      : groups === 0
        ? "No group: each has its own copy"
        : `Every group except ${except.join(", ")}`,
  /** "7 ticks kept", "2 answers kept". */
  kept: (ticks: number, answers: number) =>
    [ticks > 0 ? `${plural(ticks, "tick", "ticks")} kept` : "", answers > 0 ? `${plural(answers, "answer", "answers")} kept` : ""]
      .filter(Boolean)
      .join(" · "),
  /** "told 9 people". */
  told: (count: number) => `told ${plural(count, "person", "people")}`,
} as const;

// ---------------------------------------------------------------------------
// Comparing two versions
// ---------------------------------------------------------------------------

export const COMPARE_WORDS = {
  changed: (n: number) => `Changed: ${n}`,
  added: (n: number) => `Added: ${n}`,
  removed: (n: number, answers: number) =>
    answers > 0 ? `Removed: ${n}, ${plural(answers, "answer", "answers")} kept with the people who wrote them` : `Removed: ${n}`,
  moved: (n: number) => `Moved: ${n}`,
  same: "No block differs.",
  /** "Read: “Title”, Ada Example, 2024. 15 minutes. example.com link". */
  linkHost: (host: string) => `${host} link`,
  noLink: "no link of its own",
  wordsRange: (range: WordRange | null) => (range ? `${range.min} to ${range.max} words` : "no word range"),
  /** The title a week had and has. */
  title: "The week’s title",
} as const;

export const WHEN_LINE: Record<When, string> = {
  before: "Due before the session",
  dayBefore: "Due by the end of the day before the session",
  atSession: "Due at the session",
};

// ---------------------------------------------------------------------------
// Telling people about a change: the notice
// ---------------------------------------------------------------------------

export const TELL_WORDS = {
  choice: {
    nobody: "Nobody",
    started: (weekNumber: number) => `The people who’ve started week ${weekNumber}`,
    open: (weekNumber: number) => `Everyone week ${weekNumber} is open for`,
    programme: (programme: string) => `Everyone on ${programme}`,
  },
  hint: {
    nobody: "Most fixes don’t need an email.",
    started: "Anybody who has ticked, written or picked something in it.",
    open: "Everybody whose group reads this week.",
    programme: "Everybody holding a place on the programme.",
  },
  /** "To 9 people · a notice · no meeting link". */
  sendLine: (count: number) => `To ${plural(count, "person", "people")} · a notice · no meeting link`,
  /** "Send to 9 people". */
  sendButton: (count: number) => `Send to ${plural(count, "person", "people")}`,
  testButton: "Send me a test first",
  nobodyButton: "Don’t tell anyone",
  /** The saved line above the choices: "Part 2: a new link for Ada Example’s reading. Nobody has been emailed." */
  savedLine: (summary: string) => `${summary}. Nobody has been emailed.`,
  testSubject: (subject: string) => `[TEST] ${subject}`,
  weekLine: (weekNumber: number, url: string) => `Week ${weekNumber} is here: ${url}`,
  context: (weekNumber: number, programme: string) => `Week ${weekNumber} · ${programme}`,
} as const;

export const TELL_REFUSAL = {
  body: "Send the choice as JSON.",
  save: "Say which save to tell people about.",
  saveGone: "That save isn’t in this week’s history.",
  notLatest: "The week has changed since that save, so a notice about it would describe a week people no longer see. Tell them about the newest change instead.",
  notLive: "This week isn’t published, so nobody reads it yet and there’s nobody to tell.",
  audience: "Choose who to tell: the people who’ve started the week, everyone it’s open for, or everyone on the programme.",
  count: "Send the number of people the button showed.",
  countChanged: (count: number) =>
    `The number of people has changed since you looked: it’s ${count} now. Check it, then send again.`,
  nobody: "There’s nobody to tell: nobody in that choice can be emailed.",
  overCap: "That’s more people than one notice can reach. Choose a smaller group.",
  alreadyTold: "People have already been told about this save.",
  noTestAddress: "Your account has no address to send a test to.",
  tooManyTests: (limit: number) => `That’s ${limit} tests in an hour. Try again later.`,
  throttle: "Could not check the send limit. Try again in a moment.",
} as const;

/**
 * What the notice says about one save: its subject and its first lines, in
 * the voice of the design's "A new link for a week 3 reading".
 */
export type NoticeLetter = { subject: string; lines: string[] };

/** Week 3's part 2, or week 3. */
function weekPart(weekNumber: number, partNumber: number | null): string {
  return partNumber ? `week ${weekNumber}’s part ${partNumber}` : `week ${weekNumber}`;
}

export const NOTICE_LETTERS = {
  /** A source at a new address: the design's own words, less the reason (the site cannot know the old link stopped working). */
  link: (weekNumber: number, partNumber: number | null, by: string, title: string, kind: SourceKind): NoticeLetter => {
    const who = by.split(",")[0]?.trim() ?? "";
    return {
      subject: `A new link for a week ${weekNumber} ${sourceNoun(kind)}`,
      lines: [
        `The link to ${who ? `${who}’s ` : ""}“${title}”, in ${weekPart(weekNumber, partNumber)}, has changed. Your ticks are as they were.`,
      ],
    };
  },
  /** A source retitled. */
  title: (weekNumber: number, partNumber: number | null, title: string, by: string, kind: SourceKind): NoticeLetter => ({
    subject: `A new title for a week ${weekNumber} ${sourceNoun(kind)}`,
    lines: [
      `The ${sourceNoun(kind)} in ${weekPart(weekNumber, partNumber)} is now called “${title}”${by ? `, by ${by}` : ""}. It’s the same ${sourceNoun(kind)}, and your ticks are as they were.`,
    ],
  }),
  /** Any other change to a source: its time, its note, its author. */
  source: (weekNumber: number, partNumber: number | null, owner: string, kind: SourceKind): NoticeLetter => ({
    subject: `A change to a week ${weekNumber} ${sourceNoun(kind)}`,
    lines: [`The details of ${owner} in ${weekPart(weekNumber, partNumber)} have changed. Your ticks are as they were.`],
  }),
  /** A reflection's prompt reworded. */
  reflection: (weekNumber: number, partNumber: number | null, prompt: string): NoticeLetter => ({
    subject: `A reworded reflection in week ${weekNumber}`,
    lines: [
      `The reflection in ${weekPart(weekNumber, partNumber)} now asks: “${prompt}”`,
      "Anything you’ve already written there is kept as you wrote it.",
    ],
  }),
  /** A written answer's word range changed. */
  range: (weekNumber: number, partNumber: number | null, after: WordRange | null): NoticeLetter => ({
    subject: `A new word range for week ${weekNumber}’s written answer`,
    lines: [
      after
        ? `The written answer in ${weekPart(weekNumber, partNumber)} now asks for ${after.min} to ${after.max} words.`
        : `The written answer in ${weekPart(weekNumber, partNumber)} no longer has a word range.`,
      "If you’ve already sent yours, it stays as it is.",
    ],
  }),
  /** A written answer's question, guidance or heading reworded. */
  question: (weekNumber: number, partNumber: number | null): NoticeLetter => ({
    subject: `A reworded question in week ${weekNumber}`,
    lines: [
      `The written answer in ${weekPart(weekNumber, partNumber)} has been reworded.`,
      "If you’ve already sent yours, it stays as it is, with the question you answered.",
    ],
  }),
  /** A text reworded. */
  week: (weekNumber: number, partNumber: number | null): NoticeLetter => ({
    subject: `A change to week ${weekNumber}`,
    lines: [`Something in ${weekPart(weekNumber, partNumber)} has been reworded. Anything you’ve ticked or written is kept.`],
  }),
  /**
   * A paste of the whole week, or a restore of an earlier version. "Kept" is
   * said whole only when the save's own record shows it took out nothing
   * anybody had ticked or answered (`takenOut`); otherwise what is true: the
   * work is kept, and what was on anything taken out no longer shows.
   */
  whole: (weekNumber: number, takenOut: number): NoticeLetter => ({
    subject: `A change to week ${weekNumber}`,
    lines: [
      takenOut > 0
        ? `Week ${weekNumber} has been updated, and some of it has been taken out. Everything you’ve ticked or written is kept, but anything you did on what was taken out no longer shows on the week.`
        : `Week ${weekNumber} has been updated. What you’ve already ticked or written is kept.`,
    ],
  }),
} as const;

// ---------------------------------------------------------------------------
// Restoring a version
// ---------------------------------------------------------------------------

export const RESTORE_WORDS = {
  body: "Send the restore as JSON, with the week as you looked at it.",
  base: "Look at the week’s history again: the restore doesn’t say which version of the week it replaces.",
  confirm: "The number of answers to confirm has to be a whole number.",
  weekChanged: "The week has changed since you looked at its history. Look again, then restore.",
  /** "Restoring takes out an item with 2 answers. They stay with the people who wrote them. Confirm to restore it anyway." */
  takesOut: (answers: number, items: number) =>
    `Restoring takes out ${items === 1 ? "an item" : "items"} with ${plural(answers, "answer", "answers")}. They stay with the people who wrote them. Confirm to restore it anyway.`,
  same: "The week already says what that version says.",
} as const;

// ---------------------------------------------------------------------------
// Paste the week, then check it: what it contains by kind
// ---------------------------------------------------------------------------

/** Each kind of block as the paste's check names it, in the order a week reads. */
export const KIND_LABEL: Record<
  | "thisWeek"
  | "text"
  | "outcomes"
  | "contentNote"
  | "part"
  | "source"
  | "reflection"
  | "chooseOne"
  | "table"
  | "writtenAnswer"
  | "cases"
  | "fillIn"
  | "checklist"
  | "inTheSession"
  | "goFurther"
  | "handsOn",
  string
> = {
  thisWeek: "This week",
  text: "Text",
  outcomes: "Outcomes",
  contentNote: "Content note",
  part: "Part",
  source: "Source",
  reflection: "Reflection",
  chooseOne: "Choose one",
  table: "Table",
  writtenAnswer: "Written answer",
  cases: "Cases",
  fillIn: "Fill-in boxes",
  checklist: "Checklist",
  inTheSession: "In the session",
  goFurther: "Go further",
  handsOn: "Hands-on route",
};
