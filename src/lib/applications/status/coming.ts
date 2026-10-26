import { standingOf, type Answerable } from "./standing";

/**
 * "I'M COMING": WHETHER SOMEBODY HOLDING A PLACE HAS SAID THEY ARE COMING,
 * AND WHEN. The one reading, for every screen that shows it:
 *
 *  - the programme's People tab, for its lead and admins: the "Coming?"
 *    column ("Yes, Mon 26 Oct" or "Not yet") and its two filters, Coming and
 *    Haven't said (`src/lib/applications/people/`);
 *  - a facilitator's Home before their group's first session, which says of
 *    each person in the group by first name "coming" or "hasn't said", and
 *    nothing else (`src/lib/courses/whosComing.ts`).
 *
 * Both ask here, so a lead and a facilitator can never be told two different
 * things about the same person.
 *
 * WHAT COUNTS AS SAYING SO. "I'm coming" on the person's own application
 * page, or accepting an invitation, which is how somebody invited says they
 * are coming (`standingOf`). Only for a place on `programmeId` they hold
 * now: somebody who gave a place back, or whose place is on another
 * programme, has not said they are coming to this one. No reply is not a no:
 * the site tells people "I'm coming" is optional, so the screens say "Not
 * yet" and "hasn't said", never that somebody is not coming.
 *
 * WHEN. The day they pressed "I'm coming", or the day they accepted the
 * invitation. Null for a reply stored before the site kept the day.
 *
 * Pure, with type-only imports beside `standingOf`, so the server's loaders
 * and a test ask the same function. It hands back a yes or a no and a day,
 * and nothing else of the application: never the reason somebody gave a
 * place back, never an answer to a question.
 */

/** The fields of an application this reads: the standing's, and the two days a reply carries. */
export type Replied = Answerable & {
  attendance: { answer: "coming" | "cant-make-it"; answeredAt: Date | null } | null;
  invitation: {
    programmeId: string;
    replyBy: string;
    response: "accepted" | "declined" | null;
    respondedAt: Date | null;
  } | null;
};

export type ComingReply =
  /** They have said they are coming to this programme, on this day when it is on record. */
  | { said: true; on: Date | null }
  /** They have not: no reply yet, or their place is not this programme's. */
  | { said: false };

export function comingReplyOf(application: Replied, programmeId: string): ComingReply {
  const standing = standingOf(application);
  if (standing.kind !== "place" || standing.programmeId !== programmeId || !standing.saidComing) {
    return { said: false };
  }
  if (application.attendance?.answer === "coming") {
    return { said: true, on: application.attendance.answeredAt ?? null };
  }
  // Accepting an invitation is how somebody invited says they are coming.
  return { said: true, on: application.invitation?.respondedAt ?? null };
}
