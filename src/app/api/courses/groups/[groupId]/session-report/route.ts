import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { gateReportWriter, loadReportSession, sessionsOf } from "@/lib/courses/sessionReports/context";
import { parseReportBody, pickRefusal, unclearRefusal } from "@/lib/courses/sessionReports/model";
import {
  REPORT_REFUSAL,
  closedRefusal,
  noReportLine,
  notOpenRefusal,
} from "@/lib/courses/sessionReports/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import {
  COURSE_SESSION_REPORTS_COLLECTION,
  aboutUidsOf,
  normalizeSessionReport,
  sessionReportId,
} from "@/lib/firestore/courseSessionReports";

/**
 * A FACILITATOR'S SESSION REPORT: one facilitator's own report on one session
 * of their group, sent straight after the register and changed until the
 * group's next session starts.
 *
 *   PUT { sessionKey, answers }  ->  { ok: true, sentAt, updatedAt }
 *
 * WHO WRITES: a live facilitator of THIS group, each their own report
 * (`gateReportWriter`). The programme's lead and admins read the reports on
 * the programme's page and write none; a co-facilitator never reads another
 * facilitator's. Everybody else, and a group that is not there, is one 403.
 *
 * ORDER: view-as refused, the session, the body (a 400 with a sentence a
 * person can act on, before anything is read), the database, the group and
 * the gate, the run, the session's report window, the register (a session it
 * says did not happen has no report), who may be picked and the week's
 * parts, the write.
 *
 * WHAT IS KEPT: the answers by their fixed question ids, everybody picked by
 * account (`aboutUids`), the week's parts as they read now, when it was first
 * sent and when last. One document per writer per session, so a second press
 * replaces the first and keeps when it was first sent.
 *
 * NOTHING READS REPORTS HERE. There is no GET: the facilitator's page reads
 * the writer's own on the server, and the programme's page reads them all
 * after its own gate. `firestore.rules` refuses every browser. Nobody is
 * emailed or told: a report waits for the lead and admins on the programme's
 * page.
 */

export type SessionReportSent = { ok: true; sentAt: string; updatedAt: string };

export async function PUT(req: Request, ctx: { params: Promise<{ groupId: string }> }) {
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
    return NextResponse.json({ error: REPORT_REFUSAL.body }, { status: 400 });
  }
  const parsed = parseReportBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ── The gate ──────────────────────────────────────────────────────────────
  const gated = await gateReportWriter(db, actor, groupId);
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  const { group, run } = gated;

  // ── The session, its window and its register ──────────────────────────────
  const now = new Date();
  const sessions = sessionsOf(run, group);
  const asked = sessions.find((session) => session.sessionKey === parsed.sessionKey);
  if (!asked) return NextResponse.json({ error: REPORT_REFUSAL.session }, { status: 400 });
  const session = await loadReportSession(db, run, group, parsed.sessionKey, now, sessions);
  if (!session) {
    return NextResponse.json({ error: noReportLine(asked.weekNumber, asked.occurrence) }, { status: 409 });
  }
  const { weekNumber, occurrence } = session.window.session;
  if (session.state === "not-yet") {
    return NextResponse.json({ error: notOpenRefusal(weekNumber, occurrence) }, { status: 409 });
  }
  if (session.state === "closed") {
    return NextResponse.json({ error: closedRefusal(weekNumber, occurrence, session.window.nextWeekNumber) }, { status: 409 });
  }
  if (!session.held) return NextResponse.json({ error: noReportLine(weekNumber, occurrence) }, { status: 409 });

  // ── Who it picks, and the parts it ticks ──────────────────────────────────
  const picked = pickRefusal(
    parsed.answers,
    new Set(session.came.map((person) => person.uid)),
    new Set(session.inGroup.map((person) => person.uid)),
  );
  if (picked) return NextResponse.json({ error: picked }, { status: 400 });
  const ticked = unclearRefusal(parsed.answers, new Set(session.parts.map((part) => part.id)));
  if (ticked) return NextResponse.json({ error: ticked }, { status: 400 });

  // ── The write ─────────────────────────────────────────────────────────────
  // One document per writer per session: a second press replaces the answers
  // and keeps when the report was first sent.
  const ref = db
    .collection(COURSE_SESSION_REPORTS_COLLECTION)
    .doc(sessionReportId(run.id, group.id, parsed.sessionKey, actor.uid));
  const sentAt = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const before = snap.exists ? normalizeSessionReport(snap.id, snap.data() ?? {}) : null;
    const first = before?.sentAt ?? now;
    tx.set(ref, {
      runId: run.id,
      groupId: group.id,
      sessionKey: parsed.sessionKey,
      weekNumber,
      occurrence,
      writerUid: actor.uid,
      answers: parsed.answers,
      aboutUids: aboutUidsOf(parsed.answers),
      parts: session.parts,
      sentAt: first,
      updatedAt: now,
    });
    return first;
  });

  const answer: SessionReportSent = { ok: true, sentAt: sentAt.toISOString(), updatedAt: now.toISOString() };
  return NextResponse.json(answer);
}

