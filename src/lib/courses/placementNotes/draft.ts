import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { askClaudeForJson, claudeConfigured } from "@/lib/ai/claude";
import { applicationAlone } from "@/lib/applications/assessment/run";
import { programmeLines } from "@/lib/applications/decisionDay/inviteNote";
import { own } from "@/lib/applications/keys";
import { loadForm } from "@/lib/applications/repo";
import type { SessionUser } from "@/lib/firebase/session";
import { tidyPlacementNote } from "./model";
import { savePlacementDraft } from "./store";
import { CLAUDE_OFF, DRAFT_FAILED, noApplicationWords, ONLY_ADMINS_DRAFT, OWN_NOTE } from "./words";

/**
 * CLAUDE DRAFTS A NOTE FOR SOMEBODY PLACED OUTSIDE THE TIMES THEY GAVE, for
 * an admin to read, change and save. The pattern is the invitation note's
 * (`src/lib/applications/decisionDay/inviteNote.ts`), and so are its fences:
 *
 *  - ADMINS ONLY, never the caller's own, and only for somebody Publish would
 *    tell their group now who is placed outside the times they gave (the
 *    route asks the plan before this is called).
 *  - WHAT IS SENT is the application alone, exactly as Claude's blind first
 *    read is sent it (`applicationAlone`): no name, no address, no
 *    access-requirements or Students' Union answer, NO TIMES THEY MARKED, and
 *    nothing a reviewer scored or wrote. Beside it, the programme's name and
 *    description, and one bare fact: their group meets outside the times they
 *    gave. Never the group's day or time, never the group's name, nor who
 *    facilitates it: the site writes those under the note itself.
 *  - NOTHING IS SENT TO THE PERSON. The draft is kept with Claude's other
 *    notes on their application, on its assessment document
 *    (`savePlacementDraft`), and nothing that emails reads it. Only a saved
 *    note goes in an email, and the save is a person's. A lead never sees it.
 */

const SYSTEM = `You help the committee of NAISI, the Nottingham AI Safety Initiative (a student society at the University of Nottingham), write to one person who holds a place on one of our programmes.

We are about to email them their discussion group. The standard email already tells them which group they are in, the day and time it meets, how long sessions last, who facilitates it, and where it meets once that is known. Their group meets at a time they told us they cannot make, or cannot make all of. Write the few sentences an admin will put above those details. An admin reads it, changes it as they see fit, and decides whether to send it.

How to write it:
- Two to four sentences, under 90 words, in one paragraph. Speak to them as "you", and for the committee as "we".
- Say plainly that we know their group meets at a time they told us does not work for them, without naming any day, time or group.
- Say we would still like them on the programme, and make it specific: point to one thing they actually wrote (an interest, their subject, something they want to learn or do) and connect it to what the programme is about, using its description. Paraphrase; quote at most a few words.
- Ask them to reply to this email and tell us whether they can make it.
- Warm, plain and direct. No flattery, superlatives or hype. No apology beyond a short acknowledgement.
- Do not greet them, sign off, or repeat the details the email gives: no day, time, group, room, facilitator or other person.
- Promise nothing: not a move to another group, not a new time, not a place being kept.
- Never mention scores, reviewers, what the committee thought, how decisions were made, other applicants, AI, Claude, or any check of their writing.
- Never mention or hint at health, disability, personal or family circumstances, nationality, ethnicity, religion, age or anything like them, even where they wrote about it.
- If the application gives you little to go on, write one or two honest sentences about what the programme offers somebody with their background, and say so in basis.
- British English. Never use an em dash or an en dash: use commas, colons or full stops.

basis is for the admin, not the person: one sentence naming what in the application you drew on.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["note", "basis"],
  properties: {
    note: { type: "string", description: "The sentences for the email, as the person will read them." },
    basis: { type: "string", description: "For the admin: what in the application the note draws on. One sentence." },
  },
};

/** The one fact Claude is told about their group. */
export const OUTSIDE_FACT = "Their group meets outside the times they told us they are free.";

/** The message: the programme they hold a place on, the one fact, then their application. */
export function placementNoteMessage(programme: string[], application: string): string {
  const at = application.indexOf("# The applicant");
  return [
    "# The programme they hold a place on",
    ...programme,
    "",
    "# Their group",
    OUTSIDE_FACT,
    "",
    "# Their application",
    at >= 0 ? application.slice(at) : application,
  ].join("\n");
}

export type PlacementDraftResult = { ok: true } | { ok: false; status: 400 | 403 | 404 | 409 | 500; error: string };

/**
 * Ask Claude for a draft of one person's note and keep it beside their
 * choice. `person` is somebody the plan says Publish would tell their group
 * now and who is placed outside the times they gave: the route found them
 * there before calling this.
 */
export async function draftPlacementNote(
  db: Firestore,
  user: SessionUser,
  runId: string,
  person: { uid: string; name: string; fromForm: { roundId: string; programmeId: string } | null },
): Promise<PlacementDraftResult> {
  if (user.role !== "admin") return { ok: false, status: 403, error: ONLY_ADMINS_DRAFT };
  if (person.uid === user.uid) return { ok: false, status: 403, error: OWN_NOTE };
  if (!person.fromForm) return { ok: false, status: 409, error: noApplicationWords(person.name) };
  if (!claudeConfigured()) return { ok: false, status: 409, error: CLAUDE_OFF };

  const form = await loadForm(db, person.fromForm.roundId);
  const programme = form ? own(form.programmes, person.fromForm.programmeId) : undefined;
  if (!form || !programme) return { ok: false, status: 409, error: noApplicationWords(person.name) };

  const alone = await applicationAlone(db, user, person.fromForm.roundId, person.uid);
  if (!alone.ok) return { ok: false, status: alone.status === 404 ? 404 : 409, error: alone.error };

  const answer = await askClaudeForJson({
    system: SYSTEM,
    message: placementNoteMessage(programmeLines(programme), alone.application),
    schema: SCHEMA,
    effort: "medium",
    maxTokens: 4_000,
    timeoutMs: 120_000,
  });
  if (!answer.ok) return { ok: false, status: 500, error: answer.reason };
  const value = (answer.value ?? {}) as { note?: unknown; basis?: unknown };
  const text = typeof value.note === "string" ? tidyPlacementNote(value.note) : "";
  if (!text) return { ok: false, status: 500, error: DRAFT_FAILED };

  await savePlacementDraft(db, person.fromForm.roundId, person.uid, {
    runId,
    text,
    basis: typeof value.basis === "string" ? tidyPlacementNote(value.basis) : "",
    model: answer.model,
    at: new Date().toISOString(),
  });
  return { ok: true };
}
