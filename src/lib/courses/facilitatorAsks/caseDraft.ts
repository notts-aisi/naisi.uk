import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { askClaudeForJson, claudeConfigured } from "@/lib/ai/claude";
import { applicationAlone } from "@/lib/applications/assessment/run";
import type { ProgrammeSettings } from "@/lib/applications/model";
import { normaliseApplication } from "@/lib/applications/normalise";
import { applicationRef } from "@/lib/applications/repo";
import { standingOf } from "@/lib/applications/status/standing";
import type { SessionUser } from "@/lib/firebase/session";
import { askContext, refuse, type AskRefusal } from "./context";
import { FACILITATING_LIMITS } from "./model";
import { hasPlaceOn, wouldFacilitate } from "./rules";
import { CASE_ADMINS_ONLY, CASE_FOR_OFFERER, NOT_A_CASE, NOT_YOURSELF } from "./words";

/**
 * CLAUDE DRAFTS THE SENTENCE THAT MAKES THE CASE, for an admin asking somebody
 * who did not offer to facilitate ("Didn't offer, but worth asking").
 *
 * The ask's email is the site's own: it opens by saying they didn't put
 * themselves forward and we think they'd be very good at it, carries the
 * admin's sentence on why them, then the group, its day and time, the weeks,
 * the training and the day to answer by, all from records. This drafts only
 * the admin's sentence.
 *
 *  - ADMINS ONLY, never the caller themselves, and only for somebody who
 *    holds a place on this programme and did not offer: the same people the
 *    ask itself may make the case to.
 *  - WHAT IS SENT is the application alone (`applicationAlone`, as for an
 *    invitation's note): no name, no address, no access-requirements or
 *    Students' Union answer, NO TIMES, and nothing a reviewer scored or
 *    wrote. Beside it, the programme's own description. Never the group, its
 *    day or time, or when they said they are free: the email says when, and
 *    whether they can make it is for the admin to judge from the chart.
 *  - NOTHING IS STORED AND NOTHING IS SENT. The draft comes back to the
 *    admin's box, to read and change; only what is in the box when they press
 *    Ask goes in the email.
 */

const SYSTEM = `You help the committee of NAISI, the Nottingham AI Safety Initiative (a student society at the University of Nottingham), write to one person who holds a place on one of our programmes. They did not offer to facilitate, but we want to ask them to facilitate one of its discussion groups.

The email is already written around your words. It opens: "You didn't put yourself forward to facilitate, but we think you'd be very good at it." Then come your sentences. Then it asks whether they would take a group, and gives the group, its day and time, the weeks, any training and the day to answer by.

Write the sentences that say WHY THEM, drawn from what they wrote in their application.

How to write it:
- One to three sentences, under 70 words, in one paragraph. Speak to them as "you", and for the committee as "we".
- Be specific. Point to one or two things they actually wrote (experience leading, teaching, organising or explaining; an interest that fits the programme; how they think) and say why that would make them good at running a discussion group. Paraphrase; quote at most a few words.
- Warm, plain and direct, like somebody who read their application. No flattery, superlatives or hype.
- Do not greet them, sign off, or repeat what the email already says: nothing about not having put themselves forward, no asking whether they will, no group, day, time, weeks, training or date.
- Never mention scores, reviewers, what the committee decided, other applicants, AI, Claude, or any check of their writing.
- Never mention or hint at health, disability, personal or family circumstances, nationality, ethnicity, religion, age or anything like them, even where they wrote about it.
- Promise nothing: no pay, no certificate, no role on the committee.
- If the application gives you little to go on, write one honest sentence and say so in basis.
- British English. Never use an em dash or an en dash: use commas, colons or full stops.

basis is for the admin, not the person: one sentence naming what in the application you drew on.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text", "basis"],
  properties: {
    text: { type: "string", description: "The sentences for the email, as the person will read them." },
    basis: { type: "string", description: "For the admin: what in the application the sentences draw on. One sentence." },
  },
};

/** The programme as Claude is told it: its name, what kind, and its own description. */
export function caseMessage(programme: ProgrammeSettings, application: string): string {
  const kind =
    programme.kind === "incubator"
      ? "A research incubator: facilitators keep its teams on track."
      : "A fellowship: small discussion groups on campus, each run by a facilitator who leads the week's discussion.";
  const at = application.indexOf("# The applicant");
  return [
    "# The programme they hold a place on",
    `## ${programme.name}`,
    kind,
    ...(programme.pitch.trim() ? [programme.pitch.trim()] : []),
    ...(programme.facts.trim() ? [programme.facts.trim()] : []),
    "",
    "# Their application",
    at >= 0 ? application.slice(at) : application,
  ].join("\n");
}

/** The sentence as the box takes it: the site's dash rule, and never longer than a case may be. */
export function tidyCase(text: string): string {
  return text
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FACILITATING_LIMITS.caseText)
    .trim();
}

export type CaseDraft = { ok: true; text: string; basis: string } | AskRefusal;

export async function draftCase(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  uid: string,
): Promise<CaseDraft> {
  // Before anything is read.
  if (uid === user.uid) return refuse(403, NOT_YOURSELF);
  const context = await askContext(db, user, roundId, programmeId);
  if (!context.ok) return context;
  if (context.viewer !== "admin") return refuse(403, CASE_ADMINS_ONLY);
  const { form, programme, sets } = context;

  const snap = await applicationRef(db, form.round.id, uid).get();
  const application = snap.exists ? normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid) : null;
  if (!application || !application.sent) return refuse(404, NOT_A_CASE);
  if (wouldFacilitate(form, sets, application.sent, programme)) return refuse(409, CASE_FOR_OFFERER);
  if (!hasPlaceOn(standingOf(application), programme.id)) return refuse(409, NOT_A_CASE);
  if (!claudeConfigured()) return refuse(409, "Claude isn’t set up on this site yet.");

  const alone = await applicationAlone(db, user, form.round.id, uid);
  if (!alone.ok) return refuse(alone.status === 500 ? 502 : alone.status, alone.error);

  const answer = await askClaudeForJson({
    system: SYSTEM,
    message: caseMessage(programme, alone.application),
    schema: SCHEMA,
    effort: "medium",
    maxTokens: 3_000,
    timeoutMs: 120_000,
  });
  if (!answer.ok) return refuse(502, answer.reason);
  const value = (answer.value ?? {}) as { text?: unknown; basis?: unknown };
  const text = typeof value.text === "string" ? tidyCase(value.text) : "";
  if (!text) return refuse(502, "Claude’s answer couldn’t be read. Try again.");
  return { ok: true, text, basis: typeof value.basis === "string" ? tidyCase(value.basis) : "" };
}
