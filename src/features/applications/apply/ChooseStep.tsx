"use client";

import kit from "@/features/applications/kit/kit.module.css";
import type { ApplicantProgramme } from "@/lib/applications/applicant/types";
import { TickIcon } from "./icons";
import styles from "./form.module.css";

/**
 * Choose: one big card per programme that is taking applications, each a
 * real tick box. Ticking adds the programme to the end of the person's
 * order; unticking takes it out.
 *
 * A programme they ticked that has since closed is still shown, with a line
 * saying so, because the only way to carry on is to untick it and they cannot
 * untick what they cannot see.
 */
export default function ChooseStep({
  programmes,
  ranked,
  onToggle,
  problems,
}: {
  /** Every programme on the form, in its order. */
  programmes: readonly ApplicantProgramme[];
  ranked: readonly string[];
  onToggle: (programmeId: string) => void;
  problems: readonly string[];
}) {
  const shown = programmes.filter((programme) => !programme.closed || ranked.includes(programme.id));
  return (
    <div className={styles.body}>
      {problems.length > 0 ? (
        <div className={styles.notice} data-tone="warn" role="alert">
          <ul>
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {shown.length === 0 ? (
        <p className={styles.lede}>Nothing is taking applications at the moment.</p>
      ) : (
        <fieldset className={styles.cards}>
          <legend className="visually-hidden">Programmes you’re interested in</legend>
          {shown.map((programme) => {
            const on = ranked.includes(programme.id);
            return (
              <label key={programme.id} className={styles.card} data-on={on ? "true" : "false"}>
                <input
                  type="checkbox"
                  className={styles.native}
                  checked={on}
                  onChange={() => onToggle(programme.id)}
                />
                <span aria-hidden="true" className={styles.box} data-on={on ? "true" : "false"}>
                  {on ? <TickIcon size={15} strokeWidth={3} /> : null}
                </span>
                <span className={styles.cardText}>
                  <span className={styles.cardName}>{programme.name}</span>
                  {programme.pitch ? <span className={styles.cardPitch}>{programme.pitch}</span> : null}
                  {programme.facts ? (
                    <span className={styles.cardFacts}>
                      <span className={`${kit.mono} ${styles.cardFactsText}`}>{programme.facts}</span>
                    </span>
                  ) : null}
                  {programme.closed ? (
                    <span className={styles.error}>Not taking applications. Untick it to carry on.</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}
    </div>
  );
}
