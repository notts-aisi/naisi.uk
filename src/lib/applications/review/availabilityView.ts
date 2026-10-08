import {
  AVAILABILITY_DAYS,
  decodeMask,
  isUsableGrid,
  slotCountFor,
  type AvailabilityGrid,
  type AvailabilityMask,
} from "@/lib/admissions/availability";
import { listInWords } from "./people";
import type { AvailabilityBlock, AvailabilityView } from "./types";

/**
 * "When they're free", as a reviewer reads it: one row a day with the times
 * painted in, and the same times as lines of words.
 *
 * Everything here is a wall clock. A slot is minutes past midnight on an
 * unspecified day, so nothing is converted to an instant and no clock change
 * can move a block. The answer is decoded against the grid it was DRAWN on,
 * which travels with it.
 *
 * Pure, with no server import.
 */

/** Monday first, as the week is read. The mask itself is indexed from Sunday. */
const WEEK: readonly { day: number; label: string }[] = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
  { day: 0, label: "Sun" },
];

/** "6pm", "7:30pm", "12pm": a wall clock as the site writes times. */
export function clockLabel(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  const past = minute % 60;
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return past === 0 ? `${twelve}${suffix}` : `${twelve}:${String(past).padStart(2, "0")}${suffix}`;
}

type Span = { start: number; end: number };

/** The painted runs in one day's slots, as wall-clock spans. */
function spansOf(slots: readonly boolean[], grid: AvailabilityGrid): Span[] {
  const spans: Span[] = [];
  let from = -1;
  for (let i = 0; i <= slots.length; i += 1) {
    const painted = i < slots.length && slots[i];
    if (painted && from === -1) from = i;
    if (!painted && from !== -1) {
      spans.push({
        start: grid.startMinute + from * grid.slotMinutes,
        end: grid.startMinute + i * grid.slotMinutes,
      });
      from = -1;
    }
  }
  return spans;
}

const spanLabel = (span: Span) => `${clockLabel(span.start)} to ${clockLabel(span.end)}`;

/** A number of hours without a trailing ".0": 14, 15.5, 15.25. */
function hoursLabel(minutes: number): string {
  const hours = Math.round((minutes / 60) * 100) / 100;
  return String(hours);
}

/** Hour labels across the top: at most five, evenly spaced from the start. */
function axisFor(grid: AvailabilityGrid): AvailabilityView["axis"] {
  const length = grid.endMinute - grid.startMinute;
  const step = Math.max(1, Math.ceil(length / 60 / 4)) * 60;
  const axis: AvailabilityView["axis"] = [];
  for (let minute = grid.startMinute; minute <= grid.endMinute; minute += step) {
    axis.push({ label: clockLabel(minute), at: ((minute - grid.startMinute) / length) * 100 });
  }
  return axis;
}

const EMPTY: AvailabilityView = {
  empty: true,
  axis: [],
  hourWidth: 0,
  days: WEEK.map(({ label }) => ({ label, blocks: [] })),
  lines: [],
  total: null,
};

export function availabilityViewFor(mask: AvailabilityMask): AvailabilityView {
  const grid: AvailabilityGrid = {
    version: mask.version,
    startMinute: mask.startMinute,
    endMinute: mask.endMinute,
    slotMinutes: mask.slotMinutes,
  };
  if (!isUsableGrid(grid) || slotCountFor(grid) === 0) return EMPTY;

  const length = grid.endMinute - grid.startMinute;
  const columns = decodeMask(mask.days, grid);
  const perDay = WEEK.map(({ day, label }) => ({
    label,
    spans: day < AVAILABILITY_DAYS ? spansOf(columns[day] ?? [], grid) : [],
  }));

  const days = perDay.map(({ label, spans }) => ({
    label,
    blocks: spans.map(
      (span): AvailabilityBlock => ({
        left: ((span.start - grid.startMinute) / length) * 100,
        width: ((span.end - span.start) / length) * 100,
        label: spanLabel(span),
      }),
    ),
  }));

  // Days that share exactly the same times read as one line: "Mon, Tue and
  // Thu, 6pm to 9pm". The first day of each group decides where its line sits.
  const groups: { times: string; days: string[] }[] = [];
  let minutes = 0;
  let daysWithTime = 0;
  for (const { label, spans } of perDay) {
    if (spans.length === 0) continue;
    daysWithTime += 1;
    for (const span of spans) minutes += span.end - span.start;
    const times = listInWords(spans.map(spanLabel));
    const group = groups.find((entry) => entry.times === times);
    if (group) group.days.push(label);
    else groups.push({ times, days: [label] });
  }
  if (daysWithTime === 0) return { ...EMPTY, axis: axisFor(grid), hourWidth: (60 / length) * 100 };

  const hours = hoursLabel(minutes);
  return {
    empty: false,
    axis: axisFor(grid),
    hourWidth: (60 / length) * 100,
    days,
    lines: groups.map((group) => `${listInWords(group.days)}, ${group.times}`),
    total: `${hours} ${hours === "1" ? "hour" : "hours"} across ${daysWithTime} ${
      daysWithTime === 1 ? "day" : "days"
    }`,
  };
}
