/**
 * THE WORDS OF "GET READY FOR WEEK 1" (boards st-overview and
 * st-overview-phone) AND OF PUBLISH'S READINESS CHECK (board st-publish), in
 * one place.
 *
 * The boards' own words are kept exactly, apostrophes included; every name,
 * day, time, room and count in them is a slot filled from a record. Where a
 * board's sentence would not be true of what the site does, the true one is
 * written in the same voice, and so is every sentence the boards do not draw
 * (a step not yet started, a step done, a card with nothing in it): each is
 * listed in the build notes for the boards' designers to confirm.
 *
 * No gendered pronoun and no dash of either kind. Pure, with no import that
 * reaches the server, so a page, a route and a test read the same sentences.
 */

/** A list in a sentence: "Dev Patel, Ben Hartley and Rory Webb". */
export function namesInWords(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "1 person", "3 people". */
export function peopleWords(count: number): string {
  return `${count} ${count === 1 ? "person" : "people"}`;
}

/** Week numbers as a sentence says them: "4 to 6", "2 and 3", "2, 4 and 6". */
export function weekNumbersInWords(numbers: readonly number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  if (sorted.length >= 3 && sorted.every((n, at) => at === 0 || n === sorted[at - 1] + 1)) {
    return `${sorted[0]} to ${sorted[sorted.length - 1]}`;
  }
  return namesInWords(sorted.map(String));
}

// ---------------------------------------------------------------------------
// The checklist
// ---------------------------------------------------------------------------

export const GET_READY_TITLE = "Get ready for week 1";

/**
 * "Groups go out on Wed 28 Oct. Week 1 starts Thu 29 Oct." Each half only
 * while a record holds its day; null with neither.
 */
export function getReadyLede(groupsGoOut: string | null, weekOneStarts: string | null): string | null {
  const parts = [
    groupsGoOut ? `Groups go out on ${groupsGoOut}.` : null,
    weekOneStarts ? `Week 1 starts ${weekOneStarts}.` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" ") : null;
}

/** What each state's mark says to assistive technology: the boards' own labels. */
export const STEP_STATE_LABEL = { done: "Done", doing: "In progress", todo: "To do" } as const;

export const STEP_TITLE = {
  "hand-over": "Hand over the people holding a place",
  times: "Choose group times",
  facilitators: "Ask facilitators",
  rooms: "Set rooms",
  people: "Put people in groups",
  "week-one": "Write week 1",
  publish: "Publish groups",
} as const;

/** The links and buttons of the steps, in the boards' words. */
export const STEP_LINK = {
  settings: "Settings",
  times: "Times",
  facilitators: "Facilitators",
  rooms: "Set rooms",
  groups: "Groups",
  weeks: "Weeks",
  weekOne: "Open week 1",
  publish: "Publish groups…",
} as const;

// ── Hand over ──────────────────────────────────────────────────────────────

/** Nobody holds a place before decisions go out: People in groups' own sentence. */
export const NOBODY_UNTIL_DECISIONS = "Nobody holds a place until decisions go out.";

export const NOBODY_HOLDS_A_PLACE = "Nobody holds a place yet.";

/** "Done by Zach · Mon 26 Oct, 9:40pm": who pressed Hand over last, and when. */
export function handedOverWords(by: string, day: string, clock: string): string {
  return by ? `Done by ${by} · ${day}, ${clock}` : `Done · ${day}, ${clock}`;
}

/** Everybody holding a place is on the run's list, with no record of the press that put them there. */
export const ALL_ON_THE_LIST = "Everyone holding a place is on the run’s list.";

/**
 * Somebody holding a place who is not on the run's list yet: People in
 * groups' sentence, for whoever is looking. An admin hands people over.
 */
export function notOnTheListWords(count: number, admin: boolean): string {
  const who = count === 1 ? "1 person holding a place isn’t" : `${count} people holding a place aren’t`;
  return `${who} on the run’s list yet, so they can’t be placed. ${
    admin ? "Hand them over on the Settings tab." : "An admin hands them over on the Settings tab."
  }`;
}

// ── Group times ────────────────────────────────────────────────────────────

export const NO_GROUPS_YET = "No groups yet.";

/** "4 groups: Mon 6pm, Tue 6pm, Wed 1pm, Thu 6pm". */
export function groupTimesWords(slots: readonly string[]): string {
  return `${slots.length} ${slots.length === 1 ? "group" : "groups"}: ${slots.join(", ")}`;
}

/** "3 of 4. Group D has no time yet." `count` is how many groups `without` names. */
export function someWithoutWords(have: number, of: number, without: string, count: number, what: "time" | "room"): string {
  return `${have} of ${of}. ${without} ${count === 1 ? "has" : "have"} no ${what} yet.`;
}

// ── Facilitators ───────────────────────────────────────────────────────────

/** "Grace hasn’t replied about Group D." / "Grace and Kai haven’t replied about Groups A and D." */
export function notRepliedWords(firstNames: readonly string[], groups: string): string {
  const one = firstNames.length === 1;
  return `${namesInWords(firstNames)} ${one ? "hasn’t" : "haven’t"} replied about ${groups}.`;
}

/** "4 of 5 said yes." */
export function saidYesCountWords(yes: number, of: number): string {
  return `${yes} of ${of} said yes.`;
}

/** Every group has somebody facilitating it, some added by hand rather than asked. */
export const EVERY_GROUP_HAS_A_FACILITATOR = "Every group has a facilitator.";

/** "Group D has no facilitator yet." `count` is how many groups `groups` names. */
export function noFacilitatorWords(groups: string, count: number): string {
  return `${groups} ${count === 1 ? "has" : "have"} no facilitator yet.`;
}

/** No group of the run has anybody facilitating it. */
export const NO_GROUP_HAS_A_FACILITATOR = "No group has a facilitator yet.";

// ── Rooms ──────────────────────────────────────────────────────────────────

export const EVERY_GROUP_HAS_A_ROOM = "Every group has a room.";

// ── People in groups ───────────────────────────────────────────────────────

/**
 * "26 of 30 placed. 4 to place, 3 of them haven’t said when they’re free."
 * The second sentence names how many of those still to place have not said
 * when they are free, when any have not.
 */
export function placedWords(inAGroup: number, holding: number, notSaid: number): string {
  const toPlace = holding - inAGroup;
  const first = `${inAGroup} of ${holding} placed.`;
  if (toPlace <= 0) return first;
  if (notSaid <= 0) return `${first} ${toPlace} to place.`;
  if (toPlace === 1) return `${first} 1 to place, who hasn’t said when they’re free.`;
  if (notSaid >= toPlace) return `${first} ${toPlace} to place, and none of them has said when they’re free.`;
  return `${first} ${toPlace} to place, ${notSaid} of them ${notSaid === 1 ? "hasn’t" : "haven’t"} said when they’re free.`;
}

// ── Week 1 ─────────────────────────────────────────────────────────────────

/**
 * "Ready. Weeks 2 and 3 are ready too; 4 to 6 aren’t yet." Week 1 is ready;
 * the rest of the run's taught weeks say where they stand.
 */
export function weekOneReadyWords(readyToo: readonly number[], notYet: readonly number[]): string {
  const parts: string[] = [];
  if (readyToo.length > 0) {
    parts.push(
      readyToo.length === 1
        ? `Week ${readyToo[0]} is ready too`
        : `Weeks ${weekNumbersInWords(readyToo)} are ready too`,
    );
  }
  if (notYet.length > 0) {
    const notYetWords = weekNumbersInWords(notYet);
    const one = notYet.length === 1;
    parts.push(
      parts.length > 0
        ? `${notYetWords} ${one ? "isn’t" : "aren’t"} yet`
        : `${one ? "Week" : "Weeks"} ${notYetWords} ${one ? "isn’t" : "aren’t"} ready yet`,
    );
  }
  return parts.length > 0 ? `Ready. ${parts.join("; ")}.` : "Ready.";
}

// ── Publish ────────────────────────────────────────────────────────────────

export const PUBLISH_STEP_LINE = "Emails each person their group, day and room, and each facilitator their group.";

/** "Published Wed 28 Oct, 6:02pm." */
export function publishedWords(day: string, clock: string): string {
  return `Published ${day}, ${clock}.`;
}

/**
 * Under "Publish groups…", what Publish still needs: what it refuses for
 * today, and nothing it does not. A room is not one of them: the email leaves
 * the room out while a group has none (`noRoomWords`).
 */
export function publishNeedsWords(needs: { times: boolean; placed: boolean }): string | null {
  if (needs.times && needs.placed) return "Needs a day and a time for every group, and everyone holding a place in a group.";
  if (needs.times) return "Needs a day and a time for every group.";
  if (needs.placed) return "Needs everyone holding a place in a group.";
  return null;
}

// ── The cards ──────────────────────────────────────────────────────────────

export const NOT_SAID_FREE_TITLE = "Not said when they’re free";

/**
 * "3 people holding a place haven’t painted their week: Dev Patel, Ben
 * Hartley and Rory Webb. They can add it on their application until groups
 * go out." `stillCan` is who of them "When you’re free" is still open to (a
 * fellowship's place, until Publish tells them their group): "They" while
 * that is all of them, their names once it is some, and no second sentence
 * once it is nobody.
 */
export function notSaidFreeWords(names: readonly string[], stillCan: readonly string[]): string {
  const one = names.length === 1;
  const first = `${peopleWords(names.length)} holding a place ${one ? "hasn’t" : "haven’t"} painted their week: ${namesInWords(names)}.`;
  if (stillCan.length === 0) return first;
  if (stillCan.length === names.length) return `${first} They can add it on their application until groups go out.`;
  return `${first} ${namesInWords(stillCan)} can still add it on their application until groups go out.`;
}

export const PLACES_TITLE = "Places";

/** "of 32 places held", beside the big number; "holding a place" with no number of places set. */
export function placesHeldWords(places: number | null): string {
  return places === null ? "holding a place" : `of ${places} ${places === 1 ? "place" : "places"} held`;
}

export const PLACES_ROWS = {
  coming: "Said they’re coming",
  havenNotSaid: "Haven’t said",
  gaveBack: "Gave their place back",
} as const;

/** "The times don’t work for me · Mon 26 Oct". */
export function gaveBackLine(reason: string | null, on: string | null): string | null {
  const parts = [reason, on].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** "2 freed places". */
export function freedTitle(count: number): string {
  return `${count} freed ${count === 1 ? "place" : "places"}`;
}

/**
 * "Hannah Brooks and Nina Petrova were invited this afternoon. They have
 * until Thu 29 Oct." Said of everybody invited to the programme who has not
 * answered yet; "today" for an invitation sent today, and the day otherwise.
 * Two invitations on different days or with different days to answer by are
 * said one sentence each.
 */
export function invitedWords(invited: readonly { name: string; on: string | null; until: string | null }[], today: string): string {
  if (invited.length === 0) return "Nobody has been offered one yet.";
  const when = (on: string | null) => (on === null ? "" : on === today ? " today" : ` on ${on}`);
  const sameOn = invited.every((person) => person.on === invited[0].on);
  const sameUntil = invited.every((person) => person.until === invited[0].until);
  if (invited.length > 1 && sameOn && sameUntil) {
    const until = invited[0].until ? ` They have until ${invited[0].until}.` : "";
    return `${namesInWords(invited.map((person) => person.name))} were invited${when(invited[0].on)}.${until}`;
  }
  return invited
    .map((person) => `${person.name} was invited${when(person.on)}${person.until ? ` and has until ${person.until}` : ""}.`)
    .join(" ");
}

export const SEE_FREED_PLACES = "See freed places";

/** The window, as the Overview once the run is under way says it (`buildProgrammeOverview`). */
export function freedWindowWords(state: "open" | "closed" | "other", lastDay: string | null): string | null {
  if (state === "open" && lastDay) return `Freed places can be offered until ${lastDay}, the end of week 1.`;
  if (state === "closed") return "Places can’t be offered after week 1.";
  return null;
}

export const FACILITATORS_TITLE = "Facilitators";

export const FACILITATOR_CHIP = { yes: "Said yes", waiting: "No reply yet" } as const;

/** "Training · Wed 28 Oct · 6pm · Room B5". */
export function trainingLine(training: { day: string; time: string; room: string }): string {
  return `Training · ${training.day} · ${training.time} · ${training.room}`;
}

// ---------------------------------------------------------------------------
// Publish's own page: "Ready?"
// ---------------------------------------------------------------------------

export const READY_TITLE = "Ready?";
export const READY_CHIP = "Ready to publish";
export const NOT_READY_CHIP = "Not ready yet";
export const NEEDED_TITLE = "Needed to publish";
export const WORTH_TITLE = "Worth checking";
export const WORTH_LINE = "These don’t stop you publishing.";

/** The items' titles, the board's where the board's is true. */
export const READY_ITEM = {
  /** The board's, once a group's room is set as well as its day and time. */
  allThree: "Every group has a day, a time and a room",
  /** What Publish needs: a group with no day or time cannot be written to. */
  times: "Every group has a day and a time",
  /** A room does not stop Publish: the email leaves it out. */
  rooms: "Every group has a room",
  facilitators: "Every group has a facilitator who said yes",
  /** Every group has somebody facilitating it, and at least one was added by hand rather than asked. */
  facilitating: "Every group has a facilitator",
  placed: "Everyone holding a place is in a group",
  weekOne: "Week 1 is written",
} as const;

/** "Publish anyway, or move Joel first." */
export function moveFirstWords(firstName: string): string {
  return `Publish anyway, or move ${firstName} first.`;
}

/** "Move Joel…". */
export function moveButtonWords(firstName: string): string {
  return `Move ${firstName}…`;
}

/**
 * "Joel Adeyemi is in Group A on Thursdays at 6pm, but said they’re not free
 * then." Somebody placed at a time the week they painted does not cover.
 */
export function placedNotFreeWords(name: string, groupName: string, meets: string | null): string {
  return meets
    ? `${name} is in ${groupName} on ${meets}, but said they’re not free then.`
    : `${name} is in ${groupName}, but said they’re not free when it meets.`;
}

/** "32 of 32." / "26 of 30. Dev, Ben, Rory and Jasmine have no group yet." */
export function placedDetailWords(inAGroup: number, holding: number, unplacedFirstNames: readonly string[]): string {
  const first = `${inAGroup} of ${holding}.`;
  if (unplacedFirstNames.length === 0) return first;
  const one = unplacedFirstNames.length === 1;
  return `${first} ${namesInWords(unplacedFirstNames)} ${one ? "has" : "have"} no group yet.`;
}

/** "Its reading takes about 75 minutes." */
export function readingTimeWords(time: string | null): string {
  return time ? `Its reading takes ${time}.` : "Ready.";
}

/** "Group C has no room yet. The email leaves the room out until it has one." */
export function noRoomWords(groups: string, count: number): string {
  const one = count === 1;
  return `${groups} ${one ? "has" : "have"} no room yet. The email leaves the room out until ${one ? "it has" : "they have"} one.`;
}

/**
 * "Group D has no day and time yet." The plan's own refusal sentences say the
 * rest of what stops an email being written, under the buttons.
 */
export function noTimeWords(groups: string, count: number): string {
  return `${groups} ${count === 1 ? "has" : "have"} no day and time yet.`;
}

export const RUN_NOT_DATED = "The run has no start date or no weeks yet, so no session can be dated.";

// ---------------------------------------------------------------------------
// Publish's own page: the emails
// ---------------------------------------------------------------------------

export const PUBLISH_BACK = "People in groups";

/** "Publish AGI Strategy’s groups". */
export function publishHeading(programmeName: string): string {
  return `Publish ${programmeName}’s groups`;
}

export const EMAIL_CARD = {
  people: {
    title: "Your group",
    line: "To each person, with their group, day, room and facilitators’ first names.",
    /** An incubator's people are told of no group: their email is the weekly session. */
    incubatorLine: "To each person, with the weekly session, where it is and who runs it.",
  },
  facilitators: {
    title: "You’re facilitating",
    line: "To each facilitator, with their group, day and room.",
  },
} as const;

/** "32 emails". */
export function emailCountWords(count: number): string {
  return `${count} ${count === 1 ? "email" : "emails"}`;
}

/** "+26 more". */
export function moreNamesWords(count: number): string {
  return `+${count} more`;
}

export const THE_EMAIL = "The email";
export const EMAIL_FIELD = { from: "From", replyTo: "Reply to", to: "To", subject: "Subject" } as const;

/** Nobody is owed this email by a press now. */
export const NOBODY_OWED = "Nobody is waiting for this email.";

export const EMAILS_LOADING = "Reading the emails…";

/** How many names are drawn before "+N more". */
export const NAMES_SHOWN = 6;

/**
 * The sentence above the buttons, true of what the site does after Publish
 * (board st-publish draws "After you publish, moving someone emails just them
 * and their facilitators. Changing a group’s day or room emails that group.",
 * which the site does not do): a move takes the person's group away from
 * them until Publish is pressed again, which emails only the people not told
 * yet, and one week's change of a session can tell its group.
 */
export const AFTER_YOU_PUBLISH =
  "After you publish, someone you move sees nothing of their new group until you publish again, which emails only the people who haven’t been told. Change a session can tell a group about one week.";

// ---------------------------------------------------------------------------
// "Remind 3 people", on the card of who has not said when they are free
// ---------------------------------------------------------------------------

/** "Remind 3 people". */
export function remindFreeLabel(count: number): string {
  return `Remind ${peopleWords(count)}`;
}

/** "Emails 3 people": every button that emails says how many it reaches (C20). */
export function emailsPeopleWords(count: number): string {
  return `Emails ${peopleWords(count)}`;
}

/** The browser's confirmation before a press. */
export function remindFreeConfirm(firstNames: readonly string[]): string {
  return `Remind ${namesInWords(firstNames)} to say when they’re free? This emails ${peopleWords(firstNames.length)}.`;
}

/** What a press did. */
export function remindedFreeWords(emailed: number, failed: number): string {
  const sent = `Sent. ${emailed === 1 ? "1 person was" : `${emailed} people were`} emailed.`;
  return failed > 0 ? `${sent} ${failed === 1 ? "1 email" : `${failed} emails`} couldn’t be sent: press Remind again to try.` : sent;
}

/** Everybody the card names who has had a reminder today, and so is not emailed again today. */
export function remindedTodayWords(firstNames: readonly string[]): string {
  return `${namesInWords(firstNames)} ${firstNames.length === 1 ? "was" : "were"} reminded today.`;
}

/** Where a reply to the reminder goes: the society's own inbox, as every course email's. */
export const FREE_REMINDER_REPLY_TO = "ai-safety@uonsu.com";

/** The reminder as it is sent: its words, and nothing about anybody else. */
export type FreeReminderEmail = {
  subject: string;
  greeting: string;
  paragraphs: string[];
  button: { label: string; href: string };
  signOff: { name: string; role: string };
};

/**
 * The email "Remind" sends somebody holding a place on a fellowship who has
 * not said when they are free: what is missing, why it matters, until when it
 * can be added, and the button to the page where they add it. Every value is
 * a record's; with no day set for groups going out, the sentence is said
 * without one, as the application page says it. Signed by the programme's
 * lead, or NAISI with none.
 */
export function composeFreeReminder(input: {
  firstName: string;
  shortName: string;
  groupsGoOut: string | null;
  link: string;
  leadName: string;
}): FreeReminderEmail {
  return {
    subject: `Tell us when you’re free for ${input.shortName}`,
    greeting: input.firstName ? `Hi ${input.firstName},` : "Hi,",
    paragraphs: [
      `You hold a place on ${input.shortName}, and you haven’t told us when you’re free yet. We use it to put you in a group.`,
      input.groupsGoOut
        ? `You can add it on your application until we email your group on ${input.groupsGoOut}.`
        : "You can add it on your application until we email your group.",
    ],
    button: { label: "Say when you’re free", href: input.link },
    signOff: input.leadName ? { name: input.leadName, role: `${input.shortName} lead, NAISI` } : { name: "NAISI", role: "" },
  };
}
