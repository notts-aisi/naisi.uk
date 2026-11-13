import { NextResponse } from "next/server";
import { whenWords } from "@/lib/courses/weekEdit/editor";
import { loadEditWeek, weekEditGate } from "@/lib/courses/weekEdit/gate";
import { isSaveId, readWeekSaveById } from "@/lib/courses/weekEdit/history";
import { weekFingerprint } from "@/lib/courses/weekEdit/model";
import { answersOn, compareWithAnswers, itemsARestoreTakesOut } from "@/lib/courses/weekEdit/restore";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * ONE SAVE OF A WEEK, COMPARED.
 *
 *   GET ...?against=now|<saveId>   what differs between this save and the
 *            week now (the default) or another save, block by block, in
 *            words (`compareWeeks`), the earlier of the two first, with the
 *            answers kept on whatever the later one took out. Against now it
 *            also says what restoring this save would take out and the
 *            answers on it, and the week's fingerprint a restore echoes
 *            (`restore`). Writes nothing.
 *
 * WHO: an admin or the lead of the programme that names the run
 * (`weekEditGate`). A save the week does not have is a 404.
 */

type Params = { params: Promise<{ runId: string; weekId: string; saveId: string }> };

export async function GET(req: Request, ctx: Params) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const { runId, weekId, saveId } = await ctx.params;
  const gated = await weekEditGate(db, actor, { runId, weekId });
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  if (!isSaveId(saveId)) return NextResponse.json({ error: "That isn’t a save of this week." }, { status: 400 });
  const against = new URL(req.url).searchParams.get("against") ?? "now";
  if (against !== "now" && !isSaveId(against)) {
    return NextResponse.json({ error: "Compare with now, or with another save of this week." }, { status: 400 });
  }
  const loaded = await loadEditWeek(db, runId, weekId);
  if ("status" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });

  const version = await readWeekSaveById(db, runId, weekId, saveId);
  if (!version) return NextResponse.json({ error: "That save isn’t in this week’s history." }, { status: 404 });
  const nowBlocks = isBlockWeek(loaded.week) ? loaded.week.blocks : [];
  const other = against === "now" ? null : await readWeekSaveById(db, runId, weekId, against);
  if (against !== "now" && !other) return NextResponse.json({ error: "That save isn’t in this week’s history." }, { status: 404 });

  // The earlier of the two is "before".
  const one = { id: version.id, when: whenWords(version.at), summary: version.summary, title: version.title, blocks: version.blocks, seq: version.seq };
  const two = other
    ? { id: other.id, when: whenWords(other.at), summary: other.summary, title: other.title, blocks: other.blocks, seq: other.seq }
    : { id: "now", when: "", summary: "", title: loaded.week.title, blocks: nowBlocks, seq: Number.MAX_SAFE_INTEGER };
  const [before, after] = one.seq <= two.seq ? [one, two] : [two, one];
  const compared = await compareWithAnswers(db, runId, weekId, before, after);

  // What restoring this save over the week as it is now would take out.
  let restore: { base: string; takesOut: Array<{ id: string; kind: string; label: string; answers: number }>; answers: number } | null = null;
  if (against === "now") {
    const takesOut = itemsARestoreTakesOut(nowBlocks, version.blocks);
    const counted = await answersOn(db, runId, weekId, takesOut);
    restore = {
      base: weekFingerprint(nowBlocks),
      takesOut: takesOut.map((item) => ({ id: item.id, kind: item.kind, label: item.label, answers: counted.byItem.get(item.id) ?? 0 })),
      answers: counted.total,
    };
  }

  return NextResponse.json({
    before: { id: before.id, when: before.when, summary: before.summary },
    after: { id: after.id, when: after.when, summary: after.summary },
    comparison: compared.comparison,
    line: compared.line,
    answersTakenOut: compared.answersTakenOut,
    restore,
  });
}
