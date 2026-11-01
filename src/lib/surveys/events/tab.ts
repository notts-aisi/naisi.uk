import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import type { EventDoc } from "@/lib/firestore/events";
import type { EventAudience, EventSurveyDoc, SurveyPress } from "@/lib/firestore/surveys";
import { closedOn, surveyState } from "../repo";
import { clockWords, dayWords, peopleWords } from "../words";
import { firstPressOf, remindAtAfter, timesOf, whoWords } from "./after";

/**
 * WHAT AN EVENT'S "SURVEY AFTER" TAB SAYS TO EVERYBODY IN THE EVENTS AREA
 * (ev-manage): that a survey went, when and to how many, what is set to
 * happen, and who to ask for its results. Never a result, a count of answers
 * or a name of anybody who answered: an event's organiser does not see its
 * survey's results, and admins share a summary (Q42). Admins see the results
 * themselves on the same tab, made by the admins' own readers.
 *
 * A survey an admin made from Surveys says who emailed it, as it always has.
 * One its event set up says what is set: "Goes by itself on
 * Fri 20 Nov at 10am to everyone who came", then "Sent by itself, Fri 20 Nov,
 * 10am, to the 21 who came", from its own record of each press, which
 * counts the people a press emailed and never who answered.
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
  /** "After VR games night: Zach emailed it to 14 people on Mon 2 Nov at 10am.", or what is set to happen. */
  went: string;
  /** The reminder, the question about not coming, and the closing day, each a sentence; may be empty. */
  more: string[];
  /** "Results go to admins. Ask Zach or Lloyd for the summary." */
  results: string;
};

export const NO_SURVEY_LINE = "No survey has gone out after this event.";

/** "the 21 who came", "the 1 person with a place", "the 4 who had a place and weren’t checked in". */
export function reachedWords(n: number, kind: EventAudience["kind"]): string {
  const missed = n === 1 ? "who had a place and wasn’t checked in" : "who had a place and weren’t checked in";
  const who = kind === "event-came" ? "who came" : kind === "event-signups" ? "with a place" : missed;
  return `the ${n === 1 ? "1 person" : n} ${who}`;
}

/** "Fri 20 Nov, 10am". */
const at = (when: Date) => `${dayWords(when)}, ${clockWords(when)}`;

/** Why the job left its email undone, as the tab says it. */
const SKIPPED: Record<string, string> = {
  stale: "sending by itself wasn’t running here then",
  nobody: "there was nobody to send it to",
  cancelled: "the event was cancelled",
  gone: "the event is no longer on the site",
};

/** Who sent a press: by itself, or a person's first name. */
async function byWords(db: Firestore, press: SurveyPress): Promise<string> {
  if (press.byJob) return "by itself";
  const who = await firstNameOf(db, press.byUid);
  return who ? `by ${who}` : "by hand";
}

/** What the tab says of a survey its event set up. */
async function autoLines(
  db: Firestore,
  survey: EventSurveyDoc,
  facts: { event: EventDoc | null; missed: EventSurveyDoc | null; jobOn: boolean },
  now: Date,
): Promise<{ went: string; more: string[] }> {
  const auto = survey.auto;
  if (!auto) return { went: NO_SURVEY_LINE, more: [] };
  const who = survey.audience.kind === "event-signups" ? "signups" : "came";
  const first = firstPressOf(survey);
  const more: string[] = [];
  let went: string;
  if (first?.at) {
    went = `Sent ${await byWords(db, first)}, ${at(first.at)}, to ${reachedWords(first.count, survey.audience.kind)}.`;
    const missedFirst = facts.missed ? firstPressOf(facts.missed) : null;
    if (missedFirst?.at) {
      more.push(`The question about not coming went to ${reachedWords(missedFirst.count, "event-missed")}.`);
    }
    const reminder = survey.presses.find((press) => press.kind === "remind" && press.byJob);
    if (reminder?.at) {
      more.push(`Reminded ${peopleWords(reminder.count)} who hadn’t answered, ${at(reminder.at)}.`);
    } else if (auto.reminder && !auto.remindedAt && !auto.skipped.remind && surveyState(survey, now) === "open") {
      const remindAt = remindAtAfter(first.at);
      more.push(
        facts.jobOn
          ? `One reminder goes on ${dayWords(remindAt)} at ${clockWords(remindAt)} to anybody who hasn’t answered.`
          : `One reminder is set for ${dayWords(remindAt)} at ${clockWords(remindAt)}, once sending by itself is switched on here.`,
      );
    }
  } else if (facts.event?.status === "cancelled") {
    went = "It won’t go: the event was cancelled.";
  } else if (auto.skipped.send && auto.when !== "hand") {
    const why = SKIPPED[auto.skipped.send] ?? "it was refused";
    went = `It didn’t go by itself: ${why}.`;
  } else if (auto.when === "hand") {
    went = `It goes to ${whoWords(who)} when its organisers or an admin send it from here.`;
  } else {
    const sendAt = facts.event ? timesOf(facts.event, auto).sendAt : null;
    went = !sendAt
      ? `It goes by itself to ${whoWords(who)} after the event.`
      : facts.jobOn
        ? `It goes by itself on ${dayWords(sendAt)} at ${clockWords(sendAt)} to ${whoWords(who)}.`
        : `It’s set to go on ${dayWords(sendAt)} at ${clockWords(sendAt)} to ${whoWords(who)}, once sending by itself is switched on here. Until then, its organisers or an admin send it from here.`;
  }
  const ends = closedOn(survey);
  if (surveyState(survey, now) === "closed" && ends) more.push(`It closed on ${dayWords(ends)}.`);
  return { went, more };
}

/** What the tab says of an event's survey, or of none. */
export async function surveyAfterLines(
  db: Firestore,
  survey: EventSurveyDoc | null,
  now: Date,
  facts: { event: EventDoc | null; missed: EventSurveyDoc | null; jobOn: boolean } = { event: null, missed: null, jobOn: false },
): Promise<SurveyAfterLines> {
  const admins = await adminNames(db);
  const results = admins ? `Results go to admins. Ask ${admins} for the summary.` : "Results go to admins.";
  if (survey?.auto) return { ...(await autoLines(db, survey, facts, now)), results };
  if (!survey || !survey.firstSentAt) return { went: NO_SURVEY_LINE, more: [], results };
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
  return { went: parts.join(" "), more: [], results };
}
