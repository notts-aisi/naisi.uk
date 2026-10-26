"use client";

import ProgrammeMark from "@/components/ProgrammeMark";
import { own } from "@/lib/applications/applicant/keys";
import type { ApplicantProgramme } from "@/lib/applications/applicant/types";
import type { ShownCrest } from "@/lib/crests/resolve";
import RankList from "./RankList";
import form from "./form.module.css";

/**
 * Rank: the programmes somebody ticked, in the order they want them.
 *
 * The list is the form's one ranking control (`RankList`), which a question
 * that asks for an order uses too: drag a row, move it with the keyboard, or
 * press its up or down button. This step only says what is in the list, and
 * what each row says under a programme's name.
 *
 * Each row carries the programme's crest at 28px before its name, as the
 * page worked it out on the server (`formCrests`, the crest resolver's
 * answer): a crest, or the NAISI emblem for a programme with none. A
 * programme missing from the answer shows the emblem too. Decorative: the
 * name is beside it.
 */

/** "6 WEEKS" from "6 WEEKS · ~5 HRS A WEEK": the first fact is enough beside a rank. */
function firstFact(facts: string): string {
  return facts.split("·")[0]?.trim() ?? "";
}

export default function RankStep({
  programmes,
  onReorder,
  shownCrests,
}: {
  /** The ticked programmes, in the person's current order. */
  programmes: readonly ApplicantProgramme[];
  onReorder: (ids: string[]) => void;
  /** What each programme shows beside its name, by programme id: the resolver's answer. */
  shownCrests: Readonly<Record<string, ShownCrest>>;
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
          mark: <ProgrammeMark shown={own(shownCrests, programme.id) ?? null} size={28} />,
        }))}
        onReorder={onReorder}
      />
    </div>
  );
}
