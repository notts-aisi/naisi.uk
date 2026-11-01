"use client";

import { useRef } from "react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import type { FilterChoice } from "@/lib/surveys/charts";
import { CHART_WORDS } from "@/lib/surveys/words";
import styles from "./charts.module.css";

/**
 * The admins' filters above a survey's charts: Who (everybody,
 * or one group, on a programme's survey) and Came as (members and guests, on
 * a survey after an event). An ordinary form that asks for the Results page
 * again with the choice in its address, so the page, its "See who" and its
 * files all count the same answers. A choice is sent as soon as it is made;
 * before the page's script has arrived, Show sends it.
 *
 * Came as's choices are `cameAs`, never `as`: on this site's components `as`
 * names the element a component draws (Card's), and the walk that keeps a
 * link from wrapping an article reads every `as` that way.
 */
export default function ResultsFilters({
  action,
  who,
  cameAs,
  chosen,
  beforeFirstSession,
}: {
  /** The Results page's own address. */
  action: string;
  who: FilterChoice[] | null;
  cameAs: FilterChoice[] | null;
  chosen: { who: string; as: string };
  /** The before-first-session switch, which a choice keeps as it is. */
  beforeFirstSession: boolean;
}) {
  const hydrated = useHydrated();
  const form = useRef<HTMLFormElement>(null);
  const send = () => form.current?.requestSubmit();
  return (
    <form ref={form} method="get" action={action} className={styles.filters}>
      {beforeFirstSession && <input type="hidden" name="before-first-session" value="1" />}
      {who && (
        <label className={styles.filter}>
          <span className={styles.filterLabel}>{CHART_WORDS.who}</span>
          <Select name="who" defaultValue={chosen.who} onChange={send}>
            {who.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </Select>
        </label>
      )}
      {cameAs && (
        <label className={styles.filter}>
          <span className={styles.filterLabel}>{CHART_WORDS.cameAs}</span>
          <Select name="as" defaultValue={chosen.as} onChange={send}>
            {cameAs.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </Select>
        </label>
      )}
      {!hydrated && (
        <Button type="submit" variant="secondary">
          {CHART_WORDS.show}
        </Button>
      )}
    </form>
  );
}
