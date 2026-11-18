import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { facilitatorsToTell } from "@/lib/courses/excused/decide";
import { displayNameOf } from "@/lib/courses/registerAccess";
import { clockWords, dayWords } from "@/lib/courses/sessionChange/words";
import { joiningOnlineGroupUrl, sendJoiningOnlineEmail } from "@/lib/email/joiningOnlineEmail";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { joiningOnlineEmailWords } from "./words";

/**
 * THE GROUP'S FACILITATORS ARE TOLD THAT SOMEBODY IS JOINING A SESSION ONLINE.
 *
 * WHO: each of the group's facilitators named on the group who still stands
 * behind the role and has an address (`facilitatorsToTell`, the facilitators
 * an approved request to be excused tells), never the person who said it. A
 * facilitator who holds a place in the group they run may say it too: their
 * co-facilitators are told, and they are not. Nobody else: no lead, no admin,
 * nobody in the group.
 *
 * WHEN: once per person per session, decided by the press in the transaction
 * that writes their word (`onlineEmailed` on the register,
 * `src/lib/courses/joiningOnline/seat.ts`), and sent after it, outside it.
 * Taking the word back sends nothing, and saying it again sends nothing a
 * second time.
 *
 * WHAT: who, the group, the week and when, and where the link goes, by
 * whether the session had one at the press (`joiningOnlineEmailWords`). The
 * person is named as the group page's box names them to every reader there:
 * the name they go by. NEVER THE MEETING LINK: the one link is the group's
 * page on this site.
 *
 * TRANSACTIONAL in the notification classification: it is about a session
 * its reader runs, so no row of the profile grid gates it; the do-not-email
 * list still holds it back. It never throws: a failed send never fails the
 * press. It returns counts.
 */

/** What the press hands on once it has written the word and decided to tell. Never sent to a browser. */
export type JoiningOnlineTell = {
  runId: string;
  group: Pick<CourseGroupDoc, "id" | "name" | "facilitatorUids">;
  /** The person who said it. */
  uid: string;
  weekNumber: number;
  occurrence: number;
  /** The session's day, "2026-11-11". */
  dateKey: string;
  /** The session's start, "15:00", or "" with none set. */
  startTimeLocal: string;
  /** The session had a meeting link at the press: whether, never which. */
  hasLink: boolean;
};

export type JoiningOnlineTellOutcome = { sent: number; suppressed: number; failed: number };

export async function tellFacilitatorsJoiningOnline(db: Firestore, said: JoiningOnlineTell): Promise<JoiningOnlineTellOutcome> {
  const done: JoiningOnlineTellOutcome = { sent: 0, suppressed: 0, failed: 0 };
  try {
    const [person, facilitators] = await Promise.all([
      db.collection("users").doc(said.uid).get(),
      facilitatorsToTell(db, said.group, [said.uid]),
    ]);
    if (facilitators.length === 0) return done;
    const words = joiningOnlineEmailWords({
      personName: displayNameOf(person.exists ? (person.data() ?? {}) : {}),
      groupName: said.group.name,
      weekNumber: said.weekNumber,
      occurrence: said.occurrence,
      day: dayWords(said.dateKey),
      time: clockWords(said.startTimeLocal),
      hasLink: said.hasLink,
    });
    const link = joiningOnlineGroupUrl(process.env.NEXT_PUBLIC_APP_URL ?? "", said.runId, said.group.id);
    for (const facilitator of facilitators) {
      const outcome = await sendJoiningOnlineEmail({
        to: facilitator.email,
        name: facilitator.firstName,
        actorUid: said.uid,
        runId: said.runId,
        link,
        words,
      });
      done[outcome] += 1;
    }
  } catch (err) {
    console.error("[joining online email] could not tell the facilitators", said.runId, err instanceof Error ? err.message : "unknown");
    done.failed += 1;
  }
  return done;
}
