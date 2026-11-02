import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { accountNamesOf, nameForViewer, type NameViewer } from "@/lib/names/staffName";
import {
  COURSE_EXPLAINERS_COLLECTION,
  activeExplainers,
  explainerOnSession,
  normalizeExplainer,
  type CourseExplainerDoc,
} from "@/lib/firestore/courseExplainers";
import { lengthAndWhoWords, sessionChoiceWords, topicAsTitle } from "./words";

/**
 * WHAT EVERY PAGE BUT THE ADMIN'S OWN READS OF A RUN'S EXPLAINERS: the
 * facilitators' ticket (the group page and Home's summary), each member's
 * ticket (the run's overview), "Week N is open", the Weeks tab's week page
 * for the lead and admins, and the Surveys tab's Overview.
 *
 * Each caller is behind its own gate already; this reads what that page
 * shows and nothing more. An explainer holds the admin's topic, who explains,
 * how long and its sessions, and nothing of the review it was scheduled from,
 * so no reader here reaches what Claude returned (privacy v15: seen by admins
 * only). A cancelled explainer is read by nobody here.
 *
 * Names are the viewer's (`nameForViewer`): the committee and admins see a
 * full name, everybody else the name a person goes by.
 */

/**
 * Every explainer on a run, cancelled ones included: one equality on one
 * field, so no declared index, and a run has a handful.
 */
export async function readRunExplainers(db: Firestore, runId: string): Promise<CourseExplainerDoc[]> {
  if (!runId) return [];
  const snap = await db.collection(COURSE_EXPLAINERS_COLLECTION).where("runId", "==", runId).get();
  return snap.docs
    .map((doc) => normalizeExplainer(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
    .filter((explainer): explainer is CourseExplainerDoc => explainer !== null && explainer.runId === runId)
    .sort((a, b) => (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
}

/** The names these accounts go by for this viewer, by account; an account that is gone has none. */
export async function explainerNamesFor(
  db: Firestore,
  viewer: NameViewer,
  uids: ReadonlyArray<string | null>,
): Promise<Map<string, string>> {
  const wanted = [...new Set(uids.filter((uid): uid is string => typeof uid === "string" && uid !== ""))];
  const out = new Map<string, string>();
  if (wanted.length === 0) return out;
  const snaps = await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid)));
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const names = accountNamesOf(snap.data() ?? {});
    if (!names.full && !names.goBy) continue;
    out.set(snap.id, nameForViewer(viewer, names, ""));
  }
  return out;
}

/** What a facilitator's ticket says of the explainer opening their group's next session. */
export type FacilitatorExplainer = {
  sessionKey: string;
  minutes: number;
  topic: string;
  /** Who explains, by the viewer's name for them; null once their account is gone. */
  by: string | null;
  /** Who scheduled it, the same way. */
  scheduledBy: string | null;
  /** The week whose review it was scheduled from. */
  fromWeekNumber: number;
};

/**
 * The explainer still on that opens this group's session, as its facilitators
 * (or an admin) read it on their ticket, or null. Never the review it came
 * from.
 */
export async function facilitatorExplainerOn(
  db: Firestore,
  viewer: NameViewer,
  runId: string,
  groupId: string,
  sessionKey: string | null | undefined,
): Promise<FacilitatorExplainer | null> {
  if (!sessionKey) return null;
  const on = explainerOnSession(await readRunExplainers(db, runId), groupId, sessionKey);
  if (!on) return null;
  const names = await explainerNamesFor(db, viewer, [on.explainerUid, on.scheduledByUid]);
  return {
    sessionKey,
    minutes: on.minutes,
    topic: on.topic,
    by: on.explainerUid ? (names.get(on.explainerUid) ?? null) : null,
    scheduledBy: on.scheduledByUid ? (names.get(on.scheduledByUid) ?? null) : null,
    fromWeekNumber: on.fromWeekNumber,
  };
}

/** One explainer as the week's page and the review's list draw it. */
export type ExplainerRow = {
  id: string;
  /** The topic, as a title. */
  topic: string;
  /** "10 minutes, by Maya Khan". */
  lengthAndWho: string;
  /** Who explains, by the viewer's name for them, or null. */
  by: string | null;
  /** "Group C, week 4: Wed 25 Nov, 3pm", one a session, in the order they meet. */
  sessions: string[];
};

/**
 * The explainers still on that were scheduled from one week's review, as the
 * week's page (the lead and admins) and the review's own list (admins) draw
 * them: the topic, how long, who, and each session. A group the run no longer
 * has is named "a group".
 */
export async function explainersFromWeek(
  db: Firestore,
  viewer: NameViewer,
  runId: string,
  weekNumber: number,
  groups: ReadonlyArray<{ id: string; name: string }>,
): Promise<ExplainerRow[]> {
  const from = activeExplainers(await readRunExplainers(db, runId)).filter((explainer) => explainer.fromWeekNumber === weekNumber);
  if (from.length === 0) return [];
  const names = await explainerNamesFor(db, viewer, from.map((explainer) => explainer.explainerUid));
  const groupName = new Map(groups.map((group) => [group.id, group.name.trim() || "Untitled group"]));
  return from.map((explainer) => {
    const by = explainer.explainerUid ? (names.get(explainer.explainerUid) ?? null) : null;
    return {
      id: explainer.id,
      topic: topicAsTitle(explainer.topic),
      lengthAndWho: lengthAndWhoWords(explainer.minutes, by),
      by,
      sessions: [...explainer.sessions]
        .sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0))
        .map((session) => sessionChoiceWords(groupName.get(session.groupId) ?? "A group", session.weekNumber, session.startsAt)),
    };
  });
}

/**
 * For the Surveys tab's Overview: how many explainers still on were scheduled
 * from one week's review, and for how many groups. Counts only.
 */
export async function explainersBookedFrom(
  db: Firestore,
  runId: string,
  weekNumber: number,
): Promise<{ explainers: number; groups: number }> {
  const from = activeExplainers(await readRunExplainers(db, runId)).filter((explainer) => explainer.fromWeekNumber === weekNumber);
  const groups = new Set(from.flatMap((explainer) => explainer.sessions.map((session) => session.groupId)));
  return { explainers: from.length, groups: groups.size };
}
