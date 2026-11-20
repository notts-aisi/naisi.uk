/**
 * THE WORDS OF THE ONE CALM PAGE a group's own pages draw for a signed-in
 * person they do not admit: the facilitator's group page, the draw's page
 * (where the slips are copied in) and the pairs page.
 *
 * Nothing here names a group, a programme or a person, so the page reads the
 * same for a real group that is not the caller's, an archived one and an
 * address that was never a group.
 *
 * WHO EACH PAGE IS FOR is the only thing that differs, and it differs by
 * page, never by group: the group page admits a group's facilitators and
 * admins, and not the programme's lead (who reads the group from the
 * programme's own tabs), so its sentence leaves the lead out; the draw's and
 * the pairs pages admit the lead too, so theirs keep the lead.
 *
 * Each sentence is a whole literal, because the persona battery finds the
 * page by its words (`STATES` in tests/persona-route-gates.registry.mjs).
 * Pure, with no imports. No sentence here carries a dash of either kind.
 */

/** The three pages that draw it. */
export type NotForYouPage = "group" | "draw" | "pairs";

export const NOT_FOR_YOU_HEADING = "This page isn’t for your account";

/** The facilitator's group page: its facilitators and admins, never the lead. */
export const NOT_FOR_YOU_GROUP_PAGE = "It’s for a group’s facilitators and admins.";

/** The draw's page and the pairs page: its facilitators, the programme's lead and admins. */
export const NOT_FOR_YOU_WITH_LEAD = "It’s for a group’s facilitators, the programme’s lead and admins.";

export const NOT_FOR_YOU_HELP = "If you facilitate this group and can’t open it, ask the team and we’ll put it right.";

/** Who the page is for, by page. */
export function notForYouWho(page: NotForYouPage): string {
  return page === "group" ? NOT_FOR_YOU_GROUP_PAGE : NOT_FOR_YOU_WITH_LEAD;
}
