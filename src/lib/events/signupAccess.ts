import "server-only";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { canApproveEvent, canDraftEvent } from "@/lib/firestore/users";
import { runsCheckIn } from "./checkInAccess";

/**
 * WHO SEES AN EVENT'S SIGN-UPS, AND WHO DECIDES THEM, in one place.
 *
 *  - EVERYBODY WHO SIGNED UP, with their addresses and every answer: admins
 *    and the committee members the Students' Union recognises (`runsCheckIn`,
 *    the people who also see who came). They read the list client-direct,
 *    under the `eventRsvps` rule in `firestore.rules`, which says the same.
 *  - THE REQUESTS WAITING FOR A DECISION: those two, and the people organising
 *    the event, its author and its collaborators, while their accounts stand
 *    (`isNamedWithStanding`). An organiser the Students' Union does not
 *    recognise is sent the requests alone, by `GET /api/events/[id]/signups`:
 *    each one's name, when they asked, a few words about who they are and
 *    their answers to the event's questions, never an address, never an
 *    answer to a dietary or accessibility question, and nobody who already
 *    holds a place (`src/lib/events/requestCard.ts`).
 *  - WHO DECIDES (Approve, Turn down): admins, approvers (`approveEvent`), the
 *    author while they hold `draftEvent`, and the collaborators.
 *
 * The Sign-ups page, its tab, the requests route and the two routes that
 * decide all ask here, so the buttons show for exactly the people the routes
 * let through. Admins stay resource-independent: `runsCheckIn` and
 * `canApproveEvent` each admit one whatever the event says.
 */

/** The two fields of an event that name its organisers, read off a document or a normalised event. */
export type EventOrganisers = { authorUid: unknown; collaboratorUids: unknown };

/** What one viewer may do with one event's sign-ups. */
export type SignupAccess = {
  /** Everybody who signed up, with addresses and every answer. */
  everyone: boolean;
  /** The requests waiting for a decision. True wherever `everyone` is. */
  requests: boolean;
  /** Approve and turn down, for a viewer who sees the requests. */
  decides: boolean;
};

/** Whether this viewer organises the event: its author or a collaborator, with standing. */
function organises(viewer: SessionUser, event: EventOrganisers): boolean {
  return (
    isNamedWithStanding(viewer, "events.authorUid", event.authorUid) ||
    isNamedWithStanding(viewer, "events.collaboratorUids", event.collaboratorUids)
  );
}

/**
 * May this caller approve or turn down a request for a place at this event?
 * The gate of the approve and deny routes. Seeing the requests is a separate
 * question (`signupAccessFor`): an approver the Students' Union does not
 * recognise, who organises nothing, decides through the route but is not
 * shown the Sign-ups page.
 */
export function decidesSignups(viewer: SessionUser, event: EventOrganisers): boolean {
  return (
    canApproveEvent(viewer) ||
    (canDraftEvent(viewer) && isNamedWithStanding(viewer, "events.authorUid", event.authorUid)) ||
    isNamedWithStanding(viewer, "events.collaboratorUids", event.collaboratorUids)
  );
}

/** What this viewer may do with this event's sign-ups. */
export function signupAccessFor(viewer: SessionUser, event: EventOrganisers): SignupAccess {
  const everyone = runsCheckIn(viewer);
  const requests = everyone || organises(viewer, event);
  return { everyone, requests, decides: requests && decidesSignups(viewer, event) };
}
