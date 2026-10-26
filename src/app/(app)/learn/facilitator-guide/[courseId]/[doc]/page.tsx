import Link from "next/link";
import { redirect } from "next/navigation";
import GuideDocumentView from "@/features/courses/facilitatorGuide/GuideDocumentView";
import { GuideHead, GuideRefused } from "@/features/courses/facilitatorGuide/GuideFrame";
import { PrintablesCard, PrintablesLink } from "@/features/courses/facilitatorGuide/PrintablesDownloads";
import styles from "@/features/courses/facilitatorGuide/guide.module.css";
import { facilitatorGuideReader } from "@/lib/courses/facilitatorGuide/access";
import {
  COURSE_DOCUMENT_LABEL,
  WEEK_PART_LABEL,
  facilitatorGuidePath,
  parseGuidePage,
  slotKey,
} from "@/lib/courses/facilitatorGuide/model";
import { printablesBySession, sectionsOfSession } from "@/lib/courses/facilitatorGuide/printables";
import { readSessionCount } from "@/lib/courses/facilitatorGuide/sessionCount";
import { readGuideIndex, readGuidePage } from "@/lib/courses/facilitatorGuide/store";
import {
  BACK_TO_GUIDE,
  BACK_TO_THE_GUIDE,
  FACILITATOR_GUIDE,
  GUIDE_NO_SUCH_PAGE,
  ON_THIS_PAGE,
  documentEmptyWords,
  guideForWeekWords,
  guideWeekEmptyWords,
  weekWords,
} from "@/lib/courses/facilitatorGuide/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * ONE PAGE OF A COURSE'S FACILITATOR GUIDE: a week (its session plan, then
 * its notes, as "Facilitator guide for week 3", the words of the ticket's
 * link on wk-fac-group), or one of the course's own documents (How to use
 * these plans, the Handbook, Case studies and feedback, Printables, its
 * templates drawn exactly as written, and Sessions and Week notes, the two
 * about every week at once).
 *
 * THE PRINTABLES AS PDFs: the Printables page carries a download for each
 * session that has something to print and one for the whole document (as
 * many sessions as the guide has weeks, `readSessionCount`); a week's page
 * carries its session's download beside its plan, when the printables have
 * something for that session. Both lead to the PDF route, behind this same
 * gate.
 *
 * WHO: the guide's gate (`src/lib/courses/facilitatorGuide/access.ts`), asked
 * before the address is even read: everybody it does not admit is given the
 * one calm answer (`GuideRefused`), whether or not the course or the page is
 * there. Somebody it admits is told plainly when a page has nothing in it.
 * Drawn on the server; what reaches the page is titles and blocks, never a
 * document as stored.
 */

export const dynamic = "force-dynamic";

export default async function FacilitatorGuidePage({ params }: { params: Promise<{ courseId: string; doc: string }> }) {
  const { courseId, doc: segment } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`${facilitatorGuidePath(courseId)}/${segment}`)}`);
  const db = getAdminDb();
  const reader = db ? await facilitatorGuideReader(db, user, courseId) : null;
  if (!db || !reader) return <GuideRefused />;

  const coursePath = facilitatorGuidePath(courseId);
  const back = { href: coursePath, label: BACK_TO_GUIDE };
  const page = parseGuidePage(segment);
  if (!page) {
    return (
      <div className={styles.page}>
        <GuideHead back={back} eyebrow={reader.courseTitle} heading={FACILITATOR_GUIDE} />
        <section className={`${styles.card} ${styles.empty}`} aria-label={FACILITATOR_GUIDE}>
          <p className={styles.cardLine}>{GUIDE_NO_SUCH_PAGE}</p>
        </section>
      </div>
    );
  }

  const documents = await readGuidePage(db, reader, page);
  const foot = (
    <div className={styles.foot}>
      <Link href={coursePath} className={styles.footLink}>
        {BACK_TO_THE_GUIDE}
      </Link>
    </div>
  );

  if (page.kind === "course") {
    const label = COURSE_DOCUMENT_LABEL[page.key];
    const doc = documents[0]?.doc ?? null;
    let downloads: { session: number; sections: number }[] | null = null;
    if (doc && page.key === "printables") {
      const index = await readGuideIndex(db, reader);
      const sessions = await readSessionCount(
        db,
        reader,
        index.weeks.map((week) => week.weekNumber),
      );
      downloads = printablesBySession(doc, sessions);
    }
    return (
      <div className={styles.page}>
        <GuideHead back={back} eyebrow={reader.courseTitle} heading={doc?.title || label} barTitle={label} />
        {downloads && <PrintablesCard courseId={courseId} sessions={downloads} />}
        {doc ? (
          <article className={styles.alone} aria-label={label}>
            <GuideDocumentView doc={doc} level={2} />
          </article>
        ) : (
          <section className={`${styles.card} ${styles.empty}`} aria-label={label}>
            <p className={styles.cardLine}>{documentEmptyWords(label)}</p>
          </section>
        )}
        {foot}
      </div>
    );
  }

  const heading = guideForWeekWords(page.weekNumber);
  // This session's printables, beside the first document the page shows (its
  // plan, or its notes when only those are loaded), when there is anything
  // to print for it. A week with something loaded is a week the guide has,
  // so the route takes its number.
  let printFor: number | null = null;
  if (documents.length > 0) {
    const [printables] = await readGuidePage(db, reader, { kind: "course", key: "printables" });
    if (printables && sectionsOfSession(printables.doc, page.weekNumber).length > 0) printFor = page.weekNumber;
  }
  return (
    <div className={styles.page}>
      <GuideHead back={back} eyebrow={reader.courseTitle} heading={heading} barTitle={weekWords(page.weekNumber)} />
      {documents.length === 0 ? (
        <section className={`${styles.card} ${styles.empty}`} aria-label={heading}>
          <p className={styles.cardLine}>{guideWeekEmptyWords(page.weekNumber)}</p>
        </section>
      ) : (
        <>
          {documents.length > 1 && (
            <nav className={styles.onThisPage} aria-label={ON_THIS_PAGE}>
              <p className={styles.onThisPageLabel}>{ON_THIS_PAGE}</p>
              {documents.map(({ slot }) => (
                <a key={slotKey(slot)} href={`#${slotKey(slot)}`} className={styles.jump}>
                  {slot.kind === "week" ? WEEK_PART_LABEL[slot.part] : ""}
                </a>
              ))}
            </nav>
          )}
          {documents.map(({ slot, doc }, index) => (
            <section key={slotKey(slot)} id={slotKey(slot)} className={styles.part} aria-labelledby={`${slotKey(slot)}-title`}>
              <p className={styles.partEyebrow}>{slot.kind === "week" ? WEEK_PART_LABEL[slot.part] : ""}</p>
              <h2 id={`${slotKey(slot)}-title`} className={styles.partTitle}>
                {doc.title}
              </h2>
              {index === 0 && printFor !== null && <PrintablesLink courseId={courseId} session={printFor} />}
              <GuideDocumentView doc={doc} level={3} />
            </section>
          ))}
        </>
      )}
      {foot}
    </div>
  );
}
