import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { previewNextWeekEmails, type NextWeekEmailPreview } from "@/lib/courses/nextWeekEmail";
import type { ResolvedSession } from "@/lib/courses/sessions";
import { dayWords } from "@/lib/courses/sessionChange/words";
import type { CoursesConfig } from "@/lib/firestore/config";
import { normalizeCourseEnrolment, placementIsTold } from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";

/**
 * WHAT PRESSING A REGISTER'S BUTTON EMAILS: one answer, worked out on the
 * server, for every place that says it.
 *
 * While next week's email is not on its schedule, pushing a register sends
 * the group next week's email, the email about the session after the one
 * being finished. Three places tell a person what that press does: the foot
 * under the register, the confirm in front of the button, and the push's own
 * answer once it is pressed. They must say the same thing, so:
 *
 *  - WHICH SESSION the email is about is `sessionAfter`: the next session in
 *    the group's WHOLE schedule, as `resolveSessions` resolves it, with each
 *    week's changes applied (a move, a session held online, a cancellation).
 *    Never the next column of the register: the columns are only the sessions
 *    that have started, so this week's register has no next column, and a
 *    confirm that read the columns told a facilitator every week that this was
 *    the group's last session. The push route and the register's GET both ask
 *    `sessionAfter`.
 *  - WHETHER IT GOES, AND TO WHOM, is the send's own decision asked without
 *    sending (`previewNextWeekEmails`): a date to claim it by, the week
 *    published, the claim not already taken, and the group's deliverable
 *    members counted by the function the send hands its messages to.
 *  - The register's GET answers it for every register its page can press
 *    (`readPushEmails`), and the foot and the confirm put that answer into
 *    words (`src/features/courses/registerEndingWords.ts`), never their own.
 *
 * A CANCELLED SESSION AFTER this one is still the session the email is about:
 * the push sends the group next week's email, and that email says the evening
 * is off, why, and when they meet next (`nextWeekChangeLine`). It is not a
 * session to remind them to come to, so the words say the email tells them it
 * is cancelled. A register whose OWN session was cancelled is refused by the
 * push before anything is read, so its answer is that nobody is emailed.
 */

/** Why a press emails nobody about the session after: the reason the push would answer with. */
export type PushEmailHeld = Extract<NextWeekEmailPreview, { goes: false }>["why"];

/** What pressing one register's button does about next week's email. */
export type PushEmailLine =
  /** Next week's email is on its schedule: finishing emails nobody. */
  | { kind: "scheduled" }
  /** The register's own session was cancelled: the press is refused, and emails nobody. */
  | { kind: "not-held" }
  /** There is no session after this one in the group's schedule: nobody is emailed. */
  | { kind: "last" }
  /**
   * The group's email about the session after this one goes, to `emails` of
   * the `people` placed in the group and told it. `day` is that session's
   * date ("Fri 30 Oct", "" when it has none), and `cancelled` says the session
   * is off, so the email says so.
   */
  | {
      kind: "sends";
      weekNumber: number;
      day: string;
      cancelled: boolean;
      emails: number;
      people: number;
    }
  /** Nobody is emailed about week `weekNumber`, and why. */
  | { kind: "held"; why: PushEmailHeld; weekNumber: number };

/**
 * The session a push of `sessionKey`'s register emails the group about: the
 * one after it in the group's whole schedule, or null after its last.
 */
export function sessionAfter(
  sessions: readonly ResolvedSession[],
  sessionKey: string,
): ResolvedSession | null {
  const index = sessions.findIndex((session) => session.sessionKey === sessionKey);
  return index < 0 ? null : (sessions[index + 1] ?? null);
}

/**
 * How many people are placed in the group and have been told it: the people a
 * group's email is for, before anybody's choice or address leaves them out.
 * One equality, the rest in memory.
 */
async function peopleInGroup(db: Firestore, runId: string, groupId: string): Promise<number> {
  const snap = await db.collection("courseEnrolments").where("groupId", "==", groupId).get();
  const told = new Set<string>();
  for (const doc of snap.docs) {
    const enrolment = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
    if (enrolment.runId !== runId || enrolment.groupId !== groupId) continue;
    if (enrolment.status !== "active" || !enrolment.uid || !placementIsTold(enrolment)) continue;
    told.add(enrolment.uid);
  }
  return told.size;
}

/**
 * What pressing the button of each register in `sessionKeys` emails, by
 * session key. Read only: nothing is claimed and nothing is sent.
 */
export async function readPushEmails(
  db: Firestore,
  args: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    /** Every session the group holds, in order (`resolveSessions`). */
    sessions: readonly ResolvedSession[];
    /** The registers a press can finish: the page's columns that are not finished. */
    sessionKeys: readonly string[];
    /** True when next week's email is on its schedule (`nextWeekEmailIsScheduled`). */
    scheduled: boolean;
    config: CoursesConfig;
    appUrl: string;
  },
): Promise<Record<string, PushEmailLine>> {
  const { run, group, sessions } = args;
  const lines: Record<string, PushEmailLine> = {};
  const after = new Map<string, ResolvedSession>();
  for (const key of args.sessionKeys) {
    const session = sessions.find((each) => each.sessionKey === key);
    if (!session) continue;
    if (args.scheduled) {
      lines[key] = { kind: "scheduled" };
      continue;
    }
    if (session.cancelled) {
      lines[key] = { kind: "not-held" };
      continue;
    }
    const next = sessionAfter(sessions, key);
    if (!next) {
      lines[key] = { kind: "last" };
      continue;
    }
    after.set(key, next);
  }
  if (after.size === 0) return lines;

  const previews = await previewNextWeekEmails(db, {
    run,
    group,
    sessions: [...after.values()],
    config: args.config,
    appUrl: args.appUrl,
  });
  const goes = [...previews.values()].some((preview) => preview.goes);
  const people = goes ? await peopleInGroup(db, run.id, group.id) : 0;
  for (const [key, next] of after) {
    const preview = previews.get(next.sessionKey);
    if (!preview) continue;
    lines[key] = preview.goes
      ? {
          kind: "sends",
          weekNumber: next.weekNumber,
          day: dayWords(next.dateKey),
          cancelled: next.cancelled,
          emails: preview.emails,
          // Never fewer than it reaches: everyone it reaches is placed and told.
          people: Math.max(people, preview.emails),
        }
      : { kind: "held", why: preview.why, weekNumber: next.weekNumber };
  }
  return lines;
}
