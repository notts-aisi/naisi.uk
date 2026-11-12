import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import ApplicationEmail from "@/emails/ApplicationEmail";
import { timeQuestionHtml } from "@/lib/courses/timeAnswer/emailSection";
import { updateEmailAudience, type UpdateRecipient } from "@/lib/courses/updates/audience";
import { UPDATE_REPLY_TO } from "@/lib/courses/updates/words";
import { displayNameOf, staffMessageBlocks, staffPreheader } from "@/lib/email/courseFacilitatorEmails";
import { dispatchSends } from "@/lib/email/dispatch";
import { sendNotice } from "@/lib/email/notice";
import { DAY_MS, NOTICES_PER_DAY, reserveNoticeSlots } from "@/lib/email/noticeCaps";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import type { Block } from "@/lib/firestore/newsletterBlocks";

/**
 * THE NOTICE A CHANGE TO A GROUP'S REGULAR TIME OR ROOM SENDS, from the route
 * that made it: "Group A now meets on Tuesdays, 5:30pm" and "Room for Group
 * A: Monica Partridge C10". (One week's change keeps the updates lane: the
 * change route answers with its words and the dialog posts them.)
 *
 * WHO: the group's people whose place Publish has told, and its
 * facilitators who still meet their bar, each once, NEVER THE PRESSER: the
 * audience an update to the group counts with `withFacilitators`
 * (`updateEmailAudience`), so the count on the button and the send are one
 * function's. The route checks the count on the button against it before
 * anything changes (409 with the new count).
 *
 * A NOTICE (docs/notifications.md): programme delivery, surface
 * `course-group`, sent whatever the person's settings say, through the
 * suppression list, one message per address, with the marker and no
 * unsubscribe link. Replies go to the society's inbox. NEVER A MEETING LINK:
 * the words are the site's, the reason and the room refuse a link.
 *
 * "CAN YOU MAKE THIS TIME?", when the regular day or time changed: the
 * site-written section the "Your group" email carries
 * (`src/lib/courses/timeAnswer/emailSection.ts`), with its three buttons, for
 * the people holding a place. A facilitator is not asked.
 *
 * CAPS: ten of these a day for a group, on a counter of their own, claimed
 * before anything changes; no hourly window, because a room set an hour
 * after the time changed is one evening's work, not a burst.
 */

/**
 * The run's page in the member area, where the time question's card is, or
 * null when the site does not know its own address. Built here rather than
 * taken from Publish's module, which is a far larger graph than a link needs.
 */
function programmePageUrl(runId: string): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  return base ? `${base}/learn/${encodeURIComponent(runId)}` : null;
}

/** The audience, for the presser: the group's told people and its facilitators. */
export async function groupNoticeAudience(
  db: Firestore,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  writerUid: string,
): Promise<{ recipients: UpdateRecipient[]; refused: boolean }> {
  return updateEmailAudience(db, run, [group], "group", group.id, writerUid, { withFacilitators: true });
}

/** Claim one of the group's notices for today, before anything changes. Null when claimed; the refusal otherwise. */
export async function claimGroupNotice(
  db: Firestore,
  groupId: string,
): Promise<{ message: string; retryAfterSeconds: number } | null> {
  const slot = await reserveNoticeSlots(db, {
    day: { key: `groupchangeday__${groupId}`, limit: NOTICES_PER_DAY, windowMs: DAY_MS },
    noun: "notices",
  });
  return slot.ok ? null : { message: slot.refusal ?? "That notice was refused.", retryAfterSeconds: slot.retryAfterSeconds };
}

/** What the notice says. `after` comes below the question when there is one. */
export type GroupNoticeWords = {
  subject: string;
  before: string[];
  after: string[];
  /** Ask "Can you make this time?" of the people holding a place. */
  asks: boolean;
  incubator: boolean;
};

/** What the send did, counted, never an address. */
export type NoticeTally = { sent: number; held: number; suppressed: number; failed: number };

/** The email's blocks for one recipient: asked the question, or not. */
function blocksFor(words: GroupNoticeWords, asks: boolean, sender: string, context: string, programmeUrl: string | null): Block[] {
  const [body, ...signature] = staffMessageBlocks(words.before.join("\n\n"), sender, context);
  const blocks: Block[] = body ? [body] : [];
  if (asks && programmeUrl) {
    const html = timeQuestionHtml({ campus: null, asks: true, incubator: words.incubator, programmeUrl });
    if (html) blocks.push({ id: "time-question", type: "richText", html });
  }
  if (words.after.length > 0) {
    const [afterBody] = staffMessageBlocks(words.after.join("\n\n"), sender, context);
    if (afterBody) blocks.push(afterBody);
  }
  return [...blocks, ...signature];
}

export async function sendGroupChangeNotice(
  db: Firestore,
  input: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    actor: SessionUser;
    recipients: readonly UpdateRecipient[];
    words: GroupNoticeWords;
  },
): Promise<NoticeTally> {
  const { run, group, actor, words } = input;
  const actorSnap = await db.collection("users").doc(actor.uid).get();
  const sender = actorSnap.exists ? displayNameOf(actorSnap.data() ?? {}) : actor.displayName?.trim() || "NAISI member";
  const runLine = run.courseTitle ? `${run.courseTitle}${run.label ? ` (${run.label})` : ""}` : run.label;
  const context = [group.name.trim(), runLine].filter(Boolean).join(" · ");
  const programmeUrl = programmePageUrl(run.id);
  const preheader = staffPreheader(words.before.join("\n\n"));
  const facilitators = new Set(group.facilitatorUids);
  const tally: NoticeTally = { sent: 0, held: 0, suppressed: 0, failed: 0 };
  await dispatchSends([...input.recipients], async (recipient) => {
    try {
      // ONE address. One message. A facilitator is not asked the question.
      const blocks = blocksFor(words, words.asks && !facilitators.has(recipient.uid), sender, context, programmeUrl);
      const result = await sendNotice({
        to: recipient.address,
        subject: words.subject,
        surface: "course-group",
        actorUid: actor.uid,
        referenceId: group.id,
        replyTo: UPDATE_REPLY_TO,
        render: (marker) => ApplicationEmail({ subject: words.subject, blocks, preheader, notice: marker }),
      });
      if (result.held.length > 0) tally.held += 1;
      else if (result.suppressed.length > 0) tally.suppressed += 1;
      else tally.sent += 1;
    } catch (err) {
      // A uid, never an address.
      console.error("[courses group change notice] send failed", group.id, recipient.uid, err);
      tally.failed += 1;
    }
  });
  return tally;
}
