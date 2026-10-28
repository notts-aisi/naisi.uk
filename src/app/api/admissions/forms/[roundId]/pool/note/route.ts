import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import { draftInviteNote } from "@/lib/applications/decisionDay/inviteNote";
import { buildPoolBoard, setInviteNote } from "@/lib/applications/decisionDay/pool";
import { loadForm } from "@/lib/applications/repo";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * The personal note in one pooled applicant's invitation email.
 *
 *  - `PUT { uid, note }` saves the note as the caller's, or takes it off with
 *    an empty one. This is the only way words reach the email.
 *  - `POST { uid }` asks Claude for a draft and keeps it beside Claude's read
 *    of the application. A draft is never sent.
 *
 * Both answer with the Pooled applicants page as it stands after the change.
 *
 * ADMIN ONLY, and decided before anything is read, as for the outcome itself
 * (`../route.ts`). NOTHING HERE TELLS AN APPLICANT ANYTHING: the note goes out
 * with the invitation on decision day, and not before.
 */

// One call to Claude, inside the backend's request limit.
export const maxDuration = 290;

type Ctx = { params: Promise<{ roundId: string }> };

const NOT_ADMIN = "Only an admin can pick what pooled applicants hear.";

/** Who the note is for, or null. */
function readUid(body: Record<string, unknown>): string | null {
  const uid = typeof body.uid === "string" ? body.uid.trim() : "";
  return uid && uid.length <= 128 && isAddressableId(uid) ? uid : null;
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw = (await req.json()) as unknown;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

/** The page as it stands now, for whoever asked. */
async function boardAfter(roundId: string, viewerUid: string) {
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const form = await loadForm(db, roundId);
  if (!form) return NextResponse.json({ error: "There is no application form here." }, { status: 404 });
  const board = await buildPoolBoard(db, form, viewerUid, new Date());
  return NextResponse.json({ ok: true, board });
}

export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: NOT_ADMIN }, { status: 403 });

  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const uid = readUid(body);
  if (!uid) return NextResponse.json({ error: "Say whose invitation this note is for." }, { status: 400 });
  if (typeof body.note !== "string") {
    return NextResponse.json({ error: "A note is text: empty takes it off." }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let written: Awaited<ReturnType<typeof setInviteNote>>;
  try {
    written = await setInviteNote(db, { uid: user.uid, displayName: user.displayName }, roundId, uid, body.note);
  } catch (err) {
    console.error("[invite note] could not save", roundId, err);
    return NextResponse.json({ error: "Could not save that note. Try again." }, { status: 500 });
  }
  if (!written.ok) return NextResponse.json({ error: written.error }, { status: written.status });
  return boardAfter(roundId, user.uid);
}

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: NOT_ADMIN }, { status: 403 });

  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const uid = readUid(body);
  if (!uid) return NextResponse.json({ error: "Say whose invitation this note is for." }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let drafted: Awaited<ReturnType<typeof draftInviteNote>>;
  try {
    drafted = await draftInviteNote(db, user, roundId, uid);
  } catch (err) {
    console.error("[invite note] could not draft", roundId, err);
    return NextResponse.json({ error: "Could not draft that note. Try again." }, { status: 500 });
  }
  if (!drafted.ok) return NextResponse.json({ error: drafted.error }, { status: drafted.status });
  return boardAfter(roundId, user.uid);
}
