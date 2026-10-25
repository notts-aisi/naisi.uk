import { formatRunStartShort } from "@/lib/courses/window";

/**
 * THE TEAMS TAB'S WORDS AND THE TEAM EMAIL'S, built from records.
 *
 * The sentences in-teams and in-agenda draw ("3 people", "12 of 12 in a
 * team.", "You can change them until Wed 18 Nov.", "Emails 12 people",
 * "1st: Compute governance", "Replicate [Paper], then: …"), with every value
 * in them taken from a setting, a pitch, the form's answers or an account.
 * Dates are London civil dates ("YYYY-MM-DD") read as days, so nothing here
 * re-zones an instant: "today" is the caller's London date key.
 *
 * Pure, with no server import, so the page's client code, the routes and the
 * tests read the same words.
 */

/** "1 person", "3 people". */
export function peopleWords(count: number): string {
  return `${count} ${count === 1 ? "person" : "people"}`;
}

/** "Emails 1 person", "Emails 12 people": what the button to tell everyone reaches. */
export function emailsWords(count: number): string {
  return `Emails ${peopleWords(count)}`;
}

/** "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st". */
export function placeWords(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  switch (place % 10) {
    case 1:
      return `${place}st`;
    case 2:
      return `${place}nd`;
    case 3:
      return `${place}rd`;
    default:
      return `${place}th`;
  }
}

/** "Sofia", "Sofia and Tom", "Sofia, Tom and Ana". */
export function namesInWords(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * A twist as the second half of a sentence: its first letter lowered when the
 * first word is an ordinary capitalised word ("Test whether…" reads "test
 * whether…"), and left alone when lowering it would change a name ("GPT-2",
 * "AI", "I").
 */
export function asSentenceTail(text: string): string {
  const trimmed = text.trim();
  const firstWord = trimmed.split(/\s+/)[0] ?? "";
  const first = firstWord.charAt(0);
  const rest = firstWord.slice(1);
  const ordinary =
    first !== "" &&
    first === first.toUpperCase() &&
    first !== first.toLowerCase() &&
    rest.length > 0 &&
    rest === rest.toLowerCase() &&
    /^[a-z’']*$/.test(rest) &&
    !/^I[’']/.test(firstWord);
  return ordinary ? `${first.toLowerCase()}${trimmed.slice(1)}` : trimmed;
}

/**
 * A pitch's project line: "Replicate [the paper], then: [the twist]". The
 * paper is the pitch's own (a reading of pitching week, or one typed in). A
 * pitch with no paper on record gives its twist alone.
 */
export function teamProjectLine(paperTitle: string | null, twist: string): string {
  const paper = (paperTitle ?? "").trim();
  const then = twist.trim();
  if (!paper) return then;
  return then ? `Replicate ${paper}, then: ${asSentenceTail(then)}` : `Replicate ${paper}`;
}

/** "12 of 12" and " in a team.", the two halves of the line under the teams (the first is set in bold). */
export function inATeamWords(inATeam: number, takingPart: number): { count: string; rest: string } {
  return { count: `${inATeam} of ${takingPart}`, rest: " in a team." };
}

/** "Thu 19 Nov", the day the teams are made, or null when it is not set or not a date. */
export function teamsByDay(teamsMadeOn: string | null): string | null {
  return teamsMadeOn ? (formatRunStartShort(teamsMadeOn) ?? null) : null;
}

/**
 * "You can change them until Wed 18 Nov.", up to and on the day the teams are
 * made (London), and null after it or when no day is set. It says when the
 * teams are due; nothing locks them after it.
 */
export function changeUntilWords(teamsMadeOn: string | null, todayKey: string): string | null {
  const day = teamsByDay(teamsMadeOn);
  if (!day || !teamsMadeOn || todayKey > teamsMadeOn) return null;
  return `You can change them until ${day}.`;
}

/** A team outside the run's sizes, said, or null for one inside them (or when no sizes are set). */
export function sizeNoteWords(count: number, sizes: { min: number; max: number } | null): string | null {
  if (!sizes) return null;
  if (count < sizes.min) return `Smaller than the smallest team, ${peopleWords(sizes.min)}.`;
  if (count > sizes.max) return `Larger than the largest team, ${peopleWords(sizes.max)}.`;
  return null;
}

// ---------------------------------------------------------------------------
// Refusals and results, as the lead reads them
// ---------------------------------------------------------------------------

export const NO_PROGRAMME = "That programme is not on this form.";
export const LEADS_AND_ADMINS = "Only the programme’s lead and admins can make its teams.";
export const NOT_AN_INCUBATOR = "Teams are an incubator’s. This programme is a fellowship, so its people are in groups.";
export const NO_RUN = "This programme doesn’t name a course run yet, so there is nobody to put in a team.";
export const RUN_GONE = "The course run this programme names is no longer on the site.";
export const NO_WAY_SET =
  "Nobody has said how this programme’s teams are made yet. Set it in the run editor’s Pitching week section.";
export const NO_SIZES =
  "Set the smallest and largest team in the run editor’s Pitching week section first, so teams are made within them.";
export const FROM_THE_AGENDA_HERE = "This programme’s teams are made from the agenda, not from pitches.";
export const FROM_PITCHES_HERE = "This programme’s teams are made from the pitches, not from the agenda.";
export const NO_SUCH_PITCH = "That pitch isn’t one of this programme’s pitching week.";
export const NO_SUCH_TEAM = "That team isn’t one of this programme’s teams.";
export const NOT_TAKING_PART = "That person isn’t taking part in this programme.";
export const OTHER_GROUP = "That team meets in another group. A person moves only between their own group’s teams.";
export const NO_AGENDA = "The application form asks this programme’s applicants to rank nothing, so there is no agenda to make teams from.";
export const TEAMS_EXIST =
  "This programme has teams already. Move people with Move to…, or remove every team to make them again from first choices.";

/** A pitch made a team already. */
export function pitchIsATeam(title: string): string {
  return `${title} is a team already.`;
}

/** A pitch with too few people to be a team. */
export function tooFewForATeam(title: string, count: number, min: number): string {
  return `${title} would be a team of ${peopleWords(count)}, and the smallest team is ${peopleWords(min)}. Move people into the other teams with Move to… instead.`;
}

/** After a pitch is made a team. */
export function madeFromPitchWords(title: string, count: number): string {
  return `${title} is a team of ${peopleWords(count)}.`;
}

/** After teams are made from first choices. */
export function madeFromAgendaWords(teams: number, unplaced: number): string {
  const made = `Made ${teams} ${teams === 1 ? "team" : "teams"} from first choices.`;
  if (unplaced === 0) return made;
  return `${made} ${peopleWords(unplaced)} ${unplaced === 1 ? "is" : "are"} in no team yet. Use Move to… to put them in one.`;
}

/** After a move. */
export function movedWords(name: string, teamName: string | null): string {
  return teamName ? `${name} is in ${teamName} now.` : `${name} is in no team now.`;
}

/** After a team is removed. */
export function removedWords(teamName: string): string {
  return `${teamName} is removed. Its people are in no team now.`;
}

// ---------------------------------------------------------------------------
// The email that tells somebody their team
// ---------------------------------------------------------------------------

/** What one person's email is told. Names only: never an address. */
export type TeamEmailFacts = {
  /** The name the greeting uses, or "" for a greeting with no name. */
  firstName: string;
  teamName: string;
  /** The team's project line, or "" when it has none. */
  project: string;
  /** The other people in the team, by name. */
  teammates: string[];
  /** The programme's short name: "Alignment Research". */
  programmeName: string;
  /** The first name of the programme's lead, who signs it, or null. */
  leadFirstName: string | null;
};

export type TeamEmailWords = {
  subject: string;
  /** "Hi Wen," or null for a greeting with no name. */
  greeting: string | null;
  paragraphs: string[];
  /** The lead's first name, or null. */
  signOff: string | null;
};

/** A sentence's last mark, added when the stored text has none. */
function stop(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * The email, written whole, or null when it cannot be: a team with no name or
 * a programme with no name has nothing for the email to tell. The project
 * paragraph is left out for a team with no project line, and the sign-off for
 * a programme with no lead who stands; nothing else is optional.
 */
export function teamEmailWords(facts: TeamEmailFacts): TeamEmailWords | null {
  const team = facts.teamName.trim();
  const programme = facts.programmeName.trim();
  if (!team || !programme) return null;
  const project = facts.project.trim();
  const teammates = facts.teammates.map((name) => name.trim()).filter(Boolean);
  const paragraphs = [`Your team is ${team}, one of ${programme}’s teams.`];
  if (project) paragraphs.push(`Your project: ${stop(project)}`);
  paragraphs.push(teammates.length > 0 ? `You’re with ${namesInWords(teammates)}.` : "Nobody else is in it yet.");
  paragraphs.push("Your weekly session stays as it is: the teams work inside it.");
  paragraphs.push("If something here isn’t right, reply to this email.");
  const first = facts.firstName.trim();
  return {
    subject: `Your team: ${team}`,
    greeting: first ? `Hi ${first},` : null,
    paragraphs,
    signOff: facts.leadFirstName?.trim() || null,
  };
}

/** A test's subject, marked so it cannot be taken for the real thing. */
export function testSubject(subject: string): string {
  return `[TEST] ${subject}`;
}

/** What a press did. */
export type TellReport = {
  /** People whose email went. */
  sent: number;
  /** People whose email this copy of the site may not send (held) or the do-not-email list stopped. */
  held: number;
  suppressed: number;
  /** Names whose send failed. They are still owed, and the next press tries them. */
  failed: string[];
  /** Names owed an email with no address on file. */
  noAddress: string[];
};

/** The lines after a press. */
export function tellReportWords(report: TellReport): string[] {
  const lines: string[] = [];
  if (report.sent > 0) lines.push(`Told ${peopleWords(report.sent)} their team.`);
  if (report.held > 0) {
    lines.push(`${peopleWords(report.held)} ${report.held === 1 ? "wasn’t" : "weren’t"} emailed: this copy of the site doesn’t send to ${report.held === 1 ? "their address" : "their addresses"}.`);
  }
  if (report.suppressed > 0) {
    lines.push(`${peopleWords(report.suppressed)} ${report.suppressed === 1 ? "is" : "are"} on the do-not-email list, so ${report.suppressed === 1 ? "wasn’t" : "weren’t"} emailed.`);
  }
  if (report.failed.length > 0) {
    lines.push(`The email to ${namesInWords(report.failed)} didn’t go. Press Tell everyone their team again to try ${report.failed.length === 1 ? "it" : "them"} again.`);
  }
  if (report.noAddress.length > 0) {
    const one = report.noAddress.length === 1;
    lines.push(`${namesInWords(report.noAddress)} ${one ? "has" : "have"} no email address on file, so ${one ? "isn’t" : "aren’t"} emailed.`);
  }
  if (lines.length === 0) lines.push("Nobody was owed an email.");
  return lines;
}
