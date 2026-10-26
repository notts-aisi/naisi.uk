import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { programmeLedBy } from "@/lib/courses/programmeLead";
import { sessionOfWeek } from "@/lib/courses/sessionChange/model";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { readTabRun } from "@/lib/courses/weeksTab/load";
import { weekNumberOfId } from "@/lib/courses/weeksTab/paths";
import { MODE_NOT_YOURS, leftAloneWords, modeDoneWords, noLinkWords } from "@/lib/courses/weeksTab/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import {
  GROUP_FIELD_LIMITS,
  compareGroupsByMeeting,
  normalizeCourseGroup,
  sessionChangeForWeek,
  sessionModeForWeek,
  sessionModesOf,
  type CourseGroupDoc,
} from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";

/**
 * HOW A WHOLE WEEK MEETS, ON ITS PROGRAMME'S WEEKS TAB (board pr-weeks,
 * "This week is In person / Online"):
 * `PUT /api/courses/runs/[runId]/weeks/[weekId]/mode` with `{ online }`.
 *
 * WHAT IT WRITES IS WHAT "CHANGE A SESSION" ALREADY WRITES to hold one
 * group's session online: the group's own `sessionModes` entry for the week
 * ("virtual"), which every page reads to show the session's join link on the
 * programme page and leave its room out. No email carries a meeting link, and
 * this route sends none. Online sets it for every group of the run whose
 * session that week can change; In person takes it away again, with the
 * "held online" record "Change a session" may have left for that week.
 *
 * WHAT IT LEAVES ALONE, and says so: a group whose session that week has
 * already started or met, a group with no session that week, and a group whose
 * session that week was changed on its own (moved, cancelled or pushed back),
 * which stays as its facilitators or lead made it.
 *
 * WHOLE OR NOT AT ALL. A session held online needs its group's meeting link:
 * when a group that would go online has none, nothing is written and the
 * answer names every such group. So is a group already holding as many
 * one-week arrangements as a group can. The write is one transaction that
 * reads every group again.
 *
 * WHO. The lead of the programme that names the run, while they stand as one
 * (`programmeLedBy`), and admins. Every other caller gets the same 403,
 * decided from the forms before anything of the run is read. The order:
 * view-as, session (401), the body (400), the gate (403), the address (404),
 * then the run and its groups.
 */

type Params = { params: Promise<{ runId: string; weekId: string }> };

type Why = "met" | "changed" | "no-session";

/** One group's part in a press. */
type Planned =
  | { kind: "write"; patch: Record<string, unknown> }
  | { kind: "already" }
  | { kind: "left"; why: Why }
  | { kind: "no-link" }
  | { kind: "full" };

/** What a press means for one group's session that week, on the group as it stands. */
function planFor(run: CourseRunDoc, group: CourseGroupDoc, weekNumber: number, weekId: string, online: boolean, now: Date): Planned {
  const session = sessionOfWeek(resolveSessions(run, group), weekNumber);
  if (!session || !session.dateKey) return { kind: "left", why: "no-session" };
  const { startsAt } = sessionInstants(session);
  if (!startsAt || startsAt.getTime() <= now.getTime()) return { kind: "left", why: "met" };
  const change = sessionChangeForWeek(group, weekId);
  if (change && change.kind !== "online") return { kind: "left", why: "changed" };
  const mode = sessionModeForWeek(group, weekId);
  if (online) {
    if (mode === "virtual") return { kind: "already" };
    if (!session.session.meetingUrl) return { kind: "no-link" };
    // The cap "Change a session" holds a group's one-week modes to, counted as it counts them.
    const modes = Object.keys(sessionModesOf(group));
    if (!modes.includes(weekId) && modes.length >= GROUP_FIELD_LIMITS.maxSessionOverrides) return { kind: "full" };
    return { kind: "write", patch: { [`sessionModes.${weekId}`]: "virtual" } };
  }
  if (mode !== "virtual" && !change) return { kind: "already" };
  return {
    kind: "write",
    patch: {
      [`sessionModes.${weekId}`]: FieldValue.delete(),
      ...(change?.kind === "online" ? { [`sessionChanges.${weekId}`]: FieldValue.delete() } : {}),
    },
  };
}

class Refusal extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const groupName = (group: CourseGroupDoc) => group.name.trim() || "A group";

export async function PUT(req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { online?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Say how the week meets: { \"online\": true } or false." }, { status: 400 });
  }
  if (typeof body?.online !== "boolean") {
    return NextResponse.json({ error: "Say how the week meets: { \"online\": true } or false." }, { status: 400 });
  }
  const online = body.online;

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // The gate, before anything of the run is read: only the forms.
  const { runId, weekId } = await ctx.params;
  if (actor.role !== "admin" && (!isAddressableId(runId) || (await programmeLedBy(db, actor, runId)) === null)) {
    return NextResponse.json({ error: MODE_NOT_YOURS }, { status: 403 });
  }
  const weekNumber = weekNumberOfId(weekId);
  if (!isAddressableId(runId) || weekNumber === null) {
    return NextResponse.json({ error: "That isn’t a week of a run: weeks are w01 to w60." }, { status: 404 });
  }
  const run = await readTabRun(db, runId);
  if (!run) return NextResponse.json({ error: "That run isn’t on the site." }, { status: 404 });
  if (!run.weekPlan.some((entry) => entry.kind === "week" && entry.weekNumber === weekNumber)) {
    return NextResponse.json({ error: `Week ${weekNumber} isn’t in this run’s plan.` }, { status: 404 });
  }

  const now = new Date();
  let outcome: { changed: number; left: { group: string; why: Why }[] };
  try {
    outcome = await db.runTransaction(async (tx) => {
      // One equality on one field, as every tab reads the run's groups.
      const snap = await tx.get(db.collection("courseGroups").where("runId", "==", run.id));
      const groups = snap.docs
        .map((doc) => ({ ref: doc.ref, group: normalizeCourseGroup(doc.id, doc.data() ?? {}) }))
        .filter(({ group }) => !group.archived && group.runId === run.id)
        // The one order every tab of a programme lists groups in, Monday first.
        .sort((a, b) => compareGroupsByMeeting(a.group, b.group));
      const planned = groups.map(({ ref, group }) => ({ ref, group, plan: planFor(run, group, weekNumber, weekId, online, now) }));
      const noLink = planned.filter(({ plan }) => plan.kind === "no-link").map(({ group }) => groupName(group));
      if (noLink.length > 0) throw new Refusal(noLinkWords(weekNumber, noLink), 400);
      const full = planned.filter(({ plan }) => plan.kind === "full").map(({ group }) => groupName(group));
      if (full.length > 0) {
        throw new Refusal(`${full.join(", ")} already ${full.length === 1 ? "holds" : "hold"} as many one-week arrangements as a group can, so nothing was changed.`, 400);
      }
      let changed = 0;
      for (const { ref, plan } of planned) {
        if (plan.kind !== "write") continue;
        tx.update(ref, { ...plan.patch, updatedAt: FieldValue.serverTimestamp() });
        changed += 1;
      }
      const left = planned.flatMap(({ group, plan }) => (plan.kind === "left" ? [{ group: groupName(group), why: plan.why }] : []));
      return { changed, left };
    });
  } catch (err) {
    if (err instanceof Refusal) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses week mode] write failed", runId, weekId, err);
    return NextResponse.json({ error: "That didn’t go through, so nothing was changed. Try again." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    week: { weekId, weekNumber, online },
    changed: outcome.changed,
    message: modeDoneWords(weekNumber, online, outcome.changed),
    left: outcome.left.map((entry) => leftAloneWords(entry.group, entry.why)),
  });
}
