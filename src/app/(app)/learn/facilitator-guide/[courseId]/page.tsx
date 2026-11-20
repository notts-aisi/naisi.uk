import Link from "next/link";
import { redirect } from "next/navigation";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import { GuideHead, GuideRefused } from "@/features/courses/facilitatorGuide/GuideFrame";
import styles from "@/features/courses/facilitatorGuide/guide.module.css";
import { facilitatorGuideReader } from "@/lib/courses/facilitatorGuide/access";
import { facilitatorGuidePath, isWeeksAtAGlance } from "@/lib/courses/facilitatorGuide/model";
import { groupPagePath, homeGroupOf, nextGuideSession } from "@/lib/courses/facilitatorGuide/nextSession";
import { readGuideIndex, type GuideIndexDocument } from "@/lib/courses/facilitatorGuide/store";
import { aLeadLoadsGuide, groupsOfReader, readUnloadedWeeks } from "@/lib/courses/facilitatorGuide/weekRows";
import {
  EACH_WEEK,
  FACILITATOR_GUIDE,
  FOR_THE_WHOLE_COURSE,
  GROUP_FALLBACK,
  NOT_LOADED_YET,
  YOUR_NEXT_SESSION,
  backToGroupWords,
  guideEmptyWords,
  guideWeekNotLoadedHereWords,
  nextSessionLineWords,
  openWeekPlanWords,
  themeOf,
  weekTitleWords,
} from "@/lib/courses/facilitatorGuide/words";
import { MY_PROGRAMMES, ticketHeading } from "@/lib/courses/facilitatorPageWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { WEEK_PART_LABEL } from "@/lib/courses/facilitatorGuide/model";

/**
 * A COURSE'S FACILITATOR GUIDE: every week that has its session plan or its
 * notes loaded, and the course's own documents (How to use these plans, the
 * Handbook, Case studies and feedback, Printables), each a way to its page.
 * The two documents about every week at once, Sessions and Week notes, head
 * "Each week", above the weeks themselves (`WEEKS_AT_A_GLANCE`). Titles only:
 * the words are on the pages.
 *
 * WHO: the guide's gate (`src/lib/courses/facilitatorGuide/access.ts`): a
 * facilitator of a live group on a run of the course, the lead of a
 * programme that names a run of it, and admins. Everybody else, and a course
 * that is not there, is given the one calm answer (`GuideRefused`), never a
 * redirect that says something exists. Drawn on the server; nothing on it is
 * a document as stored.
 *
 * THE READER'S OWN GROUP, for a facilitator alone (an admin who facilitates
 * too): a card at the top, "Your next session", with the week the group
 * meets for next, the group, its day and clock, and the way to that week's
 * plan (or, with the week not loaded, a sentence saying so and who loads
 * it); and the way back at the top leads to that group. With two groups on
 * the course, the one that meets next. After the group's last session, no
 * card. The groups are the ones the gate read to let the reader in
 * (`groupsOfReader`), so a facilitator's card costs no read; the session is
 * the one resolver's, so a moved week is on its new day and an evening
 * called off is never "next".
 *
 * A WEEK WITH NOTHING LOADED is listed among the weeks, "Not loaded yet",
 * with its theme as the members of the reader's group read it, and only once
 * it is published to them (`readUnloadedWeeks`: the one week overlay, two
 * queries, or none for a course whose every week is loaded). Nothing loaded at all: one sentence saying so and who loads it,
 * the programme's lead or an admin, never by name, since a course can be
 * named by two programmes.
 */

export const dynamic = "force-dynamic";

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.rowArrow}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** One of the course's own documents, as a row: its label, and its own title under it when that says more. */
function DocumentRow({ courseId, doc }: { courseId: string; doc: GuideIndexDocument }) {
  return (
    <li>
      <Link href={facilitatorGuidePath(courseId, { kind: "course", key: doc.key })} className={styles.row}>
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{doc.label}</span>
          {doc.title && doc.title !== doc.label && <span className={styles.rowDetail}>{doc.title}</span>}
        </span>
        <ArrowIcon />
      </Link>
    </li>
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
  const atAGlance = index.documents.filter((doc) => isWeeksAtAGlance(doc.key));
  const wholeCourse = index.documents.filter((doc) => !isWeeksAtAGlance(doc.key));

  // The reader's own groups on the course, the one they meet with next, and
  // the group the way back leads to.
  const now = new Date();
  const groups = await groupsOfReader(db, user, reader);
  const next = nextGuideSession(groups, now);
  const home = homeGroupOf(groups, now);
  const back = home ? { href: groupPagePath(home), label: home.name.trim() || GROUP_FALLBACK } : { href: "/learn", label: MY_PROGRAMMES };

  const loadedWeeks = index.weeks.map((week) => week.weekNumber);
  // A read that fails lists the loaded weeks alone, as the page always has.
  const unloaded = empty ? [] : await readUnloadedWeeks(db, reader, { loadedWeeks, groups, themeGroup: home }).catch(() => []);
  const rows = [
    ...index.weeks.map((week) => ({
      weekNumber: week.weekNumber,
      title: weekTitleWords(week.weekNumber, themeOf(week.plan) || themeOf(week.notes)),
      detail: [week.plan !== null ? WEEK_PART_LABEL.plan : null, week.notes !== null ? WEEK_PART_LABEL.notes : null].filter(Boolean).join(" · "),
    })),
    ...unloaded.map((week) => ({ weekNumber: week.weekNumber, title: weekTitleWords(week.weekNumber, week.theme), detail: NOT_LOADED_YET })),
  ].sort((a, b) => a.weekNumber - b.weekNumber);

  // The card: the week the reader's group meets for next. Who loads the
  // guide is read only when a sentence says it.
  const nextWeek = next && !empty ? next.session.weekNumber : null;
  const nextLoaded = nextWeek !== null && loadedWeeks.includes(nextWeek);
  const needsLoader = empty || (nextWeek !== null && !nextLoaded);
  const aLeadStands = needsLoader ? await aLeadLoadsGuide(db, reader) : false;
  const card =
    next && nextWeek !== null
      ? {
          title: rows.find((row) => row.weekNumber === nextWeek)?.title ?? weekTitleWords(nextWeek, ""),
          line: nextSessionLineWords(next.group.name.trim() || GROUP_FALLBACK, ticketHeading(next.session.dateKey, next.session.startTimeLocal)),
          href: nextLoaded ? facilitatorGuidePath(courseId, { kind: "week", weekNumber: nextWeek }) : null,
          button: openWeekPlanWords(nextWeek),
          sentence: nextLoaded ? null : guideWeekNotLoadedHereWords(nextWeek, aLeadStands),
        }
      : null;

  return (
    <div className={styles.page}>
      <GuideHead back={back} eyebrow={index.courseTitle} heading={FACILITATOR_GUIDE} />

      {card && (
        <section className={`${styles.card} ${styles.next}`} aria-labelledby="guide-next">
          <p className={styles.nextEyebrow}>{YOUR_NEXT_SESSION}</p>
          <h2 id="guide-next" className={styles.nextTitle}>
            {card.title}
          </h2>
          <p className={styles.nextLine}>{card.line}</p>
          {card.href ? (
            <Link href={card.href} className={facilitator.buttonPrimary}>
              {card.button}
            </Link>
          ) : (
            card.sentence && <p className={styles.nextSentence}>{card.sentence}</p>
          )}
        </section>
      )}

      {empty ? (
        <>
          <section className={`${styles.card} ${styles.empty}`} aria-label={FACILITATOR_GUIDE}>
            <p className={styles.cardLine}>{guideEmptyWords(aLeadStands)}</p>
          </section>
          {home && (
            <div className={styles.foot}>
              <Link href={groupPagePath(home)} className={styles.footLink}>
                {backToGroupWords(home.name)}
              </Link>
            </div>
          )}
        </>
      ) : (
        <div className={styles.columns}>
          {(atAGlance.length > 0 || rows.length > 0) && (
            <section className={`${styles.colMain} ${styles.card}`} aria-labelledby="guide-weeks">
              <h2 id="guide-weeks" className={styles.cardTitle}>
                {EACH_WEEK}
              </h2>
              <ul className={styles.rows}>
                {atAGlance.map((doc) => (
                  <DocumentRow key={doc.key} courseId={courseId} doc={doc} />
                ))}
                {rows.map((row) => (
                  <li key={row.weekNumber}>
                    <Link href={facilitatorGuidePath(courseId, { kind: "week", weekNumber: row.weekNumber })} className={styles.row}>
                      <span className={styles.rowText}>
                        <span className={styles.rowTitle}>{row.title}</span>
                        <span className={styles.rowDetail}>{row.detail}</span>
                      </span>
                      <ArrowIcon />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {wholeCourse.length > 0 && (
            <section className={`${styles.colSide} ${styles.card}`} aria-labelledby="guide-course">
              <h2 id="guide-course" className={styles.cardTitle}>
                {FOR_THE_WHOLE_COURSE}
              </h2>
              <ul className={styles.rows}>
                {wholeCourse.map((doc) => (
                  <DocumentRow key={doc.key} courseId={courseId} doc={doc} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
