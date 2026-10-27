import Link from "next/link";
import FacilitatorGuideLoader, { type LoaderSlot } from "@/features/courses/facilitatorGuide/FacilitatorGuideLoader";
import styles from "@/features/courses/facilitatorGuide/FacilitatorGuideLoader.module.css";
import { facilitatorGuideReader } from "@/lib/courses/facilitatorGuide/access";
import { guideSlots, slotKey, slotLabel } from "@/lib/courses/facilitatorGuide/model";
import { readGuideIndex } from "@/lib/courses/facilitatorGuide/store";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPage } from "@/lib/firebase/pageGates";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * WHERE AN ADMIN LOADS A COURSE'S FACILITATOR GUIDE: each week's session
 * plan and notes, and the course's own documents (How to use these plans,
 * the Handbook, Case studies and feedback, Printables, and Sessions and Week
 * notes, the two about every week at once), pasted one at a time as the
 * course docs export them.
 *
 * ADMINS ONLY (Q39: an admin loads the course material, for now). The
 * course authoring tree around this page also admits course drafters and
 * approvers, so this page asks again and sends anybody else to the
 * dashboard, as the admin-only pages do. The route behind the card refuses
 * them too. In a view-as session the admin area draws its notice instead of
 * this page.
 *
 * THE WEEKS offered are the course's own: as many as the longest week plan
 * of its runs, and never fewer than a week already loaded. Nothing about a
 * term is written here.
 *
 * Drawn under the Courses section's own heading, so its heading is a level
 * down.
 */

export const dynamic = "force-dynamic";

export default async function FacilitatorGuideAdminPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requireAdminPage();
  const { courseId } = await params;
  const db = getAdminDb();
  const courseHref = `/admin/courses/${encodeURIComponent(courseId)}`;
  const reader = db ? await facilitatorGuideReader(db, user, courseId) : null;

  if (!db || !reader) {
    return (
      <div className={styles.page}>
        <Link href="/admin/courses" className={styles.back}>
          ← Courses
        </Link>
        <h2 className={styles.heading}>There is no such course</h2>
        <p className={styles.intro}>Open the course from the list of courses.</p>
      </div>
    );
  }

  const [index, runs] = await Promise.all([
    readGuideIndex(db, reader),
    db.collection("courseRuns").where("courseId", "==", courseId).get(),
  ]);
  const runWeeks = runs.docs.map(
    (doc) => normalizeCourseRun(doc.id, doc.data() ?? {}).weekPlan.filter((entry) => entry.kind === "week").length,
  );
  const weeks = Math.max(0, ...runWeeks, ...index.weeks.map((week) => week.weekNumber));
  const loaded = new Map<string, string>();
  for (const doc of index.documents) loaded.set(doc.key, doc.title);
  for (const week of index.weeks) {
    if (week.plan !== null) loaded.set(slotKey({ kind: "week", weekNumber: week.weekNumber, part: "plan" }), week.plan);
    if (week.notes !== null) loaded.set(slotKey({ kind: "week", weekNumber: week.weekNumber, part: "notes" }), week.notes);
  }
  const slots: LoaderSlot[] = guideSlots(weeks).map((slot) => ({
    key: slotKey(slot),
    label: slotLabel(slot),
    loaded: loaded.get(slotKey(slot)) ?? null,
  }));

  return (
    <div className={styles.page}>
      <Link href={courseHref} className={styles.back}>
        ← {reader.courseTitle || "The course"}
      </Link>
      <div>
        <p className={styles.eyebrow}>{reader.courseTitle}</p>
        <h2 className={styles.heading}>Facilitator guide</h2>
        <p className={styles.intro}>
          Only the course’s facilitators, its programme’s lead and admins can read it. Nothing here is ever shown to
          anybody taking part, and nothing here goes in a week, which anyone signed in can read.
          {weeks === 0 ? " The weeks come from the course’s runs: give a run its week plan to load a week’s plan and notes." : ""}
        </p>
      </div>
      <FacilitatorGuideLoader courseId={courseId} slots={slots} />
    </div>
  );
}
