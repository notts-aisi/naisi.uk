/**
 * THE COURSE RUN SECTION'S LAST PARTS, AS A PROGRAMME'S SETTINGS SAYS THEM
 * (admins only): making a new run where the programme names none, taking off
 * somebody who gave their place back, the run's older roles, and Careful.
 *
 * The questions of the take-off itself are the take-off sheet's
 * (`src/lib/courses/takeOff/words.ts`), and the cancel and destroy dialogs
 * are the older run page's (`src/features/courses/RunDangerZone.tsx`), both
 * word for word. What is here is the section's own.
 *
 * Pure: the section draws these and a test reads them.
 */

const named = (label: string) => label.trim() || "this run";
const namedFirst = (label: string) => label.trim() || "This run";

// ---------------------------------------------------------------------------
// Making a new run
// ---------------------------------------------------------------------------

/** Under the run box when the programme names no run. */
export function noRunYetWords(programmeName: string, termName: string): string {
  const term = termName.trim();
  return `${programmeName.trim()} doesn’t name a run${term ? ` for ${term}` : ""} yet. Make one from the course, or name one that’s already made.`;
}

/** The button, and the title of its form. */
export function makeRunWords(programmeName: string): string {
  return `Make a new run of ${programmeName.trim()}`;
}

/** Under the form. */
export const MAKE_NOTE = "It starts as a draft, named on this programme. Add its weeks on the Weeks tab. Nobody is emailed.";
export const MAKE_CANCEL = "Cancel";
export const MAKE_CONFIRM = "Make the run";
export const MAKING = "Making the run…";

/** After the run is made. */
export function madeWords(label: string): string {
  return `${namedFirst(label)} is made and named on this programme. Nobody was emailed.`;
}

// ---------------------------------------------------------------------------
// Taking off somebody who gave their place back
// ---------------------------------------------------------------------------

export const GAVE_BACK_TITLE = "No longer hold a place";

/** Under the list, when the take-off closes the row (`COURSE_RUN_CLOSES_THE_ROW`). The take-off sheet says who is emailed. */
export const GAVE_BACK_NOTE =
  "They gave their place back after they were handed over. Take them off the run here: their seat is freed and their row on the run’s list is closed.";

/** The same, when the take-off leaves the row open. */
export const GAVE_BACK_NOTE_ROW_OPEN = "They gave their place back after they were handed over. Take them off the run here: their seat is freed.";

/** The note under the list, as the switch says. */
export function gaveBackNote(closesRow: boolean): string {
  return closesRow ? GAVE_BACK_NOTE : GAVE_BACK_NOTE_ROW_OPEN;
}

/**
 * "Gave their place back on Fri 6 Nov · still in Group B". With a seat in no
 * group, "· not in a group"; with no seat at all (handed over, never placed),
 * "· not in a group, so there’s no seat to free".
 */
export function gaveBackLine(day: string | null, groupName: string | null, hasSeat = true): string {
  const head = day ? `Gave their place back on ${day}` : "Gave their place back";
  const group = (groupName ?? "").trim();
  if (group) return `${head} · still in ${group}`;
  return hasSeat ? `${head} · not in a group` : `${head} · not in a group, so there’s no seat to free`;
}

/** For somebody with no seat: today's way to their row, on the older run page. */
export const CHANGE_THEIR_ROW = "Change their row on the run’s own applications list";

/** A holder whose row on the run's list is closed: what is true, and no action that fails. */
export const CLOSED_ROW_TITLE = "Hold a place, and their row on the run’s list is closed";
export const CLOSED_ROW_NOTE = "A closed row can’t be opened again, so they can’t be put on this run’s board.";

/** The button: "Take Rahul off the run…". */
export function takeOffWords(firstName: string): string {
  return `Take ${firstName.trim() || "them"} off the run…`;
}

// ---------------------------------------------------------------------------
// The older roles
// ---------------------------------------------------------------------------

export type RoleList = "trackLeads" | "runFacilitators";

export const ROLES_TITLE = "Track leads and run facilitators";
export const ROLES_NOTE = "Named on the run’s older page. Each keeps what the role allows until removed here.";
export const ROLE_HEADINGS: Record<RoleList, string> = {
  trackLeads: "Track leads",
  runFacilitators: "Run facilitators",
};
export const REMOVE_BUTTON = "Remove…";
export const REMOVE_CONFIRM = "Remove";
export const KEEP_THEM = "Keep them";

const ROLE_NOUN: Record<RoleList, string> = { trackLeads: "a track lead", runFacilitators: "a run facilitator" };

export function removeTitle(name: string, list: RoleList): string {
  return `Remove ${name.trim() || "them"} as ${ROLE_NOUN[list]}?`;
}

/** What the person can no longer do, in one sentence, true whatever else they are. */
export const ROLE_AFTER: Record<RoleList, string> = {
  trackLeads:
    "As a track lead they can no longer work on this run’s weeks, applications, groups, registers or coursework, or email everybody on it; what they do as its programme’s lead, a facilitator or an admin stays.",
  runFacilitators:
    "As a run facilitator they can no longer open this run or email everybody on it; what they do as one of its groups’ facilitators, a track lead or an admin stays.",
};

export function removedWords(name: string, list: RoleList): string {
  return `${name.trim() || "They"} ${name.trim() ? "is" : "are"} no longer ${ROLE_NOUN[list]}. Nobody was emailed.`;
}

/** The route's refusal for somebody no longer on the list. */
export const NOT_ON_THE_LIST = "They’re not on that list any more.";

// ---------------------------------------------------------------------------
// Careful
// ---------------------------------------------------------------------------

export const CAREFUL_TITLE = "Careful";

export const ARCHIVE_TITLE = "Archive the run";
export const ARCHIVE_OFFER_HINT = "Archived runs leave the lists of runs and stay for the record.";
export const ARCHIVE_NOT_YET_HINT = "You can archive the run once it has completed or been cancelled.";
export const ARCHIVE_BUTTON = "Archive the run…";
export function archiveQuestion(label: string): string {
  return `Archive ${named(label)}?`;
}
export const ARCHIVE_BODY = "It leaves the lists of runs and stays for the record, with its groups, registers, work and certificates.";
export const KEEP_IT = "Keep it";
export const ARCHIVE_CONFIRM = "Archive the run";
export function archivedWords(label: string): string {
  return `${namedFirst(label)} is archived. Nobody was emailed.`;
}

export const ARCHIVED_HINT = "This run is archived.";
export const RESTORE_BUTTON = "Restore the run…";
export function restoreQuestion(label: string): string {
  return `Restore ${named(label)}?`;
}
export const RESTORE_BODY = "It comes back to the lists of runs.";
export const KEEP_ARCHIVED = "Keep it archived";
export const RESTORE_CONFIRM = "Restore the run";
export function restoredWords(label: string): string {
  return `${namedFirst(label)} is restored. Nobody was emailed.`;
}

export const CANCEL_TITLE = "Cancel this cohort";
export const CANCEL_HINT = "For a run that won’t go ahead. Nobody is emailed.";
/** Under it on a running run, the older run page's own warning. */
export const CANCEL_MEETING_WARNING = "If this cohort has been meeting, tell them yourself before or straight after you cancel.";
export const CANCEL_BUTTON = "Cancel this cohort…";
/** What the older page says once a cohort is cancelled. */
export const CANCELLED = "Cohort cancelled";

export const DESTROY_TITLE = "Destroy this run";
export const DESTROY_HINT = "Removes the run and what hangs off it, with a receipt. For a run made by mistake.";
export const DESTROY_BUTTON = "Destroy this run…";
/** Where a destroyed run's receipt leads: this page, read again. */
export const BACK_TO_SETTINGS = "Back to the programme’s Settings";

export const NOBODY_IS_EMAILED = "Nobody is emailed.";
