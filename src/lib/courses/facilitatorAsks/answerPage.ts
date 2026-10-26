import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { own } from "@/lib/applications/keys";
import { normaliseApplication } from "@/lib/applications/normalise";
import { applicationRef, loadForm } from "@/lib/applications/repo";
import { standingOf } from "@/lib/applications/status/standing";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { groupAskFacts } from "./groups";
import { listRunAsks, readAsk, readTraining } from "./read";
import { askStateOf, takesPartIn } from "./rules";
import {
  NO_LONGER_OPEN,
  NO_ROOM_YET,
  ONLINE,
  answerByWords,
  clockIn,
  dayIn,
  fromWords,
  lateWords,
  pageEyebrow,
  pageHeading,
  saidNoText,
  seatGoneWords,
  sizeWords,
  takingPartNowWords,
  trainingLine,
  trainingText,
  trainingWords,
} from "./words";

/**
 * THE PAGE AN ASK'S "SAY YES OR NO" OPENS (st-fac-ask-phone), as one model
 * for the person asked and nobody else. Anybody else is shown that the page
 * is somebody else's, and nothing of the ask: not the group, not the
 * programme, not who asked.
 *
 * WHAT IT SHOWS is the board's: the group's weekly time, its first session
 * and how many weeks, its room and size, the run's training (left out while
 * none is set), the two buttons, when they will see their group's names, and
 * the day and time to answer by. All from records as they stand now, so a
 * room changed since the email is the room shown. The lead is named as the
 * email named them. NOTHING FROM ANY APPLICATION: their own answers are not
 * shown back, and nobody else's are reached.
 *
 * It reads no review, no decision and no other person's application.
 */

export type AnswerState =
  /** Not answered, and an answer may still be given. */
  | "open"
  | "yes"
  | "no"
  /** The day and time to answer by has gone. */
  | "late"
  /** Somebody else said yes to the same place first. */
  | "taken"
  /** They now take part in the programme (Q21). */
  | "taking-part"
  /** The group or its run has gone. */
  | "closed";

export type AnswerPageModel =
  | { kind: "not-yours" }
  | {
      kind: "ask";
      askId: string;
      eyebrow: string;
      heading: string;
      rows: { when: string | null; from: string | null; where: string; group: string | null };
      training: { line: string; text: string } | null;
      state: AnswerState;
      /** What is said in place of the buttons once they cannot be pressed, or after an answer. */
      closedText: string | null;
      /**
       * The day groups go out, for the board's "If you say yes, …" sentence
       * (`ifYesWords`). Null while no record holds it, which is today for
       * every run: the sentence is then said without a day.
       */
      goOutDay: string | null;
      /** "Please answer by Wed 28 Oct, 12pm." */
      answerBy: string;
      groupName: string;
      /** The group's page, for somebody who said yes. */
      groupHref: string;
      /** Whether the group's people have been told their group (Publish has been pressed). */
      groupsOut: boolean;
    };

export async function loadAnswerPage(
  db: Firestore,
  actor: SessionUser,
  askId: string,
  now: Date,
): Promise<AnswerPageModel> {
  const ask = await readAsk(db, askId);
  if (!ask || ask.uid !== actor.uid) return { kind: "not-yours" };

  const [form, runSnap, groupSnap, runAsks, training, applicationSnap] = await Promise.all([
    loadForm(db, ask.roundId),
    db.collection("courseRuns").doc(ask.runId).get(),
    db.collection("courseGroups").doc(ask.groupId).get(),
    listRunAsks(db, ask.runId),
    readTraining(db, ask.runId),
    applicationRef(db, ask.roundId, actor.uid).get(),
  ]);
  const programme = form ? own(form.programmes, ask.programmeId) : undefined;
  const shortName = programme?.shortName ?? "";
  const group =
    groupSnap.exists && groupSnap.data()?.runId === ask.runId
      ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {})
      : null;
  const runData = runSnap.exists ? (runSnap.data() ?? {}) : null;
  const run = runData && runData.destroying !== true ? normalizeCourseRun(runSnap.id, runData) : null;
  const groupName = group?.name.trim() || "the group";
  const facts = run && group ? groupAskFacts(run, group, now) : null;

  const replyDay = dayIn(ask.replyBy.dateKey) ?? "";
  const replyTime = clockIn(ask.replyBy.time) ?? "";
  const asked = askStateOf(ask, runAsks, now);
  const application = applicationSnap.exists ? normaliseApplication(applicationSnap.id, applicationSnap.data()) : null;
  const takingPart = application !== null && takesPartIn(standingOf(application), ask.programmeId);

  let state: AnswerState;
  if (asked.kind === "yes") state = "yes";
  else if (asked.kind === "no") state = "no";
  else if (!run || !group || group.archived) state = "closed";
  else if (asked.kind === "taken") state = "taken";
  else if (asked.kind === "late") state = "late";
  else if (takingPart) state = "taking-part";
  else state = "open";

  const closedText: Record<AnswerState, string | null> = {
    open: null,
    yes: null,
    no: saidNoText(shortName || "this programme"),
    late: lateWords(replyDay, replyTime),
    taken: seatGoneWords(groupName),
    "taking-part": takingPartNowWords(shortName || "this programme"),
    closed: NO_LONGER_OPEN,
  };

  const where = facts?.where;
  const groupsOut = runData !== null && runData.allocationPublishedAt != null;
  const trainingSaid = trainingWords(training);
  return {
    kind: "ask",
    askId: ask.id,
    eyebrow: pageEyebrow(programme?.kind ?? "fellowship", shortName),
    heading: pageHeading(groupName),
    rows: {
      when: facts?.when ?? null,
      from: facts?.firstSession ? fromWords(facts.firstSession, facts.weeks) : null,
      where: where?.kind === "room" ? where.room : where?.kind === "online" ? ONLINE : NO_ROOM_YET,
      group: sizeWords(facts?.capacity ?? null),
    },
    training: trainingSaid ? { line: trainingLine(trainingSaid), text: trainingText(ask.leadName) } : null,
    state,
    closedText: closedText[state],
    // No record holds the day groups go out yet (C19).
    goOutDay: null,
    answerBy: answerByWords(replyDay, replyTime),
    groupName,
    groupHref: `/learn/${encodeURIComponent(ask.runId)}/group/${encodeURIComponent(ask.groupId)}`,
    groupsOut,
  };
}
