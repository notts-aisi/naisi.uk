import { accept, readSurveyBody, refuse, statusOf } from "@/lib/aiSurvey/request";
import { savePage } from "@/lib/aiSurvey/saving";

/**
 * NEXT, and FINISH: one page of the AI at Nottingham survey, saved whole.
 *
 * Body `{ pass, pageId, answers, finish? }`. The pass is the credential: it
 * is signed by this site and given only after the email check, so a browser
 * cannot write one for itself.
 *
 * The page is checked against the survey before anything is stored: known
 * codes, known answers, the comment no longer than its limit. ANYTHING ELSE IS
 * REFUSED, never trimmed to fit. A save replaces any earlier save of the same
 * page. `finish` is honoured only on the last page, marks the answer set
 * finished and locks it.
 *
 * WHAT IS STORED says nothing about who or when: the survey's version, the
 * order of the proposal pages, and the page's answers, as fields inside a
 * shared document. No account, address, IP address, browser, short link, date
 * or time.
 *
 * It reads no cookie and no session, and logs nothing. Each answer hands back
 * a fresh pass good for another 24 hours.
 */
export async function POST(req: Request) {
  const body = await readSurveyBody(req);
  if (!body) return refuse("refused", 400);
  const result = await savePage(body.pass, body.pageId, body.answers, body.finish);
  if (!result.ok) return refuse(result.error, statusOf(result.error));
  return accept({ ok: true, pass: result.pass, finished: result.finished });
}
