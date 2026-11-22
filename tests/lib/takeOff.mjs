/**
 * TAKING SOMEBODY OFF A RUN THE WAY THE SHEET DOES, for the suites that need
 * somebody off a run on the way to what they test: ask the route what a
 * press would do (`preview: true`), then press with the count of emails it
 * answered. A press that sends no count is refused whenever the person would
 * be emailed, so a suite that only needs them off goes through the question
 * as every caller on the site does.
 *
 * Returns the press's answer, or the question's when the question was
 * refused (a person who left by themselves, a facilitator, a uid with no
 * place), so a suite's assertion about a refusal reads the same.
 */
export async function takeOff(call, who, handler, params, { line, ...options } = {}) {
  const asked = { course: true, ...options };
  const shown = await call(who, handler, params, { ...asked, body: { preview: true } });
  if (shown.status !== 200) return shown;
  return call(who, handler, params, { ...asked, body: { emails: shown.body.preview.emails, ...(line ? { line } : {}) } });
}
