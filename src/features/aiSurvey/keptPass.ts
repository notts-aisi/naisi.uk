/**
 * The one thing the AI at Nottingham survey keeps in a browser: the pass to
 * an unfinished survey, so that somebody who closes the tab on page 6 can
 * carry on at page 6.
 *
 * It is kept in the browser's local storage, under one key, because it has to
 * outlive the tab. It is the pass and nothing else: no answer is ever kept in
 * the browser, so the next person at a shared computer cannot read the last
 * person's. It is removed when the survey is finished, when somebody says
 * "that wasn't me", and when the site says the pass no longer works.
 *
 * Every read and write is guarded: a private window can refuse storage
 * altogether, and then the survey still works for one sitting.
 */
const KEY = "naisi.aiSurvey.pass";

export function keptPass(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** True when the browser kept it. False when storage is refused, and the pass lives in this page's memory for this sitting. */
export function keepPass(pass: string): boolean {
  try {
    window.localStorage.setItem(KEY, pass);
    return window.localStorage.getItem(KEY) === pass;
  } catch {
    return false;
  }
}

export function forgetPass(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing was kept.
  }
}
