import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { askClaudeForJson, claudeConfigured } from "@/lib/ai/claude";
import type { SessionUser } from "@/lib/firebase/session";
import { admissionAssessmentId, ASSESSMENTS_COLLECTION } from "@/lib/firestore/admissionAssessments";
import { canRunTerm } from "../access";
import { applicationAlone } from "../assessment/run";
import type { ProgrammeSettings } from "../model";
import { normaliseApplication } from "../normalise";
import { applicationRef, loadForm } from "../repo";
import { OWN_APPLICATION } from "../review/refusals";
import type { Refusal } from "../review/types";
import { loadDecision } from "../staffRepo";
import type { StoredInviteDraft } from "./inviteDraft";
import { isInTerm, onePerson, poolProblem } from "./plan";
import { INVITE_NOTE_LIMIT, pickedNoMore, type PoolWrite } from "./pool";
import { programmeOf } from "./programmes";

/**
 * CLAUDE DRAFTS AN INVITATION'S PERSONAL NOTE, for an admin to read, change
 * and save.
 *
 * A pooled applicant invited to a programme they did not rank gets the
 * standard invitation email. An admin may add a few sentences of their own on
 * why the programme suits them, and may ask Claude to draft those sentences
 * from the application. This is that ask.
 *
 *  - ADMINS ONLY, never the caller's own application, before the term is
 *    sent, and only for somebody with an invitation picked: the same rules as
 *    the note's writer (`./pool.ts#setInviteNote`).
 *  - WHAT IS SENT is the application alone, exactly as Claude's blind first
 *    read is sent it (`../assessment/run.ts#applicationAlone`): no name, no
 *    address, no access-requirements or Students' Union answer, no times,
 *    and nothing a reviewer scored or wrote, because the note is written TO
 *    the applicant. Beside it, the programmes' names and descriptions.
 *  - NOTHING IS SENT TO THE APPLICANT. The draft is kept on the assessment
 *    document (`./inviteDraft.ts`), where nothing that emails reads it. Only
 *    an admin's Save puts words in the invitation, and the Save is theirs.
 */

const SYSTEM = `You help the committee of NAISI, the Nottingham AI Safety Initiative (a student society at the University of Nottingham), write to one applicant. None of the programmes they applied to could take them this term, so we are inviting them to a programme they did not apply to instead.

The standard invitation email already thanks them for applying, says the pool was strong and there was no space on what they applied to, says we think they would be a great fit for the programme we are inviting them to, and asks them to accept by a date. Write the few sentences an admin will add under that, saying WHY this programme suits this person, drawn from what they wrote. An admin reads it, changes it as they see fit, and decides whether to send it.

How to write it:
- Two to four sentences, under 90 words, in one paragraph. Speak to them as "you", and for the committee as "we".
- Be specific. Point to one or two things they actually wrote (an interest, their subject, a project, something they want to learn or do) and connect each to what the programme is about, using its description. Paraphrase; quote at most a few words.
- Warm, plain and direct, like somebody who read their application. No flattery, superlatives or hype.
- Do not greet them, sign off, or repeat the standard email: no thanks, nothing about the strong pool or there being no space, no "great fit", no date, no asking them to accept.
- Never mention the programmes they applied to turning them down, scores, reviewers, what the committee thought, how decisions were made, other applicants, AI, Claude, or any check of their writing.
- Never mention or hint at health, disability, personal or family circumstances, nationality, ethnicity, religion, age or anything like them, even where they wrote about it.
- Promise nothing about groups, times, facilitators, places or what happens next.
- If the application gives you little to go on, write one or two honest sentences about what the programme offers somebody with their background, and say so in basis.
- British English. Never use an em dash or an en dash: use commas, colons or full stops.

basis is for the admin, not the applicant: one sentence naming what in the application you drew on.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["note", "basis"],
  properties: {
    note: { type: "string", description: "The sentences for the email, as the applicant will read them." },
    basis: { type: "string", description: "For the admin: what in the application the note draws on. One sentence." },
  },
};

const ONLY_ADMINS = "Only an admin can pick what pooled applicants hear.";

/** One programme as Claude is told it: what it is called, what it is, and what it involves. */
function programmeLines(programme: ProgrammeSettings): string[] {
  const kind =
    programme.kind === "incubator"
      ? "A research incubator."
      : "A fellowship: a small discussion group with a facilitator, on campus.";
  return [
    `## ${programme.name}`,
    kind,
    ...(programme.pitch.trim() ? [programme.pitch.trim()] : []),
    ...(programme.facts.trim() ? [programme.facts.trim()] : []),
  ];
}

/** The message: the programme they are invited to, the ones they applied to, then their application. */
export function noteMessage(
  invitedTo: ProgrammeSettings,
  applied: readonly ProgrammeSettings[],
  application: string,
): string {
  // The application's own heading names the programmes it was being decided
  // for, with their places: not what the note is about, so it starts at the
  // applicant.
  const at = application.indexOf("# The applicant");
  return [
    "# The programme we are inviting them to",
    ...programmeLines(invitedTo),
    "",
    "# The programmes they applied to, which had no space for them",
    ...(applied.length > 0 ? applied.flatMap((programme) => [...programmeLines(programme), ""]) : ["(none on the form now)", ""]),
    "# Their application",
    at >= 0 ? application.slice(at) : application,
  ].join("\n");
}

/**
 * The note as it is kept: one dash rule the site keeps everywhere, whatever
 * Claude wrote, and never longer than a note may be.
 */
export function tidyNote(text: string): string {
  return text
    .replace(/\s*[\u2013\u2014]\s*/g, ", ")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, INVITE_NOTE_LIMIT)
    .trim();
}

function refuse(status: 400 | 403 | 404 | 409, error: string): PoolWrite {
  return { ok: false, status, error };
}

/** What drafting answers: the writer's answers, or a refusal from reading the application or from Claude. */
export type DraftWrite = PoolWrite | Refusal;

/**
 * Ask Claude for a draft of one person's note and keep it on their assessment
 * document. The page is redrawn from what is stored, by the route.
 */
export async function draftInviteNote(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  applicantUid: string,
): Promise<DraftWrite> {
  if (!canRunTerm(user)) return refuse(403, ONLY_ADMINS);
  // Before anything is read, as for the note itself.
  if (applicantUid === user.uid) return refuse(403, OWN_APPLICATION);
  const form = await loadForm(db, roundId);
  if (!form) return refuse(404, "There is no application form here.");
  if (form.decisionsSentAt) return refuse(409, pickedNoMore(form.round.label));
  if (!claudeConfigured()) return refuse(409, "Claude isn’t set up on this site yet.");

  const [applicationSnap, decision] = await Promise.all([
    applicationRef(db, roundId, applicantUid).get(),
    loadDecision(db, roundId, applicantUid),
  ]);
  const application = applicationSnap.exists
    ? normaliseApplication(applicationSnap.id, applicationSnap.data(), form.round.availabilityGrid)
    : null;
  if (!application || !isInTerm(application)) return refuse(404, "Nobody by that id has an application on this form.");
  const person = onePerson(form, application, decision);
  if (!person) return refuse(404, "Nobody by that id has an application on this form.");
  const notPooled = poolProblem(form, person);
  if (notPooled) return refuse(409, notPooled);
  const invitedTo = person.outcome.kind === "invited" ? programmeOf(form, person.outcome.programmeId) : undefined;
  if (!invitedTo) return refuse(409, `Pick an invitation for ${person.name} first: a note goes with an invitation.`);

  const alone = await applicationAlone(db, user, roundId, applicantUid);
  if (!alone.ok) return alone;
  const applied = person.ranked
    .map((programmeId) => programmeOf(form, programmeId))
    .filter((programme): programme is ProgrammeSettings => Boolean(programme));

  const answer = await askClaudeForJson({
    system: SYSTEM,
    message: noteMessage(invitedTo, applied, alone.application),
    schema: SCHEMA,
    effort: "medium",
    maxTokens: 4_000,
    timeoutMs: 120_000,
  });
  if (!answer.ok) return { ok: false, status: 500, error: answer.reason };
  const value = (answer.value ?? {}) as { note?: unknown; basis?: unknown };
  const text = typeof value.note === "string" ? tidyNote(value.note) : "";
  if (!text) return { ok: false, status: 500, error: "Claude’s answer couldn’t be read. Try again." };

  const draft: StoredInviteDraft = {
    programmeId: invitedTo.id,
    text,
    basis: typeof value.basis === "string" ? tidyNote(value.basis) : "",
    model: answer.model,
    at: new Date().toISOString(),
  };
  // Beside Claude's read, replacing any draft before it. Nothing here is sent.
  await db
    .collection(ASSESSMENTS_COLLECTION)
    .doc(admissionAssessmentId(roundId, applicantUid))
    .set({ roundId, uid: applicantUid, inviteDraft: draft, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, changed: 1 };
}
