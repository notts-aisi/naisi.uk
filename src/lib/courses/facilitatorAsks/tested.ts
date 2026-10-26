import { createHash } from "node:crypto";
import type { AskTest, WallClock } from "./model";
import { composeAskEmail } from "./words";

/**
 * A TEST BEFORE ANYBODY IS ASKED, held the way the freed places' offer holds
 * its send (`src/lib/applications/freedPlaces/tested.ts`).
 *
 * No ask goes until the person asking has sent themselves somebody's real
 * email from the view, and the server keeps the record of that test on the
 * run (`courseFacilitating/{runId}__asktest`): who, when, and a fingerprint.
 * An ask compares the fingerprint with the one it works out itself, and is
 * refused unless they are equal.
 *
 * WHAT THE FINGERPRINT COVERS is what is the same for everybody one test
 * stands for: the programme, the day and time to answer by, and the email's
 * own wording, taken by composing it with marked slots, so a change to its
 * words in a later build makes every earlier test stale with nothing anybody
 * has to remember. Who is asked, the group and the training are slots, filled
 * from records and shown in the preview as they are now.
 *
 * So another day or time to answer by asks for a new test; asking another
 * person, for another group, does not.
 *
 * No Firestore import and no clock: server and tests only (Node's `crypto`).
 */

/** The email with every slot marked: the wording, and nothing about anybody. */
function markedWording(): unknown {
  const email = composeAskEmail({
    firstName: "{first}",
    shortName: "{short}",
    programmeName: "{programme}",
    groupName: "{group}",
    meets: "{meets}",
    where: { kind: "room", room: "{room}" },
    weeks: 6,
    firstSession: "{first session}",
    capacity: 8,
    training: { day: "{training day}", time: "{training time}", room: "{training room}" },
    replyBy: { day: "{reply day}", time: "{reply time}" },
    leadName: "{lead}",
    link: "{link}",
  });
  if (!email) return null;
  return [email.subject, email.greeting, email.paragraphs, email.button.label, email.signOff];
}

/** One string, equal for two asks exactly when the programme, the time to answer by and the wording are. */
export function askFingerprint(programmeId: string, replyBy: WallClock): string {
  const line = JSON.stringify([programmeId, replyBy.dateKey, replyBy.time, markedWording()]);
  return createHash("sha256").update(line, "utf8").digest("hex");
}

export type AskTestStanding =
  | { state: "none" }
  /** `fresh`: an ask for `replyBy` is unlocked. `stale`: the wording has changed since. */
  | { state: "stale" | "fresh"; at: Date | null; replyBy: WallClock };

/** Where the run stands on its test: none sent, one whose wording has changed, or one that counts. */
export function askTestStanding(test: AskTest | null, programmeId: string): AskTestStanding {
  if (!test) return { state: "none" };
  const fresh = test.wording === askFingerprint(programmeId, test.replyBy);
  return { state: fresh ? "fresh" : "stale", at: test.at, replyBy: test.replyBy };
}

/** Is an ask for this programme, answered by this day and time, unlocked? */
export function askIsTested(test: AskTest | null, programmeId: string, replyBy: WallClock): boolean {
  return test !== null && test.wording === askFingerprint(programmeId, replyBy);
}
