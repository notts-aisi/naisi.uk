import { NextResponse } from "next/server";
import { blockCounts, readWeekReach, readWeekWork } from "@/lib/courses/weekEdit/counts";
import { editorItemOf } from "@/lib/courses/weekEdit/editor";
import { loadEditWeek, weekEditGate } from "@/lib/courses/weekEdit/gate";
import {
  applyBlockEdit,
  editSummary,
  isEditableType,
  locateBlock,
  parseEditBody,
} from "@/lib/courses/weekEdit/model";
import { saveWeekBlocks } from "@/lib/courses/weekEdit/save";
import { EDIT_REFUSAL } from "@/lib/courses/weekEdit/words";
import { isBlockWeek, isWeekItemId } from "@/lib/courses/weekBlocks/model";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * CHANGING ONE BLOCK OF A RUN'S WEEK WHERE IT STANDS.
 *
 *   PATCH ...  { base, fields, reading? }: the block's new words, saved in
 *              one transaction, with a record in the week's history.
 *
 * WHO: an admin, or the lead of the programme that names the run, exactly
 * whom the paste route admits (`weekEditGate`), decided before anything of
 * the run is read; a view-as session is refused before that.
 *
 * WHAT: a source (kind, title, link, author, date, time, note), a text (its
 * heading, time and words), a reflection (the words of its one or two
 * prompts) or a written answer (its heading, question, guidance, word range
 * and due rule). Every other kind is refused with one sentence; the paste
 * still changes anything. The block keeps its id and so do its prompts and
 * boxes, so every tick and answer stays with it (`src/lib/courses/weekEdit/
 * model.ts`), and the edited week is held to the paste's own checks.
 *
 * REFUSED: a block that changed since the editor loaded it (409, the `base`
 * fingerprint no longer matches: somebody pasted meanwhile, so the page
 * loads the week again); a week somebody else holds the lock on (409, naming
 * them); a changed link that does not say it is the same reading at a new
 * address (replacing a reading with a different one is not built yet); a
 * due rule changed once anybody has sent the answer.
 *
 * ANSWERS: the block as saved (its new fingerprint and fields), how many
 * people have ticked it, answered it or sent it, the history's line, the
 * other lines put right to match a new word range (`followed`), and
 * whether the week is live (the page then offers to tell people:
 * `/tell`). A save that changes nothing writes nothing and says so.
 */

type Params = { params: Promise<{ runId: string; weekId: string; blockId: string }> };

export async function PATCH(req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const { runId, weekId, blockId } = await ctx.params;
  const gated = await weekEditGate(db, actor, { runId, weekId });
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  if (!isWeekItemId(blockId)) return NextResponse.json({ error: "That isn’t a block of the week." }, { status: 400 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: EDIT_REFUSAL.body }, { status: 400 });
  }

  const loaded = await loadEditWeek(db, runId, weekId);
  if ("status" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  if (!loaded.exists) return NextResponse.json({ error: EDIT_REFUSAL.noPage }, { status: 404 });
  if (!isBlockWeek(loaded.week)) return NextResponse.json({ error: EDIT_REFUSAL.notBlocks }, { status: 400 });
  const located = locateBlock(loaded.week.blocks, blockId);
  if (!located) return NextResponse.json({ error: EDIT_REFUSAL.blockGone }, { status: 409 });
  if (!isEditableType(located.block.type)) return NextResponse.json({ error: EDIT_REFUSAL.kind }, { status: 400 });
  const body = parseEditBody(raw, located.block.type);
  if ("error" in body) return NextResponse.json({ error: body.error }, { status: 400 });

  // What people have done on the block, counted before the save: every one of
  // them is kept, and a sent answer keeps the due rule it was sent against.
  const [work, reach] = await Promise.all([
    readWeekWork(db, runId, weekId, loaded.week.blocks),
    readWeekReach(db, runId, weekId),
  ]);
  const counts = blockCounts(located.block, work);

  // What the save said, kept from its last build (a transaction that loses a race builds again).
  let summary = "";
  let followed: string[] = [];
  const result = await saveWeekBlocks(db, {
    runId,
    weekId,
    weekNumber: loaded.weekNumber,
    uid: actor.uid,
    kind: "edit",
    now: new Date(),
    reach: reach.saveReach,
    work: { ticks: counts.ticks, answers: counts.answers, takenOut: 0 },
    build: (stored) => {
      if (!stored.blocks) return { ok: false, status: 409, body: { error: EDIT_REFUSAL.blockGone } };
      const applied = applyBlockEdit(stored.blocks, blockId, body);
      if (!applied.ok) return { ok: false, status: applied.status, body: { error: applied.error } };
      if (applied.noChange) return { ok: true, noop: true };
      if (applied.change.type === "writtenAnswer" && applied.change.changed.includes("due") && counts.sent > 0) {
        return { ok: false, status: 409, body: { error: EDIT_REFUSAL.dueAfterSent(counts.sent) } };
      }
      const at = locateBlock(applied.blocks, blockId) ?? located;
      summary = editSummary(applied.change, at);
      followed = applied.change.type === "writtenAnswer" ? applied.change.followed : [];
      return {
        ok: true,
        blocks: applied.blocks,
        summary,
        blockId,
        partNumber: at.part ? at.partNumber : null,
        change: applied.change,
      };
    },
  });
  if (!result.ok) return NextResponse.json(result.body, { status: result.status });

  const blocks = result.saved ? result.blocks : loaded.week.blocks;
  const item = editorItemOf(blocks, blockId, counts);
  return NextResponse.json({
    saved: result.saved,
    saveId: result.saved ? result.saveId : null,
    summary: result.saved ? summary : "",
    followed: result.saved ? followed : [],
    item,
    live: loaded.week.published === true,
  });
}
