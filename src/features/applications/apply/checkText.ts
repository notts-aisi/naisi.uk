import { STATUSES_WITH_GRADUATION, STATUS_LABELS } from "@/lib/firestore/users";
import type { AboutYou, AnswerValue, ApplicationContent, QuestionSetDoc } from "@/lib/applications/model";
import { isAnswered } from "@/lib/applications/validate";
import { own } from "@/lib/applications/applicant/keys";
import { POLICIES, currentPolicy } from "@/lib/legal/policies";

/**
 * The short lines the last step shows for each section, written from what the
 * person entered: "Amara · BA Philosophy", "Undergraduate, graduating July
 * 2028", and one line of their own words under each set of questions. And
 * the one line at the foot that is not about the person: sending is agreeing
 * to the privacy policy, as it was last updated.
 *
 * Pure, so the lines are tested without a browser.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * The short month names, as the site's own date formatter writes them
 * ("Sun 18 Oct", "Tue 15 Sept"). Kept as a list rather than asked of the
 * runtime, because this step is drawn on the server and again in the
 * browser, and the two have to write the same word. A test holds the list to
 * the formatter.
 */
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * "7 Oct" from a policy's own date, which the policy list writes out in full
 * ("7 October 2026"). Null for anything not written that way: a date nobody
 * can read is left out, never guessed.
 */
export function policyDateLabel(lastUpdated: string): string | null {
  const match = /^(\d{1,2}) ([A-Za-z]+) \d{4}$/.exec(lastUpdated.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS.findIndex((name) => name.toLowerCase() === match[2].toLowerCase());
  if (month === -1 || day < 1 || day > 31) return null;
  return `${day} ${SHORT_MONTHS[month]}`;
}

/**
 * "By sending, you agree to our privacy policy, updated 7 Oct.", in the three
 * parts the step draws it from, so the middle one can be a link.
 *
 * THE DATE IS THE POLICY'S OWN. It is read from the list the privacy page
 * itself is drawn from (`currentPolicy("privacy")` in
 * `src/lib/legal/policies.ts`) and is typed nowhere, so the day a new version
 * is added there this line says so. Somebody who already has an account is
 * asked to accept a new policy only inside the member area, which an
 * applicant may never open before they apply: this line is where they are
 * told.
 */
export function privacyAgreement(): { before: string; link: string; href: string; after: string } {
  const updated = policyDateLabel(currentPolicy("privacy").lastUpdated);
  return {
    before: "By sending, you agree to our ",
    link: "privacy policy",
    href: POLICIES.privacy.href,
    after: updated ? `, updated ${updated}.` : ".",
  };
}

/** "July 2028" from "2028-07", or "" when it is not a month. */
export function monthYearLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : "";
}

/** The months somebody could expect to graduate in, newest last: this year and the eight after it. */
export function graduationOptions(currentYear: number, keep: string): { year: number; months: { value: string; label: string }[] }[] {
  const years: number[] = [];
  for (let year = currentYear; year <= currentYear + 8; year += 1) years.push(year);
  // A date already on the application stays choosable even when it has passed.
  const kept = /^(\d{4})-\d{2}$/.exec(keep);
  if (kept && !years.includes(Number(kept[1]))) years.unshift(Number(kept[1]));
  return years.map((year) => ({
    year,
    months: MONTHS.map((month, index) => ({
      value: `${year}-${String(index + 1).padStart(2, "0")}`,
      label: `${month} ${year}`,
    })),
  }));
}

function statusLabel(about: AboutYou): string {
  if (about.status === "other") return about.statusOther.trim() || STATUS_LABELS.other;
  return own(STATUS_LABELS as Record<string, string>, about.status) ?? "";
}

/** "Amara · BA Philosophy". */
export function aboutHeadline(about: AboutYou): string {
  return [about.preferredName.trim(), about.subject.trim()].filter(Boolean).join(" · ");
}

/** "Undergraduate, graduating July 2028". */
export function aboutDetail(about: AboutYou): string {
  const status = statusLabel(about);
  const graduates = (STATUSES_WITH_GRADUATION as readonly string[]).includes(about.status);
  const graduation = graduates ? monthYearLabel(about.expectedGraduation) : "";
  if (status && graduation) return `${status}, graduating ${graduation}`;
  return status || (graduation ? `Graduating ${graduation}` : "");
}

/** One answer as words, whatever kind of question it answered. */
function answerWords(value: AnswerValue | undefined, options: readonly string[]): string {
  if (!isAnswered(value)) return "";
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (typeof value === "number") return options[value] ?? "";
  return (value ?? []).join(", ");
}

/**
 * One line of the person's own answers to a set, in the order they were
 * asked, for the row on the last step. The row clips it to a single line.
 */
export function answersPreview(
  set: QuestionSetDoc,
  content: Pick<ApplicationContent, "answers">,
  optionsOf: (questionId: string) => readonly string[],
): string {
  const given = own(content.answers, set.id) ?? {};
  const parts: string[] = [];
  for (const question of set.questions) {
    const words = answerWords(own(given, question.id), optionsOf(question.id));
    if (!words) continue;
    parts.push(/[.!?…]$/.test(words) ? words : `${words}.`);
  }
  return parts.join(" ");
}
