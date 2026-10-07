import "server-only";
import type { DocumentData, Firestore, Transaction } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseStatus } from "@/lib/firestore/courses";
import { canApproveCourse, canDraftCourse } from "@/lib/firestore/users";
import type { CourseChoiceView } from "./views";

/**
 * THE COURSES A PROGRAMME CAN BE TIED TO.
 *
 * A programme on the application form is for a course, and while the two are
 * tied that course's public page offers the form (see
 * `../lifecycle/openForm.ts`). This module answers the two questions the
 * Settings tab has about courses: which ones can this person pick, and may
 * this person pick that one.
 *
 * ## The same answer to both
 *
 * `listCourseChoices` fills the picker and `courseOnOffer` is asked by the
 * writer before it stores a tie, and both go by `isOnOffer`, so the route
 * accepts exactly what the screen offered and nothing else:
 *
 *  - a PUBLISHED course, for anybody who may change the programme;
 *  - a DRAFT course, only for somebody who may read a draft course. A draft
 *    is its authors' until it is published, and a programme's lead is not
 *    one of them by being a lead;
 *  - never an ARCHIVED course, which has been taken off the site.
 *
 * ## The course already chosen is always shown
 *
 * Whatever has become of it, so the screen never shows "No course page" over
 * a tie that is still stored. It is shown by its title when the caller may
 * read it, and by a few words in its place when they may not or when it has
 * been deleted.
 *
 * Reads go by the document's own two fields, `title` and `status`. Nothing
 * else about a course is read here, and nothing else leaves.
 */

const COURSES_COLLECTION = "courses";

const PUBLISHED: CourseStatus = "published";
const ARCHIVED: CourseStatus = "archived";

const UNTITLED = "Untitled course";
const HIDDEN_DRAFT = "A course that is not published yet";
const GONE = "A course that is no longer on the site";

/**
 * May this person read a course that is still a draft? The bar the course
 * editor's own pages apply: an admin, or a holder of `draftCourse` or
 * `approveCourse`.
 */
export function readsCourseDrafts(user: SessionUser): boolean {
  return canDraftCourse(user) || canApproveCourse(user);
}

/** A stored status, read the way the course's own reader does: anything unknown is a draft. */
function standingOf(data: DocumentData | undefined): CourseStatus {
  const status = data?.status;
  return status === PUBLISHED || status === ARCHIVED ? status : "draft";
}

function titleOf(data: DocumentData | undefined): string {
  const title = data?.title;
  return typeof title === "string" && title.trim() ? title.trim() : UNTITLED;
}

/** The one rule both the picker and the writer go by. */
function isOnOffer(standing: CourseStatus, readsDrafts: boolean): boolean {
  if (standing === PUBLISHED) return true;
  if (standing === ARCHIVED) return false;
  return readsDrafts;
}

/**
 * The picker's entries for one programme: every course this caller can pick,
 * by title, then the course already chosen if it is not one of them.
 *
 * The whole collection is read, with no filter and so no index: a site has a
 * handful of courses, and which of them this caller may see is decided here.
 */
export async function listCourseChoices(
  db: Firestore,
  chosenId: string | null,
  readsDrafts: boolean,
): Promise<CourseChoiceView[]> {
  const snap = await db.collection(COURSES_COLLECTION).select("title", "status").get();
  const offered: CourseChoiceView[] = [];
  let chosen: CourseChoiceView | null = null;
  let chosenSeen = false;
  for (const doc of snap.docs) {
    const data = doc.data();
    const standing = standingOf(data);
    const title = titleOf(data);
    if (isOnOffer(standing, readsDrafts)) {
      if (doc.id === chosenId) chosenSeen = true;
      offered.push({
        id: doc.id,
        label: standing === PUBLISHED ? title : `${title} (not published)`,
        standing,
        selectable: true,
      });
    } else if (doc.id === chosenId) {
      chosenSeen = true;
      // An archived course is readable by anybody signed in, so its title is
      // shown. A draft's is not, to somebody who could not open the draft.
      chosen = {
        id: doc.id,
        label: standing === ARCHIVED ? `${title} (archived)` : HIDDEN_DRAFT,
        standing,
        selectable: false,
      };
    }
  }
  if (chosenId !== null && !chosenSeen) {
    chosen = { id: chosenId, label: GONE, standing: "gone", selectable: false };
  }
  offered.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  return chosen ? [...offered, chosen] : offered;
}

/**
 * Is there a course with this id that this caller may tie a programme to?
 *
 * Read inside the caller's transaction, after it has decided the caller may
 * change the programme. One answer for "no such course" and "not yours to
 * pick", so the route says nothing about which ids exist.
 */
export async function courseOnOffer(
  tx: Transaction,
  db: Firestore,
  courseId: string,
  readsDrafts: boolean,
): Promise<boolean> {
  const snap = await tx.get(db.collection(COURSES_COLLECTION).doc(courseId));
  return snap.exists && isOnOffer(standingOf(snap.data()), readsDrafts);
}
