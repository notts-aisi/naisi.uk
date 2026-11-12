import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { GROUP_FIELD_LIMITS, normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, validateSubmissionUrl } from "@/lib/firestore/courses";
import { MEETING_LINK_REFUSAL } from "@/lib/courses/joiningOnline/words";
import { groupHistoryRow } from "@/lib/courses/groupChange/facts";
import { historyDetail, linkBeforeWords, linkHeadline } from "@/lib/courses/groupChange/words";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";

/**
 * A SESSION'S MEETING LINK, AS ITS FACILITATORS GIVE IT from the box at the
 * top of their group page and register: for one week, or kept for every week.
 *
 *  - ONE WEEK: the week's own link, `sessionOverrides.<week>.meetingUrl`,
 *    which `sessionForWeek` lays over the group's standing slot for that
 *    week and no other.
 *  - EVERY WEEK: the group's standing link, `session.meetingUrl`, and the
 *    week's own link taken away so that week reads the standing one too.
 *    A week that already has a link of its own keeps it.
 *
 * Everybody in the group sees the link on their programme page from then on
 * (`seesSessionLink`), and nobody is emailed: no email and no calendar feed
 * ever carries a meeting link.
 *
 * WHO: a live facilitator of the group, the lead of the programme that names
 * its run or one of the run's track leads (decided by the route, which reads
 * the forms, and passed in as the run they staff), or an admin, asked again
 * inside the transaction that writes, so a group archived or a facilitator
 * taken off it in between is refused.
 *
 * HISTORY: every link saved writes one row of the group's history saying
 * which weeks it is for and whether a link was there before. NEVER THE LINK. The link is checked as a web address
 * (`validateSubmissionUrl`, with the group's own cap) before anything is
 * read. Only a session the group holds, still to end, not cancelled, and
 * the week's first session (no week can set a second one apart).
 */

export type MeetingLinkRequest = { sessionKey: string; url: string; everyWeek: boolean };

/** A session key as `sessionKey` makes it: "w03", or "w03-2" for a week's second session. */
const SESSION_KEY = /^w\d{2,3}(?:-[2-9])?$/;

/** The body, or why it is not one. Reads nothing. */
export function parseMeetingLink(raw: unknown): { ok: true; value: MeetingLinkRequest } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Expected a JSON object body." };
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (key !== "sessionKey" && key !== "url" && key !== "everyWeek") return { ok: false, error: `Unknown field "${key}".` };
  }
  if (typeof body.sessionKey !== "string" || !SESSION_KEY.test(body.sessionKey)) {
    return { ok: false, error: "sessionKey must name one of the group's sessions, like w03." };
  }
  if (typeof body.url !== "string") return { ok: false, error: "Please enter a link." };
  const url = body.url.trim();
  const wrong = validateSubmissionUrl(url, GROUP_FIELD_LIMITS.meetingUrl);
  if (wrong) return { ok: false, error: wrong };
  if (body.everyWeek !== undefined && typeof body.everyWeek !== "boolean") {
    return { ok: false, error: "everyWeek must be true or false." };
  }
  return { ok: true, value: { sessionKey: body.sessionKey, url, everyWeek: body.everyWeek === true } };
}

export type MeetingLinkOutcome =
  | { ok: true; sessionKey: string; everyWeek: boolean }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

/**
 * The one write, in a transaction that reads the group and its run again.
 * `groupId` is the address's; the caller has already let the caller through
 * the same gate on its own read, and this asks it again.
 */
export async function saveSessionLink(
  db: Firestore,
  actor: SessionUser,
  groupId: string,
  request: MeetingLinkRequest,
  now: Date,
  /** The run the presser staffs (its lead or a track lead), as the route decided; null for none. */
  staffsRunId: string | null = null,
): Promise<MeetingLinkOutcome> {
  const groupRef = db.collection("courseGroups").doc(groupId);
  return db.runTransaction(async (tx) => {
    const groupSnap = await tx.get(groupRef);
    const group = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
    const isAdmin = actor.role === "admin";
    const facilitates = Boolean(
      group && !group.archived && isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids),
    );
    const staffs = Boolean(group && !group.archived && staffsRunId && group.runId === staffsRunId);
    if (!isAdmin && !facilitates && !staffs) return { ok: false, status: 403, error: "Forbidden" };
    if (!group) return { ok: false, status: 404, error: "Group not found" };
    if (!group.runId || group.runId.includes("/")) return { ok: false, status: 404, error: "Group not found" };
    const runSnap = await tx.get(db.collection("courseRuns").doc(group.runId));
    if (!runSnap.exists || runSnap.data()?.destroying === true) return { ok: false, status: 404, error: "Group not found" };
    const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});

    const session = resolveSessions(run, group).find((each) => each.sessionKey === request.sessionKey);
    if (!session || session.occurrence !== 1) return { ok: false, status: 400, error: MEETING_LINK_REFUSAL.noSession };
    if (session.cancelled) return { ok: false, status: 409, error: MEETING_LINK_REFUSAL.cancelled };
    const { endsAt } = sessionInstants(session);
    if (endsAt !== null && endsAt.getTime() <= now.getTime()) return { ok: false, status: 409, error: MEETING_LINK_REFUSAL.over };

    // A dotted path is safe here: a week id is "w" and digits (`weekDocId`),
    // never a dot, unlike a uid, which is why maps keyed by uid take a
    // `FieldPath`.
    const weekLink = `sessionOverrides.${session.weekId}.meetingUrl`;
    // The weeks as STORED: the group as read folds each week's mode in too,
    // which is kept in a map of its own and is no week set apart.
    const stored = groupSnap.data()?.sessionOverrides;
    const storedWeeks: Record<string, unknown> = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
    // Whether the week had a link before, its own or the group's: the history says so, never what it was.
    const hadLink = Boolean(session.session.meetingUrl);
    if (request.everyWeek) {
      // The week's own link, when it has one, would hide the standing link
      // that week; a week without one is not given an empty entry.
      const week = storedWeeks[session.weekId];
      const ownLink = Boolean(week) && typeof week === "object" && Object.hasOwn(week as object, "meetingUrl");
      tx.update(groupRef, {
        "session.meetingUrl": request.url,
        ...(ownLink ? { [weekLink]: FieldValue.delete() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      // The group keeps at most so many weeks apart from its usual slot, and
      // a week past the cap would be dropped when the group is read.
      const weeks = Object.keys(storedWeeks);
      if (!weeks.includes(session.weekId) && weeks.length >= GROUP_FIELD_LIMITS.maxSessionOverrides) {
        return { ok: false, status: 409, error: MEETING_LINK_REFUSAL.full };
      }
      tx.update(groupRef, { [weekLink]: request.url, updatedAt: FieldValue.serverTimestamp() });
    }
    tx.set(
      db.collection(COURSE_AUDIT_COLLECTION).doc(),
      groupHistoryRow({
        kind: "group-link-set",
        run,
        group,
        actor,
        weekId: session.weekId,
        detail: historyDetail({
          headline: linkHeadline(session.weekNumber, request.everyWeek),
          before: linkBeforeWords(hadLink),
        }),
        before: { link: hadLink },
        after: { link: true, everyWeek: request.everyWeek },
      }),
    );
    return { ok: true, sessionKey: session.sessionKey, everyWeek: request.everyWeek };
  });
}
