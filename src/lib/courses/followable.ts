/**
 * COULD A READER FOLLOW ANY OF THIS?
 *
 * A group's room is typed by a person, and a link can be typed into one. An
 * email can be forwarded, and a link to an online session lets whoever holds
 * it into the call. So the two emails that tell a group where it meets ask
 * this of the room before they print it, and print nothing of a room that
 * could be followed:
 *
 *  - the placement email (`placementWhere` in `./placementEmail.ts`), which
 *    then says where the person will find their room;
 *  - the weekly reminder (`courseNudgeSessionWhere` in
 *    `src/lib/email/courseNudgeEmail.ts`), which then says nothing about
 *    where, beside its link to the week's own page.
 *
 * BOTH ASK THIS ONE FUNCTION, so the two cannot come to differ on what
 * counts. The rule is about these two emails, which the site writes from a
 * group's stored room. A facilitator's own notice to their group is theirs
 * to word, and can carry a room or a link they put in it.
 *
 * True when the text holds something a mail client would make into a link,
 * or a phone would dial:
 *
 *  - an address with a scheme (`https://…`, `msteams://…`), or one of the
 *    schemes that needs no slashes (`mailto:`, `tel:`);
 *  - a host name, with or without `www.` (`zoom.example/j/1`), which is also
 *    what an email address ends in;
 *  - four numbers with dots between them;
 *  - a run of nine digits or more, however it is spaced: a phone number, or
 *    the id of a meeting.
 *
 * IT ERRS TOWARDS TRUE. A room named "St.Peters" reads as a host name, and
 * is then not printed. That is the safe way to be wrong: nobody is sent a
 * way into somebody's call, and the room is still on the page the email
 * points at.
 *
 * WHAT IT DOES NOT CATCH, and is not meant to: a short code written out
 * ("code 4321"), which nobody can follow.
 *
 * Pure, with no import, so an email of either kind and a test can ask it.
 */
export function couldBeFollowed(value: string | null | undefined): boolean {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text !== "" && FOLLOWABLE.some((shape) => shape.test(text));
}

const FOLLOWABLE = [
  /[a-z][a-z0-9+.-]*:\/\//i,
  /\b(?:mailto|tel|sms|callto|skype|facetime|zoommtg|msteams|webcal):/i,
  /\bwww\.[a-z0-9]/i,
  /(?:^|[^a-z0-9.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?![a-z0-9-])/i,
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/,
  /(?:\d[\s().-]{0,2}){9,}/,
];
