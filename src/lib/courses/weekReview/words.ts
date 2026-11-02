/**
 * THE WORDS OF A WEEK'S REVIEW (privacy v15, "AI-assisted review"), the
 * page's and the routes' alike. An admins' page, so "draft grade" is the
 * word for what Claude gives an answer; nothing here reaches a member, a
 * lead or a facilitator but the follow-up task's fixed words, which say no
 * reason. Plain, British, sentence case, no dashes, no pronoun for a person.
 *
 * Pure: safe anywhere.
 */
import { REVIEW_USE_FROM_VERSION } from "@/lib/legal/reviewUse";

const V = REVIEW_USE_FROM_VERSION;

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many.replace("{n}", String(count)));

/** "A, B and C". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export const REVIEW_WORDS = {
  // The door.
  onlyAdmins: "Only an admin can ask Claude to review a week, or read what it found.",
  notHere: "There’s no programme here.",
  noRun: "This programme isn’t on a course run yet, so there’s no week to review.",
  noWeek: "That week isn’t one of this run’s weeks.",
  badWeek: "Say which week: its id, like w03.",
  notYet: (weekNumber: number) => `Week ${weekNumber} can be reviewed once its first session has started.`,
  notSetUp: "Claude isn’t set up on this site yet.",
  nothingToSend: `Nothing of this week can be sent yet: only what people wrote after they agreed to version ${V} of the privacy policy is.`,
  badSeen: "Say what the page showed would be sent.",
  moved: "What would be sent has changed since this page loaded. Look at it again, then press again.",
  badPart: "Say which part to ask for again: grades, themes or hands.",

  // The page's head.
  eyebrow: "Weeks",
  title: (weekNumber: number) => `Week ${weekNumber} review`,
  whoSees: "Admins only",
  groupsMet: (met: number, of: number) =>
    met === of ? (of === 1 ? "its group has met" : "every group has met") : `${met} of ${of} groups have met`,
  back: "Back to the week",

  // What would be sent.
  wouldSend: "What Claude would be sent",
  counts: (answers: number, reflections: number, checkIns: number, reports: number) =>
    [
      plural(answers, "1 written answer", "{n} written answers"),
      plural(reflections, "1 reflection", "{n} reflections"),
      plural(checkIns, "1 check-in", "{n} check-ins"),
      plural(reports, "1 facilitator report", "{n} facilitator reports"),
    ].join(" · "),
  notIncluded: (count: number) =>
    plural(
      count,
      `1 not included yet: written before its writer agreed to version ${V} of the privacy policy.`,
      `{n} not included yet: written before their writers agreed to version ${V} of the privacy policy.`,
    ),
  threeRequests:
    "Three requests to Anthropic, each with a number in place of every name: the written answers alone for draft grades; the answers, reflections, check-ins pooled by group and the reports for what people found hard; the answers and the reports for who might need a hand. No check-in goes with the last.",
  press: "Review with Claude",
  pressAgain: "Review again",
  asking: "Claude is reading…",
  askedAt: (when: string) => `Drafted by Claude, ${when}. Kept until somebody asks again.`,
  failed: "Claude couldn’t review it just now. Try again.",
  loadFailed: "Couldn’t reach the site. Try again.",

  // Draft grades.
  gradesTitle: "Draft grades",
  gradesTag: "Claude, on the team’s 1 to 10 scale",
  gradesNone: "No written answer this week can be graded yet.",
  notAsked: "Not asked for yet.",
  gradesLine:
    "Grades help you choose what to read first. They’re never shown to the person, a lead or a facilitator, never become feedback, and never go into anyone’s notes or profile.",
  gradeBar: (grade: number, count: number) => `${plural(count, "1 answer", "{n} answers")} graded ${grade}`,
  gradesChanged: (count: number) =>
    plural(count, "1 answer has changed since Claude graded it, so it’s left out until the next review.", "{n} answers have changed since Claude graded them, so they’re left out until the next review."),
  strongest: (count: number) => `Read the strongest ${count}`,
  weakest: (count: number) => `Read the weakest ${count}`,
  strongestTitle: "The strongest answers",
  weakestTitle: "The weakest answers",
  gradeOf: (grade: number) => `Draft grade ${grade}`,
  hideList: "Hide the list",

  // What people found hard.
  themesTitle: "What people found hard",
  themesNone: "Claude found nothing that several people found hard.",
  themeCounts: (answers: number, checkIns: number, reports: number) => {
    const parts = [
      answers > 0 ? plural(answers, "1 answer", "{n} answers") : null,
      checkIns > 0 ? plural(checkIns, "1 check-in", "{n} check-ins") : null,
      reports > 0 ? plural(reports, "1 facilitator report", "{n} facilitator reports") : null,
    ].filter((part): part is string => part !== null);
    return listWords(parts);
  },
  themeFrom: (counts: string, groups: string) => (groups ? `${counts}, from ${groups}` : counts),
  themePart: (title: string) => `About ${title}`,

  // Might need a hand.
  handsTitle: "Might need a hand",
  handsCount: (count: number) => plural(count, "1 person", "{n} people"),
  handsNone: "Nobody, from the register, their weeks, the reports or Claude.",
  handsLine: "A reason for a person to look, never a decision. Nothing here is shown to them, to leads or to facilitators.",
  handsAsk:
    "Asking makes a task for the person’s group’s facilitators, with no reason given, and emails each of them whose task emails are on.",
  openPage: (name: string) => `Open ${name}’s page`,
  ask: (facilitators: string, name: string) => `Ask ${facilitators} to have a word with ${name}`,
  asked: (when: string) => `Asked ${when}`,
  askedNow: "Asked. The task is on their board.",
  noFacilitator: "No facilitator to ask",
  // Where each line came from.
  fromRegister: "The register",
  fromWeek: "Their week",
  fromReport: "A facilitator’s report",
  fromClaudeAnswers: "Claude, from their answers",
  fromClaudeReports: "Claude, from a facilitator’s report",
  fromClaudeBoth: "Claude, from their answers and a facilitator’s report",
  absentInARow: (count: number) => `Missed the last ${count} sessions without saying.`,
  notStarted: (weekNumber: number) => `Week ${weekNumber} not started when their group met.`,
  notSubmitted: (weekNumber: number) => `Week ${weekNumber} not submitted before it locked.`,
  reportHand: (note: string) => (note.trim() ? `Might need a hand: “${note.trim()}”` : "Might need a hand."),
  reportNotRead: "Hadn’t done the readings.",
  readReports: "Read the reports",

  // Pangram.
  pangramTitle: "Pangram",
  checkPangram: "Check with Pangram",

  // Each part's own state.
  partFailed: (reason: string) => `This part didn’t come back: ${reason}`,
  partOutOfDate: "The week has changed since Claude read it. Review again to include what changed.",
  askPartAgain: "Ask for this part again",

  // The foot.
  foot:
    "Claude was sent the week’s questions, written answers and reflections and the facilitators’ reports, each with a number in place of a name, and, for what people found hard only, the check-ins pooled by group with no person attached; the site puts the names back. A task you ask for here carries fixed words, never Claude’s and never anyone’s check-in. Notes about a person never use Claude’s grades or anyone’s check-ins.",

  // The follow-up route.
  followUpBadUid: "Say who to ask about.",
  followUpNotFellow: "They don’t hold a place on this programme, or they facilitate on its run.",
  followUpNoGroup: "They aren’t in a group with a facilitator to ask.",
  followUpAlready: "Their group’s facilitators have already been asked about them this week.",
} as const;

/** What the programme's lead is shown on a week's review: calm, and nothing of the week read for them. */
export const LEAD_REVIEW_WORDS = {
  title: "A week’s review is for admins",
  body: "What Claude finds in a week’s work is seen by admins only, so the review is theirs. The weeks, the coursework and the Surveys tab are yours as ever.",
  action: "Back to the weeks",
  back: "Back to the week",
} as const;

/**
 * THE FOLLOW-UP TASK'S WORDS, fixed: who asked, who to have a word with and
 * about which programme. Never a reason: the reason may be Claude's, or come
 * from a check-in, and neither may reach a facilitator.
 */
export const FOLLOW_UP_WORDS = {
  title: (name: string, groupName: string) => `Have a word with ${name} (${groupName})`,
  description: (askedBy: string, name: string, programme: string, weekNumber: number) =>
    [
      `${askedBy} asked you to have a word with ${name} about how ${programme} is going, at your next session or by message. It came up while week ${weekNumber} was being looked over.`,
      "",
      `No more is said here on purpose. Ask ${askedBy} if you want to know more, and move this to Done once you have had a word.`,
    ].join("\n"),
  subject: (title: string) => `You've been added to "${title}"`,
  push: "Open the task to see who to have a word with.",
} as const;
