import { NextResponse } from "next/server";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { pushBackOutcome, sessionOfWeek, slotDays } from "@/lib/courses/sessionChange/model";
import { parseChangePress, type ChangePress } from "@/lib/courses/sessionChange/parse";
import {
  REFUSAL,
  countChangedWords,
  dayOutOfWeekWords,
  dayRangeWords,
  updateWords,
} from "@/lib/courses/sessionChange/words";
import { updateEmailAudience } from "@/lib/courses/updates/audience";
import { londonWallClockToInstant, type WeekPlanEntry } from "@/lib/courses/weekPlan";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import {
  GROUP_FIELD_LIMITS,
  normalizeCourseGroup,
  sessionChangeForWeek,
  sessionModeForWeek,
  type CourseGroupDoc,
} from "@/lib/firestore/courseGroups";
import { COURSE_FIELD_LIMITS, normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";

/**
 * CHANGE ONE WEEK'S SESSION OF ONE GROUP (Q25, wk-session): hold it online,
 * move it for that week only, cancel it and keep pace, or cancel it and push
 * the rest back a week; or put a changed session back as usual.
 *
 * ── WHO ─────────────────────────────────────────────────────────────────────
 * The group's live facilitators (held to the bar they were appointed behind),
 * the lead of the programme that names the run, the run's track leads and
 * admins: "Rahul, Sofia, Claudia and admins can change a session." Nobody
 * else. A missing group, an archived one and somebody else's are one 403 for
 * everybody but an admin, so a group id says nothing.
 *
 * ── ORDER ───────────────────────────────────────────────────────────────────
 * View-as is refused first, then the session, then the body is checked
 * before anything is read (`parseChangePress`). Then the group and its run
 * are read for the gate, and only then the group's other facts: its sessions,
 * and who an update to it would email.
 *
 * ── WHOLE OR NOT AT ALL ─────────────────────────────────────────────────────
 * Every refusal comes before the write: the session must be the one the
 * dialog showed (its week and date), must not have started, and must be
 * changeable the way asked (a link to hold it online, a day in its own week to
 * move it to, a plan to push it back in). When the press will tell the group
 * with an email, the number on its button is checked here first, so a count
 * that no longer holds refuses the whole press (409, with the new count) and
 * nothing changes. The write is one transaction that reads the group again.
 *
 * ── TELLING THE GROUP ───────────────────────────────────────────────────────
 * This route never sends anything. With "Tell the group" on it answers with
 * the update's words, and the dialog posts them to the group through the
 * updates route (`/api/courses/runs/[runId]/updates`): the one lane an update
 * and its email go through, with its own gate, caps, count and receipts.
 * Nothing here can put a meeting link in a message: the reason and a room are
 * refused when they hold one, and the online update says where the link is.
 */

/** What the press changed, for the dialog's sentence. */
type Answer = {
  ok: true;
  change: { kind: ChangePress["kind"]; weekNumber: number; dateKey: string; newDateKey: string | null };
  update: { groupId: string; title: string; message: string; emailCount: number } | null;
};

class Refusal extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "Refusal";
  }
}

async function readRun(db: Firestore, runId: string): Promise<CourseRunDoc | null> {
  if (!runId || !isAddressableId(runId)) return null;
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists) return null;
  const raw = snap.data() ?? {};
  if (raw.destroying === true) return null;
  return normalizeCourseRun(snap.id, raw);
}

/** The week's one-week changes, counted against the cap the normaliser reads them under. */
function fitsTheCap(map: Record<string, unknown>, weekId: string): boolean {
  return Object.hasOwn(map, weekId) || Object.keys(map).length < GROUP_FIELD_LIMITS.maxSessionOverrides;
}

export async function POST(req: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // The body is checked before any document is read.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: REFUSAL.body }, { status: 400 });
  }
  const parsed = parseChangePress(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const press = parsed.value;

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ── The gate ──────────────────────────────────────────────────────────────
  const groupRef = db.collection("courseGroups").doc(groupId);
  const groupSnap = await groupRef.get();
  const found = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
  const isAdmin = actor.role === "admin";
  const facilitates = Boolean(
    found && !found.archived && isNamedWithStanding(actor, "courseGroups.facilitatorUids", found.facilitatorUids),
  );
  const run = found ? await readRun(db, found.runId) : null;
  const staffsRun = !isAdmin && !facilitates && run ? doesTrackLeadWork(await runStaffingOf(db, actor, run)) : false;
  if (!isAdmin && !facilitates && !staffsRun) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!found || !run) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (found.archived) return NextResponse.json({ error: REFUSAL.gone }, { status: 400 });

  // ── The session, as the dialog showed it ─────────────────────────────────
  const now = new Date();
  let outcome: { change: Answer["change"]; restored: Checked["restored"] };
  try {
    checkPress(run, found, press, now);
    if (press.tell && press.emailCount > 0) {
      // The number on the button is a promise: checked before anything changes,
      // by the function the update's own press counts with.
      const groups: CourseGroupDoc[] = [found];
      const audience = await updateEmailAudience(db, run, groups, "group", found.id);
      if (audience.refused) throw new Refusal(REFUSAL.overCap, 400);
      if (audience.recipients.length === 0) throw new Refusal(REFUSAL.nobodyToEmail, 400);
      if (audience.recipients.length !== press.emailCount) {
        throw new Refusal(countChangedWords(audience.recipients.length), 409, {
          emails: audience.recipients.length,
        });
      }
    }

    // ── The write, on the group as it stands now ───────────────────────────
    outcome = await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(groupRef);
      if (!freshSnap.exists) throw new Refusal(REFUSAL.gone, 400);
      const group = normalizeCourseGroup(freshSnap.id, freshSnap.data() ?? {});
      if (group.archived || group.runId !== run.id) throw new Refusal(REFUSAL.gone, 400);
      const checked = checkPress(run, group, press, now);
      const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      const weekId = checked.weekId;
      const record = {
        reason: press.reason,
        dateKey: checked.dateKey,
        byUid: actor.uid,
        at: FieldValue.serverTimestamp(),
      };
      const rawGroup = freshSnap.data() ?? {};
      const changes = (rawGroup.sessionChanges ?? {}) as Record<string, unknown>;
      if (press.kind !== "restore" && !fitsTheCap(changes, weekId)) throw new Refusal(REFUSAL.full, 400);

      switch (press.kind) {
        case "online": {
          const modes = (rawGroup.sessionModes ?? {}) as Record<string, unknown>;
          if (!fitsTheCap(modes, weekId)) throw new Refusal(REFUSAL.full, 400);
          update[`sessionModes.${weekId}`] = "virtual";
          update[`sessionChanges.${weekId}`] = { kind: "online", ...record };
          break;
        }
        case "move": {
          const move = press.move;
          if (!move || !checked.move) throw new Refusal(REFUSAL.move, 400);
          const overrides = (rawGroup.sessionOverrides ?? {}) as Record<string, unknown>;
          if (!fitsTheCap(overrides, weekId)) throw new Refusal(REFUSAL.full, 400);
          update[`sessionOverrides.${weekId}.weekday`] = checked.move.weekday;
          update[`sessionOverrides.${weekId}.startTimeLocal`] = move.startTimeLocal;
          update[`sessionOverrides.${weekId}.location`] = move.room;
          // A moved session meets in its room: whatever the week said before
          // about meeting online goes with the old arrangement.
          update[`sessionModes.${weekId}`] = FieldValue.delete();
          update[`sessionChanges.${weekId}`] = { kind: "moved", ...record };
          break;
        }
        case "cancel":
          update[`sessionChanges.${weekId}`] = { kind: "cancelled", ...record };
          break;
        case "push": {
          if (!checked.pushed) throw new Refusal(REFUSAL.noPlan, 400);
          update.paceWeekPlan = checked.pushed.plan;
          update[`sessionChanges.${weekId}`] = { kind: "pushed", ...record };
          break;
        }
        case "restore":
          update[`sessionOverrides.${weekId}`] = FieldValue.delete();
          update[`sessionModes.${weekId}`] = FieldValue.delete();
          update[`sessionChanges.${weekId}`] = FieldValue.delete();
          break;
      }
      tx.update(groupRef, update);
      return {
        restored: checked.restored,
        change: {
          kind: press.kind,
          weekNumber: press.weekNumber,
          dateKey: checked.dateKey,
          newDateKey: checked.move?.dateKey ?? checked.pushed?.newDateKey ?? checked.restored?.dateKey ?? null,
        },
      };
    });
  } catch (err) {
    if (err instanceof Refusal) {
      return NextResponse.json({ error: err.message, ...err.detail }, { status: err.status });
    }
    console.error("[courses session change] failed", groupId, err);
    return NextResponse.json({ error: "That change didn’t go through, so nothing was changed." }, { status: 500 });
  }

  const answer: Answer = {
    ok: true,
    change: outcome.change,
    update: press.tell ? updateFor(press, outcome.change, outcome.restored, found.id) : null,
  };
  return NextResponse.json(answer);
}

/** The update the dialog posts to the group, with the count its email reaches. */
function updateFor(
  press: ChangePress,
  change: Answer["change"],
  restored: Checked["restored"],
  groupId: string,
): Answer["update"] {
  const words = (() => {
    switch (press.kind) {
      case "cancel":
        return updateWords({ kind: "cancel", dateKey: change.dateKey, weekNumber: change.weekNumber }, press.reason);
      case "push":
        return updateWords(
          { kind: "push", dateKey: change.dateKey, weekNumber: change.weekNumber, newDateKey: change.newDateKey ?? "" },
          press.reason,
        );
      case "online":
        return updateWords({ kind: "online", dateKey: change.dateKey }, press.reason);
      case "move":
        return updateWords(
          {
            kind: "move",
            dateKey: change.dateKey,
            newDateKey: change.newDateKey ?? change.dateKey,
            hhmm: press.move?.startTimeLocal ?? "",
            room: press.move?.room ?? "",
          },
          press.reason,
        );
      case "restore":
        return updateWords(
          {
            kind: "restore",
            weekNumber: change.weekNumber,
            dateKey: restored?.dateKey ?? change.dateKey,
            hhmm: restored?.hhmm ?? "",
            room: restored?.room ?? "",
          },
          press.reason,
        );
    }
  })();
  return { groupId, title: words.title, message: words.message, emailCount: press.emailCount };
}

/** What a press resolves to on one reading of the group. */
type Checked = {
  weekId: string;
  /** The session's date: the evening a cancel takes off, the date a move moves from. */
  dateKey: string;
  move: { dateKey: string; weekday: number } | null;
  pushed: { plan: WeekPlanEntry[]; newDateKey: string } | null;
  /** Where a session put back as usual then falls. */
  restored: { dateKey: string; hhmm: string; room: string } | null;
};

/**
 * Every refusal a press can meet on the group as it stands, asked once
 * before the write and again inside it. Throws a `Refusal`.
 */
function checkPress(run: CourseRunDoc, group: CourseGroupDoc, press: ChangePress, now: Date): Checked {
  const sessions = resolveSessions(run, group);
  const session = sessionOfWeek(sessions, press.weekNumber);
  if (!session || !session.dateKey) throw new Refusal(REFUSAL.noSuchSession, 400);
  if (session.dateKey !== press.dateKey) throw new Refusal(REFUSAL.stale, 409);
  const { startsAt } = sessionInstants(session);
  if (!startsAt || startsAt.getTime() <= now.getTime()) throw new Refusal(REFUSAL.started, 409);
  const weekId = session.weekId;
  const change = sessionChangeForWeek(group, weekId);

  const checked: Checked = { weekId, dateKey: session.dateKey, move: null, pushed: null, restored: null };
  switch (press.kind) {
    case "online":
      if (!session.session.meetingUrl) throw new Refusal(REFUSAL.noLink, 400);
      break;
    case "move": {
      const move = press.move;
      if (!move) throw new Refusal(REFUSAL.move, 400);
      const days = slotDays(session.slotStartKey);
      if (!days.includes(move.dateKey)) {
        throw new Refusal(
          dayOutOfWeekWords(session.weekNumber, dayRangeWords(days[0] ?? "", days[days.length - 1] ?? "")),
          400,
        );
      }
      if (!move.room && session.session.location.trim()) throw new Refusal(REFUSAL.room, 400);
      const weekday = new Date(`${move.dateKey}T12:00:00Z`).getUTCDay();
      const same =
        move.dateKey === session.dateKey &&
        move.startTimeLocal === session.session.startTimeLocal &&
        move.room === session.session.location.trim() &&
        !session.cancelled &&
        sessionModeForWeek(group, weekId) !== "virtual";
      if (same) throw new Refusal(REFUSAL.sameAsNow, 400);
      let movedStart: Date | null = null;
      try {
        movedStart = londonWallClockToInstant(move.dateKey, move.startTimeLocal);
      } catch {
        movedStart = null;
      }
      if (!movedStart || movedStart.getTime() <= now.getTime()) throw new Refusal(REFUSAL.movedIntoPast, 400);
      checked.move = { dateKey: move.dateKey, weekday };
      break;
    }
    case "cancel":
      break;
    case "push": {
      const pushed = pushBackOutcome(run, group, press.weekNumber);
      if (!pushed) throw new Refusal(REFUSAL.noPlan, 400);
      if (pushed.plan.length > COURSE_FIELD_LIMITS.maxWeekPlanEntries) throw new Refusal(REFUSAL.planFull, 400);
      checked.pushed = { plan: pushed.plan, newDateKey: pushed.newDateKey };
      break;
    }
    case "restore": {
      // A week's own arrangement: a change record (other than a push, which
      // moved the weeks rather than this one), or a one-week override or mode
      // set some other way. Putting it back clears all three.
      const arranged = Object.hasOwn(group.sessionOverrides, weekId);
      if (!(change && change.kind !== "pushed") && !arranged) throw new Refusal(REFUSAL.notChanged, 400);
      const sessionOverrides = { ...group.sessionOverrides };
      delete sessionOverrides[weekId];
      const sessionChanges = { ...group.sessionChanges };
      delete sessionChanges[weekId];
      const back = sessionOfWeek(resolveSessions(run, { ...group, sessionOverrides, sessionChanges }), press.weekNumber);
      checked.restored = back
        ? { dateKey: back.dateKey, hhmm: back.session.startTimeLocal, room: back.session.location }
        : null;
      break;
    }
  }
  return checked;
}
