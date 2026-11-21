import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { archiveRefusal, restoreRefusal } from "@/lib/courses/groupArchive/plan";
import { readGroupArchiveFacts } from "@/lib/courses/groupArchive/read";
import { ARCHIVE_REFUSAL } from "@/lib/courses/groupArchive/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { canApproveCourse } from "@/lib/firestore/users";

/**
 * ARCHIVE OR RESTORE ONE GROUP, from the run editor's group card.
 *
 *   PATCH { archived: true | false }
 *
 * The only writer of `courseGroups.archived` after a group is made:
 * `firestore.rules` pins the field against every browser, admins included,
 * so the checks below cannot be stepped round.
 *
 * WHO: exactly who could flip the switch while it wrote client-direct, the
 * group's update rule: an admin, an `approveCourse` holder, one of the run's
 * track leads and one of the group's named facilitators, each on an approved
 * account. View-as is refused first, then the session. An admin or an
 * approver is decided on the session alone; anybody else is asked of the
 * group and its run, so a missing group is one 403 for them and a 404 for an
 * admin or an approver, who are told it is not there.
 *
 * WHAT IS CHECKED (`src/lib/courses/groupArchive/plan.ts`): archiving is
 * refused while anybody still holds a place in the group, somebody moved
 * from a week still to come is in it until then, a one-week visit to one of
 * its sessions is still to come, or a register of a session that has started
 * is neither finished nor marked as not having happened; restoring is refused
 * while one of its facilitators holds a place in another of the run's
 * groups; and both on a run being destroyed. Each refusal is one sentence
 * (409) and writes nothing.
 *
 * ONE TRANSACTION: the facts are read and decided once, then read again
 * inside the transaction that writes, and decided again on what it read, so
 * a place, a visit or a register that changed in between is answered rather
 * than archived over. The write is the field and `updatedAt`, nothing else:
 * no place moves, no count changes, and nobody is emailed or told.
 *
 * Pressing for the state the group already has is a 200 that writes nothing.
 */

type Outcome = { kind: "gone" } | { kind: "refused"; error: string } | { kind: "saved" } | { kind: "already" };

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { groupId } = await ctx.params;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // WHO, before the body and before the group is said to be there or not.
  // An admin and an approver hold it whatever the group is; a track lead
  // and a facilitator hold it of this group, read only to ask.
  const approves = canApproveCourse(actor);
  let admitted = approves;
  const groupRef = isAddressableId(groupId) ? db.collection("courseGroups").doc(groupId) : null;
  if (!admitted && groupRef) {
    const groupSnap = await groupRef.get();
    const group = groupSnap.exists ? (groupSnap.data() ?? {}) : null;
    if (group && isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids)) {
      admitted = true;
    } else if (group && typeof group.runId === "string" && isAddressableId(group.runId)) {
      const runSnap = await db.collection("courseRuns").doc(group.runId).get();
      admitted = runSnap.exists && isNamedWithStanding(actor, "courseRuns.trackLeadUids", runSnap.data()?.trackLeadUids);
    }
  }
  if (!admitted) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { archived?: unknown };
  try {
    body = (await req.json()) as { archived?: unknown };
  } catch {
    return NextResponse.json({ error: ARCHIVE_REFUSAL.body }, { status: 400 });
  }
  if (!body || typeof body !== "object" || typeof body.archived !== "boolean") {
    return NextResponse.json({ error: ARCHIVE_REFUSAL.body }, { status: 400 });
  }
  const archived = body.archived;
  if (!groupRef) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const decide = (facts: NonNullable<Awaited<ReturnType<typeof readGroupArchiveFacts>>>, now: Date): Outcome => {
    if (facts.group.archived === archived) return { kind: "already" };
    const error = archived ? archiveRefusal(facts, now) : restoreRefusal(facts);
    return error ? { kind: "refused", error } : { kind: "saved" };
  };

  // Once outside, so a refusal reads nothing more and holds no transaction.
  const now = new Date();
  const first = await readGroupArchiveFacts(db, groupRef.id, now);
  if (!first) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  const looked = decide(first, now);
  if (looked.kind === "refused") return NextResponse.json({ error: looked.error }, { status: 409 });
  if (looked.kind === "already") return NextResponse.json({ ok: true, archived });

  // And again inside the write, on what the transaction read.
  const outcome = await db.runTransaction(async (tx): Promise<Outcome> => {
    const at = new Date();
    const facts = await readGroupArchiveFacts(db, groupRef.id, at, tx);
    if (!facts) return { kind: "gone" };
    const decided = decide(facts, at);
    if (decided.kind !== "saved") return decided;
    tx.update(groupRef, { archived, updatedAt: FieldValue.serverTimestamp() });
    return decided;
  });

  if (outcome.kind === "gone") return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (outcome.kind === "refused") return NextResponse.json({ error: outcome.error }, { status: 409 });
  return NextResponse.json({ ok: true, archived });
}
