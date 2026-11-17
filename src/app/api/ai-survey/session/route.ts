import { accept, readSurveyBody, refuse, statusOf } from "@/lib/aiSurvey/request";
import { viewSession } from "@/lib/aiSurvey/saving";

/**
 * COMING BACK to an unfinished AI at Nottingham survey in the same browser.
 *
 * Body `{ pass }`: the pass that browser was given after the email check. A
 * POST because the pass must never travel in an address, where it would sit
 * in a history and a log.
 *
 * It says WHICH pages are saved and the order this person sees the proposal
 * pages, and that is all. IT NEVER RETURNS AN ANSWER: on a shared computer the
 * next person must not see the last person's, so pages already saved stay
 * closed and there is nothing here that could open them.
 *
 * It writes nothing, reads no cookie and no session, and logs nothing.
 */
export async function POST(req: Request) {
  const body = await readSurveyBody(req);
  if (!body) return refuse("refused", 400);
  // A body with no pass in it is a bad request, not a pass that has stopped working.
  if (typeof body.pass !== "string" || body.pass.length === 0) return refuse("refused", 400);
  const view = await viewSession(body.pass);
  if (!view.ok) return refuse(view.error, statusOf(view.error));
  return accept({
    ok: true,
    stage: view.stage,
    order: view.order,
    savedPages: view.savedPages,
    finished: view.finished,
    pass: view.pass,
  });
}
