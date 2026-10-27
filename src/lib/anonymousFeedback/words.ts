/**
 * EVERY SENTENCE THE ANONYMOUS FORM SAYS, in one place: the form's page, the
 * card at the end of the survey at a programme's end, and the readers' page.
 * No board draws this form, so the words are the house's plain ones, listed
 * in the build notes for the boards' designers to confirm. Where an anonymous
 * survey's words on the boards (sv-privacy, wk-left-phone) say the same thing,
 * they are used as written.
 *
 * WHAT THE BOX SAYS HAS TO BE EXACTLY TRUE, and it describes the code:
 * nothing kept with an answer names anybody (`ANSWER_FIELDS` in `./model`),
 * the link is one per programme, answers wait until the night's move into a
 * record whose time is the move's (`./move`), and the readers see them from
 * the next day in an order that has nothing to do with when they came in
 * (`./readers`). The privacy policy says the same at more length. A change to
 * any of those changes these words and the policy first.
 *
 * No imports, so the server and the browser word the form alike. Dates are
 * read in London, never the machine's own zone.
 */

const TZ = "Europe/London";

/** "Wed 9 Dec", read in London. */
export function dayWords(at: Date): string {
  const out: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).formatToParts(at)) {
    out[part.type] = part.value;
  }
  return `${out.weekday} ${out.day} ${out.month}`;
}

/** "Fellowship: AGI Strategy", beside the form's title. */
export function programmeWords(kind: "fellowship" | "incubator", name: string): string {
  return `${kind === "incubator" ? "Incubator" : "Fellowship"}: ${name}`;
}

/** The form's own page, before the questions and around them. */
export const FORM_WORDS = {
  bar: "Anonymous form",
  title: "What should we keep, change and drop?",
  intro: (name: string) => `Three questions about ${name}, so we can make it better next time. Write as much or as little as you like.`,
  skippable: "Every question can be skipped.",
  boxHeading: "Anonymous",
  /** How the form keeps it anonymous, point by point. Every one is about the code: see the module comment. */
  points: (name: string) => [
    "This form never records who answers, even when you’re signed in.",
    `Everybody on ${name} has the same link, so it says nothing about you.`,
    "We keep your three answers, the programme and the day: no name, account, email address, IP address or device.",
    "Overnight they move to a record that holds the day and not the time.",
    `Only ${name}’s lead and NAISI’s admins read them, from the next day, in an order unrelated to when each came in.`,
  ],
  note: "Our hosting provider’s request logs note the time and address of every visit, this one too; we never match them to your answers.",
  policyLink: "How we keep it anonymous, in the privacy policy",
} as const;

/** The three questions, each with the line under it. */
export const QUESTION_WORDS = {
  keep: { title: "What should we keep?", hint: "What worked, and should stay as it is." },
  change: { title: "What should we change?", hint: "What could be better, and how." },
  drop: { title: "What should we drop?", hint: "What wasn’t worth the time." },
} as const;

/** Sending, and what comes after. */
export const SEND_WORDS = {
  send: "Send anonymously",
  sending: "Sending…",
  closing: (closesAt: Date) => `It closes on ${dayWords(closesAt)}. Once sent, your answers can’t change.`,
  thanks: "Thank you. Your answers are in.",
  afterThanks: "Nothing we keep says they’re yours, so we can’t show them to you again.",
  tryAgain: "Your answers didn’t send. Check your connection and press Send anonymously again.",
} as const;

/** What the route answers, each one sentence a person can act on. */
export const REFUSAL_WORDS = {
  shape: "Something about that didn’t look like this form’s answers. Reload the page and try again.",
  empty: "Write something in at least one of the three boxes, then press Send anonymously.",
  long: "One of your answers is longer than 2,000 characters. Shorten it, then press Send anonymously again.",
  noForm: "This link doesn’t open a form. Open the link at the end of your programme’s survey again.",
  closed: "This form has closed, so it takes no more answers.",
  tooMany: "Too many answers have come from here in a minute. Wait a moment and press Send anonymously again.",
  tooManyForForm: "This form has had a lot of answers in the last hour. Wait a while and press Send anonymously again.",
} as const;

/** The page in place of the form, when there is none to show. */
export const STATE_WORDS = {
  noForm: {
    title: "This link doesn’t open a form",
    body: "It may have been copied wrongly, or the form is no longer here. If you answered your programme’s survey, open the link at its end again.",
  },
  closed: (closedOn: Date) => ({
    title: "This form has closed",
    body: `It closed on ${dayWords(closedOn)}, so it takes no more answers. Thank you for wanting to tell us.`,
  }),
} as const;

/** The card at the end of the survey at a programme's end, once its answers are sent. */
export const CARD_WORDS = {
  heading: "One more thing, anonymously",
  body: "Three questions about what we should keep, change and drop. It’s a separate form that never records who answers, even when you’re signed in.",
  link: "Open the anonymous form",
} as const;

/** The readers' page: the programme's lead and NAISI's admins. */
export const READER_WORDS = {
  heading: "What to keep, change and drop",
  intro:
    "Answers to the anonymous form the survey at the end links to. Nobody is named: the form never records who answers.",
  howShown:
    "Answers show here from the day after they come in, a whole day’s together, and each question’s are in alphabetical order, so nothing on this page says when one was sent.",
  count: (n: number) => (n === 1 ? "1 answer" : `${n} answers`),
  questionCount: (n: number) => (n === 1 ? "1 answer" : `${n} answers`),
  none: "No answers yet.",
  noneToQuestion: "Nobody has answered this one yet.",
  linkLabel: "The form’s link, the same for everybody on the programme:",
  notYet: "The form opens when the survey at the end is first sent.",
  open: (closesAt: Date) => `Open until ${dayWords(closesAt)}.`,
  closed: (closedOn: Date) => `Closed on ${dayWords(closedOn)}.`,
} as const;

/** The readers' three headings, one per question. */
export const READER_QUESTION_WORDS = {
  keep: "What to keep",
  change: "What to change",
  drop: "What to drop",
} as const;
