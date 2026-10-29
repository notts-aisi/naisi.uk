import { rowMatches } from "@/lib/applications/people/filters";
import type { PeopleCounts, PersonRow } from "@/lib/applications/people/views";
import { statusWords } from "@/lib/applications/people/words";
import { groupsInWords } from "@/lib/courses/programmeAttendance";
import type { WeekOneLine } from "@/lib/courses/weekOneLine";
import {
  AFTER_PUBLISHED,
  ALL_ON_THE_LIST,
  EVERY_GROUP_HAS_A_FACILITATOR,
  EVERY_GROUP_HAS_A_ROOM,
  FACILITATOR_CHIP,
  GET_READY_TITLE,
  NOBODY_HOLDS_A_PLACE,
  NOBODY_UNTIL_DECISIONS,
  NO_GROUPS_YET,
  NO_GROUP_HAS_A_FACILITATOR,
  PUBLISH_STEP_LINE,
  READY_ITEM,
  RUN_NOT_DATED,
  STEP_LINK,
  STEP_TITLE,
  freedTitle,
  freedWindowWords,
  gaveBackLine,
  getReadyLede,
  groupTimesWords,
  handedOverWords,
  invitedWords,
  moveButtonWords,
  moveFirstWords,
  noFacilitatorWords,
  noRoomWords,
  noTimeWords,
  notesChosenWords,
  notesMissingWords,
  notOnTheListWords,
  notRepliedWords,
  notSaidFreeWords,
  placedDetailWords,
  placedNotFreeWords,
  placedWords,
  placesHeldWords,
  emailsPeopleWords,
  publishNeedsWords,
  publishedWords,
  remindFreeConfirm,
  remindFreeLabel,
  remindedTodayWords,
  readingTimeWords,
  saidYesCountWords,
  someWithoutWords,
  trainingLine,
  weekOneReadyWords,
} from "./words";

/**
 * "GET READY FOR WEEK 1" (boards st-overview and st-overview-phone) AND
 * PUBLISH'S READINESS CHECK (board st-publish), WORKED OUT FROM RECORDS.
 *
 * The programme's Overview, before any of its groups has met, is a checklist
 * of what makes week 1 happen, each step done, in progress or to do, and four
 * cards: who has not said when they are free, the places, the freed places,
 * and the facilitators. Publish's own page asks the same facts which of them
 * stop Publish and which are only worth checking. Both read the facts once,
 * through `readGetReady` (`./read.ts`), and both are worked out here, so the
 * checklist, the readiness check and the cards can never say two things.
 *
 * ## One answer for every number
 *
 *  - WHO HOLDS A PLACE, WHO SAID THEY ARE COMING, WHO GAVE A PLACE BACK, WHO
 *    HAS NOT SAID WHEN THEY ARE FREE, WHO IS INVITED: the People tab's own
 *    rows and counts (`programmePeople`, filtered by `rowMatches`).
 *  - WHO IS IN A GROUP AND WHO IS STILL TO PLACE: `placingCounts`, the one
 *    count People in groups' line and its "Publish groups…" ask, over the
 *    run's own list as the board reads it. The reader asks it once for
 *    everybody, and once more for each person, so this file never counts.
 *  - WHETHER WEEK 1 IS READY, AND WHAT IS SAID WHEN IT IS NOT: `weekOneLine`,
 *    the line the Overview says once the run is under way.
 *  - WHO FACILITATES AND WHO HAS NOT ANSWERED: the Facilitators view's own
 *    model (`loadFacilitatorsModel`).
 *
 * ## What Publish needs, and what it does not
 *
 * Only what Publish itself refuses for is "Needed to publish": a group with
 * no day and time (its email cannot be written), a run whose sessions cannot
 * be dated, and somebody on the run's list with no group (Publish waits for
 * them). A room is worth checking and no more: the email leaves the room out
 * while a group has none, and Publish sends it. Somebody holding a place who
 * is not on the run's list yet is worth checking too: Publish does not wait
 * for them. The boards draw the room as needed and the people as worth
 * checking; neither is what the site does, and this file says what it does.
 *
 * Who is placed outside the times they gave is the reader's answer, asked of
 * `placedOutsideTheirTimes` (the board's "Not free" card's own), and Publish
 * also waits for a note, or "Send without a note", for each of them it would
 * tell: that is needed, and the rest is worth checking.
 *
 * No reads and no clock of its own, and no address anywhere in it. A list of
 * groups in a sentence is the lead's tabs' own (`groupsInWords`).
 */

// ---------------------------------------------------------------------------
// The facts, as the reader hands them over
// ---------------------------------------------------------------------------

/** One of the run's groups that still meet, in the order every tab lists them. */
export type ReadyGroup = {
  id: string;
  name: string;
  /** "Mon 6pm", or null while the group has no day and time. */
  short: string | null;
  /** "Mondays at 6pm", or null. */
  meets: string | null;
  /** The group has somewhere to meet: a room, or online. */
  hasPlace: boolean;
};

/** Who facilitates one group, and who has been asked to and not answered. */
export type ReadyFacilitating = {
  groupId: string;
  /** Each facilitator now, and whether they said yes to an ask (false: added by hand). */
  facilitators: { uid: string; name: string; saidYes: boolean }[];
  /** Each ask still waiting for an answer. */
  waiting: { uid: string; name: string; firstName: string }[];
};

/**
 * Somebody seated in a group that meets at a time they said they cannot make
 * (`placedOutsideTheirTimes`, asked by the reader), and, until Publish tells
 * them their group, what was chosen for them: a note, none, or nothing yet.
 */
export type ReadyOutside = {
  uid: string;
  name: string;
  firstName: string;
  groupId: string;
  told: boolean;
  note: "noted" | "without" | "missing" | "told";
};

/** Where each person holding a place stands on the run's list, asked of `placingCounts`. */
export type ReadyPlacing = {
  holding: number;
  inAGroup: number;
  /** Holding a place and not on the run's list yet: nobody has handed them over. */
  notOnTheRun: number;
  /** Of those still to place, how many have not said when they are free. */
  notSaidToPlace: number;
  /** Holding a place, on the run's list, with no group: who Publish waits for. */
  toPlaceOnList: { uid: string; firstName: string }[];
};

export type GetReadyFacts = {
  viewer: "admin" | "lead";
  runId: string;
  /** A fellowship's people say when they are free until groups go out; an incubator's do not. */
  kind: "fellowship" | "incubator";
  decisionsSent: boolean;
  /** The programme's number of places, or null with none set. */
  places: number | null;
  /** "Wed 28 Oct", while the planned day is today or later. */
  groupsGoOut: string | null;
  /** "Thu 29 Oct": the first day of the run's week 1. */
  weekOneStarts: string | null;
  /** Today, as a day is written ("Mon 26 Oct"), for "invited today". */
  today: string;
  /** The run has a start date and a taught week, so its sessions can be dated. */
  runDated: boolean;
  /** The last hand-over that put somebody on the run's list: who pressed it, and when. */
  handOver: { by: string; day: string; clock: string } | null;
  groups: ReadyGroup[];
  facilitating: ReadyFacilitating[];
  /** Everybody seated outside the times they gave, in the People tab's order. */
  outside: ReadyOutside[];
  training: { day: string; time: string; room: string } | null;
  /** The People tab's rows and counts, as this viewer may see them. Empty before decisions go out. */
  people: PersonRow[];
  counts: PeopleCounts;
  placing: ReadyPlacing;
  /** Week 1: what the one line says. Null while the run has no week 1. */
  weekOne: WeekOneLine | null;
  /** How long week 1 takes, in words ("about 75 minutes"), or null. */
  weekOneTime: string | null;
  /** The run's other taught weeks, and whether each is ready. */
  otherWeeks: { weekNumber: number; ready: boolean }[];
  /** When groups were last published, or null. */
  published: { day: string; clock: string } | null;
  /**
   * "Remind" on the card of who has not said when they are free: the first
   * names a press emails now (`readFreeReminders`), of those on the card who
   * was reminded already today, and who Publish has told their group (uids),
   * whose page to say when they are free has shut.
   */
  remind: { firstNames: string[]; remindedToday: string[]; told: string[] };
  freedWindow: { state: "open" | "closed" | "other"; lastDay: string | null };
};

// ---------------------------------------------------------------------------
// The checklist and the cards
// ---------------------------------------------------------------------------

export type StepState = "done" | "doing" | "todo";

export type StepKey = keyof typeof STEP_TITLE;

/** Where a step's link goes: a view of the programme's own tabs, or the run editor (an admin's). */
export type StepTarget =
  | "settings"
  | "times"
  | "facilitators"
  | "run-editor"
  | "groups"
  | "weeks"
  | "week-one"
  | "publish";

export type ReadyStep = {
  key: StepKey;
  title: string;
  state: StepState;
  line: string;
  /** The step's way on: a text link with an arrow once it is done, a button while it is not. */
  link: { to: StepTarget; label: string; look: "text" | "button" } | null;
  /** Week 1's "Mark ready", while it holds something and is not ready. */
  markReady: { runId: string; weekId: string } | null;
  /** Under Publish's button: what Publish still needs. */
  note: string | null;
};

export type ReadyFacilitatorRow = {
  uid: string;
  name: string;
  groupName: string;
  /** "Said yes", "No reply yet", or null for somebody added by hand. */
  chip: { words: string; tone: "yes" | "waiting" } | null;
};

export type GetReadyModel = {
  title: string;
  lede: string | null;
  steps: ReadyStep[];
  /** "Not said when they’re free": null while everybody holding a place has. */
  notSaid: {
    names: string[];
    text: string;
    /** Somebody on the card can still add when they are free: their group is not told yet. */
    open: boolean;
    /** "Remind 3 people", with how many it emails (C20); null while it would email nobody. */
    remind: { count: number; label: string; countLine: string; confirm: string } | null;
    /** "Dev was reminded today.", or null. */
    reminded: string | null;
  } | null;
  places: {
    held: number;
    of: number | null;
    /** Held as a share of the places, for the bar, or null with none set. */
    percent: number | null;
    heldWords: string;
    coming: number;
    haventSaid: number;
    gaveBack: number;
    gaveBackRows: { uid: string; name: string; line: string | null }[];
    /** The freed places, while somebody has given a place back. */
    freed: { title: string; text: string } | null;
    window: string | null;
  };
  facilitators: { rows: ReadyFacilitatorRow[]; training: string | null; empty: string | null };
};

// ---------------------------------------------------------------------------
// Shared readings of the facts
// ---------------------------------------------------------------------------

/** The first word of a name. */
function firstWordOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

type Facilitating = {
  yes: number;
  byHand: number;
  waiting: ReadyFacilitating["waiting"];
  waitingGroups: string[];
  without: string[];
  anybody: boolean;
};

/**
 * Group names in the order a sentence reads them, the order `groupsInWords`
 * names them in ("Group 2" before "Group 10"), so the people a sentence names
 * come in the order of the groups it names: "Ella and Kai haven’t replied
 * about Groups C and D."
 */
const inSentenceOrder = (a: string, b: string) => a.localeCompare(b, "en-GB", { numeric: true, sensitivity: "base" });

function facilitatingOf(facts: GetReadyFacts): Facilitating {
  const byGroup = new Map(facts.facilitating.map((entry) => [entry.groupId, entry] as const));
  let yes = 0;
  let byHand = 0;
  const waitingOn: { groupName: string; asks: ReadyFacilitating["waiting"] }[] = [];
  const without: string[] = [];
  for (const group of facts.groups) {
    const entry = byGroup.get(group.id);
    const facilitators = entry?.facilitators ?? [];
    for (const person of facilitators) {
      if (person.saidYes) yes += 1;
      else byHand += 1;
    }
    if (facilitators.length === 0) without.push(group.name);
    if (entry && entry.waiting.length > 0) waitingOn.push({ groupName: group.name, asks: entry.waiting });
  }
  waitingOn.sort((a, b) => inSentenceOrder(a.groupName, b.groupName));
  return {
    yes,
    byHand,
    waiting: waitingOn.flatMap((entry) => entry.asks),
    waitingGroups: waitingOn.map((entry) => entry.groupName),
    without,
    anybody: yes + byHand > 0,
  };
}

/** The first names of everybody waiting, each once, in the order of the groups the sentence names. */
function waitingNames(waiting: ReadyFacilitating["waiting"]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const ask of waiting) {
    if (seen.has(ask.uid)) continue;
    seen.add(ask.uid);
    names.push(ask.firstName || firstWordOf(ask.name));
  }
  return names;
}

/** The step's line about facilitators, and its state. */
function facilitatorsSaid(facts: GetReadyFacts): { state: StepState; line: string } {
  if (facts.groups.length === 0) return { state: "todo", line: NO_GROUPS_YET };
  const f = facilitatingOf(facts);
  if (f.waiting.length > 0) {
    const replied = notRepliedWords(waitingNames(f.waiting), groupsInWords(f.waitingGroups));
    return { state: "doing", line: f.yes > 0 ? `${saidYesCountWords(f.yes, f.yes + f.waiting.length)} ${replied}` : replied };
  }
  if (f.without.length > 0) {
    return {
      state: f.anybody ? "doing" : "todo",
      line: f.anybody ? noFacilitatorWords(groupsInWords(f.without), f.without.length) : NO_GROUP_HAS_A_FACILITATOR,
    };
  }
  return { state: "done", line: f.byHand === 0 ? saidYesCountWords(f.yes, f.yes) : EVERY_GROUP_HAS_A_FACILITATOR };
}

/** The groups with no day and time, and those with nowhere to meet. */
function groupGaps(facts: GetReadyFacts): { untimed: string[]; noPlace: string[] } {
  return {
    untimed: facts.groups.filter((group) => group.short === null).map((group) => group.name),
    noPlace: facts.groups.filter((group) => !group.hasPlace).map((group) => group.name),
  };
}

/** Holding a place, as the People tab counts it. */
function holdersOf(facts: GetReadyFacts): PersonRow[] {
  return facts.people.filter((row) => row.category === "holding");
}

// ---------------------------------------------------------------------------
// The checklist
// ---------------------------------------------------------------------------

function step(
  key: StepKey,
  state: StepState,
  line: string,
  link: ReadyStep["link"],
  extra: Partial<Pick<ReadyStep, "markReady" | "note">> = {},
): ReadyStep {
  return { key, title: STEP_TITLE[key], state, line, link, markReady: extra.markReady ?? null, note: extra.note ?? null };
}

/** A step's link: a text link once the step is done, a button while it is not. */
function linkFor(to: StepTarget, label: string, state: StepState): ReadyStep["link"] {
  return { to, label, look: state === "done" ? "text" : "button" };
}

function handOverStep(facts: GetReadyFacts): ReadyStep {
  const admin = facts.viewer === "admin";
  const settings = admin ? linkFor("settings", STEP_LINK.settings, "todo") : null;
  if (!facts.decisionsSent) return step("hand-over", "todo", NOBODY_UNTIL_DECISIONS, null);
  const { holding, notOnTheRun } = facts.placing;
  if (holding === 0) return step("hand-over", "todo", NOBODY_HOLDS_A_PLACE, null);
  const pressed = facts.handOver ? handedOverWords(facts.handOver.by, facts.handOver.day, facts.handOver.clock) : null;
  if (notOnTheRun === 0) return step("hand-over", "done", pressed ?? ALL_ON_THE_LIST, null);
  const missing = notOnTheListWords(notOnTheRun, admin);
  if (notOnTheRun >= holding) return step("hand-over", "todo", missing, settings);
  return step("hand-over", "doing", pressed ? `${pressed}. ${missing}` : missing, settings);
}

function timesStep(facts: GetReadyFacts): ReadyStep {
  if (facts.groups.length === 0) return step("times", "todo", NO_GROUPS_YET, linkFor("times", STEP_LINK.times, "todo"));
  const { untimed } = groupGaps(facts);
  if (untimed.length === 0) {
    return step(
      "times",
      "done",
      groupTimesWords(facts.groups.map((group) => group.short ?? "")),
      linkFor("times", STEP_LINK.times, "done"),
    );
  }
  const have = facts.groups.length - untimed.length;
  const state: StepState = have > 0 ? "doing" : "todo";
  return step(
    "times",
    state,
    someWithoutWords(have, facts.groups.length, groupsInWords(untimed), untimed.length, "time"),
    linkFor("times", STEP_LINK.times, state),
  );
}

function facilitatorsStep(facts: GetReadyFacts): ReadyStep {
  const said = facilitatorsSaid(facts);
  return step("facilitators", said.state, said.line, linkFor("facilitators", STEP_LINK.facilitators, said.state));
}

function roomsStep(facts: GetReadyFacts): ReadyStep {
  // Rooms are set in the run editor, which is an admin's: a lead is offered
  // nowhere to go, because the programme's own tabs set no room.
  const link = (state: StepState) => (facts.viewer === "admin" ? linkFor("run-editor", STEP_LINK.rooms, state) : null);
  if (facts.groups.length === 0) return step("rooms", "todo", NO_GROUPS_YET, link("todo"));
  const { noPlace } = groupGaps(facts);
  if (noPlace.length === 0) return step("rooms", "done", EVERY_GROUP_HAS_A_ROOM, link("done"));
  const have = facts.groups.length - noPlace.length;
  const state: StepState = have > 0 ? "doing" : "todo";
  return step("rooms", state, someWithoutWords(have, facts.groups.length, groupsInWords(noPlace), noPlace.length, "room"), link(state));
}

function peopleStep(facts: GetReadyFacts): ReadyStep {
  const link = (state: StepState) => linkFor("groups", STEP_LINK.groups, state);
  if (!facts.decisionsSent) return step("people", "todo", NOBODY_UNTIL_DECISIONS, link("todo"));
  const { holding, inAGroup, notSaidToPlace } = facts.placing;
  if (holding === 0) return step("people", "todo", NOBODY_HOLDS_A_PLACE, link("todo"));
  const state: StepState = inAGroup >= holding ? "done" : inAGroup > 0 ? "doing" : "todo";
  return step("people", state, placedWords(inAGroup, holding, notSaidToPlace), link(state));
}

function weekOneStep(facts: GetReadyFacts): ReadyStep {
  if (!facts.weekOne) return step("week-one", "todo", RUN_NOT_DATED, linkFor("weeks", STEP_LINK.weeks, "todo"));
  if (facts.weekOne.ready) {
    const readyToo = facts.otherWeeks.filter((week) => week.ready).map((week) => week.weekNumber);
    const notYet = facts.otherWeeks.filter((week) => !week.ready).map((week) => week.weekNumber);
    return step("week-one", "done", weekOneReadyWords(readyToo, notYet), linkFor("weeks", STEP_LINK.weeks, "done"));
  }
  const line = facts.weekOne;
  const state: StepState = line.markReady ? "doing" : "todo";
  return step("week-one", state, line.detail, line.open ? linkFor("week-one", STEP_LINK.weekOne, state) : null, {
    markReady: line.markReady ? { runId: facts.runId, weekId: "w01" } : null,
  });
}

/**
 * What Publish refuses for now: a group it cannot write to, somebody on the
 * run's list with no group, and somebody placed outside the times they gave
 * with nothing chosen for them.
 */
function publishNeeds(facts: GetReadyFacts): { times: boolean; placed: boolean; notes: boolean } {
  const { untimed } = groupGaps(facts);
  return {
    times: facts.groups.length === 0 || untimed.length > 0 || !facts.runDated,
    placed: facts.placing.toPlaceOnList.length > 0,
    notes: facts.outside.some((person) => !person.told && person.note === "missing"),
  };
}

function publishStep(facts: GetReadyFacts): ReadyStep {
  if (facts.published) {
    return step(
      "publish",
      "done",
      publishedWords(facts.published.day, facts.published.clock),
      linkFor("publish", STEP_LINK.publish, "done"),
    );
  }
  return step("publish", "todo", PUBLISH_STEP_LINE, linkFor("publish", STEP_LINK.publish, "todo"), {
    note: publishNeedsWords(publishNeeds(facts)),
  });
}

export function buildGetReady(facts: GetReadyFacts): GetReadyModel {
  const steps = [
    handOverStep(facts),
    timesStep(facts),
    facilitatorsStep(facts),
    roomsStep(facts),
    peopleStep(facts),
    weekOneStep(facts),
    publishStep(facts),
  ];

  // Not said when they're free: the People tab's own filter.
  const notSaidRows = facts.people.filter((row) => rowMatches(row, "not-said-free"));
  // "When you’re free" stays open to a fellowship's place until Publish tells them.
  const open = facts.kind === "fellowship";
  const told = new Set(facts.remind.told);
  const stillCan = open ? notSaidRows.filter((row) => !told.has(row.uid)).map((row) => row.name) : [];
  const count = facts.remind.firstNames.length;
  const notSaid =
    notSaidRows.length > 0
      ? {
          names: notSaidRows.map((row) => row.name),
          text: notSaidFreeWords(notSaidRows.map((row) => row.name), stillCan),
          open: stillCan.length > 0,
          remind:
            count > 0
              ? {
                  count,
                  label: remindFreeLabel(count),
                  countLine: emailsPeopleWords(count),
                  confirm: remindFreeConfirm(facts.remind.firstNames),
                }
              : null,
          reminded: facts.remind.remindedToday.length > 0 ? remindedTodayWords(facts.remind.remindedToday) : null,
        }
      : null;

  // The places: the People tab's counts and rows.
  const held = holdersOf(facts).length;
  const gaveBackRows = facts.people
    .filter((row) => rowMatches(row, "gave-back"))
    .map((row) => ({
      uid: row.uid,
      name: row.name,
      line:
        row.status.kind === "gave-back"
          ? gaveBackLine(row.status.reason, row.status.on)
          : row.status.kind === "left"
            ? gaveBackLine(statusWords(row.status), row.status.on)
            : null,
    }));
  const invited = facts.people
    .filter((row) => rowMatches(row, "invited"))
    .map((row) => ({
      name: row.name,
      on: row.status.kind === "invited" ? row.status.on : null,
      until: row.status.kind === "invited" ? row.status.until : null,
    }));
  const freed =
    gaveBackRows.length > 0 ? { title: freedTitle(gaveBackRows.length), text: invitedWords(invited, facts.today) } : null;

  // The facilitators: each group's, then who has not answered, in the order the groups are listed.
  const byGroup = new Map(facts.facilitating.map((entry) => [entry.groupId, entry] as const));
  const rows: ReadyFacilitatorRow[] = [];
  for (const group of facts.groups) {
    const entry = byGroup.get(group.id);
    if (!entry) continue;
    for (const person of entry.facilitators) {
      rows.push({
        uid: person.uid,
        name: person.name,
        groupName: group.name,
        chip: person.saidYes ? { words: FACILITATOR_CHIP.yes, tone: "yes" } : null,
      });
    }
    for (const ask of entry.waiting) {
      rows.push({ uid: ask.uid, name: ask.name, groupName: group.name, chip: { words: FACILITATOR_CHIP.waiting, tone: "waiting" } });
    }
  }

  return {
    title: GET_READY_TITLE,
    lede: getReadyLede(facts.groupsGoOut, facts.weekOneStarts),
    steps,
    notSaid,
    places: {
      held,
      of: facts.places,
      percent: facts.places && facts.places > 0 ? Math.min(100, Math.round((held / facts.places) * 100)) : null,
      heldWords: placesHeldWords(facts.places),
      coming: facts.counts.coming,
      haventSaid: facts.counts["havent-said"],
      gaveBack: facts.counts["gave-back"],
      gaveBackRows,
      freed,
      window: freedWindowWords(facts.freedWindow.state, facts.freedWindow.lastDay),
    },
    facilitators: {
      rows,
      training: facts.training ? trainingLine(facts.training) : null,
      empty: rows.length === 0 ? (facts.groups.length === 0 ? NO_GROUPS_YET : NO_GROUP_HAS_A_FACILITATOR) : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Publish's readiness check ("Ready?")
// ---------------------------------------------------------------------------

/** `done`, or what is in the way: `blocks` stops Publish; `check` is worth a look and no more. */
export type ReadyItemState = "done" | "blocks" | "check";

export type ReadyItem = {
  key: string;
  state: ReadyItemState;
  title: string;
  detail: string | null;
  /** Week 1's "Mark ready", while it holds something and is not ready. */
  markReady: { runId: string; weekId: string } | null;
  /** A way on: week 1's page, or People in groups to move somebody. */
  link: { to: "week-one" | "groups"; label: string } | null;
};

export type ReadinessModel = {
  /** Nothing Publish needs is missing. */
  ready: boolean;
  /**
   * Once the groups are published: when, in the Overview's checklist's own
   * words ("Published Tue 27 Oct, 10am."), and what a later move emails.
   * Null before the first press.
   */
  published: { when: string; later: string } | null;
  needed: ReadyItem[];
  worth: ReadyItem[];
};

function item(key: string, state: ReadyItemState, title: string, detail: string | null, extra: Partial<ReadyItem> = {}): ReadyItem {
  return { key, state, title, detail, markReady: extra.markReady ?? null, link: extra.link ?? null };
}

export function buildReadiness(facts: GetReadyFacts): ReadinessModel {
  const needed: ReadyItem[] = [];
  const worth: ReadyItem[] = [];
  const { untimed, noPlace } = groupGaps(facts);

  // ── A day and a time, and a room ──────────────────────────────────────────
  const timesOk = facts.groups.length > 0 && untimed.length === 0 && facts.runDated;
  if (timesOk && noPlace.length === 0) {
    needed.push(item("groups", "done", READY_ITEM.allThree, groupTimesWords(facts.groups.map((group) => group.short ?? ""))));
  } else {
    needed.push(
      item(
        "times",
        timesOk ? "done" : "blocks",
        READY_ITEM.times,
        facts.groups.length === 0
          ? NO_GROUPS_YET
          : !facts.runDated
            ? RUN_NOT_DATED
            : untimed.length > 0
              ? noTimeWords(groupsInWords(untimed), untimed.length)
              : groupTimesWords(facts.groups.map((group) => group.short ?? "")),
      ),
    );
    if (facts.groups.length > 0 && noPlace.length > 0) {
      worth.push(item("rooms", "check", READY_ITEM.rooms, noRoomWords(groupsInWords(noPlace), noPlace.length)));
    }
  }

  // ── Everyone holding a place in a group ─────────────────────────────────────
  // Needed while somebody on the run's list has no group (Publish waits for
  // them); worth checking otherwise.
  const { holding, inAGroup, notOnTheRun, toPlaceOnList } = facts.placing;
  if (toPlaceOnList.length > 0) {
    needed.push(
      item("placed", "blocks", READY_ITEM.placed, placedDetailWords(inAGroup, holding, toPlaceOnList.map((person) => person.firstName))),
    );
  }

  // ── A note, or none, for everybody placed outside the times they gave ──────
  // Needed while somebody Publish would tell has nothing chosen: the press
  // refuses on the same answer (`notesNeeded` on its plan).
  const owedChoice = facts.outside.filter((person) => !person.told);
  if (owedChoice.length > 0) {
    const missing = owedChoice.filter((person) => person.note === "missing");
    needed.push(
      item(
        "notes",
        missing.length > 0 ? "blocks" : "done",
        READY_ITEM.notes,
        missing.length > 0
          ? notesMissingWords(missing.map((person) => person.firstName || firstWordOf(person.name)))
          : notesChosenWords(
              owedChoice.filter((person) => person.note === "noted").length,
              owedChoice.filter((person) => person.note === "without").length,
            ),
      ),
    );
  }

  // ── Worth checking ──────────────────────────────────────────────────────────
  const f = facilitatingOf(facts);
  const said = facilitatorsSaid(facts);
  const facilitatorsTitle = said.state === "done" && f.byHand > 0 ? READY_ITEM.facilitating : READY_ITEM.facilitators;
  // "Every group has a facilitator." under "Every group has a facilitator" says nothing twice.
  worth.push(
    item(
      "facilitators",
      said.state === "done" ? "done" : "check",
      facilitatorsTitle,
      said.line === `${facilitatorsTitle}.` ? null : said.line,
    ),
  );

  if (toPlaceOnList.length === 0) {
    const detail = !facts.decisionsSent
      ? NOBODY_UNTIL_DECISIONS
      : holding === 0
        ? NOBODY_HOLDS_A_PLACE
        : notOnTheRun > 0
          ? `${placedDetailWords(inAGroup, holding, [])} ${notOnTheListWords(notOnTheRun, facts.viewer === "admin")}`
          : placedDetailWords(inAGroup, holding, []);
    worth.push(item("placed", holding > 0 && inAGroup >= holding ? "done" : "check", READY_ITEM.placed, detail));
  }

  if (!facts.weekOne) {
    worth.push(item("week-one", "check", READY_ITEM.weekOne, RUN_NOT_DATED));
  } else if (facts.weekOne.ready) {
    worth.push(item("week-one", "done", READY_ITEM.weekOne, readingTimeWords(facts.weekOneTime)));
  } else {
    worth.push(
      item("week-one", "check", READY_ITEM.weekOne, facts.weekOne.detail, {
        markReady: facts.weekOne.markReady ? { runId: facts.runId, weekId: "w01" } : null,
        link: facts.weekOne.open ? { to: "week-one", label: STEP_LINK.weekOne } : null,
      }),
    );
  }

  // Somebody placed at a time they said they cannot make: the one answer
  // the board's "Not free" card and Publish's plan ask
  // (`placedOutsideTheirTimes`), asked by the reader of the same facts.
  const groupById = new Map(facts.groups.map((group) => [group.id, group] as const));
  for (const person of facts.outside) {
    const group = groupById.get(person.groupId);
    if (!group) continue;
    const firstName = person.firstName || firstWordOf(person.name);
    worth.push(
      item(`fit-${person.uid}`, "check", placedNotFreeWords(person.name, group.name, group.meets), moveFirstWords(firstName), {
        link: { to: "groups", label: moveButtonWords(firstName) },
      }),
    );
  }

  return {
    ready: needed.every((entry) => entry.state === "done"),
    published: facts.published
      ? { when: publishedWords(facts.published.day, facts.published.clock), later: AFTER_PUBLISHED }
      : null,
    needed,
    worth,
  };
}
