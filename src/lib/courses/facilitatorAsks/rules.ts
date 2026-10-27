import { own } from "../../applications/keys";
import type {
  AnswerValue,
  ApplicationContent,
  ApplicationQuestion,
  ProgrammeSettings,
  QuestionSetDoc,
} from "../../applications/model";
import type { Standing } from "../../applications/status/standing";
import { londonWallClockToInstant } from "../weekPlan";
import type { FacilitatorAsk, WallClock } from "./model";
import {
  ACCOUNT_WAITING,
  CANT_UNTIL_APPROVED,
  CANT_UNTIL_ANSWERED,
  GAVE_PLACE_BACK,
  INVITED_ELSEWHERE,
  NO_OFFER,
  TAKING_PART_ELSEWHERE,
  askedWords,
  dayIn,
  facilitatingWords,
  invitedToWords,
  noReplyByWords,
  saidNoWords,
  saidYesWords,
  seatTakenWords,
  takingPartWords,
} from "./words";

/**
 * THE RULES OF ASKING SOMEBODY TO FACILITATE, as pure functions the page, the
 * routes and the tests all ask:
 *
 *  - WHO WOULD LIKE TO: somebody who said yes to facilitating on the form and
 *    chose this programme or "Either" (`wouldFacilitate`), read from the
 *    form's own facilitator questions, whatever they are called.
 *  - WHAT THE LEAD IS SHOWN of them: the answers to the form's facilitator
 *    questions, one column each (`facilitatorColumns`), and nothing else the
 *    form holds.
 *  - WHERE AN ASK STANDS (`askStateOf`), and so WHERE A PERSON STANDS
 *    (`personStatus`), which decides whether they may be asked at all.
 *
 * SOMEBODY HOLDING A PLACE ON THIS PROGRAMME MAY BE ASKED. A facilitator can
 * be one of the programme's fellows too (the rule that nobody facilitates a
 * programme they take part in, Q21, was lifted on 26 October 2026): they do
 * the course in the group they facilitate, and a yes places them in it
 * (`src/lib/courses/groupFacilitators.ts`). Somebody INVITED to it who has
 * not answered is asked once they have (`invitedTo`): until then nobody knows
 * whether they will hold a place, and so where a yes would put them.
 *
 * No reads, no clock of its own: every caller hands over `now`.
 */

// ---------------------------------------------------------------------------
// Who would like to facilitate a programme
// ---------------------------------------------------------------------------

/** The option a question whose choices are programmes always adds. The form's own word. */
export const EITHER = "Either";

type Form = { programmeIds: string[]; programmes: Record<string, ProgrammeSettings> };
type Sets = readonly Pick<QuestionSetDoc, "id" | "role" | "questions">[];
type Content = Pick<ApplicationContent, "wantsToFacilitate" | "rankedProgrammeIds" | "answers">;

/** The form's facilitator question sets, in the order given. */
export function facilitatorSets<S extends Pick<QuestionSetDoc, "role">>(sets: readonly S[]): S[] {
  return sets.filter((set) => set.role === "facilitator");
}

/** True when an option names one of the form's programmes, by either of its names. */
function namesAProgramme(form: Form, option: string): boolean {
  return form.programmeIds.some((id) => {
    const programme = own(form.programmes, id);
    return programme !== undefined && (programme.shortName === option || programme.name === option);
  });
}

/**
 * THE QUESTION THAT ASKS WHICH PROGRAMME: a pick-one whose options are the
 * programmes the person ranked (`optionsFromRanking`), or whose own options
 * name the form's programmes. The live form's is "Which would you like to
 * facilitate?" with AGI Strategy, Technical AI Safety and Either. Null on a
 * form whose facilitator questions ask nothing of the kind.
 */
export function programmeQuestionOf(
  form: Form,
  sets: Sets,
): { setId: string; question: ApplicationQuestion } | null {
  for (const set of facilitatorSets(sets)) {
    for (const question of set.questions) {
      if (question.type !== "choice") continue;
      if (question.optionsFromRanking || question.options.some((option) => namesAProgramme(form, option))) {
        return { setId: set.id, question };
      }
    }
  }
  return null;
}

/**
 * Would this person like to facilitate this programme? They said yes to
 * facilitating, and chose it by either of its names, or "Either" where Either
 * covers it: the programmes they ranked, for a question whose options are
 * their ranking, or the programmes the question's own options name. On a form
 * that never asks which, everybody who said yes and ranked the programme.
 */
export function wouldFacilitate(form: Form, sets: Sets, content: Content, programme: ProgrammeSettings): boolean {
  if (content.wantsToFacilitate !== true) return false;
  const asked = programmeQuestionOf(form, sets);
  if (!asked) return content.rankedProgrammeIds.includes(programme.id);
  const answer = own(own(content.answers, asked.setId), asked.question.id);
  if (typeof answer !== "string") return false;
  if (answer === programme.shortName || answer === programme.name) return true;
  if (answer !== EITHER) return false;
  if (asked.question.optionsFromRanking) return content.rankedProgrammeIds.includes(programme.id);
  return asked.question.options.some((option) => option === programme.shortName || option === programme.name);
}

// ---------------------------------------------------------------------------
// The table's columns
// ---------------------------------------------------------------------------

/** One column of the table: one of the form's facilitator questions. */
export type FacilitatorColumn = {
  /** `${setId}/${questionId}`. */
  key: string;
  /** The question as the form asks it. */
  header: string;
  /** A written answer is shown as a quote; a choice as it was picked. */
  look: "quote" | "plain";
};

/**
 * THE COLUMNS ARE THE FORM'S OWN QUESTIONS (C8): every question in the form's
 * facilitator sets, in the form's order, except the one that asks which
 * programme, which decides who is listed and is said once above the table.
 * Nothing else the form holds is ever a column.
 */
export function facilitatorColumns(form: Form, sets: Sets): FacilitatorColumn[] {
  const programmeQuestion = programmeQuestionOf(form, sets);
  const columns: FacilitatorColumn[] = [];
  for (const set of facilitatorSets(sets)) {
    for (const question of set.questions) {
      if (programmeQuestion && set.id === programmeQuestion.setId && question.id === programmeQuestion.question.id) {
        continue;
      }
      columns.push({
        key: `${set.id}/${question.id}`,
        header: question.text,
        look: question.type === "short" || question.type === "long" ? "quote" : "plain",
      });
    }
  }
  return columns;
}

/** One answer as the table shows it: a pick, a list, a point on a scale, or what they wrote. */
export function answerWords(question: Pick<ApplicationQuestion, "type" | "options">, value: AnswerValue | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "number") return question.type === "scale" ? (question.options[value] ?? "") : "";
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === "string").join(", ");
  return value.replace(/\s+/g, " ").trim();
}

/** Each column's answer for one person, by column key. Blank where they left a question out. */
export function answersFor(form: Form, sets: Sets, content: Pick<ApplicationContent, "answers">): Record<string, string> {
  const out: Record<string, string> = {};
  const columns = new Set(facilitatorColumns(form, sets).map((column) => column.key));
  for (const set of facilitatorSets(sets)) {
    const given = own(content.answers, set.id);
    for (const question of set.questions) {
      const key = `${set.id}/${question.id}`;
      if (!columns.has(key)) continue;
      out[key] = answerWords(question, own(given, question.id));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Where an ask stands
// ---------------------------------------------------------------------------

/** The instant an ask's day and time to answer by falls on, in London. */
export function replyByInstant(replyBy: WallClock): Date {
  return londonWallClockToInstant(replyBy.dateKey, replyBy.time);
}

export type AskState =
  /** Asked, not answered, and still open. */
  | { kind: "waiting" }
  | { kind: "yes" }
  | { kind: "no" }
  /** The day and time to answer by has gone with no answer. */
  | { kind: "late" }
  /** Somebody else said yes to the same seat first. */
  | { kind: "taken"; byUid: string };

/**
 * Where one ask stands, among every ask of its run. An answer is final; an
 * unanswered ask closes when another ask for its seat is said yes to, or when
 * its day and time to answer by has gone.
 */
export function askStateOf(ask: FacilitatorAsk, runAsks: readonly FacilitatorAsk[], now: Date): AskState {
  if (ask.answer === "yes") return { kind: "yes" };
  if (ask.answer === "no") return { kind: "no" };
  const taker = runAsks.find((other) => other.id !== ask.id && other.seat === ask.seat && other.answer === "yes");
  if (taker) return { kind: "taken", byUid: taker.uid };
  if (now.getTime() >= replyByInstant(ask.replyBy).getTime()) return { kind: "late" };
  return { kind: "waiting" };
}

/** A London day an instant falls on, as the board writes it: "Mon 26 Oct". */
export function londonDayOf(at: Date | null): string {
  if (!at) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return dayIn(`${get("year")}-${get("month")}-${get("day")}`) ?? "";
}

// ---------------------------------------------------------------------------
// Where a person stands, and whether they may be asked
// ---------------------------------------------------------------------------

export type ChipTone = "yes" | "asked" | "quiet";

export type PersonStatus = {
  /** The status chip, or null for nothing to say. */
  chip: { words: string; tone: ChipTone } | null;
  /** A line under the chip: why they cannot be asked. */
  note: string | null;
  /**
   * `button`: "Ask to facilitate…" is offered. `asked`: an ask stands (waiting,
   * yes or no), and the column says "Asked". `none`: nothing is offered.
   */
  ask: "button" | "asked" | "none";
  /** The ask that decides the status, if one does. */
  askId: string | null;
};

export type PersonFacts = {
  programme: Pick<ProgrammeSettings, "id" | "shortName">;
  /** Where they stand on the form, read by `standingOf`. */
  standing: Standing;
  /** Their account's role: only an approved account can facilitate. */
  role: string | null;
  /** Whether decision day has been sent. Before it, nobody is asked. */
  decisionsSent: boolean;
  /** Every ask of the run, so a seat taken by somebody else is seen. */
  runAsks: readonly FacilitatorAsk[];
  /** The groups of this run they facilitate now, by id, with each one's name. */
  facilitates: ReadonlyMap<string, string>;
  /** Each group's name, by id, for the words that name one. */
  groupNames: ReadonlyMap<string, string>;
  now: Date;
};

const APPROVED = new Set(["member", "committee", "admin"]);

/** Somebody whose account may facilitate: approved, and not refused. */
export function isApprovedRole(role: string | null): boolean {
  return role !== null && APPROVED.has(role);
}

/**
 * Where one person on the list stands, in the board's words, and whether they
 * may be asked. The order is the order of what matters most: an ask they have
 * answered or not yet, then a group they already facilitate, then an
 * invitation to the programme they have not answered, then whether asking
 * has opened at all, then their account, and last where decision day left
 * them. Holding a place on the programme stops nobody being asked.
 */
export function personStatus(uid: string, facts: PersonFacts): PersonStatus {
  const asks = facts.runAsks
    .filter((ask) => ask.uid === uid && ask.programmeId === facts.programme.id)
    .sort((a, b) => (b.askedAt?.getTime() ?? 0) - (a.askedAt?.getTime() ?? 0));
  const states = asks.map((ask) => ({ ask, state: askStateOf(ask, facts.runAsks, facts.now) }));

  // A yes stands while they still facilitate the group it was for.
  const yes = states.find(({ ask, state }) => state.kind === "yes" && facts.facilitates.has(ask.groupId));
  if (yes) {
    return { chip: { words: saidYesWords(londonDayOf(yes.ask.answeredAt)), tone: "yes" }, note: null, ask: "asked", askId: yes.ask.id };
  }
  const waiting = states.find(({ state }) => state.kind === "waiting");
  if (waiting) {
    return {
      chip: { words: askedWords(londonDayOf(waiting.ask.askedAt)), tone: "asked" },
      note: null,
      ask: "asked",
      askId: waiting.ask.id,
    };
  }
  const no = states.find(({ state }) => state.kind === "no");
  if (no) {
    return { chip: { words: saidNoWords(londonDayOf(no.ask.answeredAt)), tone: "quiet" }, note: null, ask: "asked", askId: no.ask.id };
  }
  const facilitating = [...facts.facilitates.values()][0];
  if (facilitating !== undefined) {
    return { chip: { words: facilitatingWords(facilitating), tone: "quiet" }, note: null, ask: "none", askId: null };
  }

  const { standing, programme } = facts;
  if (invitedTo(standing, programme.id)) {
    return { chip: { words: invitedToWords(programme.shortName), tone: "quiet" }, note: CANT_UNTIL_ANSWERED, ask: "none", askId: null };
  }
  if (!facts.decisionsSent) return { chip: null, note: null, ask: "none", askId: null };
  if (!isApprovedRole(facts.role)) {
    return { chip: { words: ACCOUNT_WAITING, tone: "quiet" }, note: CANT_UNTIL_APPROVED, ask: "none", askId: null };
  }

  // An ask that closed with no answer leaves them free to be asked again.
  const closed = states[0];
  if (closed?.state.kind === "late") {
    return {
      chip: { words: noReplyByWords(dayIn(closed.ask.replyBy.dateKey) ?? ""), tone: "quiet" },
      note: null,
      ask: "button",
      askId: closed.ask.id,
    };
  }
  if (closed?.state.kind === "taken") {
    const group = facts.groupNames.get(closed.ask.groupId) ?? "the group";
    return { chip: { words: seatTakenWords(group), tone: "quiet" }, note: null, ask: "button", askId: closed.ask.id };
  }

  const chip = standingChip(standing, programme);
  return { chip: chip ? { words: chip, tone: "quiet" } : null, note: null, ask: "button", askId: null };
}

/** Where decision day left somebody, for a person who may be asked. */
function standingChip(standing: Standing, programme: Pick<ProgrammeSettings, "id" | "shortName">): string | null {
  switch (standing.kind) {
    case "place":
      return standing.programmeId === programme.id ? takingPartWords(programme.shortName) : TAKING_PART_ELSEWHERE;
    case "invitation":
      return standing.programmeId === programme.id ? null : INVITED_ELSEWHERE;
    case "released":
      return GAVE_PLACE_BACK;
    case "no-place":
      return NO_OFFER;
    default:
      return null;
  }
}

/** May this person be asked to facilitate the programme now? The one answer every writer asks. */
export function mayBeAsked(uid: string, facts: PersonFacts): boolean {
  return personStatus(uid, facts).ask === "button";
}

/**
 * True for somebody holding a place on the programme: one of its fellows,
 * so a yes from them places them in the group they facilitate.
 */
export function hasPlaceOn(standing: Standing, programmeId: string): boolean {
  return standing.kind === "place" && standing.programmeId === programmeId;
}

/**
 * True for somebody invited to the programme who has not answered: they are
 * asked, and their yes is taken, once they have answered.
 */
export function invitedTo(standing: Standing, programmeId: string): boolean {
  return standing.kind === "invitation" && standing.programmeId === programmeId;
}
