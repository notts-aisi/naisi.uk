import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { groupHistoryRow } from "@/lib/courses/groupChange/facts";
import { facilitatorRemovedHeadline, historyDetail } from "@/lib/courses/groupChange/words";
import { enrolmentRefsFor, writeFacilitatorChange } from "@/lib/courses/groupFacilitators";
import { archiveRefusal, restorePlan, type ArchiveFix, type GroupArchiveFacts } from "@/lib/courses/groupArchive/plan";
import { readGroupArchiveFacts } from "@/lib/courses/groupArchive/read";
import { programmeLedBy } from "@/lib/courses/programmeLead";
import { ARCHIVE_REFUSAL, archivedHistoryWords, restoredHistoryWords } from "@/lib/courses/groupArchive/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";

/**
 * ARCHIVE OR RESTORE ONE GROUP, from the group's own page under its
 * programme's Groups tab, and from the older run editor's card on a run no
 * programme names.
 *
 *   PATCH { archived: true | false }
 *
 * The only writer of `courseGroups.archived`, `archivedAt`, `archivedByUid`
 * and `restoredAt` after a group is made: `firestore.rules` refuses every
 * browser write that changes any of them, admins included, so the checks
 * below cannot be stepped round.
 *
 * WHO: an admin, and the lead of the programme that names the group's run
 * (`programmeLedBy`, which asks the forms and the lead's standing). Nobody
 * else: a course approver who leads nothing, a group's own facilitators and
 * a run's track leads are refused as anybody is. View-as is refused first,
 * then the session. An admin is decided on the session alone; anybody else
 * is asked whether they lead the programme naming the group's run, so a
 * group that is there and one that is not are the same 403 for them, before
 * the body is read, and a 404 only for an admin.
 *
 * WHAT IS CHECKED (`src/lib/courses/groupArchive/plan.ts`, in its order):
 * archiving is refused on a run being destroyed or over, for the last group
 * of a run under way that still meets, while anybody still holds a place in
 * the group, a freed place offered in its name is not answered, somebody
 * moved from a week still to come is in it until then, a one-week visit to
 * one of its sessions is still to come, one of its sessions is given to
 * somebody to cover, or a register of a session that has started, in a week
 * somebody's place names for this group, is neither finished nor marked as
 * not having happened. Restoring is refused on a run being destroyed or
 * over, and while another group of the run that still meets has its name.
 * Each refusal is one sentence (409) with the way to put it right (`fix`)
 * where there is one, and writes nothing.
 *
 * ONE TRANSACTION: the facts are read and decided once, then read again
 * inside the transaction that writes, and decided again on what it read, so
 * a place, a visit, a cover or a register that changed in between is
 * answered rather than archived over.
 *
 * WHAT IS WRITTEN. Archiving: `archived`, `archivedAt`, `archivedByUid` and
 * `updatedAt`, and one row of the group's History. Restoring: `archived`,
 * `restoredAt` and `updatedAt`, one row of History, and, for each of its
 * facilitators who now holds a place in another group of the run, that
 * person taken off its facilitators through the one writer
 * (`writeFacilitatorChange`), with its own `facilitator-removed` row. No
 * place moves and no count changes. NOBODY IS EMAILED OR TOLD, then or
 * later: every scheduled job leaves out a session that started before
 * `restoredAt` (`src/lib/courses/groupArchive/restored.ts`).
 *
 * Pressing for the state the group already has is a 200 that writes nothing.
 */

type Outcome =
  | { kind: "gone" }
  | { kind: "refused"; error: string; fix: ArchiveFix | null }
  | { kind: "saved" }
  | { kind: "already" };

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
  // An admin holds it whatever the group is; the lead of the programme that
  // names the group's run holds it of this group, read only to ask. Anybody
  // else holds nothing here.
  const isAdmin = actor.role === "admin";
  let admitted = isAdmin;
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

  const decide = (facts: GroupArchiveFacts, now: Date): Outcome => {
    if (facts.group.archived === archived) return { kind: "already" };
    const refusal = archived ? archiveRefusal(facts, now) : restorePlan(facts, now);
    if (refusal === null) return { kind: "saved" };
    if ("ok" in refusal) return refusal.ok ? { kind: "saved" } : { kind: "refused", ...refusal.refusal };
    return { kind: "refused", ...refusal };
  };

  // Once outside, so a refusal reads nothing more and holds no transaction.
  const now = new Date();
  const first = await readGroupArchiveFacts(db, groupRef.id, now, undefined, actor);
  if (!first) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  const looked = decide(first, now);
  if (looked.kind === "refused") return NextResponse.json({ error: looked.error, fix: looked.fix }, { status: 409 });
  if (looked.kind === "already") return NextResponse.json({ ok: true, archived });

  // And again inside the write, on what the transaction read.
  const outcome = await db.runTransaction(async (tx): Promise<Outcome> => {
    const at = new Date();
    const facts = await readGroupArchiveFacts(db, groupRef.id, at, tx, actor);
    if (!facts) return { kind: "gone" };
    const decided = decide(facts, at);
    if (decided.kind !== "saved") return decided;
    const { group } = facts;
    const runId = group.runId;

    if (archived) {
      tx.update(groupRef, {
        archived: true,
        archivedAt: FieldValue.serverTimestamp(),
        archivedByUid: actor.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(
        db.collection(COURSE_AUDIT_COLLECTION).doc(),
        groupHistoryRow({ kind: "group-archived", run: { id: runId }, group, actor, detail: archivedHistoryWords(group.name), emailed: 0 }),
      );
      return decided;
    }

    // Restoring: anybody who now sits in another group of the run comes off
    // its facilitators, through the one writer, read before anything is written.
    const plan = restorePlan(facts, at);
    const dropping = plan.ok ? plan.dropping.map((each) => each.uid) : [];
    const [enrolments, accounts] = dropping.length
      ? await Promise.all([
          tx.getAll(...enrolmentRefsFor(db, runId, dropping)),
          tx.getAll(...dropping.map((uid) => db.collection("users").doc(uid))),
        ])
      : [[], []];
    const restored = { archived: false, restoredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    if (dropping.length > 0) {
      // The group's own patch from the one writer carries the restore too:
      // one write to the group, not two.
      writeFacilitatorChange(
        {
          set: (ref, data) => tx.set(ref, data),
          create: (ref, data) => tx.create(ref, data),
          update: (ref, data) => tx.update(ref, ref.path === groupRef.path ? { ...data, ...restored } : data),
        },
        db,
        {
          groupRef,
          runId,
          courseId: group.courseId,
          current: group.facilitatorUids,
          next: group.facilitatorUids.filter((uid) => !dropping.includes(uid)),
          enrolments: new Map(dropping.map((uid, i) => [uid, enrolments[i]] as const)),
          recorded: new Set(Object.keys(group.facilitatorAppointments)),
        },
      );
    } else {
      tx.update(groupRef, restored);
    }
    tx.set(
      db.collection(COURSE_AUDIT_COLLECTION).doc(),
      groupHistoryRow({ kind: "group-restored", run: { id: runId }, group, actor, detail: restoredHistoryWords(group.name), emailed: 0 }),
    );
    // The facilitators' route's own row for each, naming them as it does:
    // the name each goes by, which anybody who reads the group's history may see.
    for (const [i, uid] of dropping.entries()) {
      const account = accounts[i];
      const name = account?.exists ? nameForViewer(null, accountNamesOf(account.data() ?? {}), "That person") : "That person";
      tx.set(
        db.collection(COURSE_AUDIT_COLLECTION).doc(),
        groupHistoryRow({
          kind: "facilitator-removed",
          run: { id: runId },
          group,
          actor,
          subjectUid: uid,
          detail: historyDetail({ headline: facilitatorRemovedHeadline(name) }),
        }),
      );
    }
    return decided;
  });

  if (outcome.kind === "gone") return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (outcome.kind === "refused") return NextResponse.json({ error: outcome.error, fix: outcome.fix }, { status: 409 });
  return NextResponse.json({ ok: true, archived });
}
