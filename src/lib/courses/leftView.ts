import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { homeEvents } from "@/app/(app)/dashboard/homeData";
import type { TileParts } from "@/app/(app)/dashboard/homeWords";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { resolveCalendar, resolveWeekDocs } from "@/lib/courses/groupResolve";
import {
  DID_NOT_HAPPEN,
  NOT_MARKED,
  markRowLabel,
  readingListLink,
} from "@/lib/courses/leavingWords";
import { ownAttendanceSessions, sessionsFromJoinWeek } from "@/lib/courses/ownAttendance";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { weekChecklistItems, weekSources, type WeekSource } from "@/lib/courses/weekBlocks/reader";
import { formatRunStartShort } from "@/lib/courses/window";
import { ATTENDANCE_STATUS_LABEL, attendanceDocId } from "@/lib/firestore/courseAttendance";
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
 * WHAT SOMEBODY WHO LEFT A PROGRAMME STILL READS OF IT (board wk-left-phone),
 * worked out on the server for the one person it is about.
 *
 * Three pages: the programme page that says they left, their notes and
 * reflections, and the reading list. Each is built here from records and
 * handed to its page as plain fields, so nothing stored travels further than
 * the words it becomes.
 *
 * WHAT THEY READ. The day they left (`droppedOutAt`); their own marks, from
 * their group's FINISHED registers, the way their programme page always
 * showed them (`ownAttendanceSessions`: one person's mark projected out of
 * each register, never the register), for the sessions before they left; the
 * readings of every published week, as their group reads them (a group's own
 * copy of a week over the run's); their own ratings, comments and notes; and
 * the site's upcoming events, as Home lists them.
 *
 * WHAT THEY DO NOT. Nobody else's name, mark or note, the group's sessions,
 * its room or its updates: nothing here reads another person's record.
 */

/** The group a leaver's row still names, when it is a group of this run. */
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
// The programme page, once they have left
// ---------------------------------------------------------------------------

export type LeftMark = { key: string; label: string; mark: string };

export type LeftEvent = {
  id: string;
  href: string;
  tile: TileParts;
  /** The start, as an ISO instant, for the tile's `<time>`. */
  startsAt: string;
  title: string;
  /** "7pm · Hallward B12": the time, and where it is as anybody may be told. */
  line: string;
};

export type LeftView = {
  runId: string;
  /** "AGI Strategy". */
  name: string;
  /** "Fri 13 Nov", or null when the day is not on record. */
  leftOn: string | null;
  /** The reading list's link words, or null when no week is published. */
  readingLink: string | null;
  /** Their marks before they left, from finished registers, in session order. */
  marks: LeftMark[];
  /** The site's upcoming events. Empty when there are none. */
  events: LeftEvent[];
};

/** The day somebody left, as the pages say it: "Fri 13 Nov". Null when none is on record. */
export function leftOnDay(at: Date | null): string | null {
  if (!at) return null;
  return formatRunStartShort(londonDateKey(at)) ?? null;
}

export async function loadLeftView(
  db: Firestore,
  input: { run: CourseRunDoc; enrolment: CourseEnrolmentDoc },
  now: Date,
): Promise<LeftView> {
  const { run, enrolment } = input;
  const group = await ownGroupOf(db, run, enrolment);

  // Their own sessions, from the week they joined, and the registers of them.
  const sessions = group ? sessionsFromJoinWeek(resolveSessions(run, group), enrolment.joinedWeekNumber) : [];
  const [name, published, upcoming, registerSnaps] = await Promise.all([
    programmeNameOf(db, run),
    publishedWeeksOf(db, run, group),
    homeEvents(now)
      .then((events) => events.upcoming)
      .catch(() => []),
    group && sessions.length
      ? db.getAll(
          ...sessions.map((session) =>
            db
              .collection("courseAttendance")
              .doc(attendanceDocId(run.id, group.id, session.weekNumber, session.occurrence)),
          ),
        )
      : Promise.resolve([]),
  ]);

  const registers = new Map<string, Record<string, unknown>>();
  registerSnaps.forEach((snap, at) => {
    if (snap.exists) registers.set(sessions[at].sessionKey, (snap.data() ?? {}) as Record<string, unknown>);
  });
  const leftAt = enrolment.droppedOutAt;
  const startOf = new Map(sessions.map((session) => [session.sessionKey, sessionInstants(session).startsAt]));
  const marks: LeftMark[] = [];
  for (const row of ownAttendanceSessions(enrolment.uid, sessions, registers)) {
    // Before they left, as the lead's grid draws it: a session that started
    // once they had gone, with no mark of theirs on it, is not theirs.
    const startsAt = startOf.get(row.sessionKey) ?? null;
    const after = leftAt !== null && row.status === null && (startsAt === null || startsAt >= leftAt);
    if (after) continue;
    marks.push({
      key: row.sessionKey,
      label: markRowLabel(row.weekNumber, formatRunStartShort(row.dateKey) ?? null),
      mark: !row.held ? DID_NOT_HAPPEN : row.status ? ATTENDANCE_STATUS_LABEL[row.status] : NOT_MARKED,
    });
  }

  return {
    runId: run.id,
    name,
    leftOn: leftOnDay(leftAt),
    readingLink: readingListLink(
      published.weeks.map((week) => week.weekNumber),
      published.taught,
    ),
    marks,
    events: upcoming.map((event) => ({
      id: event.eventId,
      href: `/events/${encodeURIComponent(event.eventId)}`,
      tile: event.tile,
      startsAt: event.startsAt,
      title: event.title,
      line: [event.clock, event.place].filter(Boolean).join(" · "),
    })),
  };
}

// ---------------------------------------------------------------------------
// The reading list
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
// Their notes and reflections
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
