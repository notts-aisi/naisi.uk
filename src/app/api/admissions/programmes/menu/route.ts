import { NextResponse } from "next/server";
import { loadProgrammesMenu, readsProgrammesFor } from "@/lib/applications/programmes/list";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * GET: the programmes the menu lists under Programmes for the caller.
 *
 *   { terms: [{ heading, programmes: [{ name, href, review }] }] }
 *
 * Each term that is not over, by its heading ("Autumn 2026", "Spring 2027 ·
 * applying"), with the programmes on it whose groups the caller opens: an
 * admin every one, a lead the ones they lead. Each programme by its short
 * name, its Overview's address, and how many applications wait for the
 * caller's reading there (0 with none). Nothing else: no lead's name, no
 * count of people, no needs-you line. Decided and read by
 * `loadProgrammesMenu`, which says what it reads.
 *
 * WHO IS ANSWERED. An admin, and an account named on a form as a lead or a
 * reviewer that still stands (`readsProgrammesFor`, the flag the admissions
 * tree reads). A reviewer who leads nothing is answered no terms. Anybody
 * else is refused before anything is read: 401 signed out, 403 otherwise.
 *
 * The shell asks it once when it mounts, for a reader who could have
 * entries, and draws today's menu until it answers, and if it never does.
 * It reads, and writes nothing.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return answer({ error: "Not signed in" }, 401);
  if (!readsProgrammesFor(user)) {
    return answer({ error: "Only an admin or somebody named on an application form has programmes in the menu." }, 403);
  }
  const db = getAdminDb();
  if (!db) return answer({ error: "Server not configured" }, 500);
  try {
    return answer({ terms: await loadProgrammesMenu(db, user, new Date()) }, 200);
  } catch (err) {
    console.error("[programmes menu] could not read the programmes", user.uid, err);
    return answer({ error: "The programmes could not be read." }, 500);
  }
}

/**
 * Every answer is one person's, refusals included: no cache, shared or the
 * browser's, may keep it, as the calendar feed and the printables say.
 */
const PERSONAL = { "Cache-Control": "private, no-store" };

function answer(body: object, status: number) {
  return NextResponse.json(body, { status, headers: PERSONAL });
}
