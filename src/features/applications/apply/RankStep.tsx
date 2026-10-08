"use client";

import type { ApplicantProgramme } from "@/lib/applications/applicant/types";
import RankList from "./RankList";
import form from "./form.module.css";

/**
 * Rank: the programmes somebody ticked, in the order they want them.
 *
 * The list is the form's one ranking control (`RankList`), which a question
 * that asks for an order uses too: drag a row, move it with the keyboard, or
 * press its up or down button. This step only says what is in the list, and
 * what each row says under a programme's name.
 */

/** "6 WEEKS" from "6 WEEKS · ~5 HRS A WEEK": the first fact is enough beside a rank. */
function firstFact(facts: string): string {
  return facts.split("·")[0]?.trim() ?? "";
}

export default function RankStep({
  programmes,
  onReorder,
}: {
  /** The ticked programmes, in the person's current order. */
  programmes: readonly ApplicantProgramme[];
  onReorder: (ids: string[]) => void;
}) {
  return (
    <div className={form.body}>
      <RankList
        label="Your order"
        dndId="application-rank"
        items={programmes.map((programme) => ({
          id: programme.id,
          name: programme.shortName,
          fact: firstFact(programme.facts),
        }))}
        onReorder={onReorder}
      />
    </div>
  );
}
