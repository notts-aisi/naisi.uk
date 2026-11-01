import { noteWithName, noteWithRaters, type NoteDraftInput } from "@/lib/courses/coursework/input";
import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import type { CourseNoteDraftDoc } from "@/lib/firestore/courseNoteDrafts";
import type { MemberNoteDoc, NoteAudience, NoteSource, NoteSuggestion } from "@/lib/memberNotes/model";
import { WEEK_NOTES_WORDS } from "./words";

/**
 * A WEEK'S NOTES AS ITS PAGE DRAWS THEM (privacy v15), worked out from the
 * drafts kept with the run, the end-of-week notes saved from this week, and
 * what a draft would be built from now. Names come back here: the person's
 * from who holds a place now, a rater's and a writer's from their account,
 * and Claude's labels ("the fellow", "Rater 1") are put back in a draft's
 * box. Somebody who no longer holds a place drops out.
 *
 * Two views. An ADMIN'S: the drafts, the saved notes, the counts and who a
 * press would draft for. A LEAD'S: the saved notes kept for leads alone,
 * never a draft, never how many there are, never a count of who submitted.
 *
 * Pure, and every field is plain data: the page is drawn on the server and
 * hands the cards and the press only ids and words.
 */

/** Somebody the notes may be about, as the page lists them. */
export type NotesPerson = { uid: string; name: string; groupId: string | null };

type Common = {
  uid: string;
  name: string;
  group: string;
  /** "Built only from", a line each. */
  builtFrom: string[];
  /** The person's notes, beside their weeks. */
  href: string;
};

export type DraftCard = Common & {
  kind: "draft";
  /** When it was drafted and from what: a new draft is a new card, so the box never keeps an older draft's words. */
  version: string;
  /** Claude's words with the names put back, for the box. */
  text: string;
  /** "Drafted by Claude, Wed 18 Nov, 3pm." */
  drafted: string;
  /** A fact from their application, never Claude's words. */
  offered: boolean;
  /** Feedback or a rating came in after the draft, or the week changed, or it is no longer submitted: one line, or null. */
  stale: string | null;
  /** Still submitted, so it may be saved. */
  savable: boolean;
};

export type SavedCard = Common & {
  kind: "saved";
  text: string;
  /** "Saved to their notes by Zach" */
  savedBy: string;
  /** "Drafted by Claude from week 3. Saved by Zach." */
  line: string;
  suggest: NoteSuggestion[];
  audience: NoteAudience;
  offered: boolean;
};

export type WeekNotesAdminView = {
  weekId: string;
  weekNumber: number;
  weekTitle: string;
  /** The week asks for written work: a week of readings and ticks alone has nothing to draft a note from. */
  asksForWork: boolean;
  claude: boolean;
  allMet: boolean;
  /** "You can draft this week's notes once every group has met: 3 of 4 groups have met." or null. */
  notYet: string | null;
  counts: string;
  notYetAgreed: string | null;
  /** Who a press drafts for: submitted, something to send, and neither a draft nor a saved note from this week. */
  plan: Array<{ uid: string; name: string }>;
  only: "drafts" | "suggestions" | null;
  cards: Array<DraftCard | SavedCard>;
  /** How many cards there are before a filter, so an empty filter and an empty week say different things. */
  total: number;
};

export type WeekNotesLeadView = {
  weekId: string;
  weekNumber: number;
  weekTitle: string;
  cards: SavedCard[];
};

/** What a name lookup gives: the first name somebody goes by, or null once their account has gone. */
export type NameOf = (uid: string) => string | null;

const when = (at: Date) => `${londonDayLabel(at)}, ${londonClockLabel(at)}`;

/** "Built only from", a line for each thing that went. */
export function builtFromLines(sources: readonly NoteSource[], nameOf: NameOf): string[] {
  return sources.map((source) => {
    if (source.kind === "work") {
      return WEEK_NOTES_WORDS.work(source.weekNumber, source, source.submittedAt ? londonDayLabel(source.submittedAt) : null);
    }
    if (source.kind === "levels") return WEEK_NOTES_WORDS.levels(source.weekNumber);
    if (source.kind === "feedback") return WEEK_NOTES_WORDS.feedback(nameOf(source.byUid));
    return WEEK_NOTES_WORDS.rating(nameOf(source.raterUid), source.rating, source.comment.replace(/\s+/g, " ").trim());
  });
}

/** Claude's words for the admin's box: "the fellow" as the person's first name, each "Rater N" as the rater's. */
export function draftWithNames(draft: Pick<CourseNoteDraftDoc, "text" | "raters">, firstName: string, nameOf: NameOf): string {
  const raters = Object.fromEntries(Object.entries(draft.raters).map(([label, uid]) => [label, nameOf(uid) ?? ""]));
  return noteWithRaters(noteWithName(draft.text, firstName), raters);
}

/**
 * Why a draft may no longer say what it would now, or null: the week is no
 * longer submitted; feedback or a rating that would go came in after it; or
 * what would be sent has changed.
 */
export function staleLine(draft: Pick<CourseNoteDraftDoc, "at" | "fingerprint">, now: Pick<NoteDraftInput, "builtFrom" | "fingerprint"> | null): string | null {
  if (now === null) return WEEK_NOTES_WORDS.reopened;
  if (now.fingerprint === draft.fingerprint) return null;
  const after = (at: Date | null) => at !== null && draft.at !== null && at.getTime() > draft.at.getTime();
  const newer = now.builtFrom.filter(
    (source): source is Extract<NoteSource, { kind: "feedback" | "rating" }> => (source.kind === "feedback" || source.kind === "rating") && after(source.at),
  );
  if (newer.length === 0) return WEEK_NOTES_WORDS.changed;
  const kinds = new Set(newer.map((source) => source.kind));
  const newest = newer.reduce((latest, source) => ((source.at as Date).getTime() > (latest.at as Date).getTime() ? source : latest));
  return WEEK_NOTES_WORDS.newer(kinds.size === 2 ? "both" : kinds.has("rating") ? "rating" : "feedback", when(newest.at as Date));
}

function savedCard(note: MemberNoteDoc, person: NotesPerson, group: string, nameOf: NameOf, href: string, offered: boolean): SavedCard {
  const author = nameOf(note.authorUid);
  return {
    kind: "saved",
    uid: person.uid,
    name: person.name,
    group,
    builtFrom: builtFromLines(note.builtFrom, nameOf),
    href,
    text: note.text,
    savedBy: WEEK_NOTES_WORDS.savedBy(author ?? "someone no longer on the site"),
    line: author ? WEEK_NOTES_WORDS.savedLine(note.weekNumber ?? 0, author) : WEEK_NOTES_WORDS.savedLineGone(note.weekNumber ?? 0),
    suggest: note.suggest,
    audience: note.audience,
    offered,
  };
}

/** The order cards are drawn in: their group's meeting order, then by name. */
function byGroupThenName(groupOrder: ReadonlyMap<string, number>) {
  return (a: NotesPerson, b: NotesPerson) =>
    (groupOrder.get(a.groupId ?? "") ?? Number.MAX_SAFE_INTEGER) - (groupOrder.get(b.groupId ?? "") ?? Number.MAX_SAFE_INTEGER) ||
    a.name.localeCompare(b.name, "en-GB") ||
    a.uid.localeCompare(b.uid);
}

export function weekNotesAdminView(input: {
  weekId: string;
  weekNumber: number;
  weekTitle: string;
  asksForWork: boolean;
  claude: boolean;
  meeting: number;
  met: number;
  allMet: boolean;
  /** The people holding a place, never a facilitator. */
  people: readonly NotesPerson[];
  /** Each live group's id to its name, in meeting order. */
  groups: ReadonlyArray<{ id: string; name: string }>;
  /** What a draft would be built from now, by person; null for somebody whose week is not submitted. */
  inputs: ReadonlyMap<string, NoteDraftInput | null>;
  drafts: ReadonlyMap<string, CourseNoteDraftDoc>;
  saved: ReadonlyMap<string, MemberNoteDoc>;
  offered: ReadonlySet<string>;
  nameOf: NameOf;
  /** The first name "the fellow" becomes in a draft's box. */
  firstNameOf: (uid: string) => string;
  hrefOf: (uid: string) => string;
  only: "drafts" | "suggestions" | null;
}): WeekNotesAdminView {
  const groupOrder = new Map(input.groups.map((group, index) => [group.id, index]));
  const groupName = new Map(input.groups.map((group) => [group.id, group.name]));
  const people = [...input.people].sort(byGroupThenName(groupOrder));
  let drafts = 0;
  let nothing = 0;
  let saved = 0;
  let notAgreed = 0;
  const plan: WeekNotesAdminView["plan"] = [];
  const cards: Array<DraftCard | SavedCard> = [];
  for (const person of people) {
    const now = input.inputs.get(person.uid) ?? null;
    const draft = input.drafts.get(person.uid) ?? null;
    const note = input.saved.get(person.uid) ?? null;
    const group = person.groupId ? (groupName.get(person.groupId) ?? "") : "";
    const href = input.hrefOf(person.uid);
    if (now === null) nothing += 1;
    else if (now.sent === 0 && !draft && !note) notAgreed += 1;
    if (note) {
      saved += 1;
      cards.push(savedCard(note, person, group, input.nameOf, href, input.offered.has(person.uid)));
      continue;
    }
    if (draft) {
      drafts += 1;
      cards.push({
        kind: "draft",
        version: `${draft.at?.toISOString() ?? ""}:${draft.fingerprint}`,
        uid: person.uid,
        name: person.name,
        group,
        builtFrom: builtFromLines(draft.builtFrom, input.nameOf),
        href,
        text: draftWithNames(draft, input.firstNameOf(person.uid), input.nameOf),
        drafted: draft.at ? WEEK_NOTES_WORDS.draftedAt(when(draft.at)) : "",
        offered: input.offered.has(person.uid),
        stale: staleLine(draft, now),
        savable: now !== null,
      });
      continue;
    }
    if (now !== null && now.sent > 0) plan.push({ uid: person.uid, name: person.name });
  }
  const shown = cards.filter((card) =>
    input.only === "drafts" ? card.kind === "draft" : input.only === "suggestions" ? card.kind === "saved" && card.suggest.length > 0 : true,
  );
  return {
    weekId: input.weekId,
    weekNumber: input.weekNumber,
    weekTitle: input.weekTitle,
    asksForWork: input.asksForWork,
    claude: input.claude,
    allMet: input.allMet,
    notYet: input.allMet ? null : WEEK_NOTES_WORDS.notYetPress(input.met, input.meeting),
    counts: WEEK_NOTES_WORDS.counts(input.people.length, drafts, nothing, saved),
    notYetAgreed: notAgreed > 0 ? WEEK_NOTES_WORDS.notYetAgreed(notAgreed) : null,
    plan,
    only: input.only,
    cards: shown,
    total: cards.length,
  };
}

/**
 * The lead's view: the saved notes from this week the lead may read, already
 * chosen by the notes' one rule (`notesShownIn`, the lead's place), each
 * about somebody holding a place now. No draft, no count, no fact from an
 * application.
 */
export function weekNotesLeadView(input: {
  weekId: string;
  weekNumber: number;
  weekTitle: string;
  people: readonly NotesPerson[];
  groups: ReadonlyArray<{ id: string; name: string }>;
  notes: readonly MemberNoteDoc[];
  nameOf: NameOf;
  hrefOf: (uid: string) => string;
}): WeekNotesLeadView {
  const groupOrder = new Map(input.groups.map((group, index) => [group.id, index]));
  const groupName = new Map(input.groups.map((group) => [group.id, group.name]));
  const byUid = new Map(input.notes.map((note) => [note.uid, note]));
  const cards = [...input.people]
    .sort(byGroupThenName(groupOrder))
    .flatMap((person) => {
      const note = byUid.get(person.uid);
      if (!note) return [];
      const group = person.groupId ? (groupName.get(person.groupId) ?? "") : "";
      return [savedCard(note, person, group, input.nameOf, input.hrefOf(person.uid), false)];
    });
  return { weekId: input.weekId, weekNumber: input.weekNumber, weekTitle: input.weekTitle, cards };
}
