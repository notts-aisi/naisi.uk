import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import type { PoolChoice } from "@/lib/applications/decisionDay/plan";
import {
  buildPoolBoard,
  setPooledOutcome,
  type PoolRequest,
} from "@/lib/applications/decisionDay/pool";
import { isId } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * Pooled applicants: the people no programme they ranked could take, and the
 * outcome the committee picks for each of them before decision day.
 *
 *  - `GET` is everything the page shows.
 *  - `PUT` sets one person's outcome (an invitation to a programme with a free
 *    place, or no offer this time), or gives "No offer this time" to everybody
 *    who has nothing picked yet.
 *
 * ADMIN ONLY, and decided before anything is read: picking what a pooled
 * applicant hears is part of running the term, which is not a lead's job. So
 * every other caller gets the same refusal whether or not the form exists.
 *
 * NOTHING HERE TELLS AN APPLICANT ANYTHING. The outcome is written to the
 * decision document; the applicant's own document is untouched and no email is
 * sent. They hear on decision day.
 */

type Ctx = { params: Promise<{ roundId: string }> };

const NOT_ADMIN = "Only an admin can pick what pooled applicants hear.";

export async function GET(_req: Request, ctx: Ctx) {
  const { roundId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: NOT_ADMIN }, { status: 403 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const form = await loadForm(db, roundId);
  if (!form) {
    return NextResponse.json({ error: "There is no application form here." }, { status: 404 });
  }
  const board = await buildPoolBoard(db, form, new Date());
  return NextResponse.json({ board });
}

/** The outcome a request asks for, or a sentence saying what is wrong with it. */
function readChoice(raw: unknown): PoolChoice | string {
  const outcome = (raw ?? {}) as { kind?: unknown; programmeId?: unknown };
  if (outcome.kind === "no-offer") return { kind: "no-offer" };
  if (outcome.kind === "invite") {
    if (!isId(outcome.programmeId)) return "Say which programme the invitation is to.";
    return { kind: "invite", programmeId: outcome.programmeId };
  }
  return "An outcome is an invitation to a programme, or no offer this time.";
}

function readRequest(raw: unknown): PoolRequest | string {
  const body = (raw && typeof raw === "object" ? raw : {}) as {
    uid?: unknown;
    everyoneWithoutOne?: unknown;
    outcome?: unknown;
  };
  if (body.everyoneWithoutOne === true) {
    const choice = readChoice(body.outcome);
    if (typeof choice === "string") return choice;
    if (choice.kind !== "no-offer") {
      return "Only “No offer this time” can be given to everybody at once.";
    }
    return { everyoneWithoutOne: true, choice };
  }
  const uid = typeof body.uid === "string" ? body.uid.trim() : "";
  if (!uid || uid.length > 128 || !isAddressableId(uid)) return "Say who this outcome is for.";
  const choice = readChoice(body.outcome);
  if (typeof choice === "string") return choice;
  return { uid, choice };
}

export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: NOT_ADMIN }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const request = readRequest(raw);
  if (typeof request === "string") return NextResponse.json({ error: request }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let written: Awaited<ReturnType<typeof setPooledOutcome>>;
  try {
    written = await setPooledOutcome(
      db,
      { uid: user.uid, displayName: user.displayName },
      roundId,
      request,
    );
  } catch (err) {
    console.error("[pooled outcome] could not save", roundId, err);
    return NextResponse.json({ error: "Could not save that outcome. Try again." }, { status: 500 });
  }
  if (!written.ok) return NextResponse.json({ error: written.error }, { status: written.status });

  // The page is redrawn from what is stored now, so the free places and every
  // other row's options are right after the change.
  const form = await loadForm(db, roundId);
  if (!form) {
    return NextResponse.json({ error: "There is no application form here." }, { status: 404 });
  }
  const board = await buildPoolBoard(db, form, new Date());
  return NextResponse.json({ ok: true, changed: written.changed, board });
}
