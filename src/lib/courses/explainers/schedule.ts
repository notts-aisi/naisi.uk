import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import ExplainerEmail from "@/emails/ExplainerEmail";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import type { DoorRefusal } from "@/lib/courses/coursework/door";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { resolveSessions } from "@/lib/courses/sessions";
import { openWeekReview, type WeekReviewDoor } from "@/lib/courses/weekReview/door";
import { themeForExplainer } from "@/lib/courses/weekReview/store";
import { REVIEW_WORDS } from "@/lib/courses/weekReview/words";
import { wantsEmailForProfile } from "@/lib/email/preferences";
import { courseNudgeSessionWhere } from "@/lib/email/courseNudgeEmail";
import { sendEmail } from "@/lib/email/send";
import { resolveTaskUsers } from "@/lib/email/taskMembership";
import type { SessionUser } from "@/lib/firebase/session";
import {
  COURSE_EXPLAINERS_COLLECTION,
  EXPLAINER_MINUTES,
  EXPLAINER_TOPIC_MAX,
  explainerOnSession,
  explainerTaskId,
  normalizeExplainer,
  type CourseExplainerDoc,
  type ExplainerMinutes,
} from "@/lib/firestore/courseExplainers";
import { sessionModeForWeek } from "@/lib/firestore/courseGroups";
import { isTaskEmailEnabled } from "@/lib/firestore/taskEmailConfig";
import { accountNamesOf, nameForViewer, type NameViewer } from "@/lib/names/staffName";
import { mirrorTaskEmailToPush } from "@/lib/push/taskNotifications";
import { sessionChoices, type ScheduleAsk, type SessionChoice } from "./model";
import { readRunExplainers } from "./readers";
import { buildExplainerTask } from "./task";
import { EXPLAINER_PUSH, EXPLAINER_WORDS, explainerEmailWords } from "./words";

/**
 * "SCHEDULE AN EXPLAINER", AND CANCEL, from a week's review (clashes 14 to
 * 19 of the week review's plan): an admin's alone, behind the review's own
 * door (`openWeekReview`, which turns away everybody but an admin, the
 * programme's lead included).
 *
 * THE FORM (`loadExplainerForm`): each live group's next session that meets,
 * the theme's groups ticked when it was opened from a theme, the people who
 * may explain (anybody on the committee, and admins), named as the admin
 * sees them. Writes nothing.
 *
 * THE PRESS (`scheduleExplainer`): who explains must be on the committee or
 * an admin, read here and never believed; every session asked for must be
 * its group's next session now, and none may already open with an
 * explainer, decided again inside the write's transaction so two presses
 * never put two on one session. Then one record, one task per session for
 * whoever explains, and ONE email to them beside the tasks (the tasks row: a
 * grid send, behind the site's task-email switch), with the push beside it.
 * Nobody in the groups is emailed: their tickets show it at once, and "Week
 * N is open" says so when it has not gone yet (`nextWeekEmail.ts`).
 *
 * CANCEL (`cancelExplainer`): stamps the record cancelled and closes its
 * tasks (archived), so every ticket drops it. Nobody is emailed, so an email
 * that has gone is never followed by another.
 */

/** One person who may explain: on the committee, or an admin. */
export type ExplainerPerson = { uid: string; name: string; role: "committee" | "admin" };

/** What the page draws. Plain data: the page hands it to the browser's form. */
export type ExplainerForm = {
  weekId: string;
  weekNumber: number;
  /** False until the week's first session has started: the page says so and offers nothing. */
  reviewable: boolean;
  /** The topic to start from: a theme's title, or "". */
  topic: string;
  /** "9 answers and 4 facilitator reports, from Group C and Group D", for a form opened from a theme. */
  from: string | null;
  choices: Array<Omit<SessionChoice, "startsAt"> & { ticked: boolean }>;
  /** Groups with no session to come that has a day and time. */
  undated: string[];
  people: ExplainerPerson[];
  minutes: readonly ExplainerMinutes[];
};

/** The roles somebody who explains may hold. */
const MAY_EXPLAIN = new Set(["committee", "admin"]);

/** A theme's title cut to a topic's length at a word, for the box. */
function topicFrom(title: string): string {
  const line = title.replace(/\s+/g, " ").trim();
  if (line.length <= EXPLAINER_TOPIC_MAX) return line;
  const cut = line.slice(0, EXPLAINER_TOPIC_MAX);
  const space = cut.lastIndexOf(" ");
  return (space > 40 ? cut.slice(0, space) : cut).trim();
}

/** Each live group with its own sessions, as the review's door read them. */
function groupSessions(opened: WeekReviewDoor) {
  return opened.groups.map((each) => ({
    id: each.group.id,
    name: each.group.name,
    group: each.group,
    sessions: resolveSessions(opened.run, each.group),
  }));
}

/**
 * Everybody who may explain, named as `viewer` sees them, committee first:
 * one `in` on one field, so no declared index.
 */
async function peopleWhoMayExplain(db: Firestore, viewer: NameViewer): Promise<ExplainerPerson[]> {
  const snap = await db.collection("users").where("role", "in", ["committee", "admin"]).get();
  const people: ExplainerPerson[] = [];
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const role = data.role === "admin" ? "admin" : data.role === "committee" ? "committee" : null;
    if (!role) continue;
    people.push({ uid: doc.id, name: nameForViewer(viewer, accountNamesOf(data), "NAISI member"), role });
  }
  return people.sort((a, b) => (a.role === b.role ? 0 : a.role === "committee" ? -1 : 1) || a.name.localeCompare(b.name, "en-GB") || a.uid.localeCompare(b.uid));
}

export async function loadExplainerForm(
  db: Firestore,
  user: SessionUser,
  input: { roundId: string; programmeId: string; weekId: string; theme: number | null },
  now: Date,
): Promise<{ ok: true; form: ExplainerForm } | DoorRefusal> {
  const opened = await openWeekReview(db, user, input.roundId, input.programmeId, input.weekId, now);
  if (!opened.ok) return opened;
  const base = { weekId: opened.weekId, weekNumber: opened.weekNumber, minutes: EXPLAINER_MINUTES };
  if (!opened.reviewable) {
    return { ok: true, form: { ...base, reviewable: false, topic: "", from: null, choices: [], undated: [], people: [] } };
  }
  const [explainers, people, theme] = await Promise.all([
    readRunExplainers(db, opened.run.id),
    peopleWhoMayExplain(db, user),
    input.theme === null ? Promise.resolve(null) : themeForExplainer(db, opened, input.theme),
  ]);
  const { choices, undated } = sessionChoices(groupSessions(opened), explainers, now);
  const ticked = new Set(theme?.groupIds ?? []);
  return {
    ok: true,
    form: {
      ...base,
      reviewable: true,
      topic: theme ? topicFrom(theme.title) : "",
      from: theme ? theme.from : null,
      choices: choices.map(({ startsAt: _startsAt, ...choice }) => ({ ...choice, ticked: ticked.has(choice.groupId) && choice.taken === null })),
      undated,
      people,
    },
  };
}

/**
 * Schedule one: the record, a task per session and the email to whoever
 * explains. `ask` was read by `readScheduleAsk`; everything else is decided
 * here.
 */
export async function scheduleExplainer(
  db: Firestore,
  user: SessionUser,
  input: { roundId: string; programmeId: string; weekId: string; ask: ScheduleAsk },
  now: Date,
): Promise<{ ok: true; explainerId: string; tasks: number; emailed: number } | DoorRefusal> {
  const opened = await openWeekReview(db, user, input.roundId, input.programmeId, input.weekId, now);
  if (!opened.ok) return opened;
  if (!opened.reviewable) return { ok: false, status: 409, error: REVIEW_WORDS.notYet(opened.weekNumber) };
  const { ask } = input;

  // Who explains: somebody on the committee, or an admin, read from their account.
  const explainerSnap = await db.collection("users").doc(ask.explainerUid).get();
  const explainerData = (explainerSnap.data() ?? {}) as Record<string, unknown>;
  if (!explainerSnap.exists || !MAY_EXPLAIN.has(String(explainerData.role))) {
    return { ok: false, status: 409, error: EXPLAINER_WORDS.notCommittee };
  }

  // Every session asked for is its group's next session now.
  const groups = groupSessions(opened);
  const { choices } = sessionChoices(groups, [], now);
  const chosen: Array<{ choice: SessionChoice; group: (typeof groups)[number] }> = [];
  for (const asked of ask.sessions) {
    const choice = choices.find((each) => each.groupId === asked.groupId);
    const group = groups.find((each) => each.id === asked.groupId);
    if (!choice || !group || choice.sessionKey !== asked.sessionKey) return { ok: false, status: 409, error: EXPLAINER_WORDS.moved };
    chosen.push({ choice, group });
  }

  // The admin who scheduled it, as whoever explains sees them.
  const schedulerSnap = await db.collection("users").doc(user.uid).get();
  const asker = schedulerSnap.exists
    ? nameForViewer({ role: String(explainerData.role) }, accountNamesOf(schedulerSnap.data() ?? {}), "An admin")
    : "An admin";
  const programme = opened.door.programmeName;
  const ref = db.collection(COURSE_EXPLAINERS_COLLECTION).doc();
  const sessions = chosen.map(({ choice, group }) => {
    const session = group.sessions.find((each) => each.sessionKey === choice.sessionKey);
    return {
      choice,
      taskId: explainerTaskId(ref.id, choice.groupId, choice.sessionKey),
      where: session ? courseNudgeSessionWhere(session.session, sessionModeForWeek(group.group, session.weekId)) : "",
    };
  });
  const record = {
    runId: opened.run.id,
    roundId: opened.roundId,
    programmeId: opened.programmeId,
    fromWeekId: opened.weekId,
    fromWeekNumber: opened.weekNumber,
    topic: ask.topic,
    explainerUid: ask.explainerUid,
    minutes: ask.minutes,
    sessions: sessions.map(({ choice }) => ({
      groupId: choice.groupId,
      sessionKey: choice.sessionKey,
      weekNumber: choice.weekNumber,
      startsAt: choice.startsAt,
    })),
    scheduledByUid: user.uid,
    scheduledAt: now,
    cancelledAt: null,
    cancelledByUid: null,
  };

  // One explainer to a session, decided again where it is written.
  const taken = await db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection(COURSE_EXPLAINERS_COLLECTION).where("runId", "==", opened.run.id));
    const standing = snap.docs
      .map((doc) => normalizeExplainer(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
      .filter((explainer): explainer is CourseExplainerDoc => explainer !== null);
    const clash = sessions.find(({ choice }) => explainerOnSession(standing, choice.groupId, choice.sessionKey));
    if (clash) return clash.choice.groupName;
    tx.create(ref, record);
    for (const { choice, taskId, where } of sessions) {
      tx.create(
        db.collection("tasks").doc(taskId),
        buildExplainerTask({
          runId: opened.run.id,
          groupId: choice.groupId,
          groupName: choice.groupName,
          sessionKey: choice.sessionKey,
          weekNumber: choice.weekNumber,
          startsAt: choice.startsAt,
          where,
          topic: ask.topic,
          minutes: ask.minutes,
          programme,
          askedBy: asker,
          creatorUid: user.uid,
          explainerUid: ask.explainerUid,
          now,
        }),
      );
    }
    return null;
  });
  if (taken !== null) return { ok: false, status: 409, error: EXPLAINER_WORDS.taken(taken) };

  // ONE email to whoever explains, on their tasks row, with the push beside it.
  let emailed = 0;
  if (await isTaskEmailEnabled(db)) {
    const accounts = await resolveTaskUsers(db, [ask.explainerUid]);
    const recipient = accounts.get(ask.explainerUid);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://naisi.uk";
    const words = explainerEmailWords({
      firstName: firstNameOfUser(explainerData),
      askedBy: asker,
      minutes: ask.minutes,
      topic: ask.topic,
      programme,
      sessions: sessions.map(({ choice, where }) => ({ groupName: choice.groupName, weekNumber: choice.weekNumber, at: choice.startsAt, where })),
      link: `${appUrl}/tasks`,
    });
    try {
      if (recipient && wantsEmailForProfile(recipient.profile, "tasks")) {
        await sendEmail({
          to: recipient.email,
          subject: words.subject,
          fromName: "NAISI Tasks",
          kind: "task",
          actorUid: user.uid,
          referenceId: ref.id,
          react: ExplainerEmail({ words }),
        });
        emailed = 1;
      }
      await mirrorTaskEmailToPush(ask.explainerUid, { title: words.subject, body: EXPLAINER_PUSH, taskId: sessions[0].taskId, url: "/tasks" });
    } catch (error) {
      console.error("[explainer] the email to whoever explains failed", ref.id, error);
    }
  }
  return { ok: true, explainerId: ref.id, tasks: sessions.length, emailed };
}

/**
 * Cancel one: the record stamped, its tasks closed (archived, read before
 * each is written, so a task somebody deleted is passed over). Nobody is
 * emailed. Cancelling one already cancelled closes nothing more.
 */
export async function cancelExplainer(
  db: Firestore,
  user: SessionUser,
  input: { roundId: string; programmeId: string; explainerId: string },
  now: Date,
): Promise<{ ok: true; archived: number } | DoorRefusal> {
  const outcome = await loadProgrammeRun(db, user, input.roundId, input.programmeId);
  if (outcome.status === "none") return { ok: false, status: 404, error: EXPLAINER_WORDS.notHere };
  if (outcome.status === "not-yours" || outcome.view.viewer !== "admin") {
    return { ok: false, status: 403, error: EXPLAINER_WORDS.onlyAdmins };
  }
  const run = outcome.view.run;
  if (!run) return { ok: false, status: 404, error: EXPLAINER_WORDS.notFound };
  const ref = db.collection(COURSE_EXPLAINERS_COLLECTION).doc(input.explainerId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const explainer = snap.exists ? normalizeExplainer(snap.id, (snap.data() ?? {}) as Record<string, unknown>) : null;
    if (!explainer || explainer.runId !== run.id) return { ok: false as const, status: 404, error: EXPLAINER_WORDS.notFound };
    if (explainer.cancelledAt !== null) return { ok: true as const, archived: 0 };
    const taskRefs = explainer.sessions.map((session) => db.collection("tasks").doc(explainerTaskId(explainer.id, session.groupId, session.sessionKey)));
    const tasks = taskRefs.length > 0 ? await tx.getAll(...taskRefs) : [];
    tx.update(ref, { cancelledAt: now, cancelledByUid: user.uid });
    let archived = 0;
    for (const task of tasks) {
      if (!task.exists || (task.data() ?? {}).archived === true) continue;
      tx.update(task.ref, { archived: true, updatedAt: now });
      archived += 1;
    }
    return { ok: true as const, archived };
  });
}
