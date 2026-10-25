import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import type { ResolvedSession } from "@/lib/courses/sessions";
import { dispatchSends } from "@/lib/email/dispatch";
import {
  resolveCohortAudience,
  type CohortRecipient,
} from "@/lib/email/courseFacilitatorEmails";
import {
  emptyNudgeValues,
  groupNudgeFacts,
  groupNudgeMarkerId,
  groupNudgeTokens,
  resolveCourseNudgeTemplate,
  sendCourseWeekNudgeEmail,
  type CourseNudgeTemplate,
  type CourseNudgeTokens,
} from "@/lib/email/courseNudgeEmail";
import type { CoursesConfig } from "@/lib/firestore/config";
import { sessionModeForWeek, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { courseRunChannel, type CourseRunDoc } from "@/lib/firestore/courses";
import { signToken } from "@/lib/signedTokens";

/**
 * NEXT WEEK'S EMAIL, TO ONE GROUP: the one place it is resolved, claimed and
 * sent, whichever lane sends it.
 *
 * Two lanes send it, and exactly one of them is live at a time:
 *
 *  - THE PUSH. A facilitator pushing the register after a session sends the
 *    group the email about its next session. That is how it has always gone,
 *    and it is still how it goes while the `courses-next-week-email` job is
 *    switched off.
 *  - THE SCHEDULE. With that job switched on, the email goes a set number of
 *    days before each session whatever happens to the register, and pushing
 *    (now "Finish the register") emails nobody.
 *
 * ── THE TWO NEVER BOTH SEND ─────────────────────────────────────────────────
 * Two things hold it, and either alone would:
 *
 *  1. THE SWITCH. Both lanes read the job's own switch through one function
 *     (`nextWeekEmailIsScheduled`). The push sends only while it is off; the
 *     tick runs the job only while it is on.
 *  2. ONE MARKER. Both claim the SAME document, `courseNudges/gnudge__{runId}
 *     __{groupId}__{slotStartKey}[-occurrence]`, with `.create()`, before the
 *     first message goes. A switch flipped between a push and a tick finds the
 *     claim already taken and sends nothing. The run's catch-up send reads the
 *     same family before it sends, so it cannot double a group either.
 *
 * The marker lives in `courseNudges` rather than `schedulerMarkers` on
 * purpose, although one lane is a tick: the claim has to be ONE document that
 * a human press and a tick both aim at, and `courseNudges` is where the human
 * lane's claim has always lived.
 *
 * ── CLAIM BEFORE SEND ───────────────────────────────────────────────────────
 * Everything the email needs (the week, the template, the audience) is read
 * BEFORE the claim, so a failure there leaves nothing claimed and the next
 * attempt starts clean. After the claim only the transport can fail, and a
 * missed email is recovered by an admin's per-group resend, which forces over
 * the claim and records that it did.
 *
 * ── WHOLE OR NOT AT ALL ─────────────────────────────────────────────────────
 * `whole: true` (the schedule, and any resend once the schedule is on) holds
 * the group's email when a value the template uses is empty, and says which,
 * rather than letting the renderer drop the sentence. `whole: false` is the
 * push lane as it has always been: a missing value drops its sentence.
 */

/** Who is sending, recorded on the marker. */
export type NextWeekEmailSender =
  | { kind: "push"; uid: string }
  | { kind: "schedule"; jobId: string };

export type NextWeekEmailOutcome = {
  /** Emails that went. */
  sent: number;
  /** Recipients dropped along the way: opted out, suppressed, failed. */
  skipped: number;
  /** True when this send went over a claim somebody had already taken. */
  forced: boolean;
  /**
   * Why nothing went, when nothing did; null when mail went. Never an error:
   * each is a complete outcome a caller can put in front of a person.
   */
  reason: string | null;
  /** Which of the reasons, for a caller that branches on it. */
  held:
    | "no-date"
    | "unpublished"
    | "missing"
    | "refused"
    | "nobody"
    | "claimed"
    | null;
  /** The empty values that held a whole email. Empty otherwise. */
  missing: (keyof CourseNudgeTokens)[];
};

/**
 * Pushes and the schedule both mint one token per recipient with the same
 * lifetime the newsletter gives its unsubscribe links.
 */
const UNSUB_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365;

/**
 * This lane's voice in the shared audience derivation. The advice names the
 * GROUP: the ceiling is counted on this group's active enrolments.
 */
const LANE = {
  logTag: "courses next week email",
  overCapAdvice: "split the group",
} as const;

/**
 * ALREADY_EXISTS out of `.create()`. The Admin SDK surfaces the raw gRPC
 * status (6); the string forms are accepted because the emulator and some
 * transport paths report the canonical name instead.
 */
function isAlreadyExists(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}

/** The marker for one group's email about one session, or null with no dates. */
export function nextWeekEmailMarkerId(
  runId: string,
  groupId: string,
  session: Pick<ResolvedSession, "slotStartKey" | "occurrence">,
): string | null {
  if (!session.slotStartKey) return null;
  return groupNudgeMarkerId(runId, groupId, session.slotStartKey, session.occurrence);
}

/** What one group's email would say, and whether it can go. */
export type NextWeekEmailReading = {
  published: boolean;
  /** Empty values the template uses, apart from the two it may go without. */
  missing: (keyof CourseNudgeTokens)[];
  facts: ReturnType<typeof groupNudgeFacts>;
  week: Awaited<ReturnType<typeof resolveWeekDoc>>["week"];
};

/**
 * Read what one group's email about `session` would carry: the week as this
 * group sees it (its own copy when it has one), whether that week is
 * published, the facts, and which of the template's values are empty.
 */
export async function readNextWeekEmail(
  db: Firestore,
  args: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    session: ResolvedSession;
    template: CourseNudgeTemplate;
    feedbackUrl: string;
    appUrl: string;
  },
): Promise<NextWeekEmailReading> {
  const { run, group, session } = args;
  const { week } = await resolveWeekDoc(db, run.id, group.id, session.weekId);
  const facts = groupNudgeFacts({
    courseTitle: run.courseTitle,
    runLabel: run.label,
    runId: run.id,
    appUrl: args.appUrl,
    feedbackUrl: args.feedbackUrl,
    session,
    mode: sessionModeForWeek(group, session.weekId),
    week: week ?? {},
  });
  return {
    published: Boolean(week?.published),
    missing: week ? emptyNudgeValues(args.template, groupNudgeTokens(facts)) : [],
    facts,
    week,
  };
}

/**
 * Send one group its email about `session`, once.
 *
 * The caller has already decided the email is due: the push because a
 * register was pushed with the schedule off, the schedule because the session
 * is inside its window, an admin because they asked for a resend. This
 * function decides only whether it CAN go, and makes sure it goes once.
 */
export async function sendNextWeekEmail(args: {
  db: Firestore;
  run: CourseRunDoc;
  group: CourseGroupDoc;
  /** The session the email is about: the group's next one. */
  session: ResolvedSession;
  /** The register whose push sent it, when a push did. Stored on the marker. */
  pushedSessionKey: string | null;
  by: NextWeekEmailSender;
  /** Send over a claim that is already taken, recording the force. Admins only. */
  force: boolean;
  /** Hold the email when a value it uses is empty, rather than drop a sentence. */
  whole: boolean;
  config: CoursesConfig;
  now: Date;
  appUrl: string;
  /** Resolved once by a caller that sends to many groups; read here otherwise. */
  template?: CourseNudgeTemplate;
}): Promise<NextWeekEmailOutcome> {
  const { db, run, group, session } = args;
  const outcome = (
    held: NextWeekEmailOutcome["held"],
    reason: string,
    extra: Partial<NextWeekEmailOutcome> = {},
  ): NextWeekEmailOutcome => ({
    sent: 0,
    skipped: 0,
    forced: false,
    reason,
    held,
    missing: [],
    ...extra,
  });

  const markerId = nextWeekEmailMarkerId(run.id, group.id, session);
  if (!markerId) {
    // The marker id is keyed on the session's slot. Without dates there is no
    // key, and a send with no once-only marker is one that can repeat.
    return outcome("no-date", "This group has no dates set, so no reminder could be sent.");
  }

  const template = args.template ?? (await resolveCourseNudgeTemplate(db));
  const reading = await readNextWeekEmail(db, {
    run,
    group,
    session,
    template,
    feedbackUrl: args.config.weeklyFeedbackUrl,
    appUrl: args.appUrl,
  });

  // Read BEFORE anything is claimed: an unpublished week is a reason to wait,
  // and claiming first would silence the email for good.
  if (!reading.week || !reading.published) {
    return outcome(
      "unpublished",
      args.by.kind === "push"
        ? `Week ${session.weekNumber} isn't published yet, so the group wasn't sent a reminder. Publish it and use the run's catch-up send.`
        : `Week ${session.weekNumber} isn't published yet, so its email is waiting.`,
    );
  }
  if (args.whole && reading.missing.length > 0) {
    return outcome(
      "missing",
      `Next week's email to ${group.name || "this group"} is held: a value it uses is empty.`,
      { missing: reading.missing },
    );
  }

  // SCOPED TO THIS GROUP INSIDE the derivation: the recipient ceiling has to
  // be counted on the group being mailed, not on the whole run.
  const audience = await resolveCohortAudience(db, run.id, LANE, { groupId: group.id });
  if (audience.refusal) {
    return outcome("refused", audience.refusal, { skipped: audience.skipped });
  }
  const recipients: CohortRecipient[] = audience.members;
  let skipped = audience.skipped;
  if (recipients.length === 0) {
    // Deliberately does NOT claim: an audience empty today (everyone opted
    // out, nobody placed yet) must not suppress the email for whoever becomes
    // deliverable tomorrow.
    return outcome(
      "nobody",
      "Nobody in this group is set up to receive email, so none was sent.",
      { skipped },
    );
  }

  // ── THE CLAIM ────────────────────────────────────────────────────────────
  const markerRef = db.collection("courseNudges").doc(markerId);
  let forced = false;
  try {
    await markerRef.create({
      kind: "group-week-nudge",
      runId: run.id,
      groupId: group.id,
      // The slot is the KEY; the rest is stored so the document reads as
      // something a person can interpret.
      slotStartKey: session.slotStartKey,
      sessionKey: session.sessionKey,
      weekNumber: session.weekNumber,
      weekId: session.weekId,
      pushedSessionKey: args.pushedSessionKey,
      // Which lane sent it: a push names the person, the schedule its job.
      via: args.by.kind,
      sentAt: args.now,
      sentByUid: args.by.kind === "push" ? args.by.uid : null,
      sentByJob: args.by.kind === "schedule" ? args.by.jobId : null,
      recipientCount: recipients.length,
      // The run-level catch-up records a force over this marker in its own
      // document; these two fields exist so both families read alike.
      forceCount: 0,
      forces: [],
    });
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
    if (!args.force || args.by.kind !== "push") {
      // Another push, the schedule or the catch-up already claimed this
      // group's email about this session.
      return outcome(
        "claimed",
        "This group has already had the reminder for its next session.",
        { skipped },
      );
    }
    // ── THE PER-GROUP RESEND ───────────────────────────────────────────────
    // AUDIT FIRST, then send. The marker is UPDATED, never deleted: the record
    // of the first send survives the second.
    forced = true;
    await markerRef.update({
      forceCount: FieldValue.increment(1),
      lastForcedAt: args.now,
      lastForcedByUid: args.by.uid,
      forces: FieldValue.arrayUnion({
        uid: args.by.uid,
        at: args.now,
        recipientCount: recipients.length,
        forcedOverMarkerId: markerRef.id,
      }),
    });
    console.warn(
      "[courses next week email] FORCED re-send of a claimed group email",
      run.id,
      group.id,
      session.sessionKey,
      args.by.uid,
      recipients.length,
    );
  }

  const channel = courseRunChannel(run.id);
  const actorUid = args.by.kind === "push" ? args.by.uid : args.by.jobId;
  let sent = 0;
  // Bounded concurrency: `dispatchSends` keeps a group's send inside the
  // request and tick time limits.
  await dispatchSends(recipients, async (recipient) => {
    // One token per recipient, scoped to THIS run's channel: clicking it drops
    // the cohort and nothing else.
    const token = signToken(
      { s: "unsubscribe", uid: recipient.uid, c: channel },
      UNSUB_TOKEN_TTL_SECONDS,
    );
    const unsubscribeUrl = `${args.appUrl}/api/unsubscribe?t=${encodeURIComponent(token)}`;
    try {
      // ONE address. One message. Never an array, never a Cc.
      await sendCourseWeekNudgeEmail({
        to: recipient.address,
        runId: run.id,
        actorUid,
        test: false,
        // The placeholder-free name: "" drops the greeting rather than
        // addressing a member as "NAISI member".
        recipientName: recipient.ownName,
        sessionWhen: reading.facts.sessionWhen,
        sessionWhere: reading.facts.sessionWhere,
        unsubscribeUrl,
        template,
        context: reading.facts.context,
      });
      sent += 1;
    } catch (err) {
      // Uid only: an address must not reach the logs.
      console.error("[courses next week email] send failed", group.id, recipient.uid, err);
      skipped += 1;
    }
  });

  return { sent, skipped, forced, reason: null, held: null, missing: [] };
}
