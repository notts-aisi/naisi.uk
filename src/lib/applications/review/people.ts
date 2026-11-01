import { STATUS_LABELS, subjectLabel, type AffiliationStatus } from "@/lib/firestore/users";
import { staffNameOf, staffNameWords } from "@/lib/names/staffName";
import type { AboutYou } from "../model";

/**
 * How a person is named and described on the review screens.
 *
 * Names are shown: a reviewer sees who they are reading. Everybody who reads
 * an application is an admin or an SU-recognised committee member, so a row
 * names the person the way a staff screen does: their full name, with the
 * name they go by after it. What is derived here besides is the short
 * description under a name, from the same About you answers the person gave
 * when they joined.
 *
 * Pure, with no server import.
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
];

/** What a row calls somebody whose name is missing. Never an address. */
export const UNNAMED_APPLICANT = "Applicant";

/** What a committee member whose document is gone is called. */
export const UNNAMED_STAFF = "Someone";

/** The first word of a name: "Amara" from "Amara Okafor". */
export function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** What to call an applicant in a sentence: their preferred name, or their first name. */
export function applicantFirstName(about: Pick<AboutYou, "preferredName">, displayName: string): string {
  return about.preferredName.trim() || firstWord(displayName) || UNNAMED_APPLICANT;
}

/**
 * The name a review screen shows: "Priya Shah (Pri)". The full name they gave
 * on the form, else the name on the account they applied from (`displayName`,
 * what these screens showed before the form asked for a full name), with the
 * name they go by after it when it adds something (`staffNameOf`).
 */
export function applicantName(about: Pick<AboutYou, "fullName" | "preferredName">, displayName: string): string {
  const full = about.fullName.trim() || displayName.trim();
  const goBy = about.preferredName.trim();
  return staffNameWords(staffNameOf({ full: full || null, goBy: goBy || null }, UNNAMED_APPLICANT));
}

/** A status the join questions offer. An applicant's stored answer is any string. */
function isStatus(value: string): value is AffiliationStatus {
  return Object.hasOwn(STATUS_LABELS, value);
}

/** "Undergraduate", or what they wrote when they picked Other. */
export function statusLabel(about: Pick<AboutYou, "status" | "statusOther">): string {
  if (about.status === "other") return about.statusOther.trim() || STATUS_LABELS.other;
  return isStatus(about.status) ? STATUS_LABELS[about.status] : "";
}

/** The label the degree answer wears: "Degree", or "Area of work" for staff. */
export function degreeLabel(about: Pick<AboutYou, "status">): string {
  const label = subjectLabel(isStatus(about.status) ? about.status : undefined);
  return label === "Degree name" ? "Degree" : label;
}

/** "July 2028" from "2028-07", or null when they did not say. */
export function graduationLabel(expectedGraduation: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(expectedGraduation);
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : null;
}

/**
 * Where somebody is in their studies, in two or three words.
 *
 * The join questions ask when a person expects to graduate and not which year
 * they are in, so an undergraduate reads "Graduating 2028" here.
 */
export function stageLabel(
  about: Pick<AboutYou, "status" | "statusOther" | "expectedGraduation">,
): string {
  if (about.status === "masters" || about.status === "phd") return "Postgrad";
  if (about.status === "postdoc") return STATUS_LABELS.postdoc;
  if (about.status === "employee") return "Staff";
  const year = /^(\d{4})-\d{2}$/.exec(about.expectedGraduation)?.[1];
  if (about.status === "undergraduate" || about.status === "foundation") {
    if (year) return `Graduating ${year}`;
    return STATUS_LABELS[about.status];
  }
  return statusLabel(about);
}

/** "BA Philosophy · Graduating 2028": the line under a name. */
export function applicantDetail(
  about: Pick<AboutYou, "subject" | "status" | "statusOther" | "expectedGraduation">,
): string {
  return [about.subject.trim(), stageLabel(about)].filter(Boolean).join(" · ");
}

/** "Mon, Tue and Thu": a list as a sentence reads it. */
export function listInWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
