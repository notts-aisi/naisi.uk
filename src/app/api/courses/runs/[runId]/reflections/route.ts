import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { programmeLedBy } from "@/lib/courses/programmeLead";
import { isReflectionResponse } from "@/lib/firestore/courseExercises";

/**
 * ONE PERSON'S REFLECTIONS FOR ONE WEEK, READ BY SOMEBODY ELSE:
 * `GET /api/courses/runs/[runId]/reflections?uid=<writer>&week=<n>`.
 *
 * WHO MAY READ (Q30, and Zach on Mon 26 Oct for a facilitator's own): the
 * lead of the programme that names this run, while they stand
 * (`programmeLedBy`), and admins. Nobody else, so never another fellow, and
 * never a facilitator's co-facilitators or group. The person who wrote them
 * reads their own through `my-exercises`, which holds them to their own live
 * place (someone who has left reads nothing back); this route serves them
 * nothing it would not.
 *
 * Every refusal is the same 403, decided before a single reflection is read,
 * so the answer never says whether somebody wrote anything. The group's own
 * facilitators read their group's reflections (Q30) on the group's pages, on
 * the server, through `src/lib/courses/facilitatorWeek/readers.ts` after each
 * page's gate, and never through this route.
 *
 * What travels is the reflections, field by field: the prompt's id, the
 * words and when they were last saved. No name, no address.
 */

export type ReflectionsPayload = {
  reflections: Array<{
    promptId: string;
    /** Week doc id ("w01"). */
    weekId: string;
    /** Plain text, drawn as text nodes. */
    text: string;
    /** ISO 8601, or null. */
    updatedAt: string | null;
  }>;
};

/** The plan's bound on a week number. */
const MAX_WEEK_NUMBER = 60;
/** One person's rows for one week: a week's answers and boxes, with room to spare. */
const MAX_ROWS = 120;


function isoOf(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  const stamp = value as { toDate?: () => Date } | null | undefined;
  return stamp && typeof stamp.toDate === "function" ? stamp.toDate().toISOString() : null;
}

export async function GET(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  if (!isAddressableId(runId)) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const params = new URL(req.url).searchParams;
  const uid = params.get("uid") ?? "";
  const rawWeek = params.get("week") ?? "";
  const week = /^\d{1,2}$/.test(rawWeek) ? Number(rawWeek) : 0;
  if (!isAddressableId(uid) || week < 1 || week > MAX_WEEK_NUMBER) {
    return NextResponse.json(
      { error: `Say whose reflections and which week: uid, and week as a number from 1 to ${MAX_WEEK_NUMBER}.` },
      { status: 400 },
    );
  }

  // The gate, before any reflection is read.
  const isAdmin = actor.role === "admin";
  const leads = isAdmin ? null : await programmeLedBy(db, actor, runId);
  if (!isAdmin && !leads) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Three equalities, served by the existing (runId, weekNumber, uid) composite.
  const snap = await db
    .collection("courseExerciseResponses")
    .where("runId", "==", runId)
    .where("weekNumber", "==", week)
    .where("uid", "==", uid)
    .limit(MAX_ROWS)
    .get();

  const reflections: ReflectionsPayload["reflections"] = [];
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    // Reflections only: an answer is the review queue's, behind its own gate.
    if (!isReflectionResponse(data) || data.uid !== uid || data.runId !== runId) continue;
    const text = typeof data.text === "string" ? data.text : "";
    if (!text.trim()) continue;
    reflections.push({
      promptId: typeof data.exerciseId === "string" ? data.exerciseId : "",
      weekId: typeof data.weekId === "string" ? data.weekId : "",
      text,
      updatedAt: isoOf(data.updatedAt),
    });
  }
  reflections.sort((a, b) => a.promptId.localeCompare(b.promptId));

  const payload: ReflectionsPayload = { reflections };
  return NextResponse.json(payload);
}
