import Link from "next/link";
import type { FormScreen } from "@/lib/anonymousFeedback/view";
import { FORM_WORDS } from "@/lib/anonymousFeedback/words";
import AnonymousForm from "./AnonymousForm";
import styles from "./anonymousFeedback.module.css";

/**
 * The anonymous form's page body: the programme, the title and intro, then
 * the box that says the form is anonymous and how, BEFORE the questions; or
 * one calm message in place of all of it. A Server Component: the form below
 * the box takes only the two values it draws.
 */
export default function AnonymousFormScreen({ screen }: { screen: FormScreen }) {
  if (screen.state === "message") {
    return (
      <div className={styles.message}>
        <h1 className={styles.messageTitle}>{screen.title}</h1>
        <p className={styles.messageBody}>{screen.body}</p>
      </div>
    );
  }
  return (
    <div className={styles.screen}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>{screen.eyebrow}</p>
        <h1 className={styles.title}>{FORM_WORDS.title}</h1>
        <p className={styles.intro}>{screen.intro}</p>
        <p className={styles.skippable}>{FORM_WORDS.skippable}</p>
      </header>

      <section className={styles.box} aria-label={screen.box.heading}>
        <p className={styles.boxHead}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            <path d="M3 3l18 18" />
          </svg>
          <span>{screen.box.heading}</span>
        </p>
        <ul className={styles.points}>
          {screen.box.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className={styles.note}>{screen.box.note}</p>
        <Link href="/privacy#data-we-collect" prefetch={false} className={styles.policyLink}>
          {FORM_WORDS.policyLink}
        </Link>
      </section>

      <AnonymousForm token={screen.token} closing={screen.closing} />
    </div>
  );
}
