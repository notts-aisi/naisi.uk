import type { Block } from "@/lib/firestore/newsletterBlocks";

/**
 * "ANA AND RAJ HAVE JOINED GROUP B": the email a group's facilitator is sent
 * when a press of Publish tells people placed in a group whose facilitators
 * were already told about it.
 *
 * The first press that tells somebody in a group sends each of its
 * facilitators "You're facilitating", which counts everybody told by then. A
 * later press that tells more people in the same group (somebody placed late,
 * or moved in) sends each facilitator who already had that email ONE email
 * naming who has joined, by first name, as their group page names them, and
 * how many are in the group now. Never to the lead of the programme that
 * names the run, who signs it, and never a person announced to them before:
 * each pair is claimed once, in `courseNudges` (`joined__` markers, see
 * `src/lib/courses/allocationPublish.ts`).
 *
 * Fixed words, written here: nothing in it comes from a template, so it can
 * never carry a token. The names and the group's name are typed by people
 * and printed as text. No meeting link and no room: the group page has both.
 *
 * Pure, with one import (a type), so the plan, the press and a test write the
 * same email.
 */

export type JoinedFacts = {
  /** The facilitator's own first name, for the greeting. Empty: "Hi,". */
  firstName: string;
  groupName: string;
  /** "Tuesdays at 6pm", or null while the group has no day and time. */
  weeklySlot: string | null;
  /** The first names of who has joined, in the order a press told them. Never empty. */
  joined: readonly string[];
  /** How many people are in the group now, as their group page counts them: everybody told. */
  groupSize: number;
  /** Their group page, or null when the site does not know its own address. */
  groupUrl: string | null;
  /** The programme's lead's first name, while one stands, and the programme's short name. */
  leadName: string | null;
  programmeName: string | null;
};

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** A typed value as it is printed: one line, escaped, and no curly bracket. */
function text(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** "Ana", "Ana and Raj", "Ana, Raj and Tom". */
export function joinedNamesInWords(names: readonly string[]): string {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "";
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

/** The subject: "Ana and Raj have joined Group B". */
export function joinedSubject(joined: readonly string[], groupName: string): string {
  const names = joinedNamesInWords(joined.map((name) => name.replace(/\s+/g, " ")));
  const count = joined.filter((name) => name.trim()).length;
  return `${names || "Somebody"} ${count === 1 ? "has" : "have"} joined ${groupName.replace(/\s+/g, " ").trim() || "your group"}`;
}

const BUTTON_STYLE =
  "display:inline-block;padding:10px 18px;border-radius:8px;background:#6a82ff;color:#050810;font-weight:600;text-decoration:none";

function block(html: string): Block {
  return { id: "joined", type: "richText", html };
}

/** The email, written whole. */
export function composeJoinedEmail(facts: JoinedFacts): { subject: string; blocks: Block[] } {
  const names = facts.joined.map(text).filter(Boolean);
  const one = names.length === 1;
  const group = text(facts.groupName) || "your group";
  const slot = facts.weeklySlot ? text(facts.weeklySlot) : "";
  const size = facts.groupSize === 1 ? "There is 1 person in the group now." : `There are ${facts.groupSize} people in the group now.`;
  const paragraphs = [
    facts.firstName.trim() ? `<p>Hi ${text(facts.firstName)},</p>` : "<p>Hi,</p>",
    `<p>${joinedNamesInWords(names)} ${one ? "has" : "have"} joined ${group}${slot ? `, which meets on ${slot}` : ""}. ${size}</p>`,
    `<p>${one ? "Their name is" : "Their names are"} on your group page, with everybody else’s.</p>`,
    ...(facts.groupUrl
      ? [`<p><a href="${text(facts.groupUrl)}" style="${BUTTON_STYLE}">Open your group</a></p>`]
      : []),
    facts.leadName && facts.programmeName
      ? `<p>${text(facts.leadName)}<br /><span style="color:#71717a">${text(facts.programmeName)} lead, NAISI</span></p>`
      : "<p>NAISI</p>",
  ];
  return { subject: joinedSubject(facts.joined, facts.groupName), blocks: [block(paragraphs.join(""))] };
}
