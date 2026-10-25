import "server-only";
import RegisterReminderEmail from "@/emails/RegisterReminderEmail";
import { londonDayLabel } from "@/lib/courses/registerChase";
import { sendEmail } from "./send";

/**
 * The register reminder's words and its send, behind one door.
 *
 * A plain `.ts` door in front of the template, for the reasons
 * `worksheetReminderEmails.ts` gives: the job holds a claimed marker and must
 * know whether the send happened, so this RETURNS an outcome and never
 * throws; and the registry imports every job by value, so the template is
 * kept behind a module the scheduler suites can stub in one line.
 *
 * Suppression and the facilitator's own "Tasks and worksheets" switch are
 * checked by the job, so each lands on the marker as a skip with its reason.
 */

export type RegisterReminderOutcome = "sent" | "failed";

export type RegisterReminderFacts = {
  groupName: string;
  /** The session's start, read as its date in London. */
  sessionStartsAt: Date;
  /**
   * True when next week's email is on its schedule, so the button is "Finish
   * the register" and finishing emails nobody; false while pushing still sends
   * the group's next email.
   */
  scheduled: boolean;
  /** The task that follows if nothing does, or null when no task will. */
  task: { hours: number; leadName: string } | null;
};

export type RegisterReminderWords = {
  subject: string;
  lead: string;
  effect: string;
  next: string;
};

/** "Claudia and admins", or "admins" for a run no programme names. */
function taskPeople(leadName: string): string {
  return leadName ? `${leadName} and admins` : "admins";
}

/** Every sentence of the reminder, from records. Exported so a test can read it. */
export function registerReminderWords(facts: RegisterReminderFacts): RegisterReminderWords {
  const group = facts.groupName.trim() || "Your group";
  const day = londonDayLabel(facts.sessionStartsAt);
  return {
    subject: `${group}’s register isn’t finished`,
    lead: `${group}’s register for ${day} isn’t finished yet.`,
    effect: facts.scheduled
      ? "Finish the register to lock it and show everyone their mark. Nobody’s emailed."
      : "Push attendance to lock the register, show everyone their mark and email the group about next week.",
    next: facts.task
      ? `If it’s still not finished ${facts.task.hours} hours after the session, ${taskPeople(facts.task.leadName)} get a task.`
      : "",
  };
}

export type RegisterReminderOptions = {
  to: string;
  /** The facilitator's own name, or "" for no name in the greeting. */
  name: string;
  /** The facilitator, logged as the send's actor. */
  uid: string;
  runId: string;
  /** Absolute link to the group's page. */
  registerLink: string;
  facts: RegisterReminderFacts;
};

/**
 * One facilitator's reminder. NEVER THROWS: the caller holds a claimed marker,
 * and an exception between the claim and the stamp is the shape that turns
 * one missed email into a duplicate on a later tick.
 */
export async function sendRegisterReminderEmail(
  opts: RegisterReminderOptions,
): Promise<RegisterReminderOutcome> {
  try {
    const words = registerReminderWords(opts.facts);
    await sendEmail({
      to: opts.to,
      subject: words.subject,
      // Operational mail to a group's staff, the same kind a facilitator's own
      // mail to their group carries in the send log.
      kind: "course-facilitator",
      actorUid: opts.uid,
      referenceId: opts.runId,
      react: RegisterReminderEmail({
        subject: words.subject,
        recipientName: opts.name,
        lead: words.lead,
        effect: words.effect,
        buttonLabel: "Open the register",
        registerLink: opts.registerLink,
        next: words.next,
      }),
    });
    return "sent";
  } catch (err) {
    console.error("[register reminder email] send failed", opts.runId, opts.uid, err);
    return "failed";
  }
}
