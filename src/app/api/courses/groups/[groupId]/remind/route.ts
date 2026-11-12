import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { readGroupWeek, readLastReminded, readRemindAudience } from "@/lib/courses/groupWeekWork/load";
import { remindedRecently } from "@/lib/courses/groupWeekWork/model";
import { parseRemindPress } from "@/lib/courses/groupWeekWork/parse";
import { claimRemindSlot, reminderFactsFor, sendHandReminders } from "@/lib/courses/groupWeekWork/remind";
import {
  REMIND_REFUSAL,
  fromLineWords,
  handReminderEmailWords,
  remindCountChangedWords,
  remindSentWords,
} from "@/lib/courses/groupWeekWork/words";
import { firstNameOfUser, readNamingProgramme } from "@/lib/courses/programmeLead";
import { displayNameOf } from "@/lib/courses/registerAccess";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import { courseWeekUrl } from "@/lib/email/courseNudgeEmail";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { firstWord } from "@/lib/firestore/applicationEmails";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";

/**
 * REMIND, BY HAND: email the people whose week is not done about one week of
 * a group's plan, before its session or after it, until the programme
 * closes. "Remind 4 people whose week isn't done" and "Remind Daniel" on a
 * group's page, and the sheet on its facilitators' page.
 *
 * POST `{ week, uid?, preview?, count? }` (`parseRemindPress`).
 *
 * ── WHO ─────────────────────────────────────────────────────────────────────
 * The group's live facilitators (held to the bar they were appointed
 * behind), the lead of the programme that names the run, the run's track
 * leads and admins: the people running the group (privacy v17, "Reminders").
 * Nobody else. A missing group, an archived one and somebody else's are one
 * 403 for everybody but an admin, so a group id says nothing. View-as is
 * refused first, then the session, then the body is checked before anything
 * is read.
 *
 * ── WHO IT REACHES ──────────────────────────────────────────────────────────
 * `readRemindAudience`, the one function the page's count is also worked out
 * by: the group's told places at their addresses, never the presser, never
 * somebody who facilitates the group, never somebody whose week is done or
 * who was told their group after the week's session, and nobody once the
 * programme has closed. With `uid`, that one person, or a refusal.
 *
 * ── A PREVIEW ───────────────────────────────────────────────────────────────
 * `preview: true` sends nothing and writes nothing: the people by name, when
 * each was last reminded and whether in the last day (the panel's warning),
 * the first person's email word for word, and the count. Names only, never
 * an address; never a facilitator's own work.
 *
 * ── THE PRESS ───────────────────────────────────────────────────────────────
 * Carries the count the button showed; when it no longer holds, a 409 with
 * the new count and nothing sent. Then the notice lane's caps (3 an hour per
 * presser and audience, 10 a day per group), claimed before the first send;
 * then one notice per person (`sendHandReminders`), each claimed first so a
 * retry of the same press emails nobody again, recorded for "Last reminded",
 * and one row in the group's history. Never a meeting link.
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
    return NextResponse.json({ error: REMIND_REFUSAL.body }, { status: 400 });
  }
  const parsed = parseRemindPress(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const press = parsed.value;

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ── The gate: the people running the group ───────────────────────────────
  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
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
  if (found.archived) return NextResponse.json({ error: REMIND_REFUSAL.gone }, { status: 400 });

  // ── The week, and who it reaches now ──────────────────────────────────────
  const now = new Date();
  const seats = await db
    .collection("courseEnrolments")
    .where("runId", "==", run.id)
    .where("groupId", "==", found.id)
    .where("status", "==", "active")
    .get();
  const seatUids = seats.docs.map((doc) => String((doc.data() ?? {}).uid ?? "")).filter(Boolean);
  const got = await readGroupWeek(db, { run, group: found, weekNumber: press.weekNumber, uids: seatUids, now });
  if (!got.ok) {
    return NextResponse.json({ error: REMIND_REFUSAL[got.why] }, { status: 400 });
  }
  const { read } = got;
  if (read.closed) return NextResponse.json({ error: REMIND_REFUSAL.closed }, { status: 400 });

  const audience = await readRemindAudience(db, { run, group: found, read, presserUid: actor.uid, onlyUid: press.onlyUid });
  if (audience.refusal) return NextResponse.json({ error: REMIND_REFUSAL.overCap }, { status: 400 });
  if (press.onlyUid && audience.people.length === 0) {
    return NextResponse.json({ error: REMIND_REFUSAL.person, count: 0 }, { status: 409 });
  }

  const [naming, presserSnap] = await Promise.all([
    readNamingProgramme(db, run.id),
    db.collection("users").doc(actor.uid).get(),
  ]);
  const presserFirstName = presserSnap.exists ? firstNameOfUser((presserSnap.data() ?? {}) as Record<string, unknown>) : "";
  const team = (naming?.shortName ?? "").trim() || run.courseTitle;

  if (press.preview) {
    const uids = audience.people.map((person) => person.uid);
    const [reminded, userDocs] = await Promise.all([
      readLastReminded(db, { run, group: found, read, uids }),
      uids.length > 0 ? db.getAll(...uids.map((uid) => db.collection("users").doc(uid))) : Promise.resolve([]),
    ]);
    const nameOf = new Map(
      userDocs.filter((doc) => doc.exists).map((doc) => [doc.id, displayNameOf((doc.data() ?? {}) as Record<string, unknown>)]),
    );
    const first = audience.people[0] ?? null;
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
    const words = first
      ? handReminderEmailWords(
          reminderFactsFor({
            person: first,
            weekNumber: read.weekNumber,
            groupName: found.name,
            presserFirstName,
            team,
            weekUrl: courseWeekUrl(appUrl, run.id, read.weekNumber),
            now,
          }),
          firstWord(first.ownName),
        )
      : null;
    return NextResponse.json({
      ok: true,
      preview: {
        weekNumber: read.weekNumber,
        count: audience.people.length,
        people: audience.people.map((person) => {
          const last = reminded.last.get(person.uid) ?? null;
          return { uid: person.uid, name: nameOf.get(person.uid) ?? "NAISI member", lastReminded: last, recent: remindedRecently(last, now) };
        }),
        email: words
          ? {
              from: fromLineWords(presserFirstName, team),
              subject: words.subject,
              greeting: words.greeting,
              paragraphs: words.paragraphs,
              button: words.button,
            }
          : null,
        at: now.toISOString(),
      },
    });
  }

  // ── The count on the button, then the caps, before anything is sent ──────
  if (audience.people.length === 0) {
    return NextResponse.json({ error: REMIND_REFUSAL.nobody, count: 0 }, { status: 409 });
  }
  if (audience.people.length !== press.count) {
    return NextResponse.json(
      { error: remindCountChangedWords(audience.people.length), count: audience.people.length },
      { status: 409 },
    );
  }
  let refusal: { message: string; retryAfterSeconds: number } | null;
  try {
    refusal = await claimRemindSlot(db, { actorUid: actor.uid, groupId: found.id, weekId: read.weekId, onlyUid: press.onlyUid });
  } catch (err) {
    // Fail closed: a cap that cannot be read is no licence to send.
    console.error("[courses remind] cap read failed", groupId, err);
    return NextResponse.json({ error: "Could not check the send limit. Try again in a moment." }, { status: 500 });
  }
  if (refusal) {
    return NextResponse.json({ error: refusal.message }, { status: 429, headers: { "Retry-After": String(refusal.retryAfterSeconds) } });
  }

  const tally = await sendHandReminders(db, {
    run,
    group: found,
    read,
    people: audience.people,
    actor,
    presserFirstName,
    team,
    now,
  });
  return NextResponse.json({ ok: true, sent: tally, said: remindSentWords(tally) });
}
