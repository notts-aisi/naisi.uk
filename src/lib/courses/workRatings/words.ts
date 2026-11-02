import type { WorkRatingRole } from "@/lib/firestore/courseWorkRatings";
import { londonClockLabel, londonDayLabel } from "../londonLabels";

/**
 * EVERY WORD RATINGS FOR THE TEAM SAY: "Rating for the team" and "What the
 * team said" on a written answer's review page, the admin's Pangram chip
 * beside the answer, and the ratings route's refusals. One file, so the page
 * and the route say one thing.
 *
 * Staff words: nobody rated ever reads them. Even so, never "mark", "grade"
 * or "score", and no pronoun for a person: their name. Never "team ratings"
 * either, which reads as the ratings at a programme's end or an incubator's
 * teams. Days as "Sun 22 Nov", times in the house clock ("10:02am").
 */

/** "Sun 22 Nov, 10:02am". */
function dayClock(at: Date): string {
  return `${londonDayLabel(at)}, ${londonClockLabel(at)}`;
}

// ---------------------------------------------------------------------------
// Rating for the team
// ---------------------------------------------------------------------------

export const RATING_FOR_THE_TEAM = "Rating for the team";
/** Who reads a rating: the chip beside the card's title. */
export const WHO_READS_RATINGS = "Admins and the programme’s lead only";
export const YOUR_RATING = "Your rating";
export const RATING_SCALE_LINE = "Out of 10: 1 is weak, 10 is exceptional.";
export const COMMENT_FOR_THE_TEAM = "Comment for the team";
export const SAVE_RATING = "Save rating";
export const SAVING = "Saving…";
export const CLEAR_MY_RATING = "Clear my rating";
export const CLEAR_IT = "Clear it";
export const KEEP_IT = "Keep it";
export const RATING_SAVED = "Saved. Only admins and the programme’s lead see it.";
export const RATING_CLEARED = "Cleared. Your rating and its comment are gone.";

/** "8 of 10", a rating as every line says it. */
export function outOfTenWords(rating: number): string {
  return `${rating} of 10`;
}

/** "Never shown to Sofia.", under the comment. */
export function neverShownWords(firstName: string): string {
  return `Never shown to ${firstName || "the person whose answer it is"}.`;
}

/** "Clear your rating of Sofia’s answer? Its comment goes with it." */
export function clearConfirmWords(firstName: string): string {
  return firstName ? `Clear your rating of ${firstName}’s answer? Its comment goes with it.` : "Clear your rating of this answer? Its comment goes with it.";
}

/** "Rated Sun 22 Nov, 10:02am", with its last change when it was changed. */
export function ratedWords(at: Date | null, changedAt: Date | null): string {
  const rated = at ? `Rated ${dayClock(at)}` : "Rated";
  return changedAt ? `${rated}. Changed ${dayClock(changedAt)}` : rated;
}

// ---------------------------------------------------------------------------
// What the team said
// ---------------------------------------------------------------------------

export const WHAT_THE_TEAM_SAID = "What the team said";
export const NOT_RATED_YET = "Not rated yet";
/** A rater no longer on record. */
export const SOMEBODY_ON_THE_TEAM = "Somebody on the team";

/** "Lead", "Admin": as what somebody rated. */
export function raterRoleWords(role: WorkRatingRole): string {
  return role === "lead" ? "Lead" : "Admin";
}

/** "Sun 22 Nov": the day a rating was given, or last changed. */
export function saidDayWords(at: string | null, changedAt: string | null): string {
  const when = changedAt ?? at;
  return when ? londonDayLabel(new Date(when)) : "";
}

// ---------------------------------------------------------------------------
// The Pangram chip beside the answer, for an admin alone
// ---------------------------------------------------------------------------

/** What Pangram's last reading of the answer said, in the chip beside it. */
export function pangramChipWords(reading: { worthALook: boolean; outOfDate: boolean }): string {
  if (reading.outOfDate) return "Pangram: changed since it checked";
  return reading.worthALook ? "Pangram: worth a look" : "Pangram: nothing to flag";
}

// ---------------------------------------------------------------------------
// The route's refusals
// ---------------------------------------------------------------------------

export const SAY_WHOSE_ANSWER = "Say whose answer, which week and which answer.";
export const PICK_A_RATING = "Pick a rating from 1 to 10.";
export const WRITE_A_COMMENT = "Write a comment for the team before you save.";
export const NOT_A_RATING_WEEK = "That answer can’t be rated here. Reload the page.";
export const NOT_READABLE_YET = "That week hasn’t been submitted yet, so there’s nothing to rate.";
export const ANSWER_EMPTY = "That written answer is empty, so there’s nothing to rate.";
export const NO_RATING_TO_CLEAR = "You haven’t rated this answer, so there’s nothing to clear.";
export const RATING_NOT_SAVED = "That rating didn’t save. Check your connection and try again.";
export const RATING_NOT_CLEARED = "That didn’t clear. Check your connection and try again.";

/** A comment over its cap. */
export function commentTooLongWords(limit: number): string {
  return `That’s over ${limit} words. Keep the comment for the team short.`;
}
