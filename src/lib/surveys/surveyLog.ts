import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { surveyExportsOf } from "@/lib/firestore/dataExports";
import { surveyOpeningsOf } from "@/lib/firestore/recordOpenings";
import type { SurveyDoc } from "@/lib/firestore/surveys";
import { dayAndClockWords, logWhatWords } from "./words";

/**
 * A SURVEY'S LOG ("See the log" on its Answers tab), for admins: each time an admin
 * opened names on the survey (one person's answers, the people behind a bar,
 * whose a comment is, the Answers tab) and each download of its answers with
 * names, newest first. Who did it, when, what and how many people it named,
 * never whose answers they were: reading the log is no opening, so it names
 * nobody.
 *
 * Reads the openings log (`surveyOpeningsOf`) and the log of downloads
 * (`surveyExportsOf`), and nothing of anybody's answers. The page that calls
 * it sits in the (admin-only) tree.
 */

export type LogLine = {
  /** "Sat 21 Nov, 11:02am". */
  when: string;
  /** "Zach Levin opened the Answers tab: 15 people". */
  line: string;
};

export async function surveyLogOf(db: Firestore, survey: Pick<SurveyDoc, "id">): Promise<LogLine[]> {
  const [openings, downloads] = await Promise.all([surveyOpeningsOf(db, survey.id), surveyExportsOf(db, survey.id)]);
  const entries = [
    ...openings.map((row) => ({ id: row.id, at: row.at, name: row.actorName, what: logWhatWords(row.kind, row.people) })),
    ...downloads.map((row) => ({ id: row.id, at: row.at, name: row.actorName, what: logWhatWords("download", row.rowCount) })),
  ];
  return entries
    .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0) || a.id.localeCompare(b.id))
    .map((entry) => ({ when: entry.at ? dayAndClockWords(entry.at) : "", line: `${entry.name || "An admin"} ${entry.what}` }));
}
