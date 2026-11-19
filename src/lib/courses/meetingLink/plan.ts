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
 * KEPT LINKS ("pins"). When a press from week N on changes the standing
 * link, every week before N, and any week that has ended, that reads the
 * standing link is given the link it had as its own entry, MARKED as kept
 * (`linkPinned: true` beside its `meetingUrl`). A mark tells a kept link
 * from one somebody set for that week on purpose. An entry with no mark is
 * on purpose: that is every entry stored before the mark existed, so live
 * data reads as it did, and code that does not know the mark reads a kept
 * link as an ordinary link of the week's own.
 *
 *  - WEEK N ONLY: week N's own link, set on purpose (a mark it had goes).
 *    Every other week stays as it is.
 *  - WEEK N ONWARDS: the standing link becomes this one. Week N's own link
 *    goes, and so does every KEPT link on a later week still to come: they
 *    read this one. A later week with a link set on purpose keeps it, and is
 *    named (`keptLater`) so nothing is left unsaid. Every week before N, and
 *    any week that has ended, keeps what it read: a kept or purposeful link
 *    stays, and one that read the standing link is given it, marked, when
 *    the standing link changes.
 *
 * An entry left holding nothing but a link and its mark is deleted whole
 * rather than left empty, so it no longer counts against the cap.
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
export type PlanWeek = { weekNumber: number; weekId: string; /** Its session has ended. */ ended?: boolean };

export type LinkPlan =
  | {
      ok: true;
      /** Field paths on the group to set: a link, null (no link) or the kept mark. */
      set: Record<string, string | null | true>;
      /** Field paths on the group to delete (a field, or a whole week's entry). */
      remove: string[];
      /** The weeks given the link they had, marked as kept, by number. */
      pinned: number[];
      /** Later weeks still to come that keep a link set on purpose, by number: they do not get this one. */
      keptLater: number[];
    }
  | { ok: false; reason: "full" | "earlier-full" };

/** The mark beside a kept link. */
export const LINK_PINNED = "linkPinned";

/** Whether a stored week entry holds a link of its own (a link, or none on purpose, or one kept). */
export function hasOwnLink(entry: unknown): boolean {
  return Boolean(entry) && typeof entry === "object" && !Array.isArray(entry) && Object.hasOwn(entry as object, "meetingUrl");
}

/** Whether a stored week entry's link is one an "onwards" press kept, not one set on purpose. */
export function isKeptLink(entry: unknown): boolean {
  return hasOwnLink(entry) && (entry as Record<string, unknown>)[LINK_PINNED] === true;
}

/** The standing link as stored, or null. */
function standingOf(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** Whether an entry holds nothing but a link and its mark. */
function onlyALink(entry: unknown): boolean {
  return Object.keys((entry ?? {}) as object).every((key) => key === "meetingUrl" || key === LINK_PINNED);
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
  const entryPath = (weekId: string) => `sessionOverrides.${weekId}`;
  const linkPath = (weekId: string) => `${entryPath(weekId)}.meetingUrl`;
  const markPath = (weekId: string) => `${entryPath(weekId)}.${LINK_PINNED}`;
  const keys = new Set(Object.keys(storedWeeks));
  /** Take a week's link away: the whole entry when it holds nothing else. */
  const takeAway = (weekId: string, remove: string[]) => {
    const entry = storedWeeks[weekId];
    if (onlyALink(entry)) {
      remove.push(entryPath(weekId));
      keys.delete(weekId);
    } else {
      remove.push(linkPath(weekId));
      if (isKeptLink(entry)) remove.push(markPath(weekId));
    }
  };

  if (!onwards) {
    if (!keys.has(week.weekId) && keys.size >= maxWeeks) return { ok: false, reason: "full" };
    const remove = isKeptLink(storedWeeks[week.weekId]) ? [markPath(week.weekId)] : [];
    return { ok: true, set: { [linkPath(week.weekId)]: url }, remove, pinned: [], keptLater: [] };
  }

  const standing = standingOf(input.standing);
  const set: Record<string, string | null | true> = { "session.meetingUrl": url };
  const remove: string[] = [];
  const pinned: number[] = [];
  const keptLater: number[] = [];
  if (hasOwnLink(storedWeeks[week.weekId])) takeAway(week.weekId, remove);
  for (const each of [...weeks].sort((a, b) => a.weekNumber - b.weekNumber)) {
    if (each.weekId === week.weekId) continue;
    const entry = storedWeeks[each.weekId];
    const keepsWhatItRead = each.weekNumber < week.weekNumber || each.ended === true;
    if (keepsWhatItRead) {
      // Before the week, or met: it reads what it read. A link of its own,
      // kept or on purpose, stays; one that read the standing link is given
      // it, marked, when the standing link changes.
      if (hasOwnLink(entry) || standing === url) continue;
      set[linkPath(each.weekId)] = standing;
      set[markPath(each.weekId)] = true;
      keys.add(each.weekId);
      pinned.push(each.weekNumber);
      continue;
    }
    // A later week still to come: a kept link goes, so it reads this one; a
    // link set on purpose stays, and is said.
    if (isKeptLink(entry)) takeAway(each.weekId, remove);
    else if (hasOwnLink(entry)) keptLater.push(each.weekNumber);
  }
  if (keys.size > maxWeeks) return { ok: false, reason: "earlier-full" };
  return { ok: true, set, remove, pinned, keptLater };
}

/**
 * Which link a week reads, in words a page can draw: one set for it on
 * purpose, the every-week link, the link it had before a later press (kept),
 * or none. Never the link.
 */
export type WeekLinkKind = "week" | "every" | "kept" | "none";

/**
 * The kind of link a week reads, from the group as read (`normalizeCourseGroup`):
 * its own when its entry holds one (kept, when marked), the standing link when
 * it has none of its own, none otherwise.
 */
export function weekLinkKind(
  group: {
    session: { meetingUrl?: string | null };
    sessionOverrides: Readonly<Record<string, { meetingUrl?: string | null; linkPinned?: true } | undefined>>;
  },
  weekId: string,
): WeekLinkKind {
  const own = group.sessionOverrides[weekId];
  if (own && Object.hasOwn(own, "meetingUrl")) return own.meetingUrl ? (own.linkPinned === true ? "kept" : "week") : "none";
  return group.session.meetingUrl ? "every" : "none";
}
