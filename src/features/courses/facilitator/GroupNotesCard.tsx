import InitialsChip from "@/components/ui/InitialsChip";
import type { GroupNoteView } from "@/lib/courses/groupNotes/readers";
import { NO_NOTES_YET } from "@/lib/courses/facilitatorPageWords";
import weekly from "@/features/courses/weekly/weekly.module.css";
import NoteForm from "./NoteForm";
import styles from "./facilitator.module.css";

/**
 * The notes a group's facilitators share (C30): "Notes for you and Sofia",
 * who reads them, each note with its writer and day, newest first, and the
 * way to add one for the group's own facilitators.
 *
 * The notes are read on the server by the page that draws this, after its
 * own gate; this card takes them as they are to be shown, and nothing else.
 * The same card shows them to the programme's lead on the Attendance tab,
 * with no way to add one.
 */
export default function GroupNotesCard({
  title,
  whoLine,
  notes,
  writeFor,
  headingId,
}: {
  title: string;
  whoLine: string;
  notes: GroupNoteView[];
  /** The group a reader who may write adds a note to; null draws no box. */
  writeFor: string | null;
  headingId: string;
}) {
  return (
    <section className={weekly.card} aria-labelledby={headingId}>
      <div className={`${weekly.cardHead} ${weekly.cardHeadSpaced}`}>
        <div>
          <h2 id={headingId} className={weekly.cardTitle}>
            {title}
          </h2>
          <p className={styles.notesWho}>{whoLine}</p>
        </div>
      </div>
      {notes.length === 0 ? (
        <p className={weekly.cardLine}>{NO_NOTES_YET}</p>
      ) : (
        <ul className={styles.notes}>
          {notes.map((note) => (
            <li key={note.id} className={styles.note}>
              <div className={styles.noteHead}>
                <InitialsChip name={note.writerName} uid={note.writerUid} size="sm" />
                <p className={styles.noteBy}>{note.byline}</p>
              </div>
              <p className={styles.noteBody}>{note.body}</p>
            </li>
          ))}
        </ul>
      )}
      {writeFor && <NoteForm groupId={writeFor} />}
    </section>
  );
}
