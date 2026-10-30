/**
 * The words of the notes admins keep about a person, and of Claude's draft of
 * one: the screens' and the routes' refusals alike. Plain, British, no dashes.
 * Pure: safe anywhere.
 */
import { COURSEWORK_USE_FROM_VERSION } from "@/lib/legal/courseworkUse";

const V = COURSEWORK_USE_FROM_VERSION;

export const NOTES_WORDS = {
  title: (firstName: string) => `Notes about ${firstName || "this person"}`,
  whoReads: "Admins only",
  adminsSeeThese: "Only admins see these.",
  neverShown: (firstName: string) => `${firstName || "They"} never sees these on the site. They can ask for a copy, like any data we hold about them.`,

  /** The one line that says the rule, on each place the notes are drawn. */
  ruleProfile: `Every note is here. One written before they agreed to version ${V} of the privacy policy is marked: use it only within the programme it came from.`,
  ruleRun: `Notes written after they agreed to version ${V} of the privacy policy, and earlier notes written from this programme.`,
  ruleApplication: `Only notes written after they agreed to version ${V} of the privacy policy are shown beside an application.`,
  hiddenBesideApplication: (count: number) =>
    count === 1
      ? "1 earlier note isn’t shown here: it was written before they agreed, so it stays with its own programme."
      : `${count} earlier notes aren’t shown here: they were written before they agreed, so they stay with their own programmes.`,
  hiddenOnRun: (count: number) =>
    count === 1
      ? "1 earlier note from another programme isn’t shown here."
      : `${count} earlier notes from other programmes aren’t shown here.`,

  /** A note written before the agreement. */
  beforeFrom: (programme: string) =>
    `From ${programme}, before they agreed to version ${V} of the privacy policy: use only within that programme.`,
  beforeNoProgramme: `Written before they agreed to version ${V} of the privacy policy: never use it when considering them for something else.`,
  from: (programme: string) => `From ${programme}`,
  draftedByClaude: "Drafted by Claude",
  by: (name: string | null) => (name ? `By ${name}` : "By someone no longer on the site"),
  you: "By you",
  edited: (day: string) => `changed ${day}`,

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
  gone: "That note isn’t here any more. Reload the page.",
  badRun: "That programme isn’t one this person is on.",
  badPlace: "Say where the notes are shown: profile, application, or a run.",
  notFromProgramme: "Not from a programme",
  chooseProgramme: "Choose a programme",
} as const;

/** Claude's draft of a note (`draft` route). */
export const DRAFT_WORDS = {
  button: "Draft a note with Claude",
  drafting: "Claude is drafting…",
  pickRun: "From which programme",
  hint: "Claude drafts from what they wrote after they agreed, with no name sent. Nothing is kept until you press Save note.",
  drafted: "Claude’s draft. Change anything you like; nothing is kept until you press Save note.",
  noAgreement: `Claude can’t draft a note yet: they haven’t agreed to version ${V} of the privacy policy, so nothing they wrote may be used.`,
  nothingCounted: `Claude can’t draft a note from this programme: nothing they wrote on it came after they agreed to version ${V} of the privacy policy.`,
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
