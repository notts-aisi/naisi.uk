import { NextResponse } from "next/server";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import {
  groupHistoryRow,
  iso,
  lockOf,
  momentOf,
  momentValues,
  readJobSwitches,
  reminderFacts,
  saidFacts,
  startOf,
  toldFacts,
} from "@/lib/courses/groupChange/facts";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { ChangeRefusal, checkPress, type CheckedPress } from "@/lib/courses/sessionChange/check";
import {
  callsOffDraft,
  clearedNames,
  closeCalledOffFollowUp,
  didNotHappenFacts,
  writeDidNotHappen,
} from "@/lib/courses/sessionChange/didNotHappen";
import { sessionOfWeek } from "@/lib/courses/sessionChange/model";
import { oneWeekHistoryDetail, oneWeekNoticeFor, weekSessionAfter } from "@/lib/courses/sessionChange/notice";
import { parseChangePress, type ChangePress } from "@/lib/courses/sessionChange/parse";
import { REFUSAL, countChangedWords } from "@/lib/courses/sessionChange/words";
import { updateEmailAudience } from "@/lib/courses/updates/audience";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { attendanceDocId, registerIsTaken } from "@/lib/firestore/courseAttendance";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import {
  GROUP_FIELD_LIMITS,
  normalizeCourseGroup,
  type CourseGroupDoc,
} from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";

/**
 * CHANGE ONE WEEK'S SESSION OF ONE GROUP: hold it online,
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
  update: {
    groupId: string;
    title: string;
    message: string;
    emailCount: number;
    /** Post it with the group's facilitators in its email too. */
    withFacilitators: true;
  } | null;
};

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

/** The register of one week's first session: where its `sessionAt` lives. */
function registerRefOf(db: Firestore, run: CourseRunDoc, groupId: string, weekNumber: number): DocumentReference {
  return db.collection("courseAttendance").doc(attendanceDocId(run.id, groupId, weekNumber, 1));
}

/** The weeks whose first session starts at another instant after the press: their registers' `sessionAt` follows. */
function movedSessions(before: readonly ResolvedSession[], after: readonly ResolvedSession[]): ResolvedSession[] {
  const out: ResolvedSession[] = [];
  for (const now of after) {
    if (now.occurrence !== 1) continue;
    const was = before.find((each) => each.weekNumber === now.weekNumber && each.occurrence === 1);
    const from = startOf(was);
    const to = startOf(now);
    if (to && (!from || from.getTime() !== to.getTime())) out.push(now);
  }
  return out;
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
  const registerRef = registerRefOf(db, run, found.id, press.weekNumber);
  let outcome: { change: Answer["change"]; checked: CheckedPress };
  try {
    const registerSnap = await registerRef.get();
    const register = registerSnap.exists ? (registerSnap.data() ?? {}) : undefined;
    const first = checkPress(run, found, press, now, register);
    const naming = await readNamingProgramme(db, run.id);
    const incubator = naming?.kind === "incubator";
    const groupName = found.name.trim() || "Untitled group";

    if (press.preview) {
      const before = resolveSessions(run, found);
      const after = resolveSessions(run, first.after);
      const switches = await readJobSwitches(db);
      const [reminders, said, told] = await Promise.all([
        reminderFacts(db, { run, group: found, before: first.session, after: weekSessionAfter(run, first, press.weekNumber), switches }),
        saidFacts(db, register),
        toldFacts(db, run, found, actor.uid),
      ]);
      const afterSession = sessionOfWeek(after, press.weekNumber);
      const lastOf = (sessions: readonly ResolvedSession[]) =>
        sessions.filter((s) => !s.cancelled && s.dateKey).reduce((last, s) => (s.dateKey > last ? s.dateKey : last), "");
      return NextResponse.json({
        ok: true,
        preview: {
          kind: press.kind,
          weekNumber: press.weekNumber,
          started: first.started,
          before: momentOf(found, first.session),
          after: momentOf(first.after, afterSession),
          lastSession: { before: lastOf(before), after: lastOf(after) },
          lock: { before: lockOf(before, press.weekNumber), after: lockOf(after, press.weekNumber) },
          reminders,
          said,
          told,
          register: { exists: register !== undefined, taken: registerIsTaken(register) },
          // Called off after it passed: what else follows (`./didNotHappen`).
          didNotHappen:
            first.started && (press.kind === "cancel" || press.kind === "push")
              ? await didNotHappenFacts(db, { run, group: found, session: first.session, register })
              : null,
          notice: oneWeekNoticeFor(run, first, press, { groupName, incubator }),
          at: iso(now),
        },
      });
    }

    if (press.tell && press.emailCount > 0) {
      // The number on the button is a promise: checked before anything changes,
      // by the function the update's own press counts with.
      const groups: CourseGroupDoc[] = [found];
      const audience = await updateEmailAudience(db, run, groups, "group", found.id, actor.uid, {
        withFacilitators: true,
      });
      if (audience.refused) throw new ChangeRefusal(REFUSAL.overCap, 400);
      if (audience.recipients.length === 0) throw new ChangeRefusal(REFUSAL.nobodyToEmail, 400);
      if (audience.recipients.length !== press.emailCount) {
        throw new ChangeRefusal(countChangedWords(audience.recipients.length), 409, {
          emails: audience.recipients.length,
        });
      }
    }

    // ── The write, on the group as it stands now ───────────────────────────
    // Who the lines of a draft called off after the fact belonged to, for the
    // history's sentence: read before the transaction.
    const names = callsOffDraft(press, register, first.session) ? await clearedNames(db, register) : new Map<string, string>();
    outcome = await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(groupRef);
      if (!freshSnap.exists) throw new ChangeRefusal(REFUSAL.gone, 400);
      const group = normalizeCourseGroup(freshSnap.id, freshSnap.data() ?? {});
      if (group.archived || group.runId !== run.id) throw new ChangeRefusal(REFUSAL.gone, 400);
      const freshRegister = await tx.get(registerRef);
      const checked = checkPress(run, group, press, now, freshRegister.exists ? (freshRegister.data() ?? {}) : undefined);

      // Every session whose start moves, and its register: read before anything is written.
      const before = resolveSessions(run, group);
      const moved = movedSessions(before, resolveSessions(run, checked.after));
      const movedRefs = moved.map((session) => registerRefOf(db, run, group.id, session.weekNumber));
      const movedSnaps = movedRefs.length ? await tx.getAll(...movedRefs) : [];

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
      if (press.kind !== "restore" && !fitsTheCap(changes, weekId)) throw new ChangeRefusal(REFUSAL.full, 400);

      switch (press.kind) {
        case "online": {
          const modes = (rawGroup.sessionModes ?? {}) as Record<string, unknown>;
          if (!fitsTheCap(modes, weekId)) throw new ChangeRefusal(REFUSAL.full, 400);
          update[`sessionModes.${weekId}`] = "virtual";
          update[`sessionChanges.${weekId}`] = { kind: "online", ...record };
          break;
        }
        case "move": {
          const move = checked.move;
          if (!move) throw new ChangeRefusal(REFUSAL.move, 400);
          const overrides = (rawGroup.sessionOverrides ?? {}) as Record<string, unknown>;
          if (!fitsTheCap(overrides, weekId)) throw new ChangeRefusal(REFUSAL.full, 400);
          update[`sessionOverrides.${weekId}.weekday`] = move.weekday;
          update[`sessionOverrides.${weekId}.startTimeLocal`] = move.startTimeLocal;
          update[`sessionOverrides.${weekId}.location`] = move.location;
          if (press.move?.durationMinutes !== null && press.move?.durationMinutes !== undefined) {
            update[`sessionOverrides.${weekId}.durationMinutes`] = press.move.durationMinutes;
          }
          if (move.campus) update[`sessionOverrides.${weekId}.campus`] = move.campus;
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
          if (!checked.pushed) throw new ChangeRefusal(REFUSAL.noPlan, 400);
          update.paceWeekPlan = checked.pushed.plan;
          update[`sessionChanges.${weekId}`] = { kind: "pushed", ...record };
          break;
        }
        case "restore": {
          // Only what a change sets goes: the week's own link and notes stay.
          const left = checked.restoredOverride;
          if (left) {
            for (const field of ["weekday", "startTimeLocal", "durationMinutes", "location", "campus"]) {
              update[`sessionOverrides.${weekId}.${field}`] = FieldValue.delete();
            }
          } else {
            update[`sessionOverrides.${weekId}`] = FieldValue.delete();
          }
          update[`sessionModes.${weekId}`] = FieldValue.delete();
          update[`sessionChanges.${weekId}`] = FieldValue.delete();
          break;
        }
      }
      tx.update(groupRef, update);

      // A register nobody has taken keeps the session's start with it.
      moved.forEach((session, index) => {
        const snap = movedSnaps[index];
        const startsAt = sessionInstants(session).startsAt;
        if (!snap?.exists || !startsAt || registerIsTaken(snap.data() ?? {})) return;
        tx.update(movedRefs[index], { sessionAt: startsAt });
      });

      const emailed = press.tell ? press.emailCount : 0;
      const afterSession = weekSessionAfter(run, checked, press.weekNumber);
      // It didn't happen, on a draft somebody marked: its lines go, in this write.
      const freshData = freshRegister.exists ? (freshRegister.data() ?? {}) : undefined;
      if (checked.started && freshData && callsOffDraft(press, freshData, checked.session)) {
        writeDidNotHappen(tx, db, {
          ref: registerRef,
          register: freshData,
          kind: press.kind as "cancel" | "push",
          run,
          group,
          actor,
          weekNumber: press.weekNumber,
          weekId,
          after: afterSession,
          reason: press.reason,
          emailed,
          names,
        });
      }
      tx.set(
        db.collection(COURSE_AUDIT_COLLECTION).doc(),
        groupHistoryRow({
          kind: checked.auditKind,
          run,
          group,
          actor,
          detail: oneWeekHistoryDetail(run, checked, press, emailed),
          weekId,
          before: momentValues(momentOf(group, checked.session)),
          after: momentValues(momentOf(checked.after, afterSession)),
          reason: press.reason,
          emailed,
        }),
      );
      return {
        checked,
        change: {
          kind: press.kind,
          weekNumber: press.weekNumber,
          dateKey: checked.dateKey,
          newDateKey:
            press.kind === "move"
              ? (checked.move?.dateKey ?? null)
              : press.kind === "push"
                ? (checked.pushed?.newDateKey ?? null)
                : press.kind === "restore"
                  ? (afterSession?.dateKey ?? null)
                  : null,
        },
      };
    });

    // A session called off after it passed has no register left to finish.
    if (outcome.checked.started && (press.kind === "cancel" || press.kind === "push")) {
      await closeCalledOffFollowUp(db, { runId: run.id, groupId: found.id, sessionKey: outcome.checked.session.sessionKey });
    }

    const answer: Answer = {
      ok: true,
      change: outcome.change,
      update: press.tell
        ? {
            groupId: found.id,
            ...oneWeekNoticeFor(run, outcome.checked, press, { groupName, incubator }),
            emailCount: press.emailCount,
            withFacilitators: true,
          }
        : null,
    };
    return NextResponse.json(answer);
  } catch (err) {
    if (err instanceof ChangeRefusal) {
      return NextResponse.json({ error: err.message, ...err.detail }, { status: err.status });
    }
    console.error("[courses session change] failed", groupId, err);
    return NextResponse.json({ error: "That change didn’t go through, so nothing was changed." }, { status: 500 });
  }
}
