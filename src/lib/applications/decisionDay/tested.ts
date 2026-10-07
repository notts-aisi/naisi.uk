import { createHash } from "node:crypto";
import { own } from "../keys";
import { PROGRAMME_EMAIL_KINDS, type ApplicationFormFields } from "../model";

/**
 * A TEST BEFORE THE SEND.
 *
 * Decision day tells a whole term at once and cannot be unsent, so no press
 * of Send is taken until an admin has sent themselves a test of the emails AS
 * THEY ARE WORDED NOW. Two things are kept here:
 *
 *  - WHAT COUNTS AS THE WORDING. Each programme words its own three emails
 *    (`programmes[id].emailWording`) and the form words "No offer this time"
 *    (`noOfferWording`). {@link wordingFingerprint} is one short string that
 *    is the same exactly when all of that is the same.
 *  - WHETHER A TEST STILL COUNTS. The test's record on the form carries the
 *    fingerprint it was sent with. {@link testStanding} compares that with
 *    the form as it stands: equal is `fresh`, different is `stale`, and no
 *    record is `none`.
 *
 * THE COMPARISON IS MADE HERE, WHERE IT IS USED, and never by a stamp a
 * writer of wording has to remember to leave. A new way of changing wording
 * makes a test stale on the day it is written, with no change to this file.
 * So does wording put back to exactly what was tested, which makes the test
 * fresh again: what goes is then what the admin read.
 *
 * The fingerprint is of the committee's wording and of nothing else. A
 * programme's name, the name of its lead and the reply-by day also appear in
 * an email, and the page previews each email with those as they are now.
 *
 * No Firestore import and no clock. It hashes with Node's own `crypto`, so it
 * is for the server and the tests: a browser is handed the answer, never this
 * module.
 */

type Worded = Pick<ApplicationFormFields, "programmeIds" | "programmes" | "noOfferWording">;

/**
 * One string for every decision email's wording on a form: 64 hex characters,
 * equal for two forms exactly when each programme's own subject and body for
 * each of its three emails, and the form's "No offer this time", are equal.
 *
 * The programmes are taken in the order of their ids, so moving a programme up
 * or down the Choose step changes no email and no fingerprint. Adding or
 * removing one does change it: there is an email more, or an email fewer.
 */
export function wordingFingerprint(form: Worded): string {
  const lines: string[] = [];
  for (const programmeId of [...form.programmeIds].sort()) {
    const wording = own(form.programmes, programmeId)?.emailWording;
    for (const kind of PROGRAMME_EMAIL_KINDS) {
      const worded = own(wording, kind);
      lines.push(JSON.stringify([programmeId, kind, worded?.subject ?? "", worded?.body ?? ""]));
    }
  }
  const noOffer = form.noOfferWording;
  lines.push(JSON.stringify(["", "no-offer", noOffer?.subject ?? "", noOffer?.body ?? ""]));
  return createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
}

/** Where a form stands on its test: none sent, one that no longer counts, or one that does. */
export type TestStanding =
  | { state: "none" }
  | { state: "stale" | "fresh"; byUid: string; at: Date | null };

/**
 * Has an admin tested these emails as they are worded now? `fresh` only when
 * the form carries a test and that test's fingerprint is the form's own.
 */
export function testStanding(
  form: Worded & Pick<ApplicationFormFields, "decisionEmailTest">,
): TestStanding {
  const test = form.decisionEmailTest;
  if (!test) return { state: "none" };
  const fresh = test.wording === wordingFingerprint(form);
  return { state: fresh ? "fresh" : "stale", byUid: test.byUid, at: test.at };
}
