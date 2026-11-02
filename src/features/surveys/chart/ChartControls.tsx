"use client";

import { useRef } from "react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import type { ChartChoice, ChartShow, ChartSplit, ChartWho } from "@/lib/surveys/chart";
import { MAKE_CHART_WORDS } from "@/lib/surveys/chartWords";
import styles from "./chart.module.css";

/**
 * Make a chart's four choices: the question, what to show of it, whether to
 * split it into a chart a group, and who to count. An ordinary form that
 * asks for the page again with the choices in its address, so the page and
 * its file of numbers draw the same chart. A choice is sent as soon as it is
 * made; before the page's script has arrived, Show sends them.
 *
 * Who writes `who` (a group) or `as` (members or guests), the Results'
 * own filter's keys, so a chart counts what Results count for the same
 * choice. The form is drawn afresh for every chart, so each menu holds what
 * the server read, never a choice it could not draw.
 */
export default function ChartControls({
  action,
  questions,
  shows,
  splits,
  who,
  chosen,
}: {
  /** The page's own address. */
  action: string;
  questions: ChartChoice[];
  shows: ChartChoice<ChartShow>[];
  splits: ChartChoice<ChartSplit>[];
  who: ChartWho | null;
  chosen: { question: string; show: ChartShow; split: ChartSplit };
}) {
  const hydrated = useHydrated();
  const form = useRef<HTMLFormElement>(null);
  const send = () => form.current?.requestSubmit();
  return (
    <form
      key={`${chosen.question}|${chosen.show}|${chosen.split}|${who?.chosen ?? ""}`}
      ref={form}
      method="get"
      action={action}
      className={styles.controls}
    >
      <label className={styles.control}>
        <span className={styles.controlLabel}>{MAKE_CHART_WORDS.question}</span>
        <Select name="question" defaultValue={chosen.question} onChange={send}>
          {questions.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </Select>
      </label>
      <label className={styles.control}>
        <span className={styles.controlLabel}>{MAKE_CHART_WORDS.show}</span>
        <Select name="show" defaultValue={chosen.show} onChange={send}>
          {shows.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </Select>
      </label>
      {splits.length > 1 && (
        <label className={styles.control}>
          <span className={styles.controlLabel}>{MAKE_CHART_WORDS.splitBy}</span>
          <Select name="split" defaultValue={chosen.split} onChange={send}>
            {splits.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </Select>
        </label>
      )}
      {who && (
        <label className={styles.control}>
          <span className={styles.controlLabel}>{MAKE_CHART_WORDS.who}</span>
          <Select name={who.name} defaultValue={who.chosen} onChange={send}>
            {who.choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </Select>
        </label>
      )}
      {!hydrated && (
        <Button type="submit" variant="secondary">
          {MAKE_CHART_WORDS.draw}
        </Button>
      )}
    </form>
  );
}
