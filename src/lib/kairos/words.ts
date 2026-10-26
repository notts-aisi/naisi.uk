/**
 * THE KAIROS CHOICE, IN WORDS: the block every programme survey's form ends
 * with, and the section on a person's profile. The boards draw neither, so
 * these words are listed in the build notes for the boards' designers to
 * confirm. The privacy policy says the same at more length, and
 * `tests/privacy-policy.test.mjs` holds the two together.
 *
 * Every version says the three things the choice rests on: what goes to
 * Kairos, that sharing helps NAISI make its case to its funders and sponsors,
 * and that saying no stops only what goes with the person's name.
 *
 * Pure: words only, so the form and the profile's panel can import them.
 */

export const KAIROS_FORM_WORDS = {
  heading: "Sharing with Kairos",
  what:
    "We share your name and your record on this programme with Kairos, our funder: how many sessions you came to, whether you finished, and how you were rated at the end.",
  why: "Sharing helps us make our case to our funders and sponsors, so leaving it on helps NAISI.",
  box: "Don’t share my details with Kairos",
  after:
    "Saying no stops only what goes to Kairos with your name. We still see your answers, and they still count in our totals. You can change this at any time on your profile.",
} as const;

export const KAIROS_SETTING_WORDS = {
  heading: "Sharing with Kairos",
  description: "What we share with Kairos, our funder, about the programmes you take part in.",
  shared:
    "We share your name and your record on each programme you take part in with Kairos: how many sessions you came to, whether you finished, and how you were rated at the end. Sharing helps us make our case to our funders and sponsors.",
  notShared: "You said not to share your details with Kairos, so we don’t.",
  note: "Saying no stops only what goes to Kairos with your name. We still see your survey answers, and they still count in our totals.",
  stop: "Don’t share my details with Kairos",
  start: "Share my details with Kairos",
  stopped: "Done. We won’t share your details with Kairos.",
  started: "Done. We’ll share your details with Kairos.",
  failed: "That didn’t change. Check your connection and try again.",
} as const;

/** The routes' refusals, each a sentence a person can act on. */
export const KAIROS_REFUSAL = {
  notSignedIn: "Sign in to change what we share with Kairos.",
  body: "That change didn’t arrive in a shape we understand. Reload the page and try again.",
  notOnSurvey: "This survey doesn’t ask about sharing with Kairos.",
} as const;

/** The Kairos file: its page, its button and its route's refusals. */
export const KAIROS_FILE_WORDS = {
  title: "Kairos",
  lede: "What goes to Kairos, our funder, programme by programme: the file with names, and the report of totals.",
  download: "Download the Kairos file",
  preparing: "Preparing it…",
  recorded: "Each download is recorded. Delete your copy once it has gone to Kairos.",
  holds:
    "It holds everybody on the programme at its end who hasn’t said no to sharing: their name, the programme, the sessions they came to, whether they finished and the ratings they were given. Never an email address, who gave a rating or a survey answer.",
  notOverLine: (day: string | null) =>
    day ? `The file can be made once the last session is over, on ${day}.` : "The file can be made once the last session is over.",
  leftOut: (n: number) =>
    n === 0 ? "Nobody has said no to sharing." : n === 1 ? "1 person said no to sharing, so they are left out." : `${n} people said no to sharing, so they are left out.`,
  none: "No programme names a course run yet.",
  failed: "The download couldn’t be made. Try again in a minute.",
  offline: "The download couldn’t be made. Check your connection and try again.",
  notSignedIn: "Sign in to download the Kairos file.",
  adminOnly: "Only an admin can download the Kairos file.",
  body: "That request didn’t arrive in a shape this page understands. Reload the page and try again.",
  noProgramme: "That programme isn’t here, or it names no course run.",
  notOver: (day: string | null) =>
    day ? `The programme’s last session is on ${day}. The file can be made once it is over.` : "The file can be made once the programme’s last session is over.",
  notRecorded: "The download could not be recorded, so it was not made. Try again in a minute.",
} as const;

/** The Kairos report's page. */
export const KAIROS_REPORT_WORDS = {
  crumb: "Kairos",
  title: (programme: string) => `${programme}: the Kairos report`,
  lede: (term: string) =>
    `${term ? `${term}. ` : ""}The questionnaire’s fourteen measures, in totals, never a name. Every figure has its n beside it.`,
  selfReported: "Self-reported",
  howHeading: "How these are counted",
  see: "See the report",
  missingTitle: "There is no programme here",
  missing: "It may have been removed, or the link may be wrong. The programmes are listed on the Kairos page.",
} as const;
