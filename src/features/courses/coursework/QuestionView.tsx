import Link from "next/link";
import type { QuestionRow, QuestionView as View } from "@/lib/courses/coursework/questionLoad";
import {
  ADD_FEEDBACK,
  ANSWER_STATE_WORDS,
  CHANGED_SINCE_FEEDBACK,
  EVERYBODY,
  FACILITATING,
  GROUP,
  NEXT_QUESTION,
  NOBODY_HERE,
  NOBODY_TO_READ,
  NOT_READ_YET,
  NOT_TOLD_YET,
  NOTHING_TO_WRITE_THIS_WEEK,
  NOTHING_WRITTEN_YET,
  ONE_QUESTION_TITLE,
  PREVIOUS_AND_NEXT_QUESTION,
  PREVIOUS_QUESTION,
  RATE,
  SEE_WHAT_CHANGED,
  SHOW_WHOSE_ANSWERS,
  WAITING_FOR_FEEDBACK,
  backToWords,
  openWeekWords,
  questionOfWords,
  readingEyebrowWords,
  sentWhenWords,
  weekHeadingWords,
} from "@/lib/courses/coursework/words";
import { PICK_LINES_TO_READ_OUT } from "@/lib/courses/facilitatorWeek/words";
import { FEEDBACK_HINT, YOUR_FEEDBACK } from "@/lib/courses/feedback/words";
import { THE_QUESTION_WHEN_WRITTEN } from "@/lib/courses/weekEdit/wordsThen";
import { AFTER_ITS_DEADLINE, AS_IT_STOOD_AT_THE_SESSION, JOINED_LATE, LATE, staffChangedWords } from "@/lib/courses/weekWork/words";
import { YOUR_RATING } from "@/lib/courses/workRatings/words";
import { NOT_SENT_YET, theQuestionWords } from "@/lib/courses/writtenAnswerWords";
import EarlierVersion from "../feedback/EarlierVersion";
import FeedbackWriter from "../feedback/FeedbackWriter";
import StaffFeedbackCards from "../feedback/StaffFeedbackCards";
import EarlierWording from "../weekBlocks/EarlierWording";
import RatingForTheTeam from "../written/RatingForTheTeam";
import MarkFirstRead from "./MarkFirstRead";
import { Late, Words } from "./ReadingView";
import ViewSwitch from "./ViewSwitch";
import tab from "./coursework.module.css";
import styles from "./reading.module.css";

/**
 * ONE QUESTION, THE WHOLE GROUP: one question of a week, asked once at the
 * top, with every person of one group this reader may read and their answer
 * to it IN FULL, in the group's order (`loadGroupQuestion`, reached from the
 * programme's side and the group's). Each answer says, at a glance and apart,
 * whether anybody on the team has opened it ("Not read yet") and where its
 * feedback stands ("No feedback yet", "Feedback given", "Changed since
 * feedback"); filters keep either, both, or the late ones, each with its
 * count. Beside a written answer: the feedback on it with who wrote it and
 * when, the existing writer behind "Add feedback", and for an admin or the
 * programme's lead the rating for the team. Each person leads to their whole
 * week, and previous and next step through the week's questions.
 *
 * What the written answer's review page and the reflections read with names
 * showed of each answer is here too, with the same words: the question's range
 * of words, "After its deadline" (staff only), "Joined late", the question as
 * it was when the answer was written, the answer as it stood at the session,
 * under the rows the line saying who reads a facilitator's own work (to the
 * lead and admins), and on a reflection, on the group's side, who reads
 * reflections with names and the way to the page where lines are picked to
 * read out.
 *
 * On the programme's side, the lead and admins choose the group here as on
 * the Coursework tab, with its Group filter's own look and words: a link per
 * live group, keeping the week, the question and the filters the address
 * named, the one shown marked (`aria-current`) as well as by eye. Plain
 * links, so they work before the page has its scripts. Behind the group's
 * door there is none: a facilitator's page is the one group's own.
 *
 * Drawn on the server from what the loader handed it: a reader is handed
 * nothing their gates refuse (no rating for a facilitator, nobody whose work
 * is not theirs to read), so nothing here decides who sees what. Once in the
 * browser, it names the answers it drew in full so the time each was first
 * read is kept (`MarkFirstRead`); what it shows of that is as things stood
 * when the reader arrived.
 */

/**
 * A filter with its count: "Not read yet 3". Each is a toggle (any of them may
 * be on together, and "Everybody" is on when none is), so it says whether it
 * is on as a toggle does (`aria-pressed`), never as the current page. A link
 * underneath, so the filters work before the page has its scripts.
 */
function Filter({ href, on, label, count }: { href: string; on: boolean; label: string; count: number }) {
  return (
    <li>
      <Link href={href} className={on ? styles.segmentOn : styles.segment} role="button" aria-pressed={on}>
        {label} <span className={styles.count}>{count}</span>
      </Link>
    </li>
  );
}

/** Where a row's feedback stands, in a chip: only on a question that takes feedback, and an answer that may take it. */
function FeedbackChip({ row }: { row: QuestionRow }) {
  if (row.feedback === "none") return <span className={styles.waitingChip}>{WAITING_FOR_FEEDBACK}</span>;
  if (row.feedback === "changed") return <span className={styles.lateChip}>{CHANGED_SINCE_FEEDBACK}</span>;
  if (row.feedback === "given") return <span className={styles.doneChip}>{ANSWER_STATE_WORDS.feedback}</span>;
  return null;
}

function Person({ row, view }: { row: QuestionRow; view: View }) {
  const answer = row.answer;
  const titleId = `${row.anchor}-name`;
  return (
    <section id={row.anchor} className={`${styles.card} ${styles.person}`} aria-labelledby={titleId}>
      <div className={styles.cardHead}>
        <div className={styles.personHead}>
          <h2 id={titleId} className={styles.personName}>
            {row.name}
          </h2>
          {row.facilitating && <span className={styles.chip}>{FACILITATING}</span>}
          {row.notToldYet && <span className={styles.chip}>{NOT_TOLD_YET}</span>}
          {answer?.sentAt && <span className={styles.when}>{sentWhenWords(answer.sentAt)}</span>}
          <Late ms={answer?.sentLateMs ?? null} />
          {answer && answer.sentLateMs === null && row.afterDeadline && <span className={styles.lateChip}>{AFTER_ITS_DEADLINE}</span>}
          {row.notSent && <span className={styles.chip}>{NOT_SENT_YET}</span>}
          {row.joinedLate && <span className={styles.chip}>{JOINED_LATE}</span>}
          {row.read === "unread" && <span className={styles.unreadChip}>{NOT_READ_YET}</span>}
          <FeedbackChip row={row} />
        </div>
        {/* An archived group's fellow's week never opens, so no link is drawn to it. */}
        {row.weekHref && (
          <Link href={row.weekHref} className={styles.reviewLink}>
            {openWeekWords(row.firstName)}
          </Link>
        )}
      </div>
      {answer ? (
        <div className={styles.grid}>
          <div className={styles.main}>
            {answer.savedAt && (
              <p className={styles.when}>
                <span>{staffChangedWords(answer.savedAt, answer.sentAt !== null)}</span>
                <Late ms={answer.savedLateMs} />
              </p>
            )}
            {answer.boxes.length > 0 ? (
              <div className={styles.boxes}>
                {answer.boxes.map((box, index) => (
                  <div key={index} className={styles.answerBox}>
                    <p className={styles.boxLabel}>{box.label}</p>
                    {box.text ? <Words text={box.text} /> : <p className={styles.quiet}>{NOTHING_WRITTEN_YET}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <Words text={answer.text} />
            )}
            <EarlierWording label={THE_QUESTION_WHEN_WRITTEN} words={answer.askedThen} />
            {answer.atSession && <EarlierVersion label={AS_IT_STOOD_AT_THE_SESSION} text={answer.atSession.text} boxes={answer.atSession.boxes} />}
            {row.feedback === "changed" && row.weekHref && (
              <Link href={row.weekHref} className={styles.reviewLink}>
                {SEE_WHAT_CHANGED}
              </Link>
            )}
          </div>
          {view.takesFeedback && (row.cards.length > 0 || row.own || row.mayWrite || row.team) && (
            <div className={styles.side}>
              <StaffFeedbackCards
                cards={row.cards}
                runId={view.runId}
                firstName={row.firstName}
                weekNumber={view.weekNumber}
                programme={view.programmeName}
                answerBoxes={view.answerBoxes}
              />
              {view.question && (row.mayWrite || row.own) && (
                <details className={styles.disclosure} open={row.own !== null}>
                  <summary>{row.own ? YOUR_FEEDBACK : ADD_FEEDBACK}</summary>
                  <FeedbackWriter
                    runId={view.runId}
                    uid={row.uid}
                    firstName={row.firstName}
                    weekNumber={view.weekNumber}
                    on={{ kind: "writtenAnswer", itemId: view.question.id }}
                    own={row.own}
                    viewerName={view.viewerFirstName}
                    title={YOUR_FEEDBACK}
                    hint={FEEDBACK_HINT}
                    mayWrite={row.mayWrite}
                  />
                </details>
              )}
              {row.team && (
                <details className={styles.disclosure} open={row.team.said.length > 0}>
                  <summary>{row.team.mine ? YOUR_RATING : RATE}</summary>
                  <RatingForTheTeam runId={view.runId} uid={row.uid} firstName={row.firstName} weekNumber={view.weekNumber} team={row.team} />
                </details>
              )}
            </div>
          )}
        </div>
      ) : (
        !row.notSent && <p className={styles.quiet}>{NOTHING_WRITTEN_YET}</p>
      )}
    </section>
  );
}

export default function QuestionView({ view }: { view: View }) {
  const { question, nav, counts, filter } = view;
  const anyFilter = filter.unread || filter.noFeedback || filter.late;
  return (
    <div className={styles.page}>
      <Link href={nav.crumb.href} className={styles.crumb}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        {nav.crumb.label}
      </Link>

      <header className={styles.head}>
        <p className={styles.eyebrow}>{readingEyebrowWords(view.programmeName, view.groupName, view.weekNumber, view.weeksTotal)}</p>
        <h1 className={styles.title}>{ONE_QUESTION_TITLE}</h1>
        <p className={styles.weekTitle}>{weekHeadingWords(view.weekNumber, view.weekTitle)}</p>
      </header>

      {view.groups && (
        <nav aria-label={GROUP} className={tab.groupsNav}>
          <p className={tab.groupLabel} aria-hidden="true">
            {GROUP}
          </p>
          <ul className={tab.filters} role="list">
            {view.groups.map((each) => (
              <li key={each.id}>
                <Link
                  href={each.href}
                  className={each.current ? `${tab.filter} ${tab.filterOn}` : tab.filter}
                  aria-current={each.current ? "page" : undefined}
                >
                  {each.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {(nav.previousQuestion || nav.nextQuestion) && (
        <nav className={styles.steps} aria-label={PREVIOUS_AND_NEXT_QUESTION}>
          <div className={styles.stepGroup}>
            {nav.previousQuestion && (
              <Link href={nav.previousQuestion.href} className={styles.step}>
                {PREVIOUS_QUESTION}
              </Link>
            )}
            {nav.nextQuestion && (
              <Link href={nav.nextQuestion.href} className={styles.step}>
                {NEXT_QUESTION}
              </Link>
            )}
          </div>
        </nav>
      )}

      {question ? (
        <section className={styles.question} aria-labelledby="question-asked">
          <p className={styles.questionLabel}>
            {[theQuestionWords(view.range), question.where, questionOfWords(view.position.at, view.position.of)].join(" · ")}
          </p>
          <p id="question-asked" className={styles.questionText}>
            {question.text}
          </p>
        </section>
      ) : (
        <section className={styles.card}>
          <p className={styles.quiet}>{NOTHING_TO_WRITE_THIS_WEEK}</p>
        </section>
      )}

      {(question || nav.personWeek) && (
        <div className={styles.bar}>
          {question && view.everybody > 0 ? (
            <nav aria-label={SHOW_WHOSE_ANSWERS}>
              <ul className={styles.segments} role="list">
                <Filter href={view.filterHrefs.everybody} on={!anyFilter} label={EVERYBODY} count={counts.everybody} />
                <Filter href={view.filterHrefs.unread} on={filter.unread} label={NOT_READ_YET} count={counts.unread} />
                {view.takesFeedback && <Filter href={view.filterHrefs.noFeedback} on={filter.noFeedback} label={WAITING_FOR_FEEDBACK} count={counts.noFeedback} />}
                <Filter href={view.filterHrefs.late} on={filter.late} label={LATE} count={counts.late} />
              </ul>
            </nav>
          ) : (
            <span />
          )}
          {nav.personWeek && <ViewSwitch current="question" other={nav.personWeek} />}
        </div>
      )}

      {question &&
        (view.everybody === 0 ? (
          <p className={styles.quiet}>{NOBODY_TO_READ}</p>
        ) : view.rows.length === 0 ? (
          <p className={styles.quiet}>{NOBODY_HERE}</p>
        ) : (
          view.rows.map((row) => <Person key={row.uid} row={row} view={view} />)
        ))}

      {view.ownLine && <p className={styles.meta}>{view.ownLine}</p>}

      {view.readOut && (
        <p className={styles.meta}>
          {view.readOut.line}{" "}
          <Link href={view.readOut.href} className={styles.reviewLink}>
            {PICK_LINES_TO_READ_OUT}
          </Link>
        </p>
      )}

      {view.firstRead && <MarkFirstRead runId={view.runId} weekId={view.firstRead.weekId} people={view.firstRead.people} />}

      <div className={styles.foot}>
        {nav.previousQuestion ? (
          <Link href={nav.previousQuestion.href} className={styles.step}>
            {PREVIOUS_QUESTION}
          </Link>
        ) : (
          <span />
        )}
        <Link href={nav.back.href} className={styles.backLink}>
          {backToWords(nav.back.label)}
        </Link>
        {nav.nextQuestion ? (
          <Link href={nav.nextQuestion.href} className={styles.step}>
            {NEXT_QUESTION}
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
