import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { canRunTerm } from "@/lib/applications/access";
import { NO_RUN_NAMED } from "@/lib/applications/handover/blocker";
import { own } from "@/lib/applications/keys";
import { isId } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import type { SessionUser } from "@/lib/firebase/session";
import { NOT_ON_THE_LIST, type RoleList } from "./words";

/**
 * TAKE ONE PERSON OFF ONE OF THE RUN'S OLDER ROLES, from the Course run
 * section of the programme that names the run: a track lead
 * (`trackLeadUids`) or a run facilitator (`runFacilitatorUids`). Admin only,
 * asked before anything is read. Nobody is added here: the roles are named
 * only on the older run page (`POST /api/courses/runs/[runId]/roles`).
 *
 * In order: an admin (403); the ids, the form and the programme (404); a run
 * named (409); then, in one transaction, the run on the site (404), not
 * being destroyed (409), and the person on that list (409). It writes what
 * the older roles route writes for a change of the lists: the list without
 * them, and the run's `updatedAt`. One person off one list: somebody on both
 * lists stays on the other. Nobody is emailed.
 */

export const ROLE_FIELD: Record<RoleList, "trackLeadUids" | "runFacilitatorUids"> = {
  trackLeads: "trackLeadUids",
  runFacilitators: "runFacilitatorUids",
};

export const ONLY_AN_ADMIN_REMOVES_ROLES = "Only an admin can take somebody off a run’s roles here.";

export type RoleRefusal = { ok: false; status: 403 | 404 | 409; error: string };

/** A request's list, or null when it names neither. */
export function readRoleList(raw: unknown): RoleList | null {
  return raw === "trackLeads" || raw === "runFacilitators" ? raw : null;
}

export async function removeFromRunRole(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  list: RoleList,
  uid: string,
): Promise<{ ok: true; runId: string } | RoleRefusal> {
  if (!canRunTerm(actor)) return { ok: false, status: 403, error: ONLY_AN_ADMIN_REMOVES_ROLES };
  const notHere: RoleRefusal = { ok: false, status: 404, error: "That programme is not on this form." };
  if (!isId(roundId) || !isId(programmeId)) return notHere;
  const form = await loadForm(db, roundId);
  const programme = form ? own(form.programmes, programmeId) : undefined;
  if (!form || !programme) return notHere;
  const runId = programme.runId;
  if (runId === null || !isId(runId)) return { ok: false, status: 409, error: NO_RUN_NAMED };

  const field = ROLE_FIELD[list];
  const ref = db.collection("courseRuns").doc(runId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, status: 404, error: "The run this programme names is no longer on the site." } as const;
    const data = snap.data() ?? {};
    if (data.destroying === true) {
      return { ok: false, status: 409, error: "This run is being destroyed and its roles can't be changed." } as const;
    }
    const current = Array.isArray(data[field]) ? (data[field] as unknown[]) : [];
    if (!current.includes(uid)) return { ok: false, status: 409, error: NOT_ON_THE_LIST } as const;
    tx.update(ref, {
      [field]: current.filter((each) => each !== uid),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, runId } as const;
  });
}
