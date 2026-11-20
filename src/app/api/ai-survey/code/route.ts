import { normaliseUniversityAddress } from "@/lib/aiSurvey/address";
import { requestCode } from "@/lib/aiSurvey/emailCheck";
import { accept, readSurveyBody, refuse, statusOf } from "@/lib/aiSurvey/request";
import { verifyRecaptcha } from "@/lib/recaptcha/server";

/**
 * "SEND MY CODE": the first step of the AI at Nottingham survey's email check.
 *
 * Body `{ email, recaptchaToken }`. Sends a six-digit code, as a plain-text
 * email with no link, to a University address.
 *
 * IT ANSWERS THE SAME WAY WHETHER OR NOT THE ADDRESS HAS ALREADY ANSWERED. It
 * never reads the used-email list, so there is nothing here that could say.
 * "This email has already been used" is said by the next step alone, after
 * the right code, so typing somebody else's address tells you nothing.
 *
 * What stands in front of the send, in order: the address rule (exactly
 * `nottingham.ac.uk`), the site's reCAPTCHA, a ceiling on codes an hour across
 * the whole survey, and one code a minute and ten a day for the address.
 * NOTHING IS LIMITED BY IP ADDRESS and nothing is kept against one: a room of
 * students shares a few. The limits live in the datastore, keyed by a hash of
 * the address, so they hold across servers.
 *
 * It reads no cookie and no session, and logs nothing about the caller.
 */
export async function POST(req: Request) {
  const body = await readSurveyBody(req);
  if (!body) return refuse("refused", 400);

  const address = normaliseUniversityAddress(body.email);
  if (!address) return refuse("notUniversityAddress", 400);

  const recaptchaToken =
    typeof body.recaptchaToken === "string" && body.recaptchaToken.length > 0 ? body.recaptchaToken : undefined;
  if (!(await verifyRecaptcha(recaptchaToken))) return refuse("botCheckFailed", 400);

  try {
    const result = await requestCode(address);
    if (!result.ok) return refuse(result.error, statusOf(result.error));
    return accept({ ok: true });
  } catch {
    // The datastore did not answer. Nothing was sent.
    return refuse("couldNotSend", 503);
  }
}
