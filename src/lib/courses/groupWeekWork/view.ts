import type { Bucket, LastReminded, PieceKey } from "./model";

/**
 * A WEEK'S CARD ON A GROUP'S PAGE, AS THE SERVER HANDS IT TO THE BROWSER
 * (`loadGroupWeekWork`): plain values and words, never a stored record. Names
 * only: no address, no word anybody wrote, no meeting link. Who is in it is
 * decided on the server before anything here is made: the group's fellows,
 * never its facilitators; a facilitator's own week only for the programme's
 * lead and admins (`own`), and null for anybody else.
 *
 * The bars, the chips and "4 of 6 have done week 1" are counted from `rows`
 * by the page (`countBuckets`), so every number on the card is one count.
 */

/** One piece of one person's week, as a cell says it. */
export type WorkCell = {
  key: PieceKey;
  bucket: Bucket;
  /** "3 of 3", "Written Sat 7 Nov", "Started, saved Tue 3 Nov", "Sent Mon 9 Nov, 8:12pm", "Started, not sent". */
  text: string;
  /** "Late: 3 days after the session", or null. */
  late: string | null;
};

/** One fellow's row. */
export type WorkRow = {
  uid: string;
  name: string;
  firstName: string;
  /** The week as a whole: its bucket and the words This week's work says of it. */
  week: { bucket: Bucket; text: string; detail: string | null };
  pieces: WorkCell[];
  /** When they were last reminded about this week, automatically or by hand; null for never. */
  lastReminded: LastReminded | null;
  /** Reminded in the last day: the panel warns before a press. */
  recent: boolean;
  /** In Remind's audience now: the row has its own Remind. */
  remindable: boolean;
  /** Done after the session: the line under them in "Late in week N", and how late; null otherwise. */
  late: { line: string; detail: string } | null;
};

/** One facilitator's own week, for the programme's lead and admins only. */
export type OwnWeekRow = {
  uid: string;
  /** "Rahul Mehta, facilitator". */
  name: string;
  /** "Rahul’s own week 1: done late. Claudia and admins only." */
  line: string;
  bucket: Bucket;
  /** "Late: 4 days after the session", or null. */
  late: string | null;
};

export type GroupWeekWorkView = {
  weekNumber: number;
  /** The group's session that week has started: done splits into on time and late. */
  sessionStarted: boolean;
  /** The programme has closed for work: nobody is reminded. */
  closed: boolean;
  /** The week's pieces, in order, with their labels. */
  pieces: Array<{ key: PieceKey; label: string; title: string }>;
  /** "Done means every reading ticked and the written answer sent." */
  doneMeans: string;
  rows: WorkRow[];
  /** The facilitators' own weeks: the programme's lead's and admins' alone, null for anybody else. */
  own: OwnWeekRow[] | null;
  /** How many a Remind of everybody not done emails now, for its button; null when Remind is not offered. */
  remind: { count: number } | null;
  /** What is true of the automatic reminders before this week's session, in a sentence. */
  automatic: string;
};
