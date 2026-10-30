import PersonNotes from "@/features/admin/memberNotes/PersonNotes";
import PangramPanel from "./PangramPanel";
import styles from "./CourseworkClaude.module.css";

/**
 * THE COLUMN BESIDE ONE PERSON'S WEEKS on a programme's Coursework tab
 * (privacy v13), FOR AN ADMIN ALONE: the page hands it over only when the
 * viewer is an admin, never to the programme's lead, and every route behind
 * it refuses the lead too.
 *
 *  - Notes about this person (`PersonNotes`, written from this run), with
 *    "Draft a note with Claude" from their coursework on this run. Not on an
 *    admin's own page: the notes about an admin are other admins' alone, as
 *    on the profile.
 *  - Pangram on their counted answers (`PangramPanel`).
 */

type Props = {
  roundId: string;
  programmeId: string;
  runId: string;
  uid: string;
  /** Their name as the page heads it. */
  name: string;
  /** The admin looking is the person. */
  self: boolean;
};

export default function PersonBeside({ roundId, programmeId, runId, uid, name, self }: Props) {
  return (
    <>
      {!self && (
        <div className={styles.card}>
          <PersonNotes uid={uid} firstName={name} place={{ run: runId }} draft="run" />
        </div>
      )}
      <div className={styles.card}>
        <PangramPanel roundId={roundId} programmeId={programmeId} uid={uid} />
      </div>
    </>
  );
}
