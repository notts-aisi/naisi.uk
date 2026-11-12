import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { holdsStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { canAuthorAdmissionRound } from "@/lib/firestore/users";
import { loadRequestsPage } from "./load";

/**
 * HOW MANY REQUESTS WAIT FOR THIS PERSON, for Home's line that leads to the
 * Requests page: those waiting with nobody on them and those being handled,
 * as the Requests page counts them (`loadRequestsPage`: an admin every
 * programme's, a lead the runs they lead).
 *
 * Asked only of somebody the Requests page's tree admits, by the same
 * predicate as `requireAdmissionsPage` (an admin or round author, or
 * somebody appointed on a form with the standing it needs), so Home never
 * offers a link that sends its reader back to Home, and nobody else costs a
 * read. A read that fails is 0: Home says nothing rather than something
 * wrong.
 */
export async function requestsWaitingFor(db: Firestore, user: SessionUser, now: Date): Promise<number> {
  const reaches =
    canAuthorAdmissionRound(user) || (user.admissionsReviewer === true && holdsStanding(user, "admissionRounds.reviewerUids"));
  if (!reaches) return 0;
  try {
    const loaded = await loadRequestsPage(db, user, now);
    return loaded.status === "ok" ? loaded.view.counts.waiting + loaded.view.counts.handling : 0;
  } catch (err) {
    console.warn("[dashboard] could not count the requests waiting", err);
    return 0;
  }
}

/**
 * How many requests about one run wait for somebody to decide them: one read
 * by `runId`. Requests to be excused are decided by admins only, so they are
 * counted only when the caller says the reader is an admin (`excused: true`);
 * left out, the count is the requests a programme's lead decides.
 */
export async function requestsWaitingOnRun(db: Firestore, runId: string, opts: { excused?: boolean } = {}): Promise<number> {
  try {
    const snap = await db.collection("courseRequests").where("runId", "==", runId).limit(500).get();
    return snap.docs.filter((doc) => {
      const data = doc.data() ?? {};
      return data.status === "waiting" && (opts.excused === true || data.kind !== "excused");
    }).length;
  } catch (err) {
    console.warn("[programme] could not count the requests waiting", err);
    return 0;
  }
}
