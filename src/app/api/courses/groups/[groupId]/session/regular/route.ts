import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { campusLabel } from "@/lib/courses/campus";
import {
  iso,
  lockOf,
  momentOf,
  readJobSwitches,
  reminderFacts,
  toldFacts,
} from "@/lib/courses/groupChange/facts";
import { claimGroupNotice, groupNoticeAudience, sendGroupChangeNotice } from "@/lib/courses/groupChange/notice";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { applyRegularChange, registerRefsOf, storedOverrideWeekIds } from "@/lib/courses/regularTime/apply";
import { planRegularChange, type RegularPlan } from "@/lib/courses/regularTime/model";
import { parseRegularPress, type RegularPress } from "@/lib/courses/regularTime/parse";
import { REGULAR_REFUSAL, countChangedWords, regularNoticeWords } from "@/lib/courses/regularTime/words";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import { resolveSessions } from "@/lib/courses/sessions";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { campusForWeek, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";

/**
 * A GROUP'S NEW REGULAR TIME, FROM A WEEK ONWARDS ("From a week onwards" on
 * the group's page): its day, start, length, room (or Room to be confirmed)
 * and, when given, its campus, from one taught week on, with earlier weeks
 * kept where they met.
 *
 * POST `{ fromWeek, weekday, time, length, room, roomToBeConfirmed?, campus?,
 * reason?, tell, emailCount?, preview? }`.
 *
 * ── WHO ─────────────────────────────────────────────────────────────────────
 * Admins, the lead of the programme that names the run and the run's track
 * leads (`doesTrackLeadWork`), the people who run the programme. Not a plain
 * facilitator: they change one week. A missing group and somebody else's are
 * one 403 for everybody but an admin. View-as is refused first, then the
 * session, then the body is checked before anything is read.
 *
 * ── WHAT IT DOES ────────────────────────────────────────────────────────────
 * In one transaction (`src/lib/courses/regularTime/apply.ts`, planned by
 * `src/lib/courses/regularTime/model.ts`): earlier weeks are pinned to when
 * they met, the standing slot changes, later weeks with their own one-week
 * change keep it, `timeQuestionSince` is stamped when the day or the start
 * changed (so people are asked "Can you make this time?" again), ticks under
 * "Most weeks, not all" for sessions on the old time are taken back, and one
 * row goes into the group's history. Refused, whole: a week the group does
 * not teach, a week whose register was taken (it met), a starting session
 * that would land on a time that has passed, nothing changed, and more weeks
 * set apart than a group holds.
 *
 * ── TELLING THE GROUP ───────────────────────────────────────────────────────
 * With `tell` on, one notice to the group's told people and its facilitators
 * with standing, never the presser (`src/lib/courses/groupChange/notice.ts`).
 * The count on the button is checked before anything changes (409 with the
 * new count), the day's notice for the group is claimed before anything
 * changes too, and the notice goes once the change is written. It never
 * carries a meeting link.
 *
 * ── A PREVIEW ───────────────────────────────────────────────────────────────
 * `preview: true` plans the same change and writes nothing: which weeks move
 * and to when, which weeks are kept (pinned) and their dates, the weeks that
 * keep their own one-week change, when each moved week's work locks before
 * and after, the member email jobs for the first two weeks that move,
 * whether the time question is asked again, who would be told, and the
 * notice.
 */

type Ctx = { params: Promise<{ groupId: string }> };

async function readRun(db: Firestore, runId: string): Promise<CourseRunDoc | null> {
  if (!runId || !isAddressableId(runId)) return null;
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists) return null;
  const raw = snap.data() ?? {};
  if (raw.destroying === true) return null;
  return normalizeCourseRun(snap.id, raw);
}

/** The notice's words for this plan. */
function noticeOf(
  plan: RegularPlan,
  press: RegularPress,
  group: CourseGroupDoc,
  incubator: boolean,
  now: Date,
): ReturnType<typeof regularNoticeWords> {
  const first = plan.moves[0]?.after ?? plan.sessionsAfter.find((s) => s.weekNumber === plan.fromWeek) ?? null;
  return regularNoticeWords({
    groupName: group.name.trim() || "Your group",
    incubator,
    weekday: plan.session.weekday,
    hhmm: plan.session.startTimeLocal,
    minutes: plan.session.durationMinutes,
    room: plan.session.location,
    campusLabel: campusLabel(plan.campus ?? group.campus),
    reason: press.reason,
    fromDateKey: first?.dateKey ?? "",
    todayKey: londonDateKey(now),
    earlier: plan.kept.map((week) => ({ weekNumber: week.weekNumber, dateKey: week.session.dateKey })),
    dayOrTimeChanged: plan.dayOrTimeChanged,
  });
}

export async function POST(req: Request, ctx: Ctx) {
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
    return NextResponse.json({ error: REGULAR_REFUSAL.body }, { status: 400 });
  }
  const parsed = parseRegularPress(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const press = parsed.value;

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ── The gate: the people who run the programme ───────────────────────────
  const groupRef = db.collection("courseGroups").doc(groupId);
  const groupSnap = await groupRef.get();
  const found = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
  const isAdmin = actor.role === "admin";
  const run = found ? await readRun(db, found.runId) : null;
  const staffsRun = !isAdmin && run ? doesTrackLeadWork(await runStaffingOf(db, actor, run)) : false;
  if (!isAdmin && !staffsRun) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!found || !run) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (found.archived) return NextResponse.json({ error: REGULAR_REFUSAL.gone }, { status: 400 });

  // ── The plan, on the group as read ────────────────────────────────────────
  const now = new Date();
  const refs = registerRefsOf(db, run, found, resolveSessions(run, found));
  const snaps = refs.length ? await db.getAll(...refs.map((each) => each.ref)) : [];
  const registers = new Map<number, Record<string, unknown>>();
  refs.forEach((each, index) => {
    if (snaps[index]?.exists) registers.set(each.weekNumber, snaps[index].data() ?? {});
  });
  const planned = planRegularChange({
    run,
    group: found,
    fromWeek: press.fromWeek,
    slot: {
      weekday: press.weekday,
      startTimeLocal: press.startTimeLocal,
      durationMinutes: press.durationMinutes,
      location: press.room,
      campus: press.campus,
    },
    registers,
    storedOverrideWeekIds: storedOverrideWeekIds(groupSnap.data() ?? {}),
    now,
  });
  if (!planned.ok) return NextResponse.json({ error: planned.error }, { status: planned.status });
  const { plan } = planned;
  const naming = await readNamingProgramme(db, run.id);
  const incubator = naming?.kind === "incubator";
  const notice = noticeOf(plan, press, found, incubator, now);

  if (press.preview) {
    const switches = await readJobSwitches(db);
    const [told, ...reminders] = await Promise.all([
      toldFacts(db, run, found, actor.uid),
      ...plan.moves.slice(0, 2).map((move) =>
        reminderFacts(db, { run, group: found, before: move.before, after: move.after, switches }).then((facts) => ({
          weekNumber: move.weekNumber,
          ...facts,
        })),
      ),
    ]);
    return NextResponse.json({
      ok: true,
      preview: {
        fromWeek: plan.fromWeek,
        dayOrTimeChanged: plan.dayOrTimeChanged,
        askedAgain: plan.dayOrTimeChanged,
        regular: {
          before: {
            weekday: found.session.weekday,
            startTimeLocal: found.session.startTimeLocal,
            durationMinutes: found.session.durationMinutes,
            room: found.session.location.trim(),
            campus: found.campus,
          },
          after: {
            weekday: plan.session.weekday,
            startTimeLocal: plan.session.startTimeLocal,
            durationMinutes: plan.session.durationMinutes,
            room: plan.session.location.trim(),
            campus: plan.campus ?? found.campus,
          },
        },
        moves: plan.moves.map((move) => ({
          weekNumber: move.weekNumber,
          before: momentOf(found, move.before),
          after: momentOf(plan.after, move.after),
          lock: {
            before: lockOf(plan.sessionsBefore, move.weekNumber),
            after: lockOf(plan.sessionsAfter, move.weekNumber),
          },
        })),
        kept: plan.kept.map((week) => ({
          weekNumber: week.weekNumber,
          pinned: week.pinned,
          session: momentOf(plan.after, week.session),
        })),
        ownTimes: plan.ownTimes.map((week) => ({
          weekNumber: week.weekNumber,
          kind: week.kind,
          session: momentOf(plan.after, week.session),
          campus: campusForWeek(plan.after, week.weekId),
        })),
        reminders,
        told,
        notice,
        at: iso(now),
      },
    });
  }

  // ── The count on the button, and today's notice, before anything changes ─
  let recipients: Awaited<ReturnType<typeof groupNoticeAudience>>["recipients"] = [];
  if (press.tell && press.emailCount > 0) {
    const audience = await groupNoticeAudience(db, run, found, actor.uid);
    if (audience.refused) return NextResponse.json({ error: REGULAR_REFUSAL.overCap }, { status: 400 });
    if (audience.recipients.length === 0) return NextResponse.json({ error: REGULAR_REFUSAL.nobodyToEmail }, { status: 400 });
    if (audience.recipients.length !== press.emailCount) {
      return NextResponse.json(
        { error: countChangedWords(audience.recipients.length), emails: audience.recipients.length },
        { status: 409 },
      );
    }
    let refusal: { message: string; retryAfterSeconds: number } | null;
    try {
      refusal = await claimGroupNotice(db, found.id);
    } catch (err) {
      // Fail closed: a cap that cannot be read is no licence to send.
      console.error("[courses regular time] notice cap read failed", groupId, err);
      return NextResponse.json({ error: "Could not check the send limit. Try again in a moment." }, { status: 500 });
    }
    if (refusal) {
      return NextResponse.json(
        { error: refusal.message },
        { status: 429, headers: { "Retry-After": String(refusal.retryAfterSeconds) } },
      );
    }
    recipients = audience.recipients;
  }

  // ── The write ─────────────────────────────────────────────────────────────
  let applied;
  try {
    applied = await applyRegularChange(db, {
      run,
      groupRef,
      press,
      actor,
      now,
      emailed: recipients.length,
    });
  } catch (err) {
    console.error("[courses regular time] failed", groupId, err);
    return NextResponse.json({ error: "That change didn’t go through, so nothing was changed." }, { status: 500 });
  }
  if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: applied.status });
  const done = applied.applied.plan;

  // ── The notice, once the change is written ────────────────────────────────
  const email =
    recipients.length > 0
      ? await sendGroupChangeNotice(db, {
          run,
          group: found,
          actor,
          recipients,
          words: { ...noticeOf(done, press, found, incubator, now), incubator },
        })
      : null;

  return NextResponse.json({
    ok: true,
    change: {
      fromWeek: done.fromWeek,
      movedWeeks: done.moves.map((move) => move.weekNumber),
      pinnedWeeks: done.kept.filter((week) => week.pinned).map((week) => week.weekNumber),
      ownTimeWeeks: done.ownTimes.map((week) => week.weekNumber),
      askedAgain: done.dayOrTimeChanged,
      takenBack: applied.applied.takenBack,
    },
    email,
  });
}
