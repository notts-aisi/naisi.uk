import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { groupHistoryRow } from "@/lib/courses/groupChange/facts";
import { londonClockLabel } from "@/lib/courses/londonLabels";
import { didNotHappenLine } from "@/lib/courses/programmeAttendance";
import { gateGroupRegister, isAddressableId, readsFacilitatorRecord } from "@/lib/courses/registerAccess";
import { facilitatorsByFirstName } from "@/lib/courses/registerCover/people";
import { sessionInTransaction } from "@/lib/courses/registerCover/sessionInTransaction";
import { REGISTER_COVER_REFUSAL, presenceChangedDetail } from "@/lib/courses/registerCover/words";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import {
  FACILITATOR_PRESENCE_STATES,
  FACILITATOR_RECORD,
  attendanceDocId,
  normalizeCourseAttendance,
  type FacilitatorPresenceState,
} from "@/lib/firestore/courseAttendance";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * CHANGING WHETHER ONE OF THE GROUP'S FACILITATORS WAS AT A SESSION, by an
 * admin or somebody leading the programme ("Change" beside the facilitator
 * record).
 *
 *   POST { weekNumber, occurrence?, uid, state, arrivedAt? }
 *     -> { ok, entry: { uid, state, arrivedAt } }
 *
 * `state` is "there", "late" (with `arrivedAt`, an instant between the
 * session's start and its end) or "not-there". One history row, with the
 * entry before and after, who changed it, and the facilitator it is about;
 * that row is shown to admins and the programme's lead only (`loadGroupHistory`). Nobody is
 * emailed.
 *
 * WHO: admins and the lead of the programme that names the run, who do not
 * facilitate the group (`readsFacilitatorRecord`): whether a facilitator was
 * there is never a facilitator's to read or write, not even their own, and
 * never a run's track lead's by that alone.
 * Everybody else is one 403, before the body is read. View-as is refused
 * first.
 *
 * REFUSED: a session the group does not hold, one called off, one that has
 * not started, and somebody who is not one of the group's facilitators (now,
 * or whose place a cover took, or already on the record).
 */

const MAX_WEEK_NUMBER = 60;
const MAX_OCCURRENCE = 4;
const FIELDS = new Set(["weekNumber", "occurrence", "uid", "state", "arrivedAt"]);

type Body = { weekNumber: number; occurrence: number; uid: string; state: FacilitatorPresenceState; arrivedAt: Date | null };

function parseBody(raw: unknown): { ok: true; value: Body } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Expected a JSON object body." };
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some((key) => !FIELDS.has(key))) return { ok: false, error: "Expected a JSON object body." };
  const weekNumber = body.weekNumber;
  if (typeof weekNumber !== "number" || !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) {
    return { ok: false, error: `weekNumber must be a whole number between 1 and ${MAX_WEEK_NUMBER}.` };
  }
  const occurrence = body.occurrence === undefined || body.occurrence === null ? 1 : body.occurrence;
  if (typeof occurrence !== "number" || !Number.isInteger(occurrence) || occurrence < 1 || occurrence > MAX_OCCURRENCE) {
    return { ok: false, error: `occurrence must be a whole number between 1 and ${MAX_OCCURRENCE}.` };
  }
  const uid = body.uid;
  if (typeof uid !== "string" || !uid || uid.length > 128 || uid.includes("/")) {
    return { ok: false, error: REGISTER_COVER_REFUSAL.notAFacilitator };
  }
  const state = body.state;
  if (!FACILITATOR_PRESENCE_STATES.includes(state as FacilitatorPresenceState)) {
    return { ok: false, error: REGISTER_COVER_REFUSAL.state };
  }
  let arrivedAt: Date | null = null;
  if (state === "late") {
    const at = typeof body.arrivedAt === "string" ? new Date(body.arrivedAt) : null;
    if (!at || Number.isNaN(at.getTime())) return { ok: false, error: REGISTER_COVER_REFUSAL.arrivedAt };
    arrivedAt = at;
  } else if (body.arrivedAt !== undefined && body.arrivedAt !== null) {
    return { ok: false, error: REGISTER_COVER_REFUSAL.arrivedAt };
  }
  return { ok: true, value: { weekNumber, occurrence, uid, state: state as FacilitatorPresenceState, arrivedAt } };
}

export async function POST(req: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ── The gate, before the body: admins and the programme's lead who do not
  // facilitate the group; never a run's track lead by that alone ──────────
  const gated = await gateGroupRegister(groupId, actor, db);
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  if (!readsFacilitatorRecord(gated)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { group, runId } = gated;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON object body." }, { status: 400 });
  }
  const parsed = parseBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const press = parsed.value;

  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const session = resolveSessions(run, group).find((each) => each.weekNumber === press.weekNumber && each.occurrence === press.occurrence);
  if (!session) return NextResponse.json({ error: `Week ${press.weekNumber} isn't a taught session of this group's schedule.` }, { status: 400 });
  if (session.cancelled) {
    return NextResponse.json({ error: didNotHappenLine(group.name.trim() || "This group", session.dateKey) }, { status: 409 });
  }
  const now = new Date();
  const { startsAt, endsAt } = sessionInstants(session);
  if (!startsAt || startsAt.getTime() > now.getTime()) {
    return NextResponse.json({ error: REGISTER_COVER_REFUSAL.notStarted }, { status: 409 });
  }
  if (press.arrivedAt && (press.arrivedAt.getTime() < startsAt.getTime() || press.arrivedAt.getTime() > (endsAt ?? startsAt).getTime())) {
    return NextResponse.json({ error: REGISTER_COVER_REFUSAL.arrivedAt }, { status: 400 });
  }

  const ref = db.collection("courseAttendance").doc(attendanceDocId(runId, group.id, session.weekNumber, session.occurrence));
  const named = (await facilitatorsByFirstName(db, { facilitatorUids: [press.uid] })).at(0);
  const facilitatorName = named?.name ?? "The facilitator";

  class Refusal extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  try {
    const entry = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      // The session as the group says it now, read in this transaction: the
      // start the register keeps, and the window a late arrival must fall in,
      // are never worked out from a group read before it.
      const fresh = await sessionInTransaction(tx, db, run, group.id, session);
      if (!fresh.ok) {
        throw fresh.reason === "cancelled"
          ? new Refusal(didNotHappenLine(group.name.trim() || "This group", fresh.dateKey), 409)
          : new Refusal(`Week ${press.weekNumber} isn't a taught session of this group's schedule.`, 400);
      }
      if (!fresh.startsAt || fresh.startsAt.getTime() > now.getTime()) throw new Refusal(REGISTER_COVER_REFUSAL.notStarted, 409);
      if (
        press.arrivedAt &&
        (press.arrivedAt.getTime() < fresh.startsAt.getTime() || press.arrivedAt.getTime() > (fresh.endsAt ?? fresh.startsAt).getTime())
      ) {
        throw new Refusal(REGISTER_COVER_REFUSAL.arrivedAt, 400);
      }
      const register = snap.exists ? normalizeCourseAttendance(snap.id, snap.data() ?? {}) : null;
      const before = register?.facilitatorRecord[press.uid];
      const known =
        group.facilitatorUids.includes(press.uid) ||
        Boolean(register?.cover?.covering.includes(press.uid)) ||
        before !== undefined;
      if (!known) throw new Refusal(REGISTER_COVER_REFUSAL.notAFacilitator, 400);
      if (before && before.state === press.state && (before.arrivedAt?.getTime() ?? null) === (press.arrivedAt?.getTime() ?? null)) {
        throw new Refusal(REGISTER_COVER_REFUSAL.sameAsNow, 409);
      }
      tx.set(
        ref,
        {
          runId,
          groupId: group.id,
          weekNumber: session.weekNumber,
          occurrence: session.occurrence,
          [FACILITATOR_RECORD]: {
            [press.uid]: {
              state: press.state,
              ...(press.arrivedAt ? { arrivedAt: press.arrivedAt } : before?.arrivedAt ? { arrivedAt: FieldValue.delete() } : {}),
              byUid: actor.uid,
              at: now,
              how: "changed",
            },
          },
          sessionAt: fresh.startsAt,
        },
        { merge: true },
      );
      tx.set(
        db.collection(COURSE_AUDIT_COLLECTION).doc(),
        groupHistoryRow({
          kind: "facilitator-record-changed",
          run,
          group,
          actor,
          subjectUid: press.uid,
          detail: presenceChangedDetail(
            session.weekNumber,
            facilitatorName,
            before?.state ?? null,
            press.state,
            press.arrivedAt ? londonClockLabel(press.arrivedAt) : "",
          ),
          weekId: session.weekId,
          before: before
            ? { state: before.state, arrivedAt: before.arrivedAt ? before.arrivedAt.toISOString() : null }
            : { state: null, arrivedAt: null },
          after: { state: press.state, arrivedAt: press.arrivedAt ? press.arrivedAt.toISOString() : null },
          emailed: 0,
        }),
      );
      return { uid: press.uid, state: press.state, arrivedAt: press.arrivedAt ? press.arrivedAt.toISOString() : null };
    });
    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    if (err instanceof Refusal) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
