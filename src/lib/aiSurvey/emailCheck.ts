import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { sendUnloggedText } from "@/lib/email/send";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { alertCeilingReached } from "./adminAlert";
import { AI_SURVEY, fillValues, proposalPageIds } from "./definition";
import { shuffled } from "./exportCsv";
import { newCode, newPassId, PASS_LIFETIME_MS, randomBelow, sealPass } from "./pass";
import {
  acceptCode,
  CODE_CEILING_PER_HOUR,
  codesInLastHour,
  countAccepted,
  countCodeSent,
  emailKey,
  hashAddress,
  readState,
  releaseCode,
  reserveCode,
  shardsInUse,
  stageAt,
  surveyDb,
} from "./store";

/**
 * The University-email check in front of the AI at Nottingham survey.
 *
 * A student proves once that they hold an @nottingham.ac.uk address, and
 * nothing kept afterwards can match that address to their answers. Two steps,
 * and each takes an address that `normaliseUniversityAddress` has already
 * reduced to its one form:
 *
 *  - `requestCode` sends a six-digit code. IT ANSWERS THE SAME WAY WHETHER OR
 *    NOT THE ADDRESS HAS ALREADY ANSWERED: it never reads the used-email list,
 *    so there is nothing for it to give away.
 *  - `checkCode` checks the code. Only here, after the right code, is "this
 *    email has already been used" ever said. On a new address it hands back a
 *    pass, and WRITES NOTHING TO THE ANSWERS: an answer set first exists when
 *    its first page is saved, from the pass alone, so this function, the only
 *    one that holds an address and a pass together, never touches an answer.
 *
 * NOTHING HERE LOGS an address, a hash, a code or a pass. The two lines it can
 * log say that something happened, never to whom.
 */

/** The outcomes a page can show, named as `emailCheck.errors` names them. */
export type RequestCodeResult =
  | { ok: true }
  | { ok: false; error: "closed" | "askedAgainTooSoon" | "tooManyCodesToday" | "busy" | "couldNotSend" };

/** The hash a pending code is stored as: the code, bound to the record it sits in. */
function codeHash(pendingHash: string, code: string): string {
  return createHash("sha256").update(`ai-survey.code.v1:${pendingHash}:${code}`).digest("hex");
}

export async function requestCode(address: string, now: number = Date.now()): Promise<RequestCodeResult> {
  const db = surveyDb();
  if (!db) return { ok: false, error: "couldNotSend" };
  const state = await readState(db);
  if (!stageAt(state, now).takesNewPeople) return { ok: false, error: "closed" };

  const key = emailKey(state);
  if (!key) {
    console.error("[ai-survey] no key to hash addresses with, so no code was sent.");
    return { ok: false, error: "couldNotSend" };
  }

  // The ceiling across the whole survey, before anything is stored or sent.
  if ((await codesInLastHour(db, now)) >= CODE_CEILING_PER_HOUR) {
    console.error("[ai-survey] the hourly ceiling on codes was reached.");
    // The accounts that run the survey are told, at most once an hour.
    await alertCeilingReached(db, state, now);
    return { ok: false, error: "busy" };
  }

  const hashes = hashAddress(address, key);
  const code = newCode();
  const reserved = await reserveCode(db, hashes, codeHash(hashes.pending, code), now, londonDateKey(new Date(now)));
  if (reserved !== "reserved") return { ok: false, error: reserved };

  let outcome: "sent" | "held" | "suppressed";
  try {
    outcome = await sendUnloggedText({
      to: address,
      subject: fillValues(AI_SURVEY.codeEmail.subject, { code }),
      text: AI_SURVEY.codeEmail.textBody.map((line) => fillValues(line, { code })).join("\n"),
      fromName: AI_SURVEY.codeEmail.fromName,
      replyTo: AI_SURVEY.codeEmail.replyTo,
    });
  } catch {
    outcome = "held";
  }
  if (outcome !== "sent") {
    // Not sent: this copy of the site may not write to the address, the
    // address is on the bounce list, or the mail server refused. Say so, and
    // let them ask again without waiting out the minute.
    await releaseCode(db, hashes);
    return { ok: false, error: "couldNotSend" };
  }
  await countCodeSent(db, now).catch(() => undefined);
  return { ok: true };
}

export type CheckCodeResult =
  | { ok: true; pass: string; order: string[] }
  | { ok: false; error: "closed" | "wrongCode" | "codeRunOut" | "tooManyWrongTries" | "alreadyAnswered" };

export async function checkCode(address: string, code: string, now: number = Date.now()): Promise<CheckCodeResult> {
  const db = surveyDb();
  if (!db) return { ok: false, error: "codeRunOut" };
  const state = await readState(db);
  if (!stageAt(state, now).takesNewPeople) return { ok: false, error: "closed" };
  const key = emailKey(state);
  if (!key) return { ok: false, error: "codeRunOut" };

  const hashes = hashAddress(address, key);
  const expected = Buffer.from(codeHash(hashes.pending, code));
  const outcome = await acceptCode(
    db,
    state,
    hashes,
    (stored) => {
      const given = Buffer.from(stored);
      return given.length === expected.length && timingSafeEqual(given, expected);
    },
    now,
  );
  if (outcome !== "accepted") return { ok: false, error: outcome };

  // From here the address is not used again. The pass is made from random
  // bytes and from how many people there have been, and from nothing else.
  const { from, count } = shardsInUse(state.accepted);
  const order = shuffled(proposalPageIds(), randomBelow);
  const pass = sealPass(
    { epoch: state.epoch, id: newPassId(), shard: from + randomBelow(count), order, expiresAt: now + PASS_LIFETIME_MS },
    Buffer.from(state.passKey, "base64"),
  );
  await countAccepted(db, state).catch(() => undefined);
  return { ok: true, pass, order };
}
