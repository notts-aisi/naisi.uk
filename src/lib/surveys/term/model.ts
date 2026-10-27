import { own } from "@/lib/applications/keys";
import { bothOf, type PairedAnswers } from "../change";
import { surveyQuestionsOf, type SurveyItem } from "../items";
import { valueOf } from "../results";
import { dayWords } from "../words";
import {
  TERM_WORDS,
  afterSurveyComesWords,
  afterSurveyWords,
  averageWords,
  noSignupWords,
  termLineWords,
} from "./words";

/**
 * THIS TERM IN NUMBERS (board sv-term), counted from what the loader read
 * (`./load.ts`): each event's check-ins and its survey, how many different
 * people came and how many came back, and each programme's before and after.
 *
 * COUNTS ONLY. What arrives here can tell one person from another (the keys
 * below), because counting different people needs that; what leaves is
 * numbers and the board's words. No name, account id, address or answer's
 * words is in the view, so none can reach the page, its HTML or its file.
 *
 * NO THRESHOLD (Zach, 26 Oct 2026): every count is shown with its base.
 *
 * Pure: no reads and no clock.
 */

/** How one person was checked in: with the code at the door, on the door list, or added later from the event's page. */
export type CheckInWay = "qr" | "door" | "page";

/** One check-in an event's "came" counts. */
export type CountedCheckIn = {
  how: CheckInWay;
  /**
   * What tells this person apart from everybody else across events: their
   * account, and the address on a sign-up made without one (with each
   * account's own address, so the two ways meet). Empty for a walk-in with no
   * account, who is never matched: the address a walk-in leaves is for that
   * event's survey alone. Empty too when the names have come off. Never
   * handed to a page.
   */
  keys: string[];
  /**
   * A check-in whose names have come off: one person, matched with nobody,
   * and not a walk-in, so it never shows the walk-ins' sentence.
   */
  namesOff?: true;
};

export type TermEvent = {
  title: string;
  startAt: Date;
  /** Its end, or its start when it has none. */
  endsAt: Date;
  noSignup: boolean;
  /** The check-ins its Check-in tab counts as having come, one per person there. */
  counted: CountedCheckIn[];
  /** Its survey after the event, or null when it has none. */
  survey: {
    /** Opened at the event or emailed: a survey that is still a draft takes no answers. */
    sent: boolean;
    answers: number;
    /** The average of "How was it?" out of 5, or null when nobody rated it. */
    average: number | null;
  } | null;
};

/** One of a programme's surveys, as the pairing reads it: its questions and the answers that still carry a name. */
export type TermSurvey = { items: SurveyItem[]; answers: PairedAnswers[] };

export type TermProgramme = {
  /** "AGI Strategy Fellowship". */
  name: string;
  started: number;
  /** Null until the run's last session is over. */
  finished: number | null;
  /** Its before survey, once sent; null when it has none or has not sent it. */
  before: TermSurvey | null;
  /** Its survey at the end, or null when none has been made. */
  after:
    | (TermSurvey & {
        state: "draft" | "open" | "closed";
        /** "Closed Fri 18 Dec", "Closes Fri 18 Dec", or "" when it has no closing day. */
        closes: string;
        /** Every answer it holds, names on or off. */
        answered: number;
        /** The people it was sent to, by its own record of each send. */
        sent: number;
      })
    | null;
  /** When the survey at the end comes: the month of the run's last session ("February") and its last taught week. */
  comes: { month: string | null; lastWeek: number | null };
};

export type TermInput = {
  /** The form's own name for its term: "Autumn 2026". */
  label: string;
  /** The term's events, oldest first. */
  events: TermEvent[];
  /**
   * When check-in was first used on the site, as far as the term is
   * concerned: the first check-in its events hold, or a moment before the
   * term when one was made before it. Null when nobody has ever been checked
   * in. An event that ended before it, with nobody counted, came before
   * check-in.
   */
  checkInSince: Date | null;
  programmes: TermProgramme[];
};

/** The four numbers over the tables, or null when nobody was checked in. */
export type TermTiles = {
  checkIns: number;
  /** How many events those check-ins were at. */
  atEvents: number;
  people: number;
  cameTwice: number;
  /** Walk-ins without an account came to two or more of the events, so the board's sentence is shown. */
  unmatched: boolean;
};

export type TermEventRow = {
  /** "Wed 14 Oct". */
  date: string;
  title: string;
  /** How many came, or null for "Not counted". */
  came: number | null;
  /** "18" or "Not counted". */
  cameCell: string;
  /** Null when the event has no survey: "No survey" spans both survey columns. */
  survey: { sent: boolean; answers: string; average: string } | null;
  note: string;
};

export type TermProgrammeRow = {
  name: string;
  started: number;
  finished: number | null;
  /** Null until the survey at the end has been sent to a programme whose before survey was. */
  answeredBoth: number | null;
  /**
   * Of the people who answered the stage question in both surveys (`of`, which
   * is at most `answeredBoth`), how many said they were considering, planning
   * or already doing it, at each end. Null while nobody has answered it both times.
   */
  considering: { start: number; end: number; of: number } | null;
  afterSurvey: string;
};

export type TermView = {
  label: string;
  /** "10 events and 4 programmes". */
  line: string;
  tiles: TermTiles | null;
  events: TermEventRow[];
  programmes: TermProgrammeRow[];
};

/**
 * C1's stage from which somebody is considering, planning or already doing
 * AI safety work: "One of several options I’m seriously considering" (2),
 * "My leading plan, no concrete steps yet" (3), "Taking concrete steps" (4)
 * and "Already doing AI safety work" (5). Read by the question's fixed id.
 */
export const CONSIDERING_STAGE = 2;
const STAGE_QUESTION = "q_c1";

// ---------------------------------------------------------------------------
// Different people
// ---------------------------------------------------------------------------

/**
 * Who came across the term's events: every counted check-in is one person
 * at one event, and two check-ins that share a key are one person. Answers
 * how many different people that is, how many came to two or more of the
 * events, and whether walk-ins with no account came to two or more of them.
 * A check-in with no key (a walk-in with no account, or one whose names have
 * come off) is a person of its own; only a walk-in's counts for the sentence.
 */
export function peopleAcross(events: readonly Pick<TermEvent, "counted">[]): { people: number; cameTwice: number; unmatched: boolean } {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Every key on the way now points straight at the root.
    let at = key;
    while (parent.get(at) !== root) {
      const next = parent.get(at)!;
      parent.set(at, root);
      at = next;
    }
    return root;
  };
  const add = (key: string) => {
    if (!parent.has(key)) parent.set(key, key);
  };
  const join = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  // Each check-in, by the key it is known by: its first key, or a token of its own when it has none.
  const visits: { key: string; event: number }[] = [];
  const unmatchedAt = new Set<number>();
  events.forEach((event, index) => {
    event.counted.forEach((checkIn, at) => {
      if (checkIn.keys.length === 0) {
        const token = `unmatched:${index}:${at}`;
        add(token);
        visits.push({ key: token, event: index });
        if (!checkIn.namesOff) unmatchedAt.add(index);
        return;
      }
      for (const key of checkIn.keys) add(key);
      for (const key of checkIn.keys.slice(1)) join(checkIn.keys[0], key);
      visits.push({ key: checkIn.keys[0], event: index });
    });
  });

  const eventsOf = new Map<string, Set<number>>();
  for (const visit of visits) {
    const person = find(visit.key);
    const seen = eventsOf.get(person) ?? new Set<number>();
    seen.add(visit.event);
    eventsOf.set(person, seen);
  }
  return {
    people: eventsOf.size,
    cameTwice: [...eventsOf.values()].filter((seen) => seen.size >= 2).length,
    unmatched: unmatchedAt.size >= 2,
  };
}

// ---------------------------------------------------------------------------
// The rows
// ---------------------------------------------------------------------------

/** What the Note column says of an event. */
export function eventNote(event: Pick<TermEvent, "endsAt" | "noSignup" | "counted">, checkInSince: Date | null): string {
  if (event.counted.length > 0) {
    if (!event.noSignup) return "";
    // As the Check-in tab groups them: the code at the door, and the door list with those added later.
    const byQr = event.counted.some((checkIn) => checkIn.how === "qr");
    const atTheDoor = event.counted.some((checkIn) => checkIn.how !== "qr");
    return noSignupWords(byQr, atTheDoor);
  }
  if (checkInSince === null || event.endsAt.getTime() < checkInSince.getTime()) return TERM_WORDS.beforeCheckIn;
  return event.noSignup ? TERM_WORDS.noSignupNoCheckIn : TERM_WORDS.noCheckIn;
}

function eventRow(event: TermEvent, checkInSince: Date | null): TermEventRow {
  const came = event.counted.length > 0 ? event.counted.length : null;
  let survey: TermEventRow["survey"] = null;
  if (event.survey) {
    survey = event.survey.sent
      ? { sent: true, answers: String(event.survey.answers), average: event.survey.average === null ? "" : averageWords(event.survey.average) }
      : { sent: false, answers: TERM_WORDS.notSent, average: "" };
  }
  return {
    date: dayWords(event.startAt),
    title: event.title,
    came,
    cameCell: came === null ? TERM_WORDS.notCounted : String(came),
    survey,
    note: eventNote(event, checkInSince),
  };
}

/** A person's stage on C1 in one survey, or null when they did not answer it. */
function stageIn(survey: TermSurvey, answers: PairedAnswers["answers"]): number | null {
  const question = surveyQuestionsOf(survey.items).find((each) => each.id === STAGE_QUESTION);
  return question ? valueOf(question, own(answers, STAGE_QUESTION)) : null;
}

function programmeRow(programme: TermProgramme): TermProgrammeRow {
  const { before, after } = programme;
  const sent = after !== null && after.state !== "draft";
  let answeredBoth: number | null = null;
  let considering: TermProgrammeRow["considering"] = null;
  if (sent && before) {
    // The change view's own pairing: by person, names on, at both ends.
    const both = bothOf(before.answers, after.answers);
    answeredBoth = both.length;
    // C1 at each end, over the people who answered C1 itself both times,
    // with that number beside it: every question can be skipped, and public
    // numbers, the Kairos report and the after survey's Results count the
    // stage the same way (`pairsOf` in src/lib/surveys/change.ts).
    const stages = both.flatMap((person) => {
      const start = stageIn(before, person.earlier);
      const end = stageIn(after, person.later);
      return start !== null && end !== null ? [{ start, end }] : [];
    });
    if (stages.length > 0) {
      considering = {
        start: stages.filter((each) => each.start >= CONSIDERING_STAGE).length,
        end: stages.filter((each) => each.end >= CONSIDERING_STAGE).length,
        of: stages.length,
      };
    }
  }
  let afterSurvey: string;
  if (sent) afterSurvey = afterSurveyWords(after.closes, after.answered, after.sent);
  else if (programme.finished === null) afterSurvey = afterSurveyComesWords(programme.comes.month, programme.comes.lastWeek);
  else afterSurvey = TERM_WORDS.afterNotSent;
  return { name: programme.name, started: programme.started, finished: programme.finished, answeredBoth, considering, afterSurvey };
}

/** The page's model, and the file's: the same numbers, worded once. Days are read in London ("Wed 14 Oct"). */
export function buildTermView(input: TermInput): TermView {
  const counted = input.events.filter((event) => event.counted.length > 0);
  const across = peopleAcross(input.events);
  const tiles: TermTiles | null =
    counted.length === 0
      ? null
      : {
          checkIns: counted.reduce((sum, event) => sum + event.counted.length, 0),
          atEvents: counted.length,
          people: across.people,
          cameTwice: across.cameTwice,
          unmatched: across.unmatched,
        };
  return {
    label: input.label,
    line: termLineWords(input.events.length, input.programmes.length),
    tiles,
    events: input.events.map((event) => eventRow(event, input.checkInSince)),
    programmes: input.programmes.map(programmeRow),
  };
}
