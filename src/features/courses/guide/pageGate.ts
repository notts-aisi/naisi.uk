import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { redirect } from "next/navigation";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { guideEyebrow } from "@/lib/courses/guide/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { weekHref } from "../links";
import { getRunAccess, getSessionUser, type RunAccess } from "../runAccess";
import { guideDoor } from "./door";

/**
 * The gate both of a programme's guide pages ask first, and what they draw
 * from the run's records: the programme's name and label, its lead's first
 * name, and the way back.
 *
 * OPEN TO EXACTLY THE PEOPLE THE RUN'S WEEK 1 OPENS TO (`guideDoor`).
 * Everybody else is sent where the week page sends them: a reviewer or a
 * track lead to the run's admissions queue, anybody else to My programmes,
 * somebody signed out to sign in. Redirects, never a 403: a guessed run id
 * learns nothing about which runs exist. Neither page is public (Q40 B).
 */
export type GuidePage = {
  access: RunAccess;
  db: Firestore | null;
  /** "AGI Strategy", from the programme that names the run, else the run's course. */
  programmeName: string;
  /** "Fellowship: AGI Strategy". */
  eyebrow: string;
  leadFirstName: string | null;
  /** The programme page, or week 1 for somebody who holds a place before groups go out. */
  backHref: string;
};

export async function openGuidePage(runId: string, page: "start-here" | "glossary"): Promise<GuidePage> {
  const access = await getRunAccess(runId);
  if (!access) {
    // Null is "no session" OR "no such run", fused on purpose; the session
    // read is memoised, so telling them apart costs nothing.
    const user = await getSessionUser();
    redirect(user ? "/learn" : `/login?next=${encodeURIComponent(`/learn/${runId}/${page}`)}`);
  }
  const door = guideDoor(access);
  if (!door) {
    redirect(access.isReviewer || access.isTrackLead ? `/learn/${encodeURIComponent(runId)}/admissions` : "/learn");
  }
  const db = getAdminDb() ?? null;
  const programme = db ? await runProgrammeOf(db, access.run.id).catch(() => null) : null;
  const programmeName = programme?.shortName || access.run.courseTitle || "Your programme";
  return {
    access,
    db,
    programmeName,
    eyebrow: guideEyebrow(programme?.kind ?? null, programmeName),
    leadFirstName: programme?.leadFirstName ?? null,
    backHref: door === "week-one" ? weekHref(runId, 1) : `/learn/${encodeURIComponent(runId)}`,
  };
}
