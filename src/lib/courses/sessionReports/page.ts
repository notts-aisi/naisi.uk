import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { londonDayLabel } from "@/lib/courses/londonLabels";
import type { SessionUser } from "@/lib/firebase/session";
import type { ReportPart, SessionReportAnswers } from "@/lib/firestore/courseSessionReports";
import { sessionReportWords } from "@/lib/surveys/questionSetsStore";
import { gateReportWriter, leadFirstName, loadReportSession, readOwnReport, sessionsOf, type ReportPerson } from "./context";
import { latestStartedSession } from "./model";
import { ownReportView, type RunReportView } from "./readers";
import {
  REPORT_QUESTION_WORDS,
  changeUntilLine,
  closedLine,
  noReportLine,
  opensLine,
  reportIntro,
  reportTitle,
  sentLine,
  undatedLine,
  type ReportQuestionWords,
} from "./words";

/**
 * THE FACILITATOR'S REPORT PAGE, worked out on the server: which session it
 * is about, whether its report is open, and what the form starts from.
 *
 * Null for anybody who may not write a report on the group (the report
 * route's own gate, `gateReportWriter`, on a group of THIS run): the page
 * sends them to the run's home, never saying whether the group exists.
 *
 * THE SESSION is the one the address names (`?session=w03`, as the
 * register's link writes it), or, when it names none the group holds, the
 * latest of the group's sessions that has started. Before the first, the
 * page says when reports open.
 *
 * THE QUESTIONS are asked in the words of the session report's question set
 * (Run NAISI › Surveys › Question sets) as it stands when the form is drawn,
 * else the code's. The answers are kept by question, not by its words, so a
 * report already sent keeps them whatever the words say later.
 */

/** The form's starting point, handed to the browser: nothing beyond what it draws and sends. */
export type ReportFormProps = {
  groupId: string;
  sessionKey: string;
  leadFirstName: string;
  /** Who the register has down as here: who engaged well, who seemed not to have done the readings. */
  came: ReportPerson[];
  /** Everybody on the register: who might need a hand. */
  inGroup: ReportPerson[];
  parts: ReportPart[];
  /** The writer's own answers as last sent, or null before the first send. */
  answers: SessionReportAnswers | null;
  /** "Sent Wed 18 Nov at 8:14pm.", or "" before the first send. */
  sent: string;
  /** "You can change it until week 4 starts, Tue 24 Nov at 6pm." */
  changeUntil: string;
  /** The words the questions are asked in. */
  questions: ReportQuestionWords;
};

export type ReportPageView =
  | { kind: "nothing-yet"; groupName: string }
  | { kind: "no-report" | "not-yet"; groupName: string; title: string; line: string }
  | { kind: "closed"; groupName: string; title: string; line: string; sent: RunReportView | null }
  | { kind: "open"; groupName: string; title: string; intro: string; form: ReportFormProps };

export async function loadReportPage(
  db: Firestore,
  user: SessionUser,
  runId: string,
  groupId: string,
  sessionParam: string | null,
  now: Date,
): Promise<ReportPageView | null> {
  const gated = await gateReportWriter(db, user, groupId);
  if (!gated.ok || gated.run.id !== runId) return null;
  const { run, group } = gated;
  const groupName = group.name.trim() || "Your group";

  const sessions = sessionsOf(run, group);
  const named = sessionParam ? sessions.find((session) => session.sessionKey === sessionParam) : undefined;
  const chosen = named ?? latestStartedSession(sessions, now);
  if (!chosen) return { kind: "nothing-yet", groupName };
  const title = reportTitle(chosen.weekNumber, chosen.occurrence);

  const session = await loadReportSession(db, gated, chosen.sessionKey, now, sessions);
  if (!session) {
    // Called off through "Change a session", or with no day and time to open at.
    const line = chosen.cancelled ? noReportLine(chosen.weekNumber, chosen.occurrence) : undatedLine(chosen.weekNumber, chosen.occurrence);
    return { kind: "no-report", groupName, title, line };
  }
  const { window } = session;
  if (session.state === "not-yet") {
    return { kind: "not-yet", groupName, title, line: opensLine(chosen.weekNumber, chosen.occurrence, window.opensAt) };
  }
  if (!session.held) return { kind: "no-report", groupName, title, line: noReportLine(chosen.weekNumber, chosen.occurrence) };

  const own = await readOwnReport(db, run, group, chosen.sessionKey, user.uid);
  if (session.state === "closed") {
    return {
      kind: "closed",
      groupName,
      title,
      line: closedLine(chosen.weekNumber, chosen.occurrence, window.closesAt, window.nextWeekNumber),
      sent: own ? await ownReportView(db, run, group, own, user) : null,
    };
  }

  const lead = await leadFirstName(db, run.id);
  // A set that can't be read leaves the code's words: the form is filled in on a phone, straight after the register.
  const questions = await sessionReportWords(db).catch((err) => {
    console.error("[session report] could not read its question set", err);
    return REPORT_QUESTION_WORDS;
  });
  return {
    kind: "open",
    groupName,
    title,
    intro: reportIntro(groupName, londonDayLabel(window.opensAt), lead),
    form: {
      groupId: group.id,
      sessionKey: chosen.sessionKey,
      leadFirstName: lead,
      came: session.came,
      inGroup: session.inGroup,
      parts: session.parts,
      answers: own?.answers ?? null,
      sent: own?.updatedAt ? sentLine(own.updatedAt) : "",
      changeUntil: changeUntilLine(window.closesAt, window.nextWeekNumber),
      questions,
    },
  };
}
