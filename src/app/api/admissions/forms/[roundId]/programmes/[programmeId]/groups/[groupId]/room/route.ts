import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { isId } from "@/lib/applications/normalise";
import { campusLabel } from "@/lib/courses/campus";
import { claimGroupNotice, groupNoticeAudience, sendGroupChangeNotice, type NoticeTally } from "@/lib/courses/groupChange/notice";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { roomNoticeWords } from "@/lib/courses/regularTime/words";
import { parseRoomBody, parseRoomTell, setGroupRoom } from "@/lib/courses/roomSet";
import { ROOM_REFUSAL, roomCountChangedWords } from "@/lib/courses/roomWords";
import { resolveSessions, sessionRange } from "@/lib/courses/sessions";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * A GROUP'S ROOM, from the Groups tab: `{ room }`, the room it meets in every
 * week ("" for none), the same field as the run editor's group card's
 * "Location". One week's room is "Change a session"'s.
 *
 * WHO MAY is the programme's lead or an admin, decided from the form once a
 * valid body has arrived and before the run is read (`loadProgrammeRun`, the
 * gate of the Groups tab and of the campus and time routes beside this one).
 * A reviewer of the programme is refused; anybody with no role on it is told
 * the programme is not there. A view-as session is turned away first.
 *
 * WHAT IS REFUSED, after that: a group that is not one of the run's, or is
 * archived (`src/lib/courses/roomSet.ts`). The answer is built field by
 * field.
 *
 * TELLING THE GROUP, optional: `{ room, tell, emailCount }` sends "A room set
 * or changed" to the group's told people and its facilitators, never the
 * presser (`src/lib/courses/groupChange/notice.ts`), once the room is saved,
 * and only when it changed. The count on the button is checked first (409
 * with the new count) and the group's notice for the day claimed, both before
 * anything changes. Without `tell`, nobody is emailed, as before. A change
 * writes one row of the group's history either way.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string; groupId: string }> };

export type GroupRoomAnswer = {
  ok: true;
  changed: boolean;
  groupId: string;
  groupName: string;
  room: string;
  message: string;
  /** What telling the group did, counted; null when it was not told. */
  email: NoticeTally | null;
};

export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId, programmeId, groupId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = parseRoomBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const telling = parseRoomTell(raw, parsed.value);
  if (!telling.ok) return NextResponse.json({ error: telling.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: ROOM_REFUSAL.noProgramme }, { status: 404 });
  }
  if (!groupId || !isAddressableId(groupId)) return NextResponse.json({ error: ROOM_REFUSAL.noGroup }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadProgrammeRun(db, user, roundId, programmeId);
  if (outcome.status === "none") return NextResponse.json({ error: ROOM_REFUSAL.noProgramme }, { status: 404 });
  if (outcome.status === "not-yours") return NextResponse.json({ error: ROOM_REFUSAL.notYours }, { status: 403 });
  const { view } = outcome;
  if (!view.run) {
    return NextResponse.json({ error: view.blank === "run-gone" ? ROOM_REFUSAL.runGone : ROOM_REFUSAL.noRun }, { status: 409 });
  }

  const runId = view.run.id;
  // The run whole, only when the group is to be told: its name and calendar go into the notice.
  const runSnap = telling.value.tell ? await db.collection("courseRuns").doc(runId).get() : null;
  const run = runSnap?.exists ? normalizeCourseRun(runSnap.id, runSnap.data() ?? {}) : null;

  // The count on the button and the day's notice, before anything changes.
  let recipients: Awaited<ReturnType<typeof groupNoticeAudience>>["recipients"] = [];
  if (telling.value.tell && telling.value.emailCount > 0) {
    if (!run) return NextResponse.json({ error: ROOM_REFUSAL.runGone }, { status: 409 });
    const groupSnap = await db.collection("courseGroups").doc(groupId).get();
    const group = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
    if (!group || group.runId !== runId) return NextResponse.json({ error: ROOM_REFUSAL.noGroup }, { status: 404 });
    if (group.archived) return NextResponse.json({ error: ROOM_REFUSAL.archived }, { status: 409 });
    const audience = await groupNoticeAudience(db, run, group, user.uid);
    if (audience.refused) return NextResponse.json({ error: ROOM_REFUSAL.overCap }, { status: 400 });
    if (audience.recipients.length === 0) return NextResponse.json({ error: ROOM_REFUSAL.nobodyToEmail }, { status: 400 });
    if (audience.recipients.length !== telling.value.emailCount) {
      return NextResponse.json(
        { error: roomCountChangedWords(audience.recipients.length), emails: audience.recipients.length },
        { status: 409 },
      );
    }
    let refusal: { message: string; retryAfterSeconds: number } | null;
    try {
      refusal = await claimGroupNotice(db, group.id);
    } catch (err) {
      console.error("[admissions group room] notice cap read failed", groupId, err);
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

  const result = await setGroupRoom(db, runId, groupId, parsed.value, { actor: user, emailed: recipients.length });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // "A room set or changed", only when it changed.
  let email: NoticeTally | null = null;
  if (result.changed && recipients.length > 0 && run) {
    const naming = await readNamingProgramme(db, run.id);
    const incubator = naming?.kind === "incubator";
    const next = sessionRange(resolveSessions(run, result.group), new Date()).next;
    const words = roomNoticeWords({
      groupName: result.groupName,
      incubator,
      room: result.room,
      campusLabel: campusLabel(result.group.campus),
      next: next ? { dateKey: next.dateKey, hhmm: next.session.startTimeLocal } : null,
    });
    email = await sendGroupChangeNotice(db, {
      run,
      group: result.group,
      actor: user,
      recipients,
      words: { subject: words.subject, before: words.lines, after: [], asks: false, incubator },
    });
  }

  const answer: GroupRoomAnswer = {
    ok: true,
    changed: result.changed,
    groupId: result.groupId,
    groupName: result.groupName,
    room: result.room,
    message: result.message,
    email,
  };
  return NextResponse.json(answer);
}
