import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import type { EventSurveyDoc } from "@/lib/firestore/surveys";
import { closedOn, surveyState } from "../repo";
import { clockWords, dayWords, peopleWords } from "../words";

/**
 * WHAT AN EVENT'S "SURVEY AFTER" TAB SAYS TO EVERYBODY IN THE EVENTS AREA
 * (ev-manage): that a survey went and when, and who to ask for its results.
 * Never a result, a count of answers or a name of anybody who answered: an
 * event's organiser does not see its survey's results, and admins share a
 * summary (Q42). Admins see the results themselves on the same tab, made by
 * the admins' own readers.
 */

/** "Zach", the first name of whoever pressed, or "" when the press recorded nobody or the account has gone. */
async function firstNameOf(db: Firestore, uid: string | undefined): Promise<string> {
  if (!uid || uid.includes("/")) return "";
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? firstNameOfUser((snap.data() ?? {}) as Record<string, unknown>) : "";
}

/** "Zach or Lloyd": the admins' first names, to ask for the summary. One equality on `role`. */
async function adminNames(db: Firestore): Promise<string> {
  const snap = await db.collection("users").where("role", "==", "admin").get();
  const names = [...new Set(snap.docs.map((doc) => firstNameOfUser((doc.data() ?? {}) as Record<string, unknown>)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "en"),
  );
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

export type SurveyAfterLines = {
  /** "After VR games night: Zach emailed it to 14 people on Mon 2 Nov at 10am." */
  went: string;
  /** "Results go to admins. Ask Zach or Lloyd for the summary." */
  results: string;
};

export const NO_SURVEY_LINE = "No survey has gone out after this event.";

/** What the tab says of an event's survey, or of none. */
export async function surveyAfterLines(db: Firestore, survey: EventSurveyDoc | null, now: Date): Promise<SurveyAfterLines> {
  const admins = await adminNames(db);
  const results = admins ? `Results go to admins. Ask ${admins} for the summary.` : "Results go to admins.";
  if (!survey || !survey.firstSentAt) return { went: NO_SURVEY_LINE, results };
  const first = survey.presses.find((press) => press.kind === "first");
  const parts: string[] = [];
  if (first?.at) {
    const who = await firstNameOf(db, first.byUid);
    const when = `on ${dayWords(first.at)} at ${clockWords(first.at)}`;
    parts.push(who ? `${survey.name}: ${who} emailed it to ${peopleWords(first.count)} ${when}.` : `${survey.name}: emailed to ${peopleWords(first.count)} ${when}.`);
  } else {
    parts.push(`${survey.name}: its QR code has taken answers since ${dayWords(survey.firstSentAt)} at ${clockWords(survey.firstSentAt)}.`);
  }
  const ends = closedOn(survey);
  if (surveyState(survey, now) === "closed" && ends) parts.push(`It closed on ${dayWords(ends)}.`);
  return { went: parts.join(" "), results };
}
