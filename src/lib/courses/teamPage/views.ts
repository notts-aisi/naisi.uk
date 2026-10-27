import type { TicketFacts } from "@/features/courses/sessionChange/cardFacts";
import type { TeamWeeksView } from "./weeks";

/**
 * WHAT TRAVELS TO A TEAM'S PAGES: every field built on the server, field by
 * field, from the records the reader may read. Never a stored entry, a
 * stored team or an account: names only, never an address, and nothing of
 * another team.
 *
 * Types only, so the pages' client code can import them.
 */

/** One of the team's people, as the page names them. */
export type TeamPersonView = {
  uid: string;
  /** The name they go by, for the initials. */
  name: string;
  /** Its first word, for "Wen, George and Lily". */
  firstName: string;
};

/** The team's project, from the pitch it was made from. Null for a team made from the agenda or by hand. */
export type TeamProjectView = {
  /** The paper, and its address when it is one of the week's readings with one. Null when the pitch names none. */
  paper: { title: string; url: string | null } | null;
  twist: string;
} | {
  /** A pitch that is no longer stored: the project line the team was made with. */
  line: string;
};

/** The next session of the team's group, as the ticket draws it. */
export type TeamTicketView = {
  facts: TicketFacts;
  /** "Tonight · week 5". */
  eyebrow: string;
  /** "Thu 26 Nov, 6pm". */
  heading: string;
  roomChanged: boolean;
};

/** One link on the page. */
export type TeamLinkView = {
  id: string;
  label: string;
  /** The https address, for the `href`. */
  url: string;
  /** The address as the page shows it, without "https://". */
  shown: string;
};

/** A week's check-in, as the lead and admins read every week's. */
export type CheckInView = {
  weekNumber: number;
  did: string;
  inTheWay: string;
  /** "Saved Thu 26 Nov by Wen". */
  savedLine: string;
};

/** The team's hand-in, as its card on the team's page and the lead's reading show it. */
export type HandInCardView = {
  /** "One hand-in for the team. Due Thu 18 Feb, week 10: a link and a 200-word summary." */
  asks: string;
  /** "Showcase: Thu 18 Feb · 6pm · Room C20", or null with no showcase week, or no session that week. */
  showcase: string | null;
  /** The team can still hand in or change it. */
  open: boolean;
  /** "Handed in by Wen on Thu 18 Feb.", or null before the team has handed in. */
  handedIn: string | null;
  /** What was handed in, for the lead's and admins' reading; null on a member's page and before a hand-in. */
  entry: { url: string; shown: string; summary: string; whoDidWhat: string } | null;
  /** The way to the hand-in page, on a member's page. */
  action: { href: string; label: string } | null;
};

/** A team's page, for one of its people or for the programme's lead or an admin. */
export type TeamPageView = {
  runId: string;
  teamId: string;
  /** Who is reading: one of the team's people, or the lead or an admin, who read and write nothing. */
  reader: "member" | "staff";
  /** "Incubator: Alignment Research · Team". */
  eyebrow: string;
  /** Back to the programme's page (a member) or to the Teams tab (the lead and admins). */
  back: { href: string; label: string; short: string };
  name: string;
  people: TeamPersonView[];
  /** "Wen, George and Lily · Thursdays 6pm · Room C20". */
  headLine: string;
  project: TeamProjectView | null;
  /** The group's next session, on a member's page. */
  ticket: TeamTicketView | null;
  /** This week's check-in, on a member's page in a taught week; null otherwise. */
  checkIn: { weekNumber: number; did: string; inTheWay: string; canSave: boolean } | null;
  /** Every week's check-in, newest first, on the lead's and admins' reading; empty on a member's page. */
  checkIns: CheckInView[];
  /** "Zach, your team and admins see this.", beside what a member writes. */
  whoLine: string;
  links: TeamLinkView[];
  /** A member may add and remove links now. */
  canChangeLinks: boolean;
  handIn: HandInCardView;
  weeks: TeamWeeksView | null;
};

/** The hand-in page (en-handin-phone), for one of the team's people. */
export type HandInPageView = {
  runId: string;
  teamId: string;
  /** "Incubator: Alignment Research · Week 10". */
  eyebrow: string;
  /** "Hand in for Probe transfer". */
  title: string;
  /** "One hand-in for the team. Wen, George and Lily all see it, and so do Zach and admins." */
  lede: string;
  /** Back to the team's page: its address and the team's name. */
  back: { href: string; label: string };
  /** What was handed in, to change; empty strings before the first hand-in. */
  url: string;
  summary: string;
  whoDidWhat: string;
  summaryWords: number;
  /** The showcase, as the date card draws it; null with no showcase week or no session that week. */
  showcase: { dateKey: string; line: string; where: string } | null;
  /** "I’ve shared this with George and Lily"; null for somebody alone in a team. */
  shareLabel: string | null;
  /** The refusal the page shows itself when the box is not ticked. */
  tickFirst: string;
  /** The team can hand in or change it now. */
  open: boolean;
  /** "You can change it until 23:59 tonight.", or null with no due day or once closed. */
  untilLine: string | null;
  /** Why it can no longer change, once it cannot. */
  closedLine: string | null;
  /** "Handed in by Wen at 9:04pm today.", or null before the team has handed in. */
  handedInLine: string | null;
};

/** The programme page's card for one of a team's people. */
export type TeamCardView = {
  /** "Probe transfer, with George and Lily." */
  line: string;
};

/** One team's hand-in on the Teams tab, for the lead and admins. */
export type TeamHandInRow = {
  teamId: string;
  name: string;
  /** "Handed in by Wen on Thu 18 Feb.", or "Not handed in yet." */
  state: string;
  entry: { url: string; shown: string; summary: string; whoDidWhat: string } | null;
};

/** The Teams tab's Hand-ins section, for the lead and admins. */
export type TeamHandInsView = {
  roundId: string;
  programmeId: string;
  /** The hand-in dates as stored: the due day and the showcase's week, each null while unset. */
  dueOn: string | null;
  showcaseWeek: number | null;
  /** The showcase's choices: each taught week of the run's own calendar. */
  weeks: Array<{ weekNumber: number; label: string }>;
  /** "One hand-in for the team. Due Thu 18 Feb, week 10: a link and a 200-word summary.", as each team reads it. */
  asks: string;
  rows: TeamHandInRow[];
};
