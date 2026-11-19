import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import ApplicationEmail from "@/emails/ApplicationEmail";
import type { UpdateRecipient } from "@/lib/courses/updates/audience";
import { UPDATE_REPLY_TO } from "@/lib/courses/updates/words";
import { displayNameOf, staffMessageBlocks, staffPreheader } from "@/lib/email/courseFacilitatorEmails";
import { dispatchSends } from "@/lib/email/dispatch";
import { sendNotice } from "@/lib/email/notice";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import type { MessageTally } from "@/lib/firestore/messageSends";
import { postOnProgrammePage, settlePostedEmail } from "@/lib/messages/posting";

/**
 * The update to the group and its email, as the updates route posts one to a
 * group: kept on the programme page, one message per address, a notice on the
 * `course-group` surface. Never throws: what went is counted.
 */
export async function tellTheGroup(
  db: Firestore,
  input: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    actor: SessionUser;
    recipients: readonly UpdateRecipient[];
    words: { title: string; message: string };
  },
): Promise<MessageTally & { planned: number }> {
  const { run, group, actor, recipients, words } = input;
  const planned = recipients.length;
  const tally: MessageTally = { sent: 0, held: 0, suppressed: 0, failed: 0 };
  let updateId: string;
  try {
    const actorSnap = await db.collection("users").doc(actor.uid).get();
    const senderName = actorSnap.exists ? displayNameOf(actorSnap.data() ?? {}) : actor.displayName?.trim() || "NAISI member";
    const runLine = run.courseTitle ? `${run.courseTitle}${run.label ? ` (${run.label})` : ""}` : run.label;
    const context = [group.name.trim(), runLine].filter(Boolean).join(" · ");
    const blocks = staffMessageBlocks(words.message, senderName, context);
    const preheader = staffPreheader(words.message);
    updateId = await postOnProgrammePage(db, {
      target: { tagId: "", programme: "", runId: run.id, to: "group", groupId: group.id, group: group.name },
      authorUid: actor.uid,
      title: words.title,
      message: words.message,
      planned,
    });
    await dispatchSends([...recipients], async (recipient) => {
      try {
        // ONE address. One message.
        const result = await sendNotice({
          to: recipient.address,
          subject: words.title,
          surface: "course-group",
          actorUid: actor.uid,
          referenceId: group.id,
          replyTo: UPDATE_REPLY_TO,
          render: (marker) => ApplicationEmail({ subject: words.title, blocks, preheader, notice: marker }),
        });
        if (result.held.length > 0) tally.held += 1;
        else if (result.suppressed.length > 0) tally.suppressed += 1;
        else tally.sent += 1;
      } catch (err) {
        // A uid, never an address.
        console.error("[courses session room] send failed", group.id, recipient.uid, err);
        tally.failed += 1;
      }
    });
  } catch (err) {
    console.error("[courses session room] the notice did not go", group.id, err);
    return { planned, sent: tally.sent, held: tally.held, suppressed: tally.suppressed, failed: planned - tally.sent - tally.held - tally.suppressed };
  }
  try {
    await settlePostedEmail(db, updateId, planned, tally);
  } catch (err) {
    console.error("[courses session room] could not record what the email did", group.id, updateId, err);
  }
  return { planned, ...tally };
}
