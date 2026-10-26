import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { loadForm } from "@/lib/applications/repo";
import { loadApplication } from "@/lib/applications/staffRepo";
import { comingReplyOf } from "@/lib/applications/status/coming";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { resolveSessions, sessionRange } from "@/lib/courses/sessions";
import { londonDateKey } from "@/lib/courses/weekPlan";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";

/**
 * WHO'S COMING, FOR A GROUP'S FACILITATORS BEFORE ITS FIRST SESSION (board
 * st-fac-before-phone, Q14).
 *
 * The privacy policy's own words are the contract: before the first session,
 * facilitators "also see whether each person in their group has said they
 * are coming", and apart from that one reply nothing from applications.
 * So this is the one place a facilitator is handed anything an application
 * holds, and what it hands back is exactly that: each person's first name,
 * and whether they have said they are coming. Never "I can't make it", never
 * a reason, never an answer, an address or a degree. Its answer's type has
 * no field that could carry one.
 *
 * WHO IS IN THE LIST is decided by the caller, from the facilitator's own
 * view of the group (`loadFacilitatorGroup` with the caller's role): the
 * people taking part whom Publish has told their group, and nobody who has
 * left it. Somebody who gave their place back before Publish is never placed
 * in the group's list, so is not in it either. The caller also decides WHEN:
 * only on a day before the group's first session (`isBeforeFirstSessionDay`),
 * and only for the group's facilitators.
 *
 * WHAT COUNTS AS SAYING SO is `comingReplyOf`, the reading the programme's
 * People tab asks for its lead, for the place the person holds on the
 * programme that names the run. Somebody whose place is not on that
 * programme, or who has no application on its form, has not said so. Nothing
 * here writes.
 */

/** One person in the list: a first name, and a yes or a no. Nothing else. */
export type WhosComingPerson = { firstName: string; coming: boolean };

/** The group's first session's day, as the run's overview dates it: the earliest session that is not cancelled. */
export function firstSessionDayOf(run: CourseRunDoc, group: CourseGroupDoc, now: Date): string {
  return sessionRange(resolveSessions(run, group), now).firstDateKey;
}

/** Is today, in London, a day before the group's first session's day? */
export function isBeforeFirstSessionDay(firstDateKey: string, now: Date): boolean {
  return firstDateKey !== "" && londonDateKey(now) < firstDateKey;
}

/**
 * Whether each of these people has said they are coming, in their order.
 * `people` is the group's people as the facilitator is shown them, each with
 * the first name the facilitator's pages call them by.
 */
export async function readWhosComing(
  db: Firestore,
  runId: string,
  people: readonly { uid: string; firstName: string }[],
): Promise<WhosComingPerson[]> {
  if (people.length === 0) return [];
  // The form whose programme names this run, and that programme: the place
  // each person holds is theirs on it, and their reply is to that place.
  const naming = await readNamingProgramme(db, runId);
  const form = naming ? await loadForm(db, naming.roundId) : null;
  const replies =
    naming && form
      ? await Promise.all(
          people.map(async (person) => {
            const application = await loadApplication(db, form, person.uid);
            return application ? comingReplyOf(application, naming.programmeId).said : false;
          }),
        )
      : people.map(() => false);
  return people.map((person, at) => ({ firstName: person.firstName, coming: replies[at] === true }));
}
