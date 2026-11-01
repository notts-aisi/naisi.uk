import { weekNotesPath, weekReviewPath } from "./paths";

/**
 * The two pages under a week whose first session has started, as tabs at
 * the head of each: the week's review (an admin's alone) and its notes about
 * people (an admin's drafts, and the saved notes the programme's lead
 * reads). The lead pressing Review is drawn the review's calm "for admins".
 *
 * Pure: the addresses and the words, for either page to draw with
 * `SectionTabs`.
 */

export const WEEK_TABS_LABEL = "This week";

export function weekTabs(roundId: string, programmeId: string, weekId: string) {
  return [
    { key: "review", label: "Review", href: weekReviewPath(roundId, programmeId, weekId) },
    { key: "notes", label: "Notes about people", href: weekNotesPath(roundId, programmeId, weekId) },
  ];
}
