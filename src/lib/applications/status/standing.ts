import type { AdmissionApplicationStatus } from "@/lib/firestore/admissionApplications";
import type { ApplicationResultKind } from "../model";

/**
 * WHERE ONE PERSON STANDS, read off their own application and nothing else.
 *
 * Decision day writes `result` (and `invitation`, for an invitation) onto the
 * applicant's own document. The person's replies are written there too:
 * `attendance` by somebody who was placed, `invitation.response` by somebody
 * who was invited. This module turns those fields into the one thing the
 * page, the reply route and anybody counting places needs to know.
 *
 * ## The rule this file exists for
 *
 * NOTHING HERE READS A DECISION. Until `result` is on the document the answer
 * is `waiting`, whatever any lead has decided, because a lead's decision is
 * not on this document and cannot be reached from the modules that serve an
 * applicant. So a page built on `standingOf` cannot say anything early: there
 * is nothing early for it to read.
 *
 * ## Who holds a place
 *
 * A `place` is held: by somebody their own ranking placed, or by somebody who
 * accepted an invitation. An `invitation` that has not been answered holds
 * its place too, until it is. `released` means the person gave a place or an
 * invitation back, and it is free for somebody else: "No thanks" to an
 * invitation, or "I can’t make it" from anybody holding a place. The reply
 * route moves the application's status to `withdrawn` in the same write, so
 * anything that already leaves a withdrawn application out of its counting
 * stops counting the place without knowing about replies.
 *
 * `attendance` is the reply of anybody who HOLDS a place, however they came
 * by it. Somebody who accepted an invitation and later cannot come keeps
 * `invitation.response: "accepted"`, which is what happened, and gets
 * `attendance.answer: "cant-make-it"`, which is what happened next.
 *
 * Pure, with type-only imports, so the route, the page and a test all ask the
 * same function.
 */

/**
 * The fields of an application these rules read. Structural, so the stored
 * document and the copy an applicant is sent both fit it.
 */
export type Answerable = {
  status: AdmissionApplicationStatus;
  result: { kind: ApplicationResultKind; programmeId: string | null } | null;
  invitation: {
    programmeId: string;
    replyBy: string;
    response: "accepted" | "declined" | null;
  } | null;
  attendance: { answer: "coming" | "cant-make-it" } | null;
};

/** How somebody came by a place: their own ranking, or an invitation they accepted. */
export type PlaceVia = "ranking" | "invitation";

export type Standing =
  /** Decision day has published nothing on this application. */
  | { kind: "waiting" }
  /** Taken out of the term by something other than the person's own reply. */
  | { kind: "withdrawn" }
  /** Holds a place. `saidComing` is whether they have told us they are coming. */
  | { kind: "place"; via: PlaceVia; programmeId: string | null; saidComing: boolean }
  /** Invited, and has not answered. The place is held for them until they do. */
  | { kind: "invitation"; programmeId: string; replyBy: string }
  /** Had a place or an invitation and gave it back, and how they said so. */
  | { kind: "released"; via: PlaceVia; programmeId: string | null; how: "cant-make-it" | "no-thanks" }
  /** Decision day's kind no. Which of its two reasons it was is not the page's to say. */
  | { kind: "no-place" }
  /**
   * A result that cannot be read as an offer or as a no: it says invited and
   * carries no invitation. Never guessed at in either direction. The page
   * asks the person to write to us, and the reply route refuses.
   */
  | { kind: "unclear" };

export function standingOf(application: Answerable): Standing {
  const { result, invitation, attendance } = application;
  if (!result) {
    // Nothing published. A withdrawn application is still told so: that is
    // something the person did or asked for, not a decision about them.
    return application.status === "withdrawn" ? { kind: "withdrawn" } : { kind: "waiting" };
  }

  if (result.kind === "accepted") {
    if (attendance?.answer === "cant-make-it") {
      return { kind: "released", via: "ranking", programmeId: result.programmeId, how: "cant-make-it" };
    }
    if (application.status === "withdrawn") return { kind: "withdrawn" };
    return {
      kind: "place",
      via: "ranking",
      programmeId: result.programmeId,
      saidComing: attendance?.answer === "coming",
    };
  }

  if (result.kind === "invited") {
    // An invitation is written with its result, in one transaction, so a
    // result that says invited with no invitation beside it should not exist.
    // If one does, it is not turned into a no, and not into an offer either.
    if (!invitation) {
      return application.status === "withdrawn" ? { kind: "withdrawn" } : { kind: "unclear" };
    }
    const programmeId = invitation.programmeId;
    if (invitation.response === "declined") {
      return { kind: "released", via: "invitation", programmeId, how: "no-thanks" };
    }
    if (invitation.response === "accepted") {
      if (attendance?.answer === "cant-make-it") {
        return { kind: "released", via: "invitation", programmeId, how: "cant-make-it" };
      }
      if (application.status === "withdrawn") return { kind: "withdrawn" };
      // Accepting an invitation is how somebody invited says they are coming.
      return { kind: "place", via: "invitation", programmeId, saidComing: true };
    }
    if (application.status === "withdrawn") return { kind: "withdrawn" };
    return { kind: "invitation", programmeId, replyBy: invitation.replyBy };
  }

  // No offer, or declined. The person reads the same thing for both.
  if (application.status === "withdrawn") return { kind: "withdrawn" };
  return { kind: "no-place" };
}

/**
 * The programme this person is holding a place on right now, or null: a place
 * they have, or an invitation still waiting for their answer.
 */
export function placeHeldBy(application: Answerable): string | null {
  const standing = standingOf(application);
  if (standing.kind === "place" || standing.kind === "invitation") return standing.programmeId;
  return null;
}
