import "server-only";
import { sendRemovalVisitEmails } from "@/lib/courses/visit/removed";
import { sendTakenOffEmail, type TakenOffEmailOutcome } from "@/lib/email/takenOffEmail";
import type { TakeOffPlan } from "./plan";
import { facilitatorEmailWords, personEmailWords } from "./words";

/**
 * THE EMAILS OF TAKING SOMEBODY OFF A RUN, after the removal has committed,
 * to exactly the people its transaction counted (`planTakeOff`): the person,
 * their group's facilitators when Publish had told them their group, and the
 * hosts' facilitators of each visit still to come (the visit's own called-off
 * email, unchanged). A failed send never undoes the removal: the answer says
 * how many went.
 *
 * THE LINE TYPED FOR THE PERSON goes into their email and nowhere else. It
 * is never logged here, and the facilitators' email is written without it.
 */

export type TakeOffSent = { sent: number; suppressed: number; failed: number };

export async function sendTakeOffEmails(
  plan: TakeOffPlan,
  input: { actorUid: string; runId: string; runLabel: string; asked: boolean; line: string },
): Promise<TakeOffSent> {
  const outcomes: TakenOffEmailOutcome[] = [];
  for (const recipient of plan.recipients) {
    const words =
      recipient.as === "person"
        ? personEmailWords({
            firstName: recipient.firstName,
            programmeName: plan.facts.programmeName,
            runLabel: input.runLabel,
            toldGroupName: plan.toldGroupName,
            asked: input.asked,
            line: input.line,
          })
        : facilitatorEmailWords({
            facilitatorFirstName: recipient.firstName,
            personFirstName: plan.facts.firstName,
            groupName: plan.group?.name ?? "",
            programmeName: plan.facts.programmeName,
            registerWeek: plan.registerWeek,
          });
    outcomes.push(await sendTakenOffEmail({ to: recipient.email, actorUid: input.actorUid, runId: input.runId, words }));
  }
  const total: TakeOffSent = {
    sent: outcomes.filter((each) => each === "sent").length,
    suppressed: outcomes.filter((each) => each === "suppressed").length,
    failed: outcomes.filter((each) => each === "failed").length,
  };
  if (plan.visits.emails > 0) {
    const visits = await sendRemovalVisitEmails(plan.visits, { actorUid: input.actorUid, runId: input.runId });
    total.sent += visits.sent;
    total.suppressed += visits.suppressed;
    total.failed += visits.failed;
  }
  return total;
}
