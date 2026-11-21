"use client";

import type { MyRunEntry } from "@/app/api/courses/me/route";
import type { OverviewPayload } from "@/app/api/courses/runs/[runId]/overview/route";
import { useRunOverview } from "@/features/courses/useRunOverview";
import { useRunOverviews } from "@/features/courses/useRunOverviews";
import { byMeetingNext, facilitatedOf, type GroupOnRun, type RunGroups } from "@/lib/courses/homeGroups";

/** A run Home reads, with its overview. */
export type ReadRun = { entry: MyRunEntry; data: OverviewPayload };

export type FacilitatedRuns = {
  /** The run Home is about: the one whose group meets next, else the first that answered, else `first`. */
  entry: MyRunEntry;
  /** That run's overview, or null until every run has answered or given up. */
  data: OverviewPayload | null;
  /** Set when every run has answered or given up and none could be read. */
  error: Error | null;
  /** Every group they facilitate across the runs that answered, the one that meets next first. */
  ordered: GroupOnRun<ReadRun>[];
  /** Every run has answered or given up. */
  settled: boolean;
  /** The runs that did not answer (failed, refused or past their limit), once settled. */
  missing: MyRunEntry[];
};

const NO_OTHERS: readonly MyRunEntry[] = [];
const NO_IDS: readonly string[] = [];

/**
 * THE RUNS A FACILITATOR'S HOME IS ABOUT, read for the facilitator's Home and
 * for the admin's card about the groups an admin facilitates.
 *
 * ONE RUN, NOT `limited`: `first`'s overview, read exactly as Home always
 * read it (`useRunOverview`), and nothing more.
 *
 * SEVERAL RUNS, OR `limited` (the admin's card): every run's overview through
 * `useRunOverviews`, each with its own limit, so a run that hangs counts as
 * failed rather than holding the page. Nothing is answered until every run
 * has answered or given up, so the group shown never changes under the
 * reader.
 */
export function useFacilitatedRuns(
  first: MyRunEntry,
  others: readonly MyRunEntry[] = NO_OTHERS,
  { limited = false }: { limited?: boolean } = {},
): FacilitatedRuns {
  const several = limited || others.length > 0;
  const runs = [first, ...others];
  const one = useRunOverview(several ? "" : first.runId);
  const many = useRunOverviews(several ? runs.map((run) => run.runId) : NO_IDS);

  // Every run that answered, in Home's order, with the groups it gave this person to facilitate.
  const read: RunGroups<ReadRun>[] = [];
  const missing: MyRunEntry[] = [];
  for (const run of several ? runs : [first]) {
    const answered = several ? (many.byRun.get(run.runId) ?? null) : one.data;
    if (answered) read.push({ run: { entry: run, data: answered }, groups: facilitatedOf(answered.groups, run.facilitates) });
    else missing.push(run);
  }
  const settled = several ? many.settled : one.data !== null || one.error !== null;
  const ordered = settled ? byMeetingNext(read) : [];
  const shown = settled ? (ordered[0]?.run ?? read[0]?.run ?? null) : null;
  return {
    entry: shown?.entry ?? first,
    data: shown?.data ?? null,
    error: settled && !shown ? ((several ? null : one.error) ?? new Error("No run answered.")) : null,
    ordered,
    settled,
    missing: settled ? missing : [],
  };
}
