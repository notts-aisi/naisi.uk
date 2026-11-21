import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { isMoveWeek } from "@/lib/courses/groupsByWeek";
import { callOffVisit } from "@/lib/courses/visit/save";
import { MEMBER_NO_VISIT } from "@/lib/courses/visit/plan";
import { VISIT_REFUSAL } from "@/lib/courses/visit/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * THE PERSON CANCELS A ONE-WEEK VISIT STAFF ARRANGED FOR THEM, from their
 * programme page: `POST { weekNumber }`.
 *
 * ONLY THEIR OWN: the place read is the caller's own on this run (`uid` is the
 * session's, never sent), an active learner's place told its group, held to
 * the live bar (`isNamedWithStanding`). A view-as session is turned away
 * first. Their own place is decided FIRST, and everything that is not their
 * own standing visit on a run they hold a place on (no such run, a run they
 * hold no place on, a run over, archived or with one group, no visit that
 * week, a visit to a session no longer happening) is the one 404, the same
 * words and kind every time, so no answer says a run exists. Until the earlier of the two sessions of that week starts (their own
 * group's, or the one they were going to); after that it is refused, and the
 * page, read again, no longer offers it.
 *
 * In one transaction (`callOffVisit`): the visit off their place, their own
 * words on the host's register for that session taken off while it is not
 * finished, their figures rebuilt when a register of that week is finished,
 * and a row on each group's history. After the commit both groups'
 * facilitators are emailed ("Daniel Kim’s visit to Group I for week 2 is
 * off"), and nobody else. The answer carries no sentence: the page says what
 * it says from its own facts.
 */

type Ctx = { params: Promise<{ runId: string }> };

export type VisitCancelledAnswer = { ok: true; weekNumber: number };

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { runId } = await ctx.params;
  // One 404 for everything that is not the caller's own standing visit (`MEMBER_NO_VISIT`): never a word about the run.
  const notFound = () => NextResponse.json({ error: MEMBER_NO_VISIT.error, kind: MEMBER_NO_VISIT.kind }, { status: MEMBER_NO_VISIT.status });
  if (!isAddressableId(runId)) return notFound();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!body || Object.keys(body).some((key) => key !== "weekNumber") || !isMoveWeek(body.weekNumber)) {
    return NextResponse.json({ error: VISIT_REFUSAL.week }, { status: 400 });
  }
  if (!isNamedWithStanding(user, "courseEnrolments.uid", user.uid)) {
    return NextResponse.json({ error: VISIT_REFUSAL.notYourVisit }, { status: 403 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const saved = await callOffVisit(db, { runId, uid: user.uid, weekNumber: body.weekNumber, byStaff: false, emailCount: null, actor: user, now: new Date() });
  // Why, as a kind the page chooses its own line by (`cancelOutcomeLine`): never as words for it to print.
  if (!saved.ok) return NextResponse.json({ error: saved.error, ...("kind" in saved && saved.kind ? { kind: saved.kind } : {}) }, { status: saved.status });
  const answer: VisitCancelledAnswer = { ok: true, weekNumber: saved.weekNumber };
  return NextResponse.json(answer);
}
