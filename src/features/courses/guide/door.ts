import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstName } from "@/app/(app)/dashboard/homeWords";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { displayNameOf } from "@/lib/courses/registerAccess";
import type { RunAccess } from "../runAccess";

/** What `displayNameOf` answers for an account with no name of its own. */
const PLACEHOLDER_NAME = "NAISI member";

/**
 * WHO MAY OPEN A PROGRAMME'S START HERE AND GLOSSARY: exactly the people the
 * run's week 1 opens to. That is everybody who can open the run today (the
 * run gate's `canLearn`: somebody taking part, a facilitator of one of its
 * groups, an admin), and somebody holding a place before groups go out once
 * week 1 is Ready (Q35 B).
 *
 * THE SECOND HALF IS WEEK 1'S DOOR, AND THIS ASKS IT RATHER THAN REPEATING IT.
 * The door is `weekOneDoorFor` in `src/lib/courses/weekOne/door.ts`, which
 * `getRunAccess` asks for anybody with no other way in and carries as
 * `access.beforeGroups` (the place they hold, when week 1 is open to them).
 * It is not in this tree yet: until it lands, `beforeGroups` is absent and
 * this answers for `canLearn` alone; once it lands, this same line lets in
 * exactly the people the door opens week 1 to, and the cast goes. Never a
 * second copy of the door's rule here.
 *
 * "run" opens the page from the run (its way back is the programme page);
 * "week-one" opens it through week 1's door (the way back is week 1, the only
 * page of the run open to them); null sends them away.
 */
export function guideDoor(access: RunAccess): "run" | "week-one" | null {
  if (access.canLearn) return "run";
  const beforeGroups = (access as RunAccess & { beforeGroups?: unknown }).beforeGroups;
  return beforeGroups !== undefined && beforeGroups !== null ? "week-one" : null;
}

/**
 * Who reads this person's reflections, as Start here's box names them (Q30,
 * Q37): a facilitator of one of the run's live groups takes part as
 * themselves, read by the programme's lead and admins only (Zach, Mon 26
 * Oct); somebody placed in a group and told it, by that group's
 * facilitators, first names from their accounts (never an address); anybody
 * else, the line's general form. Reads only the facilitators' own user
 * documents.
 */
export async function reflectionReadersFor(
  db: Firestore,
  access: RunAccess,
): Promise<{ facilitatorFirstNames: string[]; asFacilitator: boolean }> {
  const facilitates = access.groups.some((group) =>
    isNamedWithStanding(access.user, "courseGroups.facilitatorUids", group.facilitatorUids),
  );
  if (facilitates) return { facilitatorFirstNames: [], asFacilitator: true };
  const own = access.isEnrolled ? access.enrolment : null;
  const group = own?.groupId ? (access.groups.find((candidate) => candidate.id === own.groupId) ?? null) : null;
  if (!group || group.facilitatorUids.length === 0) return { facilitatorFirstNames: [], asFacilitator: false };
  const snaps = await Promise.all(group.facilitatorUids.map((uid) => db.collection("users").doc(uid).get()));
  const names = snaps
    .filter((snap) => snap.exists)
    .map((snap) => displayNameOf(snap.data() ?? {}))
    // An account with no name of its own reads as the placeholder: leave it out rather than call somebody "NAISI".
    .filter((name) => name !== PLACEHOLDER_NAME)
    .map((name) => firstName(name))
    .filter((name) => name !== "");
  return { facilitatorFirstNames: names, asFacilitator: false };
}
