import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { resolveCalendar, resolveWeekDocs } from "@/lib/courses/groupResolve";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { weekChecklistItems, weekSources, type WeekSource } from "@/lib/courses/weekBlocks/reader";
import { formatRunStartShort } from "@/lib/courses/window";
import type { CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseProgress } from "@/lib/firestore/courseProgress";
import {
  weekDocId,
  type CourseRunDoc,
  type CourseWeekDoc,
  type Material,
} from "@/lib/firestore/courses";

/**
 * WHAT SOMEBODY WHO LEFT A PROGRAMME IS SHOWN OF IT (board wk-left-phone):
 * that they left, and when, and nothing else. Their marks, notes and
 * reflections stay where they are, for the programme's lead and admins, and
 * the notes they shared stay with their group; none of that is shown to them,
 * and neither is the reading list or anything of the group's.
 *
 * The run's own page draws it (`LeftProgramme`), and so do the two pages that
 * show somebody taking part their notes and the reading list (below), when the
 * person asking has left.
 *
 * WHAT A MAINTAINER KEEPS: `LeftView` is the programme's name and the day, and
 * nothing read from any other record of the person's. A field added to it is
 * a field shown to somebody who left.
 */

/** The group a learner's row names, when it is a group of this run. */
async function ownGroupOf(
  db: Firestore,
  run: CourseRunDoc,
  enrolment: Pick<CourseEnrolmentDoc, "groupId">,
): Promise<CourseGroupDoc | null> {
  const groupId = enrolment.groupId;
  if (!groupId || groupId.includes("/")) return null;
  const snap = await db.collection("courseGroups").doc(groupId).get();
  if (!snap.exists) return null;
  const group = normalizeCourseGroup(snap.id, snap.data() ?? {});
  return group.runId === run.id ? group : null;
}

/** "AGI Strategy": the programme's short name, or the course's title on a run no programme names. */
async function programmeNameOf(db: Firestore, run: CourseRunDoc): Promise<string> {
  const programme = await runProgrammeOf(db, run.id).catch(() => null);
  return programme?.shortName || run.courseTitle.trim() || "your programme";
}

/** The weeks the person's group is taught, in order, and those of them that are published. */
async function publishedWeeksOf(
  db: Firestore,
  run: CourseRunDoc,
  group: CourseGroupDoc | null,
): Promise<{ taught: number; weeks: CourseWeekDoc[] }> {
  const plan = resolveCalendar(run, group).weekPlan.filter((entry) => entry.kind === "week");
  const docs = await resolveWeekDocs(db, run.id, group?.id ?? null);
  const byId = new Map(docs.map(({ week }) => [week.id, week]));
  const weeks: CourseWeekDoc[] = [];
  for (const entry of plan) {
    const week = byId.get(weekDocId(entry.weekNumber));
    if (week && week.published) weeks.push(week);
  }
  return { taught: plan.length, weeks };
}

// ---------------------------------------------------------------------------
// The page somebody who left reads
// ---------------------------------------------------------------------------

export type LeftView = {
  runId: string;
  /** "AGI Strategy". */
  name: string;
  /** "Fri 13 Nov", or null when the day is not on record. */
  leftOn: string | null;
};

/** The day somebody left, as the pages say it: "Fri 13 Nov". Null when none is on record. */
export function leftOnDay(at: Date | null): string | null {
  if (!at) return null;
  return formatRunStartShort(londonDateKey(at)) ?? null;
}

/**
 * The programme's name and the day they left (`droppedOutAt`). Nothing else of
 * the run or of the person's records is read.
 */
export async function loadLeftView(
  db: Firestore,
  input: { run: CourseRunDoc; enrolment: Pick<CourseEnrolmentDoc, "droppedOutAt"> },
): Promise<LeftView> {
  const { run, enrolment } = input;
  return {
    runId: run.id,
    name: await programmeNameOf(db, run),
    leftOn: leftOnDay(enrolment.droppedOutAt),
  };
}

// ---------------------------------------------------------------------------
// The reading list, for somebody taking part
// ---------------------------------------------------------------------------

export type ReadingItem = {
  id: string;
  title: string;
  /** Where it is, for a reading, a video or a link. Null for a note. */
  href: string | null;
  /** "Reading · 25 min", "Video", "Optional". */
  meta: string;
  /** A note's own words, shown as they are. Null for anything else. */
  body: string | null;
};

export type ReadingWeek = { weekNumber: number; title: string; items: ReadingItem[] };

export type ReadingList = { runId: string; name: string; weeks: ReadingWeek[] };

const KIND_WORD: Record<Material["type"], string> = {
  reading: "Reading",
  video: "Video",
  link: "Link",
  note: "Note",
};

/** Only an address on the web is a link: anything else is shown as words. */
function webAddress(url: string): string | null {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function readingItem(material: Material): ReadingItem {
  const meta = [
    KIND_WORD[material.type],
    typeof material.estimatedMinutes === "number" && material.estimatedMinutes > 0
      ? `${material.estimatedMinutes} min`
      : null,
    material.optional ? "Optional" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    id: material.id,
    title: material.title.trim() || KIND_WORD[material.type],
    href: material.type === "note" ? null : webAddress(material.url),
    meta,
    body: material.type === "note" ? material.body.trim() || null : null,
  };
}

/** A block week's source as a reading list row: "Read · 22 minutes". */
function sourceReadingItem(source: WeekSource): ReadingItem {
  return {
    id: source.id,
    title: source.title.trim() || source.kindLabel,
    href: source.url ? webAddress(source.url) : null,
    meta: [source.kindLabel, source.time].filter(Boolean).join(" · "),
    body: null,
  };
}

/** Every published week's readings, as the person's group reads them. Read only. */
export async function loadReadingList(
  db: Firestore,
  input: { run: CourseRunDoc; enrolment: CourseEnrolmentDoc },
): Promise<ReadingList> {
  const { run, enrolment } = input;
  const group = await ownGroupOf(db, run, enrolment);
  const [name, published] = await Promise.all([programmeNameOf(db, run), publishedWeeksOf(db, run, group)]);
  return {
    runId: run.id,
    name,
    weeks: published.weeks.map((week) => ({
      weekNumber: week.weekNumber,
      title: week.title,
      // A block week's sources, every pack's included; a week written before
      // blocks keeps its materials, drawn exactly as they always were.
      items: isBlockWeek(week) ? weekSources(week).map(sourceReadingItem) : week.materials.map(readingItem),
    })),
  };
}

// ---------------------------------------------------------------------------
// Their notes and reflections, for somebody taking part
// ---------------------------------------------------------------------------

export type NoteItem = {
  id: string;
  /** The reading or checklist item it is about. */
  title: string;
  rating: number | null;
  /** What they wrote for the run to read. */
  comment: string | null;
  /** What they wrote for themselves (and their facilitators and admins). */
  note: string | null;
};

export type NotesWeek = { weekNumber: number; title: string; items: NoteItem[] };

export type OwnNotes = { runId: string; name: string; weeks: NotesWeek[] };

/** The most of a person's own progress rows one page reads, across every run. */
const MAX_OWN_ROWS = 2000;

/**
 * Everything the person wrote on this run's readings: their star ratings,
 * their comments and their own notes. One equality on one field (their own
 * rows), then this run's, in memory. Read only.
 */
export async function loadOwnNotes(
  db: Firestore,
  input: { run: CourseRunDoc; enrolment: CourseEnrolmentDoc },
): Promise<OwnNotes> {
  const { run, enrolment } = input;
  const group = await ownGroupOf(db, run, enrolment);
  const [name, docs, rows] = await Promise.all([
    programmeNameOf(db, run),
    resolveWeekDocs(db, run.id, group?.id ?? null),
    db.collection("courseProgress").where("uid", "==", enrolment.uid).limit(MAX_OWN_ROWS).get(),
  ]);

  // What each item is called, from the week as their group reads it.
  const titleOf = new Map<string, string>();
  const weekTitle = new Map<number, string>();
  for (const { week } of docs) {
    weekTitle.set(week.weekNumber, week.title);
    for (const source of weekSources(week)) titleOf.set(source.id, source.title.trim());
    for (const item of weekChecklistItems(week)) titleOf.set(item.id, item.title.trim());
  }

  const byWeek = new Map<number, NoteItem[]>();
  for (const doc of rows.docs) {
    const row = normalizeCourseProgress(doc.id, doc.data() ?? {});
    if (row.runId !== run.id || row.uid !== enrolment.uid) continue;
    const comment = row.publicComment?.trim() || null;
    const note = row.privateNote?.trim() || null;
    const rating = typeof row.rating === "number" ? row.rating : null;
    if (!comment && !note && rating === null) continue;
    const list = byWeek.get(row.weekNumber) ?? [];
    list.push({ id: row.itemId, title: titleOf.get(row.itemId) || "A reading", rating, comment, note });
    byWeek.set(row.weekNumber, list);
  }

  const weeks = [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekNumber, items]) => ({
      weekNumber,
      title: weekTitle.get(weekNumber) ?? "",
      items: items.sort((a, b) => a.title.localeCompare(b.title, "en-GB") || a.id.localeCompare(b.id)),
    }));
  return { runId: run.id, name, weeks };
}
