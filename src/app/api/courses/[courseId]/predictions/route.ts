import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser, type SessionUser } from "@/lib/firebase/session";
import { readPredictionCardText, type PredictionCardRead } from "@/lib/courses/predictions/cardText";
import { storedCard, type PredictionCard } from "@/lib/courses/predictions/model";

/**
 * A COURSE'S CREDENCE CARD FOR SEALED PREDICTIONS, SET BY AN ADMIN IN ONE
 * PLACE (`CourseDoc.predictionCard`, `src/lib/courses/predictions/model.ts`;
 * Zach's extra (d)):
 *  - `POST /api/courses/[courseId]/predictions` with `{ text, sealWeek,
 *    openWeek }`: reads a pasted card and answers what it found and what
 *    would stop it being saved. Writes nothing.
 *  - `PUT` with the same: saves it, once nothing stops it; or with
 *    `{ remove: true }`: takes the card off, so no week shows one. The cards
 *    people filled in are kept, and admins can still open them.
 *
 * ADMINS ONLY, decided before anything is read: every run of the course asks
 * these questions, and a card is a list of questions no rule can walk, so no
 * browser writes the field (the rules pin it); this route is its one writer.
 * View-as is refused first.
 *
 * A card somebody has started keeps a copy of its questions
 * (`src/lib/firestore/coursePredictions.ts`), so saving a new card changes
 * nothing anybody has already answered.
 *
 * Stored field by field from what was read, never the request's own object.
 */

export type PredictionCardReadAnswer = PredictionCardRead;

/** Admins only, and a course id that can address a document; then the database. */
async function gate(ctx: { params: Promise<{ courseId: string }> }, actor: SessionUser) {
  const { courseId } = await ctx.params;
  if (!isAddressableId(courseId)) return { response: NextResponse.json({ error: "Course not found" }, { status: 404 }) };
  if (actor.role !== "admin") {
    return { response: NextResponse.json({ error: "Only an admin can change a course’s predictions card." }, { status: 403 }) };
  }
  const db = getAdminDb();
  if (!db) return { response: NextResponse.json({ error: "Server not configured" }, { status: 500 }) };
  return { courseId, db };
}

type Sent = { text: string; sealWeek: unknown; openWeek: unknown } | { remove: true } | { error: string };

async function bodyOf(req: Request): Promise<Sent> {
  let body: { text?: unknown; sealWeek?: unknown; openWeek?: unknown; remove?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return { error: "Send the card as text, with the week it’s sealed in and the week it opens in." };
  }
  if (body.remove === true) return { remove: true };
  if (typeof body.text !== "string") return { error: "Send the card as text, with the week it’s sealed in and the week it opens in." };
  return { text: body.text, sealWeek: body.sealWeek, openWeek: body.openWeek };
}

export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const gated = await gate(ctx, actor);
  if ("response" in gated) return gated.response;
  const sent = await bodyOf(req);
  if ("error" in sent) return NextResponse.json({ error: sent.error }, { status: 400 });
  if ("remove" in sent) {
    return NextResponse.json({ error: "Send the card as text to read it." }, { status: 400 });
  }
  const answer: PredictionCardReadAnswer = readPredictionCardText(sent.text, sent);
  return NextResponse.json(answer);
}

export async function PUT(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const gated = await gate(ctx, actor);
  if ("response" in gated) return gated.response;
  const { courseId, db } = gated;
  const sent = await bodyOf(req);
  if ("error" in sent) return NextResponse.json({ error: sent.error }, { status: 400 });

  let card: PredictionCard | null = null;
  if (!("remove" in sent)) {
    const read = readPredictionCardText(sent.text, sent);
    if (!read.card || read.problems.length > 0) {
      return NextResponse.json(
        { error: read.problems[0] ?? "There are no questions on that card.", problems: read.problems },
        { status: 400 },
      );
    }
    card = read.card;
  }

  const ref = db.collection("courses").doc(courseId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  await ref.update({
    predictionCard: card ? storedCard(card) : null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ ok: true, card });
}
