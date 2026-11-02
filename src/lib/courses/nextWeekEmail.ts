import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import WeekEmail from "@/emails/WeekEmail";
import { unpublishedHeldWords } from "@/features/courses/registerEndingWords";
import { memberExplainerOn } from "@/lib/courses/explainers/model";
import { readRunExplainers } from "@/lib/courses/explainers/readers";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { nextWeekChangeLine } from "@/lib/courses/sessionChange/model";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { weekTaskNeeds } from "@/lib/courses/weekBlocks/progress";
import { blockWeekAsks, legacyWeekAsks } from "@/lib/courses/weekEmails/model";
import {
  missingWeekOpenValues,
  weekOpenEmailWords,
  type WeekOpenFacts,
  type WeekOpenValue,
} from "@/lib/courses/weekEmails/words";
import { dispatchSends } from "@/lib/email/dispatch";
import {
  resolveNoticeAudience,
  type CohortAudience,
  type CohortRecipient,
} from "@/lib/email/courseFacilitatorEmails";
import {
  courseNudgeSessionWhere,
  courseWeekUrl,
  groupNudgeMarkerId,
} from "@/lib/email/courseNudgeEmail";
import { sendNotice } from "@/lib/email/notice";
import { firstWord } from "@/lib/firestore/applicationEmails";
import type { CoursesConfig } from "@/lib/firestore/config";
import { sessionModeForWeek, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";

/**
 * "WEEK N IS OPEN", TO ONE GROUP: the one place it is resolved, claimed and
 * sent, whichever lane sends it. It is the group's email about one of its
 * sessions: the week, when and where the group meets, what the week asks
 * for, and a button to its page (the words are
 * `src/lib/courses/weekEmails/words.ts`).
 *
 * Two lanes send it, and exactly one of them is live at a time:
 *
 *  - THE PUSH. A facilitator pushing the register after a session sends the
 *    group the email about its next session, 6 or 7 days before it. That is
 *    how it goes while the `courses-next-week-email` job is switched off.
 *  - THE SCHEDULE. With that job switched on, the email goes 6 days before
 *    each session at 9am in London (the group's first included), whatever
 *    happens to the register, and pushing (now "Finish the register") emails
 *    nobody.
 *
 * ── A NOTICE ────────────────────────────────────────────────────────────────
 * It reaches everybody holding a place in the group whose group has gone
 * out, whatever they unsubscribed from (`resolveNoticeAudience`), says why
 * above its words, carries no unsubscribe link, and goes by email alone,
 * through the notice lane's door (`sendNotice`, surface `course-week`). It is
 * the people running the programme telling the people on it what this week
 * is; it used to be optional mail, and is not any more.
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
 *     claim already taken and sends nothing.
 *
 * The marker lives in `courseNudges` rather than `schedulerMarkers` on
 * purpose, although one lane is a tick: the claim has to be ONE document that
 * a human press and a tick both aim at, and `courseNudges` is where the human
 * lane's claim has always lived.
 *
 * ── CLAIM BEFORE SEND ───────────────────────────────────────────────────────
 * Everything the email needs (the week, the audience) is read BEFORE the
 * claim, so a failure there leaves nothing claimed and the next attempt
 * starts clean. After the claim only the transport can fail, and a missed
 * email is recovered by an admin's per-group resend, which forces over the
 * claim and records that it did.
 *
 * ── WHOLE OR NOT AT ALL ─────────────────────────────────────────────────────
 * `whole: true` (the schedule, and any resend once the schedule is on) holds
 * the group's email when a fact it carries is empty (the group's day and
 * time or its room, the week's title, what the week asks for) and says which,
 * rather than sending it without. `whole: false` is the push lane as it has
 * always been: a missing fact drops its words.
 *
 * ── WHAT A PRESS WOULD DO, SAID BEFORE IT ───────────────────────────────────
 * The register's page says what pressing its button emails before anybody
 * presses (`previewNextWeekEmails`, through `src/lib/courses/pushEmail.ts`).
 * It asks the very decision the send makes (`prepareNextWeekEmail`), so the
 * page and the press cannot disagree about who is emailed, or why nobody is.
 */

/** Who is sending, recorded on the marker. */
export type NextWeekEmailSender =
  | { kind: "push"; uid: string }
  | { kind: "schedule"; jobId: string };

export type NextWeekEmailOutcome = {
  /** Emails that went. */
  sent: number;
  /** Recipients dropped along the way: no address, suppressed, failed. */
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
  missing: WeekOpenValue[];
};

/**
 * This lane's voice in the shared audience derivation. The advice names the
 * GROUP: the ceiling is counted on this group's places.
 */
const LANE = {
  logTag: "courses week open email",
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
  /** The facts it carries that are empty, of the ones a whole email needs. */
  missing: WeekOpenValue[];
  /** Everything it says, but the greeting. */
  facts: WeekOpenFacts;
  week: Awaited<ReturnType<typeof resolveWeekDoc>>["week"];
};

/**
 * Read what one group's email about `session` would carry: the week as this
 * group sees it (its own copy when it has one), whether that week is
 * published, every fact the email says, and which of them are empty.
 *
 * AN EXPLAINER an admin scheduled at the start of the session is read here,
 * when the email is built, so the line goes only in an email that has not
 * gone yet. It is never a value a whole email waits for, and a read of it
 * that fails leaves the line out rather than hold the group's email: each
 * person's ticket says it either way.
 */
export async function readNextWeekEmail(
  db: Firestore,
  args: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    session: ResolvedSession;
    feedbackUrl: string;
    appUrl: string;
  },
): Promise<NextWeekEmailReading> {
  const { run, group, session } = args;
  // Asked beside the week, and waited for after it.
  const explainersRead = readRunExplainers(db, run.id).catch((err: unknown) => {
    console.error("[courses week open email] explainers could not be read", run.id, err);
    return [];
  });
  const { week } = await resolveWeekDoc(db, run.id, group.id, session.weekId);
  const explainers = await explainersRead;
  const sessions = resolveSessions(run, group);
  const blocks = week && isBlockWeek(week) ? week.blocks : null;
  const facts: WeekOpenFacts = {
    courseTitle: run.courseTitle,
    weekNumber: session.weekNumber,
    weekTitle: week?.title ?? "",
    sessionAt: sessionInstants(session).startsAt,
    where: courseNudgeSessionWhere(session.session, sessionModeForWeek(group, session.weekId)),
    first: sessions[0]?.sessionKey === session.sessionKey,
    // A cancelled session's email says it is off, why, and when the group
    // meets next, in place of when and where it meets; the session after one
    // says it covers both weeks (`nextWeekChangeLine`).
    cancelled: session.cancelled,
    change: nextWeekChangeLine(sessions, group, session),
    asks: blocks ? blockWeekAsks(blocks, weekTaskNeeds(blocks)) : week ? legacyWeekAsks(week) : [],
    weekUrl: courseWeekUrl(args.appUrl, run.id, session.weekNumber),
    feedbackUrl: args.feedbackUrl,
    locks: blocks !== null,
    explainer: memberExplainerOn(explainers, group.id, session.sessionKey),
  };
  const missing = week ? missingWeekOpenValues(facts) : [];
  return { published: Boolean(week?.published), missing, facts, week };
}

/** An outcome in which nothing went, and why. */
function heldOutcome(
  held: NextWeekEmailOutcome["held"],
  reason: string,
  extra: Partial<NextWeekEmailOutcome> = {},
): NextWeekEmailOutcome {
  return { sent: 0, skipped: 0, forced: false, reason, held, missing: [], ...extra };
}

/** One group's email once nothing stops it: what it says and who it goes to, nothing claimed yet. */
type PreparedEmail = {
  ready: true;
  markerId: string;
  reading: NextWeekEmailReading;
  /** Who it goes to: everybody holding a place in the group, as `resolveNoticeAudience` answers. */
  members: CohortRecipient[];
  skipped: number;
};

/**
 * EVERYTHING `sendNextWeekEmail` DECIDES BEFORE IT CLAIMS, and nothing it
 * does after: read only. Whether the email can go (a date to key its claim
 * on, a published week, every fact when it goes whole, a group small enough
 * for one send, somebody to send it to) and, when it can, what it says and
 * who it goes to. The send and the register's preview below both ask this,
 * so the register's page cannot say a press emails people the press would
 * not email.
 */
async function prepareNextWeekEmail(
  db: Firestore,
  args: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    session: ResolvedSession;
    /** Who is asking: the push's words for an unpublished week say what to do next. */
    lane: NextWeekEmailSender["kind"];
    whole: boolean;
    config: CoursesConfig;
    appUrl: string;
    /** The group's audience, for a caller asking about several of its sessions; read here otherwise. */
    audience?: () => Promise<CohortAudience>;
  },
): Promise<{ ready: false; outcome: NextWeekEmailOutcome } | PreparedEmail> {
  const { run, group, session } = args;
  const markerId = nextWeekEmailMarkerId(run.id, group.id, session);
  if (!markerId) {
    // The marker id is keyed on the session's slot. Without dates there is no
    // key, and a send with no once-only marker is one that can repeat.
    return {
      ready: false,
      outcome: heldOutcome("no-date", "This group has no dates set, so no reminder could be sent."),
    };
  }

  const reading = await readNextWeekEmail(db, {
    run,
    group,
    session,
    feedbackUrl: args.config.weeklyFeedbackUrl,
    appUrl: args.appUrl,
  });

  // Read BEFORE anything is claimed: an unpublished week is a reason to wait,
  // and claiming first would silence the email for good. The push says only
  // what happened here: who marks the week ready depends on who pressed, so
  // the push route adds that sentence (`unpublishedPushWords`).
  if (!reading.week || !reading.published) {
    return {
      ready: false,
      outcome: heldOutcome(
        "unpublished",
        args.lane === "push"
          ? unpublishedHeldWords(session.weekNumber)
          : `Week ${session.weekNumber} isn't published yet, so its email is waiting.`,
      ),
    };
  }
  if (args.whole && reading.missing.length > 0) {
    return {
      ready: false,
      outcome: heldOutcome(
        "missing",
        `Week ${session.weekNumber}’s email to ${group.name || "this group"} is held: a value it uses is empty.`,
        { missing: reading.missing },
      ),
    };
  }

  // SCOPED TO THIS GROUP INSIDE the derivation: the recipient ceiling has to
  // be counted on the group being mailed, not on the whole run.
  const audience = args.audience
    ? await args.audience()
    : await resolveNoticeAudience(db, run.id, LANE, { groupId: group.id });
  if (audience.refusal) {
    return { ready: false, outcome: heldOutcome("refused", audience.refusal, { skipped: audience.skipped }) };
  }
  if (audience.members.length === 0) {
    // Deliberately does NOT claim: a group nobody in it can be emailed today
    // (nobody told their group yet) must not lose the email for whoever can
    // be tomorrow.
    return {
      ready: false,
      outcome: heldOutcome(
        "nobody",
        "Nobody in this group is set up to receive email, so none was sent.",
        { skipped: audience.skipped },
      ),
    };
  }
  return { ready: true, markerId, reading, members: audience.members, skipped: audience.skipped };
}

/** What a press of a register's button would do with the group's email about one session. */
export type NextWeekEmailPreview =
  /** It goes, to this many people. */
  | { goes: true; emails: number }
  /** It does not go, and why: the reason `sendNextWeekEmail` would answer with. */
  | { goes: false; why: Exclude<NextWeekEmailOutcome["held"], null> };

/**
 * WHAT PUSHING A REGISTER WOULD DO with the group's email about each of
 * `sessions`, worked out now and sent to nobody: the push's own decision
 * (`prepareNextWeekEmail`, with the push's rule that an empty fact drops its
 * words rather than holding the email), then whether the email has already
 * gone, because the push's claim is a create and a claim already taken sends
 * nothing. Read only: nothing is claimed, nothing is sent. The group's
 * audience is read once for every session asked about.
 */
export async function previewNextWeekEmails(
  db: Firestore,
  args: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    sessions: readonly ResolvedSession[];
    config: CoursesConfig;
    appUrl: string;
  },
): Promise<Map<string, NextWeekEmailPreview>> {
  const { run, group } = args;
  const out = new Map<string, NextWeekEmailPreview>();
  if (args.sessions.length === 0) return out;
  let audience: Promise<CohortAudience> | null = null;
  const audienceOnce = () =>
    (audience ??= resolveNoticeAudience(db, run.id, LANE, { groupId: group.id }));
  for (const session of args.sessions) {
    if (out.has(session.sessionKey)) continue;
    const prepared = await prepareNextWeekEmail(db, {
      run,
      group,
      session,
      lane: "push",
      // The push's rule while it sends the email (`whole: scheduled` in the
      // push route, and this is only asked while the schedule is off).
      whole: false,
      config: args.config,
      appUrl: args.appUrl,
      audience: audienceOnce,
    });
    if (!prepared.ready) {
      const { held } = prepared.outcome;
      out.set(session.sessionKey, { goes: false, why: held ?? "refused" });
      continue;
    }
    const claimed = (await db.collection("courseNudges").doc(prepared.markerId).get()).exists;
    out.set(
      session.sessionKey,
      claimed ? { goes: false, why: "claimed" } : { goes: true, emails: prepared.members.length },
    );
  }
  return out;
}

/**
 * Send one group its email about `session`, once.
 *
 * The caller has already decided the email is due: the push because a
 * register was pushed with the schedule off, the schedule because the session
 * is inside its window, an admin because they asked for a resend. This
 * function decides only whether it CAN go (`prepareNextWeekEmail`, which the
 * register's preview asks too), and makes sure it goes once.
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
  /** Hold the email when a fact it carries is empty, rather than send it without. */
  whole: boolean;
  config: CoursesConfig;
  now: Date;
  appUrl: string;
}): Promise<NextWeekEmailOutcome> {
  const { db, run, group, session } = args;
  const prepared = await prepareNextWeekEmail(db, {
    run,
    group,
    session,
    lane: args.by.kind,
    whole: args.whole,
    config: args.config,
    appUrl: args.appUrl,
  });
  if (!prepared.ready) return prepared.outcome;
  const { markerId, reading } = prepared;
  const recipients: CohortRecipient[] = prepared.members;
  let skipped = prepared.skipped;

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
      // A resend records itself here (`forces`), so a second send to a group
      // is always on the record afterwards.
      forceCount: 0,
      forces: [],
    });
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
    if (!args.force || args.by.kind !== "push") {
      // Another push, or the schedule, already claimed this group's email
      // about this session.
      return heldOutcome(
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
      "[courses week open email] FORCED re-send of a claimed group email",
      run.id,
      group.id,
      session.sessionKey,
      args.by.uid,
      recipients.length,
    );
  }

  const actorUid = args.by.kind === "push" ? args.by.uid : args.by.jobId;
  let sent = 0;
  // Bounded concurrency: `dispatchSends` keeps a group's send inside the
  // request and tick time limits.
  await dispatchSends(recipients, async (recipient) => {
    // The placeholder-free name: "" drops the greeting rather than addressing
    // somebody as "NAISI member".
    const words = weekOpenEmailWords(reading.facts, firstWord(recipient.ownName));
    try {
      // ONE address. One message. Never an array, never a Cc.
      await sendNotice({
        to: recipient.address,
        subject: words.subject,
        surface: "course-week",
        actorUid,
        referenceId: run.id,
        render: (marker) => WeekEmail({ words, notice: marker }),
      });
      sent += 1;
    } catch (err) {
      // Uid only: an address must not reach the logs.
      console.error("[courses week open email] send failed", group.id, recipient.uid, err);
      skipped += 1;
    }
  });

  return { sent, skipped, forced, reason: null, held: null, missing: [] };
}
