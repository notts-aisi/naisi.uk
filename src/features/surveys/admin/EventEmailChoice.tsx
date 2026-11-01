"use client";

import { useState, type ReactNode } from "react";
import OptionRow from "@/components/ui/OptionRow";
import type { AudienceChoice } from "@/lib/surveys/events/adminView";
import { SEND_TAB_WORDS, emailsWords } from "@/lib/surveys/events/words";
import SendActions from "./SendActions";
import styles from "./surveyAdmin.module.css";
import eventStyles from "./eventSurvey.module.css";

/**
 * The Send tab of a survey after an event before its email goes (sv-send):
 * step 1, who answers, with the choice of who the email goes to (everyone who
 * came with an email, or everyone who signed up), each with how many it holds
 * and how many already answered at the event; then the steps between, drawn
 * by the server; then "Send a test to me" and the button that sends it, whose
 * number follows the choice. The choice travels with the press, and the first
 * email fixes it.
 */
export default function EventEmailChoice({
  surveyId,
  eventLine,
  choices,
  initial,
  testFresh,
  testLine,
  blocked,
  between,
}: {
  surveyId: string;
  /** "VR games night · Sun 1 Nov". */
  eventLine: string;
  choices: AudienceChoice[];
  /** The audience the survey holds now. */
  initial: AudienceChoice["kind"];
  testFresh: boolean;
  testLine: string;
  blocked: string;
  /** Steps 2 and 3, the QR code and the email, drawn by the server. */
  between: ReactNode;
}) {
  const [picked, setPicked] = useState<AudienceChoice["kind"]>(choices.some((choice) => choice.kind === initial) ? initial : choices[0].kind);
  const choice = choices.find((each) => each.kind === picked) ?? choices[0];
  return (
    <>
      <section className={`${styles.card} ${styles.section}`} aria-labelledby="send-who">
        <h2 id="send-who" className={`${styles.sectionTitle} ${eventStyles.step}`}>
          <span className={eventStyles.stepNumber} aria-hidden="true">
            1
          </span>
          {SEND_TAB_WORDS.whoHeading}
        </h2>
        <p className={styles.lead}>
          <strong>{SEND_TAB_WORDS.who}</strong> {SEND_TAB_WORDS.whoLine}
        </p>
        <p className={styles.muted}>
          {SEND_TAB_WORDS.event}: {eventLine}
        </p>
        <fieldset className={eventStyles.choices}>
          <legend className={styles.label}>Email</legend>
          {choices.map((each) => (
            <OptionRow
              key={each.kind}
              type="radio"
              name="audience"
              value={each.kind}
              checked={each.kind === picked}
              onChange={() => setPicked(each.kind)}
            >
              {each.label}: {each.total}
              {each.detail && <span className={eventStyles.choiceDetail}>{each.detail}</span>}
            </OptionRow>
          ))}
        </fieldset>
        {choice.answered > 0 && (
          <p className={styles.muted}>
            {choice.answered === 1
              ? "1 person already answered at the event while signed in, so they won’t get the email."
              : `${choice.answered} people already answered at the event while signed in, so they won’t get the email.`}
          </p>
        )}
        <p className={eventStyles.emails}>{emailsWords(choice.emails)}</p>
      </section>
      {between}
      <SendActions
        surveyId={surveyId}
        kind="first"
        emails={choice.emails}
        testFresh={testFresh}
        testLine={testLine}
        blocked={blocked}
        extraBody={choice.kind === "event-missed" ? {} : { audience: choice.kind === "event-came" ? "came" : "signups" }}
      />
    </>
  );
}
