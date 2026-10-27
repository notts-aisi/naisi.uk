import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { displayNameOf } from "@/lib/courses/registerAccess";
import { ownRecordOf } from "@/lib/courses/predictions/own";
import {
  REFUSE_ADMIN_ONLY,
  REFUSE_NONE_FOR_THEM,
  REFUSE_NOT_RECORDED,
  REFUSE_OWN_CARD,
} from "@/lib/courses/predictions/words";
import type { AdminPredictionsCard } from "@/lib/courses/predictions/wire";
import { normalizeCourse } from "@/lib/firestore/courses";
import { openRecorded } from "@/lib/firestore/recordOpenings";

/**
 * AN ADMIN OPENS ONE PERSON'S SEALED PREDICTIONS CARD (Zach's extra (d):
 * "admins at any time"). The person and admins are a card's only readers:
 * never the group's facilitators, the programme's lead or another fellow, and
 * this is the one route through which anybody but its owner reads one.
 *
 * A POST and not a GET, because opening it writes: EVERY OPENING IS RECORDED
 * FIRST (`openRecorded`, `src/lib/firestore/recordOpenings.ts`), with who
 * opened it, whose it was by account id, the run and when. Nothing of the
 * card is read until that row is stored, and when it cannot be stored the
 * card stays closed. An opening of somebody with no card is recorded too.
 *
 * ADMINS ONLY, decided before anything is read. NOT THEIR OWN: an admin who
 * also takes part would otherwise read their own sealed card before it opens
 * to them, which nobody may; their own opens on their week page. Refused in a
 * view-as session like every other write, and it could not succeed in one
 * anyway: the session is then the member's, who is no admin.
 *
 * The answer is built field by field: both cards' answers, the questions they
 * answer, when it was sealed and opened, the course's two weeks, and the
 * person's name.
 */

const toIso = (at: Date | null): string | null => (at ? at.toISOString() : null);

export async function POST(_req: Request, ctx: { params: Promise<{ runId: string; uid: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (actor.role !== "admin") return NextResponse.json({ error: REFUSE_ADMIN_ONLY }, { status: 403 });

  const { runId, uid } = await ctx.params;
  if (!isAddressableId(runId) || !isAddressableId(uid)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (uid === actor.uid) return NextResponse.json({ error: REFUSE_OWN_CARD }, { status: 403 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // The run, so an opening is recorded only against a run that is there.
  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists || (runSnap.data() ?? {}).destroying === true) {
    return NextResponse.json({ error: "Course run not found" }, { status: 404 });
  }
  const courseId = typeof runSnap.data()?.courseId === "string" ? (runSnap.data()?.courseId as string) : "";

  // Recorded first; read only once the record is stored.
  const opened = await openRecorded(
    db,
    {
      kind: "sealed-predictions",
      actorUid: actor.uid,
      actorName: (actor.displayName ?? "").trim() || "An admin",
      subjectUid: uid,
      runId,
    },
    async () => {
      const [record, userSnap, courseSnap] = await Promise.all([
        ownRecordOf(db, runId, uid),
        db.collection("users").doc(uid).get(),
        courseId ? db.collection("courses").doc(courseId).get() : Promise.resolve(null),
      ]);
      return { record, userSnap, courseSnap };
    },
  );
  if (!opened.ok) return NextResponse.json({ error: REFUSE_NOT_RECORDED }, { status: 500 });
  const { record, userSnap, courseSnap } = opened.value;
  if (!record || record.uid !== uid || record.runId !== runId) {
    return NextResponse.json({ error: REFUSE_NONE_FOR_THEM }, { status: 404 });
  }
  const course = courseSnap?.exists ? normalizeCourse(courseSnap.id, courseSnap.data() ?? {}) : null;
  const card: AdminPredictionsCard = {
    uid,
    name: userSnap.exists ? displayNameOf(userSnap.data() ?? {}) : "A deleted account",
    card: record.card,
    sealWeek: course?.predictionCard?.sealWeek ?? null,
    openWeek: record.start.opensInWeek ?? course?.predictionCard?.openWeek ?? null,
    start: { answers: record.start.answers, sealedAt: toIso(record.start.sealedAt) },
    now: { answers: record.now.answers, openedAt: toIso(record.now.openedAt) },
  };
  return NextResponse.json({ card }, { headers: { "Cache-Control": "no-store" } });
}
