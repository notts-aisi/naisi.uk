import styles from "./feedback.module.css";

/**
 * An earlier version's labelled boxes in the week's order (`labels`, each
 * box's id and label); with no labels to hand, each box's words in the order
 * stored. None for an answer of one box.
 */
export function versionBoxes(
  boxes: Record<string, string> | null,
  labels: ReadonlyArray<{ id: string; label: string }>,
): Array<{ label: string; text: string }> {
  if (!boxes) return [];
  return labels.length > 0
    ? labels.map((box) => ({ label: box.label, text: boxes[box.id] ?? "" }))
    : Object.values(boxes).map((text) => ({ label: "", text }));
}

/**
 * AN EARLIER VERSION OF A PIECE OF WRITTEN WORK, stacked under what it is
 * about and labelled plainly ("The version this feedback was about", "As it
 * stood at the session"), so nothing anyone wrote about an answer reads as if
 * it were about words it was not about. The words alone, one paragraph a line
 * written, each labelled box under its label; never side by side with the
 * latest (a compare is a later piece). `when` is the line under the label,
 * "Saved Tue 3 Nov, 8:15pm.", or "" for none.
 */
export default function EarlierVersion({
  label,
  when = "",
  text,
  boxes = [],
}: {
  label: string;
  when?: string;
  /** An answer of one box, or a reflection or fill-in box: its words. */
  text: string;
  /** An answer in labelled boxes, in the week's order: each label and its words. Empty for one box. */
  boxes?: ReadonlyArray<{ label: string; text: string }>;
}) {
  const lines = (words: string) =>
    words
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  return (
    <div className={styles.version}>
      <p className={styles.versionLabel}>{label}</p>
      {when && <p className={styles.versionWhen}>{when}</p>}
      <div className={styles.versionText}>
        {boxes.length > 0
          ? boxes.map((box, index) => (
              <div key={index}>
                {box.label && <p className={styles.versionBoxLabel}>{box.label}</p>}
                {lines(box.text).map((line, at) => (
                  <p key={at}>{line}</p>
                ))}
              </div>
            ))
          : lines(text).map((line, at) => <p key={at}>{line}</p>)}
      </div>
    </div>
  );
}
