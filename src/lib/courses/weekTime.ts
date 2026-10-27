import { isBlockWeek } from "./weekBlocks/model";
import { weekSources, weekThisWeek, type ReadableWeek } from "./weekBlocks/reader";

/**
 * HOW LONG A WEEK TAKES, IN WORDS: "about 80 minutes". THE ONE FUNCTION.
 *
 * The email that tells somebody their group says "Week 1’s reading takes
 * about 80 minutes." (board st-emails), and anything else that says how long
 * a week takes asks here, so a week is never timed two ways.
 *
 *  - A WEEK WRITTEN IN BLOCKS is timed by its This week box's "In all" (board
 *    st-week1-phone: "In all: About 80 minutes"), exactly as its lead wrote
 *    it, its first letter made small so it reads inside a sentence: "about 80
 *    minutes", "2 to 3 hours". It is free text and can be a range, so it is
 *    never read as a number, and nothing is worked out from the box's rows.
 *  - A WEEK WRITTEN BEFORE BLOCKS is timed by its materials' own minutes: the
 *    ones on its path that are not optional, added up as the week's own page
 *    adds them ("about 75 minutes"). Read through the one reader of a week's
 *    content (`weekSources`), so the two shapes are never counted apart.
 *
 * NULL WHEN THERE IS NOTHING TRUE TO SAY: no week, a week that is not
 * published, a block week with no "In all", and a week whose materials carry
 * no minutes. A caller then leaves its sentence out whole; it never guesses.
 *
 * Pure, with no server import, so a page and an email ask the same thing.
 */
export function weekReadingTime(week: (ReadableWeek & { published: boolean }) | null | undefined): string | null {
  if (!week || week.published !== true) return null;
  if (isBlockWeek(week)) {
    const total = (weekThisWeek(week)?.total ?? "").trim();
    return total ? smallFirstLetter(total) : null;
  }
  const minutes = weekSources(week)
    .filter((source) => !source.optional)
    .reduce((sum, source) => sum + (typeof source.minutes === "number" && source.minutes > 0 ? source.minutes : 0), 0);
  return minutes > 0 ? `about ${Math.round(minutes)} minutes` : null;
}

/**
 * "About 80 minutes" as it reads mid-sentence: "about 80 minutes". Only a
 * capital at the start of a word in small letters is made small, so a time
 * that opens with a name or a figure ("2 to 3 hours") is left as written, as
 * next week's email does it.
 */
function smallFirstLetter(text: string): string {
  const first = text.charAt(0);
  const second = text.charAt(1);
  const isCapital = first >= "A" && first <= "Z";
  const isSmall = second >= "a" && second <= "z";
  return isCapital && isSmall ? `${first.toLowerCase()}${text.slice(1)}` : text;
}
