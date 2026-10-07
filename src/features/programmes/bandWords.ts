import { statusLineParts, termCivilDay, termDay, termTime, type StatusLineFacts } from "@/features/term/termWords";

/**
 * THE WORDS OF THE CLOSING BAND, FOR EACH STAGE OF THE TERM.
 *
 * While the form is taking applications the band says the day to apply by,
 * in the words a course's own page uses: "Apply by Sun 18 Oct." then
 * "Applications close at 23:59. We’ll email you on Fri 23 Oct."
 *
 * At every other stage it says what the line under the hero says, a part to
 * a sentence, so the two cannot disagree: `statusLineParts` is the one place
 * those words are written. With no term to tell about it says only that
 * applications are not open.
 *
 * Nothing here reads anything: it is handed the fields it prints.
 */
export type BandWords = { title: string; sub: string | null };

export function bandWords(facts: StatusLineFacts): BandWords {
  if (facts.stage === "open") {
    const decisions = facts.decisionsByDate ? termCivilDay(facts.decisionsByDate) : null;
    const emailed = decisions ? `We’ll email you on ${decisions}.` : null;
    if (!facts.closesAt) return { title: "Applications are open.", sub: emailed };
    const sub = [`Applications close at ${termTime(facts.closesAt)}.`, emailed].filter(Boolean).join(" ");
    return { title: `Apply by ${termDay(facts.closesAt)}.`, sub };
  }
  const [first, second] = statusLineParts(facts);
  if (!first) return { title: "Applications aren’t open right now.", sub: null };
  return { title: `${first}.`, sub: second ? `${second}.` : null };
}
