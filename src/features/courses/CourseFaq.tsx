import type { CoursePageFaq } from "@/lib/firestore/coursePages";
import styles from "./CourseFaq.module.css";

/**
 * The questions on a programme page: a short head on the left, the questions
 * on the right.
 *
 * Native `<details>` / `<summary>`, not the shared `ui/Accordion`. Three
 * reasons, and the first is the one that decides it:
 *
 *  1. `Accordion` is a `"use client"` component with controlled open state, so
 *     using it would turn this section into a client island on a page that is
 *     otherwise entirely server-rendered, for a disclosure the platform
 *     implements natively.
 *  2. `<details>` works before hydration and without JavaScript at all, which
 *     on a marketing page reached from a poster QR code on patchy campus
 *     Wi-Fi is the difference between an answer and a stub.
 *  3. Its content is in the document whether or not it is open, so a search
 *     engine indexes the answers.
 *
 * The trade is that the open/close cannot be animated the way the shared
 * accordion animates. On a list of five questions that is a fair price.
 *
 * Questions and answers are TEXT NODES; `white-space: pre-line` keeps the
 * author's paragraph breaks without anything parsing the string.
 *
 * The first question starts open, so the list reads as one that opens.
 */

/** Where a question that is not on the list goes. */
const CONTACT = "ai-safety@uonsu.com";

type Props = {
  items: CoursePageFaq[];
  /** The small label over the title. */
  eyebrow?: string;
  title?: string;
};

export default function CourseFaq({ items, eyebrow = "FAQ", title = "Questions." }: Props) {
  if (items.length === 0) return null;

  return (
    <div className={styles.layout}>
      <div className={styles.head}>
        <p className={`meta ${styles.eyebrow}`}>{eyebrow}</p>
        <h2 id="course-faq-heading" className={styles.heading}>
          {title}
        </h2>
        <p className={styles.contact}>
          Something else? Email{" "}
          <a href={`mailto:${CONTACT}`} className={styles.contactLink}>
            {CONTACT}
          </a>
          .
        </p>
      </div>
      <div className={styles.list}>
        {items.map((item, i) => (
          <details key={`${item.q}-${i}`} className={styles.item} open={i === 0}>
            <summary className={styles.summary}>
              <span className={styles.question}>{item.q}</span>
              <span aria-hidden="true" className={styles.chevron}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  focusable="false"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </summary>
            <p className={styles.answer}>{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
