import type { DecisionEmailButtonLook, DecisionEmailKind, DecisionEmailSignOff } from "./emailCopy";
import type { PoolChoice, TestState } from "./plan";

/**
 * WHAT THE TWO SCREENS ARE SENT.
 *
 * The pooled applicants page and the decision-day page are each drawn from one
 * object, built on the server, field by field, by `pool.ts` and `send.ts`.
 * These are those objects' shapes: types only, so a browser component can
 * import them without reaching anything that runs on the server.
 *
 * NO EMAIL ADDRESS IS IN EITHER. A preview says who an email is to by name,
 * and the address it goes to never leaves the server.
 */

// ---------------------------------------------------------------------------
// Pooled applicants
// ---------------------------------------------------------------------------

export type PoolProgramme = {
  id: string;
  shortName: string;
  /** How many people it can take. Null until its lead has said. */
  places: number | null;
  /** People who hold a place here now, an accepted invitation included. */
  placed: number;
  /** Places kept here for an invitation: picked and not yet told, or sent and not yet answered. */
  invited: number;
  /** Places not yet taken by an acceptance: what the card's number shows. */
  open: number | null;
  /** Places still free to invite somebody to, once invitations are counted. */
  left: number | null;
  /** Pooled applicants who ranked it first: the filter's count. */
  firstChoice: number;
};

export type PoolComment = {
  text: string;
  /** The first name of who wrote it. */
  by: string;
};

export type PoolRow = {
  uid: string;
  name: string;
  /** Their degree, or area of work. */
  degree: string;
  /** "Graduating July 2027", or what they do at UoN. */
  detail: string;
  ranked: { rank: number; programmeId: string; shortName: string }[];
  /** "Capacity", "Better fit": why each programme pooled them, without repeats. */
  reasons: string[];
  /** What their reviewers thought could suit them instead. */
  couldSuit: string[];
  comments: PoolComment[];
  /** What has been picked for them. Null while nothing has. */
  outcome: PoolChoice | null;
  /** The programmes they could be invited to right now. */
  inviteOptions: { programmeId: string; shortName: string }[];
  /** True once decision day has told them: their outcome no longer changes. */
  told: boolean;
};

/**
 * Somebody who was pooled, was told on decision day, and has since given
 * their place or their invitation back. Listed so that nobody disappears from
 * the page, and in none of its numbers.
 */
export type PoolLeftRow = {
  uid: string;
  name: string;
  degree: string;
  detail: string;
  ranked: { rank: number; programmeId: string; shortName: string }[];
  /** The programme whose invitation or place they gave back. Null when it has left the form. */
  programme: string | null;
  /** The button they pressed: "I can’t make it" or "No thanks". */
  said: string;
  /** Their reason, as the committee reads it. Null when none is on record. */
  reason: string | null;
};

export type PoolBoard = {
  roundId: string;
  termLabel: string;
  /** Today in London: "Wed 21 Oct". */
  today: string;
  /** The day everybody hears: "Fri 23 Oct". Null when the form names none. */
  hearOn: string | null;
  /** The day decisions went out, once they all have. */
  sentOn: string | null;
  counts: { pooled: number; invitations: number; noOffer: number; needsOutcome: number };
  programmes: PoolProgramme[];
  rows: PoolRow[];
  /**
   * Pooled people who gave a place or an invitation back after they were
   * told, with what they said and why. In no count above: `counts.pooled` is
   * `rows.length`, and stays so.
   */
  left: PoolLeftRow[];
};

// ---------------------------------------------------------------------------
// Decision day
// ---------------------------------------------------------------------------

export type SendPerson = { uid: string; name: string };

/** One email as the page previews it. The addresses stay on the server. */
export type EmailPreview = {
  kind: DecisionEmailKind;
  /** Who it is to, by name. */
  to: string;
  subject: string;
  greeting: string;
  paragraphs: string[];
  buttons: { label: string; look: DecisionEmailButtonLook }[];
  signOff: DecisionEmailSignOff;
};

export type SendGroup = {
  people: SendPerson[];
  /** The first person's email, as it will read. Null when the group is empty. */
  preview: EmailPreview | null;
  /**
   * The programme whose wording the preview is in, which is where that
   * wording is edited. Null when the email belongs to no one programme.
   */
  wordingProgrammeId: string | null;
};

export type ReadinessRow = {
  /** A programme's id, or a fixed key for a row that is not a programme: "pooled", "#test". */
  key: string;
  title: string;
  /**
   * Who it is waiting on: the lead's first name, or "Committee". On the test
   * row, the admin who sent the last test, or "An admin" when nobody has.
   */
  owner: string;
  ready: boolean;
  /** "Every application has a decision". */
  status: string;
  /** "22 of 24 places, and 2 invitations". */
  detail: string;
};

export type SendBoard = {
  roundId: string;
  termLabel: string;
  /** Today in London: "Fri 23 Oct". */
  today: string;
  /**
   * How many people the send addresses: everybody in the term, and anybody
   * already told who has since given a place or an invitation back. So it
   * does not shrink when somebody replies.
   */
  applied: number;
  /**
   * Once the term is sent, each row's detail is the record of what people
   * were told, not who holds a place today.
   */
  readiness: ReadinessRow[];
  /**
   * Whether an admin has sent themselves a test of these emails as they are
   * worded now. A press is refused unless this is "fresh". Who tested and
   * when is the last of the readiness rows.
   */
  test: TestState;
  /** Why the send cannot go, a sentence each. Empty when it can. */
  blockers: string[];
  /** The day decisions went out, and who sent them, once they all have. */
  sentOn: string | null;
  sentBy: string | null;
  /** People who already have their result, out of everybody counted in `applied`. */
  published: number;
  /**
   * The three groups are of everybody counted in `applied`, each under what
   * they were told (or, until they are told, would be told now). Somebody who
   * has replied since stays in the group their result put them in.
   */
  accepted: SendGroup;
  invited: SendGroup;
  noOffer: SendGroup;
  declined: { count: number };
  /** The reply-by day for invitations: "Sun 25 Oct". */
  replyBy: string | null;
  /**
   * True while the daily reminder for an unanswered invitation is running on
   * this copy of the site. The page promises a reminder only then.
   */
  remindsDaily: boolean;
  /** Accepted people still holding their place whose account is waiting to be approved. */
  accountsWaiting: number;
  /**
   * Accepted people whose join request was refused earlier. Sending leaves
   * their account as it is, so they are named for somebody to look at.
   */
  accountsRefused: SendPerson[];
  /** The name emails are sent under. */
  fromName: string;
  replyTo: string;
  /** False on a copy of the site that only writes to the addresses it lists. */
  emailsEveryone: boolean;
  /** What a press of Send would do now. */
  pending: {
    /** People still to be told. */
    people: number;
    /** Emails for them, with declined applications left out. */
    emails: number;
    /** Declined applications among them. */
    declined: number;
    /** The most people one press reaches. */
    perPress: number;
  };
  /**
   * People who have their result and whose email did not follow it. Shown
   * whether or not the term is marked as sent.
   */
  owed: {
    /** Their email is still to send: a press takes these up. */
    people: SendPerson[];
    /** Owed an email, with no address on their application to send it to. */
    noAddress: SendPerson[];
    /** Nobody can say whether their email went. It is never sent again. */
    unconfirmed: SendPerson[];
    /** Emails a press is sending right now. */
    inFlight: number;
    /** Why the owed emails cannot be sent, a sentence each. Empty when they can. */
    blockers: string[];
  };
};

/**
 * What one press of Send did. Two sums hold, every time:
 *
 *  - everybody in the term is in exactly one of `published`, `retried`,
 *    `skipped`, `changed` and `notReached`;
 *  - everybody in `published` or `retried` is in exactly one of `emailed`,
 *    `held`, `suppressed`, `failed`, `unconfirmed` and `notEmailed`.
 */
export type SendReport = {
  /** True for the press that only sends emails still owed. It tells nobody new. */
  owedOnly: boolean;
  /** Results written by this press. */
  published: number;
  /** People told by an earlier press whose owed email this press took up. */
  retried: number;
  /** An email went out. */
  emailed: number;
  /** This copy of the site may not write to them, so nothing went. */
  held: number;
  /** The address is on the do-not-email list, so nothing went. */
  suppressed: number;
  /** The email did not go, for certain. It is still owed, and a later press sends it. */
  failed: number;
  /** Nobody can say whether the email went. It is not sent again. */
  unconfirmed: number;
  /** Declined, and not emailed. */
  notEmailed: number;
  /** Nothing was written or sent: already told with no email owed, or not this press's to tell. */
  skipped: number;
  /** Their decision changed after the press began, so nothing was written. */
  changed: number;
  /** Left for the next press. */
  notReached: number;
  /** The names of the people whose email is still owed after this press. */
  failedNames: string[];
  /** The names of the people whose email nobody can vouch for. */
  unconfirmedNames: string[];
  /** Waiting accounts of accepted people that this press approved. */
  accountsApproved: number;
  /** Accepted people whose waiting account this press could not approve. */
  accountsFailed: string[];
  /** Accepted people whose join request was refused earlier: left as they are. */
  accountsRefused: string[];
  /** Why the press stopped early, when it did. */
  stopped: "emails-failing" | "out-of-time" | null;
  /** True when everybody in the term now has their result. */
  complete: boolean;
};
