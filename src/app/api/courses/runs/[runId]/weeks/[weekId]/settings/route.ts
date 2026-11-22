import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { programmeLedBy } from "@/lib/courses/programmeLead";
import { readWeekReach } from "@/lib/courses/weekEdit/counts";
import { newestOf, saveHeadsQuery, saveIdOf, weekHistoryRef } from "@/lib/courses/weekEdit/history";
import { heldByAnother, heldRefusal, readHold, weekLockRef } from "@/lib/courses/weekEdit/lock";
import { PITCHES_COLLECTION } from "@/lib/courses/pitching/model";
import { TEAMS_COLLECTION } from "@/lib/courses/teams/model";
import { weekFingerprint } from "@/lib/courses/weekEdit/model";
import { HISTORY_WORDS } from "@/lib/courses/weekEdit/words";
import { askedOf } from "@/lib/courses/weekEdit/wordsThen";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { checkSettings, settingsBodyOf, settingsChanges, settingsFingerprint, type WeekSettings } from "@/lib/courses/weekSettings/model";
import {
  NOTHING_CHANGED,
  PITCHING_IN_USE,
  SETTINGS_CHANGED,
  SETTINGS_NOT_YOURS,
  SETTINGS_SAVED,
  pitchingElsewhereWords,
  settingsHistoryLine,
} from "@/lib/courses/weekSettings/words";
import { weekNumberOfId } from "@/lib/courses/weeksTab/paths";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeCourseRun, normalizeCourseWeek } from "@/lib/firestore/courses";

/**
 * A WEEK'S SETTINGS, SAVED TOGETHER, from its page on a programme's Weeks tab:
 * `PUT /api/courses/runs/[runId]/weeks/[weekId]/settings` with
 * `{ title, summary, pitching, questions }`.
 *
 * The four things about a run's week that only the older week editor could
 * change: its title, its summary, whether it is pitching week, and its
 * questions to think about. Every check that editor made on each field, and
 * the limits the rules hold it to, are `checkSettings`
 * (`src/lib/courses/weekSettings/model.ts`).
 *
 * WHO. Exactly the week's other edits' gate (`weekEditGate`, the paste, the
 * blocks, the owner, Mark ready): an admin, or the lead of the programme that
 * names the run while they stand as one (`programmeLedBy`), decided from the
 * forms before anything of the run is read. Everybody else gets one 403, so
 * a run id says nothing. The order: view-as, session (401), the body's shape
 * (400), the gate (403), the address (404), then the run and the week (404),
 * then each field (400).
 *
 * LIKE EVERY OTHER SAVE OF A WEEK (`saveWeekBlocks`): refused (409, the
 * holder named) while somebody else holds the week's lock, and refused (409)
 * when the settings as stored are no longer the ones the page read: the body
 * carries their fingerprint as `base` (`settingsFingerprint`), as a block's
 * edit carries its block's, so a save from an older page never writes back
 * what somebody changed meanwhile. Both are read in the transaction.
 *
 * ONE PITCHING WEEK. The pitching pages treat the lowest-numbered week ticked
 * as pitching week (`readPitchingWeek`) and read every pitch and pick by that
 * week's id, so the tick moves people's pitches. A run has one: ticking a week
 * while another is ticked is refused, naming that week. Once any pitch (a
 * pick is a name on a pitch) or team is on the run, pitching week can't be
 * unticked or moved: unticking is refused, and so is ticking a week other
 * than the one the pitches were made in. Counted in the transaction.
 *
 * WHAT IT WRITES, in one transaction, and only when something changed: the
 * changed fields on the run's week, with who and when, and one line in the
 * week's history (`courseRuns/{runId}/weeks/{weekId}/history`, kind `edit`,
 * no block named) saying which settings changed, under the name of whoever
 * saved. The history keeps the week's blocks with every save (`history.ts`),
 * so the line keeps them as they stand, unchanged, and a week whose history
 * does not end with what is stored first gets its record of the week as
 * found, as every save of a week does. A week not written as blocks has no
 * history (a restore writes blocks back), so its settings are saved with no
 * line. A save that changes nothing writes nothing and says so.
 *
 * WHAT IT DOES NOT TOUCH. The week's blocks, its Ready and Published, its
 * owner and how it meets, and every group's own copy of the week: a group
 * with its own copy reads the summary and questions in that copy, which this
 * never writes. Nobody is emailed. A view-as session is refused first.
 */

type Params = { params: Promise<{ runId: string; weekId: string }> };

export type WeekSettingsAnswer = { ok: true; saved: boolean; message: string; settings: WeekSettings };

class Refusal extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function PUT(req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const shaped = settingsBodyOf(raw);
  if (!shaped.ok) return NextResponse.json({ error: shaped.error }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // The gate, before anything of the run is read: only the forms.
  const { runId, weekId } = await ctx.params;
  if (actor.role !== "admin" && (!isAddressableId(runId) || (await programmeLedBy(db, actor, runId)) === null)) {
    return NextResponse.json({ error: SETTINGS_NOT_YOURS }, { status: 403 });
  }
  const idNumber = weekNumberOfId(weekId);
  if (!isAddressableId(runId) || idNumber === null) {
    return NextResponse.json({ error: "That isn’t a week of a run: weeks are w01 to w60." }, { status: 404 });
  }

  const checked = checkSettings(shaped.body);

  const runRef = db.collection("courseRuns").doc(runId);
  const weekRef = runRef.collection("weeks").doc(weekId);
  const history = weekHistoryRef(db, runId, weekId);
  const lockRef = weekLockRef(db, runId, weekId);
  const ticked = runRef.collection("weeks").where("pitching", "==", true);
  const pitches = db.collection(PITCHES_COLLECTION).where("runId", "==", runId).select("weekId");
  const teams = db.collection(TEAMS_COLLECTION).where("runId", "==", runId).count();

  let answer: WeekSettingsAnswer;
  try {
    // Who a save reaches, as every save of a week records it: read before the
    // transaction, as the paste and the edit read it.
    const reach = await readWeekReach(db, runId, weekId);
    answer = await db.runTransaction(async (tx): Promise<WeekSettingsAnswer> => {
      const [runSnap, weekSnap, headSnap, lockSnap] = await Promise.all([
        tx.get(runRef),
        tx.get(weekRef),
        tx.get(saveHeadsQuery(db, runId, weekId)),
        tx.get(lockRef),
      ]);
      if (!runSnap.exists || (runSnap.data() ?? {}).destroying === true) throw new Refusal("That run isn’t on the site.", 404);
      const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
      const slot = run.weekPlan.find((entry) => entry.kind === "week" && entry.weekId === weekId);
      const weekNumber = slot && slot.kind === "week" ? slot.weekNumber : idNumber;
      if (!weekSnap.exists) throw new Refusal(`Week ${weekNumber} has no page on this run yet.`, 404);
      if (!checked.ok) throw new Refusal(checked.error, 400);

      // Somebody else is editing this week.
      const other = heldByAnother(readHold(lockSnap), actor.uid, new Date());
      if (other) throw new Refusal((await heldRefusal(db, other, weekNumber)).error, 409);

      const week = normalizeCourseWeek(weekSnap.id, weekSnap.data() ?? {});
      const stored: WeekSettings = { title: week.title, summary: week.summary, pitching: week.pitching, questions: week.questions };
      // A page older than the settings as stored.
      if (settingsFingerprint(stored) !== shaped.body.base) throw new Refusal(SETTINGS_CHANGED, 409);
      const next = checked.settings;
      const changes = settingsChanges(stored, next);
      if (changes.length === 0) return { ok: true, saved: false, message: NOTHING_CHANGED, settings: stored };

      // One pitching week, which stays put once anybody has pitched or a team is made.
      if (changes.includes("pitching-on") || changes.includes("pitching-off")) {
        const [tickedSnap, pitchSnap, teamAgg] = await Promise.all([tx.get(ticked), tx.get(pitches), tx.get(teams)]);
        const otherTicked = tickedSnap.docs
          .filter((each) => each.id !== weekId && (each.data() ?? {}).pitching === true)
          .map((each) => weekNumberOfId(each.id))
          .filter((n): n is number => n !== null)
          .sort((a, b) => a - b);
        const pitchWeeks = pitchSnap.docs.map((each) => (each.data() ?? {}).weekId);
        const inUse = pitchWeeks.length > 0 || teamAgg.data().count > 0;
        if (next.pitching) {
          if (otherTicked.length > 0) throw new Refusal(pitchingElsewhereWords(otherTicked[0]), 409);
          if (inUse && pitchWeeks.some((id) => id !== weekId)) throw new Refusal(PITCHING_IN_USE, 409);
        } else if (inUse) {
          throw new Refusal(PITCHING_IN_USE, 409);
        }
      }

      const written: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedByUid: actor.uid };
      if (changes.includes("title")) written.title = next.title;
      if (changes.includes("summary")) written.summary = next.summary;
      if (changes.includes("pitching-on") || changes.includes("pitching-off")) written.pitching = next.pitching;
      if (changes.includes("questions")) written.questions = next.questions;
      tx.update(weekRef, written);

      if (isBlockWeek(week)) {
        const blocks = week.blocks;
        const fingerprint = weekFingerprint(blocks);
        const head = newestOf(
          headSnap.docs.map((each) => {
            const data = each.data() ?? {};
            return { seq: typeof data.seq === "number" ? data.seq : 0, fingerprint: typeof data.fingerprint === "string" ? data.fingerprint : "" };
          }),
        );
        let seq = (head?.seq ?? 0) + 1;
        const record = (fields: Record<string, unknown>) => ({
          at: FieldValue.serverTimestamp(),
          blockId: null,
          partNumber: null,
          change: null,
          reach: JSON.parse(JSON.stringify(reach.saveReach)),
          work: { ticks: 0, answers: 0, takenOut: 0 },
          restoredFrom: null,
          told: null,
          blockCount: blocks.length,
          fingerprint,
          asked: askedOf(blocks),
          blocks,
          ...fields,
        });
        // The week as found, when its history does not already end with it.
        if (!head || head.fingerprint !== fingerprint) {
          tx.create(history.doc(saveIdOf(seq)), record({
            seq,
            kind: "found",
            byUid: null,
            summary: head ? HISTORY_WORDS.drifted : HISTORY_WORDS.firstFound,
            title: stored.title,
          }));
          seq += 1;
        }
        tx.create(history.doc(saveIdOf(seq)), record({
          seq,
          kind: "edit",
          byUid: actor.uid,
          summary: settingsHistoryLine(changes),
          title: next.title,
        }));
      }
      return { ok: true, saved: true, message: SETTINGS_SAVED, settings: next };
    });
  } catch (err) {
    if (err instanceof Refusal) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses week settings] write failed", runId, weekId, err);
    return NextResponse.json({ error: "Couldn’t save that just now. Try again." }, { status: 500 });
  }
  return NextResponse.json(answer);
}
