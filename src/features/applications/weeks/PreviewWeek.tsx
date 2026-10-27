"use client";

import type { OverviewPayload } from "@/app/api/courses/runs/[runId]/overview/route";
import type { ExerciseResponseWire } from "@/app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route";
import BlockWeek from "@/features/courses/weekBlocks/BlockWeek";
import type { MaterialTicks } from "@/features/courses/weekly/useMaterialTicks";
import type { PreviewWeek as PreviewWeekDoc } from "@/lib/courses/weeksTab/preview";

/**
 * A week as a fellow reads it, for "Preview as a fellow" on the Weeks tab:
 * the member's own week page (`BlockWeek`), handed nothing ticked, nothing
 * written and no way to write. Its reader takes part and cannot write (the
 * preview's payload, `loadWeekPreview`), so its boxes, ticks and Send are
 * drawn and cannot be pressed; nothing here reads or writes anybody's data.
 */

const NO_TICKS: MaterialTicks = {
  isDone: () => false,
  // Never pressed: nothing in a preview can be ticked (`canTick` is false).
  tick: async () => ({ saved: false, words: "" }),
  toggle: async () => false,
  byItemId: new Map(),
  canTick: false,
  loading: false,
  error: null,
};

const NO_ROWS = {
  byId: new Map<string, ExerciseResponseWire>(),
  loaded: true,
  loading: false,
  reload: () => {},
  apply: () => {},
};

export default function PreviewWeek({
  runId,
  weekNumber,
  week,
  payload,
}: {
  runId: string;
  weekNumber: number;
  week: PreviewWeekDoc;
  payload: OverviewPayload;
}) {
  return (
    <BlockWeek
      runId={runId}
      weekNumber={weekNumber}
      uid=""
      week={week}
      forked={payload.forkedWeekIds.includes(week.id)}
      payload={payload}
      ticks={NO_TICKS}
      onTick={() => {}}
      ownRows={NO_ROWS}
      sharedNotes={null}
      leadFirstName={payload.programme?.leadFirstName ?? null}
    />
  );
}
