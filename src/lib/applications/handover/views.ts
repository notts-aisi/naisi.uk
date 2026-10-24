/**
 * WHAT THE "COURSE RUN" PANEL IS GIVEN.
 *
 * The panel sits on a programme's Settings tab and is an admin's alone: the
 * route and the page both answer anybody else before this is built. It is
 * written out field by field in `./load.ts`, so nothing reaches the browser
 * that is not named here.
 *
 * Types only, with no import, so the panel and the loader share one shape.
 */

/** One run an admin can pick, or the run already named when it can no longer be picked. */
export type RunChoiceView = {
  id: string;
  /** "Autumn 2026 · Draft". */
  label: string;
  selectable: boolean;
  /** Why it cannot be picked, when it cannot. Empty otherwise. */
  note: string;
};

/** Somebody the panel names, with where their application is read. */
export type HandOverPersonView = {
  uid: string;
  name: string;
  /** Their application, on the programme's own review screen. */
  applicationPath: string;
};

export type RunPanelView = {
  /** What the programme is called in a sentence: "AGI Strategy". */
  programmeName: string;
  /** False until the programme has been tied to its course page. */
  courseTied: boolean;
  /** The run the programme names now, or null. */
  runId: string | null;
  /** The runs of the tied course, each with whether it can be picked. */
  choices: RunChoiceView[];
  /** Why the run can no longer be changed here, or null while it can. */
  runLocked: string | null;
  /** The run's allocation board, once a run is named. */
  boardPath: string | null;
  /** The run's own applications list, once a run is named. */
  listPath: string | null;
  /** What stops a hand-over, in a sentence, or null when it can be pressed. */
  blocked: string | null;
  /**
   * How many people hold a place on the programme now. Null until decisions
   * have been sent: before then nobody has been told, and nobody is named.
   */
  holders: number | null;
  /** Of those, the people already on the run's list. */
  onTheList: number;
  /** Hold a place and are not on the run's list yet. A press hands them over. */
  toHandOver: HandOverPersonView[];
  /** On the run's list from this programme, and no longer holding a place. */
  gaveBack: HandOverPersonView[];
  /** Hold a place, and their row on the run says something other than accepted. */
  notAccepted: HandOverPersonView[];
  /** Rows on the run that this programme did not put there. */
  otherRows: number;
};

/** What a press of the hand-over reports. */
export type HandOverReceiptView = {
  /** People this press put on the run's list. */
  handedOver: number;
  /** People who were already there. */
  alreadyThere: number;
};
