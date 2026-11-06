import type { Block } from "@/lib/firestore/newsletterBlocks";
import type { GroupCampus } from "../campus";
import { campusSentence } from "../campusWords";
import {
  ANSWER_BY_EMAIL_ADDRESS,
  ANSWER_CANT,
  ANSWER_MOST_WEEKS,
  ANSWER_YES,
  CARD_TITLE,
  OR_EMAIL,
  emailAskWords,
} from "./words";

/**
 * THE "YOUR GROUP" EMAIL'S OWN SECTION: where the group meets, by campus, and
 * "Can you make this time most weeks?" with its three buttons. Written by
 * the site, never by a template, so an email whose wording somebody edited
 * in Email designs still carries it (Zach, 29 Oct 2026: "format emails
 * programmatically").
 *
 *  - THE CAMPUS LINE, when the group has a campus: "Your group meets on
 *    Jubilee campus." The room is released separately.
 *  - THE QUESTION AND ITS BUTTONS, for somebody the programme page asks
 *    (`asks`; not a facilitator who sits in the group they facilitate), in
 *    the card's own words (`./words.ts`): "Yes", "Most weeks, not all" and
 *    "No, I need a different time". Every button opens the card on their
 *    programme page, where answering needs their session: opening the
 *    email, or any link in it, records nothing.
 *
 * WHERE IT GOES: in place of the template's own link to the programme page
 * (the paragraph whose link is `programmeUrl`), so the email has one place to
 * go and not four buttons to the same page. A template with no such link
 * gets the section at its end, so it is never lost. With nothing to say (no
 * campus, nobody asked), the email is exactly as it was.
 *
 * Pure, so Publish, its preview and its test all write the same email.
 */

/** The card's id on the programme page, so every button opens at it. */
export const TIME_ANSWER_ANCHOR = "your-group-time";

/** One of the buttons, styled as the template's own button is, the others quieter. */
function buttonHtml(href: string, label: string, primary: boolean): string {
  const look = primary
    ? "background:#6a82ff;color:#050810"
    : "background:transparent;color:#6a82ff;border:1px solid #6a82ff";
  return (
    `<a href="${href}" style="display:inline-block;padding:10px 18px;margin:0 8px 8px 0;border-radius:8px;` +
    `${look};font-weight:600;text-decoration:none">${label}</a>`
  );
}

const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

type Section = { campus: GroupCampus | null; asks: boolean; incubator: boolean; programmeUrl: string };

export function timeQuestionHtml(input: Section): string {
  const parts: string[] = [];
  if (input.campus) parts.push(`<p>${campusSentence(input.campus)}</p>`);
  if (input.asks) {
    const href = escapeAttr(`${input.programmeUrl}#${TIME_ANSWER_ANCHOR}`);
    parts.push(
      `<p><strong>${CARD_TITLE}</strong> ${emailAskWords(input.incubator)} ` +
        `${OR_EMAIL} <a href="mailto:${ANSWER_BY_EMAIL_ADDRESS}">${ANSWER_BY_EMAIL_ADDRESS}</a>.</p>`,
      // A space between each, so the email read as text says them apart.
      `<p>${buttonHtml(href, ANSWER_YES, true)} ${buttonHtml(href, ANSWER_MOST_WEEKS, false)} ${buttonHtml(href, ANSWER_CANT, false)}</p>`,
    );
  }
  return parts.join("");
}

/** A paragraph whose link is the programme page: the template's own button. */
function programmeLinkParagraph(html: string, programmeUrl: string): RegExpExecArray | null {
  const href = escapeAttr(programmeUrl).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<p>(?:(?!</p>).)*?href="${href}"(?:(?!</p>).)*?</p>`, "s").exec(html);
}

export function withTimeQuestion(
  email: { subject: string; blocks: readonly Block[] },
  input: Section,
): { subject: string; blocks: Block[] } {
  const section = timeQuestionHtml(input);
  if (!section) return { subject: email.subject, blocks: [...email.blocks] };
  const blocks = [...email.blocks];
  for (let at = 0; at < blocks.length; at += 1) {
    const block = blocks[at];
    if (block.type !== "richText") continue;
    const found = programmeLinkParagraph(block.html, input.programmeUrl);
    if (!found) continue;
    // The campus line goes in too, but the template's button stays when
    // nobody is asked: it is still the way to the programme page.
    const replaced = input.asks ? section : `${section}${found[0]}`;
    blocks[at] = { ...block, html: `${block.html.slice(0, found.index)}${replaced}${block.html.slice(found.index + found[0].length)}` };
    return { subject: email.subject, blocks };
  }
  return { subject: email.subject, blocks: [...blocks, { id: "time-question", type: "richText", html: section }] };
}
