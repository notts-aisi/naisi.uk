import Link from "next/link";
import ProgressBar from "@/components/ui/ProgressBar";
import { termDay } from "@/features/term/termWords";
import { Check } from "./icons";
import type { ProfileSteps } from "./homeData";
import styles from "./home.module.css";

/**
 * The two small cards beside the events on a member's Home.
 *
 * Both are Server Components and both can draw nothing: a member with a
 * finished profile is not told about it, and "Nothing yet" is said only while
 * there is something to apply to.
 */

const STEPS: { key: keyof ProfileSteps; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "study", label: "What you study" },
  { key: "graduation", label: "When you graduate" },
  { key: "universityEmail", label: "University email" },
];

export function FinishProfile({ steps }: { steps: ProfileSteps | null }) {
  if (!steps) return null;
  const done = STEPS.filter((step) => steps[step.key]).length;
  if (done === STEPS.length) return null;

  return (
    <section className={styles.card} aria-labelledby="home-finish-profile">
      <div className={styles.cardHead}>
        <h2 id="home-finish-profile" className={styles.cardTitle}>
          Finish your profile
        </h2>
      </div>
      <div className={styles.progressRow}>
        <ProgressBar value={done} max={STEPS.length} size="sm" ariaLabel="Profile completed" />
        <span className={`meta ${styles.progressCount}`}>
          {done} of {STEPS.length} done
        </span>
      </div>
      <ul className={styles.steps} role="list">
        {STEPS.map((step) => (
          <li key={step.key} className={steps[step.key] ? styles.stepDone : styles.stepToDo}>
            <span className={styles.stepMark} aria-hidden="true">
              {steps[step.key] && <Check size={14} />}
            </span>
            <span>
              <span className={styles.srOnly}>{steps[step.key] ? "Done: " : "To do: "}</span>
              {step.label}
            </span>
          </li>
        ))}
      </ul>
      {!steps.universityEmail && (
        <p className={styles.small}>
          Your university email lets us match you to the SU’s membership list.
        </p>
      )}
      <div>
        <Link href="/profile" className={styles.secondary}>
          Finish your profile
        </Link>
      </div>
    </section>
  );
}

/**
 * "Your applications", for a member who has not applied while applications
 * are open. Once they have applied, the page draws the card that lists their
 * applications in this place instead.
 */
export function NoApplicationsYet({ closesAt }: { closesAt: Date | null }) {
  return (
    <section className={styles.card} aria-labelledby="home-no-applications">
      <div className={styles.cardHead}>
        <h2 id="home-no-applications" className={styles.cardTitle}>
          Your applications
        </h2>
      </div>
      <div className={styles.dashed}>
        <p className={styles.dashedTitle}>Nothing yet.</p>
        {closesAt && <p className={styles.small}>Applications close {termDay(closesAt)}.</p>}
      </div>
    </section>
  );
}
