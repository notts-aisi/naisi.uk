import Link from "next/link";
import type { CoursePageTheme } from "@/lib/firestore/coursePages";
import SectionHead from "@/features/programmes/SectionHead";
import styles from "./WeeklyThemes.module.css";

/**
 * The week-by-week shape of the programme, as AUTHORED copy.
 *
 * A visitor deciding whether to spend six weeks on this does not want
 * fourteen expandable rows of reading links, they want to know what week 3
 * is ABOUT. The real material is still one click away on the sample week and
 * on each week's public page; this list is the pitch.
 *
 * `weeklyThemes` is generated from a template snapshot or a run's published
 * weeks (`POST /api/courses/[courseId]/page/generate-themes`) and then edited,
 * so it starts truthful and stays the author's.
 *
 * A course whose page stores no themes yet says so in one line, in the place
 * the list would be. It never shows a made-up week.
 *
 * Titles and blurbs are TEXT NODES. See `CourseFactsRail` for the rule.
 *
 * A theme whose week is PUBLISHED links to that week's page. The list is the
 * pitch and the week pages are the evidence for it. A week with no published
 * page stays plain text and never becomes a link to a 404.
 */

type Props = {
  themes: CoursePageTheme[];
  /** The course, for the week links. */
  courseId: string;
  /**
   * The week numbers with a public page, from the same published-only fetcher
   * the week pages use. Anything absent renders as plain text, so this list is
   * what stops the pitch linking at a 404.
   */
  publishedWeeks?: number[];
  /**
   * The pre-start note: the plan is the core content, a facilitator may tweak
   * their group's week, and reading ahead is welcome. Rendered under the list
   * because it qualifies what the list is, so it is left out with the list.
   */
  note?: string;
  /** Where the curriculum comes from, when the page has that to say. */
  credit?: string;
};

export default function WeeklyThemes({
  themes,
  courseId,
  publishedWeeks = [],
  note,
  credit,
}: Props) {
  const published = new Set(publishedWeeks);

  return (
    <>
      <SectionHead
        id="weekly-themes-heading"
        eyebrow="The weeks"
        title="What you’ll do."
        lede={
          themes.length > 0
            ? "There’s a new theme each week. You read about it, then talk it through with your group."
            : undefined
        }
      />
      {themes.length > 0 ? (
        <ol className={styles.list}>
          {themes.map((theme) => {
            const title = theme.title || "To be confirmed";
            const href = published.has(theme.weekNumber)
              ? `/courses/${encodeURIComponent(courseId)}/weeks/${theme.weekNumber}`
              : null;
            return (
              <li key={theme.weekNumber} className={styles.item}>
                <span className={`meta ${styles.week}`}>Week {theme.weekNumber}</span>
                <div className={styles.body}>
                  {/* The heading stays the heading and the link sits INSIDE it,
                      so the outline a screen reader builds is unchanged and the
                      link text is the week's own title, not "read more". The
                      week number is named in the accessible name too: out of
                      the list's visual order, "Goal misgeneralisation" alone
                      does not say which week it is. */}
                  <h3 className={styles.title}>
                    {href ? (
                      <Link
                        href={href}
                        className={styles.titleLink}
                        aria-label={`Week ${theme.weekNumber}: ${title}`}
                      >
                        {title}
                      </Link>
                    ) : (
                      title
                    )}
                  </h3>
                  {theme.blurb ? <p className={styles.blurb}>{theme.blurb}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.coming}>Curriculum coming shortly.</p>
      )}
      {themes.length > 0 && note ? <p className={styles.note}>{note}</p> : null}
      {credit ? <p className={styles.note}>{credit}</p> : null}
    </>
  );
}
