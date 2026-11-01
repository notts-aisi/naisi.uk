import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import TaskMembershipEmail from "@/emails/TaskMembershipEmail";
import { fellowsOf, type DoorRefusal } from "@/lib/courses/coursework/door";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { wantsEmailForProfile } from "@/lib/email/preferences";
import { sendEmail } from "@/lib/email/send";
import { resolveTaskUsers } from "@/lib/email/taskMembership";
import type { SessionUser } from "@/lib/firebase/session";
import { isTaskEmailEnabled } from "@/lib/firestore/taskEmailConfig";
import { mirrorTaskEmailToPush } from "@/lib/push/taskNotifications";
import { isAlreadyExists } from "@/lib/worksheets/mint";
import { openWeekReview } from "./door";
import { buildFollowUpTask, followUpTaskId } from "./followUpTask";
import { FOLLOW_UP_WORDS, REVIEW_WORDS } from "./words";

/**
 * "ASK RAHUL TO HAVE A WORD WITH GRACE", from a week's review (clash 5): an
 * admin's press, behind the review's own door, that makes one task for the
 * person's group's live facilitators (`./followUpTask.ts`, fixed words and
 * no reason) and tells each of them it is there.
 *
 * WHO IT REACHES is the server's decision, never the caller's: the request
 * names the PERSON, who must hold a place on the programme and not
 * facilitate on its run, and the facilitators are read here off the
 * person's live group. Somebody in no group, or in a group nobody
 * facilitates, has nobody to ask.
 *
 * THE EMAIL is the task system's own you-have-been-added message, on the
 * tasks row (a grid send: each facilitator whose task emails are off gets
 * none, and their phone only if its tasks cell is on), behind the site's
 * task-email switch. The task is born notified, so nothing sends it twice.
 */

export async function askFollowUp(
  db: Firestore,
  user: SessionUser,
  input: { roundId: string; programmeId: string; weekId: string; uid: string },
  now: Date,
): Promise<{ ok: true; taskId: string; emailed: number } | DoorRefusal> {
  const opened = await openWeekReview(db, user, input.roundId, input.programmeId, input.weekId, now);
  if (!opened.ok) return opened;
  const { door, run } = opened;
  if (!fellowsOf(door).has(input.uid)) return { ok: false, status: 404, error: REVIEW_WORDS.followUpNotFellow };
  const groupId = door.people.groupOf.get(input.uid);
  const group = opened.groups.find((each) => each.group.id === groupId);
  if (!group) return { ok: false, status: 409, error: REVIEW_WORDS.followUpNoGroup };

  // The group's live facilitators with an account that still stands.
  const accounts = await resolveTaskUsers(db, [...group.group.facilitatorUids]);
  const facilitators = group.group.facilitatorUids.filter((uid) => accounts.has(uid) && uid !== input.uid);
  if (facilitators.length === 0) return { ok: false, status: 409, error: REVIEW_WORDS.followUpNoGroup };

  const [askerSnap, personSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("users").doc(input.uid).get(),
  ]);
  const holder = door.holders.find((each) => each.uid === input.uid);
  const name = holder?.name ?? "";
  const goBy = (personSnap.exists ? firstNameOfUser(personSnap.data() ?? {}) : "") || name.split(/\s+/)[0] || name;
  const askedBy = (askerSnap.exists ? firstNameOfUser(askerSnap.data() ?? {}) : "") || "An admin";
  const taskId = followUpTaskId(run.id, opened.weekId, input.uid);
  const task = buildFollowUpTask({
    runId: run.id,
    weekNumber: opened.weekNumber,
    groupId: group.group.id,
    aboutUid: input.uid,
    name,
    goBy,
    groupName: group.group.name.trim() || "their group",
    programme: door.programmeName,
    askedBy,
    creatorUid: user.uid,
    completerUids: facilitators,
    dueDate: group.nextAt,
    now,
  });
  try {
    await db.collection("tasks").doc(taskId).create(task);
  } catch (error) {
    if (isAlreadyExists(error)) return { ok: false, status: 409, error: REVIEW_WORDS.followUpAlready };
    throw error;
  }

  // The you-have-been-added email, on each facilitator's tasks row.
  let emailed = 0;
  if (await isTaskEmailEnabled(db)) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://naisi.uk";
    const taskLink = `${appUrl}/tasks?task=${encodeURIComponent(taskId)}`;
    for (const uid of task.completerUids) {
      const recipient = accounts.get(uid);
      if (!recipient) continue;
      try {
        if (wantsEmailForProfile(recipient.profile, "tasks")) {
          await sendEmail({
            to: recipient.email,
            subject: FOLLOW_UP_WORDS.subject(task.title),
            fromName: "NAISI Tasks",
            kind: "task",
            actorUid: user.uid,
            referenceId: taskId,
            react: TaskMembershipEmail({
              recipientName: recipient.displayName || "there",
              taskTitle: task.title,
              taskLink,
              preassignments: [],
              otherCompleterNames: task.completerUids
                .filter((other) => other !== uid)
                .map((other) => accounts.get(other)?.displayName ?? "")
                .filter(Boolean),
            }),
          });
          emailed += 1;
        }
        await mirrorTaskEmailToPush(uid, { title: FOLLOW_UP_WORDS.subject(task.title), body: FOLLOW_UP_WORDS.push, taskId });
      } catch (error) {
        console.error("[week-review follow-up] the task email failed", taskId, error);
      }
    }
  }
  return { ok: true, taskId, emailed };
}
