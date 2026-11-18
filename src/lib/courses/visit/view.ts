/**
 * WHAT THE PAGE THAT ARRANGES A ONE-WEEK VISIT DRAWS, as plain values: the
 * shape the route's preview answers and the server page hands its client
 * part, so the two draw one thing. Never an address, never anybody's email.
 * Types only: no imports, so the page in the browser reads it too.
 */

/** One line of "What will happen". */
export type VisitLineView = { label: string; text: string };

/** One week under "Which week?": their own group's session that week, still to come. */
export type VisitWeekChoiceView = { weekNumber: number; words: string; visiting: boolean };

/** One session under "Which session?": its first line, its details, and whether it is full that week. */
export type VisitSessionChoiceView = { groupId: string; words: string; detail: string; full: boolean };

/** What arranging one visit would do. */
export type VisitPreviewView = {
  weekNumber: number;
  hostGroupId: string;
  lines: VisitLineView[];
  /** "Told": "3 emails" and the rest of its line. */
  told: { count: string; rest: string };
  /** "Group K is full this week: …", shown over the button; the press sends back that it was shown. Null when it is not full. */
  overLimit: string | null;
  /** The email to the person, as it will be sent; null when they have no address. */
  personEmail: { subject: string; lines: string[] } | null;
  /** "Arrange the visit and email 3 people". */
  button: string;
  /** The count the press sends back. */
  emails: number;
};

/** A visit that stands, with the way to call it off. */
export type VisitStandingView = {
  weekNumber: number;
  hostGroupId: string;
  /** "Week 2: Aisha goes to Group F’s session on Thu 12 Nov, 5pm." */
  words: string;
  /** Said when the host's session is no longer happening; null while it is. */
  gone: string | null;
  /** "Call off this visit and email 3 people". */
  button: string;
  emails: number;
  /** Whether it can still be called off: until the host's session starts. */
  open: boolean;
};

/** The page, as the server draws it before any script. */
export type VisitPageView = {
  roundId: string;
  programmeId: string;
  uid: string;
  /** "Aisha Rahman: visit another group for one week". */
  title: string;
  firstName: string;
  weeks: VisitWeekChoiceView[];
  /** The week chosen in the address (`?week=`), or null. */
  week: number | null;
  /** The sessions of the chosen week. */
  sessions: VisitSessionChoiceView[];
  /** The session chosen in the address (`?to=`), or null. */
  chosen: string | null;
  /** What a visit to the chosen session would do, or the one sentence why it can't be arranged. */
  outcome: { ok: true; preview: VisitPreviewView } | { ok: false; error: string } | null;
  standing: VisitStandingView[];
  /** The route the presses go to. */
  routePath: string;
  /** The People tab, where Cancel goes back to. */
  backHref: string;
};

/** One of the person's own visits, as their programme page's card draws it (`src/lib/courses/visit/card.ts`). */
export type OverviewVisit = {
  weekNumber: number;
  hostGroupId: string;
  /** The host's session's key and day: the two tickets act on it. */
  sessionKey: string;
  dateKey: string;
  startTimeLocal: string;
  durationMinutes: number;
  chip: string;
  /** "Wed 11 Nov, 6pm to 8pm". */
  when: string;
  /** "Monica Partridge C12, University Park", or "" with neither. */
  place: string;
  withLine: string;
  stillIn: string;
  /** "Arranged by Zach, Tue 10 Nov, 1:40pm.", or null when it can't be said who. */
  arrangedBy: string | null;
  /** Until the earlier of the two sessions starts; null after, when nothing is offered. */
  cancel: { until: string; question: string; done: string } | null;
  /** The host's link for that session, for somebody joining online; null with none, or none to show. */
  meetingUrl: string | null;
};
