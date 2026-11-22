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
  /** Beside the name, where the list says more: "Taken off by Maya Rao on Fri 20 Nov". */
  note?: string;
};

/**
 * Where the run stands, worded (`src/lib/courses/runStands/words.ts`): the
 * stage it shows as, the sentence under the stages, what the stages mean, and
 * the early move offered. Built only for a run the programme names.
 */
export type RunStandsView = {
  /** "draft" | "running" | "completed" | "cancelled": a live status shows as running. */
  stage: "draft" | "running" | "completed" | "cancelled";
  /** The sentence under the stages; empty for a cancelled run. */
  line: string;
  /** What Running and Completed mean, shown under a running run; empty otherwise. */
  meaning: string;
  /** "start" on a draft; "complete" on a live run, "complete-through" when the route steps through Running. */
  move: "start" | "complete" | "complete-through" | null;
  /** The run's label for the questions ("AGI Strategy, Autumn 2026"). */
  runLabel: string;
};

/** The run's details as the form shows them, from what is stored. */
export type RunDetailsView = {
  label: string;
  academicYear: string;
  /** "" when the run has no cohort; else "autumn" | "spring" | "summer". */
  cohortTerm: string;
  /** "" with no cohort. */
  cohortYear: string;
  /** "" with no cohort. */
  cohortNumber: string;
  /** "YYYY-MM-DD", or "" when none is stored. */
  startDate: string;
  /** "Mon 2 Nov", for the read-only line once the groups have gone out. */
  startDateWords: string;
  /** True once Publish has sent the groups out: the start date can't change. */
  groupsGoneOut: boolean;
};

/**
 * Somebody on the run's list from this programme who gave their place back
 * and whose seat is still on the run, or who never had one.
 */
export type GaveBackPersonView = HandOverPersonView & {
  /** The name they go by, for the button: "Kwesi". */
  firstName: string;
  /** "Gave their place back on Fri 6 Nov · still in Group B". */
  line: string;
  /**
   * Course run can take them off: a seat still on the run that the form put
   * there, given back by them and not put back by staff since. False for
   * somebody with no seat.
   */
  canTakeOff: boolean;
};

/** One person named on one of the older roles of the run. */
export type RunRolePersonView = { uid: string; name: string };

/** The run's track leads and run facilitators, named on the older run page. */
export type RunRolesView = {
  trackLeads: RunRolePersonView[];
  runFacilitators: RunRolePersonView[];
};

/** What Careful offers for the named run, from what is stored. */
export type RunCarefulView = {
  /**
   * "offer" once the run is completed or cancelled, "not-yet" before then,
   * "archived" once it is archived (offered back), null while it is being
   * destroyed.
   */
  archive: "offer" | "not-yet" | "archived" | null;
  /** The status table lets this run be cancelled. */
  canCancel: boolean;
  /** The run's course, for the dialogs' line under their titles. */
  courseTitle: string;
  /** The run's label exactly as stored: the cancel and destroy dialogs ask for it typed. */
  label: string;
};

export type RunPanelView = {
  /** What the programme is called in a sentence: "AGI Strategy". */
  programmeName: string;
  /** The term the form is for, as the form is named: "Spring 2027". */
  termName: string;
  /** No run is named and the programme is tied to a course: "Make a new run of AGI Strategy" is offered. */
  canMakeRun: boolean;
  /** False until the programme has been tied to its course page. */
  courseTied: boolean;
  /** The run the programme names now, or null. */
  runId: string | null;
  /** The runs of the tied course, each with whether it can be picked. */
  choices: RunChoiceView[];
  /** Why the run can no longer be changed here, or null while it can. */
  runLocked: string | null;
  /** People in groups, the programme's Groups tab, once a run is named. */
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
  /**
   * On the run's list from this programme, no longer holding a place, and
   * their seat still on the run (or no seat): nothing takes them off it.
   */
  gaveBack: GaveBackPersonView[];
  /** The same, having left the run by themselves: nothing is left to do. */
  left: HandOverPersonView[];
  /** The same, taken off the run by staff (Remove): nothing is left to do. Each says who took them off and when. */
  takenOff: HandOverPersonView[];
  /** Hold a place, and their row on the run says something other than accepted. */
  notAccepted: HandOverPersonView[];
  /** Rows on the run that this programme did not put there. */
  otherRows: number;
  /** Where the named run stands, or null with no run named (or the run gone). */
  stands: RunStandsView | null;
  /** The named run's details, or null with no run named (or the run gone). */
  details: RunDetailsView | null;
  /** The named run's track leads and run facilitators, or null with no run named (or the run gone). */
  roles: RunRolesView | null;
  /** What Careful offers for the named run, or null with no run named (or the run gone). */
  careful: RunCarefulView | null;
};

/** What a press of the hand-over reports. */
export type HandOverReceiptView = {
  /** People this press put on the run's list. */
  handedOver: number;
  /** People who were already there. */
  alreadyThere: number;
};
