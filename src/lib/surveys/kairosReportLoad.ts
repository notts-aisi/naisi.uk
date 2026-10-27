import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isInTerm } from "@/lib/applications/decisions";
import { loadForm } from "@/lib/applications/repo";
import { listSentApplications } from "@/lib/applications/staffRepo";
import { headcountOf } from "@/lib/courses/finishing/headcount";
import { readFinishing } from "@/lib/courses/finishing/record";
import { readRunRecords } from "@/lib/courses/programmeAttendance";
import { kairosChoicesOf } from "@/lib/kairos/choice";
import { sharesWithKairos } from "@/lib/kairos/model";
import type { KairosProgramme } from "@/lib/kairos/programmes";
import { isProgrammeAudience } from "@/lib/firestore/surveys";
import { readRunRatings } from "@/lib/ratings/store";
import { buildKairosReport, type KairosReport, type ReportSurvey } from "./kairosReport";
import { answersOf, listSurveys, sentCountOf } from "./repo";
import { SURVEY_STAGES } from "./templates";

/**
 * WHAT THE KAIROS REPORT IS COUNTED FROM, for one programme, read once and
 * handed to `buildKairosReport`, which counts:
 *
 *  - the programme's surveys (one per stage), their answers, and how many
 *    each was sent to, from its own record of each send;
 *  - the applications sent that ranked it, still in the term (`isInTerm`, the
 *    term's own rule for counting: one withdrawn, or a place given back, is
 *    not counted);
 *  - the run's register rows, as an admin sees them: who started (on the
 *    programme at its end, and who left after a register marked them), and
 *    who finished, from the finished record;
 *  - the ratings given at the end, and who has not said no to sharing.
 *
 * Admins only ask here; the page decides that first. Every read is one
 * equality on one field, or an addressed read, so none needs a declared
 * index.
 */
export async function loadKairosReport(db: Firestore, programme: KairosProgramme, now: Date): Promise<KairosReport | null> {
  const records = await readRunRecords(db, programme.runId);
  if (!records) return null;

  const form = await loadForm(db, programme.roundId);
  const finishing = await readFinishing(db, programme.runId);
  // Who started, who was there at the end and who finished: the one count
  // This term in numbers shows too.
  const { end, started, atEnd, finished } = headcountOf(records, finishing, now);
  const [applications, ratings, choices, all] = await Promise.all([
    form ? listSentApplications(db, form) : Promise.resolve([]),
    readRunRatings(db, programme.runId),
    kairosChoicesOf(db, atEnd.map((row) => row.uid)),
    listSurveys(db),
  ]);

  // One survey per stage per programme; the oldest stands should there be two.
  const surveys: ReportSurvey[] = [];
  for (const stage of SURVEY_STAGES) {
    const survey = all
      .filter((each) => each.kind === stage && isProgrammeAudience(each.audience, programme.roundId, programme.programmeId))
      .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))[0];
    if (!survey) continue;
    const answers = await answersOf(db, survey);
    surveys.push({
      stage,
      name: survey.name,
      items: survey.items,
      answers: answers.map((answer) => ({ uid: answer.respondent?.uid ?? null, answers: answer.answers })),
      sent: sentCountOf(survey),
    });
  }

  const ratedUids = new Set(atEnd.map((row) => row.uid));
  const rated = [...ratedUids]
    .map((uid) => ({ uid, ratings: ratings.filter((rating) => rating.ratedUid === uid).map((rating) => ({ ...rating.answers })) }))
    .filter((person) => person.ratings.length > 0);

  return buildKairosReport({
    programmeName: programme.name,
    kind: programme.kind,
    applications: applications.filter(
      (application) => isInTerm(application) && application.sent?.rankedProgrammeIds.includes(programme.programmeId),
    ).length,
    started: started.length,
    atEnd: atEnd.length,
    finished,
    finishRule: finishing.rule?.atLeast ?? null,
    lastDay: end.lastDay,
    surveys,
    rated,
    sharing: new Set(atEnd.map((row) => row.uid).filter((uid) => sharesWithKairos(choices.get(uid)))),
  });
}
