import Link from "next/link";
import { redirect } from "next/navigation";
import { GuideHead, GuideRefused } from "@/features/courses/facilitatorGuide/GuideFrame";
import styles from "@/features/courses/facilitatorGuide/guide.module.css";
import { facilitatorGuideReader } from "@/lib/courses/facilitatorGuide/access";
import { facilitatorGuidePath } from "@/lib/courses/facilitatorGuide/model";
import { readGuideIndex } from "@/lib/courses/facilitatorGuide/store";
import {
  EACH_WEEK,
  FACILITATOR_GUIDE,
  FOR_THE_WHOLE_COURSE,
  GUIDE_EMPTY,
  themeOf,
  weekWords,
} from "@/lib/courses/facilitatorGuide/words";
import { MY_PROGRAMMES } from "@/lib/courses/facilitatorPageWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { WEEK_PART_LABEL } from "@/lib/courses/facilitatorGuide/model";

/**
 * A COURSE'S FACILITATOR GUIDE: every week that has its session plan or its
 * notes loaded, and the course's own documents (How to use these plans, the
 * Handbook, Case studies and feedback, Printables), each a way to its page.
 * Titles only: the words are on the pages.
 *
 * WHO: the guide's gate (`src/lib/courses/facilitatorGuide/access.ts`): a
 * facilitator of a live group on a run of the course, the lead of a
 * programme that names a run of it, and admins. Everybody else, and a course
 * that is not there, is given the one calm answer (`GuideRefused`), never a
 * redirect that says something exists. Drawn on the server; nothing on it is
 * a document as stored.
 */

export const dynamic = "force-dynamic";

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.rowArrow}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export default async function FacilitatorGuideCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(facilitatorGuidePath(courseId))}`);
  const db = getAdminDb();
  const reader = db ? await facilitatorGuideReader(db, user, courseId) : null;
  if (!db || !reader) return <GuideRefused />;

  const index = await readGuideIndex(db, reader);
  const empty = index.documents.length === 0 && index.weeks.length === 0;

  return (
    <div className={styles.page}>
      <GuideHead back={{ href: "/learn", label: MY_PROGRAMMES }} eyebrow={index.courseTitle} heading={FACILITATOR_GUIDE} />

      {empty ? (
        <section className={`${styles.card} ${styles.empty}`} aria-label={FACILITATOR_GUIDE}>
          <p className={styles.cardLine}>{GUIDE_EMPTY}</p>
        </section>
      ) : (
        <div className={styles.columns}>
          {index.weeks.length > 0 && (
            <section className={`${styles.colMain} ${styles.card}`} aria-labelledby="guide-weeks">
              <h2 id="guide-weeks" className={styles.cardTitle}>
                {EACH_WEEK}
              </h2>
              <ul className={styles.rows}>
                {index.weeks.map((week) => {
                  const theme = themeOf(week.plan) || themeOf(week.notes);
                  const parts = [week.plan !== null ? WEEK_PART_LABEL.plan : null, week.notes !== null ? WEEK_PART_LABEL.notes : null]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={week.weekNumber}>
                      <Link href={facilitatorGuidePath(courseId, { kind: "week", weekNumber: week.weekNumber })} className={styles.row}>
                        <span className={styles.rowText}>
                          <span className={styles.rowTitle}>{theme ? `${weekWords(week.weekNumber)}: ${theme}` : weekWords(week.weekNumber)}</span>
                          <span className={styles.rowDetail}>{parts}</span>
                        </span>
                        <ArrowIcon />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {index.documents.length > 0 && (
            <section className={`${styles.colSide} ${styles.card}`} aria-labelledby="guide-course">
              <h2 id="guide-course" className={styles.cardTitle}>
                {FOR_THE_WHOLE_COURSE}
              </h2>
              <ul className={styles.rows}>
                {index.documents.map((doc) => (
                  <li key={doc.key}>
                    <Link href={facilitatorGuidePath(courseId, { kind: "course", key: doc.key })} className={styles.row}>
                      <span className={styles.rowText}>
                        <span className={styles.rowTitle}>{doc.label}</span>
                        {doc.title && doc.title !== doc.label && <span className={styles.rowDetail}>{doc.title}</span>}
                      </span>
                      <ArrowIcon />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
