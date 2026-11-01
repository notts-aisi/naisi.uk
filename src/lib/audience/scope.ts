import type { Tag } from "./tags";

/**
 * WHO MAY USE WHICH TAG, AND WHAT SEE WHO GIVES THEM. One table, asked by the
 * catalogue (which tags a person is offered), by the routes (which tags a
 * request may name), and by every send that will take a selection: the tags a
 * person may use are exactly the people whose names they may already read.
 *
 *  - ADMINS: every tag.
 *  - SU-RECOGNISED COMMITTEE: the term's events (who came and who signed up,
 *    the people who see sign-ups and run check-in), the committee and the
 *    admins, and a person by name: the people who may read the member roster.
 *  - A PROGRAMME'S LEAD: that programme's tags and its groups' tags.
 *  - A FACILITATOR: the tag of each group they facilitate.
 *  - ADMINS ONLY: the term's own tags (applied, holding a place, facilitating,
 *    leading, invited), the subscriptions, who didn't come to an event, and
 *    the admin-set tracks. Subscriptions and tracks are the admins' alone in
 *    `firestore.rules`, and who didn't come is v15's "Admins can see which
 *    events you signed up for and whether you came".
 *
 * A pending or rejected account uses no tag at all, and nor does anybody
 * signed out: `scopeOf` answers null for them.
 *
 * WHO LEADS AND WHO FACILITATES IS WORKED OUT FROM THE RECORDS by the loader
 * (`./load.ts`), each held to the bar the role is appointed behind
 * (`isNamedWithStanding`), and handed in here. A lead's groups are the groups
 * of the programme they lead, so the loader hands those in with the groups the
 * person facilitates.
 *
 * SEE WHO gives names, never addresses, and never more than the tags already
 * admit. Why one person is left out (their settings, a bounced address) is
 * said person by person to admins alone; everybody else reads the reasons as
 * counts.
 *
 * Pure, with no server import: the table is run as every persona by
 * `tests/audience-picker.test.mjs`.
 */

/** The fields of a session the table reads. */
export type AudienceViewer = {
  uid: string;
  role: string;
  suRecognised?: boolean | null;
};

export type Scope = {
  /** Every tag. */
  admin: boolean;
  /** Admins and SU-recognised committee: event tags but who didn't come, roles, and people by name. */
  committee: boolean;
  /** `<roundId>:<programmeId>` of each programme whose tags this person may use. */
  programmes: ReadonlySet<string>;
  /** Each group whose tag this person may use. */
  groups: ReadonlySet<string>;
};

/** A programme's key in a scope. */
export const programmeKey = (roundId: string, programmeId: string) => `${roundId}:${programmeId}`;

const APPROVED = ["member", "committee", "admin"];

/**
 * The scope of one person. `leads` are the programmes they lead and
 * `groups` the groups whose tags they may use (their own and their
 * programmes'), both as the loader found them in the records.
 */
export function scopeOf(
  viewer: AudienceViewer | null | undefined,
  roles: { leads: readonly string[]; groups: readonly string[] } = { leads: [], groups: [] },
): Scope | null {
  if (!viewer || !APPROVED.includes(viewer.role)) return null;
  const admin = viewer.role === "admin";
  const committee = admin || (viewer.role === "committee" && viewer.suRecognised === true);
  return {
    admin,
    committee,
    programmes: new Set(roles.leads),
    groups: new Set(roles.groups),
  };
}

/**
 * May this person use this tag, to include people or to leave them out?
 * A group's tag is asked by the group alone: the loader has already put a
 * lead's programme's groups into `groups`. A person by name is the
 * committee's here; whether that account may be named at all (an approved
 * account) is the loader's question, asked of the records.
 */
export function mayUse(scope: Scope, tag: Tag): boolean {
  if (scope.admin) return true;
  switch (tag.kind) {
    case "programme":
      return scope.programmes.has(programmeKey(tag.roundId, tag.programmeId));
    case "group":
      return scope.groups.has(tag.groupId);
    case "event":
      return scope.committee && tag.part !== "no-show";
    case "role":
    case "person":
      return scope.committee;
    case "term":
    case "subscribed":
    case "track":
      return false;
  }
}

/** Whether See who says, person by person, why somebody is left out. */
export function seesReasonsByName(scope: Scope): boolean {
  return scope.admin;
}
