import type {
  HandOverReceiptView,
  RunChoiceView,
  RunPanelView,
} from "@/lib/applications/handover/views";

/**
 * THE WORDS OF THE "COURSE RUN" PANEL.
 *
 * What the panel says is worked out here from what the server sent, so that
 * the sentences can be read, and tested, without drawing the panel. Nothing
 * here decides anything: which run can be picked, who holds a place and what
 * stops a press are the server's, and where the server wrote a sentence
 * (`runLocked`, `blocked`, a choice's `note`) it is shown as it was written.
 *
 * Pure, with one type import, so the panel and a test read the same words.
 */

const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

/** The line under the run box. */
export function runHint(panel: Pick<RunPanelView, "courseTied" | "runLocked" | "runId" | "choices" | "programmeName">): string {
  if (!panel.courseTied) {
    return "Tie this programme to its course page first, in Basics above. The run has to be one of that course’s.";
  }
  if (panel.runLocked !== null) return panel.runLocked;
  if (panel.runId === null) {
    return panel.choices.some((choice) => choice.selectable)
      ? "Pick the run this programme’s accepted people go onto. From then on, that run’s own apply page takes no applications."
      : "The course this programme is tied to has no run that can be picked. Make one in the course editor, then check again.";
  }
  return `People who hold a place on ${panel.programmeName} are handed over to this run. Its own apply page takes no applications.`;
}

/** The runs in the list that cannot be picked, each with the server's reason. */
export function unpickable(panel: Pick<RunPanelView, "choices">): RunChoiceView[] {
  return panel.choices.filter((choice) => choice.note !== "");
}

/** How many people hold a place, and how many of them are on the run's list. */
export function holdersLine(
  panel: Pick<RunPanelView, "holders" | "onTheList" | "programmeName">,
): string {
  const holders = panel.holders ?? 0;
  if (holders === 0) return `Nobody holds a place on ${panel.programmeName} yet.`;
  const hold = `${people(holders)} ${holders === 1 ? "holds" : "hold"} a place on ${panel.programmeName}`;
  if (panel.onTheList === holders) {
    return `${hold}, and ${holders === 1 ? "they are" : "all of them are"} on the run’s list.`;
  }
  if (panel.onTheList === 0) return `${hold}. None of them is on the run’s list yet.`;
  return `${hold}. ${panel.onTheList} of them ${panel.onTheList === 1 ? "is" : "are"} on the run’s list.`;
}

/** What the button says it will do. */
export function handOverButton(panel: Pick<RunPanelView, "toHandOver">): string {
  const waiting = panel.toHandOver.length;
  return waiting > 0 ? `Hand over ${people(waiting)}` : "Hand over anybody new";
}

/** What a press did, in a sentence. */
export function handOverReceipt(receipt: HandOverReceiptView): string {
  if (receipt.handedOver === 0) {
    return receipt.alreadyThere === 0
      ? "Nobody holds a place on this programme yet, so nobody was handed over."
      : "Nobody new to hand over. Everybody who holds a place already has a row on the run’s list.";
  }
  const done = `${people(receipt.handedOver)} handed over.`;
  if (receipt.alreadyThere === 0) return done;
  return `${done} ${people(receipt.alreadyThere)} ${receipt.alreadyThere === 1 ? "was" : "were"} already there.`;
}

/** Rows on the run that this programme's hand-over did not write. */
export function otherRowsLine(count: number): string {
  return `${count === 1 ? "1 row" : `${count} rows`} on this run’s list did not come from this programme.`;
}
