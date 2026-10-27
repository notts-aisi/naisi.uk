"use client";

import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import type { PushEmailLine } from "@/lib/courses/pushEmail";
import styles from "./PushConfirm.module.css";
import { pushEmailSentence } from "./registerEndingWords";
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
 *   1. WHO GETS AN EMAIL, AND HOW MANY. While the push sends next week's
 *      email: the group, counted, which a facilitator can check against the
 *      room they were just in, and the session the email is about; or nobody,
 *      and why (the group's last session, a week not published yet). While the
 *      email is on its schedule: nobody. Never worked out here: it is the
 *      route's answer for this register (`email`), the one the push acts on.
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
  /**
   * What pressing the button emails, as the register's route answered it for
   * this register: who, how many and about which session, or why nobody.
   */
  email: PushEmailLine | null;
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
  email,
  scheduled,
}: PushConfirmProps) {
  if (!session) return null;
  const held = session.held;
  const which = `week ${session.weekNumber}${session.occurrence > 1 ? `, session ${session.occurrence}` : ""}`;
  const button = scheduled ? "Finish the register" : "Push attendance";
  // The route's answer for this register. Without one (a payload from before
  // the route gave it), the schedule's line still holds, and while the push
  // sends the email nothing is said rather than a guess.
  const emailLine = email
    ? pushEmailSentence(groupName, email)
    : scheduled
      ? pushEmailSentence(groupName, { kind: "scheduled" })
      : null;

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
          {emailLine && <li>{emailLine}</li>}
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
