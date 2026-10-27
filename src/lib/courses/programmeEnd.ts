/**
 * THE LAST WEEK OF A PROGRAMME, AS A MEMBER'S PAGES KNOW IT (board
 * wk-lastweek-phone): the reader's own calendar is in its last taught week.
 * The calendar is the group-first one every member page reads (a group run
 * behind or pushed back is in its own last week, not the run's), so Home's
 * two halves (the cards at the top, and the programme's own) and the overview
 * route that hands them what's next all ask the same question of the same
 * week.
 *
 * Pure: no reads, no clock. A break has no week number, so a break is never
 * the last week.
 */
export function inLastWeek(
  week: { phase: "before" | "running" | "after"; weekNumber: number | null } | null,
  totalWeeks: number,
): boolean {
  return week !== null && week.phase === "running" && totalWeeks > 0 && week.weekNumber === totalWeeks;
}

/**
 * HOME'S SURVEY AT THE END (wk-lastweek-phone): in the last week of the
 * programme Home is about (`programme`, null on a Home about something else,
 * such as a facilitator's), that programme's survey at the end leaves the
 * cards at the top of Home and is handed to the programme's own cards, which
 * draw it as "The survey at the end": one survey, one card. Every other card,
 * and every week but the last, stays at the top as it was.
 */
export function endSurveyOnHome<Card extends { kind: string; runId: string; surveyId: string }>(
  surveys: readonly Card[],
  programme: {
    runId: string;
    currentWeek: { phase: "before" | "running" | "after"; weekNumber: number | null } | null;
    totalWeeks: number;
  } | null,
): { top: Card[]; programme: Card | null } {
  const end =
    programme && inLastWeek(programme.currentWeek, programme.totalWeeks)
      ? (surveys.find((card) => card.kind === "after" && card.runId === programme.runId) ?? null)
      : null;
  return { top: end ? surveys.filter((card) => card.surveyId !== end.surveyId) : [...surveys], programme: end };
}
