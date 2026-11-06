import type { Block } from "@/lib/firestore/newsletterBlocks";
import { joinedNamesInWords } from "./joinedEmail";
import { typed } from "./placementEmail";

/**
 * "ANA IS NO LONGER IN GROUP D": the email a group's facilitator is sent by
 * the press of Publish that tells somebody they have moved out of it, into
 * another group of the same run (`src/lib/courses/allocationPublish.ts`).
 *
 * It is the other half of "Ana has joined Group H" (`./joinedEmail.ts`), which
 * the facilitators of the group they joined are sent by the same press. It
 * says who is no longer in the group, by first name, as the group page named
 * them, and how many are in the group now, and links to the group page. IT
 * NEVER SAYS WHERE THEY WENT: that is the person's own, and their new group's.
 *
 * One email to each facilitator told about the group, for each press, naming
 * everybody that press tells they have moved out of it: never to the lead of
 * the programme that names the run, who signs it, as Publish never writes to
 * them about a group they facilitate, and never to the facilitators of a
 * group that is archived, whose page refuses them.
 *
 * Fixed words, written here: nothing comes from a template, so it can never
 * carry a token. Names and the group's name are typed by people and go in as
 * text through `typed`, the placement email's own door. No meeting link and
 * no room: the group page has both. Transactional, as the joined email is.
 *
 * Pure, so the route and a test write the same email.
 */

export type LeftFacts = {
  /** The facilitator's own first name, for the greeting. Empty: "Hi,". */
  firstName: string;
  groupName: string;
  /** "Tuesdays at 6pm", or null while the group has no day and time. */
  weeklySlot: string | null;
  /** The first names of who is no longer in the group, in the order they were moved. Never empty. */
  left: readonly string[];
  /** How many are in the group now, as their group page counts them: everybody who knows they are in it. */
  groupSize: number;
  /** Their group page, or null when the site does not know its own address. */
  groupUrl: string | null;
  /** The programme's lead's first name, while one stands, and the programme's short name. */
  leadName: string | null;
  programmeName: string | null;
};

const BUTTON_STYLE =
  "display:inline-block;padding:10px 18px;border-radius:8px;background:#6a82ff;color:#050810;font-weight:600;text-decoration:none";

const html = (value: string | null | undefined): string => typed(value)?.html ?? "";
const text = (value: string | null | undefined): string => typed(value)?.text ?? "";

/** "There are 7 people in the group now.", for any number. */
export function leftGroupSizeSentence(count: number): string {
  if (count <= 0) return "Nobody is in the group now.";
  return count === 1 ? "There is 1 person in the group now." : `There are ${count} people in the group now.`;
}

/** The subject: "Ana is no longer in Group D", "Ana and Raj are no longer in Group D". */
export function leftSubject(left: readonly string[], groupName: string): string {
  const names = joinedNamesInWords(left.map(text).filter(Boolean));
  const count = left.map(text).filter(Boolean).length;
  return `${names || "Somebody"} ${count > 1 ? "are" : "is"} no longer in ${text(groupName) || "your group"}`;
}

/** The email, written whole. */
export function composeLeftEmail(facts: LeftFacts): { subject: string; blocks: Block[] } {
  const names = facts.left.map(html).filter(Boolean);
  const one = names.length <= 1;
  const group = html(facts.groupName) || "your group";
  const slot = html(facts.weeklySlot);
  const lead = html(facts.leadName);
  const programme = html(facts.programmeName);
  const url = typed(facts.groupUrl);
  const paragraphs = [
    html(facts.firstName) ? `<p>Hi ${html(facts.firstName)},</p>` : "<p>Hi,</p>",
    `<p>${joinedNamesInWords(names) || "Somebody"} ${one ? "is" : "are"} no longer in ${group}${slot ? `, which meets on ${slot}` : ""}. ${leftGroupSizeSentence(facts.groupSize)}</p>`,
    `<p>${one ? "Their name is" : "Their names are"} no longer on your group page.</p>`,
    ...(url ? [`<p><a href="${url.html}" style="${BUTTON_STYLE}">Open your group</a></p>`] : []),
    lead && programme ? `<p>${lead}<br /><span style="color:#71717a">${programme} lead, NAISI</span></p>` : "<p>NAISI</p>",
  ];
  return { subject: leftSubject(facts.left, facts.groupName), blocks: [{ id: "left", type: "richText", html: paragraphs.join("") }] };
}
