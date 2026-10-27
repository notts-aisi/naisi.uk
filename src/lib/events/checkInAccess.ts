/**
 * Who runs check-in at an event, decided in one place.
 *
 * Admins and the committee members the Students' Union recognises: the same
 * people who already see who signed up (the sign-ups rule in
 * `firestore.rules`, and the attendees page). The door list shows everyone who
 * signed up, so it can be shown to nobody wider than that. An organiser who is
 * not recognised sees how many came, never who.
 *
 * No server-only marker: the event pages ask it to decide what to draw, and
 * every route asks it again before it reads or writes a check-in.
 */
export type CheckInViewer = {
  role: string | null | undefined;
  suRecognised?: boolean | null;
};

export function runsCheckIn(viewer: CheckInViewer | null | undefined): boolean {
  if (!viewer) return false;
  return viewer.role === "admin" || (viewer.role === "committee" && viewer.suRecognised === true);
}
