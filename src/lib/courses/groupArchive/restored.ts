/**
 * A RESTORE EMAILS NOBODY, LATER AS WELL AS NOW. A group's sessions that
 * passed while it was archived come back with no register, and nobody met
 * at them. Every scheduled job that walks a live group's sessions and might
 * write to somebody about one (the facilitators' register reminder, the
 * register-not-taken card, next week's email, the reminders before a
 * session) asks this first and leaves out any session that STARTED BEFORE
 * the group was last restored (`courseGroups.restoredAt`, written only by
 * the archive route). A group never restored has no `restoredAt`, and every
 * session counts as it always did.
 *
 * Pure: no reads, no clock.
 */
export function startedBeforeRestore(
  group: { restoredAt?: Date | null },
  startsAt: Date | null,
): boolean {
  const restoredAt = group.restoredAt ?? null;
  if (!restoredAt || !startsAt) return false;
  return startsAt.getTime() < restoredAt.getTime();
}
