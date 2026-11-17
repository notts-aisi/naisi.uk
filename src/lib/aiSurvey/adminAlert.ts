import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import AiSurveyCeilingEmail from "@/emails/AiSurveyCeilingEmail";
import { sendEmail } from "@/lib/email/send";
import { getAdminAuth } from "@/lib/firebase/admin";
import { AI_SURVEY } from "./definition";
import { ceilingOf, stateRef, type SurveyState } from "./store";

/**
 * TELLING THE PEOPLE WHO RUN THE SURVEY THAT ITS CEILING WAS REACHED.
 *
 * The survey sends at most a set number of codes an hour, across everybody.
 * Past that it tells people it is busy and sends nothing. That is the right
 * thing to do to a flood and the wrong thing to do silently to a lecture
 * theatre, so the accounts on the survey's own list are emailed, AT MOST ONCE
 * AN HOUR: the hour is claimed on the survey's record in a transaction first,
 * so a hundred refused requests in a minute are one email.
 *
 * This email is ordinary mail to an account that runs the survey. It goes
 * through the site's usual door and leaves its row in the send log, like any
 * other. It says a count and nothing about anybody who asked for a code.
 *
 * Never throws: a refused request must still be answered "busy" whatever
 * becomes of the alert.
 */
export async function alertCeilingReached(db: Firestore, state: SurveyState, now: number): Promise<boolean> {
  try {
    if (state.adminUids.length === 0) return false;
    const hour = new Date(now).toISOString().slice(0, 13);
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(stateRef(db));
      if (!snap.exists || snap.get("ceilingAlert") === hour) return false;
      tx.update(stateRef(db), { ceilingAlert: hour });
      return true;
    });
    if (!claimed) return false;

    const auth = getAdminAuth();
    if (!auth) return false;
    const found = await auth.getUsers(state.adminUids.map((uid) => ({ uid })));
    const to = found.users.map((user) => user.email).filter((email): email is string => Boolean(email));
    if (to.length === 0) return false;

    const subject = "The AI at Nottingham survey is asking people to wait";
    await sendEmail({
      to,
      subject,
      react: AiSurveyCeilingEmail({ subject, ceiling: ceilingOf(state), busyWords: AI_SURVEY.emailCheck.errors.busy }),
      kind: "admin-alert",
    });
    return true;
  } catch {
    console.error("[ai-survey] the ceiling was reached and the alert could not be sent.");
    return false;
  }
}
