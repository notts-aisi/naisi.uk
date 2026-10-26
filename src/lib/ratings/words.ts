import { FACILITATOR_QUESTIONS, MENTOR_QUESTIONS, type RatingAnswers, type RatingQuestion } from "./model";
import type { RateRefusal } from "./rules";

/**
 * THE RATINGS PAGES IN WORDS. No board draws them, so every sentence here is
 * listed in the build notes for the boards' designers to confirm. The
 * questions themselves are the questionnaire's (`./model.ts`).
 *
 * Pure.
 */

export const RATINGS_WORDS = {
  title: (groupName: string) => `Rate ${groupName}`,
  runTitle: "Ratings",
  intro:
    "About two minutes a person, once the last session is over. Only the programme’s lead and NAISI’s admins see who gave each rating. Unless the person rated has said no, their ratings go to Kairos, one of our funders, with their name and never yours. Nobody is ever shown what was said about them.",
  readerIntro:
    "What each group’s facilitators said about their fellows, and your own ratings of the facilitators. Unless the person rated has said no, their ratings go to Kairos, one of our funders, with their name and never the rater’s. Nobody is ever shown what was said about them.",
  notYet: (groupName: string, day: string | null) =>
    day
      ? `You can rate ${groupName} once the last session is over, on ${day}.`
      : `You can rate ${groupName} once its last session is over.`,
  runNotYet: (day: string | null) =>
    day ? `Ratings open once the last session is over, on ${day}.` : "Ratings open once the last session is over.",
  came: (came: number, of: number) => `Came to ${came} of ${of} ${of === 1 ? "session" : "sessions"}, from the register`,
  facilitator: "Facilitator",
  team: (name: string) => `Team: ${name}`,
  mentorHeading: "Their research",
  save: "Save",
  saving: "Saving…",
  saved: "Saved.",
  cleared: "Cleared.",
  failed: "That didn’t save. Check your connection and try again.",
  nobody: "There’s nobody here for you to rate.",
  others: "Ratings by others",
  noOthers: "Nobody else has rated them yet.",
  cannot: {
    self: "Nobody rates themselves.",
    "co-facilitator": "Co-facilitators don’t rate each other: the programme’s lead or an admin does.",
    "not-yours": "Only their group’s facilitators, the programme’s lead and admins rate them.",
  } satisfies Record<RateRefusal, string>,
  backTo: (groupName: string) => groupName,
  link: "Rate your group",
  linkLine: "About two minutes a person.",
} as const;

/** The route's refusals, each a sentence a person can act on. */
export const RATING_REFUSAL = {
  notSignedIn: "Sign in to rate your group.",
  body: "That rating didn’t arrive in a shape this page understands. Reload the page and try again.",
  forbidden: "You can rate the fellows of a group you facilitate.",
  notYet: (day: string | null) =>
    day ? `Ratings open once the last session is over, on ${day}.` : "Ratings open once the last session is over.",
  notInGroup: "That person isn’t taking part in this group, so there’s nothing to rate.",
  self: "Nobody rates themselves. The programme’s lead or an admin rates a facilitator.",
  coFacilitator: "You facilitate this group together, so you don’t rate each other. The programme’s lead or an admin does.",
  notYours: "You can rate the fellows of a group you facilitate.",
} as const;

/** One refusal reason, as the route says it. */
export function refusalWords(reason: RateRefusal): string {
  if (reason === "self") return RATING_REFUSAL.self;
  if (reason === "co-facilitator") return RATING_REFUSAL.coFacilitator;
  return RATING_REFUSAL.notYours;
}

const ALL: readonly RatingQuestion[] = [...FACILITATOR_QUESTIONS, ...MENTOR_QUESTIONS];

/** "engagement 4, grasp 5, drive 3, next step Strong yes": a rating in a line, for its readers. */
export function ratingLine(answers: RatingAnswers): string {
  const given = new Map<string, unknown>(Object.entries(answers));
  const parts: string[] = [];
  for (const question of ALL) {
    const value = given.get(question.key);
    if (value === undefined) continue;
    if (question.kind === "choice") {
      const label = question.options.find((option) => option.id === value)?.label ?? String(value);
      parts.push(`${question.short} ${label}`);
    } else {
      parts.push(`${question.short} ${String(value)}`);
    }
  }
  return parts.join(", ");
}
