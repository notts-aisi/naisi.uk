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
  /** What to do when the session did not happen, in the register's own word for ending it. */
  notHeld: string;
  next: string;
};

/** "Claudia and admins", or "admins" for a run no programme names. */
function taskPeople(leadName: string): string {
  return leadName ? `${leadName} and admins` : "admins";
}

/**
 * Every sentence of the reminder, from records. Exported so a test can read it.
 *
 * IN THE REGISTER'S OWN WORD FOR ENDING IT, from the same switch the register's
 * button and the lead's Overview read (`scheduled`): "finished" while next
 * week's email is on its schedule and the button is "Finish the register",
 * "pushed" while the push still sends it and the button is "Push attendance".
 * So the email a facilitator is sent says what the screen they open says.
 */
export function registerReminderWords(facts: RegisterReminderFacts): RegisterReminderWords {
  const group = facts.groupName.trim() || "Your group";
  const day = londonDayLabel(facts.sessionStartsAt);
  const ended = facts.scheduled ? "finished" : "pushed";
  return {
    subject: `${group}’s register isn’t ${ended}`,
    lead: `${group}’s register for ${day} isn’t ${ended} yet.`,
    effect: facts.scheduled
      ? "Finish the register to lock it and show everyone their mark. Nobody’s emailed."
      : "Push attendance to lock the register, show everyone their mark and email the group about next week.",
    notHeld: `If the session didn’t happen, the register can say so, and it still needs ${facts.scheduled ? "finishing" : "pushing"}.`,
    next: facts.task
      ? `If it’s still not ${ended} ${facts.task.hours} hours after the session, ${taskPeople(facts.task.leadName)} get a task.`
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
  /** The group whose register it is. */
  groupId: string;
  /** This site's own address, with no trailing slash. */
  appUrl: string;
  facts: RegisterReminderFacts;
};

/**
 * Where "Open the register" goes: the register's own page for the group
 * (`/learn/[runId]/group/[groupId]/register`), where the session is marked
 * and ended, as a whole address on this site. Built here, behind the one
 * door, so the job and a lead's Remind cannot come to link to two pages.
 */
function registerPageUrl(appUrl: string, runId: string, groupId: string): string {
  return `${appUrl}/learn/${encodeURIComponent(runId)}/group/${encodeURIComponent(groupId)}/register`;
}

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
        registerLink: registerPageUrl(opts.appUrl, opts.runId, opts.groupId),
        notHeld: words.notHeld,
        next: words.next,
      }),
    });
    return "sent";
  } catch (err) {
    console.error("[register reminder email] send failed", opts.runId, opts.uid, err);
    return "failed";
  }
}
