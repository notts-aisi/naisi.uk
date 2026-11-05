import type { Block } from "@/lib/firestore/newsletterBlocks";
import type { GroupCampus } from "./campus";
import { yourFacilitatorsSentence, placeInSentence, placeNoteSentence, sessionLengthSentence, typed, type PlacementWhere } from "./placementEmail";
import { withTimeQuestion } from "./timeAnswer/emailSection";

/**
 * "YOU’VE MOVED TO GROUP H": the email somebody Publish told about a group is
 * sent by the next press once they have been moved to another group of the
 * same run.
 *
 * Somebody told about a group is never hidden by a move: a move keeps their
 * seat told, so their programme page, their new group's roster and register,
 * and its check-ins show them at once. While the group they are in is not
 * the one they were told about (`movedSinceTold` in
 * `src/lib/firestore/courseEnrolments.ts`), the next press of Publish sends
 * them this, never Publish's first email again: that one says when a group
 * first meets, which for a group that has met is a day already past, and
 * nothing in it says it replaces an earlier one. This one says:
 *
 *  - that they are in it as they asked: nobody is moved to another group
 *    unless they asked to be, so the email never reads as a move made over
 *    their head;
 *  - the group they are in now, and when it NEXT meets on its own calendar,
 *    counted from the press (`nextSession`, worked out by the plan with
 *    `sessionRange`), never a week 1 already behind it;
 *  - where, in the words the placement email uses for a room, a group that
 *    meets online and a room whose text is not printed (`placeInSentence`,
 *    `placeNoteSentence`), and the campus, through the site's own section;
 *  - its facilitators, by first name, never the reader's own;
 *  - in one sentence, that it replaces the group they were in, by name, so
 *    nobody follows the old email;
 *  - "Can you make this time?" with its two buttons, the site's own section
 *    (`withTimeQuestion`), in place of the link to their programme page.
 *
 * AN INCUBATOR'S PEOPLE ARE NEVER TOLD THE WORD "GROUP" (decision day promised
 * them their weekly session, and Publish's email to them names no group), so
 * for a run an incubator names the email says their sessions have moved, as
 * they asked, when and where they meet now, and that it replaces the time
 * they were told, and names no group and no facilitator.
 *
 * FIXED WORDS, WRITTEN HERE: nothing comes from a template, so it can never
 * carry a token. Every value is typed by a person (a group's name, a room, a
 * first name) and goes in as text through `typed`, the placement email's own
 * door: one line, escaped, and no curly bracket. No meeting link, ever: an
 * online group is told the link is on their programme page.
 *
 * Transactional: it is about the person's own place, as Publish's email is.
 * Pure, so the plan, a test and anybody reading what goes out write the same
 * email.
 */

export type MovedFacts = {
  /** The name the greeting takes its first word from. Empty: "Hi,". */
  name: string;
  /** The run is an incubator's: the email names no group and no facilitator. */
  incubator: boolean;
  /** The short name of the programme that names the run, else the course's title. */
  programmeName: string;
  /** The group they are in now. */
  groupName: string;
  /** The group they were in, or null when it is gone or has no name. */
  fromGroupName: string | null;
  /** "Tuesdays at 6pm" (`weeklySlotWords`), or null while the group has no day and time. */
  weeklySlot: string | null;
  /** "Tue 10 Nov": the group's next session, counted from now. Null when none is left, or none can be dated. */
  nextSession: string | null;
  /** Where the group meets each week: the slot's own place. Never an address. */
  where: PlacementWhere | null;
  /** How long its sessions last, or null when none is set. */
  sessionMinutes: number | null;
  /** The first names of the group's facilitators, never the reader's own. */
  facilitatorFirstNames: readonly string[];
  /** The group's campus, or null: said by the site's own section. */
  campus: GroupCampus | null;
  /** They are asked "Can you make this time?": not a facilitator sitting in the group they facilitate. */
  asks: boolean;
  /** Their programme page, as a whole address, or null when the site does not know its own. */
  programmeUrl: string | null;
  /** The first name of the programme's lead, while one stands, who signs it. Null signs it NAISI. */
  leadName: string | null;
};

const BUTTON_STYLE =
  "display:inline-block;padding:10px 18px;border-radius:8px;background:#6a82ff;color:#050810;font-weight:600;text-decoration:none";

/** A typed value as HTML, or "" for nothing to say. */
const html = (value: string | null | undefined): string => typed(value)?.html ?? "";
/** A typed value as plain text, for the subject, or "". */
const text = (value: string | null | undefined): string => typed(value)?.text ?? "";

/** "Hi Ana,", from the first word of the name. */
function greeting(name: string): string {
  const first = text(name).split(" ")[0] ?? "";
  return first ? `<p>Hi ${html(first)},</p>` : "<p>Hi,</p>";
}

/**
 * "You’ll meet on Tuesdays at 6pm in Hallward B12, from Tue 10 Nov.", or,
 * for a group with no day and time yet, where to find them once it has.
 */
function meetingSentence(facts: MovedFacts): string {
  const slot = html(facts.weeklySlot);
  if (!slot) return "Its day and time aren’t set yet. Your programme page will show them once they are.";
  const place = html(placeInSentence(facts.where));
  const next = html(facts.nextSession);
  return `You’ll meet on ${slot}${place ? ` ${place}` : ""}${next ? `, from ${next}` : ""}.`;
}

/** A paragraph of sentences, leaving out the ones with nothing to say. */
function paragraph(...sentences: (string | null)[]): string {
  const said = sentences.filter((sentence): sentence is string => Boolean(sentence && sentence.trim()));
  return said.length > 0 ? `<p>${said.join(" ")}</p>` : "";
}

function signOff(facts: MovedFacts): string {
  const lead = html(facts.leadName);
  const programme = html(facts.programmeName);
  return lead && programme
    ? `<p>${lead}<br /><span style="color:#71717a">${programme} lead, NAISI</span></p>`
    : "<p>NAISI</p>";
}

/** The subject: "You’ve moved to Group H: Tuesdays at 6pm", or for an incubator its sessions. */
export function movedSubject(facts: Pick<MovedFacts, "incubator" | "programmeName" | "groupName" | "weeklySlot">): string {
  const slot = text(facts.weeklySlot);
  if (facts.incubator) {
    const programme = text(facts.programmeName);
    const head = programme ? `Your ${programme} sessions have moved` : "Your sessions have moved";
    return slot ? `${head}: ${slot}` : head;
  }
  const group = text(facts.groupName) || "a new group";
  return slot ? `You’ve moved to ${group}: ${slot}` : `You’ve moved to ${group}`;
}

/** The email, written whole, with the site's own "Can you make this time?" section. */
export function composeMovedEmail(facts: MovedFacts): { subject: string; blocks: Block[] } {
  const sessionLength = sessionLengthSentence(facts.sessionMinutes);
  const placeNote = placeNoteSentence(facts.where);
  const url = typed(facts.programmeUrl);
  const paragraphs = facts.incubator
    ? [
        greeting(facts.name),
        paragraph("As you asked, your sessions have moved.", meetingSentence(facts), html(sessionLength), html(placeNote)),
        paragraph("This replaces the time you were told before, so you don’t need to go to those sessions."),
      ]
    : [
        greeting(facts.name),
        paragraph(
          `As you asked, you’re in ${html(facts.groupName) || "a new group"} now.`,
          meetingSentence(facts),
          html(sessionLength),
          html(placeNote),
        ),
        paragraph(html(yourFacilitatorsSentence(facts.facilitatorFirstNames))),
        paragraph(
          html(facts.fromGroupName)
            ? `You’re no longer in ${html(facts.fromGroupName)}, so you don’t need to go to its sessions.`
            : "You’re no longer in the group you were in before, so you don’t need to go to its sessions.",
        ),
      ];
  if (url) paragraphs.push(`<p><a href="${url.html}" style="${BUTTON_STYLE}">Open your programme</a></p>`);
  paragraphs.push(signOff(facts));
  const email: { subject: string; blocks: Block[] } = {
    subject: movedSubject(facts),
    blocks: [{ id: "moved", type: "richText", html: paragraphs.filter(Boolean).join("") }],
  };
  // The site's own section: the campus, and "Can you make this time?" in place
  // of the link to their programme page. With no address to link to there is
  // no question to ask, and the email is as written above. The campus line
  // says "Your group meets", so an incubator's people are not given it: where
  // their sessions are is said above.
  return url
    ? withTimeQuestion(email, {
        campus: facts.incubator ? null : facts.campus,
        asks: facts.asks,
        incubator: facts.incubator,
        programmeUrl: url.text,
      })
    : email;
}
