"use client";

import { useId } from "react";
import kit from "@/features/applications/kit/kit.module.css";
import { Chips, Group } from "./fields";
import RankList from "./RankList";
import form from "./form.module.css";
import styles from "./rank.module.css";

/**
 * A question that asks for an order.
 *
 * Two parts, and both are controls the form already has. The options are
 * tick boxes, drawn as the chips "several choices" uses: ticking one puts it
 * at the end of the person's order and unticking takes it out. The ones they
 * have ticked are then a list in their order, drawn by the form's one ranking
 * control (`RankList`, which the Rank step uses for programmes), so a row is
 * dragged, moved with the keyboard, or moved with its up and down buttons
 * here exactly as it is there.
 *
 * So nothing here needs a drag: a keyboard or a phone ticks the options in
 * the order wanted, and presses a row's buttons to change that order.
 *
 * THE ANSWER is the options placed, in the person's order. They may place as
 * many as they like, and what they leave unticked is simply not in it.
 */

/** What the control says to do. Under every ranking, whatever its author's own help line says. */
export const RANK_INSTRUCTION = "Tick the ones you’d like, then put them in order. You can leave some out.";

/**
 * The part of a stored answer the control can show: the question's own
 * options, each once, in the person's order. The same reading a save makes.
 */
export function placedOf(value: unknown, options: readonly string[]): string[] {
  const placed: string[] = [];
  if (!Array.isArray(value)) return placed;
  for (const item of value) {
    if (typeof item === "string" && options.includes(item) && !placed.includes(item)) placed.push(item);
  }
  return placed;
}

export default function RankQuestion({
  legend,
  help,
  optional,
  error,
  options,
  value,
  onChange,
}: {
  legend: string;
  help?: string;
  optional?: boolean;
  error?: string | null;
  /** The things to put in order, as the question lists them. */
  options: readonly string[];
  /** What they have placed so far, first choice first. */
  value: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const id = useId();
  const placed = placedOf(value, options);
  const toggle = (option: string) =>
    onChange(placed.includes(option) ? placed.filter((each) => each !== option) : [...placed, option]);

  return (
    <Group legend={legend} help={help} optional={optional} error={error}>
      <p className={form.help}>{RANK_INSTRUCTION}</p>
      <Chips options={options} isOn={(option) => placed.includes(option)} onToggle={toggle} />
      {placed.length > 0 ? (
        <div className={styles.order}>
          <div className={`${kit.mono} ${styles.orderLabel}`}>Your order</div>
          <RankList
            label={`Your order for: ${legend}`}
            dndId={`rank-${id}`}
            roomy
            items={placed.map((option) => ({ id: option, name: option }))}
            onReorder={onChange}
          />
        </div>
      ) : null}
    </Group>
  );
}
