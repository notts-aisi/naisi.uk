import "server-only";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import WeekEmail from "@/emails/WeekEmail";
import { groupHistoryRow } from "@/lib/courses/groupChange/facts";
import { historyDetail } from "@/lib/courses/groupChange/words";
import { dispatchSends } from "@/lib/email/dispatch";
import { courseWeekUrl } from "@/lib/email/courseNudgeEmail";
import { sendNotice } from "@/lib/email/notice";
import { DAY_MS, HOUR_MS, NOTICES_PER_DAY, NOTICES_PER_HOUR, reserveNoticeSlots } from "@/lib/email/noticeCaps";
import type { SessionUser } from "@/lib/firebase/session";
import { firstWord } from "@/lib/firestore/applicationEmails";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import {
  HAND_REMINDERS_COLLECTION,
  HAND_REMINDER_KIND,
  handReminderId,
  normalizeHandReminder,
} from "@/lib/firestore/courseHandReminders";
import { SAME_PRESS_MS } from "./model";
import type { GroupWeekRead, RemindPerson } from "./load";
import { handReminderEmailWords, peopleCountWords, stillToDoItems, type HandReminderFacts } from "./words";

/**
 * REMIND, BY HAND: the email to each person whose week is not done, sent by
 * the Remind route once every refusal has passed (`src/app/api/courses/groups/
 * [groupId]/remind/route.ts`).
 *
 * ONE WAY TO REMIND ABOUT A WEEK. Built on the automatic reminders, not beside
 * them: what is left of a week is theirs (`weekLeft`), the email is drawn by
 * their template (`WeekEmail`), and it goes through the notice lane's door on
 * their surface, `course-week-reminder` (the line above the words: "our
 * records show this week's work isn't finished"). Programme delivery, so it
 * reaches the person whatever their settings say (privacy v17, "Reminders":
 * "After that session, the people running your group may remind you about a
 * week that isn't done"). One message per address, never a Cc, never a
 * meeting link: the only link is the week's own page.
 *
 * THE CAPS (docs/notifications.md, "The caps"): 3 an hour per presser and
 * audience (the group's week, everybody not done or one person), 10 a day per
 * group, claimed by the route before the first send (`claimRemindSlot`).
 *
 * THE SAME PRESS TWICE SENDS NOTHING MORE. Each person's record
 * (`courseNudges/handremind__...`, `src/lib/firestore/courseHandReminders.ts`)
 * is claimed in a transaction before their email goes: somebody claimed in
 * the last `SAME_PRESS_MS` is skipped, whoever pressed, so a retry (a lost
 * answer, a double tap) emails nobody again. The claim is let go when their
 * email did not go, so a later press can try. A deliberate second reminder
 * later is the panel's warning to make, not this file's.
 *
 * THE RECORD. After each email that went, the person's record says when and
 * who pressed ("Last reminded" reads it), and the press writes one row in
 * the group's history with how many were emailed and nobody's name.
 */

/** What a press came to: counted, never an address. */
export type RemindTally = { sent: number; justReminded: number; suppressed: number; held: number; failed: number };

/** The cap windows a Remind claims, before anything is sent. Null when claimed; the refusal otherwise. */
export async function claimRemindSlot(
  db: Firestore,
  input: { actorUid: string; groupId: string; weekId: string; onlyUid: string | null },
): Promise<{ message: string; retryAfterSeconds: number } | null> {
  const audience = `${input.groupId}__${input.weekId}__${input.onlyUid ?? "all"}`;
  const slot = await reserveNoticeSlots(db, {
    hour: { key: `weekremind__${input.actorUid}__${audience}`, limit: NOTICES_PER_HOUR, windowMs: HOUR_MS },
    day: { key: `weekremindday__${input.groupId}`, limit: NOTICES_PER_DAY, windowMs: DAY_MS },
    noun: "reminders",
  });
  return slot.ok ? null : { message: slot.refusal ?? "That reminder was refused.", retryAfterSeconds: slot.retryAfterSeconds };
}

/**
 * Claim one person's record for this press, or say they were claimed a
 * moment ago (by this press's retry, or by anybody's). One transaction.
 */
async function claimPerson(
  db: Firestore,
  input: { runId: string; groupId: string; weekId: string; weekNumber: number; uid: string; actorUid: string; now: Date },
): Promise<boolean> {
  const ref = db.collection(HAND_REMINDERS_COLLECTION).doc(handReminderId(input.runId, input.uid, input.weekId));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const record = normalizeHandReminder(data);
      if (record.claimedAt && input.now.getTime() - record.claimedAt.getTime() < SAME_PRESS_MS) return false;
    }
    tx.set(
      ref,
      {
        kind: HAND_REMINDER_KIND,
        runId: input.runId,
        uid: input.uid,
        weekId: input.weekId,
        weekNumber: input.weekNumber,
        groupId: input.groupId,
        claimedAt: Timestamp.fromDate(input.now),
        claimedByUid: input.actorUid,
      },
      { merge: true },
    );
    return true;
  });
}

/** One person's email: before the session they are due at, or after it has started. */
export function reminderFactsFor(input: {
  person: Pick<RemindPerson, "due" | "left">;
  weekNumber: number;
  groupName: string;
  presserFirstName: string;
  team: string;
  weekUrl: string;
  now: Date;
}): HandReminderFacts {
  const { person, now } = input;
  const at = person.due.at;
  return {
    weekNumber: input.weekNumber,
    groupName: input.groupName,
    presserFirstName: input.presserFirstName,
    team: input.team,
    form: at && at.getTime() <= now.getTime() ? "after" : "before",
    sessionAt: at,
    cancelled: person.due.by === "cancelled",
    stillToDo: stillToDoItems(person.left),
    weekUrl: input.weekUrl,
  };
}

/** "Reminded 2 people about week 1." */
export function remindHeadline(weekNumber: number, people: number): string {
  return `Reminded ${peopleCountWords(people)} about week ${weekNumber}.`;
}

/**
 * SEND ONE PRESS'S REMINDERS: each person claimed, emailed, and recorded,
 * then one row in the group's history. The caller has checked the count on
 * the button and claimed the caps.
 */
export async function sendHandReminders(
  db: Firestore,
  input: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    read: Pick<GroupWeekRead, "weekNumber" | "weekId">;
    people: readonly RemindPerson[];
    actor: SessionUser;
    presserFirstName: string;
    team: string;
    now: Date;
  },
): Promise<RemindTally> {
  const { run, group, read, actor, now } = input;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const weekUrl = courseWeekUrl(appUrl, run.id, read.weekNumber);
  const tally: RemindTally = { sent: 0, justReminded: 0, suppressed: 0, held: 0, failed: 0 };
  let attempted = 0;
  await dispatchSends([...input.people], async (person) => {
    const recordRef = db.collection(HAND_REMINDERS_COLLECTION).doc(handReminderId(run.id, person.uid, read.weekId));
    let claimed: boolean;
    try {
      claimed = await claimPerson(db, {
        runId: run.id,
        groupId: group.id,
        weekId: read.weekId,
        weekNumber: read.weekNumber,
        uid: person.uid,
        actorUid: actor.uid,
        now,
      });
    } catch (err) {
      console.error("[courses remind] claim failed", group.id, person.uid, err);
      tally.failed += 1;
      return;
    }
    if (!claimed) {
      tally.justReminded += 1;
      return;
    }
    attempted += 1;
    const letGo = () => recordRef.update({ claimedAt: null }).catch(() => {});
    try {
      const words = handReminderEmailWords(
        reminderFactsFor({
          person,
          weekNumber: read.weekNumber,
          groupName: group.name,
          presserFirstName: input.presserFirstName,
          team: input.team,
          weekUrl,
          now,
        }),
        firstWord(person.ownName),
      );
      // ONE address. One message. Never an array, never a Cc.
      const result = await sendNotice({
        to: person.address,
        subject: words.subject,
        surface: "course-week-reminder",
        actorUid: actor.uid,
        referenceId: group.id,
        render: (marker) => WeekEmail({ words, notice: marker }),
      });
      if (result.held.length > 0) {
        tally.held += 1;
        await letGo();
        return;
      }
      if (result.suppressed.length > 0) {
        tally.suppressed += 1;
        await letGo();
        return;
      }
      await recordRef.update({ at: Timestamp.fromDate(now), byUid: actor.uid, count: FieldValue.increment(1) });
      tally.sent += 1;
    } catch (err) {
      // A uid, never an address.
      console.error("[courses remind] send failed", group.id, person.uid, err);
      tally.failed += 1;
      await letGo();
    }
  });

  // One row in the group's history for the press, naming nobody: a retry
  // that found everybody reminded a moment ago pressed nothing new.
  if (attempted > 0) {
    try {
      await db.collection(COURSE_AUDIT_COLLECTION).add(
        groupHistoryRow({
          kind: "week-reminded",
          run,
          group,
          actor,
          weekId: read.weekId,
          detail: historyDetail({ headline: remindHeadline(read.weekNumber, attempted), emailed: tally.sent }),
          emailed: tally.sent,
        }),
      );
    } catch (err) {
      console.error("[courses remind] history row failed", group.id, err);
    }
  }
  return tally;
}
