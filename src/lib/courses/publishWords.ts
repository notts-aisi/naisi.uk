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
 * The sentence a track lead reads on a run the application form fills, which
 * an admin or the lead of the programme that names the run publishes.
 */
export const PUBLISH_ADMIN_ONLY =
  "This run’s people came from the application form, so only an admin or its programme’s lead can publish it or send its test.";

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
 * it: "2 people and 1 facilitator told who has joined".
 */
export function publishAudienceLine(people: number, facilitators: number, joined = 0): string {
  const parts = [
    ...(people > 0 ? [peopleLabel(people)] : []),
    ...(facilitators > 0 ? [facilitatorsLabel(facilitators)] : []),
    ...(joined > 0 ? [`${facilitatorsLabel(joined)} told who has joined`] : []),
  ];
  if (parts.length === 0) return "Nobody is waiting for an email.";
  return nameList(parts);
}

/**
 * Publish waits for a choice for each person placed outside the times they
 * gave: a note of our own, or "Send without a note". The sentence a press is
 * refused with, and the one the readiness check and the board say.
 */
export function notesNeededLine(names: readonly string[]): string {
  const one = names.length === 1;
  return `${nameList(names)} ${one ? "is" : "are"} placed outside the times they gave. Write ${
    one ? "them a note" : "each of them a note"
  }, or choose “Send without a note”, before you publish.`;
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
export function moreLine(more: number): string {
  return `${emailsLabel(more)} more after this. Press Publish again to send ${more === 1 ? "it" : "them"}.`;
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
    lines.push(input.republish ? "Only people and facilitators not told before are emailed. Emails cannot be unsent." : "Emails cannot be unsent.");
  }
  return lines.join("\n\n");
}

/** What a press did, in sentences whose numbers are the server's. */
export function publishResultLines(report: PublishReport): string[] {
  const lines: string[] = [];
  const joined = report.joined ?? { sent: 0, held: 0, suppressed: 0 };
  const sent = report.people.sent + report.facilitators.sent + joined.sent;
  if (sent === 0) {
    lines.push("Published. No email was sent.");
  } else {
    const parts: string[] = [];
    if (report.people.sent > 0) parts.push(`${report.people.sent} to people with their group`);
    if (report.facilitators.sent > 0) parts.push(`${report.facilitators.sent} to facilitators`);
    if (joined.sent > 0) parts.push(`${joined.sent} to facilitators about who has joined their group`);
    lines.push(`Published. ${emailsLabel(sent)} sent: ${nameList(parts)}.`);
  }
  if (report.failed.length > 0) {
    lines.push(
      `Not sent to ${nameList(report.failed)}, because the send failed. Press Publish again to try again: nobody already told is emailed twice.`,
    );
  }
  if (report.noAddress.length > 0) {
    lines.push(`Not sent to ${nameList(report.noAddress)}, because there is no email address on file.`);
  }
  const suppressed = report.people.suppressed + report.facilitators.suppressed + joined.suppressed;
  if (suppressed > 0) {
    lines.push(
      `Not sent to ${suppressed === 1 ? "1 address" : `${suppressed} addresses`} on the do-not-email list. ${suppressed === 1 ? "It counts" : "They count"} as told, so ${suppressed === 1 ? "it isn’t" : "they aren’t"} tried again.`,
    );
  }
  const held = report.people.held + report.facilitators.held + joined.held;
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
export function testLine(test: { state: "none" | "stale" | "fresh"; when: string | null; who: string | null }): string {
  if (test.state === "none") return "Send yourself a test before you publish.";
  const sent = test.when ? `Test sent to ${test.who ?? "you"} at ${test.when}.` : `Test sent to ${test.who ?? "you"}.`;
  if (test.state === "stale") {
    return `${sent} The wording changed in Email designs since, so send yourself another before you publish.`;
  }
  return sent;
}
