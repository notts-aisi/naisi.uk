import { createHash } from "node:crypto";
import { own } from "../keys";
import type { ApplicationFormFields, ProgrammeSettings } from "../model";
import { composeFreedPlaceEmail } from "./words";

/**
 * A TEST BEFORE A FREED PLACE IS OFFERED, held the way decision day holds its
 * send (`decisionDay/tested.ts`).
 *
 * No invitation goes until an admin has sent themselves the first person's
 * real email from the page, and the server keeps the record of that test on
 * the form (`freedPlaceTests.<programmeId>`): who, when, and a fingerprint.
 * The send compares the fingerprint with the one it works out itself, and is
 * refused unless they are equal.
 *
 * WHAT THE FINGERPRINT COVERS is what is the same for everybody one press
 * emails: the programme, the day to accept by that the admin chose for this
 * send, and the email's own wording. The wording is taken by composing the
 * email with marked slots, so a change to its words in a later build makes
 * every earlier test stale with no stamp anybody has to remember. A person's
 * name, their group's time and the lead's name are slots, filled from records
 * and previewed on the page as they are now, as decision day treats them.
 *
 * So choosing another day to accept by makes the test stale, and the page
 * asks for a new one; picking another person to send to does not.
 *
 * No Firestore import and no clock. It hashes with Node's own `crypto`, so it
 * is for the server and the tests: a browser is handed the answer.
 */

type Programme = Pick<ProgrammeSettings, "id" | "kind">;

/** The email with every slot marked: the wording, and nothing about anybody. */
function markedWording(programme: Programme): unknown {
  const email = composeFreedPlaceEmail({
    firstName: "{first}",
    programme: { shortName: "{short}", kind: programme.kind },
    leadName: "{lead}",
    toldOn: "{told}",
    meets: "{meets}",
    startsOn: "{starts}",
    freeOn: "{free}",
    replyBy: "{reply}",
    link: "{link}",
  });
  if (!email) return null;
  return [
    email.subject,
    email.greeting,
    email.paragraphs,
    email.buttons.map((button) => [button.label, button.look]),
    email.signOff,
  ];
}

/** One string, equal for two sends exactly when the programme, the day to accept by and the wording are. */
export function freedPlaceFingerprint(programme: Programme, replyBy: string): string {
  const line = JSON.stringify([programme.id, replyBy, markedWording(programme)]);
  return createHash("sha256").update(line, "utf8").digest("hex");
}

export type FreedPlaceTestStanding =
  | { state: "none" }
  /**
   * `fresh`: the email's wording is what the test was sent with, so a send
   * for `replyBy` is unlocked. `stale`: the wording has changed since.
   */
  | { state: "stale" | "fresh"; byUid: string; at: Date | null; replyBy: string };

/** Where this programme stands on its test: none sent, one whose wording has changed, or one that counts. */
export function freedPlaceTestStanding(
  form: Pick<ApplicationFormFields, "freedPlaceTests">,
  programme: Programme,
): FreedPlaceTestStanding {
  const test = own(form.freedPlaceTests, programme.id);
  if (!test) return { state: "none" };
  const fresh = test.wording === freedPlaceFingerprint(programme, test.replyBy);
  return { state: fresh ? "fresh" : "stale", byUid: test.byUid, at: test.at, replyBy: test.replyBy };
}

/**
 * Is a send of this programme's freed places, for this day to accept by,
 * unlocked? Only when the last test was of exactly this: its fingerprint is
 * the one this send works out.
 */
export function sendIsTested(
  form: Pick<ApplicationFormFields, "freedPlaceTests">,
  programme: Programme,
  replyBy: string,
): boolean {
  const test = own(form.freedPlaceTests, programme.id);
  return test !== undefined && test.wording === freedPlaceFingerprint(programme, replyBy);
}
