import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import {
  isEligibleAdmissionsReviewer,
  normalizeUser,
  type UserDoc,
} from "@/lib/firestore/users";
import type { ApplicationForm } from "../normalise";
import { everyoneNamedOn } from "../roles";
import type { CandidateView } from "./views";

/**
 * The names behind the uids a form carries, and who could be added to one.
 *
 * A form stores who leads and who reviews each programme as uids. The screens
 * show names, and the browser cannot look them up for itself: the `users`
 * collection is closed to most of the people who can open a programme's
 * pages. So the names are read here, on the server, and only the name leaves.
 */

/** What the committee's screens call somebody: their preferred name. */
function shortNameOf(user: UserDoc): string {
  return (
    user.profile?.preferredName?.trim() ||
    user.displayName?.trim() ||
    "Somebody with no name set"
  );
}

/** The fuller name, for telling two people with one first name apart. */
function fullNameOf(user: UserDoc): string {
  return user.displayName?.trim() || shortNameOf(user);
}

/** A name for each of these uids. An account that has gone has no entry. */
export async function namesFor(
  db: Firestore,
  uids: readonly string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const wanted = [...new Set(uids.filter(Boolean))];
  if (wanted.length === 0) return names;
  const docs = await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid)));
  for (const doc of docs) {
    if (!doc.exists) continue;
    names.set(doc.id, shortNameOf(normalizeUser(doc.id, doc.data() ?? {})));
  }
  return names;
}

/** A name for every lead and reviewer the form names. */
export async function namesOnForm(db: Firestore, form: ApplicationForm): Promise<Map<string, string>> {
  return namesFor(db, everyoneNamedOn(form));
}

/**
 * Everybody who could be named a lead or a reviewer: admins and SU-recognised
 * committee, by name.
 *
 * One filter on one field, so it needs no declared index; the SU half of the
 * bar is applied here in memory. This list only fills a picker.
 * `setProgrammeRoles` checks each person again, against their live document,
 * when they are actually named.
 */
export async function eligibleReviewers(db: Firestore): Promise<CandidateView[]> {
  const snap = await db.collection("users").where("role", "in", ["admin", "committee"]).get();
  const people: CandidateView[] = [];
  for (const doc of snap.docs) {
    const user = normalizeUser(doc.id, doc.data() ?? {});
    if (!isEligibleAdmissionsReviewer(user)) continue;
    people.push({ uid: user.uid, name: shortNameOf(user), fullName: fullNameOf(user) });
  }
  return people.sort((a, b) => a.fullName.localeCompare(b.fullName) || a.uid.localeCompare(b.uid));
}
