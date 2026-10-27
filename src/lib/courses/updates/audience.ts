import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { standingUserOf } from "@/lib/courses/programmeLead";
import {
  dropSuppressed,
  ownAddressFor,
  resolveCohortAudience,
  type CohortAudienceLane,
} from "@/lib/email/courseFacilitatorEmails";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { normalizeCourseEnrolment, placementIsTold } from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseUpdateTo } from "@/lib/firestore/courseUpdates";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { UNNAMED_GROUP } from "./words";

/**
 * WHO AN UPDATE IS TO, AND WHO ITS EMAIL REACHES. One module, so the number
 * the composer shows and the number the send reaches are worked out by the
 * same function: the composer's counts call `updateEmailAudience` exactly as
 * the press does, and the press is refused when the two no longer agree.
 *
 * TWO NUMBERS PER AUDIENCE, because they can differ:
 *  - `people`, who the update is to: the people who will read it on the
 *    programme page. For everyone and a group, the people placed on the run
 *    whose place Publish has told them (`placementIsTold`) and is live; for
 *    the facilitators, the facilitators of the run's live groups who still
 *    meet the bar they were appointed behind.
 *  - `emails`, who the email reaches: for everyone and a group, the run's
 *    cohort list through `resolveCohortAudience`, the lane every staff email
 *    to a run uses (somebody who unsubscribed from it is not on it); for the
 *    facilitators, each one's own address. Never a suppressed address.
 *
 * NEVER TO ITS WRITER. Whoever writes an update is left out of its email,
 * whichever audience they are in (an incubator's lead runs its one group, so
 * the facilitators are her), and the composer does not offer the
 * facilitators at all to the one facilitator there is. Every count is made
 * for the writer who will press, so it is still the number the press sends.
 *
 * THE CLASS OF THE EMAIL IS NOTICE (docs/notifications.md): the lead of a
 * programme, an admin or a group's facilitator addressing the people they run
 * it for, about the programme they are on. So it reaches them whatever their
 * course email switch says (`ignoreCategoryOptOut`), exactly as "Email the
 * group" and the run composer's notice lane do, and it carries the notice
 * marker that says so. Suppression and the cohort list still apply.
 */

/** The cohort lane's words for this send: its log tag and its over-the-cap advice. */
const LANE: CohortAudienceLane = {
  logTag: "courses update email",
  overCapAdvice: "post it without emailing",
};

export type UpdateRecipient = { uid: string; address: string };

export type UpdateEmailAudience = {
  /** Deliverable: deduped, on the list or a facilitator, unsuppressed. */
  recipients: UpdateRecipient[];
  /** True when the audience is over what one send can take: the press is refused whole. */
  refused: boolean;
};

/**
 * The facilitators of the run's live groups, held to their bar, with the
 * addresses their email goes to (never the writer's), and who they are.
 */
async function facilitatorsOf(
  db: Firestore,
  groups: readonly CourseGroupDoc[],
  writerUid: string | null,
): Promise<{ people: number; uids: string[]; recipients: UpdateRecipient[] }> {
  const live = groups.filter((group) => !group.archived);
  const uids = [...new Set(live.flatMap((group) => group.facilitatorUids))];
  if (uids.length === 0) return { people: 0, uids: [], recipients: [] };
  const accounts = await db.getAll(...uids.map((uid) => db.collection("users").doc(uid)));
  const gmailOnly = process.env.EMAIL_GMAIL_ONLY_MODE === "true";
  let people = 0;
  const standingUids: string[] = [];
  const seen = new Set<string>();
  const pending: UpdateRecipient[] = [];
  for (const account of accounts) {
    if (!account.exists) continue;
    const data = (account.data() ?? {}) as Record<string, unknown>;
    // The bar a facilitator is appointed behind, asked again of the stored
    // account: a name left on a group after it lost its standing is nobody
    // to write to.
    const standing = standingUserOf(account.id, data);
    if (!live.some((group) => isNamedWithStanding(standing, "courseGroups.facilitatorUids", group.facilitatorUids))) {
      continue;
    }
    people += 1;
    standingUids.push(account.id);
    // The writer reads it on the page; their own email is not one of its.
    if (account.id === writerUid) continue;
    const address = ownAddressFor(data, null, gmailOnly);
    if (!address || seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    pending.push({ uid: account.id, address });
  }
  const { deliverable } = await dropSuppressed(db, pending);
  return { people, uids: standingUids, recipients: deliverable };
}

/**
 * WHO THIS UPDATE'S EMAIL REACHES, for the writer who will press: never the
 * writer. The press calls it, and so does every count the composer shows.
 */
export async function updateEmailAudience(
  db: Firestore,
  run: Pick<CourseRunDoc, "id">,
  groups: readonly CourseGroupDoc[],
  to: CourseUpdateTo,
  groupId: string | null,
  writerUid: string | null,
): Promise<UpdateEmailAudience> {
  if (to === "facilitators") {
    const { recipients } = await facilitatorsOf(db, groups, writerUid);
    return { recipients, refused: false };
  }
  const audience = await resolveCohortAudience(db, run.id, LANE, {
    groupId: to === "group" ? groupId : null,
    ignoreCategoryOptOut: true,
  });
  if (audience.refusal) return { recipients: [], refused: true };
  return {
    recipients: audience.members
      .filter((member) => member.uid !== writerUid)
      .map((member) => ({ uid: member.uid, address: member.address })),
    refused: false,
  };
}

/** One choice in the composer's To, with its two numbers. */
export type UpdateAudienceCount = {
  to: CourseUpdateTo;
  groupId: string | null;
  /** The group's name, for a group. */
  groupName: string | null;
  people: number;
  emails: number;
  /** Over what one send can take: the email is not offered. */
  refused: boolean;
  /**
   * People placed in a live group of the audience whom Publish has not told
   * their group yet: in neither number above, and they read the update once
   * Publish tells them. Always 0 for the facilitators.
   */
  notYetTold: number;
};

/**
 * Every audience an update on this run can be to, in the composer's order:
 * everyone, each live group, the facilitators. `groupIds`, when given, keeps
 * only those groups and drops everyone and the facilitators: a group's
 * facilitator writes to their own group only. Counted for `writerUid`, who
 * will press: their own address is never one an email goes to, and the
 * facilitators are not offered when the writer is the only one.
 */
export async function updateAudienceCounts(
  db: Firestore,
  run: Pick<CourseRunDoc, "id">,
  groups: readonly CourseGroupDoc[],
  only: { groupIds: readonly string[] } | null,
  writerUid: string | null,
): Promise<UpdateAudienceCount[]> {
  const live = groups.filter((group) => !group.archived && group.runId === run.id);

  // Who reads it: the run's places that Publish has told, live, by group.
  // And who will once Publish tells them: placed in a live group, not told.
  const liveIds = new Set(live.map((group) => group.id));
  const snap = await db.collection("courseEnrolments").where("runId", "==", run.id).get();
  let everyone = 0;
  let everyoneNotYetTold = 0;
  const inGroup = new Map<string, number>();
  const notYetToldIn = new Map<string, number>();
  for (const doc of snap.docs) {
    const enrolment = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
    if (enrolment.runId !== run.id || enrolment.role !== "learner") continue;
    if (enrolment.status !== "active") continue;
    if (!placementIsTold(enrolment)) {
      if (enrolment.groupId && liveIds.has(enrolment.groupId)) {
        everyoneNotYetTold += 1;
        notYetToldIn.set(enrolment.groupId, (notYetToldIn.get(enrolment.groupId) ?? 0) + 1);
      }
      continue;
    }
    everyone += 1;
    if (enrolment.groupId) inGroup.set(enrolment.groupId, (inGroup.get(enrolment.groupId) ?? 0) + 1);
  }

  const counts: UpdateAudienceCount[] = [];
  const add = async (to: "everyone" | "group", group: CourseGroupDoc | null, people: number, notYetTold: number) => {
    const email = await updateEmailAudience(db, run, groups, to, group?.id ?? null, writerUid);
    counts.push({
      to,
      groupId: group?.id ?? null,
      groupName: group ? group.name.trim() || UNNAMED_GROUP : null,
      people,
      emails: email.refused ? 0 : email.recipients.length,
      refused: email.refused,
      notYetTold,
    });
  };

  if (!only) await add("everyone", null, everyone, everyoneNotYetTold);
  for (const group of live) {
    if (only && !only.groupIds.includes(group.id)) continue;
    await add("group", group, inGroup.get(group.id) ?? 0, notYetToldIn.get(group.id) ?? 0);
  }
  // The same derivation the press makes for the facilitators, once for both
  // numbers. Not offered to the one facilitator there is: it would be a note
  // to themselves.
  const facilitators = only ? null : await facilitatorsOf(db, groups, writerUid);
  if (facilitators && !(facilitators.uids.length === 1 && facilitators.uids[0] === writerUid)) {
    counts.push({
      to: "facilitators",
      groupId: null,
      groupName: null,
      people: facilitators.people,
      emails: facilitators.recipients.length,
      refused: false,
      notYetTold: 0,
    });
  }
  return counts;
}
