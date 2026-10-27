import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { displayNameOf } from "@/lib/courses/registerAccess";
import { REFUSE_ADMIN_ONLY } from "@/lib/courses/predictions/words";
import type { AdminPredictionsRow } from "@/lib/courses/predictions/wire";
import { COURSE_PREDICTIONS_COLLECTION } from "@/lib/firestore/coursePredictions";

/**
 * WHO HAS A SEALED PREDICTIONS CARD ON A RUN, FOR AN ADMIN (the run editor's
 * panel): each person who has started one, by name, and whether and when it
 * was sealed and opened. NEVER AN ANSWER: the query asks Firestore for those
 * three fields alone (`select`), so nothing a card says is read here. Opening
 * a card is its own route, which records the opening before it reads
 * (`./[uid]/route.ts`).
 *
 * ADMINS ONLY, decided before anything is read: a programme's lead, the
 * group's facilitators and the person's fellows never see whose card exists.
 * A GET writes nothing.
 */

/** A run's people: far past any real cohort. */
const MAX_CARDS = 500;

export type PredictionsPeopleAnswer = { people: AdminPredictionsRow[] };

const toIso = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate().toISOString() : null;
};

export async function GET(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (actor.role !== "admin") return NextResponse.json({ error: REFUSE_ADMIN_ONLY }, { status: 403 });
  const { runId } = await ctx.params;
  if (!isAddressableId(runId)) return NextResponse.json({ error: "Course run not found" }, { status: 404 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists) return NextResponse.json({ error: "Course run not found" }, { status: 404 });

  const snap = await db
    .collection(COURSE_PREDICTIONS_COLLECTION)
    .where("runId", "==", runId)
    // Whose card, and where it stands: never what it says.
    .select("uid", "start.sealedAt", "now.openedAt")
    .limit(MAX_CARDS)
    .get();
  const rows = snap.docs
    .map((doc) => {
      const data = doc.data() ?? {};
      const start = (data.start ?? {}) as Record<string, unknown>;
      const now = (data.now ?? {}) as Record<string, unknown>;
      return {
        uid: typeof data.uid === "string" ? data.uid : "",
        sealedAt: toIso(start.sealedAt),
        openedAt: toIso(now.openedAt),
      };
    })
    .filter((row) => row.uid !== "" && isAddressableId(row.uid));

  const userSnaps = rows.length > 0 ? await db.getAll(...rows.map((row) => db.collection("users").doc(row.uid))) : [];
  const names = new Map(userSnaps.map((user) => [user.id, user.exists ? displayNameOf(user.data() ?? {}) : "A deleted account"]));
  const people: AdminPredictionsRow[] = rows
    .map((row) => ({ uid: row.uid, name: names.get(row.uid) ?? "A deleted account", sealedAt: row.sealedAt, openedAt: row.openedAt }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  const answer: PredictionsPeopleAnswer = { people };
  return NextResponse.json(answer, { headers: { "Cache-Control": "no-store" } });
}
