import { NextResponse } from "next/server";
import { canRunTerm } from "@/lib/applications/access";
import { ONLY_AN_ADMIN_HANDS_OVER, handOverProgramme } from "@/lib/applications/handover/handOver";
import { loadRunPanel } from "@/lib/applications/handover/load";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * Hand the people who hold a place on one programme over to its course run:
 * each of them gets a row on the list that run's allocation board reads.
 *
 * ADMIN ONLY, and decided before anything is read. It runs only once
 * decisions have been sent, so everybody it touches has already been told.
 *
 * IT EMAILS NOBODY AND PUTS NOBODY IN A GROUP. Pressing it again adds
 * anybody new (somebody who has since accepted an invitation, say) and writes
 * nothing for anybody already there. Nobody is ever taken off a run from
 * here: somebody who gave their place back afterwards is named on the panel
 * for an admin to act on.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId, programmeId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) {
    return NextResponse.json({ error: ONLY_AN_ADMIN_HANDS_OVER }, { status: 403 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let written: Awaited<ReturnType<typeof handOverProgramme>>;
  try {
    written = await handOverProgramme(db, user, roundId, programmeId);
  } catch (err) {
    console.error("[hand-over] could not write", roundId, programmeId, err);
    return NextResponse.json(
      { error: "Could not hand people over. Nothing is written twice, so press again." },
      { status: 500 },
    );
  }
  if (!written.ok) return NextResponse.json({ error: written.error }, { status: written.status });

  const outcome = await loadRunPanel(db, user, roundId, programmeId);
  if (outcome.status !== "ok") {
    return NextResponse.json({ error: "That programme is not on this form." }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    receipt: {
      handedOver: written.value.handedOver,
      alreadyThere: written.value.alreadyThere,
    },
    panel: outcome.panel,
  });
}
