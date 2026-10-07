import { formatRunStartShort } from "@/lib/courses/window";
import type { AdmissionApplicationStatus } from "@/lib/firestore/admissionApplications";
import { standingOf, type Answerable } from "./standing";

/**
 * WHAT ONE REPLY DOES TO ONE APPLICATION.
 *
 * After decision day somebody who was placed can say "I’m coming" or "I can’t
 * make it", and somebody who was invited can accept or say "No thanks". This
 * module decides what each of those four does to the application as it stands
 * right now: nothing, a refusal in a sentence the person can act on, or a
 * write. The route asks it inside a transaction, so the answer is about the
 * document as it is at that moment, and the page asks it for nothing: the
 * page shows a standing, never a prediction of what a reply would do.
 *
 * ## The rules
 *
 *  - A PLACE IS PRESUMED. "I’m coming" is optional and changes nothing but
 *    the record of it. "I can’t make it" gives the place back, whether the
 *    place came from the person's own ranking or from an invitation they
 *    accepted.
 *  - AN INVITATION IS ANSWERED ONCE. Accepting makes it a place. "No thanks"
 *    gives it back. Once it is accepted it is a place like any other, and
 *    the way out of it is "I can’t make it".
 *  - A PLACE GIVEN BACK STAYS GIVEN BACK. It may already be somebody else's,
 *    so the person who gave it back cannot take it again from the page. They
 *    are told to write to us, and a person decides.
 *  - A REPLY SAID TWICE IS SAID ONCE. Saying the same thing again writes
 *    nothing and is not an error.
 *  - THE STATUS FOLLOWS THE REPLY. An accepted invitation makes the
 *    application `accepted`; a place or an invitation given back makes it
 *    `withdrawn`. The route moves the form's counters with it.
 *
 * ## The reply-by day
 *
 * An invitation carries the day replies were asked for by. It is shown to the
 * person and it is NOT a wall: a late yes is still a yes, the place is still
 * being held for them (nothing in this system hands a held place to anybody
 * else), and a committee chasing replies wants the answer recorded.
 * `REPLY_BY_IS_A_DEADLINE` is the one switch. With it on, accepting after the
 * day is refused with a sentence that says who to write to. "No thanks" is
 * never refused for being late: it only ever frees a place.
 *
 * Pure. The sentences here are read by applicants, so they never use the
 * committee's own words for how a decision was reached.
 */

export const REPLIES = ["coming", "cant-make-it", "accept-invitation", "decline-invitation"] as const;

export type Reply = (typeof REPLIES)[number];

export function isReply(v: unknown): v is Reply {
  return typeof v === "string" && (REPLIES as readonly string[]).includes(v);
}

/** Whether accepting an invitation is refused once its reply-by day has passed. */
export const REPLY_BY_IS_A_DEADLINE = false;

export const CONTACT = "ai-safety@uonsu.com";

export const REPLY_REFUSALS = {
  waiting: "Decisions have not been sent yet, so there is nothing to reply to.",
  withdrawn: `This application was withdrawn, so there is nothing to reply to. If that is not right, email ${CONTACT}.`,
  noPlace: "There is no place or invitation on this application to reply to.",
  unclear: `We could not read the result on this application. Email ${CONTACT} and we will tell you where things stand.`,
  placeNotInvitation: "This application has a place, not an invitation. Reload the page and use the buttons there.",
  invitationFirst: "This application has an invitation to answer. Reload the page and use the buttons there.",
  alreadyAccepted:
    "You have accepted this invitation. Reload the page: if you can no longer come, you can tell us there.",
  gaveBack: `You gave this place back, so it may have gone to someone else. If that has changed, email ${CONTACT} and we will see what we can do.`,
} as const;

/** The sentence for an invitation accepted after its day, when the day is a wall. */
export function lateInvitationRefusal(replyBy: string): string {
  const day = formatRunStartShort(replyBy);
  const until = day ? `This invitation was open until ${day}.` : "This invitation is no longer open.";
  return `${until} Email ${CONTACT} and we will tell you whether the place is still free.`;
}

export type ReplyWrite = {
  kind: "write";
  /** Set on `attendance.answer`, with the time. */
  attendance: "coming" | "cant-make-it" | null;
  /** Set on `invitation.response`, with the time. */
  invitationResponse: "accepted" | "declined" | null;
  /** The status the application has once this is written. */
  status: AdmissionApplicationStatus;
  /** This reply gives a place or an invitation back. */
  releases: boolean;
  /** This reply is the one that turns an invitation into a place. */
  takesPlace: boolean;
};

export type ReplyDecision =
  /** Already said. Nothing is written and nothing is wrong. */
  | { kind: "unchanged" }
  | { kind: "refused"; error: string }
  | ReplyWrite;

const refused = (error: string): ReplyDecision => ({ kind: "refused", error });

/**
 * What `reply` does to `application`. `today` is the civil date in London
 * ("2026-10-25"), which is what a reply-by day is compared with.
 */
export function decideReply(
  application: Answerable,
  reply: Reply,
  today: string,
  replyByIsADeadline: boolean = REPLY_BY_IS_A_DEADLINE,
): ReplyDecision {
  const standing = standingOf(application);
  const aboutInvitation = reply === "accept-invitation" || reply === "decline-invitation";
  const givesBack = reply === "cant-make-it" || reply === "decline-invitation";

  if (standing.kind === "waiting") return refused(REPLY_REFUSALS.waiting);
  if (standing.kind === "withdrawn") return refused(REPLY_REFUSALS.withdrawn);
  if (standing.kind === "no-place") return refused(REPLY_REFUSALS.noPlace);
  if (standing.kind === "unclear") return refused(REPLY_REFUSALS.unclear);

  if (standing.kind === "invitation") {
    if (!aboutInvitation) return refused(REPLY_REFUSALS.invitationFirst);
    if (reply === "decline-invitation") {
      return {
        kind: "write",
        attendance: null,
        invitationResponse: "declined",
        status: "withdrawn",
        releases: true,
        takesPlace: false,
      };
    }
    if (replyByIsADeadline && standing.replyBy < today) {
      return refused(lateInvitationRefusal(standing.replyBy));
    }
    return {
      kind: "write",
      attendance: null,
      invitationResponse: "accepted",
      status: "accepted",
      releases: false,
      takesPlace: true,
    };
  }

  // Somebody placed by their own ranking was never invited to anything.
  if (standing.via === "ranking" && aboutInvitation) return refused(REPLY_REFUSALS.placeNotInvitation);

  if (standing.kind === "released") {
    return givesBack ? { kind: "unchanged" } : refused(REPLY_REFUSALS.gaveBack);
  }

  // A place, held.
  if (reply === "decline-invitation") return refused(REPLY_REFUSALS.alreadyAccepted);
  if (reply === "cant-make-it") {
    return {
      kind: "write",
      attendance: "cant-make-it",
      invitationResponse: null,
      status: "withdrawn",
      releases: true,
      takesPlace: false,
    };
  }
  // "I’m coming", or the invitation accepted again: both say they are coming.
  if (standing.saidComing) return { kind: "unchanged" };
  return {
    kind: "write",
    attendance: "coming",
    invitationResponse: null,
    status: "accepted",
    releases: false,
    takesPlace: false,
  };
}
