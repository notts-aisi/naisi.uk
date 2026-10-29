/**
 * THE WORDS OF "CAN YOU MAKE THIS TIME?": the card on a person's programme
 * page once Publish has told them their group, its short form, the route's
 * refusals, and the marks staff read beside a person's name.
 *
 * The question is Zach's (29 Oct 2026): a button to accept, and one to say
 * they can't make it, which asks why this time does not work and which other
 * times would, "so we can reassign them", with the society's address as the
 * other way to say it. No board draws the card: its words are written in the
 * boards' voice and listed in the build notes for the boards' designers to
 * confirm.
 *
 * "I can't make this time" KEEPS the person's place. It is not leaving, and
 * nothing here says "give your place back".
 *
 * Every name, day, time and campus is a slot filled from a record. No dash of
 * either kind. Pure, importing only the campus's words and the society's
 * address, so the card in the browser, the route on the server and the tests
 * read the same sentences.
 */

import { CONTACT_EMAIL } from "@/content/socials";
import type { GroupCampus } from "../campus";
import { campusWhereWords } from "../campusWords";

/** The society's address, the other way to answer. */
export const ANSWER_BY_EMAIL_ADDRESS = CONTACT_EMAIL;

// ---------------------------------------------------------------------------
// The card on the programme page
// ---------------------------------------------------------------------------

export const CARD_TITLE = "Can you make this time?";

/**
 * What the card asks about: "Group B meets Tuesdays, 6pm to 8pm, on Jubilee
 * campus.", "Group B meets Tuesdays, 6pm to 8pm, online.", or with no group
 * to name (an incubator's people are told of no group) "You meet Tuesdays,
 * 6pm to 8pm." `when` is `sessionWhenLabel`'s.
 */
export function meetsLine(groupName: string | null, when: string, campus: GroupCampus | null): string {
  const who = groupName ? `${groupName} meets` : "You meet";
  const time = when || "at the time you were sent";
  return campus ? `${who} ${time}, ${campusWhereWords(campus)}.` : `${who} ${time}.`;
}

export const CAN_MAKE_IT = "I can make it";
export const CANT_MAKE_THIS_TIME = "I can’t make this time";

/** Under the buttons, before anybody has answered. */
export const KEEP_YOUR_PLACE = "Either way, you keep your place.";

/** Once they have said yes. */
export const SAID_YES = "You’ve told us you can make it.";

/** Once they have said they can't. */
export const SAID_CANT =
  "You’ve told us you can’t make this time. You keep your place while we look at moving you to another group, and we’ll be in touch.";

/** Over what they wrote, once they have said they can't. */
export const YOU_WROTE = "What you told us";

export const CHANGE_ANSWER = "Change your answer";

// ---------------------------------------------------------------------------
// The short form behind "I can't make this time"
// ---------------------------------------------------------------------------

export const FORM_INTRO =
  "You keep your place. Tell us why this time doesn’t work and when would, and we’ll look at moving you to another group.";

export const REASON_LABEL = "Why doesn’t this time work?";
export const REASON_HINT = "For example, a lecture or a shift at that time.";

export const ALTERNATIVES_LABEL = "Which other times would work?";
export const ALTERNATIVES_HINT = "Days and times, like Monday or Wednesday evenings.";

/** Who reads it, said where it is written. */
export const WHO_READS = "The programme’s lead and our admins read this. Your group and its facilitators don’t.";

/** Before the society's address, which the card draws as a link. */
export const OR_EMAIL = "You can also email";

export const SEND = "Send";
export const SENDING = "Sending…";
export const CANCEL = "Cancel";

/** What the card says once an answer is saved. */
export function savedWords(kind: "yes" | "cant"): string {
  return kind === "yes"
    ? "Thanks. You’ve told us you can make it."
    : "Thanks. We’ll look at moving you, and you keep your place in the meantime.";
}

/** A save that did not reach the server. */
export const DIDNT_SAVE = "That didn’t save. Check your connection and try again.";

// ---------------------------------------------------------------------------
// The route's refusals
// ---------------------------------------------------------------------------

export const ANSWER_REFUSAL = {
  body: "Expected a JSON object body.",
  kind: "Choose I can make it or I can’t make this time.",
  group: "Say which group this answer is about.",
  reasonMissing: "Say why this time doesn’t work for you.",
  alternativesMissing: "Say which other times would work for you.",
  /** Nothing of a group to answer about here: no seat, a seat not told yet, not taking part, or the run gone. */
  notAsked: "There’s no group time for you to answer here.",
  /** Their group changed after the page was opened: the answer would be about a group they are not in. */
  moved: "Your group has changed since this page was opened. Reload the page to see your group now.",
  /** A facilitator who holds a place sits in the group they facilitate. */
  facilitating: `You facilitate this group, so its time is one to sort out with the programme’s lead. Email ${ANSWER_BY_EMAIL_ADDRESS}.`,
} as const;

/** "Keep why to 500 characters." */
export function tooLongWords(what: "reason" | "alternatives", max: number): string {
  return what === "reason" ? `Keep why to ${max} characters.` : `Keep the other times to ${max} characters.`;
}

// ---------------------------------------------------------------------------
// What staff read beside a person (the board's cards and the circles view,
// which the coordinator wires): the programme's lead and admins only.
// ---------------------------------------------------------------------------

/** A card's mark for somebody who said they can make it. */
export const MARK_CAN_MAKE = "Can make it";
/** A card's mark for somebody who said they can't. */
export const MARK_CANT_MAKE = "Can’t make this time";

/** The mark's accessible name: "Ana can’t make this time". */
export function markLabel(name: string, kind: "yes" | "cant"): string {
  return kind === "yes" ? `${name} can make it` : `${name} can’t make this time`;
}

/**
 * Over each half of what they wrote, on their own card and in a person's
 * panel for staff: "Why", then "Would work".
 */
export const WHY = "Why";
export const WOULD_WORK = "Would work";
