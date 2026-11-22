"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import * as O from "@/lib/courses/excused/ownWords";
import { NO_MEDICAL_DETAILS, SEND_THE_REQUEST } from "@/lib/courses/excused/words";
import type { ChangeGroupPageView } from "@/lib/courses/moveRequest/own";
import { MOVE_ASK_REFUSAL, WHY_NEEDED } from "@/lib/courses/moveRequest/words";
import { SENT_DECIDED } from "@/lib/courses/visitRequest/words";
import { MEMBER_REQUEST_LIMITS } from "@/lib/firestore/courseMemberRequests";
import { askToChangeGroup } from "./api";
import excuse from "../excused/Excuse.module.css";
import styles from "../visitRequest/VisitRequest.module.css";

/**
 * THE FORM ON "CHANGE GROUP FOR GOOD": "From the next week whose session
 * hasn't happened. An admin decides. ...", "Groups with a place" (each other
 * group that still meets with a place, its usual time on one line and its
 * campus, room, facilitators and places left on the next, and room for one
 * line under each), "Why (needed)" with the line about medical details, and
 * "Send the request". A full group is not offered; with none: "No other
 * group has a place right now." The route decides everything again; a
 * refusal is its own sentence. Once sent: "Sent. You'll get an email when
 * it's decided." in the form's place.
 *
 * Takes the fields it draws and nothing else.
 */
export default function ChangeGroupForm({
  runId,
  form,
  locked = false,
}: {
  runId: string;
  form: NonNullable<ChangeGroupPageView["form"]>;
  locked?: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [chosen, setChosen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!chosen) {
      setProblem(MOVE_ASK_REFUSAL.chooseFirst);
      return;
    }
    if (!reason.trim()) {
      setProblem(MOVE_ASK_REFUSAL.sayWhy);
      return;
    }
    setBusy(true);
    setProblem(null);
    const answer = await askToChangeGroup(runId, chosen, reason);
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
      {/* With no group with a place, the sentence stands where the list would. */}
      {form.noneWithAPlace ? (
        <p className={excuse.line}>{MOVE_ASK_REFUSAL.noneWithAPlace}</p>
      ) : (
        <fieldset className={styles.choices}>
          <legend className={excuse.legend}>{form.legend}</legend>
          {form.choices.map((choice) => (
            <label key={choice.groupId} className={styles.choice}>
              <input
                type="radio"
                name="group"
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
          ))}
        </fieldset>
      )}
      <p className={excuse.medical}>{NO_MEDICAL_DETAILS}</p>
      <label className={excuse.field}>
        <span className={excuse.fieldLabel}>{WHY_NEEDED}</span>
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
      <p className={excuse.problem} role="status">
        {problem ?? ""}
      </p>
    </form>
  );
}
