import type { ProgrammeKind } from "../model";

/**
 * WHAT THE "OFFER FREED PLACES" PAGE IS SENT, and what a press of its two
 * buttons answers with.
 *
 * Built field by field on the server (`./load.ts`, `./offer.ts`), for an
 * admin. People are named and scored, because the page is for choosing
 * between them. No email address, no painted week and no answer from an
 * application is in any of it: a week is reduced to a few words and to the
 * groups it covers, as the allocation board is told.
 *
 * Type-only, so a client component may import it.
 */

/** A group of the course run the programme names, whose weekly time an offer's email can name. */
export type OfferGroup = {
  id: string;
  /** The group's own name: "Group C". */
  name: string;
  /** "Wednesdays at 1pm". */
  meets: string;
  /** "Wednesday afternoons", as the email says it. */
  freeOn: string;
  /** "Wed 4 Nov": its next session. Null when none is still to come, and then no email can name it. */
  startsOn: string | null;
  /** How many more people it can be promised. Null for a group with no cap. */
  seatsFree: number | null;
};

/** One chip under a person's name. */
export type OfferChip = { label: string; tone: "ok" | "warn" | "plain" };

/** A pooled applicant who ranked the programme and can be offered one of its freed places. */
export type OfferPerson = {
  uid: string;
  /** Their name as the committee reads it. */
  name: string;
  /** What the email calls them. */
  firstName: string;
  /** "Pooled: capacity · Free Wed afternoons". */
  detail: string;
  /** "Fits Group C", "Fits none of the 4 times", "No availability given". */
  chips: OfferChip[];
  /** The groups whose whole time their week covers and that have a seat, in the run's order. */
  groupIds: string[];
  /** Their score for this programme, "3.6". Null when nobody has scored them. */
  score: string | null;
  /** "Monday" or "Mon 26 Oct": when they were told, as their email says it today. */
  toldOn: string;
  /** Why they cannot be picked, or null when they can. */
  cannot: string | null;
};

/** Somebody already offered a freed place on this programme, and where it stands. */
export type OfferedPerson = {
  uid: string;
  name: string;
  /** "Waiting for an answer, by Thu 29 Oct", "Accepted", "Said no thanks", "Gave the place back". */
  said: string;
  /** "Email sent", "Email still to go", "Email held", "Not emailed: on the do-not-email list", "Email may not have gone". */
  email: string;
  /** Their email is owed and a press can send it. */
  owed: boolean;
};

export type OfferTest = {
  state: "none" | "stale" | "fresh";
  /** Who sent the last test, and when: "Zach", "Thu 29 Oct, 10:02". */
  by: string | null;
  when: string | null;
  /** The day to accept by the last test was sent for, as a date key. */
  replyBy: string | null;
};

export type OfferBoard = {
  roundId: string;
  programmeId: string;
  termLabel: string;
  shortName: string;
  kind: ProgrammeKind;
  /** The lead's first name, which the email is signed with. Empty for none. */
  leadName: string;
  /** The window: whether it is open, and the sentence that says so. */
  window: { open: boolean; sentence: string };
  /** Places free now: the programme's places less those held and those kept for invitations. */
  free: number;
  heading: string;
  /** "Ella Robinson and Marcus Obi gave theirs back.", or null. */
  gaveBack: string | null;
  /** "All of them read No offer this time on Mon 26 Oct." */
  told: string;
  usesScores: boolean;
  people: OfferPerson[];
  /** How many of the run's groups have a weekly time: the "4" in "Fits none of the 4 times". */
  timedGroups: number;
  groups: OfferGroup[];
  offered: OfferedPerson[];
  test: OfferTest;
  /** Today in London, a date key: the earliest day to accept by. */
  today: string;
  /** The person's own application page, where the email's buttons lead. */
  applicationLink: string;
  fromName: string;
  replyTo: string;
  /** The viewer has an application of their own on this form, which the page leaves out. */
  ownApplication: boolean;
};

/** What one press of "Send N invitations", or of "Send the emails still to go", did. */
export type OfferReport = {
  /** People offered a place by this press. */
  offered: number;
  emailed: number;
  held: number;
  suppressed: number;
  /** Named, because somebody has to act on each. */
  failed: string[];
  unconfirmed: string[];
};
