import type { StaffName } from "@/lib/names/staffName";
import styles from "./StaffNameText.module.css";

/**
 * A name on a staff screen, in its parts: "Priya Shah" then "(Pri)" in a
 * quieter colour, then whatever tells two people with one full name apart,
 * and a guest's "Guest: first name only" in the warning colour.
 *
 * Draws only what it is given. Whether a full name may be shown at all is
 * decided before this, by whoever built the `StaffName`
 * (src/lib/names/staffName.ts), and every screen that does is listed in
 * tests/full-name-readers.test.mjs. Inline, so the caller's own element (a
 * link, a heading, a table cell) carries the name's weight and size. What
 * tells two people apart, and the note, may wrap under the name even where
 * the caller keeps the name on one line, so a long one does not push a
 * table's last column out of sight.
 */
export default function StaffNameText({ name }: { name: StaffName }) {
  return (
    <>
      {name.name}
      {name.goBy && <span className={styles.quiet}> ({name.goBy})</span>}
      {name.apart && <span className={`${styles.quiet} ${styles.mayWrap}`}> · {name.apart}</span>}
      {name.note && <span className={`${styles.note} ${styles.mayWrap}`}> {name.note}</span>}
    </>
  );
}
