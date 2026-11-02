/**
 * The words of the notes the team keeps about a person, and of Claude's
 * draft of one: the screens' and the routes' refusals alike. Plain, British,
 * no dashes. Pure: safe anywhere.
 */
import { COURSEWORK_USE_FROM_VERSION } from "@/lib/legal/courseworkUse";
import { REVIEW_USE_FROM_VERSION } from "@/lib/legal/reviewUse";
import type { NoteAudience, NoteSuggestion } from "./model";

const V = COURSEWORK_USE_FROM_VERSION;
const V15 = REVIEW_USE_FROM_VERSION;

/** A list in words: "a", "a and b", "a, b and c". */
function inWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** What a note may suggest its person for, as a box beside it says it. */
const SUGGESTION_WORDS: Record<NoteSuggestion, string> = {
  facilitating: "Facilitating",
  incubator: "An incubator",
  committee: "The committee",
};

export const NOTES_WORDS = {
  title: (firstName: string) => `Notes about ${firstName || "this person"}`,
  eachSays: "Each note says who reads it.",
  neverShown: (firstName: string) => `${firstName || "They"} never sees these on the site. They can ask for a copy, like any data we hold about them.`,

  /** The one line that says the rule, on each place the notes are drawn. */
  ruleProfile: `Every note is here. One written before they agreed to version ${V} of the privacy policy is marked: use it only within the programme it came from.`,
  ruleRun: `Notes written after they agreed to version ${V} of the privacy policy, and earlier notes written from this programme.`,
  ruleApplication: `Only notes written after they agreed to version ${V} of the privacy policy are shown beside an application.`,
  /** A programme's lead's place: what they read, and what happens to what they add. */
  ruleLead: "The notes kept for admins and the programme’s leads. A note you add is kept for both, and only you and admins can change it.",
  hiddenBesideApplication: (count: number) =>
    count === 1
      ? "1 earlier note isn’t shown here: it was written before they agreed, so it stays with its own programme."
      : `${count} earlier notes aren’t shown here: they were written before they agreed, so they stay with their own programmes.`,
  hiddenOnRun: (count: number) =>
    count === 1
      ? "1 earlier note isn’t shown here: it wasn’t written from this programme."
      : `${count} earlier notes aren’t shown here: they weren’t written from this programme.`,

  /** A note written before the agreement. */
  beforeFrom: (programme: string) =>
    `From ${programme}, before they agreed to version ${V} of the privacy policy: use only within that programme.`,
  beforeNoProgramme: `Written before they agreed to version ${V} of the privacy policy: never use it when considering them for something else.`,
  from: (programme: string) => `From ${programme}`,
  draftedByClaude: "Drafted by Claude",
  by: (name: string | null) => (name ? `By ${name}` : "By someone no longer on the site"),
  you: "By you",
  edited: (day: string) => `changed ${day}`,

  /** Who reads a note, as each note says it and as an admin chooses it. */
  audience: { admins: "Admins only", leads: "Admins and the programme’s leads" } as Readonly<Record<NoteAudience, string>>,
  chooseAudience: "Who reads it",
  audienceHint: {
    admins: "No programme’s lead sees it.",
    leads: "The leads of any programme they are on read it too.",
  } as Readonly<Record<NoteAudience, string>>,
  /** An admin's note that can only ever be an admin's: written before its person agreed to version 15. */
  staysWithAdmins: `Written before they agreed to version ${V15} of the privacy policy, so only admins read it.`,
  /** An admin writing about somebody who has not agreed to version 15. */
  adminsOnlyForNow: (firstName: string) =>
    `${firstName || "This person"} hasn’t agreed to version ${V15} of the privacy policy yet, so only admins read a note written now.`,
  /** A lead, about somebody who has not agreed to version 15. */
  leadNotYet: (firstName: string) =>
    `Only admins keep notes about ${firstName || "this person"} until they agree to version ${V15} of the privacy policy.`,
  /** A lead writing a note. */
  leadsRead: "Admins and the programme’s leads read the notes you add.",

  /** "Suggest for next term", ticked by a person and never by Claude. */
  suggestTitle: "Suggest for next term",
  suggestion: SUGGESTION_WORDS,
  suggested: (suggest: readonly NoteSuggestion[]) =>
    `Suggested for next term: ${inWords(suggest.map((key) => SUGGESTION_WORDS[key].toLowerCase()))}.`,

  empty: "No notes yet.",
  add: "Add a note",
  save: "Save note",
  saving: "Saving…",
  cancel: "Cancel",
  edit: "Edit",
  remove: "Delete",
  confirmRemove: "Delete this note? It can’t be brought back.",
  label: "Note",
  loadFailed: "Couldn’t load the notes. Try again.",
  retry: "Try again",
  saveFailed: "Couldn’t save the note. Try again.",
  removeFailed: "Couldn’t delete the note. Try again.",

  // Refusals, said by the routes.
  onlyAdmins: "Only an admin can read or write notes about a person.",
  notYours: "Notes about you are never shown to you, admin or not.",
  noAccount: "Nobody has this account.",
  empty400: "Write the note first.",
  tooLong: (max: number) => `A note can be up to ${max} characters.`,
  full: "This person’s record is full. Delete an old note first.",
  /** 409: a second end-of-week note from the same week. */
  weekKeptAlready: "A note from this week is already on their record. Change that one instead.",
  gone: "That note isn’t here any more. Reload the page.",
  badRun: "That programme isn’t one this person is on.",
  badPlace: "Say where the notes are shown: profile, application, or a run.",
  notFromProgramme: "Not from a programme",
  chooseProgramme: "Choose a programme",
  audience400: "Choose who reads the note: admins only, or admins and the programme’s leads.",
  suggest400: "A note can suggest facilitating, an incubator or the committee, and nothing else.",
  /** 409: keeping a note for leads that no lead may ever read. */
  staysWithAdmins409: `That note was written before they agreed to version ${V15} of the privacy policy, so only admins read it.`,
  notYetForLeads409: `They haven’t agreed to version ${V15} of the privacy policy, so only admins read a note about them written now.`,
  /** 403: a lead asking for what only an admin may do. */
  leadsAlways: "A note a programme’s lead adds is kept for admins and the programme’s leads: only an admin keeps a note to admins.",
  onlyAdminsKeepDrafts: "Only an admin keeps a note Claude drafted.",
  notYourNote: "You can change or delete only the notes you added.",

  // The programme's door, said by the programme's notes routes.
  noProgramme: "There’s no programme here.",
  notTheirs: "Notes about the people on a programme are for its lead and admins.",
  noRun: "This programme isn’t on a course run yet, so nobody is on it.",
  notOnProgramme: "They don’t hold a place on this programme or facilitate one of its groups.",
} as const;

/** Claude's draft of a note (`draft` route). */
export const DRAFT_WORDS = {
  button: "Draft a note with Claude",
  drafting: "Claude is drafting…",
  pickRun: "From which programme",
  hint: "Claude drafts from the weeks they submitted and what the team said about them, with no name sent. Nothing is kept until you press Save note.",
  drafted: "Claude’s draft. Change anything you like; nothing is kept until you press Save note.",
  noAgreement: `Claude can’t draft a note yet: they haven’t agreed to version ${V15} of the privacy policy, so nothing they wrote may be used for one.`,
  nothingSubmitted: "Claude can’t draft a note from this programme yet: no week of it is submitted. No submission, no note.",
  nothingCounted: `Claude can’t draft a note from this programme: nothing they submitted on it was written after they agreed to version ${V15} of the privacy policy.`,
  slip: "Claude’s draft named somebody it wasn’t sent, so it was dropped. Draft again.",
  noRuns: "They aren’t on a programme with coursework, so there is nothing for Claude to draft from.",
  failed: "Claude couldn’t draft a note just now. Try again.",
  /** As `askClaudeForJson` says it, so the screen and the route agree. */
  notSetUp: "Claude isn’t set up on this site yet.",
} as const;

/** "AGI Strategy, Autumn 2026": a run's name as a note keeps it. */
export function programmeLabelOf(run: { courseTitle?: string; label?: string } | null | undefined): string {
  if (!run) return "";
  const title = (run.courseTitle ?? "").trim();
  const label = (run.label ?? "").trim();
  return title && label ? `${title}, ${label}` : title || label;
}
