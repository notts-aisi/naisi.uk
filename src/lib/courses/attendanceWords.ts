/**
 * HOW THE ATTENDANCE TAB WORDS A WEEK'S COUNT of who came: "7 of 8 came", and
 * "6 of 8 came so far" while a session that week is still to come or its
 * register is not finished (`GridWeekTotal.soFar`). The tab draws it in the
 * browser, and the Surveys tab's Overview repeats the tab's own count with it
 * on the server, so the two say a week alike. Pure, with no imports.
 */
export function cameWords(came: number, of: number, soFar: boolean): string {
  return `${came} of ${of} came${soFar ? " so far" : ""}`;
}
