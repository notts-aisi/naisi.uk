import Link from "next/link";
import PangramWeek from "@/features/courses/courseworkClaude/PangramWeek";
import type { WeekReviewView } from "@/lib/courses/weekReview/view";
import { REVIEW_WORDS } from "@/lib/courses/weekReview/words";
import { weeksPath } from "@/lib/courses/weeksTab/paths";
import FollowUpButton from "./FollowUpButton";
import ReviewPress from "./ReviewPress";
import styles from "./weekReview.module.css";

/**
 * ONE WEEK'S REVIEW, FOR AN ADMIN (privacy v15: what Claude returns is seen
 * by admins only): what a press would send, then Claude's draft grades as a
 * chart with the strongest and weakest to read, what people found hard with
 * where each came from, who might need a hand (the site's own records beside
 * Claude's picks, each line saying which), Pangram on the week, and what was
 * sent. Drawn on the server from `loadWeekReview`; the presses are the only
 * client parts, and they are handed ids and words.
 *
 * Grades only ever order reading here: no grade is shown anywhere a member,
 * a lead or a facilitator reads, and none is kept on anybody's record.
 *
 * Not drawn, for a later change: a way to schedule an explainer from a theme,
 * and Claude's grade beside the team's own rating of an answer.
 */

type Props = {
  view: WeekReviewView;
  roundId: string;
  programmeId: string;
  programmeName: string;
  /** Every reviewed person's name by account, for Pangram's panel. */
  names: Readonly<Record<string, string>>;
  /** Which list of answers to show under the chart, from the address. */
  read: "strongest" | "weakest" | null;
};

export default function WeekReviewScreen({ view, roundId, programmeId, programmeName, names, read }: Props) {
  const base = `${weeksPath(roundId, programmeId, view.weekId)}/review`;
  const coursework = `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/coursework`;
  const asked = view.askedLine !== null;
  const subline = [view.weekTitle, view.groupsLine, view.firstDay].filter(Boolean).join(" · ");
  const press = { roundId, programmeId, weekId: view.weekId, seen: view.sending.seen };

  return (
    <section className={styles.page} aria-labelledby="week-review-title">
      <header className={styles.head}>
        <div className={styles.headText}>
          <p className={styles.crumbs}>
            <Link href={weeksPath(roundId, programmeId, view.weekId)} className={styles.crumbLink}>
              {programmeName} / {REVIEW_WORDS.eyebrow}
            </Link>
          </p>
          <div className={styles.titleRow}>
            <h2 id="week-review-title" className={styles.title}>
              {REVIEW_WORDS.title(view.weekNumber)}
            </h2>
            <span className={styles.chip}>{REVIEW_WORDS.whoSees}</span>
          </div>
          {subline && <p className={styles.subline}>{subline}</p>}
        </div>
        {view.reviewable && (
          <div className={styles.headActions}>
            <a href="#pangram" className={styles.linkButton}>
              {REVIEW_WORDS.checkPangram}
            </a>
            {view.claude && !view.sending.nothing && (
              <ReviewPress {...press} label={asked ? REVIEW_WORDS.pressAgain : REVIEW_WORDS.press} primary />
            )}
          </div>
        )}
      </header>

      {!view.reviewable ? (
        <p className={styles.line}>{REVIEW_WORDS.notYet(view.weekNumber)}</p>
      ) : (
        <>
          <div className={styles.sending} aria-label={REVIEW_WORDS.wouldSend}>
            <p className={styles.counts}>{view.sending.counts}</p>
            {view.askedLine && <p className={styles.asked}>{view.askedLine}</p>}
          </div>
          <div className={styles.notes}>
            {!view.claude && <p className={styles.line}>{REVIEW_WORDS.notSetUp}</p>}
            {view.sending.nothing && <p className={styles.line}>{REVIEW_WORDS.nothingToSend}</p>}
            {view.sending.leftOut && <p className={styles.line}>{view.sending.leftOut}</p>}
            {view.claude && !view.sending.nothing && <p className={styles.line}>{REVIEW_WORDS.threeRequests}</p>}
          </div>

          <div className={styles.columns}>
            <section className={styles.card} aria-labelledby="review-grades">
              <div className={styles.cardHead}>
                <h3 id="review-grades" className={styles.cardTitle}>
                  {REVIEW_WORDS.gradesTitle}
                </h3>
                <span className={styles.chip}>{REVIEW_WORDS.gradesTag}</span>
              </div>
              <Grades view={view} base={base} read={read} press={press} />
            </section>

            <section className={styles.card} aria-labelledby="review-themes">
              <div className={styles.cardHead}>
                <h3 id="review-themes" className={styles.cardTitle}>
                  {REVIEW_WORDS.themesTitle}
                </h3>
              </div>
              <Themes view={view} press={press} />
            </section>
          </div>

          <section className={styles.card} aria-labelledby="review-hands">
            <div className={styles.cardHead}>
              <h3 id="review-hands" className={styles.cardTitle}>
                {REVIEW_WORDS.handsTitle}
              </h3>
              {view.rows.length > 0 && <span className={styles.count}>{REVIEW_WORDS.handsCount(view.rows.length)}</span>}
            </div>
            <PartLine part={view.hands} press={press} which="hands" />
            {view.rows.length === 0 ? (
              <p className={styles.line}>{REVIEW_WORDS.handsNone}</p>
            ) : (
              <ul className={styles.hands}>
                {view.rows.map((row) => (
                  <li key={row.uid} className={styles.hand}>
                    <div className={styles.handText}>
                      <p className={styles.handName}>
                        <strong>{row.name}</strong>
                        {row.group && <span className={styles.muted}> · {row.group}</span>}
                      </p>
                      <ul className={styles.handLines}>
                        {row.lines.map((line, index) => (
                          <li key={index} className={styles.handLine}>
                            <span>{line.text}</span> <span className={styles.source}>· {line.source}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className={styles.handActions}>
                      {row.asked ? (
                        <p className={styles.asked}>{row.asked}</p>
                      ) : row.ask ? (
                        <FollowUpButton roundId={roundId} programmeId={programmeId} weekId={view.weekId} uid={row.uid} label={row.ask} />
                      ) : (
                        <p className={styles.muted}>{REVIEW_WORDS.noFacilitator}</p>
                      )}
                      <Link href={row.page} className={styles.inlineLink}>
                        {REVIEW_WORDS.openPage(row.name.split(/\s+/)[0] || row.name)}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.line}>{REVIEW_WORDS.handsLine}</p>
            {view.rows.some((row) => row.ask && !row.asked) && <p className={styles.line}>{REVIEW_WORDS.handsAsk}</p>}
          </section>

          <section id="pangram" className={styles.card} aria-label={REVIEW_WORDS.pangramTitle}>
            <PangramWeek roundId={roundId} programmeId={programmeId} weekId={view.weekId} names={names} personBase={coursework} />
          </section>

          <p className={styles.foot}>{REVIEW_WORDS.foot}</p>
        </>
      )}
    </section>
  );
}

type Press = { roundId: string; programmeId: string; weekId: string; seen: string };

/** A part's own state: failed with its reason and a way to ask again, or out of date. */
function PartLine({
  part,
  press,
  which,
}: {
  part: WeekReviewView["grades"] | WeekReviewView["themes"] | WeekReviewView["hands"];
  press: Press;
  which: "grades" | "themes" | "hands";
}) {
  if (part.state === "failed") {
    return (
      <div className={styles.partLine}>
        <p className={styles.problem}>{REVIEW_WORDS.partFailed(part.reason)}</p>
        <ReviewPress {...press} part={which} label={REVIEW_WORDS.askPartAgain} />
      </div>
    );
  }
  if (part.state === "ready" && part.outOfDate) return <p className={styles.warning}>{REVIEW_WORDS.partOutOfDate}</p>;
  return null;
}

function Grades({ view, base, read, press }: { view: WeekReviewView; base: string; read: Props["read"]; press: Press }) {
  const grades = view.grades;
  if (grades.state !== "ready") {
    return (
      <>
        <PartLine part={grades} press={press} which="grades" />
        {grades.state === "none" && <p className={styles.line}>{REVIEW_WORDS.notAsked}</p>}
        <p className={styles.line}>{REVIEW_WORDS.gradesLine}</p>
      </>
    );
  }
  const most = Math.max(1, ...grades.bars.map((bar) => bar.count));
  const list = read === "strongest" ? grades.strongest : read === "weakest" ? grades.weakest : null;
  return (
    <>
      <PartLine part={grades} press={press} which="grades" />
      {grades.graded === 0 ? (
        <p className={styles.line}>{REVIEW_WORDS.gradesNone}</p>
      ) : (
        <ol className={styles.chart} aria-label={REVIEW_WORDS.gradesTitle}>
          {grades.bars.map((bar) => (
            <li key={bar.grade} className={styles.bar} aria-label={REVIEW_WORDS.gradeBar(bar.grade, bar.count)}>
              <span className={styles.barGrade} aria-hidden="true">
                {bar.grade}
              </span>
              <span className={styles.barTrack} aria-hidden="true">
                <span className={styles.barFill} style={{ width: `${(bar.count / most) * 100}%` }} />
              </span>
              <span className={styles.barCount} aria-hidden="true">
                {bar.count}
              </span>
            </li>
          ))}
        </ol>
      )}
      {grades.changed && <p className={styles.line}>{grades.changed}</p>}
      <p className={styles.line}>{REVIEW_WORDS.gradesLine}</p>
      {grades.graded > 0 && (
        <div className={styles.row}>
          <Link href={`${base}?read=strongest#review-grades`} className={styles.linkButton} aria-current={read === "strongest" ? "true" : undefined}>
            {REVIEW_WORDS.strongest(grades.strongest.length)}
          </Link>
          <Link href={`${base}?read=weakest#review-grades`} className={styles.linkButton} aria-current={read === "weakest" ? "true" : undefined}>
            {REVIEW_WORDS.weakest(grades.weakest.length)}
          </Link>
        </div>
      )}
      {list && (
        <div className={styles.readList}>
          <h4 className={styles.listTitle}>{read === "strongest" ? REVIEW_WORDS.strongestTitle : REVIEW_WORDS.weakestTitle}</h4>
          <ol className={styles.answers}>
            {list.map((entry) => (
              <li key={entry.key} className={styles.answer}>
                <Link href={entry.href} className={styles.inlineLink}>
                  {entry.name}
                </Link>
                <span className={styles.muted}>
                  {[entry.group, entry.question, REVIEW_WORDS.gradeOf(entry.grade)].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ol>
          <Link href={`${base}#review-grades`} className={styles.inlineLink}>
            {REVIEW_WORDS.hideList}
          </Link>
        </div>
      )}
    </>
  );
}

function Themes({ view, press }: { view: WeekReviewView; press: Press }) {
  const themes = view.themes;
  if (themes.state !== "ready") {
    return (
      <>
        <PartLine part={themes} press={press} which="themes" />
        {themes.state === "none" && <p className={styles.line}>{REVIEW_WORDS.notAsked}</p>}
      </>
    );
  }
  return (
    <>
      <PartLine part={themes} press={press} which="themes" />
      {themes.list.length === 0 ? (
        <p className={styles.line}>{REVIEW_WORDS.themesNone}</p>
      ) : (
        <ul className={styles.themes}>
          {themes.list.map((theme, index) => (
            <li key={index} className={styles.theme}>
              <p className={styles.themeTitle}>{theme.title}</p>
              {theme.part && <p className={styles.muted}>{theme.part}</p>}
              <p className={styles.themeFrom}>{theme.from}</p>
              {theme.detail && <p className={styles.line}>{theme.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
