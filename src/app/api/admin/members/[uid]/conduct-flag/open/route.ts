import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { conductFlagForQueue, normalizeMemberConductFlag } from "@/lib/firestore/memberConductFlags";
import { openConductFlagRecorded } from "@/lib/firestore/recordOpenings";

/**
 * AN ADMIN OPENS ONE PERSON'S CONDUCT RECORD: `POST
 * /api/admin/members/[uid]/conduct-flag/open`, from the control on that
 * person's page in the admin area. The only way anybody reads a flag's
 * reason, who set it and when.
 *
 * A POST and not a GET, because opening it writes: EVERY OPENING IS RECORDED
 * FIRST (`openConductFlagRecorded`, `src/lib/firestore/recordOpenings.ts`),
 * with who opened it, whose it was by account id and when, never what it
 * says. Nothing of the flag is read until that row is stored, and when it
 * cannot be stored the record stays closed. The privacy policy says it from
 * version 17: "we record each time one is opened". An opening of somebody
 * with no flag is recorded too, as an opening.
 *
 * ADMINS ONLY, decided before anything is read. NOT THEIR OWN: the reason is
 * free text that may name whoever reported them, so the person a flag
 * describes never reads it, an admin included, refused before anything is
 * read or recorded with the same answer whether a flag exists or not. Refused
 * in a view-as session like every other write. An opening is recorded only
 * against a member that is there, so a made-up id records nothing.
 *
 * The answer is `conductFlagForQueue(flag, true)` and nothing beside it, the
 * shape setting and clearing answer with (`../route.ts`).
 */

type Ctx = { params: Promise<{ uid: string }> };

/** What an admin is told when they ask about their own account. */
const OWN_ACCOUNT = "The conduct record on your own account is not shown to you. Ask another admin.";

/** What an admin is told when the opening could not be recorded. */
const NOT_RECORDED = "We couldn’t record that you opened it, so it stays closed. Try again.";

export async function POST(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (actor.role !== "admin") {
    return NextResponse.json(
      { error: "Only an admin can see or change a conduct flag. Reviewers are told whether a flag exists, never why." },
      { status: 403 },
    );
  }

  const { uid } = await ctx.params;
  if (!isAddressableId(uid)) return NextResponse.json({ error: "No member with that id." }, { status: 404 });
  // The person a flag describes never reads it, an admin included: refused
  // before anything is read or recorded, the same answer whether a flag
  // exists or not.
  if (uid === actor.uid) return NextResponse.json({ error: OWN_ACCOUNT }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  try {
    // The member, so an opening is recorded only against somebody who is there.
    const member = await db.collection("users").doc(uid).get();
    if (!member.exists) return NextResponse.json({ error: "No member with that id." }, { status: 404 });

    // Recorded first; read only once the record is stored.
    const opened = await openConductFlagRecorded(
      db,
      { actorUid: actor.uid, actorName: (actor.displayName ?? "").trim() || "An admin", subjectUid: uid },
      () => db.collection("memberConductFlags").doc(uid).get(),
    );
    if (!opened.ok) return NextResponse.json({ error: NOT_RECORDED }, { status: 500 });
    const snap = opened.value;
    const flag = snap.exists ? normalizeMemberConductFlag(uid, snap.data() ?? {}) : null;
    return NextResponse.json(conductFlagForQueue(flag, true), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[conduct-flag] open failed:", uid, err);
    return NextResponse.json({ error: "Could not read the conduct flag." }, { status: 500 });
  }
}
