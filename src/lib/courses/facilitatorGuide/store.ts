import "server-only";

import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import {
  COURSE_FACILITATOR_GUIDE_COLLECTION,
  facilitatorGuideDocId,
  normalizeCourseFacilitatorGuide,
  type CourseFacilitatorGuideDoc,
} from "@/lib/firestore/courseFacilitatorGuide";
import type { GuideReader, GuideWriter } from "./access";
import {
  COURSE_DOCUMENT_KEYS,
  COURSE_DOCUMENT_LABEL,
  parseSlotKey,
  sanitizeGuideTitle,
  slotKey,
  slotsOfPage,
  type CourseDocumentKey,
  type GuideDocument,
  type GuidePage,
  type GuideSlot,
} from "./model";

/**
 * EVERY READ AND WRITE OF A COURSE'S FACILITATOR GUIDE
 * (`courseFacilitatorGuide`, `src/lib/firestore/courseFacilitatorGuide.ts`).
 *
 * Each read takes a `GuideReader` and each write a `GuideWriter`, which only
 * the gate mints (`./access.ts`): a caller cannot read a document without
 * having been admitted to the course first, and reads only that course's.
 * Nothing that leaves here is a stored document: a page is handed titles and
 * blocks, field by field.
 *
 * The two reads with no reader are for the course's destroy
 * (`countCourseGuide`, `courseGuideRefs`): how many documents there are and
 * their addresses, to delete them, and nothing of what they say.
 *
 * Every query is one equality on `courseId`, with a projection to the fields
 * a list needs; nothing needs a composite index.
 */

function guideCollection(db: Firestore) {
  return db.collection(COURSE_FACILITATOR_GUIDE_COLLECTION);
}

/** One loaded document, as a list of a course's guide names it. */
export type GuideIndexDocument = { key: CourseDocumentKey; label: string; title: string };

/** One week with something loaded: its session plan's and its notes' titles. */
export type GuideIndexWeek = { weekNumber: number; plan: string | null; notes: string | null };

/** What a course's guide holds, as its course page lists it: titles, never the words under them. */
export type GuideIndex = {
  courseId: string;
  courseTitle: string;
  /** The course's own documents that are loaded, in the course page's order. */
  documents: GuideIndexDocument[];
  /** The weeks with a session plan or notes loaded, in week order. */
  weeks: GuideIndexWeek[];
};

/** What a course's guide holds, for a reader of it. */
export async function readGuideIndex(db: Firestore, reader: GuideReader): Promise<GuideIndex> {
  const snap = await guideCollection(db).where("courseId", "==", reader.courseId).select("courseId", "slot", "title").get();
  const titles = new Map<string, string>();
  for (const doc of snap.docs) {
    const data = doc.data() ?? {};
    const slot = parseSlotKey(data.slot);
    // A row is listed only when its own fields name this course and its id agrees.
    if (!slot || data.courseId !== reader.courseId || doc.id !== facilitatorGuideDocId(reader.courseId, slot)) continue;
    titles.set(slotKey(slot), sanitizeGuideTitle(data.title));
  }
  const documents = COURSE_DOCUMENT_KEYS.filter((key) => titles.has(key)).map((key) => ({
    key,
    label: COURSE_DOCUMENT_LABEL[key],
    title: titles.get(key) ?? "",
  }));
  const weeks = new Map<number, GuideIndexWeek>();
  for (const [key, title] of titles) {
    const slot = parseSlotKey(key);
    if (!slot || slot.kind !== "week") continue;
    const week = weeks.get(slot.weekNumber) ?? { weekNumber: slot.weekNumber, plan: null, notes: null };
    week[slot.part] = title;
    weeks.set(slot.weekNumber, week);
  }
  return {
    courseId: reader.courseId,
    courseTitle: reader.courseTitle,
    documents,
    weeks: [...weeks.values()].sort((a, b) => a.weekNumber - b.weekNumber),
  };
}

/** One document of a page, as the page draws it. */
export type GuidePageDocument = { slot: GuideSlot; doc: GuideDocument };

async function readSlot(db: Firestore, courseId: string, slot: GuideSlot): Promise<CourseFacilitatorGuideDoc | null> {
  const snap = await guideCollection(db).doc(facilitatorGuideDocId(courseId, slot)).get();
  if (!snap.exists) return null;
  const doc = normalizeCourseFacilitatorGuide(snap.id, snap.data() ?? {});
  return doc && doc.courseId === courseId && slotKey(doc.slot) === slotKey(slot) ? doc : null;
}

/** The documents of one page that are loaded, in the page's order: a week's plan then its notes, or one course document. */
export async function readGuidePage(db: Firestore, reader: GuideReader, page: GuidePage): Promise<GuidePageDocument[]> {
  const found = await Promise.all(slotsOfPage(page).map((slot) => readSlot(db, reader.courseId, slot)));
  return found
    .filter((doc): doc is CourseFacilitatorGuideDoc => doc !== null)
    .map((doc) => ({ slot: doc.slot, doc: { title: doc.title, blocks: doc.blocks } }));
}

/** One stored document, for the loader to copy out. */
export async function readGuideSlot(db: Firestore, writer: GuideWriter, slot: GuideSlot): Promise<GuideDocument | null> {
  const doc = await readSlot(db, writer.courseId, slot);
  return doc ? { title: doc.title, blocks: doc.blocks } : null;
}

/** Saves one document in its place, replacing what was there. The loader has already held it to its checks. */
export async function saveGuideSlot(db: Firestore, writer: GuideWriter, slot: GuideSlot, doc: GuideDocument): Promise<void> {
  await guideCollection(db)
    .doc(facilitatorGuideDocId(writer.courseId, slot))
    .set({
      courseId: writer.courseId,
      slot: slotKey(slot),
      weekNumber: slot.kind === "week" ? slot.weekNumber : null,
      title: doc.title,
      blocks: doc.blocks,
      updatedAt: FieldValue.serverTimestamp(),
    });
}

/** How many documents a course's guide holds, for the course destroy's manifest. A count, nothing more. */
export async function countCourseGuide(db: Firestore, courseId: string): Promise<number> {
  return (await guideCollection(db).where("courseId", "==", courseId).count().get()).data().count;
}

/**
 * The addresses of every document of a course's guide, for the course's
 * destroy (`destroyCourseCascade`), which deletes them with the course. Reads
 * the ids only: nothing a document says leaves here.
 */
export async function courseGuideRefs(db: Firestore, courseId: string): Promise<DocumentReference[]> {
  const snap = await guideCollection(db).where("courseId", "==", courseId).select().get();
  return snap.docs.map((doc) => doc.ref);
}
