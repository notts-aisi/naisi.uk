import "server-only";
import { createHash } from "node:crypto";
import type { SurveyDoc, SurveyEmailKind, SurveyTest } from "@/lib/firestore/surveys";
import { surveyQuestionsOf } from "./items";
import {
  REFUSAL,
  SURVEY_FROM_NAME,
  reminderEmailWords,
  surveyEmailWords,
  type SurveyEmailWords,
} from "./words";

/**
 * A SURVEY'S TWO EMAILS, as words, and the test each send waits for.
 *
 * Every value comes from the survey's record (its title, intro, questions,
 * minutes, programme and closing date) and from whoever presses the button,
 * who signs it. The same function writes the email a test sends, the email a
 * send sends and the copy the Send tab shows, so the three cannot disagree.
 *
 * THE TEST LOCK, as Publish's: a send of either email is refused until the
 * person pressing it has sent themselves a test of the same wording
 * (`wordingFingerprint`, signature included), so the email that goes out is
 * one somebody has read in an inbox. A test that reached nobody (held by
 * this copy of the site, or an address on the do-not-email list) is not
 * recorded.
 */

/** This site's own address, with no trailing slash, or "" when it is not set. */
export function siteAddress(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
}

/** The path of a personal link. The secret is the person's alone. */
export function surveyLinkPath(token: string): string {
  return `/survey/${token}`;
}

/** A personal link, whole, or null when the site does not know its own address. */
export function surveyLink(token: string): string | null {
  const base = siteAddress();
  return base ? `${base}${surveyLinkPath(token)}` : null;
}

/** One of the two emails in words, signed by `signer`, or null while the survey has no closing time. */
export function emailWordsFor(
  survey: Pick<SurveyDoc, "title" | "intro" | "items" | "minutes" | "programmeName" | "closesAt">,
  email: SurveyEmailKind,
  signer: string,
): SurveyEmailWords | null {
  if (!survey.closesAt) return null;
  const facts = {
    title: survey.title,
    intro: survey.intro,
    questions: surveyQuestionsOf(survey.items).length,
    minutes: survey.minutes,
    programmeName: survey.programmeName,
    closesAt: survey.closesAt,
    signer,
  };
  return email === "survey" ? surveyEmailWords(facts) : reminderEmailWords(facts);
}

/**
 * One string for an email's wording: 64 hex characters, equal exactly when
 * its subject, sentences, button, signature and sender name are.
 */
export function wordingFingerprint(words: SurveyEmailWords): string {
  const line = JSON.stringify([SURVEY_FROM_NAME, words.subject, words.paragraphs, words.button, words.signOff]);
  return createHash("sha256").update(line, "utf8").digest("hex");
}

export type TestState = "none" | "stale" | "fresh";

/** Where one email stands on its test. Anything but `fresh` holds a send. */
export function testStateOf(test: SurveyTest | null, wording: string): TestState {
  if (!test) return "none";
  return test.wording === wording ? "fresh" : "stale";
}

/** The sentence that holds a send for want of a test, or null. */
export function testRefusal(state: TestState): string | null {
  if (state === "fresh") return null;
  return state === "stale" ? REFUSAL.staleTest : REFUSAL.noTest;
}
