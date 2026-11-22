/**
 * WHERE THE FOCUS GOES WHEN THE PERSON'S PANEL CLOSES on People in groups:
 * back to the name that opened it, so a keyboard is where it was. If that
 * name is no longer on the page (the person was moved, and their card drawn
 * again in another column, or taken off the run), to their name wherever it
 * is now; and if they are on the board no more, to the board itself.
 *
 * Pure over anything that can be focused, so a test asks it without a page.
 */

export type Focusable = { isConnected: boolean; focus: () => void };

export function focusAfterPanel<T extends Focusable>(
  opener: T | null,
  nameNow: () => T | null,
  board: T | null,
): T | null {
  if (opener && opener.isConnected) return opener;
  const now = nameNow();
  if (now && now.isConnected) return now;
  return board && board.isConnected ? board : null;
}
