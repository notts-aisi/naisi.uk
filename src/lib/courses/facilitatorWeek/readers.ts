import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { FacilitatorGroupModel } from "@/lib/courses/facilitatorGroup";
import { boxesReaderFor } from "@/lib/courses/fillInBoxes/access";
import { resolveCalendar, resolveWeekDoc } from "@/lib/courses/groupResolve";
import { resolveSessions, sessionRange, type ResolvedSession } from "@/lib/courses/sessions";
import { dayRangeWords } from "@/lib/courses/sessionChange/words";
import { isBlockWeek, type FillInBlock, type WeekBlock } from "@/lib/courses/weekBlocks/model";
import { weekFillInBoxes } from "@/lib/courses/weekBlocks/reader";
import { addDaysToKey, isValidDateKey, londonDateKey } from "@/lib/courses/weekPlan";
import { isFillInResponse, isReflectionResponse } from "@/lib/firestore/courseExercises";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { weekDocId, type CourseRunDoc, type CourseWeekDoc } from "@/lib/firestore/courses";
import {
  partWritten,
  peopleShown,
  privateNotesOf,
  readOutCards,
  readsPrivateNotes,
  reflectionPartsOf,
  seesFacilitatorsOwnWork,
  tickedSourcesOf,
  type ReadOutCard,
  type WeekPerson,
  type WeekViewer,
} from "./model";
import { promptOptionWords } from "./words";

/**
 * THE READS BEHIND A GROUP'S WEEK, on the server, after the page's own gate
 * has decided who the viewer is (`WeekViewer`): the group page and its
 * reflections page (a live facilitator of the group, or an admin) and the
 * lead's two pages (the programme's lead, or an admin). `model.ts` says who
 * sees whose work; this file reads it, three ways, each one week of one run:
 *
 *  - REFLECTIONS: the week's rows of `courseExerciseResponses`, reflections
 *    only (`isReflectionResponse`), of the people the viewer is shown.
 *  - TICKS: the week's rows of `courseProgress`, read as who and which item
 *    and nothing else (the projection leaves out the rating, the comment and
 *    the private note).
 *  - PRIVATE NOTES: the same rows read as who, which item and the note, and
 *    only for a viewer who reads private notes (the group's facilitators and
 *    admins, Q38), only for the people whose notes that viewer reads.
 *
 * Every query is equalities on (runId, weekNumber), served by the declared
 * composites that start with those two fields. Nothing here writes, and no
 * row leaves here whole: the pages are handed names, words and counts.
 */

/** The week a group's facilitators are getting ready for: the week of its next session, or of its last once all are over. */
export function weekOfGroup(run: CourseRunDoc, group: CourseGroupDoc, now: Date): { weekNumber: number; sessions: ResolvedSession[] } | null {
  const sessions = resolveSessions(run, group, resolveCalendar(run, group));
  const next = sessionRange(sessions, now).next;
  if (next) return { weekNumber: next.weekNumber, sessions };
  const todayKey = londonDateKey(now);
  const held = sessions.filter((session) => !session.cancelled && session.dateKey !== "" && session.dateKey <= todayKey);
  if (held.length === 0) return null;
  return { weekNumber: Math.max(...held.map((session) => session.weekNumber)), sessions };
}

/** Whether any of a run's weeks is written as blocks: the lead's door to each group's week is offered only then. */
export async function runHasBlockWeeks(db: Firestore, runId: string): Promise<boolean> {
  const snap = await db.collection("courseRuns").doc(runId).collection("weeks").get();
  return snap.docs.some((doc) => isBlockWeek((doc.data() ?? {}) as { blocks?: unknown }));
}

/** "Thu 12 to Wed 18 Nov": the seven days of a week on the group's own calendar, or "" without dates. */
function rangeOf(sessions: readonly ResolvedSession[], weekNumber: number): string {
  const start = sessions.find((session) => session.weekNumber === weekNumber && session.occurrence === 1)?.slotStartKey ?? "";
  return start && isValidDateKey(start) ? dayRangeWords(start, addDaysToKey(start, 6)) : "";
}

/** A block week as the group reads it (its own copy first), or null for a week written before blocks. */
async function blockWeekOf(db: Firestore, runId: string, groupId: string, weekNumber: number): Promise<(CourseWeekDoc & { blocks: WeekBlock[] }) | null> {
  const { week } = await resolveWeekDoc(db, runId, groupId, weekDocId(weekNumber));
  if (!week || !isBlockWeek(week)) return null;
  return week as CourseWeekDoc & { blocks: WeekBlock[] };
}

/** Each person's reflections in a week, by prompt: the words, for the people shown and the week's own prompts. */
async function readReflections(
  db: Firestore,
  runId: string,
  weekNumber: number,
  shown: ReadonlySet<string>,
  promptIds: ReadonlySet<string>,
): Promise<Map<string, Map<string, string>>> {
  const out = new Map<string, Map<string, string>>();
  if (shown.size === 0 || promptIds.size === 0) return out;
  const snap = await db
    .collection("courseExerciseResponses")
    .where("runId", "==", runId)
    .where("weekNumber", "==", weekNumber)
    .get();
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    // Reflections only: an answer is the review queue's, behind its own gate.
    if (!isReflectionResponse(data) || data.runId !== runId) continue;
    const uid = typeof data.uid === "string" ? data.uid : "";
    const promptId = typeof data.exerciseId === "string" ? data.exerciseId : "";
    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (!shown.has(uid) || !promptIds.has(promptId) || !text) continue;
    const own = out.get(uid) ?? new Map<string, string>();
    own.set(promptId, text);
    out.set(uid, own);
  }
  return out;
}

/** Who ticked which of the week's sources: uid by item, ticked rows only, for the people shown. */
async function readTicks(
  db: Firestore,
  runId: string,
  weekNumber: number,
  shown: ReadonlySet<string>,
  sourceIds: ReadonlySet<string>,
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (shown.size === 0 || sourceIds.size === 0) return out;
  // The projection is the boundary: who, which item and whether it is ticked.
  const snap = await db
    .collection("courseProgress")
    .where("runId", "==", runId)
    .where("weekNumber", "==", weekNumber)
    .select("uid", "itemId", "completed")
    .get();
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const uid = typeof data.uid === "string" ? data.uid : "";
    const itemId = typeof data.itemId === "string" ? data.itemId : "";
    if (data.completed !== true || !shown.has(uid) || !sourceIds.has(itemId)) continue;
    const who = out.get(itemId) ?? new Set<string>();
    who.add(uid);
    out.set(itemId, who);
  }
  return out;
}

/**
 * THE ONE READER OF PRIVATE NOTES (Q38): the note a person keeps on a source,
 * by item, for the people whose notes this viewer reads. Called only for a
 * viewer who reads private notes (the group's facilitators and admins), and
 * never on the page that picks lines to read out.
 */
async function readPrivateNotes(
  db: Firestore,
  runId: string,
  weekNumber: number,
  readable: ReadonlySet<string>,
  sourceIds: ReadonlySet<string>,
): Promise<Map<string, Array<{ uid: string; text: string }>>> {
  const out = new Map<string, Array<{ uid: string; text: string }>>();
  if (readable.size === 0 || sourceIds.size === 0) return out;
  const snap = await db
    .collection("courseProgress")
    .where("runId", "==", runId)
    .where("weekNumber", "==", weekNumber)
    .select("uid", "itemId", "privateNote")
    .get();
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const uid = typeof data.uid === "string" ? data.uid : "";
    const itemId = typeof data.itemId === "string" ? data.itemId : "";
    const text = typeof data.privateNote === "string" ? data.privateNote.trim() : "";
    if (!text || !readable.has(uid) || !sourceIds.has(itemId)) continue;
    const notes = out.get(itemId) ?? [];
    notes.push({ uid, text });
    out.set(itemId, notes);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The group's week: This week's work, the reflections half, who ticked what
// ---------------------------------------------------------------------------

/** One person's row in This week's work. */
export type GroupWeekRow = WeekPerson & {
  /** Whether each part's reflection is written, in the order of `parts`. */
  written: boolean[];
};

/** One source with who ticked it, and the private notes left on it the viewer reads. */
export type GroupWeekSource = {
  id: string;
  title: string;
  kindLabel: string;
  partNumber: number | null;
  /** Everybody shown who ticked it, a facilitator's own tick marked as theirs (to the lead and admins). */
  ticked: WeekPerson[];
  /** How many of the group's fellows ticked it, of `GroupWeek.of`: a facilitator's own tick is never counted. */
  fellowsTicked: number;
  /** Null for a viewer who reads no private notes (the lead). */
  notes: Array<{ person: WeekPerson; text: string }> | null;
};

export type GroupWeek = {
  weekNumber: number;
  /** "Thu 12 to Wed 18 Nov", or "". */
  range: string;
  /** The parts that ask for a reflection, in order. */
  parts: Array<{ number: number; title: string }>;
  rows: GroupWeekRow[];
  /** Each part's reflection: how many of the group's fellows have written it, of how many. */
  counts: Array<{ number: number; written: number; of: number }>;
  sources: GroupWeekSource[];
  /**
   * The group's fellows, whom every number on the page counts: the reflections
   * and the ticks alike, for every viewer. ONE DENOMINATOR: the lead and admins
   * are shown the facilitators' own rows and ticks too, marked as theirs, and
   * counted in no number, so a group's numbers mean the same thing on its
   * facilitators' page, the lead's and an admin's, and on the page where lines
   * are read out, whichever of its facilitators also hold a place.
   */
  of: number;
  /** Whether the viewer reads private notes. */
  readsNotes: boolean;
  /** To a facilitator: the group has facilitators, whose own work is left out of what they are shown. */
  ownLeftOut: boolean;
  /** To the lead and admins: facilitators' own work is listed, marked as theirs, and counted in no number. */
  ownApart: boolean;
  /** The week's fill-in boxes (week 6's action plan), or null for a week with none. No one's words: `loadGroupWeekBoxes`. */
  fillIn: GroupWeekFillIn | null;
};

/** A week's fill-in boxes, as their writer's card lays them out. */
export type GroupWeekFillIn = {
  /** The card's title as its writer reads it ("My action plan"). */
  title: string;
  /** Every box, in page order, under its numbered heading (the card numbers its headings 1, 2, 3). */
  boxes: Array<{ id: string; number: number; heading: string; label: string }>;
};

/** The week's fill-in boxes, numbered by heading as the card numbers them; null for a week with none. */
function fillInOf(week: CourseWeekDoc & { blocks: WeekBlock[] }): GroupWeekFillIn | null {
  const boxes = weekFillInBoxes(week);
  if (boxes.length === 0) return null;
  const first = boxes[0];
  const block = (function find(list: readonly WeekBlock[]): FillInBlock | null {
    for (const candidate of list) {
      if (candidate.type === "fillIn" && candidate.id === first.blockId) return candidate;
      if (candidate.type === "part") {
        const inner = find(candidate.blocks);
        if (inner) return inner;
      }
    }
    return null;
  })(week.blocks);
  let number = 0;
  let last: string | null = null;
  return {
    title: block?.title ?? "",
    boxes: boxes.map((box) => {
      const group = `${box.blockId} ${box.heading}`;
      if (group !== last) {
        number += 1;
        last = group;
      }
      return { id: box.id, number, heading: box.heading, label: box.label };
    }),
  };
}

/**
 * A group's week as `viewer` is shown it, or null when the week it is on is
 * not written as blocks (a week written before blocks has no reflections and
 * keeps its own pages) or the group has no week to be on.
 */
export async function loadGroupWeek(
  db: Firestore,
  input: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    model: Pick<FacilitatorGroupModel, "people" | "facilitators">;
    viewer: WeekViewer;
    now: Date;
  },
): Promise<GroupWeek | null> {
  const { run, group, model, viewer, now } = input;
  const at = weekOfGroup(run, group, now);
  if (!at) return null;
  const week = await blockWeekOf(db, run.id, group.id, at.weekNumber);
  if (!week) return null;

  const people = peopleShown(viewer, model.people, model.facilitators);
  const parts = reflectionPartsOf(week.blocks);
  const sources = tickedSourcesOf(week);
  const shown = new Set(people.map((person) => person.uid));
  const readable = new Set(people.filter((person) => privateNotesOf(viewer, person)).map((person) => person.uid));
  const promptIds = new Set(parts.flatMap((part) => part.prompts.map((prompt) => prompt.id)));
  const sourceIds = new Set(sources.map((source) => source.id));

  const [reflections, ticks, notes] = await Promise.all([
    readReflections(db, run.id, at.weekNumber, shown, promptIds),
    readTicks(db, run.id, at.weekNumber, shown, sourceIds),
    readsPrivateNotes(viewer) ? readPrivateNotes(db, run.id, at.weekNumber, readable, sourceIds) : Promise.resolve(null),
  ]);

  const rows: GroupWeekRow[] = people.map((person) => ({
    ...person,
    written: parts.map((part) => partWritten(part, (promptId) => reflections.get(person.uid)?.has(promptId) === true)),
  }));
  const fellows = rows.filter((row) => !row.own);
  const byUid = new Map(people.map((person) => [person.uid, person]));

  return {
    weekNumber: at.weekNumber,
    range: rangeOf(at.sessions, at.weekNumber),
    parts: parts.map((part) => ({ number: part.number, title: part.title })),
    rows,
    counts: parts.map((part, index) => ({
      number: part.number,
      written: fellows.filter((row) => row.written[index]).length,
      of: fellows.length,
    })),
    sources: sources.map((source) => ({
      id: source.id,
      title: source.title,
      kindLabel: source.kindLabel,
      partNumber: source.partNumber,
      ticked: people.filter((person) => ticks.get(source.id)?.has(person.uid) === true),
      fellowsTicked: fellows.filter((row) => ticks.get(source.id)?.has(row.uid) === true).length,
      notes:
        notes === null
          ? null
          : (notes.get(source.id) ?? [])
              .map((note) => ({ person: byUid.get(note.uid), text: note.text }))
              .filter((note): note is { person: WeekPerson; text: string } => note.person !== undefined)
              .sort((a, b) => people.indexOf(a.person) - people.indexOf(b.person)),
    })),
    of: fellows.length,
    readsNotes: notes !== null,
    ownLeftOut: !seesFacilitatorsOwnWork(viewer) && model.facilitators.length > 0,
    ownApart: rows.some((row) => row.own),
    fillIn: fillInOf(week),
  };
}

// ---------------------------------------------------------------------------
// The boxes each person filled in (week 6's action plan)
// ---------------------------------------------------------------------------

/** One person's boxes on a group's week, for a reader the gate lets read them. */
export type PersonBoxes = {
  person: WeekPerson;
  /** How many of the week's boxes have words in them. */
  filled: number;
  /** Their words, by box id; a box left empty is absent. */
  answers: Record<string, string>;
};

/**
 * THE BOXES EACH PERSON ON A GROUP'S WEEK FILLED IN, for the reader the page
 * has already let in, and for exactly the people the one gate lets that
 * reader read: `boxesReaderFor`, which the reader route of somebody's boxes
 * asks before a box is read (`GET .../fill-in-boxes`). So the group's
 * facilitators read each fellow's, the programme's lead and admins read
 * everybody's on the week, a facilitator's own included, and nobody reads a
 * box the route would refuse them. The people are the week's rows, as the
 * reader is shown them (`loadGroupWeek`); a person the gate refuses is left
 * out, words and all.
 *
 * One read of the week's rows (equalities on the run and the week, as the
 * reflections are read), fill-in boxes only, and the gate asked person by
 * person. Empty for a week with no boxes.
 */
export async function loadGroupWeekBoxes(
  db: Firestore,
  input: { run: CourseRunDoc; actor: SessionUser; week: GroupWeek },
): Promise<PersonBoxes[]> {
  const { run, actor, week } = input;
  if (!week.fillIn || week.rows.length === 0) return [];
  const gates = await Promise.all(week.rows.map((row) => boxesReaderFor(db, actor, run.id, row.uid)));
  const readable = week.rows.filter((_, index) => gates[index] !== null);
  if (readable.length === 0) return [];
  const uids = new Set(readable.map((row) => row.uid));
  const boxIds = new Set(week.fillIn.boxes.map((box) => box.id));
  const snap = await db
    .collection("courseExerciseResponses")
    .where("runId", "==", run.id)
    .where("weekNumber", "==", week.weekNumber)
    .get();
  const answers = new Map<string, Record<string, string>>();
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    // Fill-in boxes only: a reflection and an answer each have readers of their own.
    if (!isFillInResponse(data) || data.runId !== run.id) continue;
    const uid = typeof data.uid === "string" ? data.uid : "";
    const boxId = typeof data.exerciseId === "string" ? data.exerciseId : "";
    const text = typeof data.text === "string" ? data.text : "";
    if (!uids.has(uid) || !boxIds.has(boxId) || !text.trim()) continue;
    const own = answers.get(uid) ?? {};
    own[boxId] = text;
    answers.set(uid, own);
  }
  return readable.map((row) => {
    const own = answers.get(row.uid) ?? {};
    return {
      person: { uid: row.uid, name: row.name, firstName: row.firstName, own: row.own },
      filled: Object.keys(own).length,
      answers: own,
    };
  });
}

// ---------------------------------------------------------------------------
// The page to read lines out (wk-reflections)
// ---------------------------------------------------------------------------

/** One prompt on the page to read lines out, with the group's answers to it and nobody's name on them. */
export type ReadOutPrompt = {
  /** "p1", "p2": a key that names nothing but the prompt's place. */
  key: string;
  partNumber: number;
  /** "Part 1: Why alignment might be hard". */
  label: string;
  /** The question, as the week page asks it. */
  text: string;
  cards: ReadOutCard[];
  wrote: number;
  of: number;
  /** The names of the people who have not written one yet, as a sentence names them. */
  notYet: string[];
};

/** A facilitator's own reflections, for the lead and admins: under their name, never read out. */
export type OwnReflections = {
  name: string;
  answers: Array<{ key: string; text: string | null }>;
};

export type ReadOutWeek = {
  weekNumber: number;
  /** When the group meets for this week, for the heading: the session's day and start, or null. */
  session: { dateKey: string; startTimeLocal: string; over: boolean } | null;
  prompts: ReadOutPrompt[];
  /** Null unless the viewer reads facilitators' own work and asked for it. */
  own: OwnReflections[] | null;
};

/** The names a sentence uses: each person's first name, or their whole name where two in the group share one. */
function sentenceNames(people: readonly WeekPerson[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const person of people) counts.set(person.firstName, (counts.get(person.firstName) ?? 0) + 1);
  return new Map(people.map((person) => [person.uid, (counts.get(person.firstName) ?? 0) > 1 || !person.firstName ? person.name : person.firstName]));
}

/**
 * The reflections of one week of a group, to read lines out: for each prompt,
 * the answers of the group's FELLOWS with no name on them, in the order of
 * their words, and how many wrote one. A facilitator's own reflections are
 * never among them (nobody reads those out); the lead and admins may be
 * handed them apart (`own`), under each facilitator's name.
 */
export async function loadReadOutWeek(
  db: Firestore,
  input: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    model: Pick<FacilitatorGroupModel, "people" | "facilitators">;
    viewer: WeekViewer;
    weekNumber: number;
    withOwn: boolean;
    now: Date;
  },
): Promise<ReadOutWeek | null> {
  const { run, group, model, viewer, weekNumber, withOwn, now } = input;
  const week = await blockWeekOf(db, run.id, group.id, weekNumber);
  if (!week) return null;

  const people = peopleShown(viewer, model.people, model.facilitators);
  const fellows = people.filter((person) => !person.own);
  const own = withOwn && seesFacilitatorsOwnWork(viewer) ? people.filter((person) => person.own) : [];
  const parts = reflectionPartsOf(week.blocks);
  const promptIds = new Set(parts.flatMap((part) => part.prompts.map((prompt) => prompt.id)));
  const reflections = await readReflections(db, run.id, weekNumber, new Set([...fellows, ...own].map((person) => person.uid)), promptIds);
  const names = sentenceNames(fellows);

  const prompts: ReadOutPrompt[] = [];
  for (const part of parts) {
    part.prompts.forEach((prompt, index) => {
      const key = `p${prompts.length + 1}`;
      const wrote = fellows.filter((person) => reflections.get(person.uid)?.has(prompt.id) === true);
      prompts.push({
        key,
        partNumber: part.number,
        label: promptOptionWords(part.number, part.title, index, part.prompts.length),
        text: prompt.text,
        cards: readOutCards(key, wrote.map((person) => reflections.get(person.uid)?.get(prompt.id) ?? "")),
        wrote: wrote.length,
        of: fellows.length,
        notYet: fellows.filter((person) => !wrote.includes(person)).map((person) => names.get(person.uid) ?? person.name),
      });
    });
  }

  const sessions = resolveSessions(run, group, resolveCalendar(run, group));
  const session = sessions.find((candidate) => candidate.weekNumber === weekNumber && candidate.occurrence === 1 && !candidate.cancelled) ?? null;
  const range = sessionRange(sessions, now);
  return {
    weekNumber,
    session:
      session && session.dateKey
        ? {
            dateKey: session.dateKey,
            startTimeLocal: session.session.startTimeLocal,
            over: range.next ? range.next.weekNumber > weekNumber : true,
          }
        : null,
    prompts,
    own:
      withOwn && seesFacilitatorsOwnWork(viewer)
        ? own.map((person) => ({
            name: person.name,
            answers: prompts.map((prompt, index) => {
              const id = parts.flatMap((part) => part.prompts)[index]?.id ?? "";
              return { key: prompt.key, text: reflections.get(person.uid)?.get(id) ?? null };
            }),
          }))
        : null,
  };
}
