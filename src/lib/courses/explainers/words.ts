/**
 * EVERY WORD OF AN EXPLAINER: the page an admin schedules one on, the
 * review's list with Cancel, the session tickets (the facilitators' and each
 * member's), the line in "Week N is open", the explainer's tasks and their
 * one email, the week's page and the Surveys tab's Overview. Fixed words, in
 * one file, so every page, route and email says one thing, and the tests read
 * them here.
 *
 * The topic is the admin's own words. In a sentence it reads as one: on one
 * line, and starting lower case when it starts with an ordinary capitalised
 * word ("Compute as a lever" is "on compute as a lever"; "AI governance" and
 * "RLHF" keep their capitals).
 *
 * Plain, British, sentence case, no dashes, no pronoun for a person (an
 * explainer is "they"), days as "Wed 25 Nov" and times in the house clock
 * ("3pm"), in London. Never "mark", "grade" or "score".
 *
 * Pure: safe in a browser.
 */
import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import { namesAnd, numberWords } from "@/lib/courses/writtenAnswerWords";
import { EXPLAINER_TOPIC_MAX } from "@/lib/firestore/courseExplainers";

/** A topic as typed, on one line: runs of spaces and line breaks become one space. */
export function oneLineTopic(topic: string): string {
  return topic.replace(/\s+/g, " ").trim();
}

/**
 * A topic as a sentence says it: on one line, no full stop of its own at the
 * end, and its first letter lower case when it starts with an ordinary
 * capitalised word.
 */
export function topicInSentence(topic: string): string {
  const line = oneLineTopic(topic).replace(/\.+$/, "");
  return /^[A-Z][a-z]/.test(line) ? `${line[0].toLowerCase()}${line.slice(1)}` : line;
}

/** A topic as a title or a list says it: on one line, its first letter a capital. */
export function topicAsTitle(topic: string): string {
  const line = oneLineTopic(topic);
  return line ? `${line[0].toUpperCase()}${line.slice(1)}` : line;
}

/** "Wed 25 Nov, 3pm": when a session starts, in the house clock. */
export function sessionAtWords(at: Date): string {
  return `${londonDayLabel(at)}, ${londonClockLabel(at)}`;
}

/** "Group C, week 4: Wed 25 Nov, 3pm": one session an explainer can open. */
export function sessionChoiceWords(groupName: string, weekNumber: number, at: Date | null): string {
  const when = at ? `: ${sessionAtWords(at)}` : "";
  return `${groupName}, week ${weekNumber}${when}`;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many.replace("{n}", String(count)));

// ---------------------------------------------------------------------------
// The page an admin schedules one on, and its route
// ---------------------------------------------------------------------------

export const EXPLAINER_WORDS = {
  // The door and the route.
  onlyAdmins: "Only an admin can schedule an explainer, or cancel one.",
  notHere: "There’s no programme here.",
  badWeek: "Say which week: its id, like w03.",
  badTopic: `Give it a topic, up to ${EXPLAINER_TOPIC_MAX} characters.`,
  badMinutes: "Choose how long: 5, 10, 15 or 20 minutes.",
  badExplainer: "Choose who explains.",
  notCommittee: "Whoever explains is somebody on the committee, or an admin.",
  noSessions: "Choose at least one group’s session.",
  badSessions: "Say which sessions: each a group and its next session.",
  moved: "A group’s next session has changed since this page loaded. Look at it again, then press again.",
  taken: (groupName: string) => `${groupName}’s next session already starts with an explainer.`,
  notFound: "There’s no explainer here.",
  badId: "Say which explainer.",
  failed: "Couldn’t do that just now. Try again.",
  loadFailed: "Couldn’t reach the site. Try again.",

  // The page.
  title: "Schedule an explainer",
  crumb: (programme: string, weekNumber: number) => `${programme} / Weeks / Week ${weekNumber} review`,
  topic: "Topic",
  topicLeft: (left: number) => plural(left, "1 character left", "{n} characters left"),
  fromReview: (from: string) => `From the review: ${from}.`,
  typeTopic: "Type what it explains: it goes on the session tickets as you write it.",
  who: "Who explains",
  whoHint: "Anyone on the committee, or an admin. They get a task for each session.",
  choose: "Choose somebody",
  committee: "Committee",
  admins: "Admins",
  nobodyToAsk: "Nobody on the committee has an account that can be chosen yet.",
  atStartOf: "At the start of",
  alreadyStarts: (topic: string) => `Already starts with an explainer on ${topicInSentence(topic)}.`,
  noTime: (groups: readonly string[]) =>
    groups.length === 1
      ? `${groups[0]} has no session to come with a day and time, so it isn’t listed.`
      : `${namesAnd(groups)} have no session to come with a day and time, so they aren’t listed.`,
  noSessionsToCome: "No group has a session to come with a day and time, so there’s nothing to schedule yet.",
  howLong: "How long",
  minutesOption: (minutes: number) => `${minutes} minutes`,
  whoSees: (minutes: number, topic: string) =>
    `Their facilitators see it on their session ticket straight away. Each person in the group sees “${memberLineWords(minutes, topic || "the topic")}” on theirs, and in their week’s email if it hasn’t gone yet.`,
  cancel: "Cancel",
  schedule: (groups: number) => (groups === 0 ? "Schedule" : groups === 1 ? "Schedule for 1 group" : `Schedule for ${groups} groups`),
  scheduling: "Scheduling…",
  gets: (name: string) => `${name} gets a task for each session, and an email if their task emails are on.`,
  getsNobodyYet: "Whoever explains gets a task for each session, and an email if their task emails are on.",
  notYet: (weekNumber: number) => `Week ${weekNumber} can be reviewed once its first session has started, and explainers scheduled from it then.`,
  back: "Back to the review",
} as const;

// ---------------------------------------------------------------------------
// The review's list, and Cancel
// ---------------------------------------------------------------------------

export const REVIEW_EXPLAINER_WORDS = {
  scheduleFromTheme: "Schedule an explainer",
  title: "Explainers",
  none: "None scheduled from this review yet.",
  scheduleTyped: "Schedule an explainer",
  line:
    "Their facilitators and each person in the group see it on their session ticket straight away. The programme’s lead sees it on the week’s page. Scheduling one emails nobody but whoever explains.",
  cancel: "Cancel explainer",
  confirm: (name: string | null, tasks: number) =>
    `Cancel it? ${name ? `${name}’s` : "The"} ${plural(tasks, "task closes", "{n} tasks close")} and it comes off the session tickets. Nobody is emailed.`,
  confirmYes: "Yes, cancel it",
  keep: "Keep it",
  cancelled: "Cancelled: it’s off the session tickets, and the tasks are closed.",
} as const;

/** "10 minutes, by Maya Khan", or "10 minutes" once nobody is named. */
export function lengthAndWhoWords(minutes: number, by: string | null): string {
  return by ? `${minutes} minutes, by ${by}` : `${minutes} minutes`;
}

// ---------------------------------------------------------------------------
// The tickets, and "Week N is open"
// ---------------------------------------------------------------------------

/** The chip on a facilitator's ticket. */
export const STARTS_WITH_AN_EXPLAINER = "Starts with an explainer";

/** "10 minutes on compute as a lever for governance, by Maya. Then the week as planned." */
export function facilitatorLineWords(minutes: number, topic: string, by: string | null): string {
  const who = by ? `, by ${by}` : "";
  return `${minutes} minutes on ${topicInSentence(topic)}${who}. Then the week as planned.`;
}

/** "Scheduled by Zach from the week 3 review.", or with nobody named. */
export function scheduledByWords(name: string | null, weekNumber: number): string {
  return name ? `Scheduled by ${name} from the week ${weekNumber} review.` : `Scheduled from the week ${weekNumber} review.`;
}

/**
 * "Your session starts with a 10-minute explainer on compute as a lever for
 * governance.": what each member reads on their ticket, and in "Week N is
 * open" while that email has not gone.
 */
export function memberLineWords(minutes: number, topic: string): string {
  return `Your session starts with a ${minutes}-minute explainer on ${topicInSentence(topic)}.`;
}

// ---------------------------------------------------------------------------
// The week's page, for the lead and admins, and the Surveys tab's Overview
// ---------------------------------------------------------------------------

export const WEEK_EXPLAINER_WORDS = {
  title: (weekNumber: number) => `Explainers from the week ${weekNumber} review`,
  line: "An admin scheduled these from the week’s review. Their facilitators and each person in the group see each one on their session ticket.",
} as const;

/** "The week 3 review has an explainer booked for four groups." */
export function overviewExplainersWords(weekNumber: number, explainers: number, groups: number): string {
  const what = explainers === 1 ? "an explainer" : `${numberWords(explainers)} explainers`;
  const where = groups === 1 ? "one group" : `${numberWords(groups)} groups`;
  return `The week ${weekNumber} review has ${what} booked for ${where}.`;
}

// ---------------------------------------------------------------------------
// The explainer's tasks, and their one email
// ---------------------------------------------------------------------------

/** What an email or a task may print of where a session is: a room, "Online", or nothing. */
export type ExplainerWhere = string;

/**
 * "Explain compute as a lever for governance: Group C, Wed 25 Nov, 3pm",
 * within a task title's 120 characters: a long topic is cut, never the group
 * or the time.
 */
export function explainerTaskTitle(topic: string, groupName: string, at: Date | null, max: number): string {
  const tail = at ? `: ${groupName}, ${sessionAtWords(at)}` : `: ${groupName}`;
  const lead = "Explain ";
  const words = topicInSentence(topic);
  const room = max - lead.length - tail.length;
  if (words.length <= room) return `${lead}${words}${tail}`;
  if (room <= 1) return `${lead}${words}`.slice(0, max);
  return `${lead}${words.slice(0, room - 1).trimEnd()}…${tail}`;
}

/** Where a session is, as a task or the email says it. */
function whereWords(where: ExplainerWhere): string {
  const place = where.trim();
  if (!place) return "Where: no room is set for it yet.";
  if (place.toLowerCase() === "online") return "Where: online. Ask the group’s facilitators for the link to join.";
  return `Where: ${place}`;
}

/** The task's description: who asked, the session's day, time and room, and what the group sees. Never a link to join. */
export function explainerTaskDescription(args: {
  askedBy: string;
  minutes: number;
  topic: string;
  groupName: string;
  weekNumber: number;
  programme: string;
  at: Date | null;
  where: ExplainerWhere;
}): string {
  const programme = args.programme.trim();
  return [
    `${args.askedBy} asked you to give a ${args.minutes}-minute explainer on ${topicInSentence(args.topic)} at the start of ${args.groupName}’s week ${args.weekNumber} session${programme ? ` of ${programme}` : ""}.`,
    "",
    args.at ? `When: ${sessionAtWords(args.at)}` : "When: the session has no time set yet.",
    whereWords(args.where),
    "",
    "The group’s facilitators see it on their session ticket, and so does each person in the group. Move this to Done once you have given it.",
  ].join("\n");
}

/** Every word of the one email to whoever explains, beside their tasks. */
export type ExplainerEmailWords = {
  subject: string;
  preheader: string;
  greeting: string;
  lead: string;
  sessions: string[];
  after: string[];
  button: string;
  link: string;
};

export function explainerEmailWords(args: {
  firstName: string;
  askedBy: string;
  minutes: number;
  topic: string;
  programme: string;
  sessions: Array<{ groupName: string; weekNumber: number; at: Date | null; where: ExplainerWhere }>;
  link: string;
}): ExplainerEmailWords {
  const topic = topicInSentence(args.topic);
  const count = args.sessions.length;
  const programme = args.programme.trim();
  const which = count === 1 ? "this session" : `these ${numberWords(count)} sessions`;
  const lead = `${args.askedBy} asked you to give a ${args.minutes}-minute explainer on ${topic} at the start of ${which}${programme ? ` of ${programme}` : ""}:`;
  const online = args.sessions.some((session) => session.where.trim().toLowerCase() === "online");
  const name = args.firstName.trim();
  return {
    subject: `A ${args.minutes}-minute explainer on ${topic}`,
    preheader: lead,
    greeting: name ? `Hi ${name},` : "",
    lead,
    sessions: args.sessions.map((session) => {
      const place = session.where.trim();
      const base = sessionChoiceWords(session.groupName, session.weekNumber, session.at);
      if (!place) return base;
      return place.toLowerCase() === "online" ? `${base}, online` : `${base}, ${place}`;
    }),
    after: [
      count === 1 ? "There’s a task for it on My work, due when the session starts." : "There’s a task for each on My work, due when its session starts.",
      ...(online ? ["For a session held online, ask its facilitators for the link to join."] : []),
    ],
    button: "Open My work",
    link: args.link,
  };
}

/** The push beside the email. */
export const EXPLAINER_PUSH = "Open My work to see each session.";
