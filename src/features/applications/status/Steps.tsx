import kit from "@/features/applications/kit/kit.module.css";
import { TickIcon } from "@/features/applications/apply/icons";
import type { StatusStep, StepState } from "@/lib/applications/status/view";
import styles from "./status.module.css";

/**
 * Sent, Hear back, Meet your group: the three steps of a term, down a rail.
 *
 * Where each step stands is drawn (a tick, a lit dot, an empty ring) and also
 * said, in words only a screen reader meets, because a colour is not a
 * status. The step everybody is waiting on carries `aria-current`.
 *
 * No state and no effect, so the same component is drawn by the page on the
 * server and by the form in the browser straight after a send.
 */

const SAID: Record<StepState, string> = { done: "done", now: "now", next: "next" };

export default function Steps({ steps }: { steps: readonly StatusStep[] }) {
  return (
    <ol className={styles.steps}>
      {steps.map((step, at) => (
        <li
          key={step.name}
          className={styles.step}
          data-state={step.state}
          aria-current={step.state === "now" ? "step" : undefined}
        >
          <div className={styles.rail}>
            <span className={styles.mark}>
              {step.state === "done" ? <TickIcon size={14} strokeWidth={3} /> : null}
            </span>
            {at < steps.length - 1 ? <span aria-hidden="true" className={styles.line} /> : null}
          </div>
          <div className={styles.stepBody}>
            <div className={styles.stepText}>
              <div className={styles.stepName}>
                {step.name}
                <span className="visually-hidden">, {SAID[step.state]}</span>
              </div>
              {step.when ? (
                <div className={styles.stepWhen}>
                  <span className={kit.mono}>{step.when}</span>
                </div>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
