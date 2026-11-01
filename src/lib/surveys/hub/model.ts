import { SESSION_REPORT_QUESTIONS } from "@/lib/firestore/courseSessionReports";
import { isEventAudience, programmeOf, type SurveyDoc } from "@/lib/firestore/surveys";
import type { CheckInListGroup, CheckInListRow } from "../checkIns/adminView";
import { closedOn, surveyState } from "../repo";
import type { SurveyTemplate } from "../templates";
import { LIST_WORDS, closesWords, dayWords, notAnsweredWords, programmeLine } from "../words";
import {
  HUB_LABELS,
  HUB_WORDS,
  answeredLineWords,
  dueAtLastSessionWords,
  eventAnswersWords,
  reportQuestionsWords,
  rowLineWords,
  sentOnWords,
  stageRowWords,
  weeksWords,
} from "./words";

/**
 * RUN NAISI › SURVEYS, BY WHAT EACH SURVEY IS FOR, as plain values the page
 * draws: a card per programme, and the surveys after events. Nothing here
 * reads: the records are read by `./load.ts`, after the page has decided the
 * caller is an admin, and handed in with what their people rows say.
 *
 * Two promises the shape keeps:
 *
 *  - EVERY SURVEY IS ON IT, ONCE. A survey after an event is a row of the
 *    Events tab; every other survey is a row of its programme's card, whether
 *    or not the programme is this term's, and whether or not its form is still
 *    there (it is named by what the survey kept). Each check-in is a row under
 *    its programme's Weekly check-ins.
 *  - NOTHING IS PROMISED THAT DOES NOT HAPPEN. Programme surveys are sent by
 *    hand, so a survey at the end not sent yet says when it is due, never that
 *    it is scheduled; a row for a survey nobody has made has no link.
 *
 * THE TERM is `chooseTerm`'s, the one This term in numbers counts: its
 * programmes come first, in the form's order, each with a row for every
 * stage it will have (before, the check-ins, the facilitators' reports, the
 * end and leaving) made or not. Every other programme with a survey or a
 * check-in follows, the most recent first, with the rows it has.
 */

/** A survey with what its people rows say: how many it went to, how many answered, and how many Remind reaches now. */
export type CountedSurvey = { survey: SurveyDoc; sent: number; answered: number; remind: number };

/** A programme on an application form, as its card is named. */
export type FormProgramme = {
  programmeId: string;
  /** "Fellowship: AGI Strategy". */
  title: string;
  /** Whether it names a course run, so its facilitators' reports have a page. */
  hasRun: boolean;
};

/** An application form, with its programmes in the form's own order. */
export type FormFacts = { roundId: string; label: string; programmes: FormProgramme[] };

/** One programme's check-ins, as the check-ins' own list groups them, with the weeks they were at. */
export type ProgrammeCheckIns = { group: CheckInListGroup; weeks: number[]; latest: number };

export type HubInput = {
  forms: readonly FormFacts[];
  /** The term's form, or null before any form has opened. */
  termRoundId: string | null;
  /**
   * "Wed 9 Dec": the last session of each of the term's programmes whose
   * survey at the end has not gone out, by programme key. Left out when the
   * run's sessions cannot be dated.
   */
  lastDays: ReadonlyMap<string, string>;
  /** Every survey but those after events, counted. */
  surveys: readonly CountedSurvey[];
  checkIns: readonly ProgrammeCheckIns[];
  now: Date;
};

export type HubChip = { word: string; tone: "neutral" | "success" | "accent"; dot: boolean };

export type HubLink = { href: string; label: string; aria: string };

/** One row: a survey, a stage not made yet, the check-ins, or the reports. */
export type HubRow = {
  key: string;
  name: string;
  line: string;
  chip: HubChip | null;
  /** "Remind", with "12 haven’t answered" under it: open, a sent survey, and somebody it reaches has not answered. */
  remind: (HubLink & { note: string }) | null;
  /** The row's way in: a survey's Results, a draft's Questions, or the reports' page. */
  link: HubLink | null;
  /** The check-ins' row only: each check-in, newest first, opened in place. */
  checkIns: CheckInListRow[] | null;
  /** The check-ins' row only, once there is a check-in: Make a chart across them. */
  chart: HubLink | null;
};

export type ProgrammeCard = {
  /** The form and the programme. */
  key: string;
  /** "Fellowship: AGI Strategy". */
  title: string;
  /** "Autumn 2026": the form's name, or "" once the form has gone. */
  term: string;
  rows: HubRow[];
};

export type HubView = { tab: "programmes"; cards: ProgrammeCard[] } | { tab: "events"; rows: HubRow[] };

/** One key for one programme of one form. Ids never hold a colon. */
export function programmeKey(roundId: string, programmeId: string): string {
  return `${roundId}:${programmeId}`;
}

const SURVEY_HREF = (id: string, tab: "results" | "questions") => `/admin/surveys/${encodeURIComponent(id)}/${tab}`;

const STATE_CHIP: Record<"draft" | "open" | "closed", HubChip> = {
  draft: { word: HUB_WORDS.draft, tone: "neutral", dot: false },
  open: { word: LIST_WORDS.open, tone: "success", dot: true },
  closed: { word: LIST_WORDS.closed, tone: "neutral", dot: false },
};

const EVERY_SESSION: HubChip = { word: HUB_WORDS.everySession, tone: "accent", dot: false };

const time = (at: Date | null | undefined) => at?.getTime() ?? 0;

/**
 * One survey's row. A draft says it has not gone out, with `due` beside it
 * for the survey at the end of the term's programmes, and leads to its
 * Questions; once sent, when it went, how many of the people it went to have
 * answered and when it closes, and leads to its Results. The survey about
 * leaving is opened rather than sent and reaches each person as they leave.
 */
function surveyRow(counted: CountedSurvey, now: Date, name: string, due = ""): HubRow {
  const { survey, sent, answered, remind } = counted;
  const state = surveyState(survey, now);
  const leaving = survey.kind === "leaving";
  if (state === "draft") {
    return {
      key: survey.id,
      name,
      line: rowLineWords([leaving ? HUB_WORDS.notOpen : LIST_WORDS.notSent, due]),
      chip: STATE_CHIP.draft,
      remind: null,
      link: { href: SURVEY_HREF(survey.id, "questions"), label: LIST_WORDS.edit, aria: HUB_LABELS.edit(survey.name) },
      checkIns: null,
      chart: null,
    };
  }
  const ends = closedOn(survey);
  const closes = ends ? closesWords(ends, state === "closed") : leaving ? LIST_WORDS.neverCloses : "";
  const first = leaving ? HUB_WORDS.whenSomeoneLeaves : survey.firstSentAt ? sentOnWords(survey.firstSentAt) : "";
  // Remind is the Send tab's, for a survey that is sent: never one about leaving.
  const reminds = state === "open" && !leaving && remind > 0;
  // A survey about leaving that has reached nobody says so, not "0 of 0 answered".
  const answers = leaving && sent === 0 ? HUB_WORDS.nobodyLeft : answeredLineWords(answered, sent);
  return {
    key: survey.id,
    name,
    line: rowLineWords([first, answers, closes]),
    chip: STATE_CHIP[state],
    remind: reminds
      ? { href: `/admin/surveys/${encodeURIComponent(survey.id)}/send`, label: LIST_WORDS.remind, aria: HUB_LABELS.remind(survey.name), note: notAnsweredWords(remind) }
      : null,
    link: { href: SURVEY_HREF(survey.id, "results"), label: LIST_WORDS.results, aria: HUB_LABELS.results(survey.name) },
    checkIns: null,
    chart: null,
  };
}

/** A stage of one of the term's programmes nobody has made a survey for yet: what it will be, and no way in. */
function notMadeRow(key: string, stage: SurveyTemplate, line: string): HubRow {
  return { key: `${key}:${stage}`, name: stageRowWords(stage), line, chip: null, remind: null, link: null, checkIns: null, chart: null };
}

/**
 * The Weekly check-ins row: the weeks they were at and how many, opening on
 * each one, and on Make a chart across them once there is one.
 */
function checkInsRow(key: string, programme: { roundId: string; programmeId: string; title: string }, checkIns: ProgrammeCheckIns | null): HubRow {
  const chart = `/admin/surveys/check-ins/${encodeURIComponent(programme.roundId)}/${encodeURIComponent(programme.programmeId)}/chart`;
  return {
    key: `${key}:checkIns`,
    name: HUB_WORDS.checkIns,
    line: checkIns ? rowLineWords([weeksWords(checkIns.weeks), checkIns.group.line]) : HUB_WORDS.noneYet,
    chip: EVERY_SESSION,
    remind: null,
    link: null,
    checkIns: checkIns ? checkIns.group.rows : null,
    chart: checkIns ? { href: chart, label: HUB_WORDS.makeChart, aria: HUB_LABELS.makeChart(programme.title) } : null,
  };
}

/**
 * The Facilitators' reports row: how many questions a report asks, counted
 * from the record's own list of them, and the way to the programme's page of
 * reports, which names people and is the programme lead's and admins'. No
 * report is read for it.
 */
function reportsRow(roundId: string, programmeId: string, title: string): HubRow {
  const base = `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}`;
  return {
    key: `${programmeKey(roundId, programmeId)}:reports`,
    name: HUB_WORDS.reports,
    line: reportQuestionsWords(SESSION_REPORT_QUESTIONS.length),
    chip: EVERY_SESSION,
    remind: null,
    link: { href: `${base}/surveys/reports`, label: HUB_WORDS.readThem, aria: HUB_LABELS.reports(title) },
    checkIns: null,
    chart: null,
  };
}

/** The stages a card draws, in the order a programme meets them. */
const STAGES: readonly SurveyTemplate[] = ["before", "after", "leaving", "followUp6", "followUp12"];

type Gathered = { surveys: CountedSurvey[]; checkIns: ProgrammeCheckIns | null };

/** One card's rows. `term` draws a row for every stage a programme of the term will have, made or not. */
function rowsOf(
  key: string,
  programme: { roundId: string; programmeId: string; title: string; hasRun: boolean },
  gathered: Gathered,
  term: boolean,
  lastDay: string | null,
  now: Date,
): HubRow[] {
  const ofStage = (stage: SurveyTemplate) =>
    gathered.surveys
      .filter((counted) => counted.survey.kind === stage)
      .sort((a, b) => time(a.survey.createdAt) - time(b.survey.createdAt) || a.survey.id.localeCompare(b.survey.id));
  const due = term && lastDay ? dueAtLastSessionWords(lastDay) : "";
  const stageRows = (stage: SurveyTemplate): HubRow[] => {
    const made = ofStage(stage).map((counted) => surveyRow(counted, now, stageRowWords(stage), stage === "after" ? due : ""));
    if (made.length > 0 || !term || stage === "followUp6" || stage === "followUp12") return made;
    if (stage === "leaving") return [notMadeRow(key, stage, HUB_WORDS.notOpen)];
    return [notMadeRow(key, stage, rowLineWords([LIST_WORDS.notSent, stage === "after" ? due : ""]))];
  };
  const rows: HubRow[] = [...stageRows("before")];
  if (term || gathered.checkIns) rows.push(checkInsRow(key, programme, gathered.checkIns));
  if (programme.hasRun) rows.push(reportsRow(programme.roundId, programme.programmeId, programme.title));
  for (const stage of STAGES.slice(1)) rows.push(...stageRows(stage));
  // A survey of a kind no stage draws is still listed, by its own name, so none is ever out of reach.
  for (const counted of gathered.surveys) {
    if (!STAGES.includes(counted.survey.kind as SurveyTemplate)) rows.push(surveyRow(counted, now, counted.survey.name));
  }
  return rows;
}

/** When a programme last had anything: its newest survey, sent or made, or its newest check-in. */
function latestOf(gathered: Gathered): number {
  const surveys = gathered.surveys.map((counted) => Math.max(time(counted.survey.createdAt), time(counted.survey.firstSentAt)));
  return Math.max(0, gathered.checkIns?.latest ?? 0, ...surveys);
}

/** THE BY PROGRAMME TAB: the term's programmes, then every other programme with a survey or a check-in. */
export function programmeCards(input: HubInput): ProgrammeCard[] {
  const gathered = new Map<string, Gathered>();
  const gather = (key: string) => {
    let found = gathered.get(key);
    if (!found) {
      found = { surveys: [], checkIns: null };
      gathered.set(key, found);
    }
    return found;
  };
  for (const counted of input.surveys) {
    if (isEventAudience(counted.survey.audience)) continue;
    const { roundId, programmeId } = programmeOf(counted.survey.audience);
    gather(programmeKey(roundId, programmeId)).surveys.push(counted);
  }
  for (const checkIns of input.checkIns) gather(checkIns.group.key).checkIns = checkIns;

  const forms = new Map(input.forms.map((form) => [form.roundId, form]));
  const cards: ProgrammeCard[] = [];
  const term = input.termRoundId ? (forms.get(input.termRoundId) ?? null) : null;
  const drawn = new Set<string>();
  if (term) {
    for (const programme of term.programmes) {
      const key = programmeKey(term.roundId, programme.programmeId);
      drawn.add(key);
      const facts = { roundId: term.roundId, ...programme };
      const found = gathered.get(key) ?? { surveys: [], checkIns: null };
      cards.push({ key, title: programme.title, term: term.label, rows: rowsOf(key, facts, found, true, input.lastDays.get(key) ?? null, input.now) });
    }
  }

  const others: { card: ProgrammeCard; latest: number }[] = [];
  for (const [key, found] of gathered) {
    if (drawn.has(key)) continue;
    const [roundId, programmeId] = key.split(":");
    const form = forms.get(roundId) ?? null;
    const onForm = form?.programmes.find((programme) => programme.programmeId === programmeId) ?? null;
    // Named as the form names it while it is there, else as its newest survey kept it.
    const newest = [...found.surveys].sort((a, b) => time(b.survey.createdAt) - time(a.survey.createdAt))[0]?.survey ?? null;
    const title = onForm?.title ?? (newest ? programmeLine(newest.programmeKind, newest.programmeName) : found.checkIns?.group.programme ?? "");
    others.push({
      card: {
        key,
        title,
        term: form?.label ?? "",
        rows: rowsOf(key, { roundId, programmeId, title, hasRun: onForm?.hasRun ?? false }, found, false, null, input.now),
      },
      latest: latestOf(found),
    });
  }
  others.sort((a, b) => b.latest - a.latest || a.card.title.localeCompare(b.card.title, "en") || a.card.key.localeCompare(b.card.key));
  return [...cards, ...others.map((other) => other.card)];
}

/**
 * THE EVENTS TAB: each survey after an event, the newest event first. Its
 * answers are a count, never "of" anybody (its QR code takes answers from
 * people it was never emailed to), and nobody is reminded from here.
 */
export function eventRows(surveys: readonly CountedSurvey[], now: Date): HubRow[] {
  const startOf = (survey: SurveyDoc) => time(survey.event?.startAt);
  return surveys
    .filter((counted) => isEventAudience(counted.survey.audience))
    .sort(
      (a, b) =>
        startOf(b.survey) - startOf(a.survey) ||
        time(b.survey.createdAt) - time(a.survey.createdAt) ||
        a.survey.id.localeCompare(b.survey.id),
    )
    .map(({ survey, answered }) => {
      const state = surveyState(survey, now);
      const ends = closedOn(survey);
      const day = survey.event?.startAt ? dayWords(survey.event.startAt) : "";
      const draft = state === "draft";
      return {
        key: survey.id,
        name: survey.name,
        line: rowLineWords([day, draft ? LIST_WORDS.notSent : eventAnswersWords(answered), !draft && ends ? closesWords(ends, state === "closed") : ""]),
        chip: STATE_CHIP[state],
        remind: null,
        link: draft
          ? { href: SURVEY_HREF(survey.id, "questions"), label: LIST_WORDS.edit, aria: HUB_LABELS.edit(survey.name) }
          : { href: SURVEY_HREF(survey.id, "results"), label: LIST_WORDS.results, aria: HUB_LABELS.results(survey.name) },
        checkIns: null,
        chart: null,
      };
    });
}
