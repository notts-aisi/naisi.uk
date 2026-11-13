import Link from "next/link";
import type { ReactNode } from "react";
import type { WordChange } from "@/lib/courses/coursework/reading";
import { afterOf, beforeOf, changeCounts, wordChanges } from "@/lib/courses/coursework/reading";
import type { PersonWeekView, ReadingStep } from "@/lib/courses/coursework/readingLoad";
import { workKey } from "@/lib/courses/coursework/model";
import { questionAnchorId } from "@/lib/courses/coursework/question";
import {
  ADDED,
  ANSWER_STATE_WORDS,
  BOXES,
  CHANGE_LEGEND,
  FACILITATING,
  NOT_FILLED_IN_YET,
  NOT_TICKED,
  NOT_TOLD_YET,
  NOT_WRITTEN_YET,
  NOTHING_TO_READ_YET,
  NO_BLOCK_WEEKS,
  NOW,
  PEOPLE_AND_WEEKS,
  PREVIOUS_AND_NEXT_PERSON,
  PRIVATE_NOTE,
  PRIVATE_NOTES_ON_THE_MATERIAL,
  PRIVATE_NOTES_WHO,
  READINGS,
  REFLECTIONS,
  TAKEN_OUT,
  TICKED,
  WEEK_NOT_IN_BLOCKS,
  WRITTEN_ANSWER,
  asReadWords,
  backToWords,
  changeCountWords,
  groupMetWords,
  nextPersonWords,
  nextWeekWords,
  notStartedWords,
  ofWords,
  partHeadingWords,
  reviewPageLinkWords,
  weekHeadingWords,
  wordsWords,
  previousPersonWords,
  previousWeekWords,
  readingEyebrowWords,
  sentWhenWords,
  tickedWhenWords,
} from "@/lib/courses/coursework/words";
import { privateNotesWhoLine } from "@/lib/courses/facilitatorWeek/words";
import { FEEDBACK_HINT, FEEDBACK_ON_THE_WEEK, WEEK_FEEDBACK_HINT, YOUR_FEEDBACK } from "@/lib/courses/feedback/words";
import { lastRemindedLine } from "@/lib/courses/groupWeekWork/words";
import { PANEL_HINT, PANEL_TITLE } from "@/lib/courses/predictions/words";
import { THE_QUESTION_WHEN_WRITTEN, earlierQuestionWords } from "@/lib/courses/weekEdit/wordsThen";
import {
  AS_IT_STOOD_AT_THE_SESSION,
  THE_VERSION_THIS_FEEDBACK_WAS_ABOUT,
  answerChangedSinceWords,
  lateAfterSessionWords,
  staffChangedWords,
} from "@/lib/courses/weekWork/words";
import { theQuestionWords } from "@/lib/courses/writtenAnswerWords";
import EarlierVersion, { versionBoxes } from "../feedback/EarlierVersion";
import FeedbackWriter from "../feedback/FeedbackWriter";
import StaffFeedbackCards from "../feedback/StaffFeedbackCards";
import EarlierWording from "../weekBlocks/EarlierWording";
import RatingForTheTeam from "../written/RatingForTheTeam";
import MarkFirstRead from "./MarkFirstRead";
import RemindOne from "./RemindOne";
import SealedPredictionRow from "./SealedPredictionRow";
import ViewSwitch from "./ViewSwitch";
import styles from "./reading.module.css";

/**
 * THE READING VIEW: ONE PERSON, ONE WEEK, for the people running a
 * programme, reached from the programme's side and from the group's
 * (`loadPersonCoursework`, `loadGroupPersonWeek`, both through
 * `readPersonWeek`). Top to bottom: the programme, the group and the week
 * with the person and the way to the previous and next person and week; where
 * the week stands and when the group met; the readings, each with when it was
 * ticked; each reflection and fill-in box under its question with when it was
 * written; the written answer as its readers may read it, with the feedback on
 * it beside it, and for an admin or the programme's lead the ratings for the
 * team (and for an admin Claude's draft grade, once they have saved their own
 * rating; before then a line saying it shows then); the feedback on the week as a
 * whole; for an admin the sealed prediction's row; the private notes on the
 * material where the reader reads them; and the way back.
 *
 * WHAT CHANGED: when the written answer has changed since the version the
 * newest piece of feedback on it was about, both versions, what was taken out
 * struck through and what was added underlined, each said in words too
 * (`wordChanges`), and the feedback about the earlier version under it.
 *
 * NOTHING TO READ YET: a week with nothing ticked, written or sent says so,
 * when the person was last reminded about it, and Remind, the group's own,
 * for one person and one week, where its rule reaches them.
 *
 * THE SWITCH between this way of reading the week and one question across
 * the person's group (`ViewSwitch`), on the same week and landing on the
 * person; each question's answer carries an id the other way lands on.
 *
 * WHEN AN ANSWER WAS FIRST READ: once in the browser, the page names the
 * answers it drew in full (`MarkFirstRead`), for a reader who may act on the
 * person's work. It shows nothing of it: "Not read yet" is the page of one
 * question's.
 *
 * Drawn on the server from what the loader handed it: a reader is handed
 * nothing their gates refuse (no rating for a facilitator, no private note
 * for the lead, no draft grade or sealed prediction for anybody but an
 * admin), so nothing here decides who sees what. `beside` is the programme
 * side's column for what the team keeps about a person.
 */

/** Words as written: one paragraph per line, blank lines dropped. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function Words({ text, className = styles.words }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {paragraphs(text).map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </div>
  );
}

export function Late({ ms }: { ms: number | null }) {
  return ms !== null ? <span className={styles.lateChip}>{lateAfterSessionWords(ms)}</span> : null;
}

function Question({ text }: { text: string }) {
  return (
    <div className={styles.question}>
      <p className={styles.questionLabel}>{theQuestionWords(null)}</p>
      <p className={styles.questionText}>{text}</p>
    </div>
  );
}

export function Step({ step, words }: { step: ReadingStep | null; words: (label: string) => string }) {
  if (!step) return null;
  return (
    <Link href={step.href} className={styles.step}>
      {words(step.label)}
    </Link>
  );
}

/** One version of the answer, as the change shows it: kept words plain, taken out struck through, added underlined. */
function Changes({ changes }: { changes: WordChange[] }) {
  return (
    <p className={styles.changeWords}>
      {changes.map((change, index) =>
        change.kind === "same" ? (
          <span key={index}>{change.text}</span>
        ) : change.kind === "out" ? (
          <del key={index} className={styles.out}>
            <span className={styles.srOnly}>{`${TAKEN_OUT} `}</span>
            {change.text}
          </del>
        ) : (
          <ins key={index} className={styles.in}>
            <span className={styles.srOnly}>{`${ADDED} `}</span>
            {change.text}
          </ins>
        ),
      )}
    </p>
  );
}

/** The written answer's words, a box at a time for an answer in labelled boxes. */
function AnswerWords({ view }: { view: PersonWeekView }) {
  const answer = view.week.answer;
  if (!answer) return null;
  if (answer.boxes.length > 0) {
    return (
      <div className={styles.boxes}>
        {answer.boxes.map((box, index) => (
          <div key={index} className={styles.answerBox}>
            <p className={styles.boxLabel}>{box.label}</p>
            {box.text ? <Words text={box.text} /> : <p className={styles.quiet}>{NOT_WRITTEN_YET}</p>}
          </div>
        ))}
      </div>
    );
  }
  return <Words text={answer.text} />;
}

/** Both versions of a written answer that has changed since feedback, and what changed, in words. */
function Changed({ view }: { view: PersonWeekView }) {
  const answer = view.week.answer;
  const changed = view.changed;
  if (!answer || !changed) return null;
  const earlierBoxes = versionBoxes(changed.about.boxes, view.answerBoxes);
  const pairs =
    answer.boxes.length > 0
      ? answer.boxes.map((box, index) => ({ label: box.label, changes: wordChanges(earlierBoxes[index]?.text ?? "", box.text) }))
      : [{ label: "", changes: wordChanges(changed.about.text, answer.text) }];
  const counts = pairs.reduce(
    (sum, pair) => {
      const each = changeCounts(pair.changes);
      return { out: sum.out + each.out, in: sum.in + each.in };
    },
    { out: 0, in: 0 },
  );
  const cards = (view.answerFeedback?.cards ?? []).filter((card) => changed.cardIds.includes(card.id)).map((card) => ({ ...card, about: null }));
  const earlierAt = changed.about.savedAt ? new Date(changed.about.savedAt) : null;
  return (
    <div className={styles.changed}>
      <p className={styles.changedLine}>
        {answerChangedSinceWords(view.person.firstName)} {changeCountWords(counts)}
      </p>
      <div className={styles.versions}>
        <section className={styles.version} aria-label={THE_VERSION_THIS_FEEDBACK_WAS_ABOUT}>
          <p className={styles.versionLabel}>
            {asReadWords(changed.byName)}
            {earlierAt && ` · ${staffChangedWords(earlierAt, false)}`}
          </p>
          {pairs.map((pair, index) => (
            <div key={index}>
              {pair.label && <p className={styles.boxLabel}>{pair.label}</p>}
              <Changes changes={beforeOf(pair.changes)} />
            </div>
          ))}
          {cards.length > 0 && (
            <StaffFeedbackCards
              cards={cards}
              runId={view.runId}
              firstName={view.person.firstName}
              weekNumber={view.weekNumber}
              programme={view.programmeName}
              answerBoxes={view.answerBoxes}
            />
          )}
        </section>
        <section className={styles.version} aria-label={NOW}>
          <p className={styles.versionLabel}>
            {NOW}
            {answer.changedAt && ` · ${staffChangedWords(answer.changedAt, (answer.lastSentAt ?? answer.sentAt) !== null)}`}
          </p>
          {pairs.map((pair, index) => (
            <div key={index}>
              {pair.label && <p className={styles.boxLabel}>{pair.label}</p>}
              <Changes changes={afterOf(pair.changes)} />
            </div>
          ))}
          <Late ms={answer.changedLateMs} />
        </section>
      </div>
      <p className={styles.legend}>{CHANGE_LEGEND}</p>
    </div>
  );
}

/**
 * A person's page on a run with none of its weeks written as blocks: nothing
 * to read week by week, so the page names the person, says so, and still
 * carries the column of what the team keeps about them (`beside`).
 */
export function NoWeekToRead({
  name,
  eyebrow,
  marks,
  crumb,
  beside = null,
}: {
  name: string;
  eyebrow: string;
  marks: string[];
  crumb: ReadingStep;
  beside?: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <Link href={crumb.href} className={styles.crumb}>
        {crumb.label}
      </Link>
      <header className={styles.head}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{name}</h1>
        {marks.length > 0 && (
          <p className={styles.marks}>
            {marks.map((mark) => (
              <span key={mark} className={styles.chip}>
                {mark}
              </span>
            ))}
          </p>
        )}
      </header>
      <section className={styles.card}>
        <p className={styles.quiet}>{NO_BLOCK_WEEKS}</p>
      </section>
      {beside && <aside className={styles.beside}>{beside}</aside>}
    </div>
  );
}

export default function ReadingView({ view, beside = null }: { view: PersonWeekView; beside?: ReactNode }) {
  const { week, person, nav } = view;
  const now = new Date();
  const met = groupMetWords(person.groupName, view.weekNumber, view.due, now);
  const earlier = (id: string, words: string) => earlierQuestionWords(view.askedThen[workKey(view.weekNumber, id)], words);
  const notes = week.sources.filter((source) => source.note);
  const answer = week.answer;
  const feedback = view.answerFeedback;
  const changedIds = new Set(view.changed?.cardIds ?? []);
  const sideCards = (feedback?.cards ?? []).filter((card) => !changedIds.has(card.id));
  const sentAt = answer ? (answer.lastSentAt ?? answer.sentAt) : null;
  const weekFeedback = week.feedback;

  const personNav = (
    <>
      <Step step={nav.previousPerson} words={previousPersonWords} />
      <Step step={nav.nextPerson} words={nextPersonWords} />
    </>
  );

  return (
    <div className={styles.page}>
      <Link href={nav.crumb.href} className={styles.crumb}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        {nav.crumb.label}
      </Link>

      <header className={styles.head}>
        <p className={styles.eyebrow}>{readingEyebrowWords(view.programmeName, person.groupName, view.weekNumber, view.weeksTotal)}</p>
        <h1 className={styles.title}>{person.name}</h1>
        <p className={styles.weekTitle}>{weekHeadingWords(view.weekNumber, week.title)}</p>
        {(person.facilitating || person.notToldYet) && (
          <p className={styles.marks}>
            {person.facilitating && <span className={styles.chip}>{FACILITATING}</span>}
            {person.notToldYet && <span className={styles.chip}>{NOT_TOLD_YET}</span>}
          </p>
        )}
      </header>

      <nav className={styles.steps} aria-label={PEOPLE_AND_WEEKS}>
        <div className={styles.stepGroup}>{personNav}</div>
        <div className={styles.stepGroup}>
          <Step step={nav.previousWeek} words={(label) => previousWeekWords(Number(label))} />
          <Step step={nav.nextWeek} words={(label) => nextWeekWords(Number(label))} />
        </div>
      </nav>

      {view.questionHref && <ViewSwitch current="person" other={view.questionHref} />}

      {(view.state || met) && (
        <p className={styles.chips}>
          {view.state && (
            <span className={view.state.bucket === "done-late" ? styles.lateChip : view.state.bucket.startsWith("done") ? styles.doneChip : styles.chip}>
              {view.state.text}
            </span>
          )}
          {view.state?.detail && <span className={view.state.bucket === "done-late" ? styles.lateChip : styles.chip}>{view.state.detail}</span>}
          {met && <span className={styles.chip}>{met}</span>}
        </p>
      )}

      {!week.counted ? (
        <section className={styles.card}>
          <p className={styles.quiet}>{WEEK_NOT_IN_BLOCKS}</p>
        </section>
      ) : view.empty ? (
        <section className={styles.card} aria-labelledby="reading-empty">
          <h2 id="reading-empty" className={styles.cardTitle}>
            {NOTHING_TO_READ_YET}
          </h2>
          <p className={styles.line}>{notStartedWords(person.firstName, view.weekNumber, { ticked: view.empty.ticked, of: view.empty.of })}</p>
          {view.empty.remind !== null || view.empty.lastReminded !== null ? <p className={styles.meta}>{lastRemindedLine(view.empty.lastReminded)}</p> : null}
          {view.empty.remind && (
            <RemindOne groupId={view.empty.remind.groupId} weekNumber={view.weekNumber} uid={person.uid} firstName={person.firstName} />
          )}
        </section>
      ) : (
        <>
          {week.sources.length > 0 && (
            <section className={styles.card} aria-labelledby="reading-readings">
              <div className={styles.cardHead}>
                <h2 id="reading-readings" className={styles.cardTitle}>
                  {READINGS}
                </h2>
                <span className={week.ticked === week.sources.length ? styles.doneChip : styles.chip}>{ofWords(week.ticked, week.sources.length)}</span>
              </div>
              <ul className={styles.list} role="list">
                {week.sources.map((source) => {
                  const tick = view.ticks[source.id];
                  return (
                    <li key={source.id} className={styles.row}>
                      <span className={styles.rowMain}>
                        <span className={styles.rowTitle}>{source.title}</span>
                        <span className={styles.meta}>{source.ticked ? (tick?.at ? tickedWhenWords(tick.at) : TICKED) : NOT_TICKED}</span>
                      </span>
                      <Late ms={tick?.lateMs ?? null} />
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {week.parts.length > 0 && (
            <section className={styles.card} aria-labelledby="reading-reflections">
              <h2 id="reading-reflections" className={styles.cardTitle}>
                {REFLECTIONS}
              </h2>
              {week.parts.map((part) => (
                <div key={part.number} className={styles.part}>
                  <p className={styles.partTitle}>{partHeadingWords(part.number, part.title)}</p>
                  {part.prompts.map((prompt) => (
                    <div key={prompt.id} id={questionAnchorId(prompt.id)} className={styles.piece}>
                      <Question text={prompt.text} />
                      {prompt.answer ? (
                        <>
                          {(prompt.answer.at || prompt.answer.lateMs !== null) && (
                            <p className={styles.when}>
                              {prompt.answer.at && <span>{staffChangedWords(prompt.answer.at, false)}</span>}
                              <Late ms={prompt.answer.lateMs} />
                            </p>
                          )}
                          <Words text={prompt.answer.text} />
                          <EarlierWording label={THE_QUESTION_WHEN_WRITTEN} words={earlier(prompt.id, prompt.text)} />
                          {prompt.answer.atSession && <EarlierVersion label={AS_IT_STOOD_AT_THE_SESSION} text={prompt.answer.atSession} />}
                        </>
                      ) : (
                        <p className={styles.quiet}>{NOT_WRITTEN_YET}</p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </section>
          )}

          {week.boxes && (
            <section className={styles.card} aria-labelledby="reading-boxes">
              <h2 id="reading-boxes" className={styles.cardTitle}>
                {BOXES}
              </h2>
              {week.boxes.map((box) => (
                <div key={box.id} id={questionAnchorId(box.id)} className={styles.piece}>
                  <Question text={box.label ? `${box.heading}: ${box.label}` : box.heading} />
                  {box.text ? (
                    <>
                      {(box.at || box.lateMs !== null) && (
                        <p className={styles.when}>
                          {box.at && <span>{staffChangedWords(box.at, false)}</span>}
                          <Late ms={box.lateMs} />
                        </p>
                      )}
                      <Words text={box.text} />
                      {box.atSession && <EarlierVersion label={AS_IT_STOOD_AT_THE_SESSION} text={box.atSession} />}
                    </>
                  ) : (
                    <p className={styles.quiet}>{NOT_FILLED_IN_YET}</p>
                  )}
                </div>
              ))}
            </section>
          )}

          {answer && (
            <section id={questionAnchorId(answer.id)} className={styles.card} aria-labelledby="reading-answer">
              <div className={styles.cardHead}>
                <h2 id="reading-answer" className={styles.cardTitle}>
                  {WRITTEN_ANSWER}
                </h2>
                <p className={styles.when}>
                  <span
                    className={answer.state === "waiting" ? styles.waitingChip : answer.state === "feedback" ? styles.doneChip : styles.chip}
                  >
                    {ANSWER_STATE_WORDS[answer.state]}
                  </span>
                  {answer.words > 0 && <span>{wordsWords(answer.words)}</span>}
                  {sentAt && <span>{sentWhenWords(sentAt)}</span>}
                  <Late ms={answer.sentLateMs} />
                </p>
              </div>
              <div className={styles.grid}>
                <div className={styles.main}>
                  <Question text={answer.prompt} />
                  {answer.words > 0 ? (
                    view.changed ? (
                      <Changed view={view} />
                    ) : (
                      <>
                        {answer.changedAt && (!sentAt || answer.changedAt.getTime() > sentAt.getTime()) && (
                          <p className={styles.when}>
                            <span>{staffChangedWords(answer.changedAt, sentAt !== null)}</span>
                            <Late ms={answer.changedLateMs} />
                          </p>
                        )}
                        <AnswerWords view={view} />
                      </>
                    )
                  ) : null}
                  {answer.words > 0 && <EarlierWording label={THE_QUESTION_WHEN_WRITTEN} words={earlier(answer.id, answer.prompt)} />}
                  {answer.atSession && (
                    <EarlierVersion label={AS_IT_STOOD_AT_THE_SESSION} text={answer.atSession.text} boxes={answer.atSession.boxes} />
                  )}
                  {view.reviewHref && (
                    <Link href={view.reviewHref} className={styles.reviewLink}>
                      {reviewPageLinkWords(person.firstName)}
                    </Link>
                  )}
                </div>
                {(feedback || view.team || view.draftGrade || view.draftGradeWaits) && (
                  <div className={styles.side}>
                    {feedback && (feedback.open || feedback.own) && (
                      <FeedbackWriter
                        runId={view.runId}
                        uid={person.uid}
                        firstName={person.firstName}
                        weekNumber={view.weekNumber}
                        on={{ kind: "writtenAnswer", itemId: answer.id }}
                        own={feedback.own}
                        viewerName={view.viewerFirstName}
                        title={YOUR_FEEDBACK}
                        hint={FEEDBACK_HINT}
                        mayWrite={feedback.open}
                      />
                    )}
                    <StaffFeedbackCards
                      cards={sideCards}
                      runId={view.runId}
                      firstName={person.firstName}
                      weekNumber={view.weekNumber}
                      programme={view.programmeName}
                      answerBoxes={view.answerBoxes}
                    />
                    {view.team && (
                      <RatingForTheTeam runId={view.runId} uid={person.uid} firstName={person.firstName} weekNumber={view.weekNumber} team={view.team} />
                    )}
                    {view.draftGrade && (
                      <div className={styles.draft}>
                        <p className={styles.draftGrade}>{view.draftGrade.grade}</p>
                        <p className={styles.meta}>{view.draftGrade.line}</p>
                      </div>
                    )}
                    {view.draftGradeWaits && (
                      <div className={styles.draft}>
                        <p className={styles.meta}>{view.draftGradeWaits}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {week.counted && weekFeedback && (weekFeedback.cards.length > 0 || weekFeedback.own || weekFeedback.open) && (
        <section className={styles.card} aria-labelledby="reading-week-feedback">
          <h2 id="reading-week-feedback" className={styles.cardTitle}>
            {FEEDBACK_ON_THE_WEEK}
          </h2>
          <StaffFeedbackCards cards={weekFeedback.cards} runId={view.runId} firstName={person.firstName} weekNumber={view.weekNumber} programme={view.programmeName} />
          {(weekFeedback.open || weekFeedback.own) && (
            <FeedbackWriter
              runId={view.runId}
              uid={person.uid}
              firstName={person.firstName}
              weekNumber={view.weekNumber}
              on={{ kind: "week" }}
              own={weekFeedback.own}
              viewerName={view.viewerFirstName}
              title={YOUR_FEEDBACK}
              hint={WEEK_FEEDBACK_HINT}
              mayWrite={weekFeedback.open}
            />
          )}
        </section>
      )}

      {(view.prediction || (view.notesShown && notes.length > 0)) && (
        <div className={styles.pair}>
          {view.prediction && (
            <section className={styles.card} aria-labelledby="reading-prediction">
              <h2 id="reading-prediction" className={styles.cardTitle}>
                {PANEL_TITLE}
              </h2>
              <p className={styles.meta}>{PANEL_HINT}</p>
              <SealedPredictionRow runId={view.prediction.runId} uid={view.prediction.uid} name={view.prediction.name} />
            </section>
          )}
          {view.notesShown && notes.length > 0 && (
            <section className={styles.card} aria-labelledby="reading-notes">
              <h2 id="reading-notes" className={styles.cardTitle}>
                {PRIVATE_NOTES_ON_THE_MATERIAL}
              </h2>
              <p className={styles.meta}>
                {view.door === "programme" || person.facilitating || !person.groupName ? PRIVATE_NOTES_WHO : privateNotesWhoLine(person.groupName)}
              </p>
              <ul className={styles.list} role="list">
                {notes.map((source) => (
                  <li key={source.id} className={styles.note}>
                    <p className={styles.rowTitle}>{source.title}</p>
                    <p className={styles.noteText}>
                      <span className={styles.noteLabel}>{PRIVATE_NOTE}</span> {source.note}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {beside && <aside className={styles.beside}>{beside}</aside>}

      {view.firstRead && <MarkFirstRead runId={view.runId} weekId={view.firstRead.weekId} people={[{ uid: person.uid, ids: view.firstRead.ids }]} />}

      <nav className={styles.foot} aria-label={PREVIOUS_AND_NEXT_PERSON}>
        <Step step={nav.previousPerson} words={previousPersonWords} />
        <Link href={nav.back.href} className={styles.backLink}>
          {backToWords(nav.back.label)}
        </Link>
        <Step step={nav.nextPerson} words={nextPersonWords} />
      </nav>
    </div>
  );
}
