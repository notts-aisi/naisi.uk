import styles from "./checkIn.module.css";

/**
 * SOMEBODY CHECKED IN, as the check-in page says it: "You’re checked in,
 * Kofi." and "Checked in at 2:05pm.". The one view of it, drawn by the page
 * for somebody who was already checked in when it loaded, and by its button
 * the moment its press goes through (B5), so the question "Are you here?" is
 * never left above the answer to it. No server import: the button draws it in
 * the browser.
 */

/** "You’re checked in, Kofi.", "You’re checked in." with no first name. */
export function checkedInTitle(firstName: string | null): string {
  return firstName ? `You’re checked in, ${firstName}.` : "You’re checked in.";
}

/**
 * The line under the answer, about the door list: once checked in, what the
 * press did ("You’re on the door list."), in place of what it would do ("This
 * checks you in on the door list."); who can see who came is the same words.
 * Listed in the build notes for the boards' designers to confirm.
 */
export const ON_THE_LIST =
  "You’re on the door list. Only NAISI’s admins and the committee members the Students’ Union recognises can see who came.";

export function CheckedIn({ firstName, atWords }: { firstName: string | null; atWords: string }) {
  return (
    <>
      <h1 className={styles.title}>{checkedInTitle(firstName)}</h1>
      <p className={styles.lead} role="status">
        Checked in at {atWords}.
      </p>
      <p>{ON_THE_LIST}</p>
    </>
  );
}
