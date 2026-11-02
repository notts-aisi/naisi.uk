import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { own } from "@/lib/applications/keys";
import type { ApplicationForm } from "@/lib/applications/normalise";
import type { CheckInSurveyDoc, SurveyAnswerDoc, SurveyDoc } from "@/lib/firestore/surveys";
import type { ChartGroupName, ChartInput, ChartSet, ChartWho } from "./chart";
import { ofProgramme, readRunWeeks, weekNumbersOf } from "./checkIns/weeks";
import { answersOf, checkInsOfRun, listCheckIns } from "./repo";
import { NO_GROUP, chosenAnswers, readChoice } from "./resultsFilters";
import { CHART_WORDS, everyoneWhoAnsweredWords, groupChoiceWords, programmeLine } from "./words";

/**
 * WHAT MAKE A CHART COUNTS, read on the server for its page and for its file
 * of numbers, so the two count the same answers: a survey's answers, or a
 * programme's check-ins, cut into the sets `./chart.ts` draws.
 *
 * ADMINS ONLY. The pages sit in the (admin-only) tree and the routes ask
 * `canRunSurveys` before they call this. A programme's lead never has a
 * chart, and never a group's figures: the lead reads check-ins a whole week
 * at a time, every group's together, behind floors, on the programme's own
 * Surveys tab.
 *
 *  - A SURVEY. Who is the Results' own filter (`chosenAnswers`): one group,
 *    by the group the person was told on the run, or nobody's, on a
 *    programme's survey; members or guests after an event. A chart split by
 *    group cuts the answers by the same groups, so a group's chart counts
 *    exactly the answers Who shows for that group. Neither is offered once
 *    names have come off, when nobody's group can be told.
 *  - A PROGRAMME'S CHECK-INS. The check-ins the programme's lead reads are
 *    read here too: the run's, opened for this programme (`ofProgramme`). An
 *    admin's chart counts every one of them as it stands, open ones and one
 *    opened after its week was fixed included, as an admin's own pages show
 *    each check-in. A check-in's group is the group whose session it was, so
 *    no seat or placement is read. The groups are the run's that still meet,
 *    in the one order of a run's groups (`readRunWeeks`), then any group a
 *    check-in was opened for that no longer meets, by the name it had then.
 *
 * Nothing here reads a name, a uid or an address: the answers travel as
 * answers alone, each set with its group and its week. Every query is one an
 * existing reader already makes, so none needs a declared index.
 */

export type LoadedChart = { input: ChartInput; who: ChartWho | null };

/** Answers as a chart counts them: the answers alone. */
const answerSets = (answers: readonly SurveyAnswerDoc[]) => answers.map((answer) => ({ answers: answer.answers }));

/** A survey's chart: its answers as Who narrows them, cut by group where the Who filter offers groups. */
export async function surveyChart(db: Firestore, survey: SurveyDoc, asked: { who?: string; as?: string }): Promise<LoadedChart> {
  const chosen = await chosenAnswers(db, survey, readChoice({ who: asked.who, as: asked.as }));
  const all = await answersOf(db, survey);
  const kept = chosen.only ? all.filter(chosen.only) : all;
  const { filters, grouped } = chosen;
  const who: ChartWho | null = filters.who
    ? { name: "who", choices: filters.who, chosen: filters.chosen.who }
    : filters.as
      ? { name: "as", choices: filters.as, chosen: filters.chosen.as }
      : null;
  // The one chart's name: the group or the kind of person Who chose, else everybody.
  const named = chosen.choice.who
    ? chosen.choice.who === NO_GROUP
      ? CHART_WORDS.noGroup
      : (grouped?.names.get(chosen.choice.who) ?? CHART_WORDS.everyone)
    : chosen.choice.as === "members"
      ? CHART_WORDS.members
      : chosen.choice.as === "guests"
        ? CHART_WORDS.guests
        : CHART_WORDS.everyone;

  if (!grouped) {
    return { input: { sets: [{ items: survey.items, answers: answerSets(kept), group: null, week: null }], groups: [], weeks: null, who: named }, who };
  }
  // Cut by group, in the run's one order, then nobody's group: only the groups holding an answer counted.
  const groupOf = (answer: SurveyAnswerDoc) => grouped.groupOf.get(answer.id) ?? NO_GROUP;
  const holding = new Set(kept.map(groupOf));
  const groups: ChartGroupName[] = [
    ...[...grouped.names].filter(([id]) => holding.has(id)).map(([id, name]) => ({ id, name })),
    ...(holding.has(NO_GROUP) ? [{ id: NO_GROUP, name: CHART_WORDS.noGroup }] : []),
  ];
  const sets: ChartSet[] = groups.map((group) => ({
    items: survey.items,
    answers: answerSets(kept.filter((answer) => groupOf(answer) === group.id)),
    group: group.id,
    week: null,
  }));
  return {
    input: { sets: sets.length > 0 ? sets : [{ items: survey.items, answers: [], group: null, week: null }], groups, weeks: null, who: named },
    who,
  };
}

/** A programme's check-ins, as their chart page heads them. */
export type CheckInsChart = LoadedChart & {
  /** "Fellowship: AGI Strategy". */
  programme: string;
  /** "AGI Strategy": the short name the check-ins' page is titled by. */
  name: string;
  /** The weeks a check-in was opened for, in order. */
  weeksAt: number[];
  /** Every answer to the programme's check-ins, whoever Who chose. */
  answers: number;
};

/**
 * A programme's check-ins, every group's, a set each, the programme read
 * from its application form (`form`, the form's own loader's, or null once the
 * form has gone). Null when the address names no programme with a check-in.
 */
export async function checkInsChart(
  db: Firestore,
  place: { roundId: string; programmeId: string; form: ApplicationForm | null },
  asked: { who?: string },
): Promise<CheckInsChart | null> {
  const { roundId, programmeId, form } = place;
  if (!isAddressableId(roundId) || !isAddressableId(programmeId)) return null;
  const settings = form && form.round.id === roundId ? (own(form.programmes, programmeId) ?? null) : null;
  // The run the programme names; once the form has gone, or it names another
  // run, the one its own check-ins were opened on.
  let checkIns: CheckInSurveyDoc[] = settings?.runId ? ofProgramme(await checkInsOfRun(db, settings.runId), roundId, programmeId) : [];
  if (checkIns.length === 0) {
    const anywhere = ofProgramme(await listCheckIns(db), roundId, programmeId);
    const runId = anywhere[anywhere.length - 1]?.runId ?? null;
    checkIns = anywhere.filter((survey) => survey.runId === runId);
  }
  if (checkIns.length === 0) return null;
  const runId = checkIns[0].runId;
  const [weeks, answers] = await Promise.all([
    readRunWeeks(db, runId),
    Promise.all(checkIns.map(async (survey) => [survey.id, await answersOf(db, survey)] as const)),
  ]);
  const answersOfCheckIn = new Map(answers);

  const newest = checkIns[checkIns.length - 1];
  const name = settings ? settings.shortName.trim() || settings.name.trim() : newest.programmeName;
  const programme = settings ? programmeLine(settings.kind, name) : programmeLine(newest.programmeKind, newest.programmeName);

  // The run's groups that still meet, in their one order, then any other group a check-in was opened for.
  const names = new Map<string, string>((weeks?.groups ?? []).map((group) => [group.id, group.name.trim() || "Untitled group"]));
  for (const survey of checkIns) {
    if (!names.has(survey.audience.groupId)) names.set(survey.audience.groupId, survey.checkIn.groupName.trim() || "Untitled group");
  }
  const counts = new Map<string, number>();
  for (const survey of checkIns) {
    counts.set(survey.audience.groupId, (counts.get(survey.audience.groupId) ?? 0) + (answersOfCheckIn.get(survey.id)?.length ?? 0));
  }
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const chosen = asked.who && names.has(asked.who) ? asked.who : "";
  const who: ChartWho = {
    name: "who",
    choices: [
      { value: "", label: everyoneWhoAnsweredWords(total) },
      ...[...names].map(([id, groupName]) => ({ value: id, label: groupChoiceWords(groupName, counts.get(id) ?? 0) })),
    ],
    chosen,
  };
  const groups: ChartGroupName[] = [...names].filter(([id]) => !chosen || id === chosen).map(([id, groupName]) => ({ id, name: groupName }));
  const sets: ChartSet[] = checkIns
    .filter((survey) => !chosen || survey.audience.groupId === chosen)
    .map((survey) => ({
      items: survey.items,
      answers: answerSets(answersOfCheckIn.get(survey.id) ?? []),
      group: survey.audience.groupId,
      week: survey.audience.weekNumber,
    }));
  return {
    input: {
      sets,
      groups,
      weeks: weekNumbersOf(weeks?.weeks ?? [], checkIns),
      who: chosen ? (names.get(chosen) ?? CHART_WORDS.everyone) : CHART_WORDS.everyone,
    },
    who,
    programme,
    name,
    weeksAt: [...new Set(checkIns.map((survey) => survey.audience.weekNumber))].sort((a, b) => a - b),
    answers: total,
  };
}
