import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SessionSlot } from "@/lib/admissions/availability";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { WHY_ROOM, whyFreeWords } from "@/lib/courses/visitRequest/words";
import { freeOnInTheirWeek } from "../freedPlaces/words";
import { loadOwnApplication, loadForm } from "../repo";
import { paintedWeekOf } from "./paintedWeek";

/**
 * "WHY:" UNDER EACH SESSION A PERSON IS OFFERED, read from the times they gave
 * on the application form, back to THEM, on their own page.
 *
 * WHOSE TIMES. The caller's own, by their own uid, on the application form
 * that names the run (`readNamingProgramme`), read as the person reads their
 * own application (`loadOwnApplication`): the version they last sent. Nobody
 * else's, and for nobody else: the one caller is the person's own form page,
 * which asks nothing of it in a view-as session.
 *
 * ONE READING. Whether a session falls in the times they gave is the one
 * reading of a painted week the course side asks (`paintedWeekOf`, whose
 * `covers` is the allocation board's own test), and the part of the week is
 * said the way the site already says a time somebody gave
 * (`freeOnInTheirWeek`: "Wednesday evenings", only when their own week has at
 * least an hour then).
 *
 * FINISHED WORDS ONLY. What comes back is one sentence per session, by the
 * caller's key, and never the week, a mark, a stretch or a count: the painted
 * week does not leave the server.
 *
 *  - "Why: you said you’re free Wednesday evenings": the session has a place,
 *    falls in the times they gave, and the part of the week can be said.
 *  - "Why: not a time you gave, but there’s room": they gave times, the
 *    session is not in them, and it has a place.
 *  - NOTHING, wherever nothing true can be said: no application on the form
 *    that names the run (somebody who applied to the run itself, a form
 *    destroyed), nothing painted, a session with no day or time, a full
 *    session, and a session in their times whose part of the week their own
 *    week does not say (somebody who marked little time, read "from then on").
 *
 * Reads three documents at most (the forms, through the naming programme; the
 * form; their application) and writes nothing. A read that fails says nothing.
 */

/** One session to say why about: the caller's key, the session as a weekly slot (null with no day or time), and whether it has a place. */
export type WhySession = { key: string; slot: SessionSlot | null; hasRoom: boolean };

export async function whyOfferedFor(
  db: Firestore,
  input: { uid: string; runId: string; sessions: readonly WhySession[] },
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!input.uid || input.sessions.length === 0) return out;
  const naming = await readNamingProgramme(db, input.runId);
  if (!naming) return out;
  const form = await loadForm(db, naming.roundId);
  if (!form) return out;
  const application = await loadOwnApplication(db, form, input.uid);
  const week = paintedWeekOf(form.round.availabilityGrid, application);
  if (week.kind !== "given" || !application?.sent) return out;
  for (const session of input.sessions) {
    // A full session is shown and not offered: nothing is said under it.
    if (!session.slot || !session.hasRoom) continue;
    if (!week.covers(session.slot)) {
      out.set(session.key, WHY_ROOM);
      continue;
    }
    const part = freeOnInTheirWeek(session.slot, application.sent.availability, form.round.availabilityGrid);
    if (part) out.set(session.key, whyFreeWords(part));
  }
  return out;
}
