import Chip from "@/components/ui/Chip";
import styles from "./programme.module.css";

export type Step = {
  title: string;
  body: string;
  /** A date or a short fact under the step, set as metadata. Left out when there is none to give. */
  chip?: string | null;
};

/**
 * Numbered steps side by side: how applying works. An ordered list, so the
 * drawn number is decoration and the list itself carries the order.
 */
export default function Steps({ steps }: { steps: Step[] }) {
  const cls = steps.length > 3 ? `${styles.steps} ${styles.stepsFour}` : styles.steps;
  return (
    <ol className={cls}>
      {steps.map((step, index) => (
        <li key={step.title} className={styles.step}>
          <div className={styles.stepTop} aria-hidden="true">
            <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
            <span className={styles.stepRule} />
          </div>
          <h3 className={styles.stepTitle}>{step.title}</h3>
          <p className={styles.stepBody}>{step.body}</p>
          {step.chip ? (
            <p className={styles.stepChip}>
              <Chip className={styles.metaChip}>{step.chip}</Chip>
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
