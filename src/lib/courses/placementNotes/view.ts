import type { MarkedRange, SessionSlot } from "@/lib/admissions/availability";

/**
 * WHAT "OUTSIDE THE TIMES THEY GAVE" IS SENT, by the notes route, for
 * Publish's own page (`src/features/applications/groups/OutsideNotes.tsx`).
 * Read for one caller by `readOutsideSection` (`./section.ts`).
 *
 * Type-only, so the page's client part and the route share one shape. No
 * address is in it: names, ids, days and times, and for an admin the
 * stretches of the week a person marked.
 */

/** One person, as the section draws them. Names, ids, days and times only: no address. */
export type OutsideRow = {
  uid: string;
  name: string;
  groupId: string;
  groupName: string;
  meets: string | null;
  note:
    | { state: "noted"; text: string; by: string | null; at: string | null }
    | { state: "without"; by: string | null; at: string | null }
    | { state: "missing" };
  /** Claude's draft. Admins only; null for anybody else. */
  draft: { text: string; basis: string } | null;
  /** Claude can draft for them: an admin is looking, Claude is set up, and they applied on the form. */
  canDraft: boolean;
  /** The caller is this person: they may choose none, and write nothing. */
  own: boolean;
  /**
   * Their week beside their group's session, for an admin: the stretches they
   * marked, whether the site reads them "from then on", the session, and how
   * many of its minutes fall in what they gave. Null for anybody else.
   */
  week: {
    grid: { startMinute: number; endMinute: number };
    marked: MarkedRange[];
    fromFirstMark: boolean;
    session: SessionSlot;
    overlapMinutes: number;
  } | null;
};

export type OutsideSection = {
  admin: boolean;
  rows: OutsideRow[];
  /** Who a press waits for, by name. */
  needed: string[];
};

