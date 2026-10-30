import Link from "next/link";
import type { ReactNode } from "react";
import type { PersonCourseworkView } from "@/lib/courses/coursework/load";
import type { PersonWeek } from "@/lib/courses/coursework/model";
import { lastWrittenWords } from "@/lib/courses/facilitatorWeek/words";
import {
  ANSWER_STATE_WORDS,
  BACK_TO_COURSEWORK,
  BOXES,
  FACILITATING,
  NOT_FILLED_IN_YET,
  NOT_IN_A_GROUP_YET,
  NOT_TICKED,
  NOT_TOLD_YET,
  NOT_WRITTEN_YET,
  NO_FEEDBACK_YET,
  OPEN_FEEDBACK_PAGE,
  PRIVATE_NOTE,
  PRIVATE_NOTES_WHO,
  REFLECTIONS,
  SOURCES,
  TICKED,
  WEEK_NOT_IN_BLOCKS,
  WRITTEN_ANSWER,
  feedbackFromWords,
  partHeadingWords,
  sentWhenWords,
  tickedOfWords,
  weekHeadingWords,
  wordsWords,
} from "@/lib/courses/coursework/words";
import styles from "./coursework.module.css";

/**
 * ONE PERSON'S COURSEWORK (Zach, Fri 30 Oct), for the programme's lead and
 * admins: their name, their group where this viewer may see it, and week by
 * week, NEWEST FIRST, everything they wrote: each reflection under its prompt
 * with when it was written, their written answer with where it stands and
 * the feedback on it (levels, comment, who gave it) and the way to the
 * feedback page, their fill-in boxes, and which sources they ticked.
 *
 * PRIVATE NOTES are drawn only where the loader read them: for an admin,
 * never for the programme's lead (`readPersonPrivateNotes`). Survey answers
 * are never here.
 *
 * `beside` is the column beside the weeks, for what admins keep about a
 * person: notes about them, Claude's draft of one and Pangram on their
 * answers. The page hands it something for an admin alone, and the column
 * is drawn only when it is handed something, so never for the lead.
 */

function Week({ week, notesShown }: { week: PersonWeek; notesShown: boolean }) {
  const heading = weekHeadingWords(week.weekNumber, week.title);
  return (
    <section id={`week-${week.weekNumber}`} className={styles.week} aria-labelledby={`week-${week.weekNumber}-title`}>
      <h2 id={`week-${week.weekNumber}-title`} className={styles.weekTitle}>
        {heading}
      </h2>
      {!week.counted ? (
        <p className={styles.notYet}>{WEEK_NOT_IN_BLOCKS}</p>
      ) : (
        <>
          {week.parts.length > 0 && (
            <div className={styles.block}>
              <h3 className={styles.blockTitle}>{REFLECTIONS}</h3>
              {week.parts.map((part) => (
                <div key={part.number}>
                  <p className={styles.partTitle}>{partHeadingWords(part.number, part.title)}</p>
                  <ul className={styles.items}>
                    {part.prompts.map((prompt) => (
                      <li key={prompt.id} className={styles.item}>
                        <p className={styles.question}>{prompt.text}</p>
                        {prompt.answer ? (
                          <>
                            <p className={styles.words}>{prompt.answer.text}</p>
                            {prompt.answer.at && <span className={styles.when}>{lastWrittenWords(prompt.answer.at)}</span>}
                          </>
                        ) : (
                          <p className={styles.notYet}>{NOT_WRITTEN_YET}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {week.answer && (
            <div className={styles.block}>
              <h3 className={styles.blockTitle}>{WRITTEN_ANSWER}</h3>
              <p className={styles.question}>{week.answer.prompt}</p>
              <div className={styles.answerHead}>
                <span className={week.answer.state === "waiting" ? `${styles.answer} ${styles.answerPlain} ${styles.answerWaiting}` : `${styles.answer} ${styles.answerPlain}`}>
                  {ANSWER_STATE_WORDS[week.answer.state]}
                </span>
                {week.answer.words > 0 && <span className={styles.muted}>{wordsWords(week.answer.words)}</span>}
                {week.answer.sentAt && <span className={styles.muted}>{sentWhenWords(week.answer.sentAt)}</span>}
              </div>
              {week.answer.text && <p className={styles.words}>{week.answer.text}</p>}
              {week.answer.boxes.length > 0 && (
                <ul className={styles.items}>
                  {week.answer.boxes.map((box, index) => (
                    <li key={`${week.weekNumber}-answer-${index + 1}`} className={styles.item}>
                      <p className={styles.question}>{box.label}</p>
                      {box.text ? <p className={styles.words}>{box.text}</p> : <p className={styles.notYet}>{NOT_WRITTEN_YET}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {week.answer.feedback ? (
                <div className={styles.item}>
                  <p className={styles.partTitle}>{feedbackFromWords(week.answer.feedback.byName)}</p>
                  {week.answer.feedback.sentAt && <span className={styles.when}>{lastWrittenWords(week.answer.feedback.sentAt)}</span>}
                  {week.answer.feedback.levels.length > 0 && (
                    <ul className={styles.levels}>
                      {week.answer.feedback.levels.map((level, index) => (
                        <li key={`${week.weekNumber}-level-${index + 1}`} className={styles.level}>
                          <span className={styles.levelRow}>{level.row}</span>
                          {`: ${level.level}`}
                          {level.descriptor ? ` (${level.descriptor})` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  {week.answer.feedback.comment && <p className={styles.words}>{week.answer.feedback.comment}</p>}
                </div>
              ) : (
                week.answer.state === "waiting" && <p className={styles.notYet}>{NO_FEEDBACK_YET}</p>
              )}
              {week.answer.href && (
                <Link href={week.answer.href} className={styles.link}>
                  {OPEN_FEEDBACK_PAGE}
                </Link>
              )}
            </div>
          )}

          {week.boxes && (
            <div className={styles.block}>
              <h3 className={styles.blockTitle}>{BOXES}</h3>
              <ul className={styles.items}>
                {week.boxes.map((box, index) => (
                  <li key={`${week.weekNumber}-box-${index + 1}`} className={styles.item}>
                    <p className={styles.question}>{box.label ? `${box.heading}: ${box.label}` : box.heading}</p>
                    {box.text ? <p className={styles.words}>{box.text}</p> : <p className={styles.notYet}>{NOT_FILLED_IN_YET}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {week.sources.length > 0 && (
            <div className={styles.block}>
              <h3 className={styles.blockTitle}>{`${SOURCES} · ${tickedOfWords(week.ticked, week.sources.length)}`}</h3>
              {notesShown && week.sources.some((source) => source.note) && <p className={styles.notYet}>{PRIVATE_NOTES_WHO}</p>}
              <ul className={styles.sources}>
                {week.sources.map((source) => (
                  <li key={source.id} className={styles.source}>
                    <span className={styles.sourceState}>{source.ticked ? TICKED : NOT_TICKED}</span>
                    {source.title}
                    {source.note && (
                      <p className={styles.note}>
                        <span className={styles.noteLabel}>{PRIVATE_NOTE}</span>
                        {source.note}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function PersonCoursework({
  view,
  backHref,
  beside = null,
}: {
  view: PersonCourseworkView;
  backHref: string;
  /** The column beside the weeks, an admin's alone (notes, Claude's draft, Pangram); nothing is drawn there unless it is handed something. */
  beside?: ReactNode;
}) {
  const { person } = view;
  return (
    <div className={styles.page}>
      <Link href={backHref} className={styles.crumb}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        {BACK_TO_COURSEWORK}
      </Link>
      <header className={styles.head}>
        <h1 className={styles.title}>{person.name}</h1>
        <p className={styles.meta}>
          <span>{`${view.programmeName} · ${person.groupName ?? NOT_IN_A_GROUP_YET}`}</span>
          {person.facilitating && <span className={styles.chip}>{FACILITATING}</span>}
          {person.notToldYet && <span className={styles.chip}>{NOT_TOLD_YET}</span>}
        </p>
      </header>
      <div className={styles.columns}>
        <div className={styles.weeks}>
          {view.weeks.map((week) => (
            <Week key={week.weekNumber} week={week} notesShown={view.notesShown} />
          ))}
        </div>
        {beside && <aside className={styles.beside}>{beside}</aside>}
      </div>
    </div>
  );
}
