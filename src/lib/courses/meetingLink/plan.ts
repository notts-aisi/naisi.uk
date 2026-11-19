/**
 * WHAT SAVING A SESSION'S MEETING LINK WRITES, as arithmetic: for that week
 * only, or from that week on. PURE: no reads and no clock. The writer
 * (`save.ts`) asks it inside its transaction with the group as stored, and
 * the tests ask it over a whole term.
 *
 * A group's link lives in two places: the group's standing link
 * (`session.meetingUrl`, "the every-week link"), and a week's own
 * (`sessionOverrides.<week>.meetingUrl`), which `sessionForWeek` lays over
 * the standing link for that week and no other. A week's own entry may hold
 * no link at all (null): that week then has none, whatever the standing link
 * says.
 *
 *  - WEEK N ONLY: week N's own link. Every other week stays as it is.
 *  - WEEK N ONWARDS: the standing link becomes this one, and week N's own
 *    link is taken away so it reads the standing one. A later week with a
 *    link of its own keeps it; a later week without one reads this one. Every
 *    EARLIER week that reads the standing link is given, as its own, the link
 *    it had (or none, where it had none), so a week that has met keeps the
 *    link it had and a week before N is not changed by a press about N.
 *    Nothing is pinned when the standing link does not change.
 *
 * The group keeps at most so many weeks apart from its usual slot
 * (`GROUP_FIELD_LIMITS.maxSessionOverrides`): a week past the cap would be
 * dropped when the group is read. A save that would need more is refused
 * with nothing written: "full" for week N's own entry, "earlier-full" for
 * the earlier weeks' pins.
 *
 * Never the link in anything but the field paths it is written to: the
 * history row the writer adds says which weeks, and whether there was a link
 * before, never what it is.
 */

/** One taught week of the group's plan, its first session. */
export type PlanWeek = { weekNumber: number; weekId: string };

export type LinkPlan =
  | {
      ok: true;
      /** Field paths on the group to set, each to a link or to null (no link). */
      set: Record<string, string | null>;
      /** Field paths on the group to delete. */
      remove: string[];
      /** The earlier weeks given the link they had, by number. */
      pinned: number[];
    }
  | { ok: false; reason: "full" | "earlier-full" };

/** Whether a stored week entry holds a link of its own (a link, or none on purpose). */
export function hasOwnLink(entry: unknown): boolean {
  return Boolean(entry) && typeof entry === "object" && !Array.isArray(entry) && Object.hasOwn(entry as object, "meetingUrl");
}

/** The standing link as stored, or null. */
function standingOf(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function planLinkSave(input: {
  /** The week the press is about. */
  week: PlanWeek;
  /** The link, already checked as a web address. */
  url: string;
  /** From that week on, or that week only. */
  onwards: boolean;
  /** The group's standing link as stored. */
  standing: unknown;
  /** The group's weeks set apart, as STORED (`sessionOverrides`). */
  storedWeeks: Readonly<Record<string, unknown>>;
  /** Every taught week of the group's plan, its first session, in any order. */
  weeks: readonly PlanWeek[];
  /** The most weeks a group keeps apart. */
  maxWeeks: number;
}): LinkPlan {
  const { week, url, onwards, storedWeeks, weeks, maxWeeks } = input;
  const weekPath = `sessionOverrides.${week.weekId}.meetingUrl`;
  const keys = new Set(Object.keys(storedWeeks));

  if (!onwards) {
    if (!keys.has(week.weekId) && keys.size >= maxWeeks) return { ok: false, reason: "full" };
    return { ok: true, set: { [weekPath]: url }, remove: [], pinned: [] };
  }

  const standing = standingOf(input.standing);
  const set: Record<string, string | null> = { "session.meetingUrl": url };
  const remove = hasOwnLink(storedWeeks[week.weekId]) ? [weekPath] : [];
  const pinned: number[] = [];
  if (standing !== url) {
    const earlier = [...weeks]
      .filter((each) => each.weekNumber < week.weekNumber && each.weekId !== week.weekId)
      .sort((a, b) => a.weekNumber - b.weekNumber);
    let added = 0;
    for (const each of earlier) {
      if (hasOwnLink(storedWeeks[each.weekId])) continue;
      if (!keys.has(each.weekId)) added += 1;
      set[`sessionOverrides.${each.weekId}.meetingUrl`] = standing;
      pinned.push(each.weekNumber);
    }
    if (keys.size + added > maxWeeks) return { ok: false, reason: "earlier-full" };
  }
  return { ok: true, set, remove, pinned };
}

/** Which link a week reads, in words a page can draw: its own, the every-week link, or none. Never the link. */
export type WeekLinkKind = "week" | "every" | "none";

/**
 * The kind of link a week reads, from the group as read (`normalizeCourseGroup`):
 * its own when its entry holds one, the standing link when it has none of its
 * own, none otherwise. The rooms page reads a week the same way.
 */
export function weekLinkKind(
  group: { session: { meetingUrl?: string | null }; sessionOverrides: Readonly<Record<string, { meetingUrl?: string | null } | undefined>> },
  weekId: string,
): WeekLinkKind {
  const own = group.sessionOverrides[weekId];
  if (own && Object.hasOwn(own, "meetingUrl")) return own.meetingUrl ? "week" : "none";
  return group.session.meetingUrl ? "every" : "none";
}
