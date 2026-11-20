/**
 * WHAT CHANGE A SESSION'S PANEL DOES WITH A 409, decided here so a test can
 * ask it. The press is refused, with nothing written, when what its preview
 * said no longer holds: the count of emails on the button (`emails`), or the
 * count of emails to the people visiting the session (`visitEmails`, a visit
 * arranged or ended since). Either way the panel asks for its preview again,
 * so the next press carries the counts as they now are, as the register's own
 * correction sheet does for `visitEmails` (`ColumnSheet.tsx`). Without that,
 * every later press sent the same stale count and was refused again until the
 * panel was closed and opened.
 *
 * Pure, with no import, so the panel and the tests read one answer.
 */
export function afterChangeRefused(
  status: number,
  body: Record<string, unknown> | null | undefined,
): { askAgain: boolean; emailsSaid: number | null } {
  if (status !== 409 || !body) return { askAgain: false, emailsSaid: null };
  const emailsSaid = typeof body.emails === "number" ? body.emails : null;
  return { askAgain: emailsSaid !== null || typeof body.visitEmails === "number", emailsSaid };
}
