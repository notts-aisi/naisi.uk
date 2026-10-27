import { own } from "../keys";
import type { ApplicationRow } from "../review/types";
import type { PangramCheck, StoredClaudeRead } from "./types";

/**
 * WHAT LEAVES THE SITE WHEN AN ADMIN ASKS CLAUDE ABOUT A WHOLE PROGRAMME.
 *
 * A comparison is made from the reads Claude has already written of each
 * application (`run.ts`, one per application per programme) and the list's
 * own numbers, never from the applications themselves: everything in it has
 * already been through `input.ts`, so the fences that hold there hold here.
 *
 *  - APPLICANTS ARE NUMBERED. "Applicant 1", "Applicant 2", in account-id
 *    order so the numbers do not move when the list is sorted. Names are put
 *    back only on the way to the admin's screen (`namedFor`).
 *  - REVIEWERS ARE LETTERED ONCE FOR THE PROGRAMME. Each stored read letters
 *    its own reviewers, so "Reviewer A" in one read may be somebody else in
 *    the next. Here every read's letters are turned back into accounts and
 *    lettered again across the programme, so a letter means one person
 *    throughout.
 *  - A QUESTION AN ADMIN TYPES IS SCRUBBED. A name in it is swapped for the
 *    label Claude knows that person by before it is sent (`scrubbed`).
 *
 * Pure, so a test can read every line that would go.
 */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export type ProgrammeRow = Pick<
  ApplicationRow,
  "uid" | "name" | "choice" | "firstChoiceName" | "score" | "wantsToFacilitate" | "standing" | "withdrawn" | "byInvitation"
>;

export type StoredFor = { read: StoredClaudeRead | null; pangram: PangramCheck | null };

export type ProgrammeInput = {
  message: string;
  /** "Applicant 3" to the account it stands for. */
  applicants: Record<string, string>;
  /** "Reviewer B" to the account it stands for, across the programme. */
  reviewers: Record<string, string>;
  /** How many of the applications compared have a read, and how many there are. */
  read: number;
  total: number;
};

const STANDING_WORDS: Record<string, string> = {
  "to-review": "not decided yet",
  accepted: "accepted",
  pooled: "pooled",
  declined: "declined",
};

/** The applications a comparison is about: everybody still in the term who ranked the programme. */
export function comparedRows<T extends Pick<ApplicationRow, "withdrawn" | "byInvitation">>(rows: readonly T[]): T[] {
  return rows.filter((row) => !row.withdrawn && !row.byInvitation);
}

export function programmeInputFrom(input: {
  programmeName: string;
  places: number | null;
  rows: readonly ProgrammeRow[];
  stored: Readonly<Record<string, StoredFor>>;
}): ProgrammeInput {
  const rows = comparedRows(input.rows)
    .slice()
    .sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));

  const applicants: Record<string, string> = {};
  const labelOfUid = new Map<string, string>();
  rows.forEach((row, i) => {
    const label = `Applicant ${i + 1}`;
    applicants[label] = row.uid;
    labelOfUid.set(row.uid, label);
  });

  // Every reviewer any read names, lettered once across the programme.
  const reviewerUids = new Set<string>();
  for (const row of rows) {
    const read = own(input.stored, row.uid)?.read;
    for (const uid of Object.values(read?.reviewerUids ?? {})) if (uid) reviewerUids.add(uid);
  }
  const reviewers: Record<string, string> = {};
  const globalOf = new Map<string, string>();
  [...reviewerUids].sort().forEach((uid, i) => {
    const label = `Reviewer ${LETTERS[i] ?? String(i + 1)}`;
    reviewers[label] = uid;
    globalOf.set(uid, label);
  });

  /** One read's own letters, turned into the programme's. */
  const relabel = (text: string, local: Readonly<Record<string, string | null>>): string =>
    text.replace(/\bReviewer ([A-Z])\b/g, (whole) => {
      const uid = own(local, whole);
      return (uid && globalOf.get(uid)) || "a reviewer";
    });

  const lines: string[] = [`# ${input.programmeName}`];
  if (input.places !== null) lines.push(`Places: ${input.places}.`);
  lines.push(`Applications compared: ${rows.length}.`, "");

  let read = 0;
  for (const row of rows) {
    const label = labelOfUid.get(row.uid)!;
    const stored = own(input.stored, row.uid);
    lines.push(`## ${label}`);
    lines.push(
      row.choice === 1
        ? "Ranked this programme 1st."
        : `Ranked this programme ${row.choice}${row.choice === 2 ? "nd" : row.choice === 3 ? "rd" : "th"}${row.firstChoiceName ? `; 1st choice ${row.firstChoiceName}` : ""}.`,
    );
    lines.push(`Decision so far: ${own(STANDING_WORDS, row.standing) ?? row.standing}.`);
    lines.push(`Committee score: ${row.score ?? "not scored"}.`);
    lines.push(`Wants to facilitate: ${row.wantsToFacilitate ? "yes" : "no"}.`);
    const r = stored?.read ?? null;
    if (!r) {
      lines.push("Not read by Claude yet: say so if it matters, and do not guess.", "");
    } else {
      read += 1;
      const local = r.reviewerUids ?? {};
      lines.push(`Claude's lean: ${r.lean}. ${relabel(r.leanReason, local)}`);
      lines.push(`Summary: ${relabel(r.summary, local)}`);
      if (r.strengths.length) lines.push(`Strengths: ${r.strengths.map((s) => relabel(s, local)).join(" | ")}`);
      if (r.concerns.length) lines.push(`Concerns: ${r.concerns.map((s) => relabel(s, local)).join(" | ")}`);
      if (r.reviewers) lines.push(`Reviewers: ${relabel(r.reviewers, local)}`);
      if (r.fit) lines.push(`Fit: ${relabel(r.fit, local)}`);
      if (r.thinAnswers.length) lines.push(`Thin answers: ${r.thinAnswers.map((s) => relabel(s, local)).join(" | ")}`);
    }
    const pangram = stored?.pangram ?? null;
    if (pangram) {
      const flagged = pangram.answers.filter((answer) => answer.worthALook).length;
      lines.push(
        pangram.answers.length === 0
          ? "Pangram: no answer long enough to check."
          : `Pangram: ${flagged} of ${pangram.answers.length} longer answers worth a look.`,
      );
    }
    lines.push("");
  }

  return { message: lines.join("\n"), applicants, reviewers, read, total: rows.length };
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A question with every name in it swapped for the label Claude knows that
 * person by. A full name first, then a first name only where it is one
 * person's on this list; a first name two people share becomes both labels.
 */
export function scrubbed(
  question: string,
  people: readonly { label: string; name: string }[],
): string {
  let text = question;
  const byFull = [...people].sort((a, b) => b.name.length - a.name.length);
  for (const { label, name } of byFull) {
    if (name.trim().split(/\s+/).length < 2) continue;
    text = text.replace(new RegExp(`\\b${escape(name.trim())}\\b`, "gi"), label);
  }
  const byFirst = new Map<string, string[]>();
  for (const { label, name } of people) {
    const first = name.trim().split(/\s+/)[0];
    if (!first || first.length < 2) continue;
    const key = first.toLowerCase();
    byFirst.set(key, [...(byFirst.get(key) ?? []), label]);
  }
  for (const [first, labels] of byFirst) {
    const replacement = labels.length === 1 ? labels[0] : `(one of ${labels.join(" or ")})`;
    text = text.replace(new RegExp(`\\b${escape(first)}\\b`, "gi"), replacement);
  }
  return text;
}

/** Names back where Claude wrote "Applicant 3" or "Reviewer B", for the admin's screen. */
export function namedFor(
  text: string,
  applicantNames: Readonly<Record<string, string>>,
  reviewerNames: Readonly<Record<string, string>>,
): string {
  return text
    .replace(/\bApplicant (\d+)\b/g, (whole) => own(applicantNames, whole) ?? whole)
    .replace(/\bReviewer ([A-Z])\b/g, (whole) => own(reviewerNames, whole) ?? whole);
}
