"use client";

import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import styles from "./PushConfirm.module.css";
import type { AttendanceSession } from "./useAttendance";

/**
 * The confirm in front of FINISHING a register: "Finish the register" while
 * next week's email is on its schedule, "Push attendance" while pushing still
 * sends it.
 *
 * Finishing is the only irreversible thing a facilitator can do on this page,
 * so the dialog names what it does in the order it matters to the person
 * pressing it:
 *
 *   1. WHO GETS AN EMAIL. While the push sends next week's email, a count of
 *      their own group, which a facilitator can check against the room they
 *      were just in. While the email is on its schedule: nobody.
 *   2. THE REGISTER LOCKS. Said plainly, with the remedy: an admin can still
 *      correct it. A confirm that says "are you sure?" and nothing else teaches
 *      people to press through it.
 *   3. THE RECORD MOVES. Everyone's attendance figures are rebuilt from this
 *      register, and everyone sees their mark.
 *
 * ── UNMARKED PEOPLE ARE THE THING WORTH INTERRUPTING FOR ────────────────────
 * A finished register counts an unmarked person as absent, because finishing
 * is the facilitator saying the register is complete. That is right, and it
 * is also the single easiest mistake to make on a busy evening, so the dialog
 * says how many are unmarked and what will happen to them, in their own
 * paragraph, before the button.
 *
 * ── A SESSION THAT DID NOT HAPPEN ───────────────────────────────────────────
 * When the held switch is off the copy changes: nobody is marked absent and
 * the session leaves every denominator. Same button, a different fact.
 */

export type PushConfirmProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
  session: AttendanceSession | null;
  /** The group's name, for the sentence that names who is being emailed. */
  groupName: string;
  /** Everyone eligible to be marked in this session. */
  eligible: number;
  /** How many of them carry no mark yet. */
  unmarked: number;
  /** The next session, when there is one, so the dialog can name what the email is about. */
  nextLabel: string | null;
  /**
   * True when next week's email is on its schedule: the button is "Finish the
   * register" and nobody is emailed.
   */
  scheduled: boolean;
};

function people(n: number): string {
  return n === 1 ? "1 person" : `${n} people`;
}

export default function PushConfirm({
  open,
  onClose,
  onConfirm,
  busy,
  session,
  groupName,
  eligible,
  unmarked,
  nextLabel,
  scheduled,
}: PushConfirmProps) {
  if (!session) return null;
  const held = session.held;
  const which = `week ${session.weekNumber}${session.occurrence > 1 ? `, session ${session.occurrence}` : ""}`;
  const button = scheduled ? "Finish the register" : "Push attendance";

  return (
    <Modal open={open} onClose={onClose} ariaLabel={`${button}: ${which}`} width="sm">
      {/* Addressed by the browser end-to-end suite, which reads this dialog's
          copy back: naming who is emailed and that the register locks is the
          reason the confirm exists. */}
      <div className={styles.root} data-testid="push-confirm">
        <h2 className={styles.title}>
          {scheduled ? `Finish the ${which} register?` : `Push ${which}?`}
        </h2>

        <ul className={styles.points}>
          <li>
            {scheduled
              ? "Nobody’s emailed. Next week’s email goes on its own schedule, whatever happens here."
              : nextLabel
                ? `Everyone in ${groupName || "this group"} gets one email about ${nextLabel}.`
                : "Nobody is emailed: this is the group’s last session, so there is nothing to remind them about."}
          </li>
          <li>
            The register locks. An admin can still correct it afterwards, and every
            change they make is recorded.
          </li>
          <li>
            {held
              ? "Everyone sees their mark, and everyone’s attendance figures are rebuilt from this register."
              : "This session is marked as not held, so it leaves everyone’s attendance figures rather than counting against them."}
          </li>
        </ul>

        {held && unmarked > 0 && (
          <p className={styles.warning}>
            {people(unmarked)} of {eligible} {unmarked === 1 ? "has" : "have"} no mark
            yet, and {scheduled ? "finishing" : "pushing"} counts them absent. Close
            this and mark them if that is not right.
          </p>
        )}

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Not yet
          </Button>
          <Button onClick={onConfirm} disabled={busy} data-testid="push-confirm-submit">
            {busy ? (scheduled ? "Finishing..." : "Pushing...") : button}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
