/**
 * WHAT A PROGRAMME'S PEOPLE TAB IS SENT (board st-people), field by field.
 *
 * Built on the server (`./load.ts`, from `./model.ts`) for the programme's
 * lead and admins. Names, the degree line, the group, the reply to "I'm
 * coming" with its day, when they are free as fit marks, where their place
 * stands and why it was given back. Never an email address, never what
 * anybody wrote under access requirements, never a painted week, never an
 * answer to a question: the types below have no field that could carry one.
 *
 * Type-only, so the client component imports it.
 */

/** The filters over the table, in the board's order. */
export type PeopleFilter = "everyone" | "coming" | "havent-said" | "not-said-free" | "gave-back" | "invited";

export const PEOPLE_FILTERS: readonly PeopleFilter[] = [
  "everyone",
  "coming",
  "havent-said",
  "not-said-free",
  "gave-back",
  "invited",
];

/**
 * Where the person's place stands, from the application form's one answer:
 *  - `holding`: they hold a place on the programme (`holdsPlaceOn`);
 *  - `gave-back`: they held one here, or were invited here, and gave it back;
 *  - `invited`: an invitation to the programme is waiting for their answer.
 */
export type PersonCategory = "holding" | "gave-back" | "invited";

/** "Coming?": "Yes, Mon 26 Oct", "Not yet" or "No". */
export type PersonComing =
  | { kind: "yes"; on: string | null }
  | { kind: "not-yet" }
  | { kind: "no" };

/** "When they're free", as fit marks against the run's groups that have a weekly time. */
export type PersonFree =
  /** "Fits A, B, D": the groups whose whole weekly session their week covers. */
  | { kind: "fits"; tags: string[] }
  /** "Fits none of the 4 times". */
  | { kind: "fits-none"; times: number }
  /** "Not said": they sent the form with no week painted. */
  | { kind: "not-said" }
  /** They painted a week, and no group of the run has a weekly time yet. */
  | { kind: "no-times" };

/** The Status column. */
export type PersonStatus =
  | { kind: "holding" }
  /** Their reason as the committee reads it, and the day, "Mon 26 Oct". */
  | { kind: "gave-back"; reason: string | null; on: string | null }
  /** They left the programme's run after it was theirs, by themselves or taken off by staff, on this day. */
  | { kind: "left"; on: string | null }
  /** Invited and not answered yet: the day to answer by and the day they were invited. */
  | { kind: "invited"; until: string | null; on: string | null };

export type PersonRow = {
  uid: string;
  /** The name the committee's screens read them by. */
  name: string;
  /** What a menu item calls them: "See Ella’s application". */
  firstName: string;
  /** "BA Philosophy · Graduating 2028". Empty when they gave none. */
  detail: string;
  category: PersonCategory;
  /** "Group B", or null for "Not in a group". */
  group: string | null;
  coming: PersonComing;
  free: PersonFree;
  status: PersonStatus;
  /** Their application on this programme's review screen. Null for the viewer's own. */
  applicationHref: string | null;
  /** People in groups, where somebody holding a place is put in a group or moved. Null otherwise. */
  groupsHref: string | null;
};

export type PeopleCounts = Record<PeopleFilter, number>;

export type PeopleView = {
  roundId: string;
  programmeId: string;
  /** "AGI Strategy". */
  programmeName: string;
  /** An admin, or the programme's lead. */
  viewer: "admin" | "lead";
  /**
   * Why there is no list: decisions have not gone out, so nobody holds a
   * place yet. Null when there is a list (which can still be empty).
   */
  blank: "not-sent" | null;
  /** "30 hold a place; 2 gave theirs back." */
  sentence: string;
  /** Each filter's count, by the one function the table filters by (`rowMatches`). */
  counts: PeopleCounts;
  rows: PersonRow[];
};
