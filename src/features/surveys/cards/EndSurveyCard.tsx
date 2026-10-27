import Link from "next/link";
import type { EndSurvey } from "@/lib/surveys/waiting";
import {
  END_CARD_WORDS,
  endCardAfterWords,
  endCardClosesWords,
  endCardKeptWords,
  endCardLastWeekWords,
  endCardSentWords,
} from "@/lib/surveys/words";
import styles from "./SurveyCards.module.css";

/**
 * "THE SURVEY AT THE END" (Q48 B), on its programme's own pages: Home in the
 * last week (wk-lastweek-phone, `look` "card") and the programme page once
 * the programme is over (en-after-phone and en-after-nofinish-phone, `look`
 * "section"). It draws what it is handed and decides nothing: whether the
 * survey is the person's to answer, or sent, is `endSurveyFor`'s and
 * `surveysWaitingFor`'s answer on the server.
 *
 *  - THEIRS TO ANSWER, in the last week (`lastSession`): when to answer it
 *    (at the end of tonight's session, or of the last session on its day),
 *    what it asks and how long, that the facilitators leave them the time,
 *    "Open the survey" and when it closes.
 *  - THEIRS TO ANSWER, once the programme is over: what it asks, how long,
 *    when it closes, and "Answer it".
 *  - SENT: the day they sent it, thanks, and the day their name comes off.
 *
 * Every button opens the person's own link, the page their email opens.
 * Never how many others have answered: nothing of anybody else reaches it.
 */
export type LastSession = {
  /** "tonight" or "today" on the last session's own day; otherwise its day, "Tue 8 Dec". */
  when: "tonight" | "today" | { day: string };
  /** The group's facilitators' first names. */
  facilitators: readonly string[];
  /** The last session is held online. */
  online: boolean;
};

export default function EndSurveyCard({
  survey,
  look,
  lastSession = null,
}: {
  survey: EndSurvey;
  look: "card" | "section";
  /** The last session still to come (the last week); null once the programme is over. */
  lastSession?: LastSession | null;
}) {
  const titleId = `end-survey-${survey.state === "open" ? survey.card.surveyId : survey.surveyId}`;
  const box = look === "card" ? styles.endCard : styles.endSection;

  if (survey.state === "sent") {
    return (
      <section className={box} aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.endTitle}>
          {END_CARD_WORDS.sentHeading}
        </h2>
        <p className={styles.endMuted}>{endCardSentWords(survey.sentOn)}</p>
        {survey.keptUntil && <p className={styles.endSmall}>{endCardKeptWords(survey.keptUntil)}</p>}
      </section>
    );
  }

  const { card } = survey;
  const facts = card.atTheEnd ?? null;
  const lastWeek = lastSession !== null && facts !== null;
  return (
    <section className={box} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.endTitle}>
        {END_CARD_WORDS.heading}
      </h2>
      {lastWeek ? (
        <p className={styles.endLine}>{endCardLastWeekWords({ ...facts, ...lastSession })}</p>
      ) : (
        <p className={styles.endMuted}>{facts ? endCardAfterWords(facts) : card.size}</p>
      )}
      <Link href={card.href} prefetch={false} className={styles.endButton} aria-describedby={titleId}>
        {lastWeek ? END_CARD_WORDS.open : END_CARD_WORDS.answer}
      </Link>
      {lastWeek && facts.closesOn && <p className={styles.endSmall}>{endCardClosesWords(facts.closesOn)}</p>}
    </section>
  );
}
