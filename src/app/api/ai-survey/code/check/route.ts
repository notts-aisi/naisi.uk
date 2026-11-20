import { normaliseCode, normaliseUniversityAddress } from "@/lib/aiSurvey/address";
import { checkCode } from "@/lib/aiSurvey/emailCheck";
import { isClaim } from "@/lib/aiSurvey/pass";
import { accept, readSurveyBody, refuse, statusOf } from "@/lib/aiSurvey/request";

/**
 * "CHECK MY CODE": the second step of the AI at Nottingham survey's email
 * check.
 *
 * Body `{ email, code, claim }`. The code is the credential: six digits from a
 * cryptographic source, good for fifteen minutes, dead after five wrong
 * tries, and an address can be sent ten a day, so guessing is fifty
 * tries in a million a day.
 *
 * On the right code the address's keyed hash is looked for in the used-email
 * list and added, in one transaction. THIS IS THE ONLY PLACE "this email has
 * already been used" IS EVER SAID, and a wrong code is answered the same way
 * whether a code is waiting, was used a moment ago or was never asked for.
 *
 * `claim` is 32 random bytes the browser made for itself. The pass is made
 * from it, so a phone whose request arrived and whose answer did not can ask
 * again, with the same code and claim, and is the same person; another
 * browser with the same code is not.
 *
 * A new address gets a pass: 32 random bytes, signed, kept only in the
 * browser. Nothing is written to the answers here. An answer set first exists
 * when its first page is saved, from the pass alone, so the one step that
 * holds an address and a pass together never touches an answer.
 *
 * It reads no cookie and no session, and logs nothing.
 */
export async function POST(req: Request) {
  const body = await readSurveyBody(req);
  if (!body) return refuse("refused", 400);

  const address = normaliseUniversityAddress(body.email);
  if (!address) return refuse("notUniversityAddress", 400);
  const code = normaliseCode(body.code);
  if (!code) return refuse("wrongCode", 400);
  // The browser's own random value, which its pass is made from, so that a
  // phone whose first answer was lost can ask again and be the same person.
  if (!isClaim(body.claim)) return refuse("refused", 400);

  try {
    const result = await checkCode(address, code, body.claim);
    if (!result.ok) return refuse(result.error, statusOf(result.error));
    return accept({ ok: true, pass: result.pass, order: result.order });
  } catch {
    // The datastore did not answer. Asking again with the same code is safe.
    return refuse("failed", 503);
  }
}
