import type { Placement, PreviewResult } from "./useAllocation";

/**
 * BEFORE A PRESS THAT MOVES SOMEBODY ALREADY TOLD THEIR GROUP: the one
 * question every board asks (the run's own allocation board, People in
 * groups and Circles), so none of them can come to ask it differently.
 *
 * The allocate route's preview (`preview: true`, which writes nothing) says,
 * for each told person in the press, whether the move is made mid-term: its
 * week, and the question (the week, the weeks that stay with the old group,
 * what is left behind there); or why it cannot be made, in the board's
 * sentence (no week by the rule, or out of every group once the group has
 * met). Every question is asked in one confirmation. Declined, nothing is
 * pressed. Agreed, the press carries each move's week (`fromWeek`), so a
 * move whose week has changed since is refused rather than made from another
 * week. A move the preview refused is NOT sent: it comes back in `refused`,
 * with its sentence, for the board to say before the press (each of the
 * three boards does), and the rest are pressed.
 *
 * Somebody nobody has told is never asked about: their moves are the board's
 * working copy, as always.
 */
export type MidTermAsked =
  /** `placements`: the moves to press, with their weeks; `refused`: the moves not to press, each with why. */
  | { go: true; placements: Placement[]; refused: { uid: string; reason: string; words?: string }[] }
  /** Declined (`error` null), or the preview failed. */
  | { go: false; error: string | null };

export async function askMidTermMoves(
  placements: readonly Placement[],
  input: {
    /** Whether Publish has told this person about a group. */
    told: (uid: string) => boolean;
    /** The route's preview: `useAllocation().previewPlace`, or the same request. */
    preview: (placements: Placement[]) => Promise<PreviewResult>;
    /** Asks the question; true to go on. */
    confirm: (question: string) => boolean;
  },
): Promise<MidTermAsked> {
  const asked = placements.filter((each) => input.told(each.uid));
  if (asked.length === 0) return { go: true, placements: [...placements], refused: [] };
  const said = await input.preview(asked.map(({ uid, groupId }) => ({ uid, groupId })));
  if (!said.ok) return { go: false, error: said.error };
  const questions = said.preview.flatMap((entry) => (entry.fromWeek !== null && entry.words ? [entry.words] : []));
  if (questions.length > 0 && !input.confirm(questions.join("\n\n"))) return { go: false, error: null };
  const weekOf = new Map(said.preview.flatMap((entry) => (entry.fromWeek !== null ? [[entry.uid, entry.fromWeek] as const] : [])));
  const refused = said.preview.flatMap((entry) => (entry.refusal ? [{ uid: entry.uid, ...entry.refusal }] : []));
  const refusedUids = new Set(refused.map((each) => each.uid));
  return {
    go: true,
    placements: placements
      .filter((each) => !refusedUids.has(each.uid))
      .map((each) => {
        const fromWeek = weekOf.get(each.uid);
        return fromWeek !== undefined ? { ...each, fromWeek } : { ...each };
      }),
    refused,
  };
}
