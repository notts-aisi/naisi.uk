/**
 * A RESTORE EMAILS NOBODY, LATER AS WELL AS NOW (and `registerOwed`, below,
 * is the question the readers of an unfinished register ask). A group's sessions that
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

/**
 * WHETHER A REGISTER IS OWED FOR THIS SESSION OF THIS GROUP: the one
 * question every reader of an unfinished register asks before it lists,
 * counts, chases, reminds or offers to take one (the Overview's sessions and
 * Needs attention, the Remind press and its route, the group page's ways to
 * take a register, the register reminder and the register-not-taken card).
 * None is owed while the group is archived, nor for a session that started
 * before it was last restored: it passed while the group was archived, and
 * nobody met. A register that WAS taken for such a session still shows and
 * counts as any register does; this only stops anybody being asked for one.
 */
export function registerOwed(
  group: { archived?: boolean; restoredAt?: Date | null },
  startsAt: Date | null,
): boolean {
  if (group.archived === true) return false;
  return !startedBeforeRestore(group, startsAt);
}
