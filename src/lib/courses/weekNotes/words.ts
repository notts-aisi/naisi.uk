/**
 * THE WORDS OF A WEEK'S NOTES ABOUT PEOPLE (privacy v15, "AI-assisted
 * review"), the page's and the routes' alike. Admins draft and save; the
 * programme's leads read the saved notes kept for them. Nothing here reaches
 * a member or a facilitator. Plain, British, sentence case, no dashes, no
 * pronoun for a person.
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

export const WEEK_NOTES_WORDS = {
  // The door and the routes.
  onlyAdmins: "Only an admin can ask Claude to draft notes, or save or discard a draft.",
  notHere: "There’s no programme here.",
  noRun: "This programme isn’t on a course run yet, so there’s no week to write notes about.",
  noWeek: "That week isn’t one of this run’s weeks.",
  badWeek: "Say which week: its id, like w03.",
  badUid: "Say whose note it is.",
  notFellow: "They don’t hold a place on this programme, or they facilitate on its run.",
  /** How the route's "not yet" begins, so the press can tell it from a refusal about one person. */
  notYetLead: "This week’s notes can be drafted once every group has met",
  notYet: (met: number, of: number) =>
    of === 0
      ? "This week’s notes can be drafted once every group has met, and no group meets it yet."
      : `This week’s notes can be drafted once every group has met: ${met} of ${of} have.`,
  notSetUp: "Claude isn’t set up on this site yet.",
  noSubmission: "No submission, no note: their week isn’t submitted.",
  noWork: "This week asks for no written work, so there are no notes to draft from it.",
  nothingToSend: `Nothing of their week can be sent: only work written after they agreed to version ${V} of the privacy policy is.`,
  draftedAlready: "There’s a draft for them already. Use Draft again on its card to replace it.",
  keptAlready: "A note from this week is already on their record.",
  slip: "Claude’s draft named somebody it wasn’t sent, so it wasn’t kept. Draft again.",
  noDraft: "There’s no draft for them now. Reload the page.",
  notSubmittedNow: "Their week isn’t submitted now, so there’s nothing to note. Discard the draft, or wait for them to submit it again.",
  failed: "Claude couldn’t draft a note just now. Try again.",
  loadFailed: "Couldn’t reach the site. Try again.",

  // The page's head.
  eyebrow: "Weeks",
  title: (weekNumber: number) => `Week ${weekNumber} notes`,
  adminsDraft: "Admins draft and save",
  leadsRead: "Leads read them for their programme",
  subline: "One draft note per person, for you to edit and save to their notes.",
  leadSubline: "Notes about people from this week, drafted by Claude and saved by an admin for the programme’s leads.",
  notOpenYet: (weekNumber: number) => `Week ${weekNumber}’s notes open once its first session has started.`,
  back: "Back to the week",

  // What Claude may use.
  usesTitle: "What Claude may use",
  uses: ["What they submitted as written work", "Feedback people gave", "The team’s ratings and comments"],
  neverUses: ["Not their surveys or check-ins", "Not facilitators’ session reports", "Not Claude’s own grades"],
  usesLine:
    "So a note rests on their own work and on what people on the team said about it, never on Claude grading its own work. Names never leave: Claude gets labels and numbers in their place, and the site puts the names back.",

  // The counts and the filters.
  counts: (people: number, drafts: number, nothing: number, saved: number) =>
    [
      plural(people, "1 person", "{n} people"),
      plural(drafts, "1 draft", "{n} drafts"),
      `${nothing} submitted nothing this week, so there’s no note for them`,
      `${saved} saved`,
    ].join(" · "),
  notYetAgreed: (count: number) =>
    plural(
      count,
      `1 submitted, but nothing of theirs can be sent: only work written after they agreed to version ${V} of the privacy policy is.`,
      `{n} submitted, but nothing of theirs can be sent: only work written after they agreed to version ${V} of the privacy policy is.`,
    ),
  onlyDrafts: "Only drafts",
  onlySuggestions: "Only suggestions",
  showEveryone: "Show everyone",
  filtersLabel: "Show",
  noneShown: "Nothing to show here yet.",
  noneYet: "No drafts or notes from this week yet.",

  // The press.
  press: "Draft this week’s notes",
  pressLine: (count: number) =>
    plural(
      count,
      "Sends one request to Anthropic, for the 1 person who submitted and has no draft or note from this week, with labels and numbers in place of names. Nobody is emailed.",
      "Sends one request to Anthropic for each of the {n} people who submitted and have no draft or note from this week, with labels and numbers in place of names. Nobody is emailed.",
    ),
  drafting: (done: number, total: number) => `Drafted ${done} of ${total}…`,
  stopped: (names: string, reason: string) => `Couldn’t draft a note for ${names}: ${reason} Press again to try again.`,
  notYetPress: (met: number, of: number) =>
    of === 0
      ? "You can draft this week’s notes once every group has met, and no group meets it yet."
      : `You can draft this week’s notes once every group has met: ${met} of ${of} groups have met.`,
  nobodyToDraft: "Everybody who submitted something that can be sent has a draft or a note from this week.",

  // A card.
  draft: "Draft",
  savedBy: (name: string) => `Saved to their notes by ${name}`,
  builtOnlyFrom: "Built only from",
  draftNote: "Draft note",
  note: "Note",
  save: "Save to their notes",
  saving: "Saving…",
  discard: "Discard",
  discarding: "Discarding…",
  draftAgain: "Draft again",
  replaceChanges: "Replace your changes? Draft again",
  draftingOne: "Claude is drafting…",
  openNotes: "Open their notes",
  offered: "Offered to facilitate on their application",
  draftedAt: (when: string) => `Drafted by Claude, ${when}.`,
  newer: (what: "rating" | "feedback" | "both", when: string) =>
    `${what === "rating" ? "A rating" : what === "feedback" ? "Feedback" : "Feedback and a rating"} came in after this draft, the newest ${when}. Draft again to include it.`,
  changed: "Their week has changed since this draft. Draft again to use what’s there now.",
  reopened: "Their week was reopened after this draft, so there’s no submission to note. Discard it, or wait for them to submit it again.",
  savedLine: (weekNumber: number, name: string) => `Drafted by Claude from week ${weekNumber}. Saved by ${name}.`,
  noSuggestion: "No suggestion for next term.",
  readBy: (who: string) => `Who reads it: ${who}`,
  whoReads: "Who reads it",
  savedLineGone: (weekNumber: number) => `Drafted by Claude from week ${weekNumber}. Saved by someone no longer on the site.`,
  saveFailed: "Couldn’t save the note. Try again.",
  discardFailed: "Couldn’t discard the draft. Try again.",

  // "Built only from", a line each.
  work: (weekNumber: number, parts: { written: number; reflections: number; boxes: number }, day: string | null) => {
    const what = listWords(
      [
        parts.written > 0 ? plural(parts.written, "answer", "{n} answers") : null,
        parts.reflections > 0 ? plural(parts.reflections, "1 reflection", "{n} reflections") : null,
        parts.boxes > 0 ? plural(parts.boxes, "1 box", "{n} boxes") : null,
      ].filter((part): part is string => part !== null),
    );
    return day ? `Week ${weekNumber} ${what}, submitted ${day}` : `Week ${weekNumber} ${what}`;
  },
  levels: (weekNumber: number) => `Week ${weekNumber} feedback levels on the course’s rubric`,
  feedback: (name: string | null) => (name ? `${name}’s written feedback` : "Written feedback from someone no longer on the site"),
  rating: (name: string | null, rating: number, comment: string) =>
    `${name ?? "Someone no longer on the site"}: ${rating}${comment ? `, “${comment}”` : ""}`,

  // The lead's page.
  leadEmpty: "No notes from this week are kept for the programme’s leads yet.",
  leadLine: "Admins choose which notes the programme’s leads read. You can add notes of your own on a person’s page.",

  // The foot.
  foot: (weekNumber: number) =>
    `Nothing goes on their profile until an admin saves it. A saved note says it was drafted by Claude from week ${weekNumber} and who checked it. Admins and the programme’s leads read it, and leads can add notes of their own. It’s part of a copy of their data if they ask.`,
} as const;
