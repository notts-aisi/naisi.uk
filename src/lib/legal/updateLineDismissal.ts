/**
 * THAT SOMEBODY DISMISSED THE LINE SAYING THE PRIVACY POLICY CHANGED
 * (`policyUpdateLine` in `./updateLine.ts`, drawn on Home by
 * `PolicyUpdate.tsx`).
 *
 * One small preference in the person's own browser: the number of the newest
 * version whose line they dismissed, under `UPDATE_LINE_DISMISSED_KEY`. The
 * privacy policy lists it by name under "Cookies and local storage". It
 * never leaves the device: nothing here sends it anywhere, no cookie is set
 * and nothing about it is kept on the account.
 *
 * A LATER VERSION'S LINE IS A LINE OF ITS OWN. The stored number is compared
 * with the line's version, so dismissing one version's line does not hide
 * the line of a later version that changes how information is used.
 *
 * A BROWSER THAT REFUSES STORAGE still dismisses the line for the page it is
 * on (`dismissedHere`), and is shown it again on its next visit until the
 * line's days end.
 *
 * A store in the shape `useSyncExternalStore` reads: a snapshot, and a way
 * to hear that it changed, on this page or in another tab of the browser.
 */

/** The key the dismissed version is kept under in the browser's local storage. */
export const UPDATE_LINE_DISMISSED_KEY = "naisi.policyNotice.dismissed";

/** The newest version dismissed on this page, which a browser that refuses storage still has. */
let dismissedHere = 0;

const listeners = new Set<() => void>();

/** A stored value as a version number, or 0 for anything that is not one. */
export function dismissedVersionFrom(stored: string | null): number {
  return stored !== null && /^[1-9]\d{0,5}$/.test(stored) ? Number(stored) : 0;
}

/** The newest version whose line this browser dismissed, or 0 for none. */
export function dismissedUpdateLineVersion(): number {
  let kept = 0;
  try {
    kept = dismissedVersionFrom(window.localStorage.getItem(UPDATE_LINE_DISMISSED_KEY));
  } catch {
    /* storage refused: this page's own dismissal is all there is */
  }
  return Math.max(kept, dismissedHere);
}

/** Dismisses the line of `version`: on this page at once, and in the browser's storage for later visits. */
export function dismissUpdateLine(version: number): void {
  dismissedHere = Math.max(dismissedHere, version);
  try {
    // Never a lower number than the one already kept.
    window.localStorage.setItem(UPDATE_LINE_DISMISSED_KEY, String(dismissedUpdateLineVersion()));
  } catch {
    /* storage refused: dismissed for this page only */
  }
  for (const listener of listeners) listener();
}

/** Calls `listener` when the line is dismissed on this page or in another tab of this browser. Returns the way to stop. */
export function subscribeUpdateLineDismissal(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    // A null key is the whole storage cleared.
    if (event.key === null || event.key === UPDATE_LINE_DISMISSED_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
