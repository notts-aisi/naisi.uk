/**
 * THE WORDS OF ASKING SOMEBODY TO FACILITATE: the lead's Facilitators view
 * (st-facilitators), the email that asks (its "The email Grace got"), and the
 * page its "Say yes or no" opens (st-fac-ask-phone). The boards' own words,
 * apostrophes included; a slot is filled from a record, never typed here.
 *
 * Words the boards do not draw are marked NOT DRAWN, and each is listed in
 * the build notes for the boards' designers to confirm.
 *
 * The email names a time and a place, so it goes out WHOLE OR NOT AT ALL:
 * {@link composeAskEmail} answers null when a slot it cannot do without is
 * empty, and nothing that answers null is sent. It never carries a meeting
 * link, and never a room a reader could follow (`couldBeFollowed`, decided
 * by the caller through `placementWhere`): `AskWhere` carries no address.
 *
 * Pure, with no server import: the view composes its preview with the same
 * function the send composes the email with, so what the lead reads and what
 * arrives are one text.
 */

// ---------------------------------------------------------------------------
// Days, times and lists
// ---------------------------------------------------------------------------

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "6pm", "6:30pm", "12pm", "12am" from "18:00". Null for anything that is not a time of day. */
export function clockIn(time: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "am" : "pm";
  return minute === 0 ? `${twelve}${suffix}` : `${twelve}:${String(minute).padStart(2, "0")}${suffix}`;
}

/**
 * "Wed 28 Oct" from "2026-10-28": a civil date, read as the date it names
 * whatever the clock of the machine reading it. Null for a key that is not
 * a day.
 */
export function dayIn(dateKey: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(match[3])) return null;
  return `${WEEKDAY_SHORT[date.getUTCDay()]} ${date.getUTCDate()} ${MONTH_SHORT[date.getUTCMonth()]}`;
}

/** "A", "A and B", "A, B and C". */
export function listInWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The first word of a name: "Grace" from "Grace Okoye". */
export function firstNameIn(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** A group's weekly session, as much of it as these words need. */
export type AskSlot = { weekday: number; startTimeLocal: string; durationMinutes: number };

const validDay = (day: number) => Number.isInteger(day) && day >= 0 && day <= 6;

/** "Mondays at 6pm": when a group meets, every week. Null while it has no day or time. */
export function meetsWords(slot: Pick<AskSlot, "weekday" | "startTimeLocal">): string | null {
  const at = clockIn(slot.startTimeLocal);
  return validDay(slot.weekday) && at ? `${WEEKDAY[slot.weekday]}s at ${at}` : null;
}

/** "Mon 6pm": the board's short form, under a group's name. Null as above. */
export function shortSlotWords(slot: Pick<AskSlot, "weekday" | "startTimeLocal">): string | null {
  const at = clockIn(slot.startTimeLocal);
  return validDay(slot.weekday) && at ? `${WEEKDAY_SHORT[slot.weekday]} ${at}` : null;
}

/** "Mondays, 6pm to 8pm": the answer page's When. Null when the slot has no day, time or length. */
export function whenWords(slot: AskSlot): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(slot.startTimeLocal);
  if (!match || !validDay(slot.weekday)) return null;
  if (!Number.isInteger(slot.durationMinutes) || slot.durationMinutes <= 0) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = (start + slot.durationMinutes) % (24 * 60);
  const endTime = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
  return `${WEEKDAY[slot.weekday]}s, ${clockIn(slot.startTimeLocal)} to ${clockIn(endTime)}`;
}

/** "6 weeks", "1 week". */
export function weeksWords(weeks: number): string {
  return weeks === 1 ? "1 week" : `${weeks} weeks`;
}

/** "Up to 8 people": a group's size. Null for a group with no size set. */
export function sizeWords(capacity: number | null): string | null {
  if (capacity === null || !Number.isInteger(capacity) || capacity <= 0) return null;
  return capacity === 1 ? "Up to 1 person" : `Up to ${capacity} people`;
}

/** Where a group meets, as the email may say it. No address is ever in it. */
export type AskWhere = { kind: "room"; room: string } | { kind: "online" } | null;

// ---------------------------------------------------------------------------
// The Facilitators view (st-facilitators)
// ---------------------------------------------------------------------------

/** "5 facilitators for 4 groups". */
export function headlineWords(people: number, groups: number): string {
  return `${people} ${people === 1 ? "facilitator" : "facilitators"} for ${groups} ${groups === 1 ? "group" : "groups"}`;
}

/** A chip: "Said yes · Mon 26 Oct". */
export function saidYesWords(day: string): string {
  return `Said yes · ${day}`;
}

/** A chip: "Asked Tue 27 Oct · no reply yet". */
export function askedWords(day: string): string {
  return `Asked ${day} · no reply yet`;
}

/** A chip: "Said no · Tue 27 Oct". The board lists "Said no" among the statuses. */
export function saidNoWords(day: string): string {
  return `Said no · ${day}`;
}

/** NOT DRAWN. A chip for an ask whose day to answer by has gone with no answer. */
export function noReplyByWords(day: string): string {
  return `No reply by ${day}`;
}

/** NOT DRAWN. A chip for an ask whose seat somebody else said yes to first. */
export function seatTakenWords(groupName: string): string {
  return `Somebody else took ${groupName}`;
}

/** NOT DRAWN. A chip for somebody added to a group by hand, with no ask behind it. */
export function facilitatingWords(groupName: string): string {
  return `Facilitating ${groupName}`;
}

/** "Remind Grace". */
export function remindLabel(firstName: string): string {
  return `Remind ${firstName}`;
}

/** Beside every button that emails one person. */
export const EMAILS_ONE = "Emails 1 person";

export const ASK_SOMEONE_ELSE = "Ask someone else";

/** NOT DRAWN. Under a Remind button pressed already. */
export function remindedWords(day: string): string {
  return `Reminded ${day}`;
}

/** "The email Grace got". */
export function emailCardTitle(firstName: string): string {
  return `The email ${firstName} got`;
}

/** The labels of the email card's head, as the board writes them (upper case by CSS). */
export const EMAIL_FIELDS = { from: "From", replyTo: "Reply to", to: "To", subject: "Subject" } as const;

/** Who an email from this site is from, as the board's card says it. */
export const EMAIL_FROM = "NAISI";

/** Where replies to an ask go: the society's inbox, as for every course email. */
export const ASK_REPLY_TO = "ai-safety@uonsu.com";

/** NOT DRAWN. The email card before anybody has been asked. */
export const NOBODY_ASKED_YET = "Nobody has been asked yet. The email each person gets shows here once they have been.";

/** "People who’d like to facilitate AGI Strategy (9)". */
export function tableHeading(shortName: string, people: number): string {
  return `People who’d like to facilitate ${shortName} (${people})`;
}

/** "From the form: they said yes to facilitating and chose AGI Strategy or Either." */
export function tableLine(shortName: string): string {
  return `From the form: they said yes to facilitating and chose ${shortName} or Either.`;
}

/** NOT DRAWN. In place of the table while nobody has said they would. */
export function nobodyWouldWords(shortName: string): string {
  return `Nobody who applied has said they’d like to facilitate ${shortName} yet.`;
}

/** NOT DRAWN. In place of the table on a form that never asked. */
export const FORM_NEVER_ASKED = "This term’s application form didn’t ask whether people would like to facilitate.";

/** NOT DRAWN. Above the table until decision day has been sent. */
export const ASK_AFTER_DECISIONS = "You can ask people once decisions have gone out, when everybody knows where they stand.";

export const TABLE_COLUMNS = { person: "Person", status: "Status", ask: "Ask" } as const;

/** The table's statuses, the board's words. */
export const TAKING_PART_ELSEWHERE = "Taking part in another programme";
export const NO_OFFER = "No offer this time";

/**
 * "Taking part in AGI Strategy": somebody holding a place on the programme.
 * They may be asked: a facilitator who holds a place is one of the group's
 * fellows too, and a yes places them in the group they facilitate.
 */
export function takingPartWords(shortName: string): string {
  return `Taking part in ${shortName}`;
}

/** NOT DRAWN. Statuses the board's sample people do not have. */
export function invitedToWords(shortName: string): string {
  return `Invited to ${shortName}`;
}
export const INVITED_ELSEWHERE = "Invited to another programme";
/**
 * Somebody invited to the programme who has not answered is asked once they
 * have: until then nobody knows whether they will hold a place, and so
 * whether a yes would place them in the group.
 */
export const CANT_UNTIL_ANSWERED = "Can’t be asked until they answer their invitation";
export const GAVE_PLACE_BACK = "Gave their place back";
export const ACCOUNT_WAITING = "Account waiting for approval";
export const CANT_UNTIL_APPROVED = "Can’t be asked until an admin approves their account";

/** NOT DRAWN. In a cell for a question somebody left out. */
export const NOT_ANSWERED = "Not answered";

/** In the Ask column for somebody asked already. */
export const ASKED = "Asked";

/** The button that opens the ask, with its ellipsis: it opens a question, it sends nothing. */
export const ASK_BUTTON = "Ask to facilitate…";

/** "Ask Kai Robertson to facilitate": the button's name for a screen reader. */
export function askButtonName(name: string): string {
  return `Ask ${name} to facilitate`;
}

// ---- The ask itself (NOT DRAWN: the board draws its button, not what it opens) ----

/** The ask's heading: "Ask Kai Robertson to facilitate". */
export function askHeading(name: string): string {
  return `Ask ${name} to facilitate`;
}

export const ASK_GROUP_LABEL = "Which group";
export const ASK_REPLY_DATE_LABEL = "Answer by (day)";
export const ASK_REPLY_TIME_LABEL = "Answer by (time)";
export const SEND_TEST = "Send a test to me";

/** The send: "Ask Kai". It says who it emails beside it (`EMAILS_ONE`). */
export function askSendLabel(firstName: string): string {
  return `Ask ${firstName}`;
}

/** "Ask somebody else for Group D". */
export function askSomeoneElseHeading(groupName: string): string {
  return `Ask somebody else for ${groupName}`;
}

export const ASK_PERSON_LABEL = "Who";

/** Why the send is held until a test. */
export function testFirstWords(replyBy: string): string {
  return `Send yourself a test first. The ask goes once a test asking for an answer by ${replyBy} has reached you.`;
}

/** What a test did. Only one that reached the person asking counts. */
export function testWords(delivery: "sent" | "held" | "suppressed", replyBy: string): string {
  if (delivery === "held") {
    return "The test was held, not sent: this copy of the site doesn’t email your address. A held test doesn’t count.";
  }
  if (delivery === "suppressed") {
    return "Your address is on the do-not-email list, so the test was not sent. It doesn’t count as a test.";
  }
  return `A test went to you. Asks for an answer by ${replyBy} can go now.`;
}

/** What an ask or a reminder did. */
export function sentWords(
  delivery: "sent" | "held" | "suppressed",
  firstName: string,
  what: "asked" | "reminded",
): string {
  const done = what === "asked" ? `${firstName} has been asked.` : `${firstName} has been reminded.`;
  if (delivery === "held") return `${done} The email was held: this copy of the site doesn’t write to that address.`;
  if (delivery === "suppressed") return `${done} The email was not sent: the address is on the do-not-email list.`;
  return `${done} The email went.`;
}

/** NOT DRAWN. A line under the email preview while the run has no training set. */
export const NO_TRAINING_SET =
  "No training is set for this run, so the email leaves it out. The programme’s Settings tab sets it.";

/** The foot of the groups card: what Change does. */
export const CHANGE_EMAILS_NOBODY =
  "Changing who facilitates a group emails nobody. Somebody added after groups have gone out is told by the next press of Publish, on People in groups.";

/**
 * After a by-hand change of a group's facilitators. NOT DRAWN when it names
 * somebody: a facilitator who holds a place and sat in no group is placed in
 * the group they facilitate, and the sentence says who.
 */
export function changeSavedWords(groupName: string, placedNames: readonly string[] = []): string {
  if (placedNames.length === 0) return `${groupName}’s facilitators are saved. Nobody was emailed.`;
  const verb = placedNames.length === 1 ? "is" : "are";
  return `${groupName}’s facilitators are saved, and ${listInWords(placedNames)} ${verb} now in ${groupName}. Nobody was emailed.`;
}

// ---- Where a facilitator who holds a place sits (NOT DRAWN) ----
//
// A facilitator who holds a place on the run sits in the group they
// facilitate, and an appointment places somebody in no group yet. When it
// cannot, nothing is saved and one of these says why. Words for the people
// who staff a run name the groups; the words for the person asked name only
// the group they were asked about, because where somebody else has placed
// them is not theirs to read before Publish tells them.

/** By hand: they sit in another group. */
export function byHandElsewhereWords(name: string, inGroup: string, toGroup: string): string {
  return `${name} is in ${inGroup}, and somebody who holds a place facilitates the group they’re in. Move them to ${toGroup} on People in groups first, or make them one of ${inGroup}’s facilitators. Nothing was saved.`;
}

/** By hand: the group has no room for them. */
export function byHandFullWords(name: string, groupName: string): string {
  return `${groupName} is full, so ${name} can’t be placed in it. Make room in ${groupName} on People in groups, or give it more places, then try again. Nothing was saved.`;
}

/** By hand, from somebody who may not place them (a track lead, for a place from the application form). */
export function byHandNotYoursWords(name: string): string {
  return `Only an admin or the lead of the programme that names this run can make ${name} one of its facilitators, so nothing was saved.`;
}

/** Asking: they sit in another group. */
export function askElsewhereWords(inGroup: string, toGroup: string): string {
  return `That person is in ${inGroup}, and somebody who holds a place facilitates the group they’re in. Ask them for ${inGroup}, or move them to ${toGroup} on People in groups first.`;
}

/** Asking: the group has no room for them. */
export function askFullWords(groupName: string): string {
  return `${groupName} is full, so that person couldn’t be placed in it if they said yes. Make room in ${groupName} on People in groups first, or give it more places.`;
}

/** Answering yes, when their place cannot go into the group: another group, no room, or not on the run yet. */
export function cantPlaceYouWords(groupName: string): string {
  return `We can’t make you ${groupName}’s facilitator just yet. A facilitator who holds a place sits in the group they facilitate, and your place needs sorting out first. Please write to ai-safety@uonsu.com.`;
}

/** Answering yes, with an invitation to the programme not yet answered. */
export function answerInvitationFirstWords(shortName: string): string {
  return `You’ve been invited to ${shortName}. Please answer that invitation first, then come back here to say yes.`;
}

// ---------------------------------------------------------------------------
// The email (st-facilitators, "The email Grace got")
// ---------------------------------------------------------------------------

/** Every slot the email fills, each from a record. */
export type AskEmailInput = {
  /** What to call them. Falls back to "there". */
  firstName: string;
  /** "AGI Strategy". */
  shortName: string;
  /** "AGI Strategy Fellowship". */
  programmeName: string;
  /** "Group D". */
  groupName: string;
  /** "Mondays at 6pm" ({@link meetsWords}). */
  meets: string;
  /** Where the group meets, or null for neither a room nor online yet. */
  where: AskWhere;
  /** How many taught weeks the group's own calendar holds. */
  weeks: number;
  /** "Mon 2 Nov": its first session. */
  firstSession: string;
  /** The group's size, or null when it has none. */
  capacity: number | null;
  /** The run's training, or null while none is set: its lines are then left out. */
  training: { day: string; time: string; room: string } | null;
  /** "Wed 28 Oct" and "12pm": the day and time to answer by, chosen when asking. */
  replyBy: { day: string; time: string };
  /** The lead's first name, or "" for a programme with none: it is then signed NAISI. */
  leadName: string;
  /** The page the button opens: the person's own answer page. */
  link: string;
};

/** The email, as it will read. The view's preview, the test and the send are this. */
export type AskEmail = {
  subject: string;
  greeting: string;
  paragraphs: string[];
  button: { label: string; href: string };
  signOff: { name: string; role: string };
};

export const SAY_YES_OR_NO = "Say yes or no";

/** "Would you facilitate a group on AGI Strategy?" */
export function askSubject(shortName: string): string {
  return `Would you facilitate a group on ${shortName}?`;
}

function whereInSentence(where: AskWhere): string {
  if (!where) return "";
  return where.kind === "online" ? " online" : ` in ${where.room}`;
}

/**
 * The email that asks, in the board's words, or NULL when a slot it cannot do
 * without is empty. Optional, and left out whole when there is nothing to say:
 * the room (the sentence then names no place), the group's size (its sentence
 * goes) and the training (its paragraph goes).
 */
export function composeAskEmail(input: AskEmailInput): AskEmail | null {
  const short = input.shortName.trim();
  const programme = input.programmeName.trim() || short;
  const group = input.groupName.trim();
  const needed = [short, group, input.meets, input.firstSession, input.replyBy.day, input.replyBy.time, input.link];
  if (needed.some((slot) => slot.trim() === "")) return null;
  if (!Number.isInteger(input.weeks) || input.weeks < 1) return null;

  const size = sizeWords(input.capacity);
  const meets = `${group} meets on ${input.meets}${whereInSentence(input.where)}, for ${weeksWords(input.weeks)} from ${input.firstSession}.`;
  const paragraphs = [
    `You said you’d like to facilitate, and we’d love you to. Would you take ${group} of the ${programme}?`,
    size ? `${meets} It’s for up to ${input.capacity === 1 ? "1 person" : `${input.capacity} people`}.` : meets,
  ];
  if (input.training) {
    paragraphs.push(
      `Training is on ${input.training.day} at ${input.training.time} in ${input.training.room}. You don’t need any experience: we’ll give you everything you need.`,
    );
  }
  paragraphs.push(`Please let us know by ${input.replyBy.day} at ${input.replyBy.time}, so we can tell the group.`);
  const lead = input.leadName.trim();
  return {
    subject: askSubject(short),
    greeting: `Hi ${input.firstName.trim() || "there"},`,
    paragraphs,
    button: { label: SAY_YES_OR_NO, href: input.link },
    // As decision day signs: the programme's lead, or NAISI when none is named.
    signOff: lead ? { name: lead, role: `${short} lead, NAISI` } : { name: "NAISI", role: "" },
  };
}

/**
 * The reminder: the ask again, under the line the site's invitation reminder
 * opens with, so somebody whose first email went astray learns everything
 * from this one. NOT DRAWN: the board draws "Remind Grace", not its email.
 */
export function composeAskReminder(
  input: AskEmailInput,
  due: {
    /** True on the day to answer by itself. */
    lastDay: boolean;
  },
): AskEmail | null {
  const ask = composeAskEmail(input);
  if (!ask) return null;
  const when = due.lastDay
    ? `it’s due today, ${input.replyBy.day} at ${input.replyBy.time}`
    : `it’s due by ${input.replyBy.day} at ${input.replyBy.time}`;
  return {
    ...ask,
    subject: `Reminder: ${ask.subject}`,
    paragraphs: [`This is a reminder. We haven’t had your reply yet, and ${when}.`, ...ask.paragraphs],
  };
}

/** The subject a test carries, so it cannot be mistaken for the real one. */
export function testSubject(subject: string): string {
  return `[TEST] ${subject}`;
}

// ---------------------------------------------------------------------------
// The answer page (st-fac-ask-phone)
// ---------------------------------------------------------------------------

/** "Fellowship: AGI Strategy" (upper case by CSS). */
export function pageEyebrow(kind: "fellowship" | "incubator", shortName: string): string {
  return `${kind === "incubator" ? "Incubator" : "Fellowship"}: ${shortName}`;
}

/** "Would you facilitate Group D?" */
export function pageHeading(groupName: string): string {
  return `Would you facilitate ${groupName}?`;
}

export const PAGE_FIELDS = { when: "When", from: "From", where: "Where", group: "Group" } as const;

/** "Mon 2 Nov, for 6 weeks". */
export function fromWords(firstSession: string, weeks: number): string {
  return `${firstSession}, for ${weeksWords(weeks)}`;
}

/** NOT DRAWN. Where, for a group with no room yet. */
export const NO_ROOM_YET = "No room yet";
/** NOT DRAWN. Where, for a group that meets online. */
export const ONLINE = "Online";

export const TRAINING = "Training";

/** The run's training as the email and the page say it, or null while none is set. */
export function trainingWords(
  training: { dateKey: string; time: string; room: string } | null,
): { day: string; time: string; room: string } | null {
  if (!training) return null;
  const day = dayIn(training.dateKey);
  const time = clockIn(training.time);
  const room = training.room.trim();
  return day && time && room ? { day, time, room } : null;
}

/** "Wed 28 Oct · 6pm · Room B5". */
export function trainingLine(training: { day: string; time: string; room: string }): string {
  return `${training.day} · ${training.time} · ${training.room}`;
}

/**
 * "You don’t need any experience. We’ll train you and give you everything you
 * need: a guide for every week, and Claudia, the programme’s lead, if you get
 * stuck." With no lead named, the lead's part is left out.
 */
export function trainingText(leadName: string): string {
  const lead = leadName.trim();
  return lead
    ? `You don’t need any experience. We’ll train you and give you everything you need: a guide for every week, and ${lead}, the programme’s lead, if you get stuck.`
    : "You don’t need any experience. We’ll train you and give you everything you need: a guide for every week.";
}

export const YES = "Yes, I’ll facilitate";
export const NO = "I can’t this term";

/**
 * The board's "If you say yes, …" sentence, built from the one sentence the
 * facilitator's pages share for when names are shown (`NAMES_WHEN_GROUPS_GO_OUT`
 * in `src/features/courses/groupNamesWords.ts`, handed in by the page, so the
 * words are written once). The day comes from the run's own record of when
 * groups go out; until a run holds one, it is said without a day, as the
 * facilitator's group page says it.
 */
export function ifYesWords(shared: string, goOutDay: string | null): string {
  const body = shared.trim().replace(/\.$/, "");
  const lowered = body.charAt(0).toLowerCase() + body.slice(1);
  return `If you say yes, ${lowered}${goOutDay ? ` on ${goOutDay}` : ""}.`;
}

/** "Please answer by Wed 28 Oct, 12pm." */
export function answerByWords(day: string, time: string): string {
  return `Please answer by ${day}, ${time}.`;
}

// ---- After an answer, and when an answer can no longer be given (NOT DRAWN) ----

/** After yes. */
export function saidYesHeading(groupName: string): string {
  return `You’re facilitating ${groupName}.`;
}
/** After yes, once groups have gone out. */
export const OPEN_YOUR_GROUP = "Open your group";
/** After no. */
export const SAID_NO_HEADING = "Thanks for letting us know.";
export function saidNoText(shortName: string): string {
  return `You said you can’t facilitate ${shortName} this term.`;
}
/** After the day to answer by, with no answer. */
export function lateWords(day: string, time: string): string {
  return `We needed an answer by ${day}, ${time}, so this has closed. If you’d still like to facilitate, write to ai-safety@uonsu.com.`;
}
/** Once somebody else has said yes to the same place. */
export function seatGoneWords(groupName: string): string {
  return `Somebody else is facilitating ${groupName} now, so this has closed. Thank you for saying you’d like to.`;
}
/** To anybody but the person asked. Says nothing of the ask. */
export const NOT_YOURS =
  "This page is for the person we asked. If that’s you, sign in with the account you applied with.";
/** The group has gone from the run, or the run itself. */
export const NO_LONGER_OPEN = "This group is no longer running, so this has closed.";

// ---------------------------------------------------------------------------
// The training's card on the programme's Settings tab (NOT DRAWN)
// ---------------------------------------------------------------------------

export const TRAINING_CARD_TITLE = "Facilitators’ training";
export const TRAINING_HINT =
  "When and where the training is for the people who say yes to facilitating. The email that asks somebody to facilitate, and the page they answer on, say it. Leave all three empty for none.";
export const TRAINING_DAY_LABEL = "Day";
export const TRAINING_TIME_LABEL = "Time";
export const TRAINING_ROOM_LABEL = "Room";
export const TRAINING_INCOMPLETE = "Not saved yet. Fill in the day, the time and the room, or empty all three.";

// ---------------------------------------------------------------------------
// Refusals, in words a person can act on
// ---------------------------------------------------------------------------

export const LEADS_AND_ADMINS = "Only the programme’s lead and admins can ask people to facilitate.";
export const NO_PROGRAMME = "There is no programme here.";
export const NO_RUN = "This programme doesn’t name a course run yet, so there are no groups to ask anybody to.";
export const RUN_GONE = "The course run this programme names is no longer on the site.";
export const NOT_SENT_YET = ASK_AFTER_DECISIONS;
export const NOT_YOURSELF = "You can’t ask yourself to facilitate.";
export const NOT_ON_THE_LIST = "That person isn’t on the list of people who’d like to facilitate this programme.";
export const NO_SUCH_GROUP = "That group isn’t one of this run’s.";
export const NOT_AN_ASK = "There is no ask here.";
export const REPLY_BY_PAST = "Choose a day and time to answer by that is still to come.";
export const NO_ADDRESS = "That person has no address to email, so they can’t be asked.";
export const STILL_ASKED = "That person has been asked already.";
export const WRONG_COUNT = "The number of emails on the button is out of date. Look again before you press.";
export const NO_SITE_ADDRESS =
  "This copy of the site doesn’t know its own address, so the button in the email would lead nowhere.";
export const TOO_MANY_FACILITATORS = "That group has as many facilitators as a group can have.";
export const TOO_MANY_ASKS = "This run has as many asks as it can keep.";
export const NOT_WAITING = "That ask has been answered or has closed, so there is nobody to remind.";
export const REMINDED_RECENTLY = "That person was reminded less than twelve hours ago.";
export const REMINDED_ENOUGH = "That person has been reminded as many times as the site allows.";

/** Why an email cannot be written whole, in words a lead can act on. */
export function notWholeWords(groupName: string): string {
  return `The email can’t be written whole, so nothing was sent: ${groupName || "that group"} needs a day and time, and a first session still to come.`;
}

/** The email did not go, so the ask was taken back. */
export function emailFailedWords(firstName: string): string {
  return `The email to ${firstName} didn’t go, so ${firstName} hasn’t been asked. Try again in a moment.`;
}
