import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { loadTermRoles, type TermRoles } from "@/lib/audience/load";
import { scopeOf } from "@/lib/audience/scope";
import type { SessionUser } from "@/lib/firebase/session";

/**
 * WHO MAY WRITE IN MESSAGES: admins, a programme's lead (their programme) and
 * a group's facilitator (their group), each worked out from the records the
 * picker reads (`loadTermRoles`), so the page, the routes and the picker
 * agree about who runs what.
 *
 *  - An admin writes to anybody the picker offers them.
 *  - A programme's lead, of one of this term's programmes, held to the bar a
 *    lead is appointed behind.
 *  - A facilitator of one of the groups of a run whose allocation has been
 *    published, held to the bar a facilitator is appointed behind: before
 *    Publish a group has no tag, so there is nobody for them to write to.
 *
 * Which tags each may use is the picker's scope table
 * (`src/lib/audience/scope.ts`), asked again by `resolveAudience` on every
 * count and every send. Somebody else who may use some tag (an SU-recognised
 * committee member who leads nothing, with the term's events) is not a writer
 * here: Messages is for the people running a programme or a group, as the
 * menu draws it.
 */

export type MessageWriter = {
  admin: boolean;
  /** What the writer runs of this term, as the picker reads it. */
  roles: TermRoles;
};

/**
 * An approved account (member, committee or admin): anybody else is refused
 * by every Messages route before their request is read. The picker's own
 * floor (`scopeOf`), so the two cannot differ.
 */
export function isApprovedAccount(user: SessionUser): boolean {
  return scopeOf(user) !== null;
}

/** The writer behind a session, or null for somebody Messages is not for. */
export async function messageWriterOf(db: Firestore, user: SessionUser, now: Date): Promise<MessageWriter | null> {
  const scope = scopeOf(user);
  if (!scope) return null;
  const roles = await loadTermRoles(db, user, now);
  if (scope.admin) return { admin: true, roles };
  return roles.leads.length > 0 || roles.facilitates.length > 0 ? { admin: false, roles } : null;
}

/**
 * Whether the menu draws Messages for this person: `messageWriterOf`'s
 * answer, asked of the term only when the account could be one. An admin is
 * one without a read. Anybody else is a lead only when named on a form, which
 * flags the account (`users.admissionsReviewer`, the flag that draws the
 * Programmes entry), and a facilitator only when a group names them, so a
 * member who is neither is answered by one query on their own uid, which
 * grants nothing: the bar is applied by `messageWriterOf`, after it.
 */
export async function writesMessages(db: Firestore, user: SessionUser, now: Date): Promise<boolean> {
  const scope = scopeOf(user);
  if (!scope) return false;
  if (scope.admin) return true;
  const mayLead = user.admissionsReviewer === true;
  const mayFacilitate = mayLead
    ? false
    : (await db.collection("courseGroups").where("facilitatorUids", "array-contains", user.uid).get()).docs.length > 0;
  if (!mayLead && !mayFacilitate) return false;
  return (await messageWriterOf(db, user, now)) !== null;
}
