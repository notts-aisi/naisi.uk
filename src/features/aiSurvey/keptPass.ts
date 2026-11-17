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

export function keepPass(pass: string): void {
  try {
    window.localStorage.setItem(KEY, pass);
  } catch {
    // Storage refused: the pass lives in this page's memory for this sitting.
  }
}

export function forgetPass(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing was kept.
  }
}
