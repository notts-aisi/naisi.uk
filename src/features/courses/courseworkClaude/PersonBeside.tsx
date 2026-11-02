import PersonNotes from "@/features/admin/memberNotes/PersonNotes";
import PangramPanel from "./PangramPanel";
import styles from "./CourseworkClaude.module.css";

/**
 * THE COLUMN BESIDE ONE PERSON'S WEEKS on a programme's Coursework tab.
 *
 * FOR AN ADMIN (privacy v13):
 *  - Notes about this person (`PersonNotes`, written from this run), with
 *    "Draft a note with Claude" from their coursework on this run.
 *  - Pangram on their counted answers (`PangramPanel`).
 *
 * FOR THE PROGRAMME'S LEAD (privacy v15): the notes about this person kept
 * for admins and the programme's leads, and the lead's own, through the
 * programme's route. No Claude and no Pangram: what they return is seen by
 * admins only, and every route behind them refuses the lead.
 *
 * Never the notes about the person looking: the notes about an admin are
 * other admins' alone, as on the profile, and the notes about a lead are
 * never shown to the lead. So the page hands the lead no column on their own
 * page at all (`beside` stays empty).
 */

type Props = {
  roundId: string;
  programmeId: string;
  runId: string;
  uid: string;
  /** Their name as the page heads it. */
  name: string;
  /** Who is looking: an admin, or the programme's lead. */
  viewer: "admin" | "lead";
  /** The person looking is the person. */
  self: boolean;
};

export default function PersonBeside({ roundId, programmeId, runId, uid, name, viewer, self }: Props) {
  if (viewer === "lead") {
    if (self) return null;
    return (
      <div className={styles.card}>
        <PersonNotes uid={uid} firstName={name} place={{ run: runId }} lead={{ roundId, programmeId }} />
      </div>
    );
  }
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
