/**
 * WHAT AN EVENT FOR CHOSEN PEOPLE'S INVITATIONS WOULD DO, in numbers and in
 * the words the editor, the Publish confirm and the sign-ups' "Invite the N
 * new since" say it in.
 *
 * The numbers are `planInvitations`' (src/lib/events/invitations.ts), the
 * plan publishing walks, so every sentence here describes the send it sits
 * beside. Pure, no server import: the editor draws it in the browser.
 *
 * British English, sentence case, no dashes, and no pronoun for a person:
 * the site does not know anybody's.
 */

/** What a press would do, in numbers. Never a name, never an address. */
export type InvitationCount = {
  /** Everybody on the list once the press is through: whose Home shows it. */
  home: number;
  /** People the press adds to the list. */
  adding: number;
  /** Of those, how many are emailed. */
  emails: number;
  /** Of those emailed, as a programme notice. */
  notices: number;
  /** Of those emailed, by their events row. */
  bySettings: number;
  /** Addresses written to, which the ceiling counts. */
  messages: number;
  /** Of those added, why the others are not emailed. */
  notEmailed: { author: number; settings: number; noAddress: number; suppressed: number };
  /** In the tags with no account (a guest, a walk-in): never invited. */
  noAccount: number;
  /** Left a group whose tag is chosen: never invited. */
  left: number;
  /** Over a ceiling: publishing or inviting would be refused whole. */
  overCeiling: boolean;
};

/** "1 person", "11 people". */
export const peopleCount = (n: number): string => (n === 1 ? "1 person" : `${n} people`);

/** "1 invitation", "10 invitations". */
const invitations = (n: number): string => (n === 1 ? "1 invitation" : `${n} invitations`);

/** "1 email", "10 emails". */
const emails = (n: number): string => (n === 1 ? "1 email" : `${n} emails`);

/** "11 people’s Home", "1 person’s Home". */
const homes = (n: number): string => `${peopleCount(n)}’s Home`;

/**
 * The sentence under the step and in the Publish confirm: "Publishing shows it
 * on 11 people’s Home and emails 10 invitations. It won’t be listed on the
 * events page or announced."
 */
export function publishingWords(count: Pick<InvitationCount, "home" | "emails">): string {
  const emailed = count.emails === 0 ? "emails nobody" : `emails ${invitations(count.emails)}`;
  return `Publishing shows it on ${homes(count.home)} and ${emailed}. It won’t be listed on the events page or announced.`;
}

/** The Publish confirm, for an event for chosen people. */
export function confirmChosenWords(count: Pick<InvitationCount, "home" | "emails">): string {
  return `Publish this event? ${publishingWords(count)}`;
}

/**
 * How the invitations go, under "Email them an invitation": "10 emails: 9 as
 * a programme email, and 1 by their own settings. You’re its author, so you
 * aren’t emailed." Then why anybody else is not.
 */
export function invitationWords(count: InvitationCount, authorIsYou: boolean): string[] {
  const lines: string[] = [];
  if (count.adding === 0) {
    lines.push("Nobody to invite yet.");
  } else if (count.emails === 0) {
    lines.push("No emails.");
  } else {
    const parts: string[] = [];
    if (count.notices > 0) parts.push(`${count.notices} as a programme email`);
    if (count.bySettings > 0) parts.push(`${count.bySettings} by their own settings`);
    const how = parts.length === 2 ? `${parts[0]}, and ${parts[1]}` : parts[0];
    lines.push(`${emails(count.emails)}: ${how}.`);
  }
  const { author, settings, noAddress, suppressed } = count.notEmailed;
  if (author > 0) lines.push(authorIsYou ? "You’re its author, so you aren’t emailed." : "Its author isn’t emailed.");
  if (settings > 0) {
    lines.push(
      `${peopleCount(settings)} said no to event announcements, so it shows on their Home without an email.`,
    );
  }
  if (noAddress > 0) lines.push(`${peopleCount(noAddress)} with no email address on record: on their Home only.`);
  if (suppressed > 0) lines.push(`${peopleCount(suppressed)} whose address bounced or marked us as spam: on their Home only.`);
  if (count.noAccount > 0) {
    lines.push(`${peopleCount(count.noAccount)} in these tags without a NAISI account can’t be invited.`);
  }
  if (count.left > 0) lines.push(`${peopleCount(count.left)} who left the programme ${count.left === 1 ? "isn’t" : "aren’t"} invited.`);
  if (count.overCeiling) {
    lines.push("That’s more than one press can invite. Choose fewer people, or ask an admin.");
  }
  return lines;
}

/** What "This event is part of <programme>" does. */
export function partOfWords(programme: string, holding: number | null): { label: string; hint: string } {
  return {
    label: `This event is part of ${programme}`,
    hint:
      holding === null
        ? "Then the invitation is a programme email to the people holding a place on it, whatever their settings. Leave it off for a social, and their own settings decide."
        : `Then the invitation is a programme email and reaches the ${peopleCount(holding)} holding a place on it, whatever their settings. Leave it off for a social, and their own settings decide.`,
  };
}

/** The sign-ups' button: "Invite the 2 new since". */
export function newSinceWords(n: number): string {
  return `Invite the ${n} new since`;
}

/** After the press. */
export function invitedWords(invited: number, emailed: number): string {
  if (invited === 0) return "Nobody new to invite: everybody in its tags is invited already.";
  return `Invited ${peopleCount(invited)}, and emailed ${emailed === invited ? (invited === 1 ? "them" : "all of them") : `${emailed} of them`}.`;
}
