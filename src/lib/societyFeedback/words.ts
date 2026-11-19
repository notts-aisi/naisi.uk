import type { AboutKey } from "./model";

/**
 * EVERY SENTENCE ANONYMOUS FEEDBACK SAYS, in one place: the members' form,
 * what it says once sent, the link at the foot of the signed-in pages, and
 * the admins' page.
 *
 * WHAT THE FORM SAYS HAS TO BE EXACTLY TRUE, and it describes the code:
 * nothing kept with an entry names anybody (`ENTRY_FIELDS` in `./model`),
 * entries wait until the night's move into a record whose time is the move's
 * (`./move`), and admins read them from the next day, by day, in no
 * particular order within a day (`./admin`). The privacy policy says the same
 * at more length. A change to any of those changes these words and the policy
 * first.
 *
 * No imports but a type, so the server and the browser word it alike. Dates
 * are read in London, never the machine's own zone.
 */

const TZ = "Europe/London";

/** "Mon 9 Nov" for a day key "2026-11-09", read in London; "" for anything else. */
export function dayKeyWords(key: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
  // Noon UTC is the same calendar day in London whatever the season.
  const at = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return "";
  return dayWords(at);
}

/** "Mon 9 Nov 2026" for a day key, read in London; "" for anything else. */
export function dayKeyWordsWithYear(key: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
  const at = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return "";
  return `${dayWords(at)} ${new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric" }).format(at)}`;
}

/** "Sun 8 Nov", read in London. */
export function dayWords(at: Date): string {
  const out: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).formatToParts(at)) {
    out[part.type] = part.value;
  }
  return `${out.weekday} ${out.day} ${out.month}`;
}

/** "Week 2". */
export function weekWords(week: number): string {
  return `Week ${week}`;
}

/** The roles "Who is it about?" offers, as the form lists them. */
export const ABOUT_WORDS: Record<AboutKey, string> = {
  facilitator: "My group’s facilitator",
  lead: "The programme’s lead",
  group: "Someone in my group",
  committee: "The committee",
  else: "Someone else",
};

/** The same roles, as the admins' page says them after "About: ". */
export const ABOUT_AFTER_COLON: Record<AboutKey, string> = {
  facilitator: "my group’s facilitator",
  lead: "the programme’s lead",
  group: "someone in my group",
  committee: "the committee",
  else: "someone else",
};

/** The link at the foot of every signed-in page. */
export const FOOTER_LINK = "Anonymous feedback";

/** The members' form. */
export const FORM_WORDS = {
  title: "Anonymous feedback",
  intro: "Tell us anything about NAISI. We don’t keep who sent it, so we can’t reply.",
  programmeLabel: "What’s it about? (optional)",
  programmeNone: "Not about a programme",
  sessionLabel: "Which session? (optional)",
  sessionNone: "No particular session",
  sessionWarning: "In a small group, naming a session can show who wrote this.",
  aboutLabel: "Who is it about? (optional)",
  aboutNone: "No one in particular",
  aboutHint: "A role, not a name.",
  wordsLabel: "Your feedback",
  box: "Admins read this from the next day, in no particular order. We don’t keep who sent it, even when you’re signed in.",
  send: "Send anonymously",
  sending: "Sending…",
  tryAgain: "Your feedback didn’t send. Check your connection and press Send anonymously again.",
} as const;

/** What the form says once it is sent. */
export const SENT_WORDS = {
  title: "Thanks: it’s sent",
  body: "We don’t keep who sent it, so we can’t reply to it. Admins will read it from tomorrow.",
  more: "Send more feedback",
} as const;

/** What the route answers, each one sentence a person can act on. */
export const REFUSAL_WORDS = {
  shape: "Something about that didn’t look like this form. Reload the page and try again.",
  empty: "Write your feedback, then press Send anonymously.",
  long: "Your feedback is longer than 4,000 characters. Shorten it, then press Send anonymously again.",
  noProgramme: "That programme isn’t on the list any more. Reload the page and choose again.",
  notMember: "Sign in as a NAISI member to send feedback.",
  tooMany: "Too much feedback has come from here in a minute. Wait a moment and press Send anonymously again.",
  tooManyOverall: "We’ve had a lot of feedback in the last hour. Wait a while and press Send anonymously again.",
} as const;

/** The admins' page. */
export const ADMIN_WORDS = {
  title: "Anonymous feedback",
  crumb: "Surveys",
  count: (n: number) => `${n} this term`,
  download: "Download",
  adminsOnly: "Admins only",
  all: "All",
  noProgramme: "Not about a programme",
  aboutLabel: "About",
  aboutAnyone: "Anyone",
  howShown: "Each shows from the day after it was sent, by day, in no particular order within a day. There’s nobody to reply to.",
  about: (role: string) => `About: ${role}`,
  dealtWith: "Dealt with",
  addNote: "Add a note for admins",
  noteLabel: "A note for admins",
  saveNote: "Save note",
  cancel: "Cancel",
  saving: "Saving…",
  note: (name: string, day: string, words: string) => `${name || "An admin"}, ${day}: ${words}`,
  none: "No feedback to read yet.",
  noneHere: "Nothing here.",
  failed: "That didn’t save. Try again.",
} as const;

/** Clearing out by hand, at the foot of the admins' page. */
export const CLEAR_WORDS = {
  heading: "Clear out old feedback",
  line: "Delete every entry sent before a day you choose. Nothing here is deleted by itself.",
  beforeLabel: "Sent before",
  count: "Count them",
  counting: "Counting…",
  none: (day: string) => `No entries were sent before ${day}.`,
  confirm: (n: number, day: string) =>
    `${n === 1 ? "1 entry was" : `${n} entries were`} sent before ${day}. Delete ${n === 1 ? "it" : "them"}? This can’t be undone.`,
  delete: (n: number) => (n === 1 ? "Delete 1 entry" : `Delete ${n} entries`),
  deleting: "Deleting…",
  keep: "Keep them",
  done: (n: number) => (n === 1 ? "Deleted 1 entry." : `Deleted ${n} entries.`),
  badDay: "Choose a day on or before today.",
  failed: "That didn’t work. Try again.",
} as const;

/** The admins' refusals. */
export const ADMIN_REFUSALS = {
  notAdmin: "Only admins can do this.",
  shape: "Something about that didn’t look right. Reload the page and try again.",
  gone: "That entry isn’t here any more. Reload the page.",
  long: "That note is longer than 1,000 characters. Shorten it and save again.",
} as const;

/** The download's columns. */
export const DOWNLOAD_COLUMNS = ["Day", "Programme", "Session", "About", "Feedback", "Dealt with", "Note"] as const;
