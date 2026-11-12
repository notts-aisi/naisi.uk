import { NextResponse } from "next/server";
import { readWeekReach, readWeekWork, weekCounts } from "@/lib/courses/weekEdit/counts";
import { whenWords } from "@/lib/courses/weekEdit/editor";
import { loadEditWeek, weekEditGate } from "@/lib/courses/weekEdit/gate";
import { isSaveId, readWeekSaveById } from "@/lib/courses/weekEdit/history";
import { weekFingerprint } from "@/lib/courses/weekEdit/model";
import { answersOn, itemsARestoreTakesOut } from "@/lib/courses/weekEdit/restore";
import { saveWeekBlocks } from "@/lib/courses/weekEdit/save";
import { EDIT_REFUSAL, HISTORY_WORDS, RESTORE_WORDS } from "@/lib/courses/weekEdit/words";
import { isBlockWeek, weekBlocksProblems } from "@/lib/courses/weekBlocks/model";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * BRINGING A VERSION OF A WEEK BACK, AS A NEW SAVE.
 *
 *   POST ...  { base, confirmAnswers? }: the chosen save's blocks (and title)
 *             written back as the week, through the same transaction as an
 *             edit or a paste (`saveWeekBlocks`): refused while somebody else
 *             holds the week's lock, and recorded in the history as a restore
 *             of that version. Nothing earlier is overwritten: the history
 *             only grows.
 *
 * IDS AS THEY WERE. The version's blocks carry the ids they had, so ticks
 * and answers on anything it brings back are with their blocks again, and
 * anything removed since comes back with its answers. What it takes out
 * (whatever was added since) keeps its answers with the people who wrote
 * them; a restore that takes out answered items is refused (409, with the
 * count) until the body confirms that count, as a paste is.
 *
 * `base` is the week's fingerprint as the page looked at it (`history/
 * [saveId]` hands it over as `restore.base`): a week changed since is
 * refused (409), so a restore never lands on a week nobody looked at.
 *
 * WHO: an admin or the lead of the programme that names the run
 * (`weekEditGate`); a view-as session is refused first.
 */

type Params = { params: Promise<{ runId: string; weekId: string; saveId: string }> };

export async function POST(req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const { runId, weekId, saveId } = await ctx.params;
  const gated = await weekEditGate(db, actor, { runId, weekId });
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  if (!isSaveId(saveId)) return NextResponse.json({ error: "That isn’t a save of this week." }, { status: 400 });

  let body: { base?: unknown; confirmAnswers?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: RESTORE_WORDS.body }, { status: 400 });
  }
  if (typeof body?.base !== "string" || !/^[0-9a-f]{16}$/.test(body.base)) {
    return NextResponse.json({ error: RESTORE_WORDS.base }, { status: 400 });
  }
  const base = body.base;
  const confirm = body.confirmAnswers;
  if (confirm !== undefined && confirm !== null && !(typeof confirm === "number" && Number.isInteger(confirm) && confirm >= 0)) {
    return NextResponse.json({ error: RESTORE_WORDS.confirm }, { status: 400 });
  }

  const loaded = await loadEditWeek(db, runId, weekId);
  if ("status" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  if (!loaded.exists) return NextResponse.json({ error: EDIT_REFUSAL.noPage }, { status: 404 });
  const version = await readWeekSaveById(db, runId, weekId, saveId);
  if (!version) return NextResponse.json({ error: "That save isn’t in this week’s history." }, { status: 404 });

  const nowBlocks = isBlockWeek(loaded.week) ? loaded.week.blocks : [];
  if (weekFingerprint(nowBlocks) !== base) return NextResponse.json({ error: RESTORE_WORDS.weekChanged }, { status: 409 });
  if (weekFingerprint(version.blocks) === base && (version.title === "" || version.title === loaded.week.title)) {
    return NextResponse.json({ saved: false, saveId: null, summary: RESTORE_WORDS.same });
  }
  // The paste's own checks: a version stored under an older cap is refused rather than written back over it.
  const problems = weekBlocksProblems(version.blocks);
  if (problems.length > 0) return NextResponse.json({ error: problems[0] }, { status: 400 });

  const takesOut = itemsARestoreTakesOut(nowBlocks, version.blocks);
  const counted = await answersOn(db, runId, weekId, takesOut);
  if (counted.total > 0 && confirm !== counted.total) {
    const items = takesOut.filter((item) => (counted.byItem.get(item.id) ?? 0) > 0).length;
    return NextResponse.json({ error: RESTORE_WORDS.takesOut(counted.total, items), answers: counted.total }, { status: 409 });
  }

  const [work, reach] = await Promise.all([
    readWeekWork(db, runId, weekId, version.blocks),
    readWeekReach(db, runId, weekId),
  ]);
  const kept = weekCounts(version.blocks, work);
  const summary = HISTORY_WORDS.restored(whenWords(version.at));
  const result = await saveWeekBlocks(db, {
    runId,
    weekId,
    weekNumber: loaded.weekNumber,
    uid: actor.uid,
    kind: "restore",
    now: new Date(),
    reach: reach.saveReach,
    work: { ticks: kept.ticks, answers: kept.answers, takenOut: counted.total },
    build: (stored) => {
      if (weekFingerprint(stored.blocks ?? []) !== base) {
        return { ok: false, status: 409, body: { error: RESTORE_WORDS.weekChanged } };
      }
      return {
        ok: true,
        blocks: version.blocks,
        ...(version.title ? { title: version.title } : {}),
        summary,
        restoredFrom: version.seq,
      };
    },
  });
  if (!result.ok) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json({ saved: result.saved, saveId: result.saved ? result.saveId : null, summary });
}
