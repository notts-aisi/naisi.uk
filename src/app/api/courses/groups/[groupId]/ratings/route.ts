import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { programmeLedBy } from "@/lib/courses/programmeLead";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { parseRatingAnswers, type RatingAnswers } from "@/lib/ratings/model";
import { mayRate } from "@/lib/ratings/rules";
import { saveRating } from "@/lib/ratings/store";
import { ratingsContextFor } from "@/lib/ratings/view";
import { RATING_REFUSAL, refusalWords } from "@/lib/ratings/words";

/**
 * ONE RATING OF ONE FELLOW, at the end of a programme (the programme impact
 * questionnaire's facilitator rating, F2 to F5, and on an incubator its
 * mentor rating, M1 to M3). F1, the sessions they came to, is the register's
 * and is not sent.
 *
 *   POST { uid, answers }  ->  { ok: true, answers }
 *
 * WHO: a live facilitator of THIS group (`isNamedWithStanding`), the lead of
 * the programme that names its run, or an admin; everybody else, and a group
 * that is not there or is archived, is one 403. Then who rates whom
 * (`src/lib/ratings/rules.ts`): nobody themselves, a co-facilitator never a
 * co-facilitator, and the lead or an admin a facilitator. Only a fellow
 * taking part in the group at the end is rated, and only once the run's
 * last session is over.
 *
 * ORDER: view-as refused, the session, the body (a 400 with a sentence a
 * person can act on, before anything is read), the group and the gate, the
 * run's records, the rules, the write. Clearing every answer deletes the
 * rating. Nobody is emailed, and nothing here is ever shown to the person
 * rated.
 */
export async function POST(req: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: RATING_REFUSAL.notSignedIn }, { status: 401 });

  const { groupId } = await ctx.params;
  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const body = raw && typeof raw === "object" ? (raw as { uid?: unknown; answers?: unknown }) : {};
  const uid = typeof body.uid === "string" ? body.uid : "";
  // Every question either form asks, before anything is read; the
  // programme's own questions are held to below, once its kind is known.
  const shaped = parseRatingAnswers(body.answers, "incubator");
  if (!isAddressableId(groupId) || !isAddressableId(uid)) {
    return NextResponse.json({ error: RATING_REFUSAL.body }, { status: 400 });
  }
  if (!shaped.ok) return NextResponse.json({ error: shaped.problem }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // The group and the gate, before anything else of the run is read.
  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  const group = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
  if (!group || group.archived || !isAddressableId(group.runId)) {
    return NextResponse.json({ error: RATING_REFUSAL.forbidden }, { status: 403 });
  }
  const isAdmin = actor.role === "admin";
  const facilitates = isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids);
  const leads = !isAdmin && !facilitates && (await programmeLedBy(db, actor, group.runId)) !== null;
  if (!isAdmin && !facilitates && !leads) {
    return NextResponse.json({ error: RATING_REFUSAL.forbidden }, { status: 403 });
  }

  const now = new Date();
  const context = await ratingsContextFor(db, actor, group.runId, now);
  const facts = context?.groups.find((entry) => entry.group.id === groupId) ?? null;
  if (!context || !facts) return NextResponse.json({ error: RATING_REFUSAL.forbidden }, { status: 403 });
  if (!context.end.over || !context.end.lastDateKey) {
    return NextResponse.json({ error: RATING_REFUSAL.notYet(context.end.lastDay) }, { status: 409 });
  }
  if (!facts.fellows.some((fellow) => fellow.uid === uid)) {
    return NextResponse.json({ error: RATING_REFUSAL.notInGroup }, { status: 409 });
  }
  const can = mayRate(context.rater, facts.rated, uid);
  if (!can.ok) return NextResponse.json({ error: refusalWords(can.reason) }, { status: 403 });

  const parsed = parseRatingAnswers(body.answers, context.kind);
  if (!parsed.ok) return NextResponse.json({ error: parsed.problem }, { status: 400 });

  await saveRating(db, {
    runId: group.runId,
    groupId,
    raterUid: actor.uid,
    ratedUid: uid,
    answers: parsed.answers,
    lastSessionOn: context.end.lastDateKey,
  });
  const answers: RatingAnswers = { ...parsed.answers };
  return NextResponse.json({ ok: true, answers });
}
