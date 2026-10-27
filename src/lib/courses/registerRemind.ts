import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { namesInWords } from "@/lib/courses/facilitatingEmail";
import { firstNameOfUser, readRunLead } from "@/lib/courses/programmeLead";
import { displayNameOf } from "@/lib/courses/registerAccess";
import { sendRegisterReminderEmail, type RegisterReminderFacts } from "@/lib/email/registerReminderEmail";
import type { CoursesConfig } from "@/lib/firestore/config";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import {
  SCHEDULER_MARKERS_COLLECTION,
  claim,
  decideMarkerClaim,
  normalizeSchedulerMarker,
  registerReminderMarker,
  stampError,
  stampSentOrSettle,
  type SchedulerMarkerRef,
} from "@/lib/scheduler/markers";
import { resolveFacilitator } from "@/lib/scheduler/jobs/registerReminders";
import { REGISTER_REMINDERS_JOB } from "@/lib/scheduler/registerJobs";
import type { RegisterSwitches } from "@/lib/scheduler/registerSwitches";

/**
 * A LEAD'S "REMIND" (wk-overview: "Remind Grace", "Emails 1 person"): the
 * reminder a group's facilitators get when a session's register is not
 * finished, sent now by a person, to that group's facilitators and nobody
 * else.
 *
 * THE SAME REMINDER, NOT A SECOND ONE. It is the email the
 * `courses-register-reminders` job sends (`sendRegisterReminderEmail`, its
 * words `registerReminderWords`), to the people the job would send it to
 * (`resolveFacilitator`: an account that still stands behind the role, an
 * address, their own "Tasks and worksheets" email switch, the do-not-email
 * list), and each facilitator's send claims the job's own marker
 * (`regremind__{groupId}__{sessionKey}__{uid}`). So a facilitator hears
 * about one register once, whichever comes first, the press or the job, and
 * a second press finds the marker taken and emails nobody.
 *
 * NOT HELD BY THE JOB'S SWITCH. The job ships switched off because it emails
 * people on its own; a press is a person's decision, made with the count in
 * front of them, and the count is worked out here the way the send works it
 * out, so the button cannot promise more or fewer emails than go.
 *
 * The marker policy is the default one, which is the job's own (20 minutes
 * before a claimed, unsent marker is taken again; three claims in all).
 */

/** A facilitator a press would email now. */
export type SendableFacilitator = { uid: string; firstName: string; to: string };

/** A facilitator already reminded about this register, and when. */
export type RemindedFacilitator = { uid: string; firstName: string; at: Date };

export type ReminderState = {
  sendable: SendableFacilitator[];
  reminded: RemindedFacilitator[];
};

/** The marker for one facilitator's reminder, or null for ids a marker cannot carry. */
function markerFor(groupId: string, sessionKey: string, uid: string): SchedulerMarkerRef | null {
  try {
    return registerReminderMarker(groupId, sessionKey, uid);
  } catch {
    return null;
  }
}

/** A facilitator's first name from their stored account, then their display name. */
function firstNameFrom(data: Record<string, unknown> | undefined): string {
  if (!data) return "";
  return firstNameOfUser(data) || displayNameOf(data);
}

/**
 * Who a press would email about one session's register, and who has been
 * reminded about it already, by the job or by an earlier press. Reads only.
 */
export async function readReminderState(
  db: Firestore,
  group: Pick<CourseGroupDoc, "id" | "facilitatorUids">,
  sessionKey: string,
  now: Date,
): Promise<ReminderState> {
  const state: ReminderState = { sendable: [], reminded: [] };
  for (const uid of [...new Set(group.facilitatorUids)]) {
    const marker = markerFor(group.id, sessionKey, uid);
    if (!marker) continue;
    const snap = await db.collection(SCHEDULER_MARKERS_COLLECTION).doc(marker.id).get();
    const existing = snap.exists ? normalizeSchedulerMarker(marker.id, snap.data() as Record<string, unknown>) : null;
    if (existing?.sentAt) {
      const account = await db.collection("users").doc(uid).get();
      state.reminded.push({
        uid,
        firstName: firstNameFrom(account.exists ? (account.data() as Record<string, unknown>) : undefined),
        at: existing.sentAt,
      });
      continue;
    }
    if (decideMarkerClaim(existing, now).action !== "claim") continue;
    const person = await resolveFacilitator(db, uid, group.facilitatorUids);
    if ("skip" in person) continue;
    state.sendable.push({ uid, firstName: person.name, to: person.to });
  }
  return state;
}

/** "Remind Grace", "Remind Rahul and Sofia". */
export function remindLabel(sendable: readonly SendableFacilitator[]): string {
  return `Remind ${namesInWords(sendable.map((person) => person.firstName || "the facilitator"))}`;
}

/** "Emails 1 person", "Emails 2 people". */
export function emailsCountLine(count: number): string {
  return `Emails ${count} ${count === 1 ? "person" : "people"}`;
}

export type RemindOutcome = { emailed: number; failed: number; names: string[] };

/**
 * Send the reminder to each facilitator a press would email, claiming each
 * one's marker first and stamping it after, as the job does. Never throws
 * for one facilitator's failure: that one's marker is left for the job to
 * take again, and the others still go.
 */
export async function sendReminders(
  db: Firestore,
  args: {
    run: Pick<CourseRunDoc, "id">;
    group: Pick<CourseGroupDoc, "id" | "name">;
    sessionKey: string;
    sessionStartsAt: Date;
    sendable: readonly SendableFacilitator[];
    switches: RegisterSwitches;
    config: Pick<CoursesConfig, "registerTaskHours">;
    appUrl: string;
    /** Who pressed, kept on each marker beside the job's own fields. */
    pressedByUid: string;
  },
): Promise<RemindOutcome> {
  const lead = args.switches.tasksOn ? await readRunLead(db, args.run.id) : null;
  const facts: RegisterReminderFacts = {
    groupName: args.group.name,
    sessionStartsAt: args.sessionStartsAt,
    scheduled: args.switches.scheduled,
    task: args.switches.tasksOn ? { hours: args.config.registerTaskHours, leadName: lead?.firstName ?? "" } : null,
  };
  const outcome: RemindOutcome = { emailed: 0, failed: 0, names: [] };
  for (const person of args.sendable) {
    const marker = markerFor(args.group.id, args.sessionKey, person.uid);
    if (!marker) continue;
    const claimed = await claim(
      db,
      { ...marker, fields: { ...marker.fields, pressedByUid: args.pressedByUid } },
      { job: REGISTER_REMINDERS_JOB.id },
    );
    if (!claimed.claimed) continue;
    const sent = await sendRegisterReminderEmail({
      to: person.to,
      name: person.firstName,
      uid: person.uid,
      runId: args.run.id,
      groupId: args.group.id,
      appUrl: args.appUrl,
      facts,
    });
    if (sent === "sent") {
      await stampSentOrSettle(db, marker.id);
      outcome.emailed += 1;
      outcome.names.push(person.firstName);
    } else {
      // Left unsent, so the job's re-claim rule can take it again.
      await stampError(db, marker.id, new Error("the reminder email did not send")).catch(() => {});
      outcome.failed += 1;
    }
  }
  return outcome;
}
