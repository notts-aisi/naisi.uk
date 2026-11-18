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
import { answerPiece, answerState, instantOf, isWordCountedAnswer, readWrittenAnswer, type AnswerState } from "@/lib/courses/writtenAnswers/model";
import { lateBy, type WeekDue } from "@/lib/courses/weekWork/model";
import { loadRunWeekStates, type RunWeekStates, type RunWeekWork } from "@/lib/courses/weekWork/readers";
import { lastSentAt, readPieceFacts, readableAnswer, sameWords, versionAtSession } from "@/lib/courses/weekWork/versions";
import { facilitatingOnRunOf, liveGroupsOf } from "@/lib/courses/writtenAnswers/access";
import { workKey, type AnswerFacts, type PersonAnswerWrite, type PersonWork, type PersonWrites, type WrittenBox } from "@/lib/courses/coursework/model";
import { readableSinceOf } from "@/lib/courses/coursework/question";
import { changedSinceFeedback, feedbackVersionsOf } from "@/lib/courses/feedback/model";
import { readRunFeedback } from "@/lib/courses/feedback/readers";
import type { CourseFeedbackDoc } from "@/lib/firestore/courseFeedback";
import { isFillInResponse, isOwnBoxResponse, isReflectionResponse } from "@/lib/firestore/courseExercises";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
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
 *    admins), only for the people whose notes that viewer reads.
 *
 * Every query of the week's rows is equalities on (runId, weekNumber), served
 * by the declared composites that start with those two fields; the run's live
 * groups, which say whose work is a facilitator's own (`facilitatingOnRunOf`),
 * are one equality on the run. Nothing here writes, and no row leaves here
 * whole: the pages are handed names, words and counts.
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
 * THE ONE READER OF PRIVATE NOTES: the note a person keeps on a source,
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
  const [week, liveGroups] = await Promise.all([blockWeekOf(db, run.id, group.id, at.weekNumber), liveGroupsOf(db, run.id)]);
  if (!week) return null;

  const people = peopleShown(viewer, model.people, model.facilitators, facilitatingOnRunOf(group, liveGroups));
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
// A programme's coursework: the Coursework tab and one person's page
// ---------------------------------------------------------------------------

/**
 * EVERYTHING WRITTEN AND TICKED ON A RUN, for the Coursework tab and one
 * person's page (`src/lib/courses/coursework/`), on the server, after the
 * page's own gate has let in the programme's lead or an admin: one equality
 * on the run for each store, filtered in memory.
 *
 *  - From the week's answers store, each person's reflections, fill-in boxes
 *    and written answers, told apart by kind. For everybody, counts and
 *    states only; the words (and when each was written) only for `wordsOf`:
 *    the one person whose page is being drawn, or the people of one group
 *    whose answers to one question are drawn (each caller has asked, person
 *    by person, the gate on whose work its reader may read first).
 *  - A WRITTEN ANSWER (privacy v17) only as its readers may read it
 *    (`readableAnswer`, from the session the person is due at,
 *    `loadRunWeekStates`): before that session, the words as last sent; once
 *    it has started, the latest words, sent or not. Never sent, before it, it
 *    is started or not, and waits for nobody's feedback. Reflections and
 *    boxes are read as they are typed, as v17 says.
 *  - For each person in `wordsOf`, each piece's labels: when it last changed,
 *    how long after the session that was, and the version at the session
 *    when it differs; a written answer's last send too. `writes` is the
 *    first person's (the one person's page); `writesOf` holds everybody's.
 *  - The run's feedback (`courseFeedback`): an answer with a piece on it, or
 *    with feedback given before pieces existed, has feedback. The pieces
 *    about the people in `wordsOf` travel back for their page.
 *  - For everybody, as facts and never words (`savedAt`, `answerFacts`):
 *    when each reflection and box was last saved, and of each written answer
 *    whether its readers may read it, when the words they read were saved,
 *    how many pieces of feedback are on it and whether it was changed since
 *    the newest of them (`changedSinceFeedback`). What the Coursework tab's
 *    flags and its list of answers waiting for feedback are worked out from.
 *  - From the progress store, who ticked which item, through a projection
 *    with no rating, no comment and no private note.
 *  - Where each person's every week stands (`states`), which the tab's one
 *    meaning of done asks too.
 *
 * Survey answers live elsewhere and are never read here.
 */
export async function readRunCoursework(
  db: Firestore,
  on: {
    run: CourseRunDoc;
    liveGroups: readonly CourseGroupDoc[];
    now: Date;
    /** The run's places, when the caller has read them already: not read again. */
    enrolments?: readonly CourseEnrolmentDoc[] | null;
    /** The run's stored weeks, when the caller has read them already (the Coursework tab, beside the first reads): not read again. */
    weekRecords?: RunWeekWork | null;
  },
  wordsOf: string | readonly string[] | null,
): Promise<{
  work: Map<string, PersonWork>;
  writes: PersonWrites;
  writesOf: ReadonlyMap<string, PersonWrites>;
  states: RunWeekStates;
  feedback: CourseFeedbackDoc[];
}> {
  const runId = on.run.id;
  // Whose words are read: nobody, the one person whose page is drawn, or the people of one group.
  const wanted = wordsOf === null ? [] : typeof wordsOf === "string" ? [wordsOf] : [...wordsOf];
  const wordsFor = new Set(wanted.filter(Boolean));
  const [responses, progress, states, pieces] = await Promise.all([
    db.collection("courseExerciseResponses").where("runId", "==", runId).get(),
    // The projection is the boundary: who, which item, whether it is ticked and when.
    db.collection("courseProgress").where("runId", "==", runId).select("uid", "itemId", "completed", "completedAt").get(),
    loadRunWeekStates(db, { run: on.run, liveGroups: on.liveGroups, enrolments: on.enrolments ?? null, records: on.weekRecords ?? null, now: on.now }),
    readRunFeedback(db, runId),
  ]);
  // Every written answer somebody has left a piece of feedback on, with the pieces on it.
  const onAnswer = new Map<string, CourseFeedbackDoc[]>();
  for (const piece of pieces) {
    if (piece.on.kind !== "writtenAnswer") continue;
    const key = `${piece.uid} ${workKey(piece.weekNumber, piece.on.itemId)}`;
    onAnswer.set(key, [...(onAnswer.get(key) ?? []), piece]);
  }
  const given = new Set(onAnswer.keys());
  type Work = {
    reflections: Set<string>;
    boxes: Set<string>;
    answers: Map<string, AnswerState>;
    ticked: Set<string>;
    sentAt: Map<string, Date>;
    tickedAt: Map<string, Date | null>;
    writtenAt: Map<string, Date | null>;
    savedAt: Map<string, Date | null>;
    answerFacts: Map<string, AnswerFacts>;
  };
  const work = new Map<string, Work>();
  const of = (uid: string) => {
    let found = work.get(uid);
    if (!found) {
      found = {
        reflections: new Set(),
        boxes: new Set(),
        answers: new Map(),
        ticked: new Set(),
        sentAt: new Map(),
        tickedAt: new Map(),
        writtenAt: new Map(),
        savedAt: new Map(),
        answerFacts: new Map(),
      };
      work.set(uid, found);
    }
    return found;
  };
  // The words of the people a page asks for, each person's apart.
  type Writes = { reflections: Map<string, WrittenBox>; boxes: Map<string, WrittenBox>; answers: Map<string, PersonAnswerWrite>; ticked: Set<string> };
  const writesOf = new Map<string, Writes>();
  for (const uid of wordsFor) writesOf.set(uid, { reflections: new Map(), boxes: new Map(), answers: new Map(), ticked: new Set() });
  /** The writes of somebody whose words are read, or null for anybody else. */
  const wordsOfUid = (uid: string): Writes | null => writesOf.get(uid) ?? null;
  /** A box's words for the page, with how late they last changed and their words at the session when they differ. */
  const boxOf = (uid: string, weekNumber: number, data: Record<string, unknown>, text: string): WrittenBox => {
    const due: WeekDue = states.dueOf(uid, weekNumber);
    const piece = readPieceFacts(data);
    const then = versionAtSession(piece, due.at, on.now);
    const at = instantOf(data.updatedAt);
    return { text, at, lateMs: lateBy(at, due), atSession: then && !sameWords(then, piece) ? then.text.trim() || null : null };
  };
  for (const doc of responses.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    if (data.runId !== runId) continue;
    const uid = typeof data.uid === "string" ? data.uid : "";
    const id = typeof data.exerciseId === "string" ? data.exerciseId : "";
    const weekNumber = typeof data.weekNumber === "number" ? data.weekNumber : NaN;
    if (!uid || !id || !Number.isInteger(weekNumber)) continue;
    const key = workKey(weekNumber, id);
    const text = typeof data.text === "string" ? data.text : "";
    const firstWrittenAt = instantOf(data.firstWrittenAt) ?? instantOf(data.updatedAt);
    if (isReflectionResponse(data)) {
      if (!text.trim()) continue;
      of(uid).reflections.add(key);
      of(uid).writtenAt.set(key, firstWrittenAt);
      of(uid).savedAt.set(key, instantOf(data.updatedAt));
      wordsOfUid(uid)?.reflections.set(key, boxOf(uid, weekNumber, data, text.trim()));
    } else if (isFillInResponse(data)) {
      if (!text.trim()) continue;
      of(uid).boxes.add(key);
      of(uid).writtenAt.set(key, firstWrittenAt);
      of(uid).savedAt.set(key, instantOf(data.updatedAt));
      wordsOfUid(uid)?.boxes.set(key, boxOf(uid, weekNumber, data, text));
    } else if (!isOwnBoxResponse(data) && isWordCountedAnswer(data)) {
      // A block week's written answer; the summer's exercise answers have no words count.
      const record = readWrittenAnswer(data);
      const piece = answerPiece(record);
      const due = states.dueOf(uid, weekNumber);
      // Its words, and whether it waits for feedback, only as its readers may read it: the one answer.
      const read = readableAnswer(piece, due.at, on.now);
      const readable = read !== null;
      if (record.firstSentAt) of(uid).sentAt.set(key, record.firstSentAt);
      const state: AnswerState = !readable
        ? record.words > 0
          ? "draft"
          : "not-started"
        : record.feedback || given.has(`${uid} ${key}`)
          ? "feedback"
          : read.words > 0
            ? answerState(record) === "draft"
              ? "sent"
              : answerState(record)
            : "not-started";
      of(uid).answers.set(key, state);
      // Facts, never words: what the Coursework tab's flags and its list of answers waiting for feedback ask.
      const onThis = onAnswer.get(`${uid} ${key}`) ?? [];
      const takesFeedback = readable && read.words > 0;
      // Readable in these words since the later of their save and their send as they are, or, not sent as they are, the
      // start of the session they are read from: the page of one question's own rule (`readableSinceOf`).
      const since = takesFeedback
        ? readableSinceOf({ kind: "answer", savedAt: read.savedAt, lastSentAt: lastSentAt(piece), sessionStart: due.at })
        : null;
      of(uid).answerFacts.set(key, {
        readable: takesFeedback,
        savedAt: takesFeedback ? read.savedAt : null,
        readableSince: since,
        firstSentAt: record.firstSentAt,
        sentLateMs: lateBy(record.firstSentAt, due),
        sessionStart: due.at,
        pieces: onThis.length + (record.feedback ? 1 : 0),
        changed:
          takesFeedback &&
          changedSinceFeedback(feedbackVersionsOf(id, onThis, record.feedback, piece), read.savedAt ? read.savedAt.toISOString() : null),
      });
      const own = wordsOfUid(uid);
      if (own) {
        const lastSent = lastSentAt(piece);
        const then = readable ? versionAtSession(piece, due.at, on.now) : null;
        own.answers.set(key, {
          state,
          words: read?.words ?? 0,
          text: read?.text ?? "",
          boxes: read?.boxes ?? null,
          sentAt: record.firstSentAt,
          lastSentAt: lastSent,
          changedAt: read?.savedAt ?? null,
          changedLateMs: read ? lateBy(read.savedAt, due) : null,
          sentLateMs: lateBy(lastSent, due),
          // Changed since it was last sent, while its readers still read it as sent: the reading view says so.
          changedSinceSent: Boolean(read && !read.latest && lastSent && record.savedAt && record.savedAt.getTime() > lastSent.getTime()),
          writtenAt: firstWrittenAt,
          atSession: then && read && !sameWords(then, read) ? { text: then.text, boxes: then.boxes } : null,
          piece: readable ? piece : null,
          feedback: readable ? record.feedback : null,
        });
      }
    }
  }
  for (const doc of progress.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const uid = typeof data.uid === "string" ? data.uid : "";
    const itemId = typeof data.itemId === "string" ? data.itemId : "";
    if (data.completed !== true || !uid || !itemId) continue;
    of(uid).ticked.add(itemId);
    of(uid).tickedAt.set(itemId, instantOf(data.completedAt));
    wordsOfUid(uid)?.ticked.add(itemId);
  }
  const none: PersonWrites = { reflections: new Map(), boxes: new Map(), answers: new Map(), ticked: new Set() };
  return {
    work,
    // The first person's words: the one person's page asks for theirs alone.
    writes: (wanted[0] ? writesOf.get(wanted[0]) : undefined) ?? none,
    writesOf,
    states,
    feedback: pieces.filter((piece) => wordsFor.has(piece.uid)),
  };
}

/**
 * ONE PERSON'S PRIVATE NOTES ON A RUN, by item, for their page: through the
 * one reader of private notes, only where this viewer reads that
 * person's notes (`privateNotesOf`: an admin; never the programme's lead,
 * and a facilitator's own note an admin's alone). Null for a viewer who
 * reads none.
 */
export async function readPersonPrivateNotes(
  db: Firestore,
  runId: string,
  viewer: WeekViewer,
  person: WeekPerson,
  weeks: ReadonlyArray<{ weekNumber: number; sourceIds: ReadonlySet<string> }>,
): Promise<Map<string, string> | null> {
  if (!privateNotesOf(viewer, person)) return null;
  const readable = new Set([person.uid]);
  const read = await Promise.all(
    weeks.filter((week) => week.sourceIds.size > 0).map((week) => readPrivateNotes(db, runId, week.weekNumber, readable, week.sourceIds)),
  );
  const out = new Map<string, string>();
  for (const notes of read) {
    for (const [itemId, list] of notes) {
      const own = list.find((note) => note.uid === person.uid);
      if (own) out.set(itemId, own.text);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The page to read lines out
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

export type ReadOutWeek = {
  weekNumber: number;
  /** When the group meets for this week, for the heading: the session's day and start, or null. */
  session: { dateKey: string; startTimeLocal: string; over: boolean } | null;
  prompts: ReadOutPrompt[];
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
 * never among them (nobody reads those out). Nothing it hands carries a name,
 * a uid or a time beside an answer, whoever asks: the pages that read
 * reflections with names (`src/lib/courses/coursework/questionLoad.ts` and
 * `readingLoad.ts`) have loaders of their own, which this page never calls.
 */
export async function loadReadOutWeek(
  db: Firestore,
  input: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    model: Pick<FacilitatorGroupModel, "people" | "facilitators">;
    viewer: WeekViewer;
    weekNumber: number;
    now: Date;
  },
): Promise<ReadOutWeek | null> {
  const { run, group, model, viewer, weekNumber, now } = input;
  const [week, liveGroups] = await Promise.all([blockWeekOf(db, run.id, group.id, weekNumber), liveGroupsOf(db, run.id)]);
  if (!week) return null;

  const people = peopleShown(viewer, model.people, model.facilitators, facilitatingOnRunOf(group, liveGroups));
  const fellows = people.filter((person) => !person.own);
  const parts = reflectionPartsOf(week.blocks);
  const promptIds = new Set(parts.flatMap((part) => part.prompts.map((prompt) => prompt.id)));
  const reflections = await readReflections(db, run.id, weekNumber, new Set(fellows.map((person) => person.uid)), promptIds);
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
  };
}
