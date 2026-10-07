"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { MyRunEntry } from "@/app/api/courses/me/route";
import { SyncTasksTrigger } from "./useSyncTasks";
import styles from "./MyCoursesSummary.module.css";

/**
 * The programmes list on Home. It is handed the member's runs by Home, which
 * has already asked for them to decide which form of itself to draw, and it
 * renders NOTHING until it has something worth saying: a member with no live
 * programme sees no empty card, because a Home full of "you have none of
 * these" is worse than a short one.
 *
 * Home shows one programme in full (the next session, the reading). That one
 * is `featuredRunId` and is left out of the list here, so the card appears
 * only for somebody on a second live programme, or for an admin, whose Home
 * is about the society and shows no programme in full.
 *
 * "Live" is narrower than the hub's list on purpose. The hub answers "every
 * run I touch, ever"; the dashboard answers "what is running now":
 *
 *   • membership — `enrolled` only. An OFFER is not a course in progress:
 *     there is no group, no week to be on and nowhere to go, so a row here
 *     would be a link to a redirect under a heading that says otherwise. The
 *     hub is where an offer is answered, in a card built to say it properly
 *     (RunCard). This test is explicit rather than left to the role filter
 *     below — an offer happens to carry no role today, and a summary that
 *     stayed honest only by accident is one field away from lying.
 *   • roles — learner or facilitator only. An admissions reviewer's run is a
 *     queue, not a course they are on, and it has no week to report.
 *   • status — no `completed` (history belongs on the hub), no `cancelled`,
 *     no `draft`.
 *   • archived — never. `courseRuns.archived` is the deletion protocol's soft
 *     path, and "drops out of members' live sections" is the promise the
 *     Danger zone makes in so many words; this card is the most live section
 *     there is. It is checked separately from `status` because the two are
 *     orthogonal (a run is archived at whatever point in its lifecycle it has
 *     reached), and a run mid-DESTROY carries the same flag — so this is also
 *     what keeps a cohort being deleted off the dashboard.
 *
 * A member whose only runs are finished — or whose only run is an offer not
 * yet allocated — therefore gets no card, which is the intended answer, not a
 * bug to fix by loosening the filter.
 */

/** Rows past this are one scroll too many on a summary card; the hub has all. */
const MAX_ROWS = 4;

/**
 * The one-line version of RunCard's `statusLine`. Deliberately smaller: no
 * start date (the `/api/courses/me` row doesn't carry one) and no cancelled
 * branch (filtered out above), so this can stay a single readable chain.
 * RunCard owns the full version — change them together if the vocabulary
 * moves.
 */
function weekLine(entry: MyRunEntry): string {
  const week = entry.currentWeek;
  if (!week || week.phase === "before") return "Starts soon";
  if (week.phase === "after") return "Finished";
  // A break slot has no week number — it names itself ("Reading week") and
  // anchors to the week before it.
  if (week.breakLabel) return week.breakLabel;
  const number = week.weekNumber ?? week.anchorWeekNumber;
  if (number < 1) return "Starting this week";
  return entry.totalWeeks > 0
    ? `Week ${number} of ${entry.totalWeeks}`
    : `Week ${number}`;
}

/**
 * P10 — whether this row is worth a mirror POST.
 *
 * The dashboard earns its place as the THIRD trigger point because it is the
 * only one on the path of the member the mirror exists for: someone who lives
 * on My Work and opens `/learn` rarely. If mirroring only happened inside the
 * course, the task would arrive on the board at the exact moment it stopped
 * being useful — they were already reading the week.
 *
 * It is also the trigger that has to justify its cost, because this is the
 * most-opened authed page in the app, and it is the only trigger that can fire
 * more than once per mount. Two conditions, and they are the sync-tasks
 * route's OWN conditions restated client-side so the common answer costs no
 * round trip at all (the session-scoped claim in useSyncTasks is the other
 * half of that, and covers the repeat MOUNTS this filter cannot see):
 *
 *   • an ENROLMENT on the run — `learner`/`facilitator` are the two roles that
 *     come from a `courseEnrolments` row, and they are exactly who the route
 *     serves. (Same half as the card's render filter; restated so this
 *     predicate stays correct if that filter ever loosens.) A reviewer's or
 *     track lead's row reaches this card by a different door and earns a 403.
 *   • `phase === "running"` with a started taught week — the route returns
 *     `weekNumber: null` for anything else, and it spends a session
 *     verification (an Auth RPC plus a `users` doc read) and two more doc reads
 *     to say so. Cheap per call, not free, and this card can make up to four of
 *     them.
 *
 * What survives is ~one POST for a member on one live course, which the route
 * answers from the enrolment's high-water mark with no write at all — and,
 * since the trigger's claim is module-scoped, only on the FIRST dashboard visit
 * of a cohort week rather than on every mount (see useSyncTasks).
 *
 * Two known, deliberate gaps, both covered by the other two trigger points:
 *   • enrolment STATUS is invisible here — `/api/courses/me` reports the role
 *     for an active or a `completed` enrolment alike, and the route requires
 *     `active`. A completed enrolment on a still-running run is rare, and the
 *     refusal is swallowed.
 *   • only the `MAX_ROWS` rows this card renders are considered, so a member
 *     on five live courses mirrors four from here and the fifth on the run's
 *     own page. Firing for rows the card does not show would be a hidden cost
 *     on the busiest page in the app.
 */
function shouldMirror(entry: MyRunEntry): boolean {
  const enrolled =
    entry.membership === "enrolled" &&
    (entry.roles.includes("learner") || entry.roles.includes("facilitator"));
  if (!enrolled) return false;
  const week = entry.currentWeek;
  return week?.phase === "running" && week.anchorWeekNumber > 0;
}

/** The runs that count as live for Home. See the four rules at the top. */
export function liveRunsOf(runs: MyRunEntry[]): MyRunEntry[] {
  return runs.filter(
    (entry) =>
      entry.membership === "enrolled" &&
      (entry.roles.includes("learner") || entry.roles.includes("facilitator")) &&
      !entry.archived &&
      entry.status !== "completed" &&
      entry.status !== "cancelled" &&
      entry.status !== "draft",
  );
}

type Summary = {
  runs: MyRunEntry[];
  loading: boolean;
  error: Error | null;
  /** The run Home already shows in full, left out of the list. */
  featuredRunId?: string | null;
};

export default function MyCoursesSummary({
  runs,
  loading,
  error,
  featuredRunId = null,
}: Summary) {
  const live = useMemo(() => liveRunsOf(runs).slice(0, MAX_ROWS), [runs]);

  // Nothing to say, or nothing said yet. No skeleton either: a placeholder
  // that resolves to nothing would push the rest of Home down and then yank
  // it back.
  if (loading || error || live.length === 0) return null;

  const listed = live.filter((entry) => entry.runId !== featuredRunId);

  return (
    <>
      {/* Renders nothing: one instance per run so each gets its own hook and
          its own lifecycle (see SyncTasksTrigger). Mounted below the early
          return above, so a still-loading Home never fires, and for EVERY
          live run, the featured one included: the list leaving a run out
          must not stop its week's tasks reaching My work.

          The once-per-(run, anchor week) claim these share is MODULE-scoped,
          which is what makes this affordable on the busiest page in the
          app: the four triggers cost four POSTs on the first visit to Home
          of a cohort week and nothing on every visit after it, including
          every soft navigation back here from a course page. `shouldMirror`
          has already guaranteed a `currentWeek` with a started taught week, so
          the anchor is a real number here, never the null fallback. */}
      {live.filter(shouldMirror).map((entry) => (
        <SyncTasksTrigger
          key={entry.runId}
          runId={entry.runId}
          anchorWeek={entry.currentWeek?.anchorWeekNumber ?? null}
        />
      ))}

      {listed.length > 0 && (
        <section className={styles.card} aria-labelledby="home-programmes">
          <div className={styles.head}>
            <h2 id="home-programmes" className={styles.title}>
              {featuredRunId ? "Your other programmes" : "Your programmes"}
            </h2>
            <Link href="/learn" className={styles.viewAll}>
              My programmes
            </Link>
          </div>

          <ul className={styles.list} role="list">
            {listed.map((entry) => (
              <li key={entry.runId}>
                <Link href={`/learn/${encodeURIComponent(entry.runId)}`} className={styles.row}>
                  <span className={styles.name}>{entry.courseTitle}</span>
                  <span className={styles.week}>{weekLine(entry)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
