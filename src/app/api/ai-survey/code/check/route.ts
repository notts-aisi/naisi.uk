import { normaliseCode, normaliseUniversityAddress } from "@/lib/aiSurvey/address";
import { checkCode } from "@/lib/aiSurvey/emailCheck";
import { accept, readSurveyBody, refuse, statusOf } from "@/lib/aiSurvey/request";

/**
 * "CHECK MY CODE": the second step of the AI at Nottingham survey's email
 * check.
 *
 * Body `{ email, code }`. The code is the credential: six digits from a
 * cryptographic source, good for fifteen minutes, dead after five wrong
 * tries, and an address can be sent five a day, so guessing is twenty-five
 * tries in a million a day.
 *
 * On the right code the pending code is deleted and, in the same transaction,
 * the address's keyed hash is looked for in the used-email list and added.
 * THIS IS THE ONLY PLACE "this email has already been used" IS EVER SAID.
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

  const result = await checkCode(address, code);
  if (!result.ok) return refuse(result.error, statusOf(result.error));
  return accept({ ok: true, pass: result.pass, order: result.order });
}
