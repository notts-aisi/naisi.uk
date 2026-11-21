import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { archiveRefusal, restoreRefusal } from "@/lib/courses/groupArchive/plan";
import { readGroupArchiveFacts } from "@/lib/courses/groupArchive/read";
import { programmeLedBy } from "@/lib/courses/programmeLead";
import { ARCHIVE_REFUSAL } from "@/lib/courses/groupArchive/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { canApproveCourse } from "@/lib/firestore/users";

/**
 * ARCHIVE OR RESTORE ONE GROUP, from the run editor's group card and from
 * the group's own page under its programme's Groups tab.
 *
 *   PATCH { archived: true | false }
 *
 * The only writer of `courseGroups.archived` after a group is made:
 * `firestore.rules` pins the field against every browser, admins included,
 * so the checks below cannot be stepped round.
 *
 * WHO: an admin, an `approveCourse` holder (the people the run editor's
 * switch serves) and the lead of the programme that names the group's run,
 * who runs the group from its page (`programmeLedBy`, which asks the forms
 * and the lead's standing). Nobody else: a group's own facilitators and a
 * run's track leads, whom the group's update rule once let flip the field
 * client-direct, are refused as anybody is. View-as is refused first, then
 * the session. An admin or an approver is decided on the session alone;
 * anybody else is asked whether they lead the programme naming the group's
 * run, so a missing group is one 403 for them and a 404 for an admin or an
 * approver, who are told it is not there.
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
  // An admin and an approver hold it whatever the group is; the lead of the
  // programme that names the group's run holds it of this group, read only
  // to ask. A facilitator of the group and a run's track lead hold nothing
  // here: they are refused as anybody else is.
  let admitted = canApproveCourse(actor);
  const groupRef = isAddressableId(groupId) ? db.collection("courseGroups").doc(groupId) : null;
  if (!admitted && groupRef) {
    const groupSnap = await groupRef.get();
    const runId = groupSnap.exists ? groupSnap.data()?.runId : null;
    admitted = typeof runId === "string" && isAddressableId(runId) && (await programmeLedBy(db, actor, runId)) !== null;
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
