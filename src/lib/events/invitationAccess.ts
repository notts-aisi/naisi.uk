import "server-only";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import type { EventDoc } from "@/lib/firestore/events";
import { canApproveEvent, canDraftEvent } from "@/lib/firestore/users";
import { organises } from "./opening";
import { runsEvents } from "./reach";

/**
 * WHO MAY DO WHAT WITH AN EVENT FOR CHOSEN PEOPLE'S LIST.
 *
 *  - SEE what was chosen and the counts: the people who run events (admins,
 *    the committee, and whoever may draft or approve one), who already read
 *    every event document. Counts only, never a name or an address.
 *  - CHOOSE who it is for: whoever may edit the event in its state, as the
 *    editor and `firestore.rules` say. While it is a draft, or sent back, its
 *    author (holding `draftEvent`), a collaborator, an approver or an admin;
 *    once it has been sent for approval, approvers and admins alone. Never a
 *    cancelled one. The tags themselves are then the chooser's own to use
 *    ("Who is this for?", `src/lib/audience/scope.ts`).
 *  - INVITE THE PEOPLE NEW SINCE, which emails them: admins, approvers (who
 *    published it), and the event's author and collaborators, each still
 *    standing behind their bar.
 */

export function maySeeChoice(viewer: SessionUser): boolean {
  return runsEvents(viewer);
}

export function mayChooseFor(event: EventDoc, viewer: SessionUser): boolean {
  if (event.status === "cancelled" || !runsEvents(viewer)) return false;
  if (viewer.role === "admin" || canApproveEvent(viewer)) return true;
  if (event.status !== "draft" && event.status !== "rejected") return false;
  const author = isNamedWithStanding(viewer, "events.authorUid", event.authorUid) && canDraftEvent(viewer);
  return author || isNamedWithStanding(viewer, "events.collaboratorUids", event.collaboratorUids);
}

export function mayInviteFor(event: EventDoc, viewer: SessionUser): boolean {
  if (viewer.role === "admin" || canApproveEvent(viewer)) return true;
  return organises(event, viewer);
}
