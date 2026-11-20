import Link from "next/link";
import { redirect } from "next/navigation";
import { GuideHead, GuideRefused } from "@/features/courses/facilitatorGuide/GuideFrame";
import styles from "@/features/courses/facilitatorGuide/guide.module.css";
import { facilitatorGuidePath } from "@/lib/courses/facilitatorGuide/model";
import { FACILITATOR_GUIDES, facilitatingCourses, youFacilitateWords } from "@/lib/courses/facilitatingMenu";
import { facilitatingGroupsOf } from "@/lib/courses/facilitatingMenuRead";
import { MY_PROGRAMMES } from "@/lib/courses/facilitatorPageWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeCourse } from "@/lib/firestore/courses";

/**
 * THE SHORT LIST OF FACILITATOR GUIDES: one row per course the caller
 * facilitates a group on, each the way to that course's guide, with the
 * groups under it. The menu's Facilitator guide opens here for somebody
 * facilitating on two courses or more; with one course it opens that
 * course's guide straight away.
 *
 * WHO: the menu's own rule (`src/lib/courses/facilitatingMenu.ts`): a
 * facilitator of a live group of a live run, the account standing behind the
 * role. Everybody else, an admin who facilitates nothing among them, is given
 * the guide's own one calm sentence (`GuideRefused`), never a redirect and
 * never the not-found screen. Each guide the list leads to asks its own gate
 * again (`src/lib/courses/facilitatorGuide/access.ts`), which admits every
 * facilitator this list does.
 *
 * READS: only the caller's own: their groups (one query on their uid), those
 * groups' runs, and those runs' courses, each by its address. Nothing of any
 * guide is read here. Drawn on the server.
 */

export const dynamic = "force-dynamic";

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.rowArrow}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export default async function FacilitatorGuidesPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/learn/facilitator-guide")}`);
  const db = getAdminDb();
  if (!db) return <GuideRefused />;

  const groups = await facilitatingGroupsOf(db, user).catch(() => []);
  const courses = facilitatingCourses(groups);
  // Each course read again, as the guide's gate reads it: one that is gone or
  // being destroyed is left out, and its title is the course's own.
  const snaps = courses.length > 0 ? await db.getAll(...courses.map((course) => db.collection("courses").doc(course.courseId))) : [];
  const rows = courses.flatMap((course, index) => {
    const snap = snaps[index];
    const raw = snap?.exists ? (snap.data() ?? {}) : null;
    if (!raw || raw.destroying === true) return [];
    const title = normalizeCourse(snap.id, raw).title.trim() || course.courseTitle;
    const names = groups.filter((group) => group.courseId === course.courseId).map((group) => group.name);
    return [{ courseId: course.courseId, title, detail: youFacilitateWords(names) }];
  });
  if (rows.length === 0) return <GuideRefused />;

  return (
    <div className={styles.page}>
      <GuideHead back={{ href: "/learn", label: MY_PROGRAMMES }} eyebrow="" heading={FACILITATOR_GUIDES} readers={false} />
      <section className={styles.card} aria-label={FACILITATOR_GUIDES}>
        <ul className={styles.rows}>
          {rows.map((row) => (
            <li key={row.courseId}>
              <Link href={facilitatorGuidePath(row.courseId)} className={styles.row}>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{row.title}</span>
                  {row.detail && <span className={styles.rowDetail}>{row.detail}</span>}
                </span>
                <ArrowIcon />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
