import { formatSiteDate } from "@/lib/datetime/siteTime";
import { subjectLabel, type AffiliationStatus, type StudyChange } from "@/lib/firestore/users";

/**
 * THE WORDS FOR A MEMBER'S OWN CHANGES TO THEIR DEGREE AND GRADUATION, as the
 * admin's page for one person says them.
 *
 * A member can correct both on their own profile, and each change keeps what
 * the answer was (`StudyChange` in src/lib/firestore/users.ts). This turns
 * those entries into one sentence and a list, newest first, and into nothing
 * at all for somebody who has changed neither: no entry, nothing shown.
 *
 * Plain functions with no markup, so `npm test` can read what the page says
 * for one change and for several (tests/profile-study-changes.test.mjs).
 */

export type StudyChangeRow = {
  /** The entry's key, for the list. */
  id: string;
  /** "7 Oct 2026", in London time. Empty when the entry holds no time. */
  when: string;
  /** The same instant for a `<time>` element, or null when there is none. */
  dateTime: string | null;
  /** What each field that changed said before, the degree first. */
  facts: { label: string; value: string }[];
};

export type StudyChangeWords = {
  /** Who changed what on their own profile, and how many times. */
  lead: string;
  /** One row per change, newest first. */
  rows: StudyChangeRow[];
};

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
];

/**
 * "June 2027" from the stored "2027-06". A month and a year and no instant,
 * so no time zone is involved. Anything in another shape is shown as stored:
 * this is a record of what the field said, not a judgement of it.
 */
export function graduationWords(stored: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(stored);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${match[1]}` : stored;
}

/** The degree answer as the profile card labels it, in the middle of a sentence. */
function degreeWord(status: AffiliationStatus | undefined): string {
  const label = subjectLabel(status);
  return label === "Degree name" ? "degree" : label.toLowerCase();
}

/**
 * The sentence and the rows for one person, or null when there is nothing to
 * say. `changes` is the list as `normalizeUser` gives it, newest first.
 */
export function studyChangeWords(input: {
  changes: readonly StudyChange[] | undefined;
  /** What the page calls the person. */
  firstName: string;
  /** Their stored status, which decides what the degree field is called. */
  status: AffiliationStatus | undefined;
}): StudyChangeWords | null {
  const degreeLabel = subjectLabel(input.status);
  const rows: StudyChangeRow[] = [];
  let degreeChanged = false;
  let graduationChanged = false;

  for (const change of input.changes ?? []) {
    const facts: StudyChangeRow["facts"] = [];
    if (change.subject !== undefined) {
      degreeChanged = true;
      // An answer of nothing but spaces is still what the field held.
      facts.push({ label: `${degreeLabel} was`, value: change.subject.trim() || "(blank)" });
    }
    if (change.expectedGraduation !== undefined) {
      graduationChanged = true;
      facts.push({
        label: "Expected graduation was",
        value: graduationWords(change.expectedGraduation),
      });
    }
    // An entry that names neither field says nothing an admin can read.
    if (facts.length === 0) continue;
    rows.push({
      id: change.id,
      when: change.at
        ? formatSiteDate(change.at, { day: "numeric", month: "short", year: "numeric" })
        : "",
      dateTime: change.at ? change.at.toISOString() : null,
      facts,
    });
  }
  if (rows.length === 0) return null;

  const what = [
    degreeChanged ? degreeWord(input.status) : null,
    graduationChanged ? "expected graduation" : null,
  ]
    .filter(Boolean)
    .join(" or ");
  const lead =
    rows.length === 1
      ? `${input.firstName} has changed their ${what} on their own profile once. This is what it said before.`
      : `${input.firstName} has changed their ${what} on their own profile ${rows.length} times. This is what it said before each change, newest first.`;
  return { lead, rows };
}
