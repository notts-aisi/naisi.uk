import { cohortTermLabel, type RunCohort } from "../cohortLabel";
import type { WeekPlanEntry } from "../weekPlan";
import { issuedOnWords } from "./dates";
import { CERTIFICATE_LIMITS, DID_WORDS, type CertificateKind, type CertificateSnapshot } from "./model";
import { MISSING_NAME, MISSING_PROGRAMME, MISSING_TERM, MISSING_WEEKS, weeksWords } from "./words";

/**
 * WHAT A CERTIFICATE SAYS, WRITTEN ONCE, when it is issued. Every word comes
 * from a record, and the snapshot keeps them, so the certificate reads the
 * same after the run, the course or the account are gone:
 *
 *  - the NAME: the account's whole name (`displayName`), or the name the
 *    person goes by when that is all there is. Never a placeholder: an
 *    account with no name cannot have a certificate written for it;
 *  - what they DID: "finished the" or "facilitated a group on the";
 *  - the PROGRAMME: its whole name on the form ("AGI Strategy Fellowship");
 *  - the TERM: the run's term ("Autumn 2026", `cohortTermLabel`), or, for a
 *    run with no term set, the name of the form whose programme names it,
 *    which is that term's name;
 *  - how many WEEKS it ran: the run's teaching weeks, breaks left out;
 *  - the course's CREDIT line, on both kinds, as the boards draw them
 *    ("based on the BlueDot Impact curriculum", set on the course), or none
 *    when the course has none;
 *  - the ISSUE DAY, in London.
 *
 * A certificate that cannot be written whole is not written at all: the
 * answer says which word is missing, and the press that asked sends nothing.
 *
 * Pure: the caller reads the records and hands them in.
 */

export type SnapshotInput = {
  kind: CertificateKind;
  /** The owner's account, as stored. */
  account: Record<string, unknown>;
  /** The programme on the form. */
  programme: { name: string };
  /** The run the programme names. */
  run: { cohort: RunCohort | null; weekPlan: readonly WeekPlanEntry[] };
  /** The form's own name, for a run with no term set. */
  formLabel: string;
  /** The course's credit line, or "". */
  credit: string;
  now: Date;
};

export type SnapshotOutcome = { ok: true; snapshot: CertificateSnapshot } | { ok: false; reason: string };

/** The account's whole name, then the name it goes by, or "" when it has neither. */
export function wholeNameOf(account: Record<string, unknown>): string {
  const profile = (account.profile as Record<string, unknown> | undefined) ?? {};
  const display = typeof account.displayName === "string" ? account.displayName.trim() : "";
  const preferred = typeof profile.preferredName === "string" ? profile.preferredName.trim() : "";
  return display || preferred;
}

/** The name the person goes by, first word only, for the email's greeting: "Amara", or "". */
export function greetingNameOf(account: Record<string, unknown>): string {
  const profile = (account.profile as Record<string, unknown> | undefined) ?? {};
  const preferred = typeof profile.preferredName === "string" ? profile.preferredName.trim() : "";
  const display = typeof account.displayName === "string" ? account.displayName.trim() : "";
  return (preferred || display).split(/\s+/)[0] ?? "";
}

/** How many teaching weeks a run's plan holds. */
export function teachingWeeks(weekPlan: readonly WeekPlanEntry[]): number {
  return weekPlan.filter((entry) => entry.kind === "week").length;
}

/** A word within its limit, or null. */
const within = (value: string, limit: number): string | null => {
  const trimmed = value.trim();
  return trimmed && trimmed.length <= limit ? trimmed : null;
};

export function writeSnapshot(input: SnapshotInput): SnapshotOutcome {
  const name = within(wholeNameOf(input.account), CERTIFICATE_LIMITS.name);
  if (!name) return { ok: false, reason: MISSING_NAME };
  const programme = within(input.programme.name, CERTIFICATE_LIMITS.programme);
  if (!programme) return { ok: false, reason: MISSING_PROGRAMME };
  const term = within(cohortTermLabel(input.run) || input.formLabel, CERTIFICATE_LIMITS.term);
  if (!term) return { ok: false, reason: MISSING_TERM };
  const weeks = teachingWeeks(input.run.weekPlan);
  if (weeks < 1) return { ok: false, reason: MISSING_WEEKS };
  const credit = within(input.credit, CERTIFICATE_LIMITS.credit);
  return {
    ok: true,
    snapshot: {
      name,
      did: DID_WORDS[input.kind],
      programme,
      term,
      weeks: weeksWords(weeks),
      credit,
      issuedOn: issuedOnWords(input.now),
    },
  };
}
