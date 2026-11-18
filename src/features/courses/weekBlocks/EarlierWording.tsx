import styles from "./earlierWording.module.css";

/**
 * THE WORDS A QUESTION HAD WHEN AN ANSWER WAS WRITTEN, under the answer,
 * where the question has been reworded in place since
 * (`src/lib/courses/weekEdit/askedThen.ts` reads them, `earlierQuestionWords`
 * decides whether there is anything to say). For the person, "You answered
 * an earlier wording:"; for the people who read their work, "The question
 * when this was written:". The words alone, one paragraph a line written;
 * nothing at all when the words are the same.
 *
 * Neither a client nor a server module: the week page's boxes, the reading
 * view of a person's week and the page of one question across a group all
 * draw it.
 */
export default function EarlierWording({ label, words }: { label: string; words: string | null }) {
  if (!words) return null;
  const lines = words
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    <div className={styles.earlier}>
      <p className={styles.label}>{label}</p>
      <div className={styles.words}>
        {lines.map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    </div>
  );
}
