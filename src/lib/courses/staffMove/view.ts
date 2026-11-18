/**
 * WHAT THE MOVE PAGE DRAWS, as plain values: the shape the route's preview
 * answers (`POST .../people/[uid]/move` with `preview: true`) and the server
 * page hands its client part, so the two draw one thing. Never an address,
 * never anybody's email. Types only: no imports, so the page in the browser
 * reads it too.
 */

/** One line of "What will happen". */
export type MoveLineView = { label: string; text: string };

/** What a move to one group would do. */
export type MovePreviewView = {
  toGroupId: string;
  /** Week N, as the press sends it back. */
  weekNumber: number;
  /** "Week 3 · Group F meets Thu 19 Nov". */
  weekStated: string;
  /** "Weeks 1 and 2 stay with Group C, where Leo met.", or "". */
  weeksStay: string;
  /** "Leo won’t go to Group C’s session on Wed 11 Nov. ...". */
  skipsOld: string;
  lines: MoveLineView[];
  /** "Told": "3 emails" and the rest of its line. */
  told: { count: string; rest: string };
  /** The email to the person, as it will be sent; null when they have no address. */
  personEmail: { heading: string; subject: string; lines: string[] } | null;
  /** "Move Leo to Group F and email 3 people". */
  button: string;
  /** The count the press sends back. */
  emails: number;
};

/** One group under "Move to". */
export type MoveChoiceView = { groupId: string; name: string; words: string; full: boolean };

/** The page, as the server draws it before any script. */
export type MovePageView = {
  roundId: string;
  programmeId: string;
  uid: string;
  /** "Leo Park: move to another group for good". */
  title: string;
  firstName: string;
  /** The group they are in now. */
  fromName: string;
  choices: MoveChoiceView[];
  /** The group chosen in the address (`?to=`), or null. */
  chosen: string | null;
  /** What a move to the chosen group would do, or the one sentence why it can't be made. */
  outcome: { ok: true; preview: MovePreviewView } | { ok: false; error: string } | null;
  /** The route the press goes to. */
  routePath: string;
  /** The People tab, where Cancel goes back to. */
  backHref: string;
};
