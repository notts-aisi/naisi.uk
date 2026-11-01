/**
 * EVERY SENTENCE THIS TERM IN NUMBERS SAYS (board sv-term), with the board's
 * apostrophes and arrows. Every number in them comes from a record and
 * arrives here as an argument; nothing here names a person.
 *
 * Words the board does not draw are marked "not drawn": each is listed in the
 * build notes for the boards' designers to confirm.
 *
 * Pure: no imports, so the page, the file and the tests word it alike.
 */

export const TERM_WORDS = {
  title: "This term in numbers",
  /** The way back, to Reports, which holds it. */
  crumb: "Reports",
  /** Its name on Run NAISI › Reports. */
  link: "This term in numbers",
  download: "Download totals (CSV)",
  checkIns: "Check-ins",
  differentPeople: "Different people",
  cameTwice: "Came to 2 or more",
  events: "Events",
  programmes: "Programmes",
  // The events table.
  date: "Date",
  event: "Event",
  came: "Came",
  surveyAnswers: "Survey answers",
  howWasIt: "How was it? Average out of 5",
  note: "Note",
  notCounted: "Not counted",
  noSurvey: "No survey",
  beforeCheckIn: "Before check-in",
  noSignupNoCheckIn: "No sign-up and no check-in",
  // The programmes table.
  programme: "Programme",
  started: "Started",
  finished: "Finished",
  answeredBoth: "Answered both",
  considering: "Considering, planning or already doing it",
  afterSurvey: "After survey",
  notYet: "Not yet",
  /** The board's sentence named both surveys; the count is of the people who answered that question in both (listed for the boards' designers). */
  footnote: "Considering, planning or already doing it: at the start → at the end, of the people who answered that question in both surveys.",
  /** Not drawn: the file's column for how many that is, which the page writes after "of". */
  consideringOf: "Considering, planning or already doing it: answered it in both surveys",
  /** Not drawn: an event after check-in was first used, with sign-ups, where nobody was checked in. */
  noCheckIn: "No check-in",
  /** Not drawn: a survey made for the event and not opened or sent yet. sv-list's word for a draft. */
  notSent: "Not sent yet",
  /** Not drawn: the term has events, and nobody was checked in at any of them. */
  nobodyCheckedIn: "Nobody has been checked in at this term’s events yet, so there is nobody to count.",
  /** Not drawn: no event this term yet. */
  noEvents: "No events this term yet.",
  /** Not drawn: no programme on the term's form names a course run. */
  noProgrammes: "No programme on this term’s application form names a course run yet.",
  /** Not drawn: no term at all. */
  noTerm: "There’s no term to count yet. A term starts when its application form opens.",
  /** Not drawn: the run's last session is over and the after survey was never sent. */
  afterNotSent: "Not sent",
} as const;

/** Where "Download totals (CSV)" is served: the page's numbers, worked out again when it is pressed. */
export const TERM_TOTALS_PATH = "/api/surveys/term/totals";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "10 events and 4 programmes". */
export function termLineWords(events: number, programmes: number): string {
  return `${plural(events, "event", "events")} and ${plural(programmes, "programme", "programmes")}`;
}

/** "10 this term", over each table. */
export function thisTermWords(n: number): string {
  return `${n} this term`;
}

/** "At 6 events", under the check-ins. */
export function atEventsWords(n: number): string {
  return `At ${plural(n, "event", "events")}`;
}

/** "Of the 97 different people", under the people who came to two or more. */
export function ofDifferentWords(n: number): string {
  return `Of the ${n} different ${n === 1 ? "person" : "people"}`;
}

/**
 * Under the different people, when walk-ins without an account came to two
 * or more of the term's events: they cannot be told apart from one event to
 * the next, so the count of people may hold one of them twice, and the count
 * of people who came back may leave one out.
 */
export function unmatchedWords(people: number, cameTwice: number): string {
  return `Walk-ins without an account can’t be matched across events, so the ${people} may count one walk-in twice, and the ${cameTwice} may miss some.`;
}

/**
 * "No sign-up: checked in by themselves and at the door", by the ways the
 * event's people were checked in: by themselves, whichever way they did it
 * (the door code, their email's link or the check-in page), and at the door
 * list or added later.
 */
export function noSignupWords(themselves: boolean, atTheDoor: boolean): string {
  const ways = [themselves ? "by themselves" : "", atTheDoor ? "at the door" : ""].filter(Boolean);
  return `No sign-up: checked in ${ways.join(" and ")}`;
}

/** An average out of 5, to one place: "4.5". */
export function averageWords(mean: number): string {
  return (Math.round(mean * 10) / 10).toFixed(1);
}

/** "8 → 15 of 25": at the start, at the end, of the people who answered the question in both surveys. */
export function consideringWords(start: number, end: number, of: number): string {
  return `${start} → ${end} of ${of}`;
}

/** "Closed Fri 18 Dec: 27 of 31", or while it is open, "Closes Fri 18 Dec: 9 of 31". */
export function afterSurveyWords(closes: string, answered: number, sent: number): string {
  const counts = `${answered} of ${sent}`;
  return closes ? `${closes}: ${counts}` : counts;
}

/** "In February, after week 10": when the survey at the end comes, from the run's last session and its plan. */
export function afterSurveyComesWords(month: string | null, lastWeek: number | null): string {
  if (month && lastWeek) return `In ${month}, after week ${lastWeek}`;
  if (lastWeek) return `After week ${lastWeek}`;
  return month ? `In ${month}` : "";
}

/** "February": the month of a civil date ("2027-02-17"), read in London, or null. */
export function monthWords(dateKey: string | null): string | null {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  // Noon UTC is the same calendar day in London whatever the season.
  const at = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", month: "long" }).format(at);
}
