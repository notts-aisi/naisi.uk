/**
 * THE WORDS AROUND PUBLISH on a run's allocation board: what the button says,
 * what the confirmation asks, the line about the last test, and what a press
 * did.
 *
 * Pure, with no import, so the board, the routes and a test read the same
 * words. Every number in them is one the server worked out (`pressBatch` and
 * the report a press answers with), so the button, the confirmation and the
 * result cannot come to different counts.
 *
 * No dash of any kind, and no "skipped": a person who was not emailed is
 * named, with why.
 */

/**
 * ONLY AN ADMIN PUBLISHES. Publish emails everybody on a run their group, so
 * a press, and the test that unlocks it, are an admin's alone: a programme's
 * lead and a run's track lead still place, move and take people off, and
 * read Publish's own page, and are told this in place of its two buttons.
 * The same sentence is what the publish route and its test route refuse
 * them with, so the page is never the lock.
 */
export const PUBLISH_ONLY_ADMINS = "Only an admin publishes. Ask an admin when the groups are ready.";

/**
 * The sentence a track lead reads on a run the application form fills: its
 * people are served to an admin and to the lead of the programme that names
 * the run, and to nobody else, so the board's count and Publish's own page
 * hold nothing for a track lead.
 */
export const PUBLISH_ADMIN_ONLY =
  "This run’s people came from the application form, so only an admin or its programme’s lead sees who they are.";

/** What one press did. */
export type PublishReport = {
  /** The people told their group, by what became of each email. */
  people: { sent: number; held: number; suppressed: number };
  /** The facilitators told they are facilitating, by what became of each email. */
  facilitators: { sent: number; held: number; suppressed: number };
  /**
   * The facilitators told who has joined their group, by what became of each
   * email. Present only when the press had one to send, so a report with none
   * is exactly as it was before these were sent.
   */
  joined?: { sent: number; held: number; suppressed: number };
  /**
   * The people told they have moved since they were told their group ("You’ve
   * moved"), by what became of each email. Present only when there was one.
   */
  moved?: { sent: number; held: number; suppressed: number };
  /**
   * The facilitators told who is no longer in their group, by what became of
   * each email. Present only when there was one.
   */
  left?: { sent: number; held: number; suppressed: number };
  /** Names whose send failed. They are still owed, and the next press tries them. */
  failed: string[];
  /** Names owed an email with no address on file. */
  noAddress: string[];
  /** Facilitators' emails another press had already claimed, so this one left them. */
  alreadyTold: number;
  /**
   * Emails still owed after this press: past its cap, or to a facilitator of
   * a group nobody in which this press managed to tell, who waits for the
   * press that does.
   */
  more: number;
};

export function emptyPublishReport(): PublishReport {
  return {
    people: { sent: 0, held: 0, suppressed: 0 },
    facilitators: { sent: 0, held: 0, suppressed: 0 },
    failed: [],
    noAddress: [],
    alreadyTold: 0,
    more: 0,
  };
}

/** "1 email", "37 emails". */
export function emailsLabel(n: number): string {
  return `${n} ${n === 1 ? "email" : "emails"}`;
}

function peopleLabel(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"}`;
}

function facilitatorsLabel(n: number): string {
  return `${n} ${n === 1 ? "facilitator" : "facilitators"}`;
}

/** "Ada", "Ada and Ben", "Ada, Ben and Cy". */
export function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The button: "Publish and send 37 emails", or "Publish" when a press would send nothing. */
export function publishButtonLabel(emails: number): string {
  return emails > 0 ? `Publish and send ${emailsLabel(emails)}` : "Publish";
}

/**
 * "32 people and 5 facilitators", the line above the buttons. `joined` is how
 * many facilitators already told about their group are told who has joined
 * it: "2 people and 1 facilitator told who has joined". `moved` is how many
 * people told their group and moved since are told they have moved, and
 * `left` how many facilitators are told who is no longer in their group.
 */
export function publishAudienceLine(people: number, facilitators: number, joined = 0, moved = 0, left = 0): string {
  const parts = [
    ...(people > 0 ? [peopleLabel(people)] : []),
    ...(moved > 0 ? [`${peopleLabel(moved)} moved since they were told`] : []),
    ...(facilitators > 0 ? [facilitatorsLabel(facilitators)] : []),
    ...(joined > 0 ? [`${facilitatorsLabel(joined)} told who has joined`] : []),
    ...(left > 0 ? [`${facilitatorsLabel(left)} told who is no longer in their group`] : []),
  ];
  if (parts.length === 0) return "Nobody is waiting for an email.";
  return nameList(parts);
}

/** Somebody moved since they were told, as Publish lists them: their name, where they are now, and the group they were told about. */
export type MovedLine = { name: string; to: string; from: string | null };

/** "Raj: moved to Group H, was Group D". */
export function movedPersonWords(moved: MovedLine): string {
  return moved.from ? `${moved.name}: moved to ${moved.to}, was ${moved.from}` : `${moved.name}: moved to ${moved.to}`;
}

/**
 * Over the list of people moved since they were told, each said by
 * `movedPersonWords`: what a press sends them, and what it never does.
 */
export const MOVED_LEAD =
  "Moved since they were told: a press emails each of them “You’ve moved” about the group they are in now, never their first email again.";

/**
 * Who is reading a sentence about the press: an admin, who presses it, or
 * anybody else on Publish's page (a programme's lead, or a run's track lead
 * on the older board), who cannot (`PUBLISH_ONLY_ADMINS`) and is told what an
 * admin does instead. An admin's words are the ones these always said.
 */
export type PublishReader = "admin" | "lead";

/**
 * Publish waits for a choice for each person placed outside the times they
 * gave: a note of our own, or "Send without a note". The sentence a press is
 * refused with, and the one the readiness check and the board say. A lead
 * writes the note too, and an admin presses.
 */
export function notesNeededLine(names: readonly string[], reader: PublishReader = "admin"): string {
  const one = names.length === 1;
  return `${nameList(names)} ${one ? "is" : "are"} placed outside the times they gave. Write ${
    one ? "them a note" : "each of them a note"
  }, or choose “Send without a note”, ${reader === "admin" ? "before you publish" : "before an admin publishes"}.`;
}

/** What the board says beside a press that would send nothing. */
export const NOTHING_TO_SEND =
  "Publishing now sends no email: everyone placed and every facilitator of a group with people in it has had theirs.";

/** Somebody owed an email with no address to send it to. */
export function noAddressLine(names: readonly string[]): string {
  const one = names.length === 1;
  return `${nameList(names)} ${one ? "has" : "have"} no email address on file, so ${one ? "is" : "are"} not emailed.`;
}

/** A group with a facilitator to tell and nobody in it yet. */
export function emptyGroupsLine(groups: readonly string[]): string {
  const one = groups.length === 1;
  return `${nameList(groups)} ${one ? "has" : "have"} nobody in ${one ? "it" : "them"} yet, so ${one ? "its" : "their"} facilitators are not emailed.`;
}

/**
 * People placed in a group and not told yet who gave their place back on the
 * form: Publish leaves them out, and each still holds a seat until Removed.
 * Not drawn on any board: written in the boards' voice and listed in the
 * build notes for the boards' designers to confirm.
 */
export function gaveBackLine(n: number): string {
  return n === 1
    ? "1 person gave their place back, so they aren’t emailed. Remove them to free their seat."
    : `${n} people gave their place back, so they aren’t emailed. Remove them to free their seats.`;
}

/** Emails past one press's cap. */
export function moreLine(more: number, reader: PublishReader = "admin"): string {
  const them = more === 1 ? "it" : "them";
  return reader === "admin"
    ? `${emailsLabel(more)} more after this. Press Publish again to send ${them}.`
    : `${emailsLabel(more)} more after this. An admin presses Publish again to send ${them}.`;
}

/**
 * The confirmation before a press: the same number as the button, who it
 * reaches, and what is not sent.
 */
export function publishConfirmText(input: {
  runLabel: string;
  emails: number;
  people: number;
  facilitators: number;
  more: number;
  noAddress: readonly string[];
  emptyGroups: readonly string[];
  /** People placed and not told yet who gave their place back, whom the press leaves out. */
  gaveBack?: number;
  /** Facilitators already told about their group, told who has joined it. */
  joined?: number;
  /** People told their group and moved since, told they have moved. */
  moved?: number;
  /** Facilitators told about a group, told who is no longer in it. */
  left?: number;
  /** Of the people, those whose email carries a note of our own above its details. */
  noted?: number;
  republish: boolean;
}): string {
  const lines: string[] = [];
  if (input.emails === 0) {
    lines.push(`Publish ${input.runLabel}? ${NOTHING_TO_SEND}`);
  } else {
    lines.push(`Publish ${input.runLabel} and send ${emailsLabel(input.emails)}?`);
    const parts: string[] = [];
    if (input.people > 0) {
      parts.push(
        `${emailsLabel(input.people)} to ${input.people === 1 ? "the person" : "people"} placed in a group, with their group, day, room and facilitators`,
      );
    }
    if (input.moved && input.moved > 0) {
      parts.push(
        `${emailsLabel(input.moved)} to ${input.moved === 1 ? "a person" : "people"} moved since they were told, with their new group and when it next meets`,
      );
    }
    if (input.facilitators > 0) {
      parts.push(
        `${emailsLabel(input.facilitators)} to ${input.facilitators === 1 ? "a facilitator" : "facilitators"}, with their group, day and room`,
      );
    }
    if (input.joined && input.joined > 0) {
      parts.push(
        `${emailsLabel(input.joined)} to ${input.joined === 1 ? "a facilitator" : "facilitators"} already told about their group, naming who has joined it`,
      );
    }
    if (input.left && input.left > 0) {
      parts.push(
        `${emailsLabel(input.left)} to ${input.left === 1 ? "a facilitator" : "facilitators"} naming who is no longer in their group`,
      );
    }
    lines.push(`${parts.join(". ")}.`);
    if (input.noted && input.noted > 0) {
      lines.push(
        input.noted === 1
          ? "1 of the people’s emails carries a note above its details."
          : `${input.noted} of the people’s emails carry a note above their details.`,
      );
    }
  }
  if (input.more > 0) lines.push(moreLine(input.more));
  if (input.noAddress.length > 0) lines.push(noAddressLine(input.noAddress));
  if (input.emptyGroups.length > 0) lines.push(emptyGroupsLine(input.emptyGroups));
  if (input.gaveBack && input.gaveBack > 0) lines.push(gaveBackLine(input.gaveBack));
  if (input.emails > 0) {
    lines.push(
      !input.republish
        ? "Emails cannot be unsent."
        : input.moved && input.moved > 0
          ? "Only people and facilitators not told before, and people moved since they were told, are emailed. Emails cannot be unsent."
          : "Only people and facilitators not told before are emailed. Emails cannot be unsent.",
    );
  }
  return lines.join("\n\n");
}

/** What a press did, in sentences whose numbers are the server's. */
export function publishResultLines(report: PublishReport): string[] {
  const lines: string[] = [];
  const none = { sent: 0, held: 0, suppressed: 0 };
  const joined = report.joined ?? none;
  const moved = report.moved ?? none;
  const left = report.left ?? none;
  const sides = [report.people, moved, report.facilitators, joined, left];
  const sent = sides.reduce((sum, side) => sum + side.sent, 0);
  if (sent === 0) {
    lines.push("Published. No email was sent.");
  } else {
    const parts: string[] = [];
    if (report.people.sent > 0) parts.push(`${report.people.sent} to people with their group`);
    if (moved.sent > 0) parts.push(`${moved.sent} to people moved since they were told, with their new group`);
    if (report.facilitators.sent > 0) parts.push(`${report.facilitators.sent} to facilitators`);
    if (joined.sent > 0) parts.push(`${joined.sent} to facilitators about who has joined their group`);
    if (left.sent > 0) parts.push(`${left.sent} to facilitators about who is no longer in their group`);
    lines.push(`Published. ${emailsLabel(sent)} sent: ${nameList(parts)}.`);
  }
  if (report.failed.length > 0) {
    // One name per person: a facilitator of two groups can be sent two
    // emails by one press, and both can fail.
    lines.push(
      `Not sent to ${nameList([...new Set(report.failed)])}, because the send failed. Press Publish again to try again: nobody already told is emailed twice.`,
    );
  }
  if (report.noAddress.length > 0) {
    lines.push(`Not sent to ${nameList(report.noAddress)}, because there is no email address on file.`);
  }
  const suppressed = sides.reduce((sum, side) => sum + side.suppressed, 0);
  if (suppressed > 0) {
    lines.push(
      `Not sent to ${suppressed === 1 ? "1 address" : `${suppressed} addresses`} on the do-not-email list. ${suppressed === 1 ? "It counts" : "They count"} as told, so ${suppressed === 1 ? "it isn’t" : "they aren’t"} tried again.`,
    );
  }
  const held = sides.reduce((sum, side) => sum + side.held, 0);
  if (held > 0) {
    lines.push(
      `Held, not sent: ${held === 1 ? "1 email" : `${held} emails`} to addresses this copy of the site doesn’t email. That is how a rehearsal works.`,
    );
  }
  if (report.alreadyTold > 0) {
    lines.push(
      `${report.alreadyTold === 1 ? "1 facilitator was" : `${report.alreadyTold} facilitators were`} told by another press just now, so nothing went to them again.`,
    );
  }
  if (report.more > 0) {
    lines.push(`${emailsLabel(report.more)} still to send. Press Publish again to send ${report.more === 1 ? "it" : "them"}.`);
  }
  return lines;
}

/**
 * The line beside "Send a test to me" about the last test that reached
 * somebody. `when` is the time the board writes ("5:38pm", or "Mon 26 Oct
 * at 5:38pm" on another day); `who` is null for the viewer's own test.
 */
export function testLine(
  test: { state: "none" | "stale" | "fresh"; when: string | null; who: string | null },
  reader: PublishReader = "admin",
): string {
  const admin = reader === "admin";
  if (test.state === "none") {
    return admin ? "Send yourself a test before you publish." : "An admin sends themselves a test before publishing.";
  }
  const sent = test.when ? `Test sent to ${test.who ?? "you"} at ${test.when}.` : `Test sent to ${test.who ?? "you"}.`;
  if (test.state === "stale") {
    return admin
      ? `${sent} The wording changed in Email designs since, so send yourself another before you publish.`
      : `${sent} The wording changed in Email designs since, so an admin sends another before publishing.`;
  }
  return sent;
}
