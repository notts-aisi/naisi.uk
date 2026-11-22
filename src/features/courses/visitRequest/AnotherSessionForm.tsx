"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import * as O from "@/lib/courses/excused/ownWords";
import { NO_MEDICAL_DETAILS, SEND_THE_REQUEST } from "@/lib/courses/excused/words";
import { FULL_THIS_WEEK } from "@/lib/courses/visit/words";
import type { AnotherSessionPageView } from "@/lib/courses/visitRequest/own";
import { ANYTHING_TO_ADD, ASK_REFUSAL, ONE_AT_A_TIME, SENT_DECIDED, WOULD_JOIN_ONLINE } from "@/lib/courses/visitRequest/words";
import { MEMBER_REQUEST_LIMITS } from "@/lib/firestore/courseMemberRequests";
import { askForVisit } from "./api";
import excuse from "../excused/Excuse.module.css";
import styles from "./VisitRequest.module.css";

/**
 * THE FORM ON "ANOTHER SESSION THIS WEEK": the week's sessions, each with a
 * place as a choice, with its "Why:" line when the server sent one, and each
 * full one shown and not choosable ("Full this week"), the tick "I’d join online" (off unless ticked), "Anything to add
 * (optional)" with the line about medical details,
 * "Send the request", and "One request at a time. You can withdraw it until
 * it's decided." under it. The route decides everything again; a refusal is
 * its own sentence. Once sent: "Sent. You'll get an email when it's decided."
 * in the form's place, and nothing more until the page is next opened: a read
 * of it now would draw the request waiting there instead, and that line would go.
 *
 * Takes the fields it draws and nothing else.
 */
export default function AnotherSessionForm({
  runId,
  form,
  locked = false,
}: {
  runId: string;
  form: NonNullable<AnotherSessionPageView["form"]>;
  locked?: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [chosen, setChosen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!chosen) {
      setProblem(ASK_REFUSAL.chooseFirst);
      return;
    }
    setBusy(true);
    setProblem(null);
    const answer = await askForVisit(runId, chosen, reason, online);
    setBusy(false);
    if (!answer.ok) {
      setProblem(answer.status === 0 ? O.DIDNT_SEND : (answer.error ?? O.DIDNT_SEND));
      router.refresh();
      return;
    }
    setSent(true);
  }

  // Said once, in the form's place: the programme page, read again, shows the request waiting.
  if (sent) {
    return (
      <p className={excuse.line} role="status">
        {SENT_DECIDED}
      </p>
    );
  }

  return (
    <form
      className={styles.page}
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
     
    >
      <p className={excuse.line}>{form.intro}</p>
      <fieldset className={styles.choices}>
        <legend className={excuse.legend}>{form.legend}</legend>
        {form.choices.map((choice) =>
          choice.full ? (
            <div key={choice.groupId} className={`${styles.choice} ${styles.choiceFull}`} data-full="true">
              <div className={styles.choiceBody}>
                <p className={styles.choiceTitle}>{choice.words}</p>
                {choice.detail && <p className={excuse.small}>{choice.detail}</p>}
                {choice.why && <p className={excuse.small}>{choice.why}</p>}
                <span className={`${excuse.chip} ${excuse.chipPlain}`}>{FULL_THIS_WEEK}</span>
              </div>
            </div>
          ) : (
            <label key={choice.groupId} className={styles.choice}>
              <input
                type="radio"
                name="host"
                value={choice.groupId}
                checked={chosen === choice.groupId}
                onChange={() => setChosen(choice.groupId)}
                disabled={!hydrated || locked || busy}
              />
              <span className={styles.choiceBody}>
                <span className={styles.choiceTitle}>{choice.words}</span>
                {choice.detail && <span className={excuse.small}>{choice.detail}</span>}
                {choice.why && <span className={excuse.small}>{choice.why}</span>}
              </span>
            </label>
          ),
        )}
      </fieldset>
      {form.noneWithAPlace && <p className={excuse.line}>{ASK_REFUSAL.noneWithAPlace}</p>}
      <label className={styles.tick}>
        <input type="checkbox" checked={online} onChange={(event) => setOnline(event.target.checked)} disabled={!hydrated || locked || busy || form.noneWithAPlace} />
        <span>{WOULD_JOIN_ONLINE}</span>
      </label>
      <p className={excuse.medical}>{NO_MEDICAL_DETAILS}</p>
      <label className={excuse.field}>
        <span className={excuse.fieldLabel}>{ANYTHING_TO_ADD}</span>
        <textarea
          className={excuse.textarea}
          value={reason}
          maxLength={MEMBER_REQUEST_LIMITS.reason}
          rows={2}
          onChange={(event) => setReason(event.target.value.replace(/[\r\n]+/g, " "))}
          disabled={!hydrated || locked || busy}
        />
      </label>
      <div className={styles.actions}>
        <button type="submit" className={excuse.primary} disabled={!hydrated || locked || busy || form.noneWithAPlace}>
          {busy ? O.SENDING : SEND_THE_REQUEST}
        </button>
      </div>
      <p className={excuse.small}>{ONE_AT_A_TIME}</p>
      <p className={excuse.problem} role="status">
        {problem ?? ""}
      </p>
    </form>
  );
}
