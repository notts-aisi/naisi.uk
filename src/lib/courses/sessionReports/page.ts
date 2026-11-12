import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { londonDayLabel } from "@/lib/courses/londonLabels";
import type { SessionUser } from "@/lib/firebase/session";
import type { ReportPart, SessionReportAnswers } from "@/lib/firestore/courseSessionReports";
import { sessionReportWords } from "@/lib/surveys/questionSetsStore";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import {
  gateCoveringReportWriter,
  gateReportWriter,
  leadFirstName,
  loadReportSession,
  readOwnReport,
  sessionsOf,
  type ReportPerson,
} from "./context";
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
 * WHO CAME is the session's register as its marks stand when the page is
 * drawn. The register leads here from the session's start, before it is
 * finished, so while it is not, the form says the people listed are those
 * marked so far; Send is checked against the marks again when it is pressed.
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
  /** False while the session's register is not finished, so `came` is the marks so far, and the form says so. */
  registerFinished: boolean;
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

/**
 * Every view says whose report it is when the writer took the session's
 * register in a facilitator's place: `covering` is "Written by you, covering
 * for Josh. ...", and null for a facilitator of the group.
 */
type Covering = { covering: string | null };

export type ReportPageView =
  | ({ kind: "nothing-yet"; groupName: string } & Covering)
  | ({ kind: "no-report" | "not-yet"; groupName: string; title: string; line: string } & Covering)
  | ({ kind: "closed"; groupName: string; title: string; line: string; sent: RunReportView | null } & Covering)
  | ({ kind: "open"; groupName: string; title: string; intro: string; form: ReportFormProps } & Covering);

/** "Written by you, covering for Josh. The programme's lead and admins read it, as with any report." */
export function coveringReportLine(firstNames: readonly string[]): string {
  const forWhom = firstNames.length > 0 ? `, covering for ${firstNames.length === 1 ? firstNames[0] : `${firstNames.slice(0, -1).join(", ")} and ${firstNames[firstNames.length - 1]}`}` : "";
  return `Written by you${forWhom}. The programme’s lead and admins read it, as with any report.`;
}

/** The first names of the facilitators whose place the writer took, read once. */
async function coveringFirstNames(db: Firestore, uids: readonly string[]): Promise<string[]> {
  const wanted = uids.filter((uid) => uid && !uid.includes("/"));
  if (wanted.length === 0) return [];
  const snaps = await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid)));
  return snaps.map((snap) => (snap.exists ? firstNameOfUser(snap.data() ?? {}) : "")).filter(Boolean);
}

export async function loadReportPage(
  db: Firestore,
  user: SessionUser,
  runId: string,
  groupId: string,
  sessionParam: string | null,
  now: Date,
): Promise<ReportPageView | null> {
  const first = await gateReportWriter(db, user, groupId);
  // Whoever took the session the address names in a facilitator's place
  // writes that session's report, and no other (`gateCoveringReportWriter`).
  const gated = first.ok ? first : sessionParam ? await gateCoveringReportWriter(db, user, groupId, sessionParam, now) : null;
  if (!gated || !gated.ok || gated.run.id !== runId) return null;
  const { run, group } = gated;
  const groupName = group.name.trim() || "Your group";
  const coveringWriter = !first.ok;
  const covering = coveringWriter ? coveringReportLine(await coveringFirstNames(db, gated.coveringFor)) : null;

  const sessions = sessionsOf(run, group);
  const named = sessionParam ? sessions.find((session) => session.sessionKey === sessionParam) : undefined;
  if (coveringWriter && !named) return null;
  const chosen = named ?? latestStartedSession(sessions, now);
  if (!chosen) return { kind: "nothing-yet", groupName, covering };
  const title = reportTitle(chosen.weekNumber, chosen.occurrence);

  const session = await loadReportSession(db, gated, chosen.sessionKey, now, sessions);
  if (!session) {
    // Called off through "Change a session", or with no day and time to open at.
    const line = chosen.cancelled ? noReportLine(chosen.weekNumber, chosen.occurrence) : undatedLine(chosen.weekNumber, chosen.occurrence);
    return { kind: "no-report", groupName, title, line, covering };
  }
  const { window } = session;
  if (session.state === "not-yet") {
    return { kind: "not-yet", groupName, title, line: opensLine(chosen.weekNumber, chosen.occurrence, window.opensAt), covering };
  }
  if (!session.held) return { kind: "no-report", groupName, title, line: noReportLine(chosen.weekNumber, chosen.occurrence), covering };

  const own = await readOwnReport(db, run, group, chosen.sessionKey, user.uid);
  if (session.state === "closed") {
    return {
      kind: "closed",
      groupName,
      title,
      line: closedLine(chosen.weekNumber, chosen.occurrence, window.closesAt, window.nextWeekNumber),
      sent: own ? await ownReportView(db, run, group, own, user) : null,
      covering,
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
    covering,
    form: {
      groupId: group.id,
      sessionKey: chosen.sessionKey,
      leadFirstName: lead,
      came: session.came,
      registerFinished: session.finished,
      inGroup: session.inGroup,
      parts: session.parts,
      answers: own?.answers ?? null,
      sent: own?.updatedAt ? sentLine(own.updatedAt) : "",
      changeUntil: changeUntilLine(window.closesAt, window.nextWeekNumber),
      questions,
    },
  };
}
