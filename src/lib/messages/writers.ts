import "server-only";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { loadTermRoles, type TermRoles } from "@/lib/audience/load";
import { scopeOf } from "@/lib/audience/scope";
import type { FacilitatingGroup } from "@/lib/courses/facilitatingMenu";
import { facilitatingGroupsOf, ownGroupsQuery } from "@/lib/courses/facilitatingMenuRead";
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
  return writerFrom(scope.admin, await loadTermRoles(db, user, now));
}

/** The one test, of what the term's read says this person runs. */
function writerFrom(admin: boolean, roles: TermRoles): MessageWriter | null {
  if (admin) return { admin: true, roles };
  return roles.leads.length > 0 || roles.facilitates.length > 0 ? { admin: false, roles } : null;
}

/** What `GET /api/messages` answers the shell: whether it draws Messages, and the groups its Facilitating part lists. */
export type MenuAnswer = {
  writes: boolean;
  /** The groups this person facilitates, in the order they meet (`src/lib/courses/facilitatingMenu.ts`). */
  facilitating: FacilitatingGroup[];
};

/**
 * THE SHELL'S ONE QUESTION, answered.
 *
 * `writes`: whether the menu draws Messages for this person,
 * `messageWriterOf`'s answer, asked of the term only when the account could
 * be one. An admin is one without asking the term. Anybody else is a lead
 * only when named on a form, which flags the account
 * (`users.admissionsReviewer`, the flag that draws the Programmes entry), and
 * a facilitator only when a group names them, so a member who is neither is
 * answered by one query on their own uid, which grants nothing: the bar is
 * applied by the term's read, after it.
 *
 * `facilitating`: the groups the menu's Facilitating part lists
 * (`src/lib/courses/facilitatingMenu.ts`), whatever `writes` says: a
 * facilitator is listed from the day they are made one, Messages only once
 * their run's groups are published.
 *
 * Reads, by who asks:
 *  - a member or committee account named on no form: the one query on their
 *    own groups, as before; for a facilitator the term's read follows, as
 *    before, and the runs it fetched are handed on, so the groups cost a run
 *    document only for a run the term's form does not name;
 *  - a programme's lead (named on a form): that same query, one more than
 *    before, then the term's read, as before;
 *  - an admin: the query, then one run document per run they facilitate.
 *    Whether an admin writes needs no read at all.
 * A failed read of the caller's groups, or of their runs, answers no groups,
 * never a refusal, and leaves `writes` as it would have been without them: the
 * menu then draws what it draws for somebody who facilitates nothing.
 */
export async function menuAnswerOf(db: Firestore, user: SessionUser, now: Date): Promise<MenuAnswer> {
  const scope = scopeOf(user);
  if (!scope) return { writes: false, facilitating: [] };
  // The caller's own groups. A failed read lists none and decides nothing
  // else: an admin and a lead are answered `writes` as if it had never been
  // asked (before the Facilitating part, neither asked it), and anybody else
  // as the menu drew them when it failed then, without Messages.
  let own: QueryDocumentSnapshot[] | null;
  try {
    own = (await ownGroupsQuery(db, user).get()).docs;
  } catch (err) {
    console.error("[messages] could not read the caller's groups for the menu", user.uid, err);
    own = null;
  }
  const groups = own ?? [];
  const facilitatingFrom = async (runs?: TermRoles["runDocs"]): Promise<FacilitatingGroup[]> => {
    if (groups.length === 0) return [];
    try {
      return await facilitatingGroupsOf(db, user, { groups, runs });
    } catch (err) {
      console.error("[messages] could not read the groups for the menu", user.uid, err);
      return [];
    }
  };
  if (scope.admin) return { writes: true, facilitating: await facilitatingFrom() };
  const mayLead = user.admissionsReviewer === true;
  const mayFacilitate = groups.length > 0;
  if (!mayLead && !mayFacilitate) return { writes: false, facilitating: [] };
  const roles = await loadTermRoles(db, user, now);
  return { writes: writerFrom(false, roles) !== null, facilitating: await facilitatingFrom(roles.runDocs) };
}
