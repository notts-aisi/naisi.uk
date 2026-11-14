/**
 * WHERE A PAGE IN THE BROWSER READS ONE WEEK, from what the overview sent
 * (`OverviewPayload.forkedWeekIds` and, for somebody whose place records a
 * move mid-term, `forkedWeekGroups`). Pure, and safe in a client module.
 *
 * The answer is the group whose own copy of the week to read, or null for the
 * run's own week. The SERVER decides it: a listed week is read from the group
 * `forkedWeekGroups` names when it names one (the group the place belonged to
 * that week, the same answer every save route gives), and otherwise from the
 * reader's group, as it always was. The browser never works it out from the
 * place.
 */
export type WeekCopySource = {
  /** The reader's own group, or null when they have none (the run's own weeks). */
  groupId: string | null;
  /** Week doc ids read from a group's own copy: `OverviewPayload.forkedWeekIds`. */
  forkedWeekIds: readonly string[];
  /** For somebody moved mid-term only: each of those ids with the group whose copy it is. */
  forkedWeekGroups?: Readonly<Record<string, string>>;
};

/** The group whose own copy of `weekId` this reader reads, or null for the run's own week. */
export function weekCopyGroupOf(weekId: string, source: WeekCopySource | null): string | null {
  if (!source || !source.forkedWeekIds.includes(weekId)) return null;
  const groupId = source.forkedWeekGroups?.[weekId] ?? source.groupId;
  return groupId ? groupId : null;
}

/**
 * Whether `weekId` is read from the own copy of the group the reader is in
 * NOW: the one week the member's page may say is "your group's version"
 * ("Customised by your facilitator", and its line "Your facilitator has made
 * this week their own..."). A week somebody moved mid-term spent in another
 * group is read from that group's copy, which is neither their group's now
 * nor their facilitator's, so the page says nothing of it. With no record of
 * groups by week it is exactly whether the week is read from a group's copy,
 * as always.
 */
export function readsOwnGroupsVersion(weekId: string, source: WeekCopySource | null): boolean {
  const groupId = weekCopyGroupOf(weekId, source);
  return groupId !== null && groupId === source?.groupId;
}
