/**
 * The words of the admins' Public numbers page (sv-public), in one place the
 * page and its client parts both read. Pure, with no import, so a client
 * component takes them without taking the counting.
 */

export const PUBLIC_NUMBERS_WORDS = {
  crumb: "Surveys",
  title: "Public numbers",
  lede: "Pick what goes on a programme’s public page: numbers from its own surveys, each with how many answers it rests on, and only comments their writers ticked “You can quote this, without my name”.",
  programme: "Programme",
  show: "Show",
  numbers: "Numbers",
  quotes: "Quotes",
  picked: (n: number) => `${n} picked`,
  beliefs: "Beliefs about AI aren’t offered: they’re reported, never targets.",
  ticked: "Ticked by its writer",
  noNumbers: "No numbers to offer yet: the survey at the end has no answers.",
  noQuotes: "No comment has been ticked to be quoted yet.",
  noProgrammes: "No programme is tied to a course yet, so there is no public page to publish on.",
  publish: "Publish",
  publishing: "Publishing…",
  publishLine: "Changes the public page now. Take it down any time.",
  takeDown: "Take it down",
  takingDown: "Taking it down…",
  publishedLine: (day: string, name: string) => (name ? `On the public page since ${day}, published by ${name}.` : `On the public page since ${day}.`),
  publishedNow: "On the public page now.",
  published: "Published. The public page shows it now.",
  takenDown: "Taken down. The public page no longer shows it.",
  failed: "That didn’t work. Check your connection and try again.",
  preview: "Preview",
  previewLine: (name: string) => `The ${name}’s page, under “Last term”`,
  previewEmpty: "Pick a number or a quote to see it here.",
  phone: "On a phone",
  computer: "On a computer",
  computerSize: "At 78% size",
} as const;
