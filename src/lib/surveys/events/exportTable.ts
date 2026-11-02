import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { EventSurveyDoc } from "@/lib/firestore/surveys";
import type { NameViewer } from "@/lib/names/staffName";
import { NAME_TAKEN_OFF, surveyExportTable } from "../exportTable";
import { readEventAudience, respondentKey } from "./audience";
import { eventAnswersOf } from "./store";

/**
 * THE SPREADSHEET OF A SURVEY AFTER AN EVENT'S ANSWERS, WITH NAMES, for
 * admins: one row per person who answered, their name (an account's, or the
 * one a guest gave the event), when and how they sent it (their own link, or
 * signed in with the QR code), and one column per question, laid out by the
 * programme surveys' own table. An account's name is the one the admin
 * downloading is shown (`viewer`, the names rule). No column about a group's first session,
 * which an event has none of, and never an email address. A download the
 * site logs before it is handed over, by the same route as every survey's.
 */

/** "Signed in, with the QR code": how somebody answered without their link. */
export const QR_HOW = "Signed in, with the QR code";

export async function eventExportTable(db: Firestore, survey: EventSurveyDoc, viewer: NameViewer): Promise<{ header: string[]; rows: string[][] }> {
  const [answers, read] = await Promise.all([eventAnswersOf(db, survey), readEventAudience(db, survey.audience.eventId, viewer)]);
  const names = new Map((read?.people ?? []).map((member) => [member.key, member.name]));
  const table = surveyExportTable(
    survey.items,
    answers.map((answer) => ({
      name: answer.respondent ? (names.get(respondentKey(answer.respondent)) ?? null) : null,
      sentAt: answer.sentAt,
      via: answer.via,
      afterFirstSession: false,
      answers: answer.answers,
    })),
  );
  // The programme surveys' fourth column, whether a group had met, means nothing after an event.
  const drop = table.header.indexOf("After their first session");
  const without = <T,>(row: T[]): T[] => (drop === -1 ? row : [...row.slice(0, drop), ...row.slice(drop + 1)]);
  return {
    header: without(table.header),
    rows: table.rows.map((row) => without(row.map((cell, at) => (at === 2 && cell === "Signed in" ? QR_HOW : cell)))),
  };
}

export { NAME_TAKEN_OFF };
