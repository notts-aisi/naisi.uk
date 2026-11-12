import type { NamedPrompt } from "@/lib/courses/facilitatorWeek/readers";
import {
  FACILITATOR,
  FACILITATORS_OWN,
  NOBODY_WROTE,
  NOT_WRITTEN,
  NO_REFLECTIONS,
  lastWrittenWords,
  wroteWords,
} from "@/lib/courses/facilitatorWeek/words";
import { AS_IT_STOOD_AT_THE_SESSION, lateAfterSessionWords } from "@/lib/courses/weekWork/words";
import { THE_QUESTION_WHEN_WRITTEN } from "@/lib/courses/weekEdit/wordsThen";
import EarlierVersion from "../feedback/EarlierVersion";
import EarlierWording from "../weekBlocks/EarlierWording";
import styles from "@/features/courses/facilitator/facilitator.module.css";
import named from "./namedReflections.module.css";

/**
 * A GROUP'S REFLECTIONS FOR ONE WEEK, READ WITH NAMES (Zach, Fri 30 Oct): the
 * one layout the programme's lead's page and the group's facilitators' page
 * draw (`loadNamedReflections` reads, this draws). Every prompt of the week in
 * order, each with the group's fellows' answers under their whole names, in
 * the group's order of people, and when each was last written; under the
 * prompt, how many wrote one and the names of the fellows who have not.
 * Written after the session they were due at, "Late: 3 days after the
 * session" beside when; changed since that session started, the words as
 * they stood at it, stacked under the latest ("As it stood at the session").
 * Where the prompt was reworded after a reflection was first written, "The
 * question when this was written:" and its words then, under the reflection.
 *
 * The lead and admins are handed each facilitator's own reflection apart
 * (`own`), under the facilitator's name and marked as theirs, with how late.
 * A facilitator's page never hands them, so a co-facilitator never sees a
 * facilitator's own lateness.
 *
 * Nothing here is picked or copied: lines are read out from the page that
 * has no names (`ReadOutView`), which never draws this component. A server
 * component, so it reads the same before and after the page's scripts arrive.
 */
export default function NamedReflections({
  prompts,
  ownLine = null,
}: {
  prompts: NamedPrompt[];
  /** Who reads a facilitator's own reflections, for the lead's page. */
  ownLine?: string | null;
}) {
  if (prompts.length === 0) return <p className={styles.wkEmpty}>{NO_REFLECTIONS}</p>;
  const showsOwn = prompts.some((prompt) => prompt.own !== null && prompt.own.length > 0);
  return (
    <div className={named.list}>
      {showsOwn && ownLine && <p className={named.ownLine}>{ownLine}</p>}
      {prompts.map((prompt) => (
        <section key={prompt.key} className={named.prompt} aria-labelledby={`named-${prompt.key}`}>
          <p className={named.part}>{prompt.label}</p>
          <h2 id={`named-${prompt.key}`} className={named.question}>
            {prompt.text}
          </h2>
          <p className={styles.wkWroteLine}>{wroteWords(prompt.wrote, prompt.of, prompt.notYet)}</p>
          {prompt.answers.length === 0 ? (
            <p className={styles.wkEmpty}>{NOBODY_WROTE}</p>
          ) : (
            <ul className={named.answers} aria-label={prompt.label}>
              {prompt.answers.map((answer, index) => (
                <li key={`${prompt.key}-${index + 1}`} className={named.answer}>
                  <div className={named.answerHead}>
                    <span className={named.name}>{answer.name}</span>
                    {answer.at && <span className={named.when}>{lastWrittenWords(answer.at)}</span>}
                    {answer.lateMs !== null && <span className={named.when}>{lateAfterSessionWords(answer.lateMs)}</span>}
                  </div>
                  <p className={named.text}>{answer.text}</p>
                  <EarlierWording label={THE_QUESTION_WHEN_WRITTEN} words={answer.askedThen} />
                  {answer.atSession && <EarlierVersion label={AS_IT_STOOD_AT_THE_SESSION} text={answer.atSession} />}
                </li>
              ))}
            </ul>
          )}
          {prompt.own && prompt.own.length > 0 && (
            <div className={named.own}>
              <h3 className={named.ownTitle}>{FACILITATORS_OWN}</h3>
              <ul className={styles.wkOwn}>
                {prompt.own.map((person, index) => (
                  <li key={`${prompt.key}-own-${index + 1}`} className={styles.wkOwnPerson}>
                    <p className={styles.wkOwnName}>
                      <span>{person.name}</span>
                      <span className={styles.wkOwnChip}>{FACILITATOR}</span>
                      {person.at && <span className={named.when}>{lastWrittenWords(person.at)}</span>}
                      {person.lateMs !== null && <span className={named.when}>{lateAfterSessionWords(person.lateMs)}</span>}
                    </p>
                    <p className={person.text ? styles.wkOwnText : `${styles.wkOwnText} ${styles.wkMuted}`}>{person.text ?? NOT_WRITTEN}</p>
                    {person.text && <EarlierWording label={THE_QUESTION_WHEN_WRITTEN} words={person.askedThen} />}
                    {person.atSession && <EarlierVersion label={AS_IT_STOOD_AT_THE_SESSION} text={person.atSession} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
