/**
 * AN AUTHORED PARAGRAPH, SPLIT INTO ITS OPENING LINE AND THE REST.
 *
 * A course's page stores "who it is for" and "how we choose" as one block of
 * plain text each. Where its author opens with a short line of its own and
 * then goes on underneath, that first line is drawn as the section's title
 * and the rest as its paragraph. A text written as one paragraph has no
 * title and is drawn whole, so nothing an author wrote is ever cut or
 * reworded: this only decides how large the first line is set.
 *
 * Nothing here parses meaning. It looks at line breaks and at length.
 */

/** A line longer than this is a paragraph, not a title. */
const LEAD_MAX = 90;

export type LeadSplit = {
  /** The opening line, when there is one short enough to be a title. */
  lead: string | null;
  /** Everything else, with its own line breaks kept. */
  rest: string;
};

export function splitLead(text: string): LeadSplit {
  const whole = text.trim();
  const lines = whole.split(/\r?\n/);
  const first = lines[0].trim();
  const rest = lines.slice(1).join("\n").trim();
  if (!first || !rest || first.length > LEAD_MAX) return { lead: null, rest: whole };
  return { lead: first, rest };
}

/** The first line of a text: what a card has room for. Empty for an empty text. */
export function firstLine(text: string): string {
  return text.trim().split(/\r?\n/)[0].trim();
}
